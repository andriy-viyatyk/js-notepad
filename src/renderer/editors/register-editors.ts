import { editorRegistry as v4EditorRegistry } from "./base/v4/editorRegistry";
import { EDITOR_MATCHERS, makeAccepts } from "./base/v4/editor-matchers";
import { secondaryEditorRegistry } from "../ui/navigation/secondary-editor-registry";

/**
 * Editor registrations for Persephone — v4-native only post-US-559.
 *
 * The legacy `editorRegistry` (file/extension/language matching + content
 * detection + view-model factories) was deleted along with `LegacyEditorAdapter`
 * and the content-view subsystem. Every editor surface (file resolution, switch
 * widget, content detection, MCP `create_page` guard, `app.editors` script API)
 * now reads from `v4EditorRegistry` (made self-sufficient by US-581).
 */

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
// EPIC-028 — v4 editor registrations (native modules)
// =============================================================================

// US-551 — native v4 Monaco module.
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

// US-553 — native v4 Log View module.
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

// US-554 — native v4 Markdown module.
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

// US-560 — native v4 SVG module.
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

// US-561 — native v4 HTML module.
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

// US-562 — native v4 Mermaid module.
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

// US-564 — native v4 Graph module.
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

// US-565 — native v4 Draw module.
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

// US-555 — native v4 Link module.
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

// US-556 — native v4 Todo module.
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

// US-563 — native v4 Rest Client module.
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

// US-557 — native v4 Notebook module.
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

// US-558 — native v4 Browser module. NO-HOST + standalone — opened only via
// the explicit `pagesModel.lifecycle.showBrowserPage` user gesture.
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

// US-568 — native v4 PDF module. NO-HOST.
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

// US-569 — native v4 Image module. NO-HOST.
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

// US-570 — native v4 Archive module. NO-HOST + sidebar-owning.
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

// US-571 — native v4 Video module. NO-HOST.
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

// US-572 — native v4 Settings module. NO-HOST + standalone (opened only via
// `showSettingsPage` menu action).
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

// US-573 — native v4 About module. NO-HOST + standalone (opened only via
// `showAboutPage` menu action).
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

// US-574 — native v4 MCP Inspector module. NO-HOST + standalone (opened only
// via the `showMcpInspectorPage` launcher; not a singleton — each call creates
// a fresh page).
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

// US-575 — native v4 Storybook module. NO-HOST + standalone (opened only via
// `showStorybookPage`).
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

// US-576 — native v4 Category module. NO-HOST + tree-provider CONSUMER
// (reads a sibling host's provider from `page.panelEditors`). Opened via
// `tree-category://` links (target="category-view"). Last no-host editor —
// closes the walkthrough-30 group.
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
