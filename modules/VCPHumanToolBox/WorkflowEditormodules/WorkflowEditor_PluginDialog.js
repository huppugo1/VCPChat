// WorkflowEditor Plugin Dialog Module
(function() {
    'use strict';

    class WorkflowEditor_PluginDialog {
        constructor() {
            if (WorkflowEditor_PluginDialog.instance) {
                return WorkflowEditor_PluginDialog.instance;
            }
            
            this.stateManager = null;
            this.pluginManager = null;
            this.dialogElement = null;
            this.isVisible = false;
            
            WorkflowEditor_PluginDialog.instance = this;
        }

        static getInstance() {
            if (!WorkflowEditor_PluginDialog.instance) {
                WorkflowEditor_PluginDialog.instance = new WorkflowEditor_PluginDialog();
            }
            return WorkflowEditor_PluginDialog.instance;
        }

        // 初始化插件对话框
        init(stateManager, pluginManager) {
            this.stateManager = stateManager;
            this.pluginManager = pluginManager;
            this.createDialog();
            //console.log('[WorkflowEditor_PluginDialog] Initialized');
        }

        // 创建对话框
        createDialog() {
            this.dialogElement = document.createElement('div');
            this.dialogElement.className = 'workflow-plugin-dialog';
            this.dialogElement.innerHTML = `
                <div class="plugin-dialog-overlay">
                    <div class="plugin-dialog-content">
                        <div class="plugin-dialog-header">
                            <h3>插件管理</h3>
                            <button class="plugin-dialog-close" onclick="window.WorkflowEditor_PluginDialog.hide()">×</button>
                        </div>
                        
                        <div class="plugin-dialog-tabs">
                            <button class="plugin-tab-btn active" data-tab="browse">浏览插件</button>
                            <button class="plugin-tab-btn" data-tab="add">添加插件</button>
                            <button class="plugin-tab-btn" data-tab="manage">管理插件</button>
                        </div>
                        
                        <div class="plugin-dialog-body">
                            <!-- 浏览插件标签页 -->
                            <div class="plugin-tab-content active" id="browse-tab">
                                <div class="plugin-search">
                                    <input type="text" id="plugin-search-input" placeholder="搜索插件..." />
                                    <button onclick="window.WorkflowEditor_PluginDialog.searchPlugins()">搜索</button>
                                </div>
                                
                                <div class="plugin-categories">
                                    <button class="category-btn active" data-category="all">全部</button>
                                    <button class="category-btn" data-category="vcpToolBox">VCPToolBox</button>
                                    <button class="category-btn" data-category="vcpChat">VCPChat</button>
                                    <button class="category-btn" data-category="custom">自定义</button>
                                </div>
                                
                                <div class="plugin-list" id="plugin-list">
                                    <!-- 插件列表将在这里动态生成 -->
                                </div>
                            </div>
                            
                            <!-- 添加插件标签页 -->
                            <div class="plugin-tab-content" id="add-tab">
                                <form class="add-plugin-form" id="add-plugin-form">
                                    <div class="form-group">
                                        <label for="plugin-id">插件ID *</label>
                                        <input type="text" id="plugin-id" required placeholder="例如: my-custom-plugin" />
                                    </div>
                                    
                                    <div class="form-group">
                                        <label for="plugin-name">插件名称 *</label>
                                        <input type="text" id="plugin-name" required placeholder="例如: 我的自定义插件" />
                                    </div>
                                    
                                    <div class="form-group">
                                        <label for="plugin-description">插件描述</label>
                                        <textarea id="plugin-description" placeholder="描述插件的功能..."></textarea>
                                    </div>
                                    
                                    <div class="form-group">
                                        <label for="plugin-category">插件分类</label>
                                        <select id="plugin-category">
                                            <option value="custom">自定义</option>
                                            <option value="vcpToolBox">VCPToolBox</option>
                                            <option value="vcpChat">VCPChat</option>
                                        </select>
                                    </div>
                                    
                                    <div class="form-group">
                                        <label for="plugin-type">插件类型</label>
                                        <select id="plugin-type">
                                            <option value="custom">自定义</option>
                                            <option value="vcpToolBox">VCPToolBox插件</option>
                                            <option value="vcpChat">VCPChat插件</option>
                                        </select>
                                    </div>
                                    
                                    <div class="form-group">
                                        <label>输入端口</label>
                                        <div class="port-config">
                                            <input type="text" id="plugin-inputs" placeholder="例如: input,data,trigger" />
                                            <small>用逗号分隔多个端口</small>
                                        </div>
                                    </div>
                                    
                                    <div class="form-group">
                                        <label>输出端口</label>
                                        <div class="port-config">
                                            <input type="text" id="plugin-outputs" placeholder="例如: output,result,error" />
                                            <small>用逗号分隔多个端口</small>
                                        </div>
                                    </div>
                                    
                                    <div class="form-group">
                                        <label for="plugin-icon">图标</label>
                                        <select id="plugin-icon">
                                            <option value="extension">扩展</option>
                                            <option value="plugin">插件</option>
                                            <option value="tool">工具</option>
                                            <option value="code">代码</option>
                                            <option value="data">数据</option>
                                            <option value="transform">转换</option>
                                        </select>
                                    </div>
                                    
                                    <div class="form-group">
                                        <label for="plugin-tags">标签</label>
                                        <input type="text" id="plugin-tags" placeholder="例如: 工具,数据处理,自定义" />
                                        <small>用逗号分隔多个标签</small>
                                    </div>
                                    
                                    <div class="form-actions">
                                        <button type="button" onclick="window.WorkflowEditor_PluginDialog.addCustomPlugin()">添加插件</button>
                                        <button type="button" onclick="window.WorkflowEditor_PluginDialog.resetForm()">重置</button>
                                    </div>
                                </form>
                            </div>
                            
                            <!-- 管理插件标签页 -->
                            <div class="plugin-tab-content" id="manage-tab">
                                <div class="manage-actions">
                                    <button onclick="window.WorkflowEditor_PluginDialog.refreshPlugins()">刷新插件列表</button>
                                    <button onclick="window.WorkflowEditor_PluginDialog.exportPluginConfig()">导出插件配置</button>
                                    <input type="file" id="import-plugin-file" accept=".json" style="display: none;" onchange="window.WorkflowEditor_PluginDialog.importPluginConfig(event)" />
                                    <button onclick="document.getElementById('import-plugin-file').click()">导入插件配置</button>
                                </div>
                                
                                <div class="plugin-stats" id="plugin-stats">
                                    <!-- 插件统计信息将在这里显示 -->
                                </div>
                                
                                <div class="custom-plugin-list" id="custom-plugin-list">
                                    <!-- 自定义插件列表将在这里显示 -->
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(this.dialogElement);
            this.bindEvents();
        }

        // 绑定事件
        bindEvents() {
            // 标签页切换
            const tabBtns = this.dialogElement.querySelectorAll('.plugin-tab-btn');
            tabBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const tabName = e.target.dataset.tab;
                    this.switchTab(tabName);
                });
            });

            // 分类按钮
            const categoryBtns = this.dialogElement.querySelectorAll('.category-btn');
            categoryBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const category = e.target.dataset.category;
                    this.filterByCategory(category);
                    
                    // 更新按钮状态
                    categoryBtns.forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                });
            });

            // 搜索输入框回车事件
            const searchInput = this.dialogElement.querySelector('#plugin-search-input');
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchPlugins();
                }
            });

            // 点击遮罩关闭对话框
            const overlay = this.dialogElement.querySelector('.plugin-dialog-overlay');
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.hide();
                }
            });
        }

        // 显示对话框
        show() {
            if (!this.dialogElement) {
                this.createDialog();
            }
            
            this.dialogElement.style.display = 'block';
            this.isVisible = true;
            
            // 刷新插件列表
            this.refreshPluginList();
            this.updatePluginStats();
        }

        // 隐藏对话框
        hide() {
            if (this.dialogElement) {
                this.dialogElement.style.display = 'none';
            }
            this.isVisible = false;
        }

        // 切换标签页
        switchTab(tabName) {
            // 更新标签按钮状态
            const tabBtns = this.dialogElement.querySelectorAll('.plugin-tab-btn');
            tabBtns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === tabName);
            });

            // 更新标签内容显示
            const tabContents = this.dialogElement.querySelectorAll('.plugin-tab-content');
            tabContents.forEach(content => {
                content.classList.toggle('active', content.id === `${tabName}-tab`);
            });

            // 根据标签页刷新内容
            if (tabName === 'browse') {
                this.refreshPluginList();
            } else if (tabName === 'manage') {
                this.updatePluginStats();
                this.refreshCustomPluginList();
            }
        }

        // 刷新插件列表
        refreshPluginList() {
            const pluginList = this.dialogElement.querySelector('#plugin-list');
            if (!pluginList || !this.pluginManager) return;

            const plugins = this.pluginManager.getAllPlugins();
            
            pluginList.innerHTML = '';
            
            plugins.forEach(plugin => {
                const pluginItem = document.createElement('div');
                pluginItem.className = 'plugin-item';
                pluginItem.innerHTML = `
                    <div class="plugin-icon">
                        <i class="icon-${plugin.icon || 'plugin'}"></i>
                    </div>
                    <div class="plugin-info">
                        <h4>${plugin.name}</h4>
                        <p>${plugin.description || '暂无描述'}</p>
                        <div class="plugin-meta">
                            <span class="plugin-category">${plugin.category}</span>
                            <span class="plugin-version">v${plugin.version}</span>
                            ${plugin.isCustom ? '<span class="plugin-custom">自定义</span>' : ''}
                        </div>
                        <div class="plugin-tags">
                            ${plugin.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                        </div>
                    </div>
                    <div class="plugin-actions">
                        <button onclick="window.WorkflowEditor_PluginDialog.addPluginToCanvas('${plugin.category}_${plugin.id}')">添加到画布</button>
                        ${plugin.isCustom ? `<button onclick="window.WorkflowEditor_PluginDialog.removeCustomPlugin('${plugin.category}_${plugin.id}')" class="danger">删除</button>` : ''}
                    </div>
                `;
                pluginList.appendChild(pluginItem);
            });
        }

        // 按分类过滤
        filterByCategory(category) {
            const pluginItems = this.dialogElement.querySelectorAll('.plugin-item');
            
            pluginItems.forEach(item => {
                const categorySpan = item.querySelector('.plugin-category');
                if (category === 'all' || categorySpan.textContent === category) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
        }

        // 搜索插件
        searchPlugins() {
            const searchInput = this.dialogElement.querySelector('#plugin-search-input');
            const query = searchInput.value.trim();
            
            if (!query) {
                this.refreshPluginList();
                return;
            }
            
            const results = this.pluginManager.searchPlugins(query);
            const pluginList = this.dialogElement.querySelector('#plugin-list');
            
            pluginList.innerHTML = '';
            
            results.forEach(plugin => {
                const pluginItem = document.createElement('div');
                pluginItem.className = 'plugin-item';
                pluginItem.innerHTML = `
                    <div class="plugin-icon">
                        <i class="icon-${plugin.icon || 'plugin'}"></i>
                    </div>
                    <div class="plugin-info">
                        <h4>${plugin.name}</h4>
                        <p>${plugin.description || '暂无描述'}</p>
                        <div class="plugin-meta">
                            <span class="plugin-category">${plugin.category}</span>
                            <span class="plugin-version">v${plugin.version}</span>
                            ${plugin.isCustom ? '<span class="plugin-custom">自定义</span>' : ''}
                        </div>
                    </div>
                    <div class="plugin-actions">
                        <button onclick="window.WorkflowEditor_PluginDialog.addPluginToCanvas('${plugin.category}_${plugin.id}')">添加到画布</button>
                        ${plugin.isCustom ? `<button onclick="window.WorkflowEditor_PluginDialog.removeCustomPlugin('${plugin.category}_${plugin.id}')" class="danger">删除</button>` : ''}
                    </div>
                `;
                pluginList.appendChild(pluginItem);
            });
        }

        // 添加自定义插件
        async addCustomPlugin() {
            try {
                const form = this.dialogElement.querySelector('#add-plugin-form');
                const formData = new FormData(form);
                
                const pluginData = {
                    id: this.dialogElement.querySelector('#plugin-id').value.trim(),
                    name: this.dialogElement.querySelector('#plugin-name').value.trim(),
                    description: this.dialogElement.querySelector('#plugin-description').value.trim(),
                    category: this.dialogElement.querySelector('#plugin-category').value,
                    type: this.dialogElement.querySelector('#plugin-type').value,
                    inputs: this.dialogElement.querySelector('#plugin-inputs').value.split(',').map(s => s.trim()).filter(s => s),
                    outputs: this.dialogElement.querySelector('#plugin-outputs').value.split(',').map(s => s.trim()).filter(s => s),
                    icon: this.dialogElement.querySelector('#plugin-icon').value,
                    tags: this.dialogElement.querySelector('#plugin-tags').value.split(',').map(s => s.trim()).filter(s => s),
                    version: '1.0.0',
                    author: 'User'
                };
                
                // 验证必填字段
                if (!pluginData.id || !pluginData.name) {
                    console.error('请填写插件ID和名称'); // 调试信息
                    return;
                }
                
                // 设置默认值
                if (pluginData.inputs.length === 0) {
                    pluginData.inputs = ['input'];
                }
                if (pluginData.outputs.length === 0) {
                    pluginData.outputs = ['output'];
                }
                
                // 添加插件
                const pluginKey = await this.pluginManager.addCustomPlugin(pluginData);
                
                //console.log('插件添加成功！'); // 调试信息
                this.resetForm();
                this.refreshPluginList();
                this.updatePluginStats();
                
                // 刷新左侧插件面板
                if (window.WorkflowEditor_UIManager) {
                    await window.WorkflowEditor_UIManager.refreshPluginPanel();
                }
                
                // 触发插件管理器刷新事件
                if (typeof document !== 'undefined') {
                    const event = new CustomEvent('pluginManagerRefreshed', {
                        detail: { pluginCount: this.pluginManager.discoveredPlugins.size }
                    });
                    document.dispatchEvent(event);
                }
                
            } catch (error) {
                console.error(`添加插件失败: ${error.message}`); // 调试信息
            }
        }

        // 重置表单
        resetForm() {
            const form = this.dialogElement.querySelector('#add-plugin-form');
            form.reset();
        }

        // 添加插件到画布
        addPluginToCanvas(pluginKey) {
            const pluginInfo = this.pluginManager.getPluginInfo(pluginKey);
            if (!pluginInfo) {
                console.error('插件信息不存在'); // 调试信息
                return;
            }
            
            // 创建节点数据
            const nodeData = {
                type: pluginInfo.type,
                pluginId: pluginInfo.id,
                name: pluginInfo.name,
                x: 100 + Math.random() * 200,
                y: 100 + Math.random() * 200,
                config: {}
            };
            
            // 添加到画布
            if (window.workflowEditor) {
                const nodeId = window.workflowEditor.addNode(nodeData);
                if (nodeId) {
                    //console.log('插件已添加到画布'); // 调试信息
                    this.hide();
                } else {
                    console.error('添加插件到画布失败'); // 调试信息
                }
            }
        }

        // 删除自定义插件
        async removeCustomPlugin(pluginKey) {
            const confirmed = await window.customConfirm('确定要删除这个自定义插件吗？', '⚠️ 删除插件');
            if (confirmed) {
                const success = this.pluginManager.removeCustomPlugin(pluginKey);
                if (success) {
                    //console.log('插件删除成功'); // 调试信息
                    this.refreshPluginList();
                    this.refreshCustomPluginList();
                    this.updatePluginStats();
                } else {
                    console.error('删除插件失败'); // 调试信息
                }
            }
        }

        // 刷新插件
        async refreshPlugins() {
            try {
                await this.pluginManager.refreshPlugins();
                this.refreshPluginList();
                this.updatePluginStats();
                //console.log('插件列表已刷新'); // 调试信息
            } catch (error) {
                console.error(`刷新插件失败: ${error.message}`); // 调试信息
            }
        }

        // 导出插件配置
        exportPluginConfig() {
            try {
                const config = this.pluginManager.exportPluginConfig();
                if (!config || config.customPlugins.length === 0) {
                    console.error('没有自定义插件可导出'); // 调试信息
                    return;
                }
                
                const blob = new Blob([JSON.stringify(config, null, 2)], { 
                    type: 'application/json' 
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `workflow-plugins-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                //console.log('插件配置已导出'); // 调试信息
            } catch (error) {
                console.error(`导出插件配置失败: ${error.message}`); // 调试信息
            }
        }

        // 导入插件配置
        async importPluginConfig(event) {
            try {
                const file = event.target.files[0];
                if (!file) return;
                
                const text = await file.text();
                const config = JSON.parse(text);
                
                const imported = await this.pluginManager.importPluginConfig(config);
                
                //console.log(`成功导入 ${imported.length} 个插件`); // 调试信息
                this.refreshPluginList();
                this.updatePluginStats();
                
                // 重置文件输入
                event.target.value = '';
                
            } catch (error) {
                console.error(`导入插件配置失败: ${error.message}`); // 调试信息
            }
        }

        // 更新插件统计信息
        updatePluginStats() {
            const statsElement = this.dialogElement.querySelector('#plugin-stats');
            if (!statsElement || !this.pluginManager) return;
            
            const stats = this.pluginManager.getStats();
            
            statsElement.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-value">${stats.total}</div>
                        <div class="stat-label">总插件数</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.byCategory.vcpToolBox || 0}</div>
                        <div class="stat-label">VCPToolBox插件</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.byCategory.vcpChat || 0}</div>
                        <div class="stat-label">VCPChat插件</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.custom}</div>
                        <div class="stat-label">自定义插件</div>
                    </div>
                </div>
            `;
        }

        // 刷新自定义插件列表
        refreshCustomPluginList() {
            const listElement = this.dialogElement.querySelector('#custom-plugin-list');
            if (!listElement || !this.pluginManager) return;
            
            const customPlugins = this.pluginManager.getAllPlugins().filter(p => p.isCustom);
            
            if (customPlugins.length === 0) {
                listElement.innerHTML = '<p class="no-plugins">暂无自定义插件</p>';
                return;
            }
            
            listElement.innerHTML = customPlugins.map(plugin => `
                <div class="custom-plugin-item">
                    <div class="plugin-info">
                        <h4>${plugin.name}</h4>
                        <p>${plugin.description || '暂无描述'}</p>
                        <div class="plugin-meta">
                            <span>ID: ${plugin.id}</span>
                            <span>分类: ${plugin.category}</span>
                        </div>
                    </div>
                    <div class="plugin-actions">
                        <button onclick="window.WorkflowEditor_PluginDialog.removeCustomPlugin('${plugin.category}_${plugin.id}')" class="danger">删除</button>
                    </div>
                </div>
            `).join('');
        }
    }

    // 导出为全局单例
    window.WorkflowEditor_PluginDialog = WorkflowEditor_PluginDialog.getInstance();
})();