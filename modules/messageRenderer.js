// modules/messageRenderer.js

// --- Enhanced Rendering Constants ---
const ENHANCED_RENDER_DEBOUNCE_DELAY = 400; // ms, for general blocks during streaming
const DIARY_RENDER_DEBOUNCE_DELAY = 1000; // ms, potentially longer for diary if complex
const enhancedRenderDebounceTimers = new WeakMap(); // For debouncing prettify calls

import { avatarColorCache, getDominantAvatarColor } from './renderer/colorUtils.js';
import { initializeImageHandler, setContentAndProcessImages } from './renderer/imageHandler.js';
import { processAnimationsInContent, cleanupAnimationsInContent } from './renderer/animation.js';
import { createMessageSkeleton } from './renderer/domBuilder.js';
import * as streamManager from './renderer/streamManager.js';
import * as emoticonUrlFixer from './renderer/emoticonUrlFixer.js';
import { loadAsset } from './utils/utils/assetLoader.js';

const colorExtractionPromises = new Map();

async function getDominantAvatarColorCached(url) {
    if (!colorExtractionPromises.has(url)) {
        colorExtractionPromises.set(url, getDominantAvatarColor(url));
    }
    return colorExtractionPromises.get(url);
}

import * as contentProcessor from './renderer/contentProcessor.js';
import * as contextMenu from './renderer/messageContextMenu.js';


import * as middleClickHandler from './renderer/middleClickHandler.js';


// --- Pre-compiled Regular Expressions for Performance ---
const TOOL_REGEX = /<<<\[TOOL_REQUEST\]>>>(.*?)<<<\[END_TOOL_REQUEST\]>>>/gs;
const NOTE_REGEX = /<<<DailyNoteStart>>>(.*?)<<<DailyNoteEnd>>>/gs;
const TOOL_RESULT_REGEX = /\[\[VCP调用结果信息汇总:(.*?)VCP调用结果结束\]\]/gs;
const BUTTON_CLICK_REGEX = /\[\[点击按钮:(.*?)\]\]/gs;
const CANVAS_PLACEHOLDER_REGEX = /\{\{VCPChatCanvas\}\}/g;
const STYLE_REGEX = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const HTML_FENCE_CHECK_REGEX = /```\w*\n<!DOCTYPE html>/i;
const MERMAID_CODE_REGEX = /<code.*?>\s*(flowchart|graph|mermaid)\s+([\s\S]*?)<\/code>/gi;
const MERMAID_FENCE_REGEX = /```(mermaid|flowchart|graph)\n([\s\S]*?)```/g;
const CODE_FENCE_REGEX = /```\w*([\s\S]*?)```/g;
const START_END_MARKER_REGEX = /「始」([\s\S]*?)「末」/g;


// --- Enhanced Rendering Styles (from UserScript) ---
function injectEnhancedStyles() {
   try {
       const existingStyleElement = document.getElementById('vcp-enhanced-ui-styles');
       if (existingStyleElement) {
           // Style element already exists, no need to recreate
           return;
       }

       // Create link element to load external CSS
       const linkElement = document.createElement('link');
       linkElement.id = 'vcp-enhanced-ui-styles';
       linkElement.rel = 'stylesheet';
       linkElement.type = 'text/css';
       linkElement.href = 'styles/messageRenderer.css';
       document.head.appendChild(linkElement);

       // //console.log('VCPSub Enhanced UI: External styles loaded.'); // Reduced logging
   } catch (error) {
       console.error('VCPSub Enhanced UI: Failed to load external styles:', error);
   }
}

// --- Core Logic ---

/**
 * A helper function to escape HTML special characters.
 * @param {string} text The text to escape.
 * @returns {string} The escaped text.
 */
function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    return text
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#039;');
}

/**
 * Generates a unique ID for scoping CSS.
 * @returns {string} A unique ID string (e.g., 'vcp-bubble-1a2b3c4d').
 */
function generateUniqueId() {
    // Use a combination of timestamp and random string for uniqueness
    const timestampPart = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 9);
    return `vcp-bubble-${timestampPart}${randomPart}`;
}

/**
 * Renders Mermaid diagrams found within a given container.
 * Finds placeholders, replaces them with the actual Mermaid code,
 * and then calls the Mermaid API to render them.
 * @param {HTMLElement} container The container element to search within.
 */
async function renderMermaidDiagrams(container) {
    const placeholders = Array.from(container.querySelectorAll('.mermaid-placeholder'));
    if (placeholders.length === 0) return;

    // Prepare elements for rendering
    placeholders.forEach(placeholder => {
        const code = placeholder.dataset.mermaidCode;
        if (code) {
            try {
                // The placeholder div itself will become the mermaid container
                placeholder.textContent = decodeURIComponent(code);
                placeholder.classList.remove('mermaid-placeholder');
                placeholder.classList.add('mermaid');
            } catch (e) {
                console.error('Failed to decode mermaid code', e);
                placeholder.textContent = '[Mermaid code decoding error]';
            }
        }
    });

    // Get the list of actual .mermaid elements to render
    const elementsToRender = placeholders.filter(el => el.classList.contains('mermaid'));

    if (elementsToRender.length > 0 && typeof mermaid !== 'undefined') {
        try {
            // Initialize mermaid if it hasn't been already
            mermaid.initialize({ startOnLoad: false });
            await mermaid.run({ nodes: elementsToRender });
        } catch (error) {
            console.error("Error rendering Mermaid diagrams:", error);
            elementsToRender.forEach(el => {
                const originalCode = el.textContent;
                el.innerHTML = `<div class="mermaid-error">Mermaid render error: ${error.message}</div><pre>${escapeHtml(originalCode)}</pre>`;
            });
        }
    }
}

/**
 * 应用单个正则规则到文本
 * @param {string} text - 输入文本
 * @param {Object} rule - 正则规则对象
 * @returns {string} 处理后的文本
 */
function applyRegexRule(text, rule) {
    if (!rule || !rule.findPattern || typeof text !== 'string') {
        return text;
    }

    try {
        // 使用 uiHelperFunctions.regexFromString 来解析正则表达式
        let regex = null;
        if (window.uiHelperFunctions && window.uiHelperFunctions.regexFromString) {
            regex = window.uiHelperFunctions.regexFromString(rule.findPattern);
        } else {
            // 后备方案：手动解析
            const regexMatch = rule.findPattern.match(/^\/(.+?)\/([gimuy]*)$/);
            if (regexMatch) {
                regex = new RegExp(regexMatch[1], regexMatch[2]);
            } else {
                regex = new RegExp(rule.findPattern, 'g');
            }
        }
        
        if (!regex) {
            console.error('无法解析正则表达式:', rule.findPattern);
            return text;
        }
        
        // 应用替换（如果没有替换内容，则默认替换为空字符串）
        return text.replace(regex, rule.replaceWith || '');
    } catch (error) {
        console.error('应用正则规则时出错:', rule.findPattern, error);
        return text;
    }
}

/**
 * 应用所有匹配的正则规则到文本（前端版本）
 * @param {string} text - 输入文本
 * @param {Array} rules - 正则规则数组
 * @param {string} role - 消息角色 ('user' 或 'assistant')
 * @param {number} depth - 消息深度（0 = 最新消息）
 * @returns {string} 处理后的文本
 */
function applyFrontendRegexRules(text, rules, role, depth) {
    if (!rules || !Array.isArray(rules) || typeof text !== 'string') {
        return text;
    }

    let processedText = text;
    
    rules.forEach(rule => {
        // 检查是否应该应用此规则
        
        // 1. 检查是否应用于前端
        if (!rule.applyToFrontend) return;
        
        // 2. 检查角色
        const shouldApplyToRole = rule.applyToRoles && rule.applyToRoles.includes(role);
        if (!shouldApplyToRole) return;
        
        // 3. 检查深度（-1 表示无限制）
        const minDepthOk = rule.minDepth === undefined || rule.minDepth === -1 || depth >= rule.minDepth;
        const maxDepthOk = rule.maxDepth === undefined || rule.maxDepth === -1 || depth <= rule.maxDepth;
        
        if (!minDepthOk || !maxDepthOk) return;
        
        // 应用规则
        processedText = applyRegexRule(processedText, rule);
    });
    
    return processedText;
}

/**
 * Finds special VCP blocks (Tool Requests, Daily Notes) and transforms them
 * directly into styled HTML divs, bypassing the need for markdown code fences.
 * @param {string} text The text content.
 * @returns {string} The processed text with special blocks as HTML.
 */
function transformSpecialBlocks(text) {
    let processed = text;

    // Process VCP Tool Results
    processed = processed.replace(TOOL_RESULT_REGEX, (match, rawContent) => {
        const content = rawContent.trim();
        const lines = content.split('\n').filter(line => line.trim() !== '');

        let toolName = 'Unknown Tool';
        let status = 'Unknown Status';
        const details = [];
        let otherContent = [];

        lines.forEach(line => {
            const kvMatch = line.match(/-\s*([^:]+):\s*(.*)/);
            if (kvMatch) {
                const key = kvMatch[1].trim();
                const value = kvMatch[2].trim();
                if (key === '工具名称') {
                    toolName = value;
                } else if (key === '执行状态') {
                    status = value;
                } else {
                    details.push({ key, value });
                }
            } else {
                otherContent.push(line);
            }
        });

        // Add 'collapsible' class for the new functionality, default to collapsed
        let html = `<div class="vcp-tool-result-bubble collapsible">`;
        html += `<div class="vcp-tool-result-header">`;
        html += `<span class="vcp-tool-result-label">VCP-ToolResult</span>`;
        html += `<span class="vcp-tool-result-name">${escapeHtml(toolName)}</span>`;
        html += `<span class="vcp-tool-result-status">${escapeHtml(status)}</span>`;
        html += `<span class="vcp-result-toggle-icon"></span>`; // Toggle icon
        html += `</div>`;

        // Wrap details and footer in a new collapsible container
        html += `<div class="vcp-tool-result-collapsible-content">`;

        html += `<div class="vcp-tool-result-details">`;
        details.forEach(({ key, value }) => {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            let processedValue = escapeHtml(value);
            
            if ((key === '可访问URL' || key === '返回内容') && value.match(/\.(jpeg|jpg|png|gif)$/i)) {
                 processedValue = `<a href="${value}" target="_blank" rel="noopener noreferrer" title="点击预览"><img src="${value}" class="vcp-tool-result-image" alt="Generated Image"></a>`;
            } else {
                processedValue = processedValue.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
            }
            
            if (key === '返回内容') {
                processedValue = processedValue.replace(/###(.*?)###/g, '<strong>$1</strong>');
            }

            html += `<div class="vcp-tool-result-item">`;
            html += `<span class="vcp-tool-result-item-key">${escapeHtml(key)}:</span> `;
            html += `<span class="vcp-tool-result-item-value">${processedValue}</span>`;
            html += `</div>`;
        });
        html += `</div>`; // End of vcp-tool-result-details

        if (otherContent.length > 0) {
            html += `<div class="vcp-tool-result-footer"><pre>${escapeHtml(otherContent.join('\n'))}</pre></div>`;
        }

        html += `</div>`; // End of vcp-tool-result-collapsible-content
        html += `</div>`; // End of vcp-tool-result-bubble

        return html;
    });

    // Process Tool Requests
    processed = processed.replace(TOOL_REGEX, (match, content) => {
        // Check if this is a DailyNote tool call with the 'create' command
        const isDailyNoteCreate = /tool_name:\s*「始」\s*DailyNote\s*「末」/.test(content) &&
                                  /command:\s*「始」\s*create\s*「末」/.test(content);

        if (isDailyNoteCreate) {
            // --- It's a DailyNote Tool, render it as a diary bubble ---
            const maidRegex = /(?:maid|maidName):\s*「始」([^「」]*)「末」/;
            const dateRegex = /Date:\s*「始」([^「」]*)「末」/;
            const contentRegex = /Content:\s*「始」([\s\S]*?)「末」/;

            const maidMatch = content.match(maidRegex);
            const dateMatch = content.match(dateRegex);
            const contentMatch = content.match(contentRegex);

            const maid = maidMatch ? maidMatch[1].trim() : '';
            const date = dateMatch ? dateMatch[1].trim() : '';
            const diaryContent = contentMatch ? contentMatch[1].trim() : '[日记内容解析失败]';

            let html = `<div class="maid-diary-bubble">`;
            html += `<div class="diary-header">`;
            html += `<span class="diary-title">Maid's Diary</span>`;
            if (date) {
                html += `<span class="diary-date">${escapeHtml(date)}</span>`;
            }
            html += `</div>`;
            
            if (maid) {
                html += `<div class="diary-maid-info">`;
                html += `<span class="diary-maid-label">Maid:</span> `;
                html += `<span class="diary-maid-name">${escapeHtml(maid)}</span>`;
                html += `</div>`;
            }

            html += `<div class="diary-content">${escapeHtml(diaryContent)}</div>`;
            html += `</div>`;

            return html;
        } else {
            // --- It's a regular tool call, render it normally ---
            const toolNameRegex = /<tool_name>([\s\S]*?)<\/tool_name>|tool_name:\s*「始」([^「」]*)「末」/;
            const toolNameMatch = content.match(toolNameRegex);

            let toolName = 'Processing...';
            if (toolNameMatch) {
                let extractedName = (toolNameMatch[1] || toolNameMatch[2] || '').trim();
                if (extractedName) {
                    extractedName = extractedName.replace(/「始」|「末」/g, '').replace(/,$/, '').trim();
                }
                if (extractedName) {
                    toolName = extractedName;
                }
            }

            const escapedFullContent = escapeHtml(content);
            return `<div class="vcp-tool-use-bubble">` +
                   `<div class="vcp-tool-summary">` +
                   `<span class="vcp-tool-label">VCP-ToolUse:</span> ` +
                   `<span class="vcp-tool-name-highlight">${escapeHtml(toolName)}</span>` +
                   `</div>` +
                   `<div class="vcp-tool-details"><pre>${escapedFullContent}</pre></div>` +
                   `</div>`;
        }
    });

    // Process Daily Notes
    processed = processed.replace(NOTE_REGEX, (match, rawContent) => {
        const content = rawContent.trim();
        const maidRegex = /Maid:\s*([^\n\r]*)/;
        const dateRegex = /Date:\s*([^\n\r]*)/;
        const contentRegex = /Content:\s*([\s\S]*)/;

        const maidMatch = content.match(maidRegex);
        const dateMatch = content.match(dateRegex);
        const contentMatch = content.match(contentRegex);

        const maid = maidMatch ? maidMatch[1].trim() : '';
        const date = dateMatch ? dateMatch[1].trim() : '';
        // The rest of the text after "Content:", or the full text if "Content:" is not found
        const diaryContent = contentMatch ? contentMatch[1].trim() : content;

        let html = `<div class="maid-diary-bubble">`;
        html += `<div class="diary-header">`;
        html += `<span class="diary-title">Maid's Diary</span>`;
        if (date) {
            html += `<span class="diary-date">${escapeHtml(date)}</span>`;
        }
        html += `</div>`;
        
        if (maid) {
            html += `<div class="diary-maid-info">`;
            html += `<span class="diary-maid-label">Maid:</span> `;
            html += `<span class="diary-maid-name">${escapeHtml(maid)}</span>`;
            html += `</div>`;
        }

        html += `<div class="diary-content">${escapeHtml(diaryContent)}</div>`;
        html += `</div>`;

        return html;
    });

    return processed;
}

/**
 * Transforms user's "clicked button" indicators into styled bubbles.
 * @param {string} text The text content.
 * @returns {string} The processed text.
 */
function transformUserButtonClick(text) {
    return text.replace(BUTTON_CLICK_REGEX, (match, content) => {
        const escapedContent = escapeHtml(content.trim());
        return `<span class="user-clicked-button-bubble">${escapedContent}</span>`;
    });
}

function transformVCPChatCanvas(text) {
    return text.replace(CANVAS_PLACEHOLDER_REGEX, () => {
        // Use a div for better block-level layout and margin behavior
        return `<div class="vcp-chat-canvas-placeholder">Canvas协同中<span class="thinking-indicator-dots">...</span></div>`;
    });
}

/**
 * Extracts <style> tags from content, scopes the CSS, and injects it into the document head.
 * @param {string} content - The raw message content string.
 * @param {string} scopeId - The unique ID for scoping.
 * @returns {{processedContent: string, styleInjected: boolean}} The content with <style> tags removed, and a flag indicating if styles were injected.
 */
function processAndInjectScopedCss(content, scopeId) {
    let cssContent = '';
    let styleInjected = false;

    const processedContent = content.replace(STYLE_REGEX, (match, css) => {
        cssContent += css.trim() + '\n';
        return ''; // Remove style tags from the content
    });

    if (cssContent.length > 0) {
        try {
            const scopedCss = contentProcessor.scopeCss(cssContent, scopeId);
            
            const styleElement = document.createElement('style');
            styleElement.type = 'text/css';
            styleElement.setAttribute('data-vcp-scope-id', scopeId);
            styleElement.textContent = scopedCss;
            document.head.appendChild(styleElement);
            styleInjected = true;
            
            //console.log(`[ScopedCSS] Injected scoped styles for ID: #${scopeId}`);
        } catch (error) {
            console.error(`[ScopedCSS] Failed to scope or inject CSS for ID: ${scopeId}`, error);
        }
    }

    return { processedContent, styleInjected };
}


/**
 * Wraps raw HTML documents in markdown code fences if they aren't already.
 * An HTML document is identified by the `<!DOCTYPE html>` declaration.
 * @param {string} text The text content.
 * @returns {string} The processed text.
 */
function ensureHtmlFenced(text) {
    const doctypeTag = '<!DOCTYPE html>';
    const htmlCloseTag = '</html>';
    const lowerText = text.toLowerCase();

    // If it's already in a proper html code block, do nothing. This is the fix.
    // This regex now checks for any language specifier (or none) after the fences.
    if (HTML_FENCE_CHECK_REGEX.test(text)) {
        return text;
    }

    // Quick exit if no doctype is present.
    if (!lowerText.includes(doctypeTag.toLowerCase())) {
        return text;
    }

    let result = '';
    let lastIndex = 0;
    while (true) {
        const startIndex = text.toLowerCase().indexOf(doctypeTag.toLowerCase(), lastIndex);

        // Append the segment of text before the current HTML block.
        const textSegment = text.substring(lastIndex, startIndex === -1 ? text.length : startIndex);
        result += textSegment;

        if (startIndex === -1) {
            break; // Exit loop if no more doctype markers are found.
        }

        // Find the corresponding </html> tag.
        const endIndex = text.toLowerCase().indexOf(htmlCloseTag.toLowerCase(), startIndex + doctypeTag.length);
        if (endIndex === -1) {
            // Malformed HTML (no closing tag), append the rest of the string and stop.
            result += text.substring(startIndex);
            break;
        }

        const block = text.substring(startIndex, endIndex + htmlCloseTag.length);
        
        // Check if we are currently inside an open code block by counting fences in the processed result.
        const fencesInResult = (result.match(/```/g) || []).length;

        if (fencesInResult % 2 === 0) {
            // Even number of fences means we are outside a code block.
            // Wrap the HTML block in new fences.
            result += `
\`\`\`html
${block}
\`\`\`
`;
        } else {
            // Odd number of fences means we are inside a code block.
            // Append the HTML block as is.
            result += block;
        }

        // Move past the current HTML block.
        lastIndex = endIndex + htmlCloseTag.length;
    }

    return result;
}


/**
 * Removes leading whitespace from lines that appear to be HTML tags,
 * as long as they are not inside a fenced code block. This prevents
 * the markdown parser from misinterpreting indented HTML as an indented code block.
 * @param {string} text The text content.
 * @returns {string} The processed text.
 */
function deIndentHtml(text) {
    const lines = text.split('\n');
    let inFence = false;
    return lines.map(line => {
        if (line.trim().startsWith('```')) {
            inFence = !inFence;
            return line;
        }
        
        // 🟢 新增：如果行内包含 <img>，不要拆分它
        if (!inFence && line.includes('<img')) {
            return line; // 保持原样
        }
        
        if (!inFence && /^\s+<(!|[a-zA-Z])/.test(line)) {
            return line.trimStart();
        }
        return line;
    }).join('\n');
}


/**
 * 根据对话轮次计算消息的深度。
 * @param {string} messageId - 目标消息的ID。
 * @param {Array<Message>} history - 完整的聊天记录数组。
 * @returns {number} - 计算出的深度（0代表最新一轮）。
 */
function calculateDepthByTurns(messageId, history) {
    const turns = [];
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'assistant') {
            const turn = { assistant: history[i], user: null };
            if (i > 0 && history[i - 1].role === 'user') {
                turn.user = history[i - 1];
                i--;
            }
            turns.push(turn); // ✅ 使用 push
        } else if (history[i].role === 'user') {
            turns.push({ assistant: null, user: history[i] });
        }
    }
    turns.reverse(); // ✅ 最后反转一次
    
    const turnIndex = turns.findIndex(t =>
        (t.assistant?.id === messageId) || (t.user?.id === messageId)
    );
    return turnIndex !== -1 ? (turns.length - 1 - turnIndex) : 0;
}


/**
 * A helper function to preprocess the full message content string before parsing.
 * @param {string} text The raw text content.
 * @returns {string} The processed text.
 */
function preprocessFullContent(text, settings = {}, messageRole = 'assistant', depth = 0) {
    // 🟢 新增：第一层修复 - Markdown 图片语法修复
    text = fixEmoticonUrlsInMarkdown(text);

    // 🔴 关键安全修复：将「始」和「末」之间的内容视为纯文本并进行 HTML 转义
    // 这样可以防止工具调用参数中的 HTML 被执行。
    text = text.replace(START_END_MARKER_REGEX, (match, content) => {
        // 仅对内部内容进行转义，保留标记本身
        return `「始」${escapeHtml(content)}「末」`;
    });
    
    // 一次性处理 Mermaid（合并两种情况）
    text = text.replace(MERMAID_CODE_REGEX, (match, lang, code) => {
        const tempEl = document.createElement('textarea');
        tempEl.innerHTML = code;
        const encodedCode = encodeURIComponent(tempEl.value.trim());
        return `<div class="mermaid-placeholder" data-mermaid-code="${encodedCode}"></div>`;
    });
    
    text = text.replace(MERMAID_FENCE_REGEX, (match, lang, code) => {
        const encodedCode = encodeURIComponent(code.trim());
        return `<div class="mermaid-placeholder" data-mermaid-code="${encodedCode}"></div>`;
    });

    // 🔴 关键修复：在提取代码块之前先处理缩进
    // 这样 deIndentMisinterpretedCodeBlocks 才能正确识别代码围栏
    text = contentProcessor.deIndentMisinterpretedCodeBlocks(text);
    text = deIndentHtml(text);
    
    // 保护代码块（优化：只在需要时创建 Map）
    let codeBlockMap = null;
    let placeholderId = 0;
    
    // Use a lookahead to test without consuming the match
    const hasCodeBlocks = /```/.test(text);
    
    if (hasCodeBlocks) {
        codeBlockMap = new Map();
        text = text.replace(CODE_FENCE_REGEX, (match) => {
            const placeholder = `__VCP_CODE_BLOCK_PLACEHOLDER_${placeholderId}__`;
            codeBlockMap.set(placeholder, match);
            placeholderId++;
            return placeholder;
        });
    }

    // The order of the remaining operations is critical.
    text = contentProcessor.deIndentToolRequestBlocks(text);
    text = transformSpecialBlocks(text);
    text = ensureHtmlFenced(text);
    
    // 批量应用内容处理器（减少函数调用）
    text = contentProcessor.applyContentProcessors(text);

    // 恢复代码块
    if (codeBlockMap) {
        for (const [placeholder, block] of codeBlockMap.entries()) {
            // Use a function for replacement to handle special characters in the block
            text = text.replace(placeholder, () => block);
        }
    }

    return text;
}

/**
 * 🟢 在 Markdown 文本中修复表情包URL
 * 处理 ![alt](url) 和 <img src="url"> 两种形式
 */
function fixEmoticonUrlsInMarkdown(text) {
    if (!text || typeof text !== 'string') return text;
    
    // 1. 修复 Markdown 图片语法: ![alt](url)
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
        if (emoticonUrlFixer && emoticonUrlFixer.fixEmoticonUrl) {
            const fixedUrl = emoticonUrlFixer.fixEmoticonUrl(url);
            if (fixedUrl !== url) {
                //console.log(`[PreprocessFix] Markdown图片: ${url} → ${fixedUrl}`);
            }
            return `![${alt}](${fixedUrl})`;
        }
        return match;
    });
    
    // 2. 修复 HTML img 标签: <img src="url" ...>
    text = text.replace(/<img([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (match, before, url, after) => {
        if (emoticonUrlFixer && emoticonUrlFixer.fixEmoticonUrl) {
            const fixedUrl = emoticonUrlFixer.fixEmoticonUrl(url);
            if (fixedUrl !== url) {
                //console.log(`[PreprocessFix] HTML图片: ${url} → ${fixedUrl}`);
            }
            return `<img${before}src="${fixedUrl}"${after}>`;
        }
        return match;
    });
    
    return text;
}

/**
 * @typedef {Object} Message
 * @property {'user'|'assistant'|'system'} role
 * @property {string} content
 * @property {number} timestamp
 * @property {string} [id] 
 * @property {boolean} [isThinking]
 * @property {Array<{type: string, src: string, name: string}>} [attachments]
 * @property {string} [finishReason] 
 * @property {boolean} [isGroupMessage] // New: Indicates if it's a group message
 * @property {string} [agentId] // New: ID of the speaking agent in a group
 * @property {string} [name] // New: Name of the speaking agent in a group (can override default role name)
 * @property {string} [avatarUrl] // New: Specific avatar for this message (e.g. group member)
 * @property {string} [avatarColor] // New: Specific avatar color for this message
 */


/**
 * @typedef {Object} CurrentSelectedItem
 * @property {string|null} id - Can be agentId or groupId
 * @property {'agent'|'group'|null} type 
 * @property {string|null} name
 * @property {string|null} avatarUrl
 * @property {object|null} config - Full config of the selected item
 */


let mainRendererReferences = {
    currentChatHistoryRef: { get: () => [], set: () => {} }, // Ref to array
    currentSelectedItemRef: { get: () => ({ id: null, type: null, name: null, avatarUrl: null, config: null }), set: () => {} }, // Ref to object
    currentTopicIdRef: { get: () => null, set: () => {} }, // Ref to string/null
    globalSettingsRef: { get: () => ({ userName: '用户', userAvatarUrl: 'assets/default_user_avatar.png', userAvatarCalculatedColor: null }), set: () => {} }, // Ref to object

    chatMessagesDiv: null,
    tauriAPI: null,
    markedInstance: null,
    uiHelper: {
        scrollToBottom: () => {},
        openModal: () => {},
        autoResizeTextarea: () => {},
        // ... other uiHelper functions ...
    },
    summarizeTopicFromMessages: async () => "",
    handleCreateBranch: () => {},
};

/**
 * 统一的后端调用函数：使用 Tauri invoke
 * @param {string} cmd - 命令名称
 * @param {object} args - 参数对象
 * @param {boolean} silent - 是否静默失败（不打印错误日志）
 */
async function callBackend(cmd, args, silent = false) {
    const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
    if (!invoke) {
        if (!silent) console.error('[MessageRenderer] Tauri API 不可用');
        return null;
    }
    try {
        return await invoke(cmd, args);
    } catch (e) {
        // 对于某些非关键命令，静默失败
        const nonCriticalCommands = ['save_avatar_color'];
        if (silent || nonCriticalCommands.includes(cmd)) {
            console.warn(`[MessageRenderer] 调用 ${cmd} 失败 (非关键):`, e.message || e);
        } else {
            console.error(`[MessageRenderer] 调用 ${cmd} 失败:`, e);
        }
        return null;
    }
}


function removeMessageById(messageId, saveHistory = false) {
    const item = mainRendererReferences.chatMessagesDiv.querySelector(`.message-item[data-message-id="${messageId}"]`);
    if (item) {
        // --- NEW: Cleanup dynamic content before removing from DOM ---
        const contentDiv = item.querySelector('.md-content');
        if (contentDiv) {
            cleanupAnimationsInContent(contentDiv);
        }
        item.remove();
    }
    
    const currentChatHistoryArray = mainRendererReferences.currentChatHistoryRef.get();
    const index = currentChatHistoryArray.findIndex(m => m.id === messageId);
    
    if (index > -1) {
        currentChatHistoryArray.splice(index, 1);
        mainRendererReferences.currentChatHistoryRef.set([...currentChatHistoryArray]);
        
        if (saveHistory) {
            const currentSelectedItemVal = mainRendererReferences.currentSelectedItemRef.get();
            const currentTopicIdVal = mainRendererReferences.currentTopicIdRef.get();
            if (currentSelectedItemVal.id && currentTopicIdVal) {
                if (currentSelectedItemVal.type === 'agent') {
                    callBackend('save_chat_history', { agentId: currentSelectedItemVal.id, topicId: currentTopicIdVal, messages: currentChatHistoryArray });
                } else if (currentSelectedItemVal.type === 'group') {
                    callBackend('save_group_chat_history', { groupId: currentSelectedItemVal.id, topicId: currentTopicIdVal, messages: currentChatHistoryArray });
                }
            }
        }
    }
}

function clearChat() {
    if (mainRendererReferences.chatMessagesDiv) {
        // --- NEW: Cleanup all messages before clearing the container ---
        const allMessages = mainRendererReferences.chatMessagesDiv.querySelectorAll('.message-item');
        allMessages.forEach(item => {
            const contentDiv = item.querySelector('.md-content');
            if (contentDiv) {
                cleanupAnimationsInContent(contentDiv);
            }
        });
        
        // 🟢 清理所有注入的 scoped CSS
        document.querySelectorAll('style[data-vcp-scope-id]').forEach(el => el.remove());
        document.querySelectorAll('style[data-chat-scope-id]').forEach(el => el.remove());
        
        mainRendererReferences.chatMessagesDiv.innerHTML = '';
    }
    mainRendererReferences.currentChatHistoryRef.set([]); // Clear the history array via its ref
}


function initializeMessageRenderer(refs) {
    //console.log('[MessageRenderer] 初始化，收到的 refs:', Object.keys(refs));
    //console.log('[MessageRenderer] refs.chatMessagesDiv:', refs.chatMessagesDiv);
    //console.log('[MessageRenderer] refs.markedInstance:', refs.markedInstance);
    //console.log('[MessageRenderer] refs.tauriAPI:', refs.tauriAPI);
    
    Object.assign(mainRendererReferences, refs);
    
    //console.log('[MessageRenderer] 初始化后 mainRendererReferences.chatMessagesDiv:', mainRendererReferences.chatMessagesDiv);
    //console.log('[MessageRenderer] 初始化后 mainRendererReferences.markedInstance:', mainRendererReferences.markedInstance);

    initializeImageHandler({
        tauriAPI: mainRendererReferences.tauriAPI,
        uiHelper: mainRendererReferences.uiHelper,
        chatMessagesDiv: mainRendererReferences.chatMessagesDiv,
    });

    // 初始化表情包 URL 修复器
    emoticonUrlFixer.initialize(mainRendererReferences.tauriAPI);

    // --- Event Delegation ---
    mainRendererReferences.chatMessagesDiv.addEventListener('click', async (e) => {
        // 1. Handle collapsible tool results
        const header = e.target.closest('.vcp-tool-result-header');
        if (header) {
            const bubble = header.closest('.vcp-tool-result-bubble.collapsible');
            if (bubble) {
                bubble.classList.toggle('expanded');
            }
            return;
        }

        // 2. Avatar 点击停止 TTS（也使用委托）
        const avatar = e.target.closest('.message-avatar');
        if (avatar) {
            const messageItem = avatar.closest('.message-item');
            if (messageItem?.dataset.role === 'assistant') {
                if (window.__TAURI__?.invoke) {
                    try { 
                        await window.__TAURI__.invoke('sovits_stop'); 
                    } catch (err) {
                        console.error('[MessageRenderer] 停止 TTS 失败:', err);
                    }
                } else {
                    console.warn('[MessageRenderer] Tauri API 不可用，无法停止 TTS');
                }
            }
        }
    });

    // Delegated context menu
    mainRendererReferences.chatMessagesDiv.addEventListener('contextmenu', (e) => {
        const messageItem = e.target.closest('.message-item');
        if (!messageItem) return;
        
        const messageId = messageItem.dataset.messageId;
        const role = messageItem.dataset.role || (messageItem.classList.contains('user') ? 'user' : 'assistant');
        
        // 调试：检查消息元素的类名
        //console.log('[ContextMenu Debug] messageId:', messageId);
        //console.log('[ContextMenu Debug] classList:', Array.from(messageItem.classList));
        //console.log('[ContextMenu Debug] has thinking:', messageItem.classList.contains('thinking'));
        //console.log('[ContextMenu Debug] has streaming:', messageItem.classList.contains('streaming'));
        
        // 先从历史记录中查找消息
        let message = mainRendererReferences.currentChatHistoryRef.get()
            .find(m => m.id === messageId);
        
        //console.log('[ContextMenu Debug] message from history:', message);
        
        // 如果在历史记录中找不到，从 DOM 元素构建消息对象
        if (!message && messageId) {
            const contentDiv = messageItem.querySelector('.md-content');
            const senderNameEl = messageItem.querySelector('.sender-name');
            const isThinking = messageItem.classList.contains('thinking') || messageItem.classList.contains('streaming');
            message = {
                id: messageId,
                role: role,
                content: contentDiv ? contentDiv.innerText : '',
                name: senderNameEl ? senderNameEl.textContent.replace(':', '').trim() : '',
                timestamp: parseInt(messageItem.dataset.timestamp) || Date.now(),
                isGroupMessage: messageItem.classList.contains('group-message-item'),
                agentId: messageItem.dataset.agentId || null,
                isThinking: isThinking
            };
            //console.log('[ContextMenu Debug] message built from DOM, isThinking:', isThinking);
        }
        
        //console.log('[ContextMenu Debug] final message.isThinking:', message?.isThinking);
        
        if (message && (message.role === 'assistant' || message.role === 'user')) {
            e.preventDefault();
            contextMenu.showContextMenu(e, messageItem, message);
        }
    });

    // Delegated middle mouse button click
    mainRendererReferences.chatMessagesDiv.addEventListener('mousedown', (e) => {
        if (e.button !== 1) return; // 只处理中键
        
        const messageItem = e.target.closest('.message-item');
        if (!messageItem) return;
        
        const messageId = messageItem.dataset.messageId;
        const role = messageItem.dataset.role || (messageItem.classList.contains('user') ? 'user' : 'assistant');
        
        // 先从历史记录中查找消息
        let message = mainRendererReferences.currentChatHistoryRef.get()
            .find(m => m.id === messageId);
        
        // 如果在历史记录中找不到，从 DOM 元素构建消息对象
        if (!message && messageId) {
            const contentDiv = messageItem.querySelector('.md-content');
            const senderNameEl = messageItem.querySelector('.sender-name');
            message = {
                id: messageId,
                role: role,
                content: contentDiv ? contentDiv.innerText : '',
                name: senderNameEl ? senderNameEl.textContent.replace(':', '').trim() : '',
                timestamp: parseInt(messageItem.dataset.timestamp) || Date.now(),
                isGroupMessage: messageItem.classList.contains('group-message-item'),
                agentId: messageItem.dataset.agentId || null,
                isThinking: messageItem.classList.contains('thinking') || messageItem.classList.contains('streaming')
            };
        }
        
        if (message && (message.role === 'assistant' || message.role === 'user')) {
            e.preventDefault();
            e.stopPropagation();
            
            const globalSettings = mainRendererReferences.globalSettingsRef.get();
            if (globalSettings.enableMiddleClickQuickAction) {
                middleClickHandler.startMiddleClickTimer(e, messageItem, message, globalSettings.middleClickQuickAction);
                
                if (globalSettings.enableMiddleClickAdvanced) {
                    const delay = Math.max(1000, globalSettings.middleClickAdvancedDelay || 1000);
                    middleClickHandler.startAdvancedMiddleClickTimer(e, messageItem, message, globalSettings);
                }
            }
        }
    });
    // --- End Event Delegation ---

    // Create a new marked instance wrapper specifically for the stream manager.
    const originalMarkedParse = mainRendererReferences.markedInstance.parse.bind(mainRendererReferences.markedInstance);
    const streamingMarkedInstance = {
        ...mainRendererReferences.markedInstance,
        parse: (text) => {
            const globalSettings = mainRendererReferences.globalSettingsRef.get();
            const processedText = preprocessFullContent(text, globalSettings);
            return originalMarkedParse(processedText);
        }
    };

    contentProcessor.initializeContentProcessor(mainRendererReferences);

    const wrappedProcessRenderedContent = (contentDiv) => {
        const globalSettings = mainRendererReferences.globalSettingsRef.get();
        contentProcessor.processRenderedContent(contentDiv, globalSettings);
    };

    contextMenu.initializeContextMenu(mainRendererReferences, {
        removeMessageById: removeMessageById,
        finalizeStreamedMessage: finalizeStreamedMessage,
        renderMessage: renderMessage,
        startStreamingMessage: startStreamingMessage,
        setContentAndProcessImages: setContentAndProcessImages,
        processRenderedContent: wrappedProcessRenderedContent,
        runTextHighlights: contentProcessor.highlightAllPatternsInMessage,
        preprocessFullContent: preprocessFullContent,
        renderAttachments: renderAttachments,
        interruptHandler: mainRendererReferences.interruptHandler,
        updateMessageContent: updateMessageContent, // 🟢 新增：传递 updateMessageContent
        showForwardModal: window.showForwardModal, // 🟢 新增：传递转发模态框函数
    });

    if (typeof contextMenu.toggleEditMode === 'function') {
        window.toggleEditMode = contextMenu.toggleEditMode;
        window.messageContextMenu = contextMenu;
    }

    streamManager.initStreamManager({
        globalSettingsRef: mainRendererReferences.globalSettingsRef,
        currentChatHistoryRef: mainRendererReferences.currentChatHistoryRef,
        currentSelectedItemRef: mainRendererReferences.currentSelectedItemRef,
        currentTopicIdRef: mainRendererReferences.currentTopicIdRef,
        chatMessagesDiv: mainRendererReferences.chatMessagesDiv,
        markedInstance: streamingMarkedInstance,
        tauriAPI: mainRendererReferences.tauriAPI,
        uiHelper: mainRendererReferences.uiHelper,
        morphdom: window.morphdom,
        renderMessage: renderMessage,
        showContextMenu: contextMenu.showContextMenu,
        setContentAndProcessImages: setContentAndProcessImages,
        processRenderedContent: wrappedProcessRenderedContent,
        runTextHighlights: contentProcessor.highlightAllPatternsInMessage,
        preprocessFullContent: preprocessFullContent,
        removeSpeakerTags: contentProcessor.removeSpeakerTags,
        ensureNewlineAfterCodeBlock: contentProcessor.ensureNewlineAfterCodeBlock,
        ensureSpaceAfterTilde: contentProcessor.ensureSpaceAfterTilde,
        removeIndentationFromCodeBlockMarkers: contentProcessor.removeIndentationFromCodeBlockMarkers,
        deIndentMisinterpretedCodeBlocks: contentProcessor.deIndentMisinterpretedCodeBlocks,
        ensureSeparatorBetweenImgAndCode: contentProcessor.ensureSeparatorBetweenImgAndCode,
        processAnimationsInContent: processAnimationsInContent,
        emoticonUrlFixer: emoticonUrlFixer,
        enhancedRenderDebounceTimers: enhancedRenderDebounceTimers,
        ENHANCED_RENDER_DEBOUNCE_DELAY: ENHANCED_RENDER_DEBOUNCE_DELAY,
        DIARY_RENDER_DEBOUNCE_DELAY: DIARY_RENDER_DEBOUNCE_DELAY,
    });

    middleClickHandler.initialize(mainRendererReferences, {
        removeMessageById: removeMessageById,
    });

    injectEnhancedStyles();
    //console.log("[MessageRenderer] Initialized. Current selected item type on init:", mainRendererReferences.currentSelectedItemRef.get()?.type);
}


function setCurrentSelectedItem(item) {
    // This function is mainly for renderer.js to update the shared state.
    // messageRenderer will read from currentSelectedItemRef.get() when rendering.
    // //console.log("[MessageRenderer] setCurrentSelectedItem called with:", item);
}

function setCurrentTopicId(topicId) {
    // //console.log("[MessageRenderer] setCurrentTopicId called with:", topicId);
}

// These are for specific avatar of the current *context* (agent or user), not for individual group member messages
function setCurrentItemAvatar(avatarUrl) { // Renamed from setCurrentAgentAvatar
    try {
        const currentSelected = mainRendererReferences.currentSelectedItemRef && typeof mainRendererReferences.currentSelectedItemRef.get === 'function'
            ? mainRendererReferences.currentSelectedItemRef.get()
            : null;

        // Update internal selected item ref so other logic can read latest avatar
        if (mainRendererReferences.currentSelectedItemRef && typeof mainRendererReferences.currentSelectedItemRef.set === 'function') {
            try {
                mainRendererReferences.currentSelectedItemRef.set({ ...(currentSelected || {}), avatarUrl });
            } catch (e) { /* ignore */ }
        }

        // Update assistant messages in the current chat: replace avatar for messages that belong to the current agent
        const assistantMsgs = document.querySelectorAll('.message-item[data-role="assistant"]');
        assistantMsgs.forEach(msgEl => {
            try {
                const avatarImg = msgEl.querySelector('.chat-avatar');
                if (!avatarImg) return;

                const msgAgentId = msgEl.dataset.agentId;
                const isGroupMsg = msgEl.classList.contains('group-message-item') || msgEl.dataset.isGroupMessage === 'true';

                if (msgAgentId) {
                    if (currentSelected && currentSelected.id && msgAgentId === String(currentSelected.id)) {
                        avatarImg.classList.add('avatar-updating');
                        avatarImg.src = avatarUrl;
                        setTimeout(() => avatarImg.classList.remove('avatar-updating'), 300);
                    }
                } else {
                    // Messages without explicit agentId: if current context is agent and message is not group message, update
                    if (currentSelected && currentSelected.type === 'agent' && !isGroupMsg) {
                        avatarImg.classList.add('avatar-updating');
                        avatarImg.src = avatarUrl;
                        setTimeout(() => avatarImg.classList.remove('avatar-updating'), 300);
                    }
                }
            } catch (e) {
                // ignore per-message errors
            }
        });
    } catch (e) {
        console.warn('[MessageRenderer] setCurrentItemAvatar error:', e);
    }
}

function setUserAvatar(avatarUrl) { // For the user's global avatar
    const globalSettings = mainRendererReferences.globalSettingsRef.get();
    const oldUrl = globalSettings.userAvatarUrl;
    
    // 先移除已有的时间戳参数
    let baseUrl = avatarUrl;
    if (avatarUrl) {
        baseUrl = avatarUrl.split('?')[0];
    }
    
    // 使用 loadAsset 转换路径（异步）
    (async () => {
        let resolvedAvatarUrl;
        try {
            if (baseUrl && !baseUrl.startsWith('http') && !baseUrl.startsWith('data:') && !baseUrl.startsWith('asset://') && !baseUrl.startsWith('https://asset.localhost/')) {
                // 使用静态导入的 loadAsset 转换相对路径
                resolvedAvatarUrl = await loadAsset(baseUrl) + `?t=${Date.now()}`;
            } else if (baseUrl) {
                resolvedAvatarUrl = `${baseUrl}?t=${Date.now()}`;
            } else {
                resolvedAvatarUrl = await loadAsset('AppData/assets/default_user_avatar.png');
            }
        } catch (e) {
            console.warn('[MessageRenderer] Failed to resolve avatar URL:', e);
            resolvedAvatarUrl = baseUrl || './AppData/assets/default_user_avatar.png';
        }
        
        if (oldUrl && oldUrl !== resolvedAvatarUrl) {
            avatarColorCache.delete(oldUrl.split('?')[0]);
        }
        // 更新内部状态
        mainRendererReferences.globalSettingsRef.set({...globalSettings, userAvatarUrl: resolvedAvatarUrl});
        
        // 立即更新已显示的用户消息头像
        document.querySelectorAll('.message-item.user .chat-avatar').forEach(img => {
            const currentSrc = img.src.split('?')[0];
            const newSrc = resolvedAvatarUrl.split('?')[0];
            if (currentSrc !== newSrc || !img.src.includes('?t=')) {
                img.src = resolvedAvatarUrl;
            }
        });
        //console.log('[MessageRenderer] Updated user avatar:', resolvedAvatarUrl);
    })();
}

function setCurrentItemAvatarColor(color) { // Renamed from setCurrentAgentAvatarColor
    // For the main selected agent/group
}

function setUserAvatarColor(color) { // For the user's global avatar
    const globalSettings = mainRendererReferences.globalSettingsRef.get();
    mainRendererReferences.globalSettingsRef.set({...globalSettings, userAvatarCalculatedColor: color });
    
    // 更新所有现有的用户消息中的头像颜色
    const userMessages = document.querySelectorAll('.message-item.user');
    userMessages.forEach(msg => {
        const avatarImg = msg.querySelector('.chat-avatar');
        if (avatarImg && color) {
            avatarImg.style.borderColor = color;
        }
    });
}


async function renderAttachments(message, contentDiv) {
    if (message.attachments && message.attachments.length > 0) {
        const attachmentsContainer = document.createElement('div');
        attachmentsContainer.classList.add('message-attachments');
        message.attachments.forEach(att => {
            let attachmentElement;
            if (att.type.startsWith('image/')) {
                attachmentElement = document.createElement('img');
                attachmentElement.src = att.src;
                attachmentElement.alt = `附件图片: ${att.name}`;
                attachmentElement.title = `点击在新窗口预览: ${att.name}`;
                attachmentElement.classList.add('message-attachment-image-thumbnail');
                attachmentElement.onclick = (e) => {
                    e.stopPropagation();
                    const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
                    if (window.__TAURI__?.invoke) {
                        window.__TAURI__.invoke('open_image_viewer', { src: att.src, title: att.name, theme: currentTheme }).catch(err => console.error('[MessageRenderer] 打开图片查看器失败:', err));
                    } else {
                        console.warn('[MessageRenderer] Tauri API 不可用，无法打开图片查看器');
                    }
                };
                attachmentElement.addEventListener('contextmenu', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    if (window.__TAURI__?.invoke) {
                        window.__TAURI__.invoke('show_image_context_menu', { src: att.src }).catch(err => {
                            console.error('[MessageRenderer] 显示图片上下文菜单失败:', err);
                        });
                    } else {
                        console.warn('[MessageRenderer] Tauri API 不可用，无法显示图片上下文菜单');
                    }
                });
            } else if (att.type.startsWith('audio/')) {
                attachmentElement = document.createElement('audio');
                attachmentElement.src = att.src;
                attachmentElement.controls = true;
            } else if (att.type.startsWith('video/')) {
                attachmentElement = document.createElement('video');
                attachmentElement.src = att.src;
                attachmentElement.controls = true;
                attachmentElement.style.maxWidth = '300px';
            } else { // Generic file
                attachmentElement = document.createElement('a');
                attachmentElement.href = att.src;
                attachmentElement.textContent = `📄 ${att.name}`;
                attachmentElement.title = `点击打开文件: ${att.name}`;
                attachmentElement.onclick = (e) => {
                    e.preventDefault();
                    if (window.__TAURI__?.invoke) {
                        window.__TAURI__.invoke('open_external', { url: att.src }).catch(err => {
                            console.error('[MessageRenderer] 打开外部链接失败:', err);
                            if (att.src.startsWith('file://')) {
                                try { window.open(att.src, '_blank'); } catch (e) { console.warn("[MessageRenderer] 无法打开本地文件附件:", e); }
                            }
                        });
                    } else if (att.src.startsWith('file://')) {
                        try { window.open(att.src, '_blank'); } catch (e) { console.warn("[MessageRenderer] 无法打开本地文件附件:", e); }
                    } else {
                        console.warn("[MessageRenderer] 无法打开本地文件附件，API 不可用或路径不是文件 URI:", att.src);
                    }
                };
            }
            if (attachmentElement) attachmentsContainer.appendChild(attachmentElement);
        });
        contentDiv.appendChild(attachmentsContainer);
    }
}

async function renderMessage(message, isInitialLoad = false, appendToDom = true) {
    const contentPreview = typeof message.content === 'string' 
        ? message.content.substring(0, 50) + '...' 
        : String(message.content || '');
    
    //console.log('[MessageRenderer renderMessage] 🎨 收到消息渲染请求:', {
    //    messageId: message.id,
    //    role: message.role,
    //    content: contentPreview,
    //    isInitialLoad: isInitialLoad,
    //    appendToDom: appendToDom,
    //    timestamp: message.timestamp
    //});
    
    const { chatMessagesDiv, markedInstance, uiHelper } = mainRendererReferences;
    const globalSettings = mainRendererReferences.globalSettingsRef.get();
    const currentSelectedItem = mainRendererReferences.currentSelectedItemRef.get();
    const currentChatHistory = mainRendererReferences.currentChatHistoryRef.get();

    //console.log('[MessageRenderer renderMessage] 🔧 环境检查:', {
    //    hasChatMessagesDiv: !!chatMessagesDiv,
    //    hasMarkedInstance: !!markedInstance,
    //    hasUiHelper: !!uiHelper,
    //    chatMessagesDivId: chatMessagesDiv?.id,
    //    currentSelectedItem: currentSelectedItem?.id
    //});

    // 跳过系统提示词消息（这些是发送给AI的，不应该显示在UI中）
    // 只有带有特定标记的系统消息（如 isThinking, name='系统'）才应该显示
    if (message.role === 'system') {
        // 允许显示的系统消息：思考中状态 或 名字为"系统"的UI消息
        const isUISystemMessage = message.isThinking || message.name === '系统';
        // 过滤掉包含系统提示词内容的消息
        const isSystemPrompt = message.content && (
            message.content.includes('当前话题创建于') ||
            message.content.includes('当前聊天记录文件路径') ||
            message.content.includes('{{') // 包含模板变量的系统提示词
        );
        
        if (!isUISystemMessage || isSystemPrompt) {
            //console.log('[MessageRenderer renderMessage] ⏭️ 跳过系统提示词消息（不用于 UI 显示）');
            return null;
        }
    }

    // Prevent re-rendering if the message already exists in the DOM, unless it's a thinking message being replaced.
    const existingMessageDom = chatMessagesDiv.querySelector(`.message-item[data-message-id="${message.id}"]`);
    if (existingMessageDom && !existingMessageDom.classList.contains('thinking')) {
        //console.log(`[MessageRenderer renderMessage] ⏭️ 消息 ${message.id} 已存在于DOM中，跳过渲染`);
        return existingMessageDom;
    }

    // 需要 chatMessagesDiv 和 markedInstance；后端使用 Tauri
    const tauriInvoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
    if (!chatMessagesDiv || !markedInstance || !tauriInvoke) {
        console.error("[MessageRenderer renderMessage] ❌ 缺少渲染所需的关键引用");
        console.error("[MessageRenderer renderMessage] 详细检查:", {
            hasChatMessagesDiv: !!chatMessagesDiv,
            hasMarkedInstance: !!markedInstance,
            hasTauriInvoke: !!tauriInvoke,
            chatMessagesDivElement: chatMessagesDiv,
            markedInstanceType: typeof markedInstance,
            tauriPaths: {
                'window.__TAURI__': !!window.__TAURI__,
                'window.__TAURI__.invoke': !!(window.__TAURI__?.invoke),
                'window.__TAURI__.core': !!(window.__TAURI__?.core),
                'window.__TAURI__.core.invoke': !!(window.__TAURI__?.core?.invoke)
            }
        });
        return null;
    }

    if (!message.id) {
        message.id = `msg_${message.timestamp}_${Math.random().toString(36).substring(2, 9)}`;
    }

    const { messageItem, contentDiv, avatarImg, senderNameDiv } = createMessageSkeleton(message, globalSettings, currentSelectedItem);

    // --- NEW: Scoped CSS Implementation ---
    let scopeId = null;
    if (message.role === 'assistant') {
        scopeId = generateUniqueId();
        messageItem.id = scopeId; // Assign the unique ID to the message container
    }
    // --- END Scoped CSS Implementation ---


    // 先确定颜色值（但不应用）
    let avatarColorToUse;
    let avatarUrlToUse; // This was the missing variable
    let customBorderColor = null; // 自定义边框颜色
    let customNameColor = null; // 自定义名称颜色
    let shouldApplyColorToName = false; // 是否应该将头像颜色也应用到名称
    let useThemeColors = false; // 是否使用主题颜色
    
    if (message.role === 'user') {
        avatarColorToUse = globalSettings.userAvatarCalculatedColor;
        avatarUrlToUse = globalSettings.userAvatarUrl;
        // 检查用户是否启用了"会话中使用主题颜色"
        useThemeColors = globalSettings.userUseThemeColorsInChat || false;
        
        if (!useThemeColors) {
            // 用户消息：获取自定义颜色（仅在未启用主题颜色时应用）
            customBorderColor = globalSettings.userAvatarBorderColor;
            customNameColor = globalSettings.userNameTextColor;
        }
        // 用户消息：头像颜色也应用到名称
        shouldApplyColorToName = true;
    } else if (message.role === 'assistant') {
        if (message.isGroupMessage) {
            avatarColorToUse = message.avatarColor;
            avatarUrlToUse = message.avatarUrl;
            // 群组消息中的Agent，获取其自定义颜色
            if (message.agentId) {
                const agentConfig = currentSelectedItem?.config?.agents?.find(a => a.id === message.agentId);
                if (agentConfig) {
                    useThemeColors = agentConfig.useThemeColorsInChat || false;
                    if (!useThemeColors) {
                        customBorderColor = agentConfig.avatarBorderColor;
                        customNameColor = agentConfig.nameTextColor;
                    }
                }
            }
        } else if (currentSelectedItem) {
            avatarColorToUse = currentSelectedItem.config?.avatarCalculatedColor
                            || currentSelectedItem.avatarCalculatedColor
                            || currentSelectedItem.config?.avatarColor
                            || currentSelectedItem.avatarColor;
            avatarUrlToUse = currentSelectedItem.avatarUrl;
            
            // 非群组消息，获取当前Agent的设置
            const agentConfig = currentSelectedItem.config || currentSelectedItem;
            if (agentConfig) {
                useThemeColors = agentConfig.useThemeColorsInChat || false;
                if (!useThemeColors) {
                    customBorderColor = agentConfig.avatarBorderColor;
                    customNameColor = agentConfig.nameTextColor;
                }
            }
        }
    }

    // 先添加到DOM
    if (appendToDom) {
        chatMessagesDiv.appendChild(messageItem);
    }

    if (message.isThinking) {
        contentDiv.innerHTML = `<span class="thinking-indicator">${message.content || '思考中'}<span class="thinking-indicator-dots">...</span></span>`;
        messageItem.classList.add('thinking');
    } else {
        let textToRender = "";
        if (typeof message.content === 'string') {
            textToRender = message.content;
        } else if (message.content && typeof message.content.text === 'string') {
            // This case handles objects like { text: "..." }, common for group messages before history saving
            textToRender = message.content.text;
        } else if (message.content === null || message.content === undefined) {
            textToRender = ""; // Handle null or undefined content gracefully
             console.warn('[MessageRenderer] message.content is null or undefined for message ID:', message.id);
        } else {
            // Fallback for other unexpected object structures, log and use a placeholder
            console.warn('[MessageRenderer] Unexpected message.content type. Message ID:', message.id, 'Content:', JSON.stringify(message.content));
            textToRender = "[消息内容格式异常]";
        }
        
        // Apply special formatting for user button clicks
        if (message.role === 'user') {
            textToRender = transformUserButtonClick(textToRender);
            textToRender = transformVCPChatCanvas(textToRender);
        } else if (message.role === 'assistant' && scopeId) {
            // --- 🟢 关键修复：先保护代码块，再提取样式 ---
            // 这样可以避免代码块内的 <style> 被误当作真正的样式注入
            const codeBlocksForStyleProtection = [];
            const textWithProtectedBlocks = textToRender.replace(CODE_FENCE_REGEX, (match) => {
                const placeholder = `__VCP_STYLE_PROTECT_${codeBlocksForStyleProtection.length}__`;
                codeBlocksForStyleProtection.push(match);
                return placeholder;
            });
            
            // 现在只会匹配代码块外的 <style> 标签
            const { processedContent: contentWithoutStyles } = processAndInjectScopedCss(textWithProtectedBlocks, scopeId);
            
            // 恢复代码块
            textToRender = contentWithoutStyles;
            codeBlocksForStyleProtection.forEach((block, i) => {
                const placeholder = `__VCP_STYLE_PROTECT_${i}__`;
                textToRender = textToRender.replace(placeholder, block);
            });
            // --- 修复结束 ---
        }
        
        // --- 按“对话轮次”计算深度 ---
        // 如果是新消息，它此时还不在 history 数组里，先临时加进去计算
        const historyForDepthCalc = currentChatHistory.some(m => m.id === message.id)
            ? [...currentChatHistory]
            : [...currentChatHistory, message];
        const depth = calculateDepthByTurns(message.id, historyForDepthCalc);
        // --- 深度计算结束 ---

        // --- 应用前端正则规则 ---
        // 核心修复：将正则规则应用移出 preprocessFullContent，以避免在流式传输的块上执行
        // 这样可以确保正则表达式在完整的消息内容上运行
        const agentConfigForRegex = currentSelectedItem?.config || currentSelectedItem;
        if (agentConfigForRegex?.stripRegexes && Array.isArray(agentConfigForRegex.stripRegexes)) {
            textToRender = applyFrontendRegexRules(textToRender, agentConfigForRegex.stripRegexes, message.role, depth);
        }
        // --- 正则规则应用结束 ---

        const processedContent = preprocessFullContent(textToRender, globalSettings, message.role, depth);
        // Use available marked instance (if any). Fall back to window.marked if vendor set global.
        let rawHtml;
        try {
            const parser = markedInstance || window.marked;
            if (parser && typeof parser.parse === 'function') {
                rawHtml = parser.parse(processedContent);
            } else {
                // Fallback to simple escaping but allow raw <img ...> tags
                rawHtml = processedContent
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/&lt;(img\s+[^&]*)&gt;/g, '<$1>');
            }
        } catch (e) {
            rawHtml = processedContent
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/&lt;(img\s+[^&]*)&gt;/g, '<$1>');
        }
        
        // 修复：清理 Markdown 解析器可能生成的损坏的 SVG viewBox 属性
        // 错误 "Unexpected end of attribute" 表明 viewBox 的值不完整, 例如 "0 "
        rawHtml = rawHtml.replace(/viewBox="0 "/g, 'viewBox="0 0 24 24"');
        
            // Synchronously set the base HTML content
            const finalHtml = rawHtml;
            contentDiv.innerHTML = finalHtml;

            // Define the post-processing logic as a function.
            // This allows us to control WHEN it gets executed.
            const runPostRenderProcessing = async () => {
                // This function should only be called when messageItem is connected to the DOM.
                
                // Process images, attachments, and synchronous content first.
                setContentAndProcessImages(contentDiv, finalHtml, message.id);
                renderAttachments(message, contentDiv);
                contentProcessor.processRenderedContent(contentDiv, globalSettings);
                await renderMermaidDiagrams(contentDiv); // Render mermaid diagrams

                // Defer TreeWalker-based highlighters with a hardcoded delay to ensure the DOM is stable.
                setTimeout(() => {
                    if (contentDiv && contentDiv.isConnected) {
                        contentProcessor.highlightAllPatternsInMessage(contentDiv);
                    }
                }, 0);

                // Finally, process any animations and execute scripts/3D scenes.
                processAnimationsInContent(contentDiv);
            };

            // If we are appending directly to the DOM, schedule the processing immediately.
            if (appendToDom) {
                // We still use requestAnimationFrame to ensure the element is painted before we process it.
                requestAnimationFrame(() => runPostRenderProcessing());
            } else {
                // If not, attach the processing function to the element itself.
                // The caller (e.g., a batch renderer) will be responsible for executing it
                // AFTER the element has been attached to the DOM.
                messageItem._vcp_process = () => runPostRenderProcessing();
            }
        }
    
    // 然后应用颜色（现在 messageItem.isConnected 是 true）
    if ((message.role === 'user' || message.role === 'assistant') && avatarImg && senderNameDiv) {
        const applyColorToElements = (colorStr) => {
            if (colorStr) {
                //console.log(`[DEBUG] Applying color ${colorStr} to message item ${messageItem.dataset.messageId}`);
                messageItem.style.setProperty('--dynamic-avatar-color', colorStr);
                
                // 后备方案：直接应用到avatarImg
                if (avatarImg) {
                    avatarImg.style.borderColor = colorStr;
                    avatarImg.style.borderWidth = '2px';
                    avatarImg.style.borderStyle = 'solid';
                }
                
                // 如果需要，也应用到名称
                if (shouldApplyColorToName && senderNameDiv) {
                    senderNameDiv.style.color = colorStr;
                }
            } else {
                //console.log(`[DEBUG] No color to apply, using default`);
                messageItem.style.removeProperty('--dynamic-avatar-color');
            }
        };

        // 如果启用了主题颜色模式，不应用任何自定义颜色，让CSS主题接管
        if (useThemeColors) {
            //console.log(`[DEBUG] Using theme colors for message ${messageItem.dataset.messageId}`);
            messageItem.style.removeProperty('--dynamic-avatar-color');
            if (avatarImg) {
                avatarImg.style.removeProperty('border-color');
            }
            if (senderNameDiv) {
                senderNameDiv.style.removeProperty('color');
            }
        } else if (customBorderColor && avatarImg) {
            // 优先应用自定义颜色（如果启用且未启用主题颜色）
            //console.log(`[DEBUG] Applying custom border color ${customBorderColor} to avatar`);
            avatarImg.style.borderColor = customBorderColor;
            avatarImg.style.borderWidth = '2px';
            avatarImg.style.borderStyle = 'solid';
        } else if (avatarColorToUse) {
            // 没有自定义颜色或禁用时，使用计算的颜色
            applyColorToElements(avatarColorToUse);
        } else if (avatarUrlToUse && !avatarUrlToUse.includes('default_')) { // No persisted color, try to extract
            // 🟢 Non-blocking color calculation
            // Immediately apply a default border, which will be overridden if color extraction succeeds.
            if (avatarImg) {
                avatarImg.style.borderColor = 'var(--border-color)';
            }

            getDominantAvatarColorCached(avatarUrlToUse).then(dominantColor => {
                if (dominantColor && messageItem.isConnected) {
                    // 只有在没有自定义边框颜色时才应用提取的颜色到边框
                    if (!customBorderColor) {
                        applyColorToElements(dominantColor);
                    } else if (shouldApplyColorToName && senderNameDiv) {
                        // 如果有自定义边框颜色但需要应用颜色到名称，单独处理
                        senderNameDiv.style.color = dominantColor;
                    }
                    
                    // Persist the extracted color
                    let typeToSave, idToSaveFor;
                    if (message.role === 'user') {
                        typeToSave = 'user'; idToSaveFor = 'user_global';
                    } else if (message.isGroupMessage && message.agentId) {
                        typeToSave = 'agent'; idToSaveFor = message.agentId;
                    } else if (currentSelectedItem && currentSelectedItem.type === 'agent') {
                        typeToSave = 'agent'; idToSaveFor = currentSelectedItem.id;
                    }

                    if (typeToSave && idToSaveFor) {
                        callBackend('save_avatar_color', { type: typeToSave, id: idToSaveFor, color: dominantColor })
                            .then(result => {
                                if (result && result.success) {
                                    if (typeToSave === 'user') {
                                        mainRendererReferences.globalSettingsRef.set({...globalSettings, userAvatarCalculatedColor: dominantColor });
                                    } else if (typeToSave === 'agent' && idToSaveFor === currentSelectedItem.id) {
                                        if (currentSelectedItem.config) {
                                            currentSelectedItem.config.avatarCalculatedColor = dominantColor;
                                        } else {
                                            currentSelectedItem.avatarCalculatedColor = dominantColor;
                                        }
                                    }
                                }
                            }).catch(err => {
                                console.warn('[MessageRenderer] 保存头像颜色失败:', err);
                            });
                    }
                }
            }).catch(err => {
                console.warn(`[Color] Failed to extract dominant color for ${avatarUrlToUse}:`, err);
                // The default border is already applied, so no further action is needed on error.
            });
        } else if (!customBorderColor) { // Default avatar or no URL, reset to theme defaults (only if no custom color)
            // Remove the custom property. The CSS will automatically use its fallback values.
            messageItem.style.removeProperty('--dynamic-avatar-color');
        }
        
        // 应用自定义名称文字颜色
        if (customNameColor && senderNameDiv) {
            //console.log(`[DEBUG] Applying custom name color ${customNameColor} to sender name`);
            senderNameDiv.style.color = customNameColor;
        }
        
        // 应用会话样式CSS到聊天消息
        if (message.role === 'assistant') {
            let chatCss = '';
            
            if (message.isGroupMessage && message.agentId) {
                // 群组消息中的Agent
                const agentConfig = currentSelectedItem?.config?.agents?.find(a => a.id === message.agentId);
                chatCss = agentConfig?.chatCss || '';
            } else if (currentSelectedItem) {
                // 非群组消息
                const agentConfig = currentSelectedItem.config || currentSelectedItem;
                chatCss = agentConfig?.chatCss || '';
            }
            
            // 通过动态注入<style>标签应用会话CSS
            if (chatCss && chatCss.trim()) {
                //console.log(`[DEBUG] Applying chat CSS to message ${message.id}:`, chatCss);
                
                // 为此消息创建唯一的scope ID
                const chatScopeId = `vcp-chat-${message.id}`;
                messageItem.setAttribute('data-chat-scope', chatScopeId);
                
                // 检查是否已存在相同的style标签
                let existingStyle = document.head.querySelector(`style[data-chat-scope-id="${chatScopeId}"]`);
                if (existingStyle) {
                    existingStyle.remove();
                }
                
                // 创建scoped CSS（为当前消息添加作用域）
                const scopedChatCss = `[data-chat-scope="${chatScopeId}"] ${chatCss}`;
                
                // 注入到<head>
                const styleElement = document.createElement('style');
                styleElement.type = 'text/css';
                styleElement.setAttribute('data-chat-scope-id', chatScopeId);
                styleElement.textContent = scopedChatCss;
                document.head.appendChild(styleElement);
            }
        }
    }


    // Attachments and content processing are now deferred within a requestAnimationFrame
    // to prevent race conditions during history loading. See the block above.
   
   // The responsibility of updating the history array is now moved to the caller (e.g., chatManager.handleSendMessage)
   // to ensure a single source of truth and prevent race conditions.
   /*
   if (!isInitialLoad && !message.isThinking) {
        const currentChatHistoryArray = mainRendererReferences.currentChatHistoryRef.get();
        currentChatHistoryArray.push(message);
        mainRendererReferences.currentChatHistoryRef.set(currentChatHistoryArray); // Update the ref

        if (currentSelectedItem.id && mainRendererReferences.currentTopicIdRef.get()) {
             if (currentSelectedItem.type === 'agent') {
                // 使用 tauriAPI 保存聊天历史
                mainRendererReferences.tauriAPI.saveChatHistory(currentSelectedItem.id, mainRendererReferences.currentTopicIdRef.get(), currentChatHistoryArray);
             } else if (currentSelectedItem.type === 'group') {
                // Group history is usually saved by groupchat.js in main process after AI response
             }
        }
    }
    */
    if (isInitialLoad && message.isThinking && message.role !== 'system') {
        // This case should ideally not happen if thinking messages aren't persisted.
        // If it does, remove the transient thinking message.
        // But preserve system messages even if they are thinking messages
        const currentChatHistoryArray = mainRendererReferences.currentChatHistoryRef.get();
        const thinkingMsgIndex = currentChatHistoryArray.findIndex(m => m.id === message.id && m.isThinking);
        if (thinkingMsgIndex > -1) {
            currentChatHistoryArray.splice(thinkingMsgIndex, 1);
            mainRendererReferences.currentChatHistoryRef.set(currentChatHistoryArray);
        }
        messageItem.remove();
        return null;
    }

   // Highlighting is now part of processRenderedContent
   
//    console.log(`[MessageRenderer renderMessage] ✅ 消息渲染完成:`, {
//        messageId: message.id,
//        role: message.role,
//        appendToDom: appendToDom,
//        messageItemExists: !!messageItem,
//        messageItemInDOM: messageItem ? document.contains(messageItem) : false
//    });
   
   if (appendToDom) {
       //console.log(`[MessageRenderer renderMessage] 📜 滚动到底部`);
       mainRendererReferences.uiHelper.scrollToBottom();
   }
   
   // 语音朗读功能 - 自动朗读（工具栏复选框控制）
   // 播报整个话题的所有气泡，但每条消息只播报一次
   if ((message.role === 'assistant' || message.role === 'user') && !message.isThinking && appendToDom) {
       const toolbarSettings = window.ChatToolbar?.getToolbarSettings() || {};
       if (toolbarSettings.voiceRead) {
           // 检查这条消息是否已经被朗读过
           if (!message._hasBeenRead) {
               // 获取说话人名字
               const speakerName = message.name || 
                                 (message.role === 'user' ? '用户' : 'AI');
               speakMessage(message.content, false, speakerName);
               // 标记为已朗读
               message._hasBeenRead = true;
           }
       }
   }
   
   return messageItem;
}

// 语音朗读队列
let speechQueue = [];
let isSpeaking = false;

// 停止所有语音朗读
function stopAllSpeech() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
    speechQueue = [];
    isSpeaking = false;
}

function speakMessage(text, cancelPrevious = false, speakerName = null) {
    // 使用 Web Speech API 朗读消息
    if ('speechSynthesis' in window && text) {
        // 如果需要取消之前的朗读（右键菜单朗读）
        if (cancelPrevious) {
            window.speechSynthesis.cancel();
            speechQueue = [];
            isSpeaking = false;
        }
        
        // 确保 text 是字符串
        let textContent = '';
        if (typeof text === 'string') {
            textContent = text;
        } else if (text && typeof text === 'object') {
            // 如果是对象，尝试提取 text 属性
            textContent = text.text || text.content || '';
        }
        
        if (!textContent) {
            return; // 没有可朗读的内容
        }
        
        // 提取纯文本（移除 Markdown 和 HTML）
        let plainText = textContent
            .replace(/```[\s\S]*?```/g, '') // 移除代码块
            .replace(/`[^`]+`/g, '') // 移除行内代码
            .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // 移除链接，保留文本
            .replace(/<[^>]+>/g, '') // 移除 HTML 标签
            .replace(/[#*_~]/g, '') // 移除 Markdown 符号
            .trim();
        
        // 如果有说话人名字，添加到开头
        if (speakerName && plainText) {
            plainText = `${speakerName}说：${plainText}`;
        }
        
        if (plainText) {
            // 添加到队列
            speechQueue.push(plainText);
            // 如果当前没有在播放，开始播放
            if (!isSpeaking) {
                processNextSpeech();
            }
        }
    }
}

function processNextSpeech() {
    if (speechQueue.length === 0) {
        isSpeaking = false;
        return;
    }
    
    isSpeaking = true;
    const text = speechQueue.shift();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // 播放结束后处理下一条
    utterance.onend = () => {
        processNextSpeech();
    };
    
    // 播放出错时也要继续下一条
    utterance.onerror = (event) => {
        console.warn('[MessageRenderer] 语音播放出错:', event.error);
        processNextSpeech();
    };
    
    window.speechSynthesis.speak(utterance);
}

function startStreamingMessage(message, messageItem = null) {
    return streamManager.startStreamingMessage(message, messageItem);
}


function appendStreamChunk(messageId, chunkData, context) {
    streamManager.appendStreamChunk(messageId, chunkData, context);
}

async function finalizeStreamedMessage(messageId, finishReason, context) {
    // 责任完全在 streamManager 内部，它应该使用自己拼接好的文本。
    // 我们现在只传递必要的元数据。
    await streamManager.finalizeStreamedMessage(messageId, finishReason, context);

    // --- 核心修复：流式结束后，对完整内容重新应用前端正则 ---
    // 这是为了解决流式传输导致正则表达式（如元思考链）被分割而无法匹配的问题
    const finalMessage = mainRendererReferences.currentChatHistoryRef.get().find(m => m.id === messageId);
    if (finalMessage) {
        // 使用 updateMessageContent 来安全地重新渲染消息，这将触发我们之前添加的正则逻辑
        updateMessageContent(messageId, finalMessage.content);
        
        // 语音朗读：流式消息完成后触发朗读
        if ((finalMessage.role === 'assistant' || finalMessage.role === 'user') && !finalMessage.isThinking) {
            const toolbarSettings = window.ChatToolbar?.getToolbarSettings() || {};
            if (toolbarSettings.voiceRead && !finalMessage._hasBeenRead) {
                // 获取说话人名字
                const speakerName = finalMessage.name || 
                                  (finalMessage.role === 'user' ? '用户' : 'AI');
                speakMessage(finalMessage.content, false, speakerName);
                finalMessage._hasBeenRead = true;
            }
        }
    }
    // --- 修复结束 ---

    // After the stream is finalized in the DOM, find the message and render any mermaid blocks.
    const messageItem = mainRendererReferences.chatMessagesDiv.querySelector(`.message-item[data-message-id="${messageId}"]`);
    if (messageItem) {
        const contentDiv = messageItem.querySelector('.md-content');
        if (contentDiv) {
            await renderMermaidDiagrams(contentDiv);
        }
    }
}



/**
 * Renders a full, non-streamed message, replacing a 'thinking' placeholder.
 * @param {string} messageId - The ID of the message to update.
 * @param {string} fullContent - The full HTML or text content of the message.
 * @param {string} agentName - The name of the agent sending the message.
 * @param {string} agentId - The ID of the agent sending the message.
 */
async function renderFullMessage(messageId, fullContent, agentName, agentId) {
    //console.log(`[MessageRenderer renderFullMessage] 渲染完整消息，ID: ${messageId}`);
    const { chatMessagesDiv, uiHelper, markedInstance } = mainRendererReferences;
    const currentChatHistoryArray = mainRendererReferences.currentChatHistoryRef.get();
    const currentSelectedItem = mainRendererReferences.currentSelectedItemRef.get();
    const currentTopicIdVal = mainRendererReferences.currentTopicIdRef.get();

    // --- Update History First ---
    const messageIndex = currentChatHistoryArray.findIndex(msg => msg.id === messageId);
    if (messageIndex > -1) {
        const message = currentChatHistoryArray[messageIndex];
        message.content = fullContent;
        message.isThinking = false;
        message.finishReason = 'completed_non_streamed';
        message.name = agentName || message.name;
        message.agentId = agentId || message.agentId;
        mainRendererReferences.currentChatHistoryRef.set([...currentChatHistoryArray]);

        // Save history
        if (currentSelectedItem && currentSelectedItem.id && currentTopicIdVal && currentSelectedItem.type === 'group') {
            try {
                await callBackend('save_group_chat_history', { groupId: currentSelectedItem.id, topicId: currentTopicIdVal, messages: currentChatHistoryArray.filter(m => !m.isThinking) });
            } catch (error) {
                console.error(`[MessageRenderer renderFullMessage] 保存群组历史失败，群组 ${currentSelectedItem.id}，话题 ${currentTopicIdVal}:`, error);
            }
        }
    } else {
        console.warn(`[renderFullMessage] 消息 ID ${messageId} 在历史记录中未找到。UI 将更新，但历史记录可能不一致。`);
    }

    const messageItem = chatMessagesDiv.querySelector(`.message-item[data-message-id="${messageId}"]`);
    if (!messageItem) {
        //console.log(`[renderFullMessage] 未找到 ${messageId} 的 DOM 元素。历史已更新，跳过 UI。`);
        return; // No UI to update, but history is now consistent.
    }

    messageItem.classList.remove('thinking', 'streaming');

    const contentDiv = messageItem.querySelector('.md-content');
    if (!contentDiv) {
        console.error(`[renderFullMessage] Could not find .md-content div for message ID ${messageId}.`);
        return;
    }

    // Update timestamp display if it was missing
    const nameTimeBlock = messageItem.querySelector('.name-time-block');
    if (nameTimeBlock && !nameTimeBlock.querySelector('.message-timestamp')) {
        const timestampDiv = document.createElement('div');
        timestampDiv.classList.add('message-timestamp');
        const messageFromHistory = currentChatHistoryArray.find(m => m.id === messageId);
        const date = new Date(messageFromHistory?.timestamp || Date.now());
        const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
        timestampDiv.textContent = formattedDate;
        nameTimeBlock.appendChild(timestampDiv);
    }

    // --- Update DOM ---
    const globalSettings = mainRendererReferences.globalSettingsRef.get();
    // --- 应用前端正则规则 (修复流式处理问题) ---
    const agentConfigForRegex = currentSelectedItem?.config || currentSelectedItem;
    const messageFromHistoryForRegex = currentChatHistoryArray.find(msg => msg.id === messageId);
    if (agentConfigForRegex?.stripRegexes && Array.isArray(agentConfigForRegex.stripRegexes) && messageFromHistoryForRegex) {
        const depth = calculateDepthByTurns(messageId, currentChatHistoryArray);
        fullContent = applyFrontendRegexRules(fullContent, agentConfigForRegex.stripRegexes, messageFromHistoryForRegex.role, depth);
    }
    // --- 正则规则应用结束 ---
    const processedFinalText = preprocessFullContent(fullContent, globalSettings, 'assistant');
    let rawHtml = markedInstance.parse(processedFinalText);

    setContentAndProcessImages(contentDiv, rawHtml, messageId);

    // Apply post-processing in two steps
    // Step 1: Synchronous processing
    contentProcessor.processRenderedContent(contentDiv, globalSettings);
    await renderMermaidDiagrams(contentDiv);

    // Step 2: Asynchronous, deferred highlighting for DOM stability with a hardcoded delay
    setTimeout(() => {
        if (contentDiv && contentDiv.isConnected) {
            contentProcessor.highlightAllPatternsInMessage(contentDiv);
        }
    }, 0);

    // After content is rendered, run animations/scripts/3D scenes
    processAnimationsInContent(contentDiv);

    mainRendererReferences.uiHelper.scrollToBottom();
}

function updateMessageContent(messageId, newContent) {
    const { chatMessagesDiv, markedInstance, globalSettingsRef } = mainRendererReferences;
    const messageItem = chatMessagesDiv.querySelector(`.message-item[data-message-id="${messageId}"]`);
    if (!messageItem) return;

    const contentDiv = messageItem.querySelector('.md-content');
    if (!contentDiv) return;

    const globalSettings = globalSettingsRef.get();
    let textToRender = (typeof newContent === 'string') ? newContent : (newContent?.text || "[内容格式异常]");
    
    // --- 深度计算 (用于历史消息渲染) ---
    const currentChatHistoryForUpdate = mainRendererReferences.currentChatHistoryRef.get();
    const messageInHistory = currentChatHistoryForUpdate.find(m => m.id === messageId);
    
    // --- 按“对话轮次”计算深度 ---
    const depthForUpdate = calculateDepthByTurns(messageId, currentChatHistoryForUpdate);
    // --- 深度计算结束 ---
    // --- 应用前端正则规则 (修复流式处理问题) ---
    const currentSelectedItem = mainRendererReferences.currentSelectedItemRef.get();
    const agentConfigForRegex = currentSelectedItem?.config || currentSelectedItem;
    if (agentConfigForRegex?.stripRegexes && Array.isArray(agentConfigForRegex.stripRegexes) && messageInHistory) {
        textToRender = applyFrontendRegexRules(textToRender, agentConfigForRegex.stripRegexes, messageInHistory.role, depthForUpdate);
    }
    // --- 正则规则应用结束 ---
    const processedContent = preprocessFullContent(textToRender, globalSettings, messageInHistory?.role || 'assistant', depthForUpdate);
    let rawHtml = markedInstance.parse(processedContent);

    // --- Post-Render Processing (aligned with renderMessage logic) ---

    // 1. Set content and process images
    setContentAndProcessImages(contentDiv, rawHtml, messageId);

    // 2. Re-render attachments if they exist
    if (messageInHistory) {
        const existingAttachments = contentDiv.querySelector('.message-attachments');
        if (existingAttachments) existingAttachments.remove();
        renderAttachments({ ...messageInHistory, content: newContent }, contentDiv);
    }

    // 3. Synchronous processing (KaTeX, buttons, etc.)
    contentProcessor.processRenderedContent(contentDiv, globalSettings);
    renderMermaidDiagrams(contentDiv); // Fire-and-forget async rendering

    // 4. Asynchronous, deferred highlighting for DOM stability
    setTimeout(() => {
        if (contentDiv && contentDiv.isConnected) {
            contentProcessor.highlightAllPatternsInMessage(contentDiv);
        }
    }, 0);

    // 5. Re-run animations/scripts/3D scenes
    processAnimationsInContent(contentDiv);
}

// Expose methods to renderer.js
/**
 * Renders a complete chat history with progressive loading for better UX.
 * First shows the latest 5 messages, then loads older messages in batches of 10.
 * @param {Array<Message>} history The chat history to render.
 * @param {Object} options Rendering options
 * @param {number} options.initialBatch - Number of latest messages to show first (default: 5)
 * @param {number} options.batchSize - Size of subsequent batches (default: 10)
 * @param {number} options.batchDelay - Delay between batches in ms (default: 100)
 */
async function renderHistory(history, options = {}) {
    //console.log(`[MessageRenderer renderHistory] 🚀 开始渲染历史记录`);
    // //console.log(`[MessageRenderer renderHistory] 📊 输入参数:`, {
    //     historyLength: history?.length || 0,
    //     isArray: Array.isArray(history),
    //     options: options,
    //     firstMessage: history?.[0] ? {
    //         role: history[0].role,
    //         content: history[0].content?.substring(0, 50) + '...',
    //         id: history[0].id
    //     } : null
    // });
    
    const {
        initialBatch = 5,
        batchSize = 10,
        batchDelay = 100
    } = options;

    // 核心修复：在开始批量渲染前，只等待一次依赖项。
    //console.log(`[MessageRenderer renderHistory] 🔧 初始化表情包URL修复器`);
    await emoticonUrlFixer.initialize(mainRendererReferences.tauriAPI);

    if (!history || history.length === 0) {
        //console.log(`[MessageRenderer renderHistory] ⚠️ 历史记录为空或无效，直接返回`);
        return Promise.resolve();
    }

    // 如果消息数量很少，直接使用原来的方式渲染
    if (history.length <= initialBatch) {
        //console.log(`[MessageRenderer renderHistory] 📝 消息数量少(${history.length} <= ${initialBatch})，使用传统渲染`);
        return renderHistoryLegacy(history);
    }

    //console.log(`[MessageRenderer renderHistory] 🎨 开始分批渲染 ${history.length} 条消息，首批 ${initialBatch} 条，后续每批 ${batchSize} 条`);

    // 分离最新的消息和历史消息
    const latestMessages = history.slice(-initialBatch);
    const olderMessages = history.slice(0, -initialBatch);
    
    // //console.log(`[MessageRenderer renderHistory] 📋 消息分组:`, {
    //     latestMessagesCount: latestMessages.length,
    //     olderMessagesCount: olderMessages.length
    // });

    // 第一阶段：立即渲染最新的消息
    //console.log(`[MessageRenderer renderHistory] 🎨 第一阶段: 渲染最新 ${latestMessages.length} 条消息`);
    try {
        await renderMessageBatch(latestMessages, true);
        //console.log(`[MessageRenderer renderHistory] ✅ 首批 ${latestMessages.length} 条最新消息已渲染`);
    } catch (error) {
        console.error(`[MessageRenderer renderHistory] ❌ 首批消息渲染失败:`, error);
        throw error;
    }

    // 第二阶段：分批渲染历史消息（从旧到新）
    if (olderMessages.length > 0) {
        //console.log(`[MessageRenderer renderHistory] 🎨 第二阶段: 分批渲染历史 ${olderMessages.length} 条消息`);
        try {
            await renderOlderMessagesInBatches(olderMessages, batchSize, batchDelay);
            //console.log(`[MessageRenderer renderHistory] ✅ 历史消息分批渲染完成`);
        } catch (error) {
            console.error(`[MessageRenderer renderHistory] ❌ 历史消息渲染失败:`, error);
            // 不抛出错误，让最新消息至少能显示
        }
    }

    // 最终滚动到底部
    //console.log(`[MessageRenderer renderHistory] 📜 滚动到底部`);
    mainRendererReferences.uiHelper.scrollToBottom();
    //console.log(`[MessageRenderer renderHistory] ✅ 所有 ${history.length} 条消息渲染完成`);
    
    // 最终验证DOM状态
    const chatMessagesDiv = mainRendererReferences.chatMessagesDiv;
    if (chatMessagesDiv) {
        const messageElements = chatMessagesDiv.querySelectorAll('.message-item:not(.system)');
        //console.log(`[MessageRenderer renderHistory] 🔍 最终DOM验证: 找到 ${messageElements.length} 个消息元素`);
        if (messageElements.length === 0 && history.length > 0) {
            console.error(`[MessageRenderer renderHistory] ❌ 严重问题: 渲染了 ${history.length} 条消息但DOM中没有消息元素!`);
        }
    }
}

/**
 * 渲染一批消息
 * @param {Array<Message>} messages 要渲染的消息数组
 * @param {boolean} scrollToBottom 是否滚动到底部
 */
async function renderMessageBatch(messages, scrollToBottom = false) {
    // //console.log(`[MessageRenderer renderMessageBatch] 🎨 开始批量渲染:`, {
    //     messageCount: messages.length,
    //     scrollToBottom: scrollToBottom,
    //     firstMessage: messages[0] ? {
    //         id: messages[0].id,
    //         role: messages[0].role,
    //         content: messages[0].content?.substring(0, 30) + '...'
    //     } : null
    // });
    
    const fragment = document.createDocumentFragment();
    const messageElements = [];

    // 使用 Promise.allSettled 避免单个失败影响整体
    //console.log(`[MessageRenderer renderMessageBatch] 🔧 开始并行渲染 ${messages.length} 条消息`);
    const results = await Promise.allSettled(
        messages.map((msg, index) => {
            //console.log(`[MessageRenderer renderMessageBatch] 🎨 渲染消息 ${index + 1}/${messages.length}: ${msg.role} - ${msg.id}`);
            return renderMessage(msg, true, false);
        })
    );

    //console.log(`[MessageRenderer renderMessageBatch] 📊 渲染结果统计:`);
    results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
            messageElements.push(result.value);
            //console.log(`[MessageRenderer renderMessageBatch] ✅ 消息 ${index + 1} 渲染成功: ${messages[index].id}`);
        } else {
            console.error(`[MessageRenderer renderMessageBatch] ❌ 消息 ${index + 1} 渲染失败 (${messages[index].id}):`, result.reason);
        }
    });

    //console.log(`[MessageRenderer renderMessageBatch] 📋 成功渲染 ${messageElements.length}/${messages.length} 条消息`);

    // 一次性添加到 fragment
    messageElements.forEach(el => fragment.appendChild(el));
    
    // 使用 requestAnimationFrame 确保 DOM 更新不阻塞 UI
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            //console.log(`[MessageRenderer renderMessageBatch] 🔧 将 ${messageElements.length} 个消息元素添加到DOM`);
            // Step 1: Append all elements to the DOM at once.
            mainRendererReferences.chatMessagesDiv.appendChild(fragment);
            
            // Step 2: Now that they are in the DOM, run the deferred processing for each.
            let processedCount = 0;
            messageElements.forEach(el => {
                if (typeof el._vcp_process === 'function') {
                    el._vcp_process();
                    delete el._vcp_process; // Clean up to avoid memory leaks
                    processedCount++;
                }
            });
            
            //console.log(`[MessageRenderer renderMessageBatch] 🔧 处理了 ${processedCount} 个延迟处理函数`);

            if (scrollToBottom) {
                //console.log(`[MessageRenderer renderMessageBatch] 📜 滚动到底部`);
                mainRendererReferences.uiHelper.scrollToBottom();
            }
            
            //console.log(`[MessageRenderer renderMessageBatch] ✅ 批量渲染完成`);
            resolve();
        });
    });
}

/**
 * 分批渲染历史消息
 * @param {Array<Message>} olderMessages 历史消息数组
 * @param {number} batchSize 每批大小
 * @param {number} batchDelay 批次间延迟
 */
/**
 * 智能批量渲染：使用 requestIdleCallback 在浏览器空闲时渲染
 */
async function renderOlderMessagesInBatches(olderMessages, batchSize, batchDelay) {
    const totalBatches = Math.ceil(olderMessages.length / batchSize);
    
    for (let i = totalBatches - 1; i >= 0; i--) {
        const startIndex = i * batchSize;
        const endIndex = Math.min(startIndex + batchSize, olderMessages.length);
        const batch = olderMessages.slice(startIndex, endIndex);
        
        // 创建批次 fragment
        const batchFragment = document.createDocumentFragment();
        const elementsForProcessing = [];
        
        for (const msg of batch) {
            const messageElement = await renderMessage(msg, true, false);
            if (messageElement) {
                batchFragment.appendChild(messageElement);
                elementsForProcessing.push(messageElement);
            }
        }
        
        // 🟢 使用 requestIdleCallback 在空闲时插入（降级到 requestAnimationFrame）
        await new Promise(resolve => {
            const insertBatch = () => {
                const chatMessagesDiv = mainRendererReferences.chatMessagesDiv;
                let insertPoint = chatMessagesDiv.firstChild;
                while (insertPoint?.classList?.contains('topic-timestamp-bubble')) {
                    insertPoint = insertPoint.nextSibling;
                }
                
                if (insertPoint) {
                    chatMessagesDiv.insertBefore(batchFragment, insertPoint);
                } else {
                    chatMessagesDiv.appendChild(batchFragment);
                }

                elementsForProcessing.forEach(el => {
                    if (typeof el._vcp_process === 'function') {
                        el._vcp_process();
                        delete el._vcp_process;
                    }
                });

                resolve();
            };

            // 优先使用 requestIdleCallback，不支持时降级到 rAF
            if ('requestIdleCallback' in window) {
                requestIdleCallback(insertBatch, { timeout: 1000 });
            } else {
                requestAnimationFrame(insertBatch);
            }
        });
        
        // 动态调整延迟：如果批次小，减少延迟
        if (i > 0 && batchDelay > 0) {
            const actualDelay = batch.length < batchSize / 2 ? batchDelay / 2 : batchDelay;
            await new Promise(resolve => setTimeout(resolve, actualDelay));
        }
    }
}

/**
 * 原始的历史渲染方法（用于少量消息的情况）
 * @param {Array<Message>} history 聊天历史
 */
async function renderHistoryLegacy(history) {
    const fragment = document.createDocumentFragment();
    const allMessageElements = [];

    // Phase 1: Create all message elements in memory without appending to DOM
    for (const msg of history) {
        const messageElement = await renderMessage(msg, true, false);
        if (messageElement) {
            allMessageElements.push(messageElement);
        }
    }

    // Phase 2: Append all created elements at once using a DocumentFragment
    allMessageElements.forEach(el => fragment.appendChild(el));
    
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            // Step 1: Append all elements to the DOM.
            mainRendererReferences.chatMessagesDiv.appendChild(fragment);

            // Step 2: Run the deferred processing for each element now that it's attached.
            allMessageElements.forEach(el => {
                if (typeof el._vcp_process === 'function') {
                    el._vcp_process();
                    delete el._vcp_process; // Clean up
                }
            });

            mainRendererReferences.uiHelper.scrollToBottom();
            resolve();
        });
    });
}

window.messageRenderer = {
    initializeMessageRenderer,
    setCurrentSelectedItem, // Keep for renderer.js to call
    setCurrentTopicId,      // Keep for renderer.js to call
    setCurrentItemAvatar,   // Renamed for clarity
    setUserAvatar,
    setCurrentItemAvatarColor, // Renamed
    setUserAvatarColor,
    renderMessage,
    renderHistory, // Expose the new progressive batch rendering function
    renderHistoryLegacy, // Expose the legacy rendering for compatibility
    renderMessageBatch, // Expose batch rendering utility
    startStreamingMessage,
    appendStreamChunk,
    finalizeStreamedMessage,
    renderFullMessage,
    clearChat,
    removeMessageById,
    updateMessageContent, // Expose the new function
    speakMessageManual: (text, speakerName) => speakMessage(text, true, speakerName), // 手动朗读（右键菜单），取消之前的朗读
    stopAllSpeech: stopAllSpeech, // 停止所有语音朗读
    isMessageInitialized: (messageId) => {
        // Check if message exists in DOM or is being tracked by streamManager
        const messageInDom = mainRendererReferences.chatMessagesDiv?.querySelector(`.message-item[data-message-id="${messageId}"]`);
        if (messageInDom) return true;

        // Also check if streamManager is tracking this message
        if (streamManager && typeof streamManager.isMessageInitialized === 'function') {
            return streamManager.isMessageInitialized(messageId);
        }

        return false;
    },
    summarizeTopicFromMessages: async (history, agentName) => { // Example: Keep this if it's generic enough
        // This function was passed in, so it's likely defined in renderer.js or another module.
        // If it's meant to be internal to messageRenderer, its logic would go here.
        // For now, assume it's an external utility.
        if (mainRendererReferences.summarizeTopicFromMessages) {
            return mainRendererReferences.summarizeTopicFromMessages(history, agentName);
        }
        return null;
    },
    setContextMenuDependencies: (deps) => {
        if (contextMenu && typeof contextMenu.setContextMenuDependencies === 'function') {
            contextMenu.setContextMenuDependencies(deps);
        } else {
            console.error("contextMenu or setContextMenuDependencies not available.");
        }
    }
};

