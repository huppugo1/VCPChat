// modules/utils/sortable-loader.js
// 动态加载 Sortable.js 的辅助工具

let sortableLoadPromise = null;

/**
 * 确保 Sortable.js 已加载
 * @returns {Promise<void>}
 */
export async function ensureSortableLoaded() {
    // 如果已经加载，直接返回
    if (window.Sortable) {
        return Promise.resolve();
    }

    // 如果正在加载，返回现有的 Promise
    if (sortableLoadPromise) {
        return sortableLoadPromise;
    }

    // 开始加载
    sortableLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/vendor/Sortable.min.js';
        script.onload = () => {
            //console.log('[SortableLoader] Sortable.js loaded successfully');
            resolve();
        };
        script.onerror = () => {
            console.error('[SortableLoader] Failed to load Sortable.js');
            sortableLoadPromise = null; // 重置以便重试
            reject(new Error('Failed to load Sortable.js'));
        };
        document.head.appendChild(script);
    });

    return sortableLoadPromise;
}

/**
 * 获取 Sortable 构造函数（确保已加载）
 * @returns {Promise<typeof Sortable>}
 */
export async function getSortable() {
    await ensureSortableLoaded();
    return window.Sortable;
}
