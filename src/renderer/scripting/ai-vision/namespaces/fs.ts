import type { IAiMember, IAiVisionDescriptor } from "../../../../shared/ai-vision/types";

const FILE_SYSTEM_MEMBERS: readonly IAiMember[] = [
    { name: "read", kind: "method", signature: "read(filePath: string, encoding?: string)", summary: "Read text with auto-detected or specified encoding." },
    { name: "readFile", kind: "method", signature: "readFile(filePath: string, encoding?: string)", summary: "Read text with content and detected encoding." },
    { name: "readBinary", kind: "method", signature: "readBinary(filePath: string)", summary: "Read a file as binary data." },
    { name: "write", kind: "method", signature: "write(filePath: string, content: string, encoding?: string)", summary: "Write text and create parent directories as needed.", caution: "writes and may overwrite the user's file" },
    { name: "append", kind: "method", signature: "append(filePath: string, text: string)", summary: "Append UTF-8 text, creating the file if needed.", caution: "changes the user's file" },
    { name: "writeBinary", kind: "method", signature: "writeBinary(filePath: string, data: Buffer)", summary: "Write binary data and create parent directories as needed.", caution: "writes and may overwrite the user's file" },
    { name: "exists", kind: "method", signature: "exists(filePath: string)", summary: "Check whether a file or directory exists." },
    { name: "delete", kind: "method", signature: "delete(filePath: string)", summary: "Delete a file; no-op when absent.", caution: "deletes the user's file" },
    { name: "rename", kind: "method", signature: "rename(oldPath: string, newPath: string)", summary: "Rename or move a file or directory.", caution: "changes the user's filesystem" },
    { name: "stat", kind: "method", signature: "stat(filePath: string)", summary: "Return file and directory metadata." },
    { name: "copyFile", kind: "method", signature: "copyFile(srcPath: string, destPath: string)", summary: "Copy a file and create parent directories as needed.", caution: "writes the destination file" },
    { name: "listDir", kind: "method", signature: "listDir(dirPath: string, pattern?: string | RegExp)", summary: "List names in a directory, optionally filtered." },
    { name: "mkdir", kind: "method", signature: "mkdir(dirPath: string)", summary: "Create a directory and parents as needed.", caution: "changes the user's filesystem" },
    { name: "listDirWithTypes", kind: "method", signature: "listDirWithTypes(dirPath: string)", summary: "List names with directory flags." },
    { name: "removeDir", kind: "method", signature: "removeDir(dirPath: string, recursive?: boolean)", summary: "Remove a directory.", caution: "deletes a directory; recursive removal deletes its contents" },
    { name: "resolveDataPath", kind: "method", signature: "resolveDataPath(relativePath: string)", summary: "Resolve a relative path in the per-window app-data folder." },
    { name: "resolveCachePath", kind: "method", signature: "resolveCachePath(relativePath: string)", summary: "Resolve a relative path in the per-window cache folder." },
    { name: "commonFolder", kind: "method", signature: "commonFolder(name: string)", summary: "Resolve a standard OS folder." },
    { name: "showOpenDialog", kind: "method", signature: "showOpenDialog(options?: IOpenDialogOptions)", summary: "Show the native Open File dialog.", caution: "blocks for user input" },
    { name: "showSaveDialog", kind: "method", signature: "showSaveDialog(options?: ISaveDialogOptions)", summary: "Show the native Save File dialog.", caution: "blocks for user input" },
    { name: "showFolderDialog", kind: "method", signature: "showFolderDialog(options?: IFolderDialogOptions)", summary: "Show the native Select Folder dialog.", caution: "blocks for user input" },
    { name: "showInExplorer", kind: "method", signature: "showInExplorer(filePath: string)", summary: "Select a path in the OS file explorer.", caution: "opens or focuses an OS window" },
    { name: "showFolder", kind: "method", signature: "showFolder(folderPath: string)", summary: "Open a folder in the OS file explorer.", caution: "opens or focuses an OS window" },
];

export function describeFileSystem(_instance: unknown): IAiVisionDescriptor {
    return {
        kind: "FileSystem",
        summary: "File reads, writes, directories, dialogs, and OS file integration.",
        members: FILE_SYSTEM_MEMBERS,
        help: "Use read/readFile for text, exists/stat for checks, and write/delete only after confirming the target path.",
        summarize: () => ({ kind: "FileSystem" }),
    };
}
