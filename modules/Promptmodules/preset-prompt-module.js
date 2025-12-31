// Promptmodules/preset-prompt-module.js
// 临时与预制系统提示词模块

class PresetPromptModule {
    constructor(options) {
        this.agentId = options.agentId;
        this.config = options.config;
        this.tauriAPI = options.tauriAPI;
        
        this.textarea = null;
        this.presetSelect = null;
        this.presetPath = null;
        this.presets = [];
        
        // 缓存内容数据
        this.cachedContent = this.config.presetSystemPrompt || '';
        this.cachedSelectedPreset = this.config.selectedPreset || '';
        
        // 默认预设路径
        this.defaultPresetPath = './AppData/systemPromptPresets';
        this.loadPresetPath();
    }

    /**
     * 加载预设路径
     */
    async loadPresetPath() {
        this.presetPath = this.config.presetPromptPath || this.defaultPresetPath;
        await this.loadPresets();
    }

    /**
     * 加载预设列表
     */
    async loadPresets() {
        try {
            let result = null;
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                try {
                    result = await window.__TAURI__.invoke('load_preset_prompts', { path: this.presetPath });
                } catch (e) {
                    console.warn('load_preset_prompts invoke failed, falling back to tauriAPI.loadPresetPrompts', e);
                    result = this.tauriAPI && typeof this.tauriAPI.loadPresetPrompts === 'function' ? await this.tauriAPI.loadPresetPrompts(this.presetPath) : null;
                }
            } else if (this.tauriAPI && typeof this.tauriAPI.loadPresetPrompts === 'function') {
                result = await this.tauriAPI.loadPresetPrompts(this.presetPath);
            }
            if (result && result.success) {
                this.presets = result.presets || [];
            } else {
                // Silently handle missing presets - this is not critical
                this.presets = [];
            }
        } catch (error) {
            console.error('Error loading presets:', error);
            this.presets = [];
        }
    }

    /**
     * 渲染模块UI
     */
    async render(container) {
        container.innerHTML = '';
        container.className = 'preset-prompt-container';

        // 重新加载预设列表（修复初始化问题）
        await this.loadPresets();

        // 预设路径设置
        const pathSection = this.createPathSection();
        container.appendChild(pathSection);

        // 预设选择器
        const presetSection = this.createPresetSelector();
        container.appendChild(presetSection);

        // 内容编辑区
        const editorSection = this.createEditor();
        container.appendChild(editorSection);
    }

    /**
     * 创建路径设置区域
     */
    createPathSection() {
        const section = document.createElement('div');
        section.className = 'preset-path-section';

        const label = document.createElement('label');
        label.textContent = '预设文件夹路径:';
        section.appendChild(label);

        const pathContainer = document.createElement('div');
        pathContainer.className = 'path-input-container';

        const pathInput = document.createElement('input');
        pathInput.type = 'text';
        pathInput.className = 'preset-path-input';
        pathInput.value = this.presetPath || this.defaultPresetPath;
        pathInput.placeholder = '例如: ./AppData/systemPromptPresets';
        pathContainer.appendChild(pathInput);

        const browseBtn = document.createElement('button');
        browseBtn.type = 'button'; // 防止触发表单提交
        browseBtn.className = 'preset-browse-btn';
        browseBtn.textContent = '浏览...';
        browseBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                let result = null;
                if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                    try {
                        result = await window.__TAURI__.invoke('select_directory');
                    } catch (e) {
                        console.warn('select_directory invoke failed, falling back to tauriAPI.selectDirectory', e);
                        result = this.tauriAPI && typeof this.tauriAPI.selectDirectory === 'function' ? await this.tauriAPI.selectDirectory() : null;
                    }
                } else if (this.tauriAPI && typeof this.tauriAPI.selectDirectory === 'function') {
                    result = await this.tauriAPI.selectDirectory();
                }
                if (result && result.success && result.path) {
                    pathInput.value = result.path;
                    this.presetPath = result.path;
                    await this.savePresetPath();
                    await this.loadPresets();
                    this.updatePresetSelector();
                }
            } catch (err) {
                console.error('Error selecting directory:', err);
            }
        };
        pathContainer.appendChild(browseBtn);

        const refreshBtn = document.createElement('button');
        refreshBtn.type = 'button'; // 防止触发表单提交
        refreshBtn.className = 'preset-refresh-btn';
        refreshBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M13 3L3 3L3 13L13 13L13 3Z M8 11C6.34 11 5 9.66 5 8C5 6.34 6.34 5 8 5C9.66 5 11 6.34 11 8C11 9.66 9.66 11 8 11Z" fill="currentColor"/></svg>';
        refreshBtn.title = '刷新预设列表';
        refreshBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.presetPath = pathInput.value;
            await this.savePresetPath();
            await this.loadPresets();
            this.updatePresetSelector();
        };
        pathContainer.appendChild(refreshBtn);

        section.appendChild(pathContainer);
        return section;
    }

    /**
     * 创建预设选择器
     */
    createPresetSelector() {
        const section = document.createElement('div');
        section.className = 'preset-selector-section';

        const label = document.createElement('label');
        label.textContent = '选择预设:';
        section.appendChild(label);

        this.presetSelect = document.createElement('select');
        this.presetSelect.className = 'preset-select';
        
        // 添加默认选项
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '-- 不使用预设 --';
        this.presetSelect.appendChild(defaultOption);

        // 添加预设选项
        this.presets.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.path;
            option.textContent = preset.name;
            this.presetSelect.appendChild(option);
        });

        // 恢复之前选择的预设（使用缓存）
        if (this.cachedSelectedPreset) {
            this.presetSelect.value = this.cachedSelectedPreset;
        }

        this.presetSelect.onchange = async () => {
            await this.loadSelectedPreset();
            // 选择预设后自动触发保存
            if (window.settingsManager && typeof window.settingsManager.triggerAgentSave === 'function') {
                await window.settingsManager.triggerAgentSave();
            }
        };

        section.appendChild(this.presetSelect);
        return section;
    }

    /**
     * 更新预设选择器
     */
    updatePresetSelector() {
        if (!this.presetSelect) return;

        // 保存当前选择
        const currentValue = this.presetSelect.value;

        // 清空并重建选项
        this.presetSelect.innerHTML = '';

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '-- 不使用预设 --';
        this.presetSelect.appendChild(defaultOption);

        this.presets.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.path;
            option.textContent = preset.name;
            this.presetSelect.appendChild(option);
        });

        // 恢复选择
        this.presetSelect.value = currentValue;
    }

    /**
     * 创建编辑器
     */
    createEditor() {
        const section = document.createElement('div');
        section.className = 'preset-editor-section';

        const label = document.createElement('label');
        label.textContent = '系统提示词 (可使用 {{AgentName}} 占位符):';
        section.appendChild(label);

        this.textarea = document.createElement('textarea');
        this.textarea.className = 'prompt-textarea preset-prompt-textarea';
        this.textarea.placeholder = '请输入系统提示词或选择预设...';
        this.textarea.value = this.cachedContent;
        this.textarea.rows = 10;

        // 添加输入事件监听器
        this.textarea.addEventListener('input', () => {
            this.autoResize();
        });

        section.appendChild(this.textarea);

        // 使用setTimeout确保DOM渲染完成后再调整大小
        setTimeout(() => {
            this.autoResize();
        }, 0);

        return section;
    }

    /**
     * 自动调整文本域高度
     */
    autoResize() {
        if (!this.textarea) return;
        // 重置高度以获取正确的scrollHeight
        this.textarea.style.height = 'auto';
        // 设置最小高度
        const minHeight = 120;
        // 根据内容设置高度，但不小于最小高度
        const newHeight = Math.max(minHeight, this.textarea.scrollHeight);
        this.textarea.style.height = newHeight + 'px';
    }

    /**
     * 加载选中的预设
     */
    async loadSelectedPreset() {
        const presetPath = this.presetSelect.value;
        
        if (!presetPath) {
            // 不使用预设，清空内容
            if (this.textarea) {
                this.textarea.value = '';
                this.autoResize();
            }
            await this.save();
            return;
        }

        try {
            let result = null;
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                try {
                    result = await window.__TAURI__.invoke('load_preset_content', { path: presetPath });
                } catch (e) {
                    console.warn('load_preset_content invoke failed, falling back to tauriAPI.loadPresetContent', e);
                    result = this.tauriAPI && typeof this.tauriAPI.loadPresetContent === 'function' ? await this.tauriAPI.loadPresetContent(presetPath) : null;
                }
            } else if (this.tauriAPI && typeof this.tauriAPI.loadPresetContent === 'function') {
                result = await this.tauriAPI.loadPresetContent(presetPath);
            }

            if (result && result.success && this.textarea) {
                this.textarea.value = result.content || '';
                // 使用setTimeout确保内容已渲染
                setTimeout(() => {
                    this.autoResize();
                }, 0);
                await this.save();
            } else {
                console.error('Failed to load preset content:', result ? result.error : 'no result');
            }
        } catch (error) {
            console.error('Error loading preset content:', error);
        }
    }

    /**
     * 保存预设路径（仅更新内存，不写入文件）
     */
    async savePresetPath() {
        // 仅更新内存中的路径，不写入文件
        // 注意：配置保存应该在用户点击"保存"按钮时统一进行
    }

    /**
     * 保存数据（仅更新内存缓存，不写入文件）
     */
    async save() {
        if (!this.textarea) return;

        const content = this.textarea.value.trim();
        const selectedPreset = this.presetSelect ? this.presetSelect.value : '';

        // 更新缓存（仅内存，不写入文件）
        this.cachedContent = content;
        this.cachedSelectedPreset = selectedPreset;

        // 注意：不在这里调用 updateAgentConfig，配置保存应该在用户点击"保存"按钮时统一进行
    }

    /**
     * 获取提示词内容
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
        const selectedPreset = this.presetSelect ? this.presetSelect.value : '';
        return {
            presetSystemPrompt: content,
            selectedPreset: selectedPreset,
            presetPromptPath: this.presetPath
        };
    }
}

// 导出到全局
window.PresetPromptModule = PresetPromptModule;