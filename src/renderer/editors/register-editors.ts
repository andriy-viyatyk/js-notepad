import { createElement } from "react";
import { editorRegistry } from "./base/editorRegistry";
import { EDITOR_MATCHERS, makeAccepts } from "./base/editor-matchers";
import { secondaryViewRegistry } from "../ui/secondary-views/secondary-view-registry";
import { SearchIcon, BoardColorIcon } from "../theme/icons";

// =============================================================================
// Secondary Editor Registrations (EPIC-016)
// =============================================================================

secondaryViewRegistry.register({
    id: "archive-tree",
    label: "Archive",
    loadComponent: () => import("./archive/ArchiveSecondaryView"),
});

secondaryViewRegistry.register({
    id: "explorer",
    label: "Explorer",
    loadComponent: () => import("./explorer/ExplorerSecondaryView"),
});

secondaryViewRegistry.register({
    id: "search",
    label: "Search",
    // Sidebar-only sub-panel of Explorer — give it the search glyph (the one on
    // the Explorer header's "open search" button) instead of Explorer's folder icon.
    icon: createElement(SearchIcon),
    loadComponent: () => import("./explorer/SearchSecondaryView"),
});

secondaryViewRegistry.register({
    id: "boards",
    label: "Boards",
    // Sidebar-only sub-panel of Explorer (EPIC-036 / US-761) — its own boards glyph,
    // mirroring how "search" overrides to SearchIcon. Lists trusted boards under the
    // Explorer root via the shared BoardsTree. Uses the colored variant so the panel
    // header reads as an accent.
    icon: createElement(BoardColorIcon),
    loadComponent: () => import("./explorer/BoardsSecondaryView"),
});

secondaryViewRegistry.register({
    id: "link-category",
    label: "Categories",
    loadComponent: () => import("./link-editor/panels/LinkCategorySecondaryView"),
});

secondaryViewRegistry.register({
    id: "link-tags",
    label: "Tags",
    loadComponent: () => import("./link-editor/panels/LinkTagsSecondaryView"),
});

secondaryViewRegistry.register({
    id: "link-hostnames",
    label: "Hostnames",
    loadComponent: () => import("./link-editor/panels/LinkHostnamesSecondaryView"),
});

secondaryViewRegistry.register({
    id: "notebook-categories",
    label: "Categories",
    loadComponent: () => import("./notebook/panels/NotebookCategoriesSecondaryView"),
});

secondaryViewRegistry.register({
    id: "notebook-tags",
    label: "Tags",
    loadComponent: () => import("./notebook/panels/NotebookTagsSecondaryView"),
});

secondaryViewRegistry.register({
    id: "todo-panel",
    label: "Todo",
    loadComponent: () => import("./todo/panels/TodoSecondaryView"),
});

secondaryViewRegistry.register({
    id: "rest-panel",
    label: "Rest",
    loadComponent: () => import("./rest-client/panels/RestPanelSecondaryView"),
});

secondaryViewRegistry.register({
    id: "git-changes",
    label: "Git",
    loadComponent: () => import("./git-tree/GitPanelSecondaryView"),
});

secondaryViewRegistry.register({
    id: "git-diff-revisions",
    label: "File History",
    loadComponent: () => import("./file-diff/GitDiffRevisionsSecondaryView"),
});

secondaryViewRegistry.register({
    id: "mneme-tree",
    label: "Wiki",
    // No icon override → falls back to the editor's MemoryIcon (EPIC-032 / US-663).
    loadComponent: () => import("./mneme-root/MnemeTreeSecondaryView"),
});

editorRegistry.register({
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

editorRegistry.register({
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

editorRegistry.register({
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

editorRegistry.register({
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

editorRegistry.register({
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

editorRegistry.register({
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

editorRegistry.register({
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

editorRegistry.register({
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

editorRegistry.register({
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

editorRegistry.register({
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

editorRegistry.register({
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

editorRegistry.register({
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

editorRegistry.register({
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

editorRegistry.register({
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

editorRegistry.register({
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

editorRegistry.register({
    id: "browser-view",
    name: "Browser",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { browserModule } = await import("./browser");
        return browserModule;
    },
});

editorRegistry.register({
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

editorRegistry.register({
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

editorRegistry.register({
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

editorRegistry.register({
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

editorRegistry.register({
    id: "settings-view",
    name: "Settings",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { settingsModule } = await import("./settings");
        return settingsModule;
    },
});

editorRegistry.register({
    id: "about-view",
    name: "About",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { aboutModule } = await import("./about");
        return aboutModule;
    },
});

editorRegistry.register({
    id: "mcp-view",
    name: "MCP Inspector",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { mcpModule } = await import("./mcp-inspector");
        return mcpModule;
    },
});

editorRegistry.register({
    id: "mneme-config",
    name: "Mneme",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { mnemeConfigModule } = await import("./mneme-config");
        return mnemeConfigModule;
    },
});

editorRegistry.register({
    id: "storybook-view",
    name: "Storybook",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { storybookModule } = await import("./storybook");
        return storybookModule;
    },
});

editorRegistry.register({
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

editorRegistry.register({
    id: "git-tree",
    name: "Git Tree",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { gitTreeModule } = await import("./git-tree");
        return gitTreeModule;
    },
});

editorRegistry.register({
    id: "mneme-root",
    name: "Mneme",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { mnemeRootModule } = await import("./mneme-root");
        return mnemeRootModule;
    },
});

editorRegistry.register({
    id: "board-view",
    name: "Boards",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { boardModule } = await import("./board");
        return boardModule;
    },
});

editorRegistry.register({
    id: "toolset-view",
    name: "Agent Tool",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { toolsetModule } = await import("./toolset");
        return toolsetModule;
    },
});

editorRegistry.register({
    id: "file-diff",
    name: "Git Diff",
    hasContentHost: true,
    // Host-aware (EPIC-030 / US-613): offered for any file detected in a git
    // repo, regardless of changes (Concern 2A). No host (file-open resolution)
    // → -1, so it never becomes a default open target. Below monaco (50) so
    // editing stays the primary editor.
    accepts: (input) =>
        (input.host?.state.get() as { gitRepo?: unknown } | undefined)?.gitRepo ? 25 : -1,
    loadModule: async () => {
        const { fileDiffModule } = await import("./file-diff");
        return fileDiffModule;
    },
});
