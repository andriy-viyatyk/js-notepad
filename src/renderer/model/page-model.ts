import { TDialogModel } from "../common/classes/model";
import { uuid } from "../common/node-utils";
import { IPage } from "../../shared/types";

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

    get id() {
        return this.state.get().id;
    }

    get type() {
        return this.state.get().type;
    }

    async restore(): Promise<void> {
        // Override in subclasses if needed
    }

    getRestoreData(): Partial<T> {
        return this.state.get();
    }

    saveState(): Promise<void> {
        return Promise.resolve();
    }

    applyRestoreData(data: Partial<T>): void {
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
        });
    };
}