// Tauri 兼容层：提供统一的 tauriAPI 接口
// 此文件仅用于 Tauri 环境，不再提供 Electron 回退
(function () {
    // Tauri v2: invoke 在 window.__TAURI__.core.invoke
    // Tauri v1: invoke 在 window.__TAURI__.invoke
    const invoke = window.__TAURI__?.core?.invoke || 
                   window.__TAURI_INVOKE__ || 
                   (window.__TAURI__ && window.__TAURI__.invoke);
    
    if (!invoke) {
        console.error('[tauri_compat] Tauri API 不可用，应用可能无法正常工作');
        console.error('[tauri_compat] window.__TAURI_INVOKE__:', window.__TAURI_INVOKE__);
        console.error('[tauri_compat] window.__TAURI__:', window.__TAURI__);
        console.error('[tauri_compat] window.__TAURI__.core:', window.__TAURI__?.core);
        return;
    }
    
    //console.log('[tauri_compat] ✅ Tauri API 已加载');

    // 创建 tauriAPI 对象，提供统一的接口
    const tauriAPI = {
        // 窗口控制
        minimizeWindow: () => invoke('minimize_window'),
        maximizeWindow: () => invoke('toggle_maximize_window'),
        unmaximizeWindow: () => invoke('unmaximize_window'),
        closeWindow: () => invoke('close_window'),

        // Agents / Groups
        getAgents: () => invoke('get_agents'),
        getAgentGroups: () => invoke('get_agent_groups'),
        getAgentConfig: (agentId) => invoke('get_agent_config', { agentId: agentId }),
        getAgentGroupConfig: (groupId) => invoke('get_agent_group_config', { groupId: groupId }),
        saveAgentConfig: (agentId, config) => invoke('update_agent_config', { agentId: agentId, updates: config }),
        createAgent: (name, config) => invoke('create_agent', { name, initial_config: config }),
        deleteAgent: (agentId) => invoke('delete_agent', { agentId: agentId }),

        // Topics / Chat
        getChatHistory: (agentId, topicId) => invoke('get_chat_history', { agentId: agentId, topicId: topicId }),
        saveChatHistory: (agentId, topicId, messages) => invoke('save_chat_history', { agentId: agentId, topicId: topicId, messages }),
        getGroupChatHistory: (groupId, topicId) => invoke('get_chat_history', { agentId: groupId, topicId: topicId }),
        saveGroupChatHistory: (groupId, topicId, messages) => invoke('save_chat_history', { agentId: groupId, topicId: topicId, messages }),
        createNewTopicForAgent: (agentId, name) => invoke('create_new_topic', { agentId: agentId, topicName: name }),
        createNewTopicForGroup: (groupId, name) => invoke('create_new_topic', { agentId: groupId, topicName: name }),

        // 设置 / 主题
        getSettings: () => invoke('get_settings'),
        loadSettings: () => invoke('get_settings'),
        saveSettings: (settings) => invoke('save_settings', { settings }),
        getUnreadTopicCounts: () => invoke('get_unread_topic_counts'),

        // 图片 / 查看器
        openImageViewer: ({ src, title, theme } = {}) => invoke('open_image_viewer', { src, title, theme }),

        // VCP
        sendToVCP: (vcpUrl, apiKey, messages, modelConfig, messageId, isGroupCall, context) =>
            invoke('send_message_to_vcp', {
                agentId: context?.agentId || null,
                topicId: context?.topicId || null,
                content: messages && messages.length ? messages[messages.length - 1].content : '',
                vcp_url: vcpUrl,
                vcp_api_key: apiKey,
                messages: messages,
                model_config: modelConfig,
                message_id: messageId,
                is_group_call: isGroupCall,
                context: context
            }),
        
        // 中止请求
        interruptVcpRequest: ({ messageId }) => invoke('interrupt_vcp_request', { messageId }),
        interruptGroupRequest: (messageId) => invoke('interrupt_group_request', { messageId }),

        // 通用 invoke（用于其他命令）
        invoke: (cmd, args) => invoke(cmd, args),

        // 预设 / 文件
        getGlobalWarehouse: () => invoke('get_global_warehouse'),
        saveGlobalWarehouse: (data) => invoke('save_global_warehouse', data),
        loadPresetPrompts: (presetPath) => invoke('load_preset_prompts', presetPath),
        readFile: (filePath) => invoke('read_file', filePath),
        readAvatarFile: (filePath) => invoke('read_avatar_file', filePath),

        // 打开外部链接
        openExternal: (url) => {
            return invoke('open_external', { url }).catch(err => {
                console.warn('[tauriAPI] open_external 失败，尝试使用 window.open:', err);
                try {
                    window.open(url, '_blank');
                    return Promise.resolve();
                } catch (e) {
                    return Promise.reject(e);
                }
            });
        },

        // 阅读模式
        getOriginalMessageContent: (id, type, topicId, messageId) => 
            invoke('get_original_message_content', { id, type, topicId, messageId }),
        openTextInNewWindow: (content, title, theme) => 
            invoke('open_text_in_new_window', { content, title, theme })
    };

    // 使用 Proxy 处理未定义的方法调用
    const handler = {
        get(target, prop) {
            if (prop in target) return target[prop];
            const propName = String(prop);
            
            // 将驼峰命名转换为蛇形命名
            const snake = propName.replace(/([A-Z])/g, '_$1').toLowerCase();
            
            return (arg1, arg2) => {
                // 如果传入的是对象，直接作为参数传递
                if (arg1 !== undefined && typeof arg1 === 'object' && !(arg1 instanceof Array)) {
                    return invoke(snake, arg1);
                }
                // 多个位置参数时构建参数对象
                if (arg2 !== undefined) {
                    return invoke(snake, { arg1, arg2 });
                }
                return invoke(snake, arg1);
            };
        }
    };

    window.tauriAPI = new Proxy(tauriAPI, handler);
    
    //console.log('[tauri_compat] Tauri 兼容层已初始化');
})();
