export type EditorType = "textFile" | "pdfFile" | "imageFile" | "aboutPage" | "settingsPage" | "browserPage" | "mcpInspectorPage" | "categoryPage" | "archiveFile" | "fileExplorer" | "videoPage" | "storybookPage";

// `EditorView` lives in the public script-API types because that file is the
// one copied verbatim into `assets/editor-types/` for Monaco IntelliSense in
// user scripts — it must stay self-contained. Re-export here so main + renderer
// internal code can read it from `shared/types` without crossing folder layers.
import type { EditorView } from "../renderer/api/types/common";
export type { EditorView };

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
    /** Active secondary view panel IDs (e.g., ["archive-tree"]). Array supports multi-panel models. */
    secondaryView?: string[],
}

export type {
    PageDescriptor,
    WindowState,
    EditorDescriptor,
    HostDescriptor,
    PipeDescriptor,
} from "./persistence";

import type { PageDescriptor } from "./persistence";

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
