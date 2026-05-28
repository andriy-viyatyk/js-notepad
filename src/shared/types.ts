export type EditorType = "textFile" | "pdfFile" | "imageFile" | "aboutPage" | "settingsPage" | "browserPage" | "mcpInspectorPage" | "categoryPage" | "archiveFile" | "fileExplorer" | "videoPage" | "storybookPage";
export type EditorView = "monaco" | "grid-json" | "grid-csv" | "grid-jsonl" | "md-view" | "pdf-view" | "image-view" | "svg-view" | "about-view" | "notebook-view" | "mermaid-view" | "html-view" | "settings-view" | "todo-view" | "link-view" | "log-view" | "browser-view" | "graph-view" | "draw-view" | "mcp-view" | "rest-client" | "category-view" | "archive-view" | "video-view" | "storybook-view";

import type { ILinkData } from "../renderer/api/types/io.link-data";

export interface IEditorState {
    id: string,
    type: EditorType,
    title: string,
    modified: boolean,
    language?: string,
    filePath?: string,
    /** Serialized content pipe descriptor (provider + persistent transformers). */
    pipe?: { provider: { type: string; config: Record<string, unknown> }; transformers: { type: string; config: Record<string, unknown> }[]; encoding?: string },
    editor?: EditorView,
    /** The link that opened this page — cleaned ILinkData (ephemeral fields stripped). Persisted across restarts. */
    sourceLink?: ILinkData,
    /** Active secondary editor panel IDs (e.g., ["archive-tree"]). Array supports multi-panel models. */
    secondaryEditor?: string[],
}

// Canonical v4 persistence types (post-EPIC-028 / US-559 — the legacy
// `LegacyPageDescriptor` / `LegacyWindowState` shapes were retired with the
// strangler retirement; pre-v4 session data is silently detect-and-skipped
// on first launch per C2 / C559-6).
export type {
    PageDescriptor,
    WindowState,
    EditorDescriptor,
    HostDescriptor,
    PipeDescriptor,
} from "./persistence-v4";

import type { PageDescriptor } from "./persistence-v4";

export interface WindowPages {
    pages: PageDescriptor[];
    windowIndex: number;
}

export interface PageDragData {
    sourceWindowIndex?: number;
    targetWindowIndex?: number;
    page?: PageDescriptor;
    dropPosition?: { x: number; y: number };
}

export interface FileStats {
    size: number;
    mtime: number;
    exists: boolean;
}
