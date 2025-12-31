// flowlock.js - Node.js Flowlock Plugin
// AI can use this plugin to control the Flowlock module like a human user

let inputBuffer = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
    inputBuffer += chunk;
});

process.stdin.on('end', () => {
    try {
        if (!inputBuffer.trim()) {
            throw new Error('No input received.');
        }
        
        // Parse the input arguments
        const args = JSON.parse(inputBuffer);
        
        // Extract command and parameters
        const command = args.command;
        const agentId = args.agentId || args.agentid || args.agent_id;
        const topicId = args.topicId || args.topicid || args.topic_id;
        const prompt = args.prompt || '';
        const promptSource = args.promptSource || args.prompt_source || args.promptsource || '';
        
        // Validate required parameters based on command
        if (!command) {
            throw new Error("The 'command' parameter is required.");
        }
        
        // Build the command payload for main process
        const commandPayload = {
            command: command,
            agentId: agentId,
            topicId: topicId,
            prompt: prompt,
            promptSource: promptSource
        };
        
        // Additional parameters for new commands
        const target = args.target || '';
        const oldText = args.oldText || args.old_text || args.oldtext || '';
        const newText = args.newText || args.new_text || args.newtext || '';
        
        // Extend command payload
        commandPayload.target = target;
        commandPayload.oldText = oldText;
        commandPayload.newText = newText;
        
        // Validate command-specific requirements
        switch (command) {
            case 'start':
                if (!agentId || !topicId) {
                    throw new Error("The 'start' command requires 'agentId' and 'topicId' parameters.");
                }
                break;
            case 'stop':
                // No additional parameters required
                break;
            case 'promptee':
                if (!prompt) {
                    throw new Error("The 'promptee' command requires a 'prompt' parameter.");
                }
                break;
            case 'prompter':
                if (!promptSource) {
                    throw new Error("The 'prompter' command requires a 'promptSource' parameter.");
                }
                break;
            case 'clear':
                // Clear all prompts in input - no additional parameters required
                break;
            case 'remove':
                if (!target) {
                    throw new Error("The 'remove' command requires a 'target' parameter (text to remove).");
                }
                break;
            case 'edit':
                if (!oldText || !newText) {
                    throw new Error("The 'edit' command requires both 'oldText' and 'newText' parameters.");
                }
                break;
            case 'get':
                // Get current input box content - no additional parameters required
                break;
            case 'status':
                // Get current flowlock status - no additional parameters required
                break;
            default:
                throw new Error(`Unknown command: ${command}`);
        }
        
        // Output the command payload as JSON to stdout
        //console.log(JSON.stringify(commandPayload));
        
    } catch (error) {
        // Write error message to stderr
        console.error(error.message);
        process.exit(1);
    }
});