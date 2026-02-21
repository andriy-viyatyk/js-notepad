import { editorRegistry } from "./registry";
import { EditorModule } from "./types";

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
        return require("./text/TextPageView").TextPageView;
    },
    newPageModel: async (filePath?: string) => {
        const { newTextFileModel } = await import("./text/TextPageModel");
        return newTextFileModel(filePath);
    },
    newEmptyPageModel: async (pageType) => {
        if (pageType !== "textFile") return null;
        const { newTextFileModel } = await import("./text/TextPageModel");
        return newTextFileModel();
    },
    newPageModelFromState: async (state) => {
        const { newTextFileModelFromState } = await import("./text/TextPageModel");
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
    pageType: "textFile",
    category: "content-view",
    acceptFile: () => 0, // Lowest priority - fallback for all files
    validForLanguage: () => true, // Valid for all languages
    switchOption: () => 0, // Always available as first option
    loadModule: async () => textEditorModule,
});

// Grid JSON editor
editorRegistry.register({
    id: "grid-json",
    name: "Grid",
    pageType: "textFile",
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
        const module = await import("./grid/GridEditor");
        return {
            Editor: module.GridEditor,
            newPageModel: textEditorModule.newPageModel,
            newEmptyPageModel: textEditorModule.newEmptyPageModel,
            newPageModelFromState: textEditorModule.newPageModelFromState,
        };
    },
});

// Grid CSV editor
editorRegistry.register({
    id: "grid-csv",
    name: "Grid",
    pageType: "textFile",
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
        const module = await import("./grid/GridEditor");
        return {
            Editor: module.GridEditor,
            newPageModel: textEditorModule.newPageModel,
            newEmptyPageModel: textEditorModule.newEmptyPageModel,
            newPageModelFromState: textEditorModule.newPageModelFromState,
        };
    },
});

// Markdown preview
editorRegistry.register({
    id: "md-view",
    name: "Preview",
    pageType: "textFile",
    category: "content-view",
    validForLanguage: (languageId) => languageId === "markdown",
    switchOption: (languageId) => {
        if (languageId !== "markdown") return -1;
        return 10;
    },
    loadModule: async () => {
        const module = await import("./markdown/MarkdownView");
        return {
            Editor: module.MarkdownView,
            newPageModel: textEditorModule.newPageModel,
            newEmptyPageModel: textEditorModule.newEmptyPageModel,
            newPageModelFromState: textEditorModule.newPageModelFromState,
        };
    },
});

// PDF viewer (standalone page editor)
editorRegistry.register({
    id: "pdf-view",
    name: "PDF Viewer",
    pageType: "pdfFile",
    category: "page-editor",
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
    pageType: "imageFile",
    category: "page-editor",
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
    pageType: "textFile",
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
    loadModule: async () => {
        const module = await import("./notebook/NotebookEditor");
        return {
            Editor: module.NotebookEditor,
            newPageModel: textEditorModule.newPageModel,
            newEmptyPageModel: textEditorModule.newEmptyPageModel,
            newPageModelFromState: textEditorModule.newPageModelFromState,
        };
    },
});

// SVG preview (content-view for SVG files)
editorRegistry.register({
    id: "svg-view",
    name: "Preview",
    pageType: "textFile",
    category: "content-view",
    validForLanguage: (languageId) => languageId === "xml",
    switchOption: (_languageId, fileName) => {
        // Only show for .svg files
        if (fileName && matchesExtension(fileName, [".svg"])) return 10;
        return -1;
    },
    loadModule: async () => {
        const module = await import("./svg/SvgView");
        return {
            Editor: module.SvgView,
            newPageModel: textEditorModule.newPageModel,
            newEmptyPageModel: textEditorModule.newEmptyPageModel,
            newPageModelFromState: textEditorModule.newPageModelFromState,
        };
    },
});

// HTML preview (content-view for HTML files)
editorRegistry.register({
    id: "html-view",
    name: "Preview",
    pageType: "textFile",
    category: "content-view",
    validForLanguage: (languageId) => languageId === "html",
    switchOption: (languageId) => {
        if (languageId !== "html") return -1;
        return 10;
    },
    loadModule: async () => {
        const module = await import("./html/HtmlView");
        return {
            Editor: module.HtmlView,
            newPageModel: textEditorModule.newPageModel,
            newEmptyPageModel: textEditorModule.newEmptyPageModel,
            newPageModelFromState: textEditorModule.newPageModelFromState,
        };
    },
});

// Mermaid diagram preview (content-view for .mmd files)
editorRegistry.register({
    id: "mermaid-view",
    name: "Mermaid",
    pageType: "textFile",
    category: "content-view",
    validForLanguage: (languageId) => languageId === "mermaid",
    switchOption: (languageId) => {
        if (languageId !== "mermaid") return -1;
        return 10;
    },
    loadModule: async () => {
        const module = await import("./mermaid/MermaidView");
        return {
            Editor: module.MermaidView,
            newPageModel: textEditorModule.newPageModel,
            newEmptyPageModel: textEditorModule.newEmptyPageModel,
            newPageModelFromState: textEditorModule.newPageModelFromState,
        };
    },
});

// Todo editor (content-view for .todo.json files)
editorRegistry.register({
    id: "todo-view",
    name: "ToDo",
    pageType: "textFile",
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
    loadModule: async () => {
        const module = await import("./todo/TodoEditor");
        return {
            Editor: module.TodoEditor,
            newPageModel: textEditorModule.newPageModel,
            newEmptyPageModel: textEditorModule.newEmptyPageModel,
            newPageModelFromState: textEditorModule.newPageModelFromState,
        };
    },
});

// Browser (standalone page editor - no file acceptance)
editorRegistry.register({
    id: "browser-view",
    name: "Browser",
    pageType: "browserPage",
    category: "page-editor",
    loadModule: async () => {
        const module = await import("./browser/BrowserPageView");
        return module.default;
    },
});

// About page (standalone page editor - no file acceptance)
editorRegistry.register({
    id: "about-view",
    name: "About",
    pageType: "aboutPage",
    category: "page-editor",
    loadModule: async () => {
        const module = await import("./about/AboutPage");
        return module.default;
    },
});

// Settings page (standalone page editor - no file acceptance)
editorRegistry.register({
    id: "settings-view",
    name: "Settings",
    pageType: "settingsPage",
    category: "page-editor",
    loadModule: async () => {
        const module = await import("./settings/SettingsPage");
        return module.default;
    },
});
