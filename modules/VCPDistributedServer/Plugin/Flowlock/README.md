# Flowlock Plugin - 心流锁控制器

## 概述

Flowlock（心流锁）插件允许AI Agent像人类用户一样控制VCPChat的心流锁功能。当AI调用此插件时，VCPChat界面会产生与用户手动操作完全相同的效果，包括"与XX聊天中"文字的发光动画、自动续写循环等。

## 版本

- **版本**: 2.3.0
- **类型**: Node.js同步插件
- **协议**: stdio

## 功能特性

### 1. **start** - 启动心流锁
启动指定Agent和话题的心流锁功能。启动后：
- UI显示发光效果（正弦波动+心跳动画）
- 自动开始续写循环
- 每次续写使用输入框中的内容作为提示词（如果为空则使用默认提示词）
- 续写间隔为5秒

**参数**:
- `command`: "start"
- `agentId`: Agent的ID
- `topicId`: 话题的ID

**调用示例**:
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」Flowlock「末」,
command:「始」start「末」,
agentId:「始」my_agent_id「末」,
topicId:「始」topic_id_123「末」
<<<[END_TOOL_REQUEST]>>>
```

### 2. **stop** - 停止心流锁
停止当前正在运行的心流锁。停止后：
- UI的发光效果消失
- 自动续写循环停止
- 但不会中断正在进行的续写操作

**参数**:
- `command`: "stop"

**调用示例**:
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」Flowlock「末」,
command:「始」stop「末」
<<<[END_TOOL_REQUEST]>>>
```

### 3. **promptee** - 设置续写提示词
设置下一次自动续写时使用的提示词。提示词会被追加到输入框的现有内容后面，下次续写时会使用这个组合的内容作为提示词。

**参数**:
- `command`: "promptee"
- `prompt`: 要设置的提示词内容

**调用示例**:
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」Flowlock「末」,
command:「始」promptee「末」,
prompt:「始」请继续描述主角的内心活动「末」
<<<[END_TOOL_REQUEST]>>>
```

### 4. **prompter** - 从外部源获取提示词
指定一个外部数据源，从该数据源获取内容作为下一次续写的提示词，并追加到输入框。这为将来扩展更多数据源（如API、文件等）预留了接口。

**参数**:
- `command`: "prompter"
- `promptSource`: 数据源的标识或路径

**调用示例**:
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」Flowlock「末」,
command:「始」prompter「末」,
promptSource:「始」external_api_endpoint「末」
<<<[END_TOOL_REQUEST]>>>
```

**注意**: 当前版本prompter功能为占位实现，会在输入框中添加"[来自: {promptSource}]"标记。

### 5. **clear** - 清空提示词
清空输入框中的所有内容。用于重置提示词或开始全新的输入。

**参数**:
- `command`: "clear"

**调用示例**:
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」Flowlock「末」,
command:「始」clear「末」
<<<[END_TOOL_REQUEST]>>>
```

### 6. **remove** - 消除指定提示词
从输入框中移除指定的文本内容。会移除所有匹配的文本。

**参数**:
- `command`: "remove"
- `target`: 要移除的文本内容

**调用示例**:
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」Flowlock「末」,
command:「始」remove「末」,
target:「始」这段不需要的文字「末」
<<<[END_TOOL_REQUEST]>>>
```

### 7. **edit** - 编辑指定提示词(diff)
编辑输入框中的指定文本，类似diff操作。查找oldText并替换为newText（仅替换第一个匹配项）。适用于精确修改特定内容。

**参数**:
- `command`: "edit"
- `oldText`: 要查找的原始文本
- `newText`: 替换后的新文本

**调用示例**:
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」Flowlock「末」,
command:「始」edit「末」,
oldText:「始」请描述场景「末」,
newText:「始」请详细描述场景的氛围和细节「末」
<<<[END_TOOL_REQUEST]>>>
```

### 8. **get** - 获取输入框内容
获取当前输入框中的所有文本内容。返回输入框的完整文本，用于AI了解当前设置的提示词是什么。

**参数**:
- `command`: "get"

**调用示例**:
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」Flowlock「末」,
command:「始」get「末」
<<<[END_TOOL_REQUEST]>>>
```

**返回示例**:
```json
{
  "status": "success",
  "message": "输入框当前内容为: \"请继续描述场景\"",
  "content": "请继续描述场景"
}
```

### 9. **status** - 获取心流锁状态
获取心流锁的当前运行状态，包括是否启用、是否正在处理、关联的Agent和话题等信息。用于AI了解当前心流锁状态。

**参数**:
- `command`: "status"

**调用示例**:
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」Flowlock「末」,
command:「始」status「末」
<<<[END_TOOL_REQUEST]>>>
```

**返回示例（心流锁已启用）**:
```json
{
  "status": "success",
  "message": "心流锁已启用 (Agent: my_agent_id, Topic: topic_123, 处理中: 否)",
  "flowlockStatus": {
    "isActive": true,
    "isProcessing": false,
    "agentId": "my_agent_id",
    "topicId": "topic_123"
  }
}
```

**返回示例（心流锁未启用）**:
```json
{
  "status": "success",
  "message": "心流锁未启用",
  "flowlockStatus": {
    "isActive": false,
    "isProcessing": false,
    "agentId": null,
    "topicId": null
  }
}
```

## 工作原理

### 数据流

```
AI调用插件 
  ↓
Node.js插件(flowlock.js)验证参数并格式化命令
  ↓
VCPDistributedServer接收命令
  ↓
main.js的handleFlowlockControl处理命令
  ↓
通过IPC发送给渲染进程(renderer.js)
  ↓
渲染进程执行flowlockManager的相应方法
  ↓
UI更新（发光效果、自动续写等）
```

### 与VCPChat本体的集成

插件完全复用VCPChat已有的Flowlock模块功能：
- `Flowlockmodules/flowlock.js` - 核心管理器
- `Flowlockmodules/flowlock-integration.js` - 事件监听和交互
- `Flowlockmodules/flowlock.css` - 发光动画样式

AI调用插件产生的效果与用户手动操作（右键、中键、快捷键）完全一致。

## 使用场景

### 场景1: AI自主进入创作模式
```
用户: "请进入心流创作模式，持续扩写这个故事"
AI: 好的，我将启动心流锁进入创作模式
[调用 Flowlock start]
[UI开始发光，自动续写循环开始]
```

### 场景2: AI引导式创作
```
AI: [调用 Flowlock promptee，设置"请描述场景的氛围"]
[下次自动续写时使用此提示词]
AI: [调用 Flowlock start]
[开始按照引导方向创作]
```

### 场景3: AI完成创作后退出
```
AI: 故事已经完整，我现在退出心流模式
[调用 Flowlock stop]
[UI发光效果消失，自动续写停止]
```

### 场景4: AI精细调整提示词
```
用户输入: "请描述主角的内心活动，注重细节刻画"
AI: 让我优化一下这个提示词
[调用 Flowlock edit，将"注重细节刻画"改为"注重心理细节的层次刻画"]
[调用 Flowlock start]
[开始按优化后的提示词创作]
```

### 场景5: AI批量修正提示词
```
AI: 我注意到提示词中有些用词不够准确，让我批量修正
[调用 Flowlock replace，批量替换多个词汇]
[输入框内容被精确替换]
[调用 Flowlock start]
```

### 场景6: AI清理无关内容
```
AI: 输入框中有一些测试文字，我先清理一下
[调用 Flowlock remove，移除特定文本]
或
[调用 Flowlock clear，完全清空]
[然后重新设置合适的提示词]
```

## 配合使用建议

### 与WaitingForUrReply插件配合
- AI可以在心流锁模式下等待特定触发条件
- 实现"条件式自动创作"

### 与Canvasmodules配合
- 心流锁持续输出到Canvas画布
- 实现长文本的流式创作和实时预览

## 技术细节

### 参数别名支持
插件支持多种参数命名风格：
- `agentId` / `agentid` / `agent_id`
- `topicId` / `topicid` / `topic_id`
- `promptSource` / `prompt_source` / `promptsource`

### 错误处理
- 缺少必需参数时返回明确的错误信息
- 未知命令会被拦截并报错
- 所有错误通过stderr返回，退出码为1

### IPC通道
- `flowlock-command`: 从main进程到renderer进程的命令通道
- `flowlock-response`: 从renderer进程返回到main进程的响应通道（用于get命令）
- 使用`onFlowlockCommand`监听器接收命令
- 使用`sendFlowlockResponse`发送响应数据

## 开发者信息

- **作者**: Kilo Code
- **许可**: MIT
- **入口点**: `node flowlock.js`
- **通信协议**: stdio（标准输入输出）

## 版本历史

### v2.3.0 (Current)
- 新增 **status** 命令：获取心流锁当前状态
- 支持查询心流锁是否激活、是否正在处理、关联的Agent和话题
- 完善AI对心流锁状态的感知能力

### v2.2.0
- 新增 **get** 命令：获取输入框当前内容
- 支持异步返回数据给AI
- 完善IPC双向通信机制

### v2.1.0
- 新增4个提示词管理命令
- **clear**: 清空输入框所有内容
- **remove**: 移除指定文本（所有匹配项）
- **replace**: 批量替换多个文本模式
- **edit**: 精确编辑指定文本（diff风格，仅首个匹配）
- 支持参数别名（camelCase/snake_case）
- 增强错误提示和参数验证

### v2.0.0
- 重写为Node.js版本
- 完全集成到VCPChat本体功能
- 支持4个基础命令：start, stop, promptee, prompter
- AI调用效果与人类用户操作完全一致

### v1.0.0 (Deprecated)
- Python版本，已弃用