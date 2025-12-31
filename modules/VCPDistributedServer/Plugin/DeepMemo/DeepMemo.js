const fs = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');
const { Document } = require('flexsearch');
const jieba = require('node-jieba');
const cheerio = require('cheerio');
const axios = require('axios');

// --- 主逻辑 ---
async function main() {
    try {
        const input = await readStdin();
        const args = parseToolArgs(input);

        // 1. 加载配置
        const config = await loadConfig();
        const { VchatDataURL, MaxMemoTokens } = config;

        // 2. 获取请求信息
        const maidName = args.maid;
        if (!maidName) {
            throw new Error("请求中缺少 'maid' 参数。");
        }
        const rawKeywords = args.keyword || '';
        // 该正则表达式可以匹配被引号包裹的短语（如 "hello world"）以及未被包裹的单个词语
        const keywordMatches = rawKeywords.match(/"[^"]+"|'[^']+'|[^,，\s]+/g) || [];
        let keywords = keywordMatches.map(kw => {
            // 移除关键词首尾可能存在的引号
            return kw.replace(/^["']|["']$/g, '').trim();
        }).filter(Boolean); // 过滤掉空字符串
        if (keywords.length === 0) {
            throw new Error("请求中缺少 'keyword' 参数。");
        }
        
        // 4. 过滤屏蔽词
        if (config.BlockedKeywords && config.BlockedKeywords.length > 0) {
            const blockedKeywordsSet = new Set(config.BlockedKeywords);
            keywords = keywords.filter(kw => !blockedKeywordsSet.has(kw));
        }

        if (keywords.length === 0) {
            throw new Error("关键词均被屏蔽，无有效搜索词。");
        }

        let windowSize = parseInt(args.window_size || '3', 10);
        if (windowSize < 1) {
            windowSize = 1;
        }

        // 3. 查找Agent信息
        const agentInfo = await findAgentInfo(VchatDataURL, maidName);
        if (!agentInfo) {
            throw new Error(`未找到名为 "${maidName}" 的Agent。`);
        }
        
        const userName = await findUserName(VchatDataURL);

        // 4. 搜索聊天记录
        let memories = await searchHistories(VchatDataURL, agentInfo.uuid, keywords, windowSize, userName, agentInfo.name);

        // 4.5. 如果启用了Rerank，则进行重排
        if (config.RerankSearch && memories.length > 0) {
            try {
                console.error(`[DEBUG] Starting rerank for ${memories.length} memories...`);
                memories = await rerankMemories(memories, keywords.join(' '), config);
                console.error(`[DEBUG] Rerank completed. Got ${memories.length} memories back.`);
            } catch (rerankError) {
                console.error(JSON.stringify({ status: "error", error: `[DeepMemo] Rerank failed: ${rerankError.message}` }));
                // Rerank失败时，我们选择继续使用原始结果而不是中断流程
            }
        }

        // 5. 格式化并输出结果
        let output = memories.join('\n\n');
        if (output.length > MaxMemoTokens) {
            output = output.substring(0, MaxMemoTokens) + "\n... [内容过长，已被截断]";
        }
        
        if (!output.trim()) {
             output = `[DeepMemo] 未找到与关键词“${keywords.join(', ')}”相关的回忆。`;
        }

        // 成功时，直接将结果字符串输出到 stdout
        // 成功时，输出包含状态和结果的JSON对象
        //console.log(JSON.stringify({ status: "success", result: output }));

    } catch (error) {
        // 失败时，将JSON错误信息输出到 stderr，并以非零状态码退出
        console.error(JSON.stringify({ status: "error", error: `[DeepMemo] ${error.message}` }));
        process.exit(1);
    }
}

// --- 辅助函数 ---

function readStdin() {
    return new Promise((resolve) => {
        let data = '';
        process.stdin.on('data', chunk => data += chunk);
        process.stdin.on('end', () => resolve(data));
    });
}

function parseToolArgs(input) {
    let args;
    try {
        // VCP服务器通过stdin传递的是一个JSON字符串
        args = JSON.parse(input);
    } catch (e) {
        // 将错误输出到 stderr
        console.error(JSON.stringify({ status: "error", error: `[DeepMemo] 无效的输入格式，无法解析JSON: ${input}` }));
        process.exit(1);
    }

    // 兼容 keyword, key_word, KeyWord
    if (args.key_word) {
        args.keyword = args.key_word;
        delete args.key_word;
    }
    if (args.KeyWord) {
        args.keyword = args.KeyWord;
        delete args.KeyWord;
    }

    // 兼容 window_size, windowsize
    if (args.windowsize) {
        args.window_size = args.windowsize;
        delete args.windowsize;
    }
    
    return args;
}

async function loadConfig() {
    const VchatDataURL = path.join(__dirname, '..', '..', '..', 'AppData');
    const configPath = path.join(__dirname, 'config.env');
    try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        const config = dotenv.parse(configContent);

        if (!config.MaxMemoTokens) {
            throw new Error("config.env 文件不完整，缺少 MaxMemoTokens。");
        }

        // 加载 Rerank 配置
        const RerankSearch = config.RerankSearch ? config.RerankSearch.toLowerCase() === 'true' : false;

        return {
            VchatDataURL: VchatDataURL,
            MaxMemoTokens: parseInt(config.MaxMemoTokens, 10),
            RerankSearch: RerankSearch,
            RerankUrl: config.RerankUrl || '',
            RerankApi: config.RerankApi || '',
            RerankModel: config.RerankModel || '',
            RerankMaxTokensPerBatch: parseInt(config.RerankMaxTokensPerBatch, 10) || 30000,
            RerankTopN: parseInt(config.RerankTopN, 10) || 5,
            BlockedKeywords: (config.BlockedKeywords || '').split(',').map(kw => kw.trim()).filter(Boolean)
        };
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`配置文件 config.env 未找到。`);
        }
        throw new Error(`无法加载或解析 config.env 文件: ${error.message}`);
    }
}

async function findAgentInfo(vchatPath, maidName) {
    const agentsDir = path.join(vchatPath, 'Agents');
    try {
        const agentFolders = await fs.readdir(agentsDir);
        for (const folder of agentFolders) {
            const configPath = path.join(agentsDir, folder, 'config.json');
            try {
                const content = await fs.readFile(configPath, 'utf-8');
                const config = JSON.parse(content);
                if (config.name.includes(maidName)) {
                    return { name: config.name, uuid: folder };
                }
            } catch (e) {
                // 忽略无效的config.json文件
            }
        }
        return null;
    } catch (error) {
        throw new Error("无法读取 Agents 目录。");
    }
}

async function findUserName(vchatPath) {
    const settingsPath = path.join(vchatPath, 'settings.json');
    try {
        const content = await fs.readFile(settingsPath, 'utf-8');
        const settings = JSON.parse(content);
        return settings.userName || '主人';
    } catch (error) {
        return '主人'; // Fallback
    }
}

async function searchHistories(vchatPath, agentUuid, keywords, windowSize, userName, agentName) {
    const topicsDir = path.join(vchatPath, 'UserData', agentUuid, 'topics');
    let allMemories = [];
    let memoryIndex = 1; // 为回忆片段添加索引

    try {
        const topicFolders = await fs.readdir(topicsDir);

        // 1. 获取所有 history.json 的路径及其最后修改时间
        let historyFiles = [];
        for (const topic of topicFolders) {
            const historyPath = path.join(topicsDir, topic, 'history.json');
            try {
                const stats = await fs.stat(historyPath);
                historyFiles.push({ path: historyPath, mtime: stats.mtime });
            } catch (e) {
                // 忽略无法获取状态的文件
            }
        }

        // 2. 按修改时间降序排序
        historyFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

        // 3. 排除最新的一个文件进行搜索
        const filesToSearch = historyFiles.slice(1);

        // 4. 遍历剩余的文件进行模糊搜索和去重
        for (const fileInfo of filesToSearch) {
            try {
                const content = await fs.readFile(fileInfo.path, 'utf-8');
                const rawData = JSON.parse(content);
                let history;

                // 兼容新版（直接是数组）和旧版（对象内含messages数组）的聊天记录格式
                if (Array.isArray(rawData)) {
                    history = rawData; // 新版格式
                } else if (rawData && Array.isArray(rawData.messages)) {
                    history = rawData.messages; // 兼容可能存在的旧版格式
                } else {
                    history = []; // 未知或无效格式，跳过
                }

                history = history.filter(entry => entry.content && typeof entry.content === 'string');

                if (history.length === 0) continue;

                // A. 使用 flexsearch 进行高性能相关性搜索
                // 1. 创建搜索索引实例，并配置为按空格分词
                const index = new Document({
                    document: {
                        id: "id",
                        index: "content"
                    },
                    // 采用jieba进行中文分词
                    tokenize: function(str) {
                        const tokens = jieba.cut(str);
                        // 确保返回的是字符串数组
                        return Array.isArray(tokens) ? tokens : Array.from(tokens);
                    }
                });

                // 2. 将所有历史记录添加到索引中
                history.forEach((entry, i) => {
                    const $ = cheerio.load(entry.content);
                    const cleanContent = $.text().trim();
                    if (cleanContent) {
                        index.add({ id: i, content: cleanContent });
                    }
                });

                // 3. 对每个关键词分别搜索，然后合并结果
                console.error(`[DEBUG] Searching keywords: ${keywords.join(', ')}`);
                let matchedIndices = new Map(); // 使用 Map 存储索引及其匹配的关键词
                let rawResults = []; // 用于调试

                for (const keyword of keywords) {
                    // 对每个关键词进行搜索
                    const results = index.search(keyword, {
                        enrich: true,
                        limit: 100,  // 增加结果数量限制
                        suggest: true // 开启建议功能，处理轻微的变体
                    });
                    rawResults.push({keyword, results});
                    
                    // 正确解析 FlexSearch Document 的返回结果
                    if (results && results.length > 0) {
                        for (const fieldResult of results) {
                            // fieldResult 格式: { field: "content", result: [...] }
                            if (fieldResult.field === "content" && fieldResult.result) {
                                fieldResult.result.forEach(id => {
                                    if (!matchedIndices.has(id)) {
                                        matchedIndices.set(id, new Set());
                                    }
                                    matchedIndices.get(id).add(keyword);
                                });
                            }
                        }
                    }
                }
                console.error(`[DEBUG] Raw results:`, JSON.stringify(rawResults, null, 2));


                // 如果还是没有结果，尝试另一种解析方式
                if (matchedIndices.size === 0) {
                    // 尝试不用 enrich 选项
                    for (const keyword of keywords) {
                        const simpleResults = index.search(keyword);
                        if (simpleResults && simpleResults.length > 0) {
                            if (typeof simpleResults[0] === 'object' && simpleResults[0].field) {
                                for (const fieldResult of simpleResults) {
                                    if (fieldResult.result) {
                                        fieldResult.result.forEach(id => {
                                            if (!matchedIndices.has(id)) {
                                                matchedIndices.set(id, new Set());
                                            }
                                            matchedIndices.get(id).add(keyword);
                                        });
                                    }
                                }
                            } else { // Fallback for flat array of IDs
                                simpleResults.forEach(id => {
                                    if (typeof id === 'number') {
                                        if (!matchedIndices.has(id)) {
                                            matchedIndices.set(id, new Set());
                                        }
                                        matchedIndices.get(id).add(keyword);
                                    }
                                });
                            }
                        }
                    }
                }
                
                // 如果 FlexSearch 仍然没有找到结果，使用简单的字符串匹配作为后备
                if (matchedIndices.size === 0) {
                    history.forEach((entry, i) => {
                        const $ = cheerio.load(entry.content);
                        const cleanContent = $.text().toLowerCase();
                        
                        for (const keyword of keywords) {
                            if (cleanContent.includes(keyword.toLowerCase())) {
                                if (!matchedIndices.has(i)) {
                                    matchedIndices.set(i, new Set());
                                }
                                matchedIndices.get(i).add(keyword);
                            }
                        }
                    });
                }

                console.error(`[DEBUG] Search results count: ${matchedIndices.size}`);
                
                const sortedEntries = Array.from(matchedIndices.entries());

                // 根据匹配的关键词数量（相关性）降序排序，如果数量相同则按原始索引（时间）升序排序
                sortedEntries.sort((a, b) => {
                    const scoreA = a[1].size;
                    const scoreB = b[1].size;
                    if (scoreA !== scoreB) {
                        return scoreB - scoreA;
                    }
                    return a[0] - b[0]; // a[0] 和 b[0] 是原始索引
                });

                const sortedIndices = sortedEntries.map(entry => entry[0]);

                // B. 基于排序后的索引构建不重叠的回忆片段
                for (let i = 0; i < sortedIndices.length; i++) {
                    const matchIndex = sortedIndices[i];
                    
                    const start = Math.max(0, matchIndex - windowSize);
                    const end = Math.min(history.length, matchIndex + windowSize + 1);
                    
                    const contextSlice = history.slice(start, end);
                    const formattedMemory = formatMemory(contextSlice, userName, agentName, memoryIndex);
                    
                    if (formattedMemory) {
                        allMemories.push(formattedMemory);
                        memoryIndex++;
                    }

                    // C. 跳过已经被当前回忆片段覆盖的索引，实现去重
                    while (i + 1 < sortedIndices.length && sortedIndices[i + 1] < end) {
                        i++;
                    }
                }
            } catch (e) {
                // 忽略无法读取或解析的单个history.json
            }
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw new Error("读取用户聊天记录时出错。");
        }
        // 如果topics目录不存在，则返回空数组
    }
    return allMemories;
}

// --- Rerank 函数 ---
async function rerankMemories(memories, query, config) {
    if (!config.RerankUrl) {
        console.error("[DEBUG] Rerank URL is not configured. Skipping rerank.");
        return memories;
    }

    try {
        const finalMemories = await recursiveRerank(memories, query, config, 1);
        console.error(`[DEBUG] Recursive rerank completed. Returning top ${finalMemories.length} memories.`);
        return finalMemories.slice(0, config.RerankTopN);
    } catch (error) {
        let errorMessage = error.message;
        if (error.response) {
            errorMessage += ` - Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`;
        }
        console.error(`[DEBUG] Rerank failed during recursive process: ${errorMessage}`);
        throw new Error(`Rerank failed: ${errorMessage}`);
    }
}

async function recursiveRerank(documents, query, config, level = 1, maxLevel = 5) {
    console.error(`[DEBUG] --- Starting Rerank Level ${level} with ${documents.length} documents ---`);

    // 1. 添加递归深度限制
    if (level > maxLevel) {
        console.error(`[WARNING] Max recursion level ${maxLevel} reached. Performing final rerank on a subset.`);
        const finalRanked = await performRerankRequest(documents.slice(0, 50), query, config); // Fallback to rerank a small subset
        return finalRanked.map(item => item.document);
    }

    // 2. 如果文档数量已经足够少，直接进行最终排序
    if (documents.length <= (config.RerankTopN * 1.5) || documents.length <= 10) {
        console.error(`[DEBUG] Document count (${documents.length}) is small enough. Performing final rerank.`);
        const finalRanked = await performRerankRequest(documents, query, config);
        return finalRanked.map(item => item.document);
    }

    // 3. 改进的分批策略
    const maxBatchSize = config.RerankMaxTokensPerBatch;
    const batches = [];
    let currentBatch = [];
    let currentTokens = 0;

    for (let doc of documents) {
        let docToAdd = doc;
        let docLength = doc.length;

        // 对超长文档进行智能截断 (保留首尾)
        if (docLength > maxBatchSize * 0.8) {
            console.error(`[DEBUG] Document with length ${docLength} is too long. Applying smart truncation.`);
            const keepLength = Math.floor(maxBatchSize / 4);
            docToAdd = doc.substring(0, keepLength) +
                "\n...[内容过长，中间已截断]...\n" +
                doc.substring(doc.length - keepLength);
            docLength = docToAdd.length;
        }

        if (currentBatch.length > 0 &&
            (currentTokens + docLength > maxBatchSize || currentBatch.length >= 15)) {
            batches.push(currentBatch);
            currentBatch = [];
            currentTokens = 0;
        }

        currentBatch.push(docToAdd);
        currentTokens += docLength;
    }
    if (currentBatch.length > 0) {
        batches.push(currentBatch);
    }

    // 4. 防止无效递归 - 如果批次数过多，切换到锦标赛排序
    if (batches.length >= documents.length * 0.8 && documents.length > 1) {
        console.error(`[WARNING] Too many batches (${batches.length}) for ${documents.length} documents. Switching to tournament sort.`);
        return tournamentSort(documents, query, config);
    }
    
    if (batches.length <= 1 && level > 1) {
         console.error(`[DEBUG] Level ${level}: Only one batch remains. Performing final rerank.`);
         const finalRanked = await performRerankRequest(documents, query, config);
         return finalRanked.map(item => item.document);
    }


    // 5. 继续原有的递归逻辑...
    const rerankPromises = batches.map((batch, index) => {
        console.error(`[DEBUG] Level ${level}: Sending batch ${index + 1}/${batches.length} with ${batch.length} docs for rerank.`);
        return performRerankRequest(batch, query, config);
    });

    const responses = await Promise.all(rerankPromises);

    // 6. 更激进的筛选策略
    let candidatesForNextRound = [];
    // 每轮至少减少一半的候选者，但不能少于最终需要的数量
    const targetTotal = Math.max(config.RerankTopN + 2, Math.ceil(documents.length / 2));
    const topKPerBatch = Math.max(1, Math.ceil(targetTotal / batches.length));


    responses.forEach((rankedBatch, batchIndex) => {
        const topK = rankedBatch.slice(0, topKPerBatch);
        candidatesForNextRound.push(...topK.map(item => item.document));
    });

    // 7. 确保文档数量真的在减少
    if (candidatesForNextRound.length >= documents.length && documents.length > 0) {
        console.error(`[WARNING] Document reduction failed (${documents.length} -> ${candidatesForNextRound.length}). Forcing reduction.`);
        candidatesForNextRound = candidatesForNextRound.slice(0, documents.length - 1);
    }
    
    if (candidatesForNextRound.length === 0 && documents.length > 0) {
        console.error(`[WARNING] All candidates were eliminated. Returning a subset of original documents.`);
        return documents.slice(0, config.RerankTopN);
    }


    return recursiveRerank(candidatesForNextRound, query, config, level + 1, maxLevel);
}

// 新增：锦标赛排序，作为后备方案
async function tournamentSort(documents, query, config) {
    console.error(`[DEBUG] --- Starting Tournament Sort with ${documents.length} documents ---`);
    let champions = [...documents];

    while (champions.length > 1) {
        let nextRound = [];
        // 两两配对进行 rerank
        for (let i = 0; i < champions.length; i += 2) {
            if (i + 1 < champions.length) {
                const pair = [champions[i], champions[i + 1]];
                const rankedPair = await performRerankRequest(pair, query, config);
                if (rankedPair.length > 0) {
                    nextRound.push(rankedPair[0].document); // 胜者进入下一轮
                } else {
                    nextRound.push(champions[i]); // 如果 rerank 失败，保留第一个
                }
            } else {
                nextRound.push(champions[i]); // 轮空，直接晋级
            }
        }
        champions = nextRound;
        console.error(`[DEBUG] Tournament: ${champions.length} champions advance to the next round.`);
    }

    // 对最终的少数胜者进行最后一次排名
    const finalChampions = await performRerankRequest(champions, query, config);
    return finalChampions.map(item => item.document);
}

async function performRerankRequest(documents, query, config) {
    if (!documents || documents.length === 0) {
        return [];
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.RerankApi}`
    };
    const baseUrl = config.RerankUrl.endsWith('/') ? config.RerankUrl : config.RerankUrl + '/';
    const rerankEndpoint = baseUrl + 'v1/rerank';

    const data = {
        model: config.RerankModel,
        query: query,
        documents: documents,
        return_documents: false,
        top_n: documents.length
    };

    try {
        const response = await axios.post(rerankEndpoint, data, { headers: headers, timeout: 30000 });
        if (response.data && Array.isArray(response.data.results)) {
            return response.data.results.map(result => {
                if (typeof result.relevance_score === 'undefined') {
                    throw new Error("Rerank API response is missing 'relevance_score'.");
                }
                return {
                    document: documents[result.index],
                    score: result.relevance_score
                };
            });
        }
        console.error(`[DEBUG] Rerank API response is not in the expected format:`, response.data);
        return [];
    } catch (error) {
        console.error(`[DEBUG] Rerank API request failed: ${error.message}`);
        // 在单次请求失败时，可以选择返回空数组而不是让整个流程失败
        return [];
    }
}

function formatMemory(slice, userName, agentName, memoryIndex) {
    let memoryString = "";
    slice.forEach(entry => {
        if (entry.role === 'user' || entry.role === 'assistant') {
            const name = entry.role === 'user' ? userName : agentName;
            // 使用 cheerio 精准提取纯文本
            const $ = cheerio.load(entry.content);
            const cleanContent = $.text().trim();
            
            if (cleanContent) {
                memoryString += `${name}: ${cleanContent}\n`;
            }
        }
    });
    return memoryString.trim() ? `[回忆片段${memoryIndex}]:\n${memoryString.trim()}` : null;
}

main();
