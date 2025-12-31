// music-controller.js
// This script acts as a simple data pipe and validator.
// It receives a JSON object from stdin, validates it, and prints it to stdout.

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
        
        // The input from the plugin manager is already a JSON string of arguments
        const args = JSON.parse(inputBuffer);

        // The core logic is just to format the command for the main process.
        // Be flexible with parameter names from the AI.
        // Accept 'songName' (camelCase), 'songname' (lowercase), or 'song_name' (snake_case).
        const songName = args.songName || args.songname || args.song_name;

        // The 'command' field is now optional. We only need to check for the song name.
        if (!songName) {
            throw new Error("The 'songName', 'songname', or 'song_name' parameter is required.");
        }

        // Format the payload for the main process.
        // The main process's music handler still uses 'play' and 'target'.
        const commandPayload = {
            command: 'play', // Hardcode to 'play' for the internal handler
            target: songName  // Pass the songName as the target
        };

        // Output the final command payload as a JSON string to stdout.
        // This will be captured by the PluginManager.
        //console.log(JSON.stringify(commandPayload));

    } catch (error) {
        // Write the actual error message to the standard error stream (stderr).
        // This is the conventional way for command-line tools to report errors.
        console.error(error.message);
        process.exit(1); // Exit with a non-zero code to indicate failure.
    }
});