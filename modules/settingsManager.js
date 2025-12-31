/**
 * settingsManager.js
 * 
 * Manages the settings panel for both Agents and Groups.
 * Handles displaying, populating, saving, and deleting items.
 */
const settingsManager = (() => {
    /**
     * Completes a VCP Server URL to the full completions endpoint.
     * @param {string} url - The URL to complete.
     * @returns {string} The completed URL.
     */
    function completeVcpUrl(url) {
        if (!url) return '';
        let trimmedUrl = url.trim();
        if (trimmedUrl === '') return '';

        // If it doesn't have a protocol, add http://
        if (!/^https?:\/\//i.test(trimmedUrl)) {
            trimmedUrl = 'http://' + trimmedUrl;
        }

        try {
            const urlObject = new URL(trimmedUrl);
            const requiredPath = '/v1/chat/completions';

            // For any other case (e.g., root path '/', or some other path),
            // we set the path to the required one.
            urlObject.pathname = requiredPath;
            return urlObject.toString();

        } catch (e) {
            // If URL parsing fails, it's likely an invalid URL.
            // We return the original input for the user to see and correct.
            console.warn(`Could not parse and complete URL: ${url}`, e);
            return url;
        }
    }

    // --- Private Variables ---
    let tauriAPI = null;
    let uiHelper = null;
    let refs = {}; // To hold references to currentSelectedItem, etc.
    let mainRendererFunctions = {}; // To call back to renderer.js functions if needed

    // DOM Elements
    let agentSettingsContainer, groupSettingsContainer, selectItemPromptForSettings;
    let itemSettingsContainerTitle, selectedItemNameForSettingsSpan, deleteItemBtn;
    let agentSettingsForm, editingAgentIdInput, agentNameInput, agentAvatarInput, agentAvatarPreview;
    let agentModelInput, agentTemperatureInput;
    let agentContextTokenLimitInput, agentMaxOutputTokensInput, agentTopPInput, agentTopKInput;
    let agentAvatarBorderColorInput, agentAvatarBorderColorTextInput;
    let agentNameTextColorInput, agentNameTextColorTextInput;
    let agentCustomCssInput;
    let promptManager = null; // PromptManager instance
    let openModelSelectBtn, modelSelectModal, modelList, modelSearchInput, refreshModelsBtn;
    let topicSummaryModelInput, openTopicSummaryModelSelectBtn; // New elements for topic summary model
    let agentTtsVoicePrimarySelect, agentTtsRegexPrimaryInput, agentTtsVoiceSecondarySelect, agentTtsRegexSecondaryInput, refreshTtsModelsBtn, agentTtsSpeedSlider, ttsSpeedValueSpan;
    let stripRegexListContainer;
    
    // --- New Regex Modal Elements ---
    let regexRuleModal, regexRuleForm, editingRegexRuleId, regexRuleTitle, regexRuleFind, regexRuleReplace;
    let regexRuleMinDepth, regexRuleMaxDepth, cancelRegexRuleBtn, closeRegexRuleModalBtn;
    
    // A private variable to hold the regex rules for the currently edited agent
    let currentAgentRegexes = [];

    /**
     * Displays the appropriate settings view (agent, group, or default prompt)
     * based on the currently selected item.
     */
    function displaySettingsForItem() {
        const currentSelectedItem = refs.currentSelectedItemRef.get();
        
        const agentSettingsExists = agentSettingsContainer && typeof agentSettingsContainer.style !== 'undefined';
        const groupSettingsExists = groupSettingsContainer && typeof groupSettingsContainer.style !== 'undefined';

        if (currentSelectedItem.id) {
            if (selectItemPromptForSettings) selectItemPromptForSettings.style.display = 'none';
            if (selectedItemNameForSettingsSpan) selectedItemNameForSettingsSpan.textContent = currentSelectedItem.name || currentSelectedItem.id;

            if (currentSelectedItem.type === 'agent') {
                if (agentSettingsExists) agentSettingsContainer.style.display = 'block';
                if (groupSettingsExists) groupSettingsContainer.style.display = 'none';
                if (itemSettingsContainerTitle) itemSettingsContainerTitle.textContent = 'Agent 设置: ';
                if (deleteItemBtn) deleteItemBtn.textContent = '删除此 Agent';
                populateAgentSettingsForm(currentSelectedItem.id, (currentSelectedItem.config || currentSelectedItem));
            } else if (currentSelectedItem.type === 'group') {
                if (agentSettingsExists) agentSettingsContainer.style.display = 'none';
                if (groupSettingsExists) groupSettingsContainer.style.display = 'block';
                if (itemSettingsContainerTitle) itemSettingsContainerTitle.textContent = '群组设置: ';
                if (deleteItemBtn) deleteItemBtn.textContent = '删除此群组';
                if (window.GroupRenderer && typeof window.GroupRenderer.displayGroupSettingsPage === 'function') {
                    window.GroupRenderer.displayGroupSettingsPage(currentSelectedItem.id);
                } else {
                    console.error("GroupRenderer or displayGroupSettingsPage not available.");
                    if (groupSettingsExists) groupSettingsContainer.innerHTML = "<p>无法加载群组设置界面。</p>";
                }
            }
        } else {
            if (agentSettingsExists) agentSettingsContainer.style.display = 'none';
            if (groupSettingsExists) groupSettingsContainer.style.display = 'none';
            if (selectItemPromptForSettings) {
                selectItemPromptForSettings.textContent = '请先在左侧选择一个 Agent 或群组以查看或修改其设置。';
                selectItemPromptForSettings.style.display = 'block';
            }
            if (itemSettingsContainerTitle) itemSettingsContainerTitle.textContent = '设置';
            if (selectedItemNameForSettingsSpan) selectedItemNameForSettingsSpan.textContent = '';
        }
    }

    /**
     * Populates the agent settings form with the config of the selected agent.
     * @param {string} agentId - The ID of the agent.
     * @param {object} agentConfig - The configuration object for the agent.
     */
    async function populateAgentSettingsForm(agentId, agentConfig) {
        if (groupSettingsContainer) groupSettingsContainer.style.display = 'none';
        if (agentSettingsContainer) agentSettingsContainer.style.display = 'block';

        if (!agentConfig || agentConfig.error) {
            uiHelper.showToastNotification(`加载Agent配置失败: ${agentConfig?.error || '未知错误'}`, 'error');
            if (agentSettingsContainer) agentSettingsContainer.style.display = 'none';
            if (selectItemPromptForSettings) {
                selectItemPromptForSettings.textContent = `加载 ${agentId} 配置失败。`;
                selectItemPromptForSettings.style.display = 'block';
            }
            return;
        }
        
        if (editingAgentIdInput) editingAgentIdInput.value = agentId;
        if (agentNameInput) agentNameInput.value = agentConfig.name || agentId;
        
        // Initialize PromptManager
        const systemPromptContainer = document.getElementById('systemPromptContainer');
        if (systemPromptContainer && window.PromptManager) {
            if (promptManager) {
                // Save current state before switching
                await promptManager.saveCurrentModeData();
            }
            
            promptManager = new window.PromptManager();
            promptManager.init({
                agentId: agentId,
                config: agentConfig,
                containerElement: systemPromptContainer,
                tauriAPI: tauriAPI
            });
        }
        
        if (agentModelInput) agentModelInput.value = agentConfig.model || '';
        if (agentTemperatureInput) agentTemperatureInput.value = agentConfig.temperature !== undefined ? agentConfig.temperature : 0.7;
        if (agentContextTokenLimitInput) agentContextTokenLimitInput.value = agentConfig.contextTokenLimit !== undefined ? agentConfig.contextTokenLimit : 4000;
        if (agentMaxOutputTokensInput) agentMaxOutputTokensInput.value = agentConfig.maxOutputTokens !== undefined ? agentConfig.maxOutputTokens : 1000;
        if (agentTopPInput) agentTopPInput.value = agentConfig.top_p !== undefined ? agentConfig.top_p : '';
        if (agentTopKInput) agentTopKInput.value = agentConfig.top_k !== undefined ? agentConfig.top_k : '';

        const streamOutput = agentConfig.streamOutput !== undefined ? agentConfig.streamOutput : true;
        const streamOutputTrue = document.getElementById('agentStreamOutputTrue');
        const streamOutputFalse = document.getElementById('agentStreamOutputFalse');
        if (streamOutputTrue) streamOutputTrue.checked = streamOutput === true || String(streamOutput) === 'true';
        if (streamOutputFalse) streamOutputFalse.checked = streamOutput === false || String(streamOutput) === 'false';
        
        // 获取头像包装器元素
        const avatarWrapper = agentAvatarPreview?.closest('.agent-avatar-wrapper');
        
        if (agentConfig.avatarUrl && agentAvatarPreview) {
            await window.avatarManager.applyAvatarToContext('agent', agentId, agentConfig.avatarUrl);
            agentAvatarPreview.style.display = 'block';
            // 有头像时移除 no-avatar 类
            if (avatarWrapper) {
                avatarWrapper.classList.remove('no-avatar');
            }
        } else if (agentAvatarPreview) {
            // 头像为空时显示默认头像，不进行颜色提取
            await window.avatarManager.applyAvatarToContext('agent', agentId, 'AppData/assets/default_avatar.png');
            agentAvatarPreview.style.display = 'block';
            // 无头像时添加 no-avatar 类，确保相机图标始终显示
            if (avatarWrapper) {
                avatarWrapper.classList.add('no-avatar');
            }
        }
        if (agentAvatarInput) agentAvatarInput.value = '';
        mainRendererFunctions.setCroppedFile('agent', null);
        
        // Populate custom style settings
        if (agentAvatarBorderColorInput) agentAvatarBorderColorInput.value = agentConfig.avatarBorderColor || '#3d5a80';
        if (agentAvatarBorderColorTextInput) agentAvatarBorderColorTextInput.value = agentConfig.avatarBorderColor || '#3d5a80';
        if (agentNameTextColorInput) agentNameTextColorInput.value = agentConfig.nameTextColor || '#ffffff';
        if (agentNameTextColorTextInput) agentNameTextColorTextInput.value = agentConfig.nameTextColor || '#ffffff';
        if (agentCustomCssInput) agentCustomCssInput.value = agentConfig.customCss || '';
        
        // Load card CSS
        const agentCardCssInput = document.getElementById('agentCardCss');
        if (agentCardCssInput) {
            agentCardCssInput.value = agentConfig.cardCss || '';
        }
        
        // Load chat CSS
        const agentChatCssInput = document.getElementById('agentChatCss');
        if (agentChatCssInput) {
            agentChatCssInput.value = agentConfig.chatCss || '';
        }
        
        // Apply card CSS to the identity container in settings page
        applyCardCssToIdentityContainer(agentConfig.cardCss || '');
        
        // Load disableCustomColors setting
        const disableCustomColorsCheckbox = document.getElementById('disableCustomColors');
        if (disableCustomColorsCheckbox) {
            disableCustomColorsCheckbox.checked = agentConfig.disableCustomColors || false;
        }
        
        // Load useThemeColorsInChat setting
        const useThemeColorsInChatCheckbox = document.getElementById('useThemeColorsInChat');
        if (useThemeColorsInChatCheckbox) {
            useThemeColorsInChatCheckbox.checked = agentConfig.useThemeColorsInChat || false;
        }
        
        // Restore collapse states
        restoreCollapseStates(agentConfig);
        
        // Populate bilingual TTS settings
        populateTtsModels(agentConfig.ttsVoicePrimary, agentConfig.ttsVoiceSecondary);
        
        if (agentTtsRegexPrimaryInput) agentTtsRegexPrimaryInput.value = agentConfig.ttsRegexPrimary || '';
        if (agentTtsRegexSecondaryInput) agentTtsRegexSecondaryInput.value = agentConfig.ttsRegexSecondary || '';

        if (agentTtsSpeedSlider) agentTtsSpeedSlider.value = agentConfig.ttsSpeed !== undefined ? agentConfig.ttsSpeed : 1.0;
        if (ttsSpeedValueSpan && agentTtsSpeedSlider) ttsSpeedValueSpan.textContent = parseFloat(agentTtsSpeedSlider.value).toFixed(1);
        
        // Load and render regex rules
        currentAgentRegexes = JSON.parse(JSON.stringify(agentConfig.stripRegexes || [])); // Deep copy
        renderRegexList();
    }

    /**
     * Handles the submission of the agent settings form, saving the changes.
     * @param {Event} event - The form submission event.
     */
    async function saveCurrentAgentSettings(event) {
        event.preventDefault();
        const agentId = editingAgentIdInput.value;
        // Get system prompt from PromptManager
        let systemPromptData = {};
        if (promptManager) {
            await promptManager.saveCurrentModeData();
            const currentPrompt = await promptManager.getCurrentSystemPrompt();
            systemPromptData.systemPrompt = currentPrompt; // Keep for compatibility
        }
        
        const newConfig = {
            name: agentNameInput.value.trim(),
            ...systemPromptData,
            model: agentModelInput.value.trim() || 'gemini-pro',
            temperature: parseFloat(agentTemperatureInput.value),
            contextTokenLimit: parseInt(agentContextTokenLimitInput.value),
            maxOutputTokens: parseInt(agentMaxOutputTokensInput.value),
            top_p: parseFloat(agentTopPInput.value) || undefined,
            top_k: parseInt(agentTopKInput.value) || undefined,
            streamOutput: document.getElementById('agentStreamOutputTrue').checked,
            ttsVoicePrimary: agentTtsVoicePrimarySelect.value,
            ttsRegexPrimary: agentTtsRegexPrimaryInput.value.trim(),
            ttsVoiceSecondary: agentTtsVoiceSecondarySelect.value,
            ttsRegexSecondary: agentTtsRegexSecondaryInput.value.trim(),
            ttsSpeed: parseFloat(agentTtsSpeedSlider.value),
            stripRegexes: currentAgentRegexes,
            avatarBorderColor: agentAvatarBorderColorInput.value,
            nameTextColor: agentNameTextColorInput.value,
            customCss: agentCustomCssInput.value.trim(),
            cardCss: document.getElementById('agentCardCss')?.value.trim() || '',
            chatCss: document.getElementById('agentChatCss')?.value.trim() || '',
            disableCustomColors: document.getElementById('disableCustomColors')?.checked || false,
            useThemeColorsInChat: document.getElementById('useThemeColorsInChat')?.checked || false,
            uiCollapseStates: getCurrentCollapseStates()
        };
     
        if (!newConfig.name) {
            uiHelper.showToastNotification("Agent名称不能为空！", 'error');
            return;
        }
     
        const croppedFile = mainRendererFunctions.getCroppedFile('agent');
        if (croppedFile) {
                try {
                const arrayBuffer = await croppedFile.arrayBuffer();
                // Convert to base64 for Tauri invoke if needed
                let avatarResult = null;
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    try {
                        const uint8 = new Uint8Array(arrayBuffer);
                        let binary = '';
                        for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
                        const base64Data = btoa(binary);
                        avatarResult = await window.__TAURI__.invoke('save_avatar', {
                            agentId: agentId,
                            name: croppedFile.name,
                            type: croppedFile.type,
                            data_base64: base64Data
                        });
                    } catch (e) {
                        console.warn('save_avatar invoke failed, falling back to tauriAPI.saveAvatar', e);
                        if (tauriAPI && typeof tauriAPI.saveAvatar === 'function') {
                            avatarResult = await tauriAPI.saveAvatar(agentId, {
                                name: croppedFile.name,
                                type: croppedFile.type,
                                buffer: arrayBuffer
                            });
                        }
                    }
                } else if (tauriAPI && typeof tauriAPI.saveAvatar === 'function') {
                    avatarResult = await tauriAPI.saveAvatar(agentId, {
                        name: croppedFile.name,
                        type: croppedFile.type,
                        buffer: arrayBuffer
                    });
                }
     
                if (avatarResult.error) {
                    uiHelper.showToastNotification(`保存Agent头像失败: ${avatarResult.error}`, 'error');
                } else {
                    // 只在成功保存真实头像文件后才提取颜色
                    if (avatarResult.needsColorExtraction && avatarResult.avatarUrl) {
                         uiHelper.getAverageColorFromAvatar(avatarResult.avatarUrl, (avgColor) => {
                            if (avgColor) {
                                // Prefer Tauri invoke for saving avatar color
                                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                                    window.__TAURI__.invoke('save_avatar_color', { type: 'agent', id: agentId, color: avgColor })
                                        .then((saveColorResult) => {
                                            if (saveColorResult && saveColorResult.success) {
                                                if(refs.currentSelectedItemRef.get().id === agentId && refs.currentSelectedItemRef.get().type === 'agent' && window.messageRenderer) {
                                                    window.messageRenderer.setCurrentItemAvatarColor(avgColor);
                                                }
                                            } else {
                                                console.warn(`Failed to save agent ${agentId} avatar color:`, saveColorResult?.error);
                                            }
                                        }).catch(err => {
                                            console.error(`save_avatar_color invoke failed:`, err);
                                            if (tauriAPI && typeof tauriAPI.saveAvatarColor === 'function') {
                                                tauriAPI.saveAvatarColor({ type: 'agent', id: agentId, color: avgColor })
                                                    .then((saveColorResult) => {
                                                        if (saveColorResult && saveColorResult.success) {
                                                            if(refs.currentSelectedItemRef.get().id === agentId && refs.currentSelectedItemRef.get().type === 'agent' && window.messageRenderer) {
                                                                window.messageRenderer.setCurrentItemAvatarColor(avgColor);
                                                            }
                                                        } else {
                                                            console.warn(`Failed to save agent ${agentId} avatar color:`, saveColorResult?.error);
                                                        }
                                                    }).catch(err2 => console.error(`Error saving agent ${agentId} avatar color:`, err2));
                                            }
                                        });
                                } else if (tauriAPI && typeof tauriAPI.saveAvatarColor === 'function') {
                                    tauriAPI.saveAvatarColor({ type: 'agent', id: agentId, color: avgColor })
                                        .then((saveColorResult) => {
                                            if (saveColorResult && saveColorResult.success) {
                                                if(refs.currentSelectedItemRef.get().id === agentId && refs.currentSelectedItemRef.get().type === 'agent' && window.messageRenderer) {
                                                    window.messageRenderer.setCurrentItemAvatarColor(avgColor);
                                                }
                                            } else {
                                                console.warn(`Failed to save agent ${agentId} avatar color:`, saveColorResult?.error);
                                            }
                                        }).catch(err => console.error(`Error saving agent ${agentId} avatar color:`, err));
                                }
                            }
                        });
                    }
                    // 使用 avatarManager 统一处理 Agent 头像的解析与 UI 更新
                    try {
                        await window.avatarManager.applyAvatarToContext('agent', agentId, avatarResult.avatarUrl);
                    } catch (e) {
                        console.warn('avatarManager.applyAvatarToContext failed for agent:', e);
                    }
                    mainRendererFunctions.setCroppedFile('agent', null);
                    agentAvatarInput.value = '';
                }
            } catch (readError) {
                console.error("读取Agent头像文件失败:", readError);
                uiHelper.showToastNotification(`读取Agent头像文件失败: ${readError.message}`, 'error');
            }
        }
     
        let result = null;
        if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
            try {
                result = await window.__TAURI__.invoke('save_agent_config', { agentId: agentId, config: newConfig });
            } catch (e) {
                console.warn('save_agent_config invoke failed, falling back to tauriAPI.saveAgentConfig', e);
                if (tauriAPI && typeof tauriAPI.saveAgentConfig === 'function') {
                    result = await tauriAPI.saveAgentConfig(agentId, newConfig);
                }
            }
        } else if (tauriAPI && typeof tauriAPI.saveAgentConfig === 'function') {
            result = await tauriAPI.saveAgentConfig(agentId, newConfig);
        }
        const saveButton = agentSettingsForm.querySelector('button[type="submit"]');
     
        if (result.success) {
            if (saveButton) uiHelper.showSaveFeedback(saveButton, true, '已保存!', '保存 Agent 设置');
            // 使用 loadAgents 代替 itemListManager.loadItems
            if (window.loadAgents && typeof window.loadAgents === 'function') {
                await window.loadAgents();
            }
            
            const currentSelectedItem = refs.currentSelectedItemRef.get();
            if (currentSelectedItem.id === agentId && currentSelectedItem.type === 'agent') {
                let updatedAgentConfig = null;
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    try {
                        updatedAgentConfig = await window.__TAURI__.invoke('get_agent_config', { agentId: agentId });
                    } catch (e) {
                        console.warn('get_agent_config invoke failed, falling back to tauriAPI.getAgentConfig', e);
                        if (tauriAPI && typeof tauriAPI.getAgentConfig === 'function') {
                            updatedAgentConfig = await tauriAPI.getAgentConfig(agentId);
                        }
                    }
                } else if (tauriAPI && typeof tauriAPI.getAgentConfig === 'function') {
                    updatedAgentConfig = await tauriAPI.getAgentConfig(agentId);
                }
                currentSelectedItem.name = newConfig.name;
                if (currentSelectedItem.config) {
                    currentSelectedItem.config = updatedAgentConfig;
                } else {
                    Object.assign(currentSelectedItem, updatedAgentConfig);
                }
                
                // Update other UI parts via callbacks or direct calls if modules are passed in
                if (mainRendererFunctions.updateChatHeader) {
                    mainRendererFunctions.updateChatHeader(`与 ${newConfig.name} 聊天中`);
                }
                // 使用 avatarManager 更新当前上下文头像，并设置颜色
                try {
                    await window.avatarManager.applyAvatarToContext('agent', agentId, updatedAgentConfig.avatarUrl);
                    if (window.messageRenderer) {
                        window.messageRenderer.setCurrentItemAvatarColor(updatedAgentConfig.avatarCalculatedColor || null);
                    }
                } catch (e) {
                    console.warn('Failed to apply updated agent avatar via avatarManager:', e);
                }
                selectedItemNameForSettingsSpan.textContent = newConfig.name;
            }
        } else {
            if (saveButton) uiHelper.showSaveFeedback(saveButton, false, '保存失败', '保存 Agent 设置');
            uiHelper.showToastNotification(`保存Agent设置失败: ${result.error}`, 'error');
        }
    }

    /**
     * Handles the deletion of the currently selected item (agent or group).
     */
    async function handleDeleteCurrentItem() {
        const currentSelectedItem = refs.currentSelectedItemRef.get();
        if (!currentSelectedItem.id) {
            uiHelper.showToastNotification("没有选中的项目可删除。", 'info');
            return;
        }

        const itemTypeDisplay = currentSelectedItem.type === 'group' ? '群组' : 'Agent';
        const itemName = currentSelectedItem.name || '当前选中的项目';

        const confirmed = await window.customConfirm(
            `您确定要删除 ${itemTypeDisplay} "${itemName}" 吗？其所有聊天记录和设置都将被删除，此操作不可撤销！`,
            `⚠️ 删除${itemTypeDisplay}`
        );
        if (confirmed) {
            let result;
            if (currentSelectedItem.type === 'agent') {
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    try {
                        result = await window.__TAURI__.invoke('delete_agent', { agentId: currentSelectedItem.id });
                    } catch (e) {
                        console.warn('delete_agent invoke failed, falling back to tauriAPI.deleteAgent', e);
                        if (tauriAPI && typeof tauriAPI.deleteAgent === 'function') {
                            result = await tauriAPI.deleteAgent(currentSelectedItem.id);
                        }
                    }
                } else if (tauriAPI && typeof tauriAPI.deleteAgent === 'function') {
                    result = await tauriAPI.deleteAgent(currentSelectedItem.id);
                }
            } else if (currentSelectedItem.type === 'group') {
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    try {
                        result = await window.__TAURI__.invoke('delete_agent_group', { groupId: currentSelectedItem.id });
                    } catch (e) {
                        console.warn('delete_agent_group invoke failed, falling back to tauriAPI.deleteAgentGroup', e);
                        if (tauriAPI && typeof tauriAPI.deleteAgentGroup === 'function') {
                            result = await tauriAPI.deleteAgentGroup(currentSelectedItem.id);
                        }
                    }
                } else if (tauriAPI && typeof tauriAPI.deleteAgentGroup === 'function') {
                    result = await tauriAPI.deleteAgentGroup(currentSelectedItem.id);
                }
            }

            if (result && result.success) {
                // Reset state in renderer via refs
                refs.currentSelectedItemRef.set({ id: null, type: null, name: null, avatarUrl: null, config: null });
                refs.currentTopicIdRef.set(null);
                refs.currentChatHistoryRef.set([]);
                
                // Call back to renderer to update UI
                if (mainRendererFunctions.onItemDeleted) {
                    mainRendererFunctions.onItemDeleted();
                }
            } else {
                uiHelper.showToastNotification(`删除${itemTypeDisplay}失败: ${result?.error || '未知错误'}`, 'error');
            }
        }
    }

    /**
     * Populates the assistant agent select dropdown with available agents.
     */
    async function populateAssistantAgentSelect() {
        const assistantAgentSelect = document.getElementById('assistantAgent');
        if (!assistantAgentSelect) {
            console.warn('[SettingsManager] populateAssistantAgentSelect: assistantAgentSelect element not found');
            return;
        }

        let agents = null;
        if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
            try {
                agents = await window.__TAURI__.invoke('get_agents');
            } catch (e) {
                console.warn('get_agents invoke failed, falling back to tauriAPI.getAgents', e);
                agents = tauriAPI ? await tauriAPI.getAgents() : null;
            }
        } else if (tauriAPI && typeof tauriAPI.getAgents === 'function') {
            agents = await tauriAPI.getAgents();
        }
        if (agents && !agents.error) {
            assistantAgentSelect.innerHTML = '<option value="">请选择一个Agent</option>'; // Clear and add placeholder
            agents.forEach(agent => {
                const option = document.createElement('option');
                option.value = agent.id;
                option.textContent = agent.name || agent.id;
                assistantAgentSelect.appendChild(option);
            });
        } else {
            console.error('[SettingsManager] Failed to load agents for assistant select:', agents?.error);
            assistantAgentSelect.innerHTML = '<option value="">加载Agent失败</option>';
        }
    }

    /**
     * Populates the primary and secondary TTS voice model select dropdowns.
     * @param {string} currentPrimaryVoice - The currently selected primary voice.
     * @param {string} currentSecondaryVoice - The currently selected secondary voice.
     */
    async function populateTtsModels(currentPrimaryVoice, currentSecondaryVoice) {
        if (!agentTtsVoicePrimarySelect || !agentTtsVoiceSecondarySelect) return;

        try {
            let models = null;
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                try {
                    models = await window.__TAURI__.invoke('sovits_get_models', { force: false });
                } catch (e) {
                    console.warn('sovits_get_models invoke failed, falling back to tauriAPI.sovitsGetModels', e);
                    models = tauriAPI ? await tauriAPI.sovitsGetModels() : null;
                }
            } else if (tauriAPI && typeof tauriAPI.sovitsGetModels === 'function') {
                models = await tauriAPI.sovitsGetModels();
            }
            
            // Clear existing options
            agentTtsVoicePrimarySelect.innerHTML = '<option value="">不使用语音</option>';
            agentTtsVoiceSecondarySelect.innerHTML = '<option value="">不使用</option>';

            if (models && Object.keys(models).length > 0) {
                for (const modelName in models) {
                    // Create options for primary dropdown
                    const primaryOption = document.createElement('option');
                    primaryOption.value = modelName;
                    primaryOption.textContent = modelName;
                    if (modelName === currentPrimaryVoice) {
                        primaryOption.selected = true;
                    }
                    agentTtsVoicePrimarySelect.appendChild(primaryOption);

                    // Create options for secondary dropdown
                    const secondaryOption = document.createElement('option');
                    secondaryOption.value = modelName;
                    secondaryOption.textContent = modelName;
                    if (modelName === currentSecondaryVoice) {
                        secondaryOption.selected = true;
                    }
                    agentTtsVoiceSecondarySelect.appendChild(secondaryOption);
                }
            } else {
                const disabledOption = '<option value="" disabled>未找到模型,请启动Sovits</option>';
                agentTtsVoicePrimarySelect.innerHTML += disabledOption;
                agentTtsVoiceSecondarySelect.innerHTML += disabledOption;
            }
        } catch (error) {
            console.error('Failed to get Sovits TTS models:', error);
            const errorOption = '<option value="" disabled>获取模型失败</option>';
            agentTtsVoicePrimarySelect.innerHTML = errorOption;
            agentTtsVoiceSecondarySelect.innerHTML = errorOption;
            uiHelper.showToastNotification('获取Sovits语音模型失败', 'error');
        }
    }

    /**
     * 设置鼠标快捷键事件监听器
     */
    function setupMouseShortcuts() {
        const settingsContainer = document.getElementById('tabContentSettings');
        if (!settingsContainer) {
            // 静默返回，因为这可能在初始化早期被调用
            return;
        }

        let lastRightClickTime = 0;

        // 双击右键：返回助手页面
        settingsContainer.addEventListener('contextmenu', (e) => {
            const currentTime = Date.now();
            const timeDiff = currentTime - lastRightClickTime;

            if (timeDiff < 300) { // 双击检测（300ms内）
                //console.log('[SettingsManager] 检测到双击右键，返回助手页面');
                e.preventDefault();
                e.stopPropagation();

                // 切换到助手页面
                if (window.uiManager && typeof window.uiManager.switchToTab === 'function') {
                    window.uiManager.switchToTab('agents');
                    // 不再需要重置鼠标事件状态，因为 itemListManager 已删除
                } else {
                    console.warn('[SettingsManager] uiManager不可用，无法切换到助手页面');
                }
            }

            lastRightClickTime = currentTime;
        });

        // 中键点击：进入话题页面
        settingsContainer.addEventListener('auxclick', (e) => {
            if (e.button === 1) { // 中键
                //console.log('[SettingsManager] 检测到中键点击，进入话题页面');
                e.preventDefault();
                e.stopPropagation();

                // 切换到话题页面
                if (window.uiManager && typeof window.uiManager.switchToTab === 'function') {
                    window.uiManager.switchToTab('topics');
                } else {
                    console.warn('[SettingsManager] uiManager不可用，无法切换到话题页面');
                }
            }
        });

        // 防止中键点击的默认行为
        settingsContainer.addEventListener('mousedown', (e) => {
            if (e.button === 1) { // 中键
                e.preventDefault();
            }
        });

        //console.log('[SettingsManager] 鼠标快捷键设置完成');
    }

    // --- Public API ---
    return {
        init: (options) => {
            tauriAPI = options.tauriAPI;
            uiHelper = options.uiHelper;
            refs = options.refs;
            mainRendererFunctions = options.mainRendererFunctions;

            // DOM Elements
            agentSettingsContainer = options.elements.agentSettingsContainer;
            groupSettingsContainer = options.elements.groupSettingsContainer;
            selectItemPromptForSettings = options.elements.selectItemPromptForSettings;
            itemSettingsContainerTitle = options.elements.itemSettingsContainerTitle;
            selectedItemNameForSettingsSpan = options.elements.selectedItemNameForSettingsSpan;
            deleteItemBtn = options.elements.deleteItemBtn;
            agentSettingsForm = options.elements.agentSettingsForm;
            editingAgentIdInput = options.elements.editingAgentIdInput;
            agentNameInput = options.elements.agentNameInput;
            agentAvatarInput = options.elements.agentAvatarInput;
            agentAvatarPreview = options.elements.agentAvatarPreview;
            // agentSystemPromptTextarea removed - now using PromptManager
            agentModelInput = options.elements.agentModelInput;
            agentTemperatureInput = options.elements.agentTemperatureInput;
            agentContextTokenLimitInput = options.elements.agentContextTokenLimitInput;
            agentMaxOutputTokensInput = options.elements.agentMaxOutputTokensInput;
            agentTopPInput = document.getElementById('agentTopP');
            agentTopKInput = document.getElementById('agentTopK');
            
            // Custom style inputs
            agentAvatarBorderColorInput = document.getElementById('agentAvatarBorderColor');
            agentAvatarBorderColorTextInput = document.getElementById('agentAvatarBorderColorText');
            agentNameTextColorInput = document.getElementById('agentNameTextColor');
            agentNameTextColorTextInput = document.getElementById('agentNameTextColorText');
            agentCustomCssInput = document.getElementById('agentCustomCss');
            const disableCustomColorsCheckbox = document.getElementById('disableCustomColors');
            const resetAvatarColorsBtn = document.getElementById('resetAvatarColorsBtn');
            openModelSelectBtn = options.elements.openModelSelectBtn;
            modelSelectModal = options.elements.modelSelectModal;
            modelList = options.elements.modelList;
            modelSearchInput = options.elements.modelSearchInput;
            refreshModelsBtn = options.elements.refreshModelsBtn;
            topicSummaryModelInput = options.elements.topicSummaryModelInput; // Get new element
            openTopicSummaryModelSelectBtn = options.elements.openTopicSummaryModelSelectBtn; // Get new element
            
            // TTS Elements
            agentTtsVoicePrimarySelect = document.getElementById('agentTtsVoicePrimary');
            agentTtsRegexPrimaryInput = document.getElementById('agentTtsRegexPrimary');
            agentTtsVoiceSecondarySelect = document.getElementById('agentTtsVoiceSecondary');
            agentTtsRegexSecondaryInput = document.getElementById('agentTtsRegexSecondary');
            refreshTtsModelsBtn = document.getElementById('refreshTtsModelsBtn');
            agentTtsSpeedSlider = options.elements.agentTtsSpeedSlider;
            ttsSpeedValueSpan = options.elements.ttsSpeedValueSpan;

            // --- New Regex Modal Elements ---
            regexRuleModal = document.getElementById('regexRuleModal');
            regexRuleForm = document.getElementById('regexRuleForm');
            editingRegexRuleId = document.getElementById('editingRegexRuleId');
            regexRuleTitle = document.getElementById('regexRuleTitle');
            regexRuleFind = document.getElementById('regexRuleFind');
            regexRuleReplace = document.getElementById('regexRuleReplace');
            regexRuleMinDepth = document.getElementById('regexRuleMinDepth');
            regexRuleMaxDepth = document.getElementById('regexRuleMaxDepth');
            cancelRegexRuleBtn = document.getElementById('cancelRegexRule');
            closeRegexRuleModalBtn = document.getElementById('closeRegexRuleModal');

            // Event Listeners
            if (agentSettingsForm) {
                agentSettingsForm.addEventListener('submit', saveCurrentAgentSettings);
            }
            if (regexRuleForm) {
                regexRuleForm.addEventListener('submit', handleRegexFormSubmit);
            }
            if (cancelRegexRuleBtn) {
                cancelRegexRuleBtn.addEventListener('click', closeRegexModal);
            }
            if (closeRegexRuleModalBtn) {
                closeRegexRuleModalBtn.addEventListener('click', closeRegexModal);
            }
            if (regexRuleModal) {
                regexRuleModal.addEventListener('click', (e) => {
                    if (e.target === regexRuleModal) {
                        closeRegexModal();
                    }
                });
            }
            if (deleteItemBtn) {
                deleteItemBtn.addEventListener('click', handleDeleteCurrentItem);
            }
            if(agentAvatarInput){
                agentAvatarInput.addEventListener('change', (event) => {
                    const file = event.target.files[0];
                    if (file) {
                        uiHelper.openAvatarCropper(file, async (croppedFileResult) => {
                            mainRendererFunctions.setCroppedFile('agent', croppedFileResult);
                            if (agentAvatarPreview) {
                                const previewUrl = URL.createObjectURL(croppedFileResult);
                        await window.avatarManager.applyAvatarToContext('agent', agentId, previewUrl);
                                agentAvatarPreview.style.display = 'block';
                                
                                // 上传新头像后移除 no-avatar 类
                                const avatarWrapper = agentAvatarPreview.closest('.agent-avatar-wrapper');
                                if (avatarWrapper) {
                                    avatarWrapper.classList.remove('no-avatar');
                                }
                                
                                // 只对用户上传的真实头像进行颜色提取，不对默认头像提取
                                // 裁切完成后立即计算颜色并填充到输入框
                                // 使用与全局设置相同的getDominantAvatarColor函数以保持一致性
                                if (window.getDominantAvatarColor) {
                                    window.getDominantAvatarColor(previewUrl).then((avgColor) => {
                                        if (avgColor && agentAvatarBorderColorInput && agentNameTextColorInput) {
                                            // 将rgb格式转换为hex格式
                                            const rgbMatch = avgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                                            if (rgbMatch) {
                                                const r = parseInt(rgbMatch[1]);
                                                const g = parseInt(rgbMatch[2]);
                                                const b = parseInt(rgbMatch[3]);
                                                const hexColor = '#' + [r, g, b].map(x => {
                                                    const hex = x.toString(16);
                                                    return hex.length === 1 ? '0' + hex : hex;
                                                }).join('');
                                                
                                                // 填充到两个颜色输入框
                                                agentAvatarBorderColorInput.value = hexColor;
                                                agentAvatarBorderColorTextInput.value = hexColor;
                                                agentNameTextColorInput.value = hexColor;
                                                agentNameTextColorTextInput.value = hexColor;
                                                
                                                // 更新头像预览的边框颜色
                                                agentAvatarPreview.style.borderColor = hexColor;
                                                
                                                //console.log('[SettingsManager] Auto-filled colors from avatar:', hexColor);
                                            }
                                        }
                                    }).catch(err => {
                                        console.error('[SettingsManager] Error extracting color:', err);
                                    });
                                } else {
                                    console.warn('[SettingsManager] getDominantAvatarColor not available, using fallback');
                                    // 降级使用原来的方法
                                    uiHelper.getAverageColorFromAvatar(previewUrl, (avgColor) => {
                                        if (avgColor && agentAvatarBorderColorInput && agentNameTextColorInput) {
                                            const rgbMatch = avgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                                            if (rgbMatch) {
                                                const r = parseInt(rgbMatch[1]);
                                                const g = parseInt(rgbMatch[2]);
                                                const b = parseInt(rgbMatch[3]);
                                                const hexColor = '#' + [r, g, b].map(x => {
                                                    const hex = x.toString(16);
                                                    return hex.length === 1 ? '0' + hex : hex;
                                                }).join('');
                                                
                                                agentAvatarBorderColorInput.value = hexColor;
                                                agentAvatarBorderColorTextInput.value = hexColor;
                                                agentNameTextColorInput.value = hexColor;
                                                agentNameTextColorTextInput.value = hexColor;
                                                agentAvatarPreview.style.borderColor = hexColor;
                                                
                                                //console.log('[SettingsManager] Auto-filled colors from avatar (fallback):', hexColor);
                                            }
                                        }
                                    });
                                }
                            }
                        }, 'agent');
                    } else {
                        if(agentAvatarPreview) agentAvatarPreview.style.display = 'none';
                        mainRendererFunctions.setCroppedFile('agent', null);
                    }
                });
            }

            if (openModelSelectBtn) {
                openModelSelectBtn.addEventListener('click', () => handleOpenModelSelect(agentModelInput));
            }
            if (openTopicSummaryModelSelectBtn) {
                openTopicSummaryModelSelectBtn.addEventListener('click', () => handleOpenModelSelect(topicSummaryModelInput));
            }
            if (modelSearchInput) {
                modelSearchInput.addEventListener('input', filterModels);
            }
            if (refreshModelsBtn) {
                refreshModelsBtn.addEventListener('click', handleRefreshModels);
            }
            // Prefer Tauri events for models-updated, fallback to tauriAPI callback
            if (window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
                try {
                    window.__TAURI__.event.listen('models-updated', (evt) => {
                        const models = evt.payload;
                        //console.log('[SettingsManager] Received models-updated event. Repopulating list.');
                        populateModelList(models);
                        uiHelper.showToastNotification('模型列表已刷新', 'success');
                    });
                } catch (e) {
                    console.warn('Tauri models-updated listen failed, falling back to tauriAPI.onModelsUpdated', e);
                    if (tauriAPI && typeof tauriAPI.onModelsUpdated === 'function') {
                        tauriAPI.onModelsUpdated((models) => {
                            //console.log('[SettingsManager] Received models-updated event (fallback). Repopulating list.');
                            populateModelList(models);
                            uiHelper.showToastNotification('模型列表已刷新', 'success');
                        });
                    }
                }
            } else {
                if (tauriAPI && typeof tauriAPI.onModelsUpdated === 'function') {
                    tauriAPI.onModelsUpdated((models) => {
                        //console.log('[SettingsManager] Received models-updated event (fallback). Repopulating list.');
                        populateModelList(models);
                        uiHelper.showToastNotification('模型列表已刷新', 'success');
                    });
                }
            }
            
            if (agentTtsSpeedSlider && ttsSpeedValueSpan) {
                agentTtsSpeedSlider.addEventListener('input', () => {
                    ttsSpeedValueSpan.textContent = parseFloat(agentTtsSpeedSlider.value).toFixed(1);
                });
            }

            if (refreshTtsModelsBtn) {
                refreshTtsModelsBtn.addEventListener('click', async () => {
                    uiHelper.showToastNotification('正在刷新语音模型...', 'info');
                    try {
                        if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                            try {
                                await window.__TAURI__.invoke('sovits_get_models', { force: true });
                            } catch (e) {
                                console.warn('sovits_get_models(force) invoke failed, falling back to tauriAPI.sovitsGetModels', e);
                                if (tauriAPI && typeof tauriAPI.sovitsGetModels === 'function') {
                                    await tauriAPI.sovitsGetModels(true);
                                }
                            }
                        } else if (tauriAPI && typeof tauriAPI.sovitsGetModels === 'function') {
                            await tauriAPI.sovitsGetModels(true);
                        }
                        await populateTtsModels(agentTtsVoicePrimarySelect.value, agentTtsVoiceSecondarySelect.value); // repopulate
                        uiHelper.showToastNotification('语音模型列表已刷新', 'success');
                    } catch (e) {
                        uiHelper.showToastNotification('刷新语音模型失败', 'error');
                    }
                });
            }

            // 创建正则设置UI
            createStripRegexUI();

            // 添加Agent设置滚动条粘性按钮逻辑
            setupAgentSettingsStickyButtons();

            // 设置鼠标快捷键
            setupMouseShortcuts();
            
            // Setup color picker synchronization
            setupColorPickerSync();
            
            // Setup params collapsible
            setupParamsCollapsible();
            
            // Setup TTS collapsible
            setupTtsCollapsible();
            
            // Setup style collapsible
            setupStyleCollapsible();
            
            // Setup reset colors button
            if (resetAvatarColorsBtn) {
                resetAvatarColorsBtn.addEventListener('click', handleResetAvatarColors);
            }
            
            // Setup card CSS input real-time preview
            const agentCardCssInput = document.getElementById('agentCardCss');
            if (agentCardCssInput) {
                agentCardCssInput.addEventListener('input', (e) => {
                    applyCardCssToIdentityContainer(e.target.value);
                });
            }

            //console.log('settingsManager initialized.');

            // --- Global Settings Enhancements ---
            const vcpServerUrlInput = document.getElementById('vcpServerUrl');
            if (vcpServerUrlInput) {
                vcpServerUrlInput.addEventListener('blur', () => {
                    const completedUrl = completeVcpUrl(vcpServerUrlInput.value);
                    vcpServerUrlInput.value = completedUrl;
                });
            }
        },
        displaySettingsForItem: displaySettingsForItem,
        populateAssistantAgentSelect: populateAssistantAgentSelect,
        // Expose for external use if needed, e.g., in the save function
        completeVcpUrl: completeVcpUrl,
        triggerAgentSave: async () => {
            // 触发Agent设置保存（不含头像）
            const agentId = editingAgentIdInput.value;
            if (!agentId) return;
            
            let systemPromptData = {};
            if (promptManager) {
                await promptManager.saveCurrentModeData();
                const currentPrompt = await promptManager.getCurrentSystemPrompt();
                systemPromptData.systemPrompt = currentPrompt;
            }
            
            const newConfig = {
                name: agentNameInput.value.trim(),
                ...systemPromptData,
                model: agentModelInput.value.trim() || 'gemini-pro',
                temperature: parseFloat(agentTemperatureInput.value),
                contextTokenLimit: parseInt(agentContextTokenLimitInput.value),
                maxOutputTokens: parseInt(agentMaxOutputTokensInput.value),
                top_p: parseFloat(agentTopPInput.value) || undefined,
                top_k: parseInt(agentTopKInput.value) || undefined,
                streamOutput: document.getElementById('agentStreamOutputTrue').checked,
                ttsVoicePrimary: agentTtsVoicePrimarySelect.value,
                ttsRegexPrimary: agentTtsRegexPrimaryInput.value.trim(),
                ttsVoiceSecondary: agentTtsVoiceSecondarySelect.value,
                ttsRegexSecondary: agentTtsRegexSecondaryInput.value.trim(),
                ttsSpeed: parseFloat(agentTtsSpeedSlider.value),
                stripRegexes: currentAgentRegexes
            };
            
            // Prefer Tauri invoke for saving agent config, fallback to tauriAPI
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                try {
                    await window.__TAURI__.invoke('save_agent_config', { agentId: agentId, config: newConfig });
                } catch (e) {
                    console.warn('save_agent_config invoke failed, falling back to tauriAPI.saveAgentConfig', e);
                    if (tauriAPI && typeof tauriAPI.saveAgentConfig === 'function') {
                        await tauriAPI.saveAgentConfig(agentId, newConfig);
                    }
                }
            } else if (tauriAPI && typeof tauriAPI.saveAgentConfig === 'function') {
                await tauriAPI.saveAgentConfig(agentId, newConfig);
            }
        },
        
        
    };
    
    /**
     * 执行完整的标签切换刷新（降级方案 - 内部辅助函数）
     * @param {string} agentId - Agent ID
     */
    async function performFullTabSwitch(agentId) {
        //console.log('[SettingsManager] Falling back to full tab switch method');
        
        const currentActiveTab = document.querySelector('.sidebar-tab-button.active');
        const currentTabName = currentActiveTab ? currentActiveTab.dataset.tab : 'agents';
        
        if (window.uiManager && typeof window.uiManager.switchToTab === 'function') {
            window.uiManager.switchToTab('settings');
            await new Promise(resolve => setTimeout(resolve, 100));
            
            try {
                let config = null;
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    try {
                        config = await window.__TAURI__.invoke('get_agent_config', { agentId: agentId });
                    } catch (e) {
                        console.warn('get_agent_config invoke failed, falling back to tauriAPI.getAgentConfig', e);
                        config = tauriAPI ? await tauriAPI.getAgentConfig(agentId) : null;
                    }
                } else if (tauriAPI && typeof tauriAPI.getAgentConfig === 'function') {
                    config = await tauriAPI.getAgentConfig(agentId);
                }
                if (config && !config.error) {
                    await populateAgentSettingsForm(agentId, config);
                    //console.log('[SettingsManager] Agent settings reloaded (full tab switch)');
                }
            } catch (error) {
                console.error('[SettingsManager] Error during full tab switch:', error);
            }
            
            await new Promise(resolve => setTimeout(resolve, 50));
            window.uiManager.switchToTab(currentTabName);
            //console.log('[SettingsManager] Switched back to:', currentTabName);
            
            return { success: true, fullSwitch: true };
        } else {
            console.warn('[SettingsManager] uiManager.switchToTab not available');
            sessionStorage.setItem('pendingAgentReload', agentId);
            return { success: true, deferred: true };
        }
    }

    // --- Public API ---
    return {
        init: (options) => {
            // ... existing init code ...
        },
        displaySettingsForItem: displaySettingsForItem,
        populateAssistantAgentSelect: populateAssistantAgentSelect,
        completeVcpUrl: completeVcpUrl,
        triggerAgentSave: async () => {
            // ... existing triggerAgentSave code ...
        },
        
        /**
         * 重新加载当前 Agent 的设置（用于外部触发刷新）
         * @param {string} agentId - Agent ID
         */
        reloadAgentSettings: async (agentId) => {
            // 检查是否正在编辑该 Agent
            if (editingAgentIdInput && editingAgentIdInput.value === agentId) {
                //console.log('[SettingsManager] Reloading settings for agent:', agentId);
                
                // 确保设置页面是激活状态
                const settingsTab = document.getElementById('tabContentSettings');
                const isSettingsVisible = settingsTab && settingsTab.classList.contains('active');
                
                if (!isSettingsVisible) {
                    //console.log('[SettingsManager] Settings tab not visible, performing silent config reload');
                    
                    try {
                        // 方案1：直接重新加载配置并填充表单，不切换标签
                        // 这是最快速的方案，直接调用 populateAgentSettingsForm
                        let config = null;
                        if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                            try {
                                config = await window.__TAURI__.invoke('get_agent_config', { agentId: agentId });
                            } catch (e) {
                                console.warn('get_agent_config invoke failed, falling back to tauriAPI.getAgentConfig', e);
                                config = tauriAPI ? await tauriAPI.getAgentConfig(agentId) : null;
                            }
                        } else if (tauriAPI && typeof tauriAPI.getAgentConfig === 'function') {
                            config = await tauriAPI.getAgentConfig(agentId);
                        }
                        if (config && !config.error) {
                            // 临时激活设置标签内容（不改变按钮状态）
                            const originalDisplay = settingsTab.style.display;
                            settingsTab.style.display = 'block';
                            settingsTab.classList.add('active');
                            
                            // 等待 DOM 准备好
                            await new Promise(resolve => setTimeout(resolve, 50));
                            
                            // 重新填充表单（这会触发 PromptManager 的初始化）
                            await populateAgentSettingsForm(agentId, config);
                            //console.log('[SettingsManager] Agent settings reloaded silently');
                            
                            // 恢复原始显示状态
                            await new Promise(resolve => setTimeout(resolve, 50));
                            settingsTab.classList.remove('active');
                            if (originalDisplay !== 'block') {
                                settingsTab.style.display = originalDisplay;
                            }
                            
                            return { success: true, silent: true };
                        } else {
                            console.error('[SettingsManager] Failed to load config for silent reload:', config?.error);
                            // 降级到完整的标签切换方案
                            return await performFullTabSwitch(agentId);
                        }
                    } catch (error) {
                        console.error('[SettingsManager] Error during silent reload:', error);
                        // 降级到完整的标签切换方案
                        return await performFullTabSwitch(agentId);
                    }
                }
                
                // 重新加载配置（设置页面可见的情况）
                let config = null;
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    try {
                        config = await window.__TAURI__.invoke('get_agent_config', { agentId: agentId });
                    } catch (e) {
                        console.warn('get_agent_config invoke failed, falling back to tauriAPI.getAgentConfig', e);
                        config = tauriAPI ? await tauriAPI.getAgentConfig(agentId) : null;
                    }
                } else if (tauriAPI && typeof tauriAPI.getAgentConfig === 'function') {
                    config = await tauriAPI.getAgentConfig(agentId);
                }
                if (config && !config.error) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                    await populateAgentSettingsForm(agentId, config);
                    //console.log('[SettingsManager] Agent settings reloaded successfully');
                    sessionStorage.removeItem('pendingAgentReload');
                    return { success: true };
                } else {
                    console.error('[SettingsManager] Failed to reload agent config:', config?.error);
                    return { success: false, error: config?.error || 'Failed to load config' };
                }
            } else {
                //console.log('[SettingsManager] Agent not currently being edited, skipping reload');
                return { success: true, skipped: true };
            }
        }
    };

    /**
     * Opens the model selection modal and fetches models from VCP server.
     */
    async function handleOpenModelSelect(targetInputElement) {
        try {
            // 获取全局设置中的VCP服务器URL
            const globalSettings = refs.globalSettingsRef ? refs.globalSettingsRef.get() : null;
            //console.log('[SettingsManager] handleOpenModelSelect - globalSettings:', globalSettings);
            
            const vcpUrl = globalSettings?.vcpServerUrl || window.globalSettings?.vcpServerUrl;
            //console.log('[SettingsManager] handleOpenModelSelect - vcpServerUrl:', vcpUrl);
            
            if (!vcpUrl) {
                console.error('[SettingsManager] VCP URL not found in globalSettings');
                uiHelper.showToastNotification('请先在全局设置中配置 VCP 服务器 URL', 'error');
                return;
            }

            // 构建 /v1/models 接口URL
            let modelsUrl = vcpUrl.trim();
            if (!/^https?:\/\//i.test(modelsUrl)) {
                modelsUrl = 'http://' + modelsUrl;
            }
            
            try {
                const urlObject = new URL(modelsUrl);
                urlObject.pathname = '/v1/models';
                modelsUrl = urlObject.toString();
                //console.log('[SettingsManager] Fetching models from:', modelsUrl);
            } catch (e) {
                console.error('Invalid VCP URL:', vcpUrl, e);
                uiHelper.showToastNotification('VCP 服务器 URL 格式无效', 'error');
                return;
            }

            // 显示加载状态
            if (modelList) {
                modelList.innerHTML = '<li class="model-list-loading">正在加载模型列表...</li>';
            }
            uiHelper.openModal('modelSelectModal');

            // 调用 VCP 服务器的 /v1/models 接口
            const response = await fetch(modelsUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(globalSettings?.vcpApiKey && { 'Authorization': `Bearer ${globalSettings.vcpApiKey}` })
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            //console.log('[SettingsManager] Models response:', data);
            const models = data.data || data.models || [];

            // 填充模型列表
            populateModelList(models, (modelId) => {
                if (targetInputElement) {
                    targetInputElement.value = modelId;
                }
                uiHelper.closeModal('modelSelectModal');
            });

        } catch (error) {
            console.error('Failed to fetch models from VCP server:', error);
            if (modelList) {
                modelList.innerHTML = '<li class="model-list-error">获取模型列表失败，请检查 VCP 服务器连接</li>';
            }
            uiHelper.showToastNotification('获取模型列表失败: ' + error.message, 'error');
        }
    }

    /**
     * Populates the model list in the modal.
     * @param {Array} models - An array of model objects.
     */
    function populateModelList(models, onModelSelect) {
        if (!modelList) return;
        modelList.innerHTML = ''; // Clear existing list

        if (!models || models.length === 0) {
            modelList.innerHTML = '<li>没有可用的模型。请检查您的 VCP 服务器 URL 或刷新列表。</li>';
            return;
        }

        models.forEach(model => {
            const li = document.createElement('li');
            li.textContent = model.id;
            li.dataset.modelId = model.id;
            li.addEventListener('click', () => {
                if (typeof onModelSelect === 'function') {
                    onModelSelect(model.id);
                }
            });
            modelList.appendChild(li);
        });
    }

    /**
     * Filters the model list based on the search input.
     */
    function filterModels() {
        const filter = modelSearchInput.value.toLowerCase();
        const items = modelList.getElementsByTagName('li');
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const txtValue = item.textContent || item.innerText;
            if (txtValue.toLowerCase().indexOf(filter) > -1) {
                item.style.display = "";
            } else {
                item.style.display = "none";
            }
        }
    }

    /**
     * Handles the refresh models button click.
     */
    function handleRefreshModels() {
        if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
            window.__TAURI__.invoke('refresh_models').then(() => {
                uiHelper.showToastNotification('正在刷新模型列表...', 'info');
            }).catch(err => {
                console.warn('refresh_models invoke failed, falling back to tauriAPI.refreshModels', err);
                if (tauriAPI && typeof tauriAPI.refreshModels === 'function') {
                    tauriAPI.refreshModels();
                    uiHelper.showToastNotification('正在刷新模型列表...', 'info');
                }
            });
        } else if (tauriAPI && typeof tauriAPI.refreshModels === 'function') {
            tauriAPI.refreshModels();
            uiHelper.showToastNotification('正在刷新模型列表...', 'info');
        }
    }

    /**
     * Creates the strip regex UI section
     */
    // --- Regex Settings V2 ---

    function createStripRegexUI() {
        // 查找语音设置的折叠容器
        const ttsCollapsibleContainer = document.querySelector('.agent-params-collapsible-container:has(#ttsToggleHeader)');
        if (!ttsCollapsibleContainer) {
            console.warn('[SettingsManager] TTS collapsible container not found for regex UI insertion');
            return;
        }

        const divider = document.createElement('hr');
        divider.className = 'form-divider';
        
        const container = document.createElement('div');
        container.className = 'form-group strip-regex-container';

        const title = document.createElement('div');
        title.className = 'form-section-title';
        title.textContent = '正则设置';
        container.appendChild(title);

        stripRegexListContainer = document.createElement('div');
        stripRegexListContainer.id = 'stripRegexListContainer';
        stripRegexListContainer.className = 'strip-regex-list-container';
        container.appendChild(stripRegexListContainer);

        // 添加正则按钮
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.textContent = '添加正则';
        addBtn.className = 'btn-add-regex';
        addBtn.addEventListener('click', () => openRegexModal());
        container.appendChild(addBtn);

        // 导入正则按钮（放在添加正则按钮下方）
        const importBtn = document.createElement('button');
        importBtn.type = 'button';
        importBtn.textContent = '导入正则';
        importBtn.className = 'btn-add-regex';
        importBtn.style.marginTop = '8px';
        importBtn.addEventListener('click', () => handleImportRegex());
        container.appendChild(importBtn);
        
        // 在导入正则按钮后添加分隔线
        const bottomDivider = document.createElement('hr');
        bottomDivider.className = 'form-divider';
        bottomDivider.style.marginTop = '15px';
        bottomDivider.style.marginBottom = '15px';
        container.appendChild(bottomDivider);

        // 在语音设置折叠容器之后插入正则设置
        const parent = ttsCollapsibleContainer.parentNode;
        parent.insertBefore(divider, ttsCollapsibleContainer.nextSibling);
        parent.insertBefore(container, divider.nextSibling);
        
        //console.log('[SettingsManager] Regex UI created after TTS collapsible container');
    }

    function renderRegexList() {
        if (!stripRegexListContainer) return;
        stripRegexListContainer.innerHTML = '';
        currentAgentRegexes.forEach(rule => {
            const row = createRegexRow(rule);
            stripRegexListContainer.appendChild(row);
        });
    }

    function createRegexRow(rule) {
        const row = document.createElement('div');
        row.className = 'strip-regex-row';
        row.dataset.ruleId = rule.id;

        const title = document.createElement('span');
        title.className = 'strip-regex-title';
        title.textContent = rule.title || '(无标题)';
        title.title = rule.findPattern || '无查找内容';

        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.gap = '8px';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn-edit-regex';  // 保持原始样式类，保持主题适应性
        editBtn.title = '编辑规则';
        // 调整为与删除按钮完全相同的大小（38x38px）
        editBtn.style.height = '38px';    // 与删除按钮相同高度
        editBtn.style.width = '38px';     // 与删除按钮相同宽度
        editBtn.style.minHeight = '38px';
        editBtn.style.minWidth = '38px';
        editBtn.style.padding = '0';      // 与删除按钮相同的内边距
        editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
        editBtn.addEventListener('click', () => openRegexModal(rule));

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn-delete-regex';
        deleteBtn.title = '删除规则';
        deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        deleteBtn.addEventListener('click', async () => {
            const confirmed = await window.customConfirm(`确定要删除规则 "${rule.title}" 吗？`, '⚠️ 删除规则');
            if (confirmed) {
                currentAgentRegexes = currentAgentRegexes.filter(r => r.id !== rule.id);
                renderRegexList();
            }
        });

        buttonsContainer.appendChild(editBtn);
        buttonsContainer.appendChild(deleteBtn);
        row.appendChild(title);
        row.appendChild(buttonsContainer);
        return row;
    }

    function openRegexModal(ruleData = null) {
        regexRuleForm.reset();
        if (ruleData) {
            // Edit mode
            editingRegexRuleId.value = ruleData.id;
            regexRuleTitle.value = ruleData.title || '';
            regexRuleFind.value = ruleData.findPattern || '';
            regexRuleReplace.value = ruleData.replaceWith || '';
            
            (ruleData.applyToRoles || []).forEach(role => {
                const checkbox = regexRuleForm.querySelector(`input[name="applyToRoles"][value="${role}"]`);
                if (checkbox) checkbox.checked = true;
            });

            // 设置应用范围
            if (ruleData.applyToFrontend !== undefined) {
                document.getElementById('applyToFrontend').checked = ruleData.applyToFrontend;
            } else if (ruleData.applyToScopes) {
                // 兼容旧数据结构
                document.getElementById('applyToFrontend').checked = ruleData.applyToScopes.includes('frontend');
            } else {
                document.getElementById('applyToFrontend').checked = true;
            }
            
            if (ruleData.applyToContext !== undefined) {
                document.getElementById('applyToContext').checked = ruleData.applyToContext;
            } else if (ruleData.applyToScopes) {
                // 兼容旧数据结构
                document.getElementById('applyToContext').checked = ruleData.applyToScopes.includes('context');
            } else {
                document.getElementById('applyToContext').checked = true;
            }

            regexRuleMinDepth.value = ruleData.minDepth !== undefined ? ruleData.minDepth : 0;
            regexRuleMaxDepth.value = ruleData.maxDepth !== undefined ? ruleData.maxDepth : -1;
        } else {
            // New rule mode
            editingRegexRuleId.value = '';
            regexRuleMinDepth.value = 0;
            regexRuleMaxDepth.value = -1;
        }
        regexRuleModal.style.display = 'block';
    }

    function closeRegexModal() {
        regexRuleModal.style.display = 'none';
    }

    function handleRegexFormSubmit(event) {
        event.preventDefault();
        
        const id = editingRegexRuleId.value || `rule_${Date.now()}`;
        const title = regexRuleTitle.value.trim();
        const findPattern = regexRuleFind.value.trim();

        if (!title || !findPattern) {
            uiHelper.showToastNotification('规则标题和查找内容不能为空！', 'error');
            return;
        }

        const newRule = {
            id,
            title,
            findPattern,
            replaceWith: regexRuleReplace.value,
            applyToRoles: Array.from(regexRuleForm.querySelectorAll('input[name="applyToRoles"]:checked')).map(cb => cb.value),
            applyToFrontend: document.getElementById('applyToFrontend').checked,
            applyToContext: document.getElementById('applyToContext').checked,
            minDepth: parseInt(regexRuleMinDepth.value, 10),
            maxDepth: parseInt(regexRuleMaxDepth.value, 10)
        };

        const existingIndex = currentAgentRegexes.findIndex(r => r.id === id);
        if (existingIndex > -1) {
            currentAgentRegexes[existingIndex] = newRule;
        } else {
            currentAgentRegexes.push(newRule);
        }

        renderRegexList();
        closeRegexModal();
    }

    /**
     * 处理导入正则规则（暂时未实现）
     */
    async function handleImportRegex() {
        const agentId = editingAgentIdInput.value;
        if (!agentId) {
            uiHelper.showToastNotification('请先选择一个Agent。', 'warning');
            return;
        }

        try {
            let result = null;
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                try {
                    result = await window.__TAURI__.invoke('import_regex_rules', { agentId: agentId });
                } catch (e) {
                    console.warn('import_regex_rules invoke failed, falling back to tauriAPI.importRegexRules', e);
                    result = tauriAPI ? await tauriAPI.importRegexRules(agentId) : null;
                }
            } else if (tauriAPI && typeof tauriAPI.importRegexRules === 'function') {
                result = await tauriAPI.importRegexRules(agentId);
            }

            if (result.success) {
                currentAgentRegexes = result.rules;
                renderRegexList();
                uiHelper.showToastNotification('正则规则导入成功！', 'success');
            } else if (!result.canceled) {
                // Don't show an error if the user just canceled the dialog
                uiHelper.showToastNotification(`导入失败: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('导入正则规则时发生意外错误:', error);
            uiHelper.showToastNotification(`导入失败: ${error.message}`, 'error');
        }
    }

    /**
     * 设置Agent设置的粘性按钮效果
     */
    function setupAgentSettingsStickyButtons() {
        if (!agentSettingsContainer) return;

        // 监听Agent设置容器的滚动事件
        const settingsTabContent = agentSettingsContainer.closest('.sidebar-tab-content');
        if (!settingsTabContent) return;

        let isScrolledToBottom = false;

        const updateStickyButtonState = () => {
            const scrollTop = settingsTabContent.scrollTop;
            const scrollHeight = settingsTabContent.scrollHeight;
            const clientHeight = settingsTabContent.clientHeight;

            // 检查是否滚动到底部（留出一些容差）
            const newScrolledToBottom = scrollTop + clientHeight >= scrollHeight - 10;

            if (newScrolledToBottom !== isScrolledToBottom) {
                isScrolledToBottom = newScrolledToBottom;

                // 更新按钮容器类名
                const formActions = agentSettingsForm?.querySelector('.form-actions');
                if (formActions) {
                    if (isScrolledToBottom) {
                        // 滚动到底部时，显示删除按钮
                        formActions.classList.add('scrolled-to-bottom');
                    } else {
                        // 未滚动到底部时，隐藏删除按钮
                        formActions.classList.remove('scrolled-to-bottom');
                    }
                }
            }
        };

        // 使用节流函数避免过度调用
        let scrollTimeout;
        settingsTabContent.addEventListener('scroll', () => {
            if (scrollTimeout) {
                clearTimeout(scrollTimeout);
            }
            scrollTimeout = setTimeout(updateStickyButtonState, 10);
        });

        // 初始检查 - 确保初始状态下删除按钮是隐藏的
        isScrolledToBottom = false;
        updateStickyButtonState();

        //console.log('[SettingsManager] Agent settings sticky buttons initialized.');
    }
    
    /**
     * 设置颜色选择器与文本输入框的同步
     */
    function setupColorPickerSync() {
        // 头像边框颜色同步
        if (agentAvatarBorderColorInput && agentAvatarBorderColorTextInput) {
            agentAvatarBorderColorInput.addEventListener('input', (e) => {
                agentAvatarBorderColorTextInput.value = e.target.value;
                updateAvatarPreviewStyle();
            });
            
            agentAvatarBorderColorTextInput.addEventListener('input', (e) => {
                const color = e.target.value.trim();
                if (/^#[0-9A-F]{6}$/i.test(color)) {
                    agentAvatarBorderColorInput.value = color;
                    updateAvatarPreviewStyle();
                }
            });
            
            agentAvatarBorderColorTextInput.addEventListener('blur', (e) => {
                const color = e.target.value.trim();
                if (!/^#[0-9A-F]{6}$/i.test(color)) {
                    e.target.value = agentAvatarBorderColorInput.value;
                    uiHelper.showToastNotification('颜色格式无效，请使用 #RRGGBB 格式', 'warning');
                }
            });
        }
        
        // 名称文字颜色同步
        if (agentNameTextColorInput && agentNameTextColorTextInput) {
            agentNameTextColorInput.addEventListener('input', (e) => {
                agentNameTextColorTextInput.value = e.target.value;
            });
            
            agentNameTextColorTextInput.addEventListener('input', (e) => {
                const color = e.target.value.trim();
                if (/^#[0-9A-F]{6}$/i.test(color)) {
                    agentNameTextColorInput.value = color;
                }
            });
            
            agentNameTextColorTextInput.addEventListener('blur', (e) => {
                const color = e.target.value.trim();
                if (!/^#[0-9A-F]{6}$/i.test(color)) {
                    e.target.value = agentNameTextColorInput.value;
                    uiHelper.showToastNotification('颜色格式无效，请使用 #RRGGBB 格式', 'warning');
                }
            });
        }
        
        //console.log('[SettingsManager] Color picker synchronization setup complete.');
    }
    
    /**
     * 更新头像预览的样式
     */
    function updateAvatarPreviewStyle() {
        if (agentAvatarPreview && agentAvatarBorderColorInput) {
            agentAvatarPreview.style.borderColor = agentAvatarBorderColorInput.value;
        }
    }
    
    /**
     * 设置参数容器的折叠功能
     */
    function setupParamsCollapsible() {
        const paramsContainer = document.querySelector('.agent-params-collapsible-container');
        const paramsHeader = document.getElementById('paramsToggleHeader');
        const paramsToggleBtn = document.getElementById('paramsToggleBtn');
        const paramsSummary = document.getElementById('paramsSummary');
        const paramsContent = document.getElementById('paramsContent');
        
        if (!paramsContainer || !paramsHeader || !paramsToggleBtn || !paramsSummary) {
            console.warn('[SettingsManager] Params collapsible elements not found');
            return;
        }
        
        // 默认展开
        let isCollapsed = false;
        
        // 更新摘要显示
        const updateSummary = () => {
            if (!isCollapsed) {
                paramsSummary.textContent = '';
                return;
            }
            
            const temperature = agentTemperatureInput.value || '0.7';
            const contextLimit = agentContextTokenLimitInput.value || '4000';
            const maxOutput = agentMaxOutputTokensInput.value || '1000';
            const topP = agentTopPInput.value || '未设置';
            const topK = agentTopKInput.value || '未设置';
            const streamOutput = document.getElementById('agentStreamOutputTrue').checked ? '流式' : '非流式';
            
            paramsSummary.textContent = `Temperature: ${temperature} | 上下文: ${contextLimit} | 最大输出: ${maxOutput} | Top P: ${topP} | Top K: ${topK} | 输出: ${streamOutput}`;
        };
        
        // 切换折叠状态
        const toggleCollapse = () => {
            isCollapsed = !isCollapsed;
            paramsContainer.classList.toggle('collapsed', isCollapsed);
            updateSummary();
        };
        
        // 点击头部切换
        paramsHeader.addEventListener('click', toggleCollapse);
        
        // 监听输入变化以更新摘要
        const inputs = [
            agentTemperatureInput,
            agentContextTokenLimitInput,
            agentMaxOutputTokensInput,
            agentTopPInput,
            agentTopKInput,
            document.getElementById('agentStreamOutputTrue'),
            document.getElementById('agentStreamOutputFalse')
        ];
        
        inputs.forEach(input => {
            if (input) {
                input.addEventListener('change', () => {
                    if (isCollapsed) {
                        updateSummary();
                    }
                });
            }
        });
        
        //console.log('[SettingsManager] Params collapsible setup complete.');
    }
    
    /**
     * 设置语音设置容器的折叠功能
     */
    function setupTtsCollapsible() {
        const ttsContainer = document.querySelector('.agent-params-collapsible-container:has(#ttsToggleHeader)');
        const ttsHeader = document.getElementById('ttsToggleHeader');
        const ttsToggleBtn = document.getElementById('ttsToggleBtn');
        const ttsSummary = document.getElementById('ttsSummary');
        const ttsContent = document.getElementById('ttsContent');
        
        if (!ttsContainer || !ttsHeader || !ttsToggleBtn || !ttsSummary) {
            console.warn('[SettingsManager] TTS collapsible elements not found');
            return;
        }
        
        // 默认展开
        let isTtsCollapsed = false;
        
        // 更新摘要显示
        const updateTtsSummary = () => {
            if (!isTtsCollapsed) {
                ttsSummary.textContent = '';
                return;
            }
            
            const primaryVoice = agentTtsVoicePrimarySelect.value || '不使用语音';
            const primaryRegex = agentTtsRegexPrimaryInput.value || '全部';
            const secondaryVoice = agentTtsVoiceSecondarySelect.value || '不使用';
            const secondaryRegex = agentTtsRegexSecondaryInput.value || '无';
            const speed = agentTtsSpeedSlider.value || '1.0';
            
            ttsSummary.textContent = `主语言: ${primaryVoice} (${primaryRegex}) | 副语言: ${secondaryVoice} (${secondaryRegex}) | 语速: ${speed}`;
        };
        
        // 切换折叠状态
        const toggleTtsCollapse = () => {
            isTtsCollapsed = !isTtsCollapsed;
            ttsContainer.classList.toggle('collapsed', isTtsCollapsed);
            updateTtsSummary();
        };
        
        // 点击头部切换
        ttsHeader.addEventListener('click', toggleTtsCollapse);
        
        // 监听输入变化以更新摘要
        const ttsInputs = [
            agentTtsVoicePrimarySelect,
            agentTtsRegexPrimaryInput,
            agentTtsVoiceSecondarySelect,
            agentTtsRegexSecondaryInput,
            agentTtsSpeedSlider
        ];
        
        ttsInputs.forEach(input => {
            if (input) {
                const eventType = input.tagName === 'SELECT' ? 'change' : 'input';
                input.addEventListener(eventType, () => {
                    if (isTtsCollapsed) {
                        updateTtsSummary();
                    }
                });
            }
        });
        
        //console.log('[SettingsManager] TTS collapsible setup complete.');
    }
    
    /**
     * 获取当前所有折叠区域的状态
     */
    function getCurrentCollapseStates() {
        const paramsContainer = document.querySelector('.agent-params-collapsible-container:has(#paramsToggleHeader)');
        const ttsContainer = document.querySelector('.agent-params-collapsible-container:has(#ttsToggleHeader)');
        
        return {
            paramsCollapsed: paramsContainer ? paramsContainer.classList.contains('collapsed') : false,
            ttsCollapsed: ttsContainer ? ttsContainer.classList.contains('collapsed') : false
        };
    }
    
    /**
     * 恢复折叠区域的状态
     */
    function restoreCollapseStates(agentConfig) {
        if (!agentConfig.uiCollapseStates) return;
        
        const states = agentConfig.uiCollapseStates;
        
        // 恢复参数设置折叠状态
        const paramsContainer = document.querySelector('.agent-params-collapsible-container:has(#paramsToggleHeader)');
        if (paramsContainer && states.paramsCollapsed) {
            paramsContainer.classList.add('collapsed');
            // 触发摘要更新
            const paramsSummary = document.getElementById('paramsSummary');
            if (paramsSummary) {
                setTimeout(() => {
                    const temperature = agentTemperatureInput.value || '0.7';
                    const contextLimit = agentContextTokenLimitInput.value || '4000';
                    const maxOutput = agentMaxOutputTokensInput.value || '1000';
                    const topP = agentTopPInput.value || '未设置';
                    const topK = agentTopKInput.value || '未设置';
                    const streamOutput = document.getElementById('agentStreamOutputTrue').checked ? '流式' : '非流式';
                    
                    paramsSummary.textContent = `Temperature: ${temperature} | 上下文: ${contextLimit} | 最大输出: ${maxOutput} | Top P: ${topP} | Top K: ${topK} | 输出: ${streamOutput}`;
                }, 100);
            }
        }
        
        // 恢复语音设置折叠状态
        const ttsContainer = document.querySelector('.agent-params-collapsible-container:has(#ttsToggleHeader)');
        if (ttsContainer && states.ttsCollapsed) {
            ttsContainer.classList.add('collapsed');
            // 触发摘要更新
            const ttsSummary = document.getElementById('ttsSummary');
            if (ttsSummary) {
                setTimeout(() => {
                    const primaryVoice = agentTtsVoicePrimarySelect.value || '不使用语音';
                    const primaryRegex = agentTtsRegexPrimaryInput.value || '全部';
                    const secondaryVoice = agentTtsVoiceSecondarySelect.value || '不使用';
                    const secondaryRegex = agentTtsRegexSecondaryInput.value || '无';
                    const speed = agentTtsSpeedSlider.value || '1.0';
                    
                    ttsSummary.textContent = `主语言: ${primaryVoice} (${primaryRegex}) | 副语言: ${secondaryVoice} (${secondaryRegex}) | 语速: ${speed}`;
                }, 100);
            }
        }
        
        //console.log('[SettingsManager] Collapse states restored:', states);
    }
    
    /**
     * 设置自定义样式容器的折叠功能
     */
    function setupStyleCollapsible() {
        const styleContainer = document.querySelector('.custom-style-collapsible');
        const styleHeader = document.getElementById('customStyleHeader');
        
        if (!styleContainer || !styleHeader) {
            console.warn('[SettingsManager] Style collapsible elements not found');
            return;
        }
        
        // 点击头部切换折叠状态
        styleHeader.addEventListener('click', () => {
            styleContainer.classList.toggle('collapsed');
        });
        
        //console.log('[SettingsManager] Style collapsible setup complete.');
    }
    
    /**
     * 处理重置头像颜色按钮点击
     */
    function handleResetAvatarColors() {
        const agentAvatarPreview = document.getElementById('agentAvatarPreview');
        
        if (!agentAvatarPreview || !agentAvatarPreview.src || agentAvatarPreview.src === '#' || agentAvatarPreview.src.includes('default_avatar.png')) {
            uiHelper.showToastNotification('请先上传头像后再重置颜色', 'warning');
            return;
        }
        
        // 从当前头像中提取颜色，使用与全局设置相同的方法
        if (window.getDominantAvatarColor) {
            window.getDominantAvatarColor(agentAvatarPreview.src).then((avgColor) => {
                if (avgColor && agentAvatarBorderColorInput && agentNameTextColorInput) {
                    // 将rgb格式转换为hex格式
                    const rgbMatch = avgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                    if (rgbMatch) {
                        const r = parseInt(rgbMatch[1]);
                        const g = parseInt(rgbMatch[2]);
                        const b = parseInt(rgbMatch[3]);
                        const hexColor = '#' + [r, g, b].map(x => {
                            const hex = x.toString(16);
                            return hex.length === 1 ? '0' + hex : hex;
                        }).join('');
                        
                        // 填充到两个颜色输入框
                        agentAvatarBorderColorInput.value = hexColor;
                        agentAvatarBorderColorTextInput.value = hexColor;
                        agentNameTextColorInput.value = hexColor;
                        agentNameTextColorTextInput.value = hexColor;
                        
                        // 更新头像预览的边框颜色
                        agentAvatarPreview.style.borderColor = hexColor;
                        
                        uiHelper.showToastNotification('已重置为头像默认颜色', 'success');
                        //console.log('[SettingsManager] Colors reset to avatar default:', hexColor);
                    }
                } else {
                    uiHelper.showToastNotification('无法从头像提取颜色', 'error');
                }
            }).catch(err => {
                console.error('[SettingsManager] Error extracting color:', err);
                uiHelper.showToastNotification('提取颜色时出错', 'error');
            });
        } else {
            console.warn('[SettingsManager] getDominantAvatarColor not available, using fallback');
            // 降级使用原来的方法
            uiHelper.getAverageColorFromAvatar(agentAvatarPreview.src, (avgColor) => {
                if (avgColor && agentAvatarBorderColorInput && agentNameTextColorInput) {
                    const rgbMatch = avgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                    if (rgbMatch) {
                        const r = parseInt(rgbMatch[1]);
                        const g = parseInt(rgbMatch[2]);
                        const b = parseInt(rgbMatch[3]);
                        const hexColor = '#' + [r, g, b].map(x => {
                            const hex = x.toString(16);
                            return hex.length === 1 ? '0' + hex : hex;
                        }).join('');
                        
                        agentAvatarBorderColorInput.value = hexColor;
                        agentAvatarBorderColorTextInput.value = hexColor;
                        agentNameTextColorInput.value = hexColor;
                        agentNameTextColorTextInput.value = hexColor;
                        agentAvatarPreview.style.borderColor = hexColor;
                        
                        uiHelper.showToastNotification('已重置为头像默认颜色', 'success');
                        //console.log('[SettingsManager] Colors reset to avatar default (fallback):', hexColor);
                    }
                } else {
                    uiHelper.showToastNotification('无法从头像提取颜色', 'error');
                }
            });
        }
    }
    /**
     * 应用名片CSS到设置页面的Agent身份容器
     */
    function applyCardCssToIdentityContainer(cardCss) {
        const identityContainer = document.querySelector('#agentSettingsContainer .agent-identity-container');
        if (!identityContainer) return;
        
        if (cardCss && cardCss.trim()) {
            //console.log('[SettingsManager] Applying card CSS to identity container:', cardCss);
            // 解析并应用CSS
            const styleDeclarations = cardCss.split(';').filter(s => s.trim());
            styleDeclarations.forEach(declaration => {
                const [property, value] = declaration.split(':').map(s => s.trim());
                if (property && value) {
                    identityContainer.style.setProperty(property, value);
                }
            });
        } else {
            // 清除之前的自定义样式
            identityContainer.removeAttribute('style');
        }
    }
    
})();

window.settingsManager = settingsManager;