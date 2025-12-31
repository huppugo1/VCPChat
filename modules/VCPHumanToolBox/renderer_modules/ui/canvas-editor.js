
// renderer_modules/ui/canvas-editor.js

// --- 画板编辑器功能 ---

// DataURL 转 Blob 工具函数
export function dataURLToBlob(dataURL) {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

// 打开画板编辑器
export function openCanvasEditor(backgroundImageSrc, onComplete) {
    //console.log('[画板编辑器] 开始创建模态框');
    try {
        const modal = createCanvasEditorModal(backgroundImageSrc, onComplete);
        document.body.appendChild(modal);
        
        // 禁用背景滚动
        document.body.style.overflow = 'hidden';
        
        // 显示模态框
        setTimeout(() => {
            modal.classList.add('show');
            //console.log('[画板编辑器] 模态框显示完成');
        }, 50);
    } catch (error) {
        console.error('[画板编辑器] 创建失败:', error);
        throw error;
    }
}

// 创建画板编辑器模态框
function createCanvasEditorModal(backgroundImageSrc, onComplete) {
    //console.log('[画板编辑器] 开始创建模态框元素');
    const modal = document.createElement('div');
    modal.className = 'canvas-editor-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    
    const editorContainer = document.createElement('div');
    editorContainer.className = 'canvas-editor-container';
    editorContainer.style.cssText = `
        background: var(--card-bg);
        border-radius: 12px;
        padding: 20px;
        max-width: 98vw;
        max-height: 98vh;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        border: 1px solid var(--border-color);
        display: flex;
        flex-direction: column;
    `;
    
    // 标题和关闭按钮
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 15px;
        border-bottom: 1px solid var(--border-color);
    `;
    
    const title = document.createElement('h3');
    title.textContent = backgroundImageSrc ? '🖼️ 幕布编辑' : '🎨 空白画板';
    title.style.cssText = `
        margin: 0;
        color: var(--primary-text);
        font-size: 18px;
        font-weight: 600;
    `;
    
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '✕';
    closeButton.style.cssText = `
        background: none;
        border: none;
        font-size: 20px;
        color: var(--secondary-text);
        cursor: pointer;
        padding: 5px;
        border-radius: 4px;
        transition: all 0.2s ease;
    `;
    
    header.appendChild(title);
    header.appendChild(closeButton);
    
    // 工具栏
    const toolbar = createCanvasToolbar();
    
    // 画板区域容器
    const canvasContainer = document.createElement('div');
    canvasContainer.style.cssText = `
        display: flex;
        justify-content: flex-start;
        align-items: flex-start;
        margin: 20px 0;
        border: 2px dashed var(--border-color);
        border-radius: 8px;
        padding: 20px;
        background: #f8f9fa;
        overflow: auto;
        max-width: 100%;
        max-height: 70vh;
        position: relative;
        width: 100%;
    `;
    
    // 创建画布 - 根据模式决定尺寸和处理方式
    const canvas = document.createElement('canvas');
    
    if (backgroundImageSrc) {
        // 幕布编辑模式：使用图片原始大小，不进行缩放
        const tempImg = new Image();
        tempImg.onload = function() {
            // 直接使用原图尺寸，不进行任何缩放
            const originalWidth = tempImg.width;
            const originalHeight = tempImg.height;
            
            // 设置画布尺寸为原图尺寸
            canvas.width = originalWidth;
            canvas.height = originalHeight;
            canvas.style.cssText = `
                border: 2px solid #3b82f6;
                border-radius: 8px;
                cursor: crosshair;
                background: white;
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
                display: block;
                flex-shrink: 0;
            `;
            
            // 立即加载并绘制背景图片
            const ctx = canvas.getContext('2d');
            ctx.drawImage(tempImg, 0, 0, originalWidth, originalHeight);
            
            // 存储编辑相关信息
            canvas.dataset.isCanvasEditor = 'true';
            canvas.dataset.originalWidth = originalWidth;
            canvas.dataset.originalHeight = originalHeight;
            
            //console.log(`[幕布编辑] 使用原始尺寸: ${originalWidth}x${originalHeight}`);
            
            // 初始化编辑器（延迟执行以确保画布已完全设置）
            setTimeout(() => {
                if (modal.canvasEditor) {
                    modal.canvasEditor.initializeForImageEditing(tempImg, originalWidth, originalHeight);
                }
            }, 50);
        };
        tempImg.src = backgroundImageSrc;
    } else {
        // 空白画板模式：显示分辨率选择器
        showCanvasSizeSelector(canvas, canvasContainer);
    }
    
    canvasContainer.appendChild(canvas);
    
    // 操作按钮
    const actionButtons = createCanvasActionButtons();
    
    editorContainer.appendChild(header);
    editorContainer.appendChild(toolbar);
    editorContainer.appendChild(canvasContainer);
    editorContainer.appendChild(actionButtons);
    modal.appendChild(editorContainer);
    
    // 初始化画板功能
    const canvasEditor = new CanvasEditor(canvas, toolbar, backgroundImageSrc);
    modal.canvasEditor = canvasEditor; // 将编辑器实例保存到模态框上
    
    // 事件绑定
    closeButton.addEventListener('click', () => {
        closeCanvasEditor(modal);
    });
    
    actionButtons.querySelector('.save-btn').addEventListener('click', () => {
        // 保持原图品质，避免过度压缩
        let quality = 1.0; // 使用最高质量
        let format = 'image/png'; // 默认使用PNG格式保持无损压缩
        
        // 只有在图像非常大时才考虑使用JPEG格式，并使用较高的质量
        const canvasArea = canvas.width * canvas.height;
        if (canvasArea > 4147200) { // 大于2048x2048时才使用JPEG
            format = 'image/jpeg';
            quality = 0.95; // 使用高质量JPEG
        }
        
        const dataUrl = canvas.toDataURL(format, quality);
        onComplete(dataUrl);
        closeCanvasEditor(modal);
    });
    
    actionButtons.querySelector('.copy-btn').addEventListener('click', async () => {
        try {
            await copyCanvasToClipboard(canvas);
            showCanvasNotification('✅ 已复制到剪切板', 'success');
        } catch (error) {
            console.error('复制到剪切板失败:', error);
            showCanvasNotification('❌ 复制失败，请检查浏览器支持', 'error');
        }
    });
    
    actionButtons.querySelector('.undo-btn').addEventListener('click', () => {
        canvasEditor.undo();
    });
    
    actionButtons.querySelector('.redo-btn').addEventListener('click', () => {
        canvasEditor.redo();
    });
    
    actionButtons.querySelector('.reset-btn').addEventListener('click', async () => {
        const confirmed = await window.customConfirm(
            '确定要复原到最初始状态吗？这将清除所有编辑内容。',
            '⚠️ 重置画布'
        );
        if (confirmed) {
            canvasEditor.resetToOriginal();
        }
    });
    
    // ESC 键关闭
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            closeCanvasEditor(modal);
        }
    };
    document.addEventListener('keydown', handleEsc);
    modal.dataset.escHandler = 'true';
    
    return modal;
}

// 关闭画板编辑器
function closeCanvasEditor(modal) {
    // 清理画板编辑器
    const canvasEditor = modal.canvasEditor;
    if (canvasEditor) {
        canvasEditor.cleanup();
    }
    
    modal.classList.remove('show');
    document.body.style.overflow = '';
    
    setTimeout(() => {
        if (modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
        // 移除 ESC 事件监听
        if (modal.dataset.escHandler) {
            const handleEsc = (e) => {
                if (e.key === 'Escape') {
                    closeCanvasEditor(modal);
                }
            };
            document.removeEventListener('keydown', handleEsc);
        }
    }, 300);
}

// 创建工具栏
function createCanvasToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'canvas-toolbar';
    toolbar.style.cssText = `
        display: flex;
        gap: 15px;
        padding: 15px;
        background: var(--input-bg);
        border-radius: 8px;
        border: 1px solid var(--border-color);
        flex-wrap: wrap;
        align-items: center;
    `;
    
    // 工具选择
    const toolsGroup = document.createElement('div');
    toolsGroup.innerHTML = `
        <label style="color: var(--secondary-text); font-weight: 500; margin-right: 10px;">工具：</label>
        <select class="tool-select" style="padding: 6px 12px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--card-bg); color: var(--primary-text);">
            <option value="brush">🖌 画笔</option>
            <option value="line">− 直线</option>
            <option value="arrow">→ 箭头</option>
            <option value="rectangle">□ 方框</option>
            <option value="text">🅰️ 文字</option>
        </select>
    `;
    
    // 颜色选择
    const colorGroup = document.createElement('div');
    colorGroup.innerHTML = `
        <label style="color: var(--secondary-text); font-weight: 500; margin-right: 10px;">颜色：</label>
        <div style="display: flex; align-items: center; gap: 8px;">
            <div class="color-presets" style="display: flex; gap: 4px; margin-right: 8px;">
                <button class="color-preset" data-color="#ff0000" style="width: 24px; height: 24px; background: #ff0000; border: 2px solid #fff; border-radius: 4px; cursor: pointer; box-shadow: 0 0 0 1px #ccc;" title="红色"></button>
                <button class="color-preset" data-color="#00ff00" style="width: 24px; height: 24px; background: #00ff00; border: 2px solid #fff; border-radius: 4px; cursor: pointer; box-shadow: 0 0 0 1px #ccc;" title="绿色"></button>
                <button class="color-preset" data-color="#0000ff" style="width: 24px; height: 24px; background: #0000ff; border: 2px solid #fff; border-radius: 4px; cursor: pointer; box-shadow: 0 0 0 1px #ccc;" title="蓝色"></button>
                <button class="color-preset" data-color="#ffff00" style="width: 24px; height: 24px; background: #ffff00; border: 2px solid #fff; border-radius: 4px; cursor: pointer; box-shadow: 0 0 0 1px #ccc;" title="黄色"></button>
                <button class="color-preset" data-color="#ff00ff" style="width: 24px; height: 24px; background: #ff00ff; border: 2px solid #fff; border-radius: 4px; cursor: pointer; box-shadow: 0 0 0 1px #ccc;" title="紫色"></button>
                <button class="color-preset" data-color="#000000" style="width: 24px; height: 24px; background: #000000; border: 2px solid #fff; border-radius: 4px; cursor: pointer; box-shadow: 0 0 0 1px #ccc;" title="黑色"></button>
            </div>
            <input type="color" class="color-picker" value="#ff0000" style="width: 40px; height: 30px; border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer;">
            <input type="text" class="color-hex-input" value="#FF0000" placeholder="#FF0000" style="width: 80px; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 4px; font-family: monospace; text-transform: uppercase;">
        </div>
    `;
    
    // 线条粗细
    const sizeGroup = document.createElement('div');
    sizeGroup.innerHTML = `
        <label style="color: var(--secondary-text); font-weight: 500; margin-right: 10px;">粗细：</label>
        <input type="range" class="size-slider" min="1" max="20" value="3" style="width: 100px;">
        <span class="size-display" style="color: var(--primary-text); margin-left: 8px; font-weight: 500;">3px</span>
    `;
    
    // 文字大小（仅文字工具可见）
    const textSizeGroup = document.createElement('div');
    textSizeGroup.className = 'text-size-group';
    textSizeGroup.style.display = 'none';
    textSizeGroup.innerHTML = `
        <label style="color: var(--secondary-text); font-weight: 500; margin-right: 10px;">字号：</label>
        <input type="range" class="text-size-slider" min="12" max="48" value="16" style="width: 100px;">
        <span class="text-size-display" style="color: var(--primary-text); margin-left: 8px; font-weight: 500;">16px</span>
    `;
    
    toolbar.appendChild(toolsGroup);
    toolbar.appendChild(colorGroup);
    toolbar.appendChild(sizeGroup);
    toolbar.appendChild(textSizeGroup);
    
    // 工具切换事件
    const toolSelect = toolbar.querySelector('.tool-select');
    const textSizeGroupElement = toolbar.querySelector('.text-size-group');
    
    toolSelect.addEventListener('change', (e) => {
        if (e.target.value === 'text') {
            textSizeGroupElement.style.display = 'flex';
            textSizeGroupElement.style.alignItems = 'center';
            textSizeGroupElement.style.gap = '8px';
        } else {
            textSizeGroupElement.style.display = 'none';
        }
    });
    
    // 粗细滑块事件
    const sizeSlider = toolbar.querySelector('.size-slider');
    const sizeDisplay = toolbar.querySelector('.size-display');
    sizeSlider.addEventListener('input', (e) => {
        sizeDisplay.textContent = e.target.value + 'px';
    });
    
    // 文字大小滑块事件
    const textSizeSlider = toolbar.querySelector('.text-size-slider');
    const textSizeDisplay = toolbar.querySelector('.text-size-display');
    textSizeSlider.addEventListener('input', (e) => {
        textSizeDisplay.textContent = e.target.value + 'px';
    });
    
    // 颜色相关事件监听
    const colorPicker = toolbar.querySelector('.color-picker');
    const colorHexInput = toolbar.querySelector('.color-hex-input');
    const colorPresets = toolbar.querySelectorAll('.color-preset');
    
    // 颜色选择器事件
    colorPicker.addEventListener('change', () => {
        colorHexInput.value = colorPicker.value.toUpperCase();
        updateColorPresetSelection(colorPicker.value, colorPresets);
    });
    
    // HEX 输入框事件
    colorHexInput.addEventListener('input', () => {
        let hex = colorHexInput.value.trim();
        if (hex.startsWith('#') && (hex.length === 4 || hex.length === 7)) {
            colorPicker.value = hex;
            updateColorPresetSelection(hex, colorPresets);
        }
    });
    
    colorHexInput.addEventListener('blur', () => {
        let hex = colorHexInput.value.trim();
        if (!hex.startsWith('#')) {
            hex = '#' + hex;
        }
        
        // 验证 HEX 格式
        const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
        if (hexRegex.test(hex)) {
            colorPicker.value = hex;
            colorHexInput.value = hex.toUpperCase();
            updateColorPresetSelection(hex, colorPresets);
        } else {
            // 恢复到当前颜色选择器的值
            colorHexInput.value = colorPicker.value.toUpperCase();
        }
    });
    
    // 颜色预设按钮事件
    colorPresets.forEach(preset => {
        preset.addEventListener('click', () => {
            const color = preset.dataset.color;
            colorPicker.value = color;
            colorHexInput.value = color.toUpperCase();
            updateColorPresetSelection(color, colorPresets);
        });
    });
    
    // 默认选中红色
    updateColorPresetSelection('#ff0000', colorPresets);
    
    // 颜色预设选中状态更新函数
    function updateColorPresetSelection(color, presets) {
        presets.forEach(p => p.style.boxShadow = '0 0 0 1px #ccc');
        const matchingPreset = Array.from(presets).find(p => p.dataset.color.toLowerCase() === color.toLowerCase());
        if (matchingPreset) {
            matchingPreset.style.boxShadow = '0 0 0 2px #3b82f6';
        }
    }
    
    return toolbar;
}

// 创建操作按钮
function createCanvasActionButtons() {
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        gap: 15px;
        justify-content: center;
        margin-top: 20px;
    `;
    
    const saveButton = document.createElement('button');
    saveButton.className = 'save-btn';
    saveButton.innerHTML = '✓ 保存';
    saveButton.style.cssText = `
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.3s ease;
        box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
    `;
    
    const copyButton = document.createElement('button');
    copyButton.className = 'copy-btn';
    copyButton.innerHTML = '📋 复制到剪切板';
    copyButton.style.cssText = `
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.3s ease;
        box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
    `;
    
    const undoButton = document.createElement('button');
    undoButton.className = 'undo-btn';
    undoButton.innerHTML = '↶ 撤销';
    undoButton.style.cssText = `
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.3s ease;
        box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
    `;
    
    const redoButton = document.createElement('button');
    redoButton.className = 'redo-btn';
    redoButton.innerHTML = '↷ 重做';
    redoButton.style.cssText = `
        background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.3s ease;
        box-shadow: 0 2px 8px rgba(6, 182, 212, 0.3);
    `;
    
    const resetButton = document.createElement('button');
    resetButton.className = 'reset-btn';
    resetButton.innerHTML = '🔄 复原';
    resetButton.style.cssText = `
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.3s ease;
        box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
    `;
    resetButton.title = '恢复到最初始状态，清除所有编辑';
    
    buttonContainer.appendChild(saveButton);
    buttonContainer.appendChild(copyButton);
    buttonContainer.appendChild(undoButton);
    buttonContainer.appendChild(redoButton);
    buttonContainer.appendChild(resetButton);
    
    return buttonContainer;
}

// 显示画布尺寸选择器
function showCanvasSizeSelector(canvas, canvasContainer) {
    const sizeSelector = document.createElement('div');
    sizeSelector.className = 'canvas-size-selector';
    sizeSelector.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 15px;
        padding: 20px;
        background: var(--card-bg);
        border: 2px dashed var(--border-color);
        border-radius: 8px;
        min-width: 400px;
    `;
    
    const title = document.createElement('h4');
    title.textContent = '🎨 选择画布尺寸';
    title.style.cssText = `
        margin: 0 0 15px 0;
        color: rgba(0, 0, 0, 0.9);
        font-size: 16px;
        font-weight: 600;
    `;
    
    // 预设尺寸选项
    const presetsContainer = document.createElement('div');
    presetsContainer.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 10px;
        width: 100%;
        margin-bottom: 15px;
    `;
    
    const presets = [
        { name: '默认', width: 600, height: 400, desc: '600×400' },
        { name: 'HD', width: 1280, height: 720, desc: '1280×720' },
        { name: 'Full HD', width: 1920, height: 1080, desc: '1920×1080' },
        { name: '4K', width: 3840, height: 2160, desc: '3840×2160' },
        { name: 'A4', width: 2480, height: 3508, desc: '2480×3508 (300dpi)' },
        { name: '正方形', width: 800, height: 800, desc: '800×800' },
        { name: '手机竖屏', width: 1080, height: 1920, desc: '1080×1920' },
        { name: '微信封面', width: 900, height: 500, desc: '900×500' }
    ];
    
    presets.forEach(preset => {
        const button = document.createElement('button');
        button.innerHTML = `<strong style="color: rgba(0, 0, 0, 0.85);">${preset.name}</strong><br><small style="color: rgba(0, 0, 0, 0.8);">${preset.desc}</small>`;
        button.style.cssText = `
            padding: 12px 8px;
            border: 2px solid var(--border-color);
            background: var(--card-bg);
            color: rgba(0, 0, 0, 0.8);
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            text-align: center;
            transition: all 0.2s ease;
            min-height: 60px;
        `;
        
        button.addEventListener('mouseenter', () => {
            button.style.borderColor = 'var(--primary-color)';
            button.style.background = 'var(--hover-bg, rgba(59, 130, 246, 0.1))';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.borderColor = 'var(--border-color)';
            button.style.background = 'var(--card-bg)';
        });
        
        button.addEventListener('click', () => {
            createCanvasWithSize(canvas, preset.width, preset.height, sizeSelector, canvasContainer);
        });
        
        presetsContainer.appendChild(button);
    });
    
    // 自定义尺寸输入
    const customContainer = document.createElement('div');
    customContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: center;
    `;
    
    const customLabel = document.createElement('label');
    customLabel.textContent = '自定义：';
    customLabel.style.cssText = `
        color: rgba(0, 0, 0, 0.85);
        font-weight: 600;
    `;
    
    const widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.placeholder = '宽度';
    widthInput.value = '800';
    widthInput.min = '100';
    widthInput.max = '10000';
    widthInput.style.cssText = `
        width: 80px;
        padding: 6px 8px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        background: var(--input-bg);
        color: var(--primary-text);
    `;
    
    const xLabel = document.createElement('span');
    xLabel.textContent = '×';
    xLabel.style.cssText = `
        color: rgba(0, 0, 0, 0.8);
        font-weight: 600;
        font-size: 16px;
    `;
    
    const heightInput = document.createElement('input');
    heightInput.type = 'number';
    heightInput.placeholder = '高度';
    heightInput.value = '600';
    heightInput.min = '100';
    heightInput.max = '10000';
    heightInput.style.cssText = widthInput.style.cssText;
    
    const dpiLabel = document.createElement('label');
    dpiLabel.textContent = 'DPI:';
    dpiLabel.style.cssText = `
        color: rgba(0, 0, 0, 0.85);
        font-weight: 600;
        margin-left: 10px;
    `;
    
    const dpiInput = document.createElement('input');
    dpiInput.type = 'number';
    dpiInput.value = '72';
    dpiInput.min = '72';
    dpiInput.max = '600';
    dpiInput.style.cssText = `
        width: 60px;
        padding: 6px 8px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        background: var(--input-bg);
        color: var(--primary-text);
    `;
    
    const createButton = document.createElement('button');
    createButton.textContent = '创建画布';
    createButton.style.cssText = `
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        margin-left: 10px;
    `;
    
    createButton.addEventListener('click', () => {
        const width = parseInt(widthInput.value) || 800;
        const height = parseInt(heightInput.value) || 600;
        const dpi = parseInt(dpiInput.value) || 72;
        
        // DPI 转换（参考用，不影响实际像素尺寸）
        canvas.dataset.dpi = dpi;
        
        createCanvasWithSize(canvas, width, height, sizeSelector, canvasContainer);
    });
    
    customContainer.appendChild(customLabel);
    customContainer.appendChild(widthInput);
    customContainer.appendChild(xLabel);
    customContainer.appendChild(heightInput);
    customContainer.appendChild(dpiLabel);
    customContainer.appendChild(dpiInput);
    customContainer.appendChild(createButton);
    
    sizeSelector.appendChild(title);
    sizeSelector.appendChild(presetsContainer);
    sizeSelector.appendChild(customContainer);
    
    canvasContainer.appendChild(sizeSelector);
}

// 创建指定尺寸的画布
function createCanvasWithSize(canvas, width, height, sizeSelector, canvasContainer) {
    canvas.width = width;
    canvas.height = height;
    canvas.style.cssText = `
        border: 1px solid var(--border-color);
        border-radius: 4px;
        cursor: crosshair;
        background: white;
        display: block;
        flex-shrink: 0;
    `;
    canvas.dataset.isCanvasEditor = 'true';
    
    // 获取画布编辑器实例并更新预览画布尺寸
    const modal = canvas.closest('.canvas-editor-modal');
    if (modal && modal.canvasEditor) {
        modal.canvasEditor.updateCanvasSize(width, height);
    }
    
    // 移除选择器，显示画布
    sizeSelector.remove();
    canvasContainer.appendChild(canvas);
    
    //console.log(`[空白画板] 创建画布: ${width}x${height}px`);
}

// 画板编辑器类
class CanvasEditor {
    constructor(canvas, toolbar, backgroundImageSrc) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.toolbar = toolbar;
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
        this.currentPath = [];
        this.backgroundImageSrc = backgroundImageSrc;
        this.activeTextInput = null;
        this.isImageEditingMode = !!backgroundImageSrc; // 标记是否为幕布编辑模式
        
        // 初始化历史记录系统
        this.history = [];
        this.historyStep = -1;
        this.maxHistorySize = 50;
        
        // 创建预览画布
        this.previewCanvas = document.createElement('canvas');
        this.previewCanvas.width = canvas.width;
        this.previewCanvas.height = canvas.height;
        this.previewCtx = this.previewCanvas.getContext('2d');
        
        this.init();
        
        // 如果是空白画板模式，立即保存初始状态
        if (!backgroundImageSrc) {
            this.saveState();
        }
    }
    
    // 专门为幕布编辑模式初始化
    initializeForImageEditing(originalImage, displayWidth, displayHeight) {
        //console.log('[幕布编辑] 初始化图片编辑模式（原始尺寸）');
        
        // 移除编辑范围限制，允许在整个画布上编辑
        
        // 更新预览画布尺寸为原始尺寸
        this.previewCanvas.width = displayWidth;
        this.previewCanvas.height = displayHeight;
        
        // 保存原始图片数据（用于“仅清除编辑痕迹”和“复原”功能）
        this.originalImageData = this.ctx.getImageData(0, 0, displayWidth, displayHeight);
        this.originalImage = originalImage;
        this.displayWidth = displayWidth;
        this.displayHeight = displayHeight;
        
        // 保存初始状态
        this.saveState();
        
        //console.log(`[幕布编辑] 初始化完成 - 全画布可编辑: ${displayWidth}x${displayHeight} (原始尺寸)`);
    }
    
    init() {
        // 绑定事件
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));
        this.canvas.addEventListener('click', this.handleCanvasClick.bind(this));
        
        // 禁止右键菜单
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // 键盘事件监听（用于文字输入）
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
    }
    
    // 更新画布尺寸（用于空白画布创建后的尺寸同步）
    updateCanvasSize(width, height) {
        // 更新预览画布尺寸
        this.previewCanvas.width = width;
        this.previewCanvas.height = height;
        
        // 清空历史记录并保存初始状态
        this.history = [];
        this.historyStep = -1;
        this.saveState();
        
        //console.log(`[画布编辑器] 更新尺寸: ${width}x${height}px`);
    }
    
    saveState() {
        this.historyStep++;
        if (this.historyStep < this.history.length) {
            this.history.length = this.historyStep;
        }
        this.history.push(this.canvas.toDataURL());
        
        // 限制历史记录数量
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
            this.historyStep--;
        }
    }
    
    undo() {
        if (this.historyStep > 0) {
            this.historyStep--;
            this.restoreState(this.history[this.historyStep]);
        }
    }
    
    redo() {
        if (this.historyStep < this.history.length - 1) {
            this.historyStep++;
            this.restoreState(this.history[this.historyStep]);
        }
    }
    
    restoreState(dataURL) {
        const img = new Image();
        img.onload = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);
        };
        img.src = dataURL;
    }
    
    loadBackgroundImage(imageSrc) {
        // 这个方法现在仅用于兼容性，实际的幕布编辑初始化由 initializeForImageEditing 处理
        if (!this.isImageEditingMode) {
            console.warn('[警告] loadBackgroundImage 被调用，但当前不是幕布编辑模式');
            return;
        }
        
        const img = new Image();
        img.onload = () => {
            // 清空画板
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            
            // 绘制背景图片
            this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
            
            // 保存原始图片数据
            this.originalImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            this.backgroundImageSrc = imageSrc;
            
            // 移除编辑边界限制，允许在整个画布上编辑
            
            this.saveState();
            //console.log(`[幕布编辑] 背景图片加载完成，编辑区域: ${this.canvas.width}x${this.canvas.height}`);
        };
        img.src = imageSrc;
    }
    
    getCurrentTool() {
        return this.toolbar.querySelector('.tool-select').value;
    }
    
    getCurrentColor() {
        return this.toolbar.querySelector('.color-picker').value;
    }
    
    getCurrentSize() {
        return parseInt(this.toolbar.querySelector('.size-slider').value);
    }
    
    getCurrentTextSize() {
        return parseInt(this.toolbar.querySelector('.text-size-slider').value);
    }
    
    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 移除幕布编辑限制，允许在整个画布区域编辑
        return { x, y, outOfBounds: false };
    }
    
    startDrawing(e) {
        const tool = this.getCurrentTool();
        if (tool === 'text') return; // 文字工具使用点击事件
        
        const pos = this.getMousePos(e);
        
        // 移除边界检查，允许在整个画布上绘制
        
        this.isDrawing = true;
        this.startX = pos.x;
        this.startY = pos.y;
        
        // 保存当前状态作为预览基础
        // 确保预览画布尺寸与主画布一致
        if (this.previewCanvas.width !== this.canvas.width || this.previewCanvas.height !== this.canvas.height) {
            this.previewCanvas.width = this.canvas.width;
            this.previewCanvas.height = this.canvas.height;
        }
        this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
        this.previewCtx.drawImage(this.canvas, 0, 0);
        
        if (tool === 'brush') {
            this.ctx.beginPath();
            this.ctx.moveTo(pos.x, pos.y);
            this.currentPath = [{ x: pos.x, y: pos.y }];
        }
    }
    
    draw(e) {
        if (!this.isDrawing) return;
        
        const tool = this.getCurrentTool();
        const pos = this.getMousePos(e);
        
        // 移除边界限制，允许在整个画布上绘制
        
        this.ctx.lineWidth = this.getCurrentSize();
        this.ctx.strokeStyle = this.getCurrentColor();
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        if (tool === 'brush') {
            // 画笔直接绘制
            this.ctx.lineTo(pos.x, pos.y);
            this.ctx.stroke();
            this.currentPath.push({ x: pos.x, y: pos.y });
        } else {
            // 其他工具使用实时预览
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(this.previewCanvas, 0, 0);
            
            // 设置绘制参数
            this.ctx.lineWidth = this.getCurrentSize();
            this.ctx.strokeStyle = this.getCurrentColor();
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            
            switch (tool) {
                case 'line':
                    this.drawLine(this.startX, this.startY, pos.x, pos.y);
                    break;
                case 'arrow':
                    this.drawArrow(this.startX, this.startY, pos.x, pos.y);
                    break;
                case 'rectangle':
                    this.drawRectangle(this.startX, this.startY, pos.x, pos.y);
                    break;
            }
        }
    }
    
    stopDrawing(e) {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        
        const tool = this.getCurrentTool();
        
        // 非画笔工具需要保存状态
        if (tool !== 'brush') {
            this.saveState();
        } else {
            // 画笔工具在结束时保存状态
            this.saveState();
        }
    }
    
    drawLine(x1, y1, x2, y2) {
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
    }
    
    drawArrow(x1, y1, x2, y2) {
        const headlen = 15; // 箭头长度
        const angle = Math.atan2(y2 - y1, x2 - x1);
        
        // 绘制主线
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
        
        // 绘制箭头
        this.ctx.beginPath();
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(
            x2 - headlen * Math.cos(angle - Math.PI / 6),
            y2 - headlen * Math.sin(angle - Math.PI / 6)
        );
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(
            x2 - headlen * Math.cos(angle + Math.PI / 6),
            y2 - headlen * Math.sin(angle + Math.PI / 6)
        );
        this.ctx.stroke();
    }
    
    drawRectangle(x1, y1, x2, y2) {
        const width = x2 - x1;
        const height = y2 - y1;
        
        this.ctx.beginPath();
        this.ctx.rect(x1, y1, width, height);
        this.ctx.stroke();
    }
    
    handleCanvasClick(e) {
        const tool = this.getCurrentTool();
        if (tool !== 'text') return;
        
        // 先移除之前的文字输入框
        this.removeActiveTextInput();
        
        const pos = this.getMousePos(e);
        
        // 移除边界限制，允许在整个画布上创建文字输入
        
        this.createTextInput(pos.x, pos.y);
    }
    
    createTextInput(x, y) {
        const textInput = document.createElement('textarea');
        textInput.className = 'canvas-text-input';
        
        // 获取画布在父容器中的位置偏移
        const canvasContainer = this.canvas.parentElement;
        const canvasRect = this.canvas.getBoundingClientRect();
        const parentRect = canvasContainer.getBoundingClientRect();
        
        // 计算文本框在父容器中的绝对位置
        const absoluteX = (canvasRect.left - parentRect.left) + x;
        const absoluteY = (canvasRect.top - parentRect.top) + y;
        
        // 创建可拖动的容器
        const textContainer = document.createElement('div');
        textContainer.className = 'canvas-text-container';
        textContainer.style.cssText = `
            position: absolute;
            left: ${absoluteX}px;
            top: ${absoluteY}px;
            z-index: 1001;
            cursor: move;
            border: 2px solid var(--primary-color);
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.9);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            min-width: 100px;
            min-height: 30px;
        `;
        
        // 获取当前文字大小并应用
        const currentTextSize = this.getCurrentTextSize();
        const currentColor = this.getCurrentColor();
        
        textInput.style.cssText = `
            width: 100%;
            height: 100%;
            min-width: 100px;
            min-height: 30px;
            border: none;
            background: transparent;
            padding: 4px 8px;
            font-size: ${currentTextSize}px;
            font-family: Arial, sans-serif;
            color: ${currentColor};
            resize: both;
            outline: none;
            cursor: text;
        `;
        
        textInput.placeholder = '输入文字，Enter结束，Shift+Enter换行';
        
        textContainer.appendChild(textInput);
        
        // 将容器添加到画布父容器
        canvasContainer.style.position = 'relative';
        canvasContainer.appendChild(textContainer);
        
        this.activeTextInput = textInput;
        this.activeTextContainer = textContainer;
        
        // 添加拖动功能
        this.makeDraggable(textContainer, textInput);
        
        // 监听工具栏字号变化，实时更新文字输入框
        this.setupTextSizeListener(textInput);
        
        textInput.focus();
    }
    
    // 设置字号实时监听
    setupTextSizeListener(textInput) {
        const textSizeSlider = this.toolbar.querySelector('.text-size-slider');
        const colorPicker = this.toolbar.querySelector('.color-picker');
        
        // 字号实时更新
        const updateTextInputStyle = () => {
            if (this.activeTextInput) {
                this.activeTextInput.style.fontSize = this.getCurrentTextSize() + 'px';
                this.activeTextInput.style.color = this.getCurrentColor();
            }
        };
        
        // 移除之前的监听器（避免重复绑定）
        if (this.textSizeListener) {
            textSizeSlider.removeEventListener('input', this.textSizeListener);
        }
        if (this.colorChangeListener) {
            colorPicker.removeEventListener('change', this.colorChangeListener);
        }
        
        // 添加新的监听器
        this.textSizeListener = updateTextInputStyle;
        this.colorChangeListener = updateTextInputStyle;
        
        textSizeSlider.addEventListener('input', this.textSizeListener);
        colorPicker.addEventListener('change', this.colorChangeListener);
    }
    
    handleKeyDown(e) {
        if (this.activeTextInput && e.target === this.activeTextInput) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.commitTextInput();
            }
        }
    }
    
    commitTextInput() {
        if (!this.activeTextInput || !this.activeTextContainer) return;
        
        const text = this.activeTextInput.value.trim();
        if (text) {
            const containerRect = this.activeTextContainer.getBoundingClientRect();
            const canvasRect = this.canvas.getBoundingClientRect();
            
            const x = containerRect.left - canvasRect.left;
            const y = containerRect.top - canvasRect.top;
            
            // 绘制文字到画布
            this.ctx.font = `${this.getCurrentTextSize()}px Arial`;
            this.ctx.fillStyle = this.getCurrentColor();
            this.ctx.textBaseline = 'top';
            
            // 处理多行文字
            const lines = text.split('\n');
            const lineHeight = this.getCurrentTextSize() * 1.2;
            
            lines.forEach((line, index) => {
                this.ctx.fillText(line, x + 8, y + 4 + index * lineHeight); // 加上 padding 偏移
            });
            
            this.saveState();
        }
        
        this.removeActiveTextInput();
    }
    
    removeActiveTextInput() {
        if (this.activeTextContainer) {
            this.activeTextContainer.remove();
            this.activeTextContainer = null;
        }
        if (this.activeTextInput) {
            this.activeTextInput = null;
        }
    }
    
    // 使文字容器可拖动
    makeDraggable(container, textInput) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        
        container.addEventListener('mousedown', (e) => {
            // 只有在容器边框区域才开始拖动，避免干扰文字输入
            if (e.target === container) {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                
                // 获取当前容器的位置（相对于父容器）
                const containerStyle = window.getComputedStyle(container);
                startLeft = parseInt(containerStyle.left) || 0;
                startTop = parseInt(containerStyle.top) || 0;
                
                container.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                
                const newLeft = startLeft + deltaX;
                const newTop = startTop + deltaY;
                
                // 边界检查：确保不超出画布范围
                const canvasRect = this.canvas.getBoundingClientRect();
                const parentRect = container.parentElement.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                
                // 计算画布在父容器中的边界
                const canvasLeft = canvasRect.left - parentRect.left;
                const canvasTop = canvasRect.top - parentRect.top;
                const canvasRight = canvasLeft + this.canvas.width;
                const canvasBottom = canvasTop + this.canvas.height;
                
                // 限制在画布范围内
                const constrainedLeft = Math.max(canvasLeft, Math.min(newLeft, canvasRight - containerRect.width));
                const constrainedTop = Math.max(canvasTop, Math.min(newTop, canvasBottom - containerRect.height));
                
                container.style.left = constrainedLeft + 'px';
                container.style.top = constrainedTop + 'px';
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                container.style.cursor = 'move';
            }
        });
    }
    
    resetToOriginal() {
        if (this.isImageEditingMode && this.originalImage) {
            // 完全复原到最初始状态，清除所有编辑痕迹
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(this.originalImage, 0, 0, this.displayWidth, this.displayHeight);
            
            // 重新保存原始数据
            this.originalImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            
            // 清空历史记录并重新开始
            this.history = [];
            this.historyStep = -1;
            this.saveState();
            
            //console.log('[幕布编辑] 已复原到最初始状态');
        } else {
            // 空白画板模式：直接清空并重置历史
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.history = [];
            this.historyStep = -1;
            this.saveState();
        }
    }
    
    cleanup() {
        // 清理事件监听和文字输入框
        document.removeEventListener('keydown', this.handleKeyDown.bind(this));
        this.removeActiveTextInput();
        
        // 清理字号实时监听器
        if (this.textSizeListener) {
            const textSizeSlider = this.toolbar.querySelector('.text-size-slider');
            if (textSizeSlider) {
                textSizeSlider.removeEventListener('input', this.textSizeListener);
            }
        }
        if (this.colorChangeListener) {
            const colorPicker = this.toolbar.querySelector('.color-picker');
            if (colorPicker) {
                colorPicker.removeEventListener('change', this.colorChangeListener);
            }
        }
    }
}

// 复制画板内容到剪切板
async function copyCanvasToClipboard(canvas) {
    //console.log('[画板复制] 开始复制画布内容, 尺寸:', canvas.width, 'x', canvas.height);
    
    // 检查浏览器支持
    if (!navigator.clipboard) {
        const error = '浏览器不支持剪切板API';
        console.error('[画板复制] 错误:', error);
        throw new Error(error);
    }
    
    try {
        //console.log('[画板复制] 检查 navigator.clipboard.write 支持:', !!navigator.clipboard.write);
        
        // 方法1：使用 ClipboardItem (推荐)
        if (navigator.clipboard.write) {
            return new Promise((resolve, reject) => {
                // 优化复制质量，根据图片类型和尺寸调整压缩
                let quality = 0.95; // 提高默认质量
                let format = 'image/png';
                
                const canvasArea = canvas.width * canvas.height;
                //console.log('[画板复制] 画布面积:', canvasArea);
                
                if (canvasArea > 444194304) { 
                    format = 'image/jpeg';
                    quality = 0.90;
                    //console.log('[画板复制] 使用 JPEG 格式, 质量: 0.90');
                } else if (canvasArea > 442073600) { 
                    format = 'image/jpeg';
                    quality = 0.93;
                    //console.log('[画板复制] 使用 JPEG 格式, 质量: 0.93');
                } else {
                    //console.log('[画板复制] 使用 PNG 格式, 质量: 0.95');
                }
                
                //console.log('[画板复制] 开始转换为 Blob...');
                canvas.toBlob(async (blob) => {
                    if (!blob) {
                        const error = '无法生成图片数据';
                        console.error('[画板复制] 错误:', error);
                        reject(new Error(error));
                        return;
                    }
                    
                    //console.log('[画板复制] Blob 生成成功, 类型:', blob.type, '大小:', blob.size, 'bytes');
                    
                    try {
                        const clipboardItem = new ClipboardItem({
                            [blob.type]: blob
                        });
                        
                        //console.log('[画板复制] 创建 ClipboardItem 成功, 开始写入剪贴板...');
                        await navigator.clipboard.write([clipboardItem]);
                        //console.log('[画板复制] 写入剪贴板成功!');
                        resolve();
                    } catch (error) {
                        console.error('[画板复制] 写入剪贴板失败:', error);
                        reject(error);
                    }
                }, format, quality);
            });
        }
        
        // 方法2：fallback 到 writeText (data URL)
        else if (navigator.clipboard.writeText) {
            //console.log('[画板复制] 使用备用方法 writeText');
            const dataUrl = canvas.toDataURL('image/png', 0.95);
            //console.log('[画板复制] 生成 data URL, 大小:', dataUrl.length, '字符');
            await navigator.clipboard.writeText(dataUrl);
            //console.log('[画板复制] writeText 成功');
            return;
        }
        
        // 如果都不支持
        else {
            const error = '浏览器不支持剪切板写入操作';
            console.error('[画板复制] 错误:', error);
            throw new Error(error);
        }
        
    } catch (error) {
        console.error('[画板复制] 复制到剪切板失败:', error);
        throw new Error(`复制失败: ${error.message}`);
    }
}

// 画板编辑器内的通知显示
function showCanvasNotification(message, type = 'info') {
    // 检查是否已有通知，如有则先移除
    const existingNotification = document.querySelector('.canvas-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `canvas-notification ${type}-notification`;
    
    const bgColors = {
        success: '#10b981',
        warning: '#f59e0b', 
        error: '#ef4444',
        info: '#3b82f6'
    };
    
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: ${bgColors[type]};
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        z-index: 10002;
        font-size: 16px;
        font-weight: 600;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        text-align: center;
        min-width: 200px;
        animation: canvasNotificationShow 0.3s ease-out;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // 2秒后自动消失
    setTimeout(() => {
        notification.style.animation = 'canvasNotificationHide 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 2000);
}