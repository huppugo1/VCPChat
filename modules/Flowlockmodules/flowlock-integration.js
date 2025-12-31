// Flowlockmodules/flowlock-integration.js
// Flowlock模块集成脚本 - 负责初始化和事件监听

//console.log('[Flowlock Integration] Loading integration script...');

/**
 * 初始化Flowlock模块
 * 应在DOMContentLoaded后调用
 */
function initializeFlowlock() {
    //console.log('[Flowlock Integration] Initializing Flowlock module...');

    if (!window.flowlockManager) {
        console.error('[Flowlock Integration] flowlockManager not found on window object!');
        return;
    }

    // 获取handleContinueWriting函数的引用
    // 需要从event-listeners.js中导出或通过其他方式访问
    const handleContinueWriting = window.handleContinueWriting || function(prompt) {
        console.warn('[Flowlock Integration] handleContinueWriting not found, using fallback');
        // 调用续写逻辑
        if (window.tauriAPI && window.tauriAPI.triggerContinueWriting) {
            return window.tauriAPI.triggerContinueWriting(prompt);
        }
    };

    // 初始化flowlockManager
    // 注意：currentSelectedItem和currentTopicId在renderer.js中定义，通过window对象访问
    window.flowlockManager.initialize({
        tauriAPI: window.tauriAPI,
        uiHelper: window.uiHelperFunctions,
        currentSelectedItemRef: {
            get: () => {
                // 从renderer.js的作用域获取当前选中项
                // renderer.js已经将这些变量暴露到window对象
                return window.currentSelectedItem;
            }
        },
        currentTopicIdRef: {
            get: () => {
                // 从renderer.js的作用域获取当前话题ID
                return window.currentTopicId;
            }
        },
        handleContinueWriting: handleContinueWriting
    });

    //console.log('[Flowlock Integration] Flowlock module initialized successfully.');
}

/**
 * 设置右键和中键事件监听
 */
function setupFlowlockInteractions() {
    const chatNameElement = document.getElementById('currentChatAgentName');
    if (!chatNameElement) {
        console.warn('[Flowlock Integration] Chat name element not found.');
        return;
    }

    // 右键菜单 - 启动/停止心流锁
    chatNameElement.addEventListener('contextmenu', async (e) => {
        if (!window.flowlockManager) return;
        
        e.preventDefault();
        
        const state = window.flowlockManager.getState();
        const currentItem = window.currentSelectedItem;
        const currentTopic = window.currentTopicId;

        if (!currentItem || !currentItem.id || !currentTopic) {
            if (window.uiHelperFunctions && window.uiHelperFunctions.showToastNotification) {
                window.uiHelperFunctions.showToastNotification('请先选择一个Agent和话题', 'warning');
            }
            return;
        }

        // 如果已经激活，则停止心流锁
        if (state.isActive) {
            await window.flowlockManager.stop();
        } else {
            // 启动心流锁（不立即续写）
            await window.flowlockManager.start(currentItem.id, currentTopic, false);
        }
    });

    // 中键点击 - 启动并立即续写 / 停止
    chatNameElement.addEventListener('mousedown', async (e) => {
        if (e.button !== 1) return; // 只处理中键
        
        e.preventDefault();
        e.stopPropagation();

        if (!window.flowlockManager) return;

        const state = window.flowlockManager.getState();
        const currentItem = window.currentSelectedItem;
        const currentTopic = window.currentTopicId;

        if (state.isActive) {
            // 如果已激活，则停止
            await window.flowlockManager.stop();
        } else {
            // 如果未激活，则启动并立即续写
            if (!currentItem || !currentItem.id || !currentTopic) {
                if (window.uiHelperFunctions && window.uiHelperFunctions.showToastNotification) {
                    window.uiHelperFunctions.showToastNotification('请先选择一个Agent和话题', 'warning');
                }
                return;
            }

            // 启动心流锁
            await window.flowlockManager.start(currentItem.id, currentTopic, false);
            
            // 立即触发一次续写 - 直接模拟 Ctrl+D 快捷键
            //console.log('[Flowlock] Middle click: checking handleContinueWriting availability...');
            //console.log('[Flowlock] window.handleContinueWriting exists:', !!window.handleContinueWriting);
            
            if (window.handleContinueWriting && typeof window.handleContinueWriting === 'function') {
                //console.log('[Flowlock] Middle click: triggering immediate continue writing...');
                
                // 触发心跳动画
                const chatNameElement = document.getElementById('currentChatAgentName');
                if (chatNameElement) {
                    chatNameElement.classList.add('flowlock-heartbeat');
                    // 动画结束后移除类
                    setTimeout(() => {
                        chatNameElement.classList.remove('flowlock-heartbeat');
                    }, 800);
                }
                
                // 使用setTimeout确保在下一个事件循环中执行
                setTimeout(async () => {
                    try {
                        await window.handleContinueWriting('');
                        //console.log('[Flowlock] Immediate continue writing triggered successfully');
                    } catch (error) {
                        console.error('[Flowlock] Immediate continue writing failed:', error);
                        if (window.uiHelperFunctions && window.uiHelperFunctions.showToastNotification) {
                            window.uiHelperFunctions.showToastNotification('立即续写失败: ' + error.message, 'error');
                        }
                    }
                }, 300);
            } else {
                console.error('[Flowlock] handleContinueWriting not available!');
                if (window.uiHelperFunctions && window.uiHelperFunctions.showToastNotification) {
                    window.uiHelperFunctions.showToastNotification('续写功能未就绪', 'error');
                }
            }
        }
    });

    //console.log('[Flowlock Integration] Event listeners setup complete.');
}

/**
 * 设置快捷键监听
 */
function setupFlowlockShortcuts() {
    document.addEventListener('keydown', async (e) => {
        // Command/Ctrl + G - 启动心流锁并立即续写 / 停止心流锁
        if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
            e.preventDefault();
            
            if (!window.flowlockManager) return;
            
            const state = window.flowlockManager.getState();
            const currentItem = window.currentSelectedItem;
            const currentTopic = window.currentTopicId;
            
            if (state.isActive) {
                // 如果已激活，则停止
                await window.flowlockManager.stop();
            } else {
                // 如果未激活，则启动并立即触发续写
                if (!currentItem || !currentItem.id || !currentTopic) {
                    if (window.uiHelperFunctions && window.uiHelperFunctions.showToastNotification) {
                        window.uiHelperFunctions.showToastNotification('请先选择一个Agent和话题', 'warning');
                    }
                    return;
                }
                
                // 启动心流锁
                await window.flowlockManager.start(currentItem.id, currentTopic, false);
                
                // 立即触发一次续写 - 直接模拟 Ctrl+D 快捷键
                //console.log('[Flowlock] Ctrl/Cmd+G: checking handleContinueWriting availability...');
                //console.log('[Flowlock] window.handleContinueWriting exists:', !!window.handleContinueWriting);
                
                if (window.handleContinueWriting && typeof window.handleContinueWriting === 'function') {
                    //console.log('[Flowlock] Ctrl/Cmd+G: triggering immediate continue writing...');
                    
                    // 触发心跳动画
                    const chatNameElement = document.getElementById('currentChatAgentName');
                    if (chatNameElement) {
                        chatNameElement.classList.add('flowlock-heartbeat');
                        // 动画结束后移除类
                        setTimeout(() => {
                            chatNameElement.classList.remove('flowlock-heartbeat');
                        }, 800);
                    }
                    
                    // 使用setTimeout确保在下一个事件循环中执行
                    setTimeout(async () => {
                        try {
                            await window.handleContinueWriting('');
                            //console.log('[Flowlock] Ctrl/Cmd+G continue writing triggered successfully');
                        } catch (error) {
                            console.error('[Flowlock] Ctrl/Cmd+G continue writing failed:', error);
                            if (window.uiHelperFunctions && window.uiHelperFunctions.showToastNotification) {
                                window.uiHelperFunctions.showToastNotification('立即续写失败: ' + error.message, 'error');
                            }
                        }
                    }, 300);
                } else {
                    console.error('[Flowlock] handleContinueWriting not available!');
                    if (window.uiHelperFunctions && window.uiHelperFunctions.showToastNotification) {
                        window.uiHelperFunctions.showToastNotification('续写功能未就绪', 'error');
                    }
                }
            }
        }
    });

    //console.log('[Flowlock Integration] Shortcuts setup complete.');
}

/**
 * 监听VCP流事件，在消息完成后触发续写
 * 注意：实际的监听逻辑已经集成到 renderer.js 的 onVCPStreamEvent 中
 * 这个函数保留用于日志记录
 */
function setupFlowlockStreamListener() {
    // 流事件监听已经在 renderer.js 中的 onVCPStreamEvent 的 case 'end' 部分处理
    // 不需要在这里包装或修改 tauriAPI.onVCPStreamEvent
    //console.log('[Flowlock Integration] Stream listener already integrated in renderer.js');
}

/**
 * 主初始化函数
 */
function initializeFlowlockIntegration() {
    try {
        initializeFlowlock();
        setupFlowlockInteractions();
        setupFlowlockShortcuts();
        setupFlowlockStreamListener();
        
        //console.log('[Flowlock Integration] Full integration complete.');
    } catch (error) {
        console.error('[Flowlock Integration] Initialization failed:', error);
    }
}

// 导出到全局作用域
window.initializeFlowlockIntegration = initializeFlowlockIntegration;

//console.log('[Flowlock Integration] Integration script loaded.');