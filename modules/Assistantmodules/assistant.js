// Assistantmodules/assistant.js

// Import loadAsset function for handling asset loading
import { loadAsset } from '../utils/assetLoader.js';

document.addEventListener('DOMContentLoaded', () => {
    const chatMessagesDiv = document.getElementById('chatMessages');
    const messageInput = document.getElementById('messageInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const agentAvatarImg = document.getElementById('agentAvatar');
    const agentNameSpan = document.getElementById('currentChatAgentName');
    const closeBtn = document.getElementById('close-btn-assistant');

    let agentConfig = null;
    let agentId = null;
    let globalSettings = {};
    let currentChatHistory = [];
    let activeStreamingMessageId = null;
    const markedInstance = new window.marked.Marked({ gfm: true, breaks: true });

    const scrollToBottom = () => {
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    };

    /**
     * Helper to call backend commands: prefer Tauri invoke, fallback to a provided function.
     * @param {string} cmd - Tauri command name
     * @param {object} args - Arguments for invoke
     * @param {Function} fallback - A function returning a Promise to call if invoke isn't available
     */
    async function callBackend(cmd, args, fallback) {
        try {
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                return await window.__TAURI__.invoke(cmd, args);
            }
            if (typeof fallback === 'function') {
                return await fallback();
            }
            throw new Error('No backend available for ' + cmd);
        } catch (err) {
            console.error(`[callBackend] ${cmd} failed:`, err);
            if (typeof fallback === 'function') {
                try { return await fallback(); } catch (e) { /* swallow secondary error */ }
            }
            throw err;
        }
    }

    // --- Main Logic ---

    closeBtn.addEventListener('click', () => window.close());
// --- Click Handler for Images and Links ---
chatMessagesDiv.addEventListener('click', (event) => {
    const target = event.target;

    // Handle image clicks
    if (target.tagName === 'IMG' && target.closest('.message-content')) {
        event.preventDefault();
        const imageUrl = target.src;
        const imageTitle = target.alt || '图片预览';
        const theme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
        //console.log(`[Assistant] Image clicked. Opening in new window. URL: ${imageUrl}`);
        try {
            await callBackend('open_image_viewer', { src: imageUrl, title: imageTitle, theme }, () => {
                if (window.tauriAPI && typeof window.tauriAPI.openImageInNewWindow === 'function') {
                    return window.tauriAPI.openImageInNewWindow(imageUrl, imageTitle, theme);
                }
                return Promise.reject(new Error('No backend for open_image_viewer'));
            });
        } catch (err) {
            console.error('open_image_viewer/openImageInNewWindow failed', err);
        }
        return;
    }

    // Handle link clicks
    if (target.tagName === 'A' && target.href) {
        event.preventDefault();
        const url = target.href;
        // Ensure it's a web link before opening
        if (url.startsWith('http:') || url.startsWith('https:')) {
            //console.log(`[Assistant] Link clicked. Opening externally. URL: ${url}`);
            try {
                await callBackend('open_external', { url }, () => {
                    if (window.tauriAPI && typeof window.tauriAPI.openExternal === 'function') {
                        return window.tauriAPI.openExternal(url);
                    }
                    window.open(url, '_blank');
                    return Promise.resolve();
                });
            } catch (err) {
                console.warn('open_external/openExternal failed, using window.open as final fallback', err);
                window.open(url, '_blank');
            }
        }
        return;
    }
});

// Create a reusable handler so both Tauri events and legacy tauriAPI can call it.
async function handleAssistantData(data) {
    try {
        //console.log('Received assistant data:', data);
        const { selectedText, action, agentId: receivedAgentId, theme } = data;

        agentId = receivedAgentId;
        // load globalSettings and agentConfig via callBackend (Tauri invoke preferred, fallback to tauriAPI)
        try {
            globalSettings = await callBackend('load_settings', {}, () => {
                return window.tauriAPI && typeof window.tauriAPI.loadSettings === 'function'
                    ? window.tauriAPI.loadSettings()
                    : {};
            });
        } catch (e) {
            console.warn('load_settings failed, using empty settings fallback', e);
            globalSettings = {};
        }

        try {
            agentConfig = await callBackend('get_agent_config', { agent_id: agentId }, () => {
                return window.tauriAPI && typeof window.tauriAPI.getAgentConfig === 'function'
                    ? window.tauriAPI.getAgentConfig(agentId)
                    : null;
            });
        } catch (e) {
            console.warn('get_agent_config failed, fallback to null', e);
            agentConfig = null;
        }

        if (!agentConfig || agentConfig.error) {
            agentNameSpan.textContent = "错误";
            chatMessagesDiv.innerHTML = `<div class="message-item system"><p style="color: var(--danger-color);">加载助手配置失败: ${agentConfig?.error || '未知错误'}</p></div>`;
            return;
        }

        document.body.classList.toggle('light-theme', theme === 'light');
        document.body.classList.toggle('dark-theme', theme === 'dark');

        // Load agent avatar or default avatar via avatarManager.resolveAvatarUrl
        try {
            const avatarToResolve = agentConfig.avatarUrl || 'assets/default_avatar.png';
            const resolvedAvatar = await window.avatarManager.resolveAvatarUrl(avatarToResolve);
            agentAvatarImg.src = resolvedAvatar || avatarToResolve;
        } catch (err) {
            console.warn('[Assistant] avatarManager.resolveAvatarUrl failed, falling back to raw URL:', err);
            agentAvatarImg.src = agentConfig.avatarUrl || 'assets/default_avatar.png';
        }

        agentNameSpan.textContent = agentConfig.name;

        // --- Initialize Shared Renderer ---
        if (window.messageRenderer) {
            const chatHistoryRef = {
                get: () => currentChatHistory,
                set: (newHistory) => { currentChatHistory = newHistory; }
            };
            const selectedItemRef = {
                get: () => ({
                    id: agentId,
                    type: 'agent',
                    name: agentConfig.name,
                    avatarUrl: agentConfig.avatarUrl,
                    config: agentConfig
                }),
                set: () => {}
            };
            const globalSettingsRef = {
                get: () => globalSettings,
                set: (newSettings) => { globalSettings = newSettings; }
            };
            const topicIdRef = {
                get: () => 'assistant_chat',
                set: () => {}
            };
            const interruptHandler = {
                interrupt: async (messageId) => {
                    //console.log(`[Assistant] Interrupting via handler for message: ${messageId}`);
                    if (activeStreamingMessageId === messageId) {
                        try {
                            await callBackend('cancel_vcp_request', { message_id: messageId }, () => {
                                if (window.tauriAPI && typeof window.tauriAPI.cancelVCPRequest === 'function') {
                                    return window.tauriAPI.cancelVCPRequest(messageId);
                                }
                                return Promise.reject(new Error('No backend cancelVCPRequest available'));
                            });
                        } catch (e) {
                            console.warn('cancel_vcp_request/cancelVCPRequest both failed', e);
                        }
                        return { success: true };
                    }
                    return { success: false, error: "Message not actively streaming." };
                }
            };

            window.messageRenderer.initializeMessageRenderer({
                currentChatHistoryRef: chatHistoryRef,
                currentSelectedItemRef: selectedItemRef,
                currentTopicIdRef: topicIdRef,
                globalSettingsRef: globalSettingsRef,
                chatMessagesDiv: chatMessagesDiv,
                tauriAPI: window.tauriAPI,
                markedInstance: markedInstance,
                uiHelper: window.uiHelperFunctions,
                summarizeTopicFromMessages: async () => "",
                handleCreateBranch: () => {},
                interruptHandler: interruptHandler
            });
            //console.log('[Assistant] Shared messageRenderer initialized.');
        } else {
            console.error('[Assistant] window.messageRenderer is not available. Cannot initialize shared renderer.');
            agentNameSpan.textContent = "错误";
            chatMessagesDiv.innerHTML = `<div class="message-item system"><p style="color: var(--danger-color);">加载渲染模块失败，请重启应用。</p></div>`;
            return;
        }

        const prompts = {
            translate: '请将上方文本翻译为简体中文；若原文为中文，则翻译为英文。',
            summarize: '请提取上方文本的核心要点，若含有数据内容可以MD列表等形式呈现。',
            explain: '请通俗易懂地解释上方文本中的关键概念或术语。',
            search: '请从上方文本中获取相关核心关键词进行Tavily网络搜索，并返回最相关的结果摘要。',
            image:'请根据引用文本内容，调用已有生图工具生成一张配图。',
            table: '根据引用文本内容，构建摘要来生成一个MD表格'
        };
        const actionPrompt = prompts[action] || '';
        const initialPrompt = `[引用文本：${selectedText}]\n\n${actionPrompt}`;

        // Clear previous state and send the new prompt
        chatMessagesDiv.innerHTML = '';
        currentChatHistory = [];
        sendMessage(initialPrompt);
    } catch (err) {
        console.error('[Assistant][handleAssistantData] error:', err);
    }
}

// Wire Tauri event listener (preferred) and fallback to tauriAPI
if (window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
    try {
        window.__TAURI__.event.listen('assistant-data', (evt) => {
            handleAssistantData(evt.payload);
        });
    } catch (e) {
        console.warn('Tauri assistant-data listen failed, falling back to tauriAPI.onAssistantData', e);
        if (window.tauriAPI && typeof window.tauriAPI.onAssistantData === 'function') {
            window.tauriAPI.onAssistantData(handleAssistantData);
        }
    }
} else {
    if (window.tauriAPI && typeof window.tauriAPI.onAssistantData === 'function') {
        window.tauriAPI.onAssistantData(handleAssistantData);
    }
}

    // Theme updates: prefer Tauri events, fallback to tauriAPI
    if (window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
        try {
            window.__TAURI__.event.listen('theme-updated', (evt) => {
                const theme = evt.payload;
                //console.log(`[Assistant Window] Theme updated to: ${theme}`);
                document.body.classList.toggle('light-theme', theme === 'light');
                document.body.classList.toggle('dark-theme', theme !== 'light');
            });
        } catch (e) {
            console.warn('Tauri theme-updated listen failed, falling back to tauriAPI.onThemeUpdated', e);
            if (window.tauriAPI && typeof window.tauriAPI.onThemeUpdated === 'function') {
                window.tauriAPI.onThemeUpdated((theme) => {
                    document.body.classList.toggle('light-theme', theme === 'light');
                    document.body.classList.toggle('dark-theme', theme !== 'light');
                });
            }
        }
    } else if (window.tauriAPI && typeof window.tauriAPI.onThemeUpdated === 'function') {
        window.tauriAPI.onThemeUpdated((theme) => {
            document.body.classList.toggle('light-theme', theme === 'light');
            document.body.classList.toggle('dark-theme', theme !== 'light');
        });
    }

    const sendMessage = async (messageContent) => {
        if (!messageContent.trim() || !agentConfig || !window.messageRenderer) return;

        const userMessage = { role: 'user', content: messageContent, timestamp: Date.now(), id: `user_msg_${Date.now()}` };
        await window.messageRenderer.renderMessage(userMessage, false);
        currentChatHistory.push(userMessage); // 核心修复：将用户消息手动添加到历史记录中

        messageInput.value = '';
        messageInput.disabled = true;
        sendMessageBtn.disabled = true;

        const thinkingMessageId = `assistant_msg_${Date.now()}`;
        activeStreamingMessageId = thinkingMessageId; // Set active stream ID

        const assistantMessagePlaceholder = {
            id: thinkingMessageId,
            role: 'assistant',
            content: '思考中',
            timestamp: Date.now(),
            isThinking: true,
            name: agentConfig.name,
            avatarUrl: agentConfig.avatarUrl
        };
        await window.messageRenderer.renderMessage(assistantMessagePlaceholder, false);

        // Context is required for the new sendToVCP API
        const context = {
            agentId: agentId,
            topicId: 'assistant_chat'
        };

        try {
            let latestAgentConfig;
            try {
                latestAgentConfig = await callBackend('get_agent_config', { agent_id: agentId }, () => {
                    return window.tauriAPI && typeof window.tauriAPI.getAgentConfig === 'function'
                        ? window.tauriAPI.getAgentConfig(agentId)
                        : null;
                });
            } catch (e) {
                console.warn('get_agent_config failed, fallback to null', e);
                latestAgentConfig = null;
            }
            if (!latestAgentConfig || latestAgentConfig.error) throw new Error(`无法获取最新的助手配置: ${latestAgentConfig?.error || '未知错误'}`);
            agentConfig = latestAgentConfig;

            const systemPrompt = (agentConfig.systemPrompt || '').replace(/\{\{AgentName\}\}/g, agentConfig.name);
            const messagesForVCP = [];
            if (systemPrompt) {
                messagesForVCP.push({ role: 'system', content: [{ type: 'text', text: systemPrompt }] });
            }

            const historyForVCP = currentChatHistory.filter(msg => !msg.isThinking).map(msg => {
                // The new VCP API expects content to be an array of parts (e.g., text, image)
                const contentPayload = (typeof msg.content === 'string')
                    ? [{ type: 'text', text: msg.content }]
                    : msg.content; // Assume it's already in the correct format if not a string

                return {
                    role: msg.role,
                    content: contentPayload
                };
            });
            messagesForVCP.push(...historyForVCP);

            const modelConfig = {
                model: agentConfig.model,
                temperature: agentConfig.temperature,
                stream: true,
                ...(agentConfig.maxOutputTokens && { max_tokens: parseInt(agentConfig.maxOutputTokens, 10) }),
                ...(agentConfig.top_p && { top_p: parseFloat(agentConfig.top_p) }),
                ...(agentConfig.top_k && { top_k: parseInt(agentConfig.top_k, 10) })
            };

            // Call with new signature, including context. Use callBackend for uniform fallback behavior.
            try {
                await callBackend('send_to_vcp', {
                    server_url: globalSettings.vcpServerUrl,
                    api_key: globalSettings.vcpApiKey,
                    messages: messagesForVCP,
                    model_config: modelConfig,
                    message_id: thinkingMessageId,
                    is_group_call: false,
                    context: context
                }, () => {
                    if (window.tauriAPI && typeof window.tauriAPI.sendToVCP === 'function') {
                        return window.tauriAPI.sendToVCP(globalSettings.vcpServerUrl, globalSettings.vcpApiKey, messagesForVCP, modelConfig, thinkingMessageId, false, context);
                    }
                    return Promise.reject(new Error('No backend API available to send VCP request.'));
                });
            } catch (e) {
                throw e;
            }

        } catch (error) {
            console.error('Error sending message to VCP:', error);
            if (window.messageRenderer) {
                // Finalize without context to prevent history saving, then update UI
                window.messageRenderer.finalizeStreamedMessage(thinkingMessageId, 'error');
                const messageItemContent = document.querySelector(`.message-item[data-message-id="${thinkingMessageId}"] .md-content`);
                if (messageItemContent) {
                    messageItemContent.innerHTML = `<p style="color: var(--danger-color);">请求失败: ${error.message}</p>`;
                }
            }
            activeStreamingMessageId = null;
            messageInput.disabled = false;
            sendMessageBtn.disabled = false;
            messageInput.focus();
        }
    };

    const activeStreams = new Set();
    // Listen to the new, unified stream event
    // Unified VCP stream handler that works with both Tauri events and legacy tauriAPI callbacks
    const vcpStreamHandler = (eventData) => {
        if (!window.messageRenderer || eventData.messageId !== activeStreamingMessageId) return;

        const { messageId, type, chunk, error, context } = eventData;

        // The 'start' event is implicit. The first 'data' chunk will trigger startStreamingMessage.
        if (!activeStreams.has(messageId) && type === 'data') {
            window.messageRenderer.startStreamingMessage({
                id: messageId,
                role: 'assistant',
                name: agentConfig.name,
                avatarUrl: agentConfig.avatarUrl,
                context: context,
            });
            activeStreams.add(messageId);
        }

        if (type === 'data') {
            window.messageRenderer.appendStreamChunk(messageId, chunk, context);
        } else if (type === 'end') {
            window.messageRenderer.finalizeStreamedMessage(messageId, 'completed', context);
            activeStreams.delete(messageId);
            activeStreamingMessageId = null;
            messageInput.disabled = false;
            sendMessageBtn.disabled = false;
            messageInput.focus();
        } else if (type === 'error') {
            window.messageRenderer.finalizeStreamedMessage(messageId, 'error', context);
            const messageItemContent = document.querySelector(`.message-item[data-message-id="${messageId}"] .md-content`);
            if (messageItemContent) {
                messageItemContent.innerHTML = `<p style="color: var(--danger-color);">${error || '未知流错误'}</p>`;
            }
            activeStreams.delete(messageId);
            activeStreamingMessageId = null;
            messageInput.disabled = false;
            sendMessageBtn.disabled = false;
            messageInput.focus();
        }
    };

    if (window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
        try {
            window.__TAURI__.event.listen('vcp-stream-event', (evt) => {
                vcpStreamHandler(evt.payload);
            });
        } catch (e) {
            console.warn('Tauri vcp-stream-event listen failed, falling back to tauriAPI.onVCPStreamEvent', e);
            if (window.tauriAPI && typeof window.tauriAPI.onVCPStreamEvent === 'function') {
                window.tauriAPI.onVCPStreamEvent(vcpStreamHandler);
            }
        }
    } else {
        if (window.tauriAPI && typeof window.tauriAPI.onVCPStreamEvent === 'function') {
            window.tauriAPI.onVCPStreamEvent(vcpStreamHandler);
        }
    }

    sendMessageBtn.addEventListener('click', () => sendMessage(messageInput.value));
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(messageInput.value);
        }
    });
});