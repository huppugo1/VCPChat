import { invoke } from '@tauri-apps/api/tauri';

document.addEventListener('DOMContentLoaded', () => {
    const editorTextarea = document.getElementById('editor');
    const historyList = document.getElementById('historyList');
    const newCanvasBtn = document.getElementById('newCanvasBtn');
    const filePathSpan = document.getElementById('filePath');
    const errorInfoSpan = document.getElementById('errorInfo');
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');
    const sidebar = document.querySelector('.sidebar');
    const resizer = document.getElementById('resizer');
    const changeHistorySidebar = document.getElementById('change-history-sidebar');
    const resizerRight = document.getElementById('resizer-right');
    const changeHistoryList = document.getElementById('changeHistoryList');
    const contextMenu = document.getElementById('context-menu');
    const renameBtn = document.getElementById('rename-btn');
    const copyBtn = document.getElementById('copy-btn');
    const deleteBtn = document.getElementById('delete-btn');
    const runPyBtn = document.getElementById('run-py-btn');
    const renderMdBtn = document.getElementById('render-md-btn');
    const renderHtmlBtn = document.getElementById('render-html-btn');
    const toggleWrapBtn = document.getElementById('toggle-wrap-btn');
    const externalChangeBar = document.getElementById('external-change-bar');
    const viewDiffBtn = document.getElementById('view-diff-btn');
    const dismissChangeBtn = document.getElementById('dismiss-change-btn');
    const diffModal = document.getElementById('diff-modal');
    const diffViewContainer = document.getElementById('diff-view');
    const acceptChangesBtn = document.getElementById('accept-changes-btn');
    const rejectChangesBtn = document.getElementById('reject-changes-btn');

    let editor;
    let externalFileContent = null; // To store content from AI
    let diffView = null;
    const editorContextMenu = document.getElementById('editor-context-menu');
    let filesHistory = {}; // Object to store history arrays, keyed by file path

    // Helper to call backend via Tauri invoke with fallback to tauriAPI
    async function callBackend(cmd, args, fallback) {
        if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
            try { return await window.__TAURI__.invoke(cmd, args); } catch (e) { console.warn('[Canvas] Tauri invoke failed for', cmd, e); }
        }
        if (window.tauriAPI && typeof fallback === 'function') {
            try { return await fallback(); } catch (e) { console.warn('[Canvas] tauriAPI fallback failed for', cmd, e); }
        }
        return null;
    }

    // --- CodeMirror 5 Initialization ---
    function initializeEditor(initialData) {
        if (editor) {
            // If editor exists, just update its content
            if (initialData.current) {
                editor.setValue(initialData.current.content);
                filePathSpan.textContent = initialData.current.path;
                // Update syntax highlighting for the new content's file type
                if (editor) {
                    const mode = getModeForFilePath(initialData.current.path);
                    editor.setOption('mode', mode);
                    updateTopBarButtons(initialData.current.path);
                }
            }
            if (initialData.history) {
                updateHistoryList(initialData.history);
            }
            return;
        }

        editor = CodeMirror.fromTextArea(editorTextarea, {
            lineNumbers: true,
            mode: 'javascript',
            theme: 'material-darker',
            lineWrapping: false,
            continueComments: "Enter",
        });

        // --- Event Listeners (only bind once) ---

        // Auto-save on content change
        let debounceTimer;
        editor.on('change', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const content = editor.getValue();
                const path = filePathSpan.textContent;
                if (path !== '未保存') {
                    callBackend('save_canvas_file', { path, content }, () => {
                        return window.tauriAPI ? window.tauriAPI.saveCanvasFile({ path, content }) : Promise.resolve({ success: false });
                    });
                    addContentHistory(path, content);
                }
            }, 2000);
        });

        // Editor Context Menu
        editor.on('contextmenu', (cm, e) => {
            e.preventDefault();
            const selection = cm.getSelection();
            editorContextMenu.querySelector('[data-action="cut"]').disabled = !selection;
            editorContextMenu.querySelector('[data-action="copy"]').disabled = !selection;
            navigator.clipboard.readText().then(text => {
                editorContextMenu.querySelector('[data-action="paste"]').disabled = !text;
            }).catch(() => {
                editorContextMenu.querySelector('[data-action="paste"]').disabled = true;
            });
            const history = cm.historySize();
            editorContextMenu.querySelector('[data-action="undo"]').disabled = history.undo === 0;
            editorContextMenu.querySelector('[data-action="redo"]').disabled = history.redo === 0;
            editorContextMenu.style.top = `${e.clientY}px`;
            editorContextMenu.style.left = `${e.clientX}px`;
            editorContextMenu.style.display = 'block';
        });

        if (initialData.current) {
            const path = initialData.current.path;
            const initialContent = initialData.current.content;
            editor.setValue(initialContent);
            filePathSpan.textContent = path;
            // Initialize history for this file path if it doesn't exist
            if (!filesHistory[path]) {
                filesHistory[path] = [];
            }
            addContentHistory(path, initialContent, true); // Add initial state
            updateChangeHistoryList(path); // Display history for the current file
            // Set initial syntax highlighting
            const mode = getModeForFilePath(path);
            editor.setOption('mode', mode);
            updateTopBarButtons(path);
        } else {
            editor.setValue('// Welcome to Canvas with CodeMirror 5!');
        }

        if (initialData.history) {
            updateHistoryList(initialData.history);
        }

    }

    // --- Theme Handling ---
    function applyTheme(theme) {
        const currentTheme = theme || 'dark';
        document.body.classList.toggle('light-theme', currentTheme === 'light');
        if (editor) {
            editor.setOption('theme', currentTheme === 'light' ? 'default' : 'material-darker');
        }
    }

    // --- IPC Event Listeners ---
    // Prefer Tauri events where available, fallback to tauriAPI callbacks
    if (window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
        // canvas-load-data
        try {
            window.__TAURI__.event.listen('canvas-load-data', async (evt) => {
                const data = evt.payload;
                initializeEditor(data);
                try {
                    const theme = await callBackend('get_current_theme', {}, () => {
                        return (window.tauriAPI && typeof window.tauriAPI.getCurrentTheme === 'function') ? window.tauriAPI.getCurrentTheme() : Promise.resolve(null);
                    });
                    applyTheme(theme);
                    if (!window.isThemeListenerAttached) {
                        // Tauri theme-updated will handle subsequent updates
                        window.isThemeListenerAttached = true;
                    }
                } catch (error) {
                    console.error('Failed to get current theme on load:', error);
                    applyTheme('dark');
                }
            });
        } catch (e) { console.warn('Failed to listen for canvas-load-data', e); }

        // canvas-file-changed
        try {
            window.__TAURI__.event.listen('canvas-file-changed', (evt) => {
                const file = evt.payload;
                const path = file.path;
                if (!filesHistory[path]) filesHistory[path] = [];
                if (editor && editor.getValue() !== file.content) {
                    editor.setValue(file.content);
                    const mode = getModeForFilePath(path);
                    editor.setOption('mode', mode);
                    updateTopBarButtons(path);
                    addContentHistory(path, file.content);
                    updateChangeHistoryList(path);
                }
                filePathSpan.textContent = path;
                updateChangeHistoryList(path);
            });
        } catch (e) { console.warn('Failed to listen for canvas-file-changed', e); }

        // load-canvas-file-by-path
        try {
            window.__TAURI__.event.listen('load-canvas-file-by-path', (evt) => {
                const filePath = evt.payload;
                callBackend('load_canvas_file', { path: filePath }, () => {
                    return (window.tauriAPI && typeof window.tauriAPI.loadCanvasFile === 'function') ? window.tauriAPI.loadCanvasFile(filePath) : Promise.resolve();
                });
            });
        } catch (e) { console.warn('Failed to listen for load-canvas-file-by-path', e); }

        // external-file-changed
        try {
            window.__TAURI__.event.listen('external-file-changed', (evt) => {
                const file = evt.payload;
                if (editor && editor.getValue() !== file.content) {
                    //console.log('External change detected, showing notification bar.');
                    externalFileContent = file.content;
                    externalChangeBar.style.display = 'flex';
                }
            });
        } catch (e) { console.warn('Failed to listen for external-file-changed', e); }

        // inform backend that canvas is ready
        callBackend('canvas_ready', {}, () => {
            if (window.tauriAPI && typeof window.tauriAPI.canvasReady === 'function') {
                return window.tauriAPI.canvasReady();
            }
            return Promise.resolve();
        });
    } else if (window.tauriAPI) {
        // Fallback to tauriAPI callbacks
        window.tauriAPI.onCanvasLoadData(async (data) => {
            initializeEditor(data);
            try {
                const theme = await callBackend('get_current_theme', {}, () => {
                    return (window.tauriAPI && typeof window.tauriAPI.getCurrentTheme === 'function') ? window.tauriAPI.getCurrentTheme() : Promise.resolve(null);
                });
                applyTheme(theme);
                if (!window.isThemeListenerAttached) {
                    window.tauriAPI.onThemeUpdated(applyTheme);
                    window.isThemeListenerAttached = true;
                }
            } catch (error) {
                console.error('Failed to get current theme on load:', error);
                applyTheme('dark');
            }
        });

        window.tauriAPI.onCanvasFileChanged((file) => {
            const path = file.path;
            if (!filesHistory[path]) filesHistory[path] = [];
            if (editor && editor.getValue() !== file.content) {
                editor.setValue(file.content);
                const mode = getModeForFilePath(path);
                editor.setOption('mode', mode);
                updateTopBarButtons(path);
                addContentHistory(path, file.content);
                updateChangeHistoryList(path);
            }
            filePathSpan.textContent = path;
            updateChangeHistoryList(path);
        });

        window.tauriAPI.onLoadCanvasFileByPath((filePath) => {
            if (window.tauriAPI) {
                window.tauriAPI.loadCanvasFile(filePath);
            }
        });

        window.tauriAPI.onExternalFileChanged((file) => {
            if (editor && editor.getValue() !== file.content) {
                //console.log('External change detected, showing notification bar.');
                externalFileContent = file.content;
                externalChangeBar.style.display = 'flex';
            }
        });

        window.tauriAPI.canvasReady();
    }

    // --- Diff View Logic ---
    function initializeDiffView(originalContent, modifiedContent) {
        if (diffView) {
            // If it exists, just update contents
            diffView.edit.setValue(originalContent);
            diffView.right.orig.setValue(modifiedContent);
            return;
        }
        
        diffViewContainer.innerHTML = ''; // Clear previous view if any
        diffView = CodeMirror.MergeView(diffViewContainer, {
            value: originalContent,          // Original content on the left
            origRight: modifiedContent,      // Modified content on the right
            lineNumbers: true,
            mode: editor.getOption('mode'),  // Use the same mode as the main editor
            theme: editor.getOption('theme'),
            lineWrapping: editor.getOption('lineWrapping'), // Sync line wrapping with main editor
            revertButtons: false,            // We have our own buttons
            connect: 'align',
            collapseIdentical: true,
        });
    }

    viewDiffBtn.addEventListener('click', () => {
        if (editor && externalFileContent !== null) {
            const originalContent = editor.getValue();
            initializeDiffView(originalContent, externalFileContent);
            diffModal.style.display = 'flex';
            // Refresh the diff view after it becomes visible
            setTimeout(() => {
                if (diffView) {
                   diffView.edit.refresh();
                   diffView.right.orig.refresh();
                }
            }, 10);
        }
    });

    function closeDiffViewAndBar() {
        diffModal.style.display = 'none';
        externalChangeBar.style.display = 'none';
        externalFileContent = null;
    }

    acceptChangesBtn.addEventListener('click', () => {
        if (editor && externalFileContent !== null) {
            editor.setValue(externalFileContent); // This will trigger the auto-save
        }
        closeDiffViewAndBar();
    });

    function rejectChanges() {
        if (editor && window.tauriAPI) {
            const userContent = editor.getValue();
            const path = filePathSpan.textContent;
            // Force save the user's current content back to the file system
            window.tauriAPI.saveCanvasFile({ path, content: userContent });
        }
        closeDiffViewAndBar();
    }

    rejectChangesBtn.addEventListener('click', rejectChanges);
    dismissChangeBtn.addEventListener('click', rejectChanges);

    // --- UI Event Listeners ---
    newCanvasBtn.addEventListener('click', () => {
        if (window.tauriAPI) {
            window.tauriAPI.createNewCanvas();
        }
    });

    toggleWrapBtn.addEventListener('click', () => {
        if (editor) {
            const currentStatus = editor.getOption('lineWrapping');
            editor.setOption('lineWrapping', !currentStatus);
            toggleWrapBtn.textContent = `自动换行: ${!currentStatus ? '开' : '关'}`;
        }
    });

    historyList.addEventListener('click', (e) => {
        if (e.target && e.target.matches('li[data-path]')) {
            const filePath = e.target.dataset.path;
            callBackend('load_canvas_file', { path: filePath }, () => {
                return (window.tauriAPI && typeof window.tauriAPI.loadCanvasFile === 'function') ? window.tauriAPI.loadCanvasFile(filePath) : Promise.resolve();
            });
        }
    });

    // --- Context Menu for History List ---
    let activeListItem = null;

    historyList.addEventListener('contextmenu', (e) => {
        const targetLi = e.target.closest('li[data-path]');
        if (targetLi) {
            e.preventDefault();
            activeListItem = targetLi;
            contextMenu.style.top = `${e.clientY}px`;
            contextMenu.style.left = `${e.clientX}px`;
            contextMenu.style.display = 'block';
        }
    });

    document.addEventListener('click', (e) => {
        // Close both context menus if clicked outside
        if (!contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
            activeListItem = null;
        }
        if (!editorContextMenu.contains(e.target)) {
            editorContextMenu.style.display = 'none';
        }
    });

    editorContextMenu.addEventListener('click', (e) => {
        const action = e.target.closest('button')?.dataset.action;
        if (action && editor) {
            switch (action) {
                case 'undo': editor.undo(); break;
                case 'redo': editor.redo(); break;
                case 'cut':
                    const selection = editor.getSelection();
                    if (selection) {
                        navigator.clipboard.writeText(selection).then(() => {
                            editor.replaceSelection('');
                        });
                    }
                    break;
                case 'copy': document.execCommand('copy'); break;
                case 'paste':
                    navigator.clipboard.readText().then(text => {
                        editor.replaceSelection(text);
                    });
                    break;
                case 'selectAll': editor.execCommand('selectAll'); break;
            }
        }
        editorContextMenu.style.display = 'none';
    });

    renameBtn.addEventListener('click', () => {
        if (activeListItem) {
            enterRenameMode(activeListItem);
        }
        contextMenu.style.display = 'none';
    });

    copyBtn.addEventListener('click', () => {
        if (activeListItem) {
            const filePath = activeListItem.dataset.path;
            callBackend('copy_canvas_file', { path: filePath }, () => {
                return (window.tauriAPI && typeof window.tauriAPI.copyCanvasFile === 'function') ? window.tauriAPI.copyCanvasFile(filePath) : Promise.resolve();
            });
        }
        contextMenu.style.display = 'none';
    });

    deleteBtn.addEventListener('click', async () => {
        if (activeListItem) {
            const filePath = activeListItem.dataset.path;
            const fileName = await window.electronPath.basename(filePath);
            const confirmed = await window.customConfirm(
                `确定要删除文件 "${fileName}"? 这个操作无法撤销。`,
                '⚠️ 删除文件'
            );
            if (confirmed) {
                await callBackend('delete_canvas_file', { path: filePath }, () => {
                    return (window.tauriAPI && typeof window.tauriAPI.deleteCanvasFile === 'function') ? window.tauriAPI.deleteCanvasFile(filePath) : Promise.resolve();
                });
            }
        }
        contextMenu.style.display = 'none';
    });

    function enterRenameMode(li) {
        const originalTitle = li.textContent;
        li.innerHTML = ''; // Clear the list item

        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalTitle;
        input.className = 'rename-input';
        li.appendChild(input);
        input.focus();
        input.select();

        const finishRename = async () => {
            const newTitle = input.value.trim();
            const oldPath = li.dataset.path;

                if (newTitle && newTitle !== originalTitle) {
                    try {
                        const res = await callBackend('rename_canvas_file', { oldPath, newTitle }, () => {
                            return (window.tauriAPI && typeof window.tauriAPI.renameCanvasFile === 'function') ? window.tauriAPI.renameCanvasFile({ oldPath, newTitle }) : Promise.resolve(null);
                        });
                        const newPath = res && res.newPath ? res.newPath : null;
                        if (newPath) {
                            li.textContent = newTitle;
                            li.dataset.path = newPath;
                            if (filePathSpan.textContent === oldPath) {
                                filePathSpan.textContent = newPath;
                            }
                        } else {
                            throw new Error('Rename failed or returned no new path');
                        }
                    } catch (error) {
                        console.error('Rename failed:', error);
                        li.textContent = originalTitle; // Revert on failure
                    }
                }
            } else {
                li.textContent = originalTitle; // Revert if no change or empty
            }
        };

        input.addEventListener('blur', finishRename);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            } else if (e.key === 'Escape') {
                li.textContent = originalTitle;
                input.removeEventListener('blur', finishRename); // Avoid double-revert
                input.blur();
            }
        });
    }

    if (minimizeBtn && maximizeBtn && closeBtn) {
        minimizeBtn.addEventListener('click', () => {
            invoke('minimize_window').catch(err => console.error('minimize_window failed', err));
        });
        maximizeBtn.addEventListener('click', () => {
            invoke('toggle_maximize_window').catch(err => console.error('toggle_maximize_window failed', err));
        });
        closeBtn.addEventListener('click', () => {
            invoke('close_window').catch(err => console.error('close_window failed', err));
        });
    }

    // --- Sidebar Resizing ---
    let isResizing = false;
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', () => {
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            // Refresh CodeMirror to adjust to the new size
            if (editor) {
                editor.refresh();
            }
        });
    });

    function handleMouseMove(e) {
        if (!isResizing) return;
        // The new width is simply the mouse's x position, since the sidebar is anchored to the left.
        const newWidth = e.clientX;
        const minWidth = parseInt(getComputedStyle(sidebar).minWidth, 10);
        const maxWidth = parseInt(getComputedStyle(sidebar).maxWidth, 10);

        if (newWidth >= minWidth && newWidth <= maxWidth) {
            sidebar.style.width = `${newWidth}px`;
        }
    }

    // --- Right Sidebar Resizing ---
    let isResizingRight = false;
    resizerRight.addEventListener('mousedown', (e) => {
        isResizingRight = true;
        document.addEventListener('mousemove', handleRightMouseMove);
        document.addEventListener('mouseup', () => {
            isResizingRight = false;
            document.removeEventListener('mousemove', handleRightMouseMove);
            if (editor) {
                editor.refresh();
            }
        });
    });

    function handleRightMouseMove(e) {
        if (!isResizingRight) return;
        const containerWidth = document.querySelector('.main-container').offsetWidth;
        const newWidth = containerWidth - e.clientX;
        const minWidth = 150; // Or get from CSS
        const maxWidth = 500;  // Or get from CSS

        if (newWidth >= minWidth && newWidth <= maxWidth) {
            changeHistorySidebar.style.width = `${newWidth}px`;
        }
    }

    // --- Top Bar Button Logic ---
    function updateTopBarButtons(filePath) {
       const extension = filePath ? filePath.split('.').pop().toLowerCase() : '';
       runPyBtn.style.display = extension === 'py' ? 'block' : 'none';
       renderMdBtn.style.display = extension === 'md' ? 'block' : 'none';
       renderHtmlBtn.style.display = extension === 'html' ? 'block' : 'none';
    }

    runPyBtn.addEventListener('click', async () => {
       if (editor) {
           const code = editor.getValue();
           try {
               const res = await callBackend('execute_python_code', { code }, () => {
                   return (window.tauriAPI && typeof window.tauriAPI.executePythonCode === 'function') ? window.tauriAPI.executePythonCode(code) : Promise.resolve({ stdout: '', stderr: 'No backend' });
               });
               const { stdout, stderr } = res || {};
               //console.log('Python stdout:', stdout);
               console.error('Python stderr:', stderr);
               //console.log('Python Output:\n' + (stdout || stderr)); // 调试信息
           } catch (err) {
               console.error('Python execution failed:', err);
               console.error('Python execution failed:\n' + err); // 调试信息
           }
       }
    });

    renderMdBtn.addEventListener('click', () => {
       if (editor) {
           const content = editor.getValue();
           callBackend('open_text_in_new_window', { content, title: 'Markdown Preview', theme: 'dark' }, () => {
               return (window.tauriAPI && typeof window.tauriAPI.openTextInNewWindow === 'function') ? window.tauriAPI.openTextInNewWindow(content, 'Markdown Preview', 'dark') : Promise.resolve();
           });
       }
    });

    renderHtmlBtn.addEventListener('click', () => {
       if (editor) {
           const content = editor.getValue();
           callBackend('open_text_in_new_window', { content, title: 'HTML Preview', theme: 'dark' }, () => {
               return (window.tauriAPI && typeof window.tauriAPI.openTextInNewWindow === 'function') ? window.tauriAPI.openTextInNewWindow(content, 'HTML Preview', 'dark') : Promise.resolve();
           });
       }
    });

    // --- Helper Functions ---
    function getModeForFilePath(filePath) {
        if (!filePath) {
           updateTopBarButtons('');
           return 'javascript'; // Default mode
        }
        const extension = filePath.split('.').pop().toLowerCase();
        switch (extension) {
            case 'js':
                return 'javascript';
            case 'ts':
                return 'text/typescript';
            case 'py':
                return 'python';
            case 'css':
                return 'css';
            case 'html':
                return 'htmlmixed';
            case 'json':
                return 'application/json';
            case 'md':
                return 'markdown';
            case 'rs':
                return 'rust';
            case 'cpp':
            case 'h':
                return 'text/x-c++src';
            case 'cs':
                return 'text/x-csharp';
            case 'java':
                return 'text/x-java';
            case 'go':
                return 'text/x-go';
            case 'rb':
                return 'text/x-ruby';
            case 'php':
                return 'application/x-httpd-php';
            case 'swift':
                return 'text/x-swift';
            case 'kt':
                return 'text/x-kotlin';
            case 'sh':
                return 'text/x-sh';
            case 'yml':
            case 'yaml':
                return 'text/x-yaml';
            case 'toml':
                return 'text/x-toml';
            case 'xml':
                return 'application/xml';
            case 'txt':
            default:
                return 'text/plain';
        }
    }

    function updateHistoryList(history) {
        historyList.innerHTML = '';
        history.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item.title;
            li.dataset.path = item.path;
            if (item.isActive) {
                li.classList.add('active');
            }
            historyList.appendChild(li);
        });
    }

    // --- Document Change History Logic ---
    function addContentHistory(path, content, isInitial = false) {
        if (!path || !filesHistory[path]) return;

        const history = filesHistory[path];
        // Avoid adding duplicates
        if (!isInitial && history.length > 0 && history[history.length - 1].content === content) {
            return;
        }
        const historyEntry = {
            content: content,
            timestamp: new Date(),
        };
        history.push(historyEntry);
        updateChangeHistoryList(path);
    }

    async function updateChangeHistoryList(path) {
        changeHistoryList.innerHTML = '';
        if (!path || !filesHistory[path]) return;

        const history = filesHistory[path];
        const currentContent = editor.getValue();
        let activeIndex = -1;

        // Find which history entry matches the current content to highlight it
        for(let i = history.length - 1; i >= 0; i--) {
            if (history[i].content === currentContent) {
                activeIndex = i;
                break;
            }
        }

        const fileName = window.electronPath ? await window.electronPath.basename(path) : path;

        history.forEach((item, index) => {
            const li = document.createElement('li');
            li.textContent = `${item.timestamp.toLocaleTimeString()} - ${fileName}`;
            li.dataset.index = index;
            if (index === activeIndex) {
                li.classList.add('active');
            }
            changeHistoryList.appendChild(li);
        });
        // Auto-scroll to the bottom
        changeHistoryList.scrollTop = changeHistoryList.scrollHeight;
    }

    changeHistoryList.addEventListener('click', (e) => {
        if (e.target && e.target.matches('li[data-index]')) {
            const path = filePathSpan.textContent;
            if (!path || !filesHistory[path]) return;

            const history = filesHistory[path];
            const index = parseInt(e.target.dataset.index, 10);

            if (index >= 0 && index < history.length) {
                const selectedContent = history[index].content;
                if (editor.getValue() !== selectedContent) {
                    editor.setValue(selectedContent);
                    // The editor 'change' event will fire, which will trigger a save
                    // and add a new history item. This is desired behavior if the user
                    // reverts and then starts typing again.
                }
                // Update the active state in the list
                updateChangeHistoryList(path);
            }
        }
    });

});