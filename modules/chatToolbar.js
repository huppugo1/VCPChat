// chatToolbar.js - Handles the transparent toolbar at the top of the message area

window.ChatToolbar = (() => {
    let tauriAPI;
    let currentSelectedItemRef;
    let currentTopicIdRef;
    
    // DOM elements
    let collapseThinkingCheckbox;
    let independentQACheckbox;
    let voiceReadCheckbox;
    let speakerSearch;
    let speakerList;
    let speakerDropdown;
    
    // State
    let currentGroupMembers = [];
    let selectedSpeakerId = null;
    let isInviteMode = false; // 是否处于邀请模式
    let toolbarSettings = {
        collapseThinking: false,
        independentQA: false,
        voiceRead: false
    };

    function init(dependencies) {
        //console.log('[ChatToolbar] Initializing...');
        tauriAPI = dependencies.tauriAPI;
        currentSelectedItemRef = dependencies.currentSelectedItemRef;
        currentTopicIdRef = dependencies.currentTopicIdRef;
        
        // Get DOM elements
        collapseThinkingCheckbox = document.getElementById('collapseThinkingCheckbox');
        independentQACheckbox = document.getElementById('independentQACheckbox');
        voiceReadCheckbox = document.getElementById('voiceReadCheckbox');
        speakerSearch = document.getElementById('speakerSearch');
        speakerList = document.getElementById('speakerList');
        speakerDropdown = document.getElementById('speakerDropdown');
        
        // Only check for essential elements (collapseThinkingCheckbox is optional)
        if (!independentQACheckbox || !voiceReadCheckbox || 
            !speakerSearch || !speakerList || !speakerDropdown) {
            console.error('[ChatToolbar] Required DOM elements not found');
            return;
        }
        
        setupEventListeners();
        loadSettings();
        //console.log('[ChatToolbar] Initialized successfully');
    }
    
    function setupEventListeners() {
        // Checkbox event listeners
        if (collapseThinkingCheckbox) {
            collapseThinkingCheckbox.addEventListener('change', (e) => {
                toolbarSettings.collapseThinking = e.target.checked;
                saveSettings();
            });
        }
        
        independentQACheckbox.addEventListener('change', (e) => {
            toolbarSettings.independentQA = e.target.checked;
            updateIndependentQALabel();
            saveSettings();
            //console.log('[ChatToolbar] Independent QA:', toolbarSettings.independentQA);
        });
        
        voiceReadCheckbox.addEventListener('change', (e) => {
            toolbarSettings.voiceRead = e.target.checked;
            saveSettings();
            //console.log('[ChatToolbar] Voice read:', toolbarSettings.voiceRead);
            
            // 如果取消勾选，停止所有语音朗读
            if (!e.target.checked) {
                if (window.messageRenderer && typeof window.messageRenderer.stopAllSpeech === 'function') {
                    window.messageRenderer.stopAllSpeech();
                }
            }
        });
        
        // Speaker dropdown event listeners
        speakerSearch.addEventListener('click', () => {
            // 非邀请模式下不允许打开下拉列表
            if (!isInviteMode) {
                //console.log('[ChatToolbar] Not in invite mode, speaker list disabled');
                return;
            }
            toggleSpeakerList();
        });
        
        speakerSearch.addEventListener('focus', () => {
            // 非邀请模式下不允许打开下拉列表
            if (!isInviteMode) {
                speakerSearch.blur(); // 立即失去焦点
                return;
            }
            speakerSearch.removeAttribute('readonly');
            showSpeakerList();
        });
        
        speakerSearch.addEventListener('blur', () => {
            // Delay to allow click on list items
            setTimeout(() => {
                hideSpeakerList();
                speakerSearch.setAttribute('readonly', 'readonly');
            }, 200);
        });
        
        speakerSearch.addEventListener('input', (e) => {
            filterSpeakerList(e.target.value);
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!speakerDropdown.contains(e.target)) {
                hideSpeakerList();
            }
        });
    }
    
    function toggleSpeakerList() {
        // 非邀请模式下不允许打开下拉列表
        if (!isInviteMode) {
            //console.log('[ChatToolbar] Not in invite mode, speaker list disabled');
            return;
        }
        
        if (speakerList.classList.contains('show')) {
            hideSpeakerList();
        } else {
            showSpeakerList();
        }
    }
    
    function showSpeakerList() {
        speakerList.classList.add('show');
    }
    
    function hideSpeakerList() {
        speakerList.classList.remove('show');
    }
    
    function filterSpeakerList(searchText) {
        const items = speakerList.querySelectorAll('.speaker-item');
        const lowerSearch = searchText.toLowerCase();
        
        items.forEach(item => {
            const name = item.dataset.name.toLowerCase();
            if (name.includes(lowerSearch)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }
    
    async function updateSpeakerList(groupConfig) {
        console.log('[ChatToolbar] updateSpeakerList 被调用，配置:', groupConfig);
        
        if (!groupConfig || !groupConfig.members || groupConfig.members.length === 0) {
            console.log('[ChatToolbar] 没有群组成员可显示');
            speakerList.innerHTML = '<div class="speaker-item" style="opacity: 0.6;">无可用成员</div>';
            speakerSearch.value = '';
            speakerSearch.disabled = true;
            speakerDropdown.classList.add('disabled');
            isInviteMode = false;
            currentGroupMembers = [];
            selectedSpeakerId = null;
            return;
        }
        
        console.log('[ChatToolbar] 群组成员:', groupConfig.members);
        
        // 检查是否为邀请模式
        isInviteMode = groupConfig.mode === 'invite_only' || groupConfig.invite_only === true;
        console.log('[ChatToolbar] 邀请模式:', isInviteMode, '群组模式:', groupConfig.mode);
        
        // 根据邀请模式设置发言人搜索的状态
        if (isInviteMode) {
            speakerSearch.disabled = false;
            speakerDropdown.classList.remove('disabled');
        } else {
            speakerSearch.disabled = true;
            speakerDropdown.classList.add('disabled');
            speakerList.classList.remove('show'); // 确保下拉列表关闭
        }
        
        //console.log('[ChatToolbar] Updating speaker list with members:', groupConfig.members);
        currentGroupMembers = [];
        
        // Fetch member details
        for (const memberId of groupConfig.members) {
            try {
                let memberConfig = null;
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    memberConfig = await window.__TAURI__.invoke('get_agent_config', { agentId: memberId });
                } else if (tauriAPI && tauriAPI.getAgentConfig) {
                    memberConfig = await tauriAPI.getAgentConfig(memberId);
                }
                
                if (memberConfig && !memberConfig.error) {
                    currentGroupMembers.push({
                        id: memberId,
                        name: memberConfig.name || '未命名',
                        avatar: memberConfig.avatar || 'assets/default_avatar.png'
                    });
                }
            } catch (error) {
                console.error(`[ChatToolbar] Error fetching member ${memberId}:`, error);
            }
        }
        
        // Render speaker list
        renderSpeakerList();
        
        console.log('[ChatToolbar] 当前群组成员数量:', currentGroupMembers.length);
        
        // 每次更新群组时都重置并选择第一个成员（即使之前有选择）
        if (currentGroupMembers.length > 0) {
            // 检查之前选择的成员是否在新群组中
            const previousMemberStillExists = selectedSpeakerId && currentGroupMembers.some(m => m.id === selectedSpeakerId);
            
            if (!previousMemberStillExists) {
                // 如果之前的成员不在新群组中，选择第一个成员
                console.log('[ChatToolbar] 之前的成员不在新群组中，选择第一个成员:', currentGroupMembers[0]);
                selectSpeaker(currentGroupMembers[0].id);
            } else {
                console.log('[ChatToolbar] 保持之前选择的成员:', selectedSpeakerId);
                // 即使保持选择，也要更新显示（因为成员名称可能不同）
                selectSpeaker(selectedSpeakerId);
            }
        }
    }
    
    function renderSpeakerList() {
        speakerList.innerHTML = '';
        
        if (currentGroupMembers.length === 0) {
            speakerList.innerHTML = '<div class="speaker-item" style="opacity: 0.6;">无可用成员</div>';
            return;
        }
        
        currentGroupMembers.forEach(member => {
            const item = document.createElement('div');
            item.className = 'speaker-item';
            item.dataset.id = member.id;
            item.dataset.name = member.name;
            
            if (member.id === selectedSpeakerId) {
                item.classList.add('selected');
            }
            
            // 创建头像元素
            const avatarImg = document.createElement('img');
            avatarImg.src = member.avatar;
            avatarImg.alt = member.name;
            avatarImg.className = 'speaker-item-avatar';
            // 使用 addEventListener 代替内联 onerror
            avatarImg.addEventListener('error', function() {
                this.src = 'assets/default_avatar.png';
            });
            
            // 创建名称元素
            const nameSpan = document.createElement('span');
            nameSpan.className = 'speaker-item-name';
            nameSpan.textContent = member.name;
            
            // 添加到 item
            item.appendChild(avatarImg);
            item.appendChild(nameSpan);
            
            item.addEventListener('click', () => {
                selectSpeaker(member.id);
                hideSpeakerList();
            });
            
            speakerList.appendChild(item);
        });
    }
    
    async function selectSpeaker(speakerId) {
        selectedSpeakerId = speakerId;
        let member = currentGroupMembers.find(m => m.id === speakerId);
        
        console.log('[ChatToolbar] selectSpeaker 被调用，ID:', speakerId, '成员:', member);
        
        // 如果在 currentGroupMembers 中找不到，尝试异步加载
        if (!member) {
            console.log('[ChatToolbar] 成员不在缓存中，尝试加载配置...');
            try {
                let memberConfig = null;
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    memberConfig = await window.__TAURI__.invoke('get_agent_config', { agentId: speakerId });
                } else if (tauriAPI && tauriAPI.getAgentConfig) {
                    memberConfig = await tauriAPI.getAgentConfig(speakerId);
                }
                
                if (memberConfig && !memberConfig.error) {
                    member = {
                        id: speakerId,
                        name: memberConfig.name || '未命名',
                        avatar: memberConfig.avatar || 'assets/default_avatar.png'
                    };
                    // 添加到缓存
                    if (!currentGroupMembers.find(m => m.id === speakerId)) {
                        currentGroupMembers.push(member);
                    }
                    console.log('[ChatToolbar] 成功加载成员配置:', member);
                }
            } catch (error) {
                console.error('[ChatToolbar] 加载成员配置失败:', error);
            }
        }
        
        if (member) {
            speakerSearch.value = member.name;
            console.log('[ChatToolbar] 设置发言人显示:', member.name);
            
            // Update selected state in list
            const items = speakerList.querySelectorAll('.speaker-item');
            items.forEach(item => {
                if (item.dataset.id === speakerId) {
                    item.classList.add('selected');
                } else {
                    item.classList.remove('selected');
                }
            });
        } else {
            console.warn('[ChatToolbar] 未找到成员:', speakerId);
        }
    }
    
    function getSelectedSpeaker() {
        return selectedSpeakerId;
    }
    
    function getToolbarSettings() {
        return { ...toolbarSettings };
    }
    
    function updateIndependentQALabel() {
        const label = document.getElementById('independentQALabel');
        if (label) {
            label.textContent = toolbarSettings.independentQA ? '无上下文' : '带上下文';
        }
    }
    
    function saveSettings() {
        try {
            localStorage.setItem('chatToolbarSettings', JSON.stringify(toolbarSettings));
        } catch (error) {
            console.error('[ChatToolbar] Error saving settings:', error);
        }
    }
    
    function loadSettings() {
        try {
            const saved = localStorage.getItem('chatToolbarSettings');
            if (saved) {
                toolbarSettings = JSON.parse(saved);
                
                // Apply saved settings to checkboxes
                if (collapseThinkingCheckbox) {
                    collapseThinkingCheckbox.checked = toolbarSettings.collapseThinking || false;
                }
                independentQACheckbox.checked = toolbarSettings.independentQA || false;
                voiceReadCheckbox.checked = toolbarSettings.voiceRead || false;
                
                // Update label text
                updateIndependentQALabel();
            }
        } catch (error) {
            console.error('[ChatToolbar] Error loading settings:', error);
        }
    }
    
    function clearSpeakerList() {
        currentGroupMembers = [];
        selectedSpeakerId = null;
        isInviteMode = false;
        speakerList.innerHTML = '';
        speakerSearch.value = '';
        speakerSearch.disabled = true;
        speakerDropdown.classList.add('disabled');
        //console.log('[ChatToolbar] Speaker list cleared');
    }
    
    return {
        init,
        updateSpeakerList,
        clearSpeakerList,
        getSelectedSpeaker,
        getToolbarSettings,
        selectSpeaker  // Export selectSpeaker so it can be called from grouprenderer
    };
})();
