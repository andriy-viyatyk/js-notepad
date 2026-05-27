import { EditorModel } from "../../editors/base";
import { isTextFileModel } from "../../editors/text/TextEditorModel";
import { pagesModel } from "../../api/pages";
import { app } from "../../api/app";
import { EditorView } from "../../../shared/types";
import type { EditorModel as V4EditorModel } from "../../editors/base/v4/EditorModel";
import { deriveEditorId } from "../../editors/base/v4/LegacyEditorAdapter";
import { editorRegistry as v4EditorRegistry } from "../../editors/base/v4/editorRegistry";
import { MonacoEditor } from "../../editors/monaco/MonacoEditor";
import { GridEditor } from "../../editors/grid/GridEditor";
import type { NotebookViewModel } from "../../editors/notebook/NotebookViewModel";
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

/**
 * Safe wrapper around EditorModel for script access.
 * Implements the IPage interface from api/types/page.d.ts.
 *
 * - Exposes only script-safe properties and methods
 * - Shares a releaseList for auto-releasing ViewModels on script completion
 *
 * EPIC-028 / US-550 strangler-period notes:
 * - `page.type` retired (SF5).
 * - `set editor(v)` routes through `page.switchMainEditor(v).catch(ui.notify)` per SF4;
 *   PageModel handles the LegacyEditorAdapter case internally.
 * - `asX(force?: boolean)` (SF1): when `force = true`, the facade consults the
 *   page's compatible-editors list (same source as the UI switch widget) and
 *   switches the page if compatible. Without `force`, throws when the page
 *   isn't already the target editor.
 * - `asBrowser` / `asMcpInspector` gates use `editorId === "..."` (Q7);
 *   switches to `instanceof` during US-558.
 * - `acquireViewModel*` remains in use for the 11 ViewModel-backed facades;
 *   full retirement (SF2) happens per-editor in Phase C migrations.
 *
 * `this.model` is the unwrapped legacy editor (what `PagesModel.findPage(...).mainEditor`
 * returns). v4-only fields (`editorId`, `contentHost`, `findCompatibleEditors`) are
 * read through `this.v4` which resolves the adapter via the owning page.
 */
export class PageWrapper {
    constructor(
        private readonly model: EditorModel,
        private readonly releaseList: Array<() => void>,
        private readonly outputFlags?: ScriptOutputFlags,
    ) {}

    /**
     * Resolve the v4 surface (LegacyEditorAdapter or future v4-native editor)
     * for the page that owns `this.model`. Returns null when the page can't
     * be resolved (detached editor); callers fall back to legacy state reads.
     */
    private get v4(): V4EditorModel | null {
        const pageId = this.model.page?.id;
        if (!pageId) return null;
        return pagesModel.findPage(pageId)?.mainEditorV4 ?? null;
    }

    private currentEditorId(): string {
        return this.v4?.editorId ?? deriveEditorId(this.model.state.get());
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
        // internally handles the LegacyEditorAdapter case (legacy `model.changeEditor(view)`
        // path on the wrapped TextFileModel). Once per-editor migrations land, the catch
        // surfaces real `switchFrom` rejections.
        page.switchMainEditor(value).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            app.ui?.notify?.(message, "error");
        });
    }

    get data(): Record<string, any> {
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
        // EPIC-028 / US-551 — Monaco is v4-native. After ensureEditor, the
        // page's mainEditorV4 IS a MonacoEditor; the facade wraps it directly
        // and routes view-context queries through its ComponentQueue.
        const v4 = this.v4;
        if (!(v4 instanceof MonacoEditor)) {
            throw new Error("asText(): page is not a MonacoEditor after switch");
        }
        return new TextEditorFacade(v4);
    }

    async asGrid(force = false): Promise<GridEditorFacade> {
        const targetId = this.resolveGridEditorId();
        await this.ensureEditor(targetId, "Grid", "asGrid", force);
        // EPIC-028 / US-552 — Grid is v4-native. After ensureEditor, the
        // page's mainEditorV4 IS a GridEditor; the facade wraps it directly.
        // No acquireViewModel round-trip.
        const v4 = this.v4;
        if (!(v4 instanceof GridEditor)) {
            throw new Error("asGrid(): page is not a GridEditor after switch");
        }
        return new GridEditorFacade(v4);
    }

    private resolveGridEditorId(): EditorView {
        const id = this.currentEditorId();
        if (id === "grid-json" || id === "grid-csv" || id === "grid-jsonl") {
            return id as EditorView;
        }
        const language = this.v4?.contentHost?.state.get().language
            ?? (this.model.state.get() as { language?: string }).language;
        if (language === "json") return "grid-json";
        if (language === "csv") return "grid-csv";
        if (language === "jsonl") return "grid-jsonl";
        throw new Error("asGrid(): content is not JSON, CSV, or JSONL");
    }

    async asNotebook(force = false): Promise<NotebookEditorFacade> {
        await this.ensureEditor("notebook-view", "Notebook", "asNotebook", force);
        const model = this.model;
        if (!isTextFileModel(model)) {
            throw new Error("asNotebook(): page lost its text host during switch");
        }
        const vm = await model.acquireViewModel("notebook-view") as NotebookViewModel;
        this.releaseList.push(() => model.releaseViewModel("notebook-view"));
        return new NotebookEditorFacade(vm);
    }

    async asTodo(force = false): Promise<TodoEditorFacade> {
        await this.ensureEditor("todo-view", "Todo", "asTodo", force);
        // EPIC-028 / US-556 — Todo is v4-native. After ensureEditor, the
        // page's mainEditorV4 IS a TodoEditor; the facade wraps it directly.
        // No acquireViewModel round-trip.
        const v4 = this.v4;
        if (!(v4 instanceof TodoEditor)) {
            throw new Error("asTodo(): page is not a TodoEditor after switch");
        }
        return new TodoEditorFacade(v4);
    }

    async asLink(force = false): Promise<LinkEditorFacade> {
        await this.ensureEditor("link-view", "Link", "asLink", force);
        // EPIC-028 / US-555 — Link is v4-native. After ensureEditor, the
        // page's mainEditorV4 IS a LinkEditor; the facade wraps it directly.
        // No acquireViewModel round-trip.
        const v4 = this.v4;
        if (!(v4 instanceof LinkEditor)) {
            throw new Error("asLink(): page is not a LinkEditor after switch");
        }
        return new LinkEditorFacade(v4);
    }

    async asMarkdown(force = false): Promise<MarkdownEditorFacade> {
        await this.ensureEditor("md-view", "Markdown", "asMarkdown", force);
        // EPIC-028 / US-554 — Markdown is v4-native. After ensureEditor, the
        // page's mainEditorV4 IS a MarkdownEditor; the facade wraps it directly.
        // No acquireViewModel round-trip.
        const v4 = this.v4;
        if (!(v4 instanceof MarkdownEditor)) {
            throw new Error("asMarkdown(): page is not a MarkdownEditor after switch");
        }
        return new MarkdownEditorFacade(v4);
    }

    async asSvg(force = false): Promise<SvgEditorFacade> {
        await this.ensureEditor("svg-view", "SVG", "asSvg", force);
        // EPIC-028 / US-560 — Svg is v4-native. After ensureEditor, the
        // page's mainEditorV4 IS a SvgEditor; the facade wraps it directly.
        // No acquireViewModel round-trip.
        const v4 = this.v4;
        if (!(v4 instanceof SvgEditor)) {
            throw new Error("asSvg(): page is not a SvgEditor after switch");
        }
        return new SvgEditorFacade(v4);
    }

    async asHtml(force = false): Promise<HtmlEditorFacade> {
        await this.ensureEditor("html-view", "HTML", "asHtml", force);
        // EPIC-028 / US-561 — Html is v4-native. After ensureEditor, the
        // page's mainEditorV4 IS an HtmlEditor; the facade wraps it directly.
        // No acquireViewModel round-trip.
        const v4 = this.v4;
        if (!(v4 instanceof HtmlEditor)) {
            throw new Error("asHtml(): page is not an HtmlEditor after switch");
        }
        return new HtmlEditorFacade(v4);
    }

    async asMermaid(force = false): Promise<MermaidEditorFacade> {
        await this.ensureEditor("mermaid-view", "Mermaid", "asMermaid", force);
        // EPIC-028 / US-562 — Mermaid is v4-native. After ensureEditor, the
        // page's mainEditorV4 IS a MermaidEditor; the facade wraps it directly.
        // No acquireViewModel round-trip.
        const v4 = this.v4;
        if (!(v4 instanceof MermaidEditor)) {
            throw new Error("asMermaid(): page is not a MermaidEditor after switch");
        }
        return new MermaidEditorFacade(v4);
    }

    async asGraph(force = false): Promise<GraphEditorFacade> {
        await this.ensureEditor("graph-view", "Graph", "asGraph", force);
        // EPIC-028 / US-564 — Graph is v4-native. After ensureEditor, the
        // page's mainEditorV4 IS a GraphEditor; the facade wraps it directly.
        // No acquireViewModel round-trip.
        const v4 = this.v4;
        if (!(v4 instanceof GraphEditor)) {
            throw new Error("asGraph(): page is not a GraphEditor after switch");
        }
        return new GraphEditorFacade(v4);
    }

    async asDraw(force = false): Promise<DrawEditorFacade> {
        await this.ensureEditor("draw-view", "Draw", "asDraw", force);
        // EPIC-028 / US-565 — Draw is v4-native. After ensureEditor, the
        // page's mainEditorV4 IS a DrawEditor; the facade wraps it directly.
        // No acquireViewModel round-trip.
        const v4 = this.v4;
        if (!(v4 instanceof DrawEditor)) {
            throw new Error("asDraw(): page is not a DrawEditor after switch");
        }
        return new DrawEditorFacade(v4);
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

    /**
     * SF1 — If the page is already at `targetId`, return. If not and `force` is true,
     * check compatibility against the same source as the UI switch widget
     * (`findCompatibleEditors()` per US-549's switch widget) and switch the page.
     * Throws on incompatible or detached page.
     */
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

    /**
     * Same source as the UI switch widget (US-549 `<SwitchWidget>`): the v4
     * adapter's `findCompatibleEditors()`. Falls back to a direct legacy registry
     * query if the v4 surface isn't available (detached editor edge case).
     */
    private compatibleEditorIds(): string[] {
        const v4 = this.v4;
        if (v4) return v4.findCompatibleEditors();
        const s = this.model.state.get() as { language?: string; filePath?: string };
        return v4EditorRegistry.getSwitchOptions(s.language ?? "", s.filePath).options;
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
        model: EditorModel,
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
