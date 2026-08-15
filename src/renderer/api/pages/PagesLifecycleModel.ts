import type { PagesModel } from "./PagesModel";
import { EditorModel } from "../../editors/base";
import type { EditorOrHost } from "../../editors/base";
import { EditorView, PageDescriptor } from "../../../shared/types";
import { createLinkData } from "../../../shared/link-data";
import type { ILinkData } from "../../../shared/link-data";
import type { ILinkDiffRevision } from "../types/io.link-data";
import {
    newTextFileModel,
    TextFileModel,
} from "../../editors/text";
import { MonacoEditor, defaultMonacoEditorState } from "../../editors/monaco/MonacoEditor";
import { TextHostEditorModel } from "../../editors/base/TextHostEditorModel";
import { ExplorerEditor, getDefaultExplorerEditorState } from "../../editors/explorer";
import { TComponentState } from "../../core/state/state";
import { api } from "../../../ipc/renderer/api";
import { recent } from "../recent";
import { editorRegistry, isExplicitHostTarget } from "../../editors/base/editorRegistry";
import {
    resolveEditorIdForFile,
    parseBoardEditorId,
    customEditorRegistry,
} from "../../editors/board/custom-editor-registry";
import type { BoardEditorModel } from "../../editors/board";
import type { HubTab } from "../../editors/tools-hub";
import { PageModel } from "./PageModel";
import { navigatePageTo, type NavigatePageToOptions } from "./PageNavigator";

import type { ILink } from "../../api/types/io.tree";
import { buildLinkEditorContent } from "../../editors/link-editor/link-open";
import { getWellKnownPageDef } from "./well-known-pages";
import type { IContentPipe } from "../../api/types/io.pipe";
import { ContentPipe } from "../../content/ContentPipe";
import { HttpProvider } from "../../content/providers/HttpProvider";
import { pipeFromSourcePath } from "../../content/rebuild-pipe";

/** Attach an `EditorModel` or `TextFileModel` host to a `PageModel`.
 *  - `EditorModel` input: returned unchanged.
 *  - `TextFileModel` host input: construct a fresh editor over the host
 *    driven by `state.editor` (e.g. "monaco", "grid-json", "md-view", …) and
 *    return it. */
export function attachEditorToPage(legacy: EditorOrHost): EditorModel {
    if (legacy instanceof EditorModel) {
        return legacy as unknown as EditorModel;
    }

    const legacyState = legacy.state.get() as { type?: string; editor?: string };
    if (legacyState.type !== "textFile") {
        throw new Error(
            `attachEditorToPage: no mapping for editor id "${legacyState.editor ?? "monaco"}" (type "${legacyState.type ?? "?"}").`,
        );
    }
    const host = legacy as TextFileModel;
    const targetEditorId = legacyState.editor || "monaco";
    const id = host.state.get().id || crypto.randomUUID();

    // Monaco is the guaranteed-synchronous floor: the startup empty page and
    // `requireGroupedText` build it before the registry's content-host module
    // preload can be assumed complete, so it stays a static construction.
    if (targetEditorId === "monaco") {
        const monaco = new MonacoEditor(
            new TComponentState({ ...defaultMonacoEditorState, id }),
        );
        monaco.adoptHost(host);
        return monaco;
    }

    // Every other text-host editor comes from the registry's module cache
    // (warmed at startup by `preloadContentHostModules` — construction here
    // must stay synchronous, see `createEditorSync`).
    const editor = editorRegistry.createEditorSync(targetEditorId, id);
    if (!(editor instanceof TextHostEditorModel)) {
        throw new Error(
            `attachEditorToPage: editor "${targetEditorId}" does not wrap a text host.`,
        );
    }
    editor.adoptHost(host);
    // adoptHost only wires subscriptions — open-file callers have already
    // invoked host.restore(), so trigger the same initial parse/load the
    // switch and session-restore paths get via onHostAttached (no-op for
    // editors that parse inside adoptHost, e.g. env-vars).
    editor.bootstrapFromHost();
    return editor;
}

/** Module-private alias preserved for the existing call sites below. */
const wrap = attachEditorToPage;

export class PagesLifecycleModel {
    constructor(private model: PagesModel) {}

    // ── Pipe helpers ──────────────────────────────────────────────────

    private createPipeFromPath(path: string): IContentPipe {
        return pipeFromSourcePath(path);
    }


    private newEditorModel = async (filePath?: string): Promise<EditorOrHost> => {
        // Merged resolution (built-in registry + trusted file-associated boards).
        const targetId = resolveEditorIdForFile(filePath) ?? "monaco";
        return this.buildEditorById(targetId, filePath);
    };

    private newEditorModelByTarget = async (
        filePath: string,
        target: string,
    ): Promise<EditorOrHost> => {
        return this.buildEditorById(target, filePath);
    };

    /** Construct an editor for an editor id + optional file path. Text-bearing
     *  editors get a fresh TextFileModel host; no-host editors go through their
     *  standalone shim. */
    private buildEditorById = async (
        editorId: string,
        filePath?: string,
    ): Promise<EditorOrHost> => {
        // Custom-editor board (EPIC-042): a `board-editor:<root>` id has no static
        // registry def, so branch BEFORE the `!def` text fallback (which would else
        // open the file silently as text). Build the board initialized with the file
        // it edits (→ persephone.getFilePath()).
        const boardRoot = parseBoardEditorId(editorId);
        if (boardRoot !== null) {
            // Content-host board (EPIC-043): build the subclass WITH an adopted host so
            // Persephone owns the pipe/encoding/encryption/cache/dirty state. The host's
            // pipe is assigned by `createEditorFromFile` and restored below.
            const match = customEditorRegistry.entries.find((e) => e.editorId === editorId);
            if (match?.editorKind === "content-host") {
                const { getDefaultBoardEditorState } = await import("../../editors/board");
                const { BoardContentEditorModel } = await import(
                    "../../editors/board/BoardContentEditorModel"
                );
                const model = new BoardContentEditorModel(
                    new TComponentState(getDefaultBoardEditorState()),
                );
                model.initFromBoardRoot(boardRoot, filePath);
                model.adoptHost(newTextFileModel(filePath));
                return model as unknown as EditorOrHost;
            }
            const { boardModule } = await import("../../editors/board");
            const model = boardModule.createEditor() as unknown as BoardEditorModel;
            model.initFromBoardRoot(boardRoot, filePath);
            return model as unknown as EditorOrHost;
        }
        const def = editorRegistry.getById(editorId);
        if (!def || def.hasContentHost) {
            // Text-bearing or unknown — build a TextFileModel host.
            // `attachEditorToPage` picks the editor class based on
            // state.editor (set by `getPreviewEditor` in navigatePageTo,
            // or by `resolveId` for fresh file opens).
            return newTextFileModel(filePath) as unknown as EditorOrHost;
        }
        // No-host editor: modules that open from a file path (image, archive,
        // video, category, git-tree, mneme-root, board, toolset) declare
        // `newEditorModel`; a no-host id without it (browser, settings, …) is
        // never a file-open target and falls back to a Monaco text host.
        const module = await editorRegistry.getModule(editorId);
        if (module.newEditorModel) {
            return (await module.newEditorModel(filePath)) as unknown as EditorOrHost;
        }
        return newTextFileModel(filePath) as unknown as EditorOrHost;
    };

    // ── Core page operations ─────────────────────────────────────────

    createEditorFromFile = async (
        filePath: string,
        pipe?: IContentPipe,
        target?: string,
        title?: string,
    ): Promise<EditorOrHost> => {
        const editor = target
            ? await this.newEditorModelByTarget(filePath, target)
            : await this.newEditorModel(filePath);
        // A content-host board (EPIC-043) owns its content on the adopted HOST, not on the
        // board's own state — so pipe assignment and the pre-restore language reset must
        // target the host. A bare TextFileModel host has no `contentHost` accessor, so
        // `host` is null and everything falls through to the editor itself (unchanged for
        // every text editor and the simple board, whose never-read pipe is disposed on dispose).
        const host = (editor as EditorModel).contentHost;
        if (pipe) {
            if (host) {
                (host as unknown as TextFileModel).pipe = pipe;
            } else {
                editor.pipe = pipe;
            }
        }
        // Reset language to "" on whichever object carries the content state so restore()
        // re-derives it from the file extension (its `s.language || getLanguageByExtension(ext)`
        // guard only falls through when language is falsy — the default "plaintext" is truthy).
        // For a content-host board the language lives on the host, not the board's state.
        (host ?? editor).state.update((s) => {
            s.language = "";
        });
        if (title) {
            editor.state.update((s) => {
                s.title = title;
            });
        }
        await editor.restore();
        return editor;
    };

    /**
     * Add an editor to the page collection.
     *
     * @param editor — the EditorModel to add (null for empty pages with sidebar only)
     * @param existingPage — optional pre-created PageModel
     */
    addPage = (
        editor: EditorModel | null,
        existingPage?: PageModel,
    ): PageModel => {
        const page = existingPage ?? new PageModel();
        if (editor && !page.mainEditor) {
            page.attach(editor);
            page.setMainEditorId(editor.id);
        }

        const existingById = this.model.query.findPage(page.id);
        if (existingById) {
            this.model.navigation.showPage(existingById.id);
            return existingById;
        }

        this.model.attachPage(page);

        this.model.state.update((s) => {
            s.pages.push(page);
            s.ordered.push(page);
        });
        this.model.persistence.saveState();

        return page;
    };

    addEmptyPage = (): PageModel => {
        const emptyFile = newTextFileModel("");
        emptyFile.restore();
        return this.addPage(wrap(emptyFile));
    };

    addEmptyPageWithNavPanel = async (folderPath: string): Promise<PageModel> => {
        const page = new PageModel();
        const state = new TComponentState({
            ...getDefaultExplorerEditorState(),
            rootPath: folderPath,
        });
        const explorer = new ExplorerEditor(state);
        page.attach(explorer);
        await explorer.restore();
        page.ensureSecondaryViewsModel();
        return this.addPage(null, page);
    };

    addEditorPage = (
        editor: EditorView,
        language: string,
        title: string,
        content?: string,
    ): PageModel => {
        if (typeof editor !== "string") {
            throw new Error(
                `addEditorPage() expects positional arguments: (editor, language, title, content?). Got ${typeof editor} for editor. Example: addEditorPage("monaco", "plaintext", "My Page", "content")`,
            );
        }
        const editorDef = editorRegistry.getById(editor);
        if (!editorDef && editor !== "monaco") {
            throw new Error(
                `Editor '${editor}' is not registered. Available editors: ${editorRegistry.getAll().map((e) => e.id).join(", ")}`,
            );
        }
        if (editorDef && !editorDef.hasContentHost) {
            throw new Error(
                `Cannot create '${editor}' with addEditorPage() — it is a standalone editor that requires a specialized model. Use the dedicated method instead (e.g., showBrowserPage(), showAboutPage(), openFile()).`,
            );
        }
        const editorModel = newTextFileModel("");
        editorModel.state.update((s) => {
            s.title = title;
            s.language = language;
            s.editor = editorRegistry.validateForLanguage(editor, language) as EditorView;
        });
        if (content) {
            editorModel.changeContent(content);
        }
        editorModel.restore();
        return this.addPage(wrap(editorModel));
    };

    requireWellKnownPage = async (id: string): Promise<PageModel> => {
        const existing = this.model.query.findPage(id);
        if (existing) {
            this.model.navigation.showPage(id);
            return existing;
        }

        const def = getWellKnownPageDef(id);
        if (!def) throw new Error(`Unknown well-known page ID: "${id}"`);

        const editorModel = newTextFileModel("");
        editorModel.state.update((s) => {
            s.id = id;
            s.title = def.title;
            s.language = def.language;
            s.editor = editorRegistry.validateForLanguage(
                def.editor as EditorView,
                def.language,
            ) as EditorView;
        });
        editorModel.restore();
        const page = new PageModel(id);
        return this.addPage(wrap(editorModel), page);
    };

    addDrawPage = async (dataUrl: string, title?: string): Promise<PageModel> => {
        const { buildExcalidrawJsonFromDataUrl } =
            await import("../../editors/draw/drawExport");
        const json = await buildExcalidrawJsonFromDataUrl(dataUrl);
        return this.addEditorPage("draw-view", "json", title ?? "untitled.excalidraw", json);
    };

    openLinks = (
        links: (ILink | string)[],
        title?: string,
    ): PageModel => {
        const { title: normalizedTitle, content } = buildLinkEditorContent(links, title);

        const editorModel = newTextFileModel("");
        editorModel.state.update((s) => {
            s.title = normalizedTitle;
            s.language = "json";
            s.editor = editorRegistry.validateForLanguage("link-view", "json") as EditorView;
        });
        editorModel.restore();
        editorModel.changeContent(content);

        const page = new PageModel();
        const adapter = wrap(editorModel);
        adapter.secondaryView = ["link-category"];
        page.addSecondaryView(adapter);
        page.ensureSecondaryViewsModel();
        page.expandPanel("link-category");

        this.addPage(null, page);
        this.model.closeFirstPageIfEmpty();
        return page;
    };

    // ── File opening ─────────────────────────────────────────────────

    openFile = async (
        filePath?: string,
        pipe?: IContentPipe,
        options?: {
            sourceLink?: ILinkData;
            target?: string;
            diffFrom?: ILinkDiffRevision;
            diffTo?: ILinkDiffRevision;
            fragment?: string;
        },
    ): Promise<PageModel | undefined> => {
        if (!filePath) return undefined;
        // Existing-page dedupe is deliberately left intact (US-637): an already-
        // open file just activates its page and the diff metadata is dropped.
        // "Open in new Tab" preselection therefore applies only on a fresh open.
        const existingPage = this.model.query.findPageByFilePath(filePath);
        if (existingPage) {
            pipe?.dispose();
            this.model.navigation.showPage(existingPage.id);
            // The document is already open — an anchor link into it is still a jump
            // request, so honor the fragment on the live editor (US-901).
            if (options?.fragment) {
                existingPage.mainEditorInstance?.revealFragment?.(options.fragment);
            }
            return existingPage;
        }

        const editor = await this.createEditorFromFile(filePath, pipe, options?.target);
        if (options?.sourceLink) {
            editor.state.update((s) => { s.sourceLink = options.sourceLink; });
        }
        // Honor an explicit content-host target (e.g. "file-diff") that isn't the
        // file's natural editor, so a new-tab open lands on the requested editor —
        // mirrors navigatePageTo's isExplicitHostTarget handling (US-637).
        const explicitTarget = options?.target;
        if (
            editor.state.get().type === "textFile" &&
            isExplicitHostTarget(explicitTarget, filePath)
        ) {
            editor.state.update((s) => { s.editor = explicitTarget as EditorView; });
        }
        const adapter = wrap(editor);
        const page = this.addPage(adapter);
        // Apply caller-chosen diff revisions to a freshly-built File Diff editor
        // (no-op for any other editor type / when no revisions given) (US-637).
        (adapter as { applyDiffRevisions?: (f?: ILinkDiffRevision, t?: ILinkDiffRevision) => void })
            .applyDiffRevisions?.(options?.diffFrom, options?.diffTo);
        // Anchor target from the opening link. The editor's view may not be mounted
        // yet — implementations queue the request (US-901).
        if (options?.fragment) adapter.revealFragment?.(options.fragment);
        // A new-tab open carrying a preselected comparison (diffFrom/diffTo) is a
        // File Diff — expand its own first panel ("File History") instead of the
        // default "explorer" active panel (US-637). Uses the editor's registered
        // panel, so there's no hardcoded panel id here; the panel is registered
        // during `wrap`/adopt and the deferred auto-Explorer attach doesn't change
        // the active panel.
        if (options?.diffFrom || options?.diffTo) {
            const panelId = adapter.secondaryView?.[0];
            if (panelId) page.expandPanel(panelId);
        }
        recent.add(filePath);

        this.model.closeFirstPageIfEmpty();
        return page;
    };

    openFileAsArchive = async (filePath: string): Promise<PageModel> => {
        if (filePath.toLowerCase().endsWith(".asar")) {
            return this._openAsarArchive(filePath);
        }
        return this._openZipArchive(filePath);
    };

    private async _openAsarArchive(filePath: string): Promise<PageModel> {
        const archiveRoot = filePath;
        const existing = this.model.state.get().pages.find((p) => {
            const explorer = p.findExplorer();
            if (!explorer) return false;
            const s = explorer.state.get() as { type?: string; rootPath?: string };
            return s.type === "fileExplorer" && s.rootPath === archiveRoot;
        });
        if (existing) {
            this.model.navigation.showPage(existing.id);
            return existing;
        }
        const page = await this.addEmptyPageWithNavPanel(archiveRoot);
        this.model.closeFirstPageIfEmpty();
        return page;
    }

    private async _openZipArchive(filePath: string): Promise<PageModel> {
        const existing = this.model.state.get().pages.find((p) => {
            const main = p.mainEditor;
            if (!main) return false;
            const s = main.state.get() as { type?: string; archiveUrl?: string };
            return s.type === "archiveFile" && s.archiveUrl === filePath;
        });
        if (existing) {
            this.model.navigation.showPage(existing.id);
            return existing;
        }

        const legacy = await this.buildEditorById("archive-view", filePath);

        const page = new PageModel();
        const adapter = wrap(legacy);
        page.attach(adapter);
        page.setMainEditorId(adapter.id);
        page.ensureSecondaryViewsModel();

        this.addPage(adapter, page);
        this.model.closeFirstPageIfEmpty();
        return page;
    }

    closePage = async (pageId: string): Promise<boolean> => {
        const page = this.model.query.findPage(pageId);
        if (!page) return false;
        return await page.close();
    };

    openFileWithDialog = async () => {
        const { showOpenUrlDialog } = await import("../../ui/dialogs/OpenUrlDialog");
        const result = await showOpenUrlDialog();
        if (!result) return;

        if (result.type === "url") {
            await this.sendOpenRawLink(result.value);
        } else if (result.type === "file") {
            await this.openFileFromDialog();
        }
    };

    openFileFromDialog = async () => {
        const filePaths = await api.showOpenFileDialog({
            title: "Open File",
            multiSelections: false,
        });
        if (filePaths && filePaths.length > 0) {
            await this.sendOpenRawLink(filePaths[0]);
        }
    };

    /**
     * Open two files side-by-side in compare mode. Walkthrough 06 / CK8:
     * compose `groupTabs + enterCompareMode` instead of mutating
     * `compareMode` state field directly.
     */
    openDiff = async (
        params: { firstPath: string; secondPath: string } | undefined,
    ) => {
        if (!params) return;
        const { firstPath, secondPath } = params;
        if (!firstPath || !secondPath) return;
        let existingFirst = this.model.query.findPageByFilePath(firstPath);
        let existingSecond = this.model.query.findPageByFilePath(secondPath);

        if (!existingFirst) {
            const pipe = this.createPipeFromPath(firstPath);
            const editor = await this.createEditorFromFile(firstPath, pipe);
            existingFirst = this.addPage(wrap(editor));
        }
        if (!existingSecond) {
            const pipe = this.createPipeFromPath(secondPath);
            const editor = await this.createEditorFromFile(secondPath, pipe);
            existingSecond = this.addPage(wrap(editor));
        }

        this.model.layout.groupTabs(existingFirst.id, existingSecond.id, true);
        this.model.layout.enterCompareMode(existingFirst.id);
        this.model.navigation.showPage(existingFirst.id);
    };

    // ── Navigation within a page ─────────────────────────────────────

    /** Delegates to the named-steps implementation in ./PageNavigator.ts. */
    navigatePageTo = (
        pageId: string,
        newFilePath: string,
        options?: NavigatePageToOptions,
    ): Promise<boolean> => navigatePageTo(this.model, pageId, newFilePath, options);

    // ── Closing ──────────────────────────────────────────────────────

    closeToTheRight = async (pageId: string) => {
        const { pages } = this.model.state.get();
        const pagesToClose = [];
        for (let i = pages.length - 1; i >= 0; i--) {
            if (pages[i].id === pageId) {
                break;
            }
            if (!pages[i].pinned) {
                pagesToClose.push(pages[i]);
            }
        }
        for (const page of pagesToClose) {
            const closed = await page.close();
            if (!closed) {
                break;
            }
        }
    };

    closeOtherPages = async (pageId: string) => {
        const { pages } = this.model.state.get();
        const pagesToClose = [];
        for (let i = pages.length - 1; i >= 0; i--) {
            if (pages[i].id !== pageId && !pages[i].pinned) {
                pagesToClose.push(pages[i]);
            }
        }
        for (const page of pagesToClose) {
            const closed = await page.close();
            if (!closed) {
                break;
            }
        }
    };

    // ── Multi-window operations ──────────────────────────────────────

    /**
     * Receive a page transferred from another window. Walkthrough 05 / M2:
     * delegates to `PagesPersistenceModel.restorePage` for the shared restore
     * pathway; this method only does the target-window-side splice + activate.
     */
    movePageIn = async (data?: {
        page: PageDescriptor;
        targetPageId: string | undefined;
    }) => {
        if (!data?.page) return;

        const page = await this.model.persistence.restorePage(data.page);
        if (!page) return;

        const targetIndex = data.targetPageId
            ? this.model.state.get().pages.findIndex((p) => p.id === data.targetPageId)
            : -1;

        if (targetIndex === -1) {
            this.addPage(page.mainEditorInstance, page);
            this.model.closeFirstPageIfEmpty();
        } else {
            this.model.attachPage(page);
            this.model.state.update((s) => {
                s.pages.splice(targetIndex, 0, page);
                s.ordered.push(page);
            });
            this.model.layout.fixGrouping();
            this.model.persistence.saveStateDebounced();
        }
    };

    movePageOut = async (pageId?: string) => {
        const page = this.model.query.findPage(pageId);
        if (!page) return;

        await page.saveState();
        const closeWindow = this.model.state.get().pages.length === 1;

        if (closeWindow) {
            this.model.state.update((s) => {
                s.pages = s.pages.filter((p) => p !== page);
                s.ordered = s.ordered.filter((p) => p !== page);
            });
            this.model.persistence.saveStateDebounced();
            api.closeWindow();
        } else {
            this.model.detachPage(page);
            this.model.removePage(page);
            // Keep-alive editors (busy Board, US-799) never transfer their
            // processes to the target window: the page is re-created there from
            // its descriptor, so the source-side model would otherwise leak —
            // and with it the jobs main keeps alive for it. Dispose them here
            // (reaps the jobs); a cross-window move thus KILLS a busy board's
            // processes — the documented limitation. (The closeWindow branch
            // needs no equivalent: the dying webContents triggers main's
            // reapHost backstop.)
            for (const editor of [...page.editors]) {
                if (editor.keepAliveOnNavigation()) void editor.dispose();
            }
        }
    };

    // ── Duplication ──────────────────────────────────────────────────

    /**
     * Walkthrough 05 / M2: build a fresh-id descriptor, then route through
     * `restorePage` for symmetric construction.
     */
    duplicatePage = async (pageId: string) => {
        const page = this.model.query.findPage(pageId);
        if (!page?.mainEditor) return;

        const sourceDesc = page.getDescriptor();
        // Fresh ids: page + each editor. Re-point mainEditorId to the new editor id.
        const editorsWithFreshIds = sourceDesc.editors.map((e) => ({
            ...e,
            id: crypto.randomUUID(),
        }));
        const oldMainIndex = sourceDesc.editors.findIndex(
            (e) => e.id === sourceDesc.mainEditorId,
        );
        const newMainEditorId = oldMainIndex >= 0
            ? editorsWithFreshIds[oldMainIndex].id
            : null;

        const desc: PageDescriptor = {
            id: crypto.randomUUID(),
            pinned: false,
            modified: sourceDesc.modified,
            mainEditorId: newMainEditorId,
            editors: editorsWithFreshIds,
            sidebar: undefined,
        };

        const newPage = await this.model.persistence.restorePage(desc);
        if (newPage) {
            this.model.attachPage(newPage);
            this.model.state.update((s) => {
                s.pages.push(newPage);
                s.ordered.push(newPage);
            });
            this.model.layout.groupTabs(pageId, newPage.id, false);
        }
    };

    // ── URL handling ─────────────────────────────────────────────────

    /** Dispatch a raw href into the content pipeline (Layer 1 entry point).
     *  Single implementation behind the distinct main-process subscription
     *  points and the open dialogs. */
    private sendOpenRawLink = async (href: string) => {
        const { app: appInstance } = await import("../app");
        await appInstance.events.openRawLink.sendAsync(createLinkData(href));
    };

    handleOpenUrl = (url: string) => this.sendOpenRawLink(url);

    handleExternalUrl = (url: string) => this.sendOpenRawLink(url);

    openPathInNewWindow = (filePath: string) => {
        if (!filePath) return;
        api.openNewWindow(filePath);
    };

    // ── Grouped text helper ──────────────────────────────────────────

    /** Walkthrough 07 / GK2 (signature refined 08 / T2): use `getTextFileHost`
     *  to discriminate text-bearing partner pages. */
    requireGroupedText = (
        pageId: string,
        suggestedLanguage?: string,
    ): TextFileModel => {
        let groupedPage = this.model.query.getGroupedPage(pageId);
        if (groupedPage && !this.model.query.getTextFileHost(groupedPage.id)) {
            this.model.layout.ungroup(pageId);
            groupedPage = undefined;
        }

        if (!groupedPage) {
            groupedPage = this.addEmptyPage();
            this.model.layout.groupTabs(
                pageId,
                groupedPage.id,
                false,
            );
            const host = this.model.query.getTextFileHost(groupedPage.id);
            host?.changeLanguage(suggestedLanguage);
        }

        const host = this.model.query.getTextFileHost(groupedPage.id);
        if (!host) {
            throw new Error("requireGroupedText: failed to materialize text host");
        }
        return host;
    };

    // ── Page-actions (from old page-actions.ts) ──────────────────────

    /** Create a no-host editor by registry id on a (possibly fixed-id) page.
     *  `addPage` dedupes by page id, so a second call with the same fixed id
     *  focuses the existing singleton instead of duplicating it. */
    private showEditorPage = async (
        editorId: string,
        pageId?: string,
    ): Promise<PageModel> => {
        const model = await editorRegistry.createEditor(editorId);
        return this.addPage(model, pageId ? new PageModel(pageId) : undefined);
    };

    showAboutPage = async (): Promise<void> => {
        const { ABOUT_PAGE_ID } = await import("../../editors/about");
        await this.showEditorPage("about-view", ABOUT_PAGE_ID);
    };

    showSettingsPage = async (): Promise<void> => {
        const { SETTINGS_PAGE_ID } = await import("../../editors/settings");
        await this.showEditorPage("settings-view", SETTINGS_PAGE_ID);
    };

    showMnemeConfigPage = async (): Promise<void> => {
        const { MNEME_CONFIG_PAGE_ID } = await import("../../editors/mneme-config");
        await this.showEditorPage("mneme-config", MNEME_CONFIG_PAGE_ID);
    };

    /** Browser opening lives in editors/browser/browser-pages.ts so this
     *  startup-loaded module carries no static import of the browser chunk. */
    showBrowserPage = async (options?: {
        profileName?: string;
        incognito?: boolean;
        tor?: boolean;
        url?: string;
    }): Promise<PageModel | undefined> => {
        const { showBrowserPage } = await import(
            "../../editors/browser/browser-pages"
        );
        return showBrowserPage(this.model, options);
    };

    showMcpInspectorPage = async (
        options?: { url?: string; name?: string; autoConnect?: boolean },
    ): Promise<void> => {
        const model = await editorRegistry.createEditor("mcp-view");
        if (options?.url || options?.name) {
            model.state.update((s) => {
                const cs = s as unknown as { url?: string; connectionName?: string };
                if (options.url) cs.url = options.url;
                if (options.name) cs.connectionName = options.name;
            });
        }
        this.addPage(model);
        // Auto-connect (HTTP transport is the default state) — fire-and-forget so
        // the page opens immediately and shows the "connecting" state itself.
        if (options?.autoConnect && options?.url) {
            void (model as unknown as { connect?: () => Promise<void> }).connect?.();
        }
    };

    showStorybookPage = async (): Promise<void> => {
        const { STORYBOOK_PAGE_ID } = await import("../../editors/storybook");
        await this.showEditorPage("storybook-view", STORYBOOK_PAGE_ID);
    };

    showToolsHubPage = async (opts?: { tab?: HubTab }): Promise<void> => {
        const { TOOLS_HUB_PAGE_ID } = await import("../../editors/tools-hub");
        // showEditorPage dedupes by id → returns the existing hub page if already
        // open; set the tab on whichever editor actually ends up live (new or existing).
        const result = await this.showEditorPage("tools-hub-view", TOOLS_HUB_PAGE_ID);
        if (opts?.tab) {
            const editor = result.mainEditorInstance as unknown as { setTab?: (t: HubTab) => void };
            editor.setTab?.(opts.tab);
        }
    };

    showVideoPlayerPage = async (): Promise<void> => {
        await this.showEditorPage("video-view");
    };

    openImageInNewTab = async (imageUrl: string, title?: string): Promise<void> => {
        const imgModule = await import("../../editors/image");
        const imgModel = await editorRegistry.createEditor("image-view");
        imgModel.state.update((s) => {
            const is = s as unknown as { title: string; url?: string };
            is.title =
                title || imageUrl.split("/").pop()?.split("?")[0] || "Image";
            is.url = imageUrl;
        });
        if (/^https?:\/\//i.test(imageUrl)) {
            imgModel.pipe = new ContentPipe(new HttpProvider(imageUrl));
        }
        await imgModel.restore();
        this.addPage(imgModel);

        if (imageUrl.startsWith("blob:") && imgModel instanceof imgModule.ImageEditorModel) {
            imgModel.cacheBlobUrl(imageUrl);
        }
    };

    openUrlInBrowserTab = async (
        url: string,
        options?: {
            incognito?: boolean;
            profileName?: string;
            external?: boolean;
        },
    ): Promise<string | undefined> => {
        const { openUrlInBrowserTab } = await import(
            "../../editors/browser/browser-pages"
        );
        return openUrlInBrowserTab(this.model, url, options);
    };
}
