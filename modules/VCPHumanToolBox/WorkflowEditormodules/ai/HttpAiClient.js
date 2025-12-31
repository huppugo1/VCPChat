(function() {
    'use strict';

    class HttpAiClient {
        constructor(baseUrl, apiKey) {
            this.baseUrl = baseUrl.replace(/\/?$/, '');
            this.apiKey = apiKey || '';
        }

        getAuthHeaders() {
            const headers = { 'Content-Type': 'application/json' };
            if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
            return headers;
        }

        async listModels() {
            const url = `${this.baseUrl}/v1/models`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            try {
                const res = await fetch(url, { method: 'GET', headers: this.getAuthHeaders(), signal: controller.signal });
                clearTimeout(timeoutId);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                return Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : []);
            } catch (e) {
                clearTimeout(timeoutId);
                throw e;
            }
        }

        async sendCompletion({ model, prompt, options = {} }) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            try {
                // 优先调用 OpenAI 兼容的 chat completions 接口
                const chatUrl = `${this.baseUrl}/v1/chat/completions`;
                const chatBody = JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: String(prompt ?? '') }],
                    stream: false,
                    ...options
                });

                let res = await fetch(chatUrl, { method: 'POST', headers: this.getAuthHeaders(), body: chatBody, signal: controller.signal });

                // 如果 chat 接口不可用或返回 404/400/415/501 等，尝试回退到 completions 接口
                if (!res.ok && [400, 404, 415, 501, 405].includes(res.status)) {
                    const compUrl = `${this.baseUrl}/v1/completions`;
                    const compBody = JSON.stringify({
                        model,
                        prompt: String(prompt ?? ''),
                        stream: false,
                        ...options
                    });
                    res = await fetch(compUrl, { method: 'POST', headers: this.getAuthHeaders(), body: compBody, signal: controller.signal });
                }

                clearTimeout(timeoutId);

                if (!res.ok) {
                    const errText = await safeReadText(res);
                    // 尝试解析标准 OpenAI 错误格式 { error: { message } }
                    try {
                        const errJson = JSON.parse(errText);
                        const msg = errJson?.error?.message || errJson?.message || errText;
                        throw new Error(`HTTP ${res.status}: ${msg}`);
                    } catch (_) {
                        throw new Error(`HTTP ${res.status}: ${errText}`);
                    }
                }

                // 正常解析响应
                const data = await res.json();
                const text = this.extractText(data);
                return text;
            } catch (e) {
                clearTimeout(timeoutId);
                throw e;
            }
        }

        extractText(data) {
            try {
                if (Array.isArray(data?.choices) && data.choices.length > 0) {
                    const c0 = data.choices[0];
                    if (c0?.message?.content) return c0.message.content;
                    if (c0?.text) return c0.text;
                }
                if (typeof data?.text === 'string') return data.text;
            } catch (_) {}
            return '';
        }
    }

    async function safeReadText(res) {
        try {
            return await res.text();
        } catch (_) {
            return '';
        }
    }

    window.HttpAiClient = HttpAiClient;
})();


