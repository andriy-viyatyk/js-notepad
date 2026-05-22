import type React from "react";
import type { EditorModel } from "./EditorModel";
import type { IContentHost } from "./IContentHost";

/**
 * v4 editor registry. Coexists with the legacy registry at
 * [`../../registry.ts`](../../registry.ts) during the strangler-fig migration.
 * US-548 starts populating this with adapter-wrapped editors; US-559 deletes
 * the legacy registry.
 *
 * Differences from the legacy `EditorDefinition`:
 *   - Dropped: `category`, `editorType`, `acceptFile`, `validForLanguage`,
 *     `switchOption`, `isEditorContent`, `createViewModel`.
 *   - Added: single `accepts(input)` predicate, `hasContentHost` flag.
 *
 * Design rationale: [`doc/epics/EPIC-028-editor-architecture/mockups/editorRegistry.ts`](../../../../../doc/epics/EPIC-028-editor-architecture/mockups/editorRegistry.ts).
 */

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

export interface EditorModule {
    /** Factory for a new editor instance. */
    createEditor(): EditorModel;
    /** The React component that renders this editor. */
    Component: React.ComponentType<{ model: EditorModel }>;
}

export interface EditorDefinition {
    id: string;
    name: string;

    /** Single acceptance predicate. Returns priority (higher wins) or -1 if
     *  not applicable. The page evaluates this against the current host (for
     *  switch UI); the registry evaluates it against file metadata (for
     *  open-file flow). Content-based detection is absorbed: editors peek
     *  at `host.state.get().content` when they recognize their format by
     *  marker. */
    accepts(input: AcceptanceInput): number;

    /** Whether this editor wraps an `IContentHost`. Drives the open-file
     *  flow: if true, the caller creates a host first and inherits it into
     *  the new editor via `switchFrom` / `applyRestoreData`.
     *
     *  Could be derived from trait introspection at module-load; kept
     *  explicit during the inert phase for clarity. */
    readonly hasContentHost: boolean;

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
        // TextFileModel exposes `filePath`; the v4 IContentHost interface
        // doesn't carry it. Fall through structurally so hosts that surface
        // it participate, others don't. (C1 — switch via `instanceof` once
        // TextFileModel lands in v4 during US-551.)
        //
        // For untitled pages created via `addEditorPage("draw-view", "json",
        // "untitled.excalidraw")` (tool-menu / sidebar entries) `filePath` is
        // undefined but `title` carries the meaningful extension. Falling
        // back to the title lets `acceptFile` / `switchOption` recognize the
        // file shape and surface the editor in the switch widget.
        const fileName = (host as unknown as { filePath?: string }).filePath
            ?? (host.state.get() as { title?: string }).title;
        for (const def of this.definitions.values()) {
            if (!def.hasContentHost) continue;
            const p = def.accepts({ host, language, fileName });
            if (p >= 0) out.push({ id: def.id, p });
        }
        return out.sort((a, b) => b.p - a.p).map((x) => x.id);
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
     *  open-file (a fresh UUID is allocated). */
    async createEditor(id: string, instanceId?: string): Promise<EditorModel> {
        const module = await this.loadModule(id);
        const editor = module.createEditor();
        if (instanceId !== undefined) {
            editor.state.update((s) => { s.id = instanceId; });
        }
        return editor;
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
