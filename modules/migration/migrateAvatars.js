const fs = require('fs-extra');
const path = require('path');

async function getAgentName(agentDir, agentId) {
    const configPath = path.join(agentDir, 'config.json');
    try {
        if (await fs.pathExists(configPath)) {
            const config = await fs.readJson(configPath);
            return config.name || agentId;
        }
    } catch (e) {
        // Ignore read errors, fall back to agentId
    }
    return agentId;
}

async function findAgentAvatar(agentDir, allowedExtensions) {
    for (const ext of allowedExtensions) {
        const avatarPath = path.join(agentDir, `avatar${ext}`);
        if (await fs.pathExists(avatarPath)) {
            return { path: avatarPath, ext };
        }
    }
    return null;
}

async function migrateAvatars(agentDir, userDataDir) {
    const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

    if (!agentDir || !userDataDir) {
        console.error("Usage: node migration/migrateAvatars.js <AGENT_DIR> <USER_DATA_DIR>");
        console.error("Please provide the absolute paths for AGENT_DIR (e.g., .../VCPChat/Agents) and USER_DATA_DIR (e.g., .../VCPChat/UserData).");
        return;
    }

    // Calculate the centralized avatar directory path based on the logic in agentHandlers.js
    // Assuming path.dirname(USER_DATA_DIR) is the root directory containing AppData/UserData
    const APP_DATA_ROOT = path.dirname(userDataDir);
    const AVATAR_IMAGE_DIR = path.join(APP_DATA_ROOT, 'avatarimage');

    //console.log(`Starting avatar migration...`);
    //console.log(`Source Agent Directory: ${agentDir}`);
    //console.log(`Source User Data Directory: ${userDataDir}`);
    //console.log(`Target Avatar Directory: ${AVATAR_IMAGE_DIR}`);

    if (!await fs.pathExists(agentDir)) {
        console.error(`Error: Agent directory not found at ${agentDir}`);
        return;
    }

    await fs.ensureDir(AVATAR_IMAGE_DIR);
    //console.log(`Ensured target directory exists: ${AVATAR_IMAGE_DIR}`);

    const agentFolders = await fs.readdir(agentDir);
    let migratedCount = 0;

    for (const folderName of agentFolders) {
        const currentAgentDir = path.join(agentDir, folderName);
        const stat = await fs.stat(currentAgentDir);

        if (stat.isDirectory()) {
            const agentId = folderName;
            const agentName = await getAgentName(currentAgentDir, agentId);
            const avatarInfo = await findAgentAvatar(currentAgentDir, ALLOWED_EXTENSIONS);

            if (avatarInfo) {
                const { path: sourcePath, ext } = avatarInfo;
                const targetFileName = `${agentName}${ext}`;
                const targetPath = path.join(AVATAR_IMAGE_DIR, targetFileName);

                // 1. Clean up old centralized files for this agent name (different extensions)
                for (const allowedExt of ALLOWED_EXTENSIONS) {
                    const oldCentralizedPath = path.join(AVATAR_IMAGE_DIR, `${agentName}${allowedExt}`);
                    if (oldCentralizedPath !== targetPath && await fs.pathExists(oldCentralizedPath)) {
                        await fs.remove(oldCentralizedPath);
                    }
                }

                // 2. Copy the new avatar
                await fs.copy(sourcePath, targetPath, { overwrite: true });
                //console.log(`Migrated avatar for Agent '${agentName}' (${agentId}) to ${targetFileName}`);
                migratedCount++;
            }
        }
    }

    //console.log(`\nMigration complete. Total avatars migrated: ${migratedCount}`);
}

const [,, agentDir, userDataDir] = process.argv;
migrateAvatars(agentDir, userDataDir).catch(console.error);