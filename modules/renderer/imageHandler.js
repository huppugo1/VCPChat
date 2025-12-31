// modules/renderer/imageHandler.js
import { fixEmoticonUrl } from './emoticonUrlFixer.js';
 

let imageHandlerRefs = {
    tauriAPI: null,
    uiHelper: null,
    chatMessagesDiv: null,
};

export function initializeImageHandler(refs) {
    imageHandlerRefs.tauriAPI = refs.tauriAPI;
    imageHandlerRefs.uiHelper = refs.uiHelper;
    imageHandlerRefs.chatMessagesDiv = refs.chatMessagesDiv;
    //console.log("[ImageHandler] Initialized.");
}

/**
 * 将内容设置到DOM元素，并处理其中的图片。
 * 此函数现在管理一个持久化的图片加载状态，以防止在流式渲染中重复加载和闪烁。
 * @param {HTMLElement} contentDiv - 要设置内容的DOM元素。
 * @param {string} rawHtml - 经过marked.parse()处理的原始HTML。
 * @param {string} messageId - 消息ID。
 */
export function setContentAndProcessImages(contentDiv, rawHtml, messageId) {
    // 🟢 直接设置 HTML，不做替换
    // Debug: log rendered HTML head to help diagnose image rendering issues in packaged app
    try {
        console.debug('[ImageHandler] setContentAndProcessImages html preview:', rawHtml ? rawHtml.substring(0, 2000) : '<empty>');
    } catch (e) {}
    contentDiv.innerHTML = rawHtml;
    
    // 🟢 然后对所有 <img> 添加事件监听
    const images = contentDiv.querySelectorAll('img');
    images.forEach((img, index) => {
        // Prefer the raw attribute (may be relative) but fallback to resolved src
        let src = img.getAttribute('src') || img.src;
        try { console.debug(`[ImageHandler] Found image src: ${src}`); } catch (e) {}
        
        // 修复表情包 URL
        if (fixEmoticonUrl && src.includes('表情包')) {
            const fixedSrc = fixEmoticonUrl(src);
            if (fixedSrc !== src) {
                img.src = fixedSrc;
                src = fixedSrc;
            }
        }
        
        // 添加交互事件
        img.style.cursor = 'pointer';
        img.title = `点击在新窗口预览\n右键可复制图片`;
        
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                window.__TAURI__.invoke('open_image_viewer', { src: src, title: img.alt || src.split('/').pop() || 'AI 图片', theme: currentTheme }).catch(err => console.error('open_image_viewer failed', err));
            } else if (imageHandlerRefs.tauriAPI && imageHandlerRefs.tauriAPI.openImageViewer) {
                imageHandlerRefs.tauriAPI.openImageViewer({
                    src: src,
                    title: img.alt || src.split('/').pop() || 'AI 图片',
                    theme: currentTheme
                });
            }
        });

        img.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
                window.__TAURI__.invoke('show_image_context_menu', { src }).catch(err => {
                    console.warn('show_image_context_menu invoke failed, falling back to tauriAPI.showImageContextMenu', err);
                    if (imageHandlerRefs.tauriAPI && typeof imageHandlerRefs.tauriAPI.showImageContextMenu === 'function') {
                        imageHandlerRefs.tauriAPI.showImageContextMenu(src);
                    }
                });
            } else if (imageHandlerRefs.tauriAPI && typeof imageHandlerRefs.tauriAPI.showImageContextMenu === 'function') {
                imageHandlerRefs.tauriAPI.showImageContextMenu(src);
            }
        });
    });
}