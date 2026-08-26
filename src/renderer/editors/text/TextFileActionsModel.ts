import { ui } from "../../api/ui";
import { pagesModel } from "../../api/pages";
import { PageModel } from "../../api/pages/PageModel";
import { scriptRunner } from "../../scripting/ScriptRunner";
import { isScriptLanguage } from "../../scripting/transpile";

import type { TextFileModel } from "./TextEditorModel";

export class TextFileActionsModel {
    constructor(private model: TextFileModel) {}

    handleKeyDown = (e: KeyboardEvent): void => {
        if (e.ctrlKey && e.code === "KeyS") {
            e.preventDefault();
            if (e.shiftKey) {
                this.model.io.saveFile(true);
            } else {
                this.model.io.saveFile();
            }
        }

        if (e.key === "F5") {
            e.preventDefault();
            if (this.model.script.state.get().open) {
                this.runRelatedScript();
            } else {
                this.runScript();
            }
        }

        if (e.ctrlKey && e.shiftKey && e.code === "KeyF") {
            e.preventDefault();
            this.openSearchInNavPanel();
        }
    };

    openSearchInNavPanel = () => {
        const { filePath } = this.model.state.get();
        const page = this.model.page;
        if (!page?.hasSidebar && !filePath) return;

        const navModel = page?.ensureSecondaryViewsModel();
        if (navModel && !navModel.state.get().open) {
            page?.setSecondaryViewsState({ open: true });
        }
    };

    /** Run a script with pre-fetched text + language. Called by
     *  `MonacoEditor.runScript` after it resolves selection via the ComponentQueue. */
    runScriptWith = async (scriptText: string, language: string): Promise<void> => {
        if (isScriptLanguage(language)) {
            await scriptRunner.runWithResult(this.model.id, scriptText, this.model, language);
        }
    };

    runScript = async (all?: boolean) => {
        const { language, content } = this.model.state.get();
        let script = content;
        if (!all) {
            script = this.model.getSelectedText() || content;
        }
        await this.runScriptWith(script, language ?? "");
    };

    runRelatedScript = async (all?: boolean) => {
        let script = this.model.script.state.get().content;
        if (!all) {
            script = this.model.script.getSelectedText() || script;
        }
        await scriptRunner.runWithResult(this.model.id, script, this.model, "typescript");
    };

    confirmRelease = async (): Promise<boolean> => {
        if (this.model.skipSave) {
            return true;
        }

        const { modified, title, temp } = this.model.state.get();
        if (!modified || temp) {
            return true;
        }

        pagesModel.showPage(this.model.state.get().id);
        const confirmBt = await ui.confirm(
            `Do you want to save the changes you made to "${title}"?`,
            { title: "Unsaved Changes", buttons: ["Save", "Don't Save", "Cancel"] },
        );

        switch (confirmBt) {
            case "Save":
                return await this.model.io.saveFile();
            case "Don't Save":
                return true;
            default:
                return false;
        }
    };

    canClose = async (): Promise<boolean> => {
        const result = await this.model.confirmRelease(true);
        if (result) {
            if (!this.model.skipSave) {
                await this.model.dispose();
            }
        } else {
            if (this.model.page instanceof PageModel) pagesModel.focusPage(this.model.page);
        }
        return result;
    };
}
