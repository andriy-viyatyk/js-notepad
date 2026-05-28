import { editorRegistry as v4EditorRegistry } from "./base/editorRegistry";
import { EDITOR_MATCHERS, makeAccepts } from "./base/editor-matchers";
import { secondaryEditorRegistry } from "../ui/navigation/secondary-editor-registry";

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
