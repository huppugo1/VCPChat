// VCPHumanToolBox/renderer_modules/ui/canvas-handler.js
import { dataURLToBlob, openCanvasEditor } from './canvas-editor.js';

let MAX_FILENAME_LENGTH = 400; // Default value

/**
 * 设置用于截断文件名的最大长度。
 * @param {number} length - 新的最大长度。
 */
export function setMaxFilenameLength(length) {
    if (length && typeof length === 'number') {
        MAX_FILENAME_LENGTH = length;
    }
}

/**
 * 在屏幕右上角显示一个通知。
 * @param {string} message - 要显示的消息。
 * @param {'info' | 'success' | 'warning' | 'error'} type - 通知类型。
 */
export function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `${type}-notification`;
    
    const bgColors = {
        success: 'var(--success-color)',
        warning: 'var(--warning-color, #f59e0b)',
        error: 'var(--danger-color)',
        info: 'var(--primary-color)'
    };
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${bgColors[type]};
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        z-index: 10001;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        max-width: 300px;
        word-wrap: break-word;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // 动画效果
    setTimeout(() => {
        notification.classList.add('removing');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

/**
 * 处理图片文件，更新UI显示和内部状态。
 * @param {File} file - 要处理的图片文件。
 * @param {HTMLInputElement} textInput - 存储图片数据的文本输入框。
 * @param {HTMLElement} dropZone - 拖拽区域。
 * @param {HTMLElement} previewArea - 图片预览区域。
 * @param {HTMLButtonElement} clearButton - 清空按钮。
 * @param {HTMLElement} canvasButtonsContainer - 画板相关按钮的容器。
 * @param {HTMLButtonElement} editCanvasButton - 幕布编辑按钮。
 */
export function handleImageFile(file, textInput, dropZone, previewArea, clearButton, canvasButtonsContainer, editCanvasButton) {
    if (!file) {
        console.error('没有提供文件对象。');
        return;
    }

    // 1. 显示加载状态
    dropZone.style.display = 'none';
    previewArea.style.display = 'block';
    clearButton.style.display = 'none';
    if (canvasButtonsContainer) canvasButtonsContainer.style.display = 'none';
    if (editCanvasButton) editCanvasButton.style.display = 'none';
    
    previewArea.innerHTML = `
        <div class="loading-spinner-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--secondary-text); padding: 20px;">
            <div class="loading-spinner" style="border: 4px solid rgba(255, 255, 255, 0.3); border-radius: 50%; border-top-color: var(--primary-color); width: 30px; height: 30px; animation: spin 1s linear infinite; margin-bottom: 10px;"></div>
            <span>正在读取文件...</span>
        </div>
    `;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const dataUrl = e.target.result;

        // 2. 存储完整 Data URL 到隐藏属性
        textInput.dataset.fullValue = dataUrl;
        
        // 3. 保存原始图片数据（用于还原功能）
        const isNanoBananaEdit = textInput.name === 'image_url';
        const isNanoBananaCompose = textInput.name === 'image_url_1' || textInput.name.startsWith('image_url_');
        
        if (isNanoBananaEdit || isNanoBananaCompose) {
            if (!textInput.dataset.originalValue) {
                textInput.dataset.originalValue = dataUrl;
            }
        } else {
            const imageItem = textInput.closest('.dynamic-image-item');
            if (imageItem && !imageItem.dataset.originalValue) {
                imageItem.dataset.originalValue = dataUrl;
            }
        }

        // 4. 创建用于 UI 显示的截断值
        const sizeInBytes = file.size;
        const sizeInKB = (sizeInBytes / 1024).toFixed(1);
        const sizeInMB = (sizeInBytes / 1024 / 1024).toFixed(2);
        const displaySize = sizeInBytes > 1024 * 512 ? `${sizeInMB} MB` : `${sizeInKB} KB`;
        const truncatedBase64 = dataUrl.substring(0, 40);
        const displayValue = `${truncatedBase64}... [${displaySize}]`;
        textInput.value = displayValue;
        
        // 5. 更新预览
        let displayName = file.name;
        if (file.name.length > MAX_FILENAME_LENGTH) {
            const extension = file.name.split('.').pop();
            const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));
            const truncatedName = nameWithoutExt.substring(0, MAX_FILENAME_LENGTH - extension.length - 4) + '...';
            displayName = truncatedName + '.' + extension;
        }
        previewArea.innerHTML = `
            <img src="${dataUrl}" style="max-width: 100%; max-height: 150px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto;" alt="Preview">
            <div class="file-name" style="font-size: 12px; color: var(--secondary-text); word-wrap: break-word; word-break: break-all; line-height: 1.4; max-width: 100%; text-align: center; padding: 0 10px; font-family: monospace;">${displayName}</div>
        `;
        clearButton.style.display = 'inline-block';
        
        // 6. 显示画板编辑功能
        if (canvasButtonsContainer) canvasButtonsContainer.style.display = 'flex';
        if (editCanvasButton) editCanvasButton.style.display = 'inline-block';
        
        const restoreButton = canvasButtonsContainer?.querySelector('.restore-image-btn');
        if (restoreButton && (isNanoBananaEdit || isNanoBananaCompose)) {
            restoreButton.style.display = 'inline-block';
        }
    };

    reader.onerror = function(error) {
        console.error('FileReader 读取文件失败:', error);
        previewArea.innerHTML = `<div class="error-message" style="color: var(--danger-color); padding: 20px;">错误: 无法读取文件。</div>`;
        setTimeout(() => {
            clearImageInput(textInput, dropZone, previewArea, clearButton, canvasButtonsContainer, editCanvasButton);
        }, 3000);
    };

    reader.readAsDataURL(file);
}

/**
 * 清空图片输入框的状态和显示。
 */
export function clearImageInput(textInput, dropZone, previewArea, clearButton, canvasButtonsContainer, editCanvasButton) {
    textInput.value = '';
    textInput.dataset.fullValue = '';
    
    const imageItem = textInput.closest('.dynamic-image-item');
    if (imageItem) {
        delete imageItem.dataset.originalValue;
    }
    if (textInput.dataset.originalValue) {
        delete textInput.dataset.originalValue;
    }
    
    dropZone.style.display = 'block';
    previewArea.style.display = 'none';
    clearButton.style.display = 'none';
    
    if (editCanvasButton) editCanvasButton.style.display = 'none';
    if (canvasButtonsContainer) canvasButtonsContainer.style.display = 'flex';
    
    dropZone.innerHTML = `
        <div class="drop-icon">📁</div>
        <div class="drop-text">拖拽图片文件到此处或点击选择</div>
    `;
    dropZone.style.color = 'var(--secondary-text)';
}

/**
 * 从剪切板读取图片并处理。
 */
async function pasteImageFromClipboard(textInput, dropZone, previewArea, clearButton, canvasButtonsContainer, editCanvasButton) {
    if (!navigator.clipboard || !navigator.clipboard.read) {
        throw new Error('浏览器不支持剪切板API');
    }
    
    try {
        const clipboardItems = await navigator.clipboard.read();
        for (const clipboardItem of clipboardItems) {
            for (const type of clipboardItem.types) {
                if (type.startsWith('image/')) {
                    const blob = await clipboardItem.getType(type);
                    const file = new File([blob], `clipboard-image.${type.split('/')[1]}`, { type });
                    showNotification('✅ 已从剪切板粘贴图片', 'success');
                    handleImageFile(file, textInput, dropZone, previewArea, clearButton, canvasButtonsContainer, editCanvasButton);
                    return;
                }
            }
        }
        throw new Error('剪切板中没有图片');
    } catch (error) {
        throw new Error(`剪切板读取失败: ${error.message}`);
    }
}

/**
 * 创建一个完整的拖拽上传图片输入框组件。
 * @param {object} param - 组件的配置参数。
 * @returns {HTMLElement} 创建的组件容器元素。
 */
export function createDragDropImageInput(param) {
    const container = document.createElement('div');
    container.className = 'dragdrop-image-container';
    container.style.cssText = `
        position: relative; border: 2px dashed var(--border-color); border-radius: 8px;
        padding: 20px; text-align: center; background: var(--input-bg);
        transition: all 0.3s ease; min-height: 120px; display: flex;
        align-items: center; justify-content: center; flex-direction: column;
    `;

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.name = param.name;
    textInput.placeholder = param.placeholder || '';
    textInput.style.cssText = `
        width: 100%; margin-bottom: 10px; padding: 8px;
        border: 1px solid var(--border-color); border-radius: 4px;
        background: var(--input-bg); color: var(--text-color);
    `;
    if (param.required) textInput.required = true;

    const contentArea = document.createElement('div');
    contentArea.className = 'upload-content-area';
    contentArea.style.cssText = 'width: 100%; display: flex; flex-direction: column; align-items: center;';

    const dropZone = document.createElement('div');
    dropZone.className = 'drop-zone';
    dropZone.innerHTML = `<div class="drop-icon">📁</div><div class="drop-text">拖拽图片文件到此处或点击选择</div>`;
    dropZone.style.cssText = `cursor: pointer; color: var(--secondary-text); font-size: 14px; padding: 20px; width: 100%; box-sizing: border-box;`;

    const previewArea = document.createElement('div');
    previewArea.className = 'image-preview-area';
    previewArea.style.cssText = `display: none; width: 100%; margin-top: 10px; text-align: center;`;

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.innerHTML = '🗑️ 清空';
    clearButton.className = 'clear-image-btn';
    clearButton.style.cssText = `
        display: none; background: var(--danger-color); color: white; border: none;
        padding: 8px 16px; border-radius: 4px; cursor: pointer;
        font-size: 12px; margin: 0 auto; transition: all 0.2s ease;
    `;
    
    const canvasButtonsContainer = document.createElement('div');
    canvasButtonsContainer.className = 'canvas-buttons-container';
    canvasButtonsContainer.style.cssText = `display: none; gap: 8px; margin-top: 10px; justify-content: center; flex-wrap: wrap;`;
    
    const buttonStyles = `
        color: white; border: none; padding: 10px 16px; border-radius: 6px;
        cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.3s ease;
    `;
    
    const blankCanvasButton = document.createElement('button');
    blankCanvasButton.type = 'button';
    blankCanvasButton.innerHTML = '🎨 空白画板';
    blankCanvasButton.className = 'blank-canvas-btn';
    blankCanvasButton.style.cssText = buttonStyles + `background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);`;
    
    const editCanvasButton = document.createElement('button');
    editCanvasButton.type = 'button';
    editCanvasButton.innerHTML = '✏️ 幕布编辑';
    editCanvasButton.className = 'edit-canvas-btn';
    editCanvasButton.style.cssText = buttonStyles + `display: none; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); box-shadow: 0 2px 8px rgba(240, 147, 251, 0.3);`;
    
    const pasteButton = document.createElement('button');
    pasteButton.type = 'button';
    pasteButton.innerHTML = '📋 从剪切板粘贴';
    pasteButton.className = 'paste-clipboard-btn';
    pasteButton.style.cssText = buttonStyles + `background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%); box-shadow: 0 2px 8px rgba(74, 222, 128, 0.3);`;
    
    const restoreButton = document.createElement('button');
    restoreButton.type = 'button';
    restoreButton.innerHTML = '🔄还原';
    restoreButton.className = 'restore-image-btn';
    restoreButton.title = '还原到最初粘贴的图片';
    restoreButton.style.cssText = buttonStyles + `display: none; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);`;
    
    canvasButtonsContainer.append(blankCanvasButton, editCanvasButton, pasteButton, restoreButton);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    dropZone.addEventListener('click', () => fileInput.click());
    clearButton.addEventListener('click', () => clearImageInput(textInput, dropZone, previewArea, clearButton, canvasButtonsContainer, editCanvasButton));
    
    blankCanvasButton.addEventListener('click', () => {
        try {
            openCanvasEditor(null, (canvasDataUrl) => {
                const blob = dataURLToBlob(canvasDataUrl);
                const file = new File([blob], 'canvas-drawing.png', { type: 'image/png' });
                handleImageFile(file, textInput, dropZone, previewArea, clearButton, canvasButtonsContainer, editCanvasButton);
            });
        } catch (error) {
            showNotification('打开画板失败: ' + error.message, 'error');
        }
    });
    
    editCanvasButton.addEventListener('click', () => {
        try {
            const fullImageData = textInput.dataset.fullValue;
            if (fullImageData) {
                openCanvasEditor(fullImageData, (canvasDataUrl) => {
                    const blob = dataURLToBlob(canvasDataUrl);
                    const file = new File([blob], 'edited-image.png', { type: 'image/png' });
                    handleImageFile(file, textInput, dropZone, previewArea, clearButton, canvasButtonsContainer, editCanvasButton);
                });
            } else {
                showNotification('没有可编辑的图片', 'warning');
            }
        } catch (error) {
            showNotification('打开幕布编辑失败: ' + error.message, 'error');
        }
    });

    pasteButton.addEventListener('click', async () => {
        try {
            await pasteImageFromClipboard(textInput, dropZone, previewArea, clearButton, canvasButtonsContainer, editCanvasButton);
        } catch (error) {
            showNotification('📋 剪切板中没有图片或粘贴失败', 'warning');
        }
    });
    
    restoreButton.addEventListener('click', () => {
        const originalValue = textInput.dataset.originalValue;
        if (originalValue) {
            const blob = dataURLToBlob(originalValue);
            const file = new File([blob], `restored-image.png`, { type: 'image/png' });
            const originalValueBackup = textInput.dataset.originalValue;
            handleImageFile(file, textInput, dropZone, previewArea, clearButton, canvasButtonsContainer, editCanvasButton);
            setTimeout(() => { textInput.dataset.originalValue = originalValueBackup; }, 100);
            showNotification('✅ 已还原到初始图片', 'success');
        } else {
            showNotification('❌ 没有可还原的初始图片', 'error');
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) {
            handleImageFile(e.target.files[0], textInput, dropZone, previewArea, clearButton, canvasButtonsContainer, editCanvasButton);
        }
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault(); e.stopPropagation();
        container.style.borderColor = 'var(--primary-color)';
        container.style.background = 'var(--primary-color-alpha)';
    });
    container.addEventListener('dragleave', (e) => {
        e.preventDefault(); e.stopPropagation();
        container.style.borderColor = 'var(--border-color)';
        container.style.background = 'var(--input-bg)';
    });
    container.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation();
        container.style.borderColor = 'var(--border-color)';
        container.style.background = 'var(--input-bg)';
        const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
        if (file) {
            handleImageFile(file, textInput, dropZone, previewArea, clearButton, canvasButtonsContainer, editCanvasButton);
        }
    });

    contentArea.append(dropZone, previewArea, clearButton, canvasButtonsContainer);
    container.append(textInput, contentArea, fileInput);
    canvasButtonsContainer.style.display = 'flex';

    return container;
}