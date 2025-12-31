document.addEventListener('DOMContentLoaded', () => {
    const themesGrid = document.getElementById('themesGrid');
    const previewBox = document.getElementById('previewBox');
    const saveThemeBtn = document.getElementById('saveThemeBtn');
    const container = document.querySelector('.container');

    let selectedTheme = null;
    let themes = [];

    // Helper function to convert hex color to an RGB string "r, g, b"
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : null;
    }

    // Helper function to convert hex color to a semi-transparent RGBA string
    function hexToRgba(hex, alpha = 0.85) {
        if (!hex || !hex.startsWith('#')) return hex; // Return original if not a valid hex color
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

   // Function to clean up duplicated path segments
   const fixWallpaperPath = (path) => {
       if (typeof path !== 'string') return path;
       return path.replace(/wallpaper\/wallpaper\//g, 'wallpaper/');
   };

   // Helper to escape single quotes and backslashes for CSS url()
   const escapeCssUrl = (url) => {
       if (typeof url !== 'string') return '';
       // Replace backslashes with forward slashes for CSS compatibility
       return url.replace(/\\/g, '/').replace(/'/g, "\\'");
   };

  // Simple HEAD check for URL reachability
  async function urlReachable(url, timeout = 1200) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      const resp = await fetch(url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(id);
      return !!(resp && resp.ok);
    } catch (e) {
      return false;
    }
  }

  // Helper to call backend via Tauri invoke with fallback to tauriAPI
  async function callBackend(cmd, args, fallback) {
      if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
          try { return await window.__TAURI__.invoke(cmd, args); } catch (e) { console.warn('[Themes] Tauri invoke failed for', cmd, e); }
      }
      if (window.tauriAPI && typeof fallback === 'function') {
          try { return await fallback(); } catch (e) { console.warn('[Themes] tauriAPI fallback failed for', cmd, e); }
      }
      return null;
  }

  // 使用 Tauri convertFileSrc 加载资源
  async function toAssetUrl(path) {
    if (!path || typeof path !== 'string') return path;
    
    // 已经是完整 URL，直接返回
    if (/^https?:\/\/|^data:|^blob:|^asset:\/\/|^https:\/\/asset\.localhost\//.test(path)) {
      return path;
    }
    
    try {
      const { loadAsset } = await import('../utils/utils/assetLoader.js');
      return await loadAsset(path);
    } catch (e) {
      console.warn('[Themes] loadAsset failed:', e);
      return path;
    }
  }

  // New function to load wallpaper previews using thumbnails (falls back gracefully)
  async function loadWallpaperPreview(element, wallpaperPath) {
      if (!element) return;

      if (wallpaperPath && wallpaperPath !== 'none') {
          // Extract the path from url('path') format
          const match = wallpaperPath.match(/url\(['"]?(.*?)['"]?\)/);
          const imagePath = match ? match[1] : wallpaperPath;

          // Detect remote/data/file urls - these can be used directly
          const isRemoteOrData = /^data:|^https?:|^blob:|^asset:\/\/|^https:\/\/asset\.localhost\//.test(imagePath);

          if (isRemoteOrData) {
              // 已经是完整 URL，直接使用
              element.style.backgroundImage = `url('${escapeCssUrl(imagePath)}')`;
              return;
          }

          // Prefer generating/using a thumbnail via the main process when possible
          try {
              const thumbPath = await callBackend('get_wallpaper_thumbnail', { path: imagePath }, () => {
                  return (window.tauriAPI && typeof window.tauriAPI.getWallpaperThumbnail === 'function') ? window.tauriAPI.getWallpaperThumbnail(imagePath) : null;
              });
              if (thumbPath) {
                  // 使用 Tauri convertFileSrc 转换路径
                  const finalUrl = await toAssetUrl(thumbPath);
                  //console.log('[Themes] Thumbnail URL:', finalUrl);
                  element.style.backgroundImage = `url('${escapeCssUrl(finalUrl)}')`;
                  return;
              }
          } catch (err) {
              console.warn('Thumbnail retrieval failed, falling back to direct path', err);
          }
          
          // Fallback: 直接使用 loadAsset 转换路径
          const finalUrl = await toAssetUrl(imagePath);
          //console.log('[Themes] Fallback URL:', finalUrl);
          element.style.backgroundImage = `url('${escapeCssUrl(finalUrl)}')`;
      } else {
          element.style.backgroundImage = 'none';
      }
  }

    // 1. Fetch themes from the backend (Tauri preferred)
    (async () => {
        try {
            const themeList = await callBackend('get_themes', {}, () => {
                return (window.tauriAPI && typeof window.tauriAPI.getThemes === 'function') ? window.tauriAPI.getThemes() : [];
            });
            //console.log('[Themes] Loaded themes:', themeList);
            themes = themeList || [];
            
            // 调试：打印第一个主题的变量
            if (themes.length > 0) {
                //console.log('[Themes] First theme variables:', themes[0].variables);
                if (themes[0].variables && themes[0].variables.dark) {
                    //console.log('[Themes] Dark wallpaper:', themes[0].variables.dark['--chat-wallpaper-dark']);
                }
            }
        } catch (e) {
            console.error('Failed to load themes from backend', e);
            themes = [];
        }
        renderThemeCards();
        if (themes.length > 0) selectTheme(themes[0].fileName);
    })();

    // 2. Render theme cards with the new dual-theme design
    function renderThemeCards() {
        themesGrid.innerHTML = '';
        themes.forEach(theme => {
            const card = document.createElement('div');
            card.className = 'theme-card';
            card.dataset.fileName = theme.fileName;

            const preview = document.createElement('div');
            preview.className = 'card-preview';

            const pane1 = document.createElement('div');
            pane1.className = 'card-preview-pane-1';
            // Use dark theme for the left side of the card preview
            if (theme.variables.dark) {
                pane1.style.backgroundColor = theme.variables.dark['--secondary-bg'] || '#172A46';
                loadWallpaperPreview(pane1, theme.variables.dark['--chat-wallpaper-dark']);
            }
            pane1.style.backgroundSize = 'cover';
            pane1.style.backgroundPosition = 'center';
 
            const pane2 = document.createElement('div');
            pane2.className = 'card-preview-pane-2';
            // Use light theme for the right side of the card preview
            if (theme.variables.light) {
                pane2.style.backgroundColor = theme.variables.light['--primary-bg'] || '#F0F8FF';
                // For the card, prefer the light wallpaper, fallback to dark, then none.
                const lightWallpaper = theme.variables.light['--chat-wallpaper-light'];
                const darkWallpaper = theme.variables.dark ? theme.variables.dark['--chat-wallpaper-dark'] : 'none';
                loadWallpaperPreview(pane2, lightWallpaper || darkWallpaper);
            }
            pane2.style.backgroundSize = 'cover';
            pane2.style.backgroundPosition = 'center';
            
            preview.appendChild(pane1);
            preview.appendChild(pane2);

            const name = document.createElement('h3');
            name.textContent = theme.name;

            card.appendChild(preview);
            card.appendChild(name);

            card.addEventListener('click', () => selectTheme(theme.fileName));
            themesGrid.appendChild(card);
        });
    }

    // 3. Select a theme and update the UI
    function selectTheme(fileName) {
        selectedTheme = themes.find(t => t.fileName === fileName);
        if (!selectedTheme) return;

        // Update card selection state
        document.querySelectorAll('.theme-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.fileName === fileName);
        });

        // Update the main preview with the full variables object { dark, light }
        updatePreview(selectedTheme.variables);
    }

    // 4. Update the live preview area to show both dark and light themes
    function updatePreview(variables) {
        const darkVars = variables.dark;
        const lightVars = variables.light;

        const pane1 = document.getElementById('preview-pane-1');
        const pane2 = document.getElementById('preview-pane-2');
        const wallpaper1 = document.getElementById('preview-wallpaper-1');
        const wallpaper2 = document.getElementById('preview-wallpaper-2');
        const previewButtons1 = document.getElementById('preview-buttons-1');
        const previewButtons2 = document.getElementById('preview-buttons-2');

        // --- Apply Dark Theme to Pane 1 (Left) ---
        if (pane1 && darkVars) {
            // Set pane-specific variables for mock elements inside this pane
            pane1.style.setProperty('--secondary-text', darkVars['--secondary-text']);
            
            // Set the pane's actual background color (with transparency)
            // This pane simulates the "secondary" area (e.g., sidebar)
            pane1.style.backgroundColor = hexToRgba(darkVars['--secondary-bg'], 0.85);

            // Set the wallpaper on the dedicated background element
            if (wallpaper1) {
                loadWallpaperPreview(wallpaper1, darkVars['--chat-wallpaper-dark']);
            }

            // Apply button styles for dark theme by directly styling the buttons
            if (previewButtons1) {
                const primaryButton = previewButtons1.querySelector('.preview-button:not(.alt)');
                const altButton = previewButtons1.querySelector('.preview-button.alt');
                const buttonBg = darkVars['--button-bg'] || '#007bff';
                const textOnAccent = darkVars['--text-on-accent'] || '#ffffff';

                if (primaryButton) {
                    primaryButton.style.backgroundColor = buttonBg;
                    primaryButton.style.color = textOnAccent;
                }
                if (altButton) {
                    altButton.style.backgroundColor = 'transparent';
                    altButton.style.color = buttonBg;
                    altButton.style.borderColor = buttonBg;
                }
            }
        }

        // --- Apply Light Theme to Pane 2 (Right) ---
        if (pane2 && lightVars) {
            // Set pane-specific variables for mock elements inside this pane
            pane2.style.setProperty('--secondary-text', lightVars['--secondary-text']);

            // Set the pane's actual background color (with transparency)
            pane2.style.backgroundColor = hexToRgba(lightVars['--primary-bg'], 0.85);

            // Set the wallpaper on the dedicated background element
            if (wallpaper2) {
                const lightWallpaper = lightVars['--chat-wallpaper-light'];
                const darkWallpaper = darkVars ? fixWallpaperPath(darkVars['--chat-wallpaper-dark']) : 'none';
                loadWallpaperPreview(wallpaper2, lightWallpaper || darkWallpaper);
            }

            // Apply button styles for light theme by directly styling the buttons
            if (previewButtons2) {
                const primaryButton = previewButtons2.querySelector('.preview-button:not(.alt)');
                const altButton = previewButtons2.querySelector('.preview-button.alt');
                const buttonBg = lightVars['--button-bg'] || '#007bff';
                const textOnAccent = lightVars['--text-on-accent'] || '#ffffff';

                if (primaryButton) {
                    primaryButton.style.backgroundColor = buttonBg;
                    primaryButton.style.color = textOnAccent;
                }
                if (altButton) {
                    altButton.style.backgroundColor = 'transparent';
                    altButton.style.color = buttonBg;
                    altButton.style.borderColor = buttonBg;
                }
            }
        }
        
        // --- Update container's glow effect (still based on dark theme's button for consistency) ---
        if (darkVars) {
            container.style.setProperty('--button-bg', darkVars['--button-bg'] || '#007bff');
            container.style.setProperty('--button-bg-rgb', hexToRgb(darkVars['--button-bg']) || '0, 123, 255');
        }
    }

    // 5. Save the selected theme
    saveThemeBtn.addEventListener('click', () => {
        if (selectedTheme) {
            callBackend('apply_theme', { fileName: selectedTheme.fileName }, () => {
                if (window.tauriAPI && typeof window.tauriAPI.applyTheme === 'function') {
                    return window.tauriAPI.applyTheme(selectedTheme.fileName);
                }
                return Promise.resolve();
            }).catch(err => console.error('apply_theme failed', err));
        }
    });

    // --- Custom Title Bar Listeners ---
    const minimizeBtn = document.getElementById('minimize-theme-btn');
    const maximizeBtn = document.getElementById('maximize-theme-btn');
    const closeBtn = document.getElementById('close-theme-btn');

    minimizeBtn.addEventListener('click', () => {
        callBackend('minimize_window', {}, () => {
            if (window.tauriAPI && typeof window.tauriAPI.minimizeWindow === 'function') {
                return window.tauriAPI.minimizeWindow();
            }
            return Promise.resolve();
        }).catch(err => console.error('minimize_window failed', err));
    });

    maximizeBtn.addEventListener('click', () => {
        callBackend('toggle_maximize_window', {}, () => {
            if (window.tauriAPI && typeof window.tauriAPI.maximizeWindow === 'function') {
                return window.tauriAPI.maximizeWindow();
            }
            return Promise.resolve();
        }).catch(err => console.error('toggle_maximize_window failed', err));
    });

    closeBtn.addEventListener('click', () => {
        window.close();
    });
 
     // --- Theme Handling for the window itself ---
     const applyThemeForWindow = (theme) => {
        document.body.classList.toggle('light-theme', theme === 'light');
    };

    async function initializeTheme() {
        try {
            const theme = await callBackend('get_current_theme', {}, () => {
                return (window.tauriAPI && typeof window.tauriAPI.getCurrentTheme === 'function') ? window.tauriAPI.getCurrentTheme() : Promise.resolve(null);
            });
            applyThemeForWindow(theme || 'dark');
        } catch (error) {
            console.error('Failed to get initial theme for themes window:', error);
            applyThemeForWindow('dark'); // Fallback
        }
    }

    // Listen for theme updates (Tauri preferred, fallback to tauriAPI)
    if (window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
        try {
            window.__TAURI__.event.listen('theme-updated', (evt) => {
                try { applyThemeForWindow(evt.payload); } catch (e) { console.error('applyThemeForWindow failed on theme-updated', e); }
            });
        } catch (e) {
            console.warn('Tauri theme-updated listen failed, falling back to tauriAPI.onThemeUpdated', e);
            if (window.tauriAPI && typeof window.tauriAPI.onThemeUpdated === 'function') {
                window.tauriAPI.onThemeUpdated(applyThemeForWindow);
            }
        }
    } else if (window.tauriAPI && typeof window.tauriAPI.onThemeUpdated === 'function') {
        window.tauriAPI.onThemeUpdated(applyThemeForWindow);
    } else {
        console.warn('Theme updates listener not available.');
    }

    initializeTheme();
});