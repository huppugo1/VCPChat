// 公共头像管理器：统一解析、缓存清理、更新 UI 的方法
import { loadAsset } from './utils/assetLoader.js';

export async function resolveAvatarUrl(rawAvatarUrl) {
  try {
    if (!rawAvatarUrl) return null;
    
    // 先移除已有的时间戳参数
    let baseUrl = rawAvatarUrl;
    if (rawAvatarUrl.includes('?')) {
      const urlParts = rawAvatarUrl.split('?');
      const basePath = urlParts[0];
      const params = urlParts[1] ? urlParts[1].split('&').filter(p => !p.startsWith('t=')) : [];
      baseUrl = params.length > 0 ? `${basePath}?${params.join('&')}` : basePath;
    }
    
    // 如果存在 convertAvatarUrl（兼容旧代码），优先使用它
    if (typeof convertAvatarUrl === 'function') {
      try {
        const converted = await convertAvatarUrl(baseUrl);
        if (converted && converted.includes('?')) {
          const parts = converted.split('?');
          const base = parts[0];
          const ps = parts[1] ? parts[1].split('&').filter(p => !p.startsWith('t=')) : [];
          baseUrl = ps.length > 0 ? `${base}?${ps.join('&')}` : base;
        } else {
          baseUrl = converted || baseUrl;
        }
      } catch (e) {
        // fallback to loadAsset
      }
    }
    
    // 如果是相对路径，使用 loadAsset 转换
    if (!baseUrl.startsWith('http') && !baseUrl.startsWith('data:') && !baseUrl.startsWith('asset://') && !baseUrl.startsWith('https://asset.localhost/')) {
      try {
        const assetUrl = await loadAsset(baseUrl);
        return `${assetUrl}?t=${Date.now()}`;
      } catch (e) {
        console.warn('[AvatarManager] loadAsset failed:', e);
        return `${baseUrl}?t=${Date.now()}`;
      }
    }
    
    // 如果已经是完整地址，添加时间戳防止缓存
    if (baseUrl.startsWith('http') || baseUrl.startsWith('asset://') || baseUrl.startsWith('https://asset.localhost/')) {
      return `${baseUrl}?t=${Date.now()}`;
    }
    return baseUrl;
  } catch (e) {
    return rawAvatarUrl;
  }
}

function setImgSrcWithAnimation(imgEl, src) {
  if (!imgEl) return;
  try {
    imgEl.classList.add('avatar-updating');
    imgEl.src = src;
    setTimeout(() => imgEl.classList.remove('avatar-updating'), 300);
  } catch (e) {}
}

export async function applyAvatarToContext(contextType, id, rawAvatarUrl) {
  // contextType: 'user' | 'agent' | 'group'
  try {
    const resolved = await resolveAvatarUrl(rawAvatarUrl);
    if (contextType === 'user') {
      const userAvatarPreview = document.getElementById('userAvatarPreview');
      if (userAvatarPreview) setImgSrcWithAnimation(userAvatarPreview, resolved || userAvatarPreview.src);
      // 更新消息区所有用户消息头像
      const userMessages = document.querySelectorAll('.message-item.user .chat-avatar');
      userMessages.forEach(img => setImgSrcWithAnimation(img, resolved || img.src));
      // 通知 messageRenderer 更新内部状态（若存在）
      if (window.messageRenderer && typeof window.messageRenderer.setUserAvatar === 'function') {
        window.messageRenderer.setUserAvatar(resolved);
      }
      return resolved;
    } else if (contextType === 'agent') {
      // 更新设置页面预览
      const agentAvatarPreview = document.getElementById('agentAvatarPreview');
      if (agentAvatarPreview) setImgSrcWithAnimation(agentAvatarPreview, resolved || agentAvatarPreview.src);
      // 更新侧边 Agent 列表中对应 Agent 的头像
      if (id) {
        const selectors = [
          `.agent-item[data-agent-id="${id}"] img`,
          `.agent-item[data-agent-id="${id}"] .agent-avatar`,
        ];
        selectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(img => setImgSrcWithAnimation(img, resolved || img.src));
        });
      }
      // 通知 messageRenderer 更新主视图上下文头像
      if (window.messageRenderer && typeof window.messageRenderer.setCurrentItemAvatar === 'function') {
        window.messageRenderer.setCurrentItemAvatar(resolved);
      }
      return resolved;
    } else if (contextType === 'group') {
      const groupAvatarPreview = document.getElementById('groupAvatarPreview');
      if (groupAvatarPreview) setImgSrcWithAnimation(groupAvatarPreview, resolved || groupAvatarPreview.src);
      if (id) {
        const selectors = [
          `.group-item[data-group-id="${id}"] img`,
          `.group-item[data-group-id="${id}"] .group-avatar`,
        ];
        selectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(img => setImgSrcWithAnimation(img, resolved || img.src));
        });
      }
      if (window.messageRenderer && typeof window.messageRenderer.setCurrentItemAvatar === 'function') {
        window.messageRenderer.setCurrentItemAvatar(resolved);
      }
      return resolved;
    }
    return resolved;
  } catch (e) {
    return rawAvatarUrl;
  }
}

// 将 API 挂到 window，便于旧代码逐步迁移
const avatarManager = {
  resolveAvatarUrl,
  applyAvatarToContext,
};
window.avatarManager = avatarManager;

export default avatarManager;


