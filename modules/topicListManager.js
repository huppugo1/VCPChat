// modules/topicListManager.js

window.topicListManager = (() => {
    // --- Private Variables ---
    let topicListContainer;
    let tauriAPI;
    let currentSelectedItemRef;
    let currentTopicIdRef;
    let uiHelper;
    let mainRendererFunctions;
    let wasSelectionListenerActive = false; // To store the state of the selection listener before dragging

    /**
     * Initializes the TopicListManager module.
     * @param {object} config - The configuration object.
     */
    function init(config) {
        //console.log('[TopicListManager] init called with config:', config);
        
        if (!config.elements || !config.elements.topicListContainer) {
            console.error('[TopicListManager] Missing required DOM element: topicListContainer.');
            return;
        }
        // Accept tauriAPI from config or fall back to global window.tauriAPI (Tauri proxy)
        if ((!config.tauriAPI && !window.tauriAPI) || !config.refs || !config.uiHelper || !config.mainRendererFunctions) {
            console.error('[TopicListManager] Missing required configuration parameters.');
            console.error('[TopicListManager] tauriAPI:', config.tauriAPI, 'window.tauriAPI:', window.tauriAPI);
            console.error('[TopicListManager] refs:', config.refs);
            console.error('[TopicListManager] uiHelper:', config.uiHelper);
            console.error('[TopicListManager] mainRendererFunctions:', config.mainRendererFunctions);
            return;
        }

        topicListContainer = config.elements.topicListContainer;
        //console.log('[TopicListManager] topicListContainer set to:', topicListContainer);
        tauriAPI = config.tauriAPI || window.tauriAPI;
        currentSelectedItemRef = config.refs.currentSelectedItemRef;
        currentTopicIdRef = config.refs.currentTopicIdRef;
        uiHelper = config.uiHelper;
        mainRendererFunctions = config.mainRendererFunctions;
        
        //console.log('[TopicListManager] Initialization complete');

        // 设置鼠标快捷键
        setupMouseShortcuts();

        // Helper to call backend via Tauri invoke with fallback to tauriAPI
        async function callBackend(cmd, args, fallback) {
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                try {
                    return await window.__TAURI__.invoke(cmd, args);
                } catch (e) {
                    console.warn('[TopicListManager] Tauri invoke failed for', cmd, e);
                }
            }
            if (tauriAPI && typeof fallback === 'function') {
                try { return await fallback(); } catch (e) { console.warn('[TopicListManager] fallback failed for', cmd, e); }
            }
            return null;
        }

        //console.log('[TopicListManager] Initialized successfully.');
    }

    /**
     * Module-level unified backend caller: prefer Tauri invoke, fallback to tauriAPI via provided fallback.
     * @param {string} cmd
     * @param {object} args
     * @param {Function} fallback
     */
    async function callBackend(cmd, args, fallback) {
        //console.log('[TopicListManager] callBackend called with cmd:', cmd, 'args:', args);
        // Try to get invoke from window (set by renderer.js)
        if (window.__TAURI_INVOKE__) {
            try {
                //console.log('[TopicListManager] Using window.__TAURI_INVOKE__');
                return await window.__TAURI_INVOKE__(cmd, args);
            } catch (e) {
                console.warn('[TopicListManager] Tauri invoke failed for', cmd, e);
            }
        }
        if (tauriAPI && typeof fallback === 'function') {
            try { 
                //console.log('[TopicListManager] Using fallback function');
                return await fallback(); 
            } catch (e) { 
                console.warn('[TopicListManager] fallback failed for', cmd, e); 
            }
        }
        console.warn('[TopicListManager] No backend method available for', cmd);
        return null;
    }

    /**
     * Part C: 智能计数逻辑辅助函数（前端复制）
     * 判断是否应该激活计数
     * @param {Array} history - 消息历史
     * @returns {boolean}
     */
    function shouldActivateCount(history) {
        if (!history || history.length === 0) return false;
        
        // 过滤掉系统消息
        const nonSystemMessages = history.filter(msg => msg.role !== 'system');
        
        if (nonSystemMessages.length === 0) {
            return true; // 没有用户消息
        }
        
        // 检查倒数第二条消息（非系统消息）是否为用户消息
        if (nonSystemMessages.length >= 2) {
            const secondLast = nonSystemMessages[nonSystemMessages.length - 2];
            return secondLast.role !== 'user';
        }
        
        // 只有一条非系统消息
        return nonSystemMessages[0].role !== 'user';
    }

    /**
     * Part C: 计算未读消息数量
     * @param {Array} history - 消息历史
     * @returns {number}
     */
    function countUnreadMessages(history) {
        // 从最后一条消息开始，向前计数直到遇到用户消息
        let count = 0;
        const nonSystemMessages = history.filter(msg => msg.role !== 'system');
        
        for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
            if (nonSystemMessages[i].role === 'user') {
                break;
            }
            count++;
        }
        
        return count;
    }

    /**
     * Part C: 计算单个话题的未读消息数
     * @param {Object} topic - 话题对象
     * @param {Array} history - 话题历史消息
     * @returns {number} - 未读消息数，-1 表示仅显示小点
     */
    function calculateTopicUnreadCount(topic, history) {
        // 如果话题被标记为未读，但未满足计数条件，返回 -1 表示仅显示小点
        if (topic.unread === true) {
            // 检查是否满足计数条件
            if (topic.locked === false && shouldActivateCount(history)) {
                return countUnreadMessages(history);
            }
            return -1; // 仅显示小点，不显示数字
        }
        
        // 如果话题未标记为未读，检查是否满足自动计数条件
        if (topic.locked === false && shouldActivateCount(history)) {
            return countUnreadMessages(history);
        }
        
        return 0; // 不显示
    }

// 新的 loadTopicList 函数 - 加载所有话题
    async function loadTopicList() {
        console.log('=== [TopicList] loadTopicList 被调用 ===');
        
        if (!topicListContainer) {
            console.error("Topic list container (tabContentTopics) not found.");
            return;
        }

        let topicListUl = topicListContainer.querySelector('.topic-list');
        if (topicListUl) {
            topicListUl.innerHTML = '';
        } else {
            topicListUl = document.createElement('ul');
            topicListUl.className = 'topic-list';
            topicListUl.id = 'topicList';
            topicListContainer.appendChild(topicListUl);
        }

        // 获取当前选中的项目
        const currentItem = currentSelectedItemRef.get();
        
        // 更新标题文本
        const topicsHeaderContainer = topicListContainer.querySelector('.topics-header-container');
        if (topicsHeaderContainer) {
            const h2 = topicsHeaderContainer.querySelector('h2');
            if (h2) {
                if (currentItem && currentItem.id) {
                    h2.textContent = `话题 - ${currentItem.name || currentItem.id}`;
                } else {
                    h2.textContent = '话题';
                }
            }
            
            // 设置刷新按钮的点击事件（清除过滤）
            const refreshBtn = topicsHeaderContainer.querySelector('#refreshTopicsBtn');
            if (refreshBtn) {
                // 移除旧的事件监听器
                const newRefreshBtn = refreshBtn.cloneNode(true);
                refreshBtn.parentNode.replaceChild(newRefreshBtn, refreshBtn);
                
                // 添加新的事件监听器
                newRefreshBtn.addEventListener('click', () => {
                    console.log('[TopicList] 刷新按钮被点击，清除过滤');
                    currentSelectedItemRef.set(null);
                    loadTopicList();
                });
            }
        }
        
        const newTopicSearchInput = topicListContainer.querySelector('#topicSearchInput');
        if (newTopicSearchInput) setupTopicSearchListener(newTopicSearchInput);
        
        // 如果有选中的项目，则只显示该项目的话题；否则显示所有话题
        await loadAllTopicsFromAllSources(topicListUl, currentItem);
    }

    // 加载所有 Agent 和群组的话题
    async function loadAllTopicsFromAllSources(topicListUl, filterItem = null) {
        const searchInput = document.getElementById('topicSearchInput');
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
        
        if (!searchTerm) {
            topicListUl.innerHTML = `<li><div class="loading-spinner-small"></div>正在加载话题...</li>`;
        } else {
            topicListUl.innerHTML = '';
        }
        
        let allTopics = [];
        
        // 如果有过滤项，只加载该项的话题
        if (filterItem && filterItem.id) {
            console.log('[TopicList] 过滤模式：只显示', filterItem.type, filterItem.id, '的话题');
            
            if (filterItem.type === 'agent') {
                const agentConfig = await callBackend('get_agent_config', { agentId: filterItem.id }, () => tauriAPI.getAgentConfig(filterItem.id));
                if (agentConfig && agentConfig.topics && Array.isArray(agentConfig.topics)) {
                    agentConfig.topics.forEach(topic => {
                        allTopics.push({
                            ...topic,
                            itemId: filterItem.id,
                            itemType: 'agent',
                            itemName: agentConfig.name || filterItem.name
                        });
                    });
                }
            } else if (filterItem.type === 'group') {
                const groupConfig = await callBackend('get_agent_group_config', { groupId: filterItem.id }, () => tauriAPI.getAgentGroupConfig(filterItem.id));
                if (groupConfig && groupConfig.topics && Array.isArray(groupConfig.topics)) {
                    groupConfig.topics.forEach(topic => {
                        allTopics.push({
                            ...topic,
                            itemId: filterItem.id,
                            itemType: 'group',
                            itemName: groupConfig.name || filterItem.name
                        });
                    });
                }
            }
        } else {
            // 没有过滤项，加载所有话题
            console.log('[TopicList] 显示所有话题');
            
            // 加载所有 Agent 的话题
            try {
                const agents = await callBackend('get_agents', {}, () => tauriAPI.getAgents());
                if (agents && Array.isArray(agents)) {
                    for (const agent of agents) {
                        const agentConfig = await callBackend('get_agent_config', { agentId: agent.id }, () => tauriAPI.getAgentConfig(agent.id));
                        if (agentConfig && agentConfig.topics && Array.isArray(agentConfig.topics)) {
                            agentConfig.topics.forEach(topic => {
                                allTopics.push({
                                    ...topic,
                                    itemId: agent.id,
                                    itemType: 'agent',
                                    itemName: agentConfig.name || agent.name
                                });
                            });
                        }
                    }
                }
            } catch (error) {
                console.error('[TopicList] 加载 Agent 话题失败:', error);
            }
            
            // 加载所有群组的话题
            try {
                const groups = await callBackend('get_agent_groups', {}, () => tauriAPI.getAgentGroups());
                if (groups && Array.isArray(groups)) {
                    for (const group of groups) {
                        const groupConfig = await callBackend('get_agent_group_config', { groupId: group.id }, () => tauriAPI.getAgentGroupConfig(group.id));
                        if (groupConfig && groupConfig.topics && Array.isArray(groupConfig.topics)) {
                            groupConfig.topics.forEach(topic => {
                                allTopics.push({
                                    ...topic,
                                    itemId: group.id,
                                    itemType: 'group',
                                    itemName: groupConfig.name || group.name
                                });
                            });
                        }
                    }
                }
            } catch (error) {
                console.error('[TopicList] 加载群组话题失败:', error);
            }
        }
        
        // 搜索过滤
        if (searchTerm) {
            allTopics = allTopics.filter(topic => {
                const nameMatch = topic.name.toLowerCase().includes(searchTerm);
                const itemNameMatch = topic.itemName.toLowerCase().includes(searchTerm);
                return nameMatch || itemNameMatch;
            });
        }
        
        // 按时间戳排序：最新的在前面
        console.log('[TopicList] 排序前的前10个话题:', allTopics.slice(0, 10).map(t => ({
            id: t.id,
            name: t.name,
            itemName: t.itemName,
            createdAt: t.createdAt,
            createdAtDate: new Date(t.createdAt).toLocaleString('zh-CN')
        })));
        
        allTopics.sort((a, b) => {
            const timeA = Number(a.createdAt) || 0;
            const timeB = Number(b.createdAt) || 0;
            return timeB - timeA;
        });
        
        console.log('[TopicList] 所有话题（排序后）:', allTopics.length, '个');
        console.log('[TopicList] 排序后的前10个话题:', allTopics.slice(0, 10).map(t => ({
            id: t.id,
            name: t.name,
            itemName: t.itemName,
            createdAt: t.createdAt,
            createdAtDate: new Date(t.createdAt).toLocaleString('zh-CN')
        })));
        
        // 验证排序是否正确
        for (let i = 0; i < Math.min(5, allTopics.length - 1); i++) {
            const current = Number(allTopics[i].createdAt) || 0;
            const next = Number(allTopics[i + 1].createdAt) || 0;
            if (current < next) {
                console.error(`[TopicList] 排序错误！位置 ${i} 和 ${i+1}:`, {
                    current: { id: allTopics[i].id, time: current, date: new Date(current).toLocaleString('zh-CN') },
                    next: { id: allTopics[i+1].id, time: next, date: new Date(next).toLocaleString('zh-CN') }
                });
            }
        }
        
        // 渲染话题列表
        if (allTopics.length === 0) {
            topicListUl.innerHTML = `<li><p>没有找到任何话题${searchTerm ? '匹配当前搜索' : ''}。</p></li>`;
        } else {
            topicListUl.innerHTML = '';
            const currentTopicId = currentTopicIdRef.get();
            
            for (const topic of allTopics) {
                const li = document.createElement('li');
                li.classList.add('topic-item');
                li.dataset.itemId = topic.itemId;
                li.dataset.itemType = topic.itemType;
                li.dataset.topicId = topic.id;
                const isCurrentActiveTopic = topic.id === currentTopicId;
                li.classList.toggle('active', isCurrentActiveTopic);
                li.classList.toggle('active-topic-glowing', isCurrentActiveTopic);

                // 判断是否锁定
                const isLocked = topic.locked === true;
                
                // 优先从话题名称中提取时间（本地时间），否则使用 createdAt
                let timeString, dateString, finalTitle;
                const topicNameMatch = (topic.name || '').match(/^(.*?)[\s\u3000]+(\d{2}:\d{2}:\d{2})$/);
                
                if (topicNameMatch) {
                    finalTitle = topicNameMatch[1].trim();
                    timeString = topicNameMatch[2];
                    const date = topic.createdAt ? new Date(topic.createdAt) : new Date();
                    dateString = date.toLocaleDateString('zh-CN', {
                        month: 'short',
                        day: 'numeric'
                    });
                } else {
                    finalTitle = topic.name;
                    const date = topic.createdAt ? new Date(topic.createdAt) : new Date();
                    timeString = date.toLocaleTimeString('zh-CN', { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false 
                    });
                    dateString = date.toLocaleDateString('zh-CN', {
                        month: 'short',
                        day: 'numeric'
                    });
                }
                
                const countOrLockHtml = isLocked 
                    ? '<span class="lock-indicator" title="话题已锁定，AI无法访问">🔒</span>'
                    : `<span class="topic-message-count" data-topic-id="${topic.id}">...</span>`;
                
                li.innerHTML = `
                    <div class="topic-header">
                        <div class="topic-title">${finalTitle || `话题 ${topic.id}`}</div>
                        ${countOrLockHtml}
                    </div>
                    <div class="topic-meta">
                        <span class="topic-agent">${topic.itemName}</span>
                        <span class="topic-time">${dateString} ${timeString}</span>
                    </div>
                    ${topic.unread ? '<div class="unread-indicator"></div>' : ''}
                `;

                // 异步加载消息数量
                if (!isLocked) {
                    let historyPromise;
                    if (topic.itemType === 'agent') {
                        historyPromise = callBackend('get_chat_history', { agentId: topic.itemId, topicId: topic.id }, () => tauriAPI.getChatHistory(topic.itemId, topic.id));
                    } else if (topic.itemType === 'group') {
                        historyPromise = callBackend('get_group_chat_history', { groupId: topic.itemId, topicId: topic.id }, () => tauriAPI.getGroupChatHistory(topic.itemId, topic.id));
                    }
                    
                    if (historyPromise) {
                        historyPromise.then(historyResult => {
                            if (historyResult && !historyResult.error && Array.isArray(historyResult)) {
                                const countEl = li.querySelector('.topic-message-count');
                                if (countEl) {
                                    countEl.textContent = historyResult.length;
                                    if (topic.unread === true) {
                                        countEl.classList.add('has-unread');
                                    }
                                }
                            }
                        }).catch(() => {
                            const countEl = li.querySelector('.topic-message-count');
                            if (countEl) countEl.textContent = 'ERR';
                        });
                    }
                }

                // 点击话题时切换
                li.addEventListener('click', async () => {
                    if (currentTopicIdRef.get() !== topic.id) {
                        try {
                            const currentSelectedItem = currentSelectedItemRef.get();
                            
                            // 检查当前选中的项目是否就是该话题所属的项目
                            const needSelectItem = !currentSelectedItem || 
                                                   currentSelectedItem.id !== topic.itemId || 
                                                   currentSelectedItem.type !== topic.itemType;
                            
                            if (needSelectItem) {
                                // 需要切换项目，先加载完整配置
                                let itemConfigFull;
                                if (topic.itemType === 'agent') {
                                    itemConfigFull = await callBackend('get_agent_config', { agentId: topic.itemId }, () => tauriAPI.getAgentConfig(topic.itemId));
                                } else if (topic.itemType === 'group') {
                                    itemConfigFull = await callBackend('get_agent_group_config', { groupId: topic.itemId }, () => tauriAPI.getAgentGroupConfig(topic.itemId));
                                }
                                
                                if (!itemConfigFull || itemConfigFull.error) {
                                    console.error('[TopicListManager] 加载配置失败');
                                    return;
                                }
                                
                                // 选中对应的 Agent/群组（传递完整配置，跳过话题列表刷新）
                                if (mainRendererFunctions && mainRendererFunctions.selectItem) {
                                    console.log('[TopicListManager] 调用 selectItem:', topic.itemId, topic.itemType);
                                    await mainRendererFunctions.selectItem(
                                        topic.itemId, 
                                        topic.itemType, 
                                        topic.itemName, 
                                        itemConfigFull.avatar || itemConfigFull.avatarUrl || itemConfigFull.avatar_url || 'AppData/assets/default_avatar.png',
                                        itemConfigFull,
                                        { skipTopicListRefresh: true }
                                    );
                                    console.log('[TopicListManager] selectItem 完成');
                                } else if (window.chatManager && typeof window.chatManager.selectItem === 'function') {
                                    console.log('[TopicListManager] mainRendererFunctions 不可用，直接调用 chatManager.selectItem');
                                    await window.chatManager.selectItem(
                                        topic.itemId, 
                                        topic.itemType, 
                                        topic.itemName, 
                                        itemConfigFull.avatar || itemConfigFull.avatarUrl || itemConfigFull.avatar_url || 'AppData/assets/default_avatar.png',
                                        itemConfigFull,
                                        { skipTopicListRefresh: true }
                                    );
                                    console.log('[TopicListManager] chatManager.selectItem 完成');
                                } else {
                                    console.error('[TopicListManager] 无法调用 selectItem，chatManager 和 mainRendererFunctions 都不可用');
                                    return;
                                }
                            } else {
                                console.log('[TopicListManager] 当前项目已是该话题所属项目，跳过 selectItem');
                            }
                            
                            // 再选中话题
                            console.log('[TopicListManager] 调用 selectTopic:', topic.id);
                            if (mainRendererFunctions && mainRendererFunctions.selectTopic) {
                                await mainRendererFunctions.selectTopic(topic.id);
                            } else if (window.chatManager && typeof window.chatManager.selectTopic === 'function') {
                                await window.chatManager.selectTopic(topic.id);
                            } else {
                                console.error('[TopicListManager] 无法调用 selectTopic');
                            }
                        } catch (error) {
                            console.error(`[TopicListManager] 切换话题失败:`, error);
                        }
                    }
                });

                // 右键菜单 - 需要先加载完整配置
                li.addEventListener('contextmenu', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    try {
                        // 加载完整配置
                        let itemConfigFull;
                        if (topic.itemType === 'agent') {
                            itemConfigFull = await callBackend('get_agent_config', { agentId: topic.itemId }, () => tauriAPI.getAgentConfig(topic.itemId));
                        } else if (topic.itemType === 'group') {
                            itemConfigFull = await callBackend('get_agent_group_config', { groupId: topic.itemId }, () => tauriAPI.getAgentGroupConfig(topic.itemId));
                        }
                        
                        if (itemConfigFull && !itemConfigFull.error) {
                            showTopicContextMenu(e, li, itemConfigFull, topic, topic.itemType);
                        }
                    } catch (error) {
                        console.error('[TopicListManager] 加载配置失败:', error);
                    }
                });

                topicListUl.appendChild(li);
                
                // 调试：记录添加顺序
                if (allTopics.indexOf(topic) < 5) {
                    console.log(`[TopicList] 添加第 ${allTopics.indexOf(topic) + 1} 个话题到 DOM:`, {
                        id: topic.id,
                        name: topic.name,
                        createdAt: topic.createdAt,
                        date: new Date(topic.createdAt).toLocaleString('zh-CN')
                    });
                }
            }
            
            // 验证最终 DOM 顺序
            const renderedTopics = Array.from(topicListUl.querySelectorAll('.topic-item'));
            console.log('[TopicList] DOM 中前5个话题的顺序:', renderedTopics.slice(0, 5).map(el => ({
                topicId: el.dataset.topicId,
                itemName: el.querySelector('.topic-agent')?.textContent,
                time: el.querySelector('.topic-time')?.textContent
            })));
        }
    }

    function setupTopicSearch() {
        let searchInput = document.getElementById('topicSearchInput');
        if (searchInput) {
            setupTopicSearchListener(searchInput);
        }
    }

    function setupTopicSearchListener(inputElement) {
        inputElement.addEventListener('input', filterTopicList);
        inputElement.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                filterTopicList();
            }
        });
    }

    function filterTopicList() {
        loadTopicList();
    }

    async function initializeTopicSortable(itemId, itemType) {
        const topicListUl = document.getElementById('topicList');
        if (!topicListUl) {
            console.warn("[TopicListManager] topicListUl element not found. Skipping Sortable initialization.");
            return;
        }

        if (topicListUl.sortableInstance) {
            topicListUl.sortableInstance.destroy();
        }

        // 动态加载 Sortable
        const { getSortable } = await import('./utils/sortable-loader.js');
        const Sortable = await getSortable();

        topicListUl.sortableInstance = new Sortable(topicListUl, {
            animation: 150,
            ghostClass: 'sortable-ghost-topic',
            chosenClass: 'sortable-chosen-topic',
            dragClass: 'sortable-drag-topic',
            onStart: async function(evt) {
                // Check original state, store it, and then disable if it was active.
                try {
                    const status = await callBackend('get_selection_listener_status', {}, () => {
                        return tauriAPI && typeof tauriAPI.getSelectionListenerStatus === 'function'
                            ? tauriAPI.getSelectionListenerStatus()
                            : false;
                    });
                    wasSelectionListenerActive = !!status;
                    if (wasSelectionListenerActive) {
                        await callBackend('toggle_selection_listener', { enabled: false }, () => {
                            if (tauriAPI && typeof tauriAPI.toggleSelectionListener === 'function') {
                                return tauriAPI.toggleSelectionListener(false);
                            }
                            return Promise.resolve();
                        });
                    }
                } catch (e) {
                    console.warn('[TopicListManager] Failed to query/toggle selection listener on drag start', e);
                }
            },
            onEnd: async function (evt) {
                // Re-enable selection hook only if it was active before the drag.
                try {
                    if (wasSelectionListenerActive) {
                        await callBackend('toggle_selection_listener', { enabled: true }, () => {
                            if (tauriAPI && typeof tauriAPI.toggleSelectionListener === 'function') {
                                return tauriAPI.toggleSelectionListener(true);
                            }
                            return Promise.resolve();
                        });
                    }
                } catch (e) {
                    console.warn('[TopicListManager] Failed to re-enable selection listener on drag end', e);
                } finally {
                    wasSelectionListenerActive = false; // Reset state
                }

                const topicItems = Array.from(evt.to.children);
                const orderedTopicIds = topicItems.map(item => item.dataset.topicId);
                    try {
                        let result;
                        // Note: Topic ordering is not yet implemented in Tauri backend
                        // For now, we'll just log a warning and skip the save
                        console.warn('[TopicListManager] Topic ordering is not yet implemented in Tauri backend');
                        uiHelper.showToastNotification('话题排序功能暂未实现', 'warning');
                        
                        // TODO: Uncomment when backend commands are implemented
                        // if (itemType === 'agent') {
                        //     result = await callBackend('save_topic_order', { agentId: itemId, orderedTopicIds: orderedTopicIds }, () => tauriAPI.saveTopicOrder(itemId, orderedTopicIds));
                        // } else if (itemType === 'group') {
                        //     result = await callBackend('save_group_topic_order', { groupId: itemId, orderedTopicIds: orderedTopicIds }, () => tauriAPI.saveGroupTopicOrder(itemId, orderedTopicIds));
                        // }

                        // if (result && result.success) {
                        //     // UI reflects sort.
                        // } else {
                        //     console.error(`Failed to save topic order for ${itemType} ${itemId}:`, result?.error);
                        //     uiHelper.showToastNotification(`保存话题顺序失败: ${result?.error || '未知错误'}`, 'error');
                        //     loadTopicList();
                        // }
                    } catch (error) {
                        console.error(`Error calling saveTopicOrder for ${itemType} ${itemId}:`, error);
                        uiHelper.showToastNotification(`调用保存话题顺序API时出错: ${error.message}`, 'error');
                        loadTopicList();
                    }
            }
        });
    }

    function showTopicContextMenu(event, topicItemElement, itemFullConfig, topic, itemType) {
        //console.log('[TopicListManager] showTopicContextMenu called', { topic: topic?.name, itemType });
        
        // 空值检查
        if (!topic || !itemFullConfig) {
            console.error('[TopicListManager] Missing required params for context menu', { topic, itemFullConfig });
            return;
        }
        
        closeTopicContextMenu();

        const menu = document.createElement('div');
        menu.id = 'topicContextMenu';
        menu.classList.add('context-menu');

        const editTitleOption = document.createElement('div');
        editTitleOption.classList.add('context-menu-item');
        editTitleOption.innerHTML = `<i class="fas fa-edit"></i> 编辑话题标题`;
        editTitleOption.onclick = async () => {
            closeTopicContextMenu();
            
            // 调试日志
            //console.log('[TopicListManager] Edit title clicked:', {
            //     itemFullConfig,
            //     itemFullConfigId: itemFullConfig?.id,
            //     currentSelectedItem: currentSelectedItemRef.get(),
            //     currentSelectedItemId: currentSelectedItemRef.get()?.id,
            //     itemType,
            //     topicId: topic.id,
            //     topicName: topic.name
            // });
            
            const newTitle = await window.showInputModal('编辑话题标题', '请输入新的话题标题:', topic.name, '话题标题');
            if (newTitle && newTitle !== topic.name) {
                // 使用话题对象中的 itemId 和 itemType
                const itemId = topic.itemId;
                const itemType = topic.itemType;
                
                if (!itemId) {
                    console.error('[TopicListManager] No item ID available');
                    uiHelper.showToastNotification('无法获取项目ID', 'error');
                    return;
                }
                
                let saveResult;
                if (itemType === 'agent') {
                    saveResult = await callBackend('rename_topic', { agentId: itemId, topicId: topic.id, newName: newTitle }, () => tauriAPI.invoke('rename_topic', { agentId: itemId, topicId: topic.id, newName: newTitle }));
                } else if (itemType === 'group') {
                    saveResult = await callBackend('rename_group_topic', { groupId: itemId, topicId: topic.id, newName: newTitle }, () => tauriAPI.invoke('rename_group_topic', { groupId: itemId, topicId: topic.id, newName: newTitle }));
                }
                if (saveResult && saveResult.success) {
                    topic.name = newTitle;
                    // 更新 DOM 中的标题显示
                    const titleElement = topicItemElement.querySelector('.topic-title');
                    if (titleElement) {
                        titleElement.textContent = newTitle;
                    }
                    // 更新配置中的话题名称
                    if (itemFullConfig.topics) {
                        const topicInFullConfig = itemFullConfig.topics.find(t => t.id === topic.id);
                        if (topicInFullConfig) topicInFullConfig.name = newTitle;
                    }
                    uiHelper.showToastNotification('话题标题已更新', 'success');
                } else {
                    uiHelper.showToastNotification(`更新话题标题失败: ${saveResult?.error || '未知错误'}`, 'error');
                }
            }
        };
        menu.appendChild(editTitleOption);

        // Part C: 锁定/解锁话题选项
        const toggleLockOption = document.createElement('div');
        toggleLockOption.classList.add('context-menu-item');
        const isLocked = topic.locked !== false; // 默认为锁定
        toggleLockOption.innerHTML = isLocked
            ? `<i class="fas fa-unlock"></i> 解锁话题`
            : `<i class="fas fa-lock"></i> 锁定话题`;
        toggleLockOption.onclick = async () => {
            closeTopicContextMenu();
                try {
                    // 使用话题对象中的 itemId 和 itemType
                    const itemId = topic.itemId;
                    const itemType = topic.itemType;
                    
                    if (!itemId) {
                        console.error('[TopicListManager] No item ID available');
                        uiHelper.showToastNotification('无法获取项目ID', 'error');
                        return;
                    }
                    
                    let result;
                    if (itemType === 'agent') {
                        result = await callBackend('toggle_topic_lock', { agentId: itemId, topicId: topic.id }, () => tauriAPI.invoke('toggle_topic_lock', { agentId: itemId, topicId: topic.id }));
                    } else if (itemType === 'group') {
                        result = await callBackend('toggle_group_topic_lock', { groupId: itemId, topicId: topic.id }, () => tauriAPI.invoke('toggle_group_topic_lock', { groupId: itemId, topicId: topic.id }));
                    }
                    
                    if (result && result.success) {
                        topic.locked = result.locked;
                        uiHelper.showToastNotification(result.message, 'success');
                        loadTopicList(); // 刷新列表以显示新状态
                    } else {
                        uiHelper.showToastNotification(`切换锁定状态失败: ${result ? result.error : '未知错误'}`, 'error');
                    }
                } catch (error) {
                    uiHelper.showToastNotification(`操作失败: ${error.message}`, 'error');
                }
        };
        menu.appendChild(toggleLockOption);

        // Part C: 标记为未读/已读选项
        const toggleUnreadOption = document.createElement('div');
        toggleUnreadOption.classList.add('context-menu-item');
        const isUnread = topic.unread === true;
        toggleUnreadOption.innerHTML = isUnread
            ? `<i class="fas fa-check"></i> 标记为已读`
            : `<i class="fas fa-envelope"></i> 标记为未读`;
        toggleUnreadOption.onclick = async () => {
            closeTopicContextMenu();
                try {
                    // 使用话题对象中的 itemId 和 itemType
                    const itemId = topic.itemId;
                    const itemType = topic.itemType;
                    
                    if (!itemId) {
                        console.error('[TopicListManager] No item ID available');
                        uiHelper.showToastNotification('无法获取项目ID', 'error');
                        return;
                    }
                    
                    let result;
                    if (itemType === 'agent') {
                        result = await callBackend('set_topic_unread', { agentId: itemId, topicId: topic.id, unread: !isUnread }, () => tauriAPI.invoke('set_topic_unread', { agentId: itemId, topicId: topic.id, unread: !isUnread }));
                    } else if (itemType === 'group') {
                        result = await callBackend('set_group_topic_unread', { groupId: itemId, topicId: topic.id, unread: !isUnread }, () => tauriAPI.invoke('set_group_topic_unread', { groupId: itemId, topicId: topic.id, unread: !isUnread }));
                    }
                    
                    if (result && result.success) {
                        topic.unread = result.unread;
                        uiHelper.showToastNotification(
                            topic.unread ? '已标记为未读' : '已标记为已读',
                            'success'
                        );
                        loadTopicList(); // 刷新列表
                        // 同时刷新助手列表以更新计数
                        if (window.loadAgents && typeof window.loadAgents === 'function') {
                            window.loadAgents();
                        }
                    } else {
                        uiHelper.showToastNotification(`操作失败: ${result ? result.error : '未知错误'}`, 'error');
                    }
                } catch (error) {
                    uiHelper.showToastNotification(`操作失败: ${error.message}`, 'error');
                }
        };
        menu.appendChild(toggleUnreadOption);

        const deleteTopicPermanentlyOption = document.createElement('div');
        deleteTopicPermanentlyOption.classList.add('context-menu-item', 'danger-item');
        deleteTopicPermanentlyOption.innerHTML = `<i class="fas fa-trash-alt"></i> 删除此话题`;
        deleteTopicPermanentlyOption.onclick = async () => {
            closeTopicContextMenu();
            const confirmed = await window.ModalManager.confirm(
                `确定要永久删除话题 "${topic.name}" 吗？此操作不可撤销。`,
                '⚠️ 删除话题'
            );
            if (confirmed) {
                // 使用话题对象中的 itemId 和 itemType
                const itemId = topic.itemId;
                const itemType = topic.itemType;
                
                if (!itemId) {
                    console.error('[TopicListManager] No item ID available');
                    uiHelper.showToastNotification('无法获取项目ID', 'error');
                    return;
                }
                
                let result;
                if (itemType === 'agent') {
                    //console.log('[TopicListManager] Calling delete_topic with agentId:', itemId, 'topicId:', topic.id);
                    result = await callBackend('delete_topic', { agentId: itemId, topicId: topic.id }, () => tauriAPI.deleteTopic(itemId, topic.id));
                } else if (itemType === 'group') {
                    //console.log('[TopicListManager] Calling delete_group_topic with groupId:', itemId, 'topicId:', topic.id);
                    result = await callBackend('delete_group_topic', { groupId: itemId, topicId: topic.id }, () => tauriAPI.deleteGroupTopic(itemId, topic.id));
                }
                //console.log('[TopicListManager] delete result:', result);

                if (result && result.success) {
                    if (currentTopicIdRef.get() === topic.id) {
                        mainRendererFunctions.handleTopicDeletion(result.remainingTopics);
                    }
                    loadTopicList();
                } else {
                    uiHelper.showToastNotification(`删除话题 "${topic.name}" 失败: ${result ? result.error : '未知错误'}`, 'error');
                }
            }
        };
        menu.appendChild(deleteTopicPermanentlyOption);

        const exportTopicOption = document.createElement('div');
        exportTopicOption.classList.add('context-menu-item');
        exportTopicOption.innerHTML = `<i class="fas fa-file-export"></i> 导出此话题`;
        exportTopicOption.onclick = () => {
            closeTopicContextMenu();
            // 使用话题对象中的 itemId 和 itemType
            const itemId = topic.itemId;
            const itemType = topic.itemType;
            
            if (!itemId) {
                console.error('[TopicListManager] No item ID available');
                uiHelper.showToastNotification('无法获取项目ID', 'error');
                return;
            }
            handleExportTopic(itemId, itemType, topic.id, topic.name);
        };
        menu.appendChild(exportTopicOption);
        
        // 智能定位逻辑：先隐藏菜单以测量尺寸
        menu.style.visibility = 'hidden';
        menu.style.position = 'fixed';
        document.body.appendChild(menu);

        // 获取菜单和窗口尺寸
        const menuWidth = menu.offsetWidth;
        const menuHeight = menu.offsetHeight;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        let top = event.clientY;
        let left = event.clientX;

        // 检查菜单是否会超出窗口底部
        if (top + menuHeight > windowHeight) {
            // 将菜单显示在鼠标上方
            top = event.clientY - menuHeight;
            // 如果上方空间也不够，则贴近顶部
            if (top < 0) top = 5;
        }

        // 检查菜单是否会超出窗口右侧
        if (left + menuWidth > windowWidth) {
            // 将菜单显示在鼠标左侧
            left = event.clientX - menuWidth;
            // 如果左侧空间也不够，则贴近左边
            if (left < 0) left = 5;
        }

        // 应用最终位置并显示菜单
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
        menu.style.visibility = 'visible';
        
        document.addEventListener('click', closeTopicContextMenuOnClickOutside, true);
    }

    function closeTopicContextMenu() {
        const existingMenu = document.getElementById('topicContextMenu');
        if (existingMenu) {
            existingMenu.remove();
            document.removeEventListener('click', closeTopicContextMenuOnClickOutside, true);
        }
    }

    function closeTopicContextMenuOnClickOutside(event) {
        // 🔧 修复：忽略 contextmenu 事件，只处理真正的点击
        if (event.type === 'contextmenu') {
            return;
        }
        
        const menu = document.getElementById('topicContextMenu');
        if (menu && !menu.contains(event.target)) {
            closeTopicContextMenu();
        }
    }

    async function handleExportTopic(itemId, itemType, topicId, topicName) {
        const currentTopicId = currentTopicIdRef.get();
        
        // 如果不是当前话题，先加载它
        if (topicId !== currentTopicId) {
            //console.log(`[TopicListManager] Topic ${topicId} is not currently loaded. Loading it first...`);
            try {
                // 调用主渲染器的 selectTopic 来加载话题
                await mainRendererFunctions.selectTopic(itemId, topicId, topicName);
                
                // 等待一小段时间让消息渲染完成
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error('[TopicListManager] Failed to load topic before export:', error);
                uiHelper.showToastNotification('加载话题失败，无法导出。', 'error');
                return;
            }
        }

        //console.log(`[TopicListManager] Exporting currently visible topic: ${topicName} (ID: ${topicId})`);

        try {
            const chatMessagesDiv = document.getElementById('chatMessages');
            if (!chatMessagesDiv) {
                console.error('[Export Debug] chatMessagesDiv not found!');
                uiHelper.showToastNotification('错误：找不到聊天内容容器。', 'error');
                return;
            }

            const messageItems = chatMessagesDiv.querySelectorAll('.message-item');
            //console.log(`[Export Debug] Found ${messageItems.length} message items.`);
            if (messageItems.length === 0) {
                uiHelper.showToastNotification('此话题没有可见的聊天内容可导出。', 'info');
                return;
            }

            let markdownContent = `# 话题: ${topicName}\n\n`;
            let extractedCount = 0;

            messageItems.forEach((item, index) => {
                if (item.classList.contains('system') || item.classList.contains('thinking')) {
                    //console.log(`[Export Debug] Skipping system/thinking message at index ${index}.`);
                    return;
                }

                const senderElement = item.querySelector('.sender-name');
                const contentElement = item.querySelector('.md-content');

                if (senderElement && contentElement) {
                    const sender = senderElement.textContent.trim().replace(':', '');
                    let content = contentElement.innerText || contentElement.textContent || "";
                    content = content.trim();

                    if (sender && content) {
                        markdownContent += `**${sender}**: ${content}

---

`;
                        extractedCount++;
                    } else {
                        //console.log(`[Export Debug] Skipping message at index ${index} due to empty sender or content. Sender: "${sender}", Content: "${content}"`);
                    }
                } else {
                    //console.log(`[Export Debug] Skipping message at index ${index} because sender or content element was not found.`);
                }
            });

            //console.log(`[Export Debug] Extracted ${extractedCount} messages. Final markdown length: ${markdownContent.length}`);

            if (extractedCount === 0) {
                uiHelper.showToastNotification('未能从当前话题中提取任何有效对话内容。', 'warning');
                return;
            }

            //console.log('[TopicListManager] Calling export_topic_as_markdown');
            const result = await callBackend('export_topic_as_markdown', { 
                topicName: topicName, 
                markdownContent: markdownContent 
            }, () => tauriAPI.exportTopicAsMarkdown({
                topicName: topicName,
                markdownContent: markdownContent
            }));

            if (result && result.success) {
                try {
                    // 尝试使用 File System Access API（如果支持）
                    if ('showSaveFilePicker' in window) {
                        const handle = await window.showSaveFilePicker({
                            suggestedName: result.filename,
                            types: [{
                                description: 'Markdown 文件',
                                accept: { 'text/markdown': ['.md'] }
                            }]
                        });
                        const writable = await handle.createWritable();
                        await writable.write(result.content);
                        await writable.close();
                        uiHelper.showToastNotification(`话题 "${topicName}" 已成功导出`);
                    } else {
                        // 回退到直接下载
                        const blob = new Blob([result.content], { type: 'text/markdown' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = result.filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        uiHelper.showToastNotification(`话题 "${topicName}" 已成功导出到下载文件夹`);
                    }
                } catch (err) {
                    // 用户取消了保存
                    if (err.name !== 'AbortError') {
                        throw err;
                    }
                }
            } else {
                const errorMsg = result?.error || '未知错误';
                uiHelper.showToastNotification(`导出话题失败: ${errorMsg}`, 'error');
            }
        } catch (error) {
            console.error(`[TopicListManager] 导出话题时发生错误:`, error);
            uiHelper.showToastNotification(`导出话题时发生前端错误: ${error.message}`, 'error');
        }
    }

    /**
     * 设置鼠标快捷键事件监听器
     */
    function setupMouseShortcuts() {
        const topicsContainer = document.getElementById('tabContentTopics');
        if (!topicsContainer) {
            // 静默返回，因为这可能在初始化早期被调用
            return;
        }

        let lastLeftClickTime = 0;

        // 双击左键：进入设置页面
        topicsContainer.addEventListener('click', (e) => {
            if (e.button === 0) { // 左键
                const currentTime = Date.now();
                const timeDiff = currentTime - lastLeftClickTime;

                if (timeDiff < 300) { // 双击检测（300ms内）
                    //console.log('[TopicListManager] 检测到双击左键，进入设置页面');
                    e.preventDefault();
                    e.stopPropagation();

                    // 切换到设置页面
                    if (window.uiManager && typeof window.uiManager.switchToTab === 'function') {
                        window.uiManager.switchToTab('settings');
                    } else {
                        console.warn('[TopicListManager] uiManager不可用，无法切换到设置页面');
                    }
                }

                lastLeftClickTime = currentTime;
            }
        });

        // 中键点击：返回助手页面
        topicsContainer.addEventListener('auxclick', (e) => {
            if (e.button === 1) { // 中键
                //console.log('[TopicListManager] 检测到中键点击，返回助手页面');
                e.preventDefault();
                e.stopPropagation();

                // 切换到助手页面
                if (window.uiManager && typeof window.uiManager.switchToTab === 'function') {
                    window.uiManager.switchToTab('agents');
                    // 重置助手页面的鼠标事件状态，确保双击功能正常工作
                    if (window.itemListManager && typeof window.itemListManager.resetMouseEventStates === 'function') {
                        window.itemListManager.resetMouseEventStates();
                    }
                } else {
                    console.warn('[TopicListManager] uiManager不可用，无法切换到助手页面');
                }
            }
        });

        // 防止中键点击的默认行为
        topicsContainer.addEventListener('mousedown', (e) => {
            if (e.button === 1) { // 中键
                e.preventDefault();
            }
        });

        //console.log('[TopicListManager] 鼠标快捷键设置完成');
    }

    // --- Public API ---
    return {
        init,
        loadTopicList,
        setupTopicSearch,
        showTopicContextMenu,
        setupMouseShortcuts,
        initializeTopicSortable
    };
})();