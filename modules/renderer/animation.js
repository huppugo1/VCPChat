// modules/renderer/animation.js

// --- CDN URL Mapping ---
const CDN_TO_LOCAL_MAP = {
    'https://cdnjs.cloudflare.com/ajax/libs/three.js': 'vendor/three.min.js',
    'https://cdn.jsdelivr.net/npm/three': 'vendor/three.min.js',
    'https://unpkg.com/three': 'vendor/three.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/animejs': 'vendor/anime.min.js',
    'https://cdn.jsdelivr.net/npm/animejs': 'vendor/anime.min.js',
    'https://unpkg.com/animejs': 'vendor/anime.min.js',
};

// 🔥 全局跟踪已加载的脚本，防止跨消息重复加载
if (!window._vcp_loaded_scripts) {
    window._vcp_loaded_scripts = new Set();
}

function replaceCdnUrls(scriptContent) {
    if (!scriptContent || typeof scriptContent !== 'string') {
        return scriptContent;
    }
    
    let processed = scriptContent;
    
    const threeJsPatterns = [
        /https?:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/[^'"`);\s]*/gi,
        /https?:\/\/cdn\.jsdelivr\.net\/npm\/three[@\/][^'"`);\s]*/gi,
        /https?:\/\/unpkg\.com\/three[@\/][^'"`);\s]*/gi,
    ];
    
    threeJsPatterns.forEach(pattern => {
        processed = processed.replace(pattern, 'vendor/three.min.js');
    });
    
    const animeJsPatterns = [
        /https?:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/animejs\/[^'"`);\s]*/gi,
        /https?:\/\/cdn\.jsdelivr\.net\/npm\/animejs[@\/][^'"`);\s]*/gi,
        /https?:\/\/unpkg\.com\/animejs[@\/][^'"`);\s]*/gi,
    ];
    
    animeJsPatterns.forEach(pattern => {
        processed = processed.replace(pattern, 'vendor/anime.min.js');
    });
    
    const genericCdnPatterns = [
        { pattern: /https?:\/\/[^'"`);\s]*three[^'"`);\s]*\.js/gi, replacement: 'vendor/three.min.js' },
        { pattern: /https?:\/\/[^'"`);\s]*anime[^'"`);\s]*\.js/gi, replacement: 'vendor/anime.min.js' },
    ];
    
    genericCdnPatterns.forEach(({ pattern, replacement }) => {
        processed = processed.replace(pattern, replacement);
    });
    
    return processed;
}

const trackedThreeInstances = new Map();
let isThreePatched = false;

function patchThreeJS() {
    if (isThreePatched || !window.THREE || !window.THREE.WebGLRenderer) return;

    const OriginalWebGLRenderer = window.THREE.WebGLRenderer;

    window.THREE.WebGLRenderer = function(...args) {
        const renderer = new OriginalWebGLRenderer(...args);

        const originalRender = renderer.render;
        let associatedScene = null;

        renderer.render = function(scene, camera) {
            if (this._disposed) {
                return;
            }
            
            if (scene && !associatedScene) {
                associatedScene = scene;
            }
            
            if (!document.body.contains(this.domElement)) {
                if (!this._disposed) this.dispose();
                return;
            }
            
            try {
                return originalRender.call(this, scene, camera);
            } catch (error) {
                console.error('[Three.js Safety] Render error caught:', error);
                if (!this._disposed) this.dispose();
                return;
            }
        };

        const originalDispose = renderer.dispose;
        renderer.dispose = function() {
            if (this._disposed) return;
            this._disposed = true;
            if (originalDispose) {
                return originalDispose.call(this);
            }
        };

        const observer = new MutationObserver(() => {
            if (document.body.contains(renderer.domElement)) {
                const contentDiv = renderer.domElement.closest('.md-content');
                if (contentDiv) {
                    if (!trackedThreeInstances.has(contentDiv)) {
                        trackedThreeInstances.set(contentDiv, []);
                    }
                    trackedThreeInstances.get(contentDiv).push({
                        renderer,
                        getScene: () => associatedScene,
                    });
                }
                observer.disconnect();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        return renderer;
    };

    window.THREE.WebGLRenderer.prototype = OriginalWebGLRenderer.prototype;
    isThreePatched = true;
    //console.log('[Three.js Patch] THREE.WebGLRenderer patched with safety checks.');
}

function loadScript(src, onLoad, onError) {
    if (window._vcp_loaded_scripts.has(src)) {
        if(onLoad) onLoad();
        return;
    }
    window._vcp_loaded_scripts.add(src); // Pre-mark to prevent race conditions
    
    const scriptEl = document.createElement('script');
    scriptEl.src = src;
    scriptEl.onload = () => {
        //console.log(`[Animation] ✅ Library loaded: ${src}`);
        if (onLoad) onLoad();
    };
    scriptEl.onerror = () => {
        console.error(`[Animation] ❌ Failed to load: ${src}`);
        window._vcp_loaded_scripts.delete(src); // Allow retry on failure
        if (onError) onError();
    };
    document.head.appendChild(scriptEl);
}

function processScripts(containerElement) {
    // Separate scripts by type
    const allScripts = Array.from(containerElement.querySelectorAll('script'));
    const threeScripts = allScripts.filter(s => s.src && s.src.includes('three'));
    const otherExternalScripts = allScripts.filter(s => s.src && !s.src.includes('three'));
    const inlineScripts = allScripts.filter(s => !s.src && s.textContent.trim());

    // Clean up all script tags from the message body
    allScripts.forEach(s => { if (s.parentNode) s.parentNode.removeChild(s); });

    const executeInline = () => {
        inlineScripts.forEach(script => {
            try {
                const newScript = document.createElement('script');
                // 通过IIFE（立即调用函数表达式）包裹脚本，防止全局作用域污染和变量重定义错误
                newScript.textContent = `(function(){\n${script.textContent}\n})();`;
                document.head.appendChild(newScript).parentNode.removeChild(newScript);
            } catch (e) {
                console.error('[Animation] Error executing inline script:', e);
            }
        });
    };

    const loadOtherScriptsAndExecuteInline = () => {
        let remaining = otherExternalScripts.length;
        if (remaining === 0) {
            executeInline();
            return;
        }
        const onScriptLoaded = () => {
            remaining--;
            if (remaining === 0) {
                executeInline();
            }
        };
        otherExternalScripts.forEach(s => {
            loadScript(replaceCdnUrls(s.src), onScriptLoaded, onScriptLoaded);
        });
    };

    if (threeScripts.length > 0) {
        loadScript('vendor/three.min.js', () => {
            patchThreeJS();
            loadOtherScriptsAndExecuteInline();
        });
    } else {
        loadOtherScriptsAndExecuteInline();
    }
}

export function processAnimationsInContent(containerElement) {
    if (!containerElement) return;
    processScripts(containerElement);
}


export function cleanupAnimationsInContent(contentDiv) {
    if (!contentDiv) return;

    if (window.anime) {
        const animatedElements = contentDiv.querySelectorAll('*');
        if (animatedElements.length > 0) anime.remove(animatedElements);
    }

    if (trackedThreeInstances.has(contentDiv)) {
        const instancesToClean = trackedThreeInstances.get(contentDiv);
        //console.log(`[Cleanup] Cleaning ${instancesToClean.length} Three.js instance(s)`);

        instancesToClean.forEach(instance => {
            if (instance.renderer && !instance.renderer._disposed) {
                const scene = instance.getScene();
                if (scene) {
                    scene.traverse(object => {
                        if (object.isMesh) {
                            if (object.geometry) object.geometry.dispose();
                            if (object.material) {
                                if (Array.isArray(object.material)) {
                                    object.material.forEach(mat => { if (mat.dispose) mat.dispose(); });
                                } else if (object.material.dispose) {
                                    object.material.dispose();
                                }
                            }
                        }
                    });
                }
                try {
                    instance.renderer.dispose();
                } catch (e) {
                    console.warn('[Cleanup] Error during renderer disposal:', e);
                }
            }
        });

        trackedThreeInstances.delete(contentDiv);
    }
}

export function animateMessageIn(messageItem) {
    if (!window.anime) return;
    messageItem.style.opacity = 0;
    messageItem.style.transform = 'translateY(20px)';
    anime({
        targets: messageItem,
        opacity: 1,
        translateY: 0,
        duration: 500,
        easing: 'easeOutExpo',
        complete: () => {
            messageItem.style.opacity = '';
            messageItem.style.transform = '';
        }
    });
}

export function animateMessageOut(messageItem, onComplete) {
    if (!window.anime) {
        if (onComplete) onComplete();
        return;
    }
    anime({
        targets: messageItem,
        opacity: 0,
        translateY: -20,
        duration: 400,
        easing: 'easeInExpo',
        complete: onComplete
    });
}
