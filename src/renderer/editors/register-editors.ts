import { editorRegistry } from "./base/editorRegistry";
import type { EditorDefinition, EditorModule } from "./base/editorRegistry";
import { EDITOR_MATCHERS, makeAccepts } from "./base/editor-matchers";
import { customEditorRegistry } from "./board/custom-editor-registry";
import { BOARD_SECONDARY_PREFIX } from "./board/board-secondary";
import { secondaryViewRegistry } from "../ui/secondary-views/secondary-view-registry";

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
    icon: "search",
    loadComponent: () => import("./explorer/SearchSecondaryView"),
});

secondaryViewRegistry.register({
    id: "boards",
    label: "Boards",
    // Sidebar-only sub-panel of Explorer (EPIC-036 / US-761) — its own boards glyph,
    // mirroring how "search" overrides to the search registry name. Lists trusted boards under the
    // Explorer root via the shared BoardsTree. Uses the colored variant so the panel
    // header reads as an accent.
    icon: "board-color",
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

// Board secondary views (EPIC-044 / US-853): one registration serves the whole
// `board-secondary:*` id family — a board declares zero-or-more views in its manifest
// (or via `persephone.setSecondaryViews`), each mapped to a `board-secondary:<viewId>`
// panel. BoardSecondaryView reads its `panelId` to render the matching view over the
// board's model. No icon override → falls back to the board's own glyph.
secondaryViewRegistry.registerPrefix(BOARD_SECONDARY_PREFIX, {
    id: BOARD_SECONDARY_PREFIX,
    label: "Board View", // never shown — BoardSecondaryView renders its own header from the decl
    loadComponent: () => import("./board/BoardSecondaryView"),
});

// =============================================================================
// Editor Registrations — table-driven
// =============================================================================
// One row per editor. Derived defaults keep the rows to the three things that
// actually differ (id, name, module importer):
//   - `match` comes from EDITOR_MATCHERS[id] (absent for pure standalone
//     editors that never match a file and never appear in the switch widget);
//   - `accepts` defaults to makeAccepts(match) when a matcher exists, else
//     `() => -1`; rows with special acceptance semantics override it.
// Each row's `load` MUST keep a literal `import("./…")` so Vite code splitting
// is preserved — never build the specifier dynamically.

interface EditorRow {
    id: string;
    name: string;
    hasContentHost?: boolean;
    mcpHint?: string;
    /** Explicit acceptance override (monaco, file-diff). */
    accepts?: EditorDefinition["accepts"];
    load: () => Promise<EditorModule>;
}

const EDITORS: EditorRow[] = [
    {
        id: "monaco",
        name: "Text Editor",
        hasContentHost: true,
        // Explicit accepts (NOT makeAccepts): monaco is the universal text fallback
        // and the page-switch floor — walkthrough 20 §accepts. Its number outranks
        // content editors so it leads `findEditorsAccepting`; specific viewers
        // outrank it in view mode. Its matcher carries the separate file-resolution
        // floor (0) + switch-first (0) priorities for the registry's resolve /
        // getSwitchOptions / validateForLanguage.
        accepts: (input) => {
            if (input.mode === "view") return 10;
            return 50;
        },
        load: async () => (await import("./monaco")).monacoModule,
    },
    { id: "grid-json", name: "Grid (JSON)", hasContentHost: true, load: async () => (await import("./grid")).gridJsonModule },
    { id: "grid-csv", name: "Grid (CSV)", hasContentHost: true, load: async () => (await import("./grid")).gridCsvModule },
    { id: "grid-jsonl", name: "Grid (JSONL)", hasContentHost: true, load: async () => (await import("./grid")).gridJsonlModule },
    { id: "log-view", name: "Log View", hasContentHost: true, mcpHint: 'Use ui_push to write entries to the MCP log page, or execute_script with: await app.pages.requireWellKnownPage("mcp-ui-log")', load: async () => (await import("./log-view")).logViewModule },
    { id: "md-view", name: "Preview", hasContentHost: true, load: async () => (await import("./markdown")).markdownModule },
    { id: "svg-view", name: "Preview", hasContentHost: true, load: async () => (await import("./svg")).svgModule },
    { id: "html-view", name: "Preview", hasContentHost: true, load: async () => (await import("./html")).htmlModule },
    { id: "mermaid-view", name: "Mermaid", hasContentHost: true, load: async () => (await import("./mermaid")).mermaidModule },
    { id: "graph-view", name: "Graph", hasContentHost: true, load: async () => (await import("./graph")).graphModule },
    { id: "draw-view", name: "Drawing", hasContentHost: true, load: async () => (await import("./draw")).drawModule },
    { id: "link-view", name: "Links", hasContentHost: true, load: async () => (await import("./link-editor")).linkModule },
    { id: "rest-client", name: "Rest Client", hasContentHost: true, load: async () => (await import("./rest-client")).restClientModule },
    { id: "notebook-view", name: "Notebook", hasContentHost: true, load: async () => (await import("./notebook")).notebookModule },
    { id: "env-vars-view", name: "Env Vars", hasContentHost: true, load: async () => (await import("./env-vars")).envVarsModule },
    { id: "browser-view", name: "Browser", mcpHint: "Use the open_url tool to open a URL in the built-in browser.", load: async () => (await import("./browser")).browserModule },
    { id: "image-view", name: "Image Viewer", mcpHint: 'Use execute_script with: await app.pages.openFile("/path/to/image.png")', load: async () => (await import("./image")).imageModule },
    { id: "archive-view", name: "Archive", mcpHint: 'Use execute_script with: await app.pages.openFile("/path/to/archive.zip")', load: async () => (await import("./archive")).archiveModule },
    { id: "video-view", name: "Video Player", mcpHint: 'Use execute_script with: await app.pages.openFile("/path/to/video.mp4")', load: async () => (await import("./video")).videoModule },
    { id: "settings-view", name: "Settings", mcpHint: "Use execute_script with: await app.pages.showSettingsPage()", load: async () => (await import("./settings")).settingsModule },
    { id: "about-view", name: "About", mcpHint: "Use execute_script with: await app.pages.showAboutPage()", load: async () => (await import("./about")).aboutModule },
    // Reached only via showToolsHubPage (the AppBar panel's "Open in new tab" button) —
    // never a file-open target.
    { id: "tools-hub-view", name: "Tools & Editors", load: async () => (await import("./tools-hub")).toolsHubModule },
    { id: "mcp-view", name: "MCP Inspector", mcpHint: 'Use execute_script with: await app.pages.showMcpInspectorPage() or await app.pages.showMcpInspectorPage({ url: "http://host:port/mcp" })', load: async () => (await import("./mcp-inspector")).mcpModule },
    { id: "mneme-config", name: "Mneme", load: async () => (await import("./mneme-config")).mnemeConfigModule },
    // Importer touched for the Storybook editor's .tsx -> .ts native-view conversion.
    { id: "storybook-view", name: "Storybook", load: async () => (await import("./storybook")).storybookModule },
    { id: "category-view", name: "Folder View", load: async () => (await import("./category")).categoryModule },
    { id: "git-tree", name: "Git Tree", load: async () => (await import("./git-tree")).gitTreeModule },
    { id: "mneme-root", name: "Mneme", load: async () => (await import("./mneme-root")).mnemeRootModule },
    { id: "board-view", name: "Boards", load: async () => (await import("./board")).boardModule },
    { id: "toolset-view", name: "Agent Tool", load: async () => (await import("./toolset")).toolsetModule },
    {
        id: "board-info",
        name: "Board Info",
        // Host-capable holder (EPIC-045): adopts/yields the shared content host WITHOUT rendering
        // it, so `Text ↔ + ↔ installed board` switches transfer the same host with no reload.
        hasContentHost: true,
        // Never a default open target — reached only via the "+" switch entry or explicit
        // navigation (hub / update toast / Properties button, US-867). No matcher → accepts -1.
        load: async () => (await import("./board-info")).boardInfoModule,
    },
    {
        id: "file-diff",
        name: "Git Diff",
        hasContentHost: true,
        // Host-aware (EPIC-030 / US-613): offered for any file detected in a git
        // repo, regardless of changes (Concern 2A). No host (file-open resolution)
        // → -1, so it never becomes a default open target. Below monaco (50) so
        // editing stays the primary editor.
        accepts: (input) =>
            (input.host?.state.get() as { gitRepo?: unknown } | undefined)?.gitRepo ? 25 : -1,
        load: async () => (await import("./file-diff")).fileDiffModule,
    },
];

for (const e of EDITORS) {
    const match = EDITOR_MATCHERS[e.id];
    editorRegistry.register({
        id: e.id,
        name: e.name,
        hasContentHost: e.hasContentHost ?? false,
        mcpHint: e.mcpHint,
        accepts: e.accepts ?? (match ? makeAccepts(match) : () => -1),
        match,
        loadModule: e.load,
    });
}

// Warm the custom-editor registry (EPIC-042) so file-open resolution sees trusted
// file-associated boards from the first open - `resolveEditorIdForFile` is sync but the
// registry loads manifests async. Safe pre-init: an unresolved registry yields no matches
// -> built-in fallback.
void customEditorRegistry.ensureInitialized();

// Warm the content-host editor modules so the synchronous construction path
// (`attachEditorToPage` under the sync public APIs `addEditorPage` / `openLinks` /
// `page.grouped`) can build any text-host editor from the registry's module cache.
// Fire-and-forget: the chunks load in the background right after registration.
editorRegistry.preloadContentHostModules();


