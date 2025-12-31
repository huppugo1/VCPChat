// toolbarVisibility.js - 处理工具栏的显示/隐藏逻辑

window.ToolbarVisibility = (() => {
    let hideTimer = null;
    let toolbar = null;
    let messagesContainer = null;
    let isOverContent = false; // 标记是否在消息内容上
    let isPinned = false; // 标记工具栏是否被固定
    let pinBtn = null;
    const HIDE_DELAY = 2000; // 2秒延迟

    function init() {
        //console.log('[ToolbarVisibility] Initializing...');
        
        // 延迟获取元素，确保DOM已加载
        setTimeout(() => {
            toolbar = document.querySelector('.chat-toolbar');
            messagesContainer = document.querySelector('.chat-messages-container');
            pinBtn = document.getElementById('toolbarPinBtn');
            
            if (!toolbar || !messagesContainer) {
                console.error('[ToolbarVisibility] Required elements not found');
                //console.log('[ToolbarVisibility] toolbar:', toolbar);
                //console.log('[ToolbarVisibility] messagesContainer:', messagesContainer);
                return;
            }
            
            // 从 localStorage 恢复固定状态
            const savedPinState = localStorage.getItem('toolbarPinned');
            if (savedPinState === 'true') {
                setPinned(true);
                // 如果固定，显示工具栏
                toolbar.classList.add('visible');
            } else {
                // 默认隐藏工具栏
                toolbar.classList.remove('visible');
            }
            
            setupEventListeners();
            //console.log('[ToolbarVisibility] Initialized successfully');
        }, 500);
    }
    
    function setupEventListeners() {
        // 监听消息容器的鼠标移动，检测是否在头部区域
        messagesContainer.addEventListener('mousemove', handleMouseMove);
        messagesContainer.addEventListener('mouseleave', handleContainerLeave);
        
        // 监听工具栏区域的鼠标进入/离开
        toolbar.addEventListener('mouseenter', handleToolbarEnter);
        toolbar.addEventListener('mouseleave', handleToolbarLeave);
        
        // 监听书钉按钮
        if (pinBtn) {
            pinBtn.addEventListener('click', togglePin);
        }
        
        //console.log('[ToolbarVisibility] Event listeners attached');
    }
    
    function handleMouseMove(e) {
        // 检测鼠标是否在消息区域的头部（顶部100px区域）
        const rect = messagesContainer.getBoundingClientRect();
        const mouseY = e.clientY - rect.top;
        
        // 如果鼠标在头部区域（顶部100px）
        if (mouseY >= 0 && mouseY <= 100) {
            if (!toolbar.classList.contains('visible')) {
                showToolbar();
                //console.log('[ToolbarVisibility] Mouse in header area, showing toolbar');
            }
            cancelHideTimer();
        } else {
            // 鼠标离开头部区域，如果工具栏可见且未固定，立即隐藏
            if (toolbar.classList.contains('visible') && !isPinned) {
                hideToolbar();
                //console.log('[ToolbarVisibility] Mouse left header area, hiding toolbar');
            }
        }
    }
    
    function handleContainerLeave() {
        // 鼠标离开整个消息区域，立即隐藏工具栏
        isOverContent = false;
        if (!isPinned) {
            hideToolbar();
            //console.log('[ToolbarVisibility] Mouse left container, hiding toolbar');
        }
    }
    
    function handleToolbarEnter() {
        // 鼠标进入工具栏区域，显示工具栏
        isOverContent = false;
        cancelHideTimer();
        showToolbar();
        //console.log('[ToolbarVisibility] Mouse entered toolbar, showing toolbar');
    }
    
    function handleToolbarLeave() {
        // 鼠标离开工具栏区域，立即隐藏（如果未固定）
        if (!isPinned) {
            hideToolbar();
            //console.log('[ToolbarVisibility] Mouse left toolbar, hiding immediately');
        }
    }
    
    function startHideTimer() {
        // 如果已固定，不启动隐藏定时器
        if (isPinned) return;
        
        // 清除之前的定时器
        cancelHideTimer();
        
        // 启动新的定时器
        hideTimer = setTimeout(() => {
            //console.log('[ToolbarVisibility] Hide timer expired (2s passed), hiding toolbar');
            hideToolbar();
            hideTimer = null;
        }, HIDE_DELAY);
        
        //console.log('[ToolbarVisibility] Hide timer started (will hide in 2s)');
    }
    
    function cancelHideTimer() {
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
            //console.log('[ToolbarVisibility] Hide timer cancelled');
        }
    }
    
    function showToolbar() {
        if (toolbar && !toolbar.classList.contains('visible')) {
            toolbar.classList.add('visible');
            //console.log('[ToolbarVisibility] Toolbar shown (added visible class)');
        }
    }
    
    function hideToolbar() {
        if (toolbar && toolbar.classList.contains('visible')) {
            toolbar.classList.remove('visible');
            //console.log('[ToolbarVisibility] Toolbar hidden (removed visible class)');
        }
    }
    
    function togglePin() {
        setPinned(!isPinned);
    }
    
    function setPinned(pinned) {
        isPinned = pinned;
        
        if (!pinBtn) return;
        
        if (isPinned) {
            // 固定：始终显示工具栏
            showToolbar();
            cancelHideTimer();
            pinBtn.classList.add('pinned');
            pinBtn.title = '取消固定工具栏';
        } else {
            // 取消固定：恢复自动隐藏
            pinBtn.classList.remove('pinned');
            pinBtn.title = '固定工具栏';
        }
        
        // 保存状态
        localStorage.setItem('toolbarPinned', isPinned);
    }
    
    return {
        init
    };
})();
