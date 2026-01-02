import { TDialogModel } from "../common/classes/model";
import { windowUtils } from "../common/utils";
import { IPage } from "../shared/types";

export const getDefaultPageModelState = (): IPage => ({
    id: windowUtils.uuid(),
    type: "textFile",
    title: "untitled",
    modified: false,
    language: undefined,
});

export class PageModel<T extends IPage = IPage, R = any> extends TDialogModel<T, R> {
    skipSave = false;

    get id() {
        return this.state.get().id;
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
        });
    }

    changeLanguage = (language: string | undefined) => {
        this.state.update((s) => {
            s.language = language;
        });
    };
}