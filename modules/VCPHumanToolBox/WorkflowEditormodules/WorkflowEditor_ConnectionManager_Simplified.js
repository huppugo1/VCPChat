/**
 * 简化版连接管理器
 * 
 * 设计原则：
 * 1. StateManager 作为唯一数据源
 * 2. ConnectionManager 只提供工具方法，不存储状态
 * 3. 简化事件流，避免重复监听
 */

class WorkflowEditor_ConnectionManager_Simplified {
    constructor() {
        this.stateManager = null;
        this.canvasManager = null;
        this.isInitialized = false;
        
        //console.log('[ConnectionManager] 简化版连接管理器初始化');
    }

    // 初始化
    initialize(stateManager, canvasManager) {
        this.stateManager = stateManager;
        this.canvasManager = canvasManager;
        this.isInitialized = true;
        
        //console.log('[ConnectionManager] 简化版初始化完成');
        //console.log('[ConnectionManager] StateManager:', !!this.stateManager);
        //console.log('[ConnectionManager] CanvasManager:', !!this.canvasManager);
    }

    // 获取所有连接 - 直接从 StateManager 获取
    getAllConnections() {
        if (!this.stateManager) {
            console.warn('[ConnectionManager] StateManager 不可用');
            return [];
        }
        
        const connections = this.stateManager.getAllConnections();
        //console.log(`[ConnectionManager] 从 StateManager 获取连接数: ${connections.length}`);
        return connections;
    }

    // 添加连接 - 直接委托给 StateManager
    addConnection(connectionData, skipRender = false, recordHistory = true) {
        if (!this.stateManager) {
            console.error('[ConnectionManager] StateManager 不可用，无法添加连接');
            return null;
        }
        
        //console.log('[ConnectionManager] 添加连接 (委托给 StateManager):', connectionData);
        return this.stateManager.addConnection(connectionData, skipRender, recordHistory);
    }

    // 移除连接 - 直接委托给 StateManager  
    removeConnection(connectionId, recordHistory = true) {
        if (!this.stateManager) {
            console.error('[ConnectionManager] StateManager 不可用，无法移除连接');
            return false;
        }
        
        //console.log('[ConnectionManager] 移除连接 (委托给 StateManager):', connectionId);
        return this.stateManager.removeConnection(connectionId, recordHistory);
    }

    // 获取连接
    getConnection(connectionId) {
        if (!this.stateManager) {
            return null;
        }
        
        return this.stateManager.getConnection(connectionId);
    }

    // 清空所有连接 - 直接委托给 StateManager
    clearAllConnections() {
        if (!this.stateManager) {
            console.warn('[ConnectionManager] StateManager 不可用，无法清空连接');
            return;
        }
        
        //console.log('[ConnectionManager] 清空所有连接 (委托给 StateManager)');
        const connections = this.stateManager.getAllConnections();
        connections.forEach(conn => {
            this.stateManager.removeConnection(conn.id, false); // 不记录历史
        });
    }

    // 验证连接
    validateConnection(connectionData) {
        if (!connectionData) {
            console.error('[ConnectionManager] 连接数据为空');
            return false;
        }

        if (!connectionData.sourceNodeId || !connectionData.targetNodeId) {
            console.error('[ConnectionManager] 缺少源节点或目标节点ID');
            return false;
        }

        if (!this.stateManager) {
            console.error('[ConnectionManager] StateManager 不可用，无法验证节点存在性');
            return false;
        }

        // 验证节点是否存在
        const sourceNode = this.stateManager.getNode(connectionData.sourceNodeId);
        const targetNode = this.stateManager.getNode(connectionData.targetNodeId);

        if (!sourceNode) {
            console.error('[ConnectionManager] 源节点不存在:', connectionData.sourceNodeId);
            return false;
        }

        if (!targetNode) {
            console.error('[ConnectionManager] 目标节点不存在:', connectionData.targetNodeId);
            return false;
        }

        return true;
    }

    // 检查连接是否已存在
    hasConnection(connectionData) {
        if (!this.stateManager) {
            return false;
        }

        const existingConnections = this.stateManager.getAllConnections();
        return existingConnections.some(conn => 
            conn.sourceNodeId === connectionData.sourceNodeId &&
            conn.targetNodeId === connectionData.targetNodeId &&
            conn.targetParam === connectionData.targetParam
        );
    }

    // 工具方法：从 jsPlumb 连接信息提取数据
    extractConnectionDataFromJsPlumb(info) {
        try {
            const sourceElement = info.source;
            const targetElement = info.target;
            const connection = info.connection;
            
            const sourceNodeId = this.getNodeIdFromElement(sourceElement);
            const targetNodeId = this.getNodeIdFromElement(targetElement);
            
            if (!sourceNodeId || !targetNodeId) {
                console.error('[ConnectionManager] 无法提取节点ID');
                return null;
            }

            // 获取参数名称
            let targetParam = 'input';
            let sourceParam = 'output';
            
            // 从DOM元素获取参数名称
            if (targetElement.getAttribute && targetElement.getAttribute('data-param')) {
                targetParam = targetElement.getAttribute('data-param');
            }
            
            if (sourceElement.getAttribute && sourceElement.getAttribute('data-param')) {
                sourceParam = sourceElement.getAttribute('data-param');
            }

            // 生成或使用现有连接ID
            let connectionId = connection.connectionId || connection.getParameter('connectionId');
            if (!connectionId) {
                connectionId = `${sourceNodeId}_${targetNodeId}_${Date.now()}`;
            }

            return {
                id: connectionId,
                sourceNodeId,
                targetNodeId,
                sourceParam,
                targetParam,
                sourcePort: sourceParam,
                targetPort: targetParam,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('[ConnectionManager] 提取连线数据失败:', error);
            return null;
        }
    }

    // 工具方法：从元素获取节点ID
    getNodeIdFromElement(element) {
        let current = element;
        while (current && current !== document.body) {
            if (current.hasAttribute && current.hasAttribute('data-node-id')) {
                return current.getAttribute('data-node-id');
            }
            current = current.parentElement;
        }
        return null;
    }

    // 调试方法：输出状态信息
    debugConnectionState() {
        if (!this.stateManager) {
            //console.log('[ConnectionManager] StateManager 不可用');
            return;
        }

        const connections = this.stateManager.getAllConnections();
        //console.log('[ConnectionManager] 当前连接状态:');
        //console.log(`- 连接总数: ${connections.length}`);
        connections.forEach((conn, index) => {
            //console.log(`- 连接 ${index + 1}: ${conn.sourceNodeId} → ${conn.targetNodeId} (${conn.targetParam})`);
        });
    }
}

// 全局导出
if (typeof window !== 'undefined') {
    window.WorkflowEditor_ConnectionManager_Simplified = WorkflowEditor_ConnectionManager_Simplified;
}