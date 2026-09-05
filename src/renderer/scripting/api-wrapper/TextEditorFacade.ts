import type { MonacoEditor } from "../../editors/monaco/MonacoEditor";
import { isTextFileModel, type TextFileModel } from "../../editors/text/TextEditorModel";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";

const TEXT_ELEMENTS = [
    { name: "text-compare-left", purpose: "Compare this text page with the left grouped page when the compare action is available." },
    { name: "text-run-script", purpose: "Run the current script, when this text page uses a script language." },
    { name: "text-run-all-script", purpose: "Run all script content when a selection is present." },
    { name: "text-show-resources", purpose: "Show extracted HTML resources when this text page uses the html language." },
    { name: "text-toggle-script", purpose: "Open or close the related script panel." },
    { name: "script-panel-splitter", purpose: "Resize the open related script panel." },
    { name: "script-run", purpose: "Run the related script or its selection." },
    { name: "script-run-all", purpose: "Run all related-script content when selected text exists." },
    { name: "script-select", purpose: "Select an ad-hoc or library script." },
    { name: "script-save", purpose: "Save the current script to the library." },
    { name: "script-open-tab", purpose: "Open the selected script, or a library-rooted empty page, in a new tab." },
    { name: "script-close", purpose: "Close the related script panel." },
] as const;

const TEXT_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "editorMounted", kind: "property", summary: "True when the Monaco editor is visible and mounted. The queue layer defers commands until mount, so this is informational - consumers no longer need to gate calls on it." },
    { name: "getSelectedText", kind: "method", signature: "getSelectedText(): Promise<string>", summary: "Get currently selected text, or empty string if no selection." },
    { name: "revealLine", kind: "method", signature: "revealLine(lineNumber: number): void", summary: "Scroll to reveal a specific line in the center of the editor." },
    { name: "setHighlightText", kind: "method", signature: "setHighlightText(text?: string): void", summary: "Highlight all occurrences of text with find-match decorations." },
    { name: "getCursorPosition", kind: "method", signature: "getCursorPosition(): Promise<{ lineNumber: number; column: number }>", summary: "Get current cursor position. Returns {lineNumber: 1, column: 1} if editor is not mounted." },
    { name: "insertText", kind: "method", signature: "insertText(text: string): Promise<void>", summary: "Insert text at current cursor position.", caution: "changes text content" },
    { name: "replaceSelection", kind: "method", signature: "replaceSelection(text: string): Promise<void>", summary: "Replace current selection with text.", caution: "changes text content" },
    { name: "openFind", kind: "method", signature: "openFind(): void", summary: "Open Monaco's native find widget." },
    { name: "openReplace", kind: "method", signature: "openReplace(): void", summary: "Open Monaco's native find-and-replace widget.", caution: "opens a UI that can mutate editor content" },
    { name: "encrypted", kind: "property", summary: "Whether the text content is encrypted." },
    { name: "decrypted", kind: "property", summary: "Whether this encrypted file is currently unlocked." },
    { name: "withEncryption", kind: "property", summary: "Whether this text file has encryption state." },
    { name: "showEncryptionDialog", kind: "method", signature: "showEncryptionDialog(message?: string): Promise<void>", summary: "Open the password dialog to encrypt or unlock the file; the password is never exposed.", caution: "opens a button/cancel-only password dialog and can change file content" },
    { name: "encryptWithCurrentPassword", kind: "method", signature: "encryptWithCurrentPassword(): Promise<void>", summary: "Encrypt the file with its current in-memory password, without accepting a password value.", caution: "encrypts file content" },
    { name: "makeUnencrypted", kind: "method", signature: "makeUnencrypted(): Promise<void>", summary: "Remove encryption from the file content.", caution: "writes unencrypted file content" },
    { name: "saveFile", kind: "method", signature: "saveFile(saveAs?: boolean): Promise<boolean>", summary: "Save the text file, optionally using Save As.", caution: "writes the user's file and may open a native save dialog" },
    { name: "renameFile", kind: "method", signature: "renameFile(newName: string): Promise<boolean>", summary: "Rename the text file on disk.", caution: "renames the user's file" },
    { name: "promptRename", kind: "method", signature: "promptRename(): Promise<void>", summary: "Open the Rename File dialog and rename after confirmation.", caution: "opens an input dialog and can rename the user's file" },
    { name: "openSearchInNavPanel", kind: "method", signature: "openSearchInNavPanel(): void", summary: "Open the page's navigation/search panel when this text page has a path or sidebar.", caution: "changes the visible page UI" },
    { name: "runScript", kind: "method", signature: "runScript(all?: boolean): Promise<void>", summary: "Execute the page script or its selection; output may go to the grouped page.", caution: "executes user code and can write grouped output" },
    { name: "runRelatedScript", kind: "method", signature: "runRelatedScript(all?: boolean): Promise<void>", summary: "Execute the related script or its selection; suppressed errors can open Script Error.", caution: "executes user code and can write grouped output" },
    { name: "scriptPanelOpen", kind: "property", summary: "Whether the related script panel is open; undefined while no text host is attached." },
    { name: "scriptHasSelection", kind: "property", summary: "Whether the related script has a selection; undefined while no text host is attached." },
    { name: "scriptSelectedScript", kind: "property", summary: "Path of the selected library script, or null for an ad-hoc script; undefined while no text host is attached." },
    { name: "scriptDirty", kind: "property", summary: "Whether the related script has unsaved library changes; undefined while no text host is attached." },
    { name: "scriptAvailableScripts", kind: "property", summary: "Available related-script library paths; undefined while no text host is attached." },
    { name: "toggleScriptPanel", kind: "method", signature: "toggleScriptPanel(): void", summary: "Open or close the related script panel.", caution: "changes the visible page UI" },
    { name: "selectScript", kind: "method", signature: "selectScript(scriptPath?: string): Promise<void>", summary: "Select a library script by path, or omit the path to use the ad-hoc script.", caution: "changes related-script content and selection" },
    { name: "saveScript", kind: "method", signature: "saveScript(): Promise<void>", summary: "Save the related script to the script library.", caution: "writes or overwrites a library script and may open setup/name/overwrite dialogs" },
    { name: "openScriptInTab", kind: "method", signature: "openScriptInTab(): Promise<void>", summary: "Open the selected related script, or a library-rooted empty page, in a new tab.", caution: "opens a new page" },
    { name: "closeScriptPanel", kind: "method", signature: "closeScriptPanel(): void", summary: "Close the related script panel if it is open.", caution: "changes the visible page UI" },
];

const TEXT_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to "monaco".
Monaco text editor operations for selection, cursor, insertion, replacement, line navigation,
file actions, script execution, related scripts, encryption, and Monaco's native find/replace
widget. The native find/replace widget has no persistent page element or app-owned selector.
elements is a page-scoped curated inventory of the four existing text-toolbar controls plus the
related script-panel controls. Most text elements are conditional, so a majority report
visible: false on an ordinary text page; that is expected and means the control is absent, not
available. Reading elements reports literal current visibility without activating a page, while
highlight activates the owning page and waits for its slot layout before drawing.

Encryption and unlocking run through showEncryptionDialog(message?), whose dialogs[i] adapter
exposes buttons and cancel only; no facade member accepts or returns a raw password. The page-tab
popup menu is menus[0], with Save, Save As, Rename, file-path actions, HTML-only Open in Browser,
and Decrypt/Encrypt or Change Password/Make Unencrypted items; inspect its enabled state and use
menus[0].click(label). This surface can also raise the Rename File, Unsaved Changes, Library Setup,
Save Script to Library, overwrite-confirmation, and Script Error dialogs; resolve them through
dialogs[i].

The encryption and related-script state getters return undefined when MonacoEditor.host is null.
Every host-backed action throws 'Text editor action unavailable: no text host attached' in that
state. This detached-host contract is separate from conditional element visibility.`;

export class TextEditorFacade implements IAiVisible {
    constructor(private readonly editor: MonacoEditor, readonly id: string, readonly name: string) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(TEXT_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
        });
        return {
            kind: "TextEditor",
            summary: "Monaco text editor facade.",
            members: [...TEXT_EDITOR_MEMBERS, ...elements.members],
            help: TEXT_EDITOR_HELP,
            elements: TEXT_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({ kind: "TextEditor", id: this.id, name: this.name, editorMounted: this.editorMounted }),
        };
    }

    /** True once the editor model exists. Queue-backed commands no longer
     *  require gating on this — the queue defers commands until mount. */
    get editorMounted(): boolean {
        return true;
    }

    // ── Fire-and-forget commands (sync — queued until view mounts) ──────

    revealLine(lineNumber: number): void {
        this.editor.revealLine(lineNumber);
    }

    setHighlightText(text?: string): void {
        this.editor.setHighlightText(text);
    }

    openFind(): void {
        this.editor.openFind();
    }

    openReplace(): void {
        this.editor.openReplace();
    }

    // ── View-context queries (async — queue.execute returns a Promise) ──

    async getSelectedText(): Promise<string> {
        return this.editor.getSelectedText();
    }

    async getCursorPosition(): Promise<{ lineNumber: number; column: number }> {
        return this.editor.getCursorPosition();
    }

    async insertText(text: string): Promise<void> {
        this.requireTextHost();
        await this.editor.insertText(text);
    }

    async replaceSelection(text: string): Promise<void> {
        this.requireTextHost();
        await this.editor.replaceSelection(text);
    }

    get encrypted(): boolean | undefined {
        return this.textHost?.encrypted;
    }

    get decrypted(): boolean | undefined {
        return this.textHost?.decrypted;
    }

    get withEncryption(): boolean | undefined {
        return this.textHost?.withEncryption;
    }

    showEncryptionDialog(message?: string): Promise<void> {
        return this.requireTextHost().showEncryptionDialog(message);
    }

    encryptWithCurrentPassword(): Promise<void> {
        return this.requireTextHost().encryptWithCurrentPassword();
    }

    makeUnencrypted(): Promise<void> {
        return this.requireTextHost().makeUnencrypted();
    }

    saveFile(saveAs?: boolean): Promise<boolean> {
        return this.requireTextHost().saveFile(saveAs);
    }

    renameFile(newName: string): Promise<boolean> {
        return this.requireTextHost().renameFile(newName);
    }

    promptRename(): Promise<void> {
        return this.requireTextHost().promptRename();
    }

    openSearchInNavPanel(): void {
        this.requireTextHost().openSearchInNavPanel();
    }

    runScript(all?: boolean): Promise<void> {
        this.requireTextHost();
        return this.editor.runScript(all);
    }

    runRelatedScript(all?: boolean): Promise<void> {
        return this.requireTextHost().runRelatedScript(all);
    }

    get scriptPanelOpen(): boolean | undefined {
        return this.textHost?.script.state.get().open;
    }

    get scriptHasSelection(): boolean | undefined {
        return this.textHost?.script.state.get().hasSelection;
    }

    get scriptSelectedScript(): string | null | undefined {
        return this.textHost?.script.state.get().selectedScript;
    }

    get scriptDirty(): boolean | undefined {
        return this.textHost?.script.state.get().dirty;
    }

    get scriptAvailableScripts(): string[] | undefined {
        return this.textHost?.script.getAvailableScripts().map(script => script.entry?.path ?? script.value);
    }

    toggleScriptPanel(): void {
        this.requireTextHost().script.toggleOpen();
    }

    async selectScript(scriptPath?: string): Promise<void> {
        const host = this.requireTextHost();
        if (!scriptPath) {
            await host.script.selectScript(null);
            return;
        }

        const entry = host.script.getAvailableScripts().find(script => script.entry?.path === scriptPath);
        if (!entry) {
            throw new Error(`Text editor action unavailable: script path not found: ${scriptPath}`);
        }
        await host.script.selectScript(entry);
    }

    saveScript(): Promise<void> {
        return this.requireTextHost().script.saveToLibrary();
    }

    openScriptInTab(): Promise<void> {
        return this.requireTextHost().script.openInTab();
    }

    closeScriptPanel(): void {
        const host = this.requireTextHost();
        if (host.script.state.get().open) host.script.toggleOpen();
    }

    private get textHost(): TextFileModel | null {
        const host = this.editor.host;
        return isTextFileModel(host) ? host : null;
    }

    private requireTextHost(): TextFileModel {
        const host = this.textHost;
        if (!host) throw new Error("Text editor action unavailable: no text host attached");
        return host;
    }
}
