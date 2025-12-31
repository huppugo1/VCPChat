# 工作流编辑器架构简化方案

## 当前问题分析

### 1. 多重状态存储
- **StateManager**: `this.state.connections` (主状态)
- **ConnectionManager**: `this.connections` (重复存储)
- **CanvasManager**: `this.connections` (视图层存储)
- **jsPlumb**: 连接对象参数存储

### 2. 复杂的同步逻辑
- `ConnectionManager.syncConnectionStates()` - 多向同步
- `UIManager.syncConnectionsBeforeSave()` - 保存前同步
- 重复的事件监听和处理

### 3. 数据流混乱
```
用户操作 → jsPlumb事件 → CanvasManager → StateManager
                    ↓
              ConnectionManager监听 → 内部存储 → 同步冲突
```

## 简化方案：单一数据源架构

### 核心原则
1. **StateManager 作为唯一权威数据源**
2. **移除 ConnectionManager 的状态存储功能**
3. **CanvasManager 只负责视图渲染**
4. **ExecutionEngine 直接从 StateManager 获取数据**

### 新架构流程
```
用户操作 → jsPlumb事件 → CanvasManager.handleConnectionCreated()
                              ↓
                         StateManager.addConnection() (唯一存储)
                              ↓
                    ExecutionEngine.getAllConnections() (直接读取)
```

## 实施步骤

### 第一步：修改 ExecutionEngine
- 移除对 ConnectionManager 的依赖
- 直接从 StateManager 获取连接数据

### 第二步：简化 CanvasManager
- 移除内部连接存储
- 简化连接创建逻辑
- 只保留视图层操作

### 第三步：重构 ConnectionManager
- 移除内部状态存储
- 转换为纯工具类
- 提供连接验证和提取方法

### 第四步：简化 UIManager
- 移除复杂的同步逻辑
- 直接使用 StateManager 进行保存

## 预期效果

### 1. 代码简化
- 减少 50% 的连接管理代码
- 消除状态同步问题
- 提高代码可维护性

### 2. 性能提升
- 减少重复的数据存储
- 消除同步开销
- 提高执行效率

### 3. 稳定性提升
- 单一数据源，避免数据不一致
- 简化的事件流，减少竞态条件
- 更容易调试和排错

## 兼容性考虑

### 向后兼容
- 保持现有 API 接口不变
- 内部实现逐步迁移
- 渐进式重构，降低风险

### 测试策略
- 单元测试覆盖核心逻辑
- 集成测试验证数据流
- 回归测试确保功能完整性