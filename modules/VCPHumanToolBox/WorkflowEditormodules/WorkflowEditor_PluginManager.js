// WorkflowEditor Plugin Manager Module
(function() {
    'use strict';

    class WorkflowEditor_PluginManager {
        constructor() {
            if (WorkflowEditor_PluginManager.instance) {
                return WorkflowEditor_PluginManager.instance;
            }
            
            this.stateManager = null;
            this.discoveredPlugins = new Map();
            this.pluginCategories = new Map();
            
            WorkflowEditor_PluginManager.instance = this;
        }

        static getInstance() {
            if (!WorkflowEditor_PluginManager.instance) {
                WorkflowEditor_PluginManager.instance = new WorkflowEditor_PluginManager();
            }
            return WorkflowEditor_PluginManager.instance;
        }

        // 初始化插件管理器
        async init(stateManager) {
            this.stateManager = stateManager;
            
            // 初始化API配置对话框
            if (window.WorkflowEditor_ApiConfigDialog) {
                window.WorkflowEditor_ApiConfigDialog.init(this);
            }
            
            // 添加自定义的“内容输入器”辅助节点
            await this.addCustomPlugin({
                id: 'contentInput',
                name: '内容输入器',
                description: '用于输入任意文本内容（字符串、URL、JSON等）作为工作流的起始数据。',
                category: 'auxiliary',
                inputs: [], // 作为输入端节点，没有输入
                outputs: ['output'], // 有一个输出，用于传递输入的内容
                icon: '📝', // 使用笔记图标
                configSchema: {
                    content: {
                        type: 'string',
                        default: '',
                        required: false,
                        description: '要输入的文本内容',
                        ui: {
                            component: 'textarea', // 使用多行文本框
                            rows: 5
                        }
                    }
                },
                isCustom: true // 标记为自定义插件
            });

            await this.discoverPlugins();
            //console.log('[WorkflowEditor_PluginManager] Initialized');
        }

        // 发现所有可用插件
        async discoverPlugins() {
            try {
                // 检查API配置
                if (!this.isApiConfigured()) {
                    console.warn('[PluginManager] API not configured, no plugins loaded');
                    this.showConfigurationPrompt();
                    return;
                }

                // 从远程API获取插件
                await this.fetchRemotePlugins();
                
                // 更新状态管理器中的可用插件
                this.updateAvailablePlugins();
                
                //console.log('[PluginManager] Discovered plugins:', this.discoveredPlugins);
            } catch (error) {
                console.error('[PluginManager] Plugin discovery failed:', error);
                this.handleDiscoveryError(error);
            }
        }

        // 从远程API获取插件
        async fetchRemotePlugins() {
            try {
                const apiConfig = this.getApiConfig();
                if (!apiConfig.host || !apiConfig.port) {
                    console.warn('[PluginManager] API configuration not set, skipping remote plugin fetch');
                    return;
                }

                const apiUrl = `http://${apiConfig.host}:${apiConfig.port}/admin_api/plugins`;
                //console.log('[PluginManager] Fetching plugins from:', apiUrl);

                const response = await this.apiFetch(apiUrl, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(apiConfig.username && apiConfig.password ? {
                            'Authorization': 'Basic ' + btoa(`${apiConfig.username}:${apiConfig.password}`)
                        } : {})
                    }
                });

                if (response && Array.isArray(response)) {
                    response.forEach(plugin => {
                        const pluginInfo = this.adaptApiPluginData(plugin);
                        const pluginKey = `${pluginInfo.category}_${pluginInfo.id}`;
                        this.discoveredPlugins.set(pluginKey, pluginInfo);
                        this.addToCategory(pluginInfo.category, pluginInfo);
                    });
                    //console.log(`[PluginManager] Successfully loaded ${response.length} remote plugins`);
                } else {
                    console.warn('[PluginManager] Invalid response format from API');
                }

            } catch (error) {
                console.error('[PluginManager] Failed to fetch remote plugins:', error);
                throw error;
            }
        }

        // 适配API插件数据格式
        adaptApiPluginData(apiPlugin) {
            const manifest = apiPlugin.manifest || {};
            
            // 根据isDistributed属性决定插件分类
            // isDistributed为true的是VCPChat插件（带云端标识）
            // isDistributed为false或undefined的是VCPToolBox插件（不带云端标识）
            const isDistributed = apiPlugin.isDistributed || false;
            const category = isDistributed ? 'vcpChat' : 'vcpToolBox';
            
			// 解析指令（从capabilities.invocationCommands的description/example中提取）
			const commands = this.parseInvocationCommands(manifest);
			
			return {
                id: manifest.id || manifest.name || 'unknown',
                name: manifest.displayName || manifest.name || 'Unknown Plugin',
                description: manifest.description || '',
                version: manifest.version || '1.0.0',
                author: manifest.author || '',
                category: category,
                type: category,
                enabled: apiPlugin.enabled !== false,
                isDistributed: isDistributed,
                serverId: apiPlugin.serverId || null,
                inputs: manifest.inputs || ['trigger'],
                outputs: manifest.outputs || ['result', 'error'],
                configSchema: {}, // 不显示插件配置项
                icon: manifest.icon || (isDistributed ? 'cloud' : 'plugin'),
                tags: manifest.tags || [category],
				manifest: manifest,
				commands: commands
            };
        }

		// 解析 capabilities.invocationCommands -> 指令与参数
		parseInvocationCommands(manifest) {
			try {
				const caps = manifest.capabilities || {};
				const list = Array.isArray(caps.invocationCommands) ? caps.invocationCommands : [];
				const results = [];
				
				list.forEach((cmd) => {
					//console.log('[PluginManager] 解析指令:', cmd);
					
					// 优先使用 command 字段，然后是 commandIdentifier，最后是其他字段
					const commandId = cmd.command || cmd.commandIdentifier || cmd.id || cmd.name || 'default';
					const description = cmd.description || '';
					const example = cmd.example || '';
					const text = [description, example].join('\n');
					
					//console.log('[PluginManager] 指令ID:', commandId);
					//console.log('[PluginManager] 描述文本:', description);
					
					// 提取 TOOL_REQUEST 块内容
					const blockMatch = text.match(/<<<\[TOOL_REQUEST\]>>>([\s\S]*?)<<<\[END_TOOL_REQUEST\]>>>/);
					const block = blockMatch ? blockMatch[1] : text;
					
					//console.log('[PluginManager] 提取的块内容:', block);
					
					// 全局匹配所有参数键值对，避免跨行问题
					const paramMatches = [...block.matchAll(/([A-Za-z0-9_-]+)\s*[:：]\s*「始」([\s\S]*?)「末」/g)];
					
					//console.log('[PluginManager] 参数匹配结果:', paramMatches);
					
					let explicitCommand = null;
					const params = [];
					
					// 构建参数文档映射，从 description 中提取参数说明
					const paramDocMap = this.buildParamDocMap(description);
					
					//console.log('[PluginManager] 参数文档映射:', paramDocMap);
					
					paramMatches.forEach(match => {
						const key = match[1];
						const val = match[2].trim();
						
						//console.log('[PluginManager] 处理参数:', key, '=', val);
						
						if (key.toLowerCase() === 'tool_name' || key.toLowerCase() === 'maid') {
							//console.log('[PluginManager] 忽略系统参数:', key);
							return; // 忽略
						}
						
						if (key.toLowerCase() === 'command') {
							explicitCommand = val;
							//console.log('[PluginManager] 找到显式命令:', explicitCommand);
							return;
						}
						
						// 从参数文档中获取详细信息
						const paramDoc = paramDocMap[key] || {};
						
						// 判断是否必填
						const isRequired = paramDoc.required !== undefined ? paramDoc.required : 
							/(必需|必填|required)/i.test(paramDoc.description || '');
						
						// 判断类型
						let type = paramDoc.type || 'string';
						if (!paramDoc.type) {
							const docText = paramDoc.description || '';
							if (/(整数|数字|int|number)/i.test(docText)) type = 'number';
							else if (/(布尔|boolean)/i.test(docText)) type = 'boolean';
							else if (/(数组|array)/i.test(docText)) type = 'array';
						}
						
						// 解析可选值
						let enumOptions = paramDoc.options || [];
						if (!enumOptions.length) {
							enumOptions = this.extractEnumOptions(description, key);
						}
						
						const paramSchema = {
							type,
							required: isRequired,
							description: paramDoc.description || '',
							defaultValue: paramDoc.defaultValue || val, // 使用示例值作为默认值
							...(enumOptions.length ? { options: enumOptions } : {})
						};
						
						//console.log('[PluginManager] 参数schema:', key, paramSchema);
						
						params.push({
							name: key,
							schema: paramSchema
						});
					});
					
					// 简单直接的逻辑：如果TOOL_REQUEST块中有command参数，就需要command
					const needsCommand = explicitCommand !== null;
					const finalCommand = explicitCommand || commandId;
					
					//console.log('[PluginManager] 插件', commandId, '需要command参数:', needsCommand, '命令:', finalCommand);
					
					const commandInfo = {
						id: commandId,
						name: cmd.name || commandId,
						command: finalCommand,
						needsCommand: needsCommand, // 直接根据TOOL_REQUEST块中是否有command参数决定
						inputs: manifest.inputs || ['trigger'],
						outputs: manifest.outputs || ['result', 'error'],
						paramsSchema: params.reduce((acc, p) => {
							acc[p.name] = p.schema; 
							return acc;
						}, {})
					};
					
					//console.log('[PluginManager] 最终命令信息:', commandInfo);
					
					results.push(commandInfo);
				});
				
				//console.log('[PluginManager] 解析完成，共', results.length, '个命令');
				return results;
			} catch (e) {
				console.warn('[PluginManager] parseInvocationCommands failed:', e.message, e);
				return [];
			}
		}

		// 从 description 中构建参数文档映射
		buildParamDocMap(description) {
			const paramDocMap = {};
			
			// 匹配参数说明格式：- paramName (类型, 必需/可选): 描述
			const paramRegex = /^[-*]\s*([A-Za-z0-9_-]+)\s*\(([^)]+)\)\s*[:：]\s*(.+)$/gm;
			let match;
			
			while ((match = paramRegex.exec(description)) !== null) {
				const paramName = match[1];
				const typeInfo = match[2];
				const desc = match[3];
				
				// 解析类型信息
				const required = /(必需|必填|required)/i.test(typeInfo);
				let type = 'string';
				if (/(整数|数字|int|number)/i.test(typeInfo)) type = 'number';
				else if (/(布尔|boolean)/i.test(typeInfo)) type = 'boolean';
				else if (/(数组|array)/i.test(typeInfo)) type = 'array';
				
				// 提取默认值
				let defaultValue = '';
				const defaultMatch = desc.match(/默认['\"]?([^'\"，。\n]+)['\"]?/);
				if (defaultMatch) {
					defaultValue = defaultMatch[1].trim();
				}
				
				paramDocMap[paramName] = {
					type,
					required,
					description: desc.trim(),
					defaultValue
				};
			}
			
			return paramDocMap;
		}

		// 提取枚举选项
		extractEnumOptions(description, paramName) {
			const enumOptions = [];
			
			// 多种可选值格式的正则匹配
			const patterns = [
				// 格式1: paramName 可选值：「value1」、「value2」
				new RegExp(`${paramName}.*?可选值[:：]([^\\n]+)`, 'i'),
				// 格式2: 可选值: "value1", "value2"
				new RegExp(`${paramName}.*?可选值[:：]\\s*["']([^"']+)["'](?:\\s*[,，]\\s*["']([^"']+)["'])*`, 'i'),
				// 格式3: 可选: value1 | value2
				new RegExp(`${paramName}.*?可选[:：]\\s*([^\\n]+)`, 'i')
			];
			
			for (const pattern of patterns) {
				const match = description.match(pattern);
				if (match) {
					const optionsText = match[1];
					
					// 提取「」包裹的选项
					const quotedOptions = [...optionsText.matchAll(/「([^」]+)」/g)];
					if (quotedOptions.length > 0) {
						enumOptions.push(...quotedOptions.map(m => m[1]));
						break;
					}
					
					// 提取双引号包裹的选项
					const doubleQuotedOptions = [...optionsText.matchAll(/"([^"]+)"/g)];
					if (doubleQuotedOptions.length > 0) {
						enumOptions.push(...doubleQuotedOptions.map(m => m[1]));
						break;
					}
					
					// 提取单引号包裹的选项
					const singleQuotedOptions = [...optionsText.matchAll(/'([^']+)'/g)];
					if (singleQuotedOptions.length > 0) {
						enumOptions.push(...singleQuotedOptions.map(m => m[1]));
						break;
					}
					
					// 按分隔符分割
					const splitOptions = optionsText.split(/[,，、|]/).map(s => s.trim()).filter(Boolean);
					if (splitOptions.length > 1) {
						enumOptions.push(...splitOptions);
						break;
					}
				}
			}
			
			return enumOptions;
		}

        // HTTP请求封装
        async apiFetch(url, options = {}) {
            const defaultOptions = {
                timeout: 10000,
                ...options
            };

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), defaultOptions.timeout);

            try {
                const response = await fetch(url, {
                    ...defaultOptions,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
                }

                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    return await response.json();
                } else {
                    return await response.text();
                }
            } catch (error) {
                clearTimeout(timeoutId);
                if (error.name === 'AbortError') {
                    throw new Error('Request timeout');
                }
                throw error;
            }
        }

        // 获取API配置
        getApiConfig() {
            // 从localStorage获取配置，如果没有则返回默认配置
            const savedConfig = localStorage.getItem('pluginManager_apiConfig');
            if (savedConfig) {
                try {
                    return JSON.parse(savedConfig);
                } catch (error) {
                    console.warn('[PluginManager] Failed to parse saved API config:', error);
                }
            }

            // 默认配置
            return {
                host: '49.235.138.100',
                port: '6005',
                username: '',
                password: ''
            };
        }

        // 设置API配置
        setApiConfig(config) {
            try {
                // 显示保存中状态
                this.showSavingState();
                
                localStorage.setItem('pluginManager_apiConfig', JSON.stringify(config));
                //console.log('[PluginManager] API configuration saved');
                
                // 显示保存成功状态
                this.showSaveSuccessState();
                
                // 2秒后隐藏状态提示
                setTimeout(() => {
                    this.hideSaveState();
                }, 2000);
                
            } catch (error) {
                console.error('[PluginManager] Failed to save API configuration:', error);
                this.showSaveErrorState(error.message);
                
                // 3秒后隐藏错误状态
                setTimeout(() => {
                    this.hideSaveState();
                }, 3000);
                
                throw error;
            }
        }

        // 显示保存中状态
        showSavingState() {
            if (typeof document !== 'undefined') {
                const event = new CustomEvent('pluginManagerSaving', {
                    detail: { 
                        message: '正在保存配置...',
                        type: 'loading',
                        showSpinner: true
                    }
                });
                document.dispatchEvent(event);
            }
        }

        // 显示保存成功状态
        showSaveSuccessState() {
            if (typeof document !== 'undefined') {
                const event = new CustomEvent('pluginManagerSaveSuccess', {
                    detail: { 
                        message: '配置保存成功',
                        type: 'success',
                        showCheckmark: true
                    }
                });
                document.dispatchEvent(event);
            }
        }

        // 显示保存错误状态
        showSaveErrorState(errorMessage) {
            if (typeof document !== 'undefined') {
                const event = new CustomEvent('pluginManagerSaveError', {
                    detail: { 
                        message: `保存失败: ${errorMessage}`,
                        type: 'error',
                        showErrorIcon: true
                    }
                });
                document.dispatchEvent(event);
            }
        }

        // 隐藏保存状态
        hideSaveState() {
            if (typeof document !== 'undefined') {
                const event = new CustomEvent('pluginManagerSaveStateHide', {
                    detail: { type: 'hide' }
                });
                document.dispatchEvent(event);
            }
        }

        // 解析配置模式
        parseConfigSchema(config) {
            const schema = {};
            
            // 如果config是对象，转换为schema格式
            if (typeof config === 'object' && config !== null) {
                Object.entries(config).forEach(([key, value]) => {
                    if (typeof value === 'object' && value.type) {
                        // 已经是schema格式
                        schema[key] = value;
                    } else {
                        // 简单值，推断类型
                        schema[key] = {
                            type: this.inferType(value),
                            default: value,
                            required: false
                        };
                    }
                });
            }
            
            return schema;
        }

        // 推断数据类型
        inferType(value) {
            if (typeof value === 'number') return 'number';
            if (typeof value === 'boolean') return 'boolean';
            if (Array.isArray(value)) return 'array';
            if (typeof value === 'object') return 'object';
            return 'string';
        }

        // 添加到分类
        addToCategory(category, pluginInfo) {
            if (!this.pluginCategories.has(category)) {
                this.pluginCategories.set(category, []);
            }
            
            const categoryPlugins = this.pluginCategories.get(category);
            
            // 检查是否已存在相同ID的插件，避免重复
            const existingIndex = categoryPlugins.findIndex(p => p.id === pluginInfo.id);
            if (existingIndex !== -1) {
                // 如果已存在，替换为新的插件信息
                categoryPlugins[existingIndex] = pluginInfo;
                //console.log(`[PluginManager] 替换重复插件: ${pluginInfo.id} (${pluginInfo.name})`);
            } else {
                // 如果不存在，添加新插件
                categoryPlugins.push(pluginInfo);
                //console.log(`[PluginManager] 添加新插件: ${pluginInfo.id} (${pluginInfo.name})`);
            }
        }

        // 更新状态管理器中的可用插件
        updateAvailablePlugins() {
            if (this.stateManager) {
                // 按分类组织插件
                const pluginsByCategory = {};
                
                this.pluginCategories.forEach((plugins, category) => {
                    pluginsByCategory[category] = plugins.map(plugin => ({
                        id: plugin.id,
                        name: plugin.name,
                        description: plugin.description,
                        icon: plugin.icon,
                        tags: plugin.tags
                    }));
                });
                
                // 更新状态管理器
                Object.entries(pluginsByCategory).forEach(([category, plugins]) => {
                    this.stateManager.setAvailablePlugins(category, plugins);
                });
            }
        }

        // 获取插件信息
        getPluginInfo(pluginKey) {
            return this.discoveredPlugins.get(pluginKey);
        }

        // 获取插件
        getPlugin(pluginKey) {
            return this.discoveredPlugins.get(pluginKey);
        }

        // 获取指令信息
        getCommandInfo(pluginKey, commandId) {
            const plugin = this.discoveredPlugins.get(pluginKey);
            if (!plugin || !plugin.commands) {
                console.warn('[PluginManager] Plugin or commands not found:', pluginKey);
                return null;
            }

            const command = plugin.commands.find(cmd => cmd.id === commandId || cmd.command === commandId);
            if (!command) {
                console.warn('[PluginManager] Command not found:', commandId, 'in plugin:', pluginKey);
                return null;
            }

            // 转换为 NodeManager 期望的格式
            return {
                id: command.id,
                name: command.name,
                command: command.command,
                parameters: command.paramsSchema || {}
            };
        }

        // 获取所有插件
        getAllPlugins() {
            return Array.from(this.discoveredPlugins.values());
        }

        // 获取插件列表（兼容方法）
        getPlugins() {
            const plugins = {};
            this.discoveredPlugins.forEach((plugin, key) => {
                plugins[key] = plugin;
            });
            return plugins;
        }

        // 按分类获取插件
        getPluginsByCategory(category) {
            return this.pluginCategories.get(category) || [];
        }

        // 搜索插件
        searchPlugins(query) {
            const results = [];
            const lowerQuery = query.toLowerCase();
            
            this.discoveredPlugins.forEach(plugin => {
                if (
                    plugin.name.toLowerCase().includes(lowerQuery) ||
                    plugin.description.toLowerCase().includes(lowerQuery) ||
                    plugin.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
                ) {
                    results.push(plugin);
                }
            });
            
            return results;
        }

        // 手动添加插件
        async addCustomPlugin(pluginData) {
            try {
                // 验证插件数据
                if (!pluginData.id || !pluginData.name) {
                    throw new Error('Plugin ID and name are required');
                }
                
                // 创建插件信息
                const pluginInfo = {
                    id: pluginData.id,
                    name: pluginData.name,
                    description: pluginData.description || '',
                    version: pluginData.version || '1.0.0',
                    author: pluginData.author || 'User',
                    category: pluginData.category || 'custom',
                    type: pluginData.type || 'custom',
                    inputs: pluginData.inputs || ['input'],
                    outputs: pluginData.outputs || ['output'],
                    configSchema: pluginData.configSchema || {},
                    icon: pluginData.icon || 'extension',
                    tags: pluginData.tags || ['custom'],
                    isCustom: true
                };
                
                // 添加到发现的插件中
                const pluginKey = `${pluginInfo.category}_${pluginInfo.id}`;
                this.discoveredPlugins.set(pluginKey, pluginInfo);
                this.addToCategory(pluginInfo.category, pluginInfo);
                
                // 更新可用插件
                this.updateAvailablePlugins();
                
                //console.log('[PluginManager] Custom plugin added:', pluginInfo);
                return pluginKey;
                
            } catch (error) {
                console.error('[PluginManager] Failed to add custom plugin:', error);
                throw error;
            }
        }

        // 删除自定义插件
        removeCustomPlugin(pluginKey) {
            const plugin = this.discoveredPlugins.get(pluginKey);
            if (plugin && plugin.isCustom) {
                this.discoveredPlugins.delete(pluginKey);
                
                // 从分类中移除
                const categoryPlugins = this.pluginCategories.get(plugin.category);
                if (categoryPlugins) {
                    const index = categoryPlugins.findIndex(p => p.id === plugin.id);
                    if (index !== -1) {
                        categoryPlugins.splice(index, 1);
                    }
                }
                
                // 更新可用插件
                this.updateAvailablePlugins();
                
                return true;
            }
            return false;
        }

        // 导出插件配置
        exportPluginConfig() {
            const customPlugins = [];
            
            this.discoveredPlugins.forEach(plugin => {
                if (plugin.isCustom) {
                    customPlugins.push({
                        id: plugin.id,
                        name: plugin.name,
                        description: plugin.description,
                        category: plugin.category,
                        type: plugin.type,
                        inputs: plugin.inputs,
                        outputs: plugin.outputs,
                        configSchema: plugin.configSchema,
                        icon: plugin.icon,
                        tags: plugin.tags
                    });
                }
            });
            
            return {
                version: '1.0.0',
                customPlugins: customPlugins,
                exportTime: new Date().toISOString()
            };
        }

        // 导入插件配置
        async importPluginConfig(configData) {
            try {
                if (!configData.customPlugins || !Array.isArray(configData.customPlugins)) {
                    throw new Error('Invalid plugin configuration format');
                }
                
                const imported = [];
                
                for (const pluginData of configData.customPlugins) {
                    try {
                        const pluginKey = await this.addCustomPlugin(pluginData);
                        imported.push(pluginKey);
                    } catch (error) {
                        console.warn(`[PluginManager] Failed to import plugin ${pluginData.id}:`, error);
                    }
                }
                
                return imported;
                
            } catch (error) {
                console.error('[PluginManager] Failed to import plugin configuration:', error);
                throw error;
            }
        }

        // 获取插件统计信息
        getStats() {
            const stats = {
                total: this.discoveredPlugins.size,
                byCategory: {},
                custom: 0
            };
            
            this.pluginCategories.forEach((plugins, category) => {
                stats.byCategory[category] = plugins.length;
            });
            
            this.discoveredPlugins.forEach(plugin => {
                if (plugin.isCustom) {
                    stats.custom++;
                }
            });
            
            return stats;
        }

        // 显示API配置对话框
        showApiConfigDialog() {
            if (window.WorkflowEditor_ApiConfigDialog) {
                window.WorkflowEditor_ApiConfigDialog.show();
            } else {
                console.error('[PluginManager] API Config Dialog not available');
            }
        }

        // 检查API是否已配置
        isApiConfigured() {
            const config = this.getApiConfig();
            return config && config.host && config.port;
        }

        // 获取API连接状态
        async getApiConnectionStatus() {
            if (!this.isApiConfigured()) {
                return { connected: false, message: '未配置API服务器' };
            }

            try {
                const config = this.getApiConfig();
                const apiUrl = `http://${config.host}:${config.port}/admin_api/plugins`;
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);

                const response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(config.username && config.password ? {
                            'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`)
                        } : {})
                    },
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json();
                    const pluginCount = Array.isArray(data) ? data.length : 0;
                    return { connected: true, message: `已连接，发现 ${pluginCount} 个插件` };
                } else {
                    return { connected: false, message: `连接失败: HTTP ${response.status}` };
                }

            } catch (error) {
                let message = '连接失败';
                if (error.name === 'AbortError') {
                    message = '连接超时';
                } else if (error.message.includes('Failed to fetch')) {
                    message = '无法连接到服务器';
                } else {
                    message = `连接错误: ${error.message}`;
                }
                return { connected: false, message };
            }
        }

        // 显示配置提示
        showConfigurationPrompt() {
            //console.log('[PluginManager] 请配置API服务器以获取远程插件');
            
            // 如果在UI环境中，可以显示提示消息
            if (typeof document !== 'undefined') {
                const event = new CustomEvent('pluginManagerConfigNeeded', {
                    detail: { message: '请配置API服务器以获取远程插件' }
                });
                document.dispatchEvent(event);
            }
        }

        // 处理发现错误
        handleDiscoveryError(error) {
            console.error('[PluginManager] Plugin discovery error:', error);
            
            let userMessage = '插件发现失败';
            if (error.message.includes('Failed to fetch')) {
                userMessage = '无法连接到插件服务器，请检查网络连接和API配置';
            } else if (error.name === 'AbortError') {
                userMessage = '连接超时，请检查服务器状态';
            } else {
                userMessage = `插件发现失败: ${error.message}`;
            }

            // 发送错误事件
            if (typeof document !== 'undefined') {
                const event = new CustomEvent('pluginManagerError', {
                    detail: { message: userMessage, error }
                });
                document.dispatchEvent(event);
            }
        }

        // 手动刷新插件列表
        async refreshPlugins() {
            //console.log('[PluginManager] Refreshing plugins...');
            
            // 清空当前插件
            this.discoveredPlugins.clear();
            this.pluginCategories.clear();
            
            // 重新发现插件
            await this.discoverPlugins();
            
            // 通知UI更新
            if (typeof document !== 'undefined') {
                const event = new CustomEvent('pluginManagerRefreshed', {
                    detail: { pluginCount: this.discoveredPlugins.size }
                });
                document.dispatchEvent(event);
            }
        }
    }

    // 导出为全局单例
    window.WorkflowEditor_PluginManager = WorkflowEditor_PluginManager.getInstance();
})();
