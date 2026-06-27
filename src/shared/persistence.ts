/** Serialized content pipe (provider + persistent transformers + encoding).
 *  Identical shape to today's `IEditorState.pipe`; relocated under
 *  `HostDescriptor` because the pipe is host-owned, not editor-owned. */
export type PipeDescriptor = {
    provider: { type: string; config: Record<string, unknown> };
    transformers: { type: string; config: Record<string, unknown> }[];
    encoding?: string;
};

/** Persisted state for an `IContentHost`. Text-bearing editors carry one;
 *  no-host editors (PDF, Browser, …) don't. `kind` discriminates the host
 *  class — only `"textFile"` exists today; future host types add cases. */
export interface HostDescriptor {
    kind: "textFile";
    state: Record<string, unknown>;
    pipe?: PipeDescriptor;
}

/** Persisted state for an `EditorModel`. One per editor in
 *  `PageDescriptor.editors[]`. `editorId` is the registry key
 *  (replaces today's `IEditorState.type` + `IEditorState.editor`);
 *  `id` is the editor instance UUID (cache-file prefix). */
export interface EditorDescriptor {
    editorId: string;
    id: string;
    state: Record<string, unknown>;
    host?: HostDescriptor;
}

/** One entry in a page's Markdown back-navigation history. `href` is a file
 *  path (or `file://` URL) re-openable via `openRawLink` — today the push site
 *  stores a plain OS path; `title` is the document title (Back button tooltip). */
export interface NavEntry {
    href: string;
    title?: string;
}

/** Persisted state for a `PageModel`. `mainEditorId` references one
 *  `editor.id` in `editors[]`, or `null` for sidebar-only pages. */
export interface PageDescriptor {
    id: string;
    pinned: boolean;
    modified: boolean;
    mainEditorId: string | null;
    editors: EditorDescriptor[];
    sidebar?: {
        open: boolean;
        width: number;
        /** Values: "explorer", "search", or a panel id from one of `editors[]`. */
        activePanel: string;
    };
    /** Markdown in-page back-navigation history (oldest first). Persisted so it
     *  survives app restart and moving the page to another window. Omitted when
     *  empty. */
    navBack?: NavEntry[];
}

/** Top-level shape persisted to `<userData>/openFiles.txt`.
 *
 *  `schemaVersion: 4` is the single discriminator at restore time. A mismatch
 *  triggers detect-and-skip (no migration shim — see concern C2). Shape-
 *  incompatible changes to any descriptor above bump the integer; additive
 *  optional fields don't. */
export interface WindowState {
    schemaVersion: 4;
    pages: PageDescriptor[];
    groupings?: [string, string][];
    activePageId?: string;
}
