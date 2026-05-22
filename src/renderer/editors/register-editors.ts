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
    get Editor() {
        // Lazy access to avoid circular dependency
        return require("./text/TextEditorView").TextEditorView;
    },
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
        // Object.create preserves the lazy `get Editor()` getter on the prototype
        // (spread would call the getter eagerly, triggering require() too early)
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
        const module = await import("./pdf/PdfViewer");
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
        const module = await import("./image/ImageViewer");
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
        const [module, { createNotebookViewModel }] = await Promise.all([
            import("./notebook/NotebookEditor"),
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
        const [module, { createTodoViewModel }] = await Promise.all([
            import("./todo/TodoEditor"),
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
        const [module, { createRestClientViewModel }] = await Promise.all([
            import("./rest-client/RestClientEditor"),
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
        const [module, { createLinkViewModel }] = await Promise.all([
            import("./link-editor/LinkEditor"),
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
        const module = await import("./video/VideoPlayerEditor");
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
        const module = await import("./browser/BrowserEditorView");
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
        const module = await import("./about/AboutPage");
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
        const module = await import("./settings/SettingsPage");
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
import { LegacyEditorAdapter } from "./base/v4/LegacyEditorAdapter";

const TEXT_CONTENT_VIEW_BRIDGE_IDS = new Set([
    // grid-* removed — US-552 ships native v4 modules.
    // log-view removed — US-553 ships native v4 module.
    // md-view removed — US-554 ships native v4 module.
    // svg-view removed — US-560 ships native v4 module.
    // html-view removed — US-561 ships native v4 module.
    // mermaid-view removed — US-562 ships native v4 module.
    "notebook-view",
    "todo-view",
    "link-view",
    "rest-client",
    "graph-view",
    "draw-view",
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
    accepts: (input) => {
        // Universal text fallback — walkthrough 20 §accepts. Monaco's number is
        // the floor; specific viewers outrank it in view mode.
        if (input.mode === "view") return 10;
        return 50;
    },
    loadModule: async () => {
        const { monacoModule } = await import("./monaco");
        return monacoModule;
    },
});

// US-552 — replace the legacy bare-adapter mirrors for grid-json / grid-csv /
// grid-jsonl with native v4 modules. `v4EditorRegistry.register` overwrites
// by id, so these supersede the bare-adapter stubs the mirror loop wrote.
// `accepts` delegates to the legacy registry def's `acceptFile` / `switchOption`
// to avoid duplicating extension/language rules.
function makeGridAccepts(id: "grid-json" | "grid-csv" | "grid-jsonl") {
    return (input: { fileName?: string; language?: string }) => {
        const legacy = editorRegistry.getById(id);
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        if (input.language) {
            const p = legacy.switchOption?.(input.language, input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        return -1;
    };
}

v4EditorRegistry.register({
    id: "grid-json",
    name: "Grid (JSON)",
    hasContentHost: true,
    accepts: makeGridAccepts("grid-json"),
    loadModule: async () => {
        const { gridJsonModule } = await import("./grid");
        return gridJsonModule;
    },
});

v4EditorRegistry.register({
    id: "grid-csv",
    name: "Grid (CSV)",
    hasContentHost: true,
    accepts: makeGridAccepts("grid-csv"),
    loadModule: async () => {
        const { gridCsvModule } = await import("./grid");
        return gridCsvModule;
    },
});

v4EditorRegistry.register({
    id: "grid-jsonl",
    name: "Grid (JSONL)",
    hasContentHost: true,
    accepts: makeGridAccepts("grid-jsonl"),
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
    accepts: (input) => {
        const legacy = editorRegistry.getById("log-view");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        if (input.language) {
            const p = legacy.switchOption?.(input.language, input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        // Content-peek fallback (LV10) — for `.jsonl` files without the
        // `.log` prefix but with log-shaped content.
        if (input.language === "jsonl" && input.host) {
            const content = (input.host.state.get() as { content?: string }).content ?? "";
            if (legacy.isEditorContent?.(input.language, content)) return 60;
        }
        return -1;
    },
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
    accepts: (input) => {
        const legacy = editorRegistry.getById("md-view");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        if (input.language) {
            const p = legacy.switchOption?.(input.language, input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        return -1;
    },
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
    accepts: (input) => {
        const legacy = editorRegistry.getById("svg-view");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        if (input.language) {
            const p = legacy.switchOption?.(input.language, input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        return -1;
    },
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
    accepts: (input) => {
        const legacy = editorRegistry.getById("html-view");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        if (input.language) {
            const p = legacy.switchOption?.(input.language, input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        return -1;
    },
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
    accepts: (input) => {
        const legacy = editorRegistry.getById("mermaid-view");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        if (input.language) {
            const p = legacy.switchOption?.(input.language, input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        return -1;
    },
    loadModule: async () => {
        const { mermaidModule } = await import("./mermaid");
        return mermaidModule;
    },
});
