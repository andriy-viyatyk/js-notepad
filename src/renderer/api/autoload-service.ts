import { autoloadRunner } from "../scripting/AutoloadRunner";

/**
 * Thin wrapper exposing AutoloadRunner to the application lifecycle.
 * The real implementation lives in `scripting/AutoloadRunner.ts`.
 */
export const autoloadService = {
    loadScripts: () => autoloadRunner.loadScripts(),
    dispose: () => autoloadRunner.dispose(),
    markNeedsReload: () => autoloadRunner.markNeedsReload(),
    get isLoaded() { return autoloadRunner.isLoaded; },
    /** Reactive state — subscribe directly when a view needs live updates. */
    state: autoloadRunner.state,
};
