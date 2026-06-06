import type { PagesModel } from "./PagesModel";
import { EditorModel } from "../../editors/base";
import type { EditorOrHost } from "../../editors/base";
import { EditorView, PageDescriptor } from "../../../shared/types";
import { createLinkData } from "../../../shared/link-data";
import type { ILinkData } from "../../../shared/link-data";
import {
    isTextFileModel,
    newTextFileModel,
    TextFileModel,
} from "../../editors/text";
import { MonacoEditor, defaultMonacoEditorState } from "../../editors/monaco/MonacoEditor";
import { GridEditor, defaultGridEditorState, type GridEditorId } from "../../editors/grid";
import { LogViewEditor, defaultLogViewEditorState } from "../../editors/log-view";
import { MarkdownEditor, defaultMarkdownEditorState } from "../../editors/markdown";
import { SvgEditor, defaultSvgEditorState } from "../../editors/svg";
import { HtmlEditor, defaultHtmlEditorState } from "../../editors/html";
import { MermaidEditor, defaultMermaidEditorState } from "../../editors/mermaid";
import { GraphEditor, defaultGraphEditorState } from "../../editors/graph";
import { DrawEditor, defaultDrawEditorState } from "../../editors/draw";
import { LinkEditor, defaultLinkEditorState } from "../../editors/link-editor";
import { TodoEditor, defaultTodoEditorState } from "../../editors/todo";
import { RestClientEditor, defaultRestClientEditorState } from "../../editors/rest-client";
import { NotebookEditor, defaultNotebookEditorState } from "../../editors/notebook";
import { BrowserEditor } from "../../editors/browser";
import { ExplorerEditor, getDefaultExplorerEditorState } from "../../editors/explorer";
import { TComponentState } from "../../core/state/state";
import { api } from "../../../ipc/renderer/api";
import { recent } from "../recent";
import { ui } from "../ui";
import { settings } from "../settings";
import { editorRegistry } from "../../editors/base/editorRegistry";
import { getLanguageByExtension } from "../../core/utils/language-mapping";
import { PageModel } from "./PageModel";

import type { ILink } from "../../api/types/io.tree";
import type { LinkItem, LinkEditorData } from "../../editors/link-editor/linkTypes";
import { fpBasename, fpExtname } from "../../core/utils/file-path";
import { fs as appFs } from "../fs";
import { getWellKnownPageDef } from "./well-known-pages";
import type { IContentPipe } from "../../api/types/io.pipe";
import { ContentPipe } from "../../content/ContentPipe";
import { FileProvider } from "../../content/providers/FileProvider";
import { HttpProvider } from "../../content/providers/HttpProvider";
import { ArchiveTransformer } from "../../content/transformers/ArchiveTransformer";

function normalizeLinksTitle(title?: string): string {
    if (!title) return "untitled.link.json";
    if (/\.link\.json$/i.test(title)) return title;
    return title + ".link.json";
}

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
    const targetEditorId =
        legacyState.type === "textFile" && legacyState.editor
            ? legacyState.editor
            : "monaco";
    const isTextFile = legacyState.type === "textFile";

    if (targetEditorId === "monaco" && isTextFile) {
        const id = legacy.state.get().id || crypto.randomUUID();
        const monaco = new MonacoEditor(
            new TComponentState({ ...defaultMonacoEditorState, id }),
        );
        monaco.adoptHost(legacy as TextFileModel);
        return monaco;
    }

    if (
        isTextFile &&
        (targetEditorId === "grid-json" ||
            targetEditorId === "grid-csv" ||
            targetEditorId === "grid-jsonl")
    ) {
        const id = legacy.state.get().id || crypto.randomUUID();
        const grid = new GridEditor(
            new TComponentState({ ...defaultGridEditorState, id }),
            targetEditorId as GridEditorId,
        );
        grid.adoptHost(legacy as TextFileModel);
        // adoptHost only wires subscriptions — open-file callers have
        // already invoked legacy.restore(), so we trigger the CSV-delimiter
        // bootstrap and the initial row parse inline (mirrors what
        // GridEditor.restore() does on the session-restore path).
        const content = (legacy as TextFileModel).state.get().content ?? "";
        if (targetEditorId === "grid-csv") {
            const s = grid.state.get();
            if (!s.csvDelimiter || s.csvDelimiter === ",") {
                const detected = GridEditor.detectCsvDelimiter(content);
                if (detected !== s.csvDelimiter) {
                    grid.state.update((x) => {
                        x.csvDelimiter = detected;
                    });
                }
            }
        }
        grid.reparseRows(content);
        return grid;
    }

    if (isTextFile && targetEditorId === "log-view") {
        const id = legacy.state.get().id || crypto.randomUUID();
        const logView = new LogViewEditor(
            new TComponentState({ ...defaultLogViewEditorState, id }),
        );
        logView.adoptHost(legacy as TextFileModel);
        const content = (legacy as TextFileModel).state.get().content ?? "";
        logView.loadContent(content);
        return logView;
    }

    if (isTextFile && targetEditorId === "md-view") {
        const id = legacy.state.get().id || crypto.randomUUID();
        const markdown = new MarkdownEditor(
            new TComponentState({ ...defaultMarkdownEditorState, id }),
        );
        markdown.adoptHost(legacy as TextFileModel);
        return markdown;
    }

    if (isTextFile && targetEditorId === "svg-view") {
        const id = legacy.state.get().id || crypto.randomUUID();
        const svg = new SvgEditor(
            new TComponentState({ ...defaultSvgEditorState, id }),
        );
        svg.adoptHost(legacy as TextFileModel);
        return svg;
    }

    if (isTextFile && targetEditorId === "html-view") {
        const id = legacy.state.get().id || crypto.randomUUID();
        const html = new HtmlEditor(
            new TComponentState({ ...defaultHtmlEditorState, id }),
        );
        html.adoptHost(legacy as TextFileModel);
        return html;
    }

    if (isTextFile && targetEditorId === "mermaid-view") {
        const id = legacy.state.get().id || crypto.randomUUID();
        const mermaid = new MermaidEditor(
            new TComponentState({ ...defaultMermaidEditorState, id }),
        );
        mermaid.adoptHost(legacy as TextFileModel);
        return mermaid;
    }

    if (isTextFile && targetEditorId === "graph-view") {
        const id = legacy.state.get().id || crypto.randomUUID();
        const graph = new GraphEditor(
            new TComponentState({ ...defaultGraphEditorState, id }),
        );
        graph.adoptHost(legacy as TextFileModel);
        return graph;
    }

    if (isTextFile && targetEditorId === "draw-view") {
        const id = legacy.state.get().id || crypto.randomUUID();
        const draw = new DrawEditor(
            new TComponentState({ ...defaultDrawEditorState, id }),
        );
        draw.adoptHost(legacy as TextFileModel);
        return draw;
    }

    if (isTextFile && targetEditorId === "link-view") {
        const id = legacy.state.get().id || crypto.randomUUID();
        const link = new LinkEditor(
            new TComponentState({ ...defaultLinkEditorState, id }),
        );
        link.adoptHost(legacy as TextFileModel);
        const content = (legacy as TextFileModel).state.get().content ?? "";
        link.loadData(content);
        return link;
    }

    if (isTextFile && targetEditorId === "todo-view") {
        const id = legacy.state.get().id || crypto.randomUUID();
        const todo = new TodoEditor(
            new TComponentState({ ...defaultTodoEditorState, id }),
        );
        todo.adoptHost(legacy as TextFileModel);
        const content = (legacy as TextFileModel).state.get().content ?? "";
        todo.loadData(content);
        return todo;
    }

    if (isTextFile && targetEditorId === "rest-client") {
        const id = legacy.state.get().id || crypto.randomUUID();
        const rest = new RestClientEditor(
            new TComponentState({ ...defaultRestClientEditorState, id }),
        );
        rest.adoptHost(legacy as TextFileModel);
        const content = (legacy as TextFileModel).state.get().content ?? "";
        rest.loadData(content);
        return rest;
    }

    if (isTextFile && targetEditorId === "notebook-view") {
        const id = legacy.state.get().id || crypto.randomUUID();
        const notebook = new NotebookEditor(
            new TComponentState({ ...defaultNotebookEditorState, id }),
        );
        notebook.adoptHost(legacy as TextFileModel);
        const content = (legacy as TextFileModel).state.get().content ?? "";
        notebook.loadData(content);
        return notebook;
    }

    throw new Error(
        `attachEditorToPage: no mapping for editor id "${targetEditorId}" (type "${legacyState.type ?? "?"}").`,
    );
}

/** Module-private alias preserved for the existing call sites below. */
const wrap = attachEditorToPage;

export class PagesLifecycleModel {
    constructor(private model: PagesModel) {}

    // ── Pipe helpers ──────────────────────────────────────────────────

    private createPipeFromPath(path: string): IContentPipe {
        if (path.startsWith("http://") || path.startsWith("https://")) {
            return new ContentPipe(new HttpProvider(path));
        }
        const bangIndex = path.indexOf("!");
        if (bangIndex >= 0) {
            const archivePath = path.slice(0, bangIndex);
            const entryPath = path.slice(bangIndex + 1);
            return new ContentPipe(
                new FileProvider(archivePath),
                [new ArchiveTransformer(archivePath, entryPath)],
            );
        }
        return new ContentPipe(new FileProvider(path));
    }


    private newEditorModel = async (filePath?: string): Promise<EditorOrHost> => {
        const targetId = editorRegistry.resolveId(filePath) ?? "monaco";
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
        const def = editorRegistry.getById(editorId);
        if (!def || def.hasContentHost) {
            // Text-bearing or unknown — build a TextFileModel host.
            // `attachEditorToPage` picks the editor class based on
            // state.editor (set by `getPreviewEditor` in navigatePageTo,
            // or by `resolveId` for fresh file opens).
            return newTextFileModel(filePath) as unknown as EditorOrHost;
        }
        switch (editorId) {
            case "pdf-view": {
                const mod = await import("../../editors/pdf/PdfView");
                return mod.default.newEditorModel(filePath);
            }
            case "image-view": {
                const mod = await import("../../editors/image/ImageView");
                return mod.default.newEditorModel(filePath);
            }
            case "archive-view": {
                const mod = await import("../../editors/archive/ArchiveEditorView");
                return mod.default.newEditorModel(filePath);
            }
            case "video-view": {
                const mod = await import("../../editors/video/VideoView");
                return mod.default.newEditorModel(filePath);
            }
            case "category-view": {
                const mod = await import("../../editors/category/CategoryEditor");
                return mod.default.newEditorModel(filePath);
            }
            case "git-tree": {
                const mod = await import("../../editors/git-tree");
                return mod.default.newEditorModel(filePath);
            }
            default:
                // Unknown no-host id — fall back to Monaco text host.
                return newTextFileModel(filePath) as unknown as EditorOrHost;
        }
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
        if (pipe) {
            editor.pipe = pipe;
        }
        editor.state.update((s) => {
            s.language = "";
            if (title) s.title = title;
        });
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
        const { getImageDimensions, buildExcalidrawJsonWithImage } =
            await import("../../editors/draw/drawExport");
        const dims = await getImageDimensions(dataUrl);
        const json = buildExcalidrawJsonWithImage(dataUrl, "image/png", dims.width, dims.height);
        return this.addEditorPage("draw-view", "json", title ?? "untitled.excalidraw", json);
    };

    openLinks = (
        links: (ILink | string)[],
        title?: string,
    ): PageModel => {
        const normalizedTitle = normalizeLinksTitle(title);

        const linkItems: LinkItem[] = links.map((item) => {
            if (typeof item === "string") {
                return {
                    id: crypto.randomUUID(),
                    title: fpBasename(item) || item,
                    href: item,
                    category: "",
                    tags: [],
                    isDirectory: false,
                };
            }
            return {
                ...item,
                id: item.id || crypto.randomUUID(),
                category: item.category ?? "",
                tags: item.tags ?? [],
                isDirectory: item.isDirectory ?? false,
            };
        });

        const data: LinkEditorData = { links: linkItems, state: {} };
        const content = JSON.stringify({ type: "link-editor", ...data }, null, 4);

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
        options?: { sourceLink?: ILinkData; target?: string },
    ): Promise<PageModel | undefined> => {
        if (!filePath) return undefined;
        const existingPage = this.model.state
            .get()
            .pages.find((p) => {
                const main = p.mainEditor as { filePath?: string } | null;
                return main?.filePath === filePath;
            });
        if (existingPage) {
            pipe?.dispose();
            this.model.navigation.showPage(existingPage.id);
            return existingPage;
        }

        const editor = await this.createEditorFromFile(filePath, pipe, options?.target);
        if (options?.sourceLink) {
            editor.state.update((s) => { s.sourceLink = options.sourceLink; });
        }
        const page = this.addPage(wrap(editor));
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
            const { app: appInstance } = await import("../app");
            await appInstance.events.openRawLink.sendAsync(createLinkData(result.value));
        } else if (result.type === "file") {
            const filePaths = await api.showOpenFileDialog({
                title: "Open File",
                multiSelections: false,
            });
            if (filePaths && filePaths.length > 0) {
                const { app: appInstance } = await import("../app");
                await appInstance.events.openRawLink.sendAsync(createLinkData(filePaths[0]));
            }
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
        let existingFirst = this.model.state
            .get()
            .pages.find((p) => {
                const main = p.mainEditor as { filePath?: string } | null;
                return main?.filePath === firstPath;
            });
        let existingSecond = this.model.state
            .get()
            .pages.find((p) => {
                const main = p.mainEditor as { filePath?: string } | null;
                return main?.filePath === secondPath;
            });

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

    navigatePageTo = async (
        pageId: string,
        newFilePath: string,
        options?: {
            revealLine?: number;
            highlightText?: string;
            forceTextEditor?: boolean;
            sourceLink?: ILinkData;
            pipe?: IContentPipe;
            target?: string;
            title?: string;
        },
    ): Promise<boolean> => {
        const page = this.model.query.findPage(pageId);
        if (!page) return false;

        const oldEditor = page.mainEditor;
        if (oldEditor) {
            const released = await oldEditor.confirmRelease();
            if (!released) return false;
        }

        // Build legacy editor (with adapter wrap deferred until after the
        // post-restore mutations that need the underlying TextFileModel API).
        let legacy: EditorOrHost;
        const isVirtualPath = newFilePath.includes("://") || newFilePath.startsWith("data:");
        if (!isVirtualPath && !(await appFs.exists(newFilePath))) {
            ui.notify(
                `File not found: ${fpBasename(newFilePath)}`,
                "error",
            );
            legacy = newTextFileModel("");
            legacy.state.update((s) => {
                s.title = fpBasename(newFilePath);
            });
            await legacy.restore();
        } else {
            try {
                legacy = await this.createEditorFromFile(
                    newFilePath,
                    options?.pipe,
                    options?.target,
                    options?.title,
                );
            } catch (err) {
                ui.notify(
                    `Failed to open ${fpBasename(newFilePath)}: ${(err as Error).message}`,
                    "error",
                );
                legacy = newTextFileModel("");
                await legacy.restore();
            }
        }

        if (options?.sourceLink || options?.title) {
            legacy.state.update((s) => {
                if (options.sourceLink) s.sourceLink = options.sourceLink;
                if (options.title) s.title = options.title;
            });
        }

        const isTextFile = legacy.state.get().type === "textFile";
        const skipPreview = !!(
            options?.forceTextEditor ||
            options?.revealLine ||
            options?.highlightText
        );
        if (isTextFile && !skipPreview) {
            const ext = fpExtname(newFilePath).toLowerCase();
            const lang = getLanguageByExtension(ext);
            const languageId = lang?.id || "plaintext";
            const previewEditor = editorRegistry.getPreviewEditor(
                languageId,
                newFilePath,
            );
            if (previewEditor) {
                legacy.state.update((s) => {
                    s.editor = previewEditor as EditorView;
                });
            }
        }

        const adapter = wrap(legacy);
        await page.setMainEditor(adapter);

        // revealLine / highlightText apply after the editor has mounted.
        if (isTextFile && skipPreview) {
            const tfm = legacy as unknown as TextFileModel;
            if (options?.revealLine) {
                tfm.revealLine(options.revealLine);
            }
            if (options?.highlightText) {
                tfm.setHighlightText(options.highlightText);
            }
        }

        this.model.onShow.send(page);
        this.model.onFocus.send(page);
        this.model.persistence.saveState();
        return true;
    };

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

    handleOpenUrl = async (url: string) => {
        const { app: appInstance } = await import("../app");
        await appInstance.events.openRawLink.sendAsync(createLinkData(url));
    };

    handleExternalUrl = async (url: string) => {
        const { app: appInstance } = await import("../app");
        await appInstance.events.openRawLink.sendAsync(createLinkData(url));
    };

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

    showAboutPage = async (): Promise<void> => {
        const aboutModule = await import("../../editors/about");
        const model = await aboutModule.default.newEmptyEditorModel("aboutPage");
        if (model) {
            const page = new PageModel(aboutModule.ABOUT_PAGE_ID);
            this.addPage(wrap(model), page);
        }
    };

    showSettingsPage = async (): Promise<void> => {
        const settingsModule = await import("../../editors/settings");
        const model =
            await settingsModule.default.newEmptyEditorModel("settingsPage");
        if (model) {
            const page = new PageModel(settingsModule.SETTINGS_PAGE_ID);
            this.addPage(wrap(model), page);
        }
    };

    showBrowserPage = async (options?: {
        profileName?: string;
        incognito?: boolean;
        tor?: boolean;
        url?: string;
    }): Promise<void> => {
        if (options?.tor) {
            const torPath = settings.get("tor.exe-path");
            if (!torPath) {
                ui.notify(
                    "Browser (Tor) requires tor.exe path. Configure it in Settings → tor.exe-path",
                    "error",
                );
                return;
            }
            if (!(await appFs.exists(torPath))) {
                ui.notify(`tor.exe not found at: ${torPath}`, "error");
                return;
            }
        }

        const { browserModule } = await import("../../editors/browser");
        const model = browserModule.createEditor();
        if (model) {
            if (options?.profileName || options?.incognito || options?.tor) {
                model.state.update((s) => {
                    const ms = s as unknown as { profileName?: string; isIncognito?: boolean; isTor?: boolean };
                    if (options.profileName) ms.profileName = options.profileName;
                    if (options.incognito) ms.isIncognito = true;
                    if (options.tor) ms.isTor = true;
                });
            }
            if (options?.url) {
                model.state.update((s) => {
                    const ms = s as unknown as { url?: string; tabs?: { url?: string; homeUrl?: string }[] };
                    ms.url = options.url;
                    const tab = ms.tabs?.[0];
                    if (tab) {
                        tab.url = options.url;
                        tab.homeUrl = options.url;
                    }
                });
            }
            await model.restore();
            this.addPage(model);

            if (options?.tor) {
                (model as unknown as { initTorProxy: () => void }).initTorProxy();
            }
        }
    };

    showMcpInspectorPage = async (options?: { url?: string }): Promise<void> => {
        const mcpModule = await import("../../editors/mcp-inspector");
        const model =
            await mcpModule.default.newEmptyEditorModel("mcpInspectorPage");
        if (model) {
            if (options?.url) {
                model.state.update((s) => { (s as unknown as { url?: string }).url = options.url; });
            }
            this.addPage(wrap(model));
        }
    };

    showStorybookPage = async (): Promise<void> => {
        const storybookModule = await import("../../editors/storybook");
        const model = await storybookModule.default.newEmptyEditorModel("storybookPage");
        if (model) {
            const page = new PageModel(storybookModule.STORYBOOK_PAGE_ID);
            this.addPage(wrap(model), page);
        }
    };

    showVideoPlayerPage = async (): Promise<void> => {
        const videoModule = await import("../../editors/video");
        const model = await videoModule.default.newEmptyEditorModel("videoPage");
        if (model) {
            this.addPage(wrap(model));
        }
    };

    openImageInNewTab = async (imageUrl: string): Promise<void> => {
        const imgModule = await import("../../editors/image");
        const imgModel =
            await imgModule.default.newEmptyEditorModel("imageFile");
        if (imgModel) {
            imgModel.state.update(
                (s: { title: string; url?: string }) => {
                    s.title =
                        imageUrl.split("/").pop()?.split("?")[0] || "Image";
                    s.url = imageUrl;
                },
            );
            if (/^https?:\/\//i.test(imageUrl)) {
                imgModel.pipe = new ContentPipe(new HttpProvider(imageUrl));
            }
            await imgModel.restore();
            this.addPage(wrap(imgModel));

            if (imageUrl.startsWith("blob:") && imgModel instanceof imgModule.ImageEditorModel) {
                imgModel.cacheBlobUrl(imageUrl);
            }
        }
    };

    openUrlInBrowserTab = async (
        url: string,
        options?: {
            incognito?: boolean;
            profileName?: string;
            external?: boolean;
        },
    ): Promise<void> => {
        const pages = this.model.state.get().pages;
        const activePage = this.model.query.activePage;
        const activeIndex = activePage ? pages.indexOf(activePage) : -1;

        const matchesBrowser = (page: PageModel) => {
            const editor = page.mainEditorInstance;
            if (!(editor instanceof BrowserEditor)) return false;
            const pageState = editor.state.get();
            if (options?.incognito) return !!pageState.isIncognito;
            if (options?.external) {
                return !pageState.isIncognito && !pageState.isTor;
            }
            const targetProfile =
                options?.profileName !== undefined
                    ? options.profileName || ""
                    : undefined;
            return (
                !pageState.isIncognito &&
                !pageState.isTor &&
                (targetProfile === undefined ||
                    (pageState.profileName ?? "") === targetProfile)
            );
        };

        const addTabToPage = (index: number) => {
            const page = pages[index];
            const editor = page.mainEditorInstance;
            if (!(editor instanceof BrowserEditor)) return;
            const tabs = editor.state.get().tabs;
            if (tabs?.length === 1 && tabs[0].url === "about:blank") {
                editor.navigate(url);
            } else {
                editor.addTab(url);
            }
            this.model.navigation.showPage(page.id);
        };

        if (options?.external) {
            if (activeIndex >= 0 && matchesBrowser(pages[activeIndex])) {
                addTabToPage(activeIndex);
                return;
            }
            for (let i = 0; i < pages.length; i++) {
                if (matchesBrowser(pages[i])) {
                    addTabToPage(i);
                    return;
                }
            }
        } else {
            if (activeIndex >= 0 && matchesBrowser(pages[activeIndex])) {
                addTabToPage(activeIndex);
                return;
            }
            for (let i = activeIndex + 1; i < pages.length; i++) {
                if (matchesBrowser(pages[i])) {
                    addTabToPage(i);
                    return;
                }
            }
            for (let i = activeIndex - 1; i >= 0; i--) {
                if (matchesBrowser(pages[i])) {
                    addTabToPage(i);
                    return;
                }
            }
        }

        const profileName = options?.incognito
            ? undefined
            : (options?.profileName ??
                  settings.get("browser-default-profile")) || undefined;
        const showOptions = {
            url,
            ...(options?.incognito
                ? { incognito: true }
                : profileName
                  ? { profileName }
                  : {}),
        };
        await this.showBrowserPage(showOptions);
    };
}

// Avoid unused-import warning when isTextFileModel isn't used directly here
// after the GK2 migration. Re-export for callers that still import it.
export { isTextFileModel };
