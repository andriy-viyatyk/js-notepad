import type { TComponentState } from "../../core/state/state";
import { EditorModel } from "../base/EditorModel";
import type { EditorDescriptor, HostDescriptor } from "../../../shared/persistence";
import { CONTENT_HOST_TRAIT, type IContentHostTrait } from "../base/editor-traits";
import type { IContentHost } from "../base/IContentHost";
import { editorRegistry } from "../base/editorRegistry";
import { fpBasename } from "../../core/utils/file-path";
import { ui } from "../../api/ui";
import { TextFileModel, newTextFileModel, isTextFileModel } from "../text/TextEditorModel";
import { BoardEditorModel, type BoardEditorState } from "./BoardEditorModel";
import { boardEditorId } from "./custom-editor-registry";
import { errMessage } from "../../../shared/utils";

/**
 * Content-host board (EPIC-043). A board that edits a file through Persephone's content host —
 * the same `TextFileModel` (`IContentHost`) that backs Monaco / Grid / Notebook. Persephone owns
 * the pipe, encoding, encryption, auto-save cache, and dirty state; the board works with the
 * content over the `persephone.host.*` bridge (US-846). It switches with the built-in editors by
 * TRANSFERRING the shared host (no reload / no data loss), via `CONTENT_HOST_TRAIT`.
 *
 * Subclass of `BoardEditorModel`: inherits the iframe / trust / toolbar / automation / icon
 * machinery unchanged, and adds only the host composition (template: `MonacoEditor`). Built in the
 * `board-editor:<root>` construction branch when the manifest declares `editorKind: "content-host"`
 * (US-845).
 */
export class BoardContentEditorModel extends BoardEditorModel {
    /** A real editor whose dirty state Persephone tracks (base board is `true`). */
    override skipSave = false;

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    constructor(state: TComponentState<BoardEditorState>) {
        super(state);
        this.own(() => this._hostStateUnsub?.());
        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) {
                    throw new Error("Host already extracted from BoardContentEditorModel");
                }
                this._hostStateUnsub?.();
                this._hostStateUnsub = null;
                this._host = null;
                return host as unknown as IContentHost;
            },
        };
        this.traits.add(CONTENT_HOST_TRAIT, trait);
    }

    // ── Host accessors ──────────────────────────────────────────────────

    override get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
    }

    /** A content-host board is ALWAYS a custom file editor (it owns a content host) — even on an
     *  untitled page with no file path yet. So it keeps the virtual `board-editor:<root>` id
     *  (never the plain `board-view`), which both lets the switch widget highlight it and lets
     *  `switchMainEditor` recognize the board boundary when switching back to a built-in editor.
     *  Persistence still pins `"board-view"` via `getRestoreData`, so restore is unaffected. */
    override get editorId(): string {
        const root = this.state.get().boardRoot;
        return root ? boardEditorId(root) : "board-view";
    }

    /** Switch options while ON the board: ALL built-in editors that accept the host (to switch
     *  back) plus this board. Uses the SAME `findEditorsAccepting(host)` call the built-in
     *  editors use, so the board's option list is identical to theirs — e.g. a `*.todo.json`
     *  board offers `Text Editor` + `ToDo` + `Todo`, matching what the built-in Todo editor
     *  shows (US-886). UNLIKE the base board, NO `isPlainLocalPath` gate — content-host boards
     *  edit https/archive/encrypted files too (CH4). `findEditorsAccepting` reads the host's
     *  `filePath ?? title`, so an untitled page stays resolvable. Before the host is adopted
     *  (pre-restore window) it falls back to the single natural built-in editor. */
    override findCompatibleEditors(): string[] {
        const root = this.state.get().boardRoot;
        if (!root) return [];
        const builtins = this._host
            ? editorRegistry.findEditorsAccepting(this._host as unknown as IContentHost)
            : [editorRegistry.resolveId(this.currentFilePath() ?? this.title) ?? "monaco"];
        return [...builtins, boardEditorId(root)];
    }

    // ── Host transfer on editor switch (template: MonacoEditor.switchFrom) ──

    override switchFrom(oldEditor: EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `BoardContentEditorModel.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isTextFileModel(host)) {
            throw new Error(
                "BoardContentEditorModel.switchFrom: extracted host is not a TextFileModel",
            );
        }
        // Preserve cache-file id across the swap (<id>-host.txt etc.) — like Monaco.
        this.state.update((s) => { s.id = oldEditor.id; });
        // `host.state.editor` is stamped "board-view" inside `adoptHost` (Concern C1).
        this.adoptHost(host);
    }

    /** Adopt a host (from `switchFrom`, from US-845 construction, or from `restore`). Wires host
     *  state → `descriptorChanged` for persistence, copies title/id, forwards `page`. */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._hostStateUnsub?.();
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );
        const { filePath, title, id } = host.state.get();
        this.state.update((s) => {
            // Tab shows the FILE name; the board's own icon remains state-derived.
            s.title = title || (filePath ? fpBasename(filePath) : s.title);
            if (id) s.id = id;
        });
        // Mark the host as board-rendered for introspection consistency (Concern C1).
        // "board-view" is the valid EditorView token (there is no "board"); it is never
        // persisted (`getDescriptor` omits `editor`) and is overwritten by the receiving
        // built-in's `switchFrom` on a switch away.
        host.state.update((s) => {
            if (s.editor !== "board-view") s.editor = "board-view";
        });
        if (this.page) host.setPage(this.page);
    }

    override setPage(page: Parameters<EditorModel["setPage"]>[0]): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    // ── Lifecycle ───────────────────────────────────────────────────────

    /** Board validation (trust, refreshBoards, legacy-throw) via `super.restore()`, THEN ensure
     *  the content host. Prefers an already-adopted host (US-845 pre-builds the pipe for non-local
     *  files); otherwise builds a fallback from `_pendingHost` or the local file path. */
    override async restore(): Promise<void> {
        await super.restore();
        try {
            if (!this._host) {
                this._host = this._pendingHost
                    ? await TextFileModel.fromDescriptor(this._pendingHost)
                    : newTextFileModel(this.currentFilePath() ?? "");
            }
            if (!this._host.state.get().restored) {
                await this._host.restore();
            }
            this.adoptHost(this._host);
            this.state.update((s) => { s.contentHostError = undefined; });
        } catch (err) {
            const message = errMessage(err, "Failed to restore board content.");
            ui.notify(message, "error");
            // Drives the host-restore-failure empty state in the view (US-846).
            this.state.update((s) => { s.contentHostError = message; });
        }
        this._pendingHost = undefined;
    }

    // ── Persistence ─────────────────────────────────────────────────────

    /** Base board pins `editorId: "board-view"` + the full board state; we add the host
     *  descriptor. `d.host` present on a `board-view` descriptor is the content-host-vs-plain
     *  discriminator at restore (US-845's `restorePage` branch). */
    override getRestoreData(): EditorDescriptor {
        const data = super.getRestoreData();
        data.host = this._host?.getDescriptor();
        return data;
    }

    override applyRestoreData(
        data: Parameters<EditorModel<BoardEditorState>["applyRestoreData"]>[0],
    ): void {
        super.applyRestoreData(data);
        if (data.host) this._pendingHost = data.host;
    }

    // ── Save / dirty (delegate to host) ─────────────────────────────────

    /** Dirty lives on the composed host, not on this editor's own state (which never
     *  sets `modified`). Without this override, `PageModel.modified` — which aggregates
     *  the raw editor instances, not their unwrapped hosts — reports false for a dirty
     *  content-host board (the tab dot was right, `list_pages` was wrong). */
    override get modified(): boolean {
        return this._host?.modified ?? false;
    }

    override async saveState(): Promise<void> {
        await this._host?.io.saveState();
    }

    override async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    // ── Content bridge (US-846) — the view (`BoardWebview`) owns the echo-guard ──

    /** Apply content the board wrote (`persephone.host.setContent`). `byUser` true → marks the file
     *  modified + schedules the autosave cache, exactly like a Monaco/Grid user edit. */
    hostChangeContent(content: string): void {
        this._host?.changeContent(content, true);
    }

    /** Save through the pipe (Ctrl+S fallback or `persephone.host.save()`). */
    hostSave(): void {
        void this._host?.saveFile();
    }

    // ── No busy for content-host boards (CH7) ───────────────────────────

    /** The host TRANSFERS OUT on switch, so a surviving host-less board is a broken zombie, and
     *  duplicating the host would give two unsynchronized writers of the same file. So no busy. */
    override setBusy(_busy: boolean): void {
        console.warn(
            "[BoardContentEditorModel] setBoardBusy is not supported for content-host boards — ignoring.",
        );
    }

    override keepAliveOnNavigation(): boolean {
        return false;
    }

    override survivesNavigation(): boolean {
        return false;
    }

    // ── Dispose (host first, then board teardown) ───────────────────────

    override async dispose(): Promise<void> {
        this._hostStateUnsub?.();
        this._hostStateUnsub = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}
