import * as monaco from "monaco-editor";

import { TModel } from "../../core/state/model";
import type { TextFileModel } from "./TextEditorModel";
import type { IListBoxItem } from "../../uikit/ListBox";
import { TComponentState } from "../../core/state/state";
import { fs } from "../../api/fs";
import { parseObject } from "../../core/utils/parse-utils";
import { debounce } from "../../../shared/utils";
import { libraryService, ScriptPanelEntry } from "../../api/library-service";
import { settings } from "../../api/settings";
import { showInputDialog } from "../../ui/dialogs/InputDialog";
import { mountVanilla } from "../../uikit/shared/mount";
import { ScriptPanelView } from "./ScriptPanelView";

const nodefs = require("fs") as typeof import("fs");
import { fpJoin } from "../../core/utils/file-path";

export interface ScriptPanelState {
    content: string;
    open: boolean;
    height: number;
    hasSelection: boolean;
    /** File path of the selected library script, or null for ad-hoc script. */
    selectedScript: string | null;
    /** True when content has been modified since last load/save. */
    dirty: boolean;
}

export const defaultScriptPanelState: ScriptPanelState = {
    content: "return page.content",
    open: false,
    height: 160,
    hasSelection: false,
    selectedScript: null,
    dirty: false,
};

/** Dropdown entry for the script selector. Satisfies IListBoxItem so it can be
 *  consumed directly by UIKit Select. */
export interface ScriptDropdownEntry extends IListBoxItem {
    /** Stable identifier — entry path for library scripts, "__unsaved__" for ad-hoc. */
    value: string;
    /** Display label (e.g. "my-script" or "all/my-script"). */
    label: string;
    /** The underlying ScriptPanelEntry, or null for "(unsaved script)". */
    entry: ScriptPanelEntry | null;
}

export class ScriptPanelModel extends TModel<ScriptPanelState> {
    editorRef = null as monaco.editor.IStandaloneCodeEditor | null;
    private pageModel: TextFileModel;
    private unsubscribe: (() => void) | undefined = undefined;
    private skipSave = false;
    private selectionListenerDisposable: monaco.IDisposable | null = null;
    id: string | undefined = undefined;
    name = "script";

    constructor(pageModel: TextFileModel) {
        super(new TComponentState(defaultScriptPanelState));
        this.pageModel = pageModel;
        this.unsubscribe = this.state.subscribe(this.saveStateDebounced);
    }

    restore = async (id: string) => {
        this.id = id;
        const data = await fs.getCacheFile(id, this.name);
        const newState = (parseObject(data) as Partial<typeof defaultScriptPanelState> | undefined) || defaultScriptPanelState;
        this.skipSave = true;
        const merged = { ...defaultScriptPanelState, ...newState };
        // Ad-hoc scripts always have save enabled (acts as "save as")
        if (!merged.selectedScript) {
            merged.dirty = true;
        }
        this.state.set(merged);
    }

    private saveState = async (): Promise<void> => {
        if (this.skipSave) {
            this.skipSave = false;
            return;
        }
        if (!this.id) {
            return;
        }

        const state = this.state.get();
        await fs.saveCacheFile(this.id, JSON.stringify(state), this.name);
    }

    private saveStateDebounced = debounce(this.saveState, 300);

    dispose = () => {
        this.unsubscribe?.();
        this.cleanupEditor();
        this.editorRef = null;
    }

    handleEditorWillUnmount = () => {
        this.cleanupEditor();
    };

    private cleanupEditor = () => {
        this.selectionListenerDisposable?.dispose();
        this.selectionListenerDisposable = null;
        this.editorRef = null;
    };

    changeContent = (newContent: string) => {
        this.state.update((s) => {
            s.content = newContent;
            s.dirty = true;
        });
    }

    toggleOpen = () => {
        this.state.update((s) => {
            s.open = !s.open;
        });
    }

    setHeight = (height: number) => {
        this.state.update((s) => {
            s.height = height;
        });
    }

    handleEditorChange = (value: string) => {
        this.changeContent(value);
    };

    handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === "F5") {
            e.preventDefault();
            this.pageModel.runRelatedScript();
        }
        if (e.code === "KeyS" && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
            if (this.state.get().dirty) {
                e.preventDefault();
                e.stopPropagation();
                this.saveToLibrary();
            }
        }
    };

    setupSelectionListener = (editor: monaco.editor.IStandaloneCodeEditor) => {
        this.selectionListenerDisposable?.dispose();
        this.selectionListenerDisposable = editor.onDidChangeCursorSelection((_e) => {
            const selection = editor.getSelection();
            const hasSelection = selection ? !selection.isEmpty() : false;

            if (this.state.get().hasSelection !== hasSelection) {
                this.state.update(s => { s.hasSelection = hasSelection; });
            }
        });
    };

    handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
        this.editorRef = editor;
        this.setupSelectionListener(editor);
    };

    getSelectedText = (): string => {
        if (!this.editorRef) {
            return "";
        }

        const selection = this.editorRef.getSelection();
        if (!selection || selection.isEmpty()) {
            return "";
        }

        return this.editorRef.getModel()?.getValueInRange(selection) || "";
    };

    // ── Script Library Integration ──────────────────────────────────────

    /** Get available scripts for the current page language, merged with "all". */
    getAvailableScripts = (): ScriptDropdownEntry[] => {
        libraryService.ensureInitialized();
        const language = this.pageModel.state.get().language || "";
        const index = libraryService.scriptPanelIndex;

        const entries: ScriptDropdownEntry[] = [];

        // Language-specific scripts
        const langScripts = index[language] || [];
        for (const entry of langScripts) {
            entries.push({ value: entry.path, label: entry.name, entry });
        }

        // "all" scripts — prefixed to distinguish
        const allScripts = index["all"] || [];
        for (const entry of allScripts) {
            entries.push({ value: entry.path, label: "all/" + entry.name, entry });
        }

        return entries;
    };

    /** Select a library script (loads file content) or switch back to ad-hoc (null). */
    selectScript = (dropdown: ScriptDropdownEntry | null) => {
        if (!dropdown || !dropdown.entry) {
            // Switch to ad-hoc — always enable save (acts as "save as")
            this.state.update((s) => {
                s.selectedScript = null;
                s.dirty = true;
            });
            return;
        }

        const entry = dropdown.entry;
        try {
            const content = nodefs.readFileSync(entry.path, "utf-8");
            this.state.update((s) => {
                s.content = content;
                s.selectedScript = entry.path;
                s.dirty = false;
            });
        } catch {
            // File read failed — stay on current content
        }
    };

    /** Save current script content to library. */
    saveToLibrary = async () => {
        let libraryPath = settings.get("script-library.path");
        if (!libraryPath) {
            const { showLibrarySetupDialog } = await import("../../ui/dialogs/LibrarySetupDialog");
            const result = await showLibrarySetupDialog();
            if (!result) return;
            libraryPath = result;
        }

        const state = this.state.get();

        if (state.selectedScript) {
            // Selected library script — overwrite directly
            try {
                nodefs.writeFileSync(state.selectedScript, state.content, "utf-8");
                this.state.update((s) => { s.dirty = false; });
            } catch (err) {
                const { ui } = await import("../../api/ui");
                ui.notify(`Failed to save script: ${err.message}`, "error");
            }
            return;
        }

        // Ad-hoc script — prompt for name and folder
        const language = this.pageModel.state.get().language || "all";
        const options = language !== "all" ? [language, "all"] : ["all"];

        const result = await showInputDialog({
            title: "Save Script to Library",
            message: "Script name:",
            value: "",
            options,
            selectedOption: options[0],
            buttons: ["Save", "Cancel"],
            selectAll: true,
        });

        if (!result || result.button !== "Save" || !result.value.trim()) {
            return;
        }

        const scriptName = result.value.trim();
        const folder = result.selectedOption || options[0];
        const scriptPanelDir = fpJoin(libraryPath, "script-panel", folder);
        const filePath = fpJoin(scriptPanelDir, scriptName + ".ts");

        // Create folder if needed
        if (!nodefs.existsSync(scriptPanelDir)) {
            nodefs.mkdirSync(scriptPanelDir, { recursive: true });
        }

        // Check if file already exists
        if (nodefs.existsSync(filePath)) {
            const { showConfirmationDialog } = await import("../../ui/dialogs/ConfirmationDialog");
            const confirmResult = await showConfirmationDialog({
                message: `Script "${scriptName}" already exists in "${folder}/". Overwrite?`,
                buttons: ["Overwrite", "Cancel"],
            });
            if (confirmResult !== "Overwrite") {
                return;
            }
        }

        try {
            nodefs.writeFileSync(filePath, state.content, "utf-8");
            this.state.update((s) => {
                s.selectedScript = filePath;
                s.dirty = false;
            });
        } catch (err) {
            const { ui } = await import("../../api/ui");
            ui.notify(`Failed to save script: ${err.message}`, "error");
        }
    };

    /** Find the dropdown entry matching the current selectedScript path. */
    getSelectedDropdownEntry = (entries: ScriptDropdownEntry[]): ScriptDropdownEntry | null => {
        const { selectedScript } = this.state.get();
        if (!selectedScript) return null;
        return entries.find(e => e.entry?.path === selectedScript) ?? null;
    };

    /** Open selected script (or empty page) in a new tab with NavigationPanel rooted at script-panel/. */
    openInTab = async () => {
        const { pagesModel } = await import("../../api/pages");

        const libraryPath = settings.get("script-library.path");
        const scriptPanelDir = libraryPath ? fpJoin(libraryPath, "script-panel") : "";
        const { selectedScript } = this.state.get();

        if (selectedScript && nodefs.existsSync(selectedScript)) {
            const page = await pagesModel.openFile(selectedScript);
            if (page && scriptPanelDir) {
                const { ExplorerEditor, getDefaultExplorerEditorState } =
                    await import("../explorer");
                const { TComponentState } = await import("../../core/state/state");
                const explorerState = new TComponentState({
                    ...getDefaultExplorerEditorState(),
                    rootPath: scriptPanelDir,
                });
                const explorer = new ExplorerEditor(explorerState);
                page.attach(explorer);
                await explorer.restore();
                page.ensureSecondaryViewsModel();
            }
        } else if (scriptPanelDir) {
            // No selected script — open empty page with NavPanel
            pagesModel.addEmptyPageWithNavPanel(scriptPanelDir);
        }
    };
}

interface ScriptPanelProps {
    model: TextFileModel;
}

export function ScriptPanel({ model }: ScriptPanelProps) {
    return mountVanilla(ScriptPanelView, { model });
}
