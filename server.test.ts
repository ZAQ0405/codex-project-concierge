import { afterEach, beforeEach, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Peer } from "./shared/types.ts";
import { shouldStartCodexBridge } from "./shared/bridge-config.ts";

const root = fileURLToPath(new URL(".", import.meta.url));
setDefaultTimeout(20_000);

test("explicit Codex plugin configuration starts bridge without injected thread id", () => {
  expect(shouldStartCodexBridge(false, false, "1")).toBe(true);
  expect(shouldStartCodexBridge(false, false, undefined)).toBe(false);
  expect(shouldStartCodexBridge(true, false, "0")).toBe(false);
});

let serverProc: ReturnType<typeof Bun.spawn> | null = null;
let brokerProc: ReturnType<typeof Bun.spawn> | null = null;
let tempDir = "";
let brokerUrl = "";
let port = 0;
let stdoutReader: any = null;
let rpcBuffer = "";

function writeRpc(message: unknown) {
  if (!serverProc) throw new Error("server not started");
  const stdin = serverProc.stdin;
  if (!stdin || typeof stdin === "number") throw new Error("server stdin is not writable");
  stdin.write(`${JSON.stringify(message)}\n`);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${brokerUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function waitForCodexPeer(): Promise<Peer> {
  for (let i = 0; i < 80; i++) {
    try {
      const peers = await post<Peer[]>("/list-peers", {
        scope: "machine",
        cwd: "/",
        git_root: null,
      });
      const peer = peers.find((entry) => entry.thread_id === "thread-from-env");
      if (peer) return peer;
    } catch {
      // broker or peer not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Codex peer did not register");
}

async function waitForPeerCount(count: number): Promise<Peer[]> {
  for (let i = 0; i < 300; i++) {
    try {
      const peers = await post<Peer[]>("/list-peers", {
        scope: "machine",
        cwd: "/",
        git_root: null,
      });
      if (peers.length === count) return peers;
    } catch {
      // broker not ready
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`expected ${count} peer(s)`);
}

async function waitForBroker(): Promise<void> {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`${brokerUrl}/health`);
      if (res.ok) return;
    } catch {
      // broker not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("broker did not start");
}

async function waitForRpc(id: number): Promise<any> {
  if (!serverProc) throw new Error("server not started");
  const stdout = serverProc.stdout;
  if (!stdout || typeof stdout === "number") throw new Error("server stdout is not readable");
  stdoutReader ??= stdout.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    let index = rpcBuffer.indexOf("\n");
    while (index !== -1) {
      const line = rpcBuffer.slice(0, index).trim();
      rpcBuffer = rpcBuffer.slice(index + 1);
      if (line) {
        const message = JSON.parse(line);
        if (message.id === id) return message;
      }
      index = rpcBuffer.indexOf("\n");
    }

    const remaining = deadline - Date.now();
    const read = await Promise.race([
      stdoutReader!.read(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`RPC ${id} timed out`)), remaining)
      ),
    ]);
    if (read.done) break;
    rpcBuffer += decoder.decode(read.value, { stream: true });
  }

  let index = rpcBuffer.indexOf("\n");
  while (index !== -1) {
    const line = rpcBuffer.slice(0, index).trim();
    rpcBuffer = rpcBuffer.slice(index + 1);
    if (line) {
      const message = JSON.parse(line);
      if (message.id === id) return message;
    }
    index = rpcBuffer.indexOf("\n");
  }

  throw new Error(`RPC ${id} timed out`);
}

async function initializeMcp() {
  writeRpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "server-test", version: "0.0.0" },
    },
  });
  await waitForRpc(1);
  writeRpc({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
}

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "codex-threads-server-test-"));
  port = 28000 + Math.floor(Math.random() * 10000);
  brokerUrl = `http://127.0.0.1:${port}`;
  brokerProc = Bun.spawn([process.execPath, join(root, "broker.ts")], {
    cwd: root,
    env: {
      ...process.env,
      CODEX_THREADS_PORT: String(port),
      CODEX_THREADS_DB: join(tempDir, "broker.sqlite"),
    },
    stdout: "ignore",
    stderr: "ignore",
  });
  await waitForBroker();
});

afterEach(async () => {
  if (serverProc) {
    stdoutReader?.releaseLock();
    stdoutReader = null;
    rpcBuffer = "";
    serverProc.kill("SIGTERM");
    await serverProc.exited;
    serverProc = null;
  }
  if (brokerProc) {
    brokerProc.kill("SIGTERM");
    await brokerProc.exited;
    brokerProc = null;
  }
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

test("registers Codex thread metadata from CODEX_THREAD_ID", async () => {
  serverProc = Bun.spawn([process.execPath, join(root, "server.ts")], {
    cwd: root,
    env: {
      ...process.env,
      CODEX_THREADS_PORT: String(port),
      CODEX_THREADS_DB: join(tempDir, "broker.sqlite"),
      CODEX_THREAD_ID: "thread-from-env",
      CODEX_THREADS_AUTOSTART_BRIDGE: "0",
      OPENAI_API_KEY: "",
    },
    stdin: "pipe",
    stdout: "ignore",
    stderr: "ignore",
  });

  const peer = await waitForCodexPeer();

  expect(peer.client_kind).toBe("codex");
  expect(peer.thread_id).toBe("thread-from-env");
});

test("bind_thread tool binds an unbound MCP peer to a Codex thread", async () => {
  serverProc = Bun.spawn([process.execPath, join(root, "server.ts")], {
    cwd: root,
    env: {
      ...process.env,
      CODEX_THREADS_PORT: String(port),
      CODEX_THREADS_DB: join(tempDir, "broker.sqlite"),
      CODEX_THREAD_ID: "",
      CODEX_THREADS_AUTOSTART_BRIDGE: "0",
      OPENAI_API_KEY: "",
    },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
  });

  const initialPeers = await waitForPeerCount(1);
  expect(initialPeers[0]!.client_kind).toBe("claude");
  expect(initialPeers[0]!.thread_id).toBeNull();

  await initializeMcp();
  writeRpc({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "bind_thread",
      arguments: { thread_id: "thread-bound-via-tool" },
    },
  });

  const response = await waitForRpc(2);
  expect(response.result.content[0].text).toContain("thread-bound-via-tool");

  const peers = await waitForPeerCount(1);
  expect(peers[0]).toMatchObject({
    client_kind: "codex",
    thread_id: "thread-bound-via-tool",
  });
  expect(peers[0]!.id).not.toBe(initialPeers[0]!.id);
});

test("set_summary can correct plugin-hosted workspace paths", async () => {
  serverProc = Bun.spawn([process.execPath, join(root, "server.ts")], {
    cwd: root,
    env: {
      ...process.env,
      CODEX_THREADS_PORT: String(port),
      CODEX_THREADS_DB: join(tempDir, "broker.sqlite"),
      CODEX_THREAD_ID: "",
      CODEX_THREADS_AUTOSTART_BRIDGE: "0",
      OPENAI_API_KEY: "",
    },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
  });

  await waitForPeerCount(1);
  await initializeMcp();
  const cwd = resolve(tempDir, "workspace");
  writeRpc({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "set_summary",
      arguments: { summary: "PROJECT: test | workspace", cwd, git_root: tempDir },
    },
  });

  const response = await waitForRpc(2);
  expect(response.result.content[0].text).toContain("Peer context updated");

  const peers = await waitForPeerCount(1);
  expect(peers[0]).toMatchObject({
    summary: "PROJECT: test | workspace",
    cwd,
    git_root: tempDir,
  });
});
