import React, { ReactNode } from "react";
import { pagesModel } from "../../api/pages";
import { BrowserProfile } from "../../api/settings";
import {
    DrawIcon, GraphIcon, GridIcon, IncognitoIcon, RestClientIcon, TorIcon,
    JavascriptIcon, LinkIcon, NotebookIcon, TodoIcon, TypescriptIcon,
} from "../../theme/language-icons";
import { GlobeIcon, McpIcon, PlayerIcon, StorybookIcon } from "../../theme/icons";
import { DEFAULT_BROWSER_COLOR } from "../../theme/palette-colors";

// =============================================================================
// Types
// =============================================================================

export interface CreatableItem {
    /** Unique stable ID for settings persistence. */
    id: string;
    /** Display label in menus and sidebar. */
    label: string;
    /** Icon element for menus and sidebar. */
    icon?: ReactNode;
    /** Create the page/tab. */
    create: () => void;
    /** Category for grouping in the sidebar list. */
    category: "editor" | "tool";
}

// =============================================================================
// Default pinned IDs
// =============================================================================

export const DEFAULT_PINNED_EDITORS = [
    "script-js", "script-ts", "draw-view", "grid-json", "grid-csv", "browser",
];

// =============================================================================
// Static items (always available)
// =============================================================================

const staticItems: CreatableItem[] = [
    {
        id: "script-js",
        label: "Script (JS)",
        icon: React.createElement(JavascriptIcon),
        create: () => pagesModel.addEditorPage("monaco", "javascript", "untitled.js"),
        category: "editor",
    },
    {
        id: "script-ts",
        label: "Script (TS)",
        icon: React.createElement(TypescriptIcon),
        create: () => pagesModel.addEditorPage("monaco", "typescript", "untitled.ts"),
        category: "editor",
    },
    {
        id: "draw-view",
        label: "Drawing",
        icon: React.createElement(DrawIcon),
        create: () => pagesModel.addEditorPage("draw-view", "json", "untitled.excalidraw"),
        category: "editor",
    },
    {
        id: "grid-json",
        label: "Grid (JSON)",
        icon: React.createElement(GridIcon),
        create: () => pagesModel.addEditorPage("grid-json", "json", "untitled.grid.json"),
        category: "editor",
    },
    {
        id: "grid-csv",
        label: "Grid (CSV)",
        icon: React.createElement(GridIcon),
        create: () => pagesModel.addEditorPage("grid-csv", "csv", "untitled.grid.csv"),
        category: "editor",
    },
    {
        id: "notebook-view",
        label: "Notebook",
        icon: React.createElement(NotebookIcon),
        create: () => pagesModel.addEditorPage("notebook-view", "json", "untitled.note.json"),
        category: "editor",
    },
    {
        id: "todo-view",
        label: "Todo",
        icon: React.createElement(TodoIcon),
        create: () => pagesModel.addEditorPage("todo-view", "json", "untitled.todo.json"),
        category: "editor",
    },
    {
        id: "link-view",
        label: "Links",
        icon: React.createElement(LinkIcon),
        create: () => pagesModel.addEditorPage("link-view", "json", "untitled.link.json"),
        category: "editor",
    },
    {
        id: "graph-view",
        label: "Force Graph",
        icon: React.createElement(GraphIcon),
        create: () => pagesModel.addEditorPage("graph-view", "json", "untitled.fg.json"),
        category: "editor",
    },
    {
        id: "rest-client",
        label: "Rest Client",
        icon: React.createElement(RestClientIcon),
        create: () => pagesModel.addEditorPage("rest-client", "json", "untitled.rest.json"),
        category: "tool",
    },
    {
        id: "browser",
        label: "Browser",
        icon: React.createElement(GlobeIcon, { color: DEFAULT_BROWSER_COLOR }),
        create: () => { pagesModel.showBrowserPage(); },
        category: "tool",
    },
    {
        id: "browser-incognito",
        label: "Browser (Incognito)",
        icon: React.createElement(IncognitoIcon),
        create: () => { pagesModel.showBrowserPage({ incognito: true }); },
        category: "tool",
    },
    {
        id: "browser-tor",
        label: "Browser (Tor)",
        icon: React.createElement(TorIcon),
        create: () => { pagesModel.showBrowserPage({ tor: true }); },
        category: "tool",
    },
    {
        id: "mcp-inspector",
        label: "MCP Inspector",
        icon: React.createElement(McpIcon),
        create: () => { pagesModel.showMcpInspectorPage(); },
        category: "tool",
    },
    {
        id: "storybook",
        label: "Storybook",
        icon: React.createElement(StorybookIcon),
        create: () => { pagesModel.showStorybookPage(); },
        category: "tool",
    },
    {
        id: "video-view",
        label: "Video Player",
        icon: React.createElement(PlayerIcon, { color: DEFAULT_BROWSER_COLOR }),
        create: () => pagesModel.showVideoPlayerPage(),
        category: "tool" as const,
    },
];

// =============================================================================
// Build full list (static + dynamic browser profiles)
// =============================================================================

export function getCreatableItems(
    browserProfiles: BrowserProfile[],
): CreatableItem[] {
    const profileItems: CreatableItem[] = browserProfiles.map((profile) => ({
        id: `browser-profile-${profile.name}`,
        label: `Browser (${profile.name})`,
        icon: React.createElement(GlobeIcon, { color: profile.color }),
        create: () => { pagesModel.showBrowserPage({ profileName: profile.name }); },
        category: "tool" as const,
    }));

    return [...staticItems, ...profileItems];
}
