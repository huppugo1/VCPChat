// modules/interruptHandler.js

let tauriAPI;

/**
 * Initializes the interrupt handler with the Electron API.
 * @param {object} api - The Electron API object from preload.
 */
function initialize(api) {
    tauriAPI = api;
    //console.log('[InterruptHandler] Initialized with tauriAPI');
}

/**
 * Sends an interrupt request to the main process for a given message ID.
 * @param {string} messageId - The ID of the message/request to interrupt.
 * @returns {Promise<{success: boolean, error?: string, message?: string}>}
 */
async function interrupt(messageId) {
    if (!tauriAPI || typeof tauriAPI.interruptVcpRequest !== 'function') {
        const errorMsg = 'Interrupt handler is not initialized or interruptVcpRequest is not available on tauriAPI.';
        console.error(errorMsg);
        return { success: false, error: errorMsg };
    }
    if (!messageId) {
        console.error('No messageId provided for interruption.');
        return { success: false, error: 'No messageId provided.' };
    }

    //console.log(`[InterruptHandler] Requesting interruption for messageId: ${messageId}`);
    //console.log(`[InterruptHandler] tauriAPI.interruptVcpRequest exists:`, typeof tauriAPI.interruptVcpRequest);
    
    try {
        const result = await tauriAPI.interruptVcpRequest({ messageId });
        //console.log(`[InterruptHandler] Interrupt result:`, result);
        
        if (result.success) {
            //console.log(`[InterruptHandler] Successfully sent interrupt for ${messageId}.`);
        } else {
            console.error(`[InterruptHandler] Failed to send interrupt for ${messageId}:`, result.error);
        }
        return result;
    } catch (error) {
        console.error(`[InterruptHandler] Error calling interruptVcpRequest IPC for ${messageId}:`, error);
        return { success: false, error: error.message };
    }
}

// 导出到 window 对象
window.interruptHandler = {
    initialize,
    interrupt
};

export { initialize, interrupt };