document.addEventListener('DOMContentLoaded', async () => {
    // 获取所有需要的 DOM 元素
    const sourceTextarea = document.getElementById('sourceText');
    const translatedTextarea = document.getElementById('translatedText');
    const targetLanguageSelect = document.getElementById('targetLanguageSelect');
    const modelSelect = document.getElementById('modelSelect');
    const customPromptVarInput = document.getElementById('customPromptVar');
    const translateBtn = document.getElementById('translateBtn');
    const copyBtn = document.getElementById('copyBtn');

    // --- Custom Title Bar Elements ---
    const minimizeTranslatorBtn = document.getElementById('minimize-translator-btn');
    const maximizeTranslatorBtn = document.getElementById('maximize-translator-btn');
    const closeTranslatorBtn = document.getElementById('close-translator-btn');

    // 配置和状态变量
    let vcpServerUrl = '';
    let vcpApiKey = '';
    let currentTheme = 'dark'; // 默认是暗色主题
    let abortController = null; // 用于中止 fetch 请求

    // 保存复制按钮原始的 SVG 图标
    const originalCopyBtnIcon = copyBtn.innerHTML;

    // 应用主题的函数 (与主程序同步)
    const applyTheme = (theme) => {
        document.body.classList.toggle('light-theme', theme === 'light');
        currentTheme = theme;
    };

    // Helper to call backend via Tauri invoke with fallback to tauriAPI
    async function callBackend(cmd, args, fallback) {
        if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
            try {
                return await window.__TAURI__.invoke(cmd, args);
            } catch (e) {
                console.warn('[Translator] Tauri invoke failed for', cmd, e);
            }
        }
        if (window.tauriAPI && typeof fallback === 'function') {
            try { return await fallback(); } catch (e) { console.warn('[Translator] tauriAPI fallback failed for', cmd, e); }
        }
        return null;
    }

    // 从主进程加载配置
    async function loadConfig() {
        try {
            const settings = await callBackend('load_settings', {}, () => {
                return (window.tauriAPI && typeof window.tauriAPI.loadSettings === 'function') ? window.tauriAPI.loadSettings() : null;
            });
            if (settings.vcpServerUrl && settings.vcpApiKey) {
                vcpServerUrl = settings.vcpServerUrl;
                vcpApiKey = settings.vcpApiKey;
                //console.log('Translator config loaded successfully:', { vcpServerUrl, vcpApiKey });
            } else {
                console.error('Failed to load VCP config from settings.');
                console.error('无法从主程序加载翻译配置。'); // 调试信息
            }
        } catch (error) {
            console.error('Error loading settings via IPC:', error);
            console.error('加载配置时出错。'); // 调试信息
        }
    }

    // --- 直接调用 VCP API 进行翻译 ---
    async function performDirectTranslation(messages, modelConfig) {
        if (abortController) {
            abortController.abort(); // Abort previous request if any
        }
        abortController = new AbortController();
        const signal = abortController.signal;

        let fullTranslation = '';
        translatedTextarea.value = '翻译中...';
        translatedTextarea.classList.add('streaming');

        try {
            const response = await fetch(vcpServerUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${vcpApiKey}`
                },
                body: JSON.stringify({
                    messages: messages,
                    model: modelConfig.model,
                    temperature: modelConfig.temperature,
                    max_tokens: 50000,
                    stream: false // Use non-streaming request
                }),
                signal: signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`服务器错误: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const result = await response.json();
            const translation = result.choices?.[0]?.message?.content;

            if (translation) {
                translatedTextarea.value = translation;
            } else {
                throw new Error('API 返回的响应中没有有效的翻译内容。');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                //console.log('Translation request was aborted.');
                translatedTextarea.value = '翻译已取消。';
            } else {
                console.error('Error during direct translation fetch:', error);
                translatedTextarea.value = `翻译请求失败: ${error.message}`;
            }
        } finally {
            translatedTextarea.classList.remove('streaming');
            abortController = null;
        }
    }

    // --- 为翻译按钮添加点击事件 ---
    translateBtn.addEventListener('click', () => {
        const sourceText = sourceTextarea.value.trim();
        if (!sourceText) {
            console.error('请输入要翻译的文本。'); // 调试信息
            return;
        }
        if (!vcpServerUrl || !vcpApiKey) {
            console.error('VCP 服务器 URL 或 API Key 未配置，请检查主程序设置。'); // 调试信息
            return;
        }

        const targetLanguageValue = targetLanguageSelect.value;
        const customPromptVar = customPromptVarInput.value.trim();
        let targetLanguageText = '';

        if (targetLanguageValue === 'custom') {
            targetLanguageText = customPromptVar;
            if (!targetLanguageText) {
                console.error('请在"自定义提示词"框中输入您想翻译的目标语言。'); // 调试信息
                return;
            }
            // 当使用自定义语言时，我们将自定义提示词框的内容作为目标语言。
        } else {
            targetLanguageText = targetLanguageSelect.options[targetLanguageSelect.selectedIndex].text;
        }

        let systemPrompt = `你是一个专业的翻译助手。请将用户提供的文本翻译成${targetLanguageText}。`;
        // 如果不是自定义模式，并且自定义提示词有内容，则添加为额外要求
        if (targetLanguageValue !== 'custom' && customPromptVar) {
            systemPrompt += ` 额外要求: ${customPromptVar}。`;
        }
        systemPrompt += ` 仅返回翻译结果，不要包含任何解释或额外信息。`;

        const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: sourceText }];
        const selectedModel = modelSelect.value;
        const modelConfig = { model: selectedModel, temperature: 0.7 };

        performDirectTranslation(messages, modelConfig);
    });

    // --- Initialization and Theme Handling ---
    async function initialize() {
        await loadConfig(); // Load VCP settings first

        // Then initialize theme (prefer Tauri, fallback to tauriAPI)
        try {
            const theme = await callBackend('get_current_theme', {}, () => {
                return (window.tauriAPI && typeof window.tauriAPI.getCurrentTheme === 'function') ? window.tauriAPI.getCurrentTheme() : null;
            });
            applyTheme(theme || 'dark');
        } catch (error) {
            console.error('Failed to get initial theme:', error);
            applyTheme('dark'); // Fallback
        }

        // Listen for theme updates
        if (window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
            try {
                window.__TAURI__.event.listen('theme-updated', (evt) => {
                    try { applyTheme(evt.payload); } catch (e) { console.error('applyTheme failed on theme-updated', e); }
                });
            } catch (e) {
                console.warn('Tauri theme-updated listen failed, falling back to tauriAPI.onThemeUpdated', e);
                if (window.tauriAPI && typeof window.tauriAPI.onThemeUpdated === 'function') {
                    window.tauriAPI.onThemeUpdated(applyTheme);
                }
            }
        } else if (window.tauriAPI && typeof window.tauriAPI.onThemeUpdated === 'function') {
            window.tauriAPI.onThemeUpdated(applyTheme);
        } else {
            console.warn('Theme update listener not available.');
        }

        // --- Custom Title Bar Listeners ---
        minimizeTranslatorBtn.addEventListener('click', () => {
            callBackend('minimize_window', {}, () => {
                if (window.tauriAPI && typeof window.tauriAPI.minimizeWindow === 'function') {
                    return window.tauriAPI.minimizeWindow();
                }
                return Promise.resolve();
            }).catch(err => console.error('minimize_window failed', err));
        });

        maximizeTranslatorBtn.addEventListener('click', () => {
            callBackend('toggle_maximize_window', {}, () => {
                if (window.tauriAPI && typeof window.tauriAPI.maximizeWindow === 'function') {
                    return window.tauriAPI.maximizeWindow();
                }
                return Promise.resolve();
            }).catch(err => console.error('toggle_maximize_window failed', err));
        });

        closeTranslatorBtn.addEventListener('click', () => {
            window.close();
        });
    }

    // --- 为复制按钮添加点击事件 ---
    copyBtn.addEventListener('click', () => {
        const textToCopy = translatedTextarea.value;
        if (textToCopy && !translatedTextarea.classList.contains('streaming')) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                copyBtn.innerHTML = '<span class="copy-feedback">已复制!</span>';
                setTimeout(() => {
                    copyBtn.innerHTML = originalCopyBtnIcon;
                }, 2000);
            }).catch(err => {
                console.error('Could not copy text: ', err);
                copyBtn.innerHTML = '<span class="copy-feedback">失败</span>';
                 setTimeout(() => {
                    copyBtn.innerHTML = originalCopyBtnIcon;
                }, 2000);
            });
        }
    });

    initialize();
});
