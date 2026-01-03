import { TComponentState } from "../../common/classes/state";
import { debounce, windowUtils } from "../../common/utils";
import { showConfirmationDialog } from "../../dialogs/dialogs/ConfirmationDialog";
import { api } from "../../ipc/renderer/api";
import { filesModel } from "../../model/files-model";
import { getLanguageByExtension } from "../../model/language-mapping";
import { getDefaultPageModelState, PageModel } from "../../model/page-model";
import { pagesModel } from "../../model/pages-model";
import { scriptRunner } from "../../script/ScriptRunner";
import { IPage } from "../../shared/types";

export interface TextFilePageModelState extends IPage {
    content: string;
}

export const getDefaultTextFilePageModelState = (): TextFilePageModelState => ({
    ...getDefaultPageModelState(),
    type: "textFile" as const,
    filePath: "",
    content: "",
    language: "plaintext",
});

export class TextFileModel extends PageModel<TextFilePageModelState, void> {
    private modificationSaved = true;

    changeContent = (newContent: string) => {
        this.state.update((state) => {
            state.content = newContent;
            state.modified = true;
        });
        this.modificationSaved = false;
        this.saveModifications(newContent);
    };

    getRestoreData() {
        const { content, ...pageData } = this.state.get();
        return pageData;
    }

    saveState = async (): Promise<void> => {
        if (!this.modificationSaved) {
            await this.doSaveModifications(this.state.get().content);
        }
    };

    applyRestoreData = (data: Partial<TextFilePageModelState>): void => {
        this.state.update((s) => {
            s.id = data.id || s.id;
            s.type = data.type || s.type;
            s.title = data.title || s.title;
            s.modified = data.modified || s.modified;
            s.filePath = data.filePath || s.filePath;
            s.language = data.language || s.language;
        });
        this.restore();
    };

    canClose = async (): Promise<boolean> => {
        const { modified, title } = this.state.get();

        if (this.skipSave) {
            return true;
        }

        let result = true;
        if (modified) {
            pagesModel.showPage(this.state.get().id);
            const confirmBt = await showConfirmationDialog({
                title: "Unsaved Changes",
                message: `Do you want to save the changes you made to "${title}"?`,
                buttons: ["Save", "Don't Save", "Cancel"],
            });

            switch (confirmBt) {
                case "Save":
                    result = await this.saveFile();
                    break;
                case "Don't Save":
                    await filesModel.deleteCacheFile(this.state.get().id);
                    result = true;
                    break;
                default:
                    result = false;
                    break;
            }
        }
        if (!result) {
            pagesModel.focusPage(this as unknown as PageModel);
        }
        return result;
    };

    saveFile = async (saveAs?: boolean): Promise<boolean> => {
        const { filePath, content, title, id } = this.state.get();
        let savePath: string | undefined = saveAs ? undefined : filePath;
        if (!savePath) {
            savePath = await api.showSaveFileDialog({
                title: saveAs ? "Save File As" : "Save File",
                defaultPath: title,
            });
        }

        if (savePath) {
            await filesModel.saveFile(savePath, content);
            await filesModel.deleteCacheFile(id);
            this.state.update((s) => {
                s.modified = false;
                s.filePath = savePath!;
                s.title = windowUtils.path.basename(savePath);
            });
            return true;
        }

        return false;
    };

    restore = async () => {
        const { id, modified, filePath } = this.state.get();
        if (modified) {
            const cachedContent = await filesModel.getCacheFile(id);
            if (cachedContent !== undefined) {
                this.state.update((s) => {
                    s.content = cachedContent;
                });
            }
        } else if (filePath) {
            const ext = windowUtils.path.extname(filePath).toLowerCase();
            const fileContent = await filesModel.getFile(filePath);
            this.state.update((s) => {
                s.content = fileContent || "";
                s.title = windowUtils.path.basename(filePath);
                s.language =
                    s.language ||
                    getLanguageByExtension(ext)?.id ||
                    "plaintext";
            });
        }
    };

    private isSavingModifications = false;

    private doSaveModifications = async (text: string) => {
        if (this.modificationSaved) return;
        this.modificationSaved = true;
        this.isSavingModifications = true;
        const { id } = this.state.get();
        await filesModel.saveCacheFile(id, text);
        this.isSavingModifications = false;
    };

    private saveModifications = debounce(
        this.doSaveModifications,
        1000,
        () => !this.isSavingModifications
    );

    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
        if (e.ctrlKey && e.code === "KeyS") {
            e.preventDefault();
            if (e.shiftKey) {
                this.saveFile(true);
            } else if (this.state.get().modified) {
                this.saveFile();
            }
        }

        if (e.key === 'F5') {
            e.preventDefault();
            this.runScript();
            return;
        }
    };

    runScript = async () => {
        const { language, content } = this.state.get();
        if (language === 'javascript') {
            await scriptRunner.runWithResult(this.id, content, {});
        }
    }
}

export function newTextFileModel(filePath?: string): TextFileModel {
    const state = {
        ...getDefaultTextFilePageModelState(),
        ...(filePath ? { filePath } : {}),
    };

    return new TextFileModel(new TComponentState(state));
}

export function newTextFileModelFromState(state: Partial<IPage>): TextFileModel {
    const initialState: TextFilePageModelState = {
        ...getDefaultTextFilePageModelState(),
        ...state,
    };
    return new TextFileModel(new TComponentState(initialState));
}