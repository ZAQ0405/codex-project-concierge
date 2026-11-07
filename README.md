# Codex Project Concierge

A local-first Codex plugin for routing work from a manager chat to persistent project chats and bringing their replies back over a local MCP bridge.

The MCP bridge is based on [`dazman-codex/codex-threads-mcp`](https://github.com/dazman-codex/codex-threads-mcp), which provides localhost peer discovery and wakes bound Codex threads with `codex exec resume`. Its upstream MIT license is included. The `project-concierge` skill adds manager routing behavior.

## Current scope

- Codex desktop/local threads on one machine.
- Each project thread must be registered once with `bind_thread` and given a stable `PROJECT: ...` summary using `set_summary`.
- The manager discovers peers, sends a task, and receives a reply through the thread-message bridge.
- The bridge is localhost-only and uses a local SQLite message store.

This is a local desktop plugin. Bun and the Codex CLI are required to run the included MCP server and wake bound conversations. The Windows launcher discovers their per-user installation paths; other platforms should configure the MCP command for their local runtime.

## Install

1. Install Bun and the Codex desktop app with its CLI.
2. Clone this repository and run the installer from its root:

   ```powershell
   git clone https://github.com/ZAQ0405/codex-project-concierge.git
   cd codex-project-concierge
   powershell -ExecutionPolicy Bypass -File .\install.ps1
   ```

   The installer restores the locked dependencies, registers this repository as a local marketplace, and installs the plugin with its bundled MCP server.
3. The installer stops any older Concierge broker and bridge processes so they cannot keep running stale code. Restart Codex and start a new local conversation. The tools (`list_peers`, `send_message`, `bind_thread`, `set_summary`, and `check_messages`) should be available.
4. For existing project conversations, open the conversation with the plugin enabled, use `bind_thread` once with its verified Codex thread ID, and set a stable `PROJECT: ...` summary plus the verified workspace `cwd` and `git_root`. Bind the manager conversation too if it needs to receive automatic replies.

The root `.agents/plugins/marketplace.json` makes this repository independently installable. The root `plugin.json` and `mcp.json` use the portable plugin layout; `.codex-plugin/plugin.json` and `.mcp.json` provide the Codex compatibility layout. Both MCP manifests launch the same Windows wrapper, which resolves Bun and the Codex CLI at runtime and uses the current Windows profile for state paths.

## Upstream bridge commands

The included upstream commands remain available:

- `bun run server` — MCP server
- `bun run broker` — local message broker
- `bun run bridge` — Codex thread wakeup bridge
- `bun cli.ts peers` — inspect discovered peers

The first peer startup launches the broker and bridge automatically. Configure `CODEX_THREADS_PORT`, `CODEX_THREADS_DB`, and `CODEX_CLI_PATH` through the MCP server environment when needed.

## Problems found and fixes

- **Windows child-process paths failed.** Using `new URL(...).pathname` produced `/D:/...` paths and percent-encoded non-ASCII directory names. The server now uses `fileURLToPath` for broker and bridge scripts.
- **The MCP server depended on one user’s absolute paths.** The manifests now use a launcher that finds Bun and the Codex CLI, and the broker/bridge derive their state directory from the home directory when `HOME` is unset.
- **Plugin skills loaded while MCP tools did not.** The package mixed portable and Codex-compatibility manifests, and earlier attempts added a second global MCP entry instead of fixing the plugin package. The manifests are now normalized; install the plugin from its marketplace and let the plugin host load its bundled MCP server. Do not keep a duplicate global `mcp_servers.codex-project-concierge` entry.
- **A malformed unrelated marketplace blocked `codex plugin list`.** Remove only the stale marketplace registration if the CLI reports that its root lacks a manifest; do not remove valid plugin sources.
- **A visible thread is not automatically an active peer.** `list_peers` only returns conversations whose MCP server is running. Older/inactive project conversations must be opened once with the plugin enabled.
- **Codex may not pass `CODEX_THREAD_ID` to the MCP process.** The Codex plugin now explicitly starts the bridge even when that variable is missing. Bind each project thread and the manager once using verified thread IDs, then set stable summaries so the bridge can wake the intended thread.
- **Detached daemons outlived plugin upgrades.** The installer now stops only Bun broker/bridge processes whose command line points to this plugin, so the next conversation launches the installed version.
- **Plugin-hosted MCP may report the plugin cache as its working directory.** `set_summary` now accepts an explicit verified `cwd` and `git_root`; include these when registering manager and project peers so directory matching remains accurate.

## Troubleshooting

- If the skill is present but MCP tools are missing, run `install.ps1`, restart Codex, and open a new local conversation. Check that Bun is installed and `scripts/start-server.ps1` can find both Bun and the Codex CLI. Avoid adding a duplicate global MCP entry.
- If `list_peers` returns no matching project, open that project conversation with the plugin enabled, call `bind_thread` with its verified thread ID, and set its summary.
- If the bridge reports `thread already has an active writer`, Codex still has that destination thread open in another active run. Let that run finish before retrying automatic wake; the message remains queued in the local broker.
