/**
 * Toolset trust / registration registry (EPIC-038 / US-801). A toolset's tools are run via
 * `execute_tool`, which is arbitrary RCE, so a toolset is only known + runnable once its
 * folder has been registered here. Registration ≡ trust: this one list is both "the toolsets
 * Persephone knows about" and "the toolsets it is allowed to run" (like the boards registry).
 *
 * Persisted across sessions as a line-delimited list of absolute folder paths at
 * `<userData>/data/trustedTools.txt`. Trust is NEVER read from a toolset's manifest or any
 * in-folder file — a copied toolset must not be able to self-trust. It is always a user
 * action: the confirmation dialog on agent-initiated registration (US-804) or the management
 * UI (US-805).
 *
 * Structured after `board-trust.ts` (reactive `TGlobalState` + lazy `load()` + the `fs`
 * data-file helpers) with two deliberate differences (US-801 T-C1/T-C2):
 *   1. **Exact-path matching**, NOT board-trust's inherited/outer-wins `pathCovers`. A
 *      registered path is a toolset *leaf* (one folder = one toolset, one fixed-name
 *      `tools-manifest.json`); parent-folder inheritance would wrongly collapse a nested or
 *      sibling toolset out of enumeration.
 *   2. A `subscribePaths` method so the `registeredTools` model can re-enumerate on
 *      registration changes WITHOUT any filesystem watcher (T-C5).
 *
 * This module is intentionally NOT exposed on the `app` object model or any script `.d.ts` —
 * a script must never be able to silently self-trust.
 */
import { TGlobalState } from "../../core/state/state";
import { fpNormalizeForCompare } from "../../core/utils/file-path";
import { fs } from "../fs";

const trustedToolsFileName = "trustedTools.txt";

interface ToolsTrustState {
    paths: string[]; // absolute toolset-folder paths, original case
}

class ToolsTrust {
    private readonly state = new TGlobalState<ToolsTrustState>({ paths: [] });

    /** Load the registered list from disk into reactive state. Lazy, like board-trust. */
    async load(): Promise<void> {
        await fs.prepareDataFile(trustedToolsFileName, "");
        const data = await fs.getDataFile(trustedToolsFileName);
        const paths = (data ?? "").split("\n").map((p) => p.trim()).filter((p) => p);
        this.state.update((s) => {
            s.paths = paths;
        });
    }

    /** Sync check against currently-loaded state (call load() first on mount). Exact match —
     *  a toolset is registered only if its own folder path is in the list (no inheritance). */
    isTrusted(toolsetRoot: string): boolean {
        const key = fpNormalizeForCompare(toolsetRoot);
        return this.state.get().paths.some((p) => fpNormalizeForCompare(p) === key);
    }

    /** Reactive hook for views — re-renders when this toolset's registration flips. */
    useIsTrusted(toolsetRoot: string): boolean {
        const key = fpNormalizeForCompare(toolsetRoot);
        return this.state.use((s) => s.paths.some((p) => fpNormalizeForCompare(p) === key));
    }

    /** All registered toolset-root paths (sync, non-reactive). Call `load()` first. */
    listPaths(): string[] {
        return this.state.get().paths;
    }

    /** Reactive list of all registered toolset-root paths. */
    useTrustedPaths(): string[] {
        return this.state.use((s) => s.paths);
    }

    /**
     * Subscribe to registration-list changes (in-memory, NOT a filesystem watcher). The
     * `registeredTools` model uses this to re-enumerate when a toolset is registered /
     * unregistered. Returns an unsubscribe function.
     */
    subscribePaths(listener: () => void): () => void {
        return this.state.subscribe(() => listener(), (s) => s.paths);
    }

    /** Register (trust) a toolset folder (idempotent, exact match). Caller confirms first
     *  (the confirmation dialog / the management UI). */
    async trust(toolsetRoot: string): Promise<void> {
        await this.load(); // re-read so we don't clobber a concurrent write
        if (this.isTrusted(toolsetRoot)) {
            return;
        }
        const paths = [...this.state.get().paths, toolsetRoot];
        this.state.update((s) => {
            s.paths = paths;
        });
        await fs.saveDataFile(trustedToolsFileName, paths.join("\n"));
    }

    /** Unregister (untrust) a toolset folder (idempotent, exact match). */
    async untrust(toolsetRoot: string): Promise<void> {
        await this.load();
        const key = fpNormalizeForCompare(toolsetRoot);
        const paths = this.state.get().paths.filter((p) => fpNormalizeForCompare(p) !== key);
        this.state.update((s) => {
            s.paths = paths;
        });
        await fs.saveDataFile(trustedToolsFileName, paths.join("\n"));
    }
}

export const toolsTrust = new ToolsTrust();
