import { debounce } from "../../shared/utils";
import { TModel } from "../core/state/model";
import { TGlobalState } from "../core/state/state";
import { settings } from "./settings";
import { scriptRunner } from "../scripting/ScriptRunner";

// nodefs kept only for fs.watch() (documented exception — callback-based watcher)
const nodefs = require("fs") as typeof import("fs");
import { fs } from "./fs";
import { fpBasename, fpExtname, fpJoin, fpRelative } from "../core/utils/file-path";

// =============================================================================
// Types
// =============================================================================

export interface ScriptPanelEntry {
    /** Display name (filename without extension) */
    name: string;
    /** Full absolute path */
    path: string;
    /** File extension (.ts or .js) */
    ext: string;
}

interface LibraryServiceState {
    /** Files in script-panel/ grouped by language subfolder */
    scriptPanelIndex: Record<string, ScriptPanelEntry[]>;
    /** All .ts/.js files in the library (relative paths) */
    allFiles: string[];
}

const defaultState: LibraryServiceState = {
    scriptPanelIndex: {},
    allFiles: [],
};

// =============================================================================
// Implementation
// =============================================================================

class LibraryService extends TModel<LibraryServiceState> {
    private initialized = false;
    private watcher: ReturnType<typeof nodefs.watch> | undefined;

    constructor() {
        super(new TGlobalState(defaultState));
        this.own(settings.onChanged.subscribe(({ key }) => {
            if (key === "script-library.path" && this.initialized) {
                this.deactivate();
                this.activate();
            }
        }));
        this.own(() => this.stopWatching());
    }

    /** Call before using any service state. Idempotent — only initializes once. */
    ensureInitialized(): void {
        if (this.initialized) return;
        this.initialized = true;
        this.activate();
    }

    get scriptPanelIndex(): Record<string, ScriptPanelEntry[]> {
        return this.state.get().scriptPanelIndex;
    }

    get allFiles(): string[] {
        return this.state.get().allFiles;
    }

    dispose(): void {
        this.deactivate();
        super.dispose();
    }

    // ── Private ──────────────────────────────────────────────────────────

    private activate(): void {
        const libraryPath = settings.get("script-library.path");
        if (!libraryPath) {
            this.state.update((s) => {
                s.scriptPanelIndex = {};
                s.allFiles = [];
            });
            return;
        }

        this.activateAsync(libraryPath);
    }

    private async activateAsync(libraryPath: string): Promise<void> {
        if (!await fs.exists(libraryPath)) {
            this.state.update((s) => {
                s.scriptPanelIndex = {};
                s.allFiles = [];
            });
            return;
        }

        await this.scan(libraryPath);
        this.startWatching(libraryPath);
    }

    private deactivate(): void {
        this.stopWatching();
        this.state.update((s) => {
            s.scriptPanelIndex = {};
            s.allFiles = [];
        });
    }

    private async scan(libraryPath: string): Promise<void> {
        const scriptPanelIndex = await this.scanScriptPanel(libraryPath);
        const allFiles = await this.scanAllFiles(libraryPath);
        this.state.update((s) => {
            s.scriptPanelIndex = scriptPanelIndex;
            s.allFiles = allFiles;
        });
    }

    private async scanScriptPanel(libraryPath: string): Promise<Record<string, ScriptPanelEntry[]>> {
        const scriptPanelDir = fpJoin(libraryPath, "script-panel");
        if (!await fs.exists(scriptPanelDir)) {
            return {};
        }

        const index: Record<string, ScriptPanelEntry[]> = {};

        try {
            const langDirs = await fs.listDirWithTypes(scriptPanelDir);
            for (const dirent of langDirs) {
                if (!dirent.isDirectory) continue;
                const langKey = dirent.name;
                const langDir = fpJoin(scriptPanelDir, langKey);
                const entries = await this.readScriptFiles(langDir);
                if (entries.length > 0) {
                    index[langKey] = entries;
                }
            }
        } catch {
            // Directory read failed — return empty index
        }

        return index;
    }

    private async readScriptFiles(dir: string): Promise<ScriptPanelEntry[]> {
        const entries: ScriptPanelEntry[] = [];
        try {
            const files = await fs.listDirWithTypes(dir);
            for (const dirent of files) {
                if (dirent.isDirectory) continue;
                const ext = fpExtname(dirent.name).toLowerCase();
                if (ext !== ".ts" && ext !== ".js") continue;
                entries.push({
                    name: fpBasename(dirent.name, ext),
                    path: fpJoin(dir, dirent.name),
                    ext,
                });
            }
        } catch {
            // Directory read failed — return empty
        }
        return entries;
    }

    private async scanAllFiles(libraryPath: string): Promise<string[]> {
        const files: string[] = [];
        await this.walkDir(libraryPath, libraryPath, files);
        return files;
    }

    private async walkDir(baseDir: string, currentDir: string, result: string[]): Promise<void> {
        try {
            const entries = await fs.listDirWithTypes(currentDir);
            for (const dirent of entries) {
                const fullPath = fpJoin(currentDir, dirent.name);
                if (dirent.isDirectory) {
                    await this.walkDir(baseDir, fullPath, result);
                } else {
                    const ext = fpExtname(dirent.name).toLowerCase();
                    if (ext === ".ts" || ext === ".js") {
                        const relativePath = fpRelative(baseDir, fullPath).replace(/\\/g, "/");
                        result.push(relativePath);
                    }
                }
            }
        } catch {
            // Directory read failed — skip
        }
    }

    // ── File Watching ────────────────────────────────────────────────────

    private startWatching(libraryPath: string): void {
        try {
            this.watcher = nodefs.watch(libraryPath, { recursive: true }, () => {
                this.onChangeDebounced(libraryPath);
            });
        } catch {
            // Watcher setup failed — service works without live updates
        }
    }

    private stopWatching(): void {
        this.watcher?.close();
        this.watcher = undefined;
    }

    private onChangeDebounced = debounce(async (libraryPath: string) => {
        await this.scan(libraryPath);
        scriptRunner.invalidateLibraryCache();

        // Mark autoload scripts as needing reload (user-controlled via header button)
        const { autoloadService } = await import("./autoload-service");
        autoloadService.markNeedsReload();
    }, 300);
}

export const libraryService = new LibraryService();

// =============================================================================
// Example Scripts
// =============================================================================

/**
 * Copy bundled example scripts from assets to the target library folder.
 * Skips files that already exist in the destination (never overwrites).
 */
export async function copyExampleScripts(targetPath: string): Promise<void> {
    const { api } = await import("../../ipc/renderer/api");
    const appRoot = await api.getAppRootPath();
    const sourcePath = fpJoin(appRoot, "assets", "script-library");

    if (!await fs.exists(sourcePath)) {
        return;
    }

    await copyDirRecursive(sourcePath, targetPath);
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
    if (!await fs.exists(dest)) {
        await fs.mkdir(dest);
    }

    const entries = await fs.listDirWithTypes(src);
    for (const entry of entries) {
        const srcPath = fpJoin(src, entry.name);
        const destPath = fpJoin(dest, entry.name);
        if (entry.isDirectory) {
            await copyDirRecursive(srcPath, destPath);
        } else {
            if (!await fs.exists(destPath)) {
                await fs.copyFile(srcPath, destPath);
            }
        }
    }
}
