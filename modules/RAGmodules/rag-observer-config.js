// RAG Observer Configuration Script
// 从全局变量VCP_SETTINGS读取配置并应用主题

class RAGObserverConfig {
    constructor() {
        this.settings = null;
        this.wsConnection = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 3000; // 3秒
        this.isConnecting = false;
    }

    // 从URL查询参数读取settings
    loadSettings() {
        const params = new URLSearchParams(window.location.search);
        const settings = {
            vcpLogUrl: params.get('vcpLogUrl') || 'ws://127.0.0.1:5890',
            vcpLogKey: params.get('vcpLogKey') || ''
        };
        this.settings = settings;
        //console.log('Loaded settings from URL:', this.settings);
        return this.settings;
    }

    // 应用主题
    applyTheme(themeMode) {
        const body = document.body;
        if (themeMode === 'light') {
            body.classList.add('light-theme');
        } else {
            body.classList.remove('light-theme');
        }
    }

    // 自动连接WebSocket
    autoConnect(isReconnect = false) {
        if (this.isConnecting) return;
        this.isConnecting = true;

        const settings = this.loadSettings();
        
        // Theme is now handled by the async DOMContentLoaded listener.
        
        // 获取连接信息
        const wsUrl = settings.vcpLogUrl || 'ws://127.0.0.1:5890';
        const vcpKey = settings.vcpLogKey || '';

        if (!vcpKey) {
            console.warn('警告: VCP Key 未设置');
            updateStatus('error', '配置错误：VCP Key 未设置');
            this.isConnecting = false;
            return;
        }

        // 连接WebSocket
        const wsUrlInfo = `${wsUrl}/vcpinfo/VCP_Key=${vcpKey}`;
        
        if (!isReconnect) {
            updateStatus('connecting', `连接中: ${wsUrl}`);
        } else {
            updateStatus('connecting', `重连中 (${this.reconnectAttempts}/${this.maxReconnectAttempts}): ${wsUrl}`);
        }

        this.wsConnection = new WebSocket(wsUrlInfo);
        
        this.wsConnection.onopen = (event) => {
            //console.log('WebSocket 连接已建立:', event);
            updateStatus('open', 'VCPInfo 已连接！');
            this.reconnectAttempts = 0; // 连接成功，重置重连计数
            this.isConnecting = false;
        };

        this.wsConnection.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                // 检查是否为RAG、元思考链或Agent私聊预览的详细信息
                if (data.type === 'RAG_RETRIEVAL_DETAILS' || data.type === 'META_THINKING_CHAIN' || data.type === 'AGENT_PRIVATE_CHAT_PREVIEW' || data.type === 'AI_MEMO_RETRIEVAL') {
                    if (window.startSpectrumAnimation) {
                        window.startSpectrumAnimation(3000); // 动画持续3秒
                    }
                    displayRagInfo(data); // displayRagInfo内部会处理这两种类型
                }
            } catch (e) {
                console.error('解析消息失败:', e);
            }
        };

        this.wsConnection.onclose = (event) => {
            this.isConnecting = false;
            //console.log('WebSocket 连接已关闭:', event);
            updateStatus('closed', '连接已断开。尝试重连...');
            this.reconnect(); // 尝试重连
        };

        this.wsConnection.onerror = (error) => {
            this.isConnecting = false;
            console.error('WebSocket 错误:', error);
            // 错误处理：在 onclose 中处理重连，这里只更新状态
            updateStatus('error', '连接发生错误！请检查服务器或配置。');
        };
    }

    // 尝试重新连接
    reconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            //console.log(`尝试在 ${this.reconnectDelay / 1000} 秒后重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => {
                this.autoConnect(true);
            }, this.reconnectDelay);
        } else {
            updateStatus('error', '连接失败，已达到最大重连次数。请检查配置或服务器状态。');
            console.error('已达到最大重连次数，停止重连。');
        }
    }

    // watchSettings is deprecated in favor of the onThemeUpdated IPC listener
    /*
    watchSettings(interval = 5000) {
        setInterval(() => {
            const newSettings = this.loadSettings();
            if (newSettings.currentThemeMode !== this.settings?.currentThemeMode) {
                this.applyTheme(newSettings.currentThemeMode);
                this.settings = newSettings;
                //console.log('主题已更新:', newSettings.currentThemeMode);
            }
        }, interval);
    }
    */
}

// 页面加载时自动初始化
window.addEventListener('DOMContentLoaded', async () => {
    const config = new RAGObserverConfig();

    // Helper to call backend via Tauri invoke with fallback to tauriAPI
    async function callBackend(cmd, args, fallback) {
        if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
            try {
                return await window.__TAURI__.invoke(cmd, args);
            } catch (e) {
                console.warn('[RAGObserver] Tauri invoke failed for', cmd, e);
            }
        }
        if (window.tauriAPI && typeof fallback === 'function') {
            try { return await fallback(); } catch (e) { console.warn('[RAGObserver] tauriAPI fallback failed for', cmd, e); }
        }
        return null;
    }

    // Initialize and apply theme first
    // Prefer Tauri event listener, fallback to tauriAPI
    if (window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
        try {
            window.__TAURI__.event.listen('theme-updated', (evt) => {
                try { //console.log(`RAG Observer: Theme updated to ${evt.payload}`); config.applyTheme(evt.payload); } catch (e) { console.error('applyTheme failed on theme-updated', e); }
            });
        } catch (e) {
            console.warn('Tauri theme-updated listen failed, falling back to tauriAPI.onThemeUpdated', e);
            if (window.tauriAPI && typeof window.tauriAPI.onThemeUpdated === 'function') {
                window.tauriAPI.onThemeUpdated((theme) => {
                    //console.log(`RAG Observer: Theme updated to ${theme}`);
                    config.applyTheme(theme);
                });
            }
        }
    } else if (window.tauriAPI && typeof window.tauriAPI.onThemeUpdated === 'function') {
        window.tauriAPI.onThemeUpdated((theme) => {
            //console.log(`RAG Observer: Theme updated to ${theme}`);
            config.applyTheme(theme);
        });
    } else {
        // No live listener available
    }

    // Get and apply the initial theme (via callBackend with fallback)
    try {
        const theme = await callBackend('get_current_theme', {}, () => {
            return (window.tauriAPI && typeof window.tauriAPI.getCurrentTheme === 'function') ? window.tauriAPI.getCurrentTheme() : null;
        });
        //console.log(`RAG Observer: Initial theme set to ${theme}`);
        config.applyTheme(theme || 'dark');
    } catch (error) {
        console.error('RAG Observer: Failed to get initial theme, falling back to dark.', error);
        config.applyTheme('dark');
    }

    // Now connect to WebSocket
    config.autoConnect();

    // --- Platform Detection ---
    try {
        const platform = await callBackend('get_platform', {}, () => {
            return (window.tauriAPI && typeof window.tauriAPI.getPlatform === 'function') ? window.tauriAPI.getPlatform() : Promise.resolve(navigator.platform.toLowerCase());
        });
        const platformStr = (platform || navigator.platform || '').toLowerCase();
        if (platformStr.includes('mac') || platformStr.includes('darwin')) {
            document.body.classList.add('platform-mac');
        } else {
            document.body.classList.add('platform-win');
        }
    } catch (e) {
        const platform = navigator.platform.toLowerCase();
        if (platform.includes('mac')) {
            document.body.classList.add('platform-mac');
        } else {
            document.body.classList.add('platform-win');
        }
    }

    // --- Custom Title Bar Listeners ---
    const minimize = () => {
        callBackend('minimize_window', {}, () => {
            if (window.tauriAPI && typeof window.tauriAPI.minimizeWindow === 'function') {
                return window.tauriAPI.minimizeWindow();
            }
            return Promise.resolve();
        }).catch(err => console.error('minimize_window failed', err));
    };
    const maximize = () => {
        callBackend('toggle_maximize_window', {}, () => {
            if (window.tauriAPI && typeof window.tauriAPI.maximizeWindow === 'function') {
                return window.tauriAPI.maximizeWindow();
            }
            return Promise.resolve();
        }).catch(err => console.error('toggle_maximize_window failed', err));
    };
    const close = () => window.close();

    // Mac Controls
    document.getElementById('mac-minimize-btn').addEventListener('click', minimize);
    document.getElementById('mac-maximize-btn').addEventListener('click', maximize);
    document.getElementById('mac-close-btn').addEventListener('click', close);

    // Windows Controls
    document.getElementById('win-minimize-btn').addEventListener('click', minimize);
    document.getElementById('win-maximize-btn').addEventListener('click', maximize);
    document.getElementById('win-close-btn').addEventListener('click', close);
});
