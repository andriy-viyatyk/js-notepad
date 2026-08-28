import type { EditorModel } from "./EditorModel";
import type { IContentHost } from "./IContentHost";
import type { EditorConfig } from "./EditorConfig";
import type { VanillaViewCtor } from "../../uikit/shared/vanilla-view";

export interface AcceptanceInput {
    fileName?: string;
    language?: string;
    host?: IContentHost;
    /** Resolution mode (walkthrough 02 / S5). Scales priority:
     *    - "edit" prefers Monaco; preview editors fall back.
     *    - "view" prefers dedicated viewers; Monaco falls back.
     *  The boolean "can this editor handle the input?" MUST NOT depend on
     *  mode — `accepts()` returns -1 only when truly incompatible. */
    mode?: "edit" | "view";
}

type EditorModuleCommon = {
    /** Factory for a new editor instance. */
    createEditor(): EditorModel;
    /** File-open factory for standalone (no-host) editors whose construction
     *  depends on the opened path — decoding a link (git-tree, mneme-root,
     *  board, toolset, category), seeding path-derived state (image, video),
     *  or reading the target (archive). Editors without it open through the
     *  default text-host flow. */
    newEditorModel?(filePath?: string): Promise<EditorModel>;
    /** Chrome-free body — the editor content WITHOUT `<TextChrome>`. Supplied
     *  by editors that can be embedded inside another editor — notebook per-note
     *  dispatch mounts `module.BodyView` so each note's editor has no page
     *  chrome. Only the language-gated embeddable editors (Grid, Markdown, Svg,
     *  Html, Mermaid) provide it. */
    BodyView?: VanillaViewCtor<{ model: EditorModel; editorConfig?: EditorConfig }>;
};

export type EditorModule = EditorModuleCommon & {
    View: VanillaViewCtor<{ model: EditorModel }>;
};

export interface EditorMatcher {
    /** File-open resolution priority for this file name (highest wins;
     *  monaco is the 0 floor). */
    acceptFile?(fileName: string): number;
    /** Switch-widget offer priority for this language/file (ascending sort;
     *  monaco = 0 first). */
    switchOption?(language: string, fileName?: string): number;
    /** Whether this editor is valid for a language (checked on language change). */
    validForLanguage?(language: string): boolean;
    /** Content-marker detection (fast regex, no JSON parse) — the "open as X?"
     *  suggestion for structured content. */
    detectsContent?(language: string, content: string): boolean;
}

export interface EditorDefinition {
    id: string;
    name: string;

    /** Single acceptance predicate. Returns priority (higher wins) or -1 if
     *  not applicable. The page evaluates this against the current host (for
     *  switch UI via `findEditorsAccepting`); the registry evaluates it against
     *  file metadata (for `resolveForFile`). Content-based detection is
     *  absorbed: editors peek at `host.state.get().content` when they recognize
     *  their format by marker. Built from `match` via `makeAccepts`. */
    accepts(input: AcceptanceInput): number;

    /** Whether this editor wraps an `IContentHost`. Drives the open-file
     *  flow: if true, the caller creates a host first and inherits it into
     *  the new editor via `switchFrom` / `applyRestoreData`.
     *
     *  Could be derived from trait introspection at module-load; kept
     *  explicit during the inert phase for clarity. */
    readonly hasContentHost: boolean;

    /** MCP-specific recovery guidance when this standalone editor is passed to
     *  `create_page`, which only constructs content-host editors. */
    readonly mcpHint?: string;

    /** Granular matching rules. Absent for pure standalone editors
     *  (browser / settings / about / mcp / storybook) that never match a file
     *  and never appear in the switch widget. */
    match?: EditorMatcher;

    loadModule(): Promise<EditorModule>;
}

class EditorRegistry {
    private definitions = new Map<string, EditorDefinition>();
    private modules = new Map<string, EditorModule>();

    register(def: EditorDefinition): void {
        this.definitions.set(def.id, def);
    }

    getById(id: string): EditorDefinition | undefined {
        return this.definitions.get(id);
    }

    getAll(): EditorDefinition[] {
        return Array.from(this.definitions.values());
    }

    /** Resolve the best editor id for opening a file. Mode controls preference
     *  between edit-oriented (Monaco) and view-oriented (markdown-view, …)
     *  editors when both accept the file. Defaults to "edit". */
    resolveForFile(
        fileName: string,
        language?: string,
        mode: "edit" | "view" = "edit",
    ): string {
        let bestId = "monaco";
        let bestPriority = 0;
        for (const def of this.definitions.values()) {
            const p = def.accepts({ fileName, language, mode });
            if (p > bestPriority) {
                bestPriority = p;
                bestId = def.id;
            }
        }
        return bestId;
    }

    /** All editor ids that accept the current host. Used by the page-level
     *  switch widget. Mode-agnostic by design — `accepts()` returns -1 only
     *  when truly incompatible. */
    findEditorsAccepting(host: IContentHost): string[] {
        const out: { id: string; p: number }[] = [];
        const language = host.state.get().language;
        const fileName = (host as unknown as { filePath?: string }).filePath
            ?? (host.state.get() as { title?: string }).title;
        for (const def of this.definitions.values()) {
            if (!def.hasContentHost) continue;
            const p = def.accepts({ host, language, fileName });
            if (p >= 0) out.push({ id: def.id, p });
        }
        return out.sort((a, b) => b.p - a.p).map((x) => x.id);
    }


    /** Resolve the best editor DEFINITION for opening a file, by file-acceptance
     *  priority (highest wins; monaco is the 0 floor). Returns undefined when no
     *  file name is given. Mirrors the legacy registry's `resolve`. */
    resolve(fileName?: string): EditorDefinition | undefined {
        if (!fileName) return undefined;
        let best: EditorDefinition | undefined;
        let bestPriority = -1;
        for (const def of this.definitions.values()) {
            const p = def.match?.acceptFile?.(fileName) ?? -1;
            if (p > bestPriority) {
                best = def;
                bestPriority = p;
            }
        }
        return best;
    }

    /** Resolve just the editor id for a file path. Mirrors legacy `resolveId`. */
    resolveId(fileName?: string): string | undefined {
        return this.resolve(fileName)?.id;
    }

    /** Editor switch options for a language/file — the switch widget + notebook
     *  note toolbar. Editors whose `match.switchOption` ≥ 0, sorted ascending
     *  (monaco = 0 first), labelled by editor name. Empty list when ≤ 1 option
     *  applies. Mirrors the legacy `getSwitchOptions`. */
    getSwitchOptions(
        language: string,
        fileName?: string,
    ): { options: string[]; getOptionLabel: (option: string) => string } {
        const results: { id: string; priority: number }[] = [];
        for (const def of this.definitions.values()) {
            const p = def.match?.switchOption?.(language, fileName) ?? -1;
            if (p >= 0) results.push({ id: def.id, priority: p });
        }
        // Ascending so monaco (priority 0) leads.
        results.sort((a, b) => a.priority - b.priority);
        const options = results.map((r) => r.id);
        const getOptionLabel = (option: string) => {
            if (!option || option === "monaco") return language.toUpperCase();
            return this.definitions.get(option)?.name ?? language.toUpperCase();
        };
        return { options: options.length > 1 ? options : [], getOptionLabel };
    }

    /** Preferred preview editor for a file in navigation context: the best
     *  non-monaco editor whose `switchOption` ≥ 0 and whose `acceptFile` (if
     *  present) doesn't reject the file. Mirrors the legacy `getPreviewEditor`. */
    getPreviewEditor(language: string, fileName: string): string | undefined {
        const results: { id: string; priority: number }[] = [];
        for (const def of this.definitions.values()) {
            if (def.id === "monaco") continue;
            const p = def.match?.switchOption?.(language, fileName) ?? -1;
            if (p < 0) continue;
            const acceptFile = def.match?.acceptFile;
            if (acceptFile && acceptFile(fileName) < 0) continue;
            results.push({ id: def.id, priority: p });
        }
        if (results.length === 0) return undefined;
        results.sort((a, b) => a.priority - b.priority);
        return results[results.length - 1].id;
    }

    /** Validate an editor against a language; falls back to "monaco" if the
     *  editor doesn't support it. Mirrors the legacy `validateForLanguage`. */
    validateForLanguage(editor: string | undefined, language: string): string | undefined {
        if (!editor || editor === "monaco") return editor;
        const def = this.definitions.get(editor);
        if (def?.match?.validForLanguage?.(language) === false) return "monaco";
        return editor;
    }

    /** Detect a structured-content editor for a host's current content (the
     *  "open as X?" suggestion). First `match.detectsContent` match wins.
     *  Robust to unloaded content — empty content matches nothing, so an early
     *  call before the host finishes loading simply yields no suggestion and
     *  re-runs once content arrives. Mirrors the legacy `detectContentEditor`,
     *  now host-driven (/ C581-3). */
    detectContentEditor(host: IContentHost): string | undefined {
        const s = host.state.get() as { content?: string; language?: string };
        const content = s.content ?? "";
        if (!content) return undefined;
        const language = s.language ?? "";
        for (const def of this.definitions.values()) {
            if (def.match?.detectsContent?.(language, content)) return def.id;
        }
        return undefined;
    }

    /** Instantiate a new editor by id. Lazy-loads the module on first use.
     *  Returns a bare editor — no host. Callers drive the three-phase
     *  lifecycle:
     *
     *      const editor = await editorRegistry.createEditor(id);
     *      editor.applyRestoreData(data);   // OR editor.switchFrom(oldEditor)
     *      await editor.restore();
     *
     *  `instanceId` (walkthrough 04 / P6 / C2 + walkthrough 05 / M5 / C1):
     *  when provided, preserves cache-file id continuity across app restarts
     *  and multi-window transfer. Omit for new pages / switch widget /
     *  open-file. */
    async createEditor(id: string, instanceId?: string): Promise<EditorModel> {
        await this.loadModule(id);
        return this.createEditorSync(id, instanceId);
    }

    /** Synchronous `createEditor` against the module cache. Exists for the
     *  construction paths that cannot await — `attachEditorToPage` sits under
     *  sync public APIs (`addEditorPage`, `openLinks`, `page.grouped`).
     *  Content-host modules are preloaded at startup
     *  (`preloadContentHostModules`), so a miss only happens in the first
     *  moments after launch; it throws a descriptive error rather than
     *  falling back silently. */
    createEditorSync(id: string, instanceId?: string): EditorModel {
        const def = this.definitions.get(id);
        if (!def) throw new Error(`No editor registered for id: ${id}`);
        const module = this.modules.get(id);
        if (!module) {
            throw new Error(
                `Editor module "${id}" is not loaded yet (startup preload still running). Retry in a moment.`,
            );
        }
        const editor = module.createEditor();
        // Modules construct with the default state's empty id — only a real
        // instance id may be stamped. An empty string must NOT clobber state:
        // a falsy id breaks all id-based dedup downstream (panel keys,
        // addSecondaryView), causing duplicate editors to accumulate
        // (EPIC-031 / US-616 regression fix).
        if (instanceId) {
            editor.state.update((s) => { s.id = instanceId; });
        }
        return editor;
    }

    /** Warm the module cache for every content-host editor so the synchronous
     *  construction path (`attachEditorToPage`) can build any text-host editor
     *  without awaiting. Fire-and-forget per module; a load failure is logged
     *  here and surfaces to the user on first real use. */
    preloadContentHostModules(): void {
        for (const def of this.definitions.values()) {
            if (!def.hasContentHost) continue;
            void this.loadModule(def.id).catch((err: unknown): undefined => {
                console.warn(`[editorRegistry] preload of "${def.id}" failed:`, err);
                return undefined;
            });
        }
    }

    /** Public module accessor — loads (and caches) the module for an id so
     *  callers can read `module.BodyView` / `module.createEditor` directly. Used
     *  by the notebook per-note dispatch to mount an embedded editor's
     *  chrome-free body view. */
    getModule(id: string): Promise<EditorModule> {
        return this.loadModule(id);
    }

    private async loadModule(id: string): Promise<EditorModule> {
        let module = this.modules.get(id);
        if (module) return module;
        const def = this.definitions.get(id);
        if (!def) throw new Error(`No editor registered for id: ${id}`);
        module = await def.loadModule();
        this.modules.set(id, module);
        return module;
    }
}

export const editorRegistry = new EditorRegistry();

/** An explicit content-host target (e.g. "file-diff") that is NOT the file's
 *  natural editor must win over preview/default editor selection. Normal opens
 *  carry target === resolveId(filePath), so they return false here and fall
 *  through to the preview editor. Shared by the open-file and navigate flows. */
export function isExplicitHostTarget(
    target: string | undefined,
    filePath: string,
): boolean {
    return (
        !!target &&
        target !== editorRegistry.resolveId(filePath) &&
        !!editorRegistry.getById(target)?.hasContentHost
    );
}
