import { EditorOrHost } from "../../editors/base";
import { isTextFileModel } from "../../editors/text/TextEditorModel";
import { pagesModel } from "../../api/pages";
import { app } from "../../api/app";
import { EditorView } from "../../../shared/types";
import type { EditorModel } from "../../editors/base/EditorModel";
import { editorRegistry } from "../../editors/base/editorRegistry";
import { MonacoEditor } from "../../editors/monaco/MonacoEditor";
import { GridEditor } from "../../editors/grid/GridEditor";
import { NotebookEditor } from "../../editors/notebook";
import { TodoEditor } from "../../editors/todo";
import { LinkEditor } from "../../editors/link-editor";
import { MarkdownEditor } from "../../editors/markdown";
import { SvgEditor } from "../../editors/svg";
import { HtmlEditor } from "../../editors/html";
import { MermaidEditor } from "../../editors/mermaid";
import { GraphEditor } from "../../editors/graph";
import { DrawEditor } from "../../editors/draw";
import type { BrowserEditorModel } from "../../editors/browser/BrowserEditorModel";
import type { McpInspectorEditorModel } from "../../editors/mcp-inspector/McpInspectorEditorModel";
import { TextEditorFacade } from "./TextEditorFacade";
import { GridEditorFacade } from "./GridEditorFacade";
import { NotebookEditorFacade } from "./NotebookEditorFacade";
import { TodoEditorFacade } from "./TodoEditorFacade";
import { LinkEditorFacade } from "./LinkEditorFacade";
import { MarkdownEditorFacade } from "./MarkdownEditorFacade";
import { SvgEditorFacade } from "./SvgEditorFacade";
import { HtmlEditorFacade } from "./HtmlEditorFacade";
import { MermaidEditorFacade } from "./MermaidEditorFacade";
import { GraphEditorFacade } from "./GraphEditorFacade";
import { DrawEditorFacade } from "./DrawEditorFacade";
import { BrowserEditorFacade } from "./BrowserEditorFacade";
import { McpInspectorFacade } from "./McpInspectorFacade";
import type { ScriptOutputFlags } from "../ScriptContext";

export class PageWrapper {
    constructor(
        private readonly model: EditorOrHost,
        private readonly releaseList: Array<() => void>,
        private readonly outputFlags?: ScriptOutputFlags,
    ) {}

    /** Resolve the main editor instance for the page that owns `this.model`.
     *  Returns null when the page can't be resolved (detached editor). */
    private get mainEditor(): EditorModel | null {
        const pageId = this.model.page?.id;
        if (!pageId) return null;
        return pagesModel.findPage(pageId)?.mainEditorInstance ?? null;
    }

    private currentEditorId(): string {
        return (
            this.mainEditor?.editorId
            ?? (this.model.state.get() as { editor?: string }).editor
            ?? "monaco"
        );
    }

    // ── IPageInfo readonly properties ─────────────────────────────────

    get id() {
        return this.model.page?.id ?? this.model.id;
    }

    get title() {
        return this.model.title;
    }

    get modified() {
        return this.model.modified;
    }

    get pinned() {
        return this.model.page?.pinned ?? false;
    }

    get filePath() {
        return this.model.filePath;
    }

    // ── IPage read/write properties ───────────────────────────────────

    get content(): string {
        if (isTextFileModel(this.model)) {
            return this.model.state.get().content;
        }
        return "";
    }

    set content(value: string) {
        if (isTextFileModel(this.model)) {
            this.model.changeContent(value);
        }
    }

    get language(): string {
        return this.model.state.get().language ?? "";
    }

    set language(value: string) {
        if (!this.model.noLanguage) {
            this.model.changeLanguage(value);
        }
    }

    get editor(): EditorView {
        return (this.currentEditorId() as EditorView) ?? "monaco";
    }

    set editor(value: EditorView) {
        const page = this.model.page;
        if (!page) return;
        // SF4: fire-and-forget switch with `.catch(ui.notify)`. PageModel.switchMainEditor
                // path on the wrapped TextFileModel). Once per-editor migrations land, the catch
        // surfaces real `switchFrom` rejections.
        page.switchMainEditor(value).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            app.ui?.notify?.(message, "error");
        });
    }

    get data(): Record<string, unknown> {
        return this.model.scriptData;
    }

    get grouped(): PageWrapper {
        const pageId = this.model.page?.id ?? this.model.id;
        const groupedPage = pagesModel.getGroupedPage(pageId);
        const editor = groupedPage?.mainEditor
            ?? pagesModel.requireGroupedText(pageId);
        return new GroupedPageWrapper(editor, this.releaseList, this.outputFlags);
    }

    // ── Editor facades ────────────────────────────────────────────────

    async asText(force = false): Promise<TextEditorFacade> {
        await this.ensureEditor("monaco", "Monaco", "asText", force);
        const editor = this.mainEditor;
        if (!(editor instanceof MonacoEditor)) {
            throw new Error("asText(): page is not a MonacoEditor after switch");
        }
        return new TextEditorFacade(editor);
    }

    async asGrid(force = false): Promise<GridEditorFacade> {
        const targetId = this.resolveGridEditorId();
        await this.ensureEditor(targetId, "Grid", "asGrid", force);
        const editor = this.mainEditor;
        if (!(editor instanceof GridEditor)) {
            throw new Error("asGrid(): page is not a GridEditor after switch");
        }
        return new GridEditorFacade(editor);
    }

    private resolveGridEditorId(): EditorView {
        const id = this.currentEditorId();
        if (id === "grid-json" || id === "grid-csv" || id === "grid-jsonl") {
            return id as EditorView;
        }
        const language = this.mainEditor?.contentHost?.state.get().language
            ?? (this.model.state.get() as { language?: string }).language;
        if (language === "json") return "grid-json";
        if (language === "csv") return "grid-csv";
        if (language === "jsonl") return "grid-jsonl";
        throw new Error("asGrid(): content is not JSON, CSV, or JSONL");
    }

    async asNotebook(force = false): Promise<NotebookEditorFacade> {
        await this.ensureEditor("notebook-view", "Notebook", "asNotebook", force);
        const editor = this.mainEditor;
        if (!(editor instanceof NotebookEditor)) {
            throw new Error("asNotebook(): page is not a NotebookEditor after switch");
        }
        return new NotebookEditorFacade(editor);
    }

    async asTodo(force = false): Promise<TodoEditorFacade> {
        await this.ensureEditor("todo-view", "Todo", "asTodo", force);
        const editor = this.mainEditor;
        if (!(editor instanceof TodoEditor)) {
            throw new Error("asTodo(): page is not a TodoEditor after switch");
        }
        return new TodoEditorFacade(editor);
    }

    async asLink(force = false): Promise<LinkEditorFacade> {
        await this.ensureEditor("link-view", "Link", "asLink", force);
        const editor = this.mainEditor;
        if (!(editor instanceof LinkEditor)) {
            throw new Error("asLink(): page is not a LinkEditor after switch");
        }
        return new LinkEditorFacade(editor);
    }

    async asMarkdown(force = false): Promise<MarkdownEditorFacade> {
        await this.ensureEditor("md-view", "Markdown", "asMarkdown", force);
        const editor = this.mainEditor;
        if (!(editor instanceof MarkdownEditor)) {
            throw new Error("asMarkdown(): page is not a MarkdownEditor after switch");
        }
        return new MarkdownEditorFacade(editor);
    }

    async asSvg(force = false): Promise<SvgEditorFacade> {
        await this.ensureEditor("svg-view", "SVG", "asSvg", force);
        const editor = this.mainEditor;
        if (!(editor instanceof SvgEditor)) {
            throw new Error("asSvg(): page is not a SvgEditor after switch");
        }
        return new SvgEditorFacade(editor);
    }

    async asHtml(force = false): Promise<HtmlEditorFacade> {
        await this.ensureEditor("html-view", "HTML", "asHtml", force);
        const editor = this.mainEditor;
        if (!(editor instanceof HtmlEditor)) {
            throw new Error("asHtml(): page is not an HtmlEditor after switch");
        }
        return new HtmlEditorFacade(editor);
    }

    async asMermaid(force = false): Promise<MermaidEditorFacade> {
        await this.ensureEditor("mermaid-view", "Mermaid", "asMermaid", force);
        const editor = this.mainEditor;
        if (!(editor instanceof MermaidEditor)) {
            throw new Error("asMermaid(): page is not a MermaidEditor after switch");
        }
        return new MermaidEditorFacade(editor);
    }

    async asGraph(force = false): Promise<GraphEditorFacade> {
        await this.ensureEditor("graph-view", "Graph", "asGraph", force);
        const editor = this.mainEditor;
        if (!(editor instanceof GraphEditor)) {
            throw new Error("asGraph(): page is not a GraphEditor after switch");
        }
        return new GraphEditorFacade(editor);
    }

    async asDraw(force = false): Promise<DrawEditorFacade> {
        await this.ensureEditor("draw-view", "Draw", "asDraw", force);
        const editor = this.mainEditor;
        if (!(editor instanceof DrawEditor)) {
            throw new Error("asDraw(): page is not a DrawEditor after switch");
        }
        return new DrawEditorFacade(editor);
    }

    async asBrowser(): Promise<BrowserEditorFacade> {
        if (this.currentEditorId() !== "browser-view") {
            throw new Error("asBrowser() is only available for browser pages");
        }
        return new BrowserEditorFacade(this.model as unknown as BrowserEditorModel);
    }

    async asMcpInspector(): Promise<McpInspectorFacade> {
        if (this.currentEditorId() !== "mcp-view") {
            throw new Error("asMcpInspector() is only available for MCP Inspector pages");
        }
        return new McpInspectorFacade(this.model as unknown as McpInspectorEditorModel);
    }

    private async ensureEditor(
        targetId: string,
        expectedClassName: string,
        methodName: string,
        force: boolean,
    ): Promise<void> {
        if (this.currentEditorId() === targetId) return;
        if (!force) {
            throw new Error(
                `${methodName}() requires the page to already be a ${expectedClassName} editor. `
                + `Pass true to attempt a switch.`,
            );
        }
        const page = this.model.page;
        if (!page) {
            throw new Error(`${methodName}(true): editor is not attached to a page`);
        }
        const compatible = this.compatibleEditorIds();
        if (!compatible.includes(targetId)) {
            throw new Error(
                `${methodName}(true): cannot switch to '${targetId}' — `
                + `not in the page's compatible editors list`,
            );
        }
        await page.switchMainEditor(targetId);
    }

    private compatibleEditorIds(): string[] {
        const editor = this.mainEditor;
        if (editor) return editor.findCompatibleEditors();
        const s = this.model.state.get() as { language?: string; filePath?: string };
        return editorRegistry.getSwitchOptions(s.language ?? "", s.filePath).options;
    }

    async runScript(): Promise<string> {
        const language = this.model.state.get().language ?? "";
        const { isScriptLanguage } = await import("../transpile");
        if (!isScriptLanguage(language)) {
            throw new Error("runScript() is only available for javascript/typescript pages");
        }
        const { scriptRunner } = await import("../ScriptRunner");
        return scriptRunner.runWithResult(this.model.id, this.content, this.model, language);
    }
}

class GroupedPageWrapper extends PageWrapper {
    constructor(
        model: EditorOrHost,
        releaseList: Array<() => void>,
        private readonly flags?: ScriptOutputFlags,
    ) {
        super(model, releaseList);
    }

    set content(value: string) {
        super.content = value;
        if (this.flags) {
            this.flags.groupedContentWritten = true;
        }
    }

    get content(): string {
        return super.content;
    }
}
