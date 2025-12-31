// 移动端专用 JavaScript
console.log('移动端版本启动');

// 导入 Tauri API
const { invoke } = window.__TAURI__.core;

// 移动端特定初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('移动端 DOM 加载完成');
    
    // 禁用双击缩放
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (event) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    }, false);
    
    // 处理虚拟键盘
    window.visualViewport?.addEventListener('resize', () => {
        const viewport = window.visualViewport;
        document.documentElement.style.height = `${viewport.height}px`;
    });
});

// 移动端专用功能
// ...
