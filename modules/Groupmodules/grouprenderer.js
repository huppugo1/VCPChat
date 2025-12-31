// Grouprenderer.js - Handles UI and logic for Agent Groups

window.GroupRenderer = (() => {
    let tauriAPI;
    let globalSettings;
    let currentSelectedItemRef; // Reference to renderer's currentSelectedItem { get, set }
    let currentTopicIdRef;      // Reference to renderer's currentTopicId { get, set }
    let currentChatHistoryRef;  // Reference to renderer's currentChatHistory { get, set }
    let messageRenderer;        // Reference to messageRenderer module
    let uiHelper;               // Reference to UI helper functions from renderer.js (openModal, closeModal, etc.)
    let mainRendererElements;   // Restore module-level mainRendererElements
    let selectAgentPromptForSettingsElementFromRenderer; // Specific variable for this element
    let agentSettingsContainerFromRenderer; // Specific variable for this element
    let selectedItemNameForSettingsElementFromRenderer; // 新增：用于存储 selectedItemNameForSettingsSpan 的引用
    let mainRendererFunctions;  // Reference to shared functions from renderer.js (loadItems, highlightActiveItem, etc.)
    let inviteAgentButtonsContainerRef; // 新增：用于存储邀请发言按钮容器的引用

    // DOM Elements specific to Group functionality (some might be created dynamically)
    let groupSettingsContainer;
    let groupSettingsForm;
    let groupNameInput, groupAvatarInput, groupAvatarPreview;
    let groupMembersListDiv, addRemoveMembersBtn;
    let groupChatModeSelect;
    let memberTagsContainer, memberTagsInputsDiv;
    let groupPromptTextarea, invitePromptTextarea;
    let deleteGroupBtn;
    let createNewGroupBtn; // This button is in main.html, renderer.js might attach its listener

    // State for group settings
    let availableAgentsForGroup = []; // To populate member selection

    function init(dependencies) {
        //console.log('[GroupRenderer] init function CALLED. Dependencies received:', Object.keys(dependencies));
        tauriAPI = dependencies.tauriAPI;
        globalSettings = dependencies.globalSettingsRef;
        currentSelectedItemRef = dependencies.currentSelectedItemRef;
        currentTopicIdRef = dependencies.currentTopicIdRef;
        currentChatHistoryRef = dependencies.currentChatHistoryRef; // ✅ 添加：存储 currentChatHistoryRef
        messageRenderer = dependencies.messageRenderer || window.messageRenderer;
        uiHelper = dependencies.uiHelper;
        mainRendererElements = dependencies.mainRendererElements; // Restore assignment
        //console.log('[GroupRenderer INIT] mainRendererElements assigned in init. Value:', mainRendererElements);
        if (mainRendererElements) {
            //console.log('[GroupRenderer INIT] mainRendererElements.currentChatAgentNameH3 is:', mainRendererElements.currentChatAgentNameH3);
            //console.log('[GroupRenderer INIT] mainRendererElements.currentAgentSettingsBtn is:', mainRendererElements.currentItemActionBtn); // Note: renderer.js uses currentItemActionBtn for this
        }
        mainRendererFunctions = dependencies.mainRendererFunctions;
        inviteAgentButtonsContainerRef = dependencies.inviteAgentButtonsContainerRef; // 新增

        if (mainRendererElements) {
            // //console.log('[GroupRenderer INIT] Received mainRendererElements (already logged above):', mainRendererElements);
            // Still assign to specific vars for clarity in displayGroupSettingsPage and logging
            selectAgentPromptForSettingsElementFromRenderer = mainRendererElements.selectItemPromptForSettings;
            agentSettingsContainerFromRenderer = mainRendererElements.agentSettingsContainer;
            selectedItemNameForSettingsElementFromRenderer = mainRendererElements.selectedItemNameForSettingsSpan;
            
            // 静默处理：这些元素在模态框设计中不需要
            // //console.log('[GroupRenderer INIT] mainRendererElements.selectItemPromptForSettings IS:', selectAgentPromptForSettingsElementFromRenderer);
            // //console.log('[GroupRenderer INIT] mainRendererElements.agentSettingsContainer IS:', agentSettingsContainerFromRenderer);
            // //console.log('[GroupRenderer INIT] mainRendererElements.selectedItemNameForSettingsSpan IS:', selectedItemNameForSettingsElementFromRenderer);
        } else {
            console.error('[GroupRenderer INIT] dependencies.mainRendererElements (and thus mainRendererElements) is undefined or null!');
        }
        
        // Get references to group settings form elements (assuming they are added to DOM by renderer.js or main.html)
        // These elements are defined in the innerHTML for groupSettingsContainer in renderer.js
        // We need to ensure they are accessible after renderer.js appends groupSettingsContainer
        // This might be better done after the DOM is fully ready and elements are appended.
        // For now, we'll assume renderer.js makes them available or we query them here.
        ensureGroupSettingsDOM(); // Ensure DOM for group settings is ready
        //console.log('[GroupRenderer] Initialized with dependencies.');
        //console.log('[GroupRenderer INIT] inviteAgentButtonsContainerRef received:', inviteAgentButtonsContainerRef ? 'Exists' : 'MISSING');
        setupGroupSpecificEventListeners();
    }
    
    function ensureGroupSettingsDOM() {
        let settingsTab = document.getElementById('tabContentSettings');
        if (!settingsTab) {
            // 静默处理：使用模态框设计，不需要 tabContentSettings
            return false;
        }

        groupSettingsContainer = document.getElementById('groupSettingsContainer');
        if (!groupSettingsContainer) {
            groupSettingsContainer = document.createElement('div');
            groupSettingsContainer.id = 'groupSettingsContainer';
            groupSettingsContainer.style.display = 'none'; // Initially hidden
            settingsTab.appendChild(groupSettingsContainer);
            //console.log("[GroupRenderer] groupSettingsContainer created.");
        }

        // Always set the innerHTML to ensure all form elements are present
        groupSettingsContainer.innerHTML = `
            <form id="groupSettingsForm">
                <input type="hidden" id="editingGroupId">
                <div class="form-group">
                    <label for="groupNameInput">群组名称:</label>
                    <input type="text" id="groupNameInput" required>
                </div>
                <div class="form-group">
                    <label for="groupAvatarInput">群组头像:</label>
                    <input type="file" id="groupAvatarInput" accept="image/*">
                    <img id="groupAvatarPreview" src="#" alt="群组头像预览" style="display: none; max-width: 100px; max-height: 100px; border-radius: 50%;">
                </div>
                <div class="form-group">
                    <label>群组成员:</label>
                    <div id="groupMembersList" class="group-members-list-container"></div>
                </div>
                <div class="form-group">
                    <label for="groupChatMode">群聊模式:</label>
                    <select id="groupChatMode">
                        <option value="sequential">顺序发言</option>
                        <option value="naturerandom">自然随机</option>
                        <option value="invite_only">邀请发言</option>
                    </select>
                </div>

               <hr class="form-divider">
               <div class="form-group-inline" style="justify-content: space-between; align-items: center; margin-bottom: 10px;">
                   <label for="groupUseUnifiedModel">启用群组统一模型</label>
                   <label class="switch">
                       <input type="checkbox" id="groupUseUnifiedModel">
                       <span class="slider round"></span>
                   </label>
               </div>
               <div id="groupUnifiedModelContainer" class="form-group" style="display: none;">
                   <label for="groupUnifiedModelInput">群组统一模型:</label>
                   <div class="model-input-container">
                       <input type="text" id="groupUnifiedModelInput" placeholder="例如 gemini-pro">
                       <button type="button" id="openGroupModelSelectBtn" class="small-button" title="选择模型">
                           <svg data-slot="icon" fill="none" stroke-width="1.5" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="16" height="16">
                               <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9"></path>
                           </svg>
                       </button>
                   </div>
               </div>
               <hr class="form-divider">

                <div id="memberTagsContainer" class="form-group" style="display: none;">
                    <label>成员 Tags (用于自然随机模式):</label>
                    <div id="memberTagsInputs"></div>
                </div>
                <div class="form-group">
                    <label for="groupPrompt">群设定 (GroupPrompt):</label>
                    <textarea id="groupPrompt" rows="3" placeholder="例如：现在这里是用户家的聊天室..."></textarea>
                </div>
                <div class="form-group">
                    <label for="invitePrompt">发言设定 (InvitePrompt):</label>
                    <textarea id="invitePrompt" rows="3" placeholder="例如：现在轮到你 {{VCPChatAgentName}} 发言了。"></textarea>
                    <small>使用 {{VCPChatAgentName}} 作为被邀请发言的Agent名称占位符。</small>
                </div>
                <div class="form-actions">
                    <button type="submit">保存群组设置</button>
                    <button type="button" id="deleteGroupBtn">删除此群组</button>
                </div>
            </form>
        `;
        //console.log("[GroupRenderer] groupSettingsContainer innerHTML set.");
        // Now that DOM is ensured and populated, get element references
        return getGroupSettingsElements(); // Return true if elements are successfully retrieved
    }


    function getGroupSettingsElements() {
        groupSettingsContainer = document.getElementById('groupSettingsContainer');
        if (!groupSettingsContainer) {
            // Silently return false - container may not exist in this view
            return false;
        }
        groupSettingsForm = document.getElementById('groupSettingsForm');
        groupNameInput = document.getElementById('groupNameInput');
        groupAvatarInput = document.getElementById('groupAvatarInput');
        groupAvatarPreview = document.getElementById('groupAvatarPreview');
        groupMembersListDiv = document.getElementById('groupMembersList');
        groupChatModeSelect = document.getElementById('groupChatMode');
       // 新增：获取统一模型UI元素的引用
       groupUseUnifiedModel = document.getElementById('groupUseUnifiedModel');
       groupUnifiedModelContainer = document.getElementById('groupUnifiedModelContainer');
       groupUnifiedModelInput = document.getElementById('groupUnifiedModelInput');
       openGroupModelSelectBtn = document.getElementById('openGroupModelSelectBtn');

        memberTagsContainer = document.getElementById('memberTagsContainer');
        memberTagsInputsDiv = document.getElementById('memberTagsInputs');
        groupPromptTextarea = document.getElementById('groupPrompt');
        invitePromptTextarea = document.getElementById('invitePrompt');
        deleteGroupBtn = document.getElementById('deleteGroupBtn'); // This is the button inside the group settings form
        return true;
    }


    function setupGroupSpecificEventListeners() {
        // Event listener for "Create New Group" button (assuming it's in main.html)
        createNewGroupBtn = document.getElementById('createNewGroupBtn');
        if (createNewGroupBtn) {
            createNewGroupBtn.addEventListener('click', handleCreateNewGroup);
        }
        // Button is optional, no warning needed if not found

        // Listeners for group settings form (will be attached when form is displayed)
        // This is handled in displayGroupSettingsPage
    }

    async function handleCreateNewGroup() {
        uiHelper.openModal('createGroupModal');
        const form = document.getElementById('createGroupForm');
        const nameInput = document.getElementById('newGroupNameInput');
        nameInput.value = `新群组_${Date.now()}`; // Pre-fill with a default name

        // Remove previous event listener to avoid multiple submissions
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        
        newForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const groupName = document.getElementById('newGroupNameInput').value.trim(); // Get value from the new form's input
            if (groupName) {
                uiHelper.closeModal('createGroupModal');
                try {
                    let result = null;
                    if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                        try {
                            result = await window.__TAURI__.invoke('create_agent_group', { name: groupName });
                        } catch (e) {
                            console.warn('create_agent_group invoke failed, falling back to tauriAPI.createAgentGroup', e);
                            result = tauriAPI && typeof tauriAPI.createAgentGroup === 'function' ? await tauriAPI.createAgentGroup(groupName) : null;
                        }
                    } else if (tauriAPI && typeof tauriAPI.createAgentGroup === 'function') {
                        result = await tauriAPI.createAgentGroup(groupName);
                    }
                    if (result && result.success && result.agentGroup) {
                        // uiHelper.showToastNotification(`群组 "${result.agentGroup.name}" 已创建!`); // Removed toast notification
                        await mainRendererFunctions.loadItems(); // Reload combined list
                        mainRendererFunctions.selectItem(result.agentGroup.id, 'group', result.agentGroup.name, result.agentGroup.avatarUrl, result.agentGroup);
                        mainRendererFunctions.switchToTab('settings');
                        // displayGroupSettingsPage is called by selectItem or switchToTab indirectly
                    } else {
                        uiHelper.showToastNotification(`创建群组失败: ${result.error}`, 'error');
                    }
                } catch (error) {
                    console.error('创建群组时出错:', error);
                    uiHelper.showToastNotification(`创建群组时发生错误: ${error.message}`, 'error');
                }
            }
        });
    }

    // Called by renderer.js when a group item is selected
    async function handleSelectGroup(groupId, groupName, groupAvatarUrl, groupConfig) {
        //console.log(`[GroupRenderer] handleSelectGroup 被调用: groupId=${groupId}, groupName=${groupName}`);
        const currentSelectedItem = currentSelectedItemRef.get();
        //console.log(`[GroupRenderer] 当前选中项目:`, currentSelectedItem);
        // 🔧 修复：添加 null 检查
        if (currentSelectedItem && currentSelectedItem.id === groupId && currentSelectedItem.type === 'group' && currentTopicIdRef.get()) {
            //console.log(`[GroupRenderer] 群组 ${groupId} 已选中，跳过重复加载`);
            return; // Already selected this group and a topic is loaded
        }

        //console.log(`[GroupRenderer] 选择群组: ${groupId}, 名称: ${groupName}`);
        currentSelectedItemRef.set({ id: groupId, type: 'group', name: groupName, avatarUrl: groupAvatarUrl, config: groupConfig });
        //console.log(`[GroupRenderer] currentSelectedItemRef 已设置为:`, currentSelectedItemRef.get());
        currentTopicIdRef.set(null); // Reset topic
        messageRenderer.setCurrentSelectedItem(currentSelectedItemRef.get());
        messageRenderer.setCurrentTopicId(null);
        messageRenderer.setCurrentItemAvatar(groupAvatarUrl); // Use group avatar - CORRECTED FUNCTION NAME
        messageRenderer.setCurrentItemAvatarColor(groupConfig?.avatarCalculatedColor || null); // CORRECTED FUNCTION NAME


        if (mainRendererElements.currentChatNameH3) {
            mainRendererElements.currentChatNameH3.textContent = `与群组 ${groupName} 聊天中`;
        }
        if (mainRendererElements.currentItemActionBtn) {
            mainRendererElements.currentItemActionBtn.textContent = '新建群聊话题';
            mainRendererElements.currentItemActionBtn.title = `为群组 ${groupName} 新建群聊话题`;
            mainRendererElements.currentItemActionBtn.style.display = 'inline-block';
        }
        // mainRendererElements.clearCurrentChatBtn.style.display = 'inline-block'; // This button is removed

        mainRendererFunctions.highlightActiveItem(groupId, 'group');

            try {
            // 从群组配置中获取话题列表（不需要单独调用 get_group_topics）
            let topics = null;
            if (groupConfig && Array.isArray(groupConfig.topics)) {
                topics = groupConfig.topics;
                //console.log('[GroupRenderer] 从群组配置中获取到话题列表:', topics);
            } else {
                console.warn('[GroupRenderer] 群组配置中没有话题列表');
                topics = [];
            }
            
            if (topics && topics.length > 0) {
                let topicToLoadId = topics[0].id;
                const rememberedTopicId = localStorage.getItem(`lastActiveTopic_${groupId}_group`);
                if (rememberedTopicId && topics.some(t => t.id === rememberedTopicId)) {
                    topicToLoadId = rememberedTopicId;
                }
                currentTopicIdRef.set(topicToLoadId);
                messageRenderer.setCurrentTopicId(topicToLoadId);
                await loadGroupChatHistory(groupId, topicToLoadId);
            } else {
                // No topics, create a default one
                let defaultTopicResult = null;
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    try {
                        defaultTopicResult = await window.__TAURI__.invoke('create_new_topic', { agentId: groupId, topicName: "主要群聊" });
                    } catch (e) {
                        console.warn('create_new_topic invoke failed, falling back to tauriAPI.createNewTopicForGroup', e);
                        defaultTopicResult = tauriAPI && typeof tauriAPI.createNewTopicForGroup === 'function' ? await tauriAPI.createNewTopicForGroup(groupId, "主要群聊") : null;
                    }
                } else if (tauriAPI && typeof tauriAPI.createNewTopicForGroup === 'function') {
                    defaultTopicResult = await tauriAPI.createNewTopicForGroup(groupId, "主要群聊");
                }
                if (defaultTopicResult && defaultTopicResult.success) {
                    currentTopicIdRef.set(defaultTopicResult.topicId);
                    messageRenderer.setCurrentTopicId(defaultTopicResult.topicId);
                    await loadGroupChatHistory(groupId, defaultTopicResult.topicId);
                } else {
                    const errorMsg = defaultTopicResult?.error || '未知错误';
                    messageRenderer.renderMessage({ role: 'system', content: `创建默认话题失败: ${errorMsg}`, timestamp: Date.now() });
                    await loadGroupChatHistory(groupId, null); // Show "no topic"
                }
            }
        } catch (e) {
            console.error(`选择群组 ${groupId} 时发生错误: `, e);
            messageRenderer.renderMessage({ role: 'system', content: `选择群组时出错: ${e.message}`, timestamp: Date.now() });
        }

        // 安全地启用输入控件
        if (mainRendererElements.messageInput) {
            mainRendererElements.messageInput.disabled = false;
        }
        if (mainRendererElements.sendMessageBtn) {
            mainRendererElements.sendMessageBtn.disabled = false;
        }
        if (mainRendererElements.attachFileBtn) {
            mainRendererElements.attachFileBtn.disabled = false;
        }
        // mainRendererElements.messageInput.focus();

        // After selecting group and loading history, update invite buttons
        //console.log(`[GroupRenderer handleSelectGroup] Checking mode for group ${groupId}. Mode: ${groupConfig?.mode}`);
        if (groupConfig && groupConfig.mode === 'invite_only') {
            //console.log(`[GroupRenderer handleSelectGroup] Group ${groupId} is in invite_only mode. Members:`, groupConfig.members);
            const membersDetails = await Promise.all(
                (groupConfig.members || []).map(async (id) => {
                    let config = null;
                    if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                        try {
                            config = await window.__TAURI__.invoke('get_agent_config', { agentId: id });
                        } catch (e) {
                            console.warn('get_agent_config invoke failed for member, falling back to tauriAPI.getAgentConfig', e);
                            config = tauriAPI && typeof tauriAPI.getAgentConfig === 'function' ? await tauriAPI.getAgentConfig(id) : null;
                        }
                    } else if (tauriAPI && typeof tauriAPI.getAgentConfig === 'function') {
                        config = await tauriAPI.getAgentConfig(id);
                    }
                    //console.log(`[GroupRenderer handleSelectGroup] Fetched config for member ${id}:`, config ? 'Exists' : 'Error/Null', config?.error);
                    return config;
                })
            );
            const validMembers = membersDetails.filter(m => m && !m.error);
            //console.log(`[GroupRenderer handleSelectGroup] membersDetails count: ${membersDetails.length}, validMembers count: ${validMembers.length}`);
            displayInviteAgentButtons(groupId, currentTopicIdRef.get(), validMembers, groupConfig);
        } else {
            //console.log(`[GroupRenderer handleSelectGroup] Group ${groupId} is NOT in invite_only mode or groupConfig is missing. Clearing buttons.`);
            clearInviteAgentButtons();
        }
        
        // Update chat toolbar with group members
        if (window.ChatToolbar && typeof window.ChatToolbar.updateSpeakerList === 'function') {
            await window.ChatToolbar.updateSpeakerList(groupConfig);
            //console.log('[GroupRenderer] Updated chat toolbar speaker list');
        }
    }


    async function displayGroupSettingsPage(groupId) {
        //console.log('[GroupRenderer] displayGroupSettingsPage called for groupId:', groupId);
        
        // Use the module-level specific references that were set during init
        // const localSelectPrompt = selectAgentPromptForSettingsElementFromRenderer; // No longer needed if mainRendererElements is used directly
        // const localAgentSettingsContainer = agentSettingsContainerFromRenderer; // No longer needed

        //console.log('[GroupRenderer] selectAgentPromptForSettingsElementFromRenderer at start of displayGroupSettingsPage:', selectAgentPromptForSettingsElementFromRenderer);
        //console.log('[GroupRenderer] agentSettingsContainerFromRenderer at start of displayGroupSettingsPage:', agentSettingsContainerFromRenderer);


        if (!getGroupSettingsElements()) { // This function primarily gets elements specific to group settings form
            // Silently return if elements not found - may not be in settings view
            return;
        }

        let groupConfig = null;
        if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
            try {
                groupConfig = await window.__TAURI__.invoke('get_agent_group_config', { groupId: groupId });
            } catch (e) {
                console.warn('get_agent_group_config invoke failed, falling back to tauriAPI.getAgentGroupConfig', e);
                groupConfig = tauriAPI && typeof tauriAPI.getAgentGroupConfig === 'function' ? await tauriAPI.getAgentGroupConfig(groupId) : null;
            }
        } else if (tauriAPI && typeof tauriAPI.getAgentGroupConfig === 'function') {
            groupConfig = await tauriAPI.getAgentGroupConfig(groupId);
        }
        if (!groupConfig || groupConfig.error) {
            console.error(`加载群组配置失败: ${groupConfig?.error || '未知错误'}`); // 调试信息
            if (groupSettingsContainer) groupSettingsContainer.style.display = 'none'; // Hide group settings form
            if (selectAgentPromptForSettingsElementFromRenderer) { // Use direct module-level ref
                selectAgentPromptForSettingsElementFromRenderer.textContent = `加载群组 ${groupId} 配置失败。`;
                selectAgentPromptForSettingsElementFromRenderer.style.display = 'block';
            } else {
                console.error('[GroupRenderer] selectAgentPromptForSettingsElementFromRenderer is undefined when trying to show error for groupConfig load failure.');
            }
            return;
        }

        // Hide agent-specific settings container (using the specific ref from renderer)
        if (agentSettingsContainerFromRenderer && typeof agentSettingsContainerFromRenderer.style !== 'undefined') {
            agentSettingsContainerFromRenderer.style.display = 'none';
        } else {
            // Fallback if the reference from renderer.js wasn't correctly passed or is not a DOM element
            const fallbackAgentSettings = document.getElementById('agentSettingsContainer');
            if (fallbackAgentSettings) fallbackAgentSettings.style.display = 'none';
            else console.warn('[GroupRenderer] agentSettingsContainerFromRenderer (and fallback) is undefined, cannot hide agent settings.');
        }
        
        // Show group-specific settings container (this is managed within GroupRenderer)
        if (groupSettingsContainer && typeof groupSettingsContainer.style !== 'undefined') {
            groupSettingsContainer.style.display = 'block';
        }
        
        // Hide the "select item" prompt (using the specific ref from renderer)
        if (selectAgentPromptForSettingsElementFromRenderer) { // Use direct module-level ref
            selectAgentPromptForSettingsElementFromRenderer.style.display = 'none';
        } else {
            console.error('[GroupRenderer] selectAgentPromptForSettingsElementFromRenderer is undefined when trying to hide it.');
            const fallbackPrompt = document.getElementById('selectAgentPromptForSettings'); // Fallback
            if (fallbackPrompt) {
                console.warn('[GroupRenderer] Fallback: Hiding selectAgentPromptForSettings using direct getElementById.');
                fallbackPrompt.style.display = 'none';
            } else {
                console.error('[GroupRenderer] CRITICAL: selectAgentPromptForSettings element not found even with direct getElementById.');
            }
        }

        // Use the specific module-level reference for selectedItemNameForSettingsElementFromRenderer
        if (selectedItemNameForSettingsElementFromRenderer) {
            selectedItemNameForSettingsElementFromRenderer.textContent = groupConfig.name || groupId;
        } else {
            console.error('[GroupRenderer] selectedItemNameForSettingsElementFromRenderer is undefined, cannot set textContent.');
            const fallbackElement = document.getElementById('selectedAgentNameForSettings'); // Fallback
            if (fallbackElement) {
                console.warn('[GroupRenderer] Fallback: Setting selectedAgentNameForSettings using direct getElementById.');
                fallbackElement.textContent = groupConfig.name || groupId;
            } else {
                console.error('[GroupRenderer] CRITICAL: selectedAgentNameForSettings element not found even with direct getElementById.');
            }
        }
        document.getElementById('editingGroupId').value = groupId;

        groupNameInput.value = groupConfig.name || '';
        groupAvatarPreview.style.display = groupConfig.avatarUrl ? 'block' : 'none';
        if (groupConfig.avatarUrl) {
            //console.log('[GroupRenderer] Setting groupAvatarPreview src from groupConfig.avatarUrl:', groupConfig.avatarUrl);
            try {
                await window.avatarManager.applyAvatarToContext('group', groupId, groupConfig.avatarUrl);
            } catch (e) {
                console.warn('[GroupRenderer] avatarManager failed for groupAvatarPreview:', e);
            }
        } else {
            try {
                await window.avatarManager.applyAvatarToContext('group', groupId, 'AppData/assets/default_group_avatar.png');
            } catch (e) {}
        }
        groupAvatarInput.value = ''; // Clear file input

        groupChatModeSelect.value = groupConfig.mode || 'sequential';
        groupPromptTextarea.value = groupConfig.groupPrompt || '';
        invitePromptTextarea.value = groupConfig.invitePrompt || '现在轮到你{{VCPChatAgentName}}发言了。';

        await populateGroupMembersSettings(groupConfig);
        toggleMemberTagsVisibility(groupConfig.mode);

       // 新增：处理统一模型UI
       groupUseUnifiedModel.checked = groupConfig.useUnifiedModel === true;
       groupUnifiedModelInput.value = groupConfig.unifiedModel || '';
       groupUnifiedModelContainer.style.display = groupUseUnifiedModel.checked ? 'block' : 'none';

       groupUseUnifiedModel.onchange = () => {
           groupUnifiedModelContainer.style.display = groupUseUnifiedModel.checked ? 'block' : 'none';
       };
       
       // To prevent adding multiple listeners, we replace the button with a clone of itself, which removes all old listeners.
       const newBtn = openGroupModelSelectBtn.cloneNode(true);
       openGroupModelSelectBtn.parentNode.replaceChild(newBtn, openGroupModelSelectBtn);
       openGroupModelSelectBtn = newBtn; // Update our reference to the new button

       openGroupModelSelectBtn.addEventListener('click', async () => {
            try {
                //console.log('[GroupRenderer] Fetching cached models from main process...');
                let models = null;
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    try {
                        models = await window.__TAURI__.invoke('get_cached_models');
                    } catch (e) {
                        console.warn('get_cached_models invoke failed, falling back to tauriAPI.getCachedModels', e);
                        models = tauriAPI && typeof tauriAPI.getCachedModels === 'function' ? await tauriAPI.getCachedModels() : [];
                    }
                } else if (tauriAPI && typeof tauriAPI.getCachedModels === 'function') {
                    models = await tauriAPI.getCachedModels();
                }
                //console.log(`[GroupRenderer] Received ${models?.length || 0} cached models.`);
               // We assume the generic modal can accept a 'models' array in its options to prevent re-fetching.
               uiHelper.openModal('modelSelectModal', (selectedModel) => {
                   if (selectedModel && groupUnifiedModelInput) {
                       groupUnifiedModelInput.value = selectedModel;
                   }
               }, { models: models });
           } catch (error) {
               console.error('Error fetching cached models for group settings:', error);
               uiHelper.showToastNotification('加载模型列表失败', 'error');
           }
       });

        groupChatModeSelect.onchange = () => {
            toggleMemberTagsVisibility(groupChatModeSelect.value);
        };

        if (groupSettingsForm._eventListenerAttached) {
            groupSettingsForm.removeEventListener('submit', handleSaveGroupSettings);
        }
        groupSettingsForm.addEventListener('submit', handleSaveGroupSettings);
        groupSettingsForm._eventListenerAttached = true;


        if (deleteGroupBtn._eventListenerAttached) {
            deleteGroupBtn.removeEventListener('click', handleDeleteCurrentGroup);
        }
        deleteGroupBtn.addEventListener('click', handleDeleteCurrentGroup);
        deleteGroupBtn._eventListenerAttached = true;

        if (groupAvatarInput._eventListenerAttached) {
            groupAvatarInput.removeEventListener('change', handleGroupAvatarChange);
        }
        groupAvatarInput.addEventListener('change', handleGroupAvatarChange);
        groupAvatarInput._eventListenerAttached = true;
    }


    function handleGroupAvatarChange(event) {
        const file = event.target.files[0];
        if (file) {
            uiHelper.openAvatarCropper(file, (croppedFile) => {
                mainRendererFunctions.setCroppedFile('group', croppedFile); // Use renderer's central cropped file store
                if (groupAvatarPreview) {
                    const previewUrl = URL.createObjectURL(croppedFile);
                    window.avatarManager.applyAvatarToContext('group', null, previewUrl);
                    groupAvatarPreview.style.display = 'block';
                }
            });
        }
    }


    async function populateGroupMembersSettings(groupConfig) {
        if (!groupMembersListDiv) {
            console.error("groupMembersListDiv not found for populating members.");
            return;
        }
        groupMembersListDiv.innerHTML = '加载Agent列表中...';
        memberTagsInputsDiv.innerHTML = ''; // Clear old tag inputs

        try {
            const agents = (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function')
                ? await window.__TAURI__.invoke('get_agents')
                : await tauriAPI.getAgents();
            if (agents.error) {
                groupMembersListDiv.innerHTML = `加载Agent列表失败: ${agents.error}`;
                return;
            }
            availableAgentsForGroup = agents; // Store for later use
            groupMembersListDiv.innerHTML = ''; // Clear loading

            agents.forEach(agent => {
                const memberDiv = document.createElement('div');
                memberDiv.className = 'group-member-item';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `member_agent_${agent.id}`;
                checkbox.value = agent.id;
                checkbox.checked = groupConfig.members && groupConfig.members.includes(agent.id);
                checkbox.onchange = () => updateMemberTagsInputs(groupConfig);


                const label = document.createElement('label');
                label.htmlFor = `member_agent_${agent.id}`;
                label.textContent = agent.name;

                const avatar = document.createElement('img');
                avatar.alt = agent.name;
                avatar.className = 'avatar-small';
                if (agent.avatarUrl) {
                    //console.log('[GroupRenderer] Using agent.avatarUrl for member avatar:', agent.id, agent.avatarUrl);
                    // Resolve via avatarManager to ensure consistent URL and cache-busting
                    if (window.avatarManager && typeof window.avatarManager.resolveAvatarUrl === 'function') {
                        window.avatarManager.resolveAvatarUrl(agent.avatarUrl).then(url => { avatar.src = url; }).catch(() => { avatar.src = agent.avatarUrl; });
                    } else {
                        avatar.src = agent.avatarUrl;
                    }
                } else {
                    // Use avatarManager to obtain default avatar URL
                    if (window.avatarManager && typeof window.avatarManager.resolveAvatarUrl === 'function') {
                        window.avatarManager.resolveAvatarUrl('AppData/assets/default_avatar.png').then(url => { avatar.src = url; }).catch(() => {});
                    } else {
                        avatar.src = 'AppData/assets/default_avatar.png';
                    }
                }

                label.prepend(avatar);
                memberDiv.appendChild(checkbox);
                memberDiv.appendChild(label);
                groupMembersListDiv.appendChild(memberDiv);
            });
            updateMemberTagsInputs(groupConfig); // Initial population of tag inputs
        } catch (error) {
            groupMembersListDiv.innerHTML = `加载Agent列表时出错: ${error.message}`;
            console.error("Error populating group members settings:", error);
        }
    }

    function updateMemberTagsInputs(groupConfig) {
        if (!memberTagsInputsDiv || !groupMembersListDiv) return;
        memberTagsInputsDiv.innerHTML = ''; // Clear existing
        const selectedMemberIds = Array.from(groupMembersListDiv.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.value);

        selectedMemberIds.forEach(agentId => {
            const agent = availableAgentsForGroup.find(a => a.id === agentId);
            if (agent) {
                const tagInputDiv = document.createElement('div');
                tagInputDiv.className = 'member-tag-input-item';
                const label = document.createElement('label');
                label.htmlFor = `tags_for_${agentId}`;
                label.textContent = `${agent.name} Tags:`;
                const input = document.createElement('input');
                input.type = 'text';
                input.id = `tags_for_${agentId}`;
                input.dataset.agentId = agentId;
                input.placeholder = "例如: 猫娘,小克,科学";
                input.value = (groupConfig.memberTags && groupConfig.memberTags[agentId]) ? groupConfig.memberTags[agentId] : '';
                tagInputDiv.appendChild(label);
                tagInputDiv.appendChild(input);
                memberTagsInputsDiv.appendChild(tagInputDiv);
            }
        });
    }


    function toggleMemberTagsVisibility(mode) {
        if (memberTagsContainer) {
            memberTagsContainer.style.display = mode === 'naturerandom' ? 'block' : 'none';
        }
    }

    async function handleSaveGroupSettings(event) {
        event.preventDefault();
        if (!getGroupSettingsElements()) {
            console.error("无法保存群组设置，表单元素未找到。"); // 调试信息
            return;
        }

        const groupId = document.getElementById('editingGroupId').value;
        const selectedMemberIds = Array.from(groupMembersListDiv.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.value);

        const memberTags = {};
        if (memberTagsInputsDiv) {
            memberTagsInputsDiv.querySelectorAll('input[type="text"]').forEach(input => {
                memberTags[input.dataset.agentId] = input.value.trim();
            });
        }

        const newConfig = {
            name: groupNameInput.value.trim(),
            members: selectedMemberIds,
            mode: groupChatModeSelect.value,
           // 新增：读取统一模型设置
           useUnifiedModel: groupUseUnifiedModel.checked,
           unifiedModel: groupUnifiedModelInput.value.trim(),
            memberTags: memberTags,
            groupPrompt: groupPromptTextarea.value.trim(),
            invitePrompt: invitePromptTextarea.value.trim()
        };

        if (!newConfig.name) {
            console.error("群组名称不能为空！"); // 调试信息
            return;
        }

        const croppedGroupAvatar = mainRendererFunctions.getCroppedFile('group');
                if (croppedGroupAvatar) {
            try {
                const arrayBuffer = await croppedGroupAvatar.arrayBuffer();
                        // Prefer Tauri invoke for saving avatar, fallback to tauriAPI
                        let avatarResult = null;
                        if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                            try {
                                const uint8 = new Uint8Array(arrayBuffer);
                                let binary = '';
                                for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
                                const base64Data = btoa(binary);
                                avatarResult = await window.__TAURI__.invoke('save_group_avatar', {
                                    groupId: groupId,
                                    name: croppedGroupAvatar.name,
                                    type: croppedGroupAvatar.type,
                                    data_base64: base64Data
                                });
                            } catch (e) {
                                console.warn('save_group_avatar invoke failed, falling back to tauriAPI.saveAgentGroupAvatar', e);
                                if (tauriAPI && typeof tauriAPI.saveAgentGroupAvatar === 'function') {
                                    avatarResult = await tauriAPI.saveAgentGroupAvatar(groupId, {
                                        name: croppedGroupAvatar.name,
                                        type: croppedGroupAvatar.type,
                                        buffer: arrayBuffer
                                    });
                                }
                            }
                        } else if (tauriAPI && typeof tauriAPI.saveAgentGroupAvatar === 'function') {
                            avatarResult = await tauriAPI.saveAgentGroupAvatar(groupId, {
                                name: croppedGroupAvatar.name,
                                type: croppedGroupAvatar.type,
                                buffer: arrayBuffer
                            });
                        }

                        if (avatarResult && avatarResult.success) {
                            newConfig.avatar = avatarResult.avatarFileName; // Save filename to config
                            try {
                                await window.avatarManager.applyAvatarToContext('group', groupId, avatarResult.avatarUrl);
                            } catch (e) {
                                console.warn('avatarManager.applyAvatarToContext failed for group:', e);
                            }
                            mainRendererFunctions.setCroppedFile('group', null); // Clear after save
                            groupAvatarInput.value = '';
                        } else {
                            console.error(`保存群组头像失败: ${avatarResult ? avatarResult.error : '未知错误'}`); // 调试信息
                        }
            } catch (readError) {
                console.error(`读取群组头像文件失败: ${readError.message}`); // 调试信息
            }
        }

            try {
                let result = null;
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    try {
                        result = await window.__TAURI__.invoke('save_agent_group_config', { groupId: groupId, config: newConfig });
                    } catch (e) {
                        console.warn('save_agent_group_config invoke failed, falling back to tauriAPI.saveAgentGroupConfig', e);
                        result = tauriAPI && typeof tauriAPI.saveAgentGroupConfig === 'function' ? await tauriAPI.saveAgentGroupConfig(groupId, newConfig) : null;
                    }
                } else if (tauriAPI && typeof tauriAPI.saveAgentGroupConfig === 'function') {
                    result = await tauriAPI.saveAgentGroupConfig(groupId, newConfig);
                }
                const saveButton = groupSettingsForm.querySelector('button[type="submit"]');

            if (result.success && result.agentGroup) {
                if (saveButton) uiHelper.showSaveFeedback(saveButton, true, "已保存!", "保存群组设置");
                await mainRendererFunctions.loadItems(); // Reload list to reflect name/avatar changes
                // If current selected group is this one, update its details
                const currentSelected = currentSelectedItemRef.get();
                if (currentSelected.id === groupId && currentSelected.type === 'group') {
                    currentSelectedItemRef.set({ ...currentSelected, ...result.agentGroup });
                    if (mainRendererElements && mainRendererElements.currentChatAgentNameH3) {
                        mainRendererElements.currentChatAgentNameH3.textContent = `与群组 ${result.agentGroup.name} 聊天中`;
                    } else {
                        console.warn('[GroupRenderer] mainRendererElements or mainRendererElements.currentChatAgentNameH3 is not available in handleSaveGroupSettings when trying to update chat name.');
                    }
                    messageRenderer.setCurrentItemAvatar(result.agentGroup.avatarUrl);
                    messageRenderer.setCurrentItemAvatarColor(result.agentGroup.avatarCalculatedColor); // Update avatar color
                }
                // Use the specific module-level reference for selectedItemNameForSettingsElementFromRenderer
                if (selectedItemNameForSettingsElementFromRenderer) {
                    selectedItemNameForSettingsElementFromRenderer.textContent = result.agentGroup.name;
                } else {
                     console.error('[GroupRenderer] selectedItemNameForSettingsElementFromRenderer is undefined in handleSaveGroupSettings, cannot set textContent.');
                     const fallbackElement = document.getElementById('selectedAgentNameForSettings'); // Fallback
                     if (fallbackElement) {
                        console.warn('[GroupRenderer] Fallback: Setting selectedAgentNameForSettings using direct getElementById in handleSaveGroupSettings.');
                        fallbackElement.textContent = result.agentGroup.name;
                     } else {
                        console.error('[GroupRenderer] CRITICAL: selectedAgentNameForSettings element not found even with direct getElementById in handleSaveGroupSettings.');
                     }
                }
                // uiHelper.showToastNotification(`群组 "${result.agentGroup.name}" 设置已保存。`); // Removed successful save notification
           } else {
               if (saveButton) uiHelper.showSaveFeedback(saveButton, false, "保存失败", "保存群组设置");
               console.error(`保存群组设置失败: ${result.error}`); // 调试信息
            }

            // Update invite buttons based on new mode after saving
            const updatedGroupConfig = result.agentGroup || newConfig; // Use result if available, else optimistic newConfig
            if (updatedGroupConfig.mode === 'invite_only') {
                const membersDetails = await Promise.all(
                    (updatedGroupConfig.members || []).map(async id => {
                        let cfg = null;
                        if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                            try {
                                cfg = await window.__TAURI__.invoke('get_agent_config', { agentId: id });
                            } catch (e) {
                                console.warn('get_agent_config invoke failed, falling back to tauriAPI.getAgentConfig', e);
                                cfg = tauriAPI && typeof tauriAPI.getAgentConfig === 'function' ? await tauriAPI.getAgentConfig(id) : null;
                            }
                        } else if (tauriAPI && typeof tauriAPI.getAgentConfig === 'function') {
                            cfg = await tauriAPI.getAgentConfig(id);
                        }
                        return cfg;
                    })
                );
                const validMembers = membersDetails.filter(m => m && !m.error);
                displayInviteAgentButtons(groupId, currentTopicIdRef.get(), validMembers, updatedGroupConfig);
            } else {
                clearInviteAgentButtons();
            }

        } catch (error) {
            console.error("Error saving group settings:", error);
            // 使用 uiHelper.showToastNotification 替换 alert
            if (uiHelper && typeof uiHelper.showToastNotification === 'function') {
                uiHelper.showToastNotification(`保存群组设置时出错: ${error.message}`, 'error');
            } else {
                // Fallback if uiHelper is not available for some reason
                console.error(`保存群组设置时出错 (uiHelper not available): ${error.message}`);
            }
        }
    }

    async function handleDeleteCurrentGroup() {
        if (!getGroupSettingsElements()) return;
        const groupId = document.getElementById('editingGroupId').value;
        const groupName = groupNameInput.value || '当前选中的群组';

        const confirmed = await window.ModalManager.confirm(
            `您确定要删除群组 "${groupName}" 吗？其所有聊天记录和设置都将被删除，此操作不可撤销！`,
            '⚠️ 删除群组'
        );
        
        if (confirmed) {
            try {
                let result = null;
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    try {
                        result = await window.__TAURI__.invoke('delete_agent_group', { groupId: groupId });
                    } catch (e) {
                        console.warn('delete_agent_group invoke failed, falling back to tauriAPI.deleteAgentGroup', e);
                        result = tauriAPI && typeof tauriAPI.deleteAgentGroup === 'function' ? await tauriAPI.deleteAgentGroup(groupId) : null;
                    }
                } else if (tauriAPI && typeof tauriAPI.deleteAgentGroup === 'function') {
                    result = await tauriAPI.deleteAgentGroup(groupId);
                }
                if (result && result.success) {
                    // alert(`群组 ${groupName} 已删除。`); // 移除成功提示
                    const currentSelected = currentSelectedItemRef.get();
                    if (currentSelected.id === groupId && currentSelected.type === 'group') {
                        currentSelectedItemRef.set({ id: null, type: null, name: null, avatarUrl: null, config: null });
                        currentTopicIdRef.set(null);
                        if (mainRendererElements && mainRendererElements.currentChatAgentNameH3) {
                            mainRendererElements.currentChatAgentNameH3.textContent = '选择一个Agent或群组开始聊天';
                        } else {
                            console.warn('[GroupRenderer handleDeleteCurrentGroup] mainRendererElements.currentChatAgentNameH3 is not available.');
                        }
                        if (messageRenderer) messageRenderer.clearChat();
                        if (mainRendererElements && mainRendererElements.currentAgentSettingsBtn) mainRendererElements.currentAgentSettingsBtn.style.display = 'none';
                        if (mainRendererElements && mainRendererElements.clearCurrentChatBtn) mainRendererElements.clearCurrentChatBtn.style.display = 'none';
                        if (mainRendererElements && mainRendererElements.messageInput) mainRendererElements.messageInput.disabled = true;
                        if (mainRendererElements && mainRendererElements.sendMessageBtn) mainRendererElements.sendMessageBtn.disabled = true;
                        if (mainRendererElements && mainRendererElements.attachFileBtn) mainRendererElements.attachFileBtn.disabled = true;
                        if (messageRenderer) {
                            messageRenderer.setCurrentItemAvatar(null);
                            messageRenderer.setCurrentItemAvatarColor(null);
                        }
                        clearInviteAgentButtons(); // Clear invite buttons on delete

                        // 显式重置设置区域的UI状态
                        if (groupSettingsContainer) { // 这是本模块管理的群组设置容器
                            groupSettingsContainer.style.display = 'none';
                        }
                        // 确保Agent设置容器也隐藏 (如果之前是显示的)
                        // agentSettingsContainerFromRenderer 是从 renderer.js 传入的 Agent 设置容器
                        if (agentSettingsContainerFromRenderer && agentSettingsContainerFromRenderer.style) {
                             agentSettingsContainerFromRenderer.style.display = 'none';
                        }
                        // selectAgentPromptForSettingsElementFromRenderer 是从 renderer.js 传入的提示元素
                        if (selectAgentPromptForSettingsElementFromRenderer && selectAgentPromptForSettingsElementFromRenderer.style) {
                            selectAgentPromptForSettingsElementFromRenderer.textContent = '请选择一个Agent或群组进行设置。';
                            selectAgentPromptForSettingsElementFromRenderer.style.display = 'block';
                        }
                        // selectedItemNameForSettingsElementFromRenderer 是从 renderer.js 传入的显示名称的元素
                        if (selectedItemNameForSettingsElementFromRenderer) {
                            selectedItemNameForSettingsElementFromRenderer.textContent = ''; // 清空顶部显示的名称
                        }
                    }
                    if (mainRendererFunctions && mainRendererFunctions.loadItems) await mainRendererFunctions.loadItems();
                    
                    // 调用 displaySettingsForItem。
                    // 如果 currentSelectedItemRef.get().id 仍然为 null (例如，列表为空或没有自动选择),
                    // 它应该基于我们上面设置的UI状态正确显示“请选择”提示。
                    // 如果 loadItems 导致了新的选择, 它将显示新选定项的设置。
                    if (mainRendererFunctions && mainRendererFunctions.displaySettingsForItem) {
                        mainRendererFunctions.displaySettingsForItem();
                    }
                } else {
                    console.error(`删除群组失败: ${result.error}`); // 调试信息
                }
            } catch (error) {
                console.error("Error deleting group:", error);
                console.error(`删除群组时出错: ${error.message}`); // 调试信息
            }
        }
    }

    // --- Group Topic Management ---
    async function loadTopicsForGroup(groupId, searchTerm = '') {
        const topicListUl = mainRendererElements.topicListUl;
        if (!topicListUl) {
            console.error("Topic list UL not found for group topics.");
            return;
        }
        topicListUl.innerHTML = `<li><p>正在加载群组 ${groupId} 的话题...</p></li>`;
        try {
            let topics = null;
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                try {
                    topics = await window.__TAURI__.invoke('get_group_topics', { groupId: groupId });
                } catch (e) {
                    console.warn('get_group_topics invoke failed, falling back to tauriAPI.getGroupTopics', e);
                    topics = tauriAPI && typeof tauriAPI.getGroupTopics === 'function' ? await tauriAPI.getGroupTopics(groupId) : null;
                }
            } else if (tauriAPI && typeof tauriAPI.getGroupTopics === 'function') {
                topics = await tauriAPI.getGroupTopics(groupId);
            }
            if (topics && !topics.error && searchTerm) {
                topics = topics.filter(topic =>
                    topic.name.toLowerCase().includes(searchTerm.toLowerCase())
                );
            }
            await renderGroupTopicList(topics, topicListUl, groupId);
        } catch (error) {
            console.error(`加载群组 ${groupId} 话题失败:`, error);
            topicListUl.innerHTML = `<li><p>加载话题失败: ${error.message}</p></li>`;
        }
    }

    async function renderGroupTopicList(topics, container, groupId) {
        container.innerHTML = '';
        if (topics.error) {
            container.innerHTML = `<li>加载话题失败: ${topics.error}</li>`;
            return;
        }
        if (!topics || topics.length === 0) {
            container.innerHTML = '<li>此群组还没有话题。</li>';
            return;
        }

        topics.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        for (const topic of topics) {
            const li = document.createElement('li');
            li.className = 'topic-item';
            li.dataset.itemId = groupId; // Store group ID
            li.dataset.itemType = 'group';
            li.dataset.topicId = topic.id;
            if (topic.id === currentTopicIdRef.get()) {
                li.classList.add('active', 'active-topic-glowing');
            }

            const avatarImg = document.createElement('img');
            avatarImg.className = 'avatar';
            avatarImg.alt = '群组头像';
            const groupConfig = currentSelectedItemRef.get().config;
            const defPath = 'AppData/assets/default_avatar.png';
            if (groupConfig?.avatarUrl) {
                try {
                    const resolved = await window.avatarManager.resolveAvatarUrl(groupConfig.avatarUrl);
                    avatarImg.src = resolved || groupConfig.avatarUrl;
                } catch (e) {
                    console.warn('[GroupRenderer] avatarManager.resolveAvatarUrl failed for topic avatar:', e);
                    avatarImg.src = groupConfig.avatarUrl || defPath;
                }
            } else {
                try {
                    const resolvedDef = await window.avatarManager.resolveAvatarUrl(defPath);
                    avatarImg.src = resolvedDef || defPath;
                } catch (e) {
                    avatarImg.src = defPath;
                }
            }

            const topicNameSpan = document.createElement('span');
            topicNameSpan.className = 'topic-name';
            topicNameSpan.textContent = topic.name;

            li.appendChild(avatarImg);
            li.appendChild(topicNameSpan);
            li.addEventListener('click', () => handleGroupTopicSelection(groupId, topic.id));
            // Add context menu for rename/delete group topic
            li.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                uiHelper.showTopicContextMenu(e, groupId, 'group', topic.id, topic.name, handleRenameGroupTopic, handleDeleteGroupTopic, handleExportGroupTopic);
            });
            container.appendChild(li);
        }
        mainRendererFunctions.initializeTopicSortable(groupId, 'group');
    }

    async function handleGroupTopicSelection(groupId, topicId) {
        currentTopicIdRef.set(topicId);
        messageRenderer.setCurrentTopicId(topicId);
        await loadGroupChatHistory(groupId, topicId);
        localStorage.setItem(`lastActiveTopic_${groupId}_group`, topicId);

        // Bug 1 Fix: Refresh invite buttons if in invite_only mode
        const currentSelected = currentSelectedItemRef.get();
        if (currentSelected && currentSelected.type === 'group' && currentSelected.config) {
            const groupConfig = currentSelected.config;
            if (groupConfig.mode === 'invite_only') {
                //console.log(`[GroupRenderer handleGroupTopicSelection] InviteOnly mode detected for group ${groupId}, topic ${topicId}. Refreshing invite buttons.`);
                const membersDetails = await Promise.all(
                    (groupConfig.members || []).map(async (id) => {
                        const config = await tauriAPI.getAgentConfig(id);
                        if (!config || config.error) {
                            console.warn(`[GroupRenderer handleGroupTopicSelection] Failed to fetch config for member ${id}: ${config?.error}`);
                            return null;
                        }
                        return config;
                    })
                );
                const validMembers = membersDetails.filter(m => m);
                displayInviteAgentButtons(groupId, topicId, validMembers, groupConfig);
            }
        }
    }

    async function handleRenameGroupTopic(groupId, topicId, oldName) {
        const newName = await window.showInputModal('重命名群组话题', `请输入新的话题名称:`, oldName, '话题名称');
        if (newName && newName !== oldName) {
            let result = null;
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                try {
                    result = await window.__TAURI__.invoke('save_group_topic_title', { groupId: groupId, topicId: topicId, title: newName });
                } catch (e) {
                    console.warn('save_group_topic_title invoke failed, falling back to tauriAPI.saveGroupTopicTitle', e);
                    result = tauriAPI && typeof tauriAPI.saveGroupTopicTitle === 'function' ? await tauriAPI.saveGroupTopicTitle(groupId, topicId, newName) : null;
                }
            } else if (tauriAPI && typeof tauriAPI.saveGroupTopicTitle === 'function') {
                result = await tauriAPI.saveGroupTopicTitle(groupId, topicId, newName);
            }
            if (result && result.success) {
                await mainRendererFunctions.loadTopicList(); // Reload topics for current item
            } else {
                console.error(`重命名群组话题失败: ${result?.error || '未知错误'}`);
            }
        }
    }

    async function handleDeleteGroupTopic(groupId, topicId, topicName) {
        const confirmed = await window.ModalManager.confirm(`确定要删除群组话题 "${topicName}" 吗？此操作不可撤销。`, '⚠️ 删除话题');
        if (confirmed) {
            let result = null;
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                try {
                    result = await window.__TAURI__.invoke('delete_group_topic', { groupId: groupId, topicId: topicId });
                } catch (e) {
                    console.warn('delete_group_topic invoke failed, falling back to tauriAPI.deleteGroupTopic', e);
                    result = tauriAPI && typeof tauriAPI.deleteGroupTopic === 'function' ? await tauriAPI.deleteGroupTopic(groupId, topicId) : null;
                }
            } else if (tauriAPI && typeof tauriAPI.deleteGroupTopic === 'function') {
                result = await tauriAPI.deleteGroupTopic(groupId, topicId);
            }
            if (result && result.success) {
                // uiHelper.showToastNotification(`群组话题 "${topicName}" 已删除。`); // 移除成功提示
                if (currentTopicIdRef.get() === topicId) {
                    currentTopicIdRef.set(null);
                    messageRenderer.setCurrentTopicId(null);
                    messageRenderer.clearChat();
                    // Load first available topic or show "no topic"
                    const topics = await tauriAPI.getGroupTopics(groupId);
                    if (topics && topics.length > 0) {
                        handleGroupTopicSelection(groupId, topics[0].id);
                    }
                }
                await mainRendererFunctions.loadTopicList();
            } else {
                console.error(`删除群组话题失败: ${result.error}`); // 调试信息
            }
        }
    }

    async function handleExportGroupTopic(groupId, topicId, topicName) {
        const currentTopicId = currentTopicIdRef.get();
        if (topicId !== currentTopicId) {
            uiHelper.showToastNotification('请先点击并加载此话题，然后再导出。', 'info');
            return;
        }

        //console.log(`[GroupRenderer] Exporting currently visible topic: ${topicName} (ID: ${topicId})`);

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

            let result = null;
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                try {
                    result = await window.__TAURI__.invoke('export_topic_as_markdown', { topicName: topicName, markdownContent: markdownContent });
                } catch (e) {
                    console.warn('export_topic_as_markdown invoke failed, falling back to tauriAPI.exportTopicAsMarkdown', e);
                    result = tauriAPI && typeof tauriAPI.exportTopicAsMarkdown === 'function' ? await tauriAPI.exportTopicAsMarkdown({ topicName: topicName, markdownContent: markdownContent }) : null;
                }
            } else if (tauriAPI && typeof tauriAPI.exportTopicAsMarkdown === 'function') {
                result = await tauriAPI.exportTopicAsMarkdown({ topicName: topicName, markdownContent: markdownContent });
            }

            if (result.success) {
                uiHelper.showToastNotification(`话题 "${topicName}" 已成功导出到: ${result.path}`);
            } else {
                uiHelper.showToastNotification(`导出话题失败: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error(`[GroupRenderer] 导出话题时发生错误:`, error);
            uiHelper.showToastNotification(`导出话题时发生前端错误: ${error.message}`, 'error');
        }
    }

    // --- Group Chat Message Handling ---
    async function handleSendGroupMessage() {
        const content = mainRendererElements.messageInput.value.trim();
        const attachedFiles = mainRendererFunctions.getAttachedFiles(); // Get from renderer.js

        if (!content && attachedFiles.length === 0) return;

        const currentSelected = currentSelectedItemRef.get();
        const currentTopic = currentTopicIdRef.get();

        if (!currentSelected.id || currentSelected.type !== 'group' || !currentTopic) {
            if (uiHelper && uiHelper.showToastNotification) uiHelper.showToastNotification('请先选择一个群组和话题！', 'error'); else console.error('请先选择一个群组和话题！');
            return;
        }
        
        if (!globalSettings) {
            console.error("[GroupRenderer] handleSendGroupMessage called before settings reference was initialized. Aborting.");
            if (uiHelper && uiHelper.showToastNotification) uiHelper.showToastNotification('群组模块尚未完全初始化，请稍后再试。', 'error');
            return;
        }
        const currentGlobalSettings = globalSettings.get();
        if (!currentGlobalSettings.vcpServerUrl) {
            if (uiHelper && uiHelper.showToastNotification) uiHelper.showToastNotification('请先在全局设置中配置VCP服务器URL！', 'error'); else console.error('请先在全局设置中配置VCP服务器URL！');
            if (uiHelper && uiHelper.openModal) uiHelper.openModal('globalSettingsModal');
            return;
        }

        // Get group configuration to know members and chat mode
        let groupConfig = null;
        try {
            //console.log('[GroupRenderer] Attempting to get group config for:', currentSelected.id);
            
            // Use tauriAPI.invoke as the primary method
            if (tauriAPI && typeof tauriAPI.invoke === 'function') {
                //console.log('[GroupRenderer] Using tauriAPI.invoke');
                groupConfig = await tauriAPI.invoke('get_agent_group_config', { groupId: currentSelected.id });
            } else if (tauriAPI && typeof tauriAPI.getAgentGroupConfig === 'function') {
                //console.log('[GroupRenderer] Using tauriAPI.getAgentGroupConfig');
                groupConfig = await tauriAPI.getAgentGroupConfig(currentSelected.id);
            } else if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                //console.log('[GroupRenderer] Using window.__TAURI__.invoke (fallback)');
                groupConfig = await window.__TAURI__.invoke('get_agent_group_config', { groupId: currentSelected.id });
            } else {
                console.error('[GroupRenderer] No method available to get group config');
            }
            //console.log('[GroupRenderer] Got group config:', groupConfig);
        } catch (error) {
            console.error('[GroupRenderer] Failed to get group config:', error);
            if (uiHelper && uiHelper.showToastNotification) uiHelper.showToastNotification(`获取群组配置失败: ${error.message}`, 'error');
            return;
        }

        if (!groupConfig || !groupConfig.members || groupConfig.members.length === 0) {
            console.error('[GroupRenderer] Group has no members');
            console.error('[GroupRenderer] groupConfig:', groupConfig);
            if (uiHelper && uiHelper.showToastNotification) uiHelper.showToastNotification('群组没有成员', 'error');
            return;
        }

        let combinedTextContent = content;
        const uiAttachments = [];

        if (attachedFiles.length > 0) {
            for (const af of attachedFiles) {
                const attachmentInfoForUI = {
                    type: af.file.type,
                    src: af.localPath,
                    name: af.originalName,
                    size: af.file.size,
                    _fileManagerData: af._fileManagerData
                };
                uiAttachments.push(attachmentInfoForUI);

                if (af._fileManagerData && af._fileManagerData.extractedText) {
                    combinedTextContent += `\n\n[附加文件: ${af.originalName}]\n${af._fileManagerData.extractedText}\n[/附加文件结束: ${af.originalName}]`;
                } else if (af._fileManagerData && af.file.type && !af.file.type.startsWith('image/')) {
                    combinedTextContent += `\n\n[附加文件: ${af.originalName} (无法预览文本内容)]`;
                }
            }
        }

        // Render user message in UI
        const userMessageForUI = {
            role: 'user',
            name: currentGlobalSettings.userName || '用户',
            content: { text: content },
            timestamp: Date.now(),
            id: `msg_${Date.now()}_user_${Math.random().toString(36).substring(2, 9)}`,
            attachments: uiAttachments
        };

        messageRenderer.renderMessage(userMessageForUI);

        mainRendererElements.messageInput.value = '';
        mainRendererFunctions.clearAttachedFiles();
        mainRendererFunctions.updateAttachmentPreview();
        uiHelper.autoResizeTextarea(mainRendererElements.messageInput);

        // Save user message to group chat history
        try {
            let history = [];
            try {
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    history = await window.__TAURI__.invoke('get_group_chat_history', { groupId: currentSelected.id, topicId: currentTopic });
                } else if (tauriAPI && typeof tauriAPI.getGroupChatHistory === 'function') {
                    history = await tauriAPI.getGroupChatHistory(currentSelected.id, currentTopic);
                }
            } catch (e) {
                console.warn('[GroupRenderer] Failed to load history, starting with empty:', e);
            }

            history.push(userMessageForUI);

            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                await window.__TAURI__.invoke('save_group_chat_history', { groupId: currentSelected.id, topicId: currentTopic, messages: history });
            } else if (tauriAPI && typeof tauriAPI.saveGroupChatHistory === 'function') {
                await tauriAPI.saveGroupChatHistory(currentSelected.id, currentTopic, history);
            }
        } catch (error) {
            console.error('[GroupRenderer] Failed to save user message to history:', error);
        }

        // Generate AI responses based on chat mode
        // Note: groupConfig uses 'mode' not 'chatMode'
        const chatMode = groupConfig.mode || 'sequential';
        //console.log(`[GroupRenderer] Group chat mode: ${chatMode}, members: ${groupConfig.members.length}`);

        try {
            let agentsToRespond = [];
            
            if (chatMode === 'sequential') {
                // Sequential mode: all agents respond in order
                agentsToRespond = groupConfig.members;
                //console.log(`[GroupRenderer - Sequential] All agents will respond in order: ${agentsToRespond.join(', ')}`);
            } else if (chatMode === 'naturerandom') {
                // Natural random mode: determine which agents should respond based on tags, mentions, and probability
                agentsToRespond = await determineNatureRandomSpeakers(
                    groupConfig.members,
                    currentSelected.id,  // ✅ 使用 currentSelected.id 而不是 groupId
                    currentTopic,
                    groupConfig,
                    combinedTextContent
                );
                //console.log(`[GroupRenderer - NatureRandom] Selected agents: ${agentsToRespond.join(', ')}`);
            } else if (chatMode === 'invite_only') {
                // Invite only mode: no automatic responses, wait for user to click invite buttons
                agentsToRespond = [];
                //console.log('[GroupRenderer - Invite Only] No automatic responses, waiting for user invitation');
                // Display invite buttons for all members
                await displayInviteAgentButtons(currentSelected.id, currentTopic, groupConfig);  // ✅ 使用 currentSelected.id
            } else {
                console.warn(`[GroupRenderer] Unknown chat mode: ${chatMode}, defaulting to sequential`);
                agentsToRespond = groupConfig.members;
            }

            // Generate responses for selected agents
            for (const memberAgentId of agentsToRespond) {
                await generateAgentResponse(memberAgentId, currentSelected.id, currentTopic, groupConfig, combinedTextContent);
            }
        } catch (error) {
            console.error('[GroupRenderer] Error generating AI responses:', error);
            if (uiHelper && uiHelper.showToastNotification) uiHelper.showToastNotification('生成AI回复时出错', 'error');
        }
    }

    // Helper function to determine which agents should speak in nature random mode
    async function determineNatureRandomSpeakers(memberIds, groupId, topicId, groupConfig, userMessageText) {
        const speakers = [];
        const spokenThisTurn = new Set();
        const userMessageLower = userMessageText.toLowerCase();

        // Load group chat history for context
        let history = [];
        try {
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                history = await window.__TAURI__.invoke('get_group_chat_history', { groupId: groupId, topicId: topicId });
            } else if (tauriAPI && typeof tauriAPI.getGroupChatHistory === 'function') {
                history = await tauriAPI.getGroupChatHistory(groupId, topicId);
            }
        } catch (error) {
            console.warn('[GroupRenderer] Failed to load history for nature random:', error);
        }

        // Build context from recent messages
        const CONTEXT_WINDOW = 8;
        const recentHistory = history.slice(-CONTEXT_WINDOW);
        const contextText = recentHistory
            .map(msg => {
                const rawContent = typeof msg.content === 'string' ? msg.content : (msg.content?.text || '');
                return rawContent.replace(/^\[.*?的发言\]:\s*/, '');
            })
            .join(' \n ')
            .toLowerCase();

        // Load all member configs
        const memberConfigs = {};
        for (const memberId of memberIds) {
            try {
                let agentConfig = null;
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    agentConfig = await window.__TAURI__.invoke('get_agent_config', { agentId: memberId });
                } else if (tauriAPI && typeof tauriAPI.getAgentConfig === 'function') {
                    agentConfig = await tauriAPI.getAgentConfig(memberId);
                }
                if (agentConfig) {
                    memberConfigs[memberId] = agentConfig;
                }
            } catch (error) {
                console.warn(`[GroupRenderer] Failed to load config for member ${memberId}:`, error);
            }
        }

        // Priority 1: @角色名 (direct mention in latest message)
        for (const memberId of memberIds) {
            const memberConfig = memberConfigs[memberId];
            if (!memberConfig) continue;
            
            const memberName = memberConfig.name || memberId;
            if (userMessageLower.includes(`@${memberName.toLowerCase()}`)) {
                if (!spokenThisTurn.has(memberId)) {
                    speakers.push(memberId);
                    spokenThisTurn.add(memberId);
                    //console.log(`[NatureRandom] @${memberName} triggered by direct mention`);
                }
            }
        }

        // Priority 2: @角色Tag or keyword matching Tag (in context)
        for (const memberId of memberIds) {
            if (spokenThisTurn.has(memberId)) continue;
            
            const memberConfig = memberConfigs[memberId];
            if (!memberConfig) continue;

            const tagsString = groupConfig.memberTags ? groupConfig.memberTags[memberId] : '';
            if (tagsString) {
                const tags = tagsString.split(/,|，/).map(t => t.trim().toLowerCase()).filter(t => t);
                if (tags.some(tag => contextText.includes(tag) || userMessageLower.includes(`@${tag}`))) {
                    if (!spokenThisTurn.has(memberId)) {
                        speakers.push(memberId);
                        spokenThisTurn.add(memberId);
                        //console.log(`[NatureRandom] Tag match for ${memberConfig.name} (tags: ${tags.join('/')})`);
                    }
                }
            }
        }

        // Priority 3: @所有人 (mention everyone)
        if (userMessageLower.includes('@所有人')) {
            for (const memberId of memberIds) {
                if (!spokenThisTurn.has(memberId)) {
                    speakers.push(memberId);
                    spokenThisTurn.add(memberId);
                    const memberConfig = memberConfigs[memberId];
                    //console.log(`[NatureRandom] @所有人 triggered for ${memberConfig?.name || memberId}`);
                }
            }
        }

        // Priority 4: Probabilistic speaking (for non-triggered members)
        const nonTriggeredMembers = memberIds.filter(id => !spokenThisTurn.has(id));
        const baseRandomSpeakProbability = 0.15; // 15% base probability

        for (const memberId of nonTriggeredMembers) {
            const memberConfig = memberConfigs[memberId];
            if (!memberConfig) continue;

            let speakChance = baseRandomSpeakProbability;
            const tagsString = groupConfig.memberTags ? groupConfig.memberTags[memberId] : '';
            if (tagsString) {
                const tags = tagsString.split(/,|，/).map(t => t.trim().toLowerCase()).filter(t => t);
                if (tags.some(tag => contextText.includes(tag))) {
                    speakChance = 0.85; // 85% if topic-relevant
                    //console.log(`[NatureRandom] Increased speak probability for relevant agent ${memberConfig.name}`);
                }
            }

            if (Math.random() < speakChance) {
                if (!spokenThisTurn.has(memberId)) {
                    speakers.push(memberId);
                    spokenThisTurn.add(memberId);
                    //console.log(`[NatureRandom] Random speak triggered for ${memberConfig.name} with chance ${speakChance.toFixed(2)}`);
                }
            }
        }

        // Priority 5: Fallback speaker (if no one was triggered)
        if (speakers.length === 0 && memberIds.length > 0) {
            // Prefer topic-relevant members
            const relevantMembers = memberIds.filter(id => {
                if (spokenThisTurn.has(id)) return false;
                const memberConfig = memberConfigs[id];
                if (!memberConfig) return false;
                const tagsString = groupConfig.memberTags ? groupConfig.memberTags[id] : '';
                if (!tagsString) return false;
                const tags = tagsString.split(/,|，/).map(t => t.trim().toLowerCase()).filter(t => t);
                return tags.some(tag => contextText.includes(tag));
            });

            let fallbackSpeaker;
            if (relevantMembers.length > 0) {
                const randomIndex = Math.floor(Math.random() * relevantMembers.length);
                fallbackSpeaker = relevantMembers[randomIndex];
                const memberConfig = memberConfigs[fallbackSpeaker];
                //console.log(`[NatureRandom] Fallback speaker (relevant): ${memberConfig?.name || fallbackSpeaker}`);
            } else {
                const fallbackCandidates = memberIds.filter(id => !spokenThisTurn.has(id));
                if (fallbackCandidates.length > 0) {
                    const randomIndex = Math.floor(Math.random() * fallbackCandidates.length);
                    fallbackSpeaker = fallbackCandidates[randomIndex];
                    const memberConfig = memberConfigs[fallbackSpeaker];
                    //console.log(`[NatureRandom] Fallback speaker (random): ${memberConfig?.name || fallbackSpeaker}`);
                }
            }
            if (fallbackSpeaker) {
                speakers.push(fallbackSpeaker);
            }
        }

        // Sort speakers by relevance (tag matches in latest message first)
        speakers.sort((a, b) => {
            const getRelevance = (memberId) => {
                const memberConfig = memberConfigs[memberId];
                if (!memberConfig) return 0;
                const tagsString = groupConfig.memberTags ? groupConfig.memberTags[memberId] : '';
                if (!tagsString) return 0;
                const tags = tagsString.split(/,|，/).map(t => t.trim().toLowerCase()).filter(t => t);
                if (tags.some(tag => userMessageLower.includes(tag))) return 2;
                if (tags.some(tag => contextText.includes(tag))) return 1;
                return 0;
            };

            return getRelevance(b) - getRelevance(a);
        });

        //console.log(`[GroupRenderer - NatureRandom] Determined speakers: ${speakers.map(id => memberConfigs[id]?.name || id).join(', ')}`);
        return speakers;
    }

    // Helper function to display invite agent buttons for invite_only mode
    async function displayInviteAgentButtons(groupId, topicId, groupConfig) {
        const container = inviteAgentButtonsContainerRef ? inviteAgentButtonsContainerRef.get() : null;
        if (!container) {
            console.error('[GroupRenderer] Invite agent buttons container not found');
            return;
        }

        container.innerHTML = '';

        // Note: groupConfig uses 'mode' not 'chatMode'
        if (!groupConfig.members || groupConfig.members.length === 0 || groupConfig.mode !== 'invite_only') {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'grid';

        for (const memberId of groupConfig.members) {
            try {
                let agentConfig = null;
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    agentConfig = await window.__TAURI__.invoke('get_agent_config', { agentId: memberId });
                } else if (tauriAPI && typeof tauriAPI.getAgentConfig === 'function') {
                    agentConfig = await tauriAPI.getAgentConfig(memberId);
                }

                if (!agentConfig) continue;

                const button = document.createElement('button');
                button.className = 'invite-agent-button';
                button.title = `邀请 ${agentConfig.name} 发言`;

                const avatarImg = document.createElement('img');
                avatarImg.src = agentConfig.avatarUrl || 'assets/default_avatar.png';
                avatarImg.alt = agentConfig.name;
                avatarImg.style.width = '32px';
                avatarImg.style.height = '32px';
                avatarImg.style.borderRadius = '50%';

                const nameSpan = document.createElement('span');
                nameSpan.textContent = agentConfig.name;

                button.appendChild(avatarImg);
                button.appendChild(nameSpan);

                button.addEventListener('click', async () => {
                    //console.log(`[GroupRenderer] Inviting agent ${agentConfig.name} to speak`);
                    await generateAgentResponse(memberId, groupId, topicId, groupConfig, '');
                });

                container.appendChild(button);
            } catch (error) {
                console.error(`[GroupRenderer] Failed to create invite button for ${memberId}:`, error);
            }
        }
    }

    // Helper function to generate a single agent's response
    async function generateAgentResponse(agentId, groupId, topicId, groupConfig, userMessageText) {
        //console.log(`[GroupRenderer] Generating response for agent: ${agentId}`);

        const currentGlobalSettings = globalSettings.get();

        // Get agent config
        let agentConfig = null;
        try {
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                agentConfig = await window.__TAURI__.invoke('get_agent_config', { agentId: agentId });
            } else if (tauriAPI && typeof tauriAPI.getAgentConfig === 'function') {
                agentConfig = await tauriAPI.getAgentConfig(agentId);
            }
        } catch (error) {
            console.error(`[GroupRenderer] Failed to get agent config for ${agentId}:`, error);
            return;
        }

        if (!agentConfig) {
            console.error(`[GroupRenderer] No config found for agent ${agentId}`);
            return;
        }

        // IMPORTANT: Reload group chat history to get the latest messages (including previous agents' responses)
        let history = [];
        try {
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                history = await window.__TAURI__.invoke('get_group_chat_history', { groupId: groupId, topicId: topicId });
            } else if (tauriAPI && typeof tauriAPI.getGroupChatHistory === 'function') {
                history = await tauriAPI.getGroupChatHistory(groupId, topicId);
            }
        } catch (error) {
            console.warn('[GroupRenderer] Failed to load history:', error);
        }

        //console.log(`[GroupRenderer] Loaded ${history.length} messages from history for agent ${agentConfig.name}`);

        // 获取工具栏设置
        const toolbarSettings = window.ChatToolbar?.getToolbarSettings() || {};
        const isIndependentQA = toolbarSettings.independentQA; // independentQA 为 true 表示独立问答（无上下文）
        
        console.log('[GroupRenderer] 群组消息 - 工具栏设置:', { 
            independentQA: isIndependentQA, 
            模式: isIndependentQA ? '无上下文' : '带上下文',
            历史消息总数: history.length
        });

        // 根据设置过滤历史消息
        let filteredHistory;
        if (isIndependentQA) {
            // 无上下文模式：只保留最后一条用户消息
            const lastUserMessage = history.filter(msg => msg.role === 'user').pop();
            filteredHistory = lastUserMessage ? [lastUserMessage] : [];
            console.log('[GroupRenderer] 无上下文模式 - 只使用最后一条用户消息');
        } else {
            // 带上下文模式：使用完整历史
            filteredHistory = history;
            console.log('[GroupRenderer] 带上下文模式 - 使用完整历史:', filteredHistory.length, '条消息');
        }

        // Get all member configs for speaker name resolution
        const memberConfigs = {};
        for (const memberId of groupConfig.members) {
            try {
                let memberConfig = null;
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    memberConfig = await window.__TAURI__.invoke('get_agent_config', { agentId: memberId });
                } else if (tauriAPI && typeof tauriAPI.getAgentConfig === 'function') {
                    memberConfig = await tauriAPI.getAgentConfig(memberId);
                }
                if (memberConfig) {
                    memberConfigs[memberId] = memberConfig;
                }
            } catch (error) {
                console.warn(`[GroupRenderer] Failed to load member config for ${memberId}:`, error);
            }
        }

        // Build messages for VCP with speaker tags
        const messagesForVCP = filteredHistory.map(msg => {
            // Determine speaker name
            const speakerName = msg.name || 
                               (msg.role === 'user' ? (currentGlobalSettings.userName || '用户') : 
                               (memberConfigs[msg.agentId]?.name || 'AI'));
            
            // Get message content
            let textContent = typeof msg.content === 'string' ? msg.content : (msg.content?.text || '');
            
            // Add speaker tag for group chat context
            const contentWithSpeakerTag = `[${speakerName}的发言]: ${textContent}`;
            
            return {
                role: msg.role,
                content: contentWithSpeakerTag
            };
        });

        // Add system prompt with group context
        let systemPrompt = agentConfig.systemPrompt || '';
        systemPrompt = systemPrompt.replace(/\{\{AgentName\}\}/g, agentConfig.name || agentId);
        
        if (groupConfig.groupPrompt) {
            systemPrompt = `${groupConfig.groupPrompt}\n\n${systemPrompt}`;
        }
        
        if (groupConfig.invitePrompt) {
            const inviteText = groupConfig.invitePrompt.replace(/\{\{VCPChatAgentName\}\}/g, agentConfig.name || agentId);
            systemPrompt = `${systemPrompt}\n\n${inviteText}`;
        }

        messagesForVCP.unshift({ role: 'system', content: systemPrompt });

        //console.log(`[GroupRenderer] Built ${messagesForVCP.length} messages for VCP (including system prompt)`);

        // Create thinking message
        const thinkingMessage = {
            role: 'assistant',
            name: agentConfig.name || agentId,
            content: '',
            timestamp: Date.now(),
            id: `msg_${Date.now()}_assistant_${Math.random().toString(36).substring(2, 9)}`,
            isThinking: true,
            avatarUrl: agentConfig.avatarUrl || 'assets/default_avatar.png',
            agentId: agentId,
            isGroupMessage: true
        };

        const thinkingMessageItem = messageRenderer.renderMessage(thinkingMessage);

        // 更新工具栏发言人显示为当前回复的AI
        console.log('[GroupRenderer] 尝试更新工具栏发言人，agentId:', agentId, 'agentName:', agentConfig.name);
        if (window.ChatToolbar && typeof window.ChatToolbar.selectSpeaker === 'function') {
            await window.ChatToolbar.selectSpeaker(agentId);
            console.log('[GroupRenderer] 工具栏发言人更新完成');
        } else {
            console.warn('[GroupRenderer] ChatToolbar.selectSpeaker 不可用');
        }

        // Prepare model config
        const useStreaming = (agentConfig.streamOutput !== undefined) ? (agentConfig.streamOutput === true || agentConfig.streamOutput === 'true') : true;
        const modelConfigForVCP = {
            model: agentConfig.model || 'gemini-pro',
            temperature: agentConfig.temperature !== undefined ? parseFloat(agentConfig.temperature) : 0.7,
            stream: useStreaming,
            ...(agentConfig.maxOutputTokens && { max_tokens: parseInt(agentConfig.maxOutputTokens) }),
            ...(agentConfig.top_p !== undefined && agentConfig.top_p !== null && { top_p: parseFloat(agentConfig.top_p) }),
            ...(agentConfig.top_k !== undefined && agentConfig.top_k !== null && { top_k: parseInt(agentConfig.top_k) })
        };

        // Start streaming if enabled
        if (useStreaming && messageRenderer) {
            await new Promise(resolve => setTimeout(resolve, 100));
            await messageRenderer.startStreamingMessage({ ...thinkingMessage, content: "" }, thinkingMessageItem);
        }

        // Prepare context for streaming events
        const context = {
            agentId: agentId,
            agentName: agentConfig.name || agentId,
            topicId: topicId,
            isGroupMessage: true,
            groupId: groupId
        };

        // Call VCP
        try {
            const vcpResponse = await tauriAPI.invoke('send_message_to_vcp', {
                agentId: groupId, // Use groupId as agentId for saving to correct location
                topicId: topicId,
                vcpUrl: currentGlobalSettings.vcpServerUrl,
                vcpApiKey: currentGlobalSettings.vcpApiKey || '',
                messages: messagesForVCP,
                modelConfig: modelConfigForVCP,
                messageId: thinkingMessage.id,
                isGroupCall: true,
                context: context
            });

            if (useStreaming) {
                if (vcpResponse && vcpResponse.streamingStarted) {
                    //console.log(`[GroupRenderer] Streaming started for agent ${agentId}`);
                    // Wait for streaming to complete
                    await waitForStreamingComplete(thinkingMessage.id, groupId, topicId);
                    // ✅ 流式完成后，需要手动保存到群组历史（因为streamManager不保存群聊消息）
                    // 从内存中获取最终的消息内容
                    const currentHistory = currentChatHistoryRef.get();
                    const finalMessage = currentHistory.find(msg => msg.id === thinkingMessage.id);
                    if (finalMessage && finalMessage.content) {
                        await saveAgentResponseToGroupHistory(thinkingMessage.id, groupId, topicId, finalMessage.content, agentConfig);
                    }
                } else if (typeof vcpResponse === 'string') {
                    // Non-streaming fallback
                    await messageRenderer.finalizeStreamedMessage(thinkingMessage.id, vcpResponse, thinkingMessageItem);
                    await saveAgentResponseToGroupHistory(thinkingMessage.id, groupId, topicId, vcpResponse, agentConfig);
                }
            } else {
                // Non-streaming response
                const assistantContent = vcpResponse.content || vcpResponse.message || vcpResponse.response || '助手未返回有效内容';
                await messageRenderer.finalizeStreamedMessage(thinkingMessage.id, assistantContent, thinkingMessageItem);
                await saveAgentResponseToGroupHistory(thinkingMessage.id, groupId, topicId, assistantContent, agentConfig);
            }
        } catch (error) {
            console.error(`[GroupRenderer] Error calling VCP for agent ${agentId}:`, error);
            messageRenderer.removeMessageById(thinkingMessage.id);
            messageRenderer.renderMessage({
                role: 'system',
                content: `Agent ${agentConfig.name || agentId} 响应失败: ${error.message}`,
                timestamp: Date.now()
            });
        }
    }

    // Helper function to wait for streaming to complete
    async function waitForStreamingComplete(messageId, groupId, topicId) {
        return new Promise((resolve) => {
            const checkInterval = setInterval(async () => {
                // Check if the message is no longer streaming
                const messageItem = document.querySelector(`.message-item[data-message-id="${messageId}"]`);
                if (messageItem && !messageItem.classList.contains('streaming') && !messageItem.classList.contains('thinking')) {
                    clearInterval(checkInterval);
                    // Get the finalized content from the message
                    const contentDiv = messageItem.querySelector('.md-content');
                    if (contentDiv) {
                        const content = contentDiv.textContent || '';
                        const agentName = messageItem.querySelector('.message-name')?.textContent || 'AI';
                        const agentId = messageItem.dataset.agentId || '';
                        await saveAgentResponseToGroupHistory(messageId, groupId, topicId, content, { name: agentName, id: agentId });
                    }
                    resolve();
                }
            }, 100);
            
            // Timeout after 60 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                console.warn(`[GroupRenderer] Streaming timeout for message ${messageId}`);
                resolve();
            }, 60000);
        });
    }

    // Helper function to save agent response to group history
    async function saveAgentResponseToGroupHistory(messageId, groupId, topicId, content, agentConfig) {
        try {
            // Load current history
            let history = [];
            try {
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    history = await window.__TAURI__.invoke('get_group_chat_history', { groupId: groupId, topicId: topicId });
                } else if (tauriAPI && typeof tauriAPI.getGroupChatHistory === 'function') {
                    history = await tauriAPI.getGroupChatHistory(groupId, topicId);
                }
            } catch (e) {
                console.warn('[GroupRenderer] Failed to load history for saving:', e);
            }

            // ✅ 优先从内存中获取消息（包含正确的name字段）
            const currentHistory = currentChatHistoryRef.get();
            let assistantMessage = currentHistory.find(msg => msg.id === messageId);
            
            if (!assistantMessage) {
                // 如果内存中没有，创建新的消息对象
                console.warn('[GroupRenderer] Message not found in memory, creating new message object');
                assistantMessage = {
                    role: 'assistant',
                    name: agentConfig.name || agentConfig.id || 'AI',
                    content: content,
                    timestamp: Date.now(),
                    id: messageId,
                    avatarUrl: agentConfig.avatarUrl || 'assets/default_avatar.png',
                    agentId: agentConfig.id || '',
                    isGroupMessage: true,
                    finishReason: 'completed'
                };
            } else {
                // 使用内存中的消息，但确保内容是最新的
                assistantMessage = {
                    ...assistantMessage,
                    content: content || assistantMessage.content,
                    finishReason: 'completed',
                    isThinking: false
                };
                //console.log('[GroupRenderer] Using message from memory with name:', assistantMessage.name);
            }

            // Add to history
            history.push(assistantMessage);

            // Save history
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                await window.__TAURI__.invoke('save_group_chat_history', { groupId: groupId, topicId: topicId, messages: history });
            } else if (tauriAPI && typeof tauriAPI.saveGroupChatHistory === 'function') {
                await tauriAPI.saveGroupChatHistory(groupId, topicId, history);
            }

            //console.log(`[GroupRenderer] Saved agent response to group history: ${assistantMessage.name} (id: ${messageId})`);
        } catch (error) {
            console.error('[GroupRenderer] Failed to save agent response to history:', error);
        }
    }


    async function loadGroupChatHistory(groupId, topicId) {
        messageRenderer.clearChat();
        const currentSelected = currentSelectedItemRef.get();

        if (!groupId || !topicId) {
            // Silently handle missing topic - show a user-friendly message
            if (!topicId) {
                messageRenderer.renderMessage({ role: 'system', content: '请选择或创建一个话题以开始群聊。', timestamp: Date.now() });
            }
            return;
        }

        messageRenderer.renderMessage({ role: 'system', name: '系统', content: '加载聊天记录中...', timestamp: Date.now(), isThinking: true, id: 'loading_history' });

        try {
            let history = null;
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                try {
                    history = await window.__TAURI__.invoke('get_group_chat_history', { groupId: groupId, topicId: topicId });
                } catch (e) {
                    console.warn('get_group_chat_history invoke failed, falling back to tauriAPI.getGroupChatHistory', e);
                    history = tauriAPI && typeof tauriAPI.getGroupChatHistory === 'function' ? await tauriAPI.getGroupChatHistory(groupId, topicId) : null;
                }
            } else if (tauriAPI && typeof tauriAPI.getGroupChatHistory === 'function') {
                history = await tauriAPI.getGroupChatHistory(groupId, topicId);
            }
            messageRenderer.removeMessageById('loading_history');

            await mainRendererFunctions.displayTopicTimestampBubble(groupId, 'group', topicId);

            if (history.error) {
                messageRenderer.renderMessage({ role: 'system', content: `加载群聊记录失败: ${history.error}`, timestamp: Date.now() });
            } else {
                mainRendererFunctions.setCurrentChatHistory(history); // Update history in renderer.js
                history.forEach(msg => messageRenderer.renderMessage(msg, true)); // Render silently
            }
        } catch (error) {
            messageRenderer.removeMessageById('loading_history');
            messageRenderer.renderMessage({ role: 'system', content: `加载群聊记录时出错: ${error.message}`, timestamp: Date.now() });
        }
        uiHelper.scrollToBottom();
        if (groupId && topicId) {
            localStorage.setItem(`lastActiveTopic_${groupId}_group`, topicId);
        }
}

    function clearInviteAgentButtons() {
        const container = inviteAgentButtonsContainerRef ? inviteAgentButtonsContainerRef.get() : null;
        if (container) {
            container.innerHTML = '';
            container.style.display = 'none';
        }
    }

    async function displayInviteAgentButtons(groupId, topicId, membersConfigs, groupConfig) {
        const container = inviteAgentButtonsContainerRef ? inviteAgentButtonsContainerRef.get() : null;
        if (!container) {
            console.error("[GroupRenderer] Invite agent buttons container not found.");
            return;
        }
        container.innerHTML = ''; // Clear previous buttons

        if (!membersConfigs || membersConfigs.length === 0 || !groupConfig || groupConfig.mode !== 'invite_only') {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'grid'; // Using grid for layout as suggested
        // Example: container.style.gridTemplateColumns = 'repeat(3, 1fr)'; // Set by CSS later

            for (const memberConfig of membersConfigs) {
            if (!memberConfig || memberConfig.error) continue; // Skip invalid members

            const button = document.createElement('button');
            button.className = 'invite-agent-button';
            button.title = `邀请 ${memberConfig.name} 发言`;

            const avatarImg = document.createElement('img');
            avatarImg.alt = memberConfig.name;
            // 统一使用 avatarManager 解析头像 URL
            (async () => {
                try {
                    const avatarPath = memberConfig.avatarUrl || 'AppData/assets/default_avatar.png';
                    const resolved = await window.avatarManager.resolveAvatarUrl(avatarPath);
                    avatarImg.src = resolved || avatarPath;
                } catch (e) {
                    console.warn('[GroupRenderer] Failed to resolve avatar:', e);
                    avatarImg.src = 'AppData/assets/default_avatar.png';
                }
            })();
            // Styles for avatar in button (can be moved to CSS)
            avatarImg.style.width = '24px';
            avatarImg.style.height = '24px';
            avatarImg.style.borderRadius = '50%';
            avatarImg.style.marginRight = '8px';
            avatarImg.style.objectFit = 'cover';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = memberConfig.name;

            button.appendChild(avatarImg);
            button.appendChild(nameSpan);

            button.addEventListener('click', () => {
                handleInviteAgentButtonClick(groupId, topicId, memberConfig.id, memberConfig.name);
            });
            container.appendChild(button);
        }
    }

    async function handleInviteAgentButtonClick(groupId, _topicId, agentId, agentName) { // _topicId is ignored
        const topicId = currentTopicIdRef.get(); // Always use the current topic ID
        //console.log(`[GroupRenderer] Invite button clicked for agent: ${agentName} (ID: ${agentId}) in group ${groupId}, topic ${topicId}`);
        if (!topicId) {
            uiHelper.showToastNotification('错误：无法邀请发言，当前话题ID未知。', 'error');
            return;
        }
        try {
            const currentGlobalSettings = globalSettings.get();
            if (!currentGlobalSettings.vcpServerUrl) {
                if (uiHelper && uiHelper.showToastNotification) uiHelper.showToastNotification('请先在全局设置中配置VCP服务器URL！', 'error'); else console.error('请先在全局设置中配置VCP服务器URL！'); // 调试信息
                if (uiHelper && uiHelper.openModal) uiHelper.openModal('globalSettingsModal');
                return;
            }
            // Renderer informs main process to trigger the invitation.
            // Main process will then call groupchat.js's handleInviteAgentToSpeak.
            // Responses (thinking, data, end, error) will come via 'vcp-group-stream-chunk'.
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                try {
                    await window.__TAURI__.invoke('invite_agent_to_speak', { groupId: groupId, topicId: topicId, agentId: agentId });
                } catch (e) {
                    console.warn('invite_agent_to_speak invoke failed, falling back to tauriAPI.inviteAgentToSpeak', e);
                    if (tauriAPI && typeof tauriAPI.inviteAgentToSpeak === 'function') await tauriAPI.inviteAgentToSpeak(groupId, topicId, agentId);
                }
            } else if (tauriAPI && typeof tauriAPI.inviteAgentToSpeak === 'function') {
                await tauriAPI.inviteAgentToSpeak(groupId, topicId, agentId);
            }
            // Optionally, provide some immediate UI feedback, e.g., a small spinner on the button,
            // or a toast "正在邀请 AgentName 发言..."
            // The actual message rendering will be handled by the vcp-group-stream-chunk listener.
        } catch (error) {
            console.error(`[GroupRenderer] Error inviting agent ${agentName}:`, error);
            if (uiHelper && uiHelper.showToastNotification) {
                uiHelper.showToastNotification(`邀请 ${agentName} 发言失败: ${error.message}`, 'error');
            } else {
                console.error(`邀请 ${agentName} 发言失败: ${error.message}`); // 调试信息
            }
        }
    }

    // Public API for GroupRenderer
    //console.log('[GroupRenderer] Preparing to return public API.');
    return {
        init,
        handleSelectGroup,
        displayGroupSettingsPage,
        loadTopicsForGroup, // Called when topics tab is selected for a group
        handleSendGroupMessage, // Called by renderer's send button if current chat is group
        loadGroupChatHistory,
        handleCreateNewGroup, // If button is managed here
        handleGroupTopicSelection,
        handleRenameGroupTopic,
        handleDeleteGroupTopic,
        handleExportGroupTopic,
        displayInviteAgentButtons, // Export for potential external calls if needed
        clearInviteAgentButtons,   // Export for potential external calls
        // Potentially other methods if renderer.js needs to interact more
    };
})();

// Note: This file will be included in main.html AFTER renderer.js,
// or renderer.js will need to dynamically load it.
// For simplicity, assume it's loaded via script tag, and renderer.js calls GroupRenderer.init().