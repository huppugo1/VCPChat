# WaitingForUrReply Plugin

## 🎯 功能概述

WaitingForUrReply 是一个 VCP 同步插件，专为 AI 对话中的用户交互而设计。当 AI 需要用户输入时，插件会弹出系统原生对话框，暂停 AI 输出并等待用户回复，提供流畅的交互体验。

## ✨ 核心特性

### 🖥️ 跨平台原生支持
- **macOS**: 使用 AppleScript 显示原生对话框
- **Windows**: 使用 PowerShell + .NET Framework 显示对话框  
- **Linux**: 支持 zenity (GNOME) / kdialog (KDE)，回退到终端输入

### 🎛️ 丰富的交互选项
- **预设选项**: 支持最多9个预设选项 (option01-option09)
- **数字快选**: 按数字键 1-9 快速选择对应选项
- **自由输入**: 支持任意文本输入
- **占位符**: 支持预填充内容（会被全选，便于替换）

### 🚫 灵活的禁用机制
- **禁用按钮**: 所有平台都提供专门的禁用按钮
- **特殊字符**: 输入 `～`、`~`、`·`、`` ` `` 或 `disable` 可禁用工具
- **智能禁用**: 禁用后 AI 会收到系统指令，不再使用此工具

### ⏱️ 完善的超时控制
- **默认超时**: 20分钟（1200秒）
- **自定义超时**: 可通过参数调整
- **超时处理**: 超时后自动返回取消状态

### 🎨 自定义界面
- **自定义标题**: 可为对话框设置个性化标题
- **提示信息**: 支持多行提示文本
- **快捷键提示**: 自动显示操作说明

## 📋 参数详解

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `prompt` | 字符串 | 否 | "请输入您的回复:" | 显示给用户的提示信息 |
| `title` | 字符串 | 否 | "等待用户回复" | 对话框标题 |
| `placeholder` | 字符串 | 否 | "" | 输入框预填充内容（会被全选） |
| `timeout` | 整数 | 否 | 1200 | 超时时间（秒） |
| `option01`-`option09` | 字符串 | 否 | - | 预设选项内容 |

## 🚀 使用示例

### 基础用法
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」WaitingForUrReply「末」,
prompt:「始」请输入您的回复:「末」
<<<[END_TOOL_REQUEST]>>>
```

### 带选项和自定义标题
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」WaitingForUrReply「末」,
prompt:「始」请选择您对这个提案的态度:「末」,
title:「始」提案评审「末」,
option01:「始」完全同意，可以立即执行「末」,
option02:「始」基本同意，但需要小幅修改「末」,
option03:「始」有保留意见，需要进一步讨论「末」,
option04:「始」不同意，建议重新考虑「末」
<<<[END_TOOL_REQUEST]>>>
```

### 带占位符和自定义超时
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」WaitingForUrReply「末」,
prompt:「始」请输入您的姓名:「末」,
title:「始」用户信息「末」,
placeholder:「始」张三「末」,
timeout:「始」300「末」
<<<[END_TOOL_REQUEST]>>>
```

### 快速确认对话
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」WaitingForUrReply「末」,
prompt:「始」是否继续执行此操作？「末」,
title:「始」确认操作「末」,
option01:「始」是，继续执行「末」,
option02:「始」否，取消操作「末」
<<<[END_TOOL_REQUEST]>>>
```

## 🎮 用户操作指南

### 输入方式
1. **直接输入**: 在输入框中输入任何文本
2. **数字选择**: 按数字键 1-9 选择对应预设选项
3. **占位符**: 如有预填充内容，会被全选，可直接输入替换

### 确认和取消
- **确认**: 按 `Enter` 键或点击"确定"按钮
- **取消**: 按 `ESC` 键或点击"取消"按钮
- **禁用**: 点击"禁用"按钮或输入特殊字符 `～`、`~`、`·`、`` ` ``、`disable`

### 平台差异
| 操作 | macOS | Windows | Linux |
|------|-------|---------|-------|
| 确认 | 确定 | 确定 | OK |
| 取消 | 取消 | 取消 | Cancel |
| 禁用 | 禁用 | 禁用工具 | 禁用工具 |

## 🔧 系统要求

### macOS
- macOS 10.9+ 
- 无需额外依赖

### Windows
- Windows 7+
- PowerShell 2.0+（系统自带）
- .NET Framework 2.0+（系统自带）

### Linux
**推荐安装图形对话框工具:**
```bash
# Ubuntu/Debian
sudo apt install zenity

# CentOS/RHEL
sudo yum install zenity

# KDE 环境
sudo apt install kdialog
```

**回退支持**: 如无图形环境，自动回退到终端输入

## 📊 返回值说明

| 情况 | 返回值 | 说明 |
|------|--------|------|
| 正常输入 | 用户输入的文本 | 用户在输入框中输入的内容 |
| 选项选择 | 选项完整内容 | 用户选择的预设选项的完整文本 |
| 取消操作 | "（对方未回复明确内容）" | 用户取消或超时 |
| 禁用工具 | 系统禁用指令 | 包含禁用约束的详细系统消息 |

## ⚙️ 配置选项

### 环境变量
```bash
# 设置默认超时时间（秒）
export DEFAULT_TIMEOUT=1800
```

### 配置文件
创建 `config.env` 文件：
```bash
# 默认超时时间（秒）
DEFAULT_TIMEOUT=1200

# 调试模式（显示详细日志）
DEBUG_MODE=false
```

## 🐛 故障排除

### Linux 图形界面问题
```bash
# 检查图形环境
echo $DISPLAY

# 安装 zenity
sudo apt install zenity

# 测试 zenity
zenity --info --text="测试"
```

### 权限问题
```bash
# 确保脚本可执行
chmod +x waiting_for_reply.py

# 检查 Python 环境
python3 --version
```

### 超时问题
- 调整 `timeout` 参数
- 检查系统时间设置
- 确认网络连接稳定

## 🔍 调试信息

插件会在 stderr 输出调试信息：
```bash
DEBUG: Executing AppleScript for macOS dialog with timeout 1200s
DEBUG: User clicked disable button
DEBUG: Dialog timed out
```

## 🏗️ 技术实现

### 架构设计
```
UserInputHandler
├── show_input_dialog()          # 统一入口
├── _show_macos_dialog()         # macOS 实现
├── _show_windows_dialog()       # Windows 实现
└── _show_linux_dialog()         # Linux 实现
    ├── _use_zenity()           # zenity 实现
    ├── _use_kdialog()          # kdialog 实现
    └── _use_terminal_input()   # 终端回退
```

### 特殊字符转义
- **macOS**: AppleScript 转义 `"` `\` `\n`
- **Windows**: PowerShell 转义 `""`
- **Linux**: Shell 参数转义

### 超时实现
- **原生支持**: macOS AppleScript, Linux zenity
- **线程控制**: Windows PowerShell, Linux kdialog, 终端输入

## 📝 更新日志

### v1.0.0
- ✅ 跨平台原生对话框支持
- ✅ 预设选项和数字快选
- ✅ 自定义标题和占位符
- ✅ 统一的禁用机制
- ✅ 完善的超时控制
- ✅ 详细的调试信息

## 📄 许可证

本插件遵循 MIT 许可证。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**注意**: 此插件设计用于 AI 对话场景，请确保在合适的上下文中使用，避免过度打断用户体验。