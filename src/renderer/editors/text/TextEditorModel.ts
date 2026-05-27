import { TComponentState } from "../../core/state/state";
import { shell } from "../../api/shell";
import { fs as appFs } from "../../api/fs";
import { getDefaultEditorModelState, EditorModel } from "../base/EditorModel";
import { IEditorState, EditorView } from "../../../shared/types";
import { ScriptPanelModel } from "./ScriptPanel";
import { editorRegistry } from "../base/v4/editorRegistry";
import { TextFileEncryptionModel } from "./TextFileEncryptionModel";
import { TextFileIOModel } from "./TextFileIOModel";
import { TextFileActionsModel } from "./TextFileActionsModel";
import type { IContentHost } from "../base/IContentHost";
import type { IContentHost as V4ContentHost } from "../base/v4/IContentHost";
import type { EditorStateStorage } from "../base/EditorStateStorageContext";
import type { EditorStateStorage as V4EditorStateStorage } from "../base/v4/EditorStateStorage";
import type { HostDescriptor } from "../../../shared/persistence-v4";
import { ContentViewModelHost } from "../base/ContentViewModelHost";
import type { TextViewModel } from "./TextEditor";
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
    /** HS1 — editor-keyed view-state slot map. Each text-bearing editor that
     *  wraps this host reads + writes its own slot via
     *  `getEditorState<XxxSettings>(this.editorId)` /
     *  `setEditorState<XxxSettings>(this.editorId, value)` from IContentHost.
     *  Survives in-session editor switches (host outlives the editor) AND
     *  app restarts (rides host descriptor → `openFiles.txt`). */
    editorSettings?: Record<string, unknown>;
}

export const getDefaultTextFileEditorModelState = (): TextFileEditorModelState => ({
    ...getDefaultEditorModelState(),
    type: "textFile" as const,
    language: "plaintext",
    encoding: undefined,
    temp: true,
    // no stored state props
    content: "",
    deleted: false,
    password: undefined,
    encrypted: false,
    restored: false,
});

export class TextFileModel extends EditorModel<TextFileEditorModelState, void> implements IContentHost {
    // Content view model host
    private _vmHost = new ContentViewModelHost();

    readonly stateStorage: EditorStateStorage = {
        getState: async (id, name) => appFs.getCacheFile(id, name),
        setState: async (id, name, state) => { await appFs.saveCacheFile(id, state, name); },
    };

    async acquireViewModel(editorId: EditorView) {
        const vm = await this._vmHost.acquire(editorId, this);
        if (editorId === "monaco") {
            const textVm = vm as TextViewModel;
            if (this._pendingRevealLine !== null) {
                textVm.pendingRevealLine = this._pendingRevealLine;
                this._pendingRevealLine = null;
            }
            if (this._pendingHighlightText !== undefined) {
                textVm.pendingHighlightText = this._pendingHighlightText;
                this._pendingHighlightText = undefined;
            }
        }
        return vm;
    }

    releaseViewModel(editorId: EditorView) {
        this._vmHost.release(editorId);
    }

    acquireViewModelSync(editorId: EditorView) {
        return this._vmHost.acquireSync(editorId, this);
    }

    async prepareViewModel(editorId: EditorView) {
        await this._vmHost.prepare(editorId);
    }

    // =========================================================================
    // TextViewModel delegates (synchronous access via tryGet)
    // =========================================================================

    getTextViewModel(): TextViewModel | null {
        return (this._vmHost.tryGet("monaco") as TextViewModel) ?? null;
    }

    focusEditor() {
        this.getTextViewModel()?.focusEditor();
    }

    revealLine(lineNumber: number) {
        const vm = this.getTextViewModel();
        if (vm) {
            vm.revealLine(lineNumber);
        } else {
            this._pendingRevealLine = lineNumber;
        }
    }

    setHighlightText(text: string | undefined) {
        const vm = this.getTextViewModel();
        if (vm) {
            vm.setHighlightText(text);
        } else {
            this._pendingHighlightText = text;
        }
    }

    getSelectedText(): string {
        return this.getTextViewModel()?.getSelectedText() ?? "";
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
        // US-581 — v4 registry, host-driven detection. The host's content is
        // read inside `detectContentEditor`; empty/unloaded content yields no
        // suggestion (robust to early calls).
        const detected = editorRegistry.detectContentEditor(this as unknown as V4ContentHost);
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

    // Pending operations — applied when TextViewModel is first acquired
    private _pendingRevealLine: number | null = null;
    private _pendingHighlightText: string | undefined = undefined;

    // Portal refs
    editorToolbarRefFirst: HTMLDivElement | null = null;
    editorToolbarRefLast: HTMLDivElement | null = null;
    editorFooterRefLast: HTMLDivElement | null = null;
    editorOverlayRef: HTMLDivElement | null = null;

    setEditorToolbarRefFirst = (ref: HTMLDivElement | null) => {
        this.editorToolbarRefFirst = ref;
    };

    setEditorToolbarRefLast = (ref: HTMLDivElement | null) => {
        this.editorToolbarRefLast = ref;
    };

    setFooterRefLast = (ref: HTMLDivElement | null) => {
        this.editorFooterRefLast = ref;
    };

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
        // Reconstruct pipe from descriptor if present
        if (data.pipe) {
            try {
                this.pipe = createPipeFromDescriptor(data.pipe as any); // eslint-disable-line @typescript-eslint/no-explicit-any
            } catch {
                this.pipe = null;
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
    };

    // =========================================================================
    // EPIC-028 host primitives (US-551) — consumed by native MonacoEditor.
    // =========================================================================

    /** v4 IContentHost serialization. Wraps the legacy flat shape into a
     *  HostDescriptor so MonacoEditor.getRestoreData can attach it as `host`.
     *  Strips runtime-only / security-sensitive fields (content lives in
     *  cache file; password never persists; encrypted/restored/deleted are
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
        if (s.secondaryEditor !== undefined) metadata.secondaryEditor = s.secondaryEditor;
        if (s.sourceLink !== undefined) metadata.sourceLink = s.sourceLink;
        if (s.editorSettings !== undefined) metadata.editorSettings = s.editorSettings;
        return {
            kind: "textFile",
            state: metadata,
            pipe: this.pipe?.toDescriptor(),
        };
    }

    /** v4 IContentHost storage hookup. Stub for US-551 — submodels still write
     *  via appFs.getCacheFile / saveCacheFile keyed by `state.id`. Real
     *  consumption arrives in US-559 when submodels accept the storage handle. */
    setStorage(_storage: V4EditorStateStorage): void {
        void _storage;
    }

    /** HS1 — read editor-keyed view-state slot. Sync. */
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
        await super.saveState();
    }

    async restore() {
        await this.io.restore();
        await this.script.restore(this.state.get().id);
        await super.restore();
        this.detectContentEditor();
        this.state.update((s) => {
            s.restored = true;
        });
    }

    async dispose(): Promise<void> {
        this.cancelDetection();
        this._vmHost.disposeAll();
        this.io.dispose();
        this.script.dispose();
        await super.dispose();
    }

    // =========================================================================
    // Flat API delegates — preserve external API
    // =========================================================================

    // IO delegates
    saveFile = (saveAs?: boolean) => this.io.saveFile(saveAs);
    renameFile = (newName: string) => this.io.renameFile(newName);
    applyRenamedPath = (newPath: string) => this.io.applyRenamedPath(newPath);

    // Encryption delegates
    encript = (password: string) => this.encryption.encript(password);
    encryptWithCurrentPassword = () => this.encryption.encryptWithCurrentPassword();
    decrypt = (password: string) => this.encryption.decrypt(password);
    showEncryptionDialog = () => this.encryption.showEncryptionDialog();
    makeUnencrypted = () => this.encryption.makeUnencrypted();
    alertEncryptionError = (err: Error) => this.encryption.alertEncryptionError(err);

    // Actions delegates
    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => this.actions.handleKeyDown(e);
    openSearchInNavPanel = () => this.actions.openSearchInNavPanel();
    runScript = (all?: boolean) => this.actions.runScript(all);
    runRelatedScript = (all?: boolean) => this.actions.runRelatedScript(all);
    confirmRelease = async (closing?: boolean) => {
        const baseOk = await super.confirmRelease(closing);
        if (!baseOk) return false;
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

export function isTextFileModel(
    model: EditorModel<any, any>,
): model is TextFileModel {
    return model.type === "textFile";
}
