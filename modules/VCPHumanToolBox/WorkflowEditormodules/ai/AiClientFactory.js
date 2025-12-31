(function() {
    'use strict';

    class AiClientFactory {
        constructor() {
            this._client = null;
            this._lastKey = '';
            this._lastBaseUrl = '';
        }

        getApiConfig() {
            if (window.WorkflowEditor_PluginManager && window.WorkflowEditor_PluginManager.getApiConfig) {
                return window.WorkflowEditor_PluginManager.getApiConfig();
            }
            if (window.WorkflowEditor_ApiConfigDialog && window.WorkflowEditor_ApiConfigDialog.getCurrentConfig) {
                return window.WorkflowEditor_ApiConfigDialog.getCurrentConfig();
            }
            return { host: '', port: '', aiApiKey: '' };
        }

        getBaseUrlFromConfig(cfg) {
            const host = (cfg?.host || '').trim();
            const port = (cfg?.port || '').trim();
            if (!host || !port) return '';
            return `http://${host}:${port}`;
        }

        getClient() {
            const cfg = this.getApiConfig();
            const baseUrl = this.getBaseUrlFromConfig(cfg);
            const key = (cfg?.aiApiKey || '').trim();
            if (!baseUrl) throw new Error('AI服务未配置：请在API配置中填写服务器地址与端口');

            if (!this._client || this._lastBaseUrl !== baseUrl || this._lastKey !== key) {
                this._client = new window.HttpAiClient(baseUrl, key);
                this._lastBaseUrl = baseUrl;
                this._lastKey = key;
            }
            return this._client;
        }
    }

    window.AiClientFactory = new AiClientFactory();
})();


