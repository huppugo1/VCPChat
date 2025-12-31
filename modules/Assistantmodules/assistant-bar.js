// Assistantmodules/assistant-bar.js
// 助手栏模块 - 使用 Tauri API

// Import loadAsset function for handling asset loading
import { loadAsset } from '../utils/assetLoader.js';

document.addEventListener('DOMContentLoaded', () => {
    const assistantAvatar = document.getElementById('assistantAvatar');
    const buttons = document.querySelectorAll('.assistant-button');

    // 获取 Tauri invoke 函数
    const invoke = window.__TAURI__?.invoke;
    if (!invoke) {
        console.error('[AssistantBar] Tauri API 不可用');
        return;
    }

    // 1. 主动从后端获取初始数据
    const initialize = async () => {
        try {
            const data = await invoke('get_assistant_bar_initial_data');
            //console.log('[AssistantBar] 收到初始数据:', data);
            try {
                const avatarToResolve = data && data.agentAvatarUrl ? data.agentAvatarUrl : 'assets/default_avatar.png';
                const resolved = await window.avatarManager?.resolveAvatarUrl(avatarToResolve);
                assistantAvatar.src = resolved || avatarToResolve;
            } catch (error) {
                console.error('[AssistantBar] 解析头像失败:', error);
            }
            if (data && data.theme) {
                // 应用主题
                document.body.classList.toggle('light-theme', data.theme === 'light');
                document.body.classList.toggle('dark-theme', data.theme === 'dark');
            }
        } catch (error) {
            console.error('[AssistantBar] 获取初始数据失败:', error);
        }
    };

    initialize(); // 调用初始化函数

    // 2. 监听 Tauri 事件以动态更新助手栏
    if (window.__TAURI__?.event?.listen) {
        window.__TAURI__.event.listen('assistant-bar-data', async (event) => {
            const data = event.payload;
            //console.log('[AssistantBar] 收到推送数据:', data);
            try {
                const avatarToResolve = data && data.agentAvatarUrl ? data.agentAvatarUrl : 'assets/default_avatar.png';
                const resolved = await window.avatarManager?.resolveAvatarUrl(avatarToResolve);
                assistantAvatar.src = resolved || avatarToResolve;
            } catch (error) {
                console.error('[AssistantBar] 头像解析失败:', error);
            }
            // 应用主题
            document.body.classList.toggle('light-theme', data.theme === 'light');
            document.body.classList.toggle('dark-theme', data.theme === 'dark');
        });

        // 监听主题更新事件
        window.__TAURI__.event.listen('theme-updated', (event) => {
            const theme = event.payload;
            //console.log(`[AssistantBar] 主题更新为: ${theme}`);
            document.body.classList.toggle('light-theme', theme === 'light');
            document.body.classList.toggle('dark-theme', theme !== 'light');
        });
    }

    // 3. 为所有按钮添加点击事件
    buttons.forEach(button => {
        button.addEventListener('click', async () => {
            const action = button.getAttribute('data-action');
            //console.log(`[AssistantBar] 按钮点击: ${action}`);
            // 4. 通知后端执行操作
            try {
                await invoke('assistant_action', { action });
            } catch (error) {
                console.error('[AssistantBar] 执行操作失败:', error);
            }
        });
    });

    // 当鼠标离开窗口时，自动关闭
    document.body.addEventListener('mouseleave', async () => {
        try {
            await invoke('close_assistant_bar');
        } catch (error) {
            console.error('[AssistantBar] 关闭助手栏失败:', error);
        }
    });
});
