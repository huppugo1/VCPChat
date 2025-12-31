# Tauri 迁移映射（初版）

此文件列出需要从 Electron 主进程 / ipc 迁移到 Tauri（Rust 后端）的文件、IPC 通道、优先级与建议替换方式。后续迁移请按此表逐项实现并同时修正前端引用。

## 迁移原则（简要）
- 将所有 `ipcMain.handle` / `ipcMain.on` 对应的处理逻辑迁移为 `#[tauri::command]`（Rust），并在 `src-tauri/src/lib.rs` 注册（`invoke_handler`）。
- 前端（renderer）将 `ipcRenderer.invoke('channel', ...)` / `ipcRenderer.send('channel', ...)` 替换为 `await invoke('rust_command_name', {...})` 或使用 `@tauri-apps/api` 的 `dialog` / `fs` / `window` API。
- 所有创建/管理窗口的逻辑应改为使用 Tauri 的 `Window` / `WindowBuilder`（Rust）或 `tauri.window` JS API。
- 依赖 Node 原生模块（如 `selection-hook`、`node-pty`、`node-global-key-listener` 等）的功能，优先寻找 Rust crate 替代；若暂不可替代，可把这些模块作为独立子进程由 Rust 启动与管理，前端通过 invoke/事件通信。

---

## 优先迁移（核心 IPC handlers）

- `modules/ipc/windowHandlers.js`
  - 频道/事件：`minimize-window`, `maximize-window`, `unmaximize-window`, `close-window`, `toggle-notifications-sidebar`, `open-dev-tools`, `open-image-viewer`, `open-forum-window`
  - 建议：实现对应 Rust 命令 `minimize_window`, `maximize_window`, `unmaximize_window`, `close_window`, `toggle_maximize_window`, `toggle_dev_tools`, `open_dev_tools`, `close_dev_tools`（部分已在 `src-tauri/src/lib.rs` 存在）。`open-image-viewer`、`open-forum-window` 建议在 Rust 使用 `tauri::WindowBuilder` 创建新窗口并通过事件把参数传给渲染页面。

- `modules/ipc/chatHandlers.js`
  - 频道/函数：`get-chat-history`, `save-chat-history`, `create-new-topic-for-agent`, `delete-topic`, `get-agent-topics`, `send-to-vcp`, `interrupt-vcp-request`, `get-unread-topic-counts`, `save-chat-history`
  - 建议：大部分文件读写/网络请求迁移为 Rust async 命令（已在 `lib.rs` 有一部分实现，如 `get_chat_history`, `save_chat_history`, `send_message_to_vcp`），需要对流式 VCP 交互和 event 通道做设计（Tauri events 或返回 stream token）。

- `modules/ipc/agentHandlers.js`
  - 频道/函数：`get-agents`, `get-agent-config`, `save-agent-config`, `save-avatar`, `create-agent`, `delete-agent`, `save-user-avatar`, `get-all-items`, `save-agent-order`
  - 建议：迁移为 Rust 命令以处理 FS/路径与兼容性逻辑，并保留 agentConfigManager 的抽象（可在 Rust 实现）。

- `modules/ipc/assistantHandlers.js`
  - 频道/函数：选择监听相关、`get-assistant-bar-initial-data`, `toggle-selection-listener`, `get-selection-listener-status`, `assistant-action`
  - 建议：将剪贴板/系统选择监听与全局热键逻辑迁移到 Rust（或由 Rust 启动子进程），并暴露命令给前端；窗口创建仍建议由 Rust 管理。

- `modules/ipc/fileDialogHandlers.js`
  - 频道/函数：文件选择对话框、保存粘贴文件等
  - 建议：使用 Tauri 的 `dialog` API（Rust 或 `@tauri-apps/api/dialog`）替换 Electron 的 `dialog`。

- `modules/ipc/themeHandlers.js`, `settingsHandlers.js`, `promptHandlers.js`, `regexHandlers.js`, `notesHandlers.js`, `musicHandlers.js`, `canvasHandlers.js`, `emoticonHandlers.js`, `diceHandlers.js`, `forumHandlers.js`, `groupChatHandlers.js`
  - 建议：这些文件中涉及到本地 FS/配置/窗口的部分统一迁移为 Rust 命令；纯渲染逻辑保留在前端并改为 invoke/event 与 Rust 通信。

---

## 其他需要评估（直接依赖 Electron 的模块，按发现顺序）

- `modules/VCPHumanToolBox/main.js`（主进程） — 需完全重写为 Rust 后端逻辑（窗口创建、preload 替换）。
- `modules/VCPHumanToolBox/preload.js` — 移除 Node/Electron 全局暴露，改为 Tauri 安全的 API（尽量直接使用 invoke 或 window.events）。
- `modules/VCPDistributedServer/VCPDistributedServer.js` — 主进程服务管理逻辑迁移；插件管理（Plugin/*）如果通过 stdio 保留插件实现，但主进程应由 Rust 启动/管理。
- `modules/VCPDistributedServer/Plugin/*` — 插件如果以独立进程（Python/Node）运行，可继续使用，但启动/停止由 Rust 控制并通过 stdio/HTTP 与前端通信。
- `modules/VCPDistributedServer/Plugin/PowerShellExecutor/PowerShellExecutor.js` — 包含窗口管理、pty、子进程追踪、ipcMain 监听；建议把 GUI 窗口由 Rust 创建（或将该插件 GUI 转为独立渲染页面，通过 Rust 启动），将 pty/子进程管理在 Rust 或单独的 Node 子进程中，并替换与主应用的 IPC 为 invoke/event。
- `modules/VchatManager/main.js` — 主进程逻辑迁移到 Rust。
- `modules/SovitsTTS.js` — 本地模型调用封装到 Rust 或保持作为单独进程，由 Rust 管理。
- `modules/Groupmodules/groupchat.js` — 若为主进程逻辑，迁移，否则前端改 invoke。

---

## 代码引用修正建议（替换模式）

- Renderer 侧旧代码（Electron）：
  - `const { ipcRenderer } = require('electron');`
  - `ipcRenderer.invoke('get-chat-history', agentId, topicId)`
  - `ipcRenderer.send('minimize-window')`

- 新代码（Tauri）：
  - `import { invoke } from '@tauri-apps/api/tauri'`
  - `await invoke('get_chat_history', { agent_id: agentId, topic_id: topicId })`
  - `await invoke('minimize_window')`
  - 对于文件对话：`import { open } from '@tauri-apps/api/dialog'`
  - 对于事件：使用 `import { listen, emit } from '@tauri-apps/api/event'`

注意：Rust 命令名与现有 `lib.rs` 的函数名应一致（如已有 `get_chat_history` 则前端调用 `get_chat_history`）。

---

## 优先级与里程碑（建议）

1. 快速替换：将窗口控制事件与简单文件 I/O（settings、themes、agents）迁移为 Rust（优先级高，影响全局）。
2. 聊天与 VCP 请求逻辑迁移（需要仔细处理 stream/事件机制）。
3. assistant（选择监听、全局热键）与原生模块替代（需要评估 Rust crate）。
4. 插件管理与 PowerShellExecutor 等复杂插件迁移（可能分拆为独立子进程并由 Rust 管理）。

---

如果你同意，我将按优先级 1 的文件开始实际迁移（先修改前端调用替换为 invoke，并在 `src-tauri` 中补齐命令），并在每次迁移后自动扫描并替换代码库中的所有引用（保证一致性）。


