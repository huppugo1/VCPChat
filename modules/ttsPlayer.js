// ttsPlayer.js - Handles TTS audio playback using SoVITS HTTP API

window.TTSPlayer = (() => {
    const SOVITS_API_BASE_URL = "http://127.0.0.1:8000";
    
    let currentAudio = null;
    let audioQueue = [];
    let isPlaying = false;
    let isStopped = false;

    async function init() {
        //console.log('[TTSPlayer] Initialized');
    }

    /**
     * 将长文本分割成更小的块
     */
    function splitText(text) {
        const trimmedText = text.trim();
        if (!trimmedText) {
            return [];
        }

        // 按段落分割
        const paragraphs = trimmedText.split('\n').filter(p => p.trim());
        const chunks = [];

        for (const paragraph of paragraphs) {
            // 如果段落太长，按句子分割
            if (paragraph.length > 200) {
                const sentenceRegex = /.+?[。！？.!?]/g;
                let match;
                let lastIndex = 0;
                
                while ((match = sentenceRegex.exec(paragraph)) !== null) {
                    chunks.push(match[0]);
                    lastIndex = match.index + match[0].length;
                }
                
                // 添加剩余部分
                if (lastIndex < paragraph.length) {
                    const remaining = paragraph.substring(lastIndex).trim();
                    if (remaining) {
                        chunks.push(remaining);
                    }
                }
            } else {
                chunks.push(paragraph);
            }
        }

        return chunks.filter(c => c.length > 0);
    }

    /**
     * 调用 SoVITS API 进行语音合成
     */
    async function textToSpeech(text, voice, speed) {
        // 根据模型名称动态确定语言
        let promptLang = "中文";
        if (voice.includes('日语')) {
            promptLang = "日语";
        }

        const payload = {
            model: "tts-v2ProPlus",
            input: text,
            voice: voice,
            response_format: "mp3",
            speed: speed,
            other_params: {
                text_lang: promptLang === "日语" ? "日语" : "中英混合",
                prompt_lang: promptLang,
                emotion: "默认",
                text_split_method: "按标点符号切",
            }
        };

        try {
            //console.log('[TTSPlayer] 发送 TTS 请求:', text.substring(0, 50) + '...');
            const response = await fetch(`${SOVITS_API_BASE_URL}/v1/audio/speech`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const audioBlob = await response.blob();
            //console.log('[TTSPlayer] 收到音频数据，大小:', audioBlob.size);
            return audioBlob;
        } catch (error) {
            console.error('[TTSPlayer] TTS 请求失败:', error);
            return null;
        }
    }

    /**
     * 开始朗读任务
     */
    async function speak(options) {
        const {
            text,
            voice,
            speed,
            msgId,
            ttsRegex,
            voiceSecondary,
            ttsRegexSecondary
        } = options;

        if (!voice) {
            //console.log("[TTSPlayer] No voice model selected. Aborting speak.");
            return;
        }

        //console.log('[TTSPlayer] 开始朗读，文本长度:', text.length);
        
        // 重置停止标志
        isStopped = false;
        
        // 分割文本
        const chunks = splitText(text);
        //console.log('[TTSPlayer] 文本已分割为', chunks.length, '个片段');

        // 将所有片段添加到队列
        for (const chunk of chunks) {
            audioQueue.push({
                text: chunk,
                voice: voice,
                speed: speed || 1.0,
                msgId: msgId
            });
        }

        // 开始处理队列
        processAudioQueue();
    }

    /**
     * 处理音频队列
     */
    async function processAudioQueue() {
        if (isPlaying || audioQueue.length === 0) {
            return;
        }

        isPlaying = true;

        while (audioQueue.length > 0 && !isStopped) {
            const task = audioQueue.shift();
            //console.log(`[TTSPlayer] 处理片段: ${task.text.substring(0, 30)}...`);

            const audioBlob = await textToSpeech(task.text, task.voice, task.speed);

            if (isStopped) {
                //console.log('[TTSPlayer] 已停止，跳过播放');
                break;
            }

            if (audioBlob) {
                await playAudio(audioBlob);
            } else {
                console.error(`[TTSPlayer] 合成失败: "${task.text.substring(0, 20)}..."`);
            }
        }

        isPlaying = false;
        //console.log('[TTSPlayer] 队列处理完成');
    }

    /**
     * 播放音频
     */
    function playAudio(audioBlob) {
        return new Promise((resolve, reject) => {
            if (isStopped) {
                resolve();
                return;
            }

            const audioUrl = URL.createObjectURL(audioBlob);
            currentAudio = new Audio(audioUrl);

            currentAudio.onended = () => {
                //console.log('[TTSPlayer] 音频播放完成');
                URL.revokeObjectURL(audioUrl);
                currentAudio = null;
                resolve();
            };

            currentAudio.onerror = (error) => {
                console.error('[TTSPlayer] 音频播放错误:', error);
                URL.revokeObjectURL(audioUrl);
                currentAudio = null;
                reject(error);
            };

            currentAudio.play().catch(error => {
                console.error('[TTSPlayer] 播放失败:', error);
                URL.revokeObjectURL(audioUrl);
                currentAudio = null;
                reject(error);
            });
        });
    }

    /**
     * 停止播放
     */
    function stopPlayback() {
        //console.log('[TTSPlayer] 停止播放');
        
        // 设置停止标志
        isStopped = true;
        
        // 清空队列
        audioQueue = [];
        
        // 停止当前播放
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio = null;
        }
        
        isPlaying = false;
    }

    return {
        init,
        speak,
        stopPlayback
    };
})();

// 自动初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.TTSPlayer.init();
    });
} else {
    window.TTSPlayer.init();
}
