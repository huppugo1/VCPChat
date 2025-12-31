const express = require('express');
const path = require('path');
const fs = require('fs');

function registerRoutes(app, pluginConfig, projectBasePath) {
    const debugMode = pluginConfig.DebugMode || false;
    const imageKey = pluginConfig.DIST_IMAGE_KEY;
    const imagePath = pluginConfig.DIST_IMAGE_PATH;

    if (!imageKey || !imagePath) {
        console.error('[DistImageServer] 错误: config.env 中缺少 DIST_IMAGE_KEY 或 DIST_IMAGE_PATH。');
        return;
    }

    if (!fs.existsSync(imagePath)) {
        console.error(`[DistImageServer] 错误: 配置的路径不存在: ${imagePath}`);
        return;
    }

    // 使用正则表达式以兼容旧版 path-to-regexp
    app.get(/\/pw=([^\/]+)\/files\/(.*)/, (req, res) => {
        const requestKey = req.params[0];
        const requestedFile = req.params[1];

        // 1. 认证
        if (requestKey !== imageKey) {
            return res.status(401).send('Unauthorized');
        }

        // 2. 获取文件名
        if (!requestedFile) {
            return res.status(400).send('Bad Request: Missing filename.');
        }

        // 3. 构建并验证文件路径
        const resolvedBasePath = path.resolve(imagePath);
        const fullFilePath = path.resolve(path.join(resolvedBasePath, requestedFile));

        // 安全检查，防止路径遍历
        if (!fullFilePath.startsWith(resolvedBasePath)) {
             return res.status(403).send('Forbidden');
        }
        
        // 4. 使用 res.sendFile 发送文件
        res.sendFile(fullFilePath, (err) => {
            if (err) {
                if (!res.headersSent) {
                    res.status(404).send('File not found');
                }
            }
        });
    });

    //console.log(`[DistImageServer] 分布式图床服务已启动。`);
    //console.log(`[DistImageServer] 托管目录: ${imagePath}`);
    // 更新日志中的访问路径格式
    //console.log(`[DistImageServer] 访问路径格式: /pw=<密钥>/files/<文件名>`);
}

module.exports = { registerRoutes };