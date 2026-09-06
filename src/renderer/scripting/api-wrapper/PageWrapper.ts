import { pagesModel } from "../../api/pages";
import { editorRegistry } from "../../editors/base/editorRegistry";
import type { EditorModel } from "../../editors/base/EditorModel";
import { isTextFileModel, type TextFileModel } from "../../editors/text/TextEditorModel";
import { customEditorRegistry, isBoardEditorId } from "../../editors/board/custom-editor-registry";
import type { BoardEditorModel } from "../../editors/board/BoardEditorModel";
import type { BoardInfoEditorModel } from "../../editors/board-info/BoardInfoEditorModel";
import { MonacoEditor } from "../../editors/monaco/MonacoEditor";
import { GridEditor } from "../../editors/grid/GridEditor";
import { NotebookEditor } from "../../editors/notebook/NotebookEditor";
import { RestClientEditor } from "../../editors/rest-client/RestClientEditor";
import { EnvVarsEditor } from "../../editors/env-vars/EnvVarsEditor";
import { ArchiveEditor } from "../../editors/archive/ArchiveEditor";
import { LinkEditor } from "../../editors/link-editor/LinkEditor";
import { MarkdownEditor } from "../../editors/markdown/MarkdownEditor";
import { SvgEditor } from "../../editors/svg/SvgEditor";
import { HtmlEditor } from "../../editors/html/HtmlEditor";
import { MermaidEditor } from "../../editors/mermaid/MermaidEditor";
import { GraphEditor } from "../../editors/graph/GraphEditor";
import { DrawEditor } from "../../editors/draw/DrawEditor";
import type { ImageEditor } from "../../editors/image/ImageEditor";
import type { VideoEditor } from "../../editors/video/VideoEditor";
import type { FileDiffEditor } from "../../editors/file-diff/FileDiffEditor";
import type { BrowserEditorModel } from "../../editors/browser/BrowserEditorModel";
import type { McpInspectorEditorModel } from "../../editors/mcp-inspector/McpInspectorEditorModel";
import type { ScriptOutputFlags } from "../ScriptContext";
import type { IAiChild, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { agentMayAccessBrowserPage, privateBrowserRefusal } from "../../editors/browser/agent-access";
import { BrowserEditorFacade } from "./BrowserEditorFacade";
import { DrawEditorFacade } from "./DrawEditorFacade";
import { GenericEditorFacade } from "./GenericEditorFacade";
import { GraphEditorFacade } from "./GraphEditorFacade";
import { GridEditorFacade } from "./GridEditorFacade";
import { HtmlEditorFacade } from "./HtmlEditorFacade";
import { ImageEditorFacade } from "./ImageEditorFacade";
import { LinkEditorFacade } from "./LinkEditorFacade";
import { MarkdownEditorFacade } from "./MarkdownEditorFacade";
import { McpInspectorFacade } from "./McpInspectorFacade";
import { MermaidEditorFacade } from "./MermaidEditorFacade";
import { NotebookEditorFacade } from "./NotebookEditorFacade";
import { RestClientEditorFacade } from "./RestClientEditorFacade";
import { EnvVarsEditorFacade } from "./EnvVarsEditorFacade";
import { ArchiveEditorFacade } from "./ArchiveEditorFacade";
import { PageEditorSwitchesNode } from "../ai-vision/page-editor-switches";
import { PagePanelsNode } from "../ai-vision/page-panels";
import { PageTabNode } from "../ai-vision/page-tab";
import { SvgEditorFacade } from "./SvgEditorFacade";
import { TextEditorFacade } from "./TextEditorFacade";
import { VideoEditorFacade } from "./VideoEditorFacade";
import { FileDiffEditorFacade } from "./FileDiffEditorFacade";
import { LogViewEditorFacade } from "./LogViewEditorFacade";
import type { LogViewEditor } from "../../editors/log-view/LogViewEditor";
import { FolderViewEditorFacade } from "./FolderViewEditorFacade";
import { GitTreeEditorFacade } from "./GitTreeEditorFacade";
import { BoardEditorFacade } from "./BoardEditorFacade";
import { BoardInfoEditorFacade } from "./BoardInfoEditorFacade";
import { ToolsetEditorFacade } from "./ToolsetEditorFacade";
import { ToolsHubEditorFacade } from "./ToolsHubEditorFacade";
import type { CategoryEditorModel } from "../../editors/category/CategoryEditorModel";
import type { GitTreeEditorModel } from "../../editors/git-tree/GitTreeEditorModel";
import type { ToolsetEditorModel } from "../../editors/toolset/ToolsetEditorModel";
import type { ToolsHubEditor } from "../../editors/tools-hub/ToolsHubEditor";

type EditorOrHost = EditorModel | TextFileModel;
type EditorFacade =
    | TextEditorFacade | GridEditorFacade | NotebookEditorFacade | LinkEditorFacade
    | MarkdownEditorFacade | SvgEditorFacade | HtmlEditorFacade | MermaidEditorFacade
    | GraphEditorFacade | DrawEditorFacade | BrowserEditorFacade | McpInspectorFacade
    | ImageEditorFacade | VideoEditorFacade | FileDiffEditorFacade | RestClientEditorFacade
    | EnvVarsEditorFacade | ArchiveEditorFacade
    | LogViewEditorFacade | FolderViewEditorFacade | GitTreeEditorFacade | BoardEditorFacade
    | BoardInfoEditorFacade | ToolsetEditorFacade | ToolsHubEditorFacade | GenericEditorFacade;
type EditorFacadeFactory = (editor: EditorModel, id: string, name: string) => EditorFacade;

const BOARD_FACADE_FACTORY: EditorFacadeFactory = (editor, id, name) =>
    new BoardEditorFacade(editor as BoardEditorModel, id as "board-view" | `board-editor:${string}`, name);

const BOARD_INFO_FACADE_FACTORY: EditorFacadeFactory = (editor, id, name) =>
    new BoardInfoEditorFacade(editor as BoardInfoEditorModel, id as "board-info", name);

const FACADE_FOR_EDITOR: Record<string, EditorFacadeFactory> = {
    "monaco": (editor, id, name) => new TextEditorFacade(editor as MonacoEditor, id, name),
    "grid-json": (editor, id, name) => new GridEditorFacade(editor as GridEditor, id, name),
    "grid-csv": (editor, id, name) => new GridEditorFacade(editor as GridEditor, id, name),
    "grid-jsonl": (editor, id, name) => new GridEditorFacade(editor as GridEditor, id, name),
    "notebook-view": (editor, id, name) => new NotebookEditorFacade(editor as NotebookEditor, id, name),
    "rest-client": (editor, id, name) => new RestClientEditorFacade(editor as RestClientEditor, id as "rest-client", name),
    "env-vars-view": (editor, id, name) => new EnvVarsEditorFacade(editor as EnvVarsEditor, id as "env-vars-view", name),
    "archive-view": (editor, id, name) => new ArchiveEditorFacade(editor as ArchiveEditor, id as "archive-view", name),
    "link-view": (editor, id, name) => new LinkEditorFacade(editor as LinkEditor, id, name),
    "md-view": (editor, id, name) => new MarkdownEditorFacade(editor as MarkdownEditor, id, name),
    "svg-view": (editor, id, name) => new SvgEditorFacade(editor as SvgEditor, id, name),
    "html-view": (editor, id, name) => new HtmlEditorFacade(editor as HtmlEditor, id, name),
    "mermaid-view": (editor, id, name) => new MermaidEditorFacade(editor as MermaidEditor, id, name),
    "graph-view": (editor, id, name) => new GraphEditorFacade(editor as GraphEditor, id, name),
    "draw-view": (editor, id, name) => new DrawEditorFacade(editor as DrawEditor, id, name),
    "browser-view": (editor, id, name) => new BrowserEditorFacade(editor as unknown as BrowserEditorModel, id, name),
    "mcp-view": (editor, id, name) => new McpInspectorFacade(editor as unknown as McpInspectorEditorModel, id, name),
    "image-view": (editor, id, name) => new ImageEditorFacade(editor as unknown as ImageEditor, id, name),
    "video-view": (editor, id, name) => new VideoEditorFacade(editor as unknown as VideoEditor, id, name),
    "file-diff": (editor, id, name) => new FileDiffEditorFacade(editor as FileDiffEditor, id, name),
    "log-view": (editor, id, name) => new LogViewEditorFacade(editor as LogViewEditor, id as "log-view", name),
    "category-view": (editor, id, name) => new FolderViewEditorFacade(editor as CategoryEditorModel, id as "category-view", name),
    "git-tree": (editor, id, name) => new GitTreeEditorFacade(editor as GitTreeEditorModel, id as "git-tree", name),
    "board-view": BOARD_FACADE_FACTORY,
    "board-info": BOARD_INFO_FACADE_FACTORY,
    "toolset-view": (editor, id, name) => new ToolsetEditorFacade(editor as ToolsetEditorModel, id as "toolset-view", name),
    "tools-hub-view": (editor, id, name) => new ToolsHubEditorFacade(editor as ToolsHubEditor, id as "tools-hub-view", name),
};

const PAGE_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "Stable page id (use in pages[\"<id>\"])." },
    { name: "title", kind: "property", summary: "Tab title." },
    { name: "filePath", kind: "property", summary: "Backing file path, or nothing for an unsaved page." },
    { name: "modified", kind: "property", summary: "Whether there are unsaved changes." },
    { name: "pinned", kind: "property", summary: "Whether the tab is pinned." },
    { name: "content", kind: "property", writable: true, summary: "The page's text (text-based editors only; empty for browser/image pages). Assign with \"value\"." },
    { name: "language", kind: "property", writable: true, summary: "Language id. Assigning changes it; use page.tab.highlight(\"tab-language\") when the user asks where it is changed." },
    { name: "tab", kind: "property", node: true, summary: "This page's tab-strip entry and its visible controls." },
    { name: "editor", kind: "property", node: true, summary: "Current editor facade; inspect its id to discover the available operations." },
    { name: "editorSwitches", kind: "property", node: true, summary: "The current editor, toolbar-identical switch options, and unrestricted editor switching." },
    { name: "data", kind: "property", summary: "Free-form per-page data bag shared between scripts." },
    { name: "panels", kind: "property", node: true, summary: "Live sidebar panels, read-only open/width state, bare-id expansion, and whole-sidebar toggle." },
    { name: "grouped", kind: "property", summary: "The page shown beside this one.", caution: "reading it CREATES a grouped page if none exists" },
    { name: "runScript", kind: "method", signature: "runScript()", summary: "Run this page's JavaScript/TypeScript content as a script; returns the output text." },
];

const PAGE_HELP = `
One open page (tab). Plain properties describe it; content holds text for text-based editors and can
be assigned with value. editor is the current editor facade; inspect editor.id to narrow its operation
union (for example, if page.editor.id is "grid-json", page.editor.addRows(5) is valid). editorSwitches
exposes the toolbar's merged options and switchTo(id), which accepts any registered editor id.
tab is this page's tab-strip entry and its curated controls; its title remains available even when a
pinned tab hides title text. Use pages.showPage, closePage, pinTab, unpinTab, and moveTab for tab
actions. The panels node is a live view of the page's sidebar. Grouped is a side-by-side page and
creates one when none exists.
`;

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

    private get mainEditor(): EditorModel | null {
        const pageId = this.model.page?.id;
        if (!pageId) return null;
        return pagesModel.findPage(pageId)?.mainEditorInstance ?? null;
    }

    private currentEditorId(): string {
        return this.mainEditor?.editorId
            ?? (this.model.state.get() as { editor?: string }).editor
            ?? "monaco";
    }

    get id(): string { return this.model.page?.id ?? this.model.id; }
    get title(): string { return this.model.title; }
    get modified(): boolean { return this.model.modified; }
    get pinned(): boolean { return this.model.page?.pinned ?? false; }
    get filePath(): string | undefined { return this.model.filePath; }

    get content(): string {
        return isTextFileModel(this.model) ? this.model.state.get().content : "";
    }

    set content(value: string) {
        if (isTextFileModel(this.model)) this.model.changeContent(value);
    }

    get language(): string { return this.model.state.get().language ?? ""; }

    set language(value: string) {
        if (!this.model.noLanguage) this.model.changeLanguage(value);
    }

    get editor(): EditorFacade {
        const id = this.currentEditorId();
        const name = editorRegistry.getById(id)?.name
            ?? customEditorRegistry.entries.find((entry) => entry.editorId === id)?.name
            ?? id;
        const editor = this.mainEditor;
        const factory = editor
            ? FACADE_FOR_EDITOR[id]
                ?? (isBoardEditorId(id) ? BOARD_FACADE_FACTORY : undefined)
            : undefined;
        return factory ? factory(editor, id, name) : new GenericEditorFacade(id, name);
    }

    get editorSwitches(): PageEditorSwitchesNode {
        return new PageEditorSwitchesNode(() => this.model.page ?? null);
    }

    get tab(): PageTabNode { return new PageTabNode(() => this.model.page ?? null); }

    get data(): Record<string, unknown> { return this.model.scriptData; }
    get panels(): PagePanelsNode { return new PagePanelsNode(() => this.model.page); }

    get grouped(): PageWrapper {
        const pageId = this.model.page?.id ?? this.model.id;
        const groupedPage = pagesModel.getGroupedPage(pageId);
        const editor = groupedPage?.mainEditor ?? pagesModel.requireGroupedText(pageId);
        return new GroupedPageWrapper(editor, this.releaseList, this.outputFlags);
    }

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "Page",
            summary: "One open page (tab): its text, language, editor facade, editor switches, live sidebar panels, and grouped page.",
            members: PAGE_MEMBERS,
            help: PAGE_HELP,
            children: () => this.aiChildren(),
            restricted: () => this.aiRestricted(),
            summarize: () => this.aiSummary(),
        };
    }

    private browserState(): IBrowserPrivacyState | undefined {
        return this.currentEditorId() === "browser-view"
            ? this.model.state.get() as IBrowserPrivacyState
            : undefined;
    }

    private aiRestricted(): string | undefined {
        const state = this.browserState();
        return !state || agentMayAccessBrowserPage(state) ? undefined : privateBrowserRefusal(state, "call");
    }

    private aiChildren(): IAiChild[] {
        const editor = this.editor;
        const children: IAiChild[] = [
            { segment: ".editor", kind: editor.aiVision.kind, summary: `facade for the current editor (${editor.id})` },
        ];
        const pageId = this.model.page?.id ?? this.model.id;
        if (pagesModel.isGrouped(pageId)) {
            const grouped = pagesModel.getGroupedPage(pageId);
            if (grouped) children.push({ segment: ".grouped", kind: "Page", summary: `grouped beside this page: "${grouped.title}"` });
        }
        return children;
    }

    private aiSummary(): Record<string, unknown> {
        const summary: Record<string, unknown> = {
            kind: "Page", id: this.id, title: this.title, editor: this.editor.id,
            language: this.language, filePath: this.filePath, modified: this.modified,
            pinned: this.pinned, active: pagesModel.activePage?.id === this.id,
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

    async runScript(): Promise<string> {
        const language = this.model.state.get().language ?? "";
        const { isScriptLanguage } = await import("../transpile");
        if (!isScriptLanguage(language)) throw new Error("runScript() is only available for javascript/typescript pages");
        const { scriptRunner } = await import("../ScriptRunner");
        return scriptRunner.runWithResult(this.model.id, this.content, this.model, language);
    }
}

class GroupedPageWrapper extends PageWrapper {
    constructor(model: EditorOrHost, releaseList: Array<() => void>, private readonly flags?: ScriptOutputFlags) {
        super(model, releaseList);
    }

    set content(value: string) {
        super.content = value;
        if (this.flags) this.flags.groupedContentWritten = true;
    }

    get content(): string { return super.content; }
}
