import { editorRegistry } from "./registry";
import { EditorModule } from "./types";
import { secondaryEditorRegistry } from "../ui/navigation/secondary-editor-registry";
import { isArchiveFile } from "../core/utils/file-path";

// =============================================================================
// Helper functions for common patterns
// =============================================================================

/** Check if file matches any of the given extensions */
const matchesExtension = (fileName: string, extensions: string[]): boolean => {
    const lower = fileName.toLowerCase();
    return extensions.some((ext) => lower.endsWith(ext));
};

/** Check if file matches a pattern */
const matchesPattern = (fileName: string, pattern: RegExp): boolean => {
    return pattern.test(fileName.toLowerCase());
};

// Patterns for specialized JSON editors (excluded from grid-json)
const SPECIALIZED_JSON_PATTERNS = [
    /\.note\.json$/i,
    /\.todo\.json$/i,
    /\.link\.json$/i,
    /\.fg\.json$/i,
    /\.excalidraw$/i,
];

const isSpecializedJson = (fileName?: string): boolean => {
    if (!fileName) return false;
    return SPECIALIZED_JSON_PATTERNS.some((p) => p.test(fileName));
};

// =============================================================================
// Text Editor Module (shared by content-view editors)
// =============================================================================

const textEditorModule: EditorModule = {
    // EPIC-028 / US-557 — the original lazy `require("./text/TextEditorView")`
    // getter failed at runtime under Vite (the bundler can't resolve the
    // relative CJS path inside renderer_init's module graph) and crashed the
    // per-note dispatch path for any note whose preferred editor still
    // delegates to this module (grid-* and log-view post US-552 / US-553).
    // Static import works — `TextEditorView` is already in Vite's graph via
    // `RenderEditor.tsx`, so this adds nothing new and avoids the runtime
    // CJS resolution. The "circular dependency" the original comment guarded
    // against no longer exists post-US-548 (LegacyEditorAdapter lives in
    // base/v4, not in the text editor folder).
    Editor: TextEditorView,
    newEditorModel: async (filePath?: string) => {
        const { newTextFileModel } = await import("./text/TextEditorModel");
        return newTextFileModel(filePath);
    },
    newEmptyEditorModel: async (editorType) => {
        if (editorType !== "textFile") return null;
        const { newTextFileModel } = await import("./text/TextEditorModel");
        return newTextFileModel();
    },
    newEditorModelFromState: async (state) => {
        const { newTextFileModelFromState } = await import("./text/TextEditorModel");
        return newTextFileModelFromState(state);
    },
};

// =============================================================================
// Editor Registrations
// =============================================================================

// Monaco (default text editor - fallback for all text files)
editorRegistry.register({
    id: "monaco",
    name: "Text Editor",
    editorType: "textFile",
    category: "content-view",
    acceptFile: () => 0, // Lowest priority - fallback for all files
    validForLanguage: () => true, // Valid for all languages
    switchOption: () => 0, // Always available as first option
    loadModule: async () => {
        const { createTextViewModel } = await import("./text/TextEditor");
        const module: EditorModule = Object.create(textEditorModule);
        module.createViewModel = createTextViewModel;
        return module;
    },
});

// Grid JSON editor
editorRegistry.register({
    id: "grid-json",
    name: "Grid",
    editorType: "textFile",
    category: "content-view",
    acceptFile: (fileName) => {
        // High priority for .grid.json files
        if (matchesPattern(fileName, /\.grid\.json$/i)) return 20;
        return -1;
    },
    validForLanguage: (languageId) => languageId === "json",
    switchOption: (languageId, fileName) => {
        if (languageId !== "json") return -1;
        // Exclude for specialized JSON editors
        if (isSpecializedJson(fileName)) return -1;
        return 10;
    },
    loadModule: async () => {
        // EPIC-028 / US-552 — Grid migrated to a native v4 module. The
        // legacy `Editor` slot is unreachable (v4 Grid renders through the
        // native module's Component), but the `newEditorModel*` factories
        // are still consumed by the open-file flow to construct the
        // underlying TextFileModel host that v4 GridEditor wraps. Delegate
        // to `textEditorModule` so both stay live.
        return textEditorModule;
    },
});

// Grid CSV editor
editorRegistry.register({
    id: "grid-csv",
    name: "Grid",
    editorType: "textFile",
    category: "content-view",
    acceptFile: (fileName) => {
        // High priority for .grid.csv files
        if (matchesPattern(fileName, /\.grid\.csv$/i)) return 20;
        return -1;
    },
    validForLanguage: (languageId) => languageId === "csv",
    switchOption: (languageId) => {
        if (languageId !== "csv") return -1;
        return 10;
    },
    loadModule: async () => {
        // EPIC-028 / US-552 — see grid-json above.
        return textEditorModule;
    },
});

// Grid JSONL editor
editorRegistry.register({
    id: "grid-jsonl",
    name: "Grid",
    editorType: "textFile",
    category: "content-view",
    acceptFile: (fileName) => {
        if (matchesPattern(fileName, /\.grid\.jsonl$/i)) return 20;
        return -1;
    },
    validForLanguage: (languageId) => languageId === "jsonl",
    switchOption: (languageId) => {
        if (languageId !== "jsonl") return -1;
        return 10;
    },
    loadModule: async () => {
        // EPIC-028 / US-552 — see grid-json above.
        return textEditorModule;
    },
});

// Log View editor (content-view for .log.jsonl files)
editorRegistry.register({
    id: "log-view",
    name: "Log View",
    editorType: "textFile",
    category: "content-view",
    acceptFile: (fileName) => {
        if (matchesPattern(fileName, /\.log\.jsonl$/i)) return 20;
        return -1;
    },
    validForLanguage: (languageId) => languageId === "jsonl",
    switchOption: (languageId, fileName) => {
        if (languageId !== "jsonl") return -1;
        // Only show for .log.jsonl files
        if (!fileName || !matchesPattern(fileName, /\.log\.jsonl$/i)) return -1;
        return 10;
    },
    isEditorContent: (languageId, content) => {
        if (languageId !== "jsonl") return false;
        return /\"type\"\s*:\s*\"log\./.test(content);
    },
    loadModule: async () => {
        // EPIC-028 / US-553 — LogView migrated to a native v4 module. The
        // legacy Editor + createViewModel slots are unused; the
        // newEditorModel* factories are still consumed by the open-file flow
        // to construct the underlying TextFileModel host that v4 LogViewEditor
        // wraps. Delegate to textEditorModule (mirrors US-552 Grid pattern).
        return textEditorModule;
    },
});

// Markdown preview
editorRegistry.register({
    id: "md-view",
    name: "Preview",
    editorType: "textFile",
    category: "content-view",
    validForLanguage: (languageId) => languageId === "markdown",
    switchOption: (languageId) => {
        if (languageId !== "markdown") return -1;
        return 10;
    },
    loadModule: async () => {
        // EPIC-028 / US-554 — Markdown migrated to a native v4 module for
        // PAGE-level rendering (`markdownModule` in the v4 block below). The
        // legacy `Editor` + `createViewModel` slots are still consumed by the
        // NOTEBOOK per-note dispatch (`NoteItemActiveEditor` → `AsyncEditor`)
        // until US-557 migrates Notebook to the v4 host-transfer model. Keep
        // the legacy MarkdownView + MarkdownViewModel alive for that path.
        const [module, { createMarkdownViewModel }] = await Promise.all([
            import("./markdown/MarkdownView"),
            import("./markdown/MarkdownViewModel"),
        ]);
        return {
            Editor: module.MarkdownView,
            createViewModel: createMarkdownViewModel,
            newEditorModel: textEditorModule.newEditorModel,
            newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
            newEditorModelFromState: textEditorModule.newEditorModelFromState,
        };
    },
});

// PDF viewer (standalone page editor)
editorRegistry.register({
    id: "pdf-view",
    name: "PDF Viewer",
    editorType: "pdfFile",
    category: "standalone",
    acceptFile: (fileName) => {
        if (matchesExtension(fileName, [".pdf"])) return 100;
        return -1;
    },
    loadModule: async () => {
        // EPIC-028 / US-568 — PDF migrated to native v4 module (`pdfModule`
        // in `./pdf/index.tsx`). Legacy `pdfEditorModule` is PRESERVED in
        // `PdfView.tsx` for the LegacyEditorAdapter safety-net path used by
        // the file-open flow; `wrapLegacyForPage`'s `instanceof V4EditorModel`
        // early-return (PD-IMPL16) detects the returned v4 PdfEditor and
        // skips the adapter wrap. US-559 retires this loadModule entirely.
        const module = await import("./pdf/PdfView");
        return module.default;
    },
});

// Image viewer (standalone page editor for binary images)
editorRegistry.register({
    id: "image-view",
    name: "Image Viewer",
    editorType: "imageFile",
    category: "standalone",
    acceptFile: (fileName) => {
        const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico"];
        if (matchesExtension(fileName, imageExtensions)) return 100;
        return -1;
    },
    loadModule: async () => {
        // EPIC-028 / US-569 — Image migrated to native v4 module
        // (`imageModule` in `./image/index.tsx`). Legacy `imageEditorModule`
        // is PRESERVED in `ImageView.tsx` for the LegacyEditorAdapter
        // safety-net path used by the file-open flow AND by
        // `PagesLifecycleModel.openImageInNewTab`; `wrapLegacyForPage`'s
        // `instanceof V4EditorModel` early-return (US-568 PD-IMPL16)
        // detects the returned v4 ImageEditor and skips the adapter wrap.
        // US-559 retires this loadModule entirely.
        const module = await import("./image/ImageView");
        return module.default;
    },
});

// Notebook editor (content-view for .note.json files)
editorRegistry.register({
    id: "notebook-view",
    name: "Notebook",
    editorType: "textFile",
    category: "content-view",
    acceptFile: (fileName) => {
        // High priority for .note.json files - opens in notebook by default
        if (matchesPattern(fileName, /\.note\.json$/i)) return 20;
        return -1;
    },
    validForLanguage: (languageId) => languageId === "json",
    switchOption: (languageId, fileName) => {
        // Only show for .note.json files
        if (languageId !== "json") return -1;
        if (!fileName || !matchesPattern(fileName, /\.note\.json$/i)) return -1;
        return 10;
    },
    isEditorContent: (languageId, content) => {
        if (languageId !== "json") return false;
        if (!content.includes('"type"')) return false;
        return /"type"\s*:\s*"note-editor"/.test(content) && content.includes('"notes"');
    },
    loadModule: async () => {
        // EPIC-028 / US-557 — Notebook migrated to native v4 module
        // (`notebookModule` in `./notebook/index.tsx`). Legacy NotebookView +
        // NotebookViewModel are PRESERVED here for the LegacyEditorAdapter
        // safety-net path. Page-level pages take the v4 path via
        // `wrapLegacyForPage` in `PagesLifecycleModel.ts`. Inner per-note
        // dispatch (NoteItemActiveEditor → AsyncEditor → legacy XxxView)
        // still uses this path indirectly via NoteItemEditModel.acquireViewModel.
        const [module, { createNotebookViewModel }] = await Promise.all([
            import("./notebook/NotebookView"),
            import("./notebook/NotebookViewModel"),
        ]);
        return {
            Editor: module.NotebookEditor,
            createViewModel: createNotebookViewModel,
            newEditorModel: textEditorModule.newEditorModel,
            newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
            newEditorModelFromState: textEditorModule.newEditorModelFromState,
        };
    },
});

// SVG preview (content-view for SVG files)
editorRegistry.register({
    id: "svg-view",
    name: "Preview",
    editorType: "textFile",
    category: "content-view",
    validForLanguage: (languageId) => languageId === "xml",
    switchOption: (_languageId, fileName) => {
        // Only show for .svg files
        if (fileName && matchesExtension(fileName, [".svg"])) return 10;
        return -1;
    },
    loadModule: async () => {
        // EPIC-028 / US-560 — Svg migrated to native v4 module
        // (`svgModule` in `./svg/index.tsx`). Legacy SvgView + SvgViewModel
        // are PRESERVED here because notebook per-note dispatch
        // (`NoteItemActiveEditor` → `AsyncEditor` → `module.Editor`) still
        // consumes them. Page-level pages take the v4 path via
        // `wrapLegacyForPage`. Full retirement in US-557 (Notebook) / US-559.
        const [module, { createSvgViewModel }] = await Promise.all([
            import("./svg/SvgView"),
            import("./svg/SvgViewModel"),
        ]);
        return {
            Editor: module.SvgView,
            createViewModel: createSvgViewModel,
            newEditorModel: textEditorModule.newEditorModel,
            newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
            newEditorModelFromState: textEditorModule.newEditorModelFromState,
        };
    },
});

// HTML preview (content-view for HTML files)
editorRegistry.register({
    id: "html-view",
    name: "Preview",
    editorType: "textFile",
    category: "content-view",
    validForLanguage: (languageId) => languageId === "html",
    switchOption: (languageId) => {
        if (languageId !== "html") return -1;
        return 10;
    },
    loadModule: async () => {
        // EPIC-028 / US-561 — Html migrated to native v4 module
        // (`htmlModule` in `./html/index.tsx`). Legacy HtmlView + HtmlViewModel
        // are PRESERVED here because notebook per-note dispatch
        // (`NoteItemActiveEditor` → `AsyncEditor` → `module.Editor`) still
        // consumes them. Page-level pages take the v4 path via
        // `wrapLegacyForPage`. Full retirement in US-557 (Notebook) / US-559.
        const [module, { createHtmlViewModel }] = await Promise.all([
            import("./html/HtmlView"),
            import("./html/HtmlViewModel"),
        ]);
        return {
            Editor: module.HtmlView,
            createViewModel: createHtmlViewModel,
            newEditorModel: textEditorModule.newEditorModel,
            newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
            newEditorModelFromState: textEditorModule.newEditorModelFromState,
        };
    },
});

// Mermaid diagram preview (content-view for .mmd files)
editorRegistry.register({
    id: "mermaid-view",
    name: "Mermaid",
    editorType: "textFile",
    category: "content-view",
    validForLanguage: (languageId) => languageId === "mermaid",
    switchOption: (languageId) => {
        if (languageId !== "mermaid") return -1;
        return 10;
    },
    loadModule: async () => {
        // EPIC-028 / US-562 — Mermaid migrated to native v4 module
        // (`mermaidModule` in `./mermaid/index.tsx`). Legacy MermaidView +
        // MermaidViewModel are PRESERVED here because notebook per-note
        // dispatch (`NoteItemActiveEditor` → `AsyncEditor` → `module.Editor`)
        // still consumes them. Page-level pages take the v4 path via
        // `wrapLegacyForPage`. Full retirement in US-557 (Notebook) / US-559.
        const [module, { createMermaidViewModel }] = await Promise.all([
            import("./mermaid/MermaidView"),
            import("./mermaid/MermaidViewModel"),
        ]);
        return {
            Editor: module.MermaidView,
            createViewModel: createMermaidViewModel,
            newEditorModel: textEditorModule.newEditorModel,
            newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
            newEditorModelFromState: textEditorModule.newEditorModelFromState,
        };
    },
});

// Todo editor (content-view for .todo.json files)
editorRegistry.register({
    id: "todo-view",
    name: "ToDo",
    editorType: "textFile",
    category: "content-view",
    acceptFile: (fileName) => {
        if (matchesPattern(fileName, /\.todo\.json$/i)) return 20;
        return -1;
    },
    validForLanguage: (languageId) => languageId === "json",
    switchOption: (languageId, fileName) => {
        if (languageId !== "json") return -1;
        if (!fileName || !matchesPattern(fileName, /\.todo\.json$/i)) return -1;
        return 10;
    },
    isEditorContent: (languageId, content) => {
        if (languageId !== "json") return false;
        if (!content.includes('"type"')) return false;
        return /"type"\s*:\s*"todo-editor"/.test(content) && content.includes('"items"');
    },
    loadModule: async () => {
        // EPIC-028 / US-556 — Todo migrated to native v4 module
        // (`todoModule` in `./todo/index.tsx`). Legacy TodoView +
        // TodoViewModel are PRESERVED here for future notebook per-note
        // dispatch (`NoteItemActiveEditor` → `AsyncEditor` → `module.Editor`).
        // Page-level pages take the v4 path via `wrapLegacyForPage` in
        // `PagesLifecycleModel.ts`.
        const [module, { createTodoViewModel }] = await Promise.all([
            import("./todo/TodoView"),
            import("./todo/TodoViewModel"),
        ]);
        return {
            Editor: module.TodoEditor,
            createViewModel: createTodoViewModel,
            newEditorModel: textEditorModule.newEditorModel,
            newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
            newEditorModelFromState: textEditorModule.newEditorModelFromState,
        };
    },
});

// Rest Client (content-view for .rest.json files)
editorRegistry.register({
    id: "rest-client",
    name: "Rest Client",
    editorType: "textFile",
    category: "content-view",
    acceptFile: (fileName) => {
        if (matchesPattern(fileName, /\.rest\.json$/i)) return 20;
        return -1;
    },
    validForLanguage: (languageId) => languageId === "json",
    switchOption: (languageId, fileName) => {
        if (languageId !== "json") return -1;
        if (!fileName || !matchesPattern(fileName, /\.rest\.json$/i)) return -1;
        return 10;
    },
    isEditorContent: (languageId, content) => {
        if (languageId !== "json") return false;
        if (!content.includes('"type"')) return false;
        return /"type"\s*:\s*"rest-client"/.test(content) && content.includes('"requests"');
    },
    loadModule: async () => {
        // EPIC-028 / US-563 — Rest Client migrated to native v4 module
        // (`restClientModule` in `./rest-client/index.tsx`). Legacy
        // RestClientView + RestClientViewModel are PRESERVED here for future
        // notebook per-note dispatch parity with the other preserved editors
        // (US-554 / US-555 / US-556 / US-560 / US-561 / US-562 / US-564 /
        // US-565 retrospective pattern). Page-level pages take the v4 path
        // via `wrapLegacyForPage` in `PagesLifecycleModel.ts`.
        const [module, { createRestClientViewModel }] = await Promise.all([
            import("./rest-client/RestClientView"),
            import("./rest-client/RestClientViewModel"),
        ]);
        return {
            Editor: module.RestClientEditor,
            createViewModel: createRestClientViewModel,
            newEditorModel: textEditorModule.newEditorModel,
            newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
            newEditorModelFromState: textEditorModule.newEditorModelFromState,
        };
    },
});

// Link editor (content-view for .link.json files)
editorRegistry.register({
    id: "link-view",
    name: "Links",
    editorType: "textFile",
    category: "content-view",
    acceptFile: (fileName) => {
        if (matchesPattern(fileName, /\.link\.json$/i)) return 20;
        return -1;
    },
    validForLanguage: (languageId) => languageId === "json",
    switchOption: (languageId, fileName) => {
        if (languageId !== "json") return -1;
        if (!fileName || !matchesPattern(fileName, /\.link\.json$/i)) return -1;
        return 10;
    },
    isEditorContent: (languageId, content) => {
        if (languageId !== "json") return false;
        if (!content.includes('"type"')) return false;
        return /"type"\s*:\s*"link-editor"/.test(content) && content.includes('"links"');
    },
    loadModule: async () => {
        // EPIC-028 / US-555 — Link migrated to native v4 module
        // (`linkModule` in `./link-editor/index.tsx`). Legacy LinkView +
        // LinkViewModel are PRESERVED here because Browser bookmarks
        // (BlankPageLinks + BookmarksDrawer via BrowserBookmarks.acquireViewModel)
        // and notebook per-note dispatch still consume them. Page-level pages
        // take the v4 path via `wrapLegacyForPage`. Full retirement in
        // US-557 (Notebook) / US-558 (Browser) / US-559.
        const [module, { createLinkViewModel }] = await Promise.all([
            import("./link-editor/LinkView"),
            import("./link-editor/LinkViewModel"),
        ]);
        return {
            Editor: module.LinkEditor,
            createViewModel: createLinkViewModel,
            newEditorModel: textEditorModule.newEditorModel,
            newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
            newEditorModelFromState: textEditorModule.newEditorModelFromState,
        };
    },
});

// Force graph viewer (content-view for .fg.json files)
editorRegistry.register({
    id: "graph-view",
    name: "Graph",
    editorType: "textFile",
    category: "content-view",
    acceptFile: (fileName) => {
        if (matchesPattern(fileName, /\.fg\.json$/i)) return 20;
        return -1;
    },
    validForLanguage: (languageId) => languageId === "json",
    switchOption: (languageId, fileName) => {
        if (languageId !== "json") return -1;
        // Only offer Graph switch for .fg.json files (content detection handles the rest)
        if (fileName && matchesPattern(fileName, /\.fg\.json$/i)) return 10;
        return -1;
    },
    isEditorContent: (languageId, content) => {
        if (languageId !== "json") return false;
        if (!content.includes('"type"')) return false;
        return /"type"\s*:\s*"force-graph"/.test(content) && content.includes('"nodes"');
    },
    loadModule: async () => {
        // EPIC-028 / US-564 — Graph migrated to native v4 module
        // (`graphModule` in `./graph/index.tsx`). Legacy GraphView +
        // GraphViewModel are PRESERVED here because notebook per-note
        // dispatch (`NoteItemActiveEditor` → `AsyncEditor` → `module.Editor`)
        // still consumes them. Page-level pages take the v4 path via
        // `wrapLegacyForPage`. Full retirement in US-557 (Notebook) / US-559.
        const [module, { createGraphViewModel }] = await Promise.all([
            import("./graph/GraphView"),
            import("./graph/GraphViewModel"),
        ]);
        return {
            Editor: module.GraphView,
            createViewModel: createGraphViewModel,
            newEditorModel: textEditorModule.newEditorModel,
            newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
            newEditorModelFromState: textEditorModule.newEditorModelFromState,
        };
    },
});

// Drawing editor (content-view for .excalidraw files — Excalidraw canvas)
editorRegistry.register({
    id: "draw-view",
    name: "Drawing",
    editorType: "textFile",
    category: "content-view",
    acceptFile: (fileName) => {
        if (matchesExtension(fileName, [".excalidraw"])) return 50;
        return -1;
    },
    validForLanguage: (languageId) => languageId === "json",
    switchOption: (_languageId, fileName) => {
        if (fileName && matchesExtension(fileName, [".excalidraw"])) return 10;
        return -1;
    },
    isEditorContent: (_languageId, content) => {
        return /^\s*\{\s*"type"\s*:\s*"excalidraw"/.test(content);
    },
    loadModule: async () => {
        // EPIC-028 / US-565 — Draw migrated to native v4 module
        // (`drawModule` in `./draw/index.tsx`). Legacy DrawView +
        // DrawViewModel are PRESERVED here because notebook per-note
        // dispatch (`NoteItemActiveEditor` → `AsyncEditor` → `module.Editor`)
        // still consumes them. Page-level pages take the v4 path via
        // `wrapLegacyForPage`. Full retirement in US-557 (Notebook) / US-559.
        const [module, { createDrawViewModel }] = await Promise.all([
            import("./draw/DrawView"),
            import("./draw/DrawViewModel"),
        ]);
        return {
            Editor: module.DrawView,
            createViewModel: createDrawViewModel,
            newEditorModel: textEditorModule.newEditorModel,
            newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
            newEditorModelFromState: textEditorModule.newEditorModelFromState,
        };
    },
});

// Archive viewer (standalone page editor — ZIP, RAR, 7z, TAR, and related formats)
editorRegistry.register({
    id: "archive-view",
    name: "Archive",
    editorType: "archiveFile",
    category: "standalone",
    acceptFile: (fileName) => {
        if (!fileName) return -1;
        return isArchiveFile(fileName) ? 100 : -1;
    },
    loadModule: async () => {
        const module = await import("./archive/index");
        return module.default;
    },
});

// Category view (standalone page editor — tree-category:// links)
editorRegistry.register({
    id: "category-view",
    name: "Folder View",
    editorType: "categoryPage",
    category: "standalone",
    acceptFile: (fileName) => {
        if (fileName?.startsWith("tree-category://")) return 200;
        return -1;
    },
    loadModule: async () => {
        const module = await import("./category/CategoryEditor");
        return module.default;
    },
});

// Video player (standalone page editor)
editorRegistry.register({
    id: "video-view",
    name: "Video Player",
    editorType: "videoPage",
    category: "standalone",
    acceptFile: (fileName) => {
        const videoExtensions = [".mp4", ".webm", ".ogg", ".m3u8", ".m3u", ".mp3", ".wav", ".aac", ".flac", ".m4a", ".wma", ".opus", ".avi", ".mkv", ".mov"];
        if (matchesExtension(fileName, videoExtensions)) return 100;
        return -1;
    },
    loadModule: async () => {
        // EPIC-028 / US-571 — Video migrated to native v4 module
        // (`videoModule` in `./video/index.tsx`). Legacy `videoEditorModule`
        // is PRESERVED in `VideoView.tsx` for the file-open + tool-launcher +
        // LegacyEditorAdapter safety-net paths; `wrapLegacyForPage`'s
        // `instanceof V4EditorModel` early-return (US-568 PD-IMPL16) detects
        // the returned v4 VideoEditor and skips the adapter wrap. US-559
        // retires this loadModule entirely.
        const module = await import("./video/VideoView");
        return module.default;
    },
});

// MCP Inspector (standalone page editor — no file association)
editorRegistry.register({
    id: "mcp-view",
    name: "MCP Inspector",
    editorType: "mcpInspectorPage",
    category: "standalone",
    loadModule: async () => {
        const module = await import("./mcp-inspector/McpInspectorView");
        return module.default;
    },
});

// Storybook (standalone page editor — no file acceptance)
editorRegistry.register({
    id: "storybook-view",
    name: "Storybook",
    editorType: "storybookPage",
    category: "standalone",
    loadModule: async () => {
        const module = await import("./storybook/StorybookEditorView");
        return module.default;
    },
});

// Browser (standalone page editor - no file acceptance)
editorRegistry.register({
    id: "browser-view",
    name: "Browser",
    editorType: "browserPage",
    category: "standalone",
    loadModule: async () => {
        // EPIC-028 / US-558 — Browser migrated to native v4 module
        // (`browserModule` in `./browser/index.tsx`). Legacy BrowserView is
        // PRESERVED here for the LegacyEditorAdapter safety-net path; the
        // `showBrowserPage` entry point takes the v4 path directly.
        const module = await import("./browser/BrowserView");
        return module.default;
    },
});

// About page (standalone page editor - no file acceptance)
editorRegistry.register({
    id: "about-view",
    name: "About",
    editorType: "aboutPage",
    category: "standalone",
    loadModule: async () => {
        // EPIC-028 / US-573 — About migrated to native v4 module
        // (`aboutModule` in `./about/index.tsx`). Legacy AboutView is PRESERVED
        // here for the LegacyEditorAdapter safety-net path; the `showAboutPage`
        // entry point takes the v4 path directly.
        const module = await import("./about/AboutView");
        return module.default;
    },
});

// Settings page (standalone page editor - no file acceptance)
editorRegistry.register({
    id: "settings-view",
    name: "Settings",
    editorType: "settingsPage",
    category: "standalone",
    loadModule: async () => {
        // EPIC-028 / US-572 — Settings migrated to native v4 module
        // (`settingsModule` in `./settings/index.tsx`). Legacy SettingsView is
        // PRESERVED here for the LegacyEditorAdapter safety-net path; the
        // `showSettingsPage` entry point takes the v4 path directly.
        const module = await import("./settings/SettingsView");
        return module.default;
    },
});

// =============================================================================
// Secondary Editor Registrations (EPIC-016)
// =============================================================================

secondaryEditorRegistry.register({
    id: "archive-tree",
    label: "Archive",
    loadComponent: () => import("./archive/ArchiveSecondaryEditor"),
});

secondaryEditorRegistry.register({
    id: "explorer",
    label: "Explorer",
    loadComponent: () => import("./explorer/ExplorerSecondaryEditor"),
});

secondaryEditorRegistry.register({
    id: "search",
    label: "Search",
    loadComponent: () => import("./explorer/SearchSecondaryEditor"),
});

secondaryEditorRegistry.register({
    id: "link-category",
    label: "Categories",
    loadComponent: () => import("./link-editor/panels/LinkCategorySecondaryEditor"),
});

secondaryEditorRegistry.register({
    id: "link-tags",
    label: "Tags",
    loadComponent: () => import("./link-editor/panels/LinkTagsSecondaryEditor"),
});

secondaryEditorRegistry.register({
    id: "link-hostnames",
    label: "Hostnames",
    loadComponent: () => import("./link-editor/panels/LinkHostnamesSecondaryEditor"),
});

// =============================================================================
// EPIC-028 / US-548 + US-551 strangler-fig bridge
// =============================================================================
// Mirror every legacy EditorDefinition into the v4 editorRegistry so v4
// consumers (switch widget — US-549; per-editor migrations US-551+) can query
// `getById`, `getAll`, `findEditorsAccepting`, `resolveForFile`.
//
// US-551 wires:
//   - "monaco" → real native v4 module (createEditor → MonacoEditor; Component →
//     <TextChrome><MonacoBody/></TextChrome>).
//   - text-bearing content-view editors (grid-* / md-view / mermaid-view /
//     svg-view / html-view / notebook-view / todo-view / link-view / log-view /
//     rest-client / graph-view / draw-view) → bare-adapter factory: createEditor
//     returns a `LegacyEditorAdapter` wrapping a placeholder TextFileModel; the
//     real host arrives via `adapter.switchFrom(oldEditor)` (CONTENT_HOST_TRAIT
//     extraction). The placeholder is discarded inside switchFrom.
//   - standalone editors (pdf-view, image-view, archive-view, video-view,
//     etc.) → throwing stub; open-file flow still constructs them via legacy
//     factories during US-558.
//
// US-552+ replaces each text-bearing entry with its own native v4 module.
// US-559 deletes the bridge.

import { editorRegistry as v4EditorRegistry } from "./base/v4/editorRegistry";
import { EDITOR_MATCHERS, makeAccepts } from "./base/v4/editor-matchers";
import { LegacyEditorAdapter } from "./base/v4/LegacyEditorAdapter";
import { TextEditorView } from "./text/TextEditorView";

const TEXT_CONTENT_VIEW_BRIDGE_IDS = new Set([
    // grid-* removed — US-552 ships native v4 modules.
    // log-view removed — US-553 ships native v4 module.
    // md-view removed — US-554 ships native v4 module.
    // svg-view removed — US-560 ships native v4 module.
    // html-view removed — US-561 ships native v4 module.
    // mermaid-view removed — US-562 ships native v4 module.
    // graph-view removed — US-564 ships native v4 module.
    // draw-view removed — US-565 ships native v4 module.
    // link-view removed — US-555 ships native v4 module.
    // todo-view removed — US-556 ships native v4 module.
    // rest-client removed — US-563 ships native v4 module.
    // notebook-view removed — US-557 ships native v4 module.
    // All Tier-5 text content-views migrated. Set retained (empty) so the
    // mirror loop machinery stays in place for the no-host group (US-558+).
]);

for (const legacyDef of editorRegistry.getAll()) {
    const isTextContentView = TEXT_CONTENT_VIEW_BRIDGE_IDS.has(legacyDef.id);
    v4EditorRegistry.register({
        id: legacyDef.id,
        name: legacyDef.name,
        hasContentHost: legacyDef.editorType === "textFile",
        accepts: (input) => {
            // File-first match.
            if (input.fileName) {
                const p = legacyDef.acceptFile?.(input.fileName) ?? -1;
                if (p >= 0) return p;
            }
            // Language-based switch options.
            if (input.language) {
                const p = legacyDef.switchOption?.(input.language, input.fileName) ?? -1;
                if (p >= 0) return p;
            }
            return -1;
        },
        loadModule: async () => {
            if (isTextContentView) {
                // US-551 bare-adapter factory. createEditor returns an adapter
                // wrapping a placeholder TextFileModel; switchFrom replaces
                // the placeholder with the real extracted host.
                const { newTextFileModel } = await import("./text/TextEditorModel");
                return {
                    createEditor: () => {
                        const placeholder = newTextFileModel("");
                        return new LegacyEditorAdapter(placeholder, legacyDef.id);
                    },
                    // Component is never mounted — adapter-wrapped editors are
                    // routed through legacy <TextEditorView> by RenderEditor.
                    // This slot is required by the EditorModule type contract.
                    Component: AdapterPlaceholderComponent,
                };
            }
            throw new Error(
                `v4 createEditor not yet wired for legacy editor "${legacyDef.id}". ` +
                "PagesLifecycleModel still constructs via legacy factories during US-548; " +
                "per-editor migration (US-552+) populates this slot.",
            );
        },
    });
}

// Stub component referenced by bare-adapter loadModule factories. Never mounted
// by RenderEditor (adapter-wrapped editors take the LegacyEditorAdapter branch).
function AdapterPlaceholderComponent(): null {
    return null;
}

// US-551 — replace the legacy "monaco" mirror with the real native v4 module.
// register() overwrites by id, so this entry supersedes the bare-adapter stub
// the mirror loop above wrote.
v4EditorRegistry.register({
    id: "monaco",
    name: "Text Editor",
    hasContentHost: true,
    // Explicit accepts (NOT makeAccepts): monaco is the universal text fallback
    // and the page-switch floor — walkthrough 20 §accepts. Its number outranks
    // content editors so it leads `findEditorsAccepting`; specific viewers
    // outrank it in view mode. `match` carries the separate file-resolution
    // floor (0) + switch-first (0) priorities for the registry's resolve /
    // getSwitchOptions / validateForLanguage.
    accepts: (input) => {
        if (input.mode === "view") return 10;
        return 50;
    },
    match: EDITOR_MATCHERS["monaco"],
    loadModule: async () => {
        const { monacoModule } = await import("./monaco");
        return monacoModule;
    },
});

// US-552 — native v4 grid modules. US-581: matching rules are self-contained
// in `EDITOR_MATCHERS` (no legacy-registry delegation).
v4EditorRegistry.register({
    id: "grid-json",
    name: "Grid (JSON)",
    hasContentHost: true,
    accepts: makeAccepts(EDITOR_MATCHERS["grid-json"]),
    match: EDITOR_MATCHERS["grid-json"],
    loadModule: async () => {
        const { gridJsonModule } = await import("./grid");
        return gridJsonModule;
    },
});

v4EditorRegistry.register({
    id: "grid-csv",
    name: "Grid (CSV)",
    hasContentHost: true,
    accepts: makeAccepts(EDITOR_MATCHERS["grid-csv"]),
    match: EDITOR_MATCHERS["grid-csv"],
    loadModule: async () => {
        const { gridCsvModule } = await import("./grid");
        return gridCsvModule;
    },
});

v4EditorRegistry.register({
    id: "grid-jsonl",
    name: "Grid (JSONL)",
    hasContentHost: true,
    accepts: makeAccepts(EDITOR_MATCHERS["grid-jsonl"]),
    match: EDITOR_MATCHERS["grid-jsonl"],
    loadModule: async () => {
        const { gridJsonlModule } = await import("./grid");
        return gridJsonlModule;
    },
});

// US-553 — replace the legacy bare-adapter mirror for log-view with a native v4
// module. `v4EditorRegistry.register` overwrites by id, so this supersedes the
// bare-adapter stub the mirror loop wrote. `accepts` delegates to the legacy
// registry def's `acceptFile` / `switchOption` / `isEditorContent` to avoid
// duplicating extension/language/content-peek rules.
v4EditorRegistry.register({
    id: "log-view",
    name: "Log View",
    hasContentHost: true,
    accepts: makeAccepts(EDITOR_MATCHERS["log-view"]),
    match: EDITOR_MATCHERS["log-view"],
    loadModule: async () => {
        const { logViewModule } = await import("./log-view");
        return logViewModule;
    },
});

// US-554 — replace the legacy bare-adapter mirror for md-view with a native v4
// module. `v4EditorRegistry.register` overwrites by id, so this supersedes the
// bare-adapter stub the mirror loop wrote. `accepts` delegates to the legacy
// registry def's `switchOption` to avoid duplicating language rules.
v4EditorRegistry.register({
    id: "md-view",
    name: "Preview",
    hasContentHost: true,
    accepts: makeAccepts(EDITOR_MATCHERS["md-view"]),
    match: EDITOR_MATCHERS["md-view"],
    loadModule: async () => {
        const { markdownModule } = await import("./markdown");
        return markdownModule;
    },
});

// US-560 — replace the legacy bare-adapter mirror for svg-view with a native v4
// module. `v4EditorRegistry.register` overwrites by id, so this supersedes the
// bare-adapter stub the mirror loop wrote. `accepts` delegates to the legacy
// registry def's `acceptFile` / `switchOption` to avoid duplicating extension
// rules.
v4EditorRegistry.register({
    id: "svg-view",
    name: "Preview",
    hasContentHost: true,
    accepts: makeAccepts(EDITOR_MATCHERS["svg-view"]),
    match: EDITOR_MATCHERS["svg-view"],
    loadModule: async () => {
        const { svgModule } = await import("./svg");
        return svgModule;
    },
});

// US-561 — replace the legacy bare-adapter mirror for html-view with a native
// v4 module. `v4EditorRegistry.register` overwrites by id, so this supersedes
// the bare-adapter stub the mirror loop wrote. `accepts` delegates to the
// legacy registry def's `acceptFile` / `switchOption` to avoid duplicating
// language rules.
v4EditorRegistry.register({
    id: "html-view",
    name: "Preview",
    hasContentHost: true,
    accepts: makeAccepts(EDITOR_MATCHERS["html-view"]),
    match: EDITOR_MATCHERS["html-view"],
    loadModule: async () => {
        const { htmlModule } = await import("./html");
        return htmlModule;
    },
});

// US-562 — replace the legacy bare-adapter mirror for mermaid-view with a
// native v4 module. `v4EditorRegistry.register` overwrites by id, so this
// supersedes the bare-adapter stub the mirror loop wrote. `accepts` delegates
// to the legacy registry def's `acceptFile` / `switchOption` to avoid
// duplicating extension/language rules.
v4EditorRegistry.register({
    id: "mermaid-view",
    name: "Mermaid",
    hasContentHost: true,
    accepts: makeAccepts(EDITOR_MATCHERS["mermaid-view"]),
    match: EDITOR_MATCHERS["mermaid-view"],
    loadModule: async () => {
        const { mermaidModule } = await import("./mermaid");
        return mermaidModule;
    },
});

// US-564 — replace the legacy bare-adapter mirror for graph-view with a
// native v4 module. `v4EditorRegistry.register` overwrites by id, so this
// supersedes the bare-adapter stub the mirror loop wrote. `accepts` delegates
// to the legacy registry def's `acceptFile` / `switchOption` to avoid
// duplicating extension/language rules.
v4EditorRegistry.register({
    id: "graph-view",
    name: "Graph",
    hasContentHost: true,
    accepts: makeAccepts(EDITOR_MATCHERS["graph-view"]),
    match: EDITOR_MATCHERS["graph-view"],
    loadModule: async () => {
        const { graphModule } = await import("./graph");
        return graphModule;
    },
});

// US-565 — replace the legacy bare-adapter mirror for draw-view with a
// native v4 module. `v4EditorRegistry.register` overwrites by id, so this
// supersedes the bare-adapter stub the mirror loop wrote. `accepts` delegates
// to the legacy registry def's `acceptFile` / `switchOption` to avoid
// duplicating extension/language rules.
v4EditorRegistry.register({
    id: "draw-view",
    name: "Drawing",
    hasContentHost: true,
    accepts: makeAccepts(EDITOR_MATCHERS["draw-view"]),
    match: EDITOR_MATCHERS["draw-view"],
    loadModule: async () => {
        const { drawModule } = await import("./draw");
        return drawModule;
    },
});

// US-555 — replace the legacy bare-adapter mirror for link-view with a
// native v4 module. `v4EditorRegistry.register` overwrites by id, so this
// supersedes the bare-adapter stub the mirror loop wrote. `accepts` delegates
// to the legacy registry def's `acceptFile` / `switchOption` / `isEditorContent`
// to avoid duplicating extension/language/content-peek rules.
v4EditorRegistry.register({
    id: "link-view",
    name: "Links",
    hasContentHost: true,
    accepts: makeAccepts(EDITOR_MATCHERS["link-view"]),
    match: EDITOR_MATCHERS["link-view"],
    loadModule: async () => {
        const { linkModule } = await import("./link-editor");
        return linkModule;
    },
});

// US-556 — replace the legacy bare-adapter mirror for todo-view with a
// native v4 module. `v4EditorRegistry.register` overwrites by id, so this
// supersedes the bare-adapter stub the mirror loop wrote. `accepts` delegates
// to the legacy registry def's `acceptFile` / `switchOption` / `isEditorContent`
// to avoid duplicating extension/language/content-peek rules.
v4EditorRegistry.register({
    id: "todo-view",
    name: "ToDo",
    hasContentHost: true,
    accepts: makeAccepts(EDITOR_MATCHERS["todo-view"]),
    match: EDITOR_MATCHERS["todo-view"],
    loadModule: async () => {
        const { todoModule } = await import("./todo");
        return todoModule;
    },
});

// US-563 — replace the legacy bare-adapter mirror for rest-client with a
// native v4 module. `v4EditorRegistry.register` overwrites by id, so this
// supersedes the bare-adapter stub the mirror loop wrote. `accepts` delegates
// to the legacy registry def's `acceptFile` / `switchOption` / `isEditorContent`
// to avoid duplicating extension/language/content-peek rules.
v4EditorRegistry.register({
    id: "rest-client",
    name: "Rest Client",
    hasContentHost: true,
    accepts: makeAccepts(EDITOR_MATCHERS["rest-client"]),
    match: EDITOR_MATCHERS["rest-client"],
    loadModule: async () => {
        const { restClientModule } = await import("./rest-client");
        return restClientModule;
    },
});

// US-557 — replace the legacy bare-adapter mirror for notebook-view with a
// native v4 module. `v4EditorRegistry.register` overwrites by id, so this
// supersedes the bare-adapter stub the mirror loop wrote. `accepts` delegates
// to the legacy registry def's `acceptFile` / `switchOption` / `isEditorContent`
// to avoid duplicating extension/language/content-peek rules.
v4EditorRegistry.register({
    id: "notebook-view",
    name: "Notebook",
    hasContentHost: true,
    accepts: makeAccepts(EDITOR_MATCHERS["notebook-view"]),
    match: EDITOR_MATCHERS["notebook-view"],
    loadModule: async () => {
        const { notebookModule } = await import("./notebook");
        return notebookModule;
    },
});

// US-558 — replace the legacy bare-adapter mirror for browser-view with a
// native v4 module. Browser is NO-HOST (no `CONTENT_HOST_TRAIT`); the
// `accepts` predicate returns -1 (never matches files — opens only via the
// explicit `pagesModel.lifecycle.showBrowserPage` user gesture).
v4EditorRegistry.register({
    id: "browser-view",
    name: "Browser",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { browserModule } = await import("./browser");
        return browserModule;
    },
});

// US-568 — replace the legacy bare-adapter mirror for pdf-view with a
// native v4 module. PDF is NO-HOST (no `CONTENT_HOST_TRAIT`); the
// `accepts` predicate delegates to the legacy registry's `acceptFile`
// (returns 100 for `.pdf` files) for forward-compatibility with a v4
// file-open flow under US-559. `hasContentHost: false` keeps PDF out of
// the switch widget. Today's `PagesLifecycleModel.openFile` still uses
// the LEGACY registry's `resolve` + `module.newEditorModel(filePath)`
// path; `wrapLegacyForPage`'s `instanceof V4EditorModel` early-return
// (PD-IMPL16) ensures the returned v4 PdfEditor reaches `editors[]`
// unwrapped.
v4EditorRegistry.register({
    id: "pdf-view",
    name: "PDF Viewer",
    hasContentHost: false,
    accepts: makeAccepts(EDITOR_MATCHERS["pdf-view"]),
    match: EDITOR_MATCHERS["pdf-view"],
    loadModule: async () => {
        const { pdfModule } = await import("./pdf");
        return pdfModule;
    },
});

// US-569 — replace the legacy bare-adapter mirror for image-view with a
// native v4 module. Image is NO-HOST (no `CONTENT_HOST_TRAIT`); the
// `accepts` predicate delegates to the legacy registry's `acceptFile`
// (returns 100 for image extensions) for forward-compatibility with a
// v4 file-open flow under US-559. `hasContentHost: false` keeps Image
// out of the switch widget. Today's `PagesLifecycleModel.openFile` still
// uses the LEGACY registry's `resolve` + `module.newEditorModel(filePath)`
// path; `wrapLegacyForPage`'s `instanceof V4EditorModel` early-return
// (US-568 PD-IMPL16) ensures the returned v4 ImageEditor reaches
// `editors[]` unwrapped.
v4EditorRegistry.register({
    id: "image-view",
    name: "Image Viewer",
    hasContentHost: false,
    accepts: makeAccepts(EDITOR_MATCHERS["image-view"]),
    match: EDITOR_MATCHERS["image-view"],
    loadModule: async () => {
        const { imageModule } = await import("./image");
        return imageModule;
    },
});

// US-570 — replace the legacy bare-adapter mirror for archive-view with a
// native v4 module. Archive is NO-HOST (no `CONTENT_HOST_TRAIT`) AND
// sidebar-owning (contributes the `"archive-tree"` panel). The `accepts`
// predicate delegates to the legacy registry's `acceptFile` (returns 100 for
// archive extensions). `hasContentHost: false` keeps Archive out of the switch
// widget. Today's `_openZipArchive` / `openFile` still construct via the LEGACY
// registry's `module.newEditorModel` (which now returns a v4 ArchiveEditor cast
// as legacy via `ArchiveEditorView`'s preserved module); `wrapLegacyForPage`'s
// `instanceof V4EditorModel` early-return (US-568 PD-IMPL16) skips the adapter
// wrap. The `archive-tree` secondary-editor registration is unchanged.
v4EditorRegistry.register({
    id: "archive-view",
    name: "Archive",
    hasContentHost: false,
    accepts: makeAccepts(EDITOR_MATCHERS["archive-view"]),
    match: EDITOR_MATCHERS["archive-view"],
    loadModule: async () => {
        const { archiveModule } = await import("./archive");
        return archiveModule;
    },
});

// US-571 — replace the legacy bare-adapter mirror for video-view with a
// native v4 module. Video is NO-HOST (no `CONTENT_HOST_TRAIT`). The `accepts`
// predicate delegates to the legacy registry's `acceptFile` (returns 100 for
// video/audio extensions). `hasContentHost: false` keeps Video out of the
// switch widget. Today's `showVideoPlayerPage` / `openFile` still construct via
// the LEGACY registry's `module.newEditorModel` (which now returns a v4
// VideoEditor cast as legacy via `VideoView`'s preserved module);
// `wrapLegacyForPage`'s `instanceof V4EditorModel` early-return (US-568
// PD-IMPL16) skips the adapter wrap.
v4EditorRegistry.register({
    id: "video-view",
    name: "Video Player",
    hasContentHost: false,
    accepts: makeAccepts(EDITOR_MATCHERS["video-view"]),
    match: EDITOR_MATCHERS["video-view"],
    loadModule: async () => {
        const { videoModule } = await import("./video");
        return videoModule;
    },
});

// US-572 — replace the legacy bare-adapter mirror for settings-view with a
// native v4 module. Settings is NO-HOST (no `CONTENT_HOST_TRAIT`) AND
// standalone (no file acceptance) — `accepts` always returns -1 (Settings is
// opened only via the `showSettingsPage` menu action, never via `openFile`).
// `hasContentHost: false` keeps Settings out of the switch widget. The
// `showSettingsPage` launcher constructs via the LEGACY registry's
// `module.newEmptyEditorModel` (which now returns a v4 SettingsEditor cast as
// legacy via `SettingsView`'s preserved module); `wrapLegacyForPage`'s
// `instanceof V4EditorModel` early-return (US-568 PD-IMPL16) skips the adapter
// wrap.
v4EditorRegistry.register({
    id: "settings-view",
    name: "Settings",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { settingsModule } = await import("./settings");
        return settingsModule;
    },
});

// US-573 — replace the legacy bare-adapter mirror for about-view with a native
// v4 module. About is NO-HOST (no `CONTENT_HOST_TRAIT`) AND standalone (no file
// acceptance) — `accepts` always returns -1 (opened only via the
// `showAboutPage` menu action, never via `openFile`). `hasContentHost: false`
// keeps About out of the switch widget. The `showAboutPage` launcher
// constructs via the LEGACY registry's `module.newEmptyEditorModel` (which now
// returns a v4 AboutEditor cast as legacy via `AboutView`'s preserved module);
// `wrapLegacyForPage`'s `instanceof V4EditorModel` early-return (US-568
// PD-IMPL16) skips the adapter wrap.
v4EditorRegistry.register({
    id: "about-view",
    name: "About",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { aboutModule } = await import("./about");
        return aboutModule;
    },
});

// US-574 — replace the legacy bare-adapter mirror for mcp-view with a native v4
// module. MCP Inspector is NO-HOST (no `CONTENT_HOST_TRAIT`) AND standalone (no
// file acceptance) — `accepts` always returns -1 (opened only via the
// `showMcpInspectorPage` launcher, never via `openFile`; not a singleton — each
// call creates a fresh page). `hasContentHost: false` keeps it out of the switch
// widget. The `showMcpInspectorPage` launcher constructs via the LEGACY
// registry's `module.newEmptyEditorModel` (which now returns a v4
// McpInspectorEditorModel cast as legacy via `McpInspectorView`'s preserved
// module); `wrapLegacyForPage`'s `instanceof V4EditorModel` early-return (US-568
// PD-IMPL16) skips the adapter wrap.
v4EditorRegistry.register({
    id: "mcp-view",
    name: "MCP Inspector",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { mcpModule } = await import("./mcp-inspector");
        return mcpModule;
    },
});

// US-575 — replace the legacy bare-adapter mirror for storybook-view with a
// native v4 module. Storybook is NO-HOST (no CONTENT_HOST_TRAIT) AND standalone
// (no file acceptance) — `accepts` always returns -1 (opened only via
// showStorybookPage, never via openFile). `hasContentHost: false` keeps it out
// of the switch widget. The `showStorybookPage` launcher constructs via the
// LEGACY registry's `module.newEmptyEditorModel` (now a v4 StorybookEditorModel
// cast as legacy via `StorybookEditorView`'s preserved module);
// `wrapLegacyForPage`'s `instanceof V4EditorModel` early-return (US-568 PD-IMPL16)
// skips the adapter wrap.
v4EditorRegistry.register({
    id: "storybook-view",
    name: "Storybook",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { storybookModule } = await import("./storybook");
        return storybookModule;
    },
});

// EPIC-028 / US-576 — replace the legacy bare-adapter mirror for category-view
// with a native v4 module. Category is NO-HOST (no `CONTENT_HOST_TRAIT`) and a
// tree-provider CONSUMER (reads a sibling host's provider from
// `page.panelEditors`). `hasContentHost: false` keeps it out of the switch
// widget. Opened via `tree-category://` links (target="category-view"); the
// legacy registry's `module.newEditorModel(filePath)` decodes the link and
// returns a v4 CategoryEditorModel cast as legacy. `wrapLegacyForPage`'s
// `instanceof V4EditorModel` early-return (US-568 PD-IMPL16) skips the adapter.
// Last no-host editor — closes the walkthrough-30 group.
v4EditorRegistry.register({
    id: "category-view",
    name: "Folder View",
    hasContentHost: false,
    accepts: makeAccepts(EDITOR_MATCHERS["category-view"]),
    match: EDITOR_MATCHERS["category-view"],
    loadModule: async () => {
        const { categoryModule } = await import("./category");
        return categoryModule;
    },
});
