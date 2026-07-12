import * as monaco from "monaco-editor";
import { libraryService } from "../library-service";
import { settings } from "../settings";

import { fs } from "../fs";
import { fpJoin } from "../../core/utils/file-path";

let extraLibDisposables: monaco.IDisposable[] = [];
let loaded = false;

// =============================================================================
// Public API
// =============================================================================

/** Load library IntelliSense. Idempotent — only runs once. */
export function loadLibraryIntelliSense(): void {
    if (loaded) return;
    loaded = true;

    libraryService.ensureInitialized();
    registerLibraryFiles();
    registerPathCompletionProvider();

    libraryService.state.subscribe(() => {
        disposeExtraLibs();
        registerLibraryFiles();
    });
}

// =============================================================================
// Private
// =============================================================================

async function registerLibraryFiles(): Promise<void> {
    const libraryPath = settings.get("script-library.path");
    if (!libraryPath) return;

    const allFiles = libraryService.allFiles;
    for (const relativePath of allFiles) {
        const absolutePath = fpJoin(libraryPath, relativePath);
        let content: string;
        try {
            content = await fs.read(absolutePath);
        } catch {
            continue;
        }

        const virtualPath = `file:///library/${relativePath}`;

        extraLibDisposables.push(
            monaco.typescript.javascriptDefaults.addExtraLib(
                content,
                virtualPath,
            ),
        );
        extraLibDisposables.push(
            monaco.typescript.typescriptDefaults.addExtraLib(
                content,
                virtualPath,
            ),
        );
    }
}

// =============================================================================
// Path Completion Provider
// =============================================================================

const REQUIRE_LIBRARY_RE = /require\(\s*["']library\/([^"']*)$/;
const REQUIRE_OPEN_RE = /require\(\s*["']([^"']*)$/;

interface DirectoryListing {
    folders: string[];
    files: string[];
}

/**
 * Given the flat allFiles list and a directory prefix, return immediate
 * child folders and files (with extensions stripped, deduplicated).
 */
function getDirectoryListing(allFiles: string[], dirPrefix: string): DirectoryListing {
    const folders = new Set<string>();
    const fileMap = new Map<string, string>(); // name-without-ext → ext (prefer .ts)

    for (const filePath of allFiles) {
        if (dirPrefix && !filePath.startsWith(dirPrefix)) continue;

        const remainder = dirPrefix ? filePath.slice(dirPrefix.length) : filePath;
        const slashIdx = remainder.indexOf("/");

        if (slashIdx !== -1) {
            // This file is in a subdirectory — collect the folder name
            folders.add(remainder.slice(0, slashIdx));
        } else {
            // This file is directly in the target directory
            const dotIdx = remainder.lastIndexOf(".");
            const nameWithoutExt = dotIdx !== -1 ? remainder.slice(0, dotIdx) : remainder;
            const ext = dotIdx !== -1 ? remainder.slice(dotIdx) : "";

            // Deduplicate: prefer .ts over .js
            const existing = fileMap.get(nameWithoutExt);
            if (!existing || (existing === ".js" && ext === ".ts")) {
                fileMap.set(nameWithoutExt, ext);
            }
        }
    }

    return {
        folders: [...folders].sort(),
        files: [...fileMap.keys()].sort(),
    };
}

function registerPathCompletionProvider(): void {
    const provider: monaco.languages.CompletionItemProvider = {
        triggerCharacters: ["/", '"', "'"],

        provideCompletionItems(model, position) {
            const lineContent = model.getLineContent(position.lineNumber);
            const textUntilCursor = lineContent.slice(0, position.column - 1);

            const libraryPath = settings.get("script-library.path");
            if (!libraryPath) return { suggestions: [] };

            const match = textUntilCursor.match(REQUIRE_LIBRARY_RE);
            if (!match) {
                // Check if user just opened a require string (e.g. require(" )
                const openMatch = textUntilCursor.match(REQUIRE_OPEN_RE);
                if (!openMatch) return { suggestions: [] };
                const typed = openMatch[1]; // what user typed so far
                if (!"library/".startsWith(typed)) return { suggestions: [] };

                const range = new monaco.Range(
                    position.lineNumber,
                    position.column - typed.length,
                    position.lineNumber,
                    position.column,
                );
                return {
                    suggestions: [{
                        label: "library",
                        kind: monaco.languages.CompletionItemKind.Module,
                        insertText: "library/",
                        range,
                        detail: "Script library modules",
                        command: {
                            id: "editor.action.triggerSuggest",
                            title: "Trigger",
                        },
                    }],
                };
            }

            const typedPath = match[1]; // e.g. "utils/hel" or "utils/" or ""
            const lastSlash = typedPath.lastIndexOf("/");
            const dirPrefix = lastSlash !== -1 ? typedPath.slice(0, lastSlash + 1) : "";
            const partial = lastSlash !== -1 ? typedPath.slice(lastSlash + 1) : typedPath;

            const listing = getDirectoryListing(libraryService.allFiles, dirPrefix);

            // Range covers only the partial text after the last /
            const startColumn = position.column - partial.length;
            const range = new monaco.Range(
                position.lineNumber,
                startColumn,
                position.lineNumber,
                position.column,
            );

            const suggestions: monaco.languages.CompletionItem[] = [];

            // Folders first (sortText "0" to appear before files)
            for (const folder of listing.folders) {
                suggestions.push({
                    label: folder,
                    kind: monaco.languages.CompletionItemKind.Folder,
                    insertText: folder + "/",
                    range,
                    sortText: "0" + folder,
                    command: {
                        id: "editor.action.triggerSuggest",
                        title: "Trigger",
                    },
                });
            }

            // Files (sortText "1" to appear after folders)
            for (const file of listing.files) {
                suggestions.push({
                    label: file,
                    kind: monaco.languages.CompletionItemKind.File,
                    insertText: file,
                    range,
                    sortText: "1" + file,
                });
            }

            return { suggestions };
        },
    };

    // Register once for both languages — provider reads allFiles dynamically
    monaco.languages.registerCompletionItemProvider("javascript", provider);
    monaco.languages.registerCompletionItemProvider("typescript", provider);
}

// =============================================================================
// Disposal
// =============================================================================

function disposeExtraLibs(): void {
    for (const d of extraLibDisposables) {
        d.dispose();
    }
    extraLibDisposables = [];
}
