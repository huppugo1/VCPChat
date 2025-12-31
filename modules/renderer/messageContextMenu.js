// modules/renderer/messageContextMenu.js

let mainRefs = {};
let contextMenuDependencies = {};

/**
 * Initializes the context menu module with necessary references and dependencies.
 * @param {object} refs - Core references (tauriAPI, uiHelper, etc.).
 * @param {object} dependencies - Functions from other modules (e.g., from messageRenderer).
 */
function initializeContextMenu(refs, dependencies) {
    mainRefs = refs;
    contextMenuDependencies = dependencies;
    document.addEventListener('click', closeContextMenuOnClickOutside, true);
}

function closeContextMenu() {
    const existingMenu = document.getElementById('chatContextMenu');
    if (existingMenu) {
        existingMenu.remove();
    }
}

// Separate closer for topic context menu to avoid interference
function closeTopicContextMenu() {
    const existingMenu = document.getElementById('topicContextMenu');
    if (existingMenu) existingMenu.remove();
}

function closeContextMenuOnClickOutside(event) {
    // 🔧 修复：忽略 contextmenu 事件，只处理真正的点击
    if (event.type === 'contextmenu') {
        return;
    }
    
    // 如果点击发生在头像上传或文件输入相关的元素上，不要关闭上下文菜单，
    // 否则会在触发文件选择或打开头像裁剪器前把菜单移除，导致在生产环境下无法响应。
    try {
        const ignoreSelector = 'input[type="file"], .avatar-upload-overlay, label.avatar-upload-overlay, label[for^="agentAvatar"], label[for^="groupAvatar"], label[for^="userAvatar"]';
        if (event.target && event.target.closest && event.target.closest(ignoreSelector)) {
            return;
        }
    } catch (e) {
        // 防御性：如果查询选择器抛错，继续使用默认行为关闭菜单
    }

    const menu = document.getElementById('chatContextMenu');
    if (menu && !menu.contains(event.target)) {
        closeContextMenu();
    }
    const topicMenu = document.getElementById('topicContextMenu');
    if (topicMenu && !topicMenu.contains(event.target)) {
        closeTopicContextMenu();
    }
}

function showContextMenu(event, messageItem, message) {
    closeContextMenu();
    closeTopicContextMenu();

    const { tauriAPI, uiHelper } = mainRefs;
    const currentChatHistoryArray = mainRefs.currentChatHistoryRef.get();
    const currentSelectedItemVal = mainRefs.currentSelectedItemRef.get();
    const currentTopicIdVal = mainRefs.currentTopicIdRef.get();

    const menu = document.createElement('div');
    menu.id = 'chatContextMenu';
    menu.classList.add('context-menu');

    const isThinkingOrStreaming = message.isThinking || messageItem.classList.contains('streaming');
    const isError = message.finishReason === 'error';
    
    //console.log('[ContextMenu showContextMenu] message.isThinking:', message.isThinking);
    //console.log('[ContextMenu showContextMenu] messageItem.classList.contains("streaming"):', messageItem.classList.contains('streaming'));
    //console.log('[ContextMenu showContextMenu] isThinkingOrStreaming:', isThinkingOrStreaming);
    //console.log('[ContextMenu showContextMenu] message:', message);

    if (isThinkingOrStreaming) {
        const interruptOption = document.createElement('div');
        interruptOption.classList.add('context-menu-item', 'danger-item');
        interruptOption.innerHTML = `<i class="fas fa-stop-circle"></i> 中止回复`;
        interruptOption.onclick = async () => {
            closeContextMenu();
            const { tauriAPI, uiHelper } = mainRefs;
            const activeMessageId = message.id;

            if (!activeMessageId) return;

            if (message.isGroupMessage) {
                // --- 群聊中止逻辑 ---
                //console.log(`[ContextMenu] Attempting to interrupt GROUP message: ${activeMessageId}`);
                // Prefer Tauri invoke, fallback to tauriAPI
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    try {
                        const result = await window.__TAURI__.invoke('interrupt_group_request', { messageId: activeMessageId });
                        if (result && result.success) {
                            uiHelper.showToastNotification("已发送群聊中止信号。", "success");
                        } else {
                            uiHelper.showToastNotification(`群聊中止失败: ${result?.error || '未知错误'}`, "error");
                            if (contextMenuDependencies.finalizeStreamedMessage) {
                                contextMenuDependencies.finalizeStreamedMessage(activeMessageId, 'cancelled_by_user');
                            }
                        }
                    } catch (e) {
                        console.warn('interrupt_group_request invoke failed, falling back to tauriAPI.interruptGroupRequest', e);
                        if (tauriAPI && typeof tauriAPI.interruptGroupRequest === 'function') {
                            const result = await tauriAPI.interruptGroupRequest(activeMessageId);
                            if (result && result.success) {
                                uiHelper.showToastNotification("已发送群聊中止信号。", "success");
                            } else {
                                uiHelper.showToastNotification(`群聊中止失败: ${result?.error || '未知错误'}`, "error");
                                if (contextMenuDependencies.finalizeStreamedMessage) {
                                    contextMenuDependencies.finalizeStreamedMessage(activeMessageId, 'cancelled_by_user');
                                }
                            }
                        } else {
                            console.error("[ContextMenu] interrupt API not available.");
                            uiHelper.showToastNotification("无法发送群聊中止信号 (API不存在)。", "error");
                        }
                    }
                } else {
                    if (tauriAPI && typeof tauriAPI.interruptGroupRequest === 'function') {
                        const result = await tauriAPI.interruptGroupRequest(activeMessageId);
                        if (result && result.success) {
                            uiHelper.showToastNotification("已发送群聊中止信号。", "success");
                        } else {
                            uiHelper.showToastNotification(`群聊中止失败: ${result?.error || '未知错误'}`, "error");
                            if (contextMenuDependencies.finalizeStreamedMessage) {
                                contextMenuDependencies.finalizeStreamedMessage(activeMessageId, 'cancelled_by_user');
                            }
                        }
                    } else {
                        console.error("[ContextMenu] tauriAPI.interruptGroupRequest is not available.");
                        uiHelper.showToastNotification("无法发送群聊中止信号 (API不存在)。", "error");
                    }
                }
            } else {
                // --- 普通单聊中止逻辑 ---
                //console.log(`[ContextMenu] Attempting to interrupt AGENT message: ${activeMessageId}`);
                if (contextMenuDependencies.interruptHandler && typeof contextMenuDependencies.interruptHandler.interrupt === 'function') {
                    const result = await contextMenuDependencies.interruptHandler.interrupt(activeMessageId);
                    if (result.success) {
                        uiHelper.showToastNotification("已发送中止信号。", "success");
                    } else {
                        console.warn(`[ContextMenu] Interrupt failed: ${result.error}`);
                        uiHelper.showToastNotification(`中止失败: ${result.error}`, "error");
                        
                        // 中止失败时手动finalize消息
                        if (contextMenuDependencies.finalizeStreamedMessage) {
                            contextMenuDependencies.finalizeStreamedMessage(activeMessageId, 'cancelled_by_user');
                        }
                        
                        // --- Flowlock: 中止失败后恢复心流锁自动续写 ---
                        if (window.flowlockManager) {
                            const flowlockState = window.flowlockManager.getState();
                            //console.log('[Flowlock] Interrupt failed, checking if flowlock should recover. State:', flowlockState);
                            
                            // 重置processing状态
                            if (window.flowlockManager.isProcessing) {
                                //console.log('[Flowlock] Resetting isProcessing state after interrupt failure');
                                window.flowlockManager.isProcessing = false;
                            }
                            
                            // 如果心流锁激活，触发下一次续写
                            if (flowlockState.isActive) {
                                //console.log('[Flowlock] Flowlock active after interrupt failure, will trigger next continue writing');
                                
                                setTimeout(() => {
                                    if (window.flowlockManager && window.flowlockManager.getState().isActive) {
                                        //console.log('[Flowlock] Triggering continue writing after interrupt failure recovery...');
                                        
                                        // 触发心跳动画
                                        const chatNameElement = document.getElementById('currentChatAgentName');
                                        if (chatNameElement) {
                                            chatNameElement.classList.add('flowlock-heartbeat');
                                            setTimeout(() => {
                                                chatNameElement.classList.remove('flowlock-heartbeat');
                                            }, 800);
                                        }
                                        
                                        // 获取输入框内容作为提示词
                                        const messageInput = document.getElementById('messageInput');
                                        const customPrompt = messageInput ? messageInput.value.trim() : '';
                                        //console.log('[Flowlock] Using custom prompt from input:', customPrompt || '(empty, will use default)');
                                        
                                        // 触发续写
                                        if (window.handleContinueWriting) {
                                            window.flowlockManager.isProcessing = true;
                                            window.handleContinueWriting(customPrompt).then(() => {
                                                //console.log('[Flowlock] Continue writing completed after interrupt failure recovery');
                                                window.flowlockManager.isProcessing = false;
                                                window.flowlockManager.retryCount = 0;
                                            }).catch((error) => {
                                                console.error('[Flowlock] Continue writing failed after interrupt failure recovery:', error);
                                                window.flowlockManager.isProcessing = false;
                                                window.flowlockManager.retryCount++;
                                                
                                                if (window.flowlockManager.retryCount >= window.flowlockManager.maxRetries) {
                                                    console.error('[Flowlock] Max retries reached, stopping flowlock');
                                                    if (window.uiHelperFunctions && window.uiHelperFunctions.showToastNotification) {
                                                        window.uiHelperFunctions.showToastNotification('心流锁续写失败次数过多，已自动停止', 'error');
                                                    }
                                                    window.flowlockManager.stop();
                                                }
                                            });
                                        }
                                    }
                                }, 5000);
                            }
                        }
                    }
                } else {
                    console.error("[ContextMenu] Interrupt handler not available. Manually cancelling.");
                    uiHelper.showToastNotification("无法发送中止信号，已在本地取消。", "warning");
                    if (contextMenuDependencies.finalizeStreamedMessage) {
                        contextMenuDependencies.finalizeStreamedMessage(activeMessageId, 'cancelled_by_user');
                    }
                }
            }
        };
        menu.appendChild(interruptOption);
    }
    
    // For non-thinking/non-streaming messages (including errors and completed messages)
    if (!isThinkingOrStreaming) {
        const isEditing = messageItem.classList.contains('message-item-editing');
        const textarea = isEditing ? messageItem.querySelector('.message-edit-textarea') : null;

        if (!isEditing) {
            const editOption = document.createElement('div');
            editOption.classList.add('context-menu-item');
            editOption.innerHTML = `<i class="fas fa-edit"></i> 编辑消息`;
            editOption.onclick = () => {
                toggleEditMode(messageItem, message);
                closeContextMenu();
            };
            menu.appendChild(editOption);
        }

        const copyOption = document.createElement('div');
        copyOption.classList.add('context-menu-item');
        copyOption.innerHTML = `<i class="fas fa-copy"></i> 复制文本`;
        copyOption.onclick = () => {
            const { uiHelper } = mainRefs;
            const contentDiv = messageItem.querySelector('.md-content');
            let textToCopy = '';

            if (contentDiv) {
                // 克隆节点以避免修改实时显示的DOM
                const contentClone = contentDiv.cloneNode(true);
                // 移除工具使用气泡，以获得更干净的复制内容
                contentClone.querySelectorAll('.vcp-tool-use-bubble, .vcp-tool-result-bubble').forEach(el => el.remove());
                // 修复：清理多余的空行，确保最多只有一个空行
                textToCopy = contentClone.innerText.replace(/\n{3,}/g, '\n\n').trim();
            } else {
                // 如果找不到 .md-content，则回退到旧方法
                let contentToProcess = message.content;
                if (typeof message.content === 'object' && message.content !== null && typeof message.content.text === 'string') {
                    contentToProcess = message.content.text;
                } else if (typeof message.content !== 'string') {
                    contentToProcess = '';
                }
                textToCopy = contentToProcess.replace(/<img[^>]*>/g, '').trim();
            }
            
            navigator.clipboard.writeText(textToCopy);
            uiHelper.showToastNotification("已复制渲染后的文本。", "success");
            closeContextMenu();
        };
        menu.appendChild(copyOption);

        if (isEditing && textarea) {
            const cutOption = document.createElement('div');
            cutOption.classList.add('context-menu-item');
            cutOption.innerHTML = `<i class="fas fa-cut"></i> 剪切文本`;
            cutOption.onclick = () => {
                textarea.focus(); document.execCommand('cut'); closeContextMenu();
            };
            menu.appendChild(cutOption);

            const pasteOption = document.createElement('div');
            pasteOption.classList.add('context-menu-item');
            pasteOption.innerHTML = `<i class="fas fa-paste"></i> 粘贴文本`;
            pasteOption.onclick = async () => {
                textarea.focus();
                try {
                    let text = '';
                    if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                        try {
                            text = await window.__TAURI__.invoke('read_text_from_clipboard');
                        } catch (e) {
                            console.warn('read_text_from_clipboard invoke failed, falling back to tauriAPI.readTextFromClipboard', e);
                            if (tauriAPI && typeof tauriAPI.readTextFromClipboard === 'function') {
                                text = await tauriAPI.readTextFromClipboard();
                            }
                        }
                    } else if (tauriAPI && typeof tauriAPI.readTextFromClipboard === 'function') {
                        text = await tauriAPI.readTextFromClipboard();
                    }

                    if (text) {
                        const start = textarea.selectionStart; const end = textarea.selectionEnd;
                        textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
                        textarea.selectionStart = textarea.selectionEnd = start + text.length;
                        textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    }
                } catch (err) { console.error('Failed to paste text:', err); }
                closeContextMenu();
            };
            menu.appendChild(pasteOption);
        }

        if (currentSelectedItemVal?.type === 'agent' || currentSelectedItemVal?.type === 'group') {
            const createBranchOption = document.createElement('div');
            createBranchOption.classList.add('context-menu-item');
            createBranchOption.innerHTML = `<i class="fas fa-code-branch"></i> 创建分支`;
            createBranchOption.onclick = () => {
                if (typeof mainRefs.handleCreateBranch === 'function') {
                     mainRefs.handleCreateBranch(message);
                }
                closeContextMenu();
            };
            menu.appendChild(createBranchOption);
        }

        const forwardOption = document.createElement('div');
        forwardOption.classList.add('context-menu-item');
        forwardOption.innerHTML = `<i class="fas fa-share"></i> 转发消息`;
        forwardOption.onclick = () => {
            if (contextMenuDependencies.showForwardModal && typeof contextMenuDependencies.showForwardModal === 'function') {
                contextMenuDependencies.showForwardModal(message);
            }
            closeContextMenu();
        };
        menu.appendChild(forwardOption);

        // Add "Read Aloud" option for assistant messages
        if (message.role === 'assistant') {
            const readAloudOption = document.createElement('div');
            readAloudOption.classList.add('context-menu-item', 'context-menu-item-speak');
            readAloudOption.innerHTML = `<i class="fas fa-volume-up"></i> 朗读气泡`;
            readAloudOption.onclick = async () => {
                closeContextMenu();
                
                // 使用 messageRenderer 的 speakMessage 函数
                if (window.messageRenderer && typeof window.messageRenderer.speakMessageManual === 'function') {
                    const content = typeof message.content === 'string' 
                        ? message.content 
                        : (message.content?.text || '');
                    
                    if (content) {
                        // 获取说话人名字
                        const speakerName = message.name || 
                                          (message.role === 'user' ? '用户' : 'AI');
                        window.messageRenderer.speakMessageManual(content, speakerName);
                    } else {
                        if (uiHelper && uiHelper.showToastNotification) {
                            uiHelper.showToastNotification('此消息没有可朗读的内容', 'info');
                        }
                    }
                } else {
                    console.error('[MessageContextMenu] speakMessageManual 函数不可用');
                }
            };
            menu.appendChild(readAloudOption);
        }

        const readModeOption = document.createElement('div');
        readModeOption.classList.add('context-menu-item', 'info-item');
        readModeOption.innerHTML = `<i class="fas fa-book-reader"></i> 阅读模式`;
        readModeOption.onclick = () => {
            closeContextMenu();
            
            // 直接从message对象获取内容
            let contentString = '';
            if (typeof message.content === 'string') {
                contentString = message.content;
            } else if (message.content && typeof message.content.text === 'string') {
                contentString = message.content.text;
            } else if (message.content && typeof message.content === 'object') {
                contentString = JSON.stringify(message.content, null, 2);
            } else {
                contentString = '[无法读取消息内容]';
            }

            if (!contentString || contentString.trim() === '') {
                console.warn('[ReadMode] 消息内容为空');
                return;
            }

            // 创建阅读模式模态框
            showReadModeModal(contentString, message.id);
        };
        menu.appendChild(readModeOption);

        const deleteOption = document.createElement('div');
        deleteOption.classList.add('context-menu-item', 'danger-item');
        deleteOption.innerHTML = `<i class="fas fa-trash-alt"></i> 删除消息`;
        deleteOption.onclick = async () => {
            let textForConfirm = "";
            if (typeof message.content === 'string') {
                textForConfirm = message.content;
            } else if (message.content && typeof message.content.text === 'string') {
                textForConfirm = message.content.text;
            } else {
                textForConfirm = '[消息内容无法预览]';
            }
            
            const confirmed = await window.customConfirm(
                `确定要删除此消息吗？\n"${textForConfirm.substring(0, 50)}${textForConfirm.length > 50 ? '...' : ''}"`,
                '⚠️ 删除消息'
            );
            if (confirmed) {
                contextMenuDependencies.removeMessageById(message.id, true); // Pass true to save history
            }
            closeContextMenu();
        };
        
        // Regenerate option should be here to maintain order
        if (message.role === 'assistant' && !message.isGroupMessage && currentSelectedItemVal?.type === 'agent') {
            const regenerateOption = document.createElement('div');
            regenerateOption.classList.add('context-menu-item', 'regenerate-text');
            regenerateOption.innerHTML = `<i class="fas fa-sync-alt"></i> 重新回复`;
            regenerateOption.onclick = () => {
                handleRegenerateResponse(message);
                closeContextMenu();
            };
            menu.appendChild(regenerateOption);
        }
        
        // 新增：群聊中的“重新回复”功能
        if (message.role === 'assistant' && message.isGroupMessage) {
            const redoGroupOption = document.createElement('div');
            redoGroupOption.classList.add('context-menu-item', 'regenerate-text');
            redoGroupOption.innerHTML = `<i class="fas fa-sync-alt"></i> 重新回复`;
            redoGroupOption.onclick = () => {
                const { tauriAPI, uiHelper } = mainRefs;
                const currentSelectedItem = mainRefs.currentSelectedItemRef.get();
                const currentTopicId = mainRefs.currentTopicIdRef.get();

                if (currentSelectedItem?.type === 'group' && currentTopicId && message.id && message.agentId) {
                    // 调用新的IPC接口
                    if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                        window.__TAURI__.invoke('redo_group_chat_message', { groupId: currentSelectedItem.id, topicId: currentTopicId, messageId: message.id, agentId: message.agentId }).catch(err => {
                            console.warn('redo_group_chat_message invoke failed, falling back to tauriAPI.redoGroupChatMessage', err);
                            if (tauriAPI && typeof tauriAPI.redoGroupChatMessage === 'function') {
                                tauriAPI.redoGroupChatMessage(currentSelectedItem.id, currentTopicId, message.id, message.agentId);
                            }
                        });
                    } else if (tauriAPI && typeof tauriAPI.redoGroupChatMessage === 'function') {
                        tauriAPI.redoGroupChatMessage(currentSelectedItem.id, currentTopicId, message.id, message.agentId);
                    }
                } else {
                    uiHelper.showToastNotification("无法重新回复：缺少群聊上下文信息。", "error");
                }
                closeContextMenu();
            };
            menu.appendChild(redoGroupOption);
        }

        menu.appendChild(deleteOption);
    }

    menu.style.visibility = 'hidden';
    menu.style.position = 'absolute';
    document.body.appendChild(menu);

    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let top = event.clientY;
    let left = event.clientX;

    if (top + menuHeight > windowHeight) {
        top = event.clientY - menuHeight;
        if (top < 0) top = 5;
    }

    if (left + menuWidth > windowWidth) {
        left = event.clientX - menuWidth;
        if (left < 0) left = 5;
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.visibility = 'visible';
}

function toggleEditMode(messageItem, message) {
    const { tauriAPI, markedInstance, uiHelper } = mainRefs;
    const currentChatHistoryArray = mainRefs.currentChatHistoryRef.get();
    const currentSelectedItemVal = mainRefs.currentSelectedItemRef.get();
    const currentTopicIdVal = mainRefs.currentTopicIdRef.get();

    const contentDiv = messageItem.querySelector('.md-content');
    if (!contentDiv) return;

    const existingTextarea = messageItem.querySelector('.message-edit-textarea');
    const existingControls = messageItem.querySelector('.message-edit-controls');

    if (existingTextarea) { // Revert to display mode
        let textToDisplay = "";
        if (typeof message.content === 'string') {
            textToDisplay = message.content;
        } else if (message.content && typeof message.content.text === 'string') {
            textToDisplay = message.content.text;
        } else {
            textToDisplay = '[内容错误]';
        }
        
        // 🟢 修复：使用 updateMessageContent 确保正则规则被应用
        if (contextMenuDependencies.updateMessageContent) {
            contextMenuDependencies.updateMessageContent(message.id, textToDisplay);
        } else {
            // Fallback for safety, though updateMessageContent should be available now
            let rawHtml;
            try {
                const parser = markedInstance || window.marked;
                const content = contextMenuDependencies.preprocessFullContent(textToDisplay);
                if (parser && typeof parser.parse === 'function') {
                    rawHtml = parser.parse(content);
                } else {
                    rawHtml = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&lt;(img\s+[^&]*)&gt;/g, '<$1>');
                }
            } catch (e) {
                const content = contextMenuDependencies.preprocessFullContent(textToDisplay);
                rawHtml = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&lt;(img\s+[^&]*)&gt;/g, '<$1>');
            }
            contextMenuDependencies.setContentAndProcessImages(contentDiv, rawHtml, message.id);
            contextMenuDependencies.processRenderedContent(contentDiv);
            setTimeout(() => {
                if (contentDiv && contentDiv.isConnected) {
                    contextMenuDependencies.runTextHighlights(contentDiv);
                }
            }, 0);
        }

        messageItem.classList.remove('message-item-editing');
        existingTextarea.remove();
        if (existingControls) existingControls.remove();
        contentDiv.style.display = '';
        const avatarEl = messageItem.querySelector('.chat-avatar');
        const nameTimeEl = messageItem.querySelector('.name-time-block');
        if(avatarEl) avatarEl.style.display = '';
        if(nameTimeEl) nameTimeEl.style.display = '';
    } else { // Switch to edit mode
        const originalContentHeight = contentDiv.offsetHeight;
        contentDiv.style.display = 'none';
        const avatarEl = messageItem.querySelector('.chat-avatar');
        const nameTimeEl = messageItem.querySelector('.name-time-block');
        if(avatarEl) avatarEl.style.display = 'none';
        if(nameTimeEl) nameTimeEl.style.display = 'none';

        messageItem.classList.add('message-item-editing');

        const textarea = document.createElement('textarea');
        textarea.classList.add('message-edit-textarea');
        
        let textForEditing = "";
        if (typeof message.content === 'string') {
            textForEditing = message.content;
        } else if (message.content && typeof message.content.text === 'string') {
            textForEditing = message.content.text;
        } else {
            textForEditing = '[内容加载错误]';
        }
        textarea.value = textForEditing;
        
        // 计算合理的初始高度
        // 根据文本行数估算高度，每行约 24px，最小 120px，最大 400px
        const lineCount = textForEditing.split('\n').length;
        const estimatedHeight = Math.min(Math.max(lineCount * 24 + 20, 120), 400);
        textarea.style.height = `${estimatedHeight}px`;
        textarea.style.maxHeight = '600px'; // 设置最大高度
        textarea.style.width = '100%';
        textarea.style.overflowY = 'auto'; // 允许垂直滚动
        textarea.style.resize = 'vertical'; // 允许垂直调整大小

        const controlsDiv = document.createElement('div');
        controlsDiv.classList.add('message-edit-controls');
        controlsDiv.style.display = 'flex';
        controlsDiv.style.flexDirection = 'column'; // 垂直排列
        controlsDiv.style.gap = '4px';
        controlsDiv.style.marginTop = '4px';
        controlsDiv.style.alignItems = 'flex-end'; // 右对齐

        const saveButton = document.createElement('button');
        saveButton.classList.add('message-edit-save-btn');
        saveButton.innerHTML = `<i class="fas fa-check"></i> 保存`;
        saveButton.style.padding = '3px 8px';
        saveButton.style.borderRadius = '3px';
        saveButton.style.border = 'none';
        saveButton.style.backgroundColor = 'var(--accent-color, #4285f4)';
        saveButton.style.color = 'white';
        saveButton.style.cursor = 'pointer';
        saveButton.style.fontSize = '12px';
        saveButton.style.fontWeight = '400';
        saveButton.style.display = 'inline-flex';
        saveButton.style.alignItems = 'center';
        saveButton.style.gap = '3px';
        saveButton.style.transition = 'all 0.15s ease';
        saveButton.style.lineHeight = '1';
        saveButton.style.whiteSpace = 'nowrap'; // 防止文字换行
        
        // 悬停效果
        saveButton.onmouseenter = () => {
            saveButton.style.opacity = '0.85';
            saveButton.style.transform = 'translateY(-1px)';
        };
        saveButton.onmouseleave = () => {
            saveButton.style.opacity = '1';
            saveButton.style.transform = 'translateY(0)';
        };
        
        saveButton.onclick = async () => {
            // 🔧 关键修复：添加防御性编程和错误处理
            const newContent = textarea.value;
            
            // Get original content for comparison
            let originalTextContent = "";
            if (typeof message.content === 'string') {
                originalTextContent = message.content;
            } else if (message.content && typeof message.content.text === 'string') {
                originalTextContent = message.content.text;
            }

            // If content hasn't changed, just exit edit mode without saving.
            if (newContent === originalTextContent) {
                toggleEditMode(messageItem, message);
                return;
            }

            const messageIndex = currentChatHistoryArray.findIndex(msg => msg.id === message.id);
            
            if (messageIndex === -1) {
                uiHelper.showToastNotification("无法找到要编辑的消息，编辑失败。", "error");
                return;
            }

            // 🔧 保存原始状态以便回滚
            const originalContent = currentChatHistoryArray[messageIndex].content;
            const originalMessageContent = message.content;
            
            try {
                // 🔧 先临时禁用文件监控，避免竞态条件
                // Prefer Tauri invoke for watcher control, fallback to tauriAPI
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    try {
                        await window.__TAURI__.invoke('watcher_stop');
                    } catch (e) {
                        console.warn('watcher_stop invoke failed, falling back to tauriAPI.watcherStop', e);
                        if (tauriAPI && typeof tauriAPI.watcherStop === 'function') {
                            await tauriAPI.watcherStop();
                        }
                    }
                } else if (tauriAPI && typeof tauriAPI.watcherStop === 'function') {
                    await tauriAPI.watcherStop();
                }

                // 🔧 更新内存状态
                currentChatHistoryArray[messageIndex].content = newContent;
                message.content = newContent;
                
                // 🔧 尝试保存到文件
                if (currentSelectedItemVal?.id && currentTopicIdVal) {
                    let saveResult;
                    if (currentSelectedItemVal?.type === 'agent') {
                        saveResult = (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function')
                            ? await window.__TAURI__.invoke('save_chat_history', { agentId: currentSelectedItemVal.id, topicId: currentTopicIdVal, messages: currentChatHistoryArray })
                            : await tauriAPI.saveChatHistory(currentSelectedItemVal.id, currentTopicIdVal, currentChatHistoryArray);
                    } else if (currentSelectedItemVal?.type === 'group' && tauriAPI.saveGroupChatHistory) {
                        saveResult = await tauriAPI.saveGroupChatHistory(currentSelectedItemVal.id, currentTopicIdVal, currentChatHistoryArray);
                    }
                    
                    // 🔧 检查保存结果（只有在有返回值且明确失败时才抛出错误）
                    if (saveResult !== undefined && saveResult.success === false) {
                        throw new Error(saveResult.error || '保存失败');
                    }
                }
                
                // 🔧 保存成功后更新UI
                mainRefs.currentChatHistoryRef.set([...currentChatHistoryArray]);
                
                // 🟢 修复：使用 updateMessageContent 确保正则规则被应用
                if (contextMenuDependencies.updateMessageContent) {
                    contextMenuDependencies.updateMessageContent(message.id, newContent);
                } else {
                    // Fallback for safety
                    const rawHtml = markedInstance.parse(contextMenuDependencies.preprocessFullContent(newContent));
                    contextMenuDependencies.setContentAndProcessImages(contentDiv, rawHtml, message.id);
                    contextMenuDependencies.processRenderedContent(contentDiv);
                    contextMenuDependencies.renderAttachments(message, contentDiv);
                }
                
                // 🔧 重新启动文件监控
                if (currentSelectedItemVal.config?.agentDataPath) {
                    const historyFilePath = `${currentSelectedItemVal.config.agentDataPath}\\topics\\${currentTopicIdVal}\\history.json`;
                    if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                        try {
                            await window.__TAURI__.invoke('watcher_start', { path: historyFilePath, agentId: currentSelectedItemVal.id, topicId: currentTopicIdVal });
                        } catch (e) {
                            console.warn('watcher_start invoke failed, falling back to tauriAPI.watcherStart', e);
                            if (tauriAPI && typeof tauriAPI.watcherStart === 'function') {
                                await tauriAPI.watcherStart(historyFilePath, currentSelectedItemVal.id, currentTopicIdVal);
                            }
                        }
                    } else if (tauriAPI && typeof tauriAPI.watcherStart === 'function') {
                        await tauriAPI.watcherStart(historyFilePath, currentSelectedItemVal.id, currentTopicIdVal);
                    }
                }
                
                if (uiHelper && typeof uiHelper.showToastNotification === 'function') {
                    uiHelper.showToastNotification("消息编辑已保存。", "success");
                }
                
            } catch (error) {
                // 🔧 保存失败时回滚状态
                console.error('[EditMode] Save failed, rolling back:', error);
                currentChatHistoryArray[messageIndex].content = originalContent;
                message.content = originalMessageContent;
                mainRefs.currentChatHistoryRef.set([...currentChatHistoryArray]);
                
                // 🔧 重新启动文件监控（即使保存失败）
                if (tauriAPI.watcherStart && currentSelectedItemVal.config?.agentDataPath) {
                    try {
                        const historyFilePath = `${currentSelectedItemVal.config.agentDataPath}\\topics\\${currentTopicIdVal}\\history.json`;
                        await tauriAPI.watcherStart(historyFilePath, currentSelectedItemVal.id, currentTopicIdVal);
                    } catch (watcherError) {
                        console.error('[EditMode] Failed to restart watcher after save failure:', watcherError);
                    }
                }
                
                if (uiHelper && typeof uiHelper.showToastNotification === 'function') {
                    uiHelper.showToastNotification(`编辑保存失败: ${error.message}`, "error");
                }
                return; // 不退出编辑模式，让用户重试
            }
            
            // 🔧 只有在保存成功后才退出编辑模式
            toggleEditMode(messageItem, message);
        };

        const cancelButton = document.createElement('button');
        cancelButton.classList.add('message-edit-cancel-btn');
        cancelButton.innerHTML = `<i class="fas fa-times"></i> 取消`;
        cancelButton.style.padding = '3px 8px';
        cancelButton.style.borderRadius = '3px';
        cancelButton.style.border = '1px solid var(--border-color, #ddd)';
        cancelButton.style.backgroundColor = 'transparent';
        cancelButton.style.color = 'var(--text-color, #666)';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.fontSize = '12px';
        cancelButton.style.fontWeight = '400';
        cancelButton.style.display = 'inline-flex';
        cancelButton.style.alignItems = 'center';
        cancelButton.style.gap = '3px';
        cancelButton.style.transition = 'all 0.15s ease';
        cancelButton.style.lineHeight = '1';
        cancelButton.style.whiteSpace = 'nowrap'; // 防止文字换行
        
        // 悬停效果
        cancelButton.onmouseenter = () => {
            cancelButton.style.backgroundColor = 'var(--hover-bg, rgba(0, 0, 0, 0.05))';
            cancelButton.style.transform = 'translateY(-1px)';
        };
        cancelButton.onmouseleave = () => {
            cancelButton.style.backgroundColor = 'transparent';
            cancelButton.style.transform = 'translateY(0)';
        };
        
        cancelButton.onclick = () => {
             toggleEditMode(messageItem, message);
        };

        controlsDiv.appendChild(saveButton);
        controlsDiv.appendChild(cancelButton);

        messageItem.appendChild(textarea);
        messageItem.appendChild(controlsDiv);
         
        if (uiHelper.autoResizeTextarea) uiHelper.autoResizeTextarea(textarea);
        
        // 先聚焦和设置光标，然后滚动到消息位置
        textarea.focus();
        textarea.setSelectionRange(0, 0); // 将光标移到开头
        textarea.scrollTop = 0; // 将 textarea 的滚动条回到顶部
        
        // 滚动到消息项位置，确保消息头部在可视区域顶部
        setTimeout(() => {
            // 找到聊天消息容器
            const chatMessagesDiv = document.getElementById('chatMessages');
            if (chatMessagesDiv && messageItem) {
                // 使用 scrollIntoView 将消息项滚动到可视区域
                messageItem.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start' // 将元素顶部对齐到可视区域顶部
                });
                
                // 微调：向上滚动一点，留出边距
                setTimeout(() => {
                    chatMessagesDiv.scrollTop -= 20;
                }, 150);
            }
        }, 50);
        
        textarea.addEventListener('input', () => uiHelper.autoResizeTextarea(textarea));
        textarea.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                cancelButton.click();
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey) {
                event.preventDefault();
                saveButton.click();
            } else if (event.ctrlKey && event.key === 'Enter') {
                saveButton.click();
            }
        });
    }
}

async function handleRegenerateResponse(originalAssistantMessage) {
    const { tauriAPI, uiHelper, messageRenderer } = mainRefs;
    const currentChatHistoryArray = mainRefs.currentChatHistoryRef.get();
    const currentSelectedItemVal = mainRefs.currentSelectedItemRef.get();
    const currentTopicIdVal = mainRefs.currentTopicIdRef.get();

    if (!currentSelectedItemVal?.id || currentSelectedItemVal?.type !== 'agent' || !currentTopicIdVal || !originalAssistantMessage || originalAssistantMessage.role !== 'assistant') {
        uiHelper.showToastNotification("只能为 Agent 的回复进行重新生成。", "warning");
        return;
    }

    const originalMessageIndex = currentChatHistoryArray.findIndex(msg => msg.id === originalAssistantMessage.id);
    if (originalMessageIndex === -1) return;

    // 获取该消息之前的历史记录（保留原消息，不删除）
    const historyBeforeAssistant = currentChatHistoryArray.slice(0, originalMessageIndex);
    
    // 找到对应的用户消息
    try {
        const userMessageForThisAssistant = historyBeforeAssistant.slice().reverse().find(msg => msg.role === 'user');
        
        if (!userMessageForThisAssistant) {
            console.error('[Regenerate] 未找到对应的用户消息，无法重新生成');
            uiHelper.showToastNotification("未找到对应的用户消息，无法重新生成", "error");
            return;
        }
        
        // 获取用户消息的文本内容
        let userMessageText = '';
        if (typeof userMessageForThisAssistant.content === 'string') {
            userMessageText = userMessageForThisAssistant.content;
        } else if (userMessageForThisAssistant.content && typeof userMessageForThisAssistant.content.text === 'string') {
            userMessageText = userMessageForThisAssistant.content.text;
        }
        
        //console.log('[Regenerate] 找到对应的用户消息:', userMessageText.substring(0, 50));
        
        uiHelper.showToastNotification("正在重新生成回复...", "info");
        
        // 🔧 关键修复：直接调用 chatManager 的内部发送逻辑，但不渲染用户消息
        // 因为用户消息已经存在于历史记录中，我们只需要生成新的AI回复
        if (window.chatManager && typeof window.chatManager.regenerateResponse === 'function') {
            //console.log('[Regenerate] 调用 chatManager.regenerateResponse');
            await window.chatManager.regenerateResponse(historyBeforeAssistant, userMessageForThisAssistant);
        } else {
            console.error('[Regenerate] chatManager.regenerateResponse 方法不存在');
            uiHelper.showToastNotification("重新生成功能暂不可用", "error");
        }
    } catch (error) {
        console.error('[Regenerate] 重新生成失败:', error);
        uiHelper.showToastNotification(`重新生成失败: ${error.message}`, "error");
    }
}

function setContextMenuDependencies(newDependencies) {
    contextMenuDependencies = { ...contextMenuDependencies, ...newDependencies };
}

export {
    initializeContextMenu,
    showContextMenu,
    closeContextMenu,
    toggleEditMode,
    handleRegenerateResponse,
    setContextMenuDependencies
};
