import type { EditorView } from "./common";

/**
 * Read-only information about a registered editor.
 */
export interface IEditorInfo {
    /** Unique editor identifier (e.g. "monaco", "grid-json", "image-view"). */
    readonly id: EditorView;
    /** Human-readable editor name (e.g. "Text Editor", "JSON Grid"). */
    readonly name: string;
    /**
     * `true` for text-bearing editors (Monaco, Grid, Markdown, Notebook, Todo,
     * Link, SVG, HTML, Mermaid, Log View, Graph, Draw, Rest Client) — share a
     * common text content and can switch between each other.
     * `false` for standalone editors (PDF, Image, Browser, Archive, Video, MCP
     * Inspector, Storybook, About, Settings, Category) — own their own state
     * and do not participate in content-based editor switching.
     */
    readonly hasContentHost: boolean;
}

/**
 * Options for the editor switch dropdown.
 */
export interface ISwitchOptions {
    /** Available editor IDs. Empty if only one editor applies. */
    readonly options: EditorView[];
    /** Get the display label for an editor option. */
    getOptionLabel(option: EditorView): string;
}

/**
 * Read-only registry of all editors in the application.
 * Query available editors, resolve the best editor for a file,
 * and get switch options for the UI.
 *
 * Available as `app.editors`.
 *
 * @example
 * const all = app.editors.getAll();
 * const best = app.editors.resolve("data.json");
 * console.log(best?.name); // "JSON Grid"
 */
export interface IEditorRegistry {
    /** Get all registered editors. */
    getAll(): IEditorInfo[];

    /** Get editor info by ID. Returns `undefined` if not found. */
    getById(id: EditorView): IEditorInfo | undefined;

    /**
     * Resolve the best matching editor for a file path.
     * Returns `undefined` if no editor matches.
     */
    resolve(filePath: string): IEditorInfo | undefined;

    /** Resolve just the editor ID for a file path. */
    resolveId(filePath: string): EditorView | undefined;

    /**
     * Get available editor switch options for a language.
     * Used to build "Switch Editor" dropdowns in the UI.
     * @param languageId - Monaco language ID (e.g. "json", "markdown")
     * @param filePath - Optional file path for context
     */
    getSwitchOptions(languageId: string, filePath?: string): ISwitchOptions;
}
