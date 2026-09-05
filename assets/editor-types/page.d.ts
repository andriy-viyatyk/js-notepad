import type { EditorView } from "./common";
import type { ITextEditor } from "./text-editor";
import type { IGridEditor } from "./grid-editor";
import type { INotebookEditor } from "./notebook-editor";
import type { ILinkEditor } from "./link-editor";
import type { IBrowserEditor } from "./browser-editor";
import type { IMarkdownEditor } from "./markdown-editor";
import type { ISvgEditor } from "./svg-editor";
import type { IHtmlEditor } from "./html-editor";
import type { IMermaidEditor } from "./mermaid-editor";
import type { IGraphEditor } from "./graph-editor";
import type { IDrawEditor } from "./draw-editor";
import type { IMcpInspectorEditor } from "./mcp-inspector-editor";
import type { IImageEditor } from "./image-editor";
import type { IGenericEditor } from "./generic-editor";
import type { IPageEditorSwitches } from "./page-editor-switches";
import type { IPagePanels } from "./page-panels";

/** The operation-bearing editor ids represented by the facade union. */
export type IFacadeEditorId =
    | "monaco"
    | "grid-json" | "grid-csv" | "grid-jsonl"
    | "notebook-view" | "link-view" | "md-view" | "svg-view" | "html-view"
    | "mermaid-view" | "graph-view" | "draw-view" | "browser-view" | "mcp-view" | "image-view";

/** Built-in editors without an operation facade, plus runtime custom board ids. */
export type IGenericEditorId = Exclude<EditorView, IFacadeEditorId>
    | (string & { readonly __genericEditorId: unique symbol });

export type IEditorFacade =
    | ITextEditor | IGridEditor | INotebookEditor | ILinkEditor | IBrowserEditor
    | IMarkdownEditor | ISvgEditor | IHtmlEditor | IMermaidEditor | IGraphEditor
    | IDrawEditor | IMcpInspectorEditor | IImageEditor | IGenericEditor;

/**
 * IPage — represents a page (tab) in the current window.
 *
 * Available as the `page` global in scripts, or via `app.pages.activePage`.
 */
export interface IPage {
    readonly id: string;
    readonly title: string;
    readonly modified: boolean;
    readonly pinned: boolean;
    readonly filePath?: string;
    content: string;
    language: string;
    /** The current editor facade. Narrow on editor.id before using operations. */
    readonly editor: IEditorFacade;
    /** The toolbar's switch projection and editor-switch operation. */
    readonly editorSwitches: IPageEditorSwitches;
    readonly data: Record<string, any>;
    readonly panels: IPagePanels;
    readonly grouped: IPage;

    /** Run this page's content as a script; only javascript/typescript pages are valid. */
    runScript(): Promise<string>;
}

/**
 * The discriminant narrows the operation union:
 *
 * const editor = page.editor;
 * if (editor.id === "grid-json") {
 *     editor.addRows(5);
 * }
 */
