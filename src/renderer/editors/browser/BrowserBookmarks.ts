const fs = require("fs");
import { debounce } from "../../../shared/utils";
import { TComponentState } from "../../core/state/state";
import { TextFileModel, getDefaultTextFileEditorModelState } from "../text/TextEditorModel";
import { LinkEditor, defaultLinkEditorState } from "../link-editor";
import { LinkItem } from "../link-editor/linkTypes";
import { BrowserPanelHost } from "./BrowserPanelHost";
import { EditorView } from "../../../shared/types";
import { shell } from "../../api/shell";
import { ui } from "../../api/ui";

export class BrowserBookmarks {
    readonly textFileHost: TextFileModel;
    readonly linkEditor: LinkEditor;
    /** IPageHost that hosts the Link editor's SecondaryViews panels in the
     *  browser empty page + bookmarks drawer (US-601). */
    readonly panelHost = new BrowserPanelHost();
    private saveDebounced = debounce(() => this.textFileHost.saveFile(), 300);

    constructor(filePath: string) {
        const state = {
            ...getDefaultTextFileEditorModelState(),
            filePath,
            language: "json",
            editor: "link-view" as EditorView,
        };
        this.textFileHost = new TextFileModel(new TComponentState(state));
        // TextFileModel creates sub-models (script, editor) we don't need,
        // but they are lightweight and won't cause issues.
        this.textFileHost.skipSave = true;
        // LinkEditor is constructed empty; the host adoption (in `init`)
        // wires up subscriptions and seeds HS1 settings.
        this.linkEditor = new LinkEditor(
            new TComponentState({
                ...defaultLinkEditorState,
                id: crypto.randomUUID(),
            }),
        );
    }

    /**
     * Initialize bookmarks: restore host, handle encryption, adopt host into LinkEditor.
     * @param options.silent When true, skip password dialog for encrypted files (return false instead).
     */
    async init(options?: { silent?: boolean }): Promise<boolean> {
        await this.textFileHost.restore();

        // If the bookmarks file is encrypted, prompt for password (unless silent)
        if (shell.encryption.isEncrypted(this.textFileHost.state.get().content || "")) {
            if (options?.silent) return false; // silent mode — don't prompt
            const password = await ui.password({ mode: "decrypt" });
            if (!password) return false; // user cancelled
            const ok = await this.textFileHost.decrypt(password);
            if (!ok) return false; // wrong password
        }

        // BR-IMPL2 — construct-then-adoptHost. Mirrors the attachEditorToPage
        // pattern from Todo / Rest Client / Notebook. LinkEditor adopts the
        // already-restored host (no re-read) and parses the initial content
        // inline via loadData.
        this.linkEditor.adoptHost(this.textFileHost);
        this.linkEditor.loadData(this.textFileHost.state.get().content ?? "");

        // US-601 — attach the Link editor to the browser panel host so its
        // Categories/Tags/Hostnames panels render via SecondaryViews on the
        // browser empty page + bookmarks drawer. setPage seeds the active panel
        // from the restored `expandedPanel` HS1 slot.
        this.panelHost.attach(this.linkEditor);

        // Auto-save to disk when modified by user. LinkEditor's
        // onDataChangedDebounced writes serialized state back to
        // host.changeContent which flips host.state.modified — that's the
        // trigger we watch here.
        this.textFileHost.state.subscribe(() => {
            if (this.textFileHost.state.get().modified) {
                this.saveDebounced();
            }
        });
        return true;
    }

    async dispose(): Promise<void> {
        // Detach the panel host first (clears linkEditor.page) so the editor's
        // teardown runs cleanly, then dispose the editor. LinkEditor.dispose
        // flushes its debounced save, tears down host subscriptions, and
        // disposes the TextFileModel host. Single-owner lifecycle — no
        // ref-counting needed.
        this.panelHost.dispose();
        await this.linkEditor.dispose();
    }

    /** Check if a URL exists in the bookmarks. */
    findByUrl(url: string): LinkItem | undefined {
        return this.linkEditor.state.get().data.links.find(
            (link) => link.href === url,
        );
    }
}

/** Create an empty .link.json file at the given path. */
export function createEmptyLinkFile(filePath: string): void {
    const emptyData = JSON.stringify({ links: [], state: {} }, null, 4);
    fs.writeFileSync(filePath, emptyData, "utf-8");
}
