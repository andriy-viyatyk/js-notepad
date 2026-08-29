import { TComponentState, TOneState } from "../../core/state/state";
import { TDialogModel } from "../../core/state/model";
import { shell } from "../../api/shell";
import { ui } from "../../api/ui";
import { fs as appFs } from "../../api/fs";
import type { MenuItem } from "../../uikit";
import { textFileMenuItems } from "../shared/editor-menu-items";
import { IEditorState, EditorView } from "../../../shared/types";
import { ScriptPanelModel } from "./ScriptPanel";
import { editorRegistry } from "../base/editorRegistry";
import { TextFileEncryptionModel } from "./TextFileEncryptionModel";
import { TextFileIOModel } from "./TextFileIOModel";
import { TextFileActionsModel } from "./TextFileActionsModel";
import type { IContentHost } from "../base/IContentHost";
import type { EditorStateStorage } from "../base/EditorStateStorage";
import type { HostDescriptor } from "../../../shared/persistence";
import type { IContentPipe } from "../../api/types/io.pipe";
import type { IPageHost } from "../../api/pages/IPageHost";
import { createPipeFromDescriptor } from "../../content/registry";

export interface TextFileEditorModelState extends IEditorState {
    content: string;
    deleted: boolean;
    encoding?: string;
    password?: string;
    encrypted?: boolean;
    restored: boolean;
    temp: boolean;
    /** Editor detected from content (e.g., "notebook-view" when JSON has "type": "note-editor") */
    detectedContentEditor?: EditorView;
    /** Git repo membership (EPIC-030). Detected once on filePath resolve when
     *  the "Git integration" setting is on. `undefined` = not yet checked;
     *  `null` = checked, not a repo (or git unavailable). Not persisted —
     *  re-detected on restore, like `detectedContentEditor`. */
    gitRepo?: { root: string; branch: string } | null;
    /** HS1 — editor-keyed view-state slot map. Each text-bearing editor that
     *  wraps this host reads + writes its own slot via
     *  `getEditorState<XxxSettings>(this.editorId)` /
     *  `setEditorState<XxxSettings>(this.editorId, value)` from IContentHost.
     *  Survives in-session editor switches (host outlives the editor) AND
     *  app restarts (rides host descriptor → `openFiles.txt`). */
    editorSettings?: Record<string, unknown>;
}

export const getDefaultTextFileEditorModelState = (): TextFileEditorModelState => ({
    id: crypto.randomUUID(),
    type: "textFile" as const,
    title: "untitled",
    modified: false,
    filePath: undefined,
    editor: undefined,
    // TextFileModel-specific defaults:
    language: "plaintext",
    encoding: undefined,
    temp: true,
    content: "",
    deleted: false,
    password: undefined,
    encrypted: false,
    restored: false,
});

export class TextFileModel extends TDialogModel<TextFileEditorModelState, void> implements IContentHost {
    // =========================================================================
    // Host-state plumbing (folded in from the former `editors/base/EditorModel.ts`).
    // =========================================================================

    /** When true, the page's `saveState` driver skips this host. */
    skipSave = false;
    /** Optional tab-icon contribution. */
    getIconElement?: () => Element | undefined;
    /** When true, the page UI hides the language dropdown. */
    noLanguage = false;
    /** In-memory data storage for scripts. Available on all page types. Does
     *  not persist to disk. */
    scriptData: Record<string, unknown> = {};

    /** Reference to the containing owner host. Set by the wrapping editor's
     *  `setPage` so the host can read sibling editors / navigator state. */
    page: IPageHost | null = null;

    /** Live pipe channel for native views; deliberately not part of editor state. */
    readonly pipeState = new TOneState<IContentPipe | null>(null);

    /**
     * Content pipe (provider + transformers). Owned by the page, disposed on
     * close. Survives editor switches because the host outlives the editor.
     *
     * Backed by `pipeState` rather than by its own field, so the value and the channel cannot
     * diverge. When this was a plain field kept in step by two explicit `pipeState.set` calls in
     * `TextFileIOModel`, `PagesLifecycleModel` assigned `editor.pipe` directly on the ordinary
     * file-open path and the channel was never told — so the footer's provider badge was missing
     * on every normally opened file and appeared only after a Save As or rename. An accessor makes
     * that whole class of miss impossible instead of fixing the one caller.
     */
    get pipe(): IContentPipe | null {
        return this.pipeState.get();
    }

    set pipe(pipe: IContentPipe | null) {
        this.pipeState.set(pipe);
    }

    /** Replace the source pipe through the paired source/cache owner. */
    setPipe(pipe: IContentPipe | null): void {
        this.io.setPrimary(pipe);
    }

    setPage(page: IPageHost | null): void {
        this.page = page;
    }

    // ── Standard getters (proxy state fields) ───────────────────────────

    get id(): string {
        return this.state.get().id;
    }

    get type(): string {
        return this.state.get().type;
    }

    get title(): string {
        return this.state.get().title;
    }

    get modified(): boolean {
        return this.state.get().modified;
    }

    get filePath(): string | undefined {
        return this.state.get().filePath;
    }

    get language(): string | undefined {
        return this.state.get().language;
    }

    /** Active secondary view panel IDs. The host's `secondaryView` field
     *  is rarely consumed (panels live on the wrapping editor's own state);
     *  the setter is preserved as a pure state mutator. */
    get secondaryView(): string[] | undefined {
        return this.state.get().secondaryView;
    }

    set secondaryView(value: string[] | undefined) {
        this.state.update((s) => { s.secondaryView = value; });
    }

    changeLanguage = (language: string | undefined): void => {
        this.state.update((s) => {
            s.language = language;
            s.editor = editorRegistry.validateForLanguage(s.editor, language || "") as EditorView | undefined;
        });
    };

    // =========================================================================
    // IContentHost storage hookup (cache-file passthrough).
    // =========================================================================

    readonly stateStorage: EditorStateStorage = {
        getState: async (id, name) => appFs.getCacheFile(id, name),
        setState: async (id, name, state) => { await appFs.saveCacheFile(id, state, name); },
    };


    focusEditor(): void {
        this.page?.mainEditorInstance?.focus();
    }

    revealLine(lineNumber: number): void {
        const editor = this.page?.mainEditorInstance as unknown as { revealLine?: (n: number) => void } | undefined;
        editor?.revealLine?.(lineNumber);
    }

    setHighlightText(text: string | undefined): void {
        const editor = this.page?.mainEditorInstance as unknown as { setHighlightText?: (t: string | undefined) => void } | undefined;
        editor?.setHighlightText?.(text);
    }

    /** Sync best-effort selection probe. MonacoEditor exposes async
     *  `getSelectedText()` via its queue — callers needing selection-aware
     *  behavior should prefer the async path on the editor. This sync
     *  fallback returns "" for non-Monaco editors and for queue-async
     *  contexts; consumers (e.g., `TextFileActionsModel.runScript`) interpret
     *  "" as "no selection — run on full content," which is safe. */
    getSelectedText(): string {
        return "";
    }

    // Submodels
    io = new TextFileIOModel(this);
    encryption = new TextFileEncryptionModel(this);
    actions = new TextFileActionsModel(this);
    script = new ScriptPanelModel(this);

    // =========================================================================
    // Content-based editor detection
    // =========================================================================

    private _detectTimer: ReturnType<typeof setTimeout> | null = null;

    /** Run content detection immediately and update state if changed. */
    private detectContentEditor = () => {
        const detected = editorRegistry.detectContentEditor(this as unknown as IContentHost);
        if (detected !== this.state.get().detectedContentEditor) {
            this.state.update((s) => { s.detectedContentEditor = detected as EditorView | undefined; });
        }
    };

    /** Schedule detection after a debounce delay (for content changes). */
    private scheduleDetection = () => {
        if (this._detectTimer) clearTimeout(this._detectTimer);
        this._detectTimer = setTimeout(() => {
            this._detectTimer = null;
            this.detectContentEditor();
        }, 2500);
    };

    /** Cancel any pending detection timer. */
    private cancelDetection = () => {
        if (this._detectTimer) {
            clearTimeout(this._detectTimer);
            this._detectTimer = null;
        }
    };

    // =========================================================================
    // Git repo detection (EPIC-030 / US-610)
    // =========================================================================

    /** Detect git repo membership for the current filePath, gated by the
     *  "Git integration" setting. Fire-and-forget; writes host state. Detection
     *  is dir-cached in the renderer git API, so siblings don't re-spawn git. */
    detectGitRepo = async () => {
        const { git } = await import("../../api/git");
        const filePath = this.state.get().filePath;
        const info = await git.detectRepoForFile(filePath);
        const next = info ?? null;
        const cur = this.state.get().gitRepo;
        if (cur?.root !== next?.root || cur?.branch !== next?.branch) {
            this.state.update((s) => { s.gitRepo = next; });
        }
    };

    editorOverlayRef: HTMLDivElement | null = null;

    setEditorOverlayRef = (ref: HTMLDivElement | null) => {
        this.editorOverlayRef = ref;
    };

    // =========================================================================
    // Encryption delegates (getters)
    // =========================================================================

    get encrypted(): boolean {
        return this.encryption.encrypted;
    }

    get decrypted(): boolean {
        return this.encryption.decrypted;
    }

    get withEncryption(): boolean {
        return this.encryption.withEncryption;
    }

    // =========================================================================
    // Core state methods (remain on TextFileModel)
    // =========================================================================

    changeContent = (newContent: string, byUser?: boolean) => {
        this.state.update((state) => {
            state.content = newContent;
            state.modified = true;
            state.encrypted = shell.encryption.isEncrypted(newContent);
            state.temp = state.temp && !byUser;
        });
        this.io.markModificationUnsaved();
        this.scheduleDetection();
    };

    changeEditor = (editor: EditorView) => {
        const language = this.state.get().language ?? "";
        const validated = editorRegistry.validateForLanguage(editor, language) as EditorView | undefined;
        this.state.update((s) => {
            s.editor = validated;
        });
        this.detectContentEditor();
    };

    getRestoreData() {
        const {
            content,
            deleted,
            password,
            encrypted,
            restored,
            detectedContentEditor,
            ...pageData
        } = this.state.get();
        if (this.pipe) {
            pageData.pipe = this.pipe.toDescriptor();
        }
        return pageData;
    }

    applyRestoreData = (data: Partial<TextFileEditorModelState>): void => {
        let restoredPipe: IContentPipe | null | undefined;
        if (data.pipe) {
            try {
                restoredPipe = createPipeFromDescriptor(data.pipe as any); // eslint-disable-line @typescript-eslint/no-explicit-any
            } catch {
                restoredPipe = null;
            }
        }
        this.state.update((s) => {
            s.id = data.id || s.id;
            s.type = data.type || s.type;
            s.title = data.title || s.title;
            s.modified = data.modified || s.modified;
            s.filePath = data.filePath || s.filePath;
            s.language = data.language || s.language;
            s.encoding = data.encoding || s.encoding;
            s.editor = data.editor || s.editor;
            s.temp =
                !s.filePath && (data.temp !== undefined ? data.temp : s.temp);
            if (data.editorSettings !== undefined) s.editorSettings = data.editorSettings;
        });
        // State (especially the persistent page id) must be restored before the
        // paired cache pipe is created for this source pipe.
        if (restoredPipe !== undefined) this.setPipe(restoredPipe);
    };


    /** IContentHost serialization. Builds a `HostDescriptor` so
     *  `MonacoEditor.getRestoreData` can attach it as `host`. Strips
     *  runtime-only / security-sensitive fields (content lives in the cache
     *  file; password never persists; encrypted/restored/deleted are
     *  reconstructed at restore time). */
    getDescriptor(): HostDescriptor {
        const s = this.state.get();
        const metadata: Record<string, unknown> = {
            id: s.id,
            type: s.type,
            title: s.title,
            modified: s.modified,
            language: s.language,
            filePath: s.filePath,
            encoding: s.encoding,
            temp: s.temp,
        };
        if (s.secondaryView !== undefined) metadata.secondaryView = s.secondaryView;
        if (s.sourceLink !== undefined) metadata.sourceLink = s.sourceLink;
        if (s.editorSettings !== undefined) metadata.editorSettings = s.editorSettings;
        return {
            kind: "textFile",
            state: metadata,
            pipe: this.pipe?.toDescriptor(),
        };
    }

    /** Read editor-keyed view-state slot. Sync. */
    getEditorState<T>(editorId: string): T | undefined {
        return this.state.get().editorSettings?.[editorId] as T | undefined;
    }

    /** HS1 — write editor-keyed view-state slot. Sync. The shallow rebuild
     *  preserves immutability assumptions for downstream subscribers. */
    setEditorState<T>(editorId: string, value: T): void {
        this.state.update((s) => {
            s.editorSettings = {
                ...(s.editorSettings ?? {}),
                [editorId]: value as unknown,
            };
        });
    }

    /** Static factory: rebuild a TextFileModel from a HostDescriptor.
     *  Construct via newTextFileModelFromState (sync) and re-apply pipe via
     *  applyRestoreData; restore() is the caller's job. */
    static async fromDescriptor(desc: HostDescriptor): Promise<TextFileModel> {
        if (desc.kind !== "textFile") {
            throw new Error(`TextFileModel.fromDescriptor: unsupported kind "${desc.kind}"`);
        }
        const baseState = desc.state as Partial<IEditorState>;
        const model = newTextFileModelFromState(baseState);
        model.applyRestoreData({ ...baseState, pipe: desc.pipe });
        return model;
    }

    // =========================================================================
    // Lifecycle
    // =========================================================================

    async saveState(): Promise<void> {
        await this.io.saveState();
    }

    async restore() {
        await this.io.restore();
        await this.script.restore(this.state.get().id);
        this.detectContentEditor();
        void this.detectGitRepo();
        this.state.update((s) => {
            s.restored = true;
        });
    }

    async dispose(): Promise<void> {
        this.cancelDetection();
        this.io.dispose();
        this.script.dispose();
        await appFs.deleteCacheFiles(this.state.get().id);
        // Drain the model's DisposableStore after existing teardown.
        await super.dispose();
    }

    // =========================================================================
    // Flat API delegates — preserve external API
    // =========================================================================

    // IO delegates
    saveFile = (saveAs?: boolean) => this.io.saveFile(saveAs);
    renameFile = (newName: string) => this.io.renameFile(newName);
    applyRenamedPath = (newPath: string) => this.io.applyRenamedPath(newPath);

    /** Prompt for a new file name, then rename. Moved off the page tab so the
     *  text-file context menu can be contributed by the host (`onGetMenuItems`). */
    promptRename = async (): Promise<void> => {
        const inputResult = await ui.input("Enter new file name:", {
            title: "Rename File",
            value: this.state.get().title,
            buttons: ["Rename", "Cancel"],
            selectAll: true,
        });
        if (inputResult?.button === "Rename" && inputResult.value) {
            await this.renameFile(inputResult.value);
        }
    };

    /** Context-menu items for any editor whose content host is this text-file
     *  model (IContentHost.onGetMenuItems). The single home of the text-file
     *  menu — Save / Save As / Rename / file-path items / encryption group. */
    onGetMenuItems = (): MenuItem[] => textFileMenuItems(this);

    // Encryption delegates
    encript = (password: string) => this.encryption.encript(password);
    encryptWithCurrentPassword = () => this.encryption.encryptWithCurrentPassword();
    decrypt = (password: string) => this.encryption.decrypt(password);
    showEncryptionDialog = (message?: string) => this.encryption.showEncryptionDialog(message);
    makeUnencrypted = () => this.encryption.makeUnencrypted();
    alertEncryptionError = (err: Error) => this.encryption.alertEncryptionError(err);

    // Actions delegates
    handleKeyDown = (e: KeyboardEvent) => this.actions.handleKeyDown(e);
    openSearchInNavPanel = () => this.actions.openSearchInNavPanel();
    runScript = (all?: boolean) => this.actions.runScript(all);
    runRelatedScript = (all?: boolean) => this.actions.runRelatedScript(all);
    confirmRelease = async (_closing?: boolean): Promise<boolean> => {
        return this.actions.confirmRelease();
    };
    canClose = () => this.actions.canClose();
}

export function newTextFileModel(filePath?: string): TextFileModel {
    const editor = editorRegistry.resolveId(filePath) as EditorView | undefined;
    const state = {
        ...getDefaultTextFileEditorModelState(),
        ...(filePath ? { filePath } : {}),
        editor,
    };

    return new TextFileModel(new TComponentState(state));
}

export function newTextFileModelFromState(
    state: Partial<IEditorState>,
): TextFileModel {
    const initialState: TextFileEditorModelState = {
        ...getDefaultTextFileEditorModelState(),
        ...state,
    };
    return new TextFileModel(new TComponentState(initialState));
}

/** Narrow an arbitrary editor handle to `TextFileModel` via the
 *  `state.type === "textFile"` discriminator. Callers should prefer
 *  accessing the host through the editor's `contentHost` getter when they
 *  have an `EditorModel` in hand. */
export function isTextFileModel(model: unknown): model is TextFileModel {
    if (!model || typeof model !== "object") return false;
    const state = (model as { state?: { get?: () => { type?: string } } }).state;
    return state?.get?.().type === "textFile";
}
