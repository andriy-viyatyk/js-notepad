const path = require("path");
import { TComponentState } from "../../common/classes/state";
import { showConfirmationDialog } from "../../dialogs/dialogs/ConfirmationDialog";
import { api } from "../../../ipc/renderer/api";
import { filesModel } from "../../model/files-model";
import { FileWatcher } from "../../model/FileWatcher";
import { getLanguageByExtension } from "../../model/language-mapping";
import { getDefaultPageModelState, PageModel } from "../../model/page-model";
import { pagesModel } from "../../model/pages-model";
import { recentFiles } from "../../model/recentFiles";
import { scriptRunner } from "../../script/ScriptRunner";
import { IPage } from "../../../shared/types";
import { ScriptEditorModel } from "./ScriptEditor";
import { TextEditorModel } from "./TextEditor";
import { debounce } from "../../../shared/utils";

export interface TextFilePageModelState extends IPage {
    content: string;
    deleted: boolean;
}

export const getDefaultTextFilePageModelState = (): TextFilePageModelState => ({
    ...getDefaultPageModelState(),
    type: "textFile" as const,
    filePath: "",
    language: "plaintext",
    // no stored state props
    content: "",
    deleted: false,
});

export class TextFileModel extends PageModel<TextFilePageModelState, void> {
    private modificationSaved = true;
    private fileWatcher: FileWatcher | null = null;
    script = new ScriptEditorModel(this);
    editor = new TextEditorModel(this);

    changeContent = (newContent: string) => {
        this.state.update((state) => {
            state.content = newContent;
            state.modified = true;
        });
        this.modificationSaved = false;
        this.saveModifications(newContent);
    };

    getRestoreData() {
        const { content, deleted, ...pageData } = this.state.get();
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
                    result = true;
                    break;
                default:
                    result = false;
                    break;
            }
        }

        if (result) {
            await this.dispose();
        } else {
            pagesModel.focusPage(this as unknown as PageModel);
        }
        return result;
    };

    dispose = async (): Promise<void> => {
        this.fileWatcher?.dispose();
        this.fileWatcher = null;
        this.editor.onDispose();
        this.script.dispose();
        await filesModel.deleteCacheFiles(this.state.get().id);
    }

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
                s.filePath = savePath;
                s.title = path.basename(savePath);
                s.deleted = false;
            });
            this.fileWatcher?.dispose();
            this.fileWatcher = new FileWatcher(savePath, this.onFileChanged);
            if (savePath !== filePath) {
                recentFiles.add(savePath);
            }
            return true;
        }

        return false;
    };

    restore = async () => {
        const { id, modified, filePath } = this.state.get();
        if (filePath) {
            this.fileWatcher?.dispose();
            this.fileWatcher = new FileWatcher(filePath, this.onFileChanged);
        }
        if (modified) {
            const cachedContent = await filesModel.getCacheFile(id);
            if (cachedContent !== undefined) {
                this.state.update((s) => {
                    s.content = cachedContent;
                });
            }
        } else if (filePath) {
            const ext = path.extname(filePath).toLowerCase();
            const fileContent = await filesModel.getFile(filePath);
            this.state.update((s) => {
                s.content = fileContent || "";
                s.title = path.basename(filePath);
                s.language =
                    s.language ||
                    getLanguageByExtension(ext)?.id ||
                    "plaintext";
                s.deleted = this.fileWatcher?.stat.exists === false;
            });
        }
        await this.script.restore(id);
    };

    private onFileChanged = () => {
        if (!this.fileWatcher) return;
        const modified = this.state.get().modified;
        const deleted = !this.fileWatcher.stat.exists;
        if (deleted !== this.state.get().deleted) {
            this.state.update(s => { 
                s.deleted = deleted;
                s.modified = deleted || s.modified;
            });
        }
        if (!modified && !deleted) {
            const newContent = this.fileWatcher.getTextContent();
            this.state.update(s => {
                s.content = newContent;
            });
        }
    }

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
            } else {
                this.saveFile();
            }
        }

        if (e.key === 'F5') {
            e.preventDefault();
            if (this.script.state.get().open) {
                this.runRelatedScript();
            } else {
                this.runScript();
            }
        }
    };

    runScript = async (all?: boolean) => {
        const { language, content } = this.state.get();
        let script = content;
        if (!all) {
            script = this.editor.getSelectedText() || content;
        }
        if (language === 'javascript') {
            await scriptRunner.runWithResult(this.id, script, this);
        }
    }

    runRelatedScript = async (all?: boolean) => {
        let script = this.script.state.get().content;
        if (!all) {
            script = this.script.getSelectedText() || script;
        }
        await scriptRunner.runWithResult(this.id, script, this);
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