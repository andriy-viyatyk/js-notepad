import { ScriptContext } from "./ScriptContext";
import { ensureSucraseLoaded } from "./transpile";
import { registerLibraryExtensions } from "./library-require";
import { settings } from "../api/settings";
import { fpJoin, fpResolve } from "../core/utils/file-path";
import { fs } from "../api/fs";
import { TOneState } from "../core/state/state";
import { errMessage } from "../../shared/utils";

interface AutoloadState {
    /** Whether autoload scripts are currently loaded. */
    isLoaded: boolean;
    /** Whether loaded scripts need to be reloaded due to library changes. */
    needsReload: boolean;
}

/**
 * Loads and executes registration scripts from the `autoload/` subfolder
 * in the Script Library. Registration scripts export a named `register()`
 * function that subscribes to application events via `app.events`.
 *
 * All scripts share one ScriptContext — event subscriptions are tracked
 * in a single releaseList. On reload (or error), everything is disposed
 * at once (all-or-nothing model).
 *
 * Uses ScriptContext.customRequire() to load modules directly — this
 * propagates the correct context through the entire require chain.
 *
 * Lives in `scripting/` because it's script execution logic.
 * Exposed to the app lifecycle via `api/autoload-service.ts`.
 */
class AutoloadRunner {
    private scriptContext: ScriptContext | null = null;
    readonly state = new TOneState<AutoloadState>({
        isLoaded: false,
        needsReload: false,
    });

    /** Whether autoload scripts are currently loaded. */
    get isLoaded(): boolean {
        return this.state.get().isLoaded;
    }

    /**
     * Mark that scripts need to be (re)loaded.
     * Shows indicator if scripts are currently loaded (need reload)
     * or if autoload folder has scripts that haven't been loaded yet.
     */
    async markNeedsReload(): Promise<void> {
        if (this.state.get().isLoaded) {
            this.state.update(s => { s.needsReload = true; });
            return;
        }

        // Not currently loaded — check if autoload folder now has scripts
        const libraryPath = settings.get("script-library.path") as string | undefined;
        if (!libraryPath) return;

        const autoloadPath = fpJoin(libraryPath, "autoload");
        if (!await fs.exists(autoloadPath)) return;

        const dirEntries = await fs.listDirWithTypes(autoloadPath);
        const hasScripts = dirEntries.some(
            e => !e.isDirectory && (e.name.endsWith(".ts") || e.name.endsWith(".js"))
        );

        if (hasScripts) {
            this.state.update(s => { s.needsReload = true; });
        }
    }

    /**
     * Load all autoload scripts. Disposes previous context if any.
     * Scripts are loaded alphabetically by filename.
     * If any script fails during registration, all subscriptions are
     * unsubscribed and an error notification is shown.
     */
    async loadScripts(): Promise<void> {
        this.dispose();

        const libraryPath = settings.get("script-library.path") as string | undefined;
        if (!libraryPath) return;

        const autoloadPath = fpJoin(libraryPath, "autoload");
        if (!await fs.exists(autoloadPath)) return;

        // Scan for .ts/.js files, sort alphabetically
        const dirEntries = await fs.listDirWithTypes(autoloadPath);
        const files = dirEntries
            .filter(e => !e.isDirectory && (e.name.endsWith(".ts") || e.name.endsWith(".js")))
            .map(e => e.name)
            .sort();

        if (files.length === 0) return;

        // Ensure sucrase is loaded and library extensions registered
        await ensureSucraseLoaded();
        registerLibraryExtensions(libraryPath);

        // Create shared ScriptContext (no page, no consoleLogs)
        this.scriptContext = new ScriptContext(undefined, undefined, libraryPath);

        try {
            for (const file of files) {
                const filePath = fpJoin(autoloadPath, file);
                const resolvedPath = fpResolve(filePath);

                // Load module via context's customRequire — propagates context
                const mod = this.scriptContext.customRequire(resolvedPath);

                if (typeof mod.register === "function") {
                    const result = mod.register();
                    // Await if async
                    if (result && typeof result.then === "function") {
                        await result;
                    }
                }
                // Files without register export are silently skipped (utility modules)
            }
            this.state.update(s => { s.isLoaded = true; s.needsReload = false; });
        } catch (error) {
            // All-or-nothing: dispose everything on error
            const message = errMessage(error);
            this.dispose();
            // Dynamic import to avoid pulling ui module at load time
            import("../api/ui").then(({ ui }) => {
                ui.notify(`Autoload script error: ${message}`, "error");
            });
        }
    }

    /** Dispose current context (unsubscribe all events, release resources). */
    dispose(): void {
        this.state.update(s => { s.isLoaded = false; s.needsReload = false; });
        if (this.scriptContext) {
            this.scriptContext.dispose();
            this.scriptContext = null;
        }
    }
}

export const autoloadRunner = new AutoloadRunner();
