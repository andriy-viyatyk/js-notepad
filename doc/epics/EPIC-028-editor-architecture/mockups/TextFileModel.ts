// =============================================================================
// MOCKUP — TextFileModel (now an IContentHost, no longer an EditorModel)
//
// EPIC-028 design phase. Non-compiling sketch — for reading, not building.
//
// Today's class at /src/renderer/editors/text/TextEditorModel.ts is a
// TextFileModel that EXTENDS EditorModel and ALSO implements IContentHost.
// That dual identity is the root of the architectural mess this epic
// removes — text content state and editor identity were conflated.
//
// After the refactor:
//   - TextFileModel is just a content host. Not an EditorModel.
//   - It is not placed on a page directly. Editors (Monaco, Grid, Link, …)
//     wrap a TextFileModel as their IContentHost.
//   - It owns everything file-level: I/O, encryption, script panel, pipe,
//     modified flag, file path, encoding, password, encrypted flag.
//   - It does NOT know about page, secondaryEditor, mainEditor lifecycle.
//     Editors that wrap it carry those concerns.
//
// State surface:
//   - IContentHostState fields (content, language) from the interface
//   - Plus file-level fields: filePath, modified, encoding, encrypted,
//     password, pipe, temp, restored
// =============================================================================

import { TOneState } from "../../../src/renderer/core/state/state";
import type { IContentHost, IContentHostState } from "./IContentHost";
import type { IContentPipe } from "../../../src/renderer/api/types/io.pipe";
import type { EditorStateStorage } from "../../../src/renderer/editors/base/EditorStateStorageContext";
import { TextFileIOModel } from "../../../src/renderer/editors/text/TextFileIOModel";
import { TextFileEncryptionModel } from "../../../src/renderer/editors/text/TextFileEncryptionModel";
import { ScriptPanelModel } from "../../../src/renderer/editors/text/ScriptPanel";
import { TextFileActionsModel } from "../../../src/renderer/editors/text/TextFileActionsModel";
import { fs as appFs } from "../../../src/renderer/api/fs";

// -----------------------------------------------------------------------------
// State — superset of IContentHostState
// -----------------------------------------------------------------------------

export interface TextFileHostState extends IContentHostState {
    id: string;
    filePath?: string;
    modified: boolean;
    encoding?: string;
    encrypted: boolean;
    password?: string;
    temp: boolean;
    restored: boolean;

    /** HS1 — editor-keyed view-state slot map. Each text-bearing editor that
     *  wraps this host (Monaco / Grid / Markdown / Mermaid / Link / Todo /
     *  RestClient / Notebook / LogView) reads + writes its own slot via
     *  `getEditorState<XxxSettings>(this.editorId)` /
     *  `setEditorState<XxxSettings>(this.editorId, value)` from IContentHost.
     *  Survives in-session editor switches (host outlives the editor) AND
     *  app restarts (rides host descriptor → `openFiles.txt`). Values are
     *  opaque to the host; each editor owns its own settings shape. */
    editorSettings?: Record<string, unknown>;

    // NOTE: removed from today's state
    //   - `editor` (which view to render — moved to whoever wraps this host)
    //   - `detectedContentEditor` (machinery deleted; replaced by a registry
    //      helper invoked on user action)
    //   - `compareMode` (C6 — moved to PagesModel.state.compareGroups, pair-
    //      level keyed by left page id; walkthrough 06 / CK1)
    //   - `deleted` (file-system concern, can move to TextFileIOModel)
}

// -----------------------------------------------------------------------------
// Class
// -----------------------------------------------------------------------------

export class TextFileModel implements IContentHost {
    readonly state: TOneState<TextFileHostState>;

    // Submodels (unchanged from today)
    readonly io: TextFileIOModel;
    readonly encryption: TextFileEncryptionModel;
    readonly script: ScriptPanelModel;
    readonly actions: TextFileActionsModel;

    /** Active content pipe (provider + transformers). */
    pipe: IContentPipe | null = null;

    /** Cache-storage handle injected by the wrapping editor. The editor's id
     *  is the prefix; the host writes its content cache as `<editor.id>-host.txt`
     *  via this handle. Null until the editor calls setStorage(). */
    private _storage: EditorStateStorage | null = null;

    setStorage(storage: EditorStateStorage): void {
        this._storage = storage;
        // Submodels that need persistent storage (io, script) re-read it on demand.
    }

    constructor(initial?: Partial<TextFileHostState>) {
        this.state = new TOneState({
            id: crypto.randomUUID(),
            content: "",
            language: "plaintext",
            modified: false,
            encrypted: false,
            temp: true,
            restored: false,
            ...initial,
        });
        this.io         = new TextFileIOModel(this as any);   // TODO: adapter shape
        this.encryption = new TextFileEncryptionModel(this as any);
        this.script     = new ScriptPanelModel(this as any);
        this.actions    = new TextFileActionsModel(this as any);
    }

    // -------------------------------------------------------------------------
    // IContentHost interface
    // -------------------------------------------------------------------------

    get id(): string { return this.state.get().id; }

    changeContent(content: string, byUser?: boolean): void {
        this.state.update((s) => {
            s.content = content;
            s.modified = true;
            // NOTE: encrypted detection moves to encryption submodel
            s.temp = s.temp && !byUser;
        });
        this.io.markModificationUnsaved();
        // NOTE: detection-of-structured-editor (today's scheduleDetection) is
        // deleted. Replacement: registry exposes `suggestEditorForContent(host)`
        // that the page calls on demand (e.g. when user clicks "Open as Link
        // Editor" or similar).
    }

    changeLanguage(language: string | undefined): void {
        this.state.update((s) => { s.language = language; });
    }

    // -------------------------------------------------------------------------
    // Editor-keyed view-state slot (HS1)
    // -------------------------------------------------------------------------

    getEditorState<T>(editorId: string): T | undefined {
        return this.state.get().editorSettings?.[editorId] as T | undefined;
    }

    setEditorState<T>(editorId: string, value: T): void {
        this.state.update((s) => {
            s.editorSettings = { ...(s.editorSettings ?? {}), [editorId]: value };
        });
    }

    async dispose(): Promise<void> {
        this.io.dispose();
        this.script.dispose();
        // NO cache cleanup here — page handles it on id release (C9).
        this.pipe?.dispose();
        this.pipe = null;
    }

    // -------------------------------------------------------------------------
    // File-level operations (used by Monaco/Grid/Link/etc. via direct host
    // access, or via future IFileBacked sub-trait — C1)
    // -------------------------------------------------------------------------

    async saveFile(saveAs?: boolean): Promise<void> { return this.io.saveFile(saveAs); }
    async renameFile(newName: string): Promise<void> { return this.io.renameFile(newName); }
    async restore(): Promise<void> {
        await this.io.restore();
        await this.script.restore(this.id);
        this.state.update((s) => { s.restored = true; });
    }

    get filePath(): string | undefined { return this.state.get().filePath; }
    get modified(): boolean { return this.state.get().modified; }
    get encrypted(): boolean { return this.encryption.encrypted; }

    // -------------------------------------------------------------------------
    // Persistence — used by the wrapping editor to round-trip the host
    // through session restore
    // -------------------------------------------------------------------------

    getRestoreData(): Partial<TextFileHostState> & { pipe?: unknown } {
        const data: Partial<TextFileHostState> & { pipe?: unknown } = {
            ...this.state.get(),
        };
        // Don't persist runtime-only fields
        delete (data as Partial<TextFileHostState>).restored;
        if (this.pipe) data.pipe = this.pipe.toDescriptor();
        return data;
    }

    applyRestoreData(data: Partial<TextFileHostState> & { pipe?: unknown }): void {
        // Reconstruct pipe from descriptor if present, then apply state.
        // TODO: factor with the wrapping editor's applyRestoreData so they
        // share the pipe-from-descriptor reconstruction.
    }

    // -------------------------------------------------------------------------
    // Static factory — used by editorRegistry.createEditorFromFile
    // -------------------------------------------------------------------------

    static async fromFile(filePath: string, pipe?: IContentPipe): Promise<TextFileModel> {
        const host = new TextFileModel({ filePath, temp: false });
        host.pipe = pipe ?? null;
        await host.restore();
        return host;
    }

    static empty(): TextFileModel {
        return new TextFileModel();
    }
}

// =============================================================================
// What's gone vs. today's TextFileModel
// =============================================================================
//
// REMOVED:
//   - extends EditorModel — host is no longer an editor
//   - acquireViewModel / releaseViewModel / acquireViewModelSync /
//      prepareViewModel — content-view system deleted
//   - getTextViewModel / focusEditor / revealLine / setHighlightText /
//      getSelectedText — these are Monaco-specific, move to MonacoEditor
//   - changeEditor — active editor is no longer a property of content
//   - editorToolbarRef{First,Last} / editorFooterRefLast / editorOverlayRef —
//      per-editor concerns, move to whichever editor needs them
//   - _pendingRevealLine / _pendingHighlightText — Monaco-specific, move to
//      MonacoEditor (C7)
//   - compareMode (C6 — moved to PagesModel.state.compareGroups; walkthrough 06 / CK1)
//   - setCompareMode method (forwarder retired with the host-level flag; walkthrough 06 / CK1)
//   - detectedContentEditor + detection timer + scheduleDetection /
//      cancelDetection — machinery deleted
//   - secondaryEditor getter/setter — not an editor concern
//   - page reference + setPage — not an editor concern
//   - beforeNavigateAway / onMainEditorChanged — not an editor concern
//   - handleKeyDown, runScript, openSearchInNavPanel, setCompareMode,
//      confirmRelease, canClose — moved to MonacoEditor or owning editor
//
// KEPT:
//   - content, language, id, filePath, modified, encoding, password,
//      encrypted, temp, restored, pipe
//   - io, encryption, script, actions submodels (with adapter cleanup)
//   - stateStorage
//   - saveFile, renameFile, restore, dispose, getRestoreData, applyRestoreData
//
// ADDED (HS1, 2026-05-21):
//   - editorSettings?: Record<string, unknown> on state — editor-keyed
//      view-state slot map; rides host descriptor for cross-restart survival;
//      outlives the editor for cross-switch survival.
//   - getEditorState<T>(editorId) / setEditorState<T>(editorId, value) —
//      the IContentHost slot accessors. Sync. Used by every text-bearing
//      editor's adoptHost seed + state-subscription mirror pattern.
//
// =============================================================================
