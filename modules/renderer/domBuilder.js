// modules/renderer/domBuilder.js

/**
 * @typedef {import('./messageRenderer.js').Message} Message
 * @typedef {import('./messageRenderer.js').CurrentSelectedItem} CurrentSelectedItem
 */

/**
 * Creates the basic HTML structure (skeleton) for a message item.
 * @param {Message} message - The message object.
 * @param {object} globalSettings - The global settings object.
 * @param {CurrentSelectedItem} currentSelectedItem - The currently selected agent or group.
 * @returns {{
 *   messageItem: HTMLElement,
 *   contentDiv: HTMLElement,
 *   avatarImg: HTMLImageElement | null,
 *   senderNameDiv: HTMLElement | null,
 *   nameTimeDiv: HTMLElement | null,
 *   detailsAndBubbleWrapper: HTMLElement | null
 * }} An object containing the created DOM elements.
 */
export function createMessageSkeleton(message, globalSettings, currentSelectedItem) {
    const messageItem = document.createElement('div');
    messageItem.classList.add('message-item', message.role);
    if (message.isGroupMessage) messageItem.classList.add('group-message-item');
    messageItem.dataset.timestamp = String(message.timestamp);
    messageItem.dataset.messageId = message.id;
    messageItem.dataset.role = message.role; // 添加role数据属性
    if (message.agentId) messageItem.dataset.agentId = message.agentId;
    if (message.isGroupMessage) messageItem.dataset.isGroupMessage = 'true'; // 添加群组消息标识

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('md-content');

    let avatarImg = null,
        nameTimeDiv = null,
        senderNameDiv = null,
        detailsAndBubbleWrapper = null;
    let avatarUrlToUse, senderNameToUse;
    // 使用相对路径，后续通过 avatarManager 解析

    if (message.role === 'user') {
        avatarUrlToUse = globalSettings.userAvatarUrl || 'AppData/assets/default_user_avatar.png';
        senderNameToUse = message.name || globalSettings.userName || '你';
    } else if (message.role === 'assistant') {
        if (message.isGroupMessage) {
            avatarUrlToUse = message.avatarUrl || 'AppData/assets/default_avatar.png';
            senderNameToUse = message.name || '群成员';
        } else if (currentSelectedItem && currentSelectedItem.avatarUrl) {
            avatarUrlToUse = currentSelectedItem.avatarUrl;
            senderNameToUse = message.name || currentSelectedItem.name || 'AI';
        } else {
            avatarUrlToUse = 'AppData/assets/default_avatar.png';
            senderNameToUse = message.name || 'AI';
        }
    }

    if (message.role === 'user' || message.role === 'assistant') {
        avatarImg = document.createElement('img');
        avatarImg.classList.add('chat-avatar');
        avatarImg.alt = `${senderNameToUse} 头像`;
        // 使用 avatarManager 解析 URL 并设置（包含默认路径的处理），移除旧的回退策略
        (async () => {
            try {
                const resolved = await window.avatarManager.resolveAvatarUrl(avatarUrlToUse);
                avatarImg.src = resolved || avatarUrlToUse;
            } catch (e) {
                console.warn('[domBuilder] avatarManager.resolveAvatarUrl failed, using raw avatarUrlToUse:', e);
                avatarImg.src = avatarUrlToUse;
            }
        })();
        avatarImg.onerror = async () => {
            const defPath = message.role === 'user' ? 'AppData/assets/default_user_avatar.png' : 'AppData/assets/default_avatar.png';
            try {
                const url = await window.avatarManager.resolveAvatarUrl(defPath);
                avatarImg.src = url || defPath;
            } catch (e) {
                avatarImg.src = defPath;
            }
        };

        nameTimeDiv = document.createElement('div');
        nameTimeDiv.classList.add('name-time-block');

        senderNameDiv = document.createElement('div');
        senderNameDiv.classList.add('sender-name');
        senderNameDiv.textContent = senderNameToUse;

        nameTimeDiv.appendChild(senderNameDiv);

        if (message.timestamp && !message.isThinking) {
            const timestampDiv = document.createElement('div');
            timestampDiv.classList.add('message-timestamp');
            const date = new Date(message.timestamp);
            const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
            timestampDiv.textContent = formattedDate;
            nameTimeDiv.appendChild(timestampDiv);
        }

        detailsAndBubbleWrapper = document.createElement('div');
        detailsAndBubbleWrapper.classList.add('details-and-bubble-wrapper');
        detailsAndBubbleWrapper.appendChild(nameTimeDiv);
        detailsAndBubbleWrapper.appendChild(contentDiv);

        messageItem.appendChild(avatarImg);
        messageItem.appendChild(detailsAndBubbleWrapper);
    } else { // system messages
        messageItem.appendChild(contentDiv);
        messageItem.classList.add('system-message-layout');
    }

    return { messageItem, contentDiv, avatarImg, senderNameDiv, nameTimeDiv, detailsAndBubbleWrapper };
}

// Expose to global scope for classic scripts
window.domBuilder = {
    createMessageSkeleton
};