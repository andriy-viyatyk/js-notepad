import { editorRegistry } from "./registry";
import { EditorModule } from "./types";

// Text editor module wrapper (synchronous import since it's the default)
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

// Register monaco (default text editor)
editorRegistry.register({
    id: "monaco",
    name: "Text Editor",
    pageType: "textFile",
    category: "content-view",
    extensions: ["*"],
    languageIds: ["*"],
    priority: 0, // Lowest - fallback for all text files
    alternativeEditors: ["grid-json", "grid-csv", "md-view", "svg-view"],
    loadModule: async () => textEditorModule,
});

// Register grid-json editor
editorRegistry.register({
    id: "grid-json",
    name: "Grid",
    pageType: "textFile",
    category: "content-view",
    filenamePatterns: [/\.grid\.json$/i],
    languageIds: ["json"],
    priority: 10,
    alternativeEditors: ["monaco"],
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

// Register grid-csv editor
editorRegistry.register({
    id: "grid-csv",
    name: "Grid",
    pageType: "textFile",
    category: "content-view",
    filenamePatterns: [/\.grid\.csv$/i],
    languageIds: ["csv"],
    priority: 10,
    alternativeEditors: ["monaco"],
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

// Register markdown view
editorRegistry.register({
    id: "md-view",
    name: "Preview",
    pageType: "textFile",
    category: "content-view",
    languageIds: ["markdown"],
    priority: 5,
    alternativeEditors: ["monaco"],
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

// Register PDF viewer (standalone page editor)
editorRegistry.register({
    id: "pdf-view",
    name: "PDF Viewer",
    pageType: "pdfFile",
    category: "page-editor",
    extensions: [".pdf"],
    priority: 100, // Highest - exclusive for PDF files
    loadModule: async () => {
        const module = await import("./pdf/PdfViewer");
        return module.default;
    },
});

// Register Image viewer (standalone page editor for binary images)
editorRegistry.register({
    id: "image-view",
    name: "Image Viewer",
    pageType: "imageFile",
    category: "page-editor",
    extensions: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico"], // No .svg - handled as text
    priority: 100, // Highest - exclusive for binary image files
    loadModule: async () => {
        const module = await import("./image/ImageViewer");
        return module.default;
    },
});

// Register SVG view (content-view for SVG files - preview mode)
editorRegistry.register({
    id: "svg-view",
    name: "Preview",
    pageType: "textFile",
    category: "content-view",
    extensions: [".svg"],
    priority: -1, // Lower than Monaco (0) so Monaco opens by default
    alternativeEditors: ["monaco"],
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
