import { TDialogModel } from "../../core/state/model";
import { uuid } from "../../core/utils/node-utils";
import { IPage } from "../../../shared/types";
import { editorRegistry } from "../registry";
import { NavPanelModel } from "../../features/navigation/nav-panel-store";
import { filesModel } from "../../store/files-store";

export const getDefaultPageModelState = (): IPage => ({
    id: uuid(),
    type: "textFile",
    title: "untitled",
    modified: false,
    language: undefined,
    filePath: undefined,
    editor: undefined,
});

export class PageModel<T extends IPage = IPage, R = any> extends TDialogModel<T, R> {
    skipSave = false;
    getIcon?: () => React.ReactNode;
    noLanguage = false;
    navPanel: NavPanelModel | null = null;
    /** Flag for restore(): NavPanel needs to be created from cache */
    protected needsNavPanelRestore = false;

    get id() {
        return this.state.get().id;
    }

    get type() {
        return this.state.get().type;
    }

    async confirmRelease(): Promise<boolean> {
        return true;
    }

    async dispose(): Promise<void> {
        this.navPanel?.dispose();
        await filesModel.deleteCacheFiles(this.state.get().id);
    }

    async restore(): Promise<void> {
        // Restore NavPanel from cache if page had one.
        // needsNavPanelRestore: set by applyRestoreData (app startup path)
        // hasNavPanel on state: set by newPageModelFromState (drag/drop path)
        if (this.needsNavPanelRestore || this.state.get().hasNavPanel) {
            this.needsNavPanelRestore = false;
            const navPanel = new NavPanelModel("");
            await navPanel.restore(this.id);
            this.navPanel = navPanel;
            // Set hasNavPanel AFTER navPanel object is ready, so React sees both together
            this.state.update((s) => {
                s.hasNavPanel = true;
            });
        }
    }

    getRestoreData(): Partial<T> {
        const data = JSON.parse(JSON.stringify(this.state.get()));
        if (this.navPanel) {
            data.hasNavPanel = true;
        }
        return data;
    }

    async saveState(): Promise<void> {
        await this.navPanel?.flushSave();
    }

    applyRestoreData(data: Partial<T>): void {
        this.needsNavPanelRestore = !!data.hasNavPanel;
        this.state.update((s) => {
            s.id = data.id || s.id;
            s.type = data.type || s.type;
            s.title = data.title || s.title;
            s.modified = data.modified || s.modified;
            s.filePath = data.filePath || s.filePath;
            s.editor = data.editor || s.editor;
        });
    }

    changeLanguage = (language: string | undefined) => {
        this.state.update((s) => {
            s.language = language;
            s.editor = editorRegistry.validateForLanguage(s.editor, language || "");
        });
    };
}
