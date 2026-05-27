import type { PagesModel } from "./PagesModel";
import { EditorModel as V4EditorModel } from "../../editors/base/v4";
import { LegacyEditorAdapter, deriveEditorId } from "../../editors/base/v4";
import type { EditorModel as LegacyEditorModel } from "../../editors/base/EditorModel";
import { IEditorState, EditorView, EditorType, PageDescriptor } from "../../../shared/types";
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
import { editorRegistry } from "../../editors/registry";
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

/** Wrap a legacy EditorModel for attachment to a `PageModel`.
 *
 *  EPIC-028 / US-551: text-bearing editors whose target view is "monaco"
 *  get wrapped in a native `MonacoEditor`; the legacy `TextFileModel` becomes
 *  the editor's `IContentHost`. Every other legacy editor (other content-views,
 *  standalone editors) keeps the `LegacyEditorAdapter` path until its own
 *  per-editor migration (US-552+).
 *
 *  Exported as `PagesLifecycleModel.wrapForPage` so the v3 restore path
 *  (PagesPersistenceModel.restoreV3) can auto-promote pre-US-551 sessions to
 *  native Monaco — the next save then writes the v4-native shape.
 */
export function wrapLegacyForPage(legacy: LegacyEditorModel): V4EditorModel {
    // EPIC-028 / US-568 / PD-IMPL16 — if the "legacy" module factory
    // returned a v4-native editor (post-migration standalone editors use
    // `as unknown as EditorModel` casts in their preserved EditorModule
    // shims — `BrowserView.tsx`, `PdfView.tsx`, future Image/Video/etc.),
    // return it directly without adapter wrap. `createEditorFromFile`
    // already called `editor.restore()` before this function — v4 editors
    // expose the same surface as legacy editors for that call. Closes the
    // open-file gap so US-559 can delete `LegacyEditorAdapter` cleanly.
    // Benefits Browser retroactively (closes US-558 limitation).
    if (legacy instanceof V4EditorModel) {
        return legacy as unknown as V4EditorModel;
    }

    const targetEditorId = deriveEditorId(legacy.state.get());
    const isTextFile = (legacy as unknown as { type?: string }).type === "textFile";

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

    // EPIC-028 / US-553 — LogView migrated to native v4 module. Construct
    // LogViewEditor over the legacy TextFileModel host and trigger the
    // initial JSONL parse inline (mirrors GridEditor's open-file branch).
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

    // EPIC-028 / US-554 — Markdown migrated to native v4 module. Construct
    // MarkdownEditor over the legacy TextFileModel host. No initial parse
    // step — the body reads host.state.content via state.use() and
    // MarkdownBlock re-renders on every content change via React props.
    if (isTextFile && targetEditorId === "md-view") {
        const id = legacy.state.get().id || crypto.randomUUID();
        const markdown = new MarkdownEditor(
            new TComponentState({ ...defaultMarkdownEditorState, id }),
        );
        markdown.adoptHost(legacy as TextFileModel);
        return markdown;
    }

    // EPIC-028 / US-560 — Svg migrated to native v4 module. Construct
    // SvgEditor over the legacy TextFileModel host. No initial parse step —
    // the body reads host.state.content via state.use() and BaseImageView
    // re-renders on every src prop change.
    if (isTextFile && targetEditorId === "svg-view") {
        const id = legacy.state.get().id || crypto.randomUUID();
        const svg = new SvgEditor(
            new TComponentState({ ...defaultSvgEditorState, id }),
        );
        svg.adoptHost(legacy as TextFileModel);
        return svg;
    }

    // EPIC-028 / US-561 — Html migrated to native v4 module. Construct
    // HtmlEditor over the legacy TextFileModel host. No initial parse step —
    // the body reads host.state.content via state.use() and the iframe
    // re-renders on every srcDoc prop change.
    if (isTextFile && targetEditorId === "html-view") {
        const id = legacy.state.get().id || crypto.randomUUID();
        const html = new HtmlEditor(
            new TComponentState({ ...defaultHtmlEditorState, id }),
        );
        html.adoptHost(legacy as TextFileModel);
        return html;
    }

    // EPIC-028 / US-562 — Mermaid migrated to native v4 module. Construct
    // MermaidEditor over the legacy TextFileModel host. The initial
    // renderDebounced() call kicks off inside adoptHost (mirrors today's
    // MermaidViewModel.onInit → renderDebounced behavior).
    if (isTextFile && targetEditorId === "mermaid-view") {
        const id = legacy.state.get().id || crypto.randomUUID();
        const mermaid = new MermaidEditor(
            new TComponentState({ ...defaultMermaidEditorState, id }),
        );
        mermaid.adoptHost(legacy as TextFileModel);
        return mermaid;
    }

    // EPIC-028 / US-564 — Graph migrated to native v4 module. Construct
    // GraphEditor over the legacy TextFileModel host. The initial
    // parseContent() call kicks off inside adoptHost (mirrors today's
    // GraphViewModel.onInit → parseContent behavior).
    if (isTextFile && targetEditorId === "graph-view") {
        const id = legacy.state.get().id || crypto.randomUUID();
        const graph = new GraphEditor(
            new TComponentState({ ...defaultGraphEditorState, id }),
        );
        graph.adoptHost(legacy as TextFileModel);
        return graph;
    }

    // EPIC-028 / US-565 — Draw migrated to native v4 module. Construct
    // DrawEditor over the legacy TextFileModel host. The initial parseContent()
    // call kicks off inside adoptHost (mirrors today's DrawViewModel.onInit →
    // parseContent behavior).
    if (isTextFile && targetEditorId === "draw-view") {
        const id = legacy.state.get().id || crypto.randomUUID();
        const draw = new DrawEditor(
            new TComponentState({ ...defaultDrawEditorState, id }),
        );
        draw.adoptHost(legacy as TextFileModel);
        return draw;
    }

    // EPIC-028 / US-555 — Link migrated to native v4 module. Construct
    // LinkEditor over the legacy TextFileModel host. The initial loadData()
    // call kicks off inline (mirrors today's LinkViewModel.onInit → loadData
    // behavior). First sidebar-owning v4 editor: registers
    // `link-category` / `link-tags` / `link-hostnames` panel ids via LK6 once
    // the page's NavPanel opens.
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

    // EPIC-028 / US-556 — Todo migrated to native v4 module. Construct
    // TodoEditor over the legacy TextFileModel host. The initial loadData()
    // call kicks off inline (mirrors today's TodoViewModel.onInit → loadData
    // behavior). Non-sidebar-owning Tier-5 editor — no panel registration.
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

    // EPIC-028 / US-563 — Rest Client migrated to native v4 module. Construct
    // RestClientEditor over the legacy TextFileModel host. The initial
    // loadData() call kicks off inline (mirrors today's
    // RestClientViewModel.onInit → loadData behavior). The async
    // restoreResponseCache() fires-and-forgets inside adoptHost (RC18) so the
    // response cache restores for both descriptor-replay (restore()) AND
    // legacy-host adoption (this branch). Non-sidebar-owning Tier-5 editor —
    // no panel registration here.
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

    // EPIC-028 / US-557 — Notebook migrated to native v4 module. Construct
    // NotebookEditor over the legacy TextFileModel host. The initial loadData()
    // call kicks off inline (mirrors today's NotebookViewModel.onInit →
    // loadData behavior). Non-sidebar-owning Tier-5 editor — no panel
    // registration here. Inner per-note dispatch (NoteItemEditModel +
    // acquireViewModel) stays on the legacy content-view path per US-557
    // outer-only scope (NB-IMPL1); inner migration moves to US-579.
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

    return new LegacyEditorAdapter(legacy, targetEditorId);
}

/** Module-private alias preserved for the existing call sites below. */
const wrap = wrapLegacyForPage;

/**
 * PagesLifecycleModel — Page creation, opening, closing, and navigation.
 *
 * EPIC-028 / US-548: every legacy editor is wrapped in `LegacyEditorAdapter`
 * before being attached to the v4 PageModel. The legacy factories
 * (`newTextFileModel`, `newEditorModelFromState`, etc.) survive — wrapping
 * happens at the boundary just before `addPage` / `setMainEditor`.
 */
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

    // ── Editor factory helpers (legacy — produce LegacyEditorModel) ────

    private newEditorModel = async (filePath?: string): Promise<LegacyEditorModel> => {
        const editorDef = editorRegistry.resolve(filePath);
        if (editorDef) {
            const module = await editorDef.loadModule();
            return module.newEditorModel(filePath);
        }
        const def = editorRegistry.getById("monaco");
        if (!def) throw new Error("Monaco editor not registered");
        const module = await def.loadModule();
        return module.newEditorModel(filePath);
    };

    /** Legacy page type migration: maps old renamed page types to current names. */
    private static PAGE_TYPE_MIGRATIONS: Record<string, EditorType> = {
        mcpBrowserPage: "mcpInspectorPage",
    };

    newEditorModelFromState = async (
        state: Partial<IEditorState>,
    ): Promise<LegacyEditorModel> => {
        if (state.type && PagesLifecycleModel.PAGE_TYPE_MIGRATIONS[state.type]) {
            state = { ...state, type: PagesLifecycleModel.PAGE_TYPE_MIGRATIONS[state.type] };
        }
        if (state.type === "fileExplorer") {
            // EPIC-028 / US-567 — Explorer migrated to v4-native EditorModel.
            // Construction sites are `PagesPersistenceModel.restorePage`,
            // `restoreSidebarLegacy`, `PagesLifecycleModel.addEmptyPageWithNavPanel`,
            // and `PageModel.toggleNavigator`. This legacy factory branch must
            // never be hit post-migration.
            throw new Error(
                "newEditorModelFromState: Explorer migrated to v4-native (US-567). "
                + "Construct via `new ExplorerEditor(state)` directly.",
            );
        }
        const editors = editorRegistry.getAll();
        const editorDef = editors.find((e) => e.editorType === state.type);
        if (editorDef) {
            const module = await editorDef.loadModule();
            return module.newEditorModelFromState(state);
        }
        const def = editorRegistry.getById("monaco");
        if (!def) throw new Error("Monaco editor not registered");
        const module = await def.loadModule();
        return module.newEditorModelFromState(state);
    };

    // ── Core page operations ─────────────────────────────────────────

    createEditorFromFile = async (
        filePath: string,
        pipe?: IContentPipe,
        target?: string,
        title?: string,
    ): Promise<LegacyEditorModel> => {
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

    private newEditorModelByTarget = async (
        filePath: string,
        target: string,
    ): Promise<LegacyEditorModel> => {
        const editorDef = editorRegistry.getById(target as EditorView);
        if (editorDef) {
            const module = await editorDef.loadModule();
            return module.newEditorModel(filePath);
        }
        return this.newEditorModel(filePath);
    };

    /**
     * Add an editor (already wrapped in v4 adapter) to the page collection.
     *
     * @param editor — the v4 EditorModel to add (null for empty pages with sidebar only)
     * @param existingPage — optional pre-created PageModel
     */
    addPage = (
        editor: V4EditorModel | null,
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
        // EPIC-028 / US-567 / EX10 — inline Explorer construction; replaces
        // the deleted `PageModel.createExplorer` helper. Order matters:
        // `page.attach()` BEFORE `explorer.restore()` so the slice subscription
        // is wired before `restore()` mutates `secondaryEditor`.
        const state = new TComponentState({
            ...getDefaultExplorerEditorState(),
            rootPath: folderPath,
        });
        const explorer = new ExplorerEditor(state);
        page.attach(explorer);
        await explorer.restore();
        page.ensurePageNavigatorModel();
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
        if (editorDef?.category === "standalone") {
            throw new Error(
                `Cannot create '${editor}' with addEditorPage() — it is a standalone editor that requires a specialized model. Use the dedicated method instead (e.g., showBrowserPage(), showAboutPage(), openFile()).`,
            );
        }
        const editorModel = newTextFileModel("");
        editorModel.state.update((s) => {
            s.title = title;
            s.language = language;
            s.editor = editorRegistry.validateForLanguage(editor, language);
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

        await editorRegistry.loadViewModelFactory(def.editor as EditorView);
        const editorModel = newTextFileModel("");
        editorModel.state.update((s) => {
            s.id = id;
            s.title = def.title;
            s.language = def.language;
            s.editor = editorRegistry.validateForLanguage(
                def.editor as EditorView,
                def.language,
            );
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
            s.editor = editorRegistry.validateForLanguage("link-view", "json");
        });
        editorModel.restore();
        editorModel.changeContent(content);

        const page = new PageModel();
        const adapter = wrap(editorModel);
        // EPIC-028 / US-555: `secondaryEditor` now lives on the v4 editor's
        // own state (not the host). Set it on the wrapped v4 LinkEditor so
        // the page-level visibility criterion keeps it in `editors[]`.
        adapter.secondaryEditor = ["link-category"];
        page.addSecondaryEditor(adapter);
        page.ensurePageNavigatorModel();
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

        const editorDef = editorRegistry.getById("archive-view");
        if (!editorDef) throw new Error("archive-view editor not registered");
        const module = await editorDef.loadModule();
        const legacy = await module.newEditorModel(filePath);

        const page = new PageModel();
        const adapter = wrap(legacy);
        // EPIC-028 / US-570 / AR-IMPL7 — `attach` calls the v4 ArchiveEditor's
        // `setPage`, which publishes `secondaryEditor = ["archive-tree"]`; the
        // trailing `version++` in `attach` forces the navigator render. The
        // former manual panel-publish line (legacy compat-shim trigger) is no
        // longer needed.
        page.attach(adapter);
        page.setMainEditorId(adapter.id);
        page.ensurePageNavigatorModel();

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
        let legacy: LegacyEditorModel;
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

        // EPIC-028 / US-551 — auto-select preview editor BEFORE wrap so the
        // wrap helper picks the right v4 editor class. Previously this ran
        // after setMainEditor, which locked Monaco-defaulted files (e.g., .md)
        // into MonacoEditor before the previewEditor mutation could take effect.
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
                    s.editor = previewEditor;
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
            this.addPage(page.mainEditorV4, page);
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

        // EPIC-028 / US-558 — v4 native Browser construction. `browserModule`
        // provides `createEditor()` returning a v4 EditorModel; pass directly
        // to `addPage` without LegacyEditorAdapter wrapping.
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
        const mcpModule = await import(
            "../../editors/mcp-inspector/McpInspectorView"
        );
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
        const storybookModule = await import("../../editors/storybook/StorybookEditorView");
        const model = await storybookModule.default.newEmptyEditorModel("storybookPage");
        if (model) {
            const page = new PageModel(storybookModule.STORYBOOK_PAGE_ID);
            this.addPage(wrap(model), page);
        }
    };

    showVideoPlayerPage = async (): Promise<void> => {
        // EPIC-028 / US-571 — Video migrated to native v4 module. Import path
        // resolves to `editors/video/index.tsx`. `videoModule.default` is the
        // preserved legacy `videoEditorModule` (constructs v4 VideoEditor cast
        // as legacy). `wrap(model)` early-returns the v4 instance (US-568
        // PD-IMPL16).
        const videoModule = await import("../../editors/video");
        const model = await videoModule.default.newEmptyEditorModel("videoPage");
        if (model) {
            this.addPage(wrap(model));
        }
    };

    openImageInNewTab = async (imageUrl: string): Promise<void> => {
        // EPIC-028 / US-569 — Image migrated to native v4 module. Import
        // path resolves to `editors/image/index.tsx` (post-migration; the
        // legacy file `ImageViewer.tsx` was renamed to `ImageView.tsx`
        // and is no longer imported directly). `imgModule.default` is
        // the preserved legacy `imageEditorModule` (constructs v4
        // ImageEditor cast as legacy). `imgModule.ImageEditorModel` is
        // the v4 ImageEditor class re-exported under the compatibility
        // alias for the `instanceof` check below. `wrap(imgModel)`
        // early-returns the v4 instance (US-568 PD-IMPL16) — no adapter
        // wrap.
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
            const editor = page.mainEditorV4;
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
            // EPIC-028 / US-558 — Browser is a v4 native editor; access directly
            // via mainEditorV4 (no LegacyEditorAdapter unwrap).
            const editor = page.mainEditorV4;
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
