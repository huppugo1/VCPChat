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
            const topicsHeader = topicListContainer.querySelector('.topics-header') || document.createElement('div');
            if (!topicsHeader.classList.contains('topics-header')) {
                topicsHeader.className = 'topics-header';
                topicsHeader.innerHTML = `<h2>话题列表</h2><div class="topic-search-container"><input type="text" id="topicSearchInput" placeholder="搜索话题..." class="topic-search-input"></div>`;
                topicListContainer.prepend(topicsHeader);
                const newTopicSearchInput = topicsHeader.querySelector('#topicSearchInput');
                if (newTopicSearchInput) setupTopicSearchListener(newTopicSearchInput);
            }
            
            topicListUl = document.createElement('ul');
            topicListUl.className = 'topic-list';
            topicListUl.id = 'topicList';
            topicListContainer.appendChild(topicListUl);
        }

        // 话题列表标签页：始终显示所有话题
        await loadAllTopicsFromAllSources(topicListUl);
    }

    // 加载所有 Agent 和群组的话题
    async function loadAllTopicsFromAllSources(topicListUl) {
        const searchInput = document.getElementById('topicSearchInput');
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
        
        if (!searchTerm) {
            topicListUl.innerHTML = `<li><div class="loading-spinner-small"></div>正在加载所有话题...</li>`;
        } else {
            topicListUl.innerHTML = '';
        }
        
        let allTopics = [];
        
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
                            // 先选中对应的 Agent/群组
                            if (mainRendererFunctions.selectItem) {
                                await mainRendererFunctions.selectItem(topic.itemId, topic.itemType, topic.itemName, null, null);
                            }
                            // 再选中话题
                            await mainRendererFunctions.selectTopic(topic.id);
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
            }
        }
    }
