// Flowlockmodules/flowlock.js
// 心流锁模块 - 用于实现自动续写功能

//console.log('[Flowlock] Module loaded.');

class FlowlockManager {
    constructor() {
        this.isActive = false;
        this.currentAgentId = null;
        this.currentTopicId = null;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.isProcessing = false;
        this.customPrompt = null;
        this.customPrompter = null;
        
        // References to be injected
        this.tauriAPI = null;
        this.uiHelper = null;
        this.currentSelectedItemRef = null;
        this.currentTopicIdRef = null;
        this.handleContinueWriting = null;
    }

    /**
     * 初始化心流锁管理器
     * @param {Object} refs - 依赖引用
     */
    initialize(refs) {
        if (!refs.tauriAPI || !refs.uiHelper || !refs.currentSelectedItemRef || 
            !refs.currentTopicIdRef || !refs.handleContinueWriting) {
            console.error('[Flowlock] Initialization failed: Missing required references.');
            return;
        }

        this.tauriAPI = refs.tauriAPI;
        this.uiHelper = refs.uiHelper;
        this.currentSelectedItemRef = refs.currentSelectedItemRef;
        this.currentTopicIdRef = refs.currentTopicIdRef;
        this.handleContinueWriting = refs.handleContinueWriting;

        //console.log('[Flowlock] Initialized successfully.');

        // 监听续写完成事件
        this.setupEventListeners();
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 监听VCP流事件的结束
        if (this.tauriAPI && this.tauriAPI.onVCPStreamEvent) {
            // 注意：这里需要在renderer.js中正确触发心流锁的续写逻辑
            //console.log('[Flowlock] Event listeners setup complete.');
        }
    }

    /**
     * 启动心流锁
     * @param {string} agentId - Agent ID
     * @param {string} topicId - Topic ID
     * @param {boolean} startImmediately - 是否立即开始续写
     */
    async start(agentId, topicId, startImmediately = false) {
        if (this.isActive) {
            //console.log('[Flowlock] Already active.');
            return { success: false, message: '心流锁已经在运行中' };
        }

        this.isActive = true;
        this.currentAgentId = agentId;
        this.currentTopicId = topicId;
        this.retryCount = 0;
        this.isProcessing = false;

        //console.log(`[Flowlock] Started for agent: ${agentId}, topic: ${topicId}`);
        
        // 设置随机旋转方向
        this.setRandomRotation();
        
        // 更新UI状态 - 让标题发光
        this.updateUIGlowState(true);

        // 通知后端插件心流锁已启动
        if (this.tauriAPI.invokeDistributedPlugin) {
            try {
                await this.tauriAPI.invokeDistributedPlugin('Flowlock', 'start', {
                    agentId: agentId,
                    topicId: topicId
                });
            } catch (error) {
                console.warn('[Flowlock] Failed to notify backend plugin:', error);
            }
        }

        // 显示通知
        if (this.uiHelper && this.uiHelper.showToastNotification) {
            this.uiHelper.showToastNotification('心流锁已启动', 'success');
        }

        // 如果需要立即开始续写
        if (startImmediately) {
            setTimeout(() => this.triggerContinueWriting(), 500);
        }

        return { success: true, message: '心流锁已启动' };
    }

    /**
     * 停止心流锁
     */
    async stop() {
        if (!this.isActive) {
            //console.log('[Flowlock] Not active.');
            return { success: false, message: '心流锁未运行' };
        }

        this.isActive = false;
        this.isProcessing = false;
        this.retryCount = 0;
        this.customPrompt = null;
        this.customPrompter = null;

        //console.log('[Flowlock] Stopped.');

        // 更新UI状态 - 停止发光
        this.updateUIGlowState(false);

        // 通知后端插件心流锁已停止
        if (this.tauriAPI.invokeDistributedPlugin) {
            try {
                await this.tauriAPI.invokeDistributedPlugin('Flowlock', 'stop', {
                    agentId: this.currentAgentId,
                    topicId: this.currentTopicId
                });
            } catch (error) {
                console.warn('[Flowlock] Failed to notify backend plugin:', error);
            }
        }

        // 显示通知
        if (this.uiHelper && this.uiHelper.showToastNotification) {
            this.uiHelper.showToastNotification('心流锁已停止', 'info');
        }

        this.currentAgentId = null;
        this.currentTopicId = null;

        return { success: true, message: '心流锁已停止' };
    }

    /**
     * 设置自定义提示词
     * @param {string} prompt - 提示词内容
     */
    setCustomPrompt(prompt) {
        this.customPrompt = prompt;
        //console.log(`[Flowlock] Custom prompt set: ${prompt}`);
    }

    /**
     * 设置自定义提示词来源
     * @param {Function} prompter - 提示词生成函数
     */
    setCustomPrompter(prompter) {
        this.customPrompter = prompter;
        //console.log('[Flowlock] Custom prompter set.');
    }

    /**
     * 触发续写
     */
    async triggerContinueWriting() {
        if (!this.isActive) {
            //console.log('[Flowlock] Not active, skipping continue writing.');
            return;
        }

        if (this.isProcessing) {
            //console.log('[Flowlock] Already processing, skipping this trigger.');
            return;
        }

        // 检查当前上下文是否匹配
        const currentItem = this.currentSelectedItemRef ? this.currentSelectedItemRef.get() : null;
        const currentTopic = this.currentTopicIdRef ? this.currentTopicIdRef.get() : null;

        if (!currentItem || !currentTopic) {
            //console.log('[Flowlock] No active chat context.');
            await this.stop();
            return;
        }

        if (currentItem.id !== this.currentAgentId || currentTopic !== this.currentTopicId) {
            //console.log('[Flowlock] Chat context changed, stopping flowlock.');
            await this.stop();
            return;
        }

        this.isProcessing = true;

        try {
            // 获取提示词
            let prompt = '';
            if (this.customPrompter && typeof this.customPrompter === 'function') {
                prompt = await this.customPrompter();
            } else if (this.customPrompt) {
                prompt = this.customPrompt;
            }

            //console.log(`[Flowlock] Triggering continue writing with prompt: "${prompt}"`);

            // 调用续写函数
            if (this.handleContinueWriting) {
                await this.handleContinueWriting(prompt);
                // 重置重试计数
                this.retryCount = 0;
            } else {
                console.error('[Flowlock] handleContinueWriting function not available.');
                await this.stop();
            }

        } catch (error) {
            console.error('[Flowlock] Error during continue writing:', error);
            
            this.retryCount++;
            
            if (this.retryCount >= this.maxRetries) {
                console.error(`[Flowlock] Max retries (${this.maxRetries}) reached. Stopping flowlock.`);
                if (this.uiHelper && this.uiHelper.showToastNotification) {
                    this.uiHelper.showToastNotification('心流锁续写失败次数过多，已自动停止', 'error');
                }
                await this.stop();
            } else {
                //console.log(`[Flowlock] Retry ${this.retryCount}/${this.maxRetries}`);
                if (this.uiHelper && this.uiHelper.showToastNotification) {
                    this.uiHelper.showToastNotification(`心流锁续写失败，正在重试 (${this.retryCount}/${this.maxRetries})`, 'warning');
                }
                // 重试前等待一段时间
                setTimeout(() => {
                    this.isProcessing = false;
                    this.triggerContinueWriting();
                }, 2000);
            }
        }

        this.isProcessing = false;
    }

    /**
     * 监听消息完成事件并触发下一次续写
     * 应该在消息渲染完成后调用此方法
     */
    onMessageComplete() {
        if (!this.isActive || this.isProcessing) {
            return;
        }

        //console.log('[Flowlock] Message complete, scheduling next continue writing.');
        
        // 延迟一小段时间再触发下一次续写，避免过于频繁
        setTimeout(() => {
            this.triggerContinueWriting();
        }, 1000);
    }

    /**
     * 设置随机旋转方向
     */
    setRandomRotation() {
        const chatNameElement = document.getElementById('currentChatAgentName');
        if (!chatNameElement) {
            console.warn('[Flowlock] Chat name element not found for rotation.');
            return;
        }
        
        // 随机选择顺时针(1)或逆时针(-1)
        const direction = Math.random() < 0.5 ? 1 : -1;
        chatNameElement.style.setProperty('--flowlock-rotate-direction', direction);
        
        // 为心跳动画也设置随机旋转
        const heartbeatRotate = Math.random() < 0.5 ? 1 : -1;
        chatNameElement.style.setProperty('--flowlock-heartbeat-rotate', heartbeatRotate);
        
        //console.log(`[Flowlock] Random rotation set: wave=${direction > 0 ? 'clockwise' : 'counter-clockwise'}, heartbeat=${heartbeatRotate > 0 ? 'clockwise' : 'counter-clockwise'}`);
    }

    /**
     * 更新UI发光状态
     * @param {boolean} shouldGlow - 是否应该发光
     */
    updateUIGlowState(shouldGlow) {
        const chatNameElement = document.getElementById('currentChatAgentName');
        if (!chatNameElement) {
            console.warn('[Flowlock] Chat name element not found.');
            return;
        }

        if (shouldGlow) {
            chatNameElement.classList.add('flowlock-active');
            
            // 添加播放中的emoji
            this.addPlayingEmoji(chatNameElement);
        } else {
            chatNameElement.classList.remove('flowlock-active');
            
            // 移除播放emoji
            this.removePlayingEmoji(chatNameElement);
            
            // 清除旋转CSS变量
            chatNameElement.style.removeProperty('--flowlock-rotate-direction');
            chatNameElement.style.removeProperty('--flowlock-heartbeat-rotate');
        }

        //console.log(`[Flowlock] UI glow state updated: ${shouldGlow}`);
    }
    
    /**
     * 添加播放中的emoji指示器
     * @param {HTMLElement} element - 目标元素
     */
    addPlayingEmoji(element) {
        // 检查是否已存在
        if (element.querySelector('.flowlock-playing-emoji')) {
            return;
        }
        
        // 创建emoji元素
        const emojiSpan = document.createElement('span');
        emojiSpan.className = 'flowlock-playing-emoji';
        emojiSpan.textContent = ' ▶️'; // 播放emoji
        emojiSpan.style.marginLeft = '8px';
        emojiSpan.style.fontSize = '0.9em';
        emojiSpan.style.verticalAlign = 'middle';
        
        // 设置随机运动参数
        this.setRandomEmojiMotion(emojiSpan);
        
        // 添加到元素末尾
        element.appendChild(emojiSpan);
        
        //console.log('[Flowlock] Playing emoji added with random motion');
    }
    
    /**
     * 为emoji设置随机运动参数
     * @param {HTMLElement} emojiElement - emoji元素
     */
    setRandomEmojiMotion(emojiElement) {
        // 随机持续时间 (2.5-4秒)
        const duration = 2.5 + Math.random() * 1.5;
        emojiElement.style.setProperty('--emoji-float-duration', `${duration}s`);
        
        // 随机X轴移动 (-4到4像素)
        const moveX1 = Math.floor(Math.random() * 8) - 4;
        const moveX2 = Math.floor(Math.random() * 8) - 4;
        const moveX3 = Math.floor(Math.random() * 8) - 4;
        emojiElement.style.setProperty('--emoji-move-x1', moveX1);
        emojiElement.style.setProperty('--emoji-move-x2', moveX2);
        emojiElement.style.setProperty('--emoji-move-x3', moveX3);
        
        // 随机Y轴移动 (-4到4像素)
        const moveY1 = Math.floor(Math.random() * 8) - 4;
        const moveY2 = Math.floor(Math.random() * 8) - 4;
        const moveY3 = Math.floor(Math.random() * 8) - 4;
        emojiElement.style.setProperty('--emoji-move-y1', moveY1);
        emojiElement.style.setProperty('--emoji-move-y2', moveY2);
        emojiElement.style.setProperty('--emoji-move-y3', moveY3);
        
        // 随机旋转角度 (-8到8度)
        const rotate1 = Math.floor(Math.random() * 16) - 8;
        const rotate2 = Math.floor(Math.random() * 16) - 8;
        const rotate3 = Math.floor(Math.random() * 16) - 8;
        emojiElement.style.setProperty('--emoji-rotate1', rotate1);
        emojiElement.style.setProperty('--emoji-rotate2', rotate2);
        emojiElement.style.setProperty('--emoji-rotate3', rotate3);
        
        //console.log(`[Flowlock] Emoji motion params: duration=${duration.toFixed(2)}s, x=[${moveX1},${moveX2},${moveX3}], y=[${moveY1},${moveY2},${moveY3}], rotate=[${rotate1},${rotate2},${rotate3}]`);
    }
    
    /**
     * 移除播放emoji指示器
     * @param {HTMLElement} element - 目标元素
     */
    removePlayingEmoji(element) {
        const emojiSpan = element.querySelector('.flowlock-playing-emoji');
        if (emojiSpan) {
            emojiSpan.remove();
            //console.log('[Flowlock] Playing emoji removed');
        }
    }

    /**
     * 获取当前状态
     */
    getState() {
        return {
            isActive: this.isActive,
            isProcessing: this.isProcessing,
            currentAgentId: this.currentAgentId,
            currentTopicId: this.currentTopicId,
            retryCount: this.retryCount,
            hasCustomPrompt: !!this.customPrompt,
            hasCustomPrompter: !!this.customPrompter
        };
    }
}

// 创建全局单例
const flowlockManager = new FlowlockManager();

// 导出到window对象供其他模块使用
window.flowlockManager = flowlockManager;

//console.log('[Flowlock] Manager instance created and exposed globally.');