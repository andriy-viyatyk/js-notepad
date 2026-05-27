import { TDialogModel } from "../../core/state/model";

import { IEditorState } from "../../../shared/types";
import { editorRegistry } from "./v4/editorRegistry";
import { fs } from "../../api/fs";
import type { IContentPipe } from "../../api/types/io.pipe";
import { createPipeFromDescriptor } from "../../content/registry";
import type { PageModel } from "../../api/pages/PageModel";

export const getDefaultEditorModelState = (): IEditorState => ({
    id: crypto.randomUUID(),
    type: "textFile",
    title: "untitled",
    modified: false,
    language: undefined,
    filePath: undefined,
    editor: undefined,
});

export class EditorModel<T extends IEditorState = IEditorState, R = any> extends TDialogModel<T, R> {
    skipSave = false;
    getIcon?: () => React.ReactNode;
    noLanguage = false;
    /** In-memory data storage for scripts. Available on all page types. Does not persist to disk. */
    scriptData: Record<string, any> = {};

    /** Reference to the containing PageModel (for both main and secondary editors).
     *  Set via setPage(). */
    page: PageModel | null = null;

    /** Called when this editor is placed into or removed from a PageModel.
     *  Base implementation stores the reference. Subclasses can override to react. */
    setPage(page: PageModel | null): void {
        this.page = page;
    }

    /** Called on secondary editors when the page's main editor changes (navigation).
     *  Base implementation is a no-op. Override in subclasses to react
     *  (e.g., ArchiveEditorModel checks if new main editor was opened from this archive). */
    onMainEditorChanged(_newMainEditor: EditorModel | null): void {
        // Override in subclasses
    }

    /** Called on secondary editors when a panel is expanded (activePanel changes).
     *  Base implementation is a no-op. Override in subclasses to react
     *  (e.g., ExplorerEditorModel reveals the current file when "explorer" panel expands). */
    onPanelExpanded(_panelId: string): void {
        // Override in subclasses
    }

    /** Content pipe (provider + transformers). Owned by the page, disposed on close. */
    pipe: IContentPipe | null = null;

    get id() {
        return this.state.get().id;
    }

    get type() {
        return this.state.get().type;
    }

    get title() {
        return this.state.get().title;
    }

    get modified() {
        return this.state.get().modified;
    }

    get filePath() {
        return this.state.get().filePath;
    }

    get language() {
        return this.state.get().language;
    }

    /** Active secondary editor panel IDs. Setting adds/removes this model
     *  from the containing PageModel's secondaryEditors[]. */
    get secondaryEditor(): string[] | undefined {
        return this.state.get().secondaryEditor;
    }

    set secondaryEditor(value: string[] | undefined) {
        this.state.update((s) => { s.secondaryEditor = value; });
        if (value?.length) {
            this.page?.addSecondaryEditor(this);
        } else {
            this.page?.removeSecondaryEditorWithoutDispose(this);
        }
    }

    /**
     * Called before the page is replaced during navigation (navigatePageTo).
     * @param newModel — the model that is replacing this page. Inspect
     *   newModel.sourceLink to decide whether to keep secondaryEditor set.
     *
     * Base implementation clears secondaryEditor (model removed from sidebar).
     * Subclasses override to conditionally keep:
     *   - ArchiveEditorModel: keeps if newModel.sourceLink?.sourceId === this.id
     */
    beforeNavigateAway(_newModel: EditorModel): void {
        this.secondaryEditor = undefined;
    }

    /**
     * Prompt the user to save unsaved changes before releasing the editor.
     * Base implementation always returns true (no unsaved changes concept).
     * TextFileModel overrides to check modified state and prompt save dialog.
     */
    async confirmRelease(_closing?: boolean): Promise<boolean> {
        return true;
    }

    async dispose(): Promise<void> {
        this.pipe?.dispose();
        this.pipe = null;
        await fs.deleteCacheFiles(this.state.get().id);
    }

    async restore(): Promise<void> {
        // Editor-specific restore. Sidebar restore is PageModel's job.
    }

    getRestoreData(): Partial<T> {
        const data = JSON.parse(JSON.stringify(this.state.get()));
        if (this.pipe) {
            data.pipe = this.pipe.toDescriptor();
        }
        return data;
    }

    async saveState(): Promise<void> {
        // Editor-specific state save. Sidebar save is PageModel's job.
    }

    applyRestoreData(data: Partial<T>): void {
        // Reconstruct pipe from descriptor if present
        if (data.pipe) {
            try {
                this.pipe = createPipeFromDescriptor(data.pipe as any); // eslint-disable-line @typescript-eslint/no-explicit-any
            } catch {
                // Unknown provider/transformer type — fall back to filePath restore
                this.pipe = null;
            }
        }
        this.state.update((s) => {
            s.id = data.id || s.id;
            s.type = data.type || s.type;
            s.title = data.title || s.title;
            s.modified = data.modified || s.modified;
            s.filePath = data.filePath || s.filePath;
            s.editor = data.editor || s.editor;
            if ((data as any).sourceLink) s.sourceLink = (data as any).sourceLink; // eslint-disable-line @typescript-eslint/no-explicit-any
            if ((data as any).secondaryEditor) { // eslint-disable-line @typescript-eslint/no-explicit-any
                const se = (data as any).secondaryEditor; // eslint-disable-line @typescript-eslint/no-explicit-any
                s.secondaryEditor = typeof se === "string" ? [se] : se;
            }
        });
    }

    changeLanguage = (language: string | undefined) => {
        this.state.update((s) => {
            s.language = language;
            s.editor = editorRegistry.validateForLanguage(s.editor, language || "") as IEditorState["editor"];
        });
    };
}
