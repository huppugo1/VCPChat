// modules/chatManager.js

window.chatManager = (() => {
    // --- 私有变量 ---
    let tauriAPI;
    let uiHelper;
    // messageRenderer 不再作为私有变量存储，而是动态获取
    let itemListManager;
    let topicListManager;
    let groupRenderer;

    // References to state in renderer.js
    let currentSelectedItemRef;
    let currentTopicIdRef;
    let currentChatHistoryRef;
    let attachedFilesRef;
    let globalSettingsRef;

    // DOM Elements from renderer.js
    let elements = {};
    
    // Functions from main renderer
    let mainRendererFunctions = {};
    let isCanvasWindowOpen = false; // State to track if the canvas window is open



    /**
     * 应用单个正则规则到文本
     * @param {string} text - 输入文本
     * @param {Object} rule - 正则规则对象
     * @returns {string} 处理后的文本
     */
    function applyRegexRule(text, rule) {
        if (!rule || !rule.findPattern || typeof text !== 'string') {
            return text;
        }

        try {
            // 使用 uiHelperFunctions.regexFromString 来解析正则表达式
            let regex = null;
            if (window.uiHelperFunctions && window.uiHelperFunctions.regexFromString) {
                regex = window.uiHelperFunctions.regexFromString(rule.findPattern);
            } else {
                // 后备方案：手动解析
                const regexMatch = rule.findPattern.match(/^\/(.+?)\/([gimuy]*)$/);
                if (regexMatch) {
                    regex = new RegExp(regexMatch[1], regexMatch[2]);
                } else {
                    regex = new RegExp(rule.findPattern, 'g');
                }
            }
            
            if (!regex) {
                console.error('无法解析正则表达式:', rule.findPattern);
                return text;
            }
            
            // 应用替换（如果没有替换内容，则默认替换为空字符串）
            return text.replace(regex, rule.replaceWith || '');
        } catch (error) {
            console.error('应用正则规则时出错:', rule.findPattern, error);
            return text;
        }
    }

    /**
     * 应用所有匹配的正则规则到文本
     * @param {string} text - 输入文本
     * @param {Array} rules - 正则规则数组
     * @param {string} scope - 作用域 ('frontend' 或 'context')
     * @param {string} role - 消息角色 ('user' 或 'assistant')
     * @param {number} depth - 消息深度（0 = 最新消息）
     * @returns {string} 处理后的文本
     */
    function applyRegexRules(text, rules, scope, role, depth = 0) {
        if (!rules || !Array.isArray(rules) || typeof text !== 'string') {
            return text;
        }

        let processedText = text;
        
        rules.forEach(rule => {
            // 检查是否应该应用此规则
            
            // 1. 检查作用域
            const shouldApplyToScope =
                (scope === 'context' && rule.applyToContext) ||
                (scope === 'frontend' && rule.applyToFrontend);
            
            if (!shouldApplyToScope) return;
            
            // 2. 检查角色
            const shouldApplyToRole = rule.applyToRoles && rule.applyToRoles.includes(role);
            if (!shouldApplyToRole) return;
            
            // 3. 检查深度（-1 表示无限制）
            const minDepthOk = rule.minDepth === undefined || rule.minDepth === -1 || depth >= rule.minDepth;
            const maxDepthOk = rule.maxDepth === undefined || rule.maxDepth === -1 || depth <= rule.maxDepth;
            
            if (!minDepthOk || !maxDepthOk) return;
            
            // 应用规则
            processedText = applyRegexRule(processedText, rule);
        });
        
        return processedText;
    }

    /**
     * 获取 messageRenderer 实例
     * 动态获取以确保使用最新的初始化实例
     */
    function getMessageRenderer() {
        return window.messageRenderer;
    }

    /**
     * 初始化 ChatManager 模块
     * @param {object} config - 配置对象
     */
    function init(config) {
        // 使用 tauriAPI（通过 tauri_compat.js 提供）
        tauriAPI = config.tauriAPI || window.tauriAPI || window.__TAURI__;
        if (!tauriAPI) {
            console.error('[ChatManager] Tauri API 不可用，模块可能无法正常工作');
        }
        uiHelper = config.uiHelper;
        
        // Modules - messageRenderer 不再存储，而是动态获取
        itemListManager = config.modules.itemListManager;
        topicListManager = config.modules.topicListManager;
        groupRenderer = config.modules.groupRenderer;

        // State References
        currentSelectedItemRef = config.refs.currentSelectedItemRef;
        currentTopicIdRef = config.refs.currentTopicIdRef;
        currentChatHistoryRef = config.refs.currentChatHistoryRef;
        attachedFilesRef = config.refs.attachedFilesRef;
        globalSettingsRef = config.refs.globalSettingsRef;

        // DOM Elements
        elements = config.elements;
        
        // 主渲染器函数
        mainRendererFunctions = config.mainRendererFunctions;

        //console.log('[ChatManager] 初始化成功');

        // 注意：VCP 流式事件监听器在 renderer.js 中设置，使用 @tauri-apps/api/event
        // 这里不再需要设置事件监听器
    }

    /**
     * 处理 VCP 流式响应事件
     * @param {object} payload - 事件数据
     */
    async function handleVcpStreamEvent(payload) {
        //console.log('[ChatManager] 收到 vcp-stream-event:', payload);
        
        const { type, chunk, messageId, context, error, content } = payload;
        const currentSelectedItem = currentSelectedItemRef.get();
        const currentTopicId = currentTopicIdRef.get();
        
        //console.log('[ChatManager] 流事件类型:', type, 'messageId:', messageId);
        //console.log('[ChatManager] context:', context);
        //console.log('[ChatManager] currentSelectedItem:', currentSelectedItem);
        
        // 检查是否是当前活动聊天的消息
        // 对于群组消息，context.groupId 应该匹配 currentSelectedItem.id
        // 对于单聊消息，context.agentId 应该匹配 currentSelectedItem.id
        const isForActiveChat = context && (
            (context.isGroupMessage && context.groupId === currentSelectedItem?.id && context.topicId === currentTopicId) ||
            (!context.isGroupMessage && context.agentId === currentSelectedItem?.id && context.topicId === currentTopicId)
        );
        
        if (!isForActiveChat) {
            //console.log('[ChatManager] 流事件不属于当前活动聊天，忽略 UI 更新');
            //console.log('[ChatManager] 期望:', { groupId: currentSelectedItem?.id, topicId: currentTopicId });
            //console.log('[ChatManager] 实际:', { groupId: context?.groupId, agentId: context?.agentId, topicId: context?.topicId, isGroupMessage: context?.isGroupMessage });
            return;
        }
        
        // 动态获取 messageRenderer，确保使用最新的引用
        const mr = getMessageRenderer();
        
        switch (type) {
            case 'data':
                // 处理流式数据块
                if (chunk && mr) {
                    // 提取文本内容用于日志
                    let textContent = '';
                    if (chunk?.choices?.[0]?.delta?.content) {
                        textContent = chunk.choices[0].delta.content;
                    } else if (chunk?.delta?.content) {
                        textContent = chunk.delta.content;
                    } else if (typeof chunk?.content === 'string') {
                        textContent = chunk.content;
                    }
                    //console.log('[ChatManager] 流数据块:', textContent.substring(0, 50));
                    
                    // 使用 appendStreamChunk 方法，传递完整的 chunk 数据
                    if (mr.appendStreamChunk) {
                        mr.appendStreamChunk(messageId, chunk, context);
                    } else {
                        console.warn('[ChatManager] messageRenderer.appendStreamChunk 不可用, keys:', Object.keys(mr));
                    }
                } else {
                    console.warn('[ChatManager] 没有可用的 messageRenderer 处理流数据块');
                }
                break;
                
            case 'end':
                // 流式响应结束
                //console.log('[ChatManager] 流结束，消息ID:', messageId, '内容长度:', content?.length);
                if (mr) {
                    // 使用 finalizeStreamedMessage 完成流式消息
                    if (mr.finalizeStreamedMessage) {
                        await mr.finalizeStreamedMessage(messageId, 'completed', context);
                    } else {
                        // 回退：移除思考中消息并渲染完整消息
                        mr.removeMessageById(messageId);
                        
                        const assistantMessage = {
                            role: 'assistant',
                            name: context?.modelName || context?.agentName || currentSelectedItem?.name || 'AI',
                            avatarUrl: currentSelectedItem?.avatarUrl,
                            avatarColor: (currentSelectedItem?.config || currentSelectedItem)?.avatarCalculatedColor,
                            content: content || '',
                            timestamp: Date.now(),
                            id: `msg_${Date.now()}_assistant_${Math.random().toString(36).substring(2, 9)}`,
                            agentId: currentSelectedItem?.id,
                            finishReason: 'completed'
                        };
                        
                        mr.renderMessage(assistantMessage);
                        
                        // 更新聊天历史
                        const currentHistory = currentChatHistoryRef.get();
                        const finalHistory = currentHistory.filter(msg => msg.id !== messageId && !msg.isThinking);
                        finalHistory.push(assistantMessage);
                        currentChatHistoryRef.set(finalHistory);
                    }
                    
                    // 尝试话题摘要
                    attemptTopicSummarizationIfNeeded();
                }
                break;
                
            case 'error':
                // 流式响应错误
                console.error('[ChatManager] 流错误:', error);
                if (mr) {
                    mr.removeMessageById(messageId);
                    mr.renderMessage({ 
                        role: 'system', 
                        content: `流式响应错误: ${error}`, 
                        timestamp: Date.now() 
                    });
                }
                break;
                
            default:
                console.warn('[ChatManager] 未知的流事件类型:', type);
        }
    }

    /**
     * 保存最后打开的项目和话题 ID 到设置文件
     * 这是一个私有辅助函数
     * 
     * 注意：已禁用自动保存，全局设置只在用户点击保存按钮时保存
     */
    function _saveLastOpenState() {
        // 已禁用：全局设置只在用户点击保存按钮时保存
        // 不再自动保存 lastOpenItemId, lastOpenItemType, lastOpenTopicId
        //console.log('[ChatManager] _saveLastOpenState 被调用但自动保存已禁用');
    }
 
    // --- Functions moved from renderer.js ---
 
    function displayNoItemSelected() {
        const { currentChatNameH3, chatMessagesDiv, currentItemActionBtn, messageInput, sendMessageBtn, attachFileBtn } = elements;
        const voiceChatBtn = document.getElementById('voiceChatBtn');
        currentChatNameH3.textContent = '选择一个 Agent 或群组开始聊天';
        chatMessagesDiv.innerHTML = `<div class="message-item system welcome-bubble"><p>欢迎！请从左侧选择AI助手/群组，或创建新的开始对话。</p></div>`;
        currentItemActionBtn.style.display = 'none';
        if (voiceChatBtn) voiceChatBtn.style.display = 'none';
        messageInput.disabled = true;
        sendMessageBtn.disabled = true;
        attachFileBtn.disabled = true;
        if (mainRendererFunctions.displaySettingsForItem) {
            mainRendererFunctions.displaySettingsForItem(); 
        }
        // 不自动加载话题列表，只有用户点击话题标签页时才加载
    }

    async function selectItem(itemId, itemType, itemName, itemAvatarUrl, itemFullConfig, options = {}) {
        console.log(`[ChatManager selectItem] 🎯 开始选择项目: itemId=${itemId}, itemType=${itemType}, itemName=${itemName}`);
        const { skipTopicListRefresh = false } = options;
        //console.log(`[ChatManager selectItem] 📋 接收到的配置:`, itemFullConfig);
        
        // 停止所有语音朗读
        let messageRenderer = getMessageRenderer();
        if (messageRenderer && typeof messageRenderer.stopAllSpeech === 'function') {
            messageRenderer.stopAllSpeech();
        }
        
        // 心流锁激活时，不允许切换Agent
        if (window.flowlockManager && window.flowlockManager.getState && window.flowlockManager.getState().isActive) {
            if (uiHelper && uiHelper.showToastNotification) {
                uiHelper.showToastNotification('心流锁运行中，无法切换Agent。请先停止心流锁。', 'warning');
            }
            //console.log('[ChatManager] Blocked agent switch due to active Flowlock');
            return;
        }
        
        // 停止之前的文件监听器（切换项目时静默忽略未实现的情况）
        try {
            await tauriAPI.invoke('watcher_stop');
        } catch (e) {
            // watcher_stop 可能尚未实现，静默忽略
        }

        const { currentChatNameH3, currentItemActionBtn, messageInput, sendMessageBtn, attachFileBtn } = elements;
        let currentSelectedItem = currentSelectedItemRef.get();
        let currentTopicId = currentTopicIdRef.get();

        //console.log(`[ChatManager selectItem] 当前选中项目:`, currentSelectedItem);
        //console.log(`[ChatManager selectItem] 当前话题ID:`, currentTopicId);

        // 检查是否已经选中了相同的 item（避免重复加载）
        if (currentSelectedItem && currentSelectedItem.id === itemId && currentSelectedItem.type === itemType && currentTopicId) {
            console.log(`[ChatManager] 项目 ${itemType} ${itemId} 已选中，话题 ${currentTopicId}，跳过重复加载`);
            return;
        }

        console.log(`[ChatManager selectItem] 设置 currentSelectedItemRef...`);
        currentSelectedItem = { id: itemId, type: itemType, name: itemName, avatarUrl: itemAvatarUrl, config: itemFullConfig };
        currentSelectedItemRef.set(currentSelectedItem);
        console.log(`[ChatManager selectItem] ✅ currentSelectedItemRef 已设置，验证:`, currentSelectedItemRef.get()?.id);
        
        currentTopicIdRef.set(null); // Reset topic
        currentChatHistoryRef.set([]);

        document.querySelectorAll('.topic-list .topic-item.active-topic-glowing').forEach(item => {
            item.classList.remove('active-topic-glowing');
        });

        messageRenderer = getMessageRenderer(); 
        if (messageRenderer) {
            messageRenderer.setCurrentSelectedItem(currentSelectedItem);
            messageRenderer.setCurrentTopicId(null);
            messageRenderer.setCurrentItemAvatar(itemAvatarUrl);
            messageRenderer.setCurrentItemAvatarColor(itemFullConfig?.avatarCalculatedColor || null);
        }
        
        // 添加 has-selection 类以显示工具栏
        const chatView = document.getElementById('chatView');
        if (chatView) {
            chatView.classList.add('has-selection');
        }

        if (itemType === 'group' && groupRenderer && typeof groupRenderer.handleSelectGroup === 'function') {
            //console.log(`[ChatManager selectItem] 调用 groupRenderer.handleSelectGroup...`);
            await groupRenderer.handleSelectGroup(itemId, itemName, itemAvatarUrl, itemFullConfig);
            //console.log(`[ChatManager selectItem] groupRenderer.handleSelectGroup 完成`);
            //console.log(`[ChatManager selectItem] 检查 ref 是否仍然正确:`, currentSelectedItemRef.get());
        } else if (itemType === 'agent') {
            //console.log(`[ChatManager selectItem] 这是 Agent，清除群组按钮`);
            if (groupRenderer && typeof groupRenderer.clearInviteAgentButtons === 'function') {
                groupRenderer.clearInviteAgentButtons();
            }
        }
     
        const voiceChatBtn = document.getElementById('voiceChatBtn');

        if (currentChatNameH3) {
            currentChatNameH3.textContent = `与 ${itemName} ${itemType === 'group' ? '(群组)' : ''} 聊天中`;
        }
        if (currentItemActionBtn) {
            currentItemActionBtn.textContent = itemType === 'group' ? '新建群聊话题' : '新建聊天话题';
            currentItemActionBtn.title = `为 ${itemName} 新建${itemType === 'group' ? '群聊话题' : '聊天话题'}`;
            currentItemActionBtn.style.display = 'inline-block';
        }
        
        // 🔧 修复：显示新建话题按钮（仅当有选中项目时）
        const newTopicBtn = document.getElementById('newTopicBtn');
        if (newTopicBtn && currentSelectedItem && currentSelectedItem.id) {
            newTopicBtn.style.display = 'inline-block';
            newTopicBtn.setAttribute('aria-hidden', 'false');
        } else if (newTopicBtn) {
            newTopicBtn.style.display = 'none';
            newTopicBtn.setAttribute('aria-hidden', 'true');
        }
        
        if (voiceChatBtn) {
            voiceChatBtn.style.display = itemType === 'agent' ? 'inline-block' : 'none';
        }

        // 更新工具栏发言人列表（必须在 handleSelectGroup 之后）
        if (window.ChatToolbar) {
            if (itemType === 'group') {
                // 群组：显示群组成员
                if (itemFullConfig) {
                    console.log('[ChatManager] 更新群组发言人列表，配置:', itemFullConfig);
                    await window.ChatToolbar.updateSpeakerList(itemFullConfig);
                } else {
                    console.warn('[ChatManager] 群组配置为空，无法更新发言人列表');
                }
            } else if (itemType === 'agent') {
                // Agent：显示模型名称
                const agentConfig = itemFullConfig || currentSelectedItem.config || currentSelectedItem;
                const modelName = (agentConfig && agentConfig.model) ? agentConfig.model : 'gemini-pro';
                
                // 直接设置发言人显示为模型名称（不调用 clearSpeakerList，因为它会清空 value）
                const speakerSearch = document.getElementById('speakerSearch');
                const speakerDropdown = document.getElementById('speakerDropdown');
                const speakerList = document.getElementById('speakerList');
                
                if (speakerSearch) {
                    speakerSearch.value = modelName;
                    speakerSearch.disabled = true;
                }
                
                if (speakerDropdown) {
                    speakerDropdown.classList.add('disabled');
                }
                
                if (speakerList) {
                    speakerList.innerHTML = '';
                    speakerList.classList.remove('show');
                }
            }
        }

        if (itemListManager && typeof itemListManager.highlightActiveItem === 'function') {
            itemListManager.highlightActiveItem(itemId, itemType);
        }
        if(mainRendererFunctions.displaySettingsForItem) mainRendererFunctions.displaySettingsForItem();

        try {
            let topics;
            if (itemType === 'agent') {
                // 使用 tauriAPI 调用后端
                topics = await tauriAPI.invoke('get_agent_topics', { agentId: itemId });
            } else if (itemType === 'group') {
                try {
                    topics = await tauriAPI.invoke('get_group_topics', { groupId: itemId });
                } catch (groupTopicsError) {
                    // get_group_topics 可能未实现，尝试使用 get_agent_group_config
                    console.warn('[ChatManager] get_group_topics 失败，尝试从配置加载:', groupTopicsError.message || groupTopicsError);
                    try {
                        const groupConfig = await tauriAPI.invoke('get_agent_group_config', { groupId: itemId });
                        console.log('[ChatManager] 群组配置加载成功，话题数量:', groupConfig?.topics?.length || 0);
                        topics = groupConfig?.topics || [];
                    } catch (configError) {
                        console.error('[ChatManager] 加载群组配置失败:', configError);
                        topics = { error: 'Group topics not available' };
                    }
                }
            }

            console.log('[ChatManager] 话题加载结果:', { 
                hasTopics: !!topics, 
                isArray: Array.isArray(topics),
                hasError: topics?.error,
                length: topics?.length,
                firstTopic: topics?.[0]
            });

            if (topics && !topics.error && topics.length > 0) {
                let topicToLoadId = topics[0].id;
                const rememberedTopicId = localStorage.getItem(`lastActiveTopic_${itemId}_${itemType}`);
                if (rememberedTopicId && topics.some(t => t.id === rememberedTopicId)) {
                    topicToLoadId = rememberedTopicId;
                }
                console.log(`[ChatManager] 设置话题ID: ${topicToLoadId} (共 ${topics.length} 个话题)`);
                currentTopicIdRef.set(topicToLoadId);
                const messageRenderer = getMessageRenderer(); if (messageRenderer) messageRenderer.setCurrentTopicId(topicToLoadId);
                await loadChatHistory(itemId, itemType, topicToLoadId);
            } else if (topics && topics.error) {
                console.error(`[ChatManager] 加载 ${itemType} ${itemId} 的话题列表失败:`, topics.error);
                const messageRenderer = getMessageRenderer(); if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `加载话题列表失败: ${topics.error}`, timestamp: Date.now() });
                await loadChatHistory(itemId, itemType, null);
            } else {
                if (itemType === 'agent') {
                    const agentConfig = await tauriAPI.invoke('get_agent_config', { agentId: itemId });
                    if (agentConfig && (!agentConfig.topics || agentConfig.topics.length === 0)) {
                        const defaultTopicResult = await tauriAPI.invoke('create_new_topic', { agentId: itemId, topicName: "主要对话" });
                        if (defaultTopicResult.success) {
                            currentTopicIdRef.set(defaultTopicResult.topicId);
                            const messageRenderer = getMessageRenderer(); if (messageRenderer) messageRenderer.setCurrentTopicId(defaultTopicResult.topicId);
                            await loadChatHistory(itemId, itemType, defaultTopicResult.topicId);
                        } else {
                            const messageRenderer = getMessageRenderer(); if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `创建默认话题失败: ${defaultTopicResult.error}`, timestamp: Date.now() });
                            await loadChatHistory(itemId, itemType, null);
                        }
                    } else {
                         await loadChatHistory(itemId, itemType, null);
                    }
                } else if (itemType === 'group') {
                    // 对于群组，使用 create_new_group_topic 或回退到直接加载
                    try {
                        const defaultTopicResult = await tauriAPI.invoke('create_new_group_topic', { groupId: itemId, topicName: "主要群聊" });
                        if (defaultTopicResult.success) {
                            currentTopicIdRef.set(defaultTopicResult.topicId);
                            const messageRenderer = getMessageRenderer(); if (messageRenderer) messageRenderer.setCurrentTopicId(defaultTopicResult.topicId);
                            await loadChatHistory(itemId, itemType, defaultTopicResult.topicId);
                        } else {
                            const messageRenderer = getMessageRenderer(); if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `创建默认群聊话题失败: ${defaultTopicResult.error}`, timestamp: Date.now() });
                            await loadChatHistory(itemId, itemType, null);
                        }
                    } catch (createTopicError) {
                        // create_new_group_topic 可能未实现，直接加载空历史
                        await loadChatHistory(itemId, itemType, null);
                    }
                }
            }
        } catch (e) {
            // 静默处理群组配置不存在的错误
            if (itemType === 'group' && e.message && e.message.includes('配置文件不存在')) {
                const messageRenderer = getMessageRenderer(); 
                if (messageRenderer) {
                    messageRenderer.renderMessage({ role: 'system', content: '请选择或创建一个话题以开始群聊。', timestamp: Date.now() });
                }
            } else {
                console.error(`[ChatManager] 选择 ${itemType} ${itemId} 时发生错误:`, e);
                const messageRenderer = getMessageRenderer(); if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `选择${itemType === 'group' ? '群组' : '助手'}时出错: ${e.message}`, timestamp: Date.now() });
            }
        }

        messageInput.disabled = false;
        sendMessageBtn.disabled = false;
        attachFileBtn.disabled = false;
        // messageInput.focus();
        
        // 刷新话题列表以显示新选中项目的话题（除非明确跳过）
        if (!skipTopicListRefresh) {
            console.log('[ChatManager] 选中项目已更改，刷新话题列表');
            if (topicListManager && typeof topicListManager.loadTopicList === 'function') {
                topicListManager.loadTopicList();
            } else {
                console.warn('[ChatManager] topicListManager 不可用');
            }
        } else {
            console.log('[ChatManager] 跳过话题列表刷新（从话题列表点击）');
        }
        
        _saveLastOpenState(); // Save state after selecting an item and its default topic
        console.log('[ChatManager selectItem] ✅ 函数执行完成，最终验证 ref:', currentSelectedItemRef.get()?.id);
    }
 
    async function selectTopic(topicId) {
        //console.log(`[ChatManager] 🎯 selectTopic 被调用，topicId: ${topicId}`);
        
        // 心流锁激活时，不允许切换话题
        if (window.flowlockManager && window.flowlockManager.getState && window.flowlockManager.getState().isActive) {
            //console.log('[ChatManager] ❌ 心流锁激活，阻止话题切换');
            if (uiHelper && uiHelper.showToastNotification) {
                uiHelper.showToastNotification('心流锁运行中，无法切换话题。请先停止心流锁。', 'warning');
            }
            //console.log('[ChatManager] Blocked topic switch due to active Flowlock');
            return;
        }
        
        let currentTopicId = currentTopicIdRef.get();
  
        
        if (currentTopicId !== topicId) {
            //console.log(`[ChatManager] ✅ 话题需要切换`);
            currentTopicIdRef.set(topicId);
            //console.log(`[ChatManager] 📝 话题ID已更新到: ${topicId}`);
            
            const messageRenderer = getMessageRenderer(); 
            if (messageRenderer) {
                messageRenderer.setCurrentTopicId(topicId);
                //console.log(`[ChatManager] 📝 MessageRenderer 话题ID已更新`);
            } else {
                console.warn(`[ChatManager] ⚠️ MessageRenderer 不可用`);
            }
            
            // 添加 has-selection 类以显示工具栏
            const chatView = document.getElementById('chatView');
            if (chatView) {
                chatView.classList.add('has-selection');
            }
            
            let currentSelectedItem = currentSelectedItemRef.get();
            // //console.log(`[ChatManager] 当前选中项目:`, {
            //     id: currentSelectedItem?.id,
            //     type: currentSelectedItem?.type,
            //     name: currentSelectedItem?.name
            // });
            
            // 为新话题显式启动文件监听器（仅当配置存在时）
            const agentConfigForWatcher = currentSelectedItem?.config || currentSelectedItem;
            if (agentConfigForWatcher?.agentDataPath) {
                const historyFilePath = `${agentConfigForWatcher.agentDataPath}\\topics\\${topicId}\\history.json`;
                //console.log(`[ChatManager] 🔍 启动文件监听器: ${historyFilePath}`);
                try {
                    await tauriAPI.invoke('watcher_start', { path: historyFilePath, agentId: currentSelectedItem.id, topicId: topicId });
                    //console.log(`[ChatManager] ✅ 文件监听器启动成功`);
                } catch (e) {
                    //console.log(`[ChatManager] ⚠️ 文件监听器启动失败（可能未实现）:`, e.message);
                    // watcher_start 可能尚未实现，静默忽略
                }
            } else {
                //console.log(`[ChatManager] ⏭️ 跳过文件监听器启动（无agentDataPath）`);
            }

            //console.log(`[ChatManager] 🎨 更新话题列表UI状态`);
            document.querySelectorAll('#topicList .topic-item').forEach(item => {
                const isClickedItem = item.dataset.topicId === topicId && item.dataset.itemId === currentSelectedItem?.id;
                item.classList.toggle('active', isClickedItem);
                item.classList.toggle('active-topic-glowing', isClickedItem);
            });
            
            // 如果当前没有选中项目，等待一小段时间让 selectItem 完成
            if (!currentSelectedItem?.id) {
                console.log('[ChatManager] 当前选中项目为空，等待 selectItem 完成...');
                // 等待最多 2 秒
                for (let i = 0; i < 20; i++) {
                    await new Promise(r => setTimeout(r, 100));
                    currentSelectedItem = currentSelectedItemRef.get();
                    if (currentSelectedItem?.id) {
                        console.log('[ChatManager] 选中项目已就绪:', currentSelectedItem.id);
                        break;
                    }
                }
            }
            
            if (currentSelectedItem?.id) {
                //console.log(`[ChatManager] 🚀 开始加载聊天历史`);
                await loadChatHistory(currentSelectedItem.id, currentSelectedItem.type, topicId);
                //console.log(`[ChatManager] ✅ 聊天历史加载完成`);
                
                localStorage.setItem(`lastActiveTopic_${currentSelectedItem.id}_${currentSelectedItem.type}`, topicId);
                //console.log(`[ChatManager] 💾 话题选择已保存到localStorage`);
            } else {
                console.warn(`[ChatManager] ⚠️ 等待超时，当前选中项目仍为空，跳过历史加载`);
            }
            _saveLastOpenState(); // Save state when a new topic is selected
            //console.log(`[ChatManager] ✅ selectTopic 完成`);
        } else {
            //console.log(`[ChatManager] ⏭️ 话题已经是当前话题，跳过切换`);
        }
    }

    async function handleTopicDeletion(remainingTopics) {
        let currentSelectedItem = currentSelectedItemRef.get();
        const config = currentSelectedItem.config || currentSelectedItem;
        config.topics = remainingTopics;
        currentSelectedItemRef.set(currentSelectedItem);

        if (remainingTopics && remainingTopics.length > 0) {
            const newSelectedTopic = remainingTopics.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
            await selectItem(currentSelectedItem.id, currentSelectedItem.type, currentSelectedItem.name, currentSelectedItem.avatarUrl, (currentSelectedItem.config || currentSelectedItem));
            await loadChatHistory(currentSelectedItem.id, currentSelectedItem.type, newSelectedTopic.id);
            currentTopicIdRef.set(newSelectedTopic.id);
            const messageRenderer = getMessageRenderer(); if (messageRenderer) messageRenderer.setCurrentTopicId(newSelectedTopic.id);
        } else {
            currentTopicIdRef.set(null);
            const messageRenderer = getMessageRenderer(); if (messageRenderer) {
                messageRenderer.setCurrentTopicId(null);
                messageRenderer.clearChat();
                messageRenderer.renderMessage({ role: 'system', content: '所有话题均已删除。请创建一个新话题。', timestamp: Date.now() });
            }
            await displayTopicTimestampBubble(currentSelectedItem.id, currentSelectedItem.type, null);
        }
    }

    async function loadChatHistory(itemId, itemType, topicId) {
        //console.log(`[ChatManager] 🚀 loadChatHistory 开始执行`);
        //console.log(`[ChatManager] 📋 参数: itemId=${itemId}, itemType=${itemType}, topicId=${topicId}`);
        
        const messageRenderer = getMessageRenderer();
        //console.log(`[ChatManager] 📱 MessageRenderer 可用性:`, !!messageRenderer);
        
        if (messageRenderer) {
            //console.log(`[ChatManager] 🧹 清空聊天界面`);
            messageRenderer.clearChat();
        }
        currentChatHistoryRef.set([]);
        //console.log(`[ChatManager] 📝 重置聊天历史引用`);
    
        //console.log(`[ChatManager] 🎨 更新话题列表UI状态`);
        document.querySelectorAll('.topic-list .topic-item').forEach(item => {
            const isCurrent = item.dataset.topicId === topicId && item.dataset.itemId === itemId && item.dataset.itemType === itemType;
            item.classList.toggle('active', isCurrent);
            item.classList.toggle('active-topic-glowing', isCurrent);
        });
    
        if (messageRenderer) {
            //console.log(`[ChatManager] 📝 设置MessageRenderer当前话题ID: ${topicId}`);
            messageRenderer.setCurrentTopicId(topicId);
        }
    
        if (!itemId) {
            const errorMsg = `错误：无法加载聊天记录，${itemType === 'group' ? '群组' : '助手'}ID (${itemId}) 缺失。`;
            console.error(`[ChatManager] ❌ ${errorMsg}`);
            if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: errorMsg, timestamp: Date.now() });
            await displayTopicTimestampBubble(null, null, null);
            return;
        }
    
        if (!topicId) {
            //console.log(`[ChatManager] ⚠️ 话题ID为空，显示选择提示`);
            if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: '请选择或创建一个话题以开始聊天。', timestamp: Date.now() });
            await displayTopicTimestampBubble(itemId, itemType, null);
            return;
        }
    
        // 核心修改：使用 await 确保加载消息被渲染
        if (messageRenderer) {
            //console.log(`[ChatManager] 💬 显示加载中消息`);
            await messageRenderer.renderMessage({ role: 'system', name: '系统', content: '加载聊天记录中...', timestamp: Date.now(), isThinking: true, id: 'loading_history' });
        }
    
        //console.log('[ChatManager] 🔍 准备调用后端API加载聊天历史:', { itemId, itemType, topicId });
        
        let historyResult;
        try {
            if (itemType === 'agent') {
                //console.log(`[ChatManager] 📞 调用 get_chat_history API`);
                historyResult = await tauriAPI.invoke('get_chat_history', { agentId: itemId, topicId: topicId });
                // //console.log('[ChatManager] 📊 Agent 聊天历史API响应:', {
                //     success: !historyResult?.error,
                //     isArray: Array.isArray(historyResult),
                //     length: Array.isArray(historyResult) ? historyResult.length : 'N/A',
                //     error: historyResult?.error,
                //     firstMessage: Array.isArray(historyResult) && historyResult.length > 0 ? {
                //         role: historyResult[0].role,
                //         content: historyResult[0].content?.substring(0, 50) + '...',
                //         timestamp: historyResult[0].timestamp
                //     } : null
                // });
            } else if (itemType === 'group') {
                //console.log(`[ChatManager] 📞 调用 get_group_chat_history API`);
                historyResult = await tauriAPI.invoke('get_group_chat_history', { groupId: itemId, topicId: topicId });
                // //console.log('[ChatManager] 📊 群组聊天历史API响应:', {
                //     success: !historyResult?.error,
                //     isArray: Array.isArray(historyResult),
                //     length: Array.isArray(historyResult) ? historyResult.length : 'N/A',
                //     error: historyResult?.error,
                //     firstMessage: Array.isArray(historyResult) && historyResult.length > 0 ? {
                //         role: historyResult[0].role,
                //         content: historyResult[0].content?.substring(0, 50) + '...',
                //         timestamp: historyResult[0].timestamp
                //     } : null
                // });
            }
        } catch (apiError) {
            console.error(`[ChatManager] ❌ API调用失败:`, apiError);
            historyResult = { error: `API调用异常: ${apiError.message}` };
        }
    
        const currentSelectedItem = currentSelectedItemRef.get();
        const agentConfigForHistory = currentSelectedItem?.config || currentSelectedItem;
        if (agentConfigForHistory?.agentDataPath) {
            const historyFilePath = `${agentConfigForHistory.agentDataPath}\\topics\\${topicId}\\history.json`;
            //console.log(`[ChatManager] 🔍 启动文件监听器: ${historyFilePath}`);
            try {
                await tauriAPI.invoke('watcher_start', { path: historyFilePath, agentId: itemId, topicId: topicId });
                //console.log(`[ChatManager] ✅ 文件监听器启动成功`);
            } catch (e) {
                //console.log(`[ChatManager] ⚠️ 文件监听器启动失败（可能未实现）:`, e.message);
                // watcher_start 可能尚未实现，静默忽略
            }
        }
    
        if (messageRenderer) {
            //console.log(`[ChatManager] 🧹 移除加载中消息`);
            messageRenderer.removeMessageById('loading_history');
        }
    
        //console.log(`[ChatManager] 🎨 显示话题时间戳气泡`);
        await displayTopicTimestampBubble(itemId, itemType, topicId);
    
        if (historyResult && historyResult.error) {
            console.error(`[ChatManager] ❌ 历史记录加载失败:`, historyResult.error);
            if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `加载话题 "${topicId}" 的聊天记录失败: ${historyResult.error}`, timestamp: Date.now() });
        } else if (historyResult && historyResult.length > 0) {
            //console.log(`[ChatManager] ✅ 成功获取 ${historyResult.length} 条历史消息`);
            currentChatHistoryRef.set(historyResult);
            //console.log('[ChatManager] 📝 设置聊天历史到引用，长度:', historyResult.length);
            
            if (messageRenderer) {
                // 使用优化的分批渲染策略
                const renderOptions = {
                    initialBatch: 5,    // 首先显示最新的5条消息
                    batchSize: 10,      // 后续每批10条消息
                    batchDelay: 80      // 批次间延迟80ms，平衡性能和用户体验
                };
                
                //console.log(`[ChatManager] 🎨 开始渲染话题历史，共 ${historyResult.length} 条消息`);
                //console.log('[ChatManager] 🔧 messageRenderer.renderHistory 函数类型:', typeof messageRenderer.renderHistory);
                
                try {
                    //console.log(`[ChatManager] 🚀 调用 messageRenderer.renderHistory`);
                    await messageRenderer.renderHistory(historyResult, renderOptions);
                    //console.log(`[ChatManager] ✅ 话题历史渲染完成`);
                    
                    // 验证DOM中是否真的有消息元素
                    const chatMessagesDiv = document.getElementById('chatMessages');
                    if (chatMessagesDiv) {
                        const messageElements = chatMessagesDiv.querySelectorAll('.message-item:not(.system)');
                        //console.log(`[ChatManager] 🔍 DOM验证: 找到 ${messageElements.length} 个消息元素`);
                        if (messageElements.length === 0 && historyResult.length > 0) {
                            console.error(`[ChatManager] ❌ 严重问题: 有 ${historyResult.length} 条消息但DOM中没有消息元素!`);
                        }
                    } else {
                        console.error(`[ChatManager] ❌ 找不到聊天消息容器 #chatMessages`);
                    }
                } catch (renderError) {
                    console.error('[ChatManager] ❌ renderHistory 渲染错误:', renderError);
                    //console.log(`[ChatManager] 🔄 回退到逐条渲染`);
                    // 回退到逐条渲染
                    for (let i = 0; i < historyResult.length; i++) {
                        const msg = historyResult[i];
                        try {
                            //console.log(`[ChatManager] 🎨 渲染消息 ${i+1}/${historyResult.length}: ${msg.role} - ${msg.content?.substring(0, 30)}...`);
                            await messageRenderer.renderMessage(msg);
                        } catch (e) {
                            console.error(`[ChatManager] ❌ renderMessage 错误 (消息 ${i+1}):`, e);
                        }
                    }
                }
            } else {
                console.error('[ChatManager] ❌ messageRenderer 不可用，无法渲染消息');
            }
    
        } else if (historyResult && historyResult.length === 0) {
            //console.log(`[ChatManager] ℹ️ 话题历史为空 (0条消息)`);
            currentChatHistoryRef.set([]);
        } else {
            console.error(`[ChatManager] ❌ 无效的历史记录数据:`, historyResult);
            if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `加载话题 "${topicId}" 的聊天记录时返回了无效数据。`, timestamp: Date.now() });
        }
    
        if (itemId && topicId && !(historyResult && historyResult.error)) {
            //console.log(`[ChatManager] 💾 保存最后活动话题到localStorage`);
            localStorage.setItem(`lastActiveTopic_${itemId}_${itemType}`, topicId);
        }
        
        //console.log(`[ChatManager] ✅ loadChatHistory 执行完成`);
    }

    async function displayTopicTimestampBubble(itemId, itemType, topicId) {
        const { chatMessagesDiv } = elements;
        const chatMessagesContainer = document.querySelector('.chat-messages-container');

        if (!chatMessagesDiv || !chatMessagesContainer) {
            console.warn('[displayTopicTimestampBubble] Missing chatMessagesDiv or chatMessagesContainer.');
            const existingBubble = document.getElementById('topicTimestampBubble');
            if (existingBubble) existingBubble.style.display = 'none';
            return;
        }

        let timestampBubble = document.getElementById('topicTimestampBubble');
        if (!timestampBubble) {
            timestampBubble = document.createElement('div');
            timestampBubble.id = 'topicTimestampBubble';
            timestampBubble.className = 'topic-timestamp-bubble';
            if (chatMessagesDiv.firstChild) {
                chatMessagesDiv.insertBefore(timestampBubble, chatMessagesDiv.firstChild);
            } else {
                chatMessagesDiv.appendChild(timestampBubble);
            }
        } else {
            if (chatMessagesDiv.firstChild !== timestampBubble) {
                chatMessagesDiv.insertBefore(timestampBubble, chatMessagesDiv.firstChild);
            }
        }

        if (!itemId || !topicId) {
            timestampBubble.style.display = 'none';
            return;
        }

        try {
            let itemConfigFull;
            if (itemType === 'agent') {
                itemConfigFull = await tauriAPI.invoke('get_agent_config', { agentId: itemId });
            } else if (itemType === 'group') {
                itemConfigFull = await tauriAPI.invoke('get_agent_group_config', { groupId: itemId });
            }

            if (itemConfigFull && !itemConfigFull.error && itemConfigFull.topics) {
                const currentTopicObj = itemConfigFull.topics.find(t => t.id === topicId);
                if (currentTopicObj && currentTopicObj.createdAt) {
                    // 不再显示话题创建时间气泡
                    timestampBubble.style.display = 'none';
                } else {
                    // 静默处理：话题不存在或没有创建时间是正常情况（新话题或旧数据）
                    timestampBubble.style.display = 'none';
                }
            } else {
                // 静默处理：无法加载配置时隐藏时间戳气泡
                timestampBubble.style.display = 'none';
            }
        } catch (error) {
            // 静默处理：获取话题创建时间失败时隐藏时间戳气泡
            timestampBubble.style.display = 'none';
        }
    }

    async function attemptTopicSummarizationIfNeeded() {
        const currentSelectedItem = currentSelectedItemRef.get();
        const currentChatHistory = currentChatHistoryRef.get();
        const currentTopicId = currentTopicIdRef.get();

        if (currentSelectedItem.type !== 'agent' || currentChatHistory.length < 4 || !currentTopicId) return;

        try {
            // 强制从文件系统重新加载最新的配置，确保标题检查的准确性
            const agentConfigForSummary = await tauriAPI.invoke('get_agent_config', { agentId: currentSelectedItem.id });
            if (!agentConfigForSummary || agentConfigForSummary.error) {
                console.error('[TopicSummary] 获取最新助手配置失败:', agentConfigForSummary?.error);
                return;
            }
            // 使用最新的配置更新内存中的状态，以保持同步
            if (currentSelectedItem.config) {
                currentSelectedItem.config = agentConfigForSummary;
            } else {
                Object.assign(currentSelectedItem, agentConfigForSummary);
            }
            currentSelectedItemRef.set(currentSelectedItem);

            const topics = agentConfigForSummary.topics || [];
            const currentTopicObject = topics.find(t => t.id === currentTopicId);
            const existingTopicTitle = currentTopicObject ? currentTopicObject.name : "主要对话";
            const currentAgentName = agentConfigForSummary.name || 'AI';

            if (existingTopicTitle === "主要对话" || existingTopicTitle.startsWith("新话题")) {
                const messageRenderer = getMessageRenderer();
                if (messageRenderer && typeof messageRenderer.summarizeTopicFromMessages === 'function') {
                    const summarizedTitle = await messageRenderer.summarizeTopicFromMessages(currentChatHistory.filter(m => !m.isThinking), currentAgentName);
                    if (summarizedTitle) {
                        let saveResult = null;
                        try {
                            saveResult = await tauriAPI.invoke('save_agent_topic_title', { agentId: currentSelectedItem.id, topicId: currentTopicId, title: summarizedTitle });
                        } catch (e) {
                            console.warn('[ChatManager] save_agent_topic_title 失败', e);
                        }
                        if (saveResult && saveResult.success) {
                            // 标题已保存到文件，现在更新内存中的对象以立即反映更改
                            if (currentTopicObject) {
                                currentTopicObject.name = summarizedTitle;
                            }
                            if (document.getElementById('tabContentTopics').classList.contains('active')) {
                                if (topicListManager) topicListManager.loadTopicList();
                            }
                        } else {
                            console.error(`[TopicSummary] 保存新话题标题 "${summarizedTitle}" 失败:`, saveResult.error);
                        }
                    }
                } else {
                    console.error('[TopicSummary] summarizeTopicFromMessages 函数未定义或无法通过 messageRenderer 访问');
                }
            }
        } catch (error) {
            console.error('[TopicSummary] attemptTopicSummarizationIfNeeded 执行时出错:', error);
        }
    }

    async function handleSendMessage() {
        const { messageInput } = elements;
        let content = messageInput.value; // Use let as it might be modified
        const attachedFiles = attachedFilesRef.get();
        const currentSelectedItem = currentSelectedItemRef.get();
        const currentTopicId = currentTopicIdRef.get();
        const globalSettings = globalSettingsRef.get();

        //console.log('[ChatManager handleSendMessage] 📤 准备发送消息');
        //console.log('[ChatManager handleSendMessage] currentSelectedItem:', currentSelectedItem);
        //console.log('[ChatManager handleSendMessage] currentTopicId:', currentTopicId);
        //console.log('[ChatManager handleSendMessage] content:', content);

        if (!content && attachedFiles.length === 0) return;
        if (!currentSelectedItem || !currentSelectedItem.id || !currentTopicId) {
            console.error('[ChatManager handleSendMessage] ❌ 缺少必要信息');
            console.error('[ChatManager handleSendMessage] currentSelectedItem:', currentSelectedItem);
            console.error('[ChatManager handleSendMessage] currentTopicId:', currentTopicId);
            uiHelper.showToastNotification('请先选择一个项目和话题！', 'error');
            return;
        }
        if (!globalSettings.vcpServerUrl) {
            uiHelper.showToastNotification('请先在全局设置中配置VCP服务器URL！', 'error');
            uiHelper.openModal('globalSettingsModal');
            return;
        }

        if (currentSelectedItem.type === 'group') {
            //console.log('[ChatManager] 检测到群组消息，委托给 groupRenderer.handleSendGroupMessage');
            //console.log('[ChatManager] 群组ID:', currentSelectedItem.id, '话题ID:', currentTopicId);
            if (groupRenderer && typeof groupRenderer.handleSendGroupMessage === 'function') {
                groupRenderer.handleSendGroupMessage(
                    currentSelectedItem.id,
                    currentTopicId,
                    { 
                        text: content, 
                        attachments: attachedFiles.map(af => ({ 
                            type: af.file ? af.file.type : 'application/octet-stream', 
                            src: af.localPath, 
                            name: af.originalName, 
                            size: af.file ? af.file.size : 0 
                        })) 
                    },
                    globalSettings.userName || '用户'
                );
            } else {
                console.error('[ChatManager] groupRenderer.handleSendGroupMessage 不可用');
                uiHelper.showToastNotification("群聊功能模块未加载，无法发送消息。", 'error');
            }
            messageInput.value = '';
            attachedFilesRef.set([]);
            if(mainRendererFunctions.updateAttachmentPreview) mainRendererFunctions.updateAttachmentPreview();
            uiHelper.autoResizeTextarea(messageInput);
            // messageInput.focus();
            return;
        }

        //console.log('[ChatManager] 处理Agent消息，Agent ID:', currentSelectedItem.id);

        // --- Standard Agent Message Sending ---
        // The 'content' variable still holds the user's raw input, including the placeholder.
        // We will resolve the placeholder later, only for the final message sent to VCP.
        let combinedTextContent = content; // 用于发送给VCP的组合文本内容
 
        const uiAttachments = [];
        if (attachedFiles.length > 0) {
            for (const af of attachedFiles) {
                const fileManagerData = af._fileManagerData || {};
                uiAttachments.push({
                    type: fileManagerData.type || (af.file ? af.file.type : 'application/octet-stream'),
                    src: af.localPath,
                    name: af.originalName,
                    size: af.file ? af.file.size : 0, // 🔧 防御性检查
                    _fileManagerData: fileManagerData
                });

                // 修正：将文件路径和提取的文本正确地附加到 combinedTextContent
                const filePathForContext = af.localPath || af.originalName;

                if (af.file && af.file.type.startsWith('image/')) {
                    // 对于图片，我们只附加路径，因为内容将作为多模态部分发送
                    combinedTextContent += `\n\n[附加图片: ${filePathForContext}]`;
                } else if (fileManagerData.extractedText) {
                    // 对于有提取文本的文件，同时附加路径和文本
                    combinedTextContent += `

[附加文件: ${filePathForContext}]
${fileManagerData.extractedText}
[/附加文件结束: ${af.originalName}]`;
                } else {
                    // 对于其他文件（如音频、视频、无文本的PDF等），只附加路径
                    combinedTextContent += `\n\n[附加文件: ${filePathForContext}]`;
                }
            }
        }

        const userMessage = {
            role: 'user',
            name: globalSettings.userName || '用户',
            content: content, // Use raw content for UI
            timestamp: Date.now(),
            id: `msg_${Date.now()}_user_${Math.random().toString(36).substring(2, 9)}`,
            attachments: uiAttachments
        };
        
        const messageRenderer = getMessageRenderer();
        if (messageRenderer) {
            await messageRenderer.renderMessage(userMessage);
        }
        // Manually update history after rendering
        const currentChatHistory = currentChatHistoryRef.get();
        currentChatHistory.push(userMessage);
        currentChatHistoryRef.set(currentChatHistory);

        // 保存包含用户消息的历史记录，在添加思考消息或进行 API 调用之前
        await tauriAPI.invoke('save_chat_history', { agentId: currentSelectedItem.id, topicId: currentTopicId, messages: currentChatHistory });

        // 保存后（标记话题为已读），刷新项目列表以更新未读计数
        if (itemListManager && typeof itemListManager.loadItems === 'function') {
            try {
                await itemListManager.loadItems();
            } catch (error) {
                console.warn('[ChatManager] 刷新项目列表失败（不影响功能）:', error.message);
            }
        }

        messageInput.value = '';
        attachedFilesRef.set([]);
        if(mainRendererFunctions.updateAttachmentPreview) mainRendererFunctions.updateAttachmentPreview();
        
        // 发送后，如果画布窗口仍然打开，恢复占位符
        if (isCanvasWindowOpen) {
            messageInput.value = CANVAS_PLACEHOLDER;
        }
        uiHelper.autoResizeTextarea(messageInput);
        // messageInput.focus(); // 核心修正：注释掉此行。这是导致AI流式输出时，即使向上滚动也会被强制拉回底部的根源。

        const agentConfig = currentSelectedItem.config || currentSelectedItem;
        const modelName = (agentConfig && agentConfig.model) ? agentConfig.model : 'gemini-pro';
        
        const thinkingMessageId = `msg_${Date.now()}_assistant_${Math.random().toString(36).substring(2, 9)}`;
        const thinkingMessage = {
            role: 'assistant',
            name: modelName || currentSelectedItem.name || currentSelectedItem.id || 'AI',
            content: '思考中',
            timestamp: Date.now(),
            id: thinkingMessageId,
            isThinking: true,
            avatarUrl: currentSelectedItem.avatarUrl,
            avatarColor: (currentSelectedItem.config || currentSelectedItem)?.avatarCalculatedColor
        };

        let thinkingMessageItem = null;
        if (messageRenderer) {
            thinkingMessageItem = await messageRenderer.renderMessage(thinkingMessage);
        }
        // 手动更新历史记录，添加思考消息
        const currentChatHistoryWithThinking = currentChatHistoryRef.get();
        currentChatHistoryWithThinking.push(thinkingMessage);
        currentChatHistoryRef.set(currentChatHistoryWithThinking);

        try {
            // agentConfig 已在上面定义
            const currentChatHistory = currentChatHistoryRef.get();
            
            // 获取工具栏设置
            const toolbarSettings = window.ChatToolbar?.getToolbarSettings() || {};
            const isIndependentQA = toolbarSettings.independentQA; // independentQA 为 true 表示独立问答（无上下文）
            
            console.log('[ChatManager] 发送消息 - 工具栏设置:', { 
                independentQA: isIndependentQA, 
                模式: isIndependentQA ? '无上下文' : '带上下文',
                历史消息总数: currentChatHistory.length
            });
            
            // 过滤掉 thinking 消息和系统消息（系统提示词会在后面重新添加）
            let historySnapshotForVCP;
            if (isIndependentQA) {
                // 独立问答（无上下文）：只包含当前用户消息
                historySnapshotForVCP = currentChatHistory.filter(msg => 
                    msg.id === userMessage.id
                );
                console.log('[ChatManager] 无上下文模式 - 只发送当前消息');
            } else {
                // 带上下文：包含历史消息
                historySnapshotForVCP = currentChatHistory.filter(msg => 
                    msg.id !== thinkingMessage.id && 
                    !msg.isThinking && 
                    msg.role !== 'system'
                );
                console.log('[ChatManager] 带上下文模式 - 发送历史消息数量:', historySnapshotForVCP.length);
            }

            const messagesForVCP = await Promise.all(historySnapshotForVCP.map(async msg => {
                let vcpImageAttachmentsPayload = [];
                let vcpAudioAttachmentsPayload = [];
                let vcpVideoAttachmentsPayload = [];
                let currentMessageTextContent = msg.content;

                // --- 应用正则规则（后端/上下文）---
                if (agentConfig?.stripRegexes && Array.isArray(agentConfig.stripRegexes) && agentConfig.stripRegexes.length > 0) {
                    // --- 按“对话轮次”计算深度 ---
                    const turns = [];
                    for (let i = historySnapshotForVCP.length - 1; i >= 0; i--) {
                        if (historySnapshotForVCP[i].role === 'assistant') {
                            const turn = { assistant: historySnapshotForVCP[i], user: null };
                            if (i > 0 && historySnapshotForVCP[i - 1].role === 'user') {
                                turn.user = historySnapshotForVCP[i - 1];
                                i--; // 跳过用户消息，因为已经配对
                            }
                            turns.unshift(turn);
                        } else if (historySnapshotForVCP[i].role === 'user') {
                            // 处理末尾的单个用户消息
                            turns.unshift({ assistant: null, user: historySnapshotForVCP[i] });
                        }
                    }
                    
                    // 找到当前消息所在的轮次
                    const turnIndex = turns.findIndex(t => (t.assistant && t.assistant.id === msg.id) || (t.user && t.user.id === msg.id));
                    const depth = turnIndex !== -1 ? (turns.length - 1 - turnIndex) : -1;

                    if (depth !== -1) {
                        // 应用规则到消息内容
                        currentMessageTextContent = applyRegexRules(
                            currentMessageTextContent,
                            agentConfig.stripRegexes,
                            'context',  // 这里处理的是发送给AI的上下文
                            msg.role,
                            depth
                        );
                    }
                    // --- 深度计算和应用结束 ---
                }
                // --- 正则规则应用结束 ---

                if (msg.role === 'user' && msg.id === userMessage.id) {
                    // 关键修复：使用已经包含附件内容的 combinedTextContent
                    currentMessageTextContent = combinedTextContent;
                    
                    // IMPORTANT: We need to handle Canvas placeholder WITHOUT overwriting the combined content
                    // First, check if we need to replace Canvas placeholder
                    if (currentMessageTextContent.includes(CANVAS_PLACEHOLDER)) {
                        try {
                            const canvasData = await tauriAPI.invoke('get_latest_canvas_content', {});
                            if (canvasData && !canvasData.error) {
                                const formattedCanvasContent = `
[Canvas Content]
${canvasData.content || ''}
[Canvas Path]
${canvasData.path || 'No file path'}
[Canvas Errors]
${canvasData.errors || 'No errors'}
`;
                                // Replace Canvas placeholder in the combined content
                                currentMessageTextContent = currentMessageTextContent.replace(new RegExp(CANVAS_PLACEHOLDER, 'g'), formattedCanvasContent);
                            } else {
                                console.error("Failed to get latest canvas content:", canvasData?.error);
                                currentMessageTextContent = currentMessageTextContent.replace(new RegExp(CANVAS_PLACEHOLDER, 'g'), '\n[Canvas content could not be loaded]\n');
                            }
                        } catch (error) {
                            console.error("Error fetching canvas content:", error);
                            currentMessageTextContent = currentMessageTextContent.replace(new RegExp(CANVAS_PLACEHOLDER, 'g'), '\n[Error loading canvas content]\n');
                        }
                    }
                } else if (msg.attachments && msg.attachments.length > 0) {
                    let historicalAppendedText = "";
                    for (const att of msg.attachments) {
                        const fileManagerData = att._fileManagerData || {};
                        // 优先使用 att.src，因为它代表前端的本地可访问路径
                        // 后备到 internalPath（来自 fileManager），最后才是文件名
                        const filePathForContext = att.src || (fileManagerData.internalPath ? fileManagerData.internalPath.replace('file://', '') : (att.name || '未知文件'));

                        if (fileManagerData.imageFrames && fileManagerData.imageFrames.length > 0) {
                             historicalAppendedText += `\n\n[附加文件: ${filePathForContext} (扫描版PDF，已转换为图片)]`;
                        } else if (fileManagerData.extractedText) {
                            historicalAppendedText += `

[附加文件: ${filePathForContext}]
${fileManagerData.extractedText}
[/附加文件结束: ${att.name || '未知文件'}]`;
                        } else {
                            // 对于没有提取文本的文件（如音视频），只附加路径
                            historicalAppendedText += `\n\n[附加文件: ${filePathForContext}]`;
                        }
                    }
                    currentMessageTextContent += historicalAppendedText;
                }

                if (msg.attachments && msg.attachments.length > 0) {
                    // --- IMAGE PROCESSING ---
                    const imageAttachmentsPromises = msg.attachments.map(async att => {
                        const fileManagerData = att._fileManagerData || {};
                        // Case 1: Scanned PDF converted to image frames
                        if (fileManagerData.imageFrames && fileManagerData.imageFrames.length > 0) {
                            return fileManagerData.imageFrames.map(frameData => ({
                                type: 'image_url',
                                image_url: { url: `data:image/jpeg;base64,${frameData}` }
                            }));
                        }
                        // Case 2: Regular image file (including GIFs that get framed)
                        if (att.type.startsWith('image/')) {
                            try {
                                const result = await tauriAPI.invoke('get_file_as_base64', { path: att.src });
                                if (result && result.success) {
                                    return result.base64Frames.map(frameData => ({
                                        type: 'image_url',
                                        image_url: { url: `data:image/jpeg;base64,${frameData}` }
                                    }));
                                } else {
                                    const errorMsg = result ? result.error : '未知错误';
                                    console.error(`Failed to get Base64 for ${att.name}: ${errorMsg}`);
                                    uiHelper.showToastNotification(`处理图片 ${att.name} 失败: ${errorMsg}`, 'error');
                                    return null;
                                }
                            } catch (processingError) {
                                console.error(`Exception during getBase64 for ${att.name}:`, processingError);
                                uiHelper.showToastNotification(`处理图片 ${att.name} 时发生异常: ${processingError.message}`, 'error');
                                return null;
                            }
                        }
                        return null; // Not an image or a convertible PDF
                    });

                    const nestedImageAttachments = await Promise.all(imageAttachmentsPromises);
                    const flatImageAttachments = nestedImageAttachments.flat().filter(Boolean);
                    vcpImageAttachmentsPayload.push(...flatImageAttachments);

                    // --- AUDIO PROCESSING ---
                    const supportedAudioTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac'];
                    const audioAttachmentsPromises = msg.attachments
                        .filter(att => supportedAudioTypes.includes(att.type))
                        .map(async att => {
                            try {
                                const result = await tauriAPI.invoke('get_file_as_base64', { path: att.src });
                                if (result && result.success) {
                                    return result.base64Frames.map(frameData => ({
                                        type: 'image_url',
                                        image_url: { url: `data:${att.type};base64,${frameData}` }
                                    }));
                                } else {
                                    const errorMsg = result ? result.error : '未知错误';
                                    console.error(`[ChatManager] 获取音频 ${att.name} 的 Base64 失败: ${errorMsg}`);
                                    uiHelper.showToastNotification(`处理音频 ${att.name} 失败: ${errorMsg}`, 'error');
                                    return null;
                                }
                            } catch (processingError) {
                                console.error(`[ChatManager] 获取音频 ${att.name} 的 Base64 时发生异常:`, processingError);
                                uiHelper.showToastNotification(`处理音频 ${att.name} 时发生异常: ${processingError.message}`, 'error');
                                return null;
                            }
                        });
                    const nestedAudioAttachments = await Promise.all(audioAttachmentsPromises);
                    vcpAudioAttachmentsPayload.push(...nestedAudioAttachments.flat().filter(Boolean));

                    // --- VIDEO PROCESSING ---
                    const videoAttachmentsPromises = msg.attachments
                        .filter(att => att.type.startsWith('video/'))
                        .map(async att => {
                            try {
                                const result = await tauriAPI.invoke('get_file_as_base64', { path: att.src });
                                if (result && result.success) {
                                    return result.base64Frames.map(frameData => ({
                                        type: 'image_url',
                                        image_url: { url: `data:${att.type};base64,${frameData}` }
                                    }));
                                } else {
                                    const errorMsg = result ? result.error : '未知错误';
                                    console.error(`[ChatManager] 获取视频 ${att.name} 的 Base64 失败: ${errorMsg}`);
                                    uiHelper.showToastNotification(`处理视频 ${att.name} 失败: ${errorMsg}`, 'error');
                                    return null;
                                }
                            } catch (processingError) {
                                console.error(`[ChatManager] 获取视频 ${att.name} 的 Base64 时发生异常:`, processingError);
                                uiHelper.showToastNotification(`处理视频 ${att.name} 时发生异常: ${processingError.message}`, 'error');
                                return null;
                            }
                        });
                    const nestedVideoAttachments = await Promise.all(videoAttachmentsPromises);
                    vcpVideoAttachmentsPayload.push(...nestedVideoAttachments.flat().filter(Boolean));
                }

                let finalContentPartsForVCP = [];
                if (currentMessageTextContent && currentMessageTextContent.trim() !== '') {
                    finalContentPartsForVCP.push({ type: 'text', text: currentMessageTextContent });
                }
                finalContentPartsForVCP.push(...vcpImageAttachmentsPayload);
                finalContentPartsForVCP.push(...vcpAudioAttachmentsPayload);
                finalContentPartsForVCP.push(...vcpVideoAttachmentsPayload);

                if (finalContentPartsForVCP.length === 0 && msg.role === 'user') {
                     finalContentPartsForVCP.push({ type: 'text', text: '(用户发送了附件，但无文本或图片内容)' });
                }
                
                // 如果只有纯文本内容（没有图片/音频/视频），使用字符串格式
                // 如果有多模态内容，使用数组格式
                let finalContent;
                const hasMultimodalContent = vcpImageAttachmentsPayload.length > 0 || 
                                             vcpAudioAttachmentsPayload.length > 0 || 
                                             vcpVideoAttachmentsPayload.length > 0;
                
                if (hasMultimodalContent) {
                    // 多模态消息：使用数组格式
                    finalContent = finalContentPartsForVCP;
                } else if (finalContentPartsForVCP.length === 1 && finalContentPartsForVCP[0].type === 'text') {
                    // 纯文本消息：使用字符串格式
                    finalContent = finalContentPartsForVCP[0].text;
                } else if (finalContentPartsForVCP.length === 0) {
                    // 空内容：使用原始内容或空字符串
                    finalContent = typeof msg.content === 'string' ? msg.content : '';
                } else {
                    finalContent = finalContentPartsForVCP;
                }
                
                return { role: msg.role, content: finalContent };
            }));

            if (agentConfig && agentConfig.systemPrompt) {
                let systemPromptContent = agentConfig.systemPrompt.replace(/\{\{AgentName\}\}/g, agentConfig.name || currentSelectedItem.id);
                const prependedContent = [];

                // 任务2: 注入聊天记录文件路径
                // 假设 agentConfig 对象中包含一个 agentDataPath 属性，该属性由主进程在加载代理配置时提供。
                if (agentConfig.agentDataPath && currentTopicId) {
                    // 修正：currentTopicId 本身就包含 "topic_" 前缀，无需重复添加
                    const historyPath = `${agentConfig.agentDataPath}\\topics\\${currentTopicId}\\history.json`;
                    prependedContent.push(`当前聊天记录文件路径: ${historyPath}`);
                }

                // 已移除：不再注入话题创建时间到系统提示词

                if (prependedContent.length > 0) {
                    systemPromptContent = prependedContent.join('\n') + '\n\n' + systemPromptContent;
                }

                messagesForVCP.unshift({ role: 'system', content: systemPromptContent });
            }

            const useStreaming = (agentConfig && agentConfig.streamOutput !== undefined) ? (agentConfig.streamOutput === true || agentConfig.streamOutput === 'true') : true;
            const modelConfigForVCP = {
                model: (agentConfig && agentConfig.model) ? agentConfig.model : 'gemini-pro',
                temperature: (agentConfig && agentConfig.temperature !== undefined) ? parseFloat(agentConfig.temperature) : 0.7,
                ...(agentConfig && agentConfig.maxOutputTokens && { max_tokens: parseInt(agentConfig.maxOutputTokens) }),
                ...(agentConfig && agentConfig.top_p !== undefined && agentConfig.top_p !== null && { top_p: parseFloat(agentConfig.top_p) }),
                ...(agentConfig && agentConfig.top_k !== undefined && agentConfig.top_k !== null && { top_k: parseInt(agentConfig.top_k) }),
                stream: useStreaming
            };

            // 如果启用流式模式，启动流式消息渲染
            const mr = getMessageRenderer();
            if (useStreaming && mr) {
                await new Promise(resolve => setTimeout(resolve, 100));
                await mr.startStreamingMessage({ ...thinkingMessage, content: "" }, thinkingMessageItem);
            }

            const context = {
                agentId: currentSelectedItem.id,
                agentName: currentSelectedItem.name || currentSelectedItem.id, // 修复：为单聊上下文添加 agentName，并使用 ID 作为回退
                topicId: currentTopicId,
                isGroupMessage: false
            };

            const vcpResponse = await tauriAPI.invoke('send_message_to_vcp', {
                agentId: currentSelectedItem ? currentSelectedItem.id : '',
                topicId: currentTopicId || '',
                vcpUrl: globalSettings.vcpServerUrl,
                vcpApiKey: globalSettings.vcpApiKey || '',
                messages: messagesForVCP,
                modelConfig: {
                    model: agentConfig.model || 'default-model',
                    temperature: agentConfig.temperature || 0.7,
                    stream: useStreaming,
                    max_tokens: agentConfig.maxOutputTokens || 4096
                },
                messageId: thinkingMessage.id,
                isGroupCall: false,
                context
            });

            if (useStreaming) {
                // 流式模式：响应通过 Tauri 事件处理，这里只检查是否启动成功
                if (vcpResponse && vcpResponse.streamingStarted) {
                    //console.log('[ChatManager] 流式传输启动成功');
                    // 流式数据通过 vcp-stream-event 事件处理
                } else if (typeof vcpResponse === 'string') {
                    // 错误响应
                    const mr = getMessageRenderer();
                    if (mr) {
                        mr.removeMessageById(thinkingMessage.id);
                        mr.renderMessage({ role: 'system', content: `VCP错误: ${vcpResponse}`, timestamp: Date.now() });
                    }
                }
            } else {
                // 非流式模式：直接处理响应
                // 响应格式: { timestamp, content, context }
                // 移除思考中消息
                const mr = getMessageRenderer();
                if (mr) mr.removeMessageById(thinkingMessage.id);

                // 检查是否有错误
                if (typeof vcpResponse === 'string') {
                    // 错误响应是字符串
                    if (mr) {
                        mr.renderMessage({ role: 'system', content: `VCP错误: ${vcpResponse}`, timestamp: Date.now() });
                    }
                    console.error(`[ChatManager] VCP Error:`, vcpResponse);
                } else if (vcpResponse && vcpResponse.content) {
                    // 成功响应，从 Rust 后端获取内容
                    const assistantMessageContent = vcpResponse.content;
                    const responseContext = vcpResponse.context || context;
                    
                    const assistantMessage = {
                        role: 'assistant',
                        name: responseContext?.modelName || responseContext?.agentName || currentSelectedItem.name || currentSelectedItem.id || 'AI',
                        avatarUrl: currentSelectedItem.avatarUrl,
                        avatarColor: (currentSelectedItem.config || currentSelectedItem)?.avatarCalculatedColor,
                        content: assistantMessageContent,
                        timestamp: vcpResponse.timestamp || Date.now(),
                        id: `msg_${vcpResponse.timestamp || Date.now()}_assistant_${Math.random().toString(36).substring(2, 9)}`,
                        agentId: currentSelectedItem.id,
                        finishReason: 'completed'
                    };

                    // 更新聊天历史
                    const currentHistory = currentChatHistoryRef.get();
                    const finalHistory = currentHistory.filter(msg => msg.id !== thinkingMessage.id && !msg.isThinking);
                    finalHistory.push(assistantMessage);
                    currentChatHistoryRef.set(finalHistory);
                    
                    // 渲染助手消息
                    if (mr) mr.renderMessage(assistantMessage);
                    
                    // 尝试话题摘要
                    await attemptTopicSummarizationIfNeeded();
                } else {
                    // 未知响应格式
                    console.error('[ChatManager] 未知的 VCP 响应格式:', vcpResponse);
                    if (mr) {
                        mr.renderMessage({ role: 'system', content: 'VCP返回了未知格式的响应。', timestamp: Date.now() });
                    }
                }
            }
        } catch (error) {
            console.error('[ChatManager] 发送消息或处理VCP响应时出错:', error);
            const mr = getMessageRenderer();
            if (mr) {
                mr.removeMessageById(thinkingMessage.id);
                mr.renderMessage({ role: 'system', content: `错误: ${error.message}`, timestamp: Date.now() });
            }
            if(currentSelectedItem.id && currentTopicId) {
                await tauriAPI.invoke('save_chat_history', { agentId: currentSelectedItem.id, topicId: currentTopicId, messages: currentChatHistoryRef.get().filter(msg => !msg.isThinking) });
            }
        }
    }

    /**
     * 重新生成AI回复（不重复显示用户消息）
     * @param {Array} historyBeforeAssistant - assistant消息之前的历史记录
     * @param {Object} userMessage - 触发该assistant回复的用户消息
     */
    async function regenerateResponse(historyBeforeAssistant, userMessage) {
        const currentSelectedItem = currentSelectedItemRef.get();
        const currentTopicId = currentTopicIdRef.get();
        const globalSettings = globalSettingsRef.get();

        if (!currentSelectedItem?.id || !currentTopicId) {
            uiHelper.showToastNotification('请先选择一个项目和话题！', 'error');
            return;
        }

        // 创建思考中消息
        const agentConfig = currentSelectedItem.config || currentSelectedItem;
        const modelName = (agentConfig && agentConfig.model) ? agentConfig.model : 'gemini-pro';
        
        const thinkingMessageId = `msg_${Date.now()}_assistant_${Math.random().toString(36).substring(2, 9)}`;
        const thinkingMessage = {
            role: 'assistant',
            name: modelName || currentSelectedItem.name || currentSelectedItem.id || 'AI',
            content: '思考中',
            timestamp: Date.now(),
            id: thinkingMessageId,
            isThinking: true,
            avatarUrl: currentSelectedItem.avatarUrl,
            avatarColor: (currentSelectedItem.config || currentSelectedItem)?.avatarCalculatedColor
        };

        const messageRenderer = getMessageRenderer();
        let thinkingMessageItem = null;
        if (messageRenderer) {
            thinkingMessageItem = await messageRenderer.renderMessage(thinkingMessage);
        }

        try {
            const agentConfig = currentSelectedItem.config || currentSelectedItem;
            
            // 构建发送给VCP的消息历史（包含用户消息）
            const historyForVCP = [...historyBeforeAssistant, userMessage].filter(msg => 
                !msg.isThinking && msg.role !== 'system'
            );

            // 处理消息内容（与handleSendMessage中的逻辑相同）
            const messagesForVCP = await Promise.all(historyForVCP.map(async msg => {
                let vcpImageAttachmentsPayload = [];
                let currentMessageTextContent = msg.content;

                if (typeof msg.content === 'object' && msg.content.text) {
                    currentMessageTextContent = msg.content.text;
                }

                // 处理附件（简化版，只处理图片）
                if (msg.attachments && msg.attachments.length > 0) {
                    const imageAttachmentsPromises = msg.attachments
                        .filter(att => att.type && att.type.startsWith('image/'))
                        .map(async att => {
                            try {
                                const result = await tauriAPI.invoke('get_file_as_base64', { path: att.src });
                                if (result && result.success) {
                                    return result.base64Frames.map(frameData => ({
                                        type: 'image_url',
                                        image_url: { url: `data:${att.type};base64,${frameData}` }
                                    }));
                                }
                            } catch (e) {
                                console.error(`处理图片 ${att.name} 失败:`, e);
                            }
                            return null;
                        });

                    const nestedImageAttachments = await Promise.all(imageAttachmentsPromises);
                    vcpImageAttachmentsPayload.push(...nestedImageAttachments.flat().filter(Boolean));
                }

                let finalContent;
                if (vcpImageAttachmentsPayload.length > 0) {
                    const contentParts = [];
                    if (currentMessageTextContent && currentMessageTextContent.trim() !== '') {
                        contentParts.push({ type: 'text', text: currentMessageTextContent });
                    }
                    contentParts.push(...vcpImageAttachmentsPayload);
                    finalContent = contentParts;
                } else {
                    finalContent = currentMessageTextContent || '';
                }

                return { role: msg.role, content: finalContent };
            }));

            // 添加系统提示词
            if (agentConfig && agentConfig.systemPrompt) {
                let systemPromptContent = agentConfig.systemPrompt.replace(/\{\{AgentName\}\}/g, agentConfig.name || currentSelectedItem.id);
                messagesForVCP.unshift({ role: 'system', content: systemPromptContent });
            }

            const useStreaming = (agentConfig && agentConfig.streamOutput !== undefined) ? 
                (agentConfig.streamOutput === true || agentConfig.streamOutput === 'true') : true;
            
            const modelConfigForVCP = {
                model: (agentConfig && agentConfig.model) ? agentConfig.model : 'gemini-pro',
                temperature: (agentConfig && agentConfig.temperature !== undefined) ? parseFloat(agentConfig.temperature) : 0.7,
                ...(agentConfig && agentConfig.maxOutputTokens && { max_tokens: parseInt(agentConfig.maxOutputTokens) }),
                stream: useStreaming
            };

            // 启动流式消息渲染
            const mr = getMessageRenderer();
            if (useStreaming && mr) {
                await new Promise(resolve => setTimeout(resolve, 100));
                await mr.startStreamingMessage({ ...thinkingMessage, content: "" }, thinkingMessageItem);
            }

            const context = {
                agentId: currentSelectedItem.id,
                agentName: currentSelectedItem.name || currentSelectedItem.id,
                topicId: currentTopicId,
                isGroupMessage: false
            };

            // 调用VCP API
            const vcpResponse = await tauriAPI.invoke('send_message_to_vcp', {
                agentId: currentSelectedItem.id,
                topicId: currentTopicId,
                vcpUrl: globalSettings.vcpServerUrl,
                vcpApiKey: globalSettings.vcpApiKey || '',
                messages: messagesForVCP,
                modelConfig: modelConfigForVCP,
                messageId: thinkingMessage.id,
                isGroupCall: false,
                context
            });

            if (useStreaming) {
                if (vcpResponse && vcpResponse.streamingStarted) {
                    //console.log('[ChatManager] 重新生成：流式传输启动成功');
                } else if (typeof vcpResponse === 'string') {
                    if (mr) {
                        mr.removeMessageById(thinkingMessage.id);
                        mr.renderMessage({ role: 'system', content: `VCP错误: ${vcpResponse}`, timestamp: Date.now() });
                    }
                }
            } else {
                // 非流式模式处理
                if (mr) mr.removeMessageById(thinkingMessage.id);
                
                if (typeof vcpResponse === 'string') {
                    if (mr) {
                        mr.renderMessage({ role: 'system', content: `VCP错误: ${vcpResponse}`, timestamp: Date.now() });
                    }
                } else if (vcpResponse && vcpResponse.content) {
                    const assistantMessage = {
                        role: 'assistant',
                        name: modelName || currentSelectedItem.name || currentSelectedItem.id || 'AI',
                        avatarUrl: currentSelectedItem.avatarUrl,
                        avatarColor: (currentSelectedItem.config || currentSelectedItem)?.avatarCalculatedColor,
                        content: vcpResponse.content,
                        timestamp: Date.now(),
                        id: `msg_${Date.now()}_assistant_${Math.random().toString(36).substring(2, 9)}`,
                        finishReason: 'completed'
                    };

                    if (mr) {
                        await mr.renderMessage(assistantMessage);
                    }

                    // 更新历史记录
                    const currentHistory = currentChatHistoryRef.get();
                    currentHistory.push(assistantMessage);
                    currentChatHistoryRef.set(currentHistory);

                    // 保存历史记录
                    await tauriAPI.invoke('save_chat_history', {
                        agentId: currentSelectedItem.id,
                        topicId: currentTopicId,
                        messages: currentHistory
                    });
                }
            }
        } catch (error) {
            console.error('[ChatManager] 重新生成回复失败:', error);
            if (messageRenderer) {
                messageRenderer.removeMessageById(thinkingMessageId);
                messageRenderer.renderMessage({
                    role: 'system',
                    content: `重新生成失败: ${error.message}`,
                    timestamp: Date.now()
                });
            }
            uiHelper.showToastNotification(`重新生成失败: ${error.message}`, 'error');
        }
    }

    async function createNewTopicForItem(itemId, itemType) {
        if (!itemId) {
            uiHelper.showToastNotification("请先选择一个项目。", 'error');
            return;
        }
        
        //console.log(`[ChatManager] createNewTopicForItem 被调用: itemId=${itemId}, itemType=${itemType}`);
        const currentSelectedItem = currentSelectedItemRef.get();
        //console.log(`[ChatManager] 当前选中项目:`, currentSelectedItem);
        
        const itemName = currentSelectedItem.name || (itemType === 'group' ? "当前群组" : "当前助手");
        const newTopicName = `新话题 ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
        
        try {
            let result;
            if (itemType === 'agent') {
                //console.log(`[ChatManager] 为Agent创建话题: agentId=${itemId}`);
                result = await tauriAPI.invoke('create_new_topic', { agentId: itemId, topicName: newTopicName });
            } else if (itemType === 'group') {
                //console.log(`[ChatManager] 为Group创建话题: groupId=${itemId}`);
                // 🔧 修复：群组应该调用 create_group_topic，而不是 create_new_topic
                result = await tauriAPI.invoke('create_group_topic', { groupId: itemId, topicName: newTopicName });
            }

            if (result && result.success && result.topicId) {
                currentTopicIdRef.set(result.topicId);
                currentChatHistoryRef.set([]);
                
                const messageRenderer = getMessageRenderer(); if (messageRenderer) {
                    messageRenderer.setCurrentTopicId(result.topicId);
                    messageRenderer.clearChat();
                    // messageRenderer.renderMessage({ role: 'system', content: `新话题 "${result.topicName}" 已开始。`, timestamp: Date.now() });
                }
                localStorage.setItem(`lastActiveTopic_${itemId}_${itemType}`, result.topicId);
                
                // 🔧 关键修复：为新建的话题启动文件监听器
                const agentConfigForWatcher = currentSelectedItem.config || currentSelectedItem;
                if (tauriAPI.watcherStart && agentConfigForWatcher?.agentDataPath) {
                    const historyFilePath = `${agentConfigForWatcher.agentDataPath}\\topics\\${result.topicId}\\history.json`;
                    await tauriAPI.watcherStart(historyFilePath, itemId, result.topicId);
                    //console.log(`[ChatManager] 为新话题启动文件监听器: ${result.topicId}`);
                }
                
                // 🔧 修复：无论在哪个标签页，都要刷新话题列表
                if (topicListManager) {
                    await topicListManager.loadTopicList();
                    //console.log(`[ChatManager] 话题列表已刷新，新话题ID: ${result.topicId}`);
                }
                
                await displayTopicTimestampBubble(itemId, itemType, result.topicId);
                
                // 🔧 修复：使用传入的话题名称，如果后端没返回则使用我们创建时的名称
                const displayTopicName = result.topicName || newTopicName;
                uiHelper.showToastNotification(`新话题 "${displayTopicName}" 已创建`, 'success');
                //console.log(`[ChatManager] 新话题创建成功: ${displayTopicName} (ID: ${result.topicId})`);
                // elements.messageInput.focus();
            } else {
                uiHelper.showToastNotification(`创建新话题失败: ${result ? result.error : '未知错误'}`, 'error');
            }
        } catch (error) {
            console.error(`[ChatManager] 创建新话题时出错:`, error);
            uiHelper.showToastNotification(`创建新话题时出错: ${error.message}`, 'error');
        }
    }


    async function handleCreateBranch(selectedMessage) {
        const currentSelectedItem = currentSelectedItemRef.get();
        const currentTopicId = currentTopicIdRef.get();
        const currentChatHistory = currentChatHistoryRef.get();
        const itemType = currentSelectedItem.type;

        if ((itemType !== 'agent' && itemType !== 'group') || !currentSelectedItem.id || !currentTopicId || !selectedMessage) {
            uiHelper.showToastNotification("无法创建分支：当前非Agent/群组聊天或缺少必要信息。", 'error');
            return;
        }

        const messageId = selectedMessage.id;
        const messageIndex = currentChatHistory.findIndex(msg => msg.id === messageId);

        if (messageIndex === -1) {
            uiHelper.showToastNotification("无法创建分支：在当前聊天记录中未找到选定消息。", 'error');
            return;
        }

        const historyForNewBranch = currentChatHistory.slice(0, messageIndex + 1);
        if (historyForNewBranch.length === 0) {
            uiHelper.showToastNotification("无法创建分支：没有可用于创建分支的消息。", 'error');
            return;
        }

        try {
            let itemConfig, originalTopic, createResult, saveResult;
            const itemId = currentSelectedItem.id;

            if (itemType === 'agent') {
                itemConfig = await tauriAPI.invoke('get_agent_config', { agentId: itemId });
            } else { // group
                itemConfig = await tauriAPI.invoke('get_agent_group_config', { groupId: itemId });
            }

            if (!itemConfig || itemConfig.error) {
                uiHelper.showToastNotification(`创建分支失败：无法获取${itemType === 'agent' ? '助手' : '群组'}配置。 ${itemConfig?.error || ''}`, 'error');
                return;
            }

            originalTopic = itemConfig.topics.find(t => t.id === currentTopicId);
            const originalTopicName = originalTopic ? originalTopic.name : "未命名话题";
            const newBranchTopicName = `${originalTopicName} (分支)`;

            if (itemType === 'agent') {
                createResult = await tauriAPI.invoke('create_new_topic', { agentId: itemId, topicName: newBranchTopicName, isBranch: true });
            } else { // group
                createResult = await tauriAPI.invoke('create_group_topic', { groupId: itemId, topicName: newBranchTopicName, isBranch: true });
            }

            if (!createResult || !createResult.success || !createResult.topicId) {
                uiHelper.showToastNotification(`创建分支话题失败: ${createResult ? createResult.error : '未知错误'}`, 'error');
                return;
            }

            const newTopicId = createResult.topicId;

            if (itemType === 'agent') {
                saveResult = await tauriAPI.invoke('save_chat_history', { agentId: itemId, topicId: newTopicId, messages: historyForNewBranch });
            } else { // group
                saveResult = await tauriAPI.invoke('save_group_chat_history', { groupId: itemId, topicId: newTopicId, messages: historyForNewBranch });
            }

            if (saveResult !== undefined && saveResult.success === false) {
                uiHelper.showToastNotification(`无法将历史记录保存到新的分支话题: ${saveResult.error || '未知错误'}`, 'error');
                // 清理空的分支话题
                if (itemType === 'agent') {
                    tauriAPI.invoke('delete_topic', { agentId: itemId, topicId: newTopicId }).catch(err => {
                        console.warn('[ChatManager] delete_topic 失败', err);
                    });
                } else { // group
                    tauriAPI.invoke('delete_group_topic', { groupId: itemId, topicId: newTopicId }).catch(err => {
                        console.warn('[ChatManager] delete_group_topic 失败', err);
                    });
                }
                return;
            }

            currentTopicIdRef.set(newTopicId);
            const messageRenderer = getMessageRenderer(); if (messageRenderer) messageRenderer.setCurrentTopicId(newTopicId);
            
            if (document.getElementById('tabContentTopics').classList.contains('active')) {
                if (topicListManager) await topicListManager.loadTopicList();
            }
            await loadChatHistory(itemId, itemType, newTopicId);
            localStorage.setItem(`lastActiveTopic_${itemId}_${itemType}`, newTopicId);

            uiHelper.showToastNotification(`已成功创建分支话题 "${newBranchTopicName}" 并切换。`);

        } catch (error) {
            console.error("[ChatManager] 创建分支时发生错误:", error);
            uiHelper.showToastNotification(`创建分支时发生内部错误: ${error.message}`, 'error');
        }
    }

    async function handleForwardMessage(target, content, attachments) {
        const { messageInput } = elements;
        
        try {
            // 1. 查找目标项目的完整配置以选择它
            let targetItemFullConfig;
            
            if (target.type === 'agent') {
                targetItemFullConfig = await tauriAPI.invoke('get_agent_config', { agentId: target.id });
            } else {
                targetItemFullConfig = await tauriAPI.invoke('get_agent_group_config', { groupId: target.id });
            }

            if (!targetItemFullConfig || targetItemFullConfig.error) {
                uiHelper.showToastNotification(`转发失败: 无法获取目标配置。`, 'error');
                return;
            }

            // 2. 选择项目。这将自动处理查找最后活动的话题或创建新话题
            await selectItem(target.id, target.type, target.name, targetItemFullConfig.avatarUrl, targetItemFullConfig);

            // 3. 短暂延迟后让 UI 从 selectItem 更新，然后填充并发送
            setTimeout(async () => {
                try {
                    // 4. 填充消息输入框
                    messageInput.value = content;
                    
                    // 5. 处理附件（如果有）
                    if (attachments && attachments.length > 0) {
                        const uiAttachments = attachments.map(att => ({
                            file: { name: att.name, type: att.type, size: att.size },
                            localPath: att.src,
                            originalName: att.name,
                            _fileManagerData: att._fileManagerData || {}
                        }));
                        attachedFilesRef.set(uiAttachments);
                        
                        // 手动触发附件预览更新
                        if (mainRendererFunctions.updateAttachmentPreview) {
                            mainRendererFunctions.updateAttachmentPreview();
                        }
                    }
                    
                    // 6. 手动触发文本框大小调整
                    uiHelper.autoResizeTextarea(messageInput);

                    // 7. 调用标准发送消息处理器以触发完整的 AI 响应流程
                    await handleSendMessage();
                } catch (error) {
                    console.error('[handleForwardMessage] Error in delayed execution:', error);
                    uiHelper.showToastNotification(`转发失败: ${error.message}`, 'error');
                }
            }, 200); // 200ms 延迟对于 UI 过渡来说是合理的
        } catch (error) {
            console.error('[handleForwardMessage] Error:', error);
            uiHelper.showToastNotification(`转发失败: ${error.message}`, 'error');
        }
    }

    // --- Canvas Integration ---
    const CANVAS_PLACEHOLDER = '{{VCPChatCanvas}}';

    function handleCanvasContentUpdate(data) {
        isCanvasWindowOpen = true;
        const { messageInput } = elements;
        // 如果画布打开且有内容，确保占位符在输入框中
        if (!messageInput.value.includes(CANVAS_PLACEHOLDER)) {
            // 如果输入框不为空，添加空格以获得更好的格式
            const prefix = messageInput.value.length > 0 ? ' ' : '';
            messageInput.value += prefix + CANVAS_PLACEHOLDER;
            uiHelper.autoResizeTextarea(messageInput);
        }
    }

    function handleCanvasWindowClosed() {
        isCanvasWindowOpen = false;
        const { messageInput } = elements;
        // 窗口关闭时移除占位符
        if (messageInput.value.includes(CANVAS_PLACEHOLDER)) {
            // 同时移除周围的空白以保持整洁
            messageInput.value = messageInput.value.replace(new RegExp(`\\s*${CANVAS_PLACEHOLDER}\\s*`, 'g'), '').trim();
            uiHelper.autoResizeTextarea(messageInput);
        }
    }


    async function syncHistoryFromFile(itemId, itemType, topicId) {
        const messageRenderer = getMessageRenderer();
        if (!messageRenderer) return;

        // 🔧 检查是否有正在进行的编辑操作
        const isEditing = document.querySelector('.message-item-editing');
        if (isEditing) {
            //console.log('[ChatManager] 由于消息正在编辑中，中止同步');
            return;
        }

        // 1. 从文件获取最新历史记录
        let newHistory = null;
        if (itemType === 'agent') {
            try {
                newHistory = await tauriAPI.invoke('get_chat_history', { agentId: itemId, topicId: topicId });
            } catch (e) {
                console.warn('[ChatManager] get_chat_history 失败', e);
            }
        } else if (itemType === 'group') {
            try {
                newHistory = await tauriAPI.invoke('get_group_chat_history', { groupId: itemId, topicId: topicId });
            } catch (e) {
                console.warn('[ChatManager] get_group_chat_history 失败', e);
            }
        }

        if (!newHistory || newHistory.error) {
            console.error("[ChatManager] 同步失败：无法获取新历史记录", newHistory?.error);
            return;
        }

        const oldHistory = currentChatHistoryRef.get();
        let historyInMem = [...oldHistory]; // Create a mutable copy to work with

        const oldHistoryMap = new Map(oldHistory.map(msg => [msg.id, msg]));
        const newHistoryMap = new Map(newHistory.map(msg => [msg.id, msg]));
        const activeStreamingId = window.streamManager ? window.streamManager.getActiveStreamingMessageId() : null;

        // --- Perform UI and Memory updates ---

        // 2. 处理已删除和已修改的消息
        for (const oldMsg of oldHistory) {
            if (oldMsg.id === activeStreamingId) {
                continue; // 保护当前正在流式传输的消息
            }
            
            const newMsgData = newHistoryMap.get(oldMsg.id);

            if (!newMsgData) {
                // 消息已从文件中删除
                messageRenderer.removeMessageById(oldMsg.id, false); // 更新 UI
                const indexToRemove = historyInMem.findIndex(m => m.id === oldMsg.id);
                if (indexToRemove > -1) {
                    historyInMem.splice(indexToRemove, 1); // 更新内存
                }
            } else {
                // 消息存在，检查是否修改
                if (JSON.stringify(oldMsg.content) !== JSON.stringify(newMsgData.content)) {
                    if (typeof messageRenderer.updateMessageContent === 'function') {
                        messageRenderer.updateMessageContent(oldMsg.id, newMsgData.content); // 更新 UI
                    }
                    const indexToUpdate = historyInMem.findIndex(m => m.id === oldMsg.id);
                    if (indexToUpdate > -1) {
                        historyInMem[indexToUpdate] = newMsgData; // 更新内存
                    }
                }
            }
        }

        // 3. 处理新增的消息
        let messagesWereAdded = false;
        for (const newMsg of newHistory) {
            if (!oldHistoryMap.has(newMsg.id)) {
                // 消息是新增的
                messageRenderer.renderMessage(newMsg, true); // 更新 UI（true = 不在内部修改历史引用）
                historyInMem.push(newMsg); // 更新内存
                messagesWereAdded = true;
            }
        }

        // 4. 如果消息被添加或删除，顺序可能不正确。重新排序
        // 同时确保流式消息（如果有）在最后
        historyInMem.sort((a, b) => {
            if (a.id === activeStreamingId) return 1;
            if (b.id === activeStreamingId) return -1;
            return a.timestamp - b.timestamp;
        });

        // 5. 将完全合并和排序的历史记录提交回引用。这是新的真实来源
        currentChatHistoryRef.set(historyInMem);

        // 如果消息被添加，DOM 顺序可能不正确。完全重新渲染是最安全的
        // 但可能导致闪烁。目前我们接受这一点，因为单独的 DOM 操作更快
        // 后续的话题加载将修复任何视觉上的顺序错误
        if (messagesWereAdded) {
             //console.log('[ChatManager] 新消息已添加。DOM 可能需要刷新以获得正确的顺序');
        }
    }



    // --- Public API ---
    return {
        init,
        selectItem,
        selectTopic,
        handleTopicDeletion,
        loadChatHistory,
        handleSendMessage,
        regenerateResponse, // 🔧 新增：重新生成回复
        createNewTopicForItem,
        displayNoItemSelected,
        attemptTopicSummarizationIfNeeded,
        handleCreateBranch,
        handleForwardMessage,
        syncHistoryFromFile, // Expose the new function
        handleVcpStreamEvent, // 处理 VCP 流式响应事件
        getCurrentSelectedItem: () => currentSelectedItemRef.get(), // 🔧 新增：获取当前选中项目
        getCurrentTopicId: () => currentTopicIdRef.get(), // 🔧 新增：获取当前话题ID
    };
})();
