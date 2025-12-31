// WorkflowEditor Configuration Module
(function() {
    'use strict';

    class WorkflowEditor_Config {
        constructor() {
            if (WorkflowEditor_Config.instance) {
                return WorkflowEditor_Config.instance;
            }
            
            this.stateManager = null;
            this.pluginManager = null;
            this.executionEngine = null;
            this.pluginDialog = null;
            this.uiManager = null;
            this.canvasManager = null;
            this.nodeManager = null;
            
            WorkflowEditor_Config.instance = this;
        }

        static getInstance() {
            if (!WorkflowEditor_Config.instance) {
                WorkflowEditor_Config.instance = new WorkflowEditor_Config();
            }
            return WorkflowEditor_Config.instance;
        }

        // 初始化工作流编辑器
        async init() {
            try {
                // 初始化状态管理器
                this.stateManager = window.WorkflowEditor_StateManager;
                
                // 初始化插件管理器
                this.pluginManager = window.WorkflowEditor_PluginManager;
                await this.pluginManager.init(this.stateManager);
                
                // 初始化执行引擎
                this.executionEngine = window.WorkflowEditor_ExecutionEngine;
                this.executionEngine.init(this.stateManager, this.pluginManager);
                
                // 初始化插件对话框
                this.pluginDialog = window.WorkflowEditor_PluginDialog;
                this.pluginDialog.init(this.stateManager, this.pluginManager);
                
                // 初始化UI管理器
                this.uiManager = window.WorkflowEditor_UIManager;
                this.uiManager.init(this.stateManager);
                
                // 初始化画布管理器
                this.canvasManager = window.WorkflowEditor_CanvasManager;
                this.canvasManager.init(this.stateManager);
                
                // 初始化节点管理器
                this.nodeManager = window.WorkflowEditor_NodeManager;
                this.nodeManager.init(this.stateManager);
                
                //console.log('[WorkflowEditor_Config] All modules initialized successfully');
                return true;
            } catch (error) {
                console.error('[WorkflowEditor_Config] Initialization failed:', error);
                return false;
            }
        }

        // 显示工作流编辑器
        show() {
            if (this.uiManager) {
                this.uiManager.show();
            }
        }

        // 隐藏工作流编辑器
        hide() {
            if (this.uiManager) {
                this.uiManager.hide();
            }
        }

        // 创建新工作流
        newWorkflow(name = '未命名工作流') {
            if (this.stateManager) {
                this.stateManager.reset();
                this.stateManager.setWorkflowName(name);
            }
        }

        // 加载工作流
        async loadWorkflow(workflowData) {
            if (this.stateManager) {
                return this.stateManager.deserialize(workflowData);
            }
            return false;
        }

        // 保存工作流
        saveWorkflow() {
            if (this.stateManager) {
                return this.stateManager.serialize();
            }
            return null;
        }

        // 执行工作流
        async executeWorkflow() {
            if (!this.stateManager || !this.nodeManager) {
                throw new Error('Workflow editor not initialized');
            }

            // 验证工作流
            const validation = this.stateManager.validateWorkflow();
            if (!validation.valid) {
                throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
            }

            // 获取执行顺序
            const executionOrder = this.stateManager.getExecutionOrder();
            if (!executionOrder) {
                throw new Error('Cannot determine execution order (circular dependency detected)');
            }

            // 设置执行状态
            this.stateManager.setExecutionState(true);

            try {
                const results = new Map();
                
                // 按顺序执行节点
                for (const nodeId of executionOrder) {
                    const node = this.stateManager.getNode(nodeId);
                    if (!node) continue;

                    // 准备输入数据
                    const inputData = this.prepareNodeInputData(nodeId, results);
                    
                    // 执行节点
                    const result = await this.nodeManager.executeNode(nodeId, inputData);
                    results.set(nodeId, result);
                }

                return results;
            } finally {
                this.stateManager.setExecutionState(false);
            }
        }

        // 准备节点输入数据
        prepareNodeInputData(nodeId, previousResults) {
            const inputData = {};
            
            // 获取连接到此节点的所有连接
            const incomingConnections = this.stateManager.getAllConnections()
                .filter(conn => conn.targetNodeId === nodeId);

            // 从前置节点获取数据
            incomingConnections.forEach(connection => {
                const sourceResult = previousResults.get(connection.sourceNodeId);
                if (sourceResult && sourceResult[connection.sourcePort]) {
                    inputData[connection.targetPort] = sourceResult[connection.sourcePort];
                }
            });

            return inputData;
        }

        // 获取工作流统计信息
        getWorkflowStats() {
            if (this.stateManager) {
                return this.stateManager.getStats();
            }
            return null;
        }

        // 验证工作流
        validateWorkflow() {
            if (this.stateManager) {
                return this.stateManager.validateWorkflow();
            }
            return { valid: false, errors: ['Workflow editor not initialized'] };
        }

        // 导出工作流为JSON
        exportWorkflowAsJSON() {
            const workflow = this.saveWorkflow();
            if (workflow) {
                const blob = new Blob([JSON.stringify(workflow, null, 2)], { 
                    type: 'application/json' 
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${workflow.name}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        }

        // 从JSON导入工作流
        async importWorkflowFromJSON(jsonString) {
            try {
                const workflowData = JSON.parse(jsonString);
                return await this.loadWorkflow(workflowData);
            } catch (error) {
                throw new Error(`Failed to import workflow: ${error.message}`);
            }
        }

        // 获取可用插件列表
        getAvailablePlugins() {
            if (this.pluginManager) {
                return this.pluginManager.getAllPlugins();
            }
            return [];
        }

        // 按分类获取插件
        getPluginsByCategory(category) {
            if (this.pluginManager) {
                return this.pluginManager.getPluginsByCategory(category);
            }
            return [];
        }

        // 搜索插件
        searchPlugins(query) {
            if (this.pluginManager) {
                return this.pluginManager.searchPlugins(query);
            }
            return [];
        }

        // 添加自定义插件
        async addCustomPlugin(pluginData) {
            if (this.pluginManager) {
                return await this.pluginManager.addCustomPlugin(pluginData);
            }
            return null;
        }

        // 删除自定义插件
        removeCustomPlugin(pluginKey) {
            if (this.pluginManager) {
                return this.pluginManager.removeCustomPlugin(pluginKey);
            }
            return false;
        }

        // 刷新插件列表
        async refreshPlugins() {
            if (this.pluginManager) {
                await this.pluginManager.refreshPlugins();
            }
        }

        // 获取插件信息
        getPluginInfo(pluginKey) {
            if (this.pluginManager) {
                return this.pluginManager.getPluginInfo(pluginKey);
            }
            return null;
        }

        // 导出插件配置
        exportPluginConfig() {
            if (this.pluginManager) {
                return this.pluginManager.exportPluginConfig();
            }
            return null;
        }

        // 导入插件配置
        async importPluginConfig(configData) {
            if (this.pluginManager) {
                return await this.pluginManager.importPluginConfig(configData);
            }
            return [];
        }

        // 获取插件统计信息
        getPluginStats() {
            if (this.pluginManager) {
                return this.pluginManager.getStats();
            }
            return null;
        }

        // 添加节点
        addNode(nodeData) {
            if (this.stateManager) {
                return this.stateManager.addNode(nodeData);
            }
            return null;
        }

        // 删除节点
        removeNode(nodeId) {
            if (this.stateManager) {
                return this.stateManager.removeNode(nodeId);
            }
            return false;
        }

        // 添加连接
        addConnection(sourceNodeId, sourcePort, targetNodeId, targetPort) {
            if (this.stateManager) {
                return this.stateManager.addConnection(sourceNodeId, sourcePort, targetNodeId, targetPort);
            }
            return null;
        }

        // 删除连接
        removeConnection(connectionId) {
            if (this.stateManager) {
                return this.stateManager.removeConnection(connectionId);
            }
            return false;
        }

        // 获取节点配置模板
        getNodeConfigTemplate(nodeType) {
            if (this.nodeManager) {
                return this.nodeManager.getNodeConfigTemplate(nodeType);
            }
            return {};
        }

        // 验证节点配置
        validateNodeConfig(nodeType, config) {
            if (this.nodeManager) {
                return this.nodeManager.validateNodeConfig(nodeType, config);
            }
            return { valid: false, errors: ['Node manager not initialized'] };
        }

        // 设置画布缩放
        setCanvasZoom(zoom) {
            if (this.stateManager) {
                this.stateManager.setCanvasZoom(zoom);
            }
        }

        // 设置画布偏移
        setCanvasOffset(offset) {
            if (this.stateManager) {
                this.stateManager.setCanvasOffset(offset);
            }
        }

        // 适应画布大小
        fitCanvas() {
            if (this.canvasManager) {
                this.canvasManager.zoomFit();
            }
        }

        // 清空选择
        clearSelection() {
            if (this.stateManager) {
                this.stateManager.clearSelection();
            }
        }

        // 全选节点
        selectAllNodes() {
            if (this.canvasManager) {
                this.canvasManager.selectAll();
            }
        }

        // 删除选中的元素
        deleteSelected() {
            if (this.canvasManager) {
                this.canvasManager.deleteSelected();
            }
        }

        // 显示Toast消息
        showToast(message, type = 'info') {
            if (this.uiManager) {
                this.uiManager.showToast(message, type);
            }
        }

        // 获取当前状态
        getState() {
            if (this.stateManager) {
                return {
                    isVisible: this.stateManager.get('isVisible'),
                    isExecuting: this.stateManager.get('isExecuting'),
                    workflowName: this.stateManager.get('workflowName'),
                    nodeCount: this.stateManager.get('nodes').size,
                    connectionCount: this.stateManager.get('connections').size
                };
            }
            return null;
        }

        // 销毁工作流编辑器
        destroy() {
            if (this.uiManager) {
                this.uiManager.hide();
            }
            
            // 清理状态
            if (this.stateManager) {
                this.stateManager.reset();
            }
            
            //console.log('[WorkflowEditor_Config] Destroyed');
        }
    }

    // 导出类和实例
    window.WorkflowEditor_Config = WorkflowEditor_Config;
    window.workflowEditor = WorkflowEditor_Config.getInstance();
})();