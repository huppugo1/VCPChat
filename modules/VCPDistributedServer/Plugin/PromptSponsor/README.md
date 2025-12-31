# PromptSponsor - 提示词赞助器插件

一个强大的系统提示词管理插件，允许 AI 完全控制和管理 Agent 的系统提示词。支持三种模式：原始富文本、模块化积木块、临时与预制。提供对积木块的增删改查、小仓管理、多仓库操作等完整功能。

## 📋 功能概述

### 三种提示词模式

| 模式 | 标识 | 功能特点 |
|------|------|---------|
| **原始富文本** | `original` | 简单直接的文本编辑 |
| **模块化积木块** | `modular` | 积木块式管理，支持拖拽、禁用、多内容条目、小仓库 |
| **临时与预制** | `preset` | 从预设文件夹加载模板，支持占位符 |

### 核心能力

- ✅ **模式管理**: 查询和切换提示词模式
- ✅ **内容读写**: 获取和设置各模式的提示词内容
- ✅ **积木块操作**: 增删改查、移动、禁用/启用
- ✅ **多内容条目**: 为积木块添加多个可选内容版本
- ✅ **小仓库系统**: 隐藏/恢复积木块，支持多仓库分类
- ✅ **预设管理**: 列出和应用预设模板

## 🚀 快速开始

### 安装配置

1. 将插件放置在 `VCPDistributedServer/Plugin/PromptSponsor/` 目录下
2. 复制 `.env.example` 为 `.env` 并配置：

```env
# Agent 配置文件目录（必需）
AGENT_DIR=/path/to/your/AppData/Agents

# 调试模式（可选）
DEBUG_MODE=true
```

3. 安装依赖：

```bash
npm install dotenv fs-extra
```

### Agent ID 格式

Agent ID 通常格式为：`_Agent_1761774023391_1761774023392`

可以从 Agent 配置文件路径获取：
- 目录结构：`AppData/Agents/_Agent_1761774023391_1761774023392/config.json`
- 扁平结构：`AppData/Agents/_Agent_1761774023391_1761774023392.json`

## 📖 API 参考

### 模式管理

#### GetPromptMode - 获取当前模式

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」GetPromptMode「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」
<<<[END_TOOL_REQUEST]>>>
```

**返回示例：**
```json
{
  "status": "success",
  "result": {
    "agentId": "_Agent_1761774023391_1761774023392",
    "mode": "modular",
    "availableModes": ["original", "modular", "preset"],
    "message": "当前提示词模式: modular"
  }
}
```

#### SetPromptMode - 切换模式

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」SetPromptMode「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」,
mode:「始」modular「末」
<<<[END_TOOL_REQUEST]>>>
```

**可选模式：**
- `original` - 原始富文本模式
- `modular` - 模块化积木块模式
- `preset` - 临时与预制模式

**返回示例：**
```json
{
  "status": "success",
  "result": {
    "message": "提示词模式已切换到: modular，systemPrompt 已同步更新",
    "mode": "modular",
    "systemPrompt": "格式化后的系统提示词内容..."
  }
}
```

**重要说明：**
- ✅ `SetPromptMode` 会自动更新 `systemPrompt` 字段，使其与当前模式保持同步
- ✅ 如果当前正在设置页面编辑该 Agent，界面会自动静默刷新显示新模式
- ✨ **实时更新**：无需手动刷新，插件会自动触发前端重新加载 Agent 配置

---

### 内容管理

#### GetActivePrompt - 获取当前激活的提示词

获取格式化后的最终提示词文本（用于发送给 AI）。

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」GetActivePrompt「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」
<<<[END_TOOL_REQUEST]>>>
```

#### SetOriginalPrompt - 设置原始模式内容

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」SetOriginalPrompt「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」,
content:「始」你是一个友好的AI助手，擅长回答各种问题。「末」
<<<[END_TOOL_REQUEST]>>>
```

---

### 模块化积木块操作

#### GetModularBlocks - 获取所有积木块

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」GetModularBlocks「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」
<<<[END_TOOL_REQUEST]>>>
```

**返回示例：**
```json
{
  "status": "success",
  "result": {
    "blocks": [
      {
        "id": "block_1234567890_abc123",
        "type": "text",
        "content": "你是一个友好的助手",
        "name": "基础身份",
        "disabled": false,
        "variants": ["你是一个友好的助手", "你是一个专业的顾问"],
        "selectedVariant": 0
      }
    ],
    "totalBlocks": 1,
    "enabledBlocks": 1
  }
}
```

#### AddBlock - 添加积木块

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」AddBlock「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」,
type:「始」text「末」,
content:「始」你擅长编程和代码分析「末」,
name:「始」编程能力「末」
<<<[END_TOOL_REQUEST]>>>
```

**参数说明：**
- `type`: `text`（文本块）或 `newline`（换行块）
- `content`: 文本内容（换行块无需此参数）
- `name`: 可选的名称标签
- `position`: 可选的插入位置（索引，从 0 开始）

#### UpdateBlock - 更新积木块

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」UpdateBlock「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」,
blockId:「始」block_1234567890_abc123「末」,
content:「始」更新后的内容「末」,
name:「始」新名称「末」
<<<[END_TOOL_REQUEST]>>>
```

#### DeleteBlock - 删除积木块

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」DeleteBlock「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」,
blockId:「始」block_1234567890_abc123「末」
<<<[END_TOOL_REQUEST]>>>
```

#### MoveBlock - 移动积木块

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」MoveBlock「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」,
blockId:「始」block_1234567890_abc123「末」,
newPosition:「始」2「末」
<<<[END_TOOL_REQUEST]>>>
```

---

### 多内容条目（Variants）管理

#### AddVariant - 添加内容条目

为积木块添加一个新的可选内容版本。

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」AddVariant「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」,
blockId:「始」block_1234567890_abc123「末」,
content:「始」另一个版本的内容「末」
<<<[END_TOOL_REQUEST]>>>
```

#### UpdateVariant - 更新内容条目

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」UpdateVariant「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」,
blockId:「始」block_1234567890_abc123「末」,
variantIndex:「始」1「末」,
content:「始」修改后的内容「末」
<<<[END_TOOL_REQUEST]>>>
```

#### SelectVariant - 选择显示的内容条目

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」SelectVariant「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」,
blockId:「始」block_1234567890_abc123「末」,
variantIndex:「始」0「末」
<<<[END_TOOL_REQUEST]>>>
```

#### DeleteVariant - 删除内容条目

注意：至少保留一个内容条目，不能删除最后一个。

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」DeleteVariant「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」,
blockId:「始」block_1234567890_abc123「末」,
variantIndex:「始」2「末」
<<<[END_TOOL_REQUEST]>>>
```

---

### 小仓库管理

#### HideBlock - 隐藏积木块到仓库

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」HideBlock「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」,
blockId:「始」block_1234567890_abc123「末」,
warehouse:「始」常用模板「末」
<<<[END_TOOL_REQUEST]>>>
```

#### RestoreBlock - 从仓库恢复积木块

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」RestoreBlock「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」,
warehouse:「始」default「末」,
blockIndex:「始」0「末」,
position:「始」2「末」
<<<[END_TOOL_REQUEST]>>>
```

**参数说明：**
- `warehouse`: 仓库名称
- `blockIndex`: 仓库中的索引（从 0 开始）
- `position`: 可选，恢复到编辑区的位置

#### GetWarehouses - 获取所有仓库

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」GetWarehouses「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」
<<<[END_TOOL_REQUEST]>>>
```

#### CreateWarehouse - 创建新仓库

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」CreateWarehouse「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」,
warehouseName:「始」实验性内容「末」
<<<[END_TOOL_REQUEST]>>>
```

#### RenameWarehouse - 重命名仓库

注意：不能重命名 `default` 仓库。

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」RenameWarehouse「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」,
oldName:「始」实验性内容「末」,
newName:「始」已验证模板「末」
<<<[END_TOOL_REQUEST]>>>
```

#### DeleteWarehouse - 删除仓库

注意：不能删除 `default` 仓库，删除仓库会同时删除其中的所有积木块。

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」DeleteWarehouse「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」,
warehouseName:「始」临时仓库「末」
<<<[END_TOOL_REQUEST]>>>
```

---

### 预设管理

#### ListPresets - 列出所有预设

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」ListPresets「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」
<<<[END_TOOL_REQUEST]>>>
```

**返回示例：**
```json
{
  "status": "success",
  "result": {
    "presets": [
      {
        "name": "角色扮演模板",
        "path": "/path/to/角色扮演模板.md",
        "extension": ".md",
        "size": 1024,
        "modified": "2025-01-29T10:00:00.000Z"
      }
    ],
    "presetPath": "/path/to/AppData/systemPromptPresets",
    "totalPresets": 1
  }
}
```

#### SetPreset - 应用预设

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」SetPreset「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」,
presetPath:「始」/path/to/preset.md「末」
<<<[END_TOOL_REQUEST]>>>
```

#### SetPresetContent - 直接设置预设内容

不使用预设文件，直接设置自定义内容。

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」PromptSponsor「末」,
command:「始」SetPresetContent「末」,
agentId:「始」_Agent_1761774023391_1761774023392「末」,
content:「始」自定义的提示词内容...「末」
<<<[END_TOOL_REQUEST]>>>
```

---

## 💡 使用场景示例

### 场景 1: 动态调整 Agent 身份

```javascript
// 1. 切换到模块化模式
SetPromptMode(agentId, 'modular')

// 2. 添加基础身份积木块
AddBlock(agentId, 'text', '你是一个专业的编程助手', '基础身份')

// 3. 添加技能积木块
AddBlock(agentId, 'text', '你精通 Python, JavaScript, Go 等多种编程语言', '技能列表')

// 4. 添加换行块
AddBlock(agentId, 'newline')

// 5. 添加工作风格
AddBlock(agentId, 'text', '你的回答简洁明了，注重实用性', '工作风格')
```

### 场景 2: 管理多版本提示词

```javascript
// 为同一个积木块添加多个版本
AddVariant(blockId, '你是一个严肃专业的顾问')
AddVariant(blockId, '你是一个轻松幽默的伙伴')

// 根据场景切换版本
SelectVariant(blockId, 0)  // 使用专业版本
SelectVariant(blockId, 1)  // 使用轻松版本
```

### 场景 3: 使用小仓库管理模板

```javascript
// 创建分类仓库

CreateWarehouse('角色扮演')
CreateWarehouse('技术文档')
CreateWarehouse('创意写作')

// 将积木块分类存储
HideBlock(blockId1, '角色扮演')
HideBlock(blockId2, '技术文档')

// 需要时快速恢复
RestoreBlock('角色扮演', 0)
```

---

## 🔧 数据结构说明

### Agent 配置文件结构

```json
{
  "promptMode": "modular",
  
  "originalSystemPrompt": "原始富文本内容...",
  
  "advancedSystemPrompt": {
    "blocks": [
      {
        "id": "block_1234567890_abc123",
        "type": "text",
        "content": "当前显示的内容",
        "name": "积木块名称",
        "disabled": false,
        "variants": ["内容版本1", "内容版本2"],
        "selectedVariant": 0
      }
    ],
    "hiddenBlocks": {
      "default": [],
      "常用模板": [],
      "实验性内容": []
    },
    "warehouseOrder": ["default", "常用模板", "实验性内容"]
  },
  
  "presetSystemPrompt": "预设内容...",
  "presetPromptPath": "./AppData/systemPromptPresets",
  "selectedPreset": "/path/to/preset.md"
}
```

### 积木块类型

| 类型 | 标识 | 说明 |
|------|------|------|
| 文本块 | `text` | 可编辑内容的积木块，支持多内容条目 |
| 换行块 | `newline` | 强制换行，在格式化时转换为 `\n` |

---

## ⚠️ 注意事项

### 使用限制

1. **仓库管理**
   - `default` 仓库不可删除和重命名
   - 删除仓库会同时删除其中的所有积木块

2. **内容条目**
   - 每个积木块至少保留一个内容条目
   - 只有文本块支持多内容条目功能

3. **Agent ID**
   - 必须使用正确的 Agent ID 格式
   - ID 区分大小写

### 最佳实践

1. **模块化使用建议**
   - 将不同功能的提示词拆分为独立积木块
   - 为常用模板创建专门的仓库分类
   - 使用有意义的名称标记积木块

2. **版本管理**
   - 为同一功能创建多个内容条目，便于快速切换
   - 定期清理不再使用的内容条目

3. **性能考虑**
   - 积木块数量建议控制在 100 个以内
   - 避免单个积木块内容过长（建议 < 1000 字符）

---

## 🐛 错误处理

### 常见错误

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `Agent configuration not found` | Agent ID 不存在 | 检查 Agent ID 是否正确 |
| `Invalid mode` | 模式名称错误 | 使用 `original`、`modular` 或 `preset` |
| `Block not found` | 积木块 ID 不存在 | 先调用 `GetModularBlocks` 获取正确的 ID |
| `Cannot delete the default warehouse` | 尝试删除默认仓库 | `default` 仓库不可删除 |
| `Cannot delete the last variant` | 尝试删除最后一个内容条目 | 至少保留一个内容条目 |

### 调试模式

启用调试模式查看详细日志：

```env
DEBUG_MODE=true
```

调试日志输出到 `stderr`，不影响正常的 JSON 响应。

---

## 📊 性能指标

- **响应时间**: < 100ms（大部分操作）
- **文件读写**: < 50ms（配置文件通常 < 100KB）
- **并发支持**: 是（通过 Node.js 异步 I/O）

---

## 🔄 版本历史

### v1.0.0 (2025-01-29)

**初始版本发布**

- ✨ 支持三种提示词模式管理
- ✨ 完整的积木块 CRUD 操作
- ✨ 多内容条目（Variants）功能
- ✨ 小仓库分类管理系统
- ✨ 预设模板加载和应用
- ✨ 完善的错误处理和日志记录

---

## 📝 许可证

MIT License - 与 VCPChat 主项目相同

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发指南

1. 克隆仓库
2. 安装依赖：`npm install`
3. 配置 `.env` 文件
4. 运行测试（如果有）

### 代码规范

- 使用 ES6+ 语法
- 遵循现有代码风格
- 添加适当的注释和文档

---

## 📞 技术支持

- **文档**: 参考 [Promptmodules/README.md](../../../Promptmodules/README.md)
- **问题反馈**: 提交 GitHub Issue
- **实时交流**: VCPChat 社区

---

## 🎯 未来计划

- [ ] 批量操作支持（同时操作多个积木块）
- [ ] 积木块模板导入/导出
- [ ] 提示词版本历史记录
- [ ] 智能提示词优化建议
- [ ] 更多预设模板类型支持

---

**最后更新**: 2025-01-29  
**插件版本**: 1.0.0  
**兼容版本**: VCPChat v1.0+
