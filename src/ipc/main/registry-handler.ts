import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { app } from "electron";

// Helper function to execute the .reg file
function executeRegFile(regFilePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        // Use regedit.exe with the /s (silent) switch to import the keys
        const command = `regedit.exe /s "${regFilePath}"`;

        exec(command, (error, stdout, stderr) => {
            // Clean up the temporary file immediately after execution
            try {
                fs.unlinkSync(regFilePath);
            } catch (cleanupError) {
                console.warn(
                    `Could not delete temporary file ${regFilePath}:`,
                    cleanupError
                );
            }

            if (error) {
                console.error(
                    `Error executing registry command: ${error.message}`
                );
                // Note: Errors often occur here if regedit.exe is blocked or not found,
                // but usually not for simple imports.
                return reject(error);
            }
            resolve();
        });
    });
}

/**
 * Registers the 'Open with js-notepad' context menu option for all files (*)
 * and specific extensions.
 * @param extensions A comma-separated list of extensions (e.g., ".txt,.log").
 * NOTE: This implementation focuses on the simple '*' entry.
 */
export async function registerOpenWithOption(
    extensions?: string
): Promise<void> {
    const regFileName = "register.reg";
    // Path to your main application executable
    const exePath = process.execPath;
    // The secure temporary directory for the .reg file
    const appFolder = app.getPath("userData");
    const regFilePath = path.join(appFolder, regFileName);

    // Escape backslashes in the executable path for the .reg file format.
    // Replace single backslashes with double backslashes (\\)
    const escapedExePath = exePath.replace(/\\/g, "\\\\");

    // Registry keys are added under HKEY_CURRENT_USER to avoid requiring Admin privileges.
    // The * key applies the menu item to ALL files.
    const regContent = `Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\js-notepad]
@="Open with js-notepad"
"Icon"="${escapedExePath},0"

[HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\js-notepad\\command]
@="\\"${escapedExePath}\\" \\"%1\\""
`;

    try {
        // 1. Write the .reg file to the user data folder
        fs.writeFileSync(regFilePath, regContent, "utf8");

        // 2. Execute the .reg file
        await executeRegFile(regFilePath);

        console.log(
            "Registry: 'Open with js-notepad' registered successfully."
        );

        // NOTE: While you included extensions parameter, the most straightforward and common
        // approach for custom editors is to register on '*' (all files) for the context menu.
        // For 'Open With' list, you would need to iterate and add entries under:
        // HKEY_CURRENT_USER\Software\Classes\.ext\OpenWithList\YourApp.exe
    } catch (error) {
        console.error("Failed to register 'Open with js-notepad':", error);
        throw new Error("Failed to register context menu option.");
    }
}

// ---

/**
 * Unregisters the 'Open with js-notepad' context menu option by deleting the registry key.
 */
export async function unregisterOpenWithOption(): Promise<void> {
    const regFileName = "unregister.reg";
    const appFolder = app.getPath("userData");
    const regFilePath = path.join(appFolder, regFileName);

    // The hyphen (-) before the key path tells regedit.exe to delete the key
    // and all its subkeys/values.
    const regContent = `Windows Registry Editor Version 5.00

[-HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\js-notepad]
`;

    try {
        // 1. Write the unregister .reg file
        fs.writeFileSync(regFilePath, regContent, "utf8");

        // 2. Execute the .reg file
        await executeRegFile(regFilePath);

        console.log(
            "Registry: 'Open with js-notepad' unregistered successfully."
        );
    } catch (error) {
        console.error("Failed to unregister 'Open with js-notepad':", error);
        throw new Error("Failed to unregister context menu option.");
    }
}
