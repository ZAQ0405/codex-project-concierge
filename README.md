# Codex Project Concierge

[简体中文](#简体中文) | [English](#english)

## 简体中文

一个本地优先的 Codex 插件，可将管理对话中的任务分派给持久项目对话，并通过本地 MCP 桥接器收回回复。

MCP 桥接器基于 [`dazman-codex/codex-threads-mcp`](https://github.com/dazman-codex/codex-threads-mcp)，用于发现本机对话，并通过 `codex exec resume` 唤醒已绑定的 Codex 会话。仓库包含上游 MIT 许可证；`project-concierge` 技能负责管理对话中的项目路由流程。

### 功能范围

- 在同一台机器上的 Codex 桌面端本地会话之间通信。
- 每个项目会话需要使用 `bind_thread` 绑定一次，并通过 `set_summary` 设置稳定的 `PROJECT: ...` 摘要。
- 管理对话可以发现 peer、发送任务，并通过消息桥接收回复。
- 桥接器只监听本机，并使用本地 SQLite 消息库。

这是一个本地桌面插件。运行 MCP 服务和唤醒已绑定会话需要安装 Bun 与 Codex CLI。Windows 启动器会自动查找当前用户安装的程序路径；其他平台需自行配置 MCP 启动命令。

### 安装

1. 安装 Bun、Codex 桌面应用及其 CLI。
2. 克隆仓库，并在仓库根目录运行安装脚本：

   ```powershell
   git clone https://github.com/ZAQ0405/codex-project-concierge.git
   cd codex-project-concierge
   powershell -ExecutionPolicy Bypass -File .\install.ps1
   ```

   安装器会按锁文件还原依赖、将此仓库注册为本地 marketplace，并安装插件及其 MCP 服务。
3. 安装器会停止旧版 Concierge broker 和 bridge，避免旧进程继续占用端口或运行过期代码。重启 Codex 并新建一个本地对话，确认 `list_peers`、`send_message`、`bind_thread`、`set_summary` 和 `check_messages` 工具可用。
4. 使用已有项目对话时，在启用插件的该对话中，用已核实的 Codex thread ID 调用一次 `bind_thread`，再通过 `set_summary` 设置稳定的 `PROJECT: ...` 摘要、工作目录 `cwd` 和 Git 根目录 `git_root`。若管理对话需要接收自动回复，也要绑定管理对话。

根目录的 `.agents/plugins/marketplace.json` 让仓库可以独立作为本地 marketplace 使用。根目录的 `plugin.json` 和 `mcp.json` 是便携插件格式；`.codex-plugin/plugin.json` 和 `.mcp.json` 提供 Codex 兼容格式。两份 MCP 清单都通过同一个 Windows 启动器运行，启动器会查找 Bun 和 Codex CLI，并使用当前 Windows 用户目录保存运行状态。

### 上游桥接命令

仓库保留了这些上游命令：

- `bun run server`：启动 MCP 服务
- `bun run broker`：启动本地消息 broker
- `bun run bridge`：启动 Codex 会话唤醒 bridge
- `bun cli.ts peers`：查看已发现的 peer

首个 peer 启动时会自动启动 broker 和 bridge。如需自定义配置，可通过 MCP 服务环境变量设置 `CODEX_THREADS_PORT`、`CODEX_THREADS_DB` 和 `CODEX_CLI_PATH`。

### 已发现的问题与修复

- **Windows 子进程路径错误：** `new URL(...).pathname` 会生成 `/D:/...` 路径，并对非 ASCII 路径进行百分号编码。服务现在通过 `fileURLToPath` 解析 broker 和 bridge 脚本路径。
- **启动器依赖特定用户的绝对路径：** MCP 清单现在使用启动器查找 Bun 和 Codex CLI；当 `HOME` 未设置时，broker 和 bridge 会从当前用户目录推导状态路径。
- **技能已加载但 MCP 工具未加载：** 插件曾混用便携版和 Codex 兼容版清单，并通过额外的全局 MCP 配置绕过插件加载问题。现在清单已规范化，应由插件宿主加载内置 MCP 服务；不要再添加重复的全局 `mcp_servers.codex-project-concierge` 配置。
- **无效的 marketplace 阻止插件列表读取：** 如果 CLI 报告 marketplace 根目录缺少清单，只移除那个失效的 marketplace 注册，不要删除有效插件来源。
- **会话显示在侧边栏不代表 peer 已运行：** `list_peers` 只返回 MCP 服务正在运行的会话。旧项目会话需要先打开并启用插件。
- **Codex 可能不向 MCP 服务提供 `CODEX_THREAD_ID`：** Codex 插件现在会显式启动 bridge。仍需用已核实的 thread ID 绑定项目会话和管理会话，并设置稳定摘要，bridge 才能确定消息目标。
- **插件升级后残留独立运行的旧 daemon：** 安装器只停止命令行明确指向本插件的 Bun broker/bridge 进程，让新对话启动刚安装的版本。
- **插件宿主可能把缓存目录当作工作目录：** `set_summary` 现在可接受已核实的 `cwd` 和 `git_root`，设置 peer 信息时应传入这些路径。

### 故障排查

- 如果技能已加载但 MCP 工具缺失，运行 `install.ps1`，重启 Codex，并新建一个本地对话。确认已安装 Bun，且 `scripts/start-server.ps1` 能找到 Bun 和 Codex CLI。不要添加重复的全局 MCP 配置。
- 如果 `list_peers` 找不到项目会话，打开该项目对话并启用插件，使用已核实的 thread ID 调用 `bind_thread`，然后设置摘要。
- 如果 bridge 报告 `thread already has an active writer`，说明目标会话仍被另一轮运行占用。等待那轮运行结束后再尝试自动唤醒；消息会留在本地 broker 队列中。

## English

A local-first Codex plugin for routing work from a manager chat to persistent project chats and bringing their replies back over a local MCP bridge.

The MCP bridge is based on [`dazman-codex/codex-threads-mcp`](https://github.com/dazman-codex/codex-threads-mcp), which provides localhost peer discovery and wakes bound Codex threads with `codex exec resume`. Its upstream MIT license is included. The `project-concierge` skill adds manager routing behavior.

### Current scope

- Codex desktop/local threads on one machine.
- Each project thread must be registered once with `bind_thread` and given a stable `PROJECT: ...` summary using `set_summary`.
- The manager discovers peers, sends a task, and receives a reply through the thread-message bridge.
- The bridge is localhost-only and uses a local SQLite message store.

This is a local desktop plugin. Bun and the Codex CLI are required to run the included MCP server and wake bound conversations. The Windows launcher discovers their per-user installation paths; other platforms should configure the MCP command for their local runtime.

### Install

1. Install Bun and the Codex desktop app with its CLI.
2. Clone this repository and run the installer from its root:

   ```powershell
   git clone https://github.com/ZAQ0405/codex-project-concierge.git
   cd codex-project-concierge
   powershell -ExecutionPolicy Bypass -File .\install.ps1
   ```

   The installer restores locked dependencies, registers this repository as a local marketplace, and installs the plugin with its bundled MCP server.
3. The installer stops any older Concierge broker and bridge processes so they cannot keep running stale code. Restart Codex and start a new local conversation. The tools (`list_peers`, `send_message`, `bind_thread`, `set_summary`, and `check_messages`) should be available.
4. For existing project conversations, open the conversation with the plugin enabled, use `bind_thread` once with its verified Codex thread ID, and set a stable `PROJECT: ...` summary plus the verified workspace `cwd` and `git_root`. Bind the manager conversation too if it needs to receive automatic replies.

The root `.agents/plugins/marketplace.json` makes this repository independently installable. The root `plugin.json` and `mcp.json` use the portable plugin layout; `.codex-plugin/plugin.json` and `.mcp.json` provide the Codex compatibility layout. Both MCP manifests launch the same Windows wrapper, which resolves Bun and the Codex CLI at runtime and uses the current Windows profile for state paths.

### Upstream bridge commands

The included upstream commands remain available:

- `bun run server` — MCP server
- `bun run broker` — local message broker
- `bun run bridge` — Codex thread wakeup bridge
- `bun cli.ts peers` — inspect discovered peers

The first peer startup launches the broker and bridge automatically. Configure `CODEX_THREADS_PORT`, `CODEX_THREADS_DB`, and `CODEX_CLI_PATH` through the MCP server environment when needed.

### Problems found and fixes

- **Windows child-process paths failed.** Using `new URL(...).pathname` produced `/D:/...` paths and percent-encoded non-ASCII directory names. The server now uses `fileURLToPath` for broker and bridge scripts.
- **The MCP server depended on one user’s absolute paths.** The manifests now use a launcher that finds Bun and the Codex CLI, and the broker/bridge derive their state directory from the home directory when `HOME` is unset.
- **Plugin skills loaded while MCP tools did not.** The package mixed portable and Codex-compatibility manifests, and earlier attempts added a second global MCP entry instead of fixing the plugin package. The manifests are now normalized; install the plugin from its marketplace and let the plugin host load its bundled MCP server. Do not keep a duplicate global `mcp_servers.codex-project-concierge` entry.
- **A malformed unrelated marketplace blocked `codex plugin list`.** Remove only the stale marketplace registration if the CLI reports that its root lacks a manifest; do not remove valid plugin sources.
- **A visible thread is not automatically an active peer.** `list_peers` only returns conversations whose MCP server is running. Older/inactive project conversations must be opened once with the plugin enabled.
- **Codex may not pass `CODEX_THREAD_ID` to the MCP process.** The Codex plugin now explicitly starts the bridge even when that variable is missing. Bind each project thread and the manager once using verified thread IDs, then set stable summaries so the bridge can wake the intended thread.
- **Detached daemons outlived plugin upgrades.** The installer now stops only Bun broker/bridge processes whose command line points to this plugin, so the next conversation launches the installed version.
- **Plugin-hosted MCP may report the plugin cache as its working directory.** `set_summary` now accepts an explicit verified `cwd` and `git_root`; include these when registering manager and project peers so directory matching remains accurate.

### Troubleshooting

- If the skill is present but MCP tools are missing, run `install.ps1`, restart Codex, and open a new local conversation. Check that Bun is installed and `scripts/start-server.ps1` can find both Bun and the Codex CLI. Avoid adding a duplicate global MCP entry.
- If `list_peers` returns no matching project, open that project conversation with the plugin enabled, call `bind_thread` with its verified thread ID, and set its summary.
- If the bridge reports `thread already has an active writer`, Codex still has that destination thread open in another active run. Let that run finish before retrying automatic wake; the message remains queued in the local broker.
