// V-Chat Search Manager
// This module handles the global search functionality.

const searchManager = {
    // --- Properties ---
    tauriAPI: null,
    uiHelper: null,
    chatManager: null,
    currentSelectedItemRef: null,

    elements: {},
    state: {
        allAgents: {},
        allGroups: {},
        searchResults: [],
        currentPage: 1,
        resultsPerPage: 20,
        isFetching: false,
        currentQuery: '',
    },

    // --- Initialization ---
    init(dependencies) {
        //console.log('[SearchManager] Initializing...');
        this.tauriAPI = dependencies.tauriAPI;
        this.uiHelper = dependencies.uiHelper;
        this.chatManager = dependencies.modules.chatManager;
        this.currentSelectedItemRef = dependencies.refs.currentSelectedItemRef;

        this.cacheDOMElements();
        this.setupEventListeners();
    },

    cacheDOMElements() {
        this.elements.modal = document.getElementById('global-search-modal');
        this.elements.closeButton = document.getElementById('global-search-close-button');
        this.elements.input = document.getElementById('global-search-input');
        this.elements.resultsContainer = document.getElementById('global-search-results');
        this.elements.paginationContainer = document.getElementById('global-search-pagination');
    },

    setupEventListeners() {
        // Global key listener for opening (Ctrl+F or Command+F) and closing (Esc) the modal
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                this.openModal();
            }
            if (e.key === 'Escape' && this.elements.modal.style.display !== 'none') {
                e.preventDefault();
                this.closeModal();
            }
        });

        // Close button
        this.elements.closeButton.addEventListener('click', () => this.closeModal());

        // Close by clicking overlay
        this.elements.modal.addEventListener('click', (e) => {
            if (e.target === this.elements.modal) {
                this.closeModal();
            }
        });

        // Perform search on Enter
        this.elements.input.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                const query = this.elements.input.value.trim();
                if (query && query !== this.state.currentQuery) {
                    this.performSearch(query);
                }
            }
        });
    },
    /**
     * Unified backend caller: prefer Tauri invoke, fallback to a provided function (usually this.tauriAPI).
     * @param {string} cmd
     * @param {object} args
     * @param {Function} fallback - function returning a Promise
     */
    async callBackend(cmd, args, fallback) {
        try {
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                return await window.__TAURI__.invoke(cmd, args);
            }
            if (typeof fallback === 'function') {
                return await fallback();
            }
            throw new Error('No backend available for ' + cmd);
        } catch (err) {
            console.error(`[SearchManager.callBackend] ${cmd} failed:`, err);
            if (typeof fallback === 'function') {
                try { return await fallback(); } catch (e) { /* ignore */ }
            }
            throw err;
        }
    },

    openModal() {
        this.elements.modal.style.display = 'flex';
        this.elements.input.focus();
        this.elements.input.select();
    },

    closeModal() {
        this.elements.modal.style.display = 'none';
    },

    async performSearch(query) {
        if (this.state.isFetching) {
            //console.log('[SearchManager] Search already in progress.');
            return;
        }
        if (!query || query.length < 2) {
            this.elements.resultsContainer.innerHTML = '<p style="text-align: center; padding: 20px;">请输入至少2个字符进行搜索。</p>';
            this.state.searchResults = [];
            this.renderSearchResults();
            return;
        }

        this.state.isFetching = true;
        this.state.currentQuery = query;
        this.elements.resultsContainer.innerHTML = '<p style="text-align: center; padding: 20px;">正在努力搜索中...</p>';
        this.elements.paginationContainer.innerHTML = '';

        try {
            const [agents, groups] = await Promise.all([
                this.callBackend('get_agents', {}, () => {
                    return this.tauriAPI && typeof this.tauriAPI.getAgents === 'function'
                        ? this.tauriAPI.getAgents()
                        : Promise.resolve([]);
                }),
                this.callBackend('get_agent_groups', {}, () => {
                    return this.tauriAPI && typeof this.tauriAPI.getAgentGroups === 'function'
                        ? this.tauriAPI.getAgentGroups()
                        : Promise.resolve([]);
                })
            ]);

            if ((!agents || agents.error) || (!groups || groups.error)) {
                throw new Error(`Failed to fetch data. AgentError: ${agents?.error}, GroupError: ${groups?.error}`);
            }
            
            this.state.allAgents = agents.reduce((acc, agent) => { acc[agent.id] = agent; return acc; }, {});
            this.state.allGroups = groups.reduce((acc, group) => { acc[group.id] = group; return acc; }, {});

            const lowerCaseQuery = query.toLowerCase();
            let allFoundMessages = [];
            const topicsToFetch = [];

            const processItem = (item, type) => {
                if (item.topics && item.topics.length > 0) {
                    item.topics.forEach(topic => {
                        topicsToFetch.push({
                            context: {
                                itemId: item.id,
                                itemName: item.name,
                                itemType: type,
                                itemAvatar: item.avatarUrl,
                                topicId: topic.id,
                                topicName: topic.name
                            }
                        });
                    });
                }
            };

            agents.forEach(agent => processItem(agent, 'agent'));
            groups.forEach(group => processItem(group, 'group'));

            const historyReadPromises = topicsToFetch.map(info => {
                const { itemType, itemId, topicId } = info.context;
                const promise = itemType === 'agent'
                    ? this.callBackend('get_chat_history', { agentId: itemId, topicId: topicId }, () => {
                        return this.tauriAPI && typeof this.tauriAPI.getChatHistory === 'function'
                            ? this.tauriAPI.getChatHistory(itemId, topicId)
                            : Promise.resolve([]);
                    })
                    : this.callBackend('get_group_chat_history', { groupId: itemId, topicId: topicId }, () => {
                        return this.tauriAPI && typeof this.tauriAPI.getGroupChatHistory === 'function'
                            ? this.tauriAPI.getGroupChatHistory(itemId, topicId)
                            : Promise.resolve([]);
                    });

                return promise.then(history => {
                    if (history && !history.error) {
                        return { history, context: info.context };
                    }
                    if (history && history.error) {
                         console.warn(`[SearchManager] Error fetching history for ${itemType} ${itemId}/${topicId}:`, history.error);
                    }
                    return null;
                }).catch(err => {
                    console.error(`[SearchManager] Critical error fetching history for ${itemType} ${itemId}/${topicId}:`, err);
                    return null;
                });
            });

            const results = await Promise.all(historyReadPromises);

            results.filter(r => r !== null).forEach(result => {
                result.history.forEach(message => {
                    const content = (typeof message.content === 'object' && message.content !== null && message.content.text)
                        ? message.content.text
                        : String(message.content || '');

                    if (content.toLowerCase().includes(lowerCaseQuery)) {
                        allFoundMessages.push({
                            ...message,
                            context: result.context
                        });
                    }
                });
            });

            this.state.searchResults = allFoundMessages.sort((a, b) => b.timestamp - a.timestamp);
            this.state.currentPage = 1;
            this.renderSearchResults();

        } catch (error) {
            console.error('[SearchManager] Error during search:', error);
            this.elements.resultsContainer.innerHTML = `<p style="text-align: center; padding: 20px; color: var(--danger-text);">搜索时发生错误: ${error.message}</p>`;
        } finally {
            this.state.isFetching = false;
        }
    },

    renderSearchResults() {
        this.elements.resultsContainer.innerHTML = '';
        this.elements.paginationContainer.innerHTML = '';

        if (this.state.searchResults.length === 0) {
            this.elements.resultsContainer.innerHTML = '<p style="text-align: center; padding: 20px;">未找到匹配的结果。</p>';
            return;
        }

        const startIndex = (this.state.currentPage - 1) * this.state.resultsPerPage;
        const endIndex = startIndex + this.state.resultsPerPage;
        const paginatedResults = this.state.searchResults.slice(startIndex, endIndex);

        paginatedResults.forEach(message => {
            const itemEl = document.createElement('div');
            itemEl.classList.add('search-result-item');
            itemEl.addEventListener('click', () => this.navigateToMessage(message));

            const contentText = (typeof message.content === 'object' && message.content !== null && message.content.text)
                ? message.content.text
                : String(message.content || '');

            const contextEl = document.createElement('div');
            contextEl.classList.add('context');
            contextEl.textContent = `${message.context.itemName} > ${message.context.topicName}`;

            const contentWrapperEl = document.createElement('div');
            contentWrapperEl.classList.add('content');

            const query = this.state.currentQuery;
            const highlightedContent = query
                ? contentText.replace(new RegExp(this.escapeRegExp(query), 'gi'), (match) => `<strong>${match}</strong>`)
                : contentText;

            contentWrapperEl.innerHTML = `<span class="name">${message.name || message.role}: </span>${highlightedContent}`;

            itemEl.appendChild(contextEl);
            itemEl.appendChild(contentWrapperEl);
            this.elements.resultsContainer.appendChild(itemEl);
        });

        this.renderPagination();
    },

    renderPagination() {
        const totalPages = Math.ceil(this.state.searchResults.length / this.state.resultsPerPage);
        if (totalPages <= 1) return;

        const prevButton = document.createElement('button');
        prevButton.textContent = '上一页';
        prevButton.classList.add('pagination-button');
        prevButton.disabled = this.state.currentPage === 1;
        prevButton.addEventListener('click', () => {
            if (this.state.currentPage > 1) {
                this.state.currentPage--;
                this.renderSearchResults();
            }
        });

        const nextButton = document.createElement('button');
        nextButton.textContent = '下一页';
        nextButton.classList.add('pagination-button');
        nextButton.disabled = this.state.currentPage === totalPages;
        nextButton.addEventListener('click', () => {
            if (this.state.currentPage < totalPages) {
                this.state.currentPage++;
                this.renderSearchResults();
            }
        });

        const pageInfo = document.createElement('span');
        pageInfo.textContent = `第 ${this.state.currentPage} / ${totalPages} 页 (共 ${this.state.searchResults.length} 条结果)`;
        pageInfo.style.margin = '0 15px';

        this.elements.paginationContainer.appendChild(prevButton);
        this.elements.paginationContainer.appendChild(pageInfo);
        this.elements.paginationContainer.appendChild(nextButton);
    },

    async navigateToMessage(message) {
        this.closeModal();

        const { itemId, itemType, topicId, itemName, itemAvatar } = message.context;
        
        const itemConfig = (itemType === 'agent') 
            ? this.state.allAgents[itemId] 
            : this.state.allGroups[itemId];
            
        if (!itemConfig) {
            console.error(`[SearchManager] Could not find config for ${itemType} with ID ${itemId}`);
            this.uiHelper.showToastNotification('无法导航：找不到对应的项目配置。', 'error');
            return;
        }

        // 核心修复：确保 selectItem 的异步操作完成后再继续
        await this.chatManager.selectItem(itemId, itemType, itemName, itemAvatar, itemConfig);
        // 核心修改：移除了 setTimeout，直接 await selectTopic，确保历史记录加载完毕
        await this.chatManager.selectTopic(topicId);

        // 核心修复：在 requestAnimationFrame 之后给浏览器一个渲染的喘息时间
        await new Promise(resolve => setTimeout(resolve, 100));

        const messageEl = document.querySelector(`.message-item[data-message-id='${message.id}']`);
        if (messageEl) {
            messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            messageEl.classList.add('message-highlight');
            setTimeout(() => {
                messageEl.classList.remove('message-highlight');
            }, 2500); // 保留高亮效果的延时
        } else {
            console.warn(`[SearchManager] Could not find message element with ID: ${message.id} after loading history.`);
            this.uiHelper.showToastNotification('成功定位到话题，但无法高亮显示具体消息。', 'info');
        }
    },

    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
};

export default searchManager;