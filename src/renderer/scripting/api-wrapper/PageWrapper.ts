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
import { LinkEditor } from "../../editors/link-editor";
import { MarkdownEditor } from "../../editors/markdown";
import { SvgEditor } from "../../editors/svg";
import { HtmlEditor } from "../../editors/html";
import { MermaidEditor } from "../../editors/mermaid";
import { GraphEditor } from "../../editors/graph";
import { DrawEditor } from "../../editors/draw";
import type { ImageEditor } from "../../editors/image/ImageEditor";
import type { BrowserEditorModel } from "../../editors/browser/BrowserEditorModel";
import type { McpInspectorEditorModel } from "../../editors/mcp-inspector/McpInspectorEditorModel";
import { TextEditorFacade } from "./TextEditorFacade";
import { GridEditorFacade } from "./GridEditorFacade";
import { NotebookEditorFacade } from "./NotebookEditorFacade";
import { LinkEditorFacade } from "./LinkEditorFacade";
import { MarkdownEditorFacade } from "./MarkdownEditorFacade";
import { SvgEditorFacade } from "./SvgEditorFacade";
import { HtmlEditorFacade } from "./HtmlEditorFacade";
import { MermaidEditorFacade } from "./MermaidEditorFacade";
import { GraphEditorFacade } from "./GraphEditorFacade";
import { DrawEditorFacade } from "./DrawEditorFacade";
import { ImageEditorFacade } from "./ImageEditorFacade";
import { BrowserEditorFacade } from "./BrowserEditorFacade";
import { McpInspectorFacade } from "./McpInspectorFacade";
import type { ScriptOutputFlags } from "../ScriptContext";
import { errMessage } from "../../../shared/utils";
import type { IAiChild, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { agentMayAccessBrowserPage, privateBrowserRefusal } from "../../editors/browser/agent-access";

// AiVision (EPIC-083): kind-level description of a page. `grouped` carries a caution because reading
// it creates the grouped page; children() lists it only when it already exists.
const PAGE_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "Stable page id (use in pages[\"<id>\"])." },
    { name: "title", kind: "property", summary: "Tab title." },
    { name: "filePath", kind: "property", summary: "Backing file path, or nothing for an unsaved page." },
    { name: "modified", kind: "property", summary: "Whether there are unsaved changes." },
    { name: "pinned", kind: "property", summary: "Whether the tab is pinned." },
    { name: "content", kind: "property", writable: true, summary: "The page's text (text-based editors only; empty for browser/image pages). Assign with \"value\"." },
    { name: "language", kind: "property", writable: true, summary: "Language id (json, markdown, typescript, …)." },
    { name: "editor", kind: "property", writable: true, summary: "Current editor id (monaco, grid-json, md-view, …). Assign to switch editors." },
    { name: "data", kind: "property", summary: "Free-form per-page data bag shared between scripts." },
    { name: "grouped", kind: "property", summary: "The page shown beside this one.", caution: "reading it CREATES a grouped page if none exists" },
    { name: "asText", kind: "method", signature: "asText(force = false)", summary: "Text (Monaco) facade: selection, cursor, insert, reveal line." },
    { name: "asGrid", kind: "method", signature: "asGrid(force = false)", summary: "Grid facade for JSON/CSV/JSONL pages: rows, columns, edit cells, add/delete rows." },
    { name: "asNotebook", kind: "method", signature: "asNotebook(force = false)", summary: "Notebook facade: notes, categories." },
    { name: "asLink", kind: "method", signature: "asLink(force = false)", summary: "Links-page facade: items, categories, tags." },
    { name: "asMarkdown", kind: "method", signature: "asMarkdown(force = false)", summary: "Markdown preview facade." },
    { name: "asSvg", kind: "method", signature: "asSvg(force = false)", summary: "SVG preview facade." },
    { name: "asHtml", kind: "method", signature: "asHtml(force = false)", summary: "HTML preview facade." },
    { name: "asMermaid", kind: "method", signature: "asMermaid(force = false)", summary: "Mermaid diagram facade." },
    { name: "asGraph", kind: "method", signature: "asGraph(force = false)", summary: "Force-graph facade: nodes, links, groups." },
    { name: "asDraw", kind: "method", signature: "asDraw(force = false)", summary: "Drawing (Excalidraw) facade." },
    { name: "asBrowser", kind: "method", signature: "asBrowser()", summary: "Browser page facade: tabs, navigation, evaluate." },
    { name: "asImage", kind: "method", signature: "asImage()", summary: "Image page facade: export PNG." },
    { name: "asMcpInspector", kind: "method", signature: "asMcpInspector()", summary: "MCP inspector page facade." },
    { name: "runScript", kind: "method", signature: "runScript()", summary: "Run this page's JavaScript/TypeScript content as a script; returns the output text." },
];

const PAGE_HELP = `
One open page (tab). Plain properties describe it; "content" holds the text for text-based editors
and can be assigned (pass "value"). The as*() methods return an editor facade with editor-specific
operations — pass true to switch the page to that editor first. Only the facade matching the current
editor is listed under children; the others need the switch.
`;

/** Editor id → the facade segment and kind an agent should use on a page showing that editor. */
const FACADE_FOR_EDITOR: Record<string, { segment: string; kind: string }> = {
    "monaco": { segment: ".asText()", kind: "TextEditor" },
    "grid-json": { segment: ".asGrid()", kind: "GridEditor" },
    "grid-csv": { segment: ".asGrid()", kind: "GridEditor" },
    "grid-jsonl": { segment: ".asGrid()", kind: "GridEditor" },
    "notebook-view": { segment: ".asNotebook()", kind: "NotebookEditor" },
    "link-view": { segment: ".asLink()", kind: "LinkEditor" },
    "md-view": { segment: ".asMarkdown()", kind: "MarkdownEditor" },
    "svg-view": { segment: ".asSvg()", kind: "SvgEditor" },
    "html-view": { segment: ".asHtml()", kind: "HtmlEditor" },
    "mermaid-view": { segment: ".asMermaid()", kind: "MermaidEditor" },
    "graph-view": { segment: ".asGraph()", kind: "GraphEditor" },
    "draw-view": { segment: ".asDraw()", kind: "DrawEditor" },
    "browser-view": { segment: ".asBrowser()", kind: "BrowserEditor" },
    "mcp-view": { segment: ".asMcpInspector()", kind: "McpInspector" },
    "image-view": { segment: ".asImage()", kind: "ImageEditor" },
};

interface IBrowserPrivacyState {
    profileName?: string;
    isIncognito?: boolean;
    isTor?: boolean;
    openedByAgent?: boolean;
    url?: string;
}

export class PageWrapper implements IAiVisible {
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
            const message = errMessage(err);
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

    // ── AiVision ──────────────────────────────────────────────────────

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "Page",
            summary: "One open page (tab): its text, language, editor, and editor-specific facades.",
            members: PAGE_MEMBERS,
            help: PAGE_HELP,
            children: () => this.aiChildren(),
            restricted: () => this.aiRestricted(),
            summarize: () => this.aiSummary(),
        };
    }

    /** Browser editor state, only when this page shows a browser. */
    private browserState(): IBrowserPrivacyState | undefined {
        if (this.currentEditorId() !== "browser-view") return undefined;
        return this.model.state.get() as IBrowserPrivacyState;
    }

    /** Same rule the browser_* tools apply: the user's private pages are off limits; the agent's own are not. */
    private aiRestricted(): string | undefined {
        const state = this.browserState();
        if (!state || agentMayAccessBrowserPage(state)) return undefined;
        return privateBrowserRefusal(state, "call");
    }

    private aiChildren(): IAiChild[] {
        const children: IAiChild[] = [];
        const editorId = this.currentEditorId();
        const facade = FACADE_FOR_EDITOR[editorId];
        if (facade) {
            children.push({ segment: facade.segment, kind: facade.kind, summary: `facade for the current editor (${editorId})` });
        }
        const pageId = this.model.page?.id ?? this.model.id;
        if (pagesModel.isGrouped(pageId)) {
            const grouped = pagesModel.getGroupedPage(pageId);
            if (grouped) {
                children.push({ segment: ".grouped", kind: "Page", summary: `grouped beside this page: "${grouped.title}"` });
            }
        }
        return children;
    }

    private aiSummary(): Record<string, unknown> {
        const summary: Record<string, unknown> = {
            kind: "Page",
            id: this.id,
            title: this.title,
            editor: this.editor,
            language: this.language,
            filePath: this.filePath,
            modified: this.modified,
            pinned: this.pinned,
            active: pagesModel.activePage?.id === this.id,
        };
        const state = this.browserState();
        if (state) {
            summary.profileName = state.profileName ?? "";
            summary.isIncognito = !!state.isIncognito;
            summary.isTor = !!state.isTor;
            if (state.openedByAgent) summary.openedByAgent = true;
            if (agentMayAccessBrowserPage(state)) summary.url = state.url;
        }
        return summary;
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

    async asImage(): Promise<ImageEditorFacade> {
        if (this.currentEditorId() !== "image-view") {
            throw new Error("asImage() is only available for image pages");
        }
        return new ImageEditorFacade(this.mainEditor as unknown as ImageEditor);
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
