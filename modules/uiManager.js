/**
 * uiManager.js
 * 
 * Manages general UI functionalities like the title bar, resizers, theme, and clock.
 */
const uiManager = (() => {
    // --- Private Variables ---
    let globalSettingsRef = { get: () => ({}) }; // Reference to global settings
    let tauriAPI = null;

    // DOM Elements (will be initialized in init)
    let leftSidebar, rightNotificationsSidebar, resizerLeft, resizerRight;
    let minimizeBtn, maximizeBtn, restoreBtn, closeBtn, settingsBtn;
    let themeToggleBtn;
    let digitalClockElement, dateDisplayElement, notificationTitleElement;
    let sidebarTabButtons, sidebarTabContents;


    // --- Private Functions ---

    /**
     * Sets up the custom title bar controls (minimize, maximize, close).
     */
    function setupTitleBarControls() {
        if (minimizeBtn) minimizeBtn.addEventListener('click', () => {
            if (window.__TAURI__?.invoke) {
                window.__TAURI__.invoke('minimize_window').catch(err => console.error('[UIManager] 最小化窗口失败:', err));
            } else {
                console.warn('[UIManager] Tauri API 不可用，无法最小化窗口');
            }
        });
        if (maximizeBtn) maximizeBtn.addEventListener('click', () => {
            if (window.__TAURI__?.invoke) {
                window.__TAURI__.invoke('toggle_maximize_window').catch(err => console.error('[UIManager] 切换最大化窗口失败:', err));
            } else {
                console.warn('[UIManager] Tauri API 不可用，无法最大化窗口');
            }
        });
        if (restoreBtn) restoreBtn.addEventListener('click', () => {
            if (window.__TAURI__?.invoke) {
                window.__TAURI__.invoke('unmaximize_window').catch(err => console.error('[UIManager] 还原窗口失败:', err));
            } else {
                console.warn('[UIManager] Tauri API 不可用，无法还原窗口');
            }
        });
        if (closeBtn) closeBtn.addEventListener('click', () => {
            if (window.__TAURI__?.invoke) {
                window.__TAURI__.invoke('close_window').catch(err => console.error('[UIManager] 关闭窗口失败:', err));
            } else {
                console.warn('[UIManager] Tauri API 不可用，尝试使用 window.close()');
                window.close();
            }
        });

        // 监听窗口最大化/还原事件
        if (window.__TAURI__?.event?.listen) {
            try {
                window.__TAURI__.event.listen('window-maximized', () => {
                    if (maximizeBtn) maximizeBtn.style.display = 'none';
                    if (restoreBtn) restoreBtn.style.display = 'flex';
                });
                window.__TAURI__.event.listen('window-unmaximized', () => {
                    if (maximizeBtn) maximizeBtn.style.display = 'flex';
                    if (restoreBtn) restoreBtn.style.display = 'none';
                });
            } catch (e) {
                console.error('[UIManager] 监听窗口最大化/还原事件失败:', e);
            }
        } else {
            console.warn('[UIManager] Tauri 事件 API 不可用，无法监听窗口状态变化');
        }
    }

    /**
     * Initializes the resizable sidebars.
     */
    function initializeResizers() {
        let isResizingLeft = false;
        let isResizingRight = false;
        let startX = 0;

        if (resizerLeft && leftSidebar) {
            resizerLeft.addEventListener('mousedown', (e) => {
                isResizingLeft = true;
                startX = e.clientX;
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
                if (leftSidebar) leftSidebar.style.transition = 'none';
            });
        }

        if (resizerRight && rightNotificationsSidebar) {
            resizerRight.addEventListener('mousedown', (e) => {
                if (!rightNotificationsSidebar.classList.contains('active')) {
                    if (window.__TAURI__?.invoke) {
                        window.__TAURI__.invoke('toggle_notifications_sidebar').catch(err => {
                            console.error('[UIManager] 切换通知侧边栏失败:', err);
                        });
                    } else {
                        console.warn('[UIManager] Tauri API 不可用，无法切换通知侧边栏');
                    }
                    requestAnimationFrame(() => {
                        isResizingRight = true;
                        startX = e.clientX;
                        document.body.style.cursor = 'col-resize';
                        document.body.style.userSelect = 'none';
                        rightNotificationsSidebar.style.transition = 'none';
                    });
                } else {
                    isResizingRight = true;
                    startX = e.clientX;
                    document.body.style.cursor = 'col-resize';
                    document.body.style.userSelect = 'none';
                    rightNotificationsSidebar.style.transition = 'none';
                }
            });
        }

        document.addEventListener('mousemove', (e) => {
            if (isResizingLeft && leftSidebar) {
                const deltaX = e.clientX - startX;
                const currentWidth = leftSidebar.offsetWidth;
                let newWidth = currentWidth + deltaX;
                newWidth = Math.max(parseInt(getComputedStyle(leftSidebar).minWidth, 10) || 180, Math.min(newWidth, parseInt(getComputedStyle(leftSidebar).maxWidth, 10) || 600));
                leftSidebar.style.width = `${newWidth}px`;
                startX = e.clientX;
            }
            if (isResizingRight && rightNotificationsSidebar && rightNotificationsSidebar.classList.contains('active')) {
                const deltaX = e.clientX - startX;
                const currentWidth = rightNotificationsSidebar.offsetWidth;
                let newWidth = currentWidth - deltaX;
                newWidth = Math.max(parseInt(getComputedStyle(rightNotificationsSidebar).minWidth, 10) || 220, Math.min(newWidth, parseInt(getComputedStyle(rightNotificationsSidebar).maxWidth, 10) || 600));
                rightNotificationsSidebar.style.width = `${newWidth}px`;
                startX = e.clientX;
            }
        });

        document.addEventListener('mouseup', async () => {
            let settingsChanged = false;
            const currentSettings = globalSettingsRef.get();

            if (isResizingLeft && leftSidebar) {
                leftSidebar.style.transition = '';
                const newSidebarWidth = leftSidebar.offsetWidth;
                if (currentSettings.sidebarWidth !== newSidebarWidth) {
                    currentSettings.sidebarWidth = newSidebarWidth;
                    settingsChanged = true;
                }
            }
            if (isResizingRight && rightNotificationsSidebar && rightNotificationsSidebar.classList.contains('active')) {
                rightNotificationsSidebar.style.transition = '';
                const newNotificationsWidth = rightNotificationsSidebar.offsetWidth;
                if (currentSettings.notificationsSidebarWidth !== newNotificationsWidth) {
                    currentSettings.notificationsSidebarWidth = newNotificationsWidth;
                    settingsChanged = true;
                }
            }

            isResizingLeft = false;
            isResizingRight = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            if (settingsChanged) {
                try {
                    if (window.__TAURI__?.invoke) {
                        await window.__TAURI__.invoke('save_settings', currentSettings);
                        //console.log('[UIManager] 侧边栏宽度已保存到设置');
                    } else {
                        console.warn('[UIManager] Tauri API 不可用，无法保存侧边栏宽度');
                    }
                } catch (error) {
                    console.error('[UIManager] 保存侧边栏宽度失败:', error);
                }
            }
        });
    }

    /**
     * Applies the specified theme (light/dark) to the document body and updates the toggle button.
     * @param {string} theme - The theme to apply ('light' or 'dark').
     */
    function applyTheme(theme) {
        if (!theme || (theme !== 'light' && theme !== 'dark')) {
            console.warn(`[UIManager] 无效的主题: ${theme}，默认使用 light 主题`);
            theme = 'light';
        }
        
        // Apply class to body for CSS styling
        document.body.classList.remove('light-theme', 'dark-theme');
        document.body.classList.add(`${theme}-theme`);

        // Update the toggle button icon
        if (themeToggleBtn) {
            const themeIcon = themeToggleBtn.querySelector('i');
            if (themeIcon) {
                themeIcon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
            }
        }
        //console.log(`[UIManager] 已应用主题: ${theme}`);
    }

    /**
     * Initializes theme handling by getting the current theme and listening for updates.
     */
    async function initializeTheme() {
        // 监听主题更新事件
        if (window.__TAURI__?.event?.listen) {
            try {
                window.__TAURI__.event.listen('theme-updated', (event) => {
                    try {
                        const theme = event.payload;
                        const themeName = typeof theme === 'object' && theme !== null ? theme.theme : theme;
                        if (themeName) applyTheme(themeName);
                    } catch (e) { 
                        console.error('[UIManager] 处理主题更新事件失败:', e); 
                    }
                });
            } catch (e) {
                console.error('[UIManager] 监听主题更新事件失败:', e);
            }
        } else {
            console.warn('[UIManager] Tauri 事件 API 不可用，无法监听主题更新');
        }

        // 从设置中应用初始主题
        const settings = globalSettingsRef.get();
        if (settings && settings.currentThemeMode) {
            //console.log(`[UIManager] 从设置中应用初始主题: ${settings.currentThemeMode}`);
            if (window.__TAURI__?.invoke) {
                window.__TAURI__.invoke('set_theme', { theme: settings.currentThemeMode }).catch(err => {
                    console.error('[UIManager] 设置主题失败:', err);
                });
            } else {
                console.warn('[UIManager] Tauri API 不可用，无法设置主题');
            }
        } else {
            // 如果设置中没有主题，尝试从后端获取
            console.warn('[UIManager] 设置中未找到 currentThemeMode，尝试从后端获取');
            if (window.__TAURI__?.invoke) {
                try {
                    const currentTheme = await window.__TAURI__.invoke('get_current_theme');
                    applyTheme(currentTheme);
                } catch (error) {
                    console.error('[UIManager] 获取当前主题失败:', error);
                    applyTheme('light');
                }
            } else {
                console.warn('[UIManager] Tauri API 不可用，使用默认 light 主题');
                applyTheme('light');
            }
        }
    }

    /**
     * Updates the digital clock and date display.
     */
    function updateDateTimeDisplay() {
        const now = new Date();
        if (digitalClockElement) {
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            if (!digitalClockElement.querySelector('.colon')) {
                digitalClockElement.innerHTML = `<span class="hours">${hours}</span><span class="colon">:</span><span class="minutes">${minutes}</span>`;
            } else {
                const hoursSpan = digitalClockElement.querySelector('.hours');
                const minutesSpan = digitalClockElement.querySelector('.minutes');
                if (hoursSpan) hoursSpan.textContent = hours;
                if (minutesSpan) minutesSpan.textContent = minutes;
            }
        }
        if (dateDisplayElement) {
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const dayOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
            dateDisplayElement.textContent = `${month}-${day} ${dayOfWeek}`;
        }
    }

    /**
     * Initializes the digital clock display.
     */
    function initializeDigitalClock() {
        if (digitalClockElement && notificationTitleElement && dateDisplayElement) {
            notificationTitleElement.style.display = 'none';
            updateDateTimeDisplay();
            setInterval(updateDateTimeDisplay, 1000);
        } else {
            console.error('[UIManager] 数字时钟、通知标题或日期显示元素未找到');
        }
    }

    /**
     * Sets up the sidebar tabs functionality.
     */
    function setupSidebarTabs() {
        if (sidebarTabButtons) {
            sidebarTabButtons.forEach(button => {
                // 左键点击 - 切换标签
                button.addEventListener('click', () => {
                    switchToTab(button.dataset.tab);
                });
                
                // 中键点击 - 如果是设置标签，直接打开全局设置
                button.addEventListener('mousedown', (e) => {
                    if (e.button === 1 && button.dataset.tab === 'settings') {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // 打开全局设置模态框
                        if (window.uiHelperFunctions && window.uiHelperFunctions.openModal) {
                            //console.log('[UIManager] Middle click on settings tab - opening global settings modal');
                            window.uiHelperFunctions.openModal('globalSettingsModal');
                        } else {
                            console.warn('[UIManager] uiHelperFunctions.openModal not available');
                        }
                    }
                });
            });
            // Default to 'agents' tab (or your preferred default)
            switchToTab('agents');
        }
    }

    /**
     * Switches to the specified tab.
     * @param {string} targetTab - The tab to switch to.
     */
    function switchToTab(targetTab) {
        if (sidebarTabButtons) {
            sidebarTabButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === targetTab);
            });
        }
        if (sidebarTabContents) {
            sidebarTabContents.forEach(content => {
                const isActive = content.id === `tabContent${targetTab.charAt(0).toUpperCase() + targetTab.slice(1)}`;
                content.classList.toggle('active', isActive);
                if (isActive) {
                    if (targetTab === 'topics') {
                        console.log('[UIManager] 切换到话题标签页，准备加载话题列表');
                        if (window.topicListManager) {
                            console.log('[UIManager] 调用 topicListManager.loadTopicList()');
                            window.topicListManager.loadTopicList(); // This might create/re-render the topic list and search input
                            window.topicListManager.setupTopicSearch(); // Explicitly set up search listeners after the tab is active and list loaded
                        } else {
                            console.warn('[UIManager] window.topicListManager 不存在');
                        }
                        // 刷新计数
                        refreshUnreadCounts();
                    } else if (targetTab === 'settings') {
                        if (window.settingsManager) {
                            // 检查是否有待刷新的 Agent
                            const pendingAgentId = sessionStorage.getItem('pendingAgentReload');
                            if (pendingAgentId) {
                                //console.log('[UIManager] Detected pending agent reload, reloading:', pendingAgentId);
                                sessionStorage.removeItem('pendingAgentReload');
                                // 延迟执行以确保标签页切换完成
                                setTimeout(() => {
                                    if (window.settingsManager && typeof window.settingsManager.reloadAgentSettings === 'function') {
                                        window.settingsManager.reloadAgentSettings(pendingAgentId);
                                    }
                                }, 50);
                            } else {
                                window.settingsManager.displaySettingsForItem();
                            }
                        }
                    } else if (targetTab === 'agents') { // Assuming 'agents' is the ID for the items list tab content
                        // 不再需要重置鼠标事件状态，因为 itemListManager 已删除
                        // 刷新计数
                        refreshUnreadCounts();
                        // The items list (agents & groups) is always visible in a way,
                        // but this ensures other tab contents are hidden.
                        // loadItems() is usually called on init or after create/delete.
                    }
                }
            });
        }
    }

    /**
     * 刷新未读计数
     */
    async function refreshUnreadCounts() {
        if (!window.__TAURI__?.invoke) {
            console.error('[UIManager] Tauri API 不可用，无法刷新未读计数');
            return;
        }
        try {
            const result = await window.__TAURI__.invoke('get_unread_topic_counts');
            if (result && result.success) {
                if (window.itemListManager && typeof window.itemListManager.updateUnreadBadges === 'function') {
                    window.itemListManager.updateUnreadBadges(result.counts);
                }
            }
        } catch (error) {
            console.error('[UIManager] 刷新未读计数失败:', error);
        }
    }


    // --- Public API ---
    return {
        init: async (options) => {
            tauriAPI = options.tauriAPI || (window.__TAURI__?.invoke ? window.__TAURI__ : null);
            globalSettingsRef = options.refs.globalSettingsRef;

            // Assign DOM elements from options.elements
            leftSidebar = options.elements.leftSidebar;
            rightNotificationsSidebar = options.elements.rightNotificationsSidebar;
            resizerLeft = options.elements.resizerLeft;
            resizerRight = options.elements.resizerRight;
            minimizeBtn = options.elements.minimizeBtn;
            maximizeBtn = options.elements.maximizeBtn;
            restoreBtn = options.elements.restoreBtn;
            closeBtn = options.elements.closeBtn;
            settingsBtn = options.elements.settingsBtn;
            themeToggleBtn = options.elements.themeToggleBtn;
            digitalClockElement = options.elements.digitalClockElement;
            dateDisplayElement = options.elements.dateDisplayElement;
            notificationTitleElement = options.elements.notificationTitleElement;
            sidebarTabButtons = options.elements.sidebarTabButtons;
            sidebarTabContents = options.elements.sidebarTabContents;

            // Initialize all features
            setupTitleBarControls();
            initializeResizers();
            await initializeTheme();
            initializeDigitalClock();
            setupSidebarTabs();

            // Setup theme toggle button listener
            if (themeToggleBtn) {
                themeToggleBtn.addEventListener('click', () => {
                    const isCurrentlyDark = document.body.classList.contains('dark-theme');
                    const newTheme = isCurrentlyDark ? 'light' : 'dark';
                    
                    if (window.__TAURI__?.invoke) {
                        window.__TAURI__.invoke('set_theme', { theme: newTheme }).catch(err => {
                            console.error('[UIManager] 设置主题失败:', err);
                        });
                    } else {
                        console.warn('[UIManager] Tauri API 不可用，无法切换主题');
                    }
                });
            }

            //console.log('[UIManager] 初始化完成');
        },
        applyTheme: applyTheme,
        switchToTab: switchToTab
    };
})();

// Expose to window
window.uiManager = uiManager;
