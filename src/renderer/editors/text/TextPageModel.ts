const path = require("path");
const fs = require("fs");
import { TComponentState } from "../../core/state/state";
import { showConfirmationDialog } from "../../features/dialogs/ConfirmationDialog";
import { api } from "../../../ipc/renderer/api";
import { filesModel, pagesModel, recentFiles, getLanguageByExtension } from "../../store";
import { FileWatcher } from "../../core/services/file-watcher";
import { getDefaultPageModelState, PageModel } from "../base/PageModel";
import { scriptRunner } from "../../core/services/scripting/ScriptRunner";
import { IPage, PageEditor } from "../../../shared/types";
import { ScriptPanelModel } from "./ScriptPanel";
import { TextEditorModel } from "./TextEditor";
import { debounce } from "../../../shared/utils";
import { decryptText, encryptText, isEncrypted } from "../../core/services/encryption";
import { alertWarning } from "../../features/dialogs/alerts/AlertsBar";
import { editorRegistry } from "../registry";

export interface TextFilePageModelState extends IPage {
    content: string;
    deleted: boolean;
    encoding?: string;
    password?: string;
    encripted?: boolean;
    showEncryptionPanel?: boolean;
    restored: boolean;
    compareMode: boolean;
    temp: boolean;
}

export const getDefaultTextFilePageModelState = (): TextFilePageModelState => ({
    ...getDefaultPageModelState(),
    type: "textFile" as const,
    language: "plaintext",
    encoding: undefined,
    compareMode: false,
    temp: true,
    // no stored state props
    content: "",
    deleted: false,
    password: undefined,
    encripted: false,
    showEncryptionPanel: false,
    restored: false,
});

export class TextFileModel extends PageModel<TextFilePageModelState, void> {
    private modificationSaved = true;
    private fileWatcher: FileWatcher | null = null;
    script = new ScriptPanelModel(this);
    editor = new TextEditorModel(this);
    editorToolbarRefFirst: HTMLDivElement | null = null;
    editorToolbarRefLast: HTMLDivElement | null = null;
    editorFooterRefLast: HTMLDivElement | null = null;

    setEditorToolbarRefFirst = (ref: HTMLDivElement | null) => {
        this.editorToolbarRefFirst = ref;
    };

    setEditorToolbarRefLast = (ref: HTMLDivElement | null) => {
        this.editorToolbarRefLast = ref;
    };

    setFooterRefLast = (ref: HTMLDivElement | null) => {
        this.editorFooterRefLast = ref;
    };

    get encripted(): boolean {
        return isEncrypted(this.state.get().content);
    }

    get decripted(): boolean {
        return this.state.get().password !== undefined;
    }

    get withEncription(): boolean {
        return this.decripted || this.encripted;
    }

    changeContent = (newContent: string, byUser?: boolean) => {
        this.state.update((state) => {
            state.content = newContent;
            state.modified = true;
            state.encripted = isEncrypted(newContent);
            state.temp = state.temp && !byUser;
        });
        this.modificationSaved = false;
        this.saveModifications();
    };

    changeEditor = (editor: PageEditor) => {
        this.state.update((s) => {
            s.editor = editor;
        });
    };

    getRestoreData() {
        const {
            content,
            deleted,
            password,
            encripted,
            showEncryptionPanel,
            restored,
            ...pageData
        } = this.state.get();
        return pageData;
    }

    private mapContentToSave = async (): Promise<string | undefined> => {
        const text = this.state.get().content;
        const password = this.state.get().password;
        if (password) {
            try {
                return await encryptText(text, password);
            } catch (error) {
                this.alertEncryptionError(error as Error);
                return undefined;
            }
        }
        return text;
    };

    private mapContentFromFile = async (
        text: string,
    ): Promise<string | undefined> => {
        const password = this.state.get().password;
        if (isEncrypted(text) && password) {
            try {
                return await decryptText(text, password);
            } catch (error) {
                this.alertEncryptionError(error as Error);
                return undefined;
            }
        }
        return text;
    };

    saveState = async (): Promise<void> => {
        if (!this.modificationSaved) {
            await this.doSaveModifications();
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
            s.encoding = data.encoding || s.encoding;
            s.editor = data.editor || s.editor;
            s.compareMode = data.compareMode || s.compareMode;
            s.temp =
                !s.filePath && (data.temp !== undefined ? data.temp : s.temp);
        });
        this.restore();
    };

    canClose = async (): Promise<boolean> => {
        const { modified, title, temp } = this.state.get();

        if (this.skipSave) {
            return true;
        }

        let result = true;
        if (modified && !temp) {
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
    };

    saveFile = async (saveAs?: boolean): Promise<boolean> => {
        const { filePath, title, id } = this.state.get();
        let savePath: string | undefined = saveAs ? undefined : filePath;
        if (!savePath) {
            savePath = await api.showSaveFileDialog({
                title: saveAs ? "Save File As" : "Save File",
                defaultPath: title,
            });
        }

        const text = await this.mapContentToSave();
        if (text === undefined) {
            return false;
        }
        if (savePath) {
            await filesModel.saveFile(
                savePath,
                text,
                this.state.get().encoding,
            );
            await filesModel.deleteCacheFile(id);
            this.state.update((s) => {
                s.modified = false;
                s.temp = false;
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

    renameFile = async (newName: string): Promise<boolean> => {
        const { filePath } = this.state.get();
        if (!filePath) {
            this.state.update((s) => {
                s.title = newName;
                s.temp = false;
            });
            return true;
        }

        const newPath = path.join(path.dirname(filePath), newName);
        if (fs.existsSync(newPath)) {
            alertWarning("A file or folder with that name already exists.");
            return false;
        }
        try {
            fs.renameSync(filePath, newPath);
        } catch (err) {
            alertWarning(err.message || "Failed to rename file.");
            return false;
        }
        this.state.update((s) => {
            s.filePath = newPath;
            s.title = newName;
        });
        this.fileWatcher?.dispose();
        this.fileWatcher = new FileWatcher(newPath, this.onFileChanged);
        if (newPath !== filePath) {
            await recentFiles.remove(filePath);
            recentFiles.add(newPath);
        }
        return true;
    };

    async restore() {
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
                    s.deleted = this.fileWatcher?.stat.exists === false;
                });
            }
        } else if (filePath) {
            const ext = path.extname(filePath).toLowerCase();
            const fileContent = await this.fileWatcher.getTextContent(
                this.state.get().encoding,
            );
            const encoding = this.fileWatcher.encoding;
            this.state.update((s) => {
                s.content = fileContent || "";
                s.encripted = isEncrypted(s.content);
                s.encoding = encoding;
                s.title = path.basename(filePath);
                s.language =
                    s.language ||
                    getLanguageByExtension(ext)?.id ||
                    "plaintext";
                s.deleted = this.fileWatcher?.stat.exists === false;
                s.temp = false;
            });
        }
        await this.script.restore(id);
        this.state.update((s) => {
            s.restored = true;
        });
    }

    private onFileChanged = async () => {
        if (!this.fileWatcher) return;
        const modified = this.state.get().modified;
        const deleted = !this.fileWatcher.stat.exists;
        if (deleted !== this.state.get().deleted) {
            this.state.update((s) => {
                s.deleted = deleted;
                s.modified = deleted || s.modified;
            });
        }
        if (!modified && !deleted) {
            const newContent = await this.fileWatcher.getTextContent(
                this.state.get().encoding,
            );
            const encoding = this.fileWatcher.encoding;
            const text = await this.mapContentFromFile(newContent || "");
            if (text === undefined) {
                return;
            }
            this.state.update((s) => {
                s.content = text;
                s.encripted = isEncrypted(s.content);
                s.encoding = encoding;
            });
        }

        if (!modified && this.state.get().modified) {
            this.modificationSaved = false;
            this.saveModifications();
        }
    };

    private isSavingModifications = false;

    private doSaveModifications = async () => {
        if (this.modificationSaved) return;
        this.modificationSaved = true;
        this.isSavingModifications = true;
        const { id } = this.state.get();

        const text = await this.mapContentToSave();
        if (text === undefined) {
            return;
        }

        await filesModel.saveCacheFile(id, text);
        this.isSavingModifications = false;
    };

    private saveModifications = debounce(
        this.doSaveModifications,
        1000,
        () => !this.isSavingModifications,
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

        if (e.key === "F5") {
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
        if (language === "javascript") {
            await scriptRunner.runWithResult(this.id, script, this);
        }
    };

    runRelatedScript = async (all?: boolean) => {
        let script = this.script.state.get().content;
        if (!all) {
            script = this.script.getSelectedText() || script;
        }
        await scriptRunner.runWithResult(this.id, script, this);
    };

    encript = async (password: string): Promise<void> => {
        if (this.encripted) {
            alertWarning("File is already encrypted");
            return;
        }
        try {
            const encryptedContent = await encryptText(
                this.state.get().content,
                password,
            );
            const modified =
                this.state.get().modified ||
                this.state.get().password !== password;
            this.state.update((s) => {
                s.content = encryptedContent;
                s.encripted = true;
                s.password = undefined;
                s.modified = modified;
                s.temp = s.temp && !modified;
            });
            this.modificationSaved = false;
            this.saveModifications();
        } catch (error) {
            alertWarning((error as Error).message);
        }
    };

    encryptWithCurrentPassword = async (): Promise<void> => {
        const password = this.state.get().password;
        if (!password) {
            alertWarning("No password set for encryption");
            return;
        }
        await this.encript(password);
    };

    alertEncryptionError = (err: Error) => {
        alertWarning(err.message || err.name || "Unknown encryption error");
    };

    decript = async (password: string): Promise<boolean> => {
        if (!this.encripted) {
            return false;
        }
        try {
            const decrypted = await decryptText(
                this.state.get().content,
                password,
            );
            this.state.update((s) => {
                s.content = decrypted;
                s.encripted = false;
                s.password = password;
            });
            return true;
        } catch (error) {
            this.alertEncryptionError(error as Error);
        }
    };

    onSubmitPassword = async (password: string) => {
        if (this.encripted) {
            await this.decript(password);
            if (this.decripted) {
                this.state.update((s) => {
                    s.showEncryptionPanel = false;
                });
                this.editor.focusEditor();
            }
            return;
        }

        if (!this.encripted) {
            await this.encript(password);
            if (this.encripted) {
                this.state.update((s) => {
                    s.showEncryptionPanel = false;
                });
                this.editor.focusEditor();
            }
        }
    };

    onCancelPassword = () => {
        this.state.update((s) => {
            s.showEncryptionPanel = false;
        });
        this.editor.focusEditor();
    };

    showEncryptionDialog = () => {
        this.state.update((s) => {
            s.showEncryptionPanel = true;
        });
    };

    makeUnencrypted = () => {
        this.state.update((s) => {
            s.password = undefined;
            s.modified = true;
        });
        this.modificationSaved = false;
        this.saveModifications();
    };

    setCompareMode = (compareMode: boolean) => {
        this.state.update((s) => {
            s.compareMode = compareMode;
        });
    };
}

export function newTextFileModel(filePath?: string): TextFileModel {
    const editor = editorRegistry.resolveId(filePath);
    const state = {
        ...getDefaultTextFilePageModelState(),
        ...(filePath ? { filePath } : {}),
        editor,
    };

    return new TextFileModel(new TComponentState(state));
}

export function newTextFileModelFromState(
    state: Partial<IPage>,
): TextFileModel {
    const initialState: TextFilePageModelState = {
        ...getDefaultTextFilePageModelState(),
        ...state,
    };
    return new TextFileModel(new TComponentState(initialState));
}

export function isTextFileModel(
    model: PageModel<any, any>,
): model is TextFileModel {
    return model.type === "textFile";
}
