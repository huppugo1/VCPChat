const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

// 监听从主VCP服务器传来的数据
rl.on('line', (line) => {
    try {
        // 解析来自VCPDistributedServer的请求，其中包含了工具调用的参数
        const requestArgs = JSON.parse(line);

        // SuperDice插件的核心逻辑在main.js中通过handleDiceControl处理。
        // 此脚本仅作为stdio管道，将参数直接输出，由VCPDistributedServer捕获。
        // VCPDistributedServer会调用注入的handleDiceControl函数，并等待其返回结果。
        // 这种模式类似于MusicController插件。
        
        // 直接将收到的参数作为JSON字符串写回标准输出
        process.stdout.write(JSON.stringify(requestArgs) + '\n');

    } catch (error) {
        // 如果发生错误，也以JSON格式报告错误
        const errorResult = {
            status: 'error',
            error: `SuperDice plugin failed to process stdio line: ${error.message}`
        };
        process.stdout.write(JSON.stringify(errorResult) + '\n');
    }
});