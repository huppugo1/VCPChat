// utils/assetLoader.js
// 统一资源加载器 - 开发和生产环境使用相同逻辑

import { convertFileSrc } from '@tauri-apps/api/core';
import { invoke } from '@tauri-apps/api/core';

// 缓存 AppData 基础路径
let appDataBasePath = null;
let initPromise = null;

/**
 * 初始化资源加载器，获取 AppData 基础路径
 */
export async function initAssetLoader() {
  if (appDataBasePath) {
    return appDataBasePath;
  }
  
  if (initPromise) {
    return initPromise;
  }
  
  initPromise = (async () => {
    try {
      appDataBasePath = await invoke('get_appdata_base_path');
      //console.log('[AssetLoader] AppData base path:', appDataBasePath);
      
      // 设置全局变量供其他模块使用
      if (typeof window !== 'undefined') {
        window.__appDataBasePath = appDataBasePath;
      }
      
      return appDataBasePath;
    } catch (e) {
      console.error('[AssetLoader] Failed to get AppData base path:', e);
      return null;
    }
  })();
  
  return initPromise;
}

/**
 * 获取 AppData 基础路径（同步）
 */
export function getAppDataBasePath() {
  return appDataBasePath;
}

/**
 * 设置调试模式（保留接口兼容性）
 */
export function setAssetDebug(debug) {
  // no-op
}

/**
 * 规范化路径，统一分隔符并清理冗余
 */
function normalizePath(p) {
  if (!p || typeof p !== 'string') return p;
  let s = p.replace(/\\/g, '/');
  s = s.replace(/\/{2,}/g, '/');
  s = s.replace(/^\/+/, '');
  // 移除重复的前缀
  s = s.replace(/(appdata\/)+/ig, 'AppData/');
  s = s.replace(/(assets\/)+/ig, 'assets/');
  return s;
}

/**
 * 将相对路径转换为绝对路径
 */
function toAbsolutePath(relativePath) {
  if (!appDataBasePath) {
    return relativePath;
  }
  
  const cleanPath = normalizePath(relativePath);
  
  // 如果路径以 AppData/ 开头，替换为实际的 AppData 路径
  if (cleanPath.toLowerCase().startsWith('appdata/')) {
    const subPath = cleanPath.substring(8); // 去掉 'AppData/'
    return `${appDataBasePath}/${subPath}`.replace(/\\/g, '/');
  }
  
  // 如果路径以 assets/ 或 styles/ 开头，添加 AppData 前缀
  if (cleanPath.startsWith('assets/') || cleanPath.startsWith('styles/')) {
    return `${appDataBasePath}/${cleanPath}`.replace(/\\/g, '/');
  }
  
  // 其他路径，假设在 AppData 下
  return `${appDataBasePath}/${cleanPath}`.replace(/\\/g, '/');
}

/**
 * 统一资源加载器 - 使用 Tauri convertFileSrc
 * 开发和生产环境使用相同逻辑
 * @param {string} path - 资源相对路径，如: 'AppData/Agents/xxx/avatar.png'
 * @returns {Promise<string>} - 可用的资源 URL (https://asset.localhost/...)
 */
export async function loadAsset(path) {
  try {
    // 如果是网络 URL，直接返回
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    
    // 如果是 data URL，直接返回
    if (path.startsWith('data:')) {
      return path;
    }
    
    // 如果是 blob URL，直接返回
    if (path.startsWith('blob:')) {
      return path;
    }
    
    // 如果已经是 asset:// URL，直接返回
    if (path.startsWith('asset://') || path.startsWith('https://asset.localhost/')) {
      return path;
    }
    
    // 确保 AppData 路径已初始化
    if (!appDataBasePath) {
      await initAssetLoader();
    }
    
    // 如果初始化失败，返回原路径
    if (!appDataBasePath) {
      console.warn('[AssetLoader] AppData base path not available, returning original path');
      return path;
    }
    
    // 使用 convertFileSrc 转换为 asset:// URL
    const absolutePath = toAbsolutePath(path);
    const assetUrl = convertFileSrc(absolutePath);
    return assetUrl;
  } catch (error) {
    console.warn(`[AssetLoader] 加载资源失败: ${path}`, error);
    return path; // 返回原路径作为回退
  }
}

/**
 * 同步版本的资源加载器（返回 Promise）
 */
export function loadAssetSync(path) {
  return loadAsset(path).catch(() => path);
}

/**
 * 检查 URL 是否可访问
 */
export async function isUrlReachable(url, timeoutMs = 2500) {
  try {
    // asset:// URL 视为可达
    if (url.startsWith('asset://') || url.startsWith('https://asset.localhost/')) {
      return true;
    }
    if (!/^https?:\/\//i.test(url)) {
      return true;
    }
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(id);
      return resp && resp.ok;
    } catch (e) {
      clearTimeout(id);
      return false;
    }
  } catch (e) {
    return false;
  }
}

/**
 * 规范化资源路径
 */
export async function normalizeResourcePath(inputPath) {
  try {
    if (!inputPath) {
      return { fetchablePath: '', saveName: '', linkHref: '' };
    }
    
    const raw = inputPath.toString();
    const cleaned = normalizePath(raw);
    
    const saveName = cleaned
      .replace(/^AppData\//i, '')
      .replace(/^assets\//i, '')
      .replace(/^styles\//i, '');
    
    const fetchablePath = await loadAsset(cleaned);
    
    return {
      fetchablePath,
      saveName,
      linkHref: fetchablePath
    };
  } catch (err) {
    return { 
      fetchablePath: inputPath, 
      saveName: inputPath.toString(), 
      linkHref: inputPath 
    };
  }
}

/**
 * 获取 AppData 目录下资源的完整 URL
 */
export async function getAppDataUrl(relativePath) {
  const cleanPath = normalizePath(relativePath);
  return loadAsset(`AppData/${cleanPath}`);
}

/**
 * 获取 assets 目录下资源的完整 URL
 */
export async function getAssetsUrl(relativePath) {
  const cleanPath = normalizePath(relativePath);
  return loadAsset(`AppData/assets/${cleanPath}`);
}
