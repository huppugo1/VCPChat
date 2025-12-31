/**
 * Data Consistency Checker Module
 * Checks and fixes inconsistencies between chat history files and agent topic lists
 */

class ConsistencyChecker {
    constructor(appDataPath, apiHandlers) {
        this.appDataPath = appDataPath;
        this.api = apiHandlers;
        this.issues = [];
    }

    /**
     * Perform a full consistency check
     * @param {Object} agents - All agents data
     * @param {Object} groups - All groups data
     * @returns {Object} Check results with issues found
     */
    async performCheck(agents, groups) {
        this.issues = [];
        
        // Check agents
        for (const [agentId, agentData] of Object.entries(agents)) {
            await this.checkItem(agentId, agentData, 'agent');
        }
        
        // Check groups
        for (const [groupId, groupData] of Object.entries(groups)) {
            await this.checkItem(groupId, groupData, 'group');
        }
        
        return {
            totalIssues: this.issues.length,
            issues: this.issues
        };
    }

    /**
     * Check a single agent or group for consistency
     */
    async checkItem(itemId, itemData, itemType) {
        const userDataPath = `${this.appDataPath}UserData/${itemId}/topics`;
        
        try {
            // Get actual topic directories from filesystem
            const actualTopicDirs = await this.api.listDir(userDataPath);
            
            if (!actualTopicDirs || actualTopicDirs.length === 0) {
                // No topics directory exists, but config might have topics
                if (itemData.topics && itemData.topics.length > 0) {
                    this.issues.push({
                        itemId,
                        itemName: itemData.name,
                        itemType,
                        type: 'missing_all_files',
                        message: `Config has ${itemData.topics.length} topics but no topic directory exists`,
                        configTopics: itemData.topics,
                        fileTopics: []
                    });
                }
                return;
            }
            
            // Get topics from config
            const configTopics = itemData.topics || [];
            const configTopicIds = new Set(configTopics.map(t => t.id));
            const fileTopicIds = new Set(actualTopicDirs);
            
            // Find topics in config but not in filesystem
            const missingFiles = configTopics.filter(t => !fileTopicIds.has(t.id));
            if (missingFiles.length > 0) {
                this.issues.push({
                    itemId,
                    itemName: itemData.name,
                    itemType,
                    type: 'missing_files',
                    message: `${missingFiles.length} topic(s) in config but missing files`,
                    missingTopics: missingFiles
                });
            }
            
            // Find topics in filesystem but not in config
            const orphanedFiles = actualTopicDirs.filter(dirName => !configTopicIds.has(dirName));
            if (orphanedFiles.length > 0) {
                // Try to read history files to get topic names
                const orphanedTopicsWithData = await Promise.all(
                    orphanedFiles.map(async (topicId) => {
                        const historyPath = `${userDataPath}/${topicId}/history.json`;
                        try {
                            const historyStr = await this.api.readFile(historyPath);
                            if (historyStr) {
                                const history = JSON.parse(historyStr);
                                // Try to infer topic name from first message or use ID
                                return {
                                    id: topicId,
                                    name: `Recovered: ${topicId}`,
                                    createdAt: history[0]?.timestamp || Date.now(),
                                    messageCount: history.length
                                };
                            }
                        } catch (e) {
                            console.warn(`Could not read history for orphaned topic ${topicId}`);
                        }
                        return {
                            id: topicId,
                            name: `Unknown: ${topicId}`,
                            createdAt: Date.now(),
                            messageCount: 0
                        };
                    })
                );
                
                this.issues.push({
                    itemId,
                    itemName: itemData.name,
                    itemType,
                    type: 'orphaned_files',
                    message: `${orphanedFiles.length} topic file(s) exist but not in config`,
                    orphanedTopics: orphanedTopicsWithData
                });
            }
            
        } catch (error) {
            console.error(`Error checking consistency for ${itemType} ${itemId}:`, error);
            this.issues.push({
                itemId,
                itemName: itemData.name,
                itemType,
                type: 'check_error',
                message: `Error during check: ${error.message}`,
                error: error.message
            });
        }
    }

    /**
     * Fix issues by updating the config file's topics list
     * This only modifies the topics array, preserving all other config data
     */
    async fixIssues(selectedIssues, fixOptions) {
        const results = [];
        
        // Group issues by item
        const issuesByItem = {};
        for (const issue of selectedIssues) {
            const key = `${issue.itemType}_${issue.itemId}`;
            if (!issuesByItem[key]) {
                issuesByItem[key] = {
                    itemId: issue.itemId,
                    itemType: issue.itemType,
                    issues: []
                };
            }
            issuesByItem[key].issues.push(issue);
        }
        
        // Fix each item
        for (const [key, itemIssues] of Object.entries(issuesByItem)) {
            try {
                const result = await this.fixItemIssues(itemIssues, fixOptions);
                results.push(result);
            } catch (error) {
                results.push({
                    itemId: itemIssues.itemId,
                    itemType: itemIssues.itemType,
                    success: false,
                    error: error.message
                });
            }
        }
        
        return results;
    }

    /**
     * Fix issues for a single item by safely updating only the topics array
     */
    async fixItemIssues(itemIssues, fixOptions) {
        const { itemId, itemType, issues } = itemIssues;
        const configPath = itemType === 'agent'
            ? `${this.appDataPath}Agents/${itemId}/config.json`
            : `${this.appDataPath}AgentGroups/${itemId}/config.json`;
        
        // Read current config
        const configStr = await this.api.readFile(configPath);
        if (!configStr) {
            throw new Error('Could not read config file');
        }
        
        const config = JSON.parse(configStr);
        let currentTopics = config.topics || [];
        let modified = false;
        
        // Process each issue
        for (const issue of issues) {
            if (issue.type === 'orphaned_files' && fixOptions.addOrphaned) {
                // Add orphaned topics to config
                for (const orphanedTopic of issue.orphanedTopics) {
                    // Check if not already in list
                    if (!currentTopics.find(t => t.id === orphanedTopic.id)) {
                        currentTopics.push({
                            id: orphanedTopic.id,
                            name: orphanedTopic.name,
                            createdAt: orphanedTopic.createdAt
                        });
                        modified = true;
                    }
                }
            }
            
            if (issue.type === 'missing_files' && fixOptions.removeMissing) {
                // Remove topics that don't have files
                const missingIds = new Set(issue.missingTopics.map(t => t.id));
                currentTopics = currentTopics.filter(t => !missingIds.has(t.id));
                modified = true;
            }
        }
        
        if (modified) {
            // Safely update only the topics array
            config.topics = currentTopics;
            
            // Write back to file
            const result = await this.api.writeFile(
                configPath,
                JSON.stringify(config, null, 2)
            );
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to write config');
            }
            
            return {
                itemId,
                itemType,
                success: true,
                modified: true,
                topicsCount: currentTopics.length
            };
        }
        
        return {
            itemId,
            itemType,
            success: true,
            modified: false,
            message: 'No changes needed'
        };
    }

    /**
     * Generate a human-readable report
     */
    generateReport(checkResults) {
        if (checkResults.totalIssues === 0) {
            return {
                summary: '✓ No consistency issues found',
                details: 'All agent and group topic lists match their chat history files.'
            };
        }
        
        const report = {
            summary: `⚠ Found ${checkResults.totalIssues} consistency issue(s)`,
            details: []
        };
        
        for (const issue of checkResults.issues) {
            let detail = `\n[${issue.itemType.toUpperCase()}] ${issue.itemName} (${issue.itemId}):\n`;
            detail += `  ${issue.message}\n`;
            
            if (issue.type === 'orphaned_files') {
                detail += `  Orphaned topics: ${issue.orphanedTopics.map(t => t.id).join(', ')}\n`;
            } else if (issue.type === 'missing_files') {
                detail += `  Missing topics: ${issue.missingTopics.map(t => t.id).join(', ')}\n`;
            }
            
            report.details.push(detail);
        }
        
        return report;
    }
}

// Export for use in script.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConsistencyChecker;
}