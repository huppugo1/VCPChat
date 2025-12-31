// Promptmodules/original-prompt-module.js
// 原始富文本系统提示词模块

class OriginalPromptModule {
    constructor(options) {
        this.agentId = options.agentId;
        this.config = options.config;
        this.tauriAPI = options.tauriAPI;
        this.textarea = null;
        
        // 缓存内容数据
        this.cachedContent = this.config.originalSystemPrompt || this.config.systemPrompt || '';
    }

    /**
     * 渲染模块UI
     * @param {HTMLElement} container - 容器元素
     */
    render(container) {
        container.innerHTML = '';

        // 创建文本域
        this.textarea = document.createElement('textarea');
        this.textarea.className = 'prompt-textarea original-prompt-textarea';
        this.textarea.placeholder = '请输入系统提示词...';
        this.textarea.value = this.cachedContent;
        this.textarea.rows = 8;
        
        // 添加自动调整大小
        this.textarea.addEventListener('input', () => {
            this.autoResize();
        });

        container.appendChild(this.textarea);

        // 初始调整大小
        this.autoResize();
    }

    /**
     * 自动调整文本域高度
     */
    autoResize() {
        if (!this.textarea) return;
        this.textarea.style.height = 'auto';
        this.textarea.style.height = this.textarea.scrollHeight + 'px';
    }

    /**
     * 保存数据（仅更新内存缓存，不写入文件）
     */
    async save() {
        if (!this.textarea) return;

        const content = this.textarea.value.trim();
        
        // 更新缓存（仅内存，不写入文件）
        this.cachedContent = content;
        
        // 注意：不在这里调用 updateAgentConfig，配置保存应该在用户点击"保存"按钮时统一进行
    }

    /**
     * 获取提示词内容
     * @returns {string}
     */
    async getPrompt() {
        if (this.textarea) {
            return this.textarea.value.trim();
        }
        return this.cachedContent;
    }
    
    /**
     * 获取要保存到配置的数据（供外部调用）
     */
    getConfigData() {
        const content = this.textarea ? this.textarea.value.trim() : this.cachedContent;
        return {
            originalSystemPrompt: content
        };
    }
}

// 导出到全局
window.OriginalPromptModule = OriginalPromptModule;