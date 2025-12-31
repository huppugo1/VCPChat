// 在文件顶部添加 Tauri 导入
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { loadAsset, loadAssetSync, isUrlReachable, normalizeResourcePath, setAssetDebug, initAssetLoader, getAppDataBasePath } from './modules/utils/utils/assetLoader.js';
import { listen } from '@tauri-apps/api/event';
import { marked } from 'marked';
import { getSortable } from './modules/utils/sortable-loader.js';

// 导出 invoke 函数供其他模块使用
window.__TAURI_INVOKE__ = invoke;

// 导入必需的管理器模块
import './modules/topicListManager.js';
import './modules/uiManager.js';

// 导入主题预览缓存模块
try {
  /* @vite-ignore */
  import('./modules/Themesmodules/theme-preview-cache.js').catch(() => {
    // 如果模块不存在，创建一个简单的缓存对象作为回退
    window.themePreviewCache = {
      getCachedPreviewData: () => null,
      preloadThemePreviews: async (themes) => new Map(),
    };
  });
} catch (e) {
  // 如果模块不存在，创建一个简单的缓存对象作为回退
  window.themePreviewCache = {
    getCachedPreviewData: () => null,
    preloadThemePreviews: async (themes) => new Map(),
  };
}

// Expose reachability helper to legacy scripts/modules
try { window.isUrlReachable = isUrlReachable; } catch (e) { /* ignore */ }

// 初始化资源加载器
initAssetLoader().then(() => {
  //console.log('[Renderer] Asset loader initialized');
}).catch(e => {
  console.error('[Renderer] Failed to initialize asset loader:', e);
});

// Expose synchronous base getter for legacy scripts that run non-async
try {
  window.getAppDataServerBaseSync = function () {
    // 返回 AppData 基础路径（用于 convertFileSrc）
    const basePath = getAppDataBasePath();
    return basePath || '';
  };
} catch (e) { /* ignore */ }

// 自定义确认对话框函数（全局方法）
window.customConfirm = function(message, title = '确认操作') {
  return new Promise((resolve) => {
    // 检查是否已存在自定义确认对话框元素，如果不存在则创建
    let modal = document.getElementById('custom-confirm-modal');
    if (!modal) {
      // 创建遮罩层
      modal = document.createElement('div');
      modal.id = 'custom-confirm-modal';
      modal.style.cssText = `
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        justify-content: center;
        align-items: center;
      `;
      
      // 创建对话框容器
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: var(--secondary-bg, #2d2d2d);
        padding: 20px;
        border-radius: 8px;
        min-width: 300px;
        max-width: 500px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        color: var(--primary-text, #ffffff);
        border: 1px solid var(--border-color, #444);
      `;
      
      // 创建标题栏
      const titleEl = document.createElement('div');
      titleEl.id = 'confirm-title';
      titleEl.style.cssText = `
        font-weight: bold;
        margin-bottom: 15px;
        font-size: 16px;
        color: var(--primary-text, #ffffff);
      `;
      
      // 创建消息内容
      const messageEl = document.createElement('div');
      messageEl.id = 'confirm-message';
      messageEl.style.cssText = `
        margin-bottom: 20px;
        color: var(--primary-text, #cccccc);
      `;
      
      // 创建按钮容器
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = `
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      `;
      
      // 创建确定按钮
      const okBtn = document.createElement('button');
      okBtn.id = 'confirm-ok-btn';
      okBtn.textContent = '确定';
      okBtn.style.cssText = `
        background: var(--button-bg, #4a90e2);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
      `;
      
      // 创建取消按钮
      const cancelBtn = document.createElement('button');
      cancelBtn.id = 'confirm-cancel-btn';
      cancelBtn.textContent = '取消';
      cancelBtn.style.cssText = `
        background: var(--border-color, #666);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
      `;
      
      // 组装对话框
      buttonContainer.appendChild(cancelBtn);
      buttonContainer.appendChild(okBtn);
      dialog.appendChild(titleEl);
      dialog.appendChild(messageEl);
      dialog.appendChild(buttonContainer);
      modal.appendChild(dialog);
      
      document.body.appendChild(modal);
    }
    
    const titleEl = document.getElementById('confirm-title');
    const messageEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    
    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.style.display = 'flex';
    
    const handleOk = () => {
      modal.style.display = 'none';
      cleanup();
      resolve(true);
    };
    
    const handleCancel = () => {
      modal.style.display = 'none';
      cleanup();
      resolve(false);
    };
    
    const cleanup = () => {
      okBtn.removeEventListener('click', handleOk);
      cancelBtn.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleModalClick);
    };
    
    const handleModalClick = (e) => {
      if (e.target === modal) handleCancel();
    };
    
    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);
    modal.addEventListener('click', handleModalClick);
  });
}

// 自定义警告对话框函数（全局方法）
window.customAlert = function(message, title = '提示', type = 'info') {
  return new Promise((resolve) => {
    let modal = document.getElementById('custom-alert-modal');
    if (!modal) {
      // 创建遮罩层
      modal = document.createElement('div');
      modal.id = 'custom-alert-modal';
      modal.style.cssText = `
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        justify-content: center;
        align-items: center;
      `;
      
      // 创建对话框容器
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: var(--secondary-bg, #2d2d2d);
        padding: 20px;
        border-radius: 8px;
        min-width: 300px;
        max-width: 500px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        color: var(--primary-text, #ffffff);
        border: 1px solid var(--border-color, #444);
      `;
      
      // 创建标题栏
      const titleEl = document.createElement('div');
      titleEl.id = 'alert-title';
      titleEl.style.cssText = `
        font-weight: bold;
        margin-bottom: 15px;
        font-size: 16px;
        color: var(--primary-text, #ffffff);
        display: flex;
        align-items: center;
        gap: 8px;
      `;
      
      // 创建图标元素
      const iconEl = document.createElement('span');
      iconEl.id = 'alert-icon';
      iconEl.style.cssText = `
        font-size: 20px;
      `;
      
      // 创建标题文本
      const titleTextEl = document.createElement('span');
      titleTextEl.id = 'alert-title-text';
      
      titleEl.appendChild(iconEl);
      titleEl.appendChild(titleTextEl);
      
      // 创建消息内容
      const messageEl = document.createElement('div');
      messageEl.id = 'alert-message';
      messageEl.style.cssText = `
        margin-bottom: 20px;
        color: var(--primary-text, #cccccc);
        line-height: 1.5;
      `;
      
      // 创建按钮容器
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = `
        display: flex;
        justify-content: flex-end;
      `;
      
      // 创建确定按钮
      const okBtn = document.createElement('button');
      okBtn.id = 'alert-ok-btn';
      okBtn.textContent = '确定';
      okBtn.style.cssText = `
        background: var(--button-bg, #4a90e2);
        color: white;
        border: none;
        padding: 8px 20px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      `;
      
      // 组装对话框
      buttonContainer.appendChild(okBtn);
      dialog.appendChild(titleEl);
      dialog.appendChild(messageEl);
      dialog.appendChild(buttonContainer);
      modal.appendChild(dialog);
      
      document.body.appendChild(modal);
    }
    
    const iconEl = document.getElementById('alert-icon');
    const titleTextEl = document.getElementById('alert-title-text');
    const messageEl = document.getElementById('alert-message');
    const okBtn = document.getElementById('alert-ok-btn');
    
    // 根据类型设置图标和颜色
    const typeConfig = {
      info: { icon: 'ℹ️', color: '#4a90e2' },
      success: { icon: '✅', color: '#4caf50' },
      warning: { icon: '⚠️', color: '#ff9800' },
      error: { icon: '❌', color: '#f44336' }
    };
    
    const config = typeConfig[type] || typeConfig.info;
    iconEl.textContent = config.icon;
    titleTextEl.textContent = title;
    titleTextEl.style.color = config.color;
    messageEl.textContent = message;
    modal.style.display = 'flex';
    
    // 聚焦确定按钮
    setTimeout(() => okBtn.focus(), 100);
    
    const handleOk = () => {
      modal.style.display = 'none';
      cleanup();
      resolve(true);
    };
    
    const cleanup = () => {
      okBtn.removeEventListener('click', handleOk);
      modal.removeEventListener('click', handleModalClick);
      document.removeEventListener('keydown', handleKeydown);
    };
    
    const handleModalClick = (e) => {
      if (e.target === modal) handleOk();
    };
    
    const handleKeydown = (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        handleOk();
      }
    };
    
    okBtn.addEventListener('click', handleOk);
    modal.addEventListener('click', handleModalClick);
    document.addEventListener('keydown', handleKeydown);
  });
}

// 统一的全局模态框管理器
window.ModalManager = {
  /**
   * 显示确认对话框
   * @param {string} message - 消息内容
   * @param {string} title - 标题（默认：'确认操作'）
   * @returns {Promise<boolean>} 用户选择（true=确定，false=取消）
   */
  confirm: async function(message, title = '确认操作') {
    return window.customConfirm(message, title);
  },

  /**
   * 显示输入对话框
   * @param {string} title - 标题
   * @param {string} label - 输入框标签
   * @param {string} defaultValue - 默认值
   * @param {string} placeholder - 占位符
   * @returns {Promise<string|null>} 用户输入的值，取消时返回 null
   */
  input: async function(title, label, defaultValue = '', placeholder = '') {
    return window.showInputModal(title, label, defaultValue, placeholder);
  },

  /**
   * 显示警告对话框
   * @param {string} message - 消息内容
   * @param {string} title - 标题（默认：'提示'）
   * @param {string} type - 类型：'info'|'success'|'warning'|'error'（默认：'info'）
   * @returns {Promise<boolean>} 始终返回 true
   */
  alert: async function(message, title = '提示', type = 'info') {
    return window.customAlert(message, title, type);
  },

  /**
   * 显示信息提示
   * @param {string} message - 消息内容
   * @param {string} title - 标题（默认：'提示'）
   * @returns {Promise<boolean>}
   */
  info: async function(message, title = '提示') {
    return window.customAlert(message, title, 'info');
  },

  /**
   * 显示成功提示
   * @param {string} message - 消息内容
   * @param {string} title - 标题（默认：'成功'）
   * @returns {Promise<boolean>}
   */
  success: async function(message, title = '成功') {
    return window.customAlert(message, title, 'success');
  },

  /**
   * 显示警告提示
   * @param {string} message - 消息内容
   * @param {string} title - 标题（默认：'警告'）
   * @returns {Promise<boolean>}
   */
  warning: async function(message, title = '警告') {
    return window.customAlert(message, title, 'warning');
  },

  /**
   * 显示错误提示
   * @param {string} message - 消息内容
   * @param {string} title - 标题（默认：'错误'）
   * @returns {Promise<boolean>}
   */
  error: async function(message, title = '错误') {
    return window.customAlert(message, title, 'error');
  },

  /**
   * 显示自定义模态框
   * @param {Object} options - 配置选项
   * @param {string} options.title - 标题
   * @param {string} options.content - 内容（支持 HTML）
   * @param {Array} options.buttons - 按钮配置数组 [{text, value, primary}]
   * @param {boolean} options.closeOnOverlay - 点击遮罩是否关闭（默认：true）
   * @returns {Promise<any>} 返回点击按钮的 value
   */
  custom: async function(options) {
    return new Promise((resolve) => {
      const {
        title = '提示',
        content = '',
        buttons = [{ text: '确定', value: true, primary: true }],
        closeOnOverlay = true
      } = options;

      let modal = document.getElementById('custom-modal-dynamic');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'custom-modal-dynamic';
        modal.style.cssText = `
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.5);
          z-index: 10000;
          justify-content: center;
          align-items: center;
        `;
        document.body.appendChild(modal);
      }

      // 创建对话框容器
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: var(--secondary-bg, #2d2d2d);
        padding: 20px;
        border-radius: 8px;
        min-width: 300px;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        color: var(--primary-text, #ffffff);
        border: 1px solid var(--border-color, #444);
      `;

      // 创建标题
      const titleEl = document.createElement('div');
      titleEl.style.cssText = `
        font-weight: bold;
        margin-bottom: 15px;
        font-size: 16px;
        color: var(--primary-text, #ffffff);
      `;
      titleEl.textContent = title;

      // 创建内容
      const contentEl = document.createElement('div');
      contentEl.style.cssText = `
        margin-bottom: 20px;
        color: var(--primary-text, #cccccc);
        line-height: 1.5;
      `;
      contentEl.innerHTML = content;

      // 创建按钮容器
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = `
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      `;

      // 创建按钮
      buttons.forEach((btn, index) => {
        const button = document.createElement('button');
        button.textContent = btn.text;
        button.style.cssText = `
          background: ${btn.primary ? 'var(--button-bg, #4a90e2)' : 'var(--border-color, #666)'};
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        `;
        
        button.addEventListener('click', () => {
          cleanup();
          resolve(btn.value);
        });
        
        buttonContainer.appendChild(button);
        
        // 第一个主按钮自动聚焦
        if (index === 0 && btn.primary) {
          setTimeout(() => button.focus(), 100);
        }
      });

      // 组装对话框
      dialog.appendChild(titleEl);
      dialog.appendChild(contentEl);
      dialog.appendChild(buttonContainer);
      modal.innerHTML = '';
      modal.appendChild(dialog);
      modal.style.display = 'flex';

      const cleanup = () => {
        modal.style.display = 'none';
        modal.removeEventListener('click', handleModalClick);
      };

      const handleModalClick = (e) => {
        if (closeOnOverlay && e.target === modal) {
          cleanup();
          resolve(null);
        }
      };

      modal.addEventListener('click', handleModalClick);
    });
  }
};

// 阅读模式模态框
window.showReadModeModal = function(content, messageId) {
  let modal = document.getElementById('read-mode-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'read-mode-modal';
    modal.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.7);
      z-index: 10000;
      justify-content: center;
      align-items: center;
      padding: 20px;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: var(--secondary-bg, #2d2d2d);
      border-radius: 8px;
      width: 90%;
      max-width: 900px;
      height: 85%;
      max-height: 800px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      color: var(--primary-text, #ffffff);
      border: 1px solid var(--border-color, #444);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;
    
    // 标题栏
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 15px 20px;
      border-bottom: 1px solid var(--border-color, #444);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    `;
    
    const title = document.createElement('div');
    title.id = 'read-mode-title';
    title.style.cssText = `
      font-weight: bold;
      font-size: 16px;
      color: var(--primary-text, #ffffff);
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
      background: transparent;
      border: none;
      color: var(--primary-text, #ffffff);
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    `;
    closeBtn.onmouseover = () => closeBtn.style.background = 'var(--accent-bg, #444)';
    closeBtn.onmouseout = () => closeBtn.style.background = 'transparent';
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    // 内容区域
    const contentArea = document.createElement('div');
    contentArea.id = 'read-mode-content';
    contentArea.className = 'md-content';
    contentArea.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      line-height: 1.6;
      font-size: 15px;
    `;
    
    dialog.appendChild(header);
    dialog.appendChild(contentArea);
    modal.appendChild(dialog);
    document.body.appendChild(modal);
    
    // 关闭按钮事件
    closeBtn.onclick = () => {
      modal.style.display = 'none';
    };
    
    // 点击遮罩关闭
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    };
    
    // ESC键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        modal.style.display = 'none';
      }
    });
  }
  
  const titleEl = document.getElementById('read-mode-title');
  const contentEl = document.getElementById('read-mode-content');
  
  titleEl.textContent = `阅读模式 - ${messageId.substring(0, 15)}...`;
  
  // 使用marked渲染markdown
  if (window.marked && typeof window.marked.parse === 'function') {
    try {
      contentEl.innerHTML = window.marked.parse(content);
    } catch (e) {
      console.error('[ReadMode] Markdown渲染失败:', e);
      contentEl.textContent = content;
    }
  } else {
    // 如果没有marked，直接显示纯文本，但保留换行
    contentEl.innerHTML = content.replace(/\n/g, '<br>');
  }
  
  modal.style.display = 'flex';
  
  // 处理代码高亮
  if (window.hljs) {
    contentEl.querySelectorAll('pre code').forEach((block) => {
      window.hljs.highlightElement(block);
    });
  }
};

// 保存原始 console 方法，防止后续覆盖导致的递归调用
const __origConsole = {
  log: console.log ? console.log.bind(console) : (...a) => {},
  info: console.info ? console.info.bind(console) : console.log.bind(console),
  warn: console.warn ? console.warn.bind(console) : console.log.bind(console),
  error: console.error ? console.error.bind(console) : console.log.bind(console),
  debug: console.debug ? console.debug.bind(console) : console.log.bind(console)
};
// 暴露原始 console 以便其它模块（如 utils/assetLoader.js）使用，避免在后续覆盖 console 时产生递归
window.__origConsole = __origConsole;




// 等待 Tauri 全局对象注入，避免静态 import 失败或为空
async function waitForTauriWindow() {
  let retries = 0;
  while (!window.__TAURI__?.window) {
    await new Promise((r) => setTimeout(r, 50));
    retries += 1;
    if (retries > 200) { // 10 秒超时
      throw new Error('__TAURI__.window 不可用');
    }
  }
  return window.__TAURI__.window;
}

async function waitForTauriCore() {
  let retries = 0;
  while (!window.__TAURI__?.core) {
    await new Promise((r) => setTimeout(r, 50));
    retries += 1;
    if (retries > 200) { // 10 秒超时
      throw new Error('__TAURI__.core 不可用');
    }
  }
  return window.__TAURI__.core;
}

let appWindowPromise = null;
function getAppWindow() {
  if (!appWindowPromise) {
    appWindowPromise = waitForTauriWindow().then((tw) => tw.getCurrent());
  }
  return appWindowPromise;
}

let invokePromise = null;
async function getInvoke() {
  if (!invokePromise) {
    invokePromise = waitForTauriCore().then((tc) => tc.invoke);
  }
  return invokePromise;
}



// 全局获取 AppData 基础路径（使用 Tauri convertFileSrc）
async function getAppDataServerBase() {
  // 确保资源加载器已初始化
  await initAssetLoader();
  const basePath = getAppDataBasePath();
  return basePath || '';
}

// 监听后端 AppData 路径就绪事件
try {
  listen('app-data-path-ready', (event) => {
    try {
      const payload = event && event.payload;
      const appDataPath = payload && payload.appDataPath;
      if (appDataPath) {
        //console.log('[Renderer] AppData path received:', appDataPath);
      }
    } catch (e) {
      /* ignore */
    }
  }).catch(() => { /* ignore listen errors */ });
} catch (e) { /* ignore */ }

// 缓存已转换的URL，避免重复转换
const avatarUrlCache = new Map();

// 清除特定头像URL的缓存
function clearAvatarUrlCache(avatarUrl) {
  if (avatarUrlCache.has(avatarUrl)) {
    avatarUrlCache.delete(avatarUrl);
  }
}

// 清除所有头像URL缓存
function clearAllAvatarUrlCache() {
  avatarUrlCache.clear();
}

// 主题缩略图缓存
const themeThumbCache = new Map();

// 创建图片缩略图（使用 canvas 缩放并降低质量），返回 dataURL
async function createThumbnail(imageUrl, maxSize = 300, quality = 0.75) {
  try {
    if (!imageUrl) return imageUrl;
    // 如果传入的是相对资源路径（例如 assets/...），在打包环境下需要转换为可访问 URL
    let srcToLoad = imageUrl;
    if (!/^data:|^https?:|^file:/.test(imageUrl)) {
      try {
        srcToLoad = await loadAsset(imageUrl);
      } catch (e) {
        // ignore and fall back to original
        srcToLoad = imageUrl;
      }
    }
    const cacheKey = srcToLoad || imageUrl;
    if (themeThumbCache.has(cacheKey)) return themeThumbCache.get(cacheKey);
    const img = new Image();
    img.crossOrigin = "Anonymous";
    const loaded = await new Promise((resolve, reject) => {
      img.onload = () => resolve(true);
      img.onerror = (e) => reject(e);
      img.src = srcToLoad;
    });
    const width = img.width;
    const height = img.height;
    let targetW = width;
    let targetH = height;
    if (width > height) {
      if (width > maxSize) {
        targetW = maxSize;
        targetH = Math.round((maxSize * height) / width);
      }
    } else {
      if (height > maxSize) {
        targetH = maxSize;
        targetW = Math.round((maxSize * width) / height);
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, targetW, targetH);
    const thumbDataUrl = canvas.toDataURL('image/jpeg', quality);
    themeThumbCache.set(cacheKey, thumbDataUrl);
    return thumbDataUrl;
  } catch (e) {
    console.warn('createThumbnail failed', e);
    return imageUrl;
  }
}

// 转换文件路径为可在 webview 中使用的 URL（使用 Tauri convertFileSrc）
async function convertAvatarUrl(avatarUrl) {
  // 缓存结果
  function cacheAndReturn(key, url) {
    avatarUrlCache.set(key, url);
    return url;
  }

  if (!avatarUrl) {
    // 使用新的资源加载器加载默认头像
    const defaultAvatar = await loadAsset('AppData/assets/default_avatar.png');
    return cacheAndReturn(avatarUrl, defaultAvatar);
  }

  if (avatarUrlCache.has(avatarUrl)) {
    return avatarUrlCache.get(avatarUrl);
  }

  // 去掉查询参数
  let raw = avatarUrl.split('?')[0];

  // data: 直接返回
  if (/^data:/i.test(raw)) {
    return cacheAndReturn(avatarUrl, raw);
  }

  // blob: 直接返回
  if (/^blob:/i.test(raw)) {
    return cacheAndReturn(avatarUrl, raw);
  }

  // 已经是 asset:// URL，直接返回
  if (raw.startsWith('asset://') || raw.startsWith('https://asset.localhost/')) {
    return cacheAndReturn(avatarUrl, raw);
  }

  // http(s) URL 直接返回
  if (/^https?:\/\//i.test(raw)) {
    return cacheAndReturn(avatarUrl, raw);
  }

  // 处理 file:// 协议
  if (/^file:\/\//i.test(raw)) {
    try {
      let pathStr = raw.replace(/^file:\/\//i, '');
      pathStr = decodeURIComponent(pathStr).replace(/\\/g, '/');
      const idxApp = pathStr.indexOf('AppData/');
      const idxAssets = pathStr.indexOf('assets/');
      if (idxApp !== -1) {
        const rel = pathStr.slice(idxApp).replace(/^\/+/, '');
        const url = await loadAsset(rel);
        return cacheAndReturn(avatarUrl, url);
      } else if (idxAssets !== -1) {
        const rel = pathStr.slice(idxAssets).replace(/^\/+/, '');
        const url = await loadAsset(rel);
        return cacheAndReturn(avatarUrl, url);
      }
    } catch (e) {
      // ignore and continue
    }
  }

  // 处理 Windows 路径或直接的绝对路径
  try {
    const decoded = decodeURIComponent(raw).replace(/\\/g, '/');
    const idxApp = decoded.indexOf('AppData/');
    const idxAssets = decoded.indexOf('assets/');
    if (idxApp !== -1 || idxAssets !== -1) {
      const rel = (idxApp !== -1 ? decoded.slice(idxApp) : decoded.slice(idxAssets)).replace(/^\/+/, '');
      const url = await loadAsset(rel);
      return cacheAndReturn(avatarUrl, url);
    }
  } catch (e) {
    // ignore
  }

  // 如果直接以 AppData/ 或 assets/ 开头，使用资源加载器处理
  if (raw.startsWith('AppData/') || raw.startsWith('/AppData/') || raw.startsWith('assets/') || raw.startsWith('/assets/')) {
    const cleanPath = raw.startsWith('/') ? raw.substring(1) : raw;
    let url = await loadAsset(cleanPath);
    if (typeof url === 'string') url = url.replace(/%2F/g, '/').replace(/%5C/g, '/');
    return cacheAndReturn(avatarUrl, url);
  }

  // 相对路径处理
  if (raw.startsWith('./') || raw.startsWith('../') || raw.startsWith('/')) {
    const normalized = raw.replace(/^\.\/+/, '').replace(/^\.\.\//, '').replace(/^\/+/, '');
    if (normalized.startsWith('AppData/') || normalized.startsWith('assets/')) {
      const url = await loadAsset(normalized);
      return cacheAndReturn(avatarUrl, url);
    }
  }

  // 兜底：返回原始值
  return cacheAndReturn(avatarUrl, raw);
}

// 更新“新建话题”按钮状态（当选中 Agent 或 Group 时启用）
function updateNewTopicButtonState() {
  try {
    const btn = document.getElementById('newTopicBtn');
    if (!btn) return;
    const enabled = ((currentItemType === 'agent' || currentItemType === 'group') && currentAgentId && currentAgentId !== 'default_agent');
    if (enabled) {
      btn.style.display = ''; // 恢复默认显示（inline-flex）
      btn.removeAttribute('aria-hidden');
      btn.disabled = false;
      btn.style.opacity = '0.9';
    } else {
      btn.style.display = 'none';
      btn.setAttribute('aria-hidden', 'true');
      btn.disabled = true;
      btn.style.opacity = '0.4';
    }
  } catch (e) {
    console.warn('updateNewTopicButtonState error', e);
  }
}

// 当前选中的项目（可以是 agent 或 group）及其话题
let currentAgentId = 'default_agent';   // 对于群聊，这里复用为 groupId
let currentTopicId = 'default_topic';
let currentItemType = 'agent';          // 'agent' | 'group'
let currentTopics = [];                 // 当前选中项目（Agent 或群组）的所有话题
let currentGroups = [];                 // 已加载的群聊列表缓存

// 文件附件数组
let attachedFiles = [];

// 全局状态变量（补充缺失的变量）
let currentSelectedItem = null;
let currentChatHistory = [];
let globalSettings = {};

// 暴露到 window 对象，供其他模块使用
window.currentSelectedItem = currentSelectedItem;
window.currentTopicId = currentTopicId;
window.currentChatHistory = currentChatHistory;
window.globalSettings = globalSettings;
window.attachedFiles = attachedFiles;

// DOM 元素
const messageInput = document.getElementById('messageInput');
const chatMessages = document.getElementById('chatMessages');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const attachFileBtn = document.getElementById('attachFileBtn');
const attachmentPreviewArea = document.getElementById('attachmentPreviewArea');
const currentChatAgentName = document.getElementById('currentChatAgentName');

// 初始化 Marked 实例（用于 Markdown 渲染）
// 使用从 npm 导入的 marked
let markedInstance = marked;
// 配置 marked 选项
marked.setOptions({
  gfm: true,
  breaks: true
});
// 同时设置到 window 供其他模块使用
window.marked = marked;

// ============================================================================
// 旧的 sendMessage 函数已被移除
// 现在使用 modules/chatManager.js 中的 handleSendMessage 函数
// 参考文档: 消息发送逻辑完善指南.md
// ============================================================================

// HTML 转义函数
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 显示消息函数
// 性能优化建议：如果消息数量很大，可以考虑使用虚拟滚动来减少DOM节点
async function displayMessage(role, content, attachments = [], agentConfig = null, timestamp = null, agentId = null, name = null, avatarUrl = null, isGroupMessage = false) {

  
  const messageItem = document.createElement('div');
  messageItem.classList.add('message-item', role);
  
  // 生成消息ID和时间戳
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  messageItem.dataset.messageId = messageId;
  const msgTimestamp = timestamp || Date.now();
  messageItem.dataset.timestamp = String(msgTimestamp);
  
  const contentDiv = document.createElement('div');
  contentDiv.classList.add('md-content');
  
  // 使用 Marked 库渲染 Markdown（如果可用）
  let formattedContent;
  if (markedInstance && typeof content === 'string') {
    try {
      // 预处理：保护代码块中的特殊字符
      let processedContent = content;

      
      // 使用 Marked 解析 Markdown
      formattedContent = markedInstance.parse(processedContent);

      
      // 修复可能的 SVG viewBox 问题
      formattedContent = formattedContent.replace(/viewBox="0 "/g, 'viewBox="0 0 24 24"');
    } catch (error) {

      // 如果解析失败，回退到简单渲染，但仍允许HTML标签
      formattedContent = content || '';
    }
  } else {
    // 回退：简单的 Markdown 支持，但仍允许HTML标签

    formattedContent = (content || '')
      // 代码块
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      // 行内代码
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // 粗体
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // 斜体
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // 链接
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
      // 换行
      .replace(/\n/g, '<br>');
  }
  

  contentDiv.innerHTML = formattedContent;

  
  // 检查并记录图片元素
  const images = contentDiv.querySelectorAll('img');
  if (images.length > 0) {

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      
    }
  }
  
  // 系统消息：简单布局
  if (role === 'system') {
    messageItem.classList.add('system-message-layout');
    messageItem.appendChild(contentDiv);
  } else {
    // 用户消息和助手消息：包含头像、名称、时间
    let avatarUrl, senderName;
    
  if (role === 'user') {
      // 获取用户设置（如果未传入，则从全局获取）
      let userSettings = agentConfig; // agentConfig 在用户消息时可能是用户设置
      
      if (!userSettings) {
        try {
          const invoke = await getInvoke();
          userSettings = await invoke('get_settings').catch(() => null);
        } catch (e) {
        }
      }
      
      // 从设置中获取用户头像和名称（支持多种字段名）
      const userAvatarUrl = userSettings?.userAvatarUrl || userSettings?.user_avatar_url || userSettings?.avatarUrl;

      
      // 用户头像处理：参考助手头像的方式，使用 convertAvatarUrl 函数统一处理
      // get_settings 现在会自动检测并返回 userAvatarUrl（AppData/UserData/user_avatar.png 格式）
      if (userAvatarUrl) {
        // 使用 convertAvatarUrl 函数统一转换（与助手头像一致）
        avatarUrl = await convertAvatarUrl(userAvatarUrl);

      } else {
        avatarUrl = await loadAsset('AppData/assets/default_user_avatar.png');

      }
      
      senderName = userSettings?.userName || userSettings?.user_name || '你';
  } else if (role === 'assistant') {
      // 检查是否是群聊消息（有isGroupMessage标志或agentId）
      if (isGroupMessage || agentId) {
        // 对于群聊消息，优先使用传入的头像和名称
        if (avatarUrl) {
          avatarUrl = await convertAvatarUrl(avatarUrl);
        } else {
          avatarUrl = await loadAsset('AppData/assets/default_avatar.png');
        }
        
        senderName = name || agentId || 'AI助手';
      } else {
        // 获取 Agent 头像和名称（完全参考 loadAgents 的方式）
        if (agentConfig) {
          // loadAgents 中使用：const avatarUrl = agent.avatar_url || 'assets/default_avatar.png';
          // get_agent_config 返回的是 JSON，字段名是 avatarUrl（驼峰），但我们需要检查 avatar_url（下划线）
          // 因为 get_agents 返回的 Agent 结构使用 avatar_url
          let rawAvatarUrl = agentConfig.avatarUrl || agentConfig.avatar_url;
          
          // 如果config中有avatarUrl，也尝试读取
          if (!rawAvatarUrl && agentConfig.config && agentConfig.config.avatarUrl) {
            rawAvatarUrl = agentConfig.config.avatarUrl;
          }
          
          // 使用 convertAvatarUrl 函数统一转换（与用户头像一致）

          avatarUrl = rawAvatarUrl ? await convertAvatarUrl(rawAvatarUrl) : await loadAsset('AppData/assets/default_avatar.png');

          
          senderName = agentConfig.name || 'AI助手';
        } else {
          avatarUrl = await loadAsset('AppData/assets/default_avatar.png');
          senderName = 'AI助手';
        }
      }
    }
    
    // 创建头像（参考 loadAgents 的方式）
    const avatarImg = document.createElement('img');
    avatarImg.classList.add('chat-avatar');
    
    // 参考 loadAgents: img.src = avatarUrl;
    avatarImg.src = avatarUrl;
    avatarImg.alt = `${senderName} 头像`;
    
    // 添加加载错误处理
    avatarImg.onerror = async (e) => {
      // 如果加载失败，尝试使用默认头像
      const defaultAvatarPath = role === 'user' ? 'AppData/assets/default_user_avatar.png' : 'AppData/assets/default_avatar.png';
      const defaultAvatar = await convertAvatarUrl(defaultAvatarPath);
      if (avatarImg.src !== defaultAvatar) {
        avatarImg.src = defaultAvatar;
      }
    };
    
    // 创建名称和时间块
    const nameTimeDiv = document.createElement('div');
    nameTimeDiv.classList.add('name-time-block');
    
    const senderNameDiv = document.createElement('div');
    senderNameDiv.classList.add('sender-name');
    senderNameDiv.textContent = senderName;
    
    const timestampDiv = document.createElement('div');
    timestampDiv.classList.add('message-timestamp');
    // 格式化时间：年月日时分秒 YYYY-MM-DD HH:mm:ss
    // 检查时间戳是否是秒单位（年份小于1971），如果是则乘以1000转换为毫秒
    let adjustedTimestamp = msgTimestamp;
    const dateToCheck = new Date(msgTimestamp);
    if (dateToCheck.getFullYear() < 1971) {
      adjustedTimestamp = msgTimestamp * 1000;
    }
    const date = new Date(adjustedTimestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    timestampDiv.textContent = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    
    nameTimeDiv.appendChild(senderNameDiv);
    nameTimeDiv.appendChild(timestampDiv);
    
    // 创建详情和气泡包装器
    const detailsAndBubbleWrapper = document.createElement('div');
    detailsAndBubbleWrapper.classList.add('details-and-bubble-wrapper');
    detailsAndBubbleWrapper.appendChild(nameTimeDiv);
    detailsAndBubbleWrapper.appendChild(contentDiv);
  
  // 显示附件
  if (attachments && attachments.length > 0) {
    const attachmentsDiv = document.createElement('div');
    attachmentsDiv.classList.add('message-attachments');
    
    attachments.forEach(attachment => {
      const attachmentElement = document.createElement('div');
      attachmentElement.classList.add('attachment');
      const fileName = attachment.file_name || attachment.name || '未知文件';
      attachmentElement.textContent = `📎 ${fileName}`;
      attachmentsDiv.appendChild(attachmentElement);
    });
    
      detailsAndBubbleWrapper.appendChild(attachmentsDiv);
    }
    
    messageItem.appendChild(avatarImg);
    messageItem.appendChild(detailsAndBubbleWrapper);
  }
  
  chatMessages.appendChild(messageItem);
  
  // 滚动到底部
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 加载聊天历史
async function loadChatHistory() {
  try {
    // 清空当前消息显示
    if (chatMessages) {
      chatMessages.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">加载中...</div>';
    }
    
    const invoke = await getInvoke();
    
    // 并行加载聊天历史和 Agent 配置
    const [history, agentConfig] = await Promise.all([
      invoke('get_chat_history', { agentId: currentAgentId, topicId: currentTopicId }).catch(() => []),
      invoke('get_agent_config', { agentId: currentAgentId }).catch(() => null)
    ]);
    
    // 清空聊天区域
    if (chatMessages) {
      chatMessages.innerHTML = '';
    }
    
    // 显示历史消息（空主题不再显示"暂无聊天记录"占位）
    if (history && history.length > 0) {
      // 并行加载用户设置（用于用户消息的头像和名称）
      const userSettings = await invoke('get_settings').catch(() => null);
      
      for (const msg of history) {
        const timestamp = msg.timestamp || Date.now();
        
        // 如果是 assistant 消息，传递 agentConfig；如果是 user 消息，传递 userSettings
        const config = msg.role === 'assistant' ? agentConfig : (msg.role === 'user' ? userSettings : null);
        await displayMessage(msg.role, msg.content, msg.attachments || [], config, timestamp, msg.agentId, msg.name, msg.avatarUrl, msg.isGroupMessage);
      }
    } else if (chatMessages) {
      // 空历史：直接保持聊天区域为空，更干净
      chatMessages.innerHTML = '';
    }
    
    // 滚动到底部
    if (chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  } catch (error) {
    if (chatMessages) {
      chatMessages.innerHTML = `<div style="text-align: center; color: #f44336; padding: 20px;">加载失败: ${error.message}</div>`;
    }
  }
}

// 加载话题列表
async function loadTopics() {
  // 加载所有助手的话题
  await loadAllTopics();
}

async function loadAgents() {
  try {
    const invoke = await getInvoke();
    const agents = await invoke('get_agents');
    
    // 读取保存的顺序（优先从内存缓存恢复，如果没有则从文件读取）
    let agentOrder = restoreAgentOrderFromCache();
    if (!agentOrder) {
      try {
        const settings = await invoke('get_settings');
        agentOrder = settings.agentOrder || [];
        // 更新内存缓存
        agentOrderCache = [...agentOrder];
      } catch (error) {
        agentOrder = [];
      }
    }
    
    // 根据保存的顺序对agents进行排序
    const sortedAgents = [...agents].sort((a, b) => {
      const indexA = agentOrder.indexOf(a.id);
      const indexB = agentOrder.indexOf(b.id);
      
      // 如果两个都在顺序列表中，按顺序排序
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      // 如果只有A在顺序列表中，A排在前面
      if (indexA !== -1 && indexB === -1) {
        return -1;
      }
      // 如果只有B在顺序列表中，B排在前面
      if (indexA === -1 && indexB !== -1) {
        return 1;
      }
      // 如果都不在顺序列表中，保持原有顺序（按创建时间或ID）
      return 0;
    });
    
    const agentList = document.getElementById('agentList');
    if (!agentList) return;
    
    agentList.innerHTML = '';
    
    if (sortedAgents.length === 0) {
      agentList.innerHTML = '<li style="padding: 10px; text-align: center; color: #999;">暂无助手</li>';
      // 如果没有项目，销毁 Sortable 实例
      if (agentList.sortableInstance) {
        agentList.sortableInstance.destroy();
        agentList.sortableInstance = null;
      }
      return;
    }
    
    for (const agent of sortedAgents) {
      const li = document.createElement('li');
      li.classList.add('agent-item');
      li.dataset.agentId = agent.id;
      // Sortable.js 会自动设置 draggable，但我们可以显式设置以确保兼容性
      // 注意：不要手动设置 draggable="true"，让 Sortable.js 管理
      
      // 头像
      const img = document.createElement('img');
      img.classList.add('agent-avatar', 'drag-handle'); // 添加 drag-handle 类作为拖拽手柄
      // 添加时间戳防止缓存
      const rawAvatarUrl = agent.avatar_url || 'AppData/assets/default_avatar.png';

      // 使用 convertAvatarUrl 转换路径（与 displayMessage 一致）
      const avatarUrl = await convertAvatarUrl(rawAvatarUrl);

      const cacheBustedAgentAvatar = avatarUrl + (avatarUrl.includes('?') ? '&' : '?') + 'v=' + Date.now();
      img.src = cacheBustedAgentAvatar;
      img.alt = agent.name;
      img.style.width = '32px';
      img.style.height = '32px';
      img.style.borderRadius = '50%';
      img.style.objectFit = 'cover';
      img.style.cursor = 'grab'; // 显示抓取光标提示可拖拽
      // 不设置 pointer-events，让 Sortable.js 自己处理
      
      // 名称
      const nameSpan = document.createElement('span');
      nameSpan.classList.add('agent-name');
      nameSpan.textContent = agent.name;
      
      li.appendChild(img);
      li.appendChild(nameSpan);
      
      // 左键点击：选择 Agent 开始聊天
      // Sortable.js 会自动处理拖拽，我们只需要处理点击
      li.addEventListener('click', (e) => {
        // 如果正在拖拽，不触发点击
        if (li._isDragging) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        selectAgent(agent.id, agent.name);
      });
      
      // 右键点击：编辑 Agent
      li.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showSettingsView(agent.id);
      });
      
      agentList.appendChild(li);
    }
    
    // 使用 Sortable.js 初始化拖拽排序
    // 使用 requestAnimationFrame 确保 DOM 完全渲染后再初始化
    requestAnimationFrame(async () => {
      await initializeAgentSortable(agentList);
    });
    // 输出 agent 列表的 HTML 源到日志以便排查（生产环境会写入文件）
    try {

    } catch (e) {
      __origConsole.warn('Failed to log agent list HTML:', e);
    }
  } catch (error) {
    const agentList = document.getElementById('agentList');
    if (agentList) {
      agentList.innerHTML = `<li style="padding: 10px; color: #f44336;">加载失败: ${error.message}</li>`;
    }
  }
}

// 暴露 loadAgents 为全局函数，供其他模块调用
window.loadAgents = loadAgents;

// 使用 Sortable.js 初始化 Agent 列表的拖拽排序
async function initializeAgentSortable(agentList) {
  // 确保agentList有子元素后再初始化
  if (!agentList || agentList.children.length === 0) {
    return;
  }
  
  // 如果已存在 Sortable 实例，先销毁
  if (agentList.sortableInstance) {
    agentList.sortableInstance.destroy();
    agentList.sortableInstance = null;
  }
  
  // 创建新的 Sortable 实例
  try {
    const Sortable = await getSortable(); // 动态加载 Sortable
    agentList.sortableInstance = new Sortable(agentList, {
      animation: 150, // 动画时长，提供流畅的视觉反馈
      ghostClass: 'sortable-ghost-main', // 拖拽时的占位符样式
      chosenClass: 'sortable-chosen-main', // 选中时的样式
      dragClass: 'sortable-drag-main', // 拖拽中的样式
      handle: '.drag-handle', // 只有拖动头像才能触发拖拽排序
      // 使用 fallback 模式，确保在所有浏览器中都能正常工作
      forceFallback: true,
      fallbackOnBody: true,
      onStart: function(evt) {
        // 标记正在拖拽，防止点击事件触发
        evt.item._isDragging = true;
      },
      onEnd: async function(evt) {
        // 清除拖拽标记
        evt.item._isDragging = false;
        // 只有位置真正改变时才保存
        if (evt.newIndex !== evt.oldIndex && evt.newIndex !== null && evt.oldIndex !== null) {
          // 保存新的顺序（使用防抖，避免频繁写入）
          await saveAgentOrder();
        }
      }
    });
    
  } catch (error) {
  }
}

// 保存Agent顺序到settings.json
// 位置信息存储在内存（DOM）和 settings.json 文件中
// 更新策略：先更新内存（DOM），然后异步保存到文件，确保刷新无感
let saveAgentOrderTimeout = null;
let agentOrderCache = null; // 内存缓存，用于快速恢复

async function saveAgentOrder() {
  try {
    const agentList = document.getElementById('agentList');
    if (!agentList) return;
    
    const agentItems = Array.from(agentList.querySelectorAll('.agent-item'));
    const agentOrder = agentItems.map(item => item.dataset.agentId);
    
    // 先更新内存缓存（立即生效）
    agentOrderCache = [...agentOrder];
    
    // 保存到文件
    const invoke = await getInvoke();
    const settings = await invoke('get_settings');
    settings.agentOrder = agentOrder;
    await invoke('save_settings', { settings });
    
    //console.log('[Renderer] Agent order saved:', agentOrder.length, 'agents');
  } catch (error) {
    console.error('[Renderer] Failed to save agent order:', error);
  }
}

// 从内存缓存恢复顺序（用于快速恢复，无需读取文件）
function restoreAgentOrderFromCache() {
  if (agentOrderCache && agentOrderCache.length > 0) {
    return agentOrderCache;
  }
  return null;
}

// 加载群聊列表（已废弃，现在由 itemListManager 统一管理）
// 加载群聊列表
async function loadGroups() {
  try {
    const invoke = await getInvoke();
    const groups = await invoke('get_agent_groups');
    
    currentGroups = groups; // 缓存群聊数据，供 selectGroup 使用
    
    const groupList = document.getElementById('groupList');
    if (!groupList) return;
    
    groupList.innerHTML = '';
    
    if (groups.length === 0) {
      groupList.innerHTML = '<li style="padding: 10px; text-align: center; color: #999;">暂无群聊</li>';
      return;
    }
    
    for (const group of groups) {
      const li = document.createElement('li');
      li.classList.add('group-item');
      li.dataset.groupId = group.id;
      
      // 头像
      const img = document.createElement('img');
      const rawAvatarUrl = group.avatar_url || 'AppData/assets/default_group_avatar.png';
      const avatarUrl = await convertAvatarUrl(rawAvatarUrl);
      const cacheBustedGroupAvatar = avatarUrl + (avatarUrl.includes('?') ? '&' : '?') + 'v=' + Date.now();
      img.src = cacheBustedGroupAvatar;
      img.alt = group.name;
      img.style.width = '32px';
      img.style.height = '32px';
      img.style.borderRadius = '50%';
      img.style.objectFit = 'cover';
      
      // 名称
      const nameSpan = document.createElement('span');
      nameSpan.classList.add('group-name');
      nameSpan.textContent = group.name;
      
      li.appendChild(img);
      li.appendChild(nameSpan);
      
      // 点击事件
      li.addEventListener('click', () => {
        selectGroup(group.id, group.name);
      });
      
      // 右键点击：编辑群聊
      li.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showGroupSettingsView(group.id);
      });
      
      groupList.appendChild(li);
    }
  } catch (error) {
    const groupList = document.getElementById('groupList');
    if (groupList) {
      groupList.innerHTML = `<li style="padding: 10px; color: #f44336;">加载失败: ${error.message}</li>`;
    }
  }
}

// 选择Agent
async function selectAgent(agentId, agentName) {
  //console.log('[selectAgent] Called with:', agentId, agentName);
  
  // 使用 chatManager 的 selectItem 方法
  if (!window.chatManager || typeof window.chatManager.selectItem !== 'function') {
    console.error('[selectAgent] chatManager not available!');
    return;
  }
  
  try {
    // 获取 Agent 配置
    const invoke = await getInvoke();
    const agentConfig = await invoke('get_agent_config', { agentId: agentId });
    
    //console.log('[selectAgent] Got agent config:', agentConfig);
    
    // 调用 chatManager 的 selectItem
    await window.chatManager.selectItem(
      agentId,
      'agent',
      agentName,
      agentConfig?.avatarUrl || agentConfig?.avatar_url || 'AppData/assets/default_avatar.png',
      agentConfig
    );
    
    // 🔧 移除：不再清除发言人列表，因为助手模式需要显示模型名称
    // if (window.ChatToolbar && typeof window.ChatToolbar.clearSpeakerList === 'function') {
    //   window.ChatToolbar.clearSpeakerList();
    //   //console.log('[selectAgent] Cleared chat toolbar speaker list');
    // }
    
    //console.log('[selectAgent] chatManager.selectItem completed successfully');
  } catch (error) {
    console.error('[selectAgent] Failed to use chatManager.selectItem:', error);
    throw error;
  }
}

// 选择群聊
async function selectGroup(groupId, groupName) {
  //console.log('[selectGroup] Called with:', groupId, groupName);
  
  // 使用 chatManager 的 selectItem 方法
  if (!window.chatManager || typeof window.chatManager.selectItem !== 'function') {
    console.error('[selectGroup] chatManager not available!');
    return;
  }
  
  try {
    // 获取群组配置
    const invoke = await getInvoke();
    const groupConfig = await invoke('get_agent_group_config', { groupId: groupId });
    
    //console.log('[selectGroup] Got group config:', groupConfig);
    
    // 调用 chatManager 的 selectItem
    await window.chatManager.selectItem(
      groupId,
      'group',
      groupName,
      groupConfig?.avatarUrl || groupConfig?.avatar_url || 'AppData/assets/default_group_avatar.png',
      groupConfig
    );
    
    //console.log('[selectGroup] chatManager.selectItem completed successfully');
  } catch (error) {
    console.error('[selectGroup] Failed to use chatManager.selectItem:', error);
    throw error;
  }
}

// ==================== 全局工具函数 ====================

// 通用输入模态框函数（全局方法）
window.showInputModal = function(title, label, defaultValue = '', placeholder = '') {
  return new Promise((resolve) => {
    const modal = document.getElementById('inputModal');
    const modalTitle = document.getElementById('inputModalTitle');
    const modalLabel = document.getElementById('inputModalLabel');
    const modalInput = document.getElementById('inputModalInput');
    const confirmBtn = document.getElementById('inputModalConfirmBtn');
    const cancelBtn = document.getElementById('inputModalCancelBtn');
    const closeBtn = document.getElementById('closeInputModalBtn');

    if (!modal || !modalTitle || !modalLabel || !modalInput || !confirmBtn || !cancelBtn || !closeBtn) {
      console.error('[showInputModal] 输入模态框元素未找到');
      resolve(null);
      return;
    }

    // 设置模态框内容
    modalTitle.textContent = title;
    modalLabel.textContent = label;
    modalInput.value = defaultValue;
    modalInput.placeholder = placeholder;

    // 显示模态框
    modal.style.display = 'flex';

    // 聚焦输入框并选中文本
    setTimeout(() => {
      modalInput.focus();
      modalInput.select();
    }, 100);

    // 确认按钮处理
    const handleConfirm = () => {
      const value = modalInput.value.trim();
      cleanup();
      resolve(value || null);
    };

    // 取消按钮处理
    const handleCancel = () => {
      cleanup();
      resolve(null);
    };

    // 清理函数
    const cleanup = () => {
      modal.style.display = 'none';
      modalInput.value = '';
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      closeBtn.removeEventListener('click', handleCancel);
      modalInput.removeEventListener('keydown', handleKeydown);
    };

    // 键盘事件处理
    const handleKeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    };

    // 绑定事件
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    closeBtn.addEventListener('click', handleCancel);
    modalInput.addEventListener('keydown', handleKeydown);
  });
};

// --- Forward Message Functionality ---
let messageToForward = null;
let selectedForwardTarget = null;

async function showForwardModal(message) {
    messageToForward = message;
    selectedForwardTarget = null; // Reset selection
    const modal = document.getElementById('forwardMessageModal');
    const targetList = document.getElementById('forwardTargetList');
    const searchInput = document.getElementById('forwardTargetSearch');
    const commentInput = document.getElementById('forwardAdditionalComment');
    const confirmBtn = document.getElementById('confirmForwardBtn');

    if (!modal || !targetList || !searchInput || !commentInput || !confirmBtn) {
        console.error('[showForwardModal] Required elements not found');
        return;
    }

    targetList.innerHTML = '<li style="text-align: center; color: rgba(255, 255, 255, 0.6); padding: 20px;">加载中...</li>';
    commentInput.value = '';
    searchInput.value = '';
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.5';

    modal.style.display = 'flex';

    try {
        const invoke = await getInvoke();
        
        // Load both agents and groups
        const [agentsResult, groupsResult] = await Promise.all([
            invoke('get_agents').catch(err => {
                console.warn('[showForwardModal] Failed to load agents:', err);
                return { error: err.message };
            }),
            invoke('get_agent_groups').catch(err => {
                console.warn('[showForwardModal] Failed to load groups:', err);
                return { error: err.message };
            })
        ]);
        
        const items = [];
        
        // Add agents
        if (agentsResult && !agentsResult.error && Array.isArray(agentsResult)) {
            agentsResult.forEach(agent => {
                items.push({
                    id: agent.id,
                    type: 'agent',
                    name: agent.name,
                    avatarUrl: agent.avatarUrl
                });
            });
        }
        
        // Add groups
        if (groupsResult && !groupsResult.error && Array.isArray(groupsResult)) {
            groupsResult.forEach(group => {
                items.push({
                    id: group.id,
                    type: 'group',
                    name: group.name,
                    avatarUrl: group.avatarUrl
                });
            });
        }
        
        if (items.length > 0) {
            renderForwardTargetList(items);
        } else {
            targetList.innerHTML = '<li style="text-align: center; color: rgba(255, 255, 255, 0.6); padding: 20px;">没有可用的转发目标</li>';
        }
    } catch (error) {
        console.error('[showForwardModal] Failed to load targets:', error);
        targetList.innerHTML = '<li style="text-align: center; color: rgba(255, 255, 255, 0.6); padding: 20px;">加载失败</li>';
    }

    searchInput.oninput = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const items = targetList.querySelectorAll('.agent-item');
        items.forEach(item => {
            const name = item.dataset.name.toLowerCase();
            if (name.includes(searchTerm)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    };

    confirmBtn.onclick = handleConfirmForward;
}

function renderForwardTargetList(items) {
    const targetList = document.getElementById('forwardTargetList');
    const confirmBtn = document.getElementById('confirmForwardBtn');
    
    if (!targetList || !confirmBtn) return;
    
    targetList.innerHTML = '';

    items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'agent-item';
        li.dataset.id = item.id;
        li.dataset.type = item.type;
        li.dataset.name = item.name;
        li.style.cssText = `
            display: flex;
            align-items: center;
            padding: 12px;
            margin: 4px 0;
            border-radius: 6px;
            cursor: pointer;
            transition: background-color 0.2s;
            border: 1px solid transparent;
        `;

        const avatar = document.createElement('img');
        avatar.className = 'avatar';
        avatar.src = item.avatarUrl || (item.type === 'group' ? 'assets/default_group_avatar.png' : 'assets/default_user_avatar.png');
        avatar.style.cssText = `
            width: 32px;
            height: 32px;
            border-radius: 50%;
            margin-right: 12px;
            object-fit: cover;
        `;
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'agent-name';
        nameSpan.textContent = `${item.name} (${item.type === 'group' ? '群组' : 'Agent'})`;
        nameSpan.style.cssText = `
            color: var(--primary-text);
            font-size: 14px;
        `;

        li.appendChild(avatar);
        li.appendChild(nameSpan);

        li.onmouseenter = () => {
            if (!li.classList.contains('selected')) {
                li.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            }
        };

        li.onmouseleave = () => {
            if (!li.classList.contains('selected')) {
                li.style.backgroundColor = 'transparent';
            }
        };

        li.onclick = () => {
            const currentSelected = targetList.querySelector('.selected');
            if (currentSelected) {
                currentSelected.classList.remove('selected');
                currentSelected.style.backgroundColor = 'transparent';
                currentSelected.style.borderColor = 'transparent';
            }
            li.classList.add('selected');
            li.style.backgroundColor = 'rgba(0, 123, 255, 0.2)';
            li.style.borderColor = 'var(--accent-color, #007bff)';
            selectedForwardTarget = { id: item.id, type: item.type, name: item.name };
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
        };
        targetList.appendChild(li);
    });
}

async function handleConfirmForward() {
    if (!messageToForward || !selectedForwardTarget) {
        if (window.uiHelperFunctions && window.uiHelperFunctions.showToastNotification) {
            window.uiHelperFunctions.showToastNotification('错误：未选择消息或转发目标。', 'error');
        }
        return;
    }

    const additionalComment = document.getElementById('forwardAdditionalComment').value.trim();
    
    try {
        // Use the message content directly from messageToForward
        const originalMessage = messageToForward;

        let forwardedContent = '';
        const senderName = originalMessage.name || (originalMessage.role === 'user' ? '用户' : '助手');
        forwardedContent += `> 转发自 **${senderName}** 的消息:\n\n`;
        
        let originalText = '';
        if (typeof originalMessage.content === 'string') {
            originalText = originalMessage.content;
        } else if (originalMessage.content && typeof originalMessage.content.text === 'string') {
            originalText = originalMessage.content.text;
        } else if (Array.isArray(originalMessage.content)) {
            // Handle multimodal content (array of content parts)
            const textParts = originalMessage.content.filter(part => part.type === 'text');
            originalText = textParts.map(part => part.text).join('\n');
        }
        
        forwardedContent += originalText;

        if (additionalComment) {
            forwardedContent += `\n\n---\n${additionalComment}`;
        }

        const attachments = originalMessage.attachments || [];

        // Use chatManager's handleForwardMessage if available
        if (window.chatManager && typeof window.chatManager.handleForwardMessage === 'function') {
            await window.chatManager.handleForwardMessage(selectedForwardTarget, forwardedContent, attachments);
            if (window.uiHelperFunctions && window.uiHelperFunctions.showToastNotification) {
                window.uiHelperFunctions.showToastNotification(`消息已转发给 ${selectedForwardTarget.name}`, 'success');
            }
        } else {
            if (window.uiHelperFunctions && window.uiHelperFunctions.showToastNotification) {
                window.uiHelperFunctions.showToastNotification('转发功能尚未完全实现。', 'error');
            }
            console.error('chatManager.handleForwardMessage is not defined');
        }

        closeForwardModal();
    } catch (error) {
        console.error('[handleConfirmForward] Error:', error);
        if (window.uiHelperFunctions && window.uiHelperFunctions.showToastNotification) {
            window.uiHelperFunctions.showToastNotification(`转发失败: ${error.message}`, 'error');
        }
    }
}

function closeForwardModal() {
    const modal = document.getElementById('forwardMessageModal');
    if (modal) {
        modal.style.display = 'none';
    }
    messageToForward = null;
    selectedForwardTarget = null;
}

// Expose forward functions globally
window.showForwardModal = showForwardModal;
window.closeForwardModal = closeForwardModal;

// ==================== 话题相关函数 ====================

// 话题右键菜单函数
function showTopicContextMenuInRenderer(event, topicItemElement, topic, ownerId, ownerName) {
  // 关闭已存在的菜单
  closeTopicContextMenuInRenderer();

  const menu = document.createElement('div');
  menu.id = 'topicContextMenuRenderer';
  menu.classList.add('context-menu');

  const isLocked = topic.locked === true; // 只有明确为 true 时才是锁定

  // 编辑话题标题
  const editTitleOption = document.createElement('div');
  editTitleOption.classList.add('context-menu-item');
  if (isLocked) {
    editTitleOption.classList.add('disabled');
  }
  editTitleOption.innerHTML = `<i class="fas fa-edit"></i> 编辑话题标题`;
  editTitleOption.onclick = async () => {
    if (isLocked) {
      await window.ModalManager.warning('请先解锁话题才能编辑标题', '话题已锁定');
      return;
    }
    closeTopicContextMenuInRenderer();
    const newTitle = await window.showInputModal('编辑话题标题', '请输入新的话题标题:', topic.name, '话题标题');
    if (newTitle && newTitle !== topic.name) {
      try {
        // 判断是助手还是群组
        const isAgent = ownerId.startsWith('_Agent_');
        const commandName = isAgent ? 'rename_topic' : 'rename_group_topic';
        const paramName = isAgent ? 'agentId' : 'groupId';
        
        //console.log('[TopicMenu] Calling', commandName, 'with:', { [paramName]: ownerId, topicId: topic.id, newName: newTitle });
        
        const result = await invoke(commandName, { 
          [paramName]: ownerId, 
          topicId: topic.id, 
          newName: newTitle 
        });
        
        //console.log('[TopicMenu]', commandName, 'result:', result);
        
        if (result && result.success) {
          // 更新本地数据
          topic.name = newTitle;
          const titleEl = topicItemElement.querySelector('.topic-title');
          if (titleEl) titleEl.textContent = newTitle;
          // 如果当前正在查看这个话题，更新标题
          if (currentTopicId === topic.id) {
            const headerTitle = document.getElementById('currentChatAgentName');
            if (headerTitle) {
              headerTitle.textContent = newTitle;
            }
          }
          
          // 刷新话题列表 - 判断当前在哪个标签页
          const topicsTab = document.getElementById('topicsTab');
          const isTopicsTabActive = topicsTab && topicsTab.classList.contains('active');
          
          if (isTopicsTabActive) {
            // 在"话题"标签页，刷新所有话题
            await loadAllTopics();
          } else {
            // 在助手/群聊标签页，通过重新选择当前项来刷新话题列表
            const isAgent = ownerId.startsWith('_Agent_');
            const ownerType = isAgent ? 'agent' : 'group';
            if (window.chatManager && typeof window.chatManager.selectItem === 'function') {
              await window.chatManager.selectItem(ownerId, ownerType);
            } else if (window.topicListManager && typeof window.topicListManager.loadTopicList === 'function') {
              await window.topicListManager.loadTopicList();
            }
          }
        } else {
          const errorMsg = result?.error || result?.message || '未知错误';
          console.error('[TopicMenu] Backend returned error:', errorMsg);
          await window.ModalManager.error(`更新失败: ${errorMsg}`);
        }
      } catch (err) {
        console.error('[TopicMenu] 重命名话题失败:', err);
        await window.ModalManager.error(`更新失败: ${err.message || err}`);
      }
    }
  };
  menu.appendChild(editTitleOption);

  // 锁定/解锁话题
  const toggleLockOption = document.createElement('div');
  toggleLockOption.classList.add('context-menu-item');
  toggleLockOption.innerHTML = isLocked
    ? `<i class="fas fa-unlock"></i> 解锁此话题`
    : `<i class="fas fa-lock"></i> 锁定此话题`;
  toggleLockOption.onclick = async () => {
    closeTopicContextMenuInRenderer();
    try {
      // 判断是助手还是群组
      const isAgent = ownerId.startsWith('_Agent_');
      const commandName = isAgent ? 'toggle_topic_lock' : 'toggle_group_topic_lock';
      const paramName = isAgent ? 'agentId' : 'groupId';
      
      //console.log('[TopicMenu] Calling', commandName, 'with:', { [paramName]: ownerId, topicId: topic.id });
      const result = await invoke(commandName, { 
        [paramName]: ownerId, 
        topicId: topic.id 
      });
      //console.log('[TopicMenu]', commandName, 'result:', result);
      
      if (result && result.success) {
        topic.locked = result.locked;
        
        // 直接更新 DOM 中的锁图标，而不是重新加载整个列表
        //console.log('[TopicMenu] Updating lock icon in DOM');
        //console.log('[TopicMenu] topicItemElement:', topicItemElement);
        //console.log('[TopicMenu] topic.id:', topic.id);
        
        // 查找话题项元素
        const topicItem = topicItemElement || document.querySelector(`[data-topic-id="${topic.id}"]`);
        //console.log('[TopicMenu] Found topicItem:', topicItem);
        
        if (topicItem) {
          // 移除现有的锁图标或消息数量（处理两种可能的类名）
          const existingLockIcon = topicItem.querySelector('.lock-indicator');
          const existingMessageCount = topicItem.querySelector('.message-count');
          const existingTopicMessageCount = topicItem.querySelector('.topic-message-count');
          
          if (result.locked) {
            // 锁定：移除所有消息数量元素，添加锁图标
            if (existingMessageCount) {
              existingMessageCount.remove();
            }
            if (existingTopicMessageCount) {
              existingTopicMessageCount.remove();
            }
            if (!existingLockIcon) {
              const lockIndicator = document.createElement('span');
              lockIndicator.classList.add('lock-indicator');
              lockIndicator.textContent = '🔒'; // 使用 Unicode emoji
              lockIndicator.title = '话题已锁定，AI无法访问';
              
              // 插入到删除按钮之前，或者添加到 topic-header 中
              const topicHeader = topicItem.querySelector('.topic-header');
              const deleteBtn = topicItem.querySelector('.topic-delete-btn');
              
              if (topicHeader) {
                topicHeader.appendChild(lockIndicator);
              } else if (deleteBtn) {
                topicItem.insertBefore(lockIndicator, deleteBtn);
              } else {
                topicItem.appendChild(lockIndicator);
              }
            }
          } else {
            // 解锁：移除锁图标，显示或更新消息数量
            if (existingLockIcon) {
              existingLockIcon.remove();
            }
            
            // 优先使用 topic-message-count，如果不存在则使用 message-count
            let messageCountSpan = existingTopicMessageCount || existingMessageCount;
            if (!messageCountSpan) {
              messageCountSpan = document.createElement('span');
              messageCountSpan.classList.add('topic-message-count');
              messageCountSpan.dataset.topicId = topic.id;
              messageCountSpan.textContent = '...';
              
              // 尝试添加到 topic-header，如果不存在则添加到删除按钮之前
              const topicHeader = topicItem.querySelector('.topic-header');
              const deleteBtn = topicItem.querySelector('.topic-delete-btn');
              
              if (topicHeader) {
                topicHeader.appendChild(messageCountSpan);
              } else if (deleteBtn) {
                topicItem.insertBefore(messageCountSpan, deleteBtn);
              } else {
                topicItem.appendChild(messageCountSpan);
              }
            } else {
              // 如果已存在，重置为加载状态
              messageCountSpan.textContent = '...';
            }
            
            // 异步加载消息数量
            (async () => {
              try {
                const historyResult = await invoke('get_chat_history', { 
                  agentId: ownerId, 
                  topicId: topic.id 
                });
                if (historyResult && Array.isArray(historyResult)) {
                  messageCountSpan.textContent = `${historyResult.length}`;
                }
              } catch (e) {
                messageCountSpan.textContent = 'ERR';
              }
            })();
          }
          
          //console.log('[TopicMenu] Lock icon updated successfully');
        } else {
          console.warn('[TopicMenu] Topic item element not found, cannot update lock icon');
        }
      } else {
        const errorMsg = result?.error || result?.message || '未知错误';
        console.error('[TopicMenu] toggle_topic_lock error:', errorMsg);
        await window.ModalManager.error(`操作失败: ${errorMsg}`);
      }
    } catch (err) {
      console.error('[TopicMenu] 切换话题锁定状态失败:', err);
      await window.ModalManager.error(`操作失败: ${err.message || err}`);
    }
  };
  menu.appendChild(toggleLockOption);

  // 标记为未读/已读
  const toggleUnreadOption = document.createElement('div');
  toggleUnreadOption.classList.add('context-menu-item');
  if (isLocked) {
    toggleUnreadOption.classList.add('disabled');
  }
  const isUnread = topic.unread === true;
  toggleUnreadOption.innerHTML = isUnread
    ? `<i class="fas fa-check"></i> 标记为已读`
    : `<i class="fas fa-envelope"></i> 标记为未读`;
  toggleUnreadOption.onclick = async () => {
    if (isLocked) {
      await window.ModalManager.warning('请先解锁话题才能修改未读状态', '话题已锁定');
      return;
    }
    closeTopicContextMenuInRenderer();
    try {
      // 判断是助手还是群组
      const isAgent = ownerId.startsWith('_Agent_');
      const commandName = isAgent ? 'set_topic_unread' : 'set_group_topic_unread';
      const paramName = isAgent ? 'agentId' : 'groupId';
      
      //console.log('[TopicMenu] Calling', commandName, 'with:', { [paramName]: ownerId, topicId: topic.id, unread: !isUnread });
      
      const result = await invoke(commandName, { 
        [paramName]: ownerId, 
        topicId: topic.id, 
        unread: !isUnread 
      });
      
      //console.log('[TopicMenu]', commandName, 'result:', result);
      
      if (result && result.success) {
        topic.unread = result.unread;
        
        // 直接更新 DOM 中的未读状态，而不是重新加载整个列表
        //console.log('[TopicMenu] Updating unread status in DOM');
        
        // 查找话题项元素
        const topicItem = topicItemElement || document.querySelector(`[data-topic-id="${topic.id}"]`);
        if (topicItem) {
          // 查找消息数量元素
          const messageCount = topicItem.querySelector('.message-count, .topic-message-count');
          
          if (messageCount) {
            if (result.unread) {
              // 标记为未读：添加红色样式
              messageCount.classList.add('has-unread');
            } else {
              // 标记为已读：移除红色样式
              messageCount.classList.remove('has-unread');
            }
            //console.log('[TopicMenu] Unread status updated successfully');
          } else {
            console.warn('[TopicMenu] Message count element not found');
          }
        } else {
          console.warn('[TopicMenu] Topic item element not found');
        }
      } else {
        const errorMsg = result.error || result.message || '未知错误';
        console.error('[TopicMenu] set_topic_unread error:', errorMsg);
        await window.ModalManager.error(`操作失败: ${errorMsg}`);
      }
    } catch (err) {
      console.error('[TopicMenu] 设置话题未读状态失败:', err);
      await window.ModalManager.error(`操作失败: ${err.message || err}`);
    }
  };
  menu.appendChild(toggleUnreadOption);

  // 删除话题
  const deleteOption = document.createElement('div');
  deleteOption.classList.add('context-menu-item', 'danger-item');
  if (isLocked) {
    deleteOption.classList.add('disabled');
  }
  deleteOption.innerHTML = `<i class="fas fa-trash-alt"></i> 删除此话题`;
  deleteOption.onclick = async () => {
    if (isLocked) {
      await window.ModalManager.warning('请先解锁话题才能删除', '话题已锁定');
      return;
    }
    closeTopicContextMenuInRenderer();
    const confirmed = await window.ModalManager.confirm(
      `确定要永久删除话题 "${topic.name}" 吗？此操作不可撤销。`, 
      '⚠️ 删除话题'
    );
    if (confirmed) {
      try {
        // 判断是助手还是群组：助手 ID 以 "_Agent_" 开头，其他的都是群组
        const isAgent = ownerId.startsWith('_Agent_');
        const commandName = isAgent ? 'delete_topic' : 'delete_group_topic';
        const paramName = isAgent ? 'agentId' : 'groupId';
        
        //console.log('[TopicMenu] Calling', commandName, 'with:', { [paramName]: ownerId, topicId: topic.id });
        const result = await invoke(commandName, { 
          [paramName]: ownerId, 
          topicId: topic.id 
        });
        //console.log('[TopicMenu]', commandName, 'result:', result);
        
        if (result.success) {
          // 如果删除的是当前话题，清空聊天区域
          if (currentTopicId === topic.id) {
            currentTopicId = null;
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) chatMessages.innerHTML = '';
            const headerTitle = document.getElementById('currentChatAgentName');
            if (headerTitle) headerTitle.textContent = '选择一个话题开始聊天';
          }
          
          // 刷新话题列表 - 判断当前在哪个标签页
          const topicsTab = document.getElementById('topicsTab');
          const isTopicsTabActive = topicsTab && topicsTab.classList.contains('active');
          
          if (isTopicsTabActive) {
            // 在"话题"标签页，刷新所有话题
            await loadAllTopics();
          } else {
            // 在助手/群聊标签页，刷新左侧话题列表
            // 通过重新选择当前项来刷新话题列表
            //console.log('[TopicMenu] Re-selecting current item to refresh topic list');
            const ownerType = isAgent ? 'agent' : 'group';
            if (window.chatManager && typeof window.chatManager.selectItem === 'function') {
              // 使用 chatManager.selectItem 重新选择当前项
              await window.chatManager.selectItem(ownerId, ownerType);
            } else if (window.topicListManager && typeof window.topicListManager.loadTopicList === 'function') {
              // 如果 chatManager 不可用，直接调用 loadTopicList
              await window.topicListManager.loadTopicList();
            }
          }
        } else {
          const errorMsg = result.error || result.message || '未知错误';
          console.error('[TopicMenu]', commandName, 'error:', errorMsg);
          await window.ModalManager.error(`删除失败: ${errorMsg}`);
        }
      } catch (err) {
        console.error('[TopicMenu] 删除话题失败:', err);
        await window.ModalManager.error(`删除失败: ${err.message || err}`);
      }
    }
  };
  menu.appendChild(deleteOption);

  // 导出话题
  const exportOption = document.createElement('div');
  exportOption.classList.add('context-menu-item');
  if (isLocked) {
    exportOption.classList.add('disabled');
  }
  exportOption.innerHTML = `<i class="fas fa-file-export"></i> 导出此话题`;
  exportOption.onclick = async () => {
    if (isLocked) {
      await window.ModalManager.warning('请先解锁话题才能导出', '话题已锁定');
      return;
    }
    closeTopicContextMenuInRenderer();
    try {
      // 如果不是当前话题，先加载它
      if (topic.id !== currentTopicId) {
        //console.log(`[TopicMenu] Topic ${topic.id} is not currently loaded. Loading it first...`);
        try {
          // 调用 selectTopic 来加载话题
          await selectTopic(ownerId, topic.id, topic.name);
          
          // 等待一小段时间让消息渲染完成
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error('[TopicMenu] Failed to load topic before export:', error);
          await window.ModalManager.error('加载话题失败，无法导出。');
          return;
        }
      }
      
      //console.log(`[TopicMenu] Exporting topic: ${topic.name} (ID: ${topic.id})`);
      
      const chatMessagesDiv = document.getElementById('chatMessages');
      if (!chatMessagesDiv) {
        console.error('[Export] chatMessagesDiv not found!');
        await window.ModalManager.error('错误：找不到聊天内容容器。');
        return;
      }

      const messageItems = chatMessagesDiv.querySelectorAll('.message-item');
      //console.log(`[Export] Found ${messageItems.length} message items.`);
      
      if (messageItems.length === 0) {
        await window.ModalManager.info('此话题没有可见的聊天内容可导出。');
        return;
      }

      let markdownContent = `# 话题: ${topic.name}\n\n`;
      let extractedCount = 0;

      messageItems.forEach((item, index) => {
        // 跳过系统消息和思考消息
        if (item.classList.contains('system') || item.classList.contains('thinking')) {
          //console.log(`[Export] Skipping system/thinking message at index ${index}.`);
          return;
        }

        const senderElement = item.querySelector('.sender-name');
        const contentElement = item.querySelector('.md-content');

        if (senderElement && contentElement) {
          const sender = senderElement.textContent.trim().replace(':', '');
          let content = contentElement.innerText || contentElement.textContent || "";
          content = content.trim();

          if (sender && content) {
            markdownContent += `**${sender}**: ${content}\n\n---\n\n`;
            extractedCount++;
          } else {
            //console.log(`[Export] Skipping message at index ${index} due to empty sender or content.`);
          }
        } else {
          //console.log(`[Export] Skipping message at index ${index} because sender or content element was not found.`);
        }
      });

      //console.log(`[Export] Extracted ${extractedCount} messages. Final markdown length: ${markdownContent.length}`);

      if (extractedCount === 0) {
        await window.ModalManager.warning('未能从当前话题中提取任何有效对话内容。');
        return;
      }

      // 调用后端导出
      //console.log('[TopicMenu] Calling export_topic_as_markdown');
      const result = await invoke('export_topic_as_markdown', {
        topicName: topic.name,
        markdownContent: markdownContent
      });

      if (result && result.success) {
        try {
          // 尝试使用 File System Access API（如果支持）
          if ('showSaveFilePicker' in window) {
            const handle = await window.showSaveFilePicker({
              suggestedName: result.filename,
              types: [{
                description: 'Markdown 文件',
                accept: { 'text/markdown': ['.md'] }
              }]
            });
            const writable = await handle.createWritable();
            await writable.write(result.content);
            await writable.close();
            await window.ModalManager.success(`话题 "${topic.name}" 已成功导出`);
          } else {
            // 回退到直接下载
            const blob = new Blob([result.content], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = result.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            await window.ModalManager.success(`话题 "${topic.name}" 已成功导出到下载文件夹`);
          }
        } catch (err) {
          // 用户取消了保存
          if (err.name !== 'AbortError') {
            throw err;
          }
        }
      } else {
        const errorMsg = result?.error || '未知错误';
        await window.ModalManager.error(`导出话题失败: ${errorMsg}`);
      }
    } catch (error) {
      console.error(`[TopicMenu] 导出话题时发生错误:`, error);
      await window.ModalManager.error(`导出话题时发生错误: ${error.message || error}`);
    }
  };
  menu.appendChild(exportOption);

  // 定位菜单
  menu.style.visibility = 'hidden';
  menu.style.position = 'fixed';
  document.body.appendChild(menu);

  const menuWidth = menu.offsetWidth;
  const menuHeight = menu.offsetHeight;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  let top = event.clientY;
  let left = event.clientX;

  if (top + menuHeight > windowHeight) {
    top = event.clientY - menuHeight;
    if (top < 0) top = 5;
  }
  if (left + menuWidth > windowWidth) {
    left = event.clientX - menuWidth;
    if (left < 0) left = 5;
  }

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
  menu.style.visibility = 'visible';

  // 点击外部关闭菜单
  setTimeout(() => {
    document.addEventListener('click', closeTopicContextMenuOnClickOutsideRenderer, true);
  }, 0);
}

function closeTopicContextMenuInRenderer() {
  const existingMenu = document.getElementById('topicContextMenuRenderer');
  if (existingMenu) {
    existingMenu.remove();
    document.removeEventListener('click', closeTopicContextMenuOnClickOutsideRenderer, true);
  }
}

function closeTopicContextMenuOnClickOutsideRenderer(event) {
  // 🔧 修复：忽略 contextmenu 事件，只处理真正的点击
  if (event.type === 'contextmenu') {
    return;
  }
  
  const menu = document.getElementById('topicContextMenuRenderer');
  if (menu && !menu.contains(event.target)) {
    closeTopicContextMenuInRenderer();
  }
}

// 更新话题列表UI（当前选中助手下的话题）
function updateTopicListUI(topics) {
  const topicList = document.getElementById('topicList');
  if (!topicList) {
    return;
  }
  
  // 清空当前话题列表
  topicList.innerHTML = '';
  
  // 过滤掉不需要在列表中展示的默认话题（例如“主要对话”）
  const visibleTopics = (topics || []).filter(t => t.name !== '主要对话');
  
  // 检查topics是否为空
  if (!visibleTopics || visibleTopics.length === 0) {
    const emptyMessage = document.createElement('li');
    emptyMessage.textContent = '暂无话题';
    emptyMessage.style.textAlign = 'center';
    emptyMessage.style.color = 'var(--secondary-text)';
    topicList.appendChild(emptyMessage);
    return;
  }
  
  // 添加话题到列表（统一卡片布局，与所有话题列表一致）
  visibleTopics.forEach(topic => {
    const li = document.createElement('li');
    li.classList.add('topic-item');
    li.dataset.topicId = topic.id;
    // owner id/name：优先使用 topic 内的信息，否则使用当前上下文
    const ownerId = topic.agentId || currentAgentId;
    let ownerName = topic.agentName || '';
    if (!ownerName) {
      const agentEl = document.querySelector('.agent-item.active .agent-name');
      const groupEl = document.querySelector('.group-item.active .group-name');
      ownerName = agentEl ? agentEl.textContent : (groupEl ? groupEl.textContent : (document.getElementById('currentChatAgentName')?.textContent || ''));
      // 如果 header 为 "与 X 聊天中"，提取 X
      const match = ownerName.match(/与\s+(.+)\s+聊天中/);
      if (match) ownerName = match[1];
    }

    // 使用更健壮的日期解析函数
    const date = parseTopicDate(topic.created_at);

    const timeFromCreatedAt = date.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: false 
    });
    const dateString = date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric'
    });

    // 拆分标题中可能携带的时间后缀，例如 "新话题 17:15:18"
    const { title, time } = splitTopicTitleAndTime(topic.name || '');
    const finalTitle = title || topic.name;
    const finalTime = time || timeFromCreatedAt;

    // 根据锁定状态决定显示锁图标还是消息数量
    const isLocked = topic.locked === true;
    const countOrLockHtml = isLocked 
      ? '<span class="lock-indicator" title="话题已锁定，AI无法访问">🔒</span>'
      : `<span class="topic-message-count" data-topic-id="${topic.id}">...</span>`;

    li.innerHTML = `
      <div class="topic-header">
        <div class="topic-title">${escapeHtml(finalTitle)}</div>
        ${countOrLockHtml}
      </div>
      <div class="topic-meta">
        <span class="topic-agent">${escapeHtml(ownerName)}</span>
        <span class="topic-time">${dateString} ${finalTime}</span>
      </div>
      ${topic.unread ? '<div class="unread-indicator"></div>' : ''}
    `;

    // 异步加载消息数量（只在未锁定时）
    if (!isLocked) {
      (async () => {
        try {
          const invoke = await getInvoke();
          const history = await invoke('get_chat_history', { agentId: ownerId, topicId: topic.id });
          const countEl = li.querySelector('.topic-message-count');
          if (countEl && history && Array.isArray(history)) {
            countEl.textContent = history.length;
          } else if (countEl) {
            countEl.textContent = '0';
          }
        } catch (err) {
          console.error('[Topics Tab] Failed to load message count:', err);
          const countEl = li.querySelector('.topic-message-count');
          if (countEl) countEl.textContent = 'ERR';
        }
      })();
    }

    // 点击行为：使用 topic 所属 ownerId（agentId 或 groupId）
    li.addEventListener('click', async () => {
      document.querySelectorAll('#topicList li').forEach(el => el.classList.remove('is-selected'));
      li.classList.add('is-selected');
      await selectTopic(ownerId, topic.id, topic.name);
    });

    // 右键菜单
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTopicContextMenuInRenderer(e, li, topic, ownerId, ownerName);
    });

    // 如果是当前选中的话题，添加选中类
    if (topic.id === currentTopicId) {
      li.classList.add('is-selected');
    }

    topicList.appendChild(li);
  });
  // 输出 topic 列表的 HTML 源到日志以便排查（不阻塞 UI）
  try {

  } catch (e) {
    __origConsole.warn('Failed to log topic list HTML:', e);
  }
}

// 选择话题（既适用于"所有话题"列表，也适用于某个助手下的话题列表）
async function selectTopic(agentId, topicId, topicName) {
  // 如果 chatManager 可用，先确保 agent/group 被选中，然后使用它的 selectTopic 方法
  if (window.chatManager) {
    try {
      // 检查当前选中的 item 是否匹配
      const currentItem = window.chatManager.getCurrentSelectedItem ? window.chatManager.getCurrentSelectedItem() : null;
      
      // 如果当前没有选中 item 或者 agentId 不匹配，需要先选中 agent/group
      if (!currentItem || currentItem.id !== agentId) {
        // 判断是助手还是群组
        const isAgent = agentId.startsWith('_Agent_');
        const itemType = isAgent ? 'agent' : 'group';
        
        // 尝试通过 selectItem 选中 agent/group
        if (typeof window.chatManager.selectItem === 'function') {
          // 获取配置
          const invoke = await getInvoke();
          const commandName = isAgent ? 'get_agent_config' : 'get_agent_group_config';
          const paramName = isAgent ? 'agentId' : 'groupId';
          
          const config = await invoke(commandName, { [paramName]: agentId }).catch(() => null);
          if (config && !config.error) {
            await window.chatManager.selectItem(agentId, itemType, config.name || agentId, config.avatarUrl, config);
          }
        }
      }
      
      // 现在选择话题
      if (typeof window.chatManager.selectTopic === 'function') {
        await window.chatManager.selectTopic(topicId);
        return;
      }
    } catch (error) {
      console.error('[selectTopic] Failed to use chatManager.selectTopic:', error);
      // 如果失败，继续使用旧的逻辑
    }
  }
  
  // 旧的逻辑（作为回退）
  currentAgentId = agentId;
  currentTopicId = topicId;
  
  // 更新UI以反映选中的话题
  updateSelectedTopicUI(topicId);
  
  // 加载聊天历史
  await loadChatHistory();
  
  // 更新聊天区域标题为所属 Agent/Group 名称（与 selectAgent/selectGroup 保持一致）
  try {
    const currentChatAgentName = document.getElementById('currentChatAgentName');
    if (currentChatAgentName) {
      // 尝试从侧边栏或 DOM 中找到所属名称
      let ownerName = '';
      const agentEl = document.querySelector(`.agent-item[data-agent-id="${agentId}"] .agent-name`);
      const groupEl = document.querySelector(`.group-item[data-group-id="${agentId}"] .group-name`);
      if (agentEl) ownerName = agentEl.textContent.trim();
      else if (groupEl) ownerName = groupEl.textContent.trim();
      else {
        // 退化为 header 文本提取
        const headerText = currentChatAgentName.textContent || '';
        const m = headerText.match(/与\s+(.+)\s+聊天中/);
        ownerName = m ? m[1] : (topicName || agentId);
      }
      currentChatAgentName.textContent = `与 ${ownerName} 聊天中`;
    }
  } catch (e) {
    // ignore
  }

  // 点击话题卡片后隐藏“新建话题”按钮（由选中 Agent/Group 时恢复显示）
  try {
    const newTopicBtn = document.getElementById('newTopicBtn');
    if (newTopicBtn) {
      newTopicBtn.style.display = 'none';
      newTopicBtn.setAttribute('aria-hidden', 'true');
    }
  } catch (e) {}

  // 确保输入框和发送按钮是启用的
  if (messageInput) {
    messageInput.disabled = false;
  }
  if (sendMessageBtn) {
    sendMessageBtn.disabled = false;
  }
}

// 更新选中话题的UI
function updateSelectedTopicUI(topicId) {
  const topicElements = document.querySelectorAll('#topicList li');
  topicElements.forEach(element => {
    if (element.dataset.topicId === topicId) {
      element.classList.add('is-selected');
    } else {
      element.classList.remove('is-selected');
    }
  });
}

// 创建新话题
async function createNewTopic(topicName, isBranch = false, locked = true) {
  try {
    const invoke = await getInvoke();
    const newTopic = await invoke('create_new_topic', { 
      agentId: currentAgentId,
      topicName: topicName,
      isBranch: isBranch,
      locked: locked
    });
    
    // 重新加载话题列表
    await loadTopics();
    
    // 选择新创建的话题（确保带上当前 Agent 信息）
    await selectTopic(currentAgentId, newTopic.id, newTopic.name);
    
    return newTopic;
  } catch (error) {
    throw error;
  }
}

// 删除话题
async function deleteTopic(topicId) {
  try {
    const invoke = await getInvoke();
    const remainingTopics = await invoke('delete_topic', { 
      agentId: currentAgentId,
      topicId: topicId
    });
    
    // 重新加载话题列表
    await loadTopics();
    
    // 如果删除的是当前话题，选择第一个话题
    if (topicId === currentTopicId && remainingTopics.length > 0) {
      const first = remainingTopics[0];
      await selectTopic(currentAgentId, first.id, first.name);
    }
    
    return remainingTopics;
  } catch (error) {
    throw error;
  }
}

// 切换话题锁定状态
async function toggleTopicLock(topicId) {
  try {
    const invoke = await getInvoke();
    const isLocked = await invoke('toggle_topic_lock', { 
      agentId: currentAgentId,
      topicId: topicId
    });
    
    // 重新加载话题列表
    await loadTopics();
    
    return isLocked;
  } catch (error) {
    throw error;
  }
}

// 设置话题未读状态
async function setTopicUnread(topicId, unread) {
  try {
    const invoke = await getInvoke();
    const isUnread = await invoke('set_topic_unread', { 
      agentId: currentAgentId,
      topicId: topicId,
      unread: unread
    });
    
    // 重新加载话题列表
    await loadTopics();
    
    return isUnread;
  } catch (error) {
    throw error;
  }
}

// 获取未读话题计数
async function getUnreadTopicCounts() {
  try {
    const invoke = await getInvoke();
    const counts = await invoke('get_unread_topic_counts');
    
    // 更新UI显示未读计数
    updateUnreadCountsUI(counts);
    
    return counts;
  } catch (error) {
    throw error;
  }
}

// 更新未读计数UI
function updateUnreadCountsUI(counts) {
  // 这里可以更新UI元素来显示未读计数
  // 例如，更新侧边栏中的未读消息指示器
}

// 更新附件预览
function updateAttachmentPreview() {
  if (!attachmentPreviewArea) return;
  
  attachmentPreviewArea.innerHTML = '';
  
  if (attachedFiles.length > 0) {
    // 显示预览区域
    attachmentPreviewArea.style.display = 'flex';
    
    const fileList = document.createElement('div');
    fileList.classList.add('file-list');
    
    attachedFiles.forEach((file, index) => {
      const fileItem = document.createElement('div');
      fileItem.classList.add('file-item');
      fileItem.innerHTML = `
        <span class="file-name">${file.name}</span>
        <button class="remove-file-btn" data-index="${index}">×</button>
      `;
      fileList.appendChild(fileItem);
    });
    
    attachmentPreviewArea.appendChild(fileList);
    
    // 添加删除按钮事件监听器
    attachmentPreviewArea.querySelectorAll('.remove-file-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.getAttribute('data-index'));
        attachedFiles.splice(index, 1);
        updateAttachmentPreview();
      });
    });
  } else {
    // 没有附件时隐藏预览区域
    attachmentPreviewArea.style.display = 'none';
  }
}

// 获取文件类型
function getFileType(filename) {
  const extension = filename.split('.').pop().toLowerCase();
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
  const audioExtensions = ['mp3', 'wav', 'ogg', 'flac'];
  const videoExtensions = ['mp4', 'avi', 'mov', 'wmv'];
  
  if (imageExtensions.includes(extension)) return 'image';
  if (audioExtensions.includes(extension)) return 'audio';
  if (videoExtensions.includes(extension)) return 'video';
  return 'document';
}

// 事件监听器
document.addEventListener('DOMContentLoaded', async () => {
  // ============================================================================
  // 禁用所有输入框的自动填充
  // ============================================================================
  document.querySelectorAll('input').forEach(input => {
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
  });
  
  // ============================================================================
  // 首先加载全局设置（必须在其他模块初始化之前）
  // ============================================================================
  try {
    const invoke = await getInvoke();
    const settings = await invoke('get_settings');
    if (settings && typeof settings === 'object') {
      globalSettings = settings;
      window.globalSettings = settings;
      //console.log('[Renderer] Global settings loaded at startup:', Object.keys(settings).length, 'keys');
    }
  } catch (error) {
    console.error('[Renderer] Failed to load global settings at startup:', error);
  }
  
  // ============================================================================
  // 初始化 messageRenderer（必须在 chatManager 之前）
  // ============================================================================
  
  // 等待一小段时间，确保所有模块都已加载
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // messageRenderer 已在 index.html 中静态加载，等待其初始化完成
  let retries = 0;
  while (!window.messageRenderer && retries < 30) {
    await new Promise(resolve => setTimeout(resolve, 100));
    retries++;
  }
  
  // 初始化 messageRenderer
  if (window.messageRenderer && typeof window.messageRenderer.initializeMessageRenderer === 'function') {
    //console.log('[Renderer] 初始化 messageRenderer...');
    //console.log('[Renderer] chatMessages 元素:', chatMessages);
    //console.log('[Renderer] markedInstance:', markedInstance);
    try {
      const invoke = await getInvoke();
      //console.log('[Renderer] invoke 函数:', invoke);
      
      window.messageRenderer.initializeMessageRenderer({
        chatMessagesDiv: chatMessages,
        tauriAPI: {
          invoke: invoke,
          getChatHistory: (agentId, topicId) => invoke('get_chat_history', { agentId, topicId }),
          saveChatHistory: (agentId, topicId, messages) => invoke('save_chat_history', { agentId, topicId, messages }),
          getSettings: () => invoke('get_settings'),
          getAgentConfig: (agentId) => invoke('get_agent_config', { agentId }),
          // 中止请求方法
          interruptVcpRequest: ({ messageId }) => invoke('interrupt_vcp_request', { messageId }),
          interruptGroupRequest: (messageId) => invoke('interrupt_group_request', { messageId }),
        },
        markedInstance: markedInstance || window.marked,
        uiHelper: window.uiHelperFunctions || {
          scrollToBottom: () => {
            if (chatMessages) {
              chatMessages.scrollTop = chatMessages.scrollHeight;
            }
          },
          showToastNotification: (msg, type) => console.log(`[Toast ${type}]: ${msg}`)
        },
        currentChatHistoryRef: {
          get: () => currentChatHistory,
          set: (val) => { currentChatHistory = val; window.currentChatHistory = val; }
        },
        currentSelectedItemRef: {
          get: () => currentSelectedItem,
          set: (val) => { currentSelectedItem = val; window.currentSelectedItem = val; }
        },
        currentTopicIdRef: {
          get: () => currentTopicId,
          set: (val) => { currentTopicId = val; window.currentTopicId = val; }
        },
        globalSettingsRef: {
          get: () => globalSettings,
          set: (val) => { globalSettings = val; window.globalSettings = val; }
        },
        interruptHandler: window.interruptHandler || null, // 使用全局的 interruptHandler
        handleCreateBranch: function() {
          // 延迟调用，确保chatManager已经初始化
          if (window.chatManager && typeof window.chatManager.handleCreateBranch === 'function') {
            return window.chatManager.handleCreateBranch.apply(window.chatManager, arguments);
          } else {
            console.warn('[MessageRenderer] chatManager.handleCreateBranch not available yet');
          }
        }
      });
      
      // 初始化 interruptHandler
      if (window.interruptHandler && typeof window.interruptHandler.initialize === 'function') {
        window.interruptHandler.initialize({
          interruptVcpRequest: ({ messageId }) => invoke('interrupt_vcp_request', { messageId }),
          interruptGroupRequest: (messageId) => invoke('interrupt_group_request', { messageId }),
        });
        //console.log('[Renderer] interruptHandler 初始化成功');
      } else {
        console.warn('[Renderer] interruptHandler 不可用');
      }
      
      //console.log('[Renderer] messageRenderer 初始化成功');
    } catch (error) {
      console.error('[Renderer] messageRenderer 初始化失败:', error);
    }
  } else {
    console.error('[Renderer] 等待后仍未找到 messageRenderer 模块或 initializeMessageRenderer 方法!');
  }
  
  // ============================================================================
  // 初始化 topicListManager
  // ============================================================================
  
  if (window.topicListManager && typeof window.topicListManager.init === 'function') {
    //console.log('[Renderer] Initializing topicListManager...');
    
    try {
      const invoke = await getInvoke();
      const tabContentTopics = document.getElementById('tabContentTopics');
      if (!tabContentTopics) {
        console.error('[Renderer] tabContentTopics element not found!');
      } else {
        //console.log('[Renderer] tabContentTopics element found:', tabContentTopics);
      }
      
      window.topicListManager.init({
        elements: {
          topicListContainer: tabContentTopics,
        },
        tauriAPI: {
          invoke: invoke,
          getChatHistory: (agentId, topicId) => invoke('get_chat_history', { agentId, topicId }),
          getGroupChatHistory: (groupId, topicId) => invoke('get_chat_history', { agentId: groupId, topicId }),
          getAgentConfig: (agentId) => invoke('get_agent_config', { agentId }),
          getAgentGroupConfig: (groupId) => invoke('get_agent_group_config', { groupId }),
          searchTopicsByContent: (ownerId, ownerType, query) => invoke('search_topics_by_content', { ownerId, ownerType, query }),
          deleteTopic: (agentId, topicId) => invoke('delete_topic', { agentId, topicId }),
          deleteGroupTopic: (groupId, topicId) => invoke('delete_group_topic', { groupId, topicId }),
          // Note: Topic ordering is not yet implemented in Tauri backend
          // saveTopicOrder and saveGroupTopicOrder will need to be added to the Rust backend
          toggleTopicLock: (agentId, topicId) => invoke('toggle_topic_lock', { agentId, topicId }),
          setTopicUnread: (agentId, topicId, unread) => invoke('set_topic_unread', { agentId, topicId, unread }),
          exportTopicAsMarkdown: (params) => invoke('export_topic_as_markdown', params),
        },
        refs: {
          currentSelectedItemRef: {
            get: () => currentSelectedItem,
            set: (val) => {
              currentSelectedItem = val;
              window.currentSelectedItem = val;
            }
          },
          currentTopicIdRef: {
            get: () => currentTopicId,
            set: (val) => {
              currentTopicId = val;
              window.currentTopicId = val;
            }
          },
        },
        uiHelper: window.uiHelperFunctions || {},
        mainRendererFunctions: {
          updateCurrentItemConfig: (newConfig) => {
            if (currentSelectedItem.config) {
              currentSelectedItem.config = newConfig;
            } else {
              Object.assign(currentSelectedItem, newConfig);
            }
          },
          handleTopicDeletion: (remainingTopics) => {
            if (window.chatManager && typeof window.chatManager.handleTopicDeletion === 'function') {
              return window.chatManager.handleTopicDeletion(remainingTopics);
            } else {
              console.error('[TopicListManager] chatManager not available for handleTopicDeletion');
            }
          },
          selectTopic: async (ownerId, topicId, topicName) => {
            if (window.chatManager && typeof window.chatManager.selectTopic === 'function') {
              return await window.chatManager.selectTopic(ownerId, topicId, topicName);
            } else {
              console.error('[TopicListManager] chatManager not available for selectTopic');
            }
          },
        }
      });
      
      //console.log('[Renderer] topicListManager initialized successfully');
    } catch (error) {
      console.error('[Renderer] Failed to initialize topicListManager:', error);
    }
  } else {
    console.error('[Renderer] topicListManager module not found!');
  }
  
  // ============================================================================
  // itemListManager 已删除，现在使用 renderer.js 中的 loadAgents 函数
  // ============================================================================
  
  // ============================================================================
  // 初始化 chatManager
  // ============================================================================
  
  if (window.chatManager && typeof window.chatManager.init === 'function') {
    //console.log('[Renderer] Initializing chatManager...');
    
    try {
      // 获取 Tauri invoke 函数
      const invoke = await getInvoke();
      
      // 构建 API 对象（直接使用 Tauri invoke）
      const tauriAPI = {
        invoke: invoke,
        // 聊天历史
        getChatHistory: (agentId, topicId) => 
          invoke('get_chat_history', { agentId: agentId, topicId: topicId }),
        getGroupChatHistory: (groupId, topicId) => 
          invoke('get_chat_history', { agentId: groupId, topicId: topicId }),
        saveChatHistory: (agentId, topicId, messages) => 
          invoke('save_chat_history', { agentId: agentId, topicId: topicId, messages: messages }),
        saveGroupChatHistory: (groupId, topicId, messages) => 
          invoke('save_chat_history', { agentId: groupId, topicId: topicId, messages: messages }),
        // 设置
        getSettings: () => invoke('get_settings'),
        // Agent 配置
        getAgentConfig: (agentId) => 
          invoke('get_agent_config', { agentId: agentId }),
        // 发送到 VCP
        sendToVCP: (vcpUrl, apiKey, messages, modelConfig, messageId, isGroupCall, context) =>
          invoke('send_message_to_vcp', {
            agentId: context?.agentId || null,
            topicId: context?.topicId || null,
            vcpUrl: vcpUrl,
            vcpApiKey: apiKey,
            messages: messages,
            modelConfig: modelConfig,
            messageId: messageId,
            isGroupCall: isGroupCall,
            context: context
          }),
        // 文件处理
        getFileAsBase64: (path) => 
          invoke('get_file_as_base64', { path: path }),
        getLatestCanvasContent: () => 
          invoke('get_latest_canvas_content'),
        // 文件监听（占位符，如果需要的话）
        watcherStart: (path, agentId, topicId) => {
          //console.log('[tauriAPI] watcherStart 被调用（未实现）:', path);
          return Promise.resolve();
        }
      };
      
      // 初始化 chatManager（使用 Tauri API）
      window.chatManager.init({
        tauriAPI: tauriAPI,  // 使用 tauriAPI 命名保持一致性
        uiHelper: window.uiHelperFunctions || {},
        modules: {
          messageRenderer: window.messageRenderer,
          topicListManager: window.topicListManager,
          groupRenderer: window.GroupRenderer
        },
        refs: {
          currentSelectedItemRef: {
            get: () => currentSelectedItem,
            set: (val) => { 
              currentSelectedItem = val; 
              window.currentSelectedItem = val; 
            }
          },
          currentTopicIdRef: {
            get: () => currentTopicId,
            set: (val) => { 
              currentTopicId = val; 
              window.currentTopicId = val; 
            }
          },
          currentChatHistoryRef: {
            get: () => currentChatHistory,
            set: (val) => {
              currentChatHistory = val;
              window.currentChatHistory = val;
            }
          },
          attachedFilesRef: {
            get: () => attachedFiles,
            set: (val) => {
              attachedFiles = val;
              window.attachedFiles = val;
            }
          },
          globalSettingsRef: {
            get: () => globalSettings,
            set: (val) => {
              globalSettings = val;
              window.globalSettings = val;
            }
          }
        },
        elements: {
          messageInput: messageInput,
          chatMessagesDiv: chatMessages,
          sendMessageBtn: sendMessageBtn,
          attachFileBtn: attachFileBtn,
          currentChatNameH3: document.getElementById('currentChatAgentName'),  // 重新获取，确保元素存在
          currentItemActionBtn: document.getElementById('currentItemActionBtn'),
          clearCurrentChatBtn: document.getElementById('clearCurrentChatBtn'),
          attachmentPreviewArea: attachmentPreviewArea
        },
        mainRendererFunctions: {
          updateAttachmentPreview: () => {
            if (window.uiHelperFunctions && window.uiHelperFunctions.updateAttachmentPreview) {
              window.uiHelperFunctions.updateAttachmentPreview(attachedFiles, attachmentPreviewArea);
            }
          },
          displaySettingsForItem: () => {
            if (window.settingsManager && window.settingsManager.displaySettingsForItem) {
              window.settingsManager.displaySettingsForItem();
            }
          },
          loadItems: () => {
            // 使用 loadAgents 代替 itemListManager.loadItems
            if (window.loadAgents && typeof window.loadAgents === 'function') {
              return window.loadAgents();
            }
            return null;
          },
          setCurrentChatHistory: (history) => {
            currentChatHistory = history;
            window.currentChatHistory = history;
          },
          displayTopicTimestampBubble: async (itemId, itemType, topicId) => {
            // 话题时间戳气泡已禁用，直接返回
            return;
          },
          loadTopicList: () => {
            if (window.topicListManager && window.topicListManager.loadTopicList) {
              return window.topicListManager.loadTopicList();
            }
            return null;
          },
          handleTopicDeletion: (remainingTopics) => {
            // 处理话题删除后的逻辑
            if (remainingTopics && remainingTopics.length > 0) {
              // 选择第一个剩余话题
              const firstTopic = remainingTopics[0];
              if (window.chatManager && typeof window.chatManager.selectTopic === 'function') {
                window.chatManager.selectTopic(firstTopic.id);
              }
            } else {
              // 没有剩余话题，清空消息区
              if (window.messageRenderer && typeof window.messageRenderer.clearChat === 'function') {
                window.messageRenderer.clearChat();
              }
              currentTopicId = null;
              window.currentTopicId = null;
            }
          },
          selectTopic: async (ownerId, topicId, topicName) => {
            // 调用 chatManager 的 selectTopic
            if (window.chatManager && typeof window.chatManager.selectTopic === 'function') {
              try {
                await window.chatManager.selectTopic(topicId);
              } catch (error) {
                console.error('[mainRendererFunctions.selectTopic] Error:', error);
              }
            }
          }
        }
      });
      
      //console.log('[Renderer] chatManager 使用 Tauri API 初始化成功');
      
      // 更新 messageRenderer 中的 handleCreateBranch 引用
      if (window.messageRenderer && window.chatManager && typeof window.chatManager.handleCreateBranch === 'function') {
        // 直接更新 messageRenderer 的引用
        if (window.messageRenderer.mainRendererReferences) {
          window.messageRenderer.mainRendererReferences.handleCreateBranch = window.chatManager.handleCreateBranch;
          //console.log('[Renderer] 已更新 messageRenderer 中的 handleCreateBranch 引用');
        }
      }
      
      // 初始化 GroupRenderer
      if (window.GroupRenderer && typeof window.GroupRenderer.init === 'function') {
        window.GroupRenderer.init({
          tauriAPI: tauriAPI,
          messageRenderer: window.messageRenderer,
          globalSettingsRef: {
            get: () => globalSettings,
            set: (val) => { globalSettings = val; window.globalSettings = val; }
          },
          currentSelectedItemRef: {
            get: () => currentSelectedItem,
            set: (val) => { currentSelectedItem = val; window.currentSelectedItem = val; }
          },
          currentTopicIdRef: {
            get: () => currentTopicId,
            set: (val) => { currentTopicId = val; window.currentTopicId = val; }
          },
          currentChatHistoryRef: {
            get: () => currentChatHistory,
            set: (val) => { currentChatHistory = val; window.currentChatHistory = val; }
          },
          uiHelper: window.uiHelperFunctions || {},
          mainRendererElements: {
            chatMessagesDiv: document.getElementById('chatMessages'),
            messageInput: document.getElementById('messageInput'),
            sendMessageBtn: document.getElementById('sendMessageBtn'),
            currentChatAgentNameH3: document.getElementById('currentChatAgentName'),
            currentItemActionBtn: document.getElementById('currentItemActionBtn'),
            selectItemPromptForSettings: document.getElementById('selectItemPromptForSettings'),
            agentSettingsContainer: document.getElementById('agentSettingsContainer'),
            selectedItemNameForSettingsSpan: document.getElementById('selectedItemNameForSettings')
          },
          mainRendererFunctions: {
            setCurrentChatHistory: (history) => {
              currentChatHistory = history;
              window.currentChatHistory = history;
            },
            getAttachedFiles: () => {
              return attachedFiles || [];
            },
            clearAttachedFiles: () => {
              attachedFiles = [];
              if (window.uiHelperFunctions && window.uiHelperFunctions.updateAttachmentPreview) {
                window.uiHelperFunctions.updateAttachmentPreview(attachedFiles, attachmentPreviewArea);
              }
            },
            updateAttachmentPreview: () => {
              if (window.uiHelperFunctions && window.uiHelperFunctions.updateAttachmentPreview) {
                window.uiHelperFunctions.updateAttachmentPreview(attachedFiles, attachmentPreviewArea);
              }
            },
            highlightActiveItem: (itemId, itemType) => {
              // 高亮选中的项目
              if (itemType === 'agent') {
                document.querySelectorAll('.agent-item').forEach(item => {
                  item.classList.toggle('active', item.dataset.agentId === itemId);
                });
                document.querySelectorAll('.group-item').forEach(item => {
                  item.classList.remove('active');
                });
              } else if (itemType === 'group') {
                document.querySelectorAll('.group-item').forEach(item => {
                  item.classList.toggle('active', item.dataset.groupId === itemId);
                });
                document.querySelectorAll('.agent-item').forEach(item => {
                  item.classList.remove('active');
                });
              }
            },
            displayTopicTimestampBubble: async () => { return; },
            loadTopicList: () => {
              if (window.topicListManager && window.topicListManager.loadTopicList) {
                return window.topicListManager.loadTopicList();
              }
              return null;
            },
            handleTopicDeletion: (remainingTopics) => {
              if (remainingTopics && remainingTopics.length > 0) {
                const firstTopic = remainingTopics[0];
                if (window.chatManager && typeof window.chatManager.selectTopic === 'function') {
                  window.chatManager.selectTopic(currentSelectedItem?.id, firstTopic.id, firstTopic.name);
                }
              } else {
                if (window.messageRenderer && typeof window.messageRenderer.clearChat === 'function') {
                  window.messageRenderer.clearChat();
                }
                currentTopicId = null;
                window.currentTopicId = null;
              }
            },
            initializeTopicSortable: (itemId, itemType) => {
              // 话题排序功能
              if (window.topicListManager && typeof window.topicListManager.initializeTopicSortable === 'function') {
                window.topicListManager.initializeTopicSortable(itemId, itemType);
              }
            }
          },
          inviteAgentButtonsContainerRef: {
            get: () => document.getElementById('inviteAgentButtonsContainer'),
            set: () => {}
          }
        });
        //console.log('[Renderer] GroupRenderer initialized successfully');
      } else {
        console.warn('[Renderer] GroupRenderer not available or init method missing');
      }
      
      // 初始化 ChatToolbar
      if (window.ChatToolbar && typeof window.ChatToolbar.init === 'function') {
        window.ChatToolbar.init({
          tauriAPI: tauriAPI,
          currentSelectedItemRef: {
            get: () => currentSelectedItem,
            set: (val) => { currentSelectedItem = val; window.currentSelectedItem = val; }
          },
          currentTopicIdRef: {
            get: () => currentTopicId,
            set: (val) => { currentTopicId = val; window.currentTopicId = val; }
          }
        });
        //console.log('[Renderer] ChatToolbar initialized successfully');
      } else {
        console.warn('[Renderer] ChatToolbar not available or init method missing');
      }
      
      // 初始化 ToolbarVisibility
      if (window.ToolbarVisibility && typeof window.ToolbarVisibility.init === 'function') {
        window.ToolbarVisibility.init();
        //console.log('[Renderer] ToolbarVisibility initialized successfully');
      } else {
        console.warn('[Renderer] ToolbarVisibility not available or init method missing');
      }
      
      // 设置 VCP 流式响应事件监听器
      try {
        await listen('vcp-stream-event', (event) => {
          //console.log('[Renderer] Received vcp-stream-event:', event);
          if (window.chatManager && typeof window.chatManager.handleVcpStreamEvent === 'function') {
            window.chatManager.handleVcpStreamEvent(event.payload);
          } else {
            console.warn('[Renderer] chatManager.handleVcpStreamEvent not available');
          }
        });
        //console.log('[Renderer] VCP stream event listener registered');
      } catch (e) {
        console.error('[Renderer] Failed to register VCP stream event listener:', e);
      }
    } catch (error) {
      console.error('[Renderer] Failed to initialize chatManager:', error);
    }
  } else {
    console.error('[Renderer] chatManager module not found or init method missing!');
  }
  
  // ============================================================================
  // 发送按钮和输入框事件（使用 chatManager）
  // ============================================================================
  
  // 发送按钮点击事件
  sendMessageBtn.addEventListener('click', async () => {
    if (window.chatManager && typeof window.chatManager.handleSendMessage === 'function') {
      try {
        await window.chatManager.handleSendMessage();
      } catch (error) {
        console.error('[Renderer] Error calling chatManager.handleSendMessage:', error);
      }
    } else {
      console.error('[Renderer] chatManager.handleSendMessage not available');
    }
  });
  
  // 输入框回车事件 (Shift+Enter 换行，Enter 发送)
  messageInput.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (window.chatManager && typeof window.chatManager.handleSendMessage === 'function') {
        try {
          await window.chatManager.handleSendMessage();
        } catch (error) {
          console.error('[Renderer] Error calling chatManager.handleSendMessage:', error);
        }
      } else {
        console.error('[Renderer] chatManager.handleSendMessage not available');
      }
    }
  });
  
  // 附件按钮点击事件
  if (attachFileBtn) {
    attachFileBtn.addEventListener('click', () => {
      // 创建文件输入元素
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.multiple = true;
      fileInput.onchange = (e) => {
        const files = Array.from(e.target.files);
        attachedFiles.push(...files);
        updateAttachmentPreview();
      };
      fileInput.click();
    });
  }
  
  // 页面加载完成后获取应用配置（必须在 chatManager 使用设置之前完成）
  await loadAppConfig();
  
  // 初始化主题
  await initializeTheme();
  
  // 设置侧边栏标签切换功能
  setupSidebarTabs();
  
  // 设置主题切换功能
  setupThemeToggle();
  
  // 初始化 settingsManager
  initializeSettingsManager();
  
  // 设置头部操作按钮
  setupHeaderButtons();
  
  // 设置按钮事件监听器
  setupButtonEventListeners();

  // 设置话题刷新按钮
  setupTopicsRefreshButton();
  
  // 设置搜索框事件监听
  setupSearchInputs();
  
  // 设置resizer拖拽调整宽度功能
  setupResizers();
  
  // 设置窗口控制功能
  setupWindowControls();
  
  // 全局禁用默认右键菜单
  document.addEventListener('contextmenu', (e) => {
    // 始终阻止浏览器默认右键菜单
    e.preventDefault();
  }, true); // 使用捕获阶段，确保在所有其他监听器之前阻止默认行为
  
  // 加载Agents和群聊列表
  await loadAgents();
  await loadGroups();
  
  // 加载所有话题
  await loadAllTopics();
  
  // 测试调用
  try {
    const testResult = await invoke('get_agent_topics', { agentId: '_Agent_1765712802993_1765712802993' });
  } catch (error) {
  }
  
  // 只有在成功加载了有效的Agent后才加载初始话题和聊天历史
  if (currentAgentId !== 'default_agent') {
    // 加载聊天历史
    await loadChatHistory();
    
    // 加载话题列表
    await loadTopics();
  }
  
  // 获取未读话题计数
  await getUnreadTopicCounts();
});

// 加载应用配置
async function loadAppConfig() {
  try {
    const invoke = await getInvoke();
    const settings = await invoke('get_settings');
    
    // 将加载的设置保存到全局变量
    if (settings && typeof settings === 'object') {
      globalSettings = settings;
      window.globalSettings = settings;
      //console.log('[APP_INIT] Global settings loaded successfully:', Object.keys(settings).length, 'keys');
    } else {
      console.warn('[APP_INIT] Settings loaded but invalid:', settings);
    }
    
    // 初始化assetLoader调试模式（使用静态导入的 setAssetDebug）
    if (settings && settings.assetDebugMode && typeof setAssetDebug === 'function') {
      try {
        setAssetDebug(settings.assetDebugMode);
        //console.log('[APP_INIT] Asset loader debug mode enabled:', settings.assetDebugMode);
      } catch (e) {
        console.warn('[APP_INIT] Failed to set asset debug mode:', e);
      }
    }
    
    // 这里可以根据配置进行相应的初始化操作
  } catch (error) {
    console.error('Failed to load app config:', error);
  }
}

// 设置侧边栏标签切换功能
function setupSidebarTabs() {
  const tabButtons = document.querySelectorAll('.sidebar-tab-button');
  const tabContents = document.querySelectorAll('.sidebar-tab-content');
  
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.dataset.tab;
      
      // 更新按钮状态
      tabButtons.forEach(btn => btn.classList.toggle('active', btn === button));
      
      // 显示对应的内容区域
      tabContents.forEach(content => {
        const isActive = content.id === `tabContent${targetTab.charAt(0).toUpperCase() + targetTab.slice(1)}`;
        content.classList.toggle('active', isActive);
      });
    });
  });
}

// 设置“话题”页刷新按钮：清空搜索并重新加载全部话题
function setupTopicsRefreshButton() {
  const refreshBtn = document.getElementById('refreshTopicsBtn');
  const searchInput = document.getElementById('topicSearchInput');
  if (!refreshBtn) return;

  refreshBtn.addEventListener('click', async () => {
    try {
      if (searchInput) searchInput.value = '';
      await loadAllTopics();
    } catch (error) {
    }
  });
}

// 设置所有搜索框的事件监听
function setupSearchInputs() {
  // Agent 搜索
  const agentSearchInput = document.getElementById('agentSearchInput');
  if (agentSearchInput) {
    agentSearchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase().trim();
      const agentList = document.getElementById('agentList');
      if (!agentList) return;
      
      const items = agentList.querySelectorAll('li');
      items.forEach(item => {
        const nameElement = item.querySelector('.agent-name');
        if (nameElement) {
          const name = nameElement.textContent.toLowerCase();
          item.style.display = name.includes(searchTerm) ? '' : 'none';
        }
      });
    });
  }

  // 群组搜索
  const groupSearchInput = document.getElementById('groupSearchInput');
  if (groupSearchInput) {
    groupSearchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase().trim();
      const groupList = document.getElementById('groupList');
      if (!groupList) return;
      
      const items = groupList.querySelectorAll('li');
      items.forEach(item => {
        const nameElement = item.querySelector('.group-name');
        if (nameElement) {
          const name = nameElement.textContent.toLowerCase();
          item.style.display = name.includes(searchTerm) ? '' : 'none';
        }
      });
    });
  }

  // 话题搜索
  const topicSearchInput = document.getElementById('topicSearchInput');
  if (topicSearchInput) {
    topicSearchInput.addEventListener('input', async () => {
      await loadAllTopics();
    });
  }
}


function setupThemeToggle() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const sunIcon = document.getElementById('sun-icon');
  const moonIcon = document.getElementById('moon-icon');
  
  if (themeToggleBtn && sunIcon && moonIcon) {
    // 初始化图标显示状态（根据当前主题）
    const isDarkTheme = document.body.classList.contains('dark-theme');
    if (isDarkTheme) {
      sunIcon.style.display = 'block';  // 深色主题显示太阳图标（表示可以切换到浅色）
      moonIcon.style.display = 'none';
    } else {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';  // 浅色主题显示月亮图标（表示可以切换到深色）
    }
    
    // 添加点击事件
    themeToggleBtn.addEventListener('click', () => {
      const isDarkTheme = document.body.classList.contains('dark-theme');
      
      if (isDarkTheme) {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
      } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
      }
      
      // 切换模式后更新背景图片
      updateBackgroundImage();
    });
  }
}

// 设置resizer拖拽调整宽度功能
function setupResizers() {
  const resizerLeft = document.getElementById('resizerLeft');
  const resizerRight = document.getElementById('resizerRight');
  const sidebar = document.querySelector('.sidebar');
  const notificationsSidebar = document.getElementById('notificationsSidebar');
  
  let isResizingLeft = false;
  let isResizingRight = false;
  let startX = 0;
  
  // 左侧resizer（调整sidebar宽度）
  if (resizerLeft && sidebar) {
    resizerLeft.addEventListener('mousedown', (e) => {
      isResizingLeft = true;
      startX = e.clientX;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });
  }
  
  // 右侧resizer（调整notificationsSidebar宽度）
  if (resizerRight && notificationsSidebar) {
    resizerRight.addEventListener('mousedown', (e) => {
      isResizingRight = true;
      startX = e.clientX;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });
  }
  
  // 鼠标移动事件
  document.addEventListener('mousemove', (e) => {
    if (isResizingLeft && sidebar) {
      const deltaX = e.clientX - startX;
      const currentWidth = sidebar.offsetWidth;
      const minWidth = parseInt(getComputedStyle(sidebar).minWidth, 10) || 180;
      const maxWidth = parseInt(getComputedStyle(sidebar).maxWidth, 10) || 600;
      let newWidth = currentWidth + deltaX;
      newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
      sidebar.style.width = `${newWidth}px`;
      startX = e.clientX;
    }
    
    if (isResizingRight && notificationsSidebar) {
      const deltaX = startX - e.clientX; // 注意方向相反
      const currentWidth = notificationsSidebar.offsetWidth;
      const minWidth = parseInt(getComputedStyle(notificationsSidebar).minWidth, 10) || 220;
      const maxWidth = parseInt(getComputedStyle(notificationsSidebar).maxWidth, 10) || 600;
      let newWidth = currentWidth + deltaX;
      newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
      notificationsSidebar.style.width = `${newWidth}px`;
      startX = e.clientX;
    }
  });
  
  // 鼠标释放事件
  document.addEventListener('mouseup', () => {
    if (isResizingLeft || isResizingRight) {
      isResizingLeft = false;
      isResizingRight = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
  });
}

// 初始化 settingsManager
async function initializeSettingsManager() {
  if (!window.settingsManager || typeof window.settingsManager.init !== 'function') {
    console.warn('[Renderer] settingsManager not available');
    return;
  }

  try {
    const invoke = await getInvoke();
    
    // 构建 tauriAPI 对象
    const tauriAPI = {
      invoke: invoke,
      getAgentConfig: (agentId) => invoke('get_agent_config', { agentId: agentId }),
      saveAgentConfig: (agentId, config) => invoke('save_agent_config', { agentId: agentId, config: config }),
      deleteAgent: (agentId) => invoke('delete_agent', { agentId: agentId }),
      getCachedModels: () => invoke('get_cached_models'),
      refreshModels: () => invoke('refresh_models'),
      getSettings: () => invoke('get_settings'),
      saveSettings: (settings) => invoke('save_settings', { settings: settings })
    };

    // 初始化 settingsManager
    window.settingsManager.init({
      tauriAPI: tauriAPI,
      uiHelper: window.uiHelperFunctions || {},
      refs: {
        currentSelectedItemRef: {
          get: () => currentSelectedItem,
          set: (val) => { 
            currentSelectedItem = val; 
            window.currentSelectedItem = val; 
          }
        },
        globalSettingsRef: {
          get: () => globalSettings,
          set: (val) => {
            globalSettings = val;
            window.globalSettings = val;
          }
        }
      },
      mainRendererFunctions: {
        selectItem: (itemId, itemType, itemName, itemAvatarUrl, itemFullConfig) => {
          // 延迟绑定 - chatManager 在调用时会可用
          if (window.chatManager && typeof window.chatManager.selectItem === 'function') {
            return window.chatManager.selectItem(itemId, itemType, itemName, itemAvatarUrl, itemFullConfig);
          } else {
            console.error('[mainRendererFunctions] chatManager.selectItem 不可用');
          }
        },
        highlightActiveItem: (itemId, itemType) => {
          if (window.itemListManager && typeof window.itemListManager.highlightActiveItem === 'function') {
            return window.itemListManager.highlightActiveItem(itemId, itemType);
          }
        },
        loadItems: () => {
          if (window.itemListManager && window.itemListManager.loadItems) {
            return window.itemListManager.loadItems();
          }
          return null;
        },
        setCroppedFile: (type, file) => {
          if (type === 'agent') {
            window.croppedAgentAvatarFile = file;
          }
        }
      },
      elements: {
        agentSettingsContainer: document.getElementById('agentSettingsContainer'),
        groupSettingsContainer: document.getElementById('groupSettingsContainer'),
        selectItemPromptForSettings: document.getElementById('selectItemPromptForSettings'),
        itemSettingsContainerTitle: document.getElementById('itemSettingsContainerTitle'),
        selectedItemNameForSettingsSpan: document.getElementById('selectedItemNameForSettings'),
        deleteItemBtn: document.getElementById('deleteItemBtn'),
        agentSettingsForm: document.getElementById('agentSettingsForm'),
        editingAgentIdInput: document.getElementById('editingAgentId'),
        agentNameInput: document.getElementById('agentName'),
        agentAvatarInput: document.getElementById('agentAvatar'),
        agentAvatarPreview: document.getElementById('agentAvatarPreview'),
        agentModelInput: document.getElementById('agentModel'),
        agentTemperatureInput: document.getElementById('agentTemperature'),
        agentContextTokenLimitInput: document.getElementById('agentContextTokenLimit'),
        agentMaxOutputTokensInput: document.getElementById('agentMaxOutputTokens'),
        openModelSelectBtn: document.getElementById('openModelSelectBtn'),
        modelSelectModal: document.getElementById('modelSelectModal'),
        modelList: document.getElementById('modelList'),
        modelSearchInput: document.getElementById('modelSearchInput'),
        refreshModelsBtn: document.getElementById('refreshModelsBtn'),
        closeModelSelectBtn: document.getElementById('closeModelSelectBtn'),
        topicSummaryModelInput: document.getElementById('topicSummaryModel'),
        openTopicSummaryModelSelectBtn: document.getElementById('openTopicSummaryModelSelectBtn'),
        agentTtsSpeedSlider: document.getElementById('agentTtsSpeed'),
        ttsSpeedValueSpan: document.getElementById('ttsSpeedValue')
      }
    });

    // 添加模态框关闭按钮事件
    const closeModelSelectBtn = document.getElementById('closeModelSelectBtn');
    if (closeModelSelectBtn) {
      closeModelSelectBtn.addEventListener('click', () => {
        const modelSelectModal = document.getElementById('modelSelectModal');
        if (modelSelectModal) {
          modelSelectModal.style.display = 'none';
        }
      });
    }

    // 点击模态框遮罩层关闭
    const modelSelectModal = document.getElementById('modelSelectModal');
    if (modelSelectModal) {
      modelSelectModal.addEventListener('click', (e) => {
        if (e.target === modelSelectModal) {
          modelSelectModal.style.display = 'none';
        }
      });
    }

    //console.log('[Renderer] settingsManager initialized successfully');
  } catch (error) {
    console.error('[Renderer] Failed to initialize settingsManager:', error);
  }
}

// 设置按钮事件监听器
function setupButtonEventListeners() {
  // 添加助手按钮 - 显示助手设置弹窗
  const addAgentBtn = document.getElementById('addAgentBtn');
  if (addAgentBtn) {
    addAgentBtn.addEventListener('click', () => {
      showSettingsView();
    });
  }
  
  // 添加群聊按钮
  const addGroupBtn = document.getElementById('addGroupBtn');
  if (addGroupBtn) {
    addGroupBtn.addEventListener('click', async () => {
      await handleCreateGroup();
    });
  }
  
  // 清空通知按钮
  const clearNotificationsBtn = document.getElementById('clearNotificationsBtn');
  if (clearNotificationsBtn) {
    clearNotificationsBtn.addEventListener('click', () => {
    });
  }
  
  // 附加文件按钮
  const attachFileBtn = document.getElementById('attachFileBtn');
  if (attachFileBtn) {
    attachFileBtn.addEventListener('click', () => {
    });
  }
}

// 设置窗口控制功能
async function setupWindowControls() {
  const minimizeBtn = document.getElementById('minimize-btn');
  const maximizeBtn = document.getElementById('maximize-btn');
  const restoreBtn = document.getElementById('restore-btn');
  const closeBtn = document.getElementById('close-btn');
  let removeResizeListener = null;
  let appWindow;
  let invoke;

  try {
    appWindow = await getAppWindow();
  } catch (error) {
  }

  try {
    invoke = await getInvoke();
  } catch (error) {
    return;
  }
  

  // 最小化窗口
  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        if (appWindow?.minimize) {
          await appWindow.minimize();
        } else {
          await invoke('minimize_window');
        }
      } catch (error) {
      }
    });
  }

  // 最大化窗口
  if (maximizeBtn) {
    maximizeBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        if (appWindow?.toggleMaximize) {
          await appWindow.toggleMaximize();
        } else {
          await invoke('toggle_maximize_window');
        }
        const isMax = appWindow?.isMaximized ? await appWindow.isMaximized() : false;
        maximizeBtn.style.display = isMax ? 'none' : 'flex';
        restoreBtn.style.display = isMax ? 'flex' : 'none';
      } catch (error) {
      }
    });
  }

  // 还原窗口
  if (restoreBtn) {
    restoreBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        if (appWindow?.toggleMaximize) {
          await appWindow.toggleMaximize();
        } else {
          await invoke('toggle_maximize_window');
        }
        const isMax = appWindow?.isMaximized ? await appWindow.isMaximized() : false;
        restoreBtn.style.display = isMax ? 'flex' : 'none';
        maximizeBtn.style.display = isMax ? 'none' : 'flex';
      } catch (error) {
      }
    });
  }

  // 关闭窗口
  if (closeBtn) {
    closeBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        if (appWindow?.close) {
          await appWindow.close();
        } else {
          await invoke('close_window');
        }
      } catch (error) {
      }
    });
  }

  // 根据窗口状态更新按钮显示
  const syncWindowState = async () => {
    try {
      const isMax = appWindow?.isMaximized ? await appWindow.isMaximized() : false;
      if (maximizeBtn && restoreBtn) {
        maximizeBtn.style.display = isMax ? 'none' : 'flex';
        restoreBtn.style.display = isMax ? 'flex' : 'none';
      }
    } catch (error) {
    }
  };

  // 初始同步
  syncWindowState();

  // 监听尺寸变化自动同步
  if (appWindow?.onResized) {
    appWindow.onResized(() => syncWindowState()).then((unlisten) => {
      removeResizeListener = unlisten;
    });
  }

  // 防止重复绑定时泄漏
  window.addEventListener('beforeunload', () => {
    if (removeResizeListener) removeResizeListener();
  });
}

// 设置头部操作按钮
function setupHeaderButtons() {
  // 全局设置按钮
  const globalSettingsBtn = document.getElementById('globalSettingsBtn');
  if (globalSettingsBtn) {
    globalSettingsBtn.addEventListener('click', () => {
      openGlobalSettingsModal();
    });
  }
  
  // 新建话题按钮（标题右侧，透明样式）
  const newTopicBtn = document.getElementById('newTopicBtn');
  if (newTopicBtn) {
    // 初始隐藏，只有当选中 Agent 或 Group 时才显示
    newTopicBtn.style.display = 'none';
    newTopicBtn.setAttribute('aria-hidden', 'true');

    newTopicBtn.addEventListener('click', async () => {
      try {
        // 通过 chatManager 获取当前选中的项目
        if (!window.chatManager) {
          console.error('[NewTopic] chatManager 不可用');
          uiHelperFunctions.showToastNotification('创建话题功能不可用', 'error');
          return;
        }
        
        // 使用 chatManager 的 getter 方法获取当前选中项目
        const currentSelectedItem = window.chatManager.getCurrentSelectedItem();
        const currentTopicId = window.chatManager.getCurrentTopicId();
        
        //console.log('[NewTopic] 当前选中项目:', currentSelectedItem);
        //console.log('[NewTopic] 当前话题ID:', currentTopicId);
        
        if (!currentSelectedItem || !currentSelectedItem.id) {
          console.error('[NewTopic] 未选中任何项目:', currentSelectedItem);
          // 🔧 修复：提供更友好的错误提示
          if (currentTopicId) {
            uiHelperFunctions.showToastNotification('请重新选择Agent或群聊后再创建话题', 'warning');
          } else {
            uiHelperFunctions.showToastNotification('请先选择一个Agent或群聊', 'error');
          }
          return;
        }
        
        //console.log('[NewTopic] 准备创建新话题，项目类型:', currentSelectedItem.type, '项目ID:', currentSelectedItem.id);
        
        // 使用 chatManager 的标准方法创建新话题
        if (typeof window.chatManager.createNewTopicForItem === 'function') {
          await window.chatManager.createNewTopicForItem(currentSelectedItem.id, currentSelectedItem.type);
        } else {
          console.error('[NewTopic] chatManager.createNewTopicForItem 不可用');
          uiHelperFunctions.showToastNotification('创建话题功能不可用', 'error');
        }
      } catch (error) {
        console.error('创建新话题失败:', error);
        uiHelperFunctions.showToastNotification(`创建话题失败: ${error.message || error}`, 'error');
      }
    });
  }
  
  // 关闭设置按钮
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
      closeSettingsModal();
    });
  }
  
  // 模态框关闭按钮
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => {
      closeSettingsModal();
    });
  }
  
  // 点击遮罩层关闭模态框
  const agentSettingsModal = document.getElementById('agentSettingsModal');
  if (agentSettingsModal) {
    agentSettingsModal.addEventListener('click', (e) => {
      // 如果点击的是遮罩层本身（不是模态框内容），则关闭
      if (e.target === agentSettingsModal) {
        closeSettingsModal();
      }
    });
  }
  
  // ESC 键关闭模态框
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const agentModal = document.getElementById('agentSettingsModal');
      const groupModal = document.getElementById('groupSettingsModal');
      const globalSettingsModal = document.getElementById('globalSettingsModal');
      const themeSelectorModal = document.getElementById('themeSelectorModal');
      if (agentModal && agentModal.style.display === 'flex') {
        closeSettingsModal();
      }
      if (groupModal && groupModal.style.display === 'flex') {
        closeGroupSettingsModal();
      }
      if (globalSettingsModal && globalSettingsModal.style.display === 'flex') {
        closeGlobalSettingsModal();
      }
      if (themeSelectorModal && themeSelectorModal.style.display === 'flex') {
        closeThemeSelectorModal();
      }
    }
  });
  
  // 点击遮罩层关闭群组设置模态框
  const groupSettingsModal = document.getElementById('groupSettingsModal');
  if (groupSettingsModal) {
    groupSettingsModal.addEventListener('click', (e) => {
      if (e.target === groupSettingsModal) {
        closeGroupSettingsModal();
      }
    });
  }

  // 全局设置弹窗相关事件
  const globalSettingsModal = document.getElementById('globalSettingsModal');
  if (globalSettingsModal) {
    globalSettingsModal.addEventListener('click', (e) => {
      if (e.target === globalSettingsModal) {
        closeGlobalSettingsModal();
      }
    });
  }

  // 关闭全局设置按钮
  const closeGlobalSettingsBtn = document.getElementById('closeGlobalSettingsBtn');
  if (closeGlobalSettingsBtn) {
    closeGlobalSettingsBtn.addEventListener('click', () => {
      closeGlobalSettingsModal();
    });
  }

  // 取消全局设置按钮
  const cancelGlobalSettingsBtn = document.getElementById('cancelGlobalSettingsBtn');
  if (cancelGlobalSettingsBtn) {
    cancelGlobalSettingsBtn.addEventListener('click', () => {
      closeGlobalSettingsModal();
    });
  }

  // 全局设置表单提交
  const globalSettingsForm = document.getElementById('globalSettingsForm');
  if (globalSettingsForm) {
    globalSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleGlobalSettingsSubmit();
    });
  }

  // 用户头像上传
  const userAvatarInput = document.getElementById('userAvatarInput');
  if (userAvatarInput) {
    userAvatarInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        // 打开裁剪器
        if (window.uiHelperFunctions && window.uiHelperFunctions.openAvatarCropper) {
          window.uiHelperFunctions.openAvatarCropper(file, async (croppedFile) => {
            // 裁剪确认后的回调：只更新预览并缓存裁剪结果，真正保存由用户点击“保存”触发
            const userAvatarPreview = document.getElementById('userAvatarPreview');
            if (userAvatarPreview) {
              const reader = new FileReader();
              reader.onload = (event) => {
                window.avatarManager.applyAvatarToContext('user', null, event.target.result);
              };
              reader.readAsDataURL(croppedFile);
            }
            if (window.uiHelperFunctions && typeof window.uiHelperFunctions.setCroppedFile === 'function') {
              window.uiHelperFunctions.setCroppedFile('user', croppedFile);
            }
          }, 'user');
        } else {
          // 如果没有裁剪功能，直接更新预览并缓存文件，真正保存由用户点击“保存”触发
          const reader = new FileReader();
          reader.onload = (event) => {
            window.avatarManager.applyAvatarToContext('user', null, event.target.result);
          };
          reader.onloadend = () => {
            if (window.uiHelperFunctions && typeof window.uiHelperFunctions.setCroppedFile === 'function') {
              window.uiHelperFunctions.setCroppedFile('user', file);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    });
  }

  // 用户样式折叠功能
  const userStyleHeader = document.getElementById('userStyleHeader');
  if (userStyleHeader) {
    userStyleHeader.addEventListener('click', () => {
      const collapsible = document.getElementById('userStyleCollapsible');
      if (collapsible) {
        collapsible.classList.toggle('collapsed');
      }
    });
  }

  // 添加网络笔记路径按钮
  const addNetworkNotesPathBtn = document.getElementById('addNetworkNotesPathBtn');
  if (addNetworkNotesPathBtn) {
    addNetworkNotesPathBtn.addEventListener('click', () => {
      addNetworkNotesPath();
    });
  }
  
  // Agent 设置表单提交
  const agentSettingsForm = document.getElementById('agentSettingsForm');
  if (agentSettingsForm) {
    agentSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleAgentSettingsSubmit();
    });
  }
  
  // 删除 Agent 按钮
  const deleteAgentBtn = document.getElementById('deleteAgentBtn');
  if (deleteAgentBtn) {
    deleteAgentBtn.addEventListener('click', async () => {
      await handleDeleteAgent();
    });
  }
  
  // 群组设置表单提交
  const groupSettingsForm = document.getElementById('groupSettingsForm');
  if (groupSettingsForm) {
    groupSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleGroupSettingsSubmit();
    });
  }
  
  // 关闭群组设置模态框按钮
  const closeGroupSettingsBtn = document.getElementById('closeGroupSettingsBtn');
  if (closeGroupSettingsBtn) {
    closeGroupSettingsBtn.addEventListener('click', () => {
      closeGroupSettingsModal();
    });
  }
  
  const closeGroupSettingsModalBtn = document.getElementById('closeGroupSettingsModalBtn');
  if (closeGroupSettingsModalBtn) {
    closeGroupSettingsModalBtn.addEventListener('click', () => {
      closeGroupSettingsModal();
    });
  }
  
  // 删除群组按钮
  const deleteGroupBtn = document.getElementById('deleteGroupBtn');
  if (deleteGroupBtn) {
    deleteGroupBtn.addEventListener('click', async () => {
      await handleDeleteGroup();
    });
  }
  
  // 统一模型开关
  const groupUseUnifiedModel = document.getElementById('groupUseUnifiedModel');
  if (groupUseUnifiedModel) {
    groupUseUnifiedModel.addEventListener('change', (e) => {
      const unifiedModelContainer = document.getElementById('groupUnifiedModelContainer');
      if (unifiedModelContainer) {
        unifiedModelContainer.style.display = e.target.checked ? 'block' : 'none';
      }
    });
  }
  
  // 群聊模式切换
  const groupChatMode = document.getElementById('groupChatMode');
  if (groupChatMode) {
    groupChatMode.addEventListener('change', (e) => {
      toggleMemberTagsVisibility(e.target.value);
    });
  }
  
  // Agent 头像上传
  const agentAvatarInput = document.getElementById('agentAvatarInput');
  if (agentAvatarInput) {
    agentAvatarInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        // 打开裁剪器
        if (window.uiHelperFunctions && window.uiHelperFunctions.openAvatarCropper) {
          window.uiHelperFunctions.openAvatarCropper(file, async (croppedFile) => {
            // 裁剪确认后的回调：只更新预览并缓存裁剪结果，真正保存由设置页的“保存”触发
            const agentAvatarPreview = document.getElementById('agentAvatarPreview');
            if (agentAvatarPreview) {
              const reader = new FileReader();
              reader.onload = (event) => {
                window.avatarManager.applyAvatarToContext('agent', null, event.target.result);
              };
              reader.readAsDataURL(croppedFile);
            }
            // 缓存裁剪文件，等待用户点击“保存”提交
            if (window.uiHelperFunctions && typeof window.uiHelperFunctions.setCroppedFile === 'function') {
              window.uiHelperFunctions.setCroppedFile('agent', croppedFile);
            } else if (typeof mainRendererFunctions !== 'undefined' && mainRendererFunctions.setCroppedFile) {
              mainRendererFunctions.setCroppedFile('agent', croppedFile);
            }
          }, 'agent');
        } else {
          // 如果没有裁剪功能，直接更新预览并缓存文件，真正保存由设置页的“保存”触发
          const reader = new FileReader();
          reader.onload = (event) => {
            window.avatarManager.applyAvatarToContext('agent', null, event.target.result);
          };
          reader.onloadend = () => {
            if (window.uiHelperFunctions && typeof window.uiHelperFunctions.setCroppedFile === 'function') {
              window.uiHelperFunctions.setCroppedFile('agent', file);
            } else if (typeof mainRendererFunctions !== 'undefined' && mainRendererFunctions.setCroppedFile) {
              mainRendererFunctions.setCroppedFile('agent', file);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    });
  }
  
  // 群组头像上传
  const groupAvatarInput = document.getElementById('groupAvatarInput');
  if (groupAvatarInput) {
    groupAvatarInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        // 打开裁剪器
        if (window.uiHelperFunctions && window.uiHelperFunctions.openAvatarCropper) {
          window.uiHelperFunctions.openAvatarCropper(file, async (croppedFile) => {
            // 裁剪确认后的回调：只更新预览并缓存裁剪结果，真正保存由设置页的“保存”触发
            const groupAvatarPreview = document.getElementById('groupAvatarPreview');
            if (groupAvatarPreview) {
              const reader = new FileReader();
              reader.onload = (event) => {
                window.avatarManager.applyAvatarToContext('group', null, event.target.result);
              };
              reader.readAsDataURL(croppedFile);
            }
            if (window.uiHelperFunctions && typeof window.uiHelperFunctions.setCroppedFile === 'function') {
              window.uiHelperFunctions.setCroppedFile('group', croppedFile);
            }
          }, 'group');
        } else {
          // 如果没有裁剪功能，直接更新预览并缓存文件，真正保存由设置页的“保存”触发
          const reader = new FileReader();
          reader.onload = (event) => {
            window.avatarManager.applyAvatarToContext('group', null, event.target.result);
          };
          reader.onloadend = () => {
            if (window.uiHelperFunctions && typeof window.uiHelperFunctions.setCroppedFile === 'function') {
              window.uiHelperFunctions.setCroppedFile('group', file);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    });
  }
  
  // 通知按钮
  const toggleNotificationBtn = document.getElementById('toggleNotificationBtn');
  if (toggleNotificationBtn) {
    toggleNotificationBtn.addEventListener('click', () => {
      const notificationsSidebar = document.getElementById('notificationsSidebar');
      if (notificationsSidebar) {
        notificationsSidebar.classList.toggle('active');
      }
    });
  }
  
  // 监控面板按钮（暂时只是切换通知面板）
  const toggleMonitorBtn = document.getElementById('toggleMonitorBtn');
  if (toggleMonitorBtn) {
    toggleMonitorBtn.addEventListener('click', () => {
      const notificationsSidebar = document.getElementById('notificationsSidebar');
      if (notificationsSidebar) {
        notificationsSidebar.classList.toggle('active');
      }
    });
  }
  
  // 划词翻译按钮
  const toggleSelectionBtn = document.getElementById('toggleSelectionBtn');
  if (toggleSelectionBtn) {
    toggleSelectionBtn.addEventListener('click', () => {
      // TODO: 实现划词翻译功能
    });
  }
  
  // 皮肤切换按钮
  const skinToggleBtn = document.getElementById('skinToggleBtn');
  if (skinToggleBtn) {
    skinToggleBtn.addEventListener('click', () => {
      openThemeSelectorModal();
    });
  }
  
  // 添加主题按钮
  const addThemeBtn = document.getElementById('addThemeBtn');
  if (addThemeBtn) {
    addThemeBtn.addEventListener('click', () => {
      openAddThemeModal();
    });
  }
  
  // 初始化添加主题表单
  initializeAddThemeForm();
  
  // 皮肤选择弹窗关闭按钮
  const closeThemeSelectorBtn = document.getElementById('closeThemeSelectorBtn');
  if (closeThemeSelectorBtn) {
    closeThemeSelectorBtn.addEventListener('click', () => {
      closeThemeSelectorModal();
    });
  }
  
  // 点击弹窗外部关闭
  const themeSelectorModal = document.getElementById('themeSelectorModal');
  if (themeSelectorModal) {
    themeSelectorModal.addEventListener('click', (e) => {
      if (e.target === themeSelectorModal) {
        closeThemeSelectorModal();
      }
    });
  }
  
}

// 初始化 PromptManager
async function initializePromptManager(agentId, config = null) {
  const systemPromptContainer = document.getElementById('systemPromptContainer');
  if (!systemPromptContainer || !window.PromptManager) {
    return;
  }
  
  try {
    // 如果已有实例，先保存当前数据
    if (promptManager) {
      try {
        await promptManager.saveCurrentModeData();
      } catch (e) {
      }
    }
    
    // 如果没有传入配置，则获取 Agent 配置
    let agentConfig = config;
    if (!agentConfig && agentId) {
      const invoke = await getInvoke();
      const agents = await invoke('get_agents');
      const agent = agents.find(a => a.id === agentId);
      if (agent && agent.config) {
        agentConfig = agent.config;
        // 确保是普通对象
        if (agentConfig instanceof Map) {
          agentConfig = Object.fromEntries(agentConfig);
        } else if (typeof agentConfig === 'object' && agentConfig !== null && !Array.isArray(agentConfig)) {
          agentConfig = JSON.parse(JSON.stringify(agentConfig));
        }
      }
    }
    
    // 如果没有配置，使用空对象
    if (!agentConfig || typeof agentConfig !== 'object' || Array.isArray(agentConfig)) {
      agentConfig = {};
    }
    
    // 确保默认选中"原始富文本"模式
    // 如果配置中没有 promptMode 或 promptMode 为空/无效值，强制设置为 'original'
    if (!agentConfig.promptMode || 
        agentConfig.promptMode === '' || 
        agentConfig.promptMode === null || 
        agentConfig.promptMode === undefined ||
        !['original', 'modular', 'preset'].includes(agentConfig.promptMode)) {
      agentConfig.promptMode = 'original';
    }
    
    // 创建 API 适配器
    const tauriAPI = createTauriPromptAPI(agentId || 'new_agent');
    
    
    // 创建新的 PromptManager 实例
    promptManager = new window.PromptManager();
    const initResult = await promptManager.init({
      agentId: agentId || 'new_agent',
      config: agentConfig,
      containerElement: systemPromptContainer,
      tauriAPI: tauriAPI
    });
    
  } catch (error) {
    // 显示错误提示
    const systemPromptContainer = document.getElementById('systemPromptContainer');
    if (systemPromptContainer) {
      systemPromptContainer.innerHTML = `
        <div style="padding: 12px; background: rgba(255, 0, 0, 0.1); border-radius: 8px; color: var(--error-text, #ff6b6b); font-size: 0.85em;">
          系统提示词初始化失败: ${error.message}
        </div>
      `;
    }
  }
}

// 显示设置模态框（创建/编辑模式）
async function showSettingsView(agentId = null) {
  const modal = document.getElementById('agentSettingsModal');
  const settingsTitle = document.getElementById('settingsTitle');
  const editingAgentIdInput = document.getElementById('editingAgentId');
  const deleteAgentBtn = document.getElementById('deleteAgentBtn');
  
  if (!modal) {
    return;
  }
  
  // 显示模态框
  modal.style.display = 'flex';
  
  // 初始化所有折叠区域（默认折叠）
  setupCustomStyleCollapsible();
  
  // 重置所有折叠容器为折叠状态
  const collapsibles = ['customStyleCollapsible', 'paramsCollapsible', 'ttsCollapsible', 'regexCollapsible'];
  collapsibles.forEach(id => {
    const elem = document.getElementById(id);
    if (elem) {
      elem.classList.add('collapsed');
    }
  });
  
  // 如果是编辑模式，加载 Agent 配置
  if (agentId) {
    if (settingsTitle) {
      settingsTitle.textContent = '编辑助手';
    }
    if (editingAgentIdInput) {
      editingAgentIdInput.value = agentId;
    }
    if (deleteAgentBtn) {
      deleteAgentBtn.style.display = 'block';
    }
    // 先加载配置，然后在 loadAgentForEditing 中初始化 PromptManager
    await loadAgentForEditing(agentId);
  } else {
    // 创建模式
    if (settingsTitle) {
      settingsTitle.textContent = '创建助手';
    }
    if (editingAgentIdInput) {
      editingAgentIdInput.value = '';
    }
    if (deleteAgentBtn) {
      deleteAgentBtn.style.display = 'none';
    }
    
    // 清空表单
    const agentSettingsForm = document.getElementById('agentSettingsForm');
    if (agentSettingsForm) {
      agentSettingsForm.reset();
    }
    
    // 重置头像预览
    const agentAvatarPreview = document.getElementById('agentAvatarPreview');
    if (agentAvatarPreview) {
      await window.avatarManager.applyAvatarToContext('agent', null, 'AppData/assets/default_avatar.png');
    }
    
    // 重置正则规则
    currentAgentRegexes = [];
    renderRegexList();
    
    // 重置参数摘要
    updateParamsSummary();
    
    // 初始化 PromptManager（新建模式，使用空配置）
    await initializePromptManager(null, {});
  }
}

// 关闭设置模态框
function closeSettingsModal() {
  const modal = document.getElementById('agentSettingsModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// 设置自定义样式折叠功能
function setupCustomStyleCollapsible() {
  const collapsible = document.getElementById('customStyleCollapsible');
  const header = document.getElementById('customStyleHeader');
  
  if (!collapsible || !header) {
    return;
  }
  
  // 确保默认折叠
  collapsible.classList.add('collapsed');
  
  // 点击头部切换折叠状态
  header.addEventListener('click', () => {
    collapsible.classList.toggle('collapsed');
  });
  
  // 设置颜色输入框同步
  setupColorInputSync();
  
  // 设置重置按钮
  setupResetAvatarColors();
  
  // 设置其他折叠容器
  setupParamsCollapsible();
  setupTtsCollapsible();
  
  // 设置TTS速度滑块
  setupTtsSpeedSlider();
  
  // 设置正则规则管理（包含折叠容器设置）
  setupRegexRules();
}

// 颜色输入框同步
function setupColorInputSync() {
  // 头像外框颜色同步
  const avatarBorderColor = document.getElementById('avatarBorderColor');
  const avatarBorderColorText = document.getElementById('avatarBorderColorText');
  
  if (avatarBorderColor && avatarBorderColorText) {
    // 颜色选择器 -> 文本输入框
    avatarBorderColor.addEventListener('input', (e) => {
      avatarBorderColorText.value = e.target.value.toUpperCase();
    });
    
    // 文本输入框 -> 颜色选择器
    avatarBorderColorText.addEventListener('input', (e) => {
      const value = e.target.value.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
        avatarBorderColor.value = value.toUpperCase();
      }
    });
  }
  
  // 名称文字颜色同步
  const nameTextColor = document.getElementById('nameTextColor');
  const nameTextColorText = document.getElementById('nameTextColorText');
  
  if (nameTextColor && nameTextColorText) {
    // 颜色选择器 -> 文本输入框
    nameTextColor.addEventListener('input', (e) => {
      nameTextColorText.value = e.target.value.toUpperCase();
    });
    
    // 文本输入框 -> 颜色选择器
    nameTextColorText.addEventListener('input', (e) => {
      const value = e.target.value.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
        nameTextColor.value = value.toUpperCase();
      }
    });
  }
  
  // 用户头像外框颜色同步
  const userAvatarBorderColor = document.getElementById('userAvatarBorderColor');
  const userAvatarBorderColorText = document.getElementById('userAvatarBorderColorText');
  
  if (userAvatarBorderColor && userAvatarBorderColorText) {
    userAvatarBorderColor.addEventListener('input', (e) => {
      userAvatarBorderColorText.value = e.target.value.toUpperCase();
    });
    
    userAvatarBorderColorText.addEventListener('input', (e) => {
      const value = e.target.value.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
        userAvatarBorderColor.value = value.toUpperCase();
      }
    });
  }
  
  // 用户名称文字颜色同步
  const userNameTextColor = document.getElementById('userNameTextColor');
  const userNameTextColorText = document.getElementById('userNameTextColorText');
  
  if (userNameTextColor && userNameTextColorText) {
    userNameTextColor.addEventListener('input', (e) => {
      userNameTextColorText.value = e.target.value.toUpperCase();
    });
    
    userNameTextColorText.addEventListener('input', (e) => {
      const value = e.target.value.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
        userNameTextColor.value = value.toUpperCase();
      }
    });
  }
}

// 重置头像颜色按钮
function setupResetAvatarColors() {
  const resetBtn = document.getElementById('resetAvatarColorsBtn');
  const avatarBorderColor = document.getElementById('avatarBorderColor');
  const avatarBorderColorText = document.getElementById('avatarBorderColorText');
  const nameTextColor = document.getElementById('nameTextColor');
  const nameTextColorText = document.getElementById('nameTextColorText');
  
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      // 重置为默认颜色
      const defaultBorderColor = '#3d5a80';
      const defaultTextColor = '#ffffff';
      
      if (avatarBorderColor) {
        avatarBorderColor.value = defaultBorderColor;
      }
      if (avatarBorderColorText) {
        avatarBorderColorText.value = defaultBorderColor.toUpperCase();
      }
      if (nameTextColor) {
        nameTextColor.value = defaultTextColor;
      }
      if (nameTextColorText) {
        nameTextColorText.value = defaultTextColor.toUpperCase();
      }
    });
  }
  
  // 重置用户头像颜色按钮
  const resetUserBtn = document.getElementById('resetUserAvatarColorsBtn');
  const userAvatarBorderColor = document.getElementById('userAvatarBorderColor');
  const userAvatarBorderColorText = document.getElementById('userAvatarBorderColorText');
  const userNameTextColor = document.getElementById('userNameTextColor');
  const userNameTextColorText = document.getElementById('userNameTextColorText');
  
  if (resetUserBtn) {
    resetUserBtn.addEventListener('click', () => {
      const defaultBorderColor = '#3d5a80';
      const defaultTextColor = '#ffffff';
      
      if (userAvatarBorderColor) {
        userAvatarBorderColor.value = defaultBorderColor;
      }
      if (userAvatarBorderColorText) {
        userAvatarBorderColorText.value = defaultBorderColor.toUpperCase();
      }
      if (userNameTextColor) {
        userNameTextColor.value = defaultTextColor;
      }
      if (userNameTextColorText) {
        userNameTextColorText.value = defaultTextColor.toUpperCase();
      }
    });
  }
}

// 设置模型参数折叠功能（只初始化一次）
let paramsCollapsibleInitialized = false;
function setupParamsCollapsible() {
  if (paramsCollapsibleInitialized) return;
  
  const container = document.getElementById('paramsCollapsible');
  const header = document.getElementById('paramsToggleHeader');
  
  if (!container || !header) return;
  
  paramsCollapsibleInitialized = true;
  
  // 确保默认折叠
  container.classList.add('collapsed');
  
  // 点击头部切换折叠状态
  header.addEventListener('click', () => {
    container.classList.toggle('collapsed');
    updateParamsSummary();
  });
  
  // 监听参数变化更新摘要
  const inputs = ['agentTemperature', 'agentContextTokenLimit', 'agentMaxOutputTokens', 'agentTopP', 'agentTopK'];
  inputs.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', updateParamsSummary);
      input.addEventListener('change', updateParamsSummary);
    }
  });
  
  // 监听输出模式变化
  const streamOutputTrue = document.getElementById('agentStreamOutputTrue');
  const streamOutputFalse = document.getElementById('agentStreamOutputFalse');
  if (streamOutputTrue) streamOutputTrue.addEventListener('change', updateParamsSummary);
  if (streamOutputFalse) streamOutputFalse.addEventListener('change', updateParamsSummary);
  
  updateParamsSummary();
}

// 更新参数摘要
function updateParamsSummary() {
  const summary = document.getElementById('paramsSummary');
  if (!summary) return;
  
  const container = document.getElementById('paramsCollapsible');
  if (container && container.classList.contains('collapsed')) {
    const temperature = document.getElementById('agentTemperature')?.value || '0.7';
    const contextLimit = document.getElementById('agentContextTokenLimit')?.value || '4000';
    const maxOutput = document.getElementById('agentMaxOutputTokens')?.value || '1000';
    const topP = document.getElementById('agentTopP')?.value || '未设置';
    const topK = document.getElementById('agentTopK')?.value || '未设置';
    const streamOutput = document.getElementById('agentStreamOutputTrue')?.checked ? '流式' : '非流式';
    
    summary.textContent = `Temperature: ${temperature} | 上下文: ${contextLimit} | 最大输出: ${maxOutput} | Top P: ${topP} | Top K: ${topK} | 输出: ${streamOutput}`;
  } else {
    summary.textContent = '';
  }
}

// 设置TTS折叠功能（只初始化一次）
let ttsCollapsibleInitialized = false;
function setupTtsCollapsible() {
  if (ttsCollapsibleInitialized) return;
  
  const container = document.getElementById('ttsCollapsible');
  const header = document.getElementById('ttsToggleHeader');
  
  if (!container || !header) return;
  
  ttsCollapsibleInitialized = true;
  
  // 确保默认折叠
  container.classList.add('collapsed');
  
  // 点击头部切换折叠状态
  header.addEventListener('click', () => {
    container.classList.toggle('collapsed');
  });
}

// 设置TTS速度滑块
function setupTtsSpeedSlider() {
  const slider = document.getElementById('agentTtsSpeed');
  const valueSpan = document.getElementById('ttsSpeedValue');
  
  if (slider && valueSpan) {
    slider.addEventListener('input', (e) => {
      valueSpan.textContent = parseFloat(e.target.value).toFixed(1);
    });
  }
}

// 正则规则管理
let currentAgentRegexes = [];

// PromptManager 实例
let promptManager = null;

// 创建 Tauri API 适配器（用于 PromptManager）
function createTauriPromptAPI(agentId) {
  return {
    // 加载全局设置
    async loadSettings() {
      try {
        const invoke = await getInvoke();
        const settings = await invoke('get_settings');
        return settings || {};
      } catch (error) {
        return {};
      }
    },
    
    // 保存全局设置
    async saveSettings(settings) {
      try {
        const invoke = await getInvoke();
        await invoke('save_settings', { settings });
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    
    // 更新 Agent 配置
    async updateAgentConfig(agentId, configUpdates) {
      try {
        const invoke = await getInvoke();
        await invoke('update_agent_config', {
          agentId: agentId,
          configUpdates: configUpdates
        });
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    
    // 获取全局仓库
    async getGlobalWarehouse() {
      try {
        const invoke = await getInvoke();
        const result = await invoke('get_global_warehouse');
        return { success: true, data: result || [] };
      } catch (error) {
        return { success: false, error: error.message, data: [] };
      }
    },
    
    // 保存全局仓库
    async saveGlobalWarehouse(data) {
      try {
        const invoke = await getInvoke();
        await invoke('save_global_warehouse', { data });
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    
    // 加载预设提示词列表
    async loadPresetPrompts(presetPath) {
      try {
        const invoke = await getInvoke();
        const result = await invoke('load_preset_prompts', { presetPath });
        return { success: true, data: result || [] };
      } catch (error) {
        return { success: false, error: error.message, data: [] };
      }
    },
    
    // 加载预设内容
    async loadPresetContent(presetPath) {
      try {
        const invoke = await getInvoke();
        const content = await invoke('read_file', { filePath: presetPath });
        return { success: true, content: content || '' };
      } catch (error) {
        return { success: false, error: error.message, content: '' };
      }
    },
    
    // 选择目录（暂时返回空，后续可以实现文件选择对话框）
    async selectDirectory() {
      // TODO: 实现 Tauri 文件选择对话框
      return { success: false, canceled: true };
    }
  };
}

// 设置正则规则管理（只初始化一次）
let regexRulesInitialized = false;
function setupRegexRules() {
  if (regexRulesInitialized) return;
  
  const container = document.getElementById('regexCollapsible');
  const header = document.getElementById('regexToggleHeader');
  const addBtn = document.getElementById('addRegexRuleBtn');
  const regexForm = document.getElementById('regexRuleForm');
  const regexModal = document.getElementById('regexRuleModal');
  const cancelBtn = document.getElementById('cancelRegexRule');
  const closeBtn = document.getElementById('closeRegexRuleModal');
  
  if (!container || !header) return;
  
  regexRulesInitialized = true;
  
  // 确保默认折叠
  container.classList.add('collapsed');
  
  // 点击头部切换折叠状态
  header.addEventListener('click', () => {
    container.classList.toggle('collapsed');
  });
  
  // 添加规则按钮
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      openRegexModal();
    });
  }
  
  // 正则表单提交
  if (regexForm) {
    regexForm.addEventListener('submit', handleRegexFormSubmit);
  }
  
  // 关闭模态框
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeRegexModal);
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', closeRegexModal);
  }
  if (regexModal) {
    regexModal.addEventListener('click', (e) => {
      if (e.target === regexModal) {
        closeRegexModal();
      }
    });
  }
  
  // 初始化正则列表
  renderRegexList();
}

// 打开正则规则模态框
function openRegexModal(ruleData = null) {
  const modal = document.getElementById('regexRuleModal');
  const form = document.getElementById('regexRuleForm');
  const ruleIdInput = document.getElementById('editingRegexRuleId');
  const titleInput = document.getElementById('regexRuleTitleInput');
  const findInput = document.getElementById('regexRuleFind');
  const replaceInput = document.getElementById('regexRuleReplace');
  const modalTitle = document.getElementById('regexRuleTitle');
  
  if (!modal || !form) return;
  
  form.reset();
  
  if (ruleData) {
    // 编辑模式
    if (modalTitle) modalTitle.textContent = '编辑正则规则';
    if (ruleIdInput) ruleIdInput.value = ruleData.id;
    if (titleInput) titleInput.value = ruleData.title || '';
    if (findInput) findInput.value = ruleData.findPattern || '';
    if (replaceInput) replaceInput.value = ruleData.replaceWith || '';
    
    const applyToFrontend = document.getElementById('applyToFrontend');
    const applyToContext = document.getElementById('applyToContext');
    if (applyToFrontend) applyToFrontend.checked = ruleData.applyToFrontend !== false;
    if (applyToContext) applyToContext.checked = ruleData.applyToContext !== false;
    
    const minDepth = document.getElementById('regexRuleMinDepth');
    const maxDepth = document.getElementById('regexRuleMaxDepth');
    if (minDepth) minDepth.value = ruleData.minDepth !== undefined ? ruleData.minDepth : 0;
    if (maxDepth) maxDepth.value = ruleData.maxDepth !== undefined ? ruleData.maxDepth : -1;
  } else {
    // 新建模式
    if (modalTitle) modalTitle.textContent = '添加正则规则';
    if (ruleIdInput) ruleIdInput.value = '';
    const minDepth = document.getElementById('regexRuleMinDepth');
    const maxDepth = document.getElementById('regexRuleMaxDepth');
    if (minDepth) minDepth.value = 0;
    if (maxDepth) maxDepth.value = -1;
  }
  
  modal.style.display = 'flex';
}

// 关闭正则规则模态框
function closeRegexModal() {
  const modal = document.getElementById('regexRuleModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// 处理正则表单提交
function handleRegexFormSubmit(event) {
  event.preventDefault();
  
  const ruleIdInput = document.getElementById('editingRegexRuleId');
  const titleInput = document.getElementById('regexRuleTitleInput');
  const findInput = document.getElementById('regexRuleFind');
  const replaceInput = document.getElementById('regexRuleReplace');
  const applyToFrontend = document.getElementById('applyToFrontend');
  const applyToContext = document.getElementById('applyToContext');
  const minDepth = document.getElementById('regexRuleMinDepth');
  const maxDepth = document.getElementById('regexRuleMaxDepth');
  
  if (!titleInput || !findInput) return;
  
  const id = ruleIdInput?.value || `rule_${Date.now()}`;
  const title = titleInput.value.trim();
  const findPattern = findInput.value.trim();
  
  if (!title || !findPattern) {
    return;
  }
  
  const newRule = {
    id,
    title,
    findPattern,
    replaceWith: replaceInput?.value || '',
    applyToFrontend: applyToFrontend?.checked !== false,
    applyToContext: applyToContext?.checked !== false,
    minDepth: minDepth ? parseInt(minDepth.value, 10) : 0,
    maxDepth: maxDepth ? parseInt(maxDepth.value, 10) : -1
  };
  
  const existingIndex = currentAgentRegexes.findIndex(r => r.id === id);
  if (existingIndex > -1) {
    currentAgentRegexes[existingIndex] = newRule;
  } else {
    currentAgentRegexes.push(newRule);
  }
  
  renderRegexList();
  closeRegexModal();
}

// 渲染正则规则列表
function renderRegexList() {
  const container = document.getElementById('stripRegexListContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (currentAgentRegexes.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.padding = '20px';
    emptyMsg.style.textAlign = 'center';
    emptyMsg.style.color = 'var(--secondary-text)';
    emptyMsg.style.fontSize = '0.85em';
    emptyMsg.textContent = '暂无正则规则，点击"添加规则"创建';
    container.appendChild(emptyMsg);
    return;
  }
  
  currentAgentRegexes.forEach(rule => {
    const row = createRegexRow(rule);
    container.appendChild(row);
  });
}

// 创建正则规则行
function createRegexRow(rule) {
  const row = document.createElement('div');
  row.className = 'strip-regex-row';
  row.dataset.ruleId = rule.id;
  
  const title = document.createElement('span');
  title.className = 'strip-regex-title';
  title.textContent = rule.title || '(无标题)';
  title.title = rule.findPattern || '无查找内容';
  
  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = 'buttons-container';
  
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn-edit-regex';
  editBtn.title = '编辑规则';
  editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
  editBtn.addEventListener('click', () => openRegexModal(rule));
  
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn-delete-regex';
  deleteBtn.title = '删除规则';
  deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
  deleteBtn.addEventListener('click', async () => {
    const confirmed = await customConfirm(`确定要删除规则 "${rule.title}" 吗？`, '⚠️ 删除规则');
    if (confirmed) {
      currentAgentRegexes = currentAgentRegexes.filter(r => r.id !== rule.id);
      renderRegexList();
    }
  });
  
  buttonsContainer.appendChild(editBtn);
  buttonsContainer.appendChild(deleteBtn);
  row.appendChild(title);
  row.appendChild(buttonsContainer);
  
  return row;
}

// 加载 Agent 配置用于编辑
async function loadAgentForEditing(agentId) {
  try {
    const invoke = await getInvoke();
    const agents = await invoke('get_agents');
    const agent = agents.find(a => a.id === agentId);
    
    if (!agent) {
      return;
    }
    
    // 从 agent 对象读取配置（Rust 使用 #[serde(flatten)]，配置字段被展平到 agent 对象顶层）
    // 排除非配置字段：id, name, avatar_url, avatar_calculated_color, topics, config
    const nonConfigKeys = ['id', 'name', 'avatar_url', 'avatar_calculated_color', 'topics', 'config'];
    let config = {};
    
    // 首先尝试从 agent.config 读取（如果存在）
    if (agent.config && typeof agent.config === 'object' && !Array.isArray(agent.config)) {
      config = JSON.parse(JSON.stringify(agent.config));
    }
    
    // 然后从 agent 对象本身提取配置字段（因为 flatten 会展开）
    for (const key in agent) {
      if (!nonConfigKeys.includes(key) && agent.hasOwnProperty(key) && agent[key] !== undefined) {
        config[key] = agent[key];
      }
    }
    
    // 填充基本表单
    const agentNameInput = document.getElementById('agentNameInput');
    if (agentNameInput) {
      agentNameInput.value = agent.name || '';
    }
    
    const agentModelInput = document.getElementById('agentModel');
    if (agentModelInput) {
      agentModelInput.value = config.model || '';
    }
    
    // 设置头像预览
    const agentAvatarPreview = document.getElementById('agentAvatarPreview');
    if (agentAvatarPreview) {
      const rawAvatarUrl = agent.avatar_url || 'AppData/assets/default_avatar.png';
      await window.avatarManager.applyAvatarToContext('agent', agent.id, rawAvatarUrl);
    }
    
    // 加载模型参数
    const temperatureInput = document.getElementById('agentTemperature');
    if (temperatureInput) temperatureInput.value = config.temperature !== undefined ? config.temperature : 0.7;
    
    const contextLimitInput = document.getElementById('agentContextTokenLimit');
    if (contextLimitInput) contextLimitInput.value = config.contextTokenLimit !== undefined ? config.contextTokenLimit : 4000;
    
    const maxOutputInput = document.getElementById('agentMaxOutputTokens');
    if (maxOutputInput) maxOutputInput.value = config.maxOutputTokens !== undefined ? config.maxOutputTokens : 1000;
    
    const topPInput = document.getElementById('agentTopP');
    if (topPInput) topPInput.value = config.top_p !== undefined ? config.top_p : '';
    
    const topKInput = document.getElementById('agentTopK');
    if (topKInput) topKInput.value = config.top_k !== undefined ? config.top_k : '';
    
    const streamOutputTrue = document.getElementById('agentStreamOutputTrue');
    const streamOutputFalse = document.getElementById('agentStreamOutputFalse');
    const streamOutput = config.streamOutput !== undefined ? config.streamOutput : true;
    if (streamOutputTrue) streamOutputTrue.checked = streamOutput === true || String(streamOutput) === 'true';
    if (streamOutputFalse) streamOutputFalse.checked = streamOutput === false || String(streamOutput) === 'false';
    
    // 加载自定义样式
    const avatarBorderColor = document.getElementById('avatarBorderColor');
    const avatarBorderColorText = document.getElementById('avatarBorderColorText');
    const borderColor = config.avatarBorderColor || '#3d5a80';
    if (avatarBorderColor) avatarBorderColor.value = borderColor;
    if (avatarBorderColorText) avatarBorderColorText.value = borderColor.toUpperCase();
    
    const nameTextColor = document.getElementById('nameTextColor');
    const nameTextColorText = document.getElementById('nameTextColorText');
    const textColor = config.nameTextColor || '#ffffff';
    if (nameTextColor) nameTextColor.value = textColor;
    if (nameTextColorText) nameTextColorText.value = textColor.toUpperCase();
    
    const useThemeColorInAssistant = document.getElementById('useThemeColorInAssistant');
    if (useThemeColorInAssistant) useThemeColorInAssistant.checked = config.disableCustomColors || false;
    
    const useThemeColorInChat = document.getElementById('useThemeColorInChat');
    if (useThemeColorInChat) useThemeColorInChat.checked = config.useThemeColorsInChat || false;
    
    const listItemCSS = document.getElementById('listItemCSS');
    if (listItemCSS) listItemCSS.value = config.customCss || '';
    
    const cardStyleCSS = document.getElementById('cardStyleCSS');
    if (cardStyleCSS) cardStyleCSS.value = config.cardCss || '';
    
    const conversationStyleCSS = document.getElementById('conversationStyleCSS');
    if (conversationStyleCSS) conversationStyleCSS.value = config.chatCss || '';
    
    // 加载TTS设置
    const ttsVoicePrimary = document.getElementById('agentTtsVoicePrimary');
    if (ttsVoicePrimary) ttsVoicePrimary.value = config.ttsVoicePrimary || '';
    
    const ttsRegexPrimary = document.getElementById('agentTtsRegexPrimary');
    if (ttsRegexPrimary) ttsRegexPrimary.value = config.ttsRegexPrimary || '';
    
    const ttsVoiceSecondary = document.getElementById('agentTtsVoiceSecondary');
    if (ttsVoiceSecondary) ttsVoiceSecondary.value = config.ttsVoiceSecondary || '';
    
    const ttsRegexSecondary = document.getElementById('agentTtsRegexSecondary');
    if (ttsRegexSecondary) ttsRegexSecondary.value = config.ttsRegexSecondary || '';
    
    const ttsSpeed = document.getElementById('agentTtsSpeed');
    const ttsSpeedValue = document.getElementById('ttsSpeedValue');
    if (ttsSpeed) {
      ttsSpeed.value = config.ttsSpeed !== undefined ? config.ttsSpeed : 1.0;
      if (ttsSpeedValue) ttsSpeedValue.textContent = parseFloat(ttsSpeed.value).toFixed(1);
    }
    
    // 加载正则规则
    currentAgentRegexes = JSON.parse(JSON.stringify(config.stripRegexes || []));
    renderRegexList();
    
    // 更新参数摘要
    updateParamsSummary();
    
    // 初始化 PromptManager（在加载配置后）
    // 确保默认使用"原始富文本"模式（如果没有明确设置或值无效）
    const configForPrompt = { ...config };
    if (!configForPrompt.promptMode || 
        configForPrompt.promptMode === '' || 
        configForPrompt.promptMode === null || 
        configForPrompt.promptMode === undefined ||
        !['original', 'modular', 'preset'].includes(configForPrompt.promptMode)) {
      configForPrompt.promptMode = 'original';
    }
    await initializePromptManager(agentId, configForPrompt);
  } catch (error) {
  }
}

// 处理 Agent 设置表单提交
async function handleAgentSettingsSubmit() {
  try {
    const editingAgentIdInput = document.getElementById('editingAgentId');
    const agentNameInput = document.getElementById('agentNameInput');
    const agentModelInput = document.getElementById('agentModel');
    
    if (!agentNameInput || !agentNameInput.value.trim()) {
      return;
    }
    
    const invoke = await getInvoke();
    const agentName = agentNameInput.value.trim();
    const agentModel = agentModelInput ? agentModelInput.value.trim() : '';
    const editingAgentId = editingAgentIdInput ? editingAgentIdInput.value : '';
    
    // 获取系统提示词配置数据（保存所有模式的数据）
    let promptData = {};
    if (promptManager) {
      try {
        // 先保存当前模式的数据到内存
        await promptManager.saveCurrentModeData();
        // 获取所有模块的配置数据
        promptData = promptManager.getAllConfigData();
        
        // 获取当前提示词（用于兼容性）
        // systemPrompt 是一个计算字段，应该根据当前 promptMode 自动计算
        // 只在以下情况更新 systemPrompt：
        // 1. promptMode 发生了变化
        // 2. 当前模式对应的提示词值与 systemPrompt 不一致（需要同步）
        if (editingAgentId) {
          const invoke = await getInvoke();
          const agents = await invoke('get_agents');
          const existingAgent = agents.find(a => a.id === editingAgentId);
          
          if (existingAgent) {
            // 获取现有的配置值
            const existingPromptMode = existingAgent.promptMode || 'original';
            const existingSystemPrompt = existingAgent.systemPrompt || '';
            const currentPromptMode = promptManager.getMode();
            
            // 计算当前模式应该的值
            const currentPrompt = await promptManager.getCurrentSystemPrompt();
            
            // 只在以下情况更新 systemPrompt：
            // 1. promptMode 发生了变化
            // 2. promptMode 没变，但 systemPrompt 与当前模式对应的值不一致（需要同步）
            const shouldUpdateSystemPrompt = 
              existingPromptMode !== currentPromptMode ||  // 模式变化了
              existingSystemPrompt !== currentPrompt;      // 值不一致，需要同步
            
            if (shouldUpdateSystemPrompt) {
              promptData.systemPrompt = currentPrompt;
            }
            // 如果模式没变且值一致，不设置 systemPrompt，避免不必要的更新
          } else {
            // 如果找不到现有 agent，设置计算值
            const currentPrompt = await promptManager.getCurrentSystemPrompt();
            promptData.systemPrompt = currentPrompt;
          }
        } else {
          // 新建模式，设置计算值
          const currentPrompt = await promptManager.getCurrentSystemPrompt();
          promptData.systemPrompt = currentPrompt;
        }
      } catch (error) {
      }
    }
    
    // 先处理头像（如果有裁剪/上传的头像则保存）
    let croppedAgentFile = null;
    try {
      if (window.uiHelperFunctions && typeof window.uiHelperFunctions.getCroppedFile === 'function') {
        croppedAgentFile = window.uiHelperFunctions.getCroppedFile('agent');
      } else if (typeof mainRendererFunctions !== 'undefined' && mainRendererFunctions.getCroppedFile) {
        croppedAgentFile = mainRendererFunctions.getCroppedFile('agent');
      }
    } catch (e) {
      // ignore
    }
    if (croppedAgentFile) {
      try {
        const arrayBuffer = await croppedAgentFile.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        if (editingAgentId) {
          // 保存已有 Agent 的头像
          await invoke('save_agent_avatar', {
            agentId: editingAgentId,
            avatarData: Array.from(uint8Array),
            fileName: croppedAgentFile.name
          });
          
          // 更新消息区的 agent 头像（使用 convertFileSrc）
          const avatarPath = `AppData/Agents/${editingAgentId}/avatar.png`;
          const newAvatarUrl = await loadAsset(avatarPath) + `?t=${Date.now()}`;
          document.querySelectorAll(`.message-item.assistant .chat-avatar`).forEach(img => {
            // 只更新当前 agent 的消息头像
            const messageItem = img.closest('.message-item');
            const msgAgentId = messageItem?.dataset?.agentId;
            if (!msgAgentId || msgAgentId === editingAgentId) {
              img.src = '';
              img.src = newAvatarUrl;
            }
          });
          
          // 更新 messageRenderer 内部状态
          if (window.messageRenderer && typeof window.messageRenderer.setCurrentItemAvatar === 'function') {
            window.messageRenderer.setCurrentItemAvatar(newAvatarUrl);
          }
          
          //console.log('[AgentSettings] Updated agent avatar in message area:', newAvatarUrl);
        } else {
          // 新建 Agent 时：先创建 Agent（后面会保存头像到新 Agent 目录）
          // 不在此处处理，头像将在创建后保存（see below）
        }
      } catch (e) {
        // ignore save avatar error, proceed with config update
        console.error('[AgentSettings] Failed to save agent avatar:', e);
      }
    }

    // 收集所有配置
    const configUpdates = {
      ...promptData,
      name: agentName,
      model: agentModel || 'gemini-pro',
      temperature: parseFloat(document.getElementById('agentTemperature')?.value || 0.7),
      contextTokenLimit: parseInt(document.getElementById('agentContextTokenLimit')?.value || 4000),
      maxOutputTokens: parseInt(document.getElementById('agentMaxOutputTokens')?.value || 1000),
      top_p: document.getElementById('agentTopP')?.value ? parseFloat(document.getElementById('agentTopP').value) : undefined,
      top_k: document.getElementById('agentTopK')?.value ? parseInt(document.getElementById('agentTopK').value) : undefined,
      streamOutput: document.getElementById('agentStreamOutputTrue')?.checked || false,
      avatarBorderColor: document.getElementById('avatarBorderColor')?.value || '#3d5a80',
      nameTextColor: document.getElementById('nameTextColor')?.value || '#ffffff',
      customCss: document.getElementById('listItemCSS')?.value.trim() || '',
      cardCss: document.getElementById('cardStyleCSS')?.value.trim() || '',
      chatCss: document.getElementById('conversationStyleCSS')?.value.trim() || '',
      disableCustomColors: document.getElementById('useThemeColorInAssistant')?.checked || false,
      useThemeColorsInChat: document.getElementById('useThemeColorInChat')?.checked || false,
      ttsVoicePrimary: document.getElementById('agentTtsVoicePrimary')?.value || '',
      ttsRegexPrimary: document.getElementById('agentTtsRegexPrimary')?.value.trim() || '',
      ttsVoiceSecondary: document.getElementById('agentTtsVoiceSecondary')?.value || '',
      ttsRegexSecondary: document.getElementById('agentTtsRegexSecondary')?.value.trim() || '',
      ttsSpeed: parseFloat(document.getElementById('agentTtsSpeed')?.value || 1.0),
      stripRegexes: currentAgentRegexes
    };
    
    if (editingAgentId) {
      // 更新现有 Agent
      await invoke('update_agent_config', {
        agentId: editingAgentId,
        configUpdates: configUpdates
      });
      
    } else {
      // 创建新 Agent
      const newAgent = await invoke('create_agent', {
        agentName: agentName,
        initialConfig: configUpdates
      });
      // 如果在创建前有裁剪/上传的头像，创建后保存到新 Agent 目录
      if (croppedAgentFile && newAgent && newAgent.id) {
        try {
          const arrayBuffer2 = await croppedAgentFile.arrayBuffer();
          const uint8Array2 = new Uint8Array(arrayBuffer2);
          await invoke('save_agent_avatar', {
            agentId: newAgent.id,
            avatarData: Array.from(uint8Array2),
            fileName: croppedAgentFile.name
          });
        } catch (e) {
          // ignore
        } finally {
          try {
            if (window.uiHelperFunctions && typeof window.uiHelperFunctions.setCroppedFile === 'function') {
              window.uiHelperFunctions.setCroppedFile('agent', null);
            } else if (typeof mainRendererFunctions !== 'undefined' && mainRendererFunctions.setCroppedFile) {
              mainRendererFunctions.setCroppedFile('agent', null);
            }
          } catch (e) {}
        }
      }
    }
    
    // 刷新 Agent 列表
    await loadAgents();
    
    // 关闭 Agent 设置模态框
    closeSettingsModal();
  } catch (error) {
  }
}

// 自定义确认对话框
function showConfirmDialog(title, message) {
  return new Promise((resolve) => {
    // 创建模态框覆盖层
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(4px);
    `;
    
    // 创建对话框内容
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: var(--modal-bg, #2a2a2a);
      border-radius: 12px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    `;
    
    // 标题
    const titleEl = document.createElement('h3');
    titleEl.textContent = title;
    titleEl.style.cssText = `
      margin: 0 0 16px 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--primary-text, #ffffff);
    `;
    
    // 消息内容
    const messageEl = document.createElement('p');
    messageEl.textContent = message;
    messageEl.style.cssText = `
      margin: 0 0 24px 0;
      font-size: 14px;
      line-height: 1.6;
      color: var(--secondary-text, #cccccc);
    `;
    
    // 按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    `;
    
    // 取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.type = 'button';
    cancelBtn.style.cssText = `
      padding: 8px 20px;
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.2));
      border-radius: 6px;
      background: transparent;
      color: var(--primary-text, #ffffff);
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    `;
    cancelBtn.onmouseover = () => {
      cancelBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    };
    cancelBtn.onmouseout = () => {
      cancelBtn.style.background = 'transparent';
    };
    
    // 确认按钮
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '确定';
    confirmBtn.type = 'button';
    confirmBtn.style.cssText = `
      padding: 8px 20px;
      border: none;
      border-radius: 6px;
      background: var(--danger-color, #e74c3c);
      color: white;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
    `;
    confirmBtn.onmouseover = () => {
      confirmBtn.style.background = 'var(--danger-color-hover, #c0392b)';
      confirmBtn.style.transform = 'scale(1.02)';
    };
    confirmBtn.onmouseout = () => {
      confirmBtn.style.background = 'var(--danger-color, #e74c3c)';
      confirmBtn.style.transform = 'scale(1)';
    };
    
    // 事件处理
    const cleanup = () => {
      document.body.removeChild(overlay);
    };
    
    cancelBtn.onclick = () => {
      cleanup();
      resolve(false);
    };
    
    confirmBtn.onclick = () => {
      cleanup();
      resolve(true);
    };
    
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(false);
      }
    };
    
    // 组装对话框
    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(confirmBtn);
    dialog.appendChild(titleEl);
    dialog.appendChild(messageEl);
    dialog.appendChild(buttonContainer);
    overlay.appendChild(dialog);
    
    // 添加到页面
    document.body.appendChild(overlay);
    
    // 聚焦确认按钮（用于键盘操作）
    confirmBtn.focus();
    
    // ESC 键取消
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        cleanup();
        document.removeEventListener('keydown', handleEsc);
        resolve(false);
      }
    };
    document.addEventListener('keydown', handleEsc);
  });
}

// 处理创建群聊
async function handleCreateGroup() {
  // 打开群组设置模态框（创建模式）
  await showGroupSettingsView(null);
}

// 显示输入对话框
function showInputDialog(title, message, defaultValue = '') {
  return new Promise((resolve) => {
    // 创建模态框覆盖层
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(4px);
    `;
    
    // 创建对话框内容
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: var(--modal-bg, #2a2a2a);
      border-radius: 12px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    `;
    
    // 标题
    const titleEl = document.createElement('h3');
    titleEl.textContent = title;
    titleEl.style.cssText = `
      margin: 0 0 16px 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--primary-text, #ffffff);
    `;
    
    // 消息内容
    const messageEl = document.createElement('p');
    messageEl.textContent = message;
    messageEl.style.cssText = `
      margin: 0 0 16px 0;
      font-size: 14px;
      line-height: 1.6;
      color: var(--secondary-text, #cccccc);
    `;
    
    // 输入框
    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultValue;
    input.style.cssText = `
      width: 100%;
      padding: 10px;
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.2));
      border-radius: 6px;
      background: var(--input-bg, #1a1a1a);
      color: var(--primary-text, #ffffff);
      font-size: 14px;
      box-sizing: border-box;
      margin-bottom: 20px;
    `;
    
    // 按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    `;
    
    // 取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.type = 'button';
    cancelBtn.style.cssText = `
      padding: 8px 20px;
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.2));
      border-radius: 6px;
      background: transparent;
      color: var(--primary-text, #ffffff);
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    `;
    cancelBtn.onmouseover = () => {
      cancelBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    };
    cancelBtn.onmouseout = () => {
      cancelBtn.style.background = 'transparent';
    };
    
    // 确认按钮
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '确定';
    confirmBtn.type = 'button';
    confirmBtn.style.cssText = `
      padding: 8px 20px;
      border: none;
      border-radius: 6px;
      background: var(--accent-bg, #3d5a80);
      color: white;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
    `;
    confirmBtn.onmouseover = () => {
      confirmBtn.style.background = 'var(--accent-bg-hover, #4a6fa5)';
      confirmBtn.style.transform = 'scale(1.02)';
    };
    confirmBtn.onmouseout = () => {
      confirmBtn.style.background = 'var(--accent-bg, #3d5a80)';
      confirmBtn.style.transform = 'scale(1)';
    };
    
    // 事件处理
    const cleanup = () => {
      document.body.removeChild(overlay);
    };
    
    cancelBtn.onclick = () => {
      cleanup();
      resolve(null);
    };
    
    confirmBtn.onclick = () => {
      const value = input.value.trim();
      cleanup();
      resolve(value || null);
    };
    
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmBtn.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelBtn.click();
      }
    };
    
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    };
    
    // 组装对话框
    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(confirmBtn);
    dialog.appendChild(titleEl);
    dialog.appendChild(messageEl);
    dialog.appendChild(input);
    dialog.appendChild(buttonContainer);
    overlay.appendChild(dialog);
    
    // 添加到页面
    document.body.appendChild(overlay);
    
    // 聚焦输入框
    input.focus();
    input.select();
  });
}

// 显示群组设置视图
async function showGroupSettingsView(groupId = null) {
  const modal = document.getElementById('groupSettingsModal');
  const settingsTitle = document.getElementById('groupSettingsTitle');
  const editingGroupIdInput = document.getElementById('editingGroupId');
  const deleteGroupBtn = document.getElementById('deleteGroupBtn');
  
  if (!modal) {
    return;
  }
  
  // 显示模态框
  modal.style.display = 'flex';
  
  // 如果是编辑模式，加载群组配置
  if (groupId) {
    if (settingsTitle) {
      settingsTitle.textContent = '编辑群组';
    }
    if (editingGroupIdInput) {
      editingGroupIdInput.value = groupId;
    }
    if (deleteGroupBtn) {
      deleteGroupBtn.style.display = 'block';
    }
    await loadGroupForEditing(groupId);
  } else {
    // 创建模式
    if (settingsTitle) {
      settingsTitle.textContent = '创建群组';
    }
    if (editingGroupIdInput) {
      editingGroupIdInput.value = '';
    }
    if (deleteGroupBtn) {
      deleteGroupBtn.style.display = 'none';
    }
    
    // 清空表单
    const groupSettingsForm = document.getElementById('groupSettingsForm');
    if (groupSettingsForm) {
      groupSettingsForm.reset();
    }
    
    // 设置默认发言设定
    const invitePrompt = document.getElementById('invitePrompt');
    if (invitePrompt) {
      invitePrompt.value = '现在轮到你{{VCPChatAgentName}}发言了。系统已经为大家添加[xxx的发言：]这样的标记头，以用于区分不同发言来自谁。大家不用自己再输出自己的发言标记头，也不需要讨论发言标记系统，正常聊天即可。';
    }
    
    // 重置头像预览
    const groupAvatarPreview = document.getElementById('groupAvatarPreview');
    if (groupAvatarPreview) {
      await window.avatarManager.applyAvatarToContext('group', null, 'AppData/assets/default_group_avatar.png');
    }
    
    // 清空成员列表并重新加载
    currentGroupMembers = [];
    await loadGroupMembers(null, []);
    
    // 清空成员 Tags
    updateMemberTagsInputs({});
    
    // 隐藏成员 Tags 容器
    const memberTagsContainer = document.getElementById('memberTagsContainer');
    if (memberTagsContainer) {
      memberTagsContainer.style.display = 'none';
    }
    
    // 重置统一模型容器显示状态
    const unifiedModelContainer = document.getElementById('groupUnifiedModelContainer');
    if (unifiedModelContainer) {
      unifiedModelContainer.style.display = 'none';
    }
  }
}

// 加载群组配置用于编辑
async function loadGroupForEditing(groupId) {
  try {
    const invoke = await getInvoke();
    const groups = await invoke('get_agent_groups');
    const group = groups.find(g => g.id === groupId);
    
    if (!group) {
      return;
    }
    
    // 填充基本表单
    const groupNameInput = document.getElementById('groupNameInput');
    if (groupNameInput) {
      groupNameInput.value = group.name || '';
    }
    
    // 设置头像预览
    const groupAvatarPreview = document.getElementById('groupAvatarPreview');
    if (groupAvatarPreview) {
      const rawAvatarUrl = group.avatar_url || 'AppData/assets/default_group_avatar.png';
      await window.avatarManager.applyAvatarToContext('group', groupId, rawAvatarUrl);
    }
    
    // 设置群聊模式
    const groupChatMode = document.getElementById('groupChatMode');
    if (groupChatMode) {
      const mode = group.mode || group.config?.mode || 'sequential';
      groupChatMode.value = mode;
      // 根据模式显示/隐藏成员 Tags
      toggleMemberTagsVisibility(mode);
    }
    
    // 设置统一模型开关
    const groupUseUnifiedModel = document.getElementById('groupUseUnifiedModel');
    const unifiedModelContainer = document.getElementById('groupUnifiedModelContainer');
    if (groupUseUnifiedModel) {
      const useUnified = group.useUnifiedModel || group.config?.useUnifiedModel || false;
      groupUseUnifiedModel.checked = useUnified;
      if (unifiedModelContainer) {
        unifiedModelContainer.style.display = useUnified ? 'block' : 'none';
      }
    }
    
    // 设置统一模型名称
    const groupUnifiedModelInput = document.getElementById('groupUnifiedModelInput');
    if (groupUnifiedModelInput) {
      groupUnifiedModelInput.value = group.unifiedModel || group.config?.unifiedModel || '';
    }
    
    // 设置群组设定
    const groupPrompt = document.getElementById('groupPrompt');
    if (groupPrompt) {
      groupPrompt.value = group.groupPrompt || group.config?.groupPrompt || '';
    }
    
    // 设置发言设定（使用配置中的值，如果没有则使用默认值）
    const invitePrompt = document.getElementById('invitePrompt');
    if (invitePrompt) {
      const defaultInvitePrompt = '现在轮到你{{VCPChatAgentName}}发言了。系统已经为大家添加[xxx的发言：]这样的标记头，以用于区分不同发言来自谁。大家不用自己再输出自己的发言标记头，也不需要讨论发言标记系统，正常聊天即可。';
      invitePrompt.value = group.invitePrompt || group.config?.invitePrompt || defaultInvitePrompt;
    }
    
    // 加载成员列表
    await loadGroupMembers(groupId, group.members || group.config?.members || []);
    
    // 加载成员 Tags
    const memberTags = group.memberTags || group.config?.memberTags || {};
    updateMemberTagsInputs(memberTags);
    
  } catch (error) {
    console.error('加载群组配置失败: ' + error.message); // 调试信息
  }
}

// 存储当前成员列表（用于保存）
let currentGroupMembers = [];

// 加载群组成员列表（显示所有 agent，通过勾选选择）
async function loadGroupMembers(groupId, selectedMembers) {
  const groupMembersList = document.getElementById('groupMembersList');
  if (!groupMembersList) return;
  
  // 保存当前选中的成员列表
  currentGroupMembers = selectedMembers || [];
  
  groupMembersList.innerHTML = '<div id="groupMembersLoading" style="text-align: center; color: var(--secondary-text, #999); padding: 20px;">加载中...</div>';
  
  try {
    const invoke = await getInvoke();
    const agents = await invoke('get_agents');
    
    if (!agents || agents.length === 0) {
      groupMembersList.innerHTML = '<div style="text-align: center; color: var(--secondary-text, #999); padding: 20px;">暂无可用的 Agent</div>';
      return;
    }
    
    groupMembersList.innerHTML = '';
    
    // 创建所有 agent 的勾选列表
    for (const agent of agents) {
      const isSelected = currentGroupMembers.includes(agent.id);
      
      const memberItem = document.createElement('div');
      memberItem.className = 'group-member-item';
      memberItem.dataset.memberId = agent.id;
      memberItem.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 4px;
        background: var(--input-bg, #1a1a1a);
        margin-bottom: 4px;
        cursor: pointer;
        transition: opacity 0.2s;
      `;
      
      // 勾选框
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = isSelected;
      checkbox.dataset.memberId = agent.id;
      checkbox.style.cssText = `
        width: 16px;
        height: 16px;
        cursor: pointer;
        accent-color: var(--accent-bg, #3d5a80);
        flex-shrink: 0;
      `;
      
      // 头像
      const avatar = document.createElement('img');
      const rawAvatarUrl = agent.avatar_url || 'assets/default_avatar.png';
      avatar.src = await convertAvatarUrl(rawAvatarUrl);
      avatar.style.cssText = 'width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink: 0;';
      
      // 名称
      const name = document.createElement('span');
      name.textContent = agent.name;
      name.style.cssText = 'flex: 1; color: var(--primary-text, #ffffff); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
      
      // 点击整个项目切换勾选状态
      const toggleSelection = () => {
        checkbox.checked = !checkbox.checked;
        updateMemberSelection(agent.id, checkbox.checked);
      };
      
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        updateMemberSelection(agent.id, checkbox.checked);
      });
      
      memberItem.addEventListener('click', (e) => {
        // 如果点击的是 checkbox，不重复触发
        if (e.target !== checkbox) {
          toggleSelection();
        }
      });
      
      memberItem.appendChild(checkbox);
      memberItem.appendChild(avatar);
      memberItem.appendChild(name);
      groupMembersList.appendChild(memberItem);
    }
    
    // 如果没有 agent，显示提示
    if (agents.length === 0) {
      groupMembersList.innerHTML = '<div style="text-align: center; color: var(--secondary-text, #999); padding: 20px;">暂无可用的 Agent</div>';
    }
    
  } catch (error) {
    groupMembersList.innerHTML = '<div style="text-align: center; color: var(--danger-color, #e74c3c); padding: 20px;">加载成员列表失败: ' + error.message + '</div>';
  }
}

// 更新成员选择状态
function updateMemberSelection(memberId, isSelected) {
  if (isSelected) {
    // 添加到选中列表
    if (!currentGroupMembers.includes(memberId)) {
      currentGroupMembers.push(memberId);
    }
  } else {
    // 从选中列表移除
    currentGroupMembers = currentGroupMembers.filter(id => id !== memberId);
  }
  
  // 更新 UI 样式（只更新勾选框状态，不改变背景）
  const memberItem = document.querySelector(`.group-member-item[data-member-id="${memberId}"]`);
  if (memberItem) {
    const checkbox = memberItem.querySelector('input[type="checkbox"]');
    if (checkbox) {
      checkbox.checked = isSelected;
    }
  }
  
  // 更新成员 Tags 输入框（只在自然随机模式下）
  const groupChatMode = document.getElementById('groupChatMode');
  if (groupChatMode && groupChatMode.value === 'naturerandom') {
    updateMemberTagsInputs();
  }
}

// 切换成员 Tags 显示/隐藏
function toggleMemberTagsVisibility(mode) {
  const memberTagsContainer = document.getElementById('memberTagsContainer');
  if (memberTagsContainer) {
    memberTagsContainer.style.display = mode === 'naturerandom' ? 'block' : 'none';
    if (mode === 'naturerandom') {
      updateMemberTagsInputs();
    }
  }
}

// 更新成员 Tags 输入框
async function updateMemberTagsInputs(existingTags = null) {
  const memberTagsInputs = document.getElementById('memberTagsInputs');
  if (!memberTagsInputs) return;
  
  // 如果没有提供 existingTags，尝试从已保存的配置中获取
  if (!existingTags) {
    const editingGroupIdInput = document.getElementById('editingGroupId');
    if (editingGroupIdInput && editingGroupIdInput.value) {
      try {
        const invoke = await getInvoke();
        const groups = await invoke('get_agent_groups');
        const group = groups.find(g => g.id === editingGroupIdInput.value);
        existingTags = group?.memberTags || group?.config?.memberTags || {};
      } catch (error) {
        existingTags = {};
      }
    } else {
      existingTags = {};
    }
  }
  
  memberTagsInputs.innerHTML = '';
  
  // 只为选中的成员创建 Tags 输入框
  if (currentGroupMembers.length === 0) {
    memberTagsInputs.innerHTML = '<div style="text-align: center; color: var(--secondary-text, #999); padding: 10px;">请先选择群组成员</div>';
    return;
  }
  
  try {
    const invoke = await getInvoke();
    const agents = await invoke('get_agents');
    
    currentGroupMembers.forEach(memberId => {
      const agent = agents.find(a => a.id === memberId);
      if (agent) {
        const tagItem = document.createElement('div');
        tagItem.style.cssText = `
          margin-bottom: 10px;
          padding: 8px;
          background: var(--input-bg, #1a1a1a);
          border-radius: 4px;
        `;
        
        const label = document.createElement('label');
        label.textContent = `${agent.name} Tags:`;
        label.style.cssText = `
          display: block;
          color: var(--primary-text, #ffffff);
          font-size: 13px;
          margin-bottom: 6px;
        `;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.dataset.memberId = memberId;
        input.placeholder = '例如: 猫娘,小克,科学';
        input.value = existingTags[memberId] || '';
        input.style.cssText = `
          width: 100%;
          padding: 6px 8px;
          border: 1px solid var(--border-color, rgba(255, 255, 255, 0.2));
          border-radius: 4px;
          background: var(--input-bg, #1a1a1a);
          color: var(--primary-text, #ffffff);
          font-size: 13px;
          box-sizing: border-box;
        `;
        
        tagItem.appendChild(label);
        tagItem.appendChild(input);
        memberTagsInputs.appendChild(tagItem);
      }
    });
  } catch (error) {
    memberTagsInputs.innerHTML = '<div style="text-align: center; color: var(--danger-color, #e74c3c); padding: 10px;">加载失败</div>';
  }
}


// 处理群组设置表单提交
async function handleGroupSettingsSubmit() {
  try {
    const editingGroupIdInput = document.getElementById('editingGroupId');
    const groupNameInput = document.getElementById('groupNameInput');
    
    if (!groupNameInput || !groupNameInput.value.trim()) {
      console.error('请输入群组名称'); // 调试信息
      return;
    }
    
    const invoke = await getInvoke();
    const groupName = groupNameInput.value.trim();
    const editingGroupId = editingGroupIdInput ? editingGroupIdInput.value : '';
    
    // 使用保存的成员列表
    const members = currentGroupMembers || [];
    
    // 收集成员 Tags（为所有成员创建，即使值为空）
    const memberTags = {};
    const groupChatMode = document.getElementById('groupChatMode')?.value || 'sequential';
    
    // 为所有成员创建 Tags 条目（即使值为空）
    members.forEach(memberId => {
      memberTags[memberId] = '';
    });
    
    // 如果是在自然随机模式下，从输入框读取 Tags
    if (groupChatMode === 'naturerandom') {
      const tagInputs = document.querySelectorAll('#memberTagsInputs input[data-member-id]');
      tagInputs.forEach(input => {
        const memberId = input.dataset.memberId;
        const tags = input.value.trim();
        if (memberTags.hasOwnProperty(memberId)) {
          memberTags[memberId] = tags;
        }
      });
    }
    
    // 优先检查裁剪/缓存的头像文件（由裁剪器或 UI helper 提供）
    let croppedGroupFile = null;
    try {
      if (window.uiHelperFunctions && typeof window.uiHelperFunctions.getCroppedFile === 'function') {
        croppedGroupFile = window.uiHelperFunctions.getCroppedFile('group');
      } else if (typeof mainRendererFunctions !== 'undefined' && mainRendererFunctions.getCroppedFile) {
        croppedGroupFile = mainRendererFunctions.getCroppedFile('group');
      }
    } catch (e) {
      // ignore
    }

    // 如果没有裁剪文件，再检查原生文件输入
    const groupAvatarInput = document.getElementById('groupAvatarInput');
    let avatarFileName = null;
    let uploadedGroupFile = null;
    if (!croppedGroupFile && groupAvatarInput && groupAvatarInput.files && groupAvatarInput.files.length > 0) {
      uploadedGroupFile = groupAvatarInput.files[0];
    }

    // 如果是编辑模式且存在要保存的头像（裁剪或上传），先保存头像文件
    if (editingGroupId && (croppedGroupFile || uploadedGroupFile)) {
      const fileToSave = croppedGroupFile || uploadedGroupFile;
      try {
        const arrayBuffer = await fileToSave.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const result = await invoke('save_group_avatar', {
          groupId: editingGroupId,
          avatarData: Array.from(uint8Array),
          fileName: fileToSave.name
        });
        if (result) avatarFileName = result;
      } catch (error) {
        // ignore save error
      } finally {
        // 清理裁剪缓存
        try {
          if (window.uiHelperFunctions && typeof window.uiHelperFunctions.setCroppedFile === 'function') {
            window.uiHelperFunctions.setCroppedFile('group', null);
          } else if (typeof mainRendererFunctions !== 'undefined' && mainRendererFunctions.setCroppedFile) {
            mainRendererFunctions.setCroppedFile('group', null);
          }
        } catch (e) {}
      }
    }
    
    // 收集所有配置
    const configUpdates = {
      name: groupName,
      mode: groupChatMode,
      useUnifiedModel: document.getElementById('groupUseUnifiedModel')?.checked || false,
      unifiedModel: document.getElementById('groupUnifiedModelInput')?.value || '',
      groupPrompt: document.getElementById('groupPrompt')?.value || '',
      invitePrompt: document.getElementById('invitePrompt')?.value || '现在轮到你{{VCPChatAgentName}}发言了。系统已经为大家添加[xxx的发言：]这样的标记头，以用于区分不同发言来自谁。大家不用自己再输出自己的发言标记头，也不需要讨论发言标记系统，正常聊天即可。',
      members: members,
      memberTags: memberTags
    };
    
    // 如果已保存头像，更新配置中的 avatar 字段
    if (avatarFileName) {
      configUpdates.avatar = avatarFileName;
    }
    
    if (editingGroupId) {
      // 更新现有群组
      const updated = await invoke('update_group_config', {
        groupId: editingGroupId,
        configUpdates: configUpdates
      });
      
      if (updated && updated.id) {
        try {
          const idx = currentGroups.findIndex(g => g.id === updated.id);
          if (idx >= 0) {
            currentGroups[idx] = updated;
          } else {
            currentGroups.push(updated);
          }
          const li = document.querySelector(`.group-item[data-group-id="${updated.id}"]`);
          if (li) {
            const img = li.querySelector('img');
            const nameSpan = li.querySelector('.group-name');
            if (nameSpan) nameSpan.textContent = updated.name || nameSpan.textContent;
            if (img) {
              const rawAvatarUrl = updated.avatar_url || 'AppData/assets/default_group_avatar.png';
              try {
                const resolved = await window.avatarManager.applyAvatarToContext('group', updated.id, rawAvatarUrl);
                if (resolved) img.src = resolved;
                img.alt = updated.name || img.alt;
              } catch (e) {}
            }
          }
        } catch (e) {
          await loadGroups();
        }
      } else {
        await loadGroups();
      }
    } else {
      // 创建新群组
      const newGroup = await invoke('create_group', {
        groupName: groupName,
        initialConfig: configUpdates
      });
      
      
      // 如果在创建前有裁剪/上传的头像，创建后保存到新创建的群组
      const fileToSaveAfterCreate = croppedGroupFile || uploadedGroupFile;
      if (fileToSaveAfterCreate) {
        try {
          const arrayBuffer = await fileToSaveAfterCreate.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          await invoke('save_group_avatar', {
            groupId: newGroup.id,
            avatarData: Array.from(uint8Array),
            fileName: fileToSaveAfterCreate.name
          });
        } catch (error) {
          // ignore
        } finally {
          try {
            if (window.uiHelperFunctions && typeof window.uiHelperFunctions.setCroppedFile === 'function') {
              window.uiHelperFunctions.setCroppedFile('group', null);
            } else if (typeof mainRendererFunctions !== 'undefined' && mainRendererFunctions.setCroppedFile) {
              mainRendererFunctions.setCroppedFile('group', null);
            }
          } catch (e) {}
        }
      }
    }
    
    // 刷新群组列表
    await loadGroups();
    
    // 关闭模态框
    closeGroupSettingsModal();
    // 确保刷新群组列表（延迟一次以防文件系统/后端异步延迟）
    setTimeout(() => {
      try { loadGroups(); } catch (e) {}
    }, 200);
  } catch (error) {
    const msg = error && error.message ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
    console.error('保存失败: ' + msg); // 调试信息
  }
}

// 关闭群组设置模态框
function closeGroupSettingsModal() {
  const modal = document.getElementById('groupSettingsModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// 打开全局设置模态框
async function openGlobalSettingsModal() {
  await loadGlobalSettingsForm();
  const modal = document.getElementById('globalSettingsModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

// 关闭全局设置模态框
function closeGlobalSettingsModal() {
  const modal = document.getElementById('globalSettingsModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// 加载全局设置到表单
async function loadGlobalSettingsForm() {
  const invoke = await getInvoke();
  let settings = {};
  try {
    settings = await invoke('get_settings');
  } catch (error) {
  }

  const assignValue = (id, value, fallback = '') => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    const finalValue = value ?? fallback;
    el.value = finalValue;
  };

  const assignCheckbox = (id, value, fallback = false) => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    const finalValue = value ?? fallback;
    el.checked = finalValue;
  };

  assignValue('userName', settings.userName, '用户');
  assignValue('vcpServerUrl', settings.vcpServerUrl || settings.vcp_server_url || '');
  assignValue('vcpApiKey', settings.vcpApiKey || '');
  assignValue('vcpLogUrl', settings.vcpLogUrl || '');
  assignValue('vcpLogKey', settings.vcpLogKey || '');
  assignValue('continueWritingPrompt', settings.continueWritingPrompt || '请继续');
  assignValue('flowlockContinueDelay', settings.flowlockContinueDelay ?? 5);
  assignCheckbox('enableMiddleClickQuickAction', settings.enableMiddleClickQuickAction, false);
  assignValue('middleClickQuickAction', settings.middleClickQuickAction || '');
  assignCheckbox('enableMiddleClickAdvanced', settings.enableMiddleClickAdvanced, false);
  assignValue('middleClickAdvancedDelay', settings.middleClickAdvancedDelay ?? 1000);
  assignCheckbox('enableRegenerateConfirmation', settings.enableRegenerateConfirmation, false);
  assignCheckbox('enableAgentBubbleTheme', settings.enableAgentBubbleTheme, false);
  assignCheckbox('enableSmoothStreaming', settings.enableSmoothStreaming, false);
  assignValue('minChunkBufferSize', settings.minChunkBufferSize ?? 16);
  assignValue('smoothStreamIntervalMs', settings.smoothStreamIntervalMs ?? 100);
  assignValue('assistantAgent', settings.assistantAgent || '');
  assignValue('topicSummaryModel', settings.topicSummaryModel || '');
  assignCheckbox('enableDistributedServer', settings.enableDistributedServer, false);
  assignCheckbox('enableVcpToolInjection', settings.enableVcpToolInjection, false);
  assignCheckbox('enableAiMessageButtons', settings.enableAiMessageButtons, false);
  assignCheckbox('enableContextSanitizer', settings.enableContextSanitizer, false);
  assignValue('contextSanitizerDepth', settings.contextSanitizerDepth ?? 2);
  assignCheckbox('agentMusicControl', settings.agentMusicControl, false);
  
  // 加载用户自定义样式
  assignValue('userAvatarBorderColor', settings.userAvatarBorderColor || '#3d5a80', '#3d5a80');
  assignValue('userAvatarBorderColorText', settings.userAvatarBorderColor || '#3d5a80', '#3d5a80');
  assignValue('userNameTextColor', settings.userNameTextColor || '#ffffff', '#ffffff');
  assignValue('userNameTextColorText', settings.userNameTextColor || '#ffffff', '#ffffff');
  
  // 加载用户头像
  const userAvatarPreview = document.getElementById('userAvatarPreview');
  if (userAvatarPreview) {
    try {
      // 使用从设置中获取的实际头像URL
      let userAvatarPath = settings.userAvatarUrl || 'AppData/assets/default_user_avatar.png';
      // 使用统一的 avatarManager 解析并设置头像（会处理相对路径与缓存）
      const avatarUrl = userAvatarPath;
      await window.avatarManager.applyAvatarToContext('user', null, avatarUrl);
      // 如果解析/加载失败，avatarManager 内部会使用默认头像作为回退
    } catch (error) {
       // 出错时也使用 avatarManager 的默认处理
       try {
         await window.avatarManager.applyAvatarToContext('user', null, 'AppData/assets/default_avatar.png');
       } catch (e) {}
    }
  }
  
  // 根据 enableContextSanitizer 显示/隐藏深度设置
  const contextSanitizerCheckbox = document.getElementById('enableContextSanitizer');
  const contextSanitizerDepthContainer = document.getElementById('contextSanitizerDepthContainer');
  if (contextSanitizerCheckbox && contextSanitizerDepthContainer) {
    contextSanitizerDepthContainer.style.display = contextSanitizerCheckbox.checked ? 'block' : 'none';
    contextSanitizerCheckbox.addEventListener('change', () => {
      contextSanitizerDepthContainer.style.display = contextSanitizerCheckbox.checked ? 'block' : 'none';
    });
  }
  
  // 根据 enableMiddleClickQuickAction 显示/隐藏相关设置
  const middleClickQuickActionCheckbox = document.getElementById('enableMiddleClickQuickAction');
  const middleClickQuickActionContainer = document.getElementById('middleClickQuickActionContainer');
  if (middleClickQuickActionCheckbox && middleClickQuickActionContainer) {
    middleClickQuickActionContainer.style.display = middleClickQuickActionCheckbox.checked ? 'block' : 'none';
    middleClickQuickActionCheckbox.addEventListener('change', () => {
      middleClickQuickActionContainer.style.display = middleClickQuickActionCheckbox.checked ? 'block' : 'none';
    });
  }
  
  // 根据 enableMiddleClickAdvanced 显示/隐藏相关设置
  const middleClickAdvancedCheckbox = document.getElementById('enableMiddleClickAdvanced');
  const middleClickAdvancedContainer = document.getElementById('middleClickAdvancedContainer');
  if (middleClickAdvancedCheckbox && middleClickAdvancedContainer) {
    middleClickAdvancedContainer.style.display = middleClickAdvancedCheckbox.checked ? 'block' : 'none';
    middleClickAdvancedCheckbox.addEventListener('change', () => {
      middleClickAdvancedContainer.style.display = middleClickAdvancedCheckbox.checked ? 'block' : 'none';
    });
  }
  
  // 加载网络笔记路径
  const networkNotesPathsContainer = document.getElementById('networkNotesPathsContainer');
  if (networkNotesPathsContainer) {
    networkNotesPathsContainer.innerHTML = ''; // 清空容器
    
    const networkNotesPaths = settings.networkNotesPaths || [];
    if (networkNotesPaths.length > 0) {
      networkNotesPaths.forEach(path => {
        addNetworkNotesPath(path);
      });
    }
  }
  
  // 加载Agent列表到下拉框
  const assistantAgentSelect = document.getElementById('assistantAgent');
  if (assistantAgentSelect) {
    try {
      const agents = await invoke('get_agents');
      // 清空现有选项（保留第一个"请选择一个Agent"选项）
      assistantAgentSelect.innerHTML = '<option value="">请选择一个Agent</option>';
      
      // 添加所有Agent选项
      agents.forEach(agent => {
        const option = document.createElement('option');
        option.value = agent.id;
        option.textContent = agent.name;
        assistantAgentSelect.appendChild(option);
      });
      
      // 设置当前选中的值
      if (settings.assistantAgent) {
        assistantAgentSelect.value = settings.assistantAgent;
      }
    } catch (error) {
    }
  }
}

// 添加网络笔记路径输入框
function addNetworkNotesPath(path = '') {
  const container = document.getElementById('networkNotesPathsContainer');
  if (!container) return;
  
  const inputGroup = document.createElement('div');
  inputGroup.className = 'network-path-input-group';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'networkNotesPath';
  input.placeholder = '例如 \\\\NAS\\Shared\\Notes 或 /mnt/shared/notes';
  input.value = path;
  
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = '删除';
  removeBtn.className = 'network-path-remove-btn';
  removeBtn.onclick = () => {
    inputGroup.style.opacity = '0';
    inputGroup.style.transform = 'translateX(-10px)';
    setTimeout(() => {
      inputGroup.remove();
    }, 200);
  };
  
  inputGroup.appendChild(input);
  inputGroup.appendChild(removeBtn);
  container.appendChild(inputGroup);
  
  // 添加动画效果
  setTimeout(() => {
    inputGroup.style.opacity = '0';
    inputGroup.style.transform = 'translateY(-10px)';
    inputGroup.style.transition = 'all 0.2s ease';
    setTimeout(() => {
      inputGroup.style.opacity = '1';
      inputGroup.style.transform = 'translateY(0)';
    }, 10);
  }, 10);
  
  // 自动聚焦到新输入框
  input.focus();
}

// 提交全局设置
async function handleGlobalSettingsSubmit() {
  const invoke = await getInvoke();

  const getValue = (id, fallback = '') => {
    const el = document.getElementById(id);
    if (!el) return fallback;
    return el.value;
  };

  const getNumber = (id, fallback = 0) => {
    const raw = getValue(id, '');
    const num = parseInt(raw, 10);
    return Number.isFinite(num) ? num : fallback;
  };

  const getCheckbox = (id, fallback = false) => {
    const el = document.getElementById(id);
    if (!el) return fallback;
    return !!el.checked;
  };

  // 收集网络笔记路径
  const networkNotesPathsContainer = document.getElementById('networkNotesPathsContainer');
  const networkNotesPaths = [];
  if (networkNotesPathsContainer) {
    const pathInputs = networkNotesPathsContainer.querySelectorAll('input[name="networkNotesPath"]');
    pathInputs.forEach(input => {
      const path = input.value.trim();
      if (path) {
        networkNotesPaths.push(path);
      }
    });
  }

  // 获取用户自定义样式
  const userAvatarBorderColor = getValue('userAvatarBorderColor', '#3d5a80');
  const userNameTextColor = getValue('userNameTextColor', '#ffffff');

  const newSettings = {
    userName: getValue('userName', '用户'),
    vcpServerUrl: getValue('vcpServerUrl', ''),
    vcpApiKey: getValue('vcpApiKey', ''),
    vcpLogUrl: getValue('vcpLogUrl', ''),
    vcpLogKey: getValue('vcpLogKey', ''),
    continueWritingPrompt: getValue('continueWritingPrompt', '请继续'),
    flowlockContinueDelay: getNumber('flowlockContinueDelay', 5),
    enableMiddleClickQuickAction: getCheckbox('enableMiddleClickQuickAction', false),
    middleClickQuickAction: getValue('middleClickQuickAction', ''),
    enableMiddleClickAdvanced: getCheckbox('enableMiddleClickAdvanced', false),
    middleClickAdvancedDelay: getNumber('middleClickAdvancedDelay', 1000),
    enableRegenerateConfirmation: getCheckbox('enableRegenerateConfirmation', false),
    networkNotesPaths: networkNotesPaths,
    enableAgentBubbleTheme: getCheckbox('enableAgentBubbleTheme', false),
    enableSmoothStreaming: getCheckbox('enableSmoothStreaming', false),
    minChunkBufferSize: getNumber('minChunkBufferSize', 16),
    smoothStreamIntervalMs: getNumber('smoothStreamIntervalMs', 100),
    assistantAgent: getValue('assistantAgent', ''),
    topicSummaryModel: getValue('topicSummaryModel', ''),
    enableDistributedServer: getCheckbox('enableDistributedServer', false),
    enableVcpToolInjection: getCheckbox('enableVcpToolInjection', false),
    enableAiMessageButtons: getCheckbox('enableAiMessageButtons', false),
    enableContextSanitizer: getCheckbox('enableContextSanitizer', false),
    contextSanitizerDepth: getNumber('contextSanitizerDepth', 2),
    agentMusicControl: getCheckbox('agentMusicControl', false),
    userAvatarBorderColor: userAvatarBorderColor,
    userNameTextColor: userNameTextColor,
  };
  

  const toast = (message, type = 'info') => {
    if (typeof showToastNotification === 'function') {
      showToastNotification(message, type);
    } else {
    }
  };

  try {
    // 先检测是否有裁剪缓存或上传文件，但延后保存用户头像到后续步骤（避免被 save_settings 覆盖 settings.json）
    let croppedUserFile = null;
    try {
      if (window.uiHelperFunctions && typeof window.uiHelperFunctions.getCroppedFile === 'function') {
        croppedUserFile = window.uiHelperFunctions.getCroppedFile('user');
      } else if (typeof mainRendererFunctions !== 'undefined' && mainRendererFunctions.getCroppedFile) {
        croppedUserFile = mainRendererFunctions.getCroppedFile('user');
      }
    } catch (e) {
      // ignore
    }
    const userAvatarInputEl = document.getElementById('userAvatarInput');
    let uploadedUserFile = null;
    if (!croppedUserFile && userAvatarInputEl && userAvatarInputEl.files && userAvatarInputEl.files.length > 0) {
      uploadedUserFile = userAvatarInputEl.files[0];
    }
    const fileToSaveForUser = croppedUserFile || uploadedUserFile;

    // 先保存其它设置
    await invoke('save_settings', { settings: newSettings });
    toast('全局设置已保存', 'success');

    // 然后如果存在用户头像文件，再调用保存头像的命令（避免 settings.json 被覆盖）
    if (fileToSaveForUser) {
      try {
        const arrayBuffer = await fileToSaveForUser.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const result = await invoke('save_user_avatar_legacy', {
          avatarData: Array.from(uint8Array),
          fileName: fileToSaveForUser.name
        });
        if (result) {
          // 清理缓存，确保新头像能即时生效
          try {
            clearAvatarUrlCache('AppData/UserData/user_avatar.png');
            clearAvatarUrlCache(result);
          } catch (e) {}

          // 尝试读取最新 settings 中的 userAvatarUrl（后端 save_user_avatar 会写入 settings.json）
          try {
            const refreshedSettings = await invoke('get_settings');
            let avatarUrl = refreshedSettings?.userAvatarUrl || result;
            // 移除已有的时间戳，再添加新时间戳
            const baseUrl = avatarUrl.split('?')[0];
            const newAvatarUrl = baseUrl + '?t=' + Date.now();
            
            // 直接更新消息区所有用户头像 - 使用正确的选择器 .message-item.user
            const userAvatarImgs = document.querySelectorAll('.message-item.user .chat-avatar');
            //console.log('[GlobalSettings] Found user avatar images:', userAvatarImgs.length);
            userAvatarImgs.forEach((img, index) => {
              // 先清空再设置，强制浏览器重新加载
              const oldSrc = img.src;
              img.src = '';
              img.src = newAvatarUrl;
              //console.log(`[GlobalSettings] Updated avatar ${index}: ${oldSrc} -> ${newAvatarUrl}`);
            });
            
            // 更新预览
            const userAvatarPreview = document.getElementById('userAvatarPreview');
            if (userAvatarPreview) {
              userAvatarPreview.src = '';
              userAvatarPreview.src = newAvatarUrl;
            }
            
            // 更新 messageRenderer 内部状态
            if (window.messageRenderer && typeof window.messageRenderer.setUserAvatar === 'function') {
              window.messageRenderer.setUserAvatar(baseUrl);
            }
            
            //console.log('[GlobalSettings] Updated user avatar:', newAvatarUrl);
          } catch (e) {
            console.error('[GlobalSettings] Failed to update avatar:', e);
          }
        }
      } catch (e) {
        // ignore avatar save error
        console.error('[GlobalSettings] Avatar save error:', e);
      } finally {
        try {
          if (window.uiHelperFunctions && typeof window.uiHelperFunctions.setCroppedFile === 'function') {
            window.uiHelperFunctions.setCroppedFile('user', null);
          } else if (typeof mainRendererFunctions !== 'undefined' && mainRendererFunctions.setCroppedFile) {
            mainRendererFunctions.setCroppedFile('user', null);
          }
          if (userAvatarInputEl) userAvatarInputEl.value = '';
        } catch (e) {}
      }
    }

    closeGlobalSettingsModal();
  } catch (error) {
    const errorMessage = error?.message || error?.toString() || '未知错误';
    toast('保存失败: ' + errorMessage, 'error');
  }
}

// 处理删除群聊
async function handleDeleteGroup() {
  const editingGroupIdInput = document.getElementById('editingGroupId');
  if (!editingGroupIdInput || !editingGroupIdInput.value) {
    return;
  }
  
  const groupId = editingGroupIdInput.value;
  
  // 获取群聊名称用于显示
  let groupName = groupId;
  try {
    const invoke = await getInvoke();
    const groups = await invoke('get_agent_groups');
    const group = groups.find(g => g.id === groupId);
    if (group && group.name) {
      groupName = group.name;
    }
  } catch (error) {
  }
  
  // 使用自定义确认对话框
  const confirmed = await showConfirmDialog(
    '删除群聊',
    `确定要删除群聊 "${groupName}" 吗？\n\n此操作将永久删除该群聊及其所有聊天记录，且无法恢复。`
  );
  
  if (!confirmed) {
    return;
  }
  
  try {
    const invoke = await getInvoke();
    await invoke('delete_group', { groupId: groupId });
    
    
    // 如果删除的是当前选中的群聊，切换到默认状态
    if (currentAgentId === groupId && currentItemType === 'group') {
      currentAgentId = '';
      currentTopicId = '';
      currentItemType = 'agent';
      if (chatMessages) {
        chatMessages.innerHTML = '';
      }
      const currentChatAgentName = document.getElementById('currentChatAgentName');
      if (currentChatAgentName) {
        currentChatAgentName.textContent = '选择一个Agent开始聊天';
      }
    }
    
    // 刷新群聊列表
    await loadGroups();
    
    // 关闭群组设置模态框
    closeGroupSettingsModal();
  } catch (error) {
    console.error('删除失败: ' + error.message); // 调试信息
  }
}

// 处理删除 Agent
async function handleDeleteAgent() {
  const editingAgentIdInput = document.getElementById('editingAgentId');
  if (!editingAgentIdInput || !editingAgentIdInput.value) {
    return;
  }
  
  const agentId = editingAgentIdInput.value;
  
  // 获取 agent 名称用于显示
  let agentName = agentId;
  try {
    const invoke = await getInvoke();
    const agents = await invoke('get_agents');
    const agent = agents.find(a => a.id === agentId);
    if (agent && agent.name) {
      agentName = agent.name;
    }
  } catch (error) {
  }
  
  // 使用自定义确认对话框
  const confirmed = await showConfirmDialog(
    '删除助手',
    `确定要删除助手 "${agentName}" 吗？\n\n此操作将永久删除该助手及其所有聊天记录，且无法恢复。`
  );
  
  if (!confirmed) {
    return;
  }
  
  try {
    const invoke = await getInvoke();
    await invoke('delete_agent', { agentId: agentId });
    
    
    // 从顺序中移除已删除的Agent
    try {
      const settings = await invoke('get_settings');
      if (settings.agentOrder && Array.isArray(settings.agentOrder)) {
        settings.agentOrder = settings.agentOrder.filter(id => id !== agentId);
        await invoke('save_settings', { settings });
      }
    } catch (error) {
    }
    
    // 如果删除的是当前选中的 Agent，切换到默认状态
    if (currentAgentId === agentId) {
      currentAgentId = '';
      currentTopicId = '';
      if (chatMessages) {
        chatMessages.innerHTML = '';
      }
      const currentChatAgentName = document.getElementById('currentChatAgentName');
      if (currentChatAgentName) {
        currentChatAgentName.textContent = '选择一个Agent开始聊天';
      }
    }
    
    // 刷新 Agent 列表
    await loadAgents();
    
    // 关闭模态框
    closeSettingsModal();
  } catch (error) {
  }
}


// 加载所有助手的话题（可扩展为包含群聊）
async function loadAllTopics() {
  try {
    
    // 首先获取所有助手和群聊
    const invoke = await getInvoke();
    const agents = await invoke('get_agents');
    const groups = await invoke('get_agent_groups');
    
    // 收集所有话题
    let allTopics = [];
    
    // 为每个助手加载话题
    for (const agent of agents) {
      try {
        const topics = await invoke('get_agent_topics', { agentId: agent.id });
        // 为每个话题添加所属信息
        const topicsWithAgentInfo = topics.map(topic => ({
          ...topic,
          agentId: agent.id,
          agentName: agent.name
        }));
        allTopics = allTopics.concat(topicsWithAgentInfo);
      } catch (error) {
      }
    }
    
    // 为每个群聊添加内联的 topics（无需额外命令）
    for (const group of groups || []) {
      const topics = Array.isArray(group.topics) ? group.topics : [];
      const topicsWithGroupInfo = topics.map(topic => ({
        ...topic,
        agentId: group.id,
        agentName: group.name
      }));
      allTopics = allTopics.concat(topicsWithGroupInfo);
    }
    
    
    // 更新UI显示所有话题
    updateAllTopicsUI(allTopics);
    
    return allTopics;
  } catch (error) {
    throw error;
  }
}

// 添加一个更健壮的日期解析函数
function parseTopicDate(ts) {
    if (!ts) return new Date();
    let d;
    if (typeof ts === 'string') {
        // Normalize non-standard timestamps like "2025-11-12T11-57-08.749Z"
        // by replacing hyphens in the time part with colons.
        const normalizedTs = ts.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
        d = new Date(normalizedTs);

        // Fallback for other non-standard formats if the above fails
        if (isNaN(d.getTime())) {
            // This handles formats like 'YYYY-MM-DD HH:mm:ss' better on some engines
            d = new Date(ts.replace(/-/g, '/'));
        }
    } else {
        // Assumes it's already a Date object or a valid timestamp number
        d = new Date(ts);
    }
    
    // If still invalid, return current date
    if (isNaN(d.getTime())) {
        return new Date();
    }
    return d;
}

// 打开皮肤选择弹窗
async function openThemeSelectorModal() {
  const modal = document.getElementById('themeSelectorModal');
  if (!modal) return;
  
  modal.style.display = 'flex';
  await loadThemeList();
}

// 关闭皮肤选择弹窗
function closeThemeSelectorModal() {
  const modal = document.getElementById('themeSelectorModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// 加载主题列表
async function loadThemeList() {
  const container = document.getElementById('themeListContainer');
  if (!container) return;
  
  // 获取当前选中的主题
  const invoke = await getInvoke();
  let settings = {};
  try {
    settings = await invoke('get_settings');
  } catch (error) {
  }
  
  // 获取当前主题ID和文件路径
  const currentThemeId = settings.currentTheme;
  const currentThemeFile = settings.currentThemeFile;
  
  // 调试信息
  
  // 动态获取主题列表
  let themes = [];
  try {
    themes = await invoke('list_themes');
  } catch (error) {
    // 如果失败，使用空数组
    themes = [];
  }
  
  container.innerHTML = '';
  
  
  if (themes.length === 0) {
    container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--secondary-text, #999);">暂无主题</div>';
    return;
  }
  
  themes.forEach((theme, index) => {
    // 特别检查黑白简约主题
    if (theme.name === '黑白简约') {
    }
    const themeItem = document.createElement('div');
    themeItem.className = 'theme-item';
    
    // 判断是否选中：优先匹配ID，如果ID不匹配则匹配文件路径
    // 同时检查文件路径是否匹配（处理路径格式差异）
    const isSelected = (currentThemeId && theme.id === currentThemeId) || 
                       (currentThemeFile && (
                         theme.file === currentThemeFile || 
                         theme.file === `themes/${currentThemeFile}` ||
                         `themes/${theme.file}` === currentThemeFile ||
                         theme.file.replace('themes/', '') === currentThemeFile.replace('themes/', '')
                       ));
    
    if (isSelected) {
      themeItem.classList.add('selected');
    }
    
    themeItem.innerHTML = `
      <div class="theme-item-actions">
        <button type="button" class="theme-action-btn theme-apply-btn" data-theme-id="${theme.id}" data-theme-file="${theme.file}" title="应用主题">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
          </svg>
          应用
        </button>
        <button type="button" class="theme-action-btn theme-edit-btn" data-theme-id="${theme.id}" data-theme-file="${theme.file}" data-theme-name="${theme.name}" title="编辑主题">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
          </svg>
          编辑
        </button>
        <button type="button" class="theme-action-btn theme-delete-btn" data-theme-id="${theme.id}" data-theme-file="${theme.file}" data-theme-name="${theme.name}" title="删除主题">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
          </svg>
          删除
        </button>
      </div>
      <div class="theme-item-preview" data-theme-file="${theme.file}">
        <div class="theme-preview-pane theme-preview-dark"></div>
        <div class="theme-preview-pane theme-preview-light"></div>
      </div>
      <p class="theme-item-name">${theme.name}</p>
      <div class="theme-item-check">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
        </svg>
      </div>
    `;
    
    // 应用按钮点击事件
    const applyBtn = themeItem.querySelector('.theme-apply-btn');
    if (applyBtn) {
      applyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectTheme(theme.id, theme.file);
      });
    }
    
    // 编辑按钮点击事件
    const editBtn = themeItem.querySelector('.theme-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditThemeModal(theme.id, theme.file, theme.name);
      });
    }
    
    // 删除按钮点击事件
    const deleteBtn = themeItem.querySelector('.theme-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await customConfirm(`您确定要删除主题 "${theme.name}" 吗？此操作不可撤销！`, '⚠️ 删除主题');
        if (confirmed) {
          try {
            const invoke = await getInvoke();
            // 从 theme.file 提取纯文件名
            const pureFileName = (theme.file || '').toString().split('/').pop().split('\\').pop()
            await invoke('delete_theme', { themeFile: pureFileName });
            // 重新加载主题列表以反映更改
            await loadThemeList();
            // 更新背景图片
            await updateBackgroundImage();
          } catch (error) {
            console.error('删除主题失败:', theme.name, error); // 调试信息
          }
        }
      });
    }
    
    container.appendChild(themeItem);
  });
  
  
  // 加载主题预览背景
  updateThemePreviews();
}

// 全局缩略图缓存 Map（避免重复调用后端生成缩略图）
const thumbnailCache = new Map();

// 更新主题预览背景
async function updateThemePreviews() {
  const previews = document.querySelectorAll('.theme-item-preview');

  
  // 添加加载状态
  for (const preview of previews) {
    const darkPane = preview.querySelector('.theme-preview-dark');
    const lightPane = preview.querySelector('.theme-preview-light');
    if (darkPane) {
      darkPane.style.backgroundImage = 'none';
      darkPane.style.backgroundColor = '#1a1a1a';
    }
    if (lightPane) {
      lightPane.style.backgroundImage = 'none';
      lightPane.style.backgroundColor = '#f5f5f5';
    }
  }
  
  // 限制并发数量，避免卡顿
  const concurrencyLimit = 3;
  let currentIndex = 0;
  
  const processPreview = async () => {
    if (currentIndex >= previews.length) return;
    
    const index = currentIndex++;
    const preview = previews[index];
    const themeFile = preview.dataset.themeFile;

    const darkPane = preview.querySelector('.theme-preview-dark');
    const lightPane = preview.querySelector('.theme-preview-light');
    
    if (!darkPane || !lightPane) {

      return;
    }
    
    try {
      // 加载主题CSS文件并提取壁纸路径
      // 统一使用 AppData/assets/styles/themes/ 路径
      let cssPath = themeFile;
      
      // 确保路径以 AppData/assets/styles/themes/ 开头
      if (!cssPath.startsWith('AppData/')) {
        // 提取纯文件名
        const fileName = cssPath.split('/').pop().split('\\').pop();
        cssPath = `AppData/assets/styles/themes/${fileName}`;
      }
      
      let fullCssPath = await loadAsset(cssPath);

      let response = null;
      try {
        response = await fetch(fullCssPath);
      } catch (e) {
        response = null;
      }
      
      if (!response || !response.ok) {
        return;
      }
      const cssText = await response.text();
      
      // 提取 --chat-wallpaper-dark 的值（在 :root 中）
      // 改进正则表达式，支持单引号、双引号或无引号，以及可能的空格
      // 匹配格式: url('../assets/...') 或 url("../assets/...") 或 url(../assets/...)
      const darkMatch = cssText.match(/--chat-wallpaper-dark:\s*url\((['"]?)([^'")]+)\1\)/);
      // 提取 --chat-wallpaper-light 的值（在 body.light-theme 中）
      const lightMatch = cssText.match(/--chat-wallpaper-light:\s*url\((['"]?)([^'")]+)\1\)/);
      
      // 处理黑色系壁纸
      if (darkMatch && darkMatch[2]) {
        let darkUrl = darkMatch[2].trim();
        // 处理相对路径
        // CSS文件在 styles/themes/ 目录，路径 ../assets/... 需要转换为 assets/...
        
        if (darkUrl.startsWith('../')) {
          darkUrl = darkUrl.replace(/^\.\.\//, '');
        } else if (darkUrl.startsWith('./')) {
          darkUrl = darkUrl.substring(2);
        }
        
        // 如果是相对路径且不以 assets/ 或 AppData/ 开头，可能需要添加前缀
        if (!darkUrl.startsWith('assets/') && !darkUrl.startsWith('AppData/') && !darkUrl.startsWith('http')) {
          // 尝试从 themeFile 构建完整路径
          if (themeFile.startsWith('AppData/assets/styles/themes/')) {
            // 如果 themeFile 是 AppData 路径，壁纸可能在 AppData/assets/wallpaper/
            if (!darkUrl.startsWith('assets/wallpaper/') && !darkUrl.startsWith('wallpaper/')) {
              // 如果不是 wallpaper 路径，尝试构建完整路径
              if (darkUrl.startsWith('wallpaper/')) {
                darkUrl = 'assets/' + darkUrl;
              } else {
                darkUrl = 'assets/wallpaper/' + darkUrl;
              }
            }
          } else {
            // 对于其他情况，添加 assets/wallpaper 前缀
            if (!darkUrl.startsWith('assets/wallpaper/') && !darkUrl.startsWith('wallpaper/')) {
              if (darkUrl.startsWith('wallpaper/')) {
                darkUrl = 'assets/' + darkUrl;
              } else {
                darkUrl = 'assets/wallpaper/' + darkUrl;
              }
            }
          }
        }

        
        // 测试并使用缩略图（通过主进程生成并使用 HTTP 服务访问）
        try {
          // 检查内存缓存
          let thumbnailPath = thumbnailCache.get(darkUrl);
          if (!thumbnailPath) {
            // 请求主进程生成/获取缩略图
            thumbnailPath = await invoke('get_wallpaper_thumbnail', { wallpaperPath: darkUrl });
            // 存入内存缓存
            thumbnailCache.set(darkUrl, thumbnailPath);
          }
          // 将本地路径转换为可在渲染进程访问的 URL
          // 如果thumbnailPath是绝对路径，我们需要将其转换为相对路径
          let processedPath = thumbnailPath;
          if (!thumbnailPath.startsWith('file://') && !thumbnailPath.startsWith('AppData/') && !thumbnailPath.startsWith('assets/')) {
            // 这是一个绝对路径，尝试将其转换为相对路径
            const projectRoot = await invoke('get_project_root');
            // 尝试从项目根目录计算相对路径
              if (thumbnailPath.startsWith(projectRoot)) {
              // 计算相对路径并确保使用正斜杠
              // 去掉开头的斜杠（例如 "/assets/..." -> "assets/..."）
              processedPath = thumbnailPath.substring(projectRoot.length).replace(/^\/+/, '');
              // 确保使用正斜杠
              processedPath = processedPath.replace(/\\/g, '/');
              // 如果路径不在assets目录下，尝试添加assets前缀
              if (!processedPath.startsWith('assets/')) {
                // 检查路径中是否包含assets/wallpaper
                const assetsIndex = processedPath.indexOf('assets/wallpaper/');
                if (assetsIndex !== -1) {
                  processedPath = processedPath.substring(assetsIndex);
                }
              }
            } else {
              // 如果无法计算相对路径，则直接使用原始路径，convertAvatarUrl会处理
              processedPath = thumbnailPath;
            }
          }
          const thumbFileUrl = await convertAvatarUrl(processedPath);

          // 使用 img 元素作为缩略图，优先显示缩略图
          let thumbImg = darkPane.querySelector('.theme-thumb');
          if (!thumbImg) {
            thumbImg = document.createElement('img');
            thumbImg.className = 'theme-thumb';
            thumbImg.alt = 'theme thumbnail';
            thumbImg.style.width = '100%';
            thumbImg.style.height = '100%';
            thumbImg.style.objectFit = 'cover';
            thumbImg.style.display = 'block';
            darkPane.appendChild(thumbImg);
          }
          thumbImg.onload = () => {
            darkPane.style.backgroundImage = 'none';
            darkPane.style.backgroundColor = '';
          };
          thumbImg.onerror = async () => {
            // 回退到原始大图方式
            try {
              const fileSrc = !/^data:|^https?:|^file:/.test(darkUrl) ? await loadAsset(darkUrl) : darkUrl;
              darkPane.style.backgroundImage = `url('${fileSrc}')`;
            } catch (e) {
              darkPane.style.backgroundImage = `url('${darkUrl}')`;
            }
            darkPane.style.backgroundSize = 'cover';
            darkPane.style.backgroundPosition = 'center';
          };
          thumbImg.src = thumbFileUrl;
        } catch (error) {
          // 如果生成缩略图失败，直接使用原始 URL（或尝试转换为 HTTP 映射后的路径）
          try {
            const fileSrc = await convertAvatarUrl(darkUrl);
            darkPane.style.backgroundImage = `url('${fileSrc}')`;
            darkPane.style.backgroundSize = 'cover';
            darkPane.style.backgroundPosition = 'center';
          } catch (e) {
            darkPane.style.backgroundImage = 'none';
            darkPane.style.backgroundColor = '#1a1a1a';
          }
        }
      } else {
        // 如果没有找到黑色系壁纸，使用默认背景
        darkPane.style.backgroundImage = 'none';
        darkPane.style.backgroundColor = '#1a1a1a';
      }
      
      // 处理白色系壁纸
      if (lightMatch && lightMatch[2]) {
        let lightUrl = lightMatch[2].trim();
        // 处理相对路径
        
        if (lightUrl.startsWith('../')) {
          lightUrl = lightUrl.replace(/^\.\.\//, '');
        } else if (lightUrl.startsWith('./')) {
          lightUrl = lightUrl.substring(2);
        }
        
        // 如果是相对路径且不以 assets/ 或 AppData/ 开头，可能需要添加前缀
        if (!lightUrl.startsWith('assets/') && !lightUrl.startsWith('AppData/') && !lightUrl.startsWith('http')) {
          // 尝试从 themeFile 构建完整路径
          if (themeFile.startsWith('AppData/assets/styles/themes/')) {
            // 如果 themeFile 是 AppData 路径，壁纸可能在 AppData/assets/wallpaper/
            if (!lightUrl.startsWith('assets/wallpaper/') && !lightUrl.startsWith('wallpaper/')) {
              // 如果不是 wallpaper 路径，尝试构建完整路径
              if (lightUrl.startsWith('wallpaper/')) {
                lightUrl = 'assets/' + lightUrl;
              } else {
                lightUrl = 'assets/wallpaper/' + lightUrl;
              }
            }
          } else {
            // 对于其他情况，添加 assets/wallpaper 前缀
            if (!lightUrl.startsWith('assets/wallpaper/') && !lightUrl.startsWith('wallpaper/')) {
              if (lightUrl.startsWith('wallpaper/')) {
                lightUrl = 'assets/' + lightUrl;
              } else {
                lightUrl = 'assets/wallpaper/' + lightUrl;
              }
            }
          }
        }

        
        // 测试图片是否能加载
        try {
          // 检查内存缓存
          let thumbnailPath = thumbnailCache.get(lightUrl);
          if (!thumbnailPath) {
            thumbnailPath = await invoke('get_wallpaper_thumbnail', { wallpaperPath: lightUrl });
            thumbnailCache.set(lightUrl, thumbnailPath);
          }
          const thumbFileUrl = await convertAvatarUrl(thumbnailPath);

          let thumbImg = lightPane.querySelector('.theme-thumb');
          if (!thumbImg) {
            thumbImg = document.createElement('img');
            thumbImg.className = 'theme-thumb';
            thumbImg.alt = 'theme thumbnail';
            thumbImg.style.width = '100%';
            thumbImg.style.height = '100%';
            thumbImg.style.objectFit = 'cover';
            thumbImg.style.display = 'block';
            lightPane.appendChild(thumbImg);
          }
          thumbImg.onload = () => {
            lightPane.style.backgroundImage = 'none';
            lightPane.style.backgroundColor = '';
          };
          thumbImg.onerror = () => {
            lightPane.style.backgroundImage = `url('${lightUrl}')`;
            lightPane.style.backgroundSize = 'cover';
            lightPane.style.backgroundPosition = 'center';
          };
          thumbImg.src = thumbFileUrl;
        } catch (error) {
          try {
            const fileSrc = await convertAvatarUrl(lightUrl);
            lightPane.style.backgroundImage = `url('${fileSrc}')`;
            lightPane.style.backgroundSize = 'cover';
            lightPane.style.backgroundPosition = 'center';
          } catch (e) {
            lightPane.style.backgroundImage = 'none';
            lightPane.style.backgroundColor = '#f5f5f5';
          }
        }
      } else {
        // 如果没有找到白色系壁纸，使用默认背景
        lightPane.style.backgroundImage = 'none';
        lightPane.style.backgroundColor = '#f5f5f5';
      }
    } catch (error) {
      // 设置默认背景
      darkPane.style.backgroundImage = 'none';
      darkPane.style.backgroundColor = '#1a1a1a';
      lightPane.style.backgroundImage = 'none';
      lightPane.style.backgroundColor = '#f5f5f5';
    }
    
    // 处理下一个预览
    processPreview();
  };
  
  // 启动并发处理
  const workers = [];
  for (let i = 0; i < concurrencyLimit; i++) {
    workers.push(processPreview());
  }
  
  // 等待所有任务完成
  await Promise.all(workers);
}

// 选择主题
async function selectTheme(themeId, themeFile) {
  try {
    const invoke = await getInvoke();
    
    // 加载设置
    let settings = {};
    try {
      settings = await invoke('get_settings');
    } catch (error) {
    }
    
    // 更新当前主题
    settings.currentTheme = themeId;
    settings.currentThemeFile = themeFile;
    
    // 保存设置
    await invoke('save_settings', { settings: settings });
    
    // 应用主题
    applyTheme(themeFile);
    
    // 更新UI
    await loadThemeList();
    
    // 关闭主题选择弹窗
    closeThemeSelectorModal();
    
  } catch (error) {
    console.error('切换主题失败: ' + error.message); // 调试信息
  }
}

// 存储当前主题文件路径，用于切换模式时更新背景
let currentThemeFileCache = null;

// 更新背景图片（根据当前模式）
// 缓存已解析的主题CSS
const themeCssCache = new Map();

async function updateBackgroundImage() {
  if (!currentThemeFileCache) {
    // 如果没有缓存的主题文件，尝试从设置中获取
    try {
      const invoke = await getInvoke();
      const settings = await invoke('get_settings');
      if (settings.currentThemeFile) {
        currentThemeFileCache = settings.currentThemeFile;
      } else {
        return;
      }
    } catch (error) {
      return;
    }
  }
  
  const body = document.body;
  if (!body) return;
  
  const isDarkTheme = body.classList.contains('dark-theme');
  
  try {
    // 检查CSS缓存
    let cssText;
    if (themeCssCache.has(currentThemeFileCache)) {
      cssText = themeCssCache.get(currentThemeFileCache);
    } else {
      const cssPath = `styles/${currentThemeFileCache}`;
      const response = await fetch(cssPath);
      cssText = await response.text();
      // 缓存CSS内容
      themeCssCache.set(currentThemeFileCache, cssText);
    }
    
    // 根据当前模式提取对应的壁纸路径
    let wallpaperMatch = null;
    if (isDarkTheme) {
      // 夜间模式：提取 --chat-wallpaper-dark
      wallpaperMatch = cssText.match(/--chat-wallpaper-dark:\s*url\((['"]?)([^'")]+)\1\)/);
    } else {
      // 日间模式：提取 --chat-wallpaper-light（在 body.light-theme 中）
      wallpaperMatch = cssText.match(/--chat-wallpaper-light:\s*url\((['"]?)([^'")]+)\1\)/);
    }
    
    if (wallpaperMatch && wallpaperMatch[2]) {
      let wallpaperPath = wallpaperMatch[2].trim();
      
      // 处理相对路径
      if (wallpaperPath.startsWith('../')) {
        wallpaperPath = wallpaperPath.replace(/^\.\.\//, '');
      } else if (wallpaperPath.startsWith('./')) {
        wallpaperPath = wallpaperPath.substring(2);
      }
      
      // 应用背景图片
      try {
        const base64WallpaperPath = await convertAvatarUrl(wallpaperPath);
        body.style.backgroundImage = `url('${base64WallpaperPath}')`;
      } catch (error) {
        // 如果转换失败，使用原始路径
        body.style.backgroundImage = `url('${wallpaperPath}')`;
      }
      body.style.backgroundSize = 'cover';
      body.style.backgroundPosition = 'center';
      body.style.backgroundAttachment = 'fixed';
      
    } else {
      // 如果没有找到对应的壁纸，清除内联样式，让CSS生效
      body.style.backgroundImage = '';
      body.style.backgroundSize = '';
      body.style.backgroundPosition = '';
      body.style.backgroundAttachment = '';
      
      // 强制触发重绘，让CSS变量生效
      void body.offsetHeight;
      
      // 再次检查CSS变量
      setTimeout(async () => {
        const computedStyle = getComputedStyle(body);
        const cssVarName = isDarkTheme ? '--chat-wallpaper-dark' : '--chat-wallpaper-light';
        const wallpaperUrl = computedStyle.getPropertyValue(cssVarName).trim();
        
        if (wallpaperUrl && wallpaperUrl !== 'none' && wallpaperUrl !== '') {
          let bgUrl = wallpaperUrl;
          if (!bgUrl.startsWith('url(')) {
            bgUrl = `url(${bgUrl})`;
          }
          if (bgUrl.includes('../assets/')) {
            bgUrl = bgUrl.replace('../assets/', 'assets/');
          }
          
          // 尝试转换为base64
          try {
            const extractedUrl = bgUrl.match(/url\(['"]?(.*?)['"]?\)/);
            if (extractedUrl && extractedUrl[1]) {
              const imagePath = extractedUrl[1];
              const base64Url = await convertAvatarUrl(imagePath);
              body.style.backgroundImage = `url('${base64Url}')`;
            } else {
              // bgUrl is like url('path'); extract path and try convertFileSrc for packaged app
              const innerMatch = bgUrl.match(/url\(['"]?(.*?)['"]?\)/);
              if (innerMatch && innerMatch[1]) {
                const rawPath = innerMatch[1];
                try {
                  const fileSrc = !/^data:|^https?:|^file:/.test(rawPath) ? await loadAsset(rawPath) : rawPath;
                  // 确保URL使用正斜杠而不是编码后的%2F
                  const formattedFileSrc = fileSrc.replace(/%2F/g, '/').replace(/%5C/g, '/');
                  body.style.backgroundImage = `url('${formattedFileSrc}')`;
                } catch (e) {
                  body.style.backgroundImage = bgUrl;
                }
              } else {
                body.style.backgroundImage = bgUrl;
              }
            }
          } catch (error) {
            // 如果转换失败，使用原始URL
            body.style.backgroundImage = bgUrl;
          }
          
          body.style.backgroundSize = 'cover';
          body.style.backgroundPosition = 'center';
          body.style.backgroundAttachment = 'fixed';
        }
      }, 100);
    }
  } catch (error) {
  }
}

// 应用主题
async function applyTheme(themeFile) {
  // 缓存当前主题文件
  currentThemeFileCache = themeFile;
  
  // 移除旧的主题样式
  const oldThemeLink = document.getElementById('current-theme-style');
  if (oldThemeLink) {
    oldThemeLink.remove();
  }
  
  // 提取纯文件名
  const themeFileName = (themeFile || '').toString().replace(/\\/g, '/').split('/').pop();
  
  // 使用 Tauri convertFileSrc 加载主题文件
  const themeCssPath = `AppData/assets/styles/themes/${themeFileName}`;
  let cssUrl;
  
  try {
    cssUrl = await loadAsset(themeCssPath);
  } catch (e) {
    console.warn('[applyTheme] loadAsset failed for', themeCssPath, e);
    // 回退到相对路径
    cssUrl = `./AppData/assets/styles/themes/${themeFileName}`;
  }

  // 创建新的主题样式链接
  const themeLink = document.createElement('link');
  themeLink.id = 'current-theme-style';
  themeLink.rel = 'stylesheet';
  themeLink.href = cssUrl;

  // 等待CSS加载完成后应用背景图片
  const loadPromise = new Promise((resolve, reject) => {
    themeLink.onload = () => {
      setTimeout(async () => {
        try {
          updateBackgroundImage();
        } catch (e) { /* ignore */ }
        // 更新设置中的当前主题文件
        try {
          const invoke = await getInvoke();
          const settings = await invoke('get_settings');
          const savePath = `themes/${themeFileName}`;
          settings.currentThemeFile = savePath;
          settings.currentTheme = themeFileName.replace('.css', '').replace(/^themes/, '');
          await invoke('save_settings', { settings });
        } catch (error) {
          console.error('Failed to update theme settings:', error);
        }
        resolve(true);
      }, 50);
    };
    themeLink.onerror = () => {
      console.error('Failed to load theme CSS file:', cssUrl);
      reject(new Error('Failed to load theme CSS file: ' + cssUrl));
    };
  });

  document.head.appendChild(themeLink);
  await loadPromise;
}

// 初始化主题（页面加载时）
async function initializeTheme() {
  try {
    const invoke = await getInvoke();
    const settings = await invoke('get_settings');
    
    if (settings.currentThemeFile) {
      // 先规范化 saved theme 路径/名字，优先使用 normalizeResourcePath 的 saveName 传给后端，
      // 以避免不同前缀导致后端查找失败（例如 AppData/assets/styles/... 或 styles/... 导致重复）
      try {
        const normalized = await normalizeResourcePath(settings.currentThemeFile);
        const saveName = (normalized && normalized.saveName) ? normalized.saveName : (settings.currentThemeFile || '').toString();
        // 从完整路径中提取文件名，确保后端能找到正确的主题文件
        const themeFileName = saveName.split('/').pop();
        await invoke('apply_theme', { themeFile: themeFileName });
        await applyTheme(saveName);
      } catch (errApply) {
        console.warn('[initializeTheme] applyTheme failed for saved theme, attempting fallbacks:', settings.currentThemeFile, errApply);
        // 退化尝试：去掉前缀再试
        try {
          const norm = (settings.currentThemeFile || '').toString().replace(/^styles\//, '').replace(/^AppData\//, '').replace(/^assets\/styles\//, '');
          const normalized2 = await normalizeResourcePath(norm);
          const saveName2 = (normalized2 && normalized2.saveName) ? normalized2.saveName : norm;
          const themeFileName2 = saveName2.split('/').pop();
          await invoke('apply_theme', { themeFile: themeFileName2 });
          await applyTheme(saveName2);
        } catch (err2) {
          try {
            const norm2 = (settings.currentThemeFile || '').toString().replace(/^styles\//, '').replace(/^AppData\//, '').replace(/^assets\/styles\//, '');
            const pref = norm2.startsWith('themes/') ? norm2 : `themes/${norm2}`;
            const normalized3 = await normalizeResourcePath(pref);
            const saveName3 = (normalized3 && normalized3.saveName) ? normalized3.saveName : pref;
            const themeFileName3 = saveName3.split('/').pop();
            await invoke('apply_theme', { themeFile: themeFileName3 });
            await applyTheme(saveName3);
          } catch (err3) {
            console.error('[initializeTheme] All attempts to apply saved theme failed:', err3);
          }
        }
      }
    }
  } catch (error) {
  }
}

// 删除主题
async function deleteTheme(themeId, themeFile, themeName) {
  const confirmed = await customConfirm(`您确定要删除主题 "${themeName}" 吗？此操作不可撤销！`, '⚠️ 删除主题');
  if (confirmed) {
    try {
      const invoke = await getInvoke();

      // 从 themeFile 提取纯文件名（去掉所有路径前缀）
      const pureFileName = (themeFile || '').toString().split('/').pop().split('\\').pop();

      // 如果是当前使用的主题，切换到默认主题（不再二次确认）
      const settings = await invoke('get_settings');
      if (settings.currentTheme === themeId || settings.currentThemeFile === themeFile || (settings.currentThemeFile && settings.currentThemeFile.endsWith(pureFileName))) {
        settings.currentTheme = 'themes黑白简约';
        settings.currentThemeFile = 'themes/themes黑白简约.css';
        await invoke('save_settings', { settings: settings });
        await applyTheme('themes/themes黑白简约.css');
      }

      // 删除主题文件（传入纯文件名，后端会在所有可能的位置查找）
      //console.log('开始删除主题:', themeName, pureFileName); // 调试信息
      await invoke('delete_theme', { themeFile: pureFileName });
      //console.log('主题删除成功:', themeName); // 调试信息

      // 重新加载主题列表
      await loadThemeList();
    } catch (error) {
      console.error('删除主题失败:', themeName, error); // 调试信息
    }
  }
}

// 打开添加主题弹窗
function openAddThemeModal() {
  const modal = document.getElementById('addThemeModal');
  if (!modal) return;
  
  // 重置表单
  const form = document.getElementById('addThemeForm');
  if (form) {
    form.reset();
  }
  
  // 重置预览
  document.getElementById('darkWallpaperPreview').style.display = 'none';
  document.getElementById('lightWallpaperPreview').style.display = 'none';
  document.getElementById('darkWallpaperName').textContent = '';
  document.getElementById('lightWallpaperName').textContent = '';
  
  // 重置标题和模式
  const modalTitle = modal.querySelector('h3');
  if (modalTitle) {
    modalTitle.textContent = '添加主题';
  }
  form.dataset.mode = 'add';
  form.dataset.themeFile = '';
  // 隐藏删除按钮（添加模式不显示）
  const deleteBtn = document.getElementById('deleteThemeBtn');
  if (deleteBtn) deleteBtn.style.display = 'none';
  
  modal.style.display = 'flex';
}

// 打开编辑主题弹窗
async function openEditThemeModal(themeId, themeFile, themeName) {
  const modal = document.getElementById('addThemeModal');
  if (!modal) return;
  
  try {
    // 读取主题CSS文件
    // themeFile 可能已经包含前缀（如 styles/... 或 AppData/...），因此先规范化为可 fetch 的路径
    // 使用 normalizeResourcePath 解析可 fetch 地址
    const normalizedForEdit = await normalizeResourcePath(themeFile);
    const response = await fetch(normalizedForEdit.fetchablePath);
    const cssText = await response.text();
    
    // 解析夜间模式配置
    const darkPrimaryBgMatch = cssText.match(/--primary-bg:\s*([^;]+);/);
    const darkSecondaryBgMatch = cssText.match(/--secondary-bg:\s*([^;]+);/);
    const darkPrimaryTextMatch = cssText.match(/--primary-text:\s*([^;]+);/);
    const darkBorderColorMatch = cssText.match(/--border-color:\s*([^;]+);/);
    const darkUserBubbleBgMatch = cssText.match(/--user-bubble-bg:\s*([^;]+);/);
    const darkAssistantBubbleBgMatch = cssText.match(/--assistant-bubble-bg:\s*([^;]+);/);
    const darkWallpaperMatch = cssText.match(/--chat-wallpaper-dark:\s*url\(['"]?\.\.\/([^'")]+)['"]?\)/);
    
    // 解析日间模式配置
    const lightPrimaryBgMatch = cssText.match(/body\.light-theme\s*\{[^}]*--primary-bg:\s*([^;]+);/s);
    const lightSecondaryBgMatch = cssText.match(/body\.light-theme\s*\{[^}]*--secondary-bg:\s*([^;]+);/s);
    const lightPrimaryTextMatch = cssText.match(/body\.light-theme\s*\{[^}]*--primary-text:\s*([^;]+);/s);
    const lightBorderColorMatch = cssText.match(/body\.light-theme\s*\{[^}]*--border-color:\s*([^;]+);/s);
    const lightUserBubbleBgMatch = cssText.match(/body\.light-theme\s*\{[^}]*--user-bubble-bg:\s*([^;]+);/s);
    const lightAssistantBubbleBgMatch = cssText.match(/body\.light-theme\s*\{[^}]*--assistant-bubble-bg:\s*([^;]+);/s);
    const lightWallpaperMatch = cssText.match(/--chat-wallpaper-light:\s*url\(['"]?\.\.\/([^'")]+)['"]?\)/);
    
    // 填充表单
    const form = document.getElementById('addThemeForm');
    if (form) {
      document.getElementById('themeNameInput').value = themeName || '';
      
      // 夜间模式
      if (darkPrimaryBgMatch) {
        const color = darkPrimaryBgMatch[1].trim();
        document.getElementById('darkPrimaryBg').value = color;
        document.getElementById('darkPrimaryBgText').value = color;
      }
      if (darkSecondaryBgMatch) {
        const color = darkSecondaryBgMatch[1].trim();
        document.getElementById('darkSecondaryBg').value = color;
        document.getElementById('darkSecondaryBgText').value = color;
      }
      if (darkPrimaryTextMatch) {
        const color = darkPrimaryTextMatch[1].trim();
        document.getElementById('darkPrimaryText').value = color;
        document.getElementById('darkPrimaryTextText').value = color;
      }
      if (darkBorderColorMatch) {
        const color = darkBorderColorMatch[1].trim();
        document.getElementById('darkBorderColor').value = color;
        document.getElementById('darkBorderColorText').value = color;
      }
      if (darkUserBubbleBgMatch) {
        document.getElementById('darkUserBubbleBg').value = darkUserBubbleBgMatch[1].trim();
      }
      if (darkAssistantBubbleBgMatch) {
        document.getElementById('darkAssistantBubbleBg').value = darkAssistantBubbleBgMatch[1].trim();
      }
      
      // 日间模式
      if (lightPrimaryBgMatch) {
        const color = lightPrimaryBgMatch[1].trim();
        document.getElementById('lightPrimaryBg').value = color;
        document.getElementById('lightPrimaryBgText').value = color;
      }
      if (lightSecondaryBgMatch) {
        const color = lightSecondaryBgMatch[1].trim();
        document.getElementById('lightSecondaryBg').value = color;
        document.getElementById('lightSecondaryBgText').value = color;
      }
      if (lightPrimaryTextMatch) {
        const color = lightPrimaryTextMatch[1].trim();
        document.getElementById('lightPrimaryText').value = color;
        document.getElementById('lightPrimaryTextText').value = color;
      }
      if (lightBorderColorMatch) {
        const color = lightBorderColorMatch[1].trim();
        document.getElementById('lightBorderColor').value = color;
        document.getElementById('lightBorderColorText').value = color;
      }
      if (lightUserBubbleBgMatch) {
        document.getElementById('lightUserBubbleBg').value = lightUserBubbleBgMatch[1].trim();
      }
      if (lightAssistantBubbleBgMatch) {
        document.getElementById('lightAssistantBubbleBg').value = lightAssistantBubbleBgMatch[1].trim();
      }
      
      // 设置模式为编辑
      form.dataset.mode = 'edit';
      form.dataset.themeFile = themeFile;
      // 记录 themeId 以便在编辑弹窗中删除
      form.dataset.themeId = themeId || '';
      
      // 更新标题
      const modalTitle = modal.querySelector('h3');
      if (modalTitle) {
        modalTitle.textContent = '编辑主题';
      }
      
      // 壁纸预览（如果有）
      if (darkWallpaperMatch) {
        const wallpaperPath = darkWallpaperMatch[1];
        const preview = document.getElementById('darkWallpaperPreview');
        const previewImg = document.getElementById('darkWallpaperPreviewImg');
        const nameSpan = document.getElementById('darkWallpaperName');
        if (preview && previewImg && nameSpan) {
          previewImg.src = wallpaperPath;
          preview.style.display = 'block';
          nameSpan.textContent = wallpaperPath.split('/').pop();
        }
      }
      
      if (lightWallpaperMatch) {
        const wallpaperPath = lightWallpaperMatch[1];
        const preview = document.getElementById('lightWallpaperPreview');
        const previewImg = document.getElementById('lightWallpaperPreviewImg');
        const nameSpan = document.getElementById('lightWallpaperName');
        if (preview && previewImg && nameSpan) {
          previewImg.src = wallpaperPath;
          preview.style.display = 'block';
          nameSpan.textContent = wallpaperPath.split('/').pop();
        }
      }
    }
    
    // 显示删除按钮（编辑模式）
    const deleteBtn = document.getElementById('deleteThemeBtn');
    if (deleteBtn) deleteBtn.style.display = 'inline-block';
    modal.style.display = 'flex';
  } catch (error) {
    console.error('加载主题配置失败:', error.message); // 调试信息
  }
}

// 关闭添加主题弹窗
function closeAddThemeModal() {
  const modal = document.getElementById('addThemeModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// 初始化添加主题表单
function initializeAddThemeForm() {
  // 颜色选择器同步
  const colorInputs = [
    { color: 'darkPrimaryBg', text: 'darkPrimaryBgText' },
    { color: 'darkSecondaryBg', text: 'darkSecondaryBgText' },
    { color: 'darkPrimaryText', text: 'darkPrimaryTextText' },
    { color: 'darkBorderColor', text: 'darkBorderColorText' },
    { color: 'lightPrimaryBg', text: 'lightPrimaryBgText' },
    { color: 'lightSecondaryBg', text: 'lightSecondaryBgText' },
    { color: 'lightPrimaryText', text: 'lightPrimaryTextText' },
    { color: 'lightBorderColor', text: 'lightBorderColorText' }
  ];
  
  colorInputs.forEach(({ color, text }) => {
    const colorInput = document.getElementById(color);
    const textInput = document.getElementById(text);
    
    if (colorInput && textInput) {
      // 颜色选择器 -> 文本输入框
      colorInput.addEventListener('input', (e) => {
        textInput.value = e.target.value.toUpperCase();
      });
      
      // 文本输入框 -> 颜色选择器
      textInput.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
          colorInput.value = value;
        }
      });
    }
  });
  
  // 夜间模式壁纸上传
  const darkWallpaperInput = document.getElementById('darkWallpaperInput');
  const uploadDarkWallpaperBtn = document.getElementById('uploadDarkWallpaperBtn');
  if (uploadDarkWallpaperBtn && darkWallpaperInput) {
    uploadDarkWallpaperBtn.addEventListener('click', () => {
      darkWallpaperInput.click();
    });
    
    darkWallpaperInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const preview = document.getElementById('darkWallpaperPreview');
          const previewImg = document.getElementById('darkWallpaperPreviewImg');
          const nameSpan = document.getElementById('darkWallpaperName');
          
          if (preview && previewImg && nameSpan) {
            previewImg.src = event.target.result;
            preview.style.display = 'block';
            nameSpan.textContent = file.name;
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }
  
  // 日间模式壁纸上传
  const lightWallpaperInput = document.getElementById('lightWallpaperInput');
  const uploadLightWallpaperBtn = document.getElementById('uploadLightWallpaperBtn');
  if (uploadLightWallpaperBtn && lightWallpaperInput) {
    uploadLightWallpaperBtn.addEventListener('click', () => {
      lightWallpaperInput.click();
    });
    
    lightWallpaperInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const preview = document.getElementById('lightWallpaperPreview');
          const previewImg = document.getElementById('lightWallpaperPreviewImg');
          const nameSpan = document.getElementById('lightWallpaperName');
          
          if (preview && previewImg && nameSpan) {
            previewImg.src = event.target.result;
            preview.style.display = 'block';
            nameSpan.textContent = file.name;
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }
  
  // 表单提交
  const form = document.getElementById('addThemeForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      try {
        const invoke = await getInvoke();
        const themeName = document.getElementById('themeNameInput').value.trim();
        
        if (!themeName) {
          console.error('请输入主题名称'); // 调试信息
          return;
        }
        
        // 判断是编辑模式还是添加模式
        const isEditMode = form.dataset.mode === 'edit';
        const existingThemeFile = form.dataset.themeFile;
        
        // 获取配置值
        const darkPrimaryBg = document.getElementById('darkPrimaryBgText').value;
        const darkSecondaryBg = document.getElementById('darkSecondaryBgText').value;
        const darkPrimaryText = document.getElementById('darkPrimaryTextText').value;
        const darkBorderColor = document.getElementById('darkBorderColorText').value;
        const darkUserBubbleBg = document.getElementById('darkUserBubbleBg').value;
        const darkAssistantBubbleBg = document.getElementById('darkAssistantBubbleBg').value;
        
        const lightPrimaryBg = document.getElementById('lightPrimaryBgText').value;
        const lightSecondaryBg = document.getElementById('lightSecondaryBgText').value;
        const lightPrimaryText = document.getElementById('lightPrimaryTextText').value;
        const lightBorderColor = document.getElementById('lightBorderColorText').value;
        const lightUserBubbleBg = document.getElementById('lightUserBubbleBg').value;
        const lightAssistantBubbleBg = document.getElementById('lightAssistantBubbleBg').value;
        
        // 处理壁纸上传
        let darkWallpaperPath = 'none';
        let lightWallpaperPath = 'none';
        
        // 如果是编辑模式，先尝试读取原有壁纸路径
        if (isEditMode && existingThemeFile) {
          try {
        // existingThemeFile 可能包含前缀，规范化后再 fetch
        let existingCssPath;
        if (typeof existingThemeFile === 'string' && (existingThemeFile.startsWith('styles/') || existingThemeFile.startsWith('AppData/') || existingThemeFile.startsWith('assets/'))) {
          existingCssPath = existingThemeFile;
        } else {
          existingCssPath = `styles/${existingThemeFile}`;
        }
        const response = await fetch(existingCssPath);
            const cssText = await response.text();
            
            const darkMatch = cssText.match(/--chat-wallpaper-dark:\s*url\(['"]?\.\.\/([^'")]+)['"]?\)/);
            if (darkMatch) {
              darkWallpaperPath = `url('../${darkMatch[1]}')`;
            }
            
            const lightMatch = cssText.match(/--chat-wallpaper-light:\s*url\(['"]?\.\.\/([^'")]+)['"]?\)/);
            if (lightMatch) {
              lightWallpaperPath = `url('../${lightMatch[1]}')`;
            }
          } catch (error) {
          }
        }
        
        // 如果上传了新壁纸，则使用新壁纸
        const darkWallpaperFile = document.getElementById('darkWallpaperInput').files[0];
        if (darkWallpaperFile) {
          const arrayBuffer = await darkWallpaperFile.arrayBuffer();
          const fileName = `theme_${Date.now()}_dark_${darkWallpaperFile.name}`;
          const fileData = Array.from(new Uint8Array(arrayBuffer));
          const savedPath = await invoke('save_wallpaper', { fileName: fileName, fileData: fileData });
          if (typeof savedPath === 'string' && (/^https?:\/\//i.test(savedPath) || savedPath.startsWith('/'))) {
            darkWallpaperPath = `url('${savedPath}')`;
          } else {
            darkWallpaperPath = `url('../${savedPath}')`;
          }
        }
        
        const lightWallpaperFile = document.getElementById('lightWallpaperInput').files[0];
        if (lightWallpaperFile) {
          const arrayBuffer = await lightWallpaperFile.arrayBuffer();
          const fileName = `theme_${Date.now()}_light_${lightWallpaperFile.name}`;
          const fileData = Array.from(new Uint8Array(arrayBuffer));
          const savedPath = await invoke('save_wallpaper', { fileName: fileName, fileData: fileData });
          if (typeof savedPath === 'string' && (/^https?:\/\//i.test(savedPath) || savedPath.startsWith('/'))) {
            lightWallpaperPath = `url('${savedPath}')`;
          } else {
            lightWallpaperPath = `url('../${savedPath}')`;
          }
        }
        
        // 生成CSS内容
        const darkRgb = hexToRgb(darkSecondaryBg);
        const darkBorderRgb = hexToRgb(darkBorderColor);
        const lightRgb = hexToRgb(lightSecondaryBg);
        const lightBorderRgb = hexToRgb(lightBorderColor);
        
        const cssContent = `/*
 * styles/themes.css
 * Theme: ${themeName}
 */

/* * =================================================================
 * Dark Theme (Default)
 * =================================================================
 */
:root {
    /* --- Wallpaper Interface --- */
    --chat-wallpaper-dark: ${darkWallpaperPath};

    /* --- Base Colors --- */
    --primary-bg: ${darkPrimaryBg};
    --secondary-bg: ${darkSecondaryBg};
    --tertiary-bg: #000000;
    --accent-bg: ${darkPrimaryBg};
    --border-color: ${darkBorderColor};
    --input-bg: ${darkSecondaryBg};

    /* --- Frosted Panel Background --- */
    --panel-bg-dark: rgba(${darkRgb}, 0.8);

    /* --- Text Colors --- */
    --primary-text: ${darkPrimaryText};
    --secondary-text: ${darkPrimaryText};
    --highlight-text: ${darkBorderColor};
    --text-on-accent: #FFFFFF;
    --placeholder-text: ${darkPrimaryText};
    --quoted-text: ${darkBorderColor};
    --user-text: #FFFFFF;
    --agent-text: ${darkPrimaryText};

    /* --- Bubble Colors (Frosted Glass Ready) --- */
    --user-bubble-bg: ${darkUserBubbleBg};
    --assistant-bubble-bg: ${darkAssistantBubbleBg};

    /* --- UI Element Colors --- */
    --button-bg: ${darkBorderColor};
    --button-hover-bg: ${darkBorderColor};
    --danger-color: #E53E3E;
    --danger-hover-bg: #C0392B;
    --success-color: #FF8C00;
    --notification-bg: ${darkSecondaryBg};
    --notification-header-bg: ${darkPrimaryBg};
    --notification-border: ${darkBorderColor};
    --tool-bubble-bg: rgba(255, 140, 0, 0.15);
    --tool-bubble-border: #FF8C00;

    /* --- Scrollbar --- */
    --scrollbar-track: rgba(${darkRgb}, 0.5);
    --scrollbar-thumb: rgba(${darkBorderRgb}, 0.7);
    --scrollbar-thumb-hover: rgba(${darkBorderRgb}, 0.9);

    /* --- Shimmer Effect for Loading --- */
    --shimmer-color-transparent: rgba(255, 233, 233, 0.533);
    --shimmer-color-highlight: rgba(255, 185, 35, 0.947);

    /* --- Text Shadow for Frosted Panels --- */
    --panel-text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);

    /* --- Unified Panel Background --- */
    --panel-bg: var(--panel-bg-dark);
}

body {
    background-image: var(--chat-wallpaper-dark);
    background-size: cover;
    background-position: center;
    background-attachment: fixed;
}

/* * =================================================================
 * Light Theme
 * =================================================================
 */
body.light-theme {
    /* --- Wallpaper Interface --- */
    --chat-wallpaper-light: ${lightWallpaperPath};
    background-image: var(--chat-wallpaper-light);

    /* --- Base Colors --- */
    --primary-bg: ${lightPrimaryBg};
    --secondary-bg: ${lightSecondaryBg};
    --tertiary-bg: ${lightPrimaryBg};
    --accent-bg: ${lightSecondaryBg};
    --border-color: ${lightBorderColor};
    --input-bg: ${lightSecondaryBg};

    /* --- Frosted Panel Background --- */
    --panel-bg-light: rgba(${lightRgb}, 0.82);

    /* --- Text Colors --- */
    --primary-text: ${lightPrimaryText};
    --secondary-text: ${lightPrimaryText};
    --highlight-text: ${lightBorderColor};
    --text-on-accent: ${lightPrimaryText};
    --placeholder-text: ${lightPrimaryText};
    --quoted-text: ${lightBorderColor};
    --user-text: ${lightPrimaryText};
    --agent-text: ${lightPrimaryText};

    /* --- Bubble Colors --- */
    --user-bubble-bg: ${lightUserBubbleBg};
    --assistant-bubble-bg: ${lightAssistantBubbleBg};

    /* --- UI Element Colors --- */
    --button-bg: ${lightBorderColor};
    --button-hover-bg: ${lightBorderColor};
    --danger-color: #FF6B81;
    --danger-hover-bg: #FF4757;
    --success-color: #32CD32;
    --notification-bg: ${lightPrimaryBg};
    --notification-header-bg: ${lightPrimaryBg};
    --notification-border: ${lightBorderColor};
    --tool-bubble-bg: rgba(50, 205, 50, 0.1);
    --tool-bubble-border: #32CD32;

    /* --- Scrollbar --- */
    --scrollbar-track: rgba(${lightRgb}, 0.8);
    --scrollbar-thumb: rgba(${lightBorderRgb}, 0.9);
    --scrollbar-thumb-hover: ${lightBorderColor};

    /* --- Shimmer Effect for Loading --- */
    --shimmer-color-transparent: rgba(140, 172, 204, 0.663);
    --shimmer-color-highlight: rgba(48, 140, 232, 0.923);
    
    /* --- Text Shadow for Frosted Panels --- */
    --panel-text-shadow: 0 1px 1px rgba(0, 0, 0, 0.08);

    /* --- Unified Panel Background --- */
    --panel-bg: var(--panel-bg-light);
}

/* * =================================================================
 * Enhanced Frosted Glass Effect (通用增强)
 * =================================================================
 */
.message-bubble {
    backdrop-filter: blur(12px) saturate(120%);
    -webkit-backdrop-filter: blur(12px) saturate(120%);
    border: 1px solid rgba(255, 255, 255, 0.175);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.message-bubble:hover {
    backdrop-filter: blur(16px) saturate(130%);
    -webkit-backdrop-filter: blur(16px) saturate(130%);
    transform: translateY(-1px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
}

.tool-bubble {
    backdrop-filter: blur(10px) saturate(110%);
    -webkit-backdrop-filter: blur(10px) saturate(110%);
    border: 1px solid var(--tool-bubble-border);
    background: var(--tool-bubble-bg);
}

/* 深色主题下的特殊光效 */
:root .message-bubble {
    box-shadow: 
        0 8px 32px rgba(0, 0, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

/* 浅色主题下的柔和阴影 */
body.light-theme .message-bubble {
    box-shadow: 
        0 4px 20px rgba(45, 41, 34, 0.08),
        inset 0 1px 0 rgba(255, 255, 255, 0.7);
}
`;
        
        // 保存主题文件
        let themeFile;
        if (isEditMode && existingThemeFile) {
          // 编辑模式：使用现有文件路径
          themeFile = existingThemeFile;
        } else {
          // 添加模式：创建新文件
          const themeFileName = `themes${themeName}.css`;
          themeFile = themeFileName; // 直接使用文件名，不加 themes/ 前缀，让后端处理路径
        }
        
        // 保存时传入规范化的文件名（去掉 styles/ 或 AppData/ 前缀）
        const themeFileToSave = (themeFile || '').toString().replace(/^styles\//, '').replace(/^AppData\//, '');
        await invoke('save_theme', { themeFile: themeFileToSave, content: cssContent });
        
        // 重新加载主题列表
        await loadThemeList();
        
        // 关闭弹窗
        closeAddThemeModal();
        
        // 新建主题保存后不再弹出提示（按需求移除提示）
      } catch (error) {
        console.error('添加主题失败: ' + error); // 调试信息
      }
    });
  }
  
  // 删除按钮事件（编辑模式下才会显示）
  const deleteBtn = document.getElementById('deleteThemeBtn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const form = document.getElementById('addThemeForm');
      if (!form) return;
      const themeFile = form.dataset.themeFile;
      const themeId = form.dataset.themeId;
      const themeName = document.getElementById('themeNameInput')?.value || '';
      // 调用已有的删除逻辑（内部包含确认与切换默认主题处理）
      await deleteTheme(themeId, themeFile, themeName);
      // 关闭弹窗（deleteTheme 会刷新列表）
      closeAddThemeModal();
    });
  }
  
  // 关闭按钮
  const closeBtn = document.getElementById('closeAddThemeBtn');
  const cancelBtn = document.getElementById('cancelAddThemeBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeAddThemeModal);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeAddThemeModal);
  }
}

// 辅助函数：将十六进制颜色转换为RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? 
    `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : 
    '0, 0, 0';
}

// 从话题名称中拆出可选的时间后缀，例如 "新话题 17:15:18" -> { title: "新话题", time: "17:15:18" }
function splitTopicTitleAndTime(rawName) {
  if (!rawName) {
    return { title: '', time: '' };
  }
  const match = rawName.match(/^(.*?)[\s\u3000]+(\d{2}:\d{2}:\d{2})$/);
  if (match) {
    return {
      title: match[1].trim(),
      time: match[2],
    };
  }
  return { title: rawName, time: '' };
}

// 更新所有话题的UI显示（跨所有助手）
function updateAllTopicsUI(topics) {
  const topicList = document.getElementById('topicList');
  if (!topicList) {
    return;
  }
  
  // 过滤掉不需要显示的默认话题（例如“主要对话”）
  topics = (topics || []).filter(t => t.name !== '主要对话');
  
  // 获取搜索框的值并进行过滤
  const topicSearchInput = document.getElementById('topicSearchInput');
  const searchTerm = topicSearchInput ? topicSearchInput.value.toLowerCase().trim() : '';
  
  if (searchTerm) {
    topics = topics.filter(topic => {
      const topicName = (topic.name || '').toLowerCase();
      const agentName = (topic.agentName || '').toLowerCase();
      
      // 解析日期用于搜索
      const date = parseTopicDate(topic.created_at);
      const dateString = date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric'
      });
      const timeString = date.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit',
        hour12: false 
      });
      const fullDateString = `${dateString} ${timeString}`.toLowerCase();
      
      // 匹配话题名称、所属助手名称或日期时间
      return topicName.includes(searchTerm) || 
             agentName.includes(searchTerm) || 
             fullDateString.includes(searchTerm);
    });
  }

  // 按创建时间排序，最新的在前面
  // 使用 parseTopicDate 以兼容字符串/非标准时间格式
  topics.sort((a, b) => parseTopicDate(b.created_at) - parseTopicDate(a.created_at));
  
  if (topics.length === 0) {
    const noResultMsg = searchTerm ? '没有找到匹配的话题' : '暂无话题';
    topicList.innerHTML = `<li style="padding: 20px; text-align: center; color: #999;">${noResultMsg}</li>`;
    return;
  }
  
  topicList.innerHTML = '';
  
  topics.forEach(topic => {
    const li = document.createElement('li');
    li.classList.add('topic-item');
    li.dataset.topicId = topic.id;
    li.dataset.agentId = topic.agentId;
    
    // 使用更健壮的日期解析函数
    const date = parseTopicDate(topic.created_at);
    
    const timeFromCreatedAt = date.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: false 
    });
    const dateString = date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric'
    });
    
    // 拆分标题中可能携带的时间后缀，例如 "新话题 17:15:18"
    const { title, time } = splitTopicTitleAndTime(topic.name || '');
    const finalTitle = title || topic.name;
    const finalTime = time || timeFromCreatedAt;
    
    li.innerHTML = `
      <div class="topic-header">
        <div class="topic-title">${escapeHtml(finalTitle)}</div>
        ${topic.locked === true 
          ? '<span class="lock-indicator" title="话题已锁定，AI无法访问">🔒</span>'
          : `<span class="topic-message-count" data-topic-id="${topic.id}">...</span>`
        }
      </div>
      <div class="topic-meta">
        <span class="topic-agent">${escapeHtml(topic.agentName)}</span>
        <span class="topic-time">${dateString} ${finalTime}</span>
      </div>
      ${topic.unread ? '<div class="unread-indicator"></div>' : ''}
    `;
    
    // 只有在未锁定时才异步加载消息数量
    if (topic.locked !== true) {
      (async () => {
        try {
          const invoke = await getInvoke();
          const history = await invoke('get_chat_history', { agentId: topic.agentId, topicId: topic.id });
          const countEl = li.querySelector('.topic-message-count');
          if (countEl && history && Array.isArray(history)) {
            countEl.textContent = history.length;
            // 如果话题标记为未读，添加红色样式
            if (topic.unread === true) {
              countEl.classList.add('has-unread');
            }
          } else if (countEl) {
            countEl.textContent = '0';
          }
        } catch (e) {
          const countEl = li.querySelector('.topic-message-count');
          if (countEl) countEl.textContent = '-';
        }
      })();
    }
    
    // 添加点击事件：只高亮当前点击的卡片
    li.addEventListener('click', () => {
      // 先清除所有卡片的选中状态，避免出现“全选”高亮
      document.querySelectorAll('#topicList li').forEach(el => {
        el.classList.remove('is-selected');
      });
      li.classList.add('is-selected');
      selectTopic(topic.agentId, topic.id, topic.name);
    });

    // 右键菜单
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTopicContextMenuInRenderer(e, li, topic, topic.agentId, topic.agentName);
    });
    
    topicList.appendChild(li);
  });
}

