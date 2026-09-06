/**
 * Registered-tools model (EPIC-038 / US-801). Enumerates the toolset folders registered in
 * `toolsTrust`, reads + validates each `tools-manifest.json`, and exposes a collision-resolved
 * flat list of tools (id = `<toolset-name>/<tool-name>`). Consumed by the MCP layer (US-803:
 * `tools.search` / `tools.execute` / `tools.toolsets.refresh`) and the management UI (US-805).
 *
 * Deliberately does NOT watch the filesystem (US-801 T-C5): tool registration/editing happens
 * only during tool development, so a standing per-toolset watcher is unwanted background cost.
 * The model re-enumerates on exactly two triggers:
 *   1. a `toolsTrust` registration change (an in-memory subscription, not a file watcher), and
 *   2. an explicit `refresh()` — surfaced as the `tools.toolsets.refresh` call path (US-803) and the
 *      management-UI Refresh button (US-805).
 */
import { TModel } from "../../core/state/model";
import { TGlobalState } from "../../core/state/state";
import { fpBasename } from "../../core/utils/file-path";
import { toolsTrust } from "./tools-trust";
import {
    ToolDef,
    ToolsManifest,
    readToolsManifest,
    validateToolsManifest,
} from "./tools-manifest";

/** A single tool, resolved from a registered toolset and namespaced by toolset name. */
export interface RegisteredTool {
    /** `${toolsetName}/${tool.name}` — the id agents pass to `tools.execute`. */
    id: string;
    toolsetName: string;
    /** Absolute toolset folder path (the execute cwd in US-802). */
    toolsetRoot: string;
    /** Toolset-level manifest description — part of the search corpus (US-812). */
    toolsetDescription?: string;
    /** Toolset-level manifest keywords — part of the search corpus (US-812). */
    toolsetKeywords?: string[];
    tool: ToolDef;
}

/** A registered toolset folder and the outcome of reading/validating its manifest. */
export interface RegisteredToolset {
    /** Absolute folder path (from `toolsTrust`, original case). */
    root: string;
    /** Parsed manifest, or null if the file is missing / unparseable. */
    manifest: ToolsManifest | null;
    /** Display name — `manifest.name` when valid, else the folder basename. */
    name: string;
    /** True when the manifest parsed AND passed structural validation. */
    valid: boolean;
    /** Validation / read errors ("manifest missing", per-field messages, collision note). */
    errors: string[];
    /** True when this toolset's name collided with an earlier-registered one (this one lost
     *  — its tools are excluded from the flat list). EPIC C8. */
    shadowed: boolean;
}

interface RegisteredToolsState {
    /** Every registered root, in registration order (valid + invalid). */
    toolsets: RegisteredToolset[];
    /** Flat, collision-resolved tool list (first-registered toolset name wins). */
    tools: RegisteredTool[];
}

const defaultState: RegisteredToolsState = {
    toolsets: [],
    tools: [],
};

class RegisteredTools extends TModel<RegisteredToolsState> {
    private initialized = false;
    private pathsSub: (() => void) | undefined;

    constructor() {
        super(new TGlobalState(defaultState));
        // In-memory reactive subscription (NOT a filesystem watcher): re-enumerate whenever a
        // toolset is registered / unregistered.
        this.pathsSub = toolsTrust.subscribePaths(() => {
            void this.refresh();
        });
    }

    /** Call before reading model state. Idempotent — loads the registry then enumerates. */
    async ensureInitialized(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;
        await toolsTrust.load();
        await this.refresh();
    }

    /** Read-only initialization state for consumers that must fail closed without loading. */
    get isInitialized(): boolean {
        return this.initialized;
    }

    get toolsets(): RegisteredToolset[] {
        return this.state.get().toolsets;
    }

    get tools(): RegisteredTool[] {
        return this.state.get().tools;
    }

    /** Framework-neutral subscription to the registered toolset collection. */
    subscribeToolsets(listener: () => void): () => void {
        return this.state.subscribe(listener, (s) => s.toolsets);
    }

    /**
     * Re-read every registered toolset's manifest and rebuild the reactive state. The
     * optional `root` is a hint only — v1 always does a full refresh, because re-reading all
     * manifests is cheap at registry scale and a single manifest's `name` change can alter
     * the collision outcome, so the flat list must be rebuilt from all toolsets anyway.
     */
    async refresh(_root?: string): Promise<void> {
        const roots = toolsTrust.listPaths();
        const toolsets: RegisteredToolset[] = [];
        const tools: RegisteredTool[] = [];
        const claimedNames = new Set<string>(); // normalized toolset names already won

        for (const root of roots) {
            const manifest = await readToolsManifest(root);
            const validation = manifest
                ? validateToolsManifest(manifest)
                : { ok: false, errors: ["Manifest missing or unreadable."] };
            const displayName =
                (manifest && typeof manifest.name === "string" && manifest.name.trim()) ||
                fpBasename(root);
            const errors = [...validation.errors];
            let shadowed = false;

            if (validation.ok && manifest) {
                const nameKey = displayName.toLowerCase();
                if (claimedNames.has(nameKey)) {
                    shadowed = true;
                    errors.push(
                        `Toolset name "${displayName}" is already registered by an earlier ` +
                            `toolset; this one is shadowed and its tools are not available.`
                    );
                } else {
                    claimedNames.add(nameKey);
                    for (const tool of manifest.tools) {
                        tools.push({
                            id: `${displayName}/${tool.name}`,
                            toolsetName: displayName,
                            toolsetRoot: root,
                            toolsetDescription:
                                typeof manifest.description === "string"
                                    ? manifest.description
                                    : undefined,
                            toolsetKeywords: Array.isArray(manifest.keywords)
                                ? manifest.keywords
                                : undefined,
                            tool,
                        });
                    }
                }
            }

            toolsets.push({
                root,
                manifest,
                name: displayName,
                valid: validation.ok,
                errors,
                shadowed,
            });
        }

        this.state.update((s) => {
            s.toolsets = toolsets;
            s.tools = tools;
        });
    }

    dispose(): void {
        this.pathsSub?.();
        this.pathsSub = undefined;
        // Drain the model's DisposableStore after existing teardown.
        super.dispose();
    }
}

export const registeredTools = new RegisteredTools();
