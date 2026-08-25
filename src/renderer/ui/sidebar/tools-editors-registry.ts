import { pagesModel } from "../../api/pages";
import { fs } from "../../api/fs";
import { BrowserProfile } from "../../api/settings";
import {
    DrawIcon, GraphIcon, GridIcon, IncognitoIcon, RestClientIcon, TorIcon,
    JavascriptIcon, LinkIcon, NotebookIcon, TypescriptIcon,
} from "../../theme/language-icons";
import { DEFAULT_BROWSER_COLOR, MEMORY_ICON_COLOR } from "../../theme/palette-colors";
import { createFolderIconElement } from "../../components/icons/icon-elements";
import { createIconElement } from "../../uikit/shared/slots";
import type { IconRef } from "../../uikit";

// =============================================================================
// Types
// =============================================================================

export interface CreatableItem {
    /** Unique stable ID for settings persistence. */
    id: string;
    /** Display label in menus and sidebar. */
    label: string;
    /** Icon element for menus and sidebar. */
    icon?: IconRef;
    /** Create the page/tab. */
    create: () => void;
    /** Category for grouping in the sidebar list. */
    category: "editor" | "tool";
}


// =============================================================================
// Default pinned IDs
// =============================================================================

export const DEFAULT_PINNED_EDITORS = [
    "open-folder", "open-file", "script-js", "draw-view", "grid-csv", "browser",
];

// =============================================================================
// Static items (always available)
// =============================================================================

const staticItems: CreatableItem[] = [
    {
        id: "open-folder",
        label: "Open Folder",
        icon: createFolderIconElement(),
        create: () => {
            void (async () => {
                const picked = await fs.showFolderDialog({ title: "Open Folder in Explorer" });
                const folder = picked?.[0];
                if (!folder) return;
                await pagesModel.addEmptyPageWithNavPanel(folder);
            })();
        },
        category: "tool",
    },
    {
        id: "open-file",
        label: "Open File",
        icon: createIconElement("open-file"),
        create: () => { void pagesModel.openFileFromDialog(); },
        category: "tool",
    },
    {
        id: "open-url",
        label: "Open URL",
        icon: createIconElement("open-file"),
        create: () => { void pagesModel.openFileWithDialog(); },
        category: "tool",
    },
    {
        id: "script-js",
        label: "Script (JS)",
        icon: JavascriptIcon.createElement?.(),
        create: () => pagesModel.addEditorPage("monaco", "javascript", "untitled.js"),
        category: "editor",
    },
    {
        id: "script-ts",
        label: "Script (TS)",
        icon: TypescriptIcon.createElement?.(),
        create: () => pagesModel.addEditorPage("monaco", "typescript", "untitled.ts"),
        category: "editor",
    },
    {
        id: "draw-view",
        label: "Drawing",
        icon: DrawIcon.createElement?.(),
        create: () => pagesModel.addEditorPage("draw-view", "json", "untitled.excalidraw"),
        category: "editor",
    },
    {
        id: "grid-json",
        label: "Grid (JSON)",
        icon: GridIcon.createElement?.(),
        create: () => pagesModel.addEditorPage("grid-json", "json", "untitled.grid.json"),
        category: "editor",
    },
    {
        id: "grid-csv",
        label: "Grid (CSV)",
        icon: GridIcon.createElement?.(),
        create: () => pagesModel.addEditorPage("grid-csv", "csv", "untitled.grid.csv"),
        category: "editor",
    },
    {
        id: "notebook-view",
        label: "Notebook",
        icon: NotebookIcon.createElement?.(),
        create: () => pagesModel.addEditorPage("notebook-view", "json", "untitled.note.json"),
        category: "editor",
    },
    {
        id: "link-view",
        label: "Links",
        icon: LinkIcon.createElement?.(),
        create: () => pagesModel.addEditorPage("link-view", "json", "untitled.link.json"),
        category: "editor",
    },
    {
        id: "graph-view",
        label: "Force Graph",
        icon: GraphIcon.createElement?.(),
        create: () => pagesModel.addEditorPage("graph-view", "json", "untitled.fg.json"),
        category: "editor",
    },
    {
        id: "rest-client",
        label: "Rest Client",
        icon: RestClientIcon.createElement?.(),
        create: () => pagesModel.addEditorPage("rest-client", "json", "untitled.rest.json"),
        category: "tool",
    },
    {
        id: "browser",
        label: "Browser",
        icon: createIconElement("globe", { color: DEFAULT_BROWSER_COLOR }),
        create: () => { pagesModel.showBrowserPage(); },
        category: "tool",
    },
    {
        id: "browser-incognito",
        label: "Browser (Incognito)",
        icon: IncognitoIcon.createElement?.(),
        create: () => { pagesModel.showBrowserPage({ incognito: true }); },
        category: "tool",
    },
    {
        id: "browser-tor",
        label: "Browser (Tor)",
        icon: TorIcon.createElement?.(),
        create: () => { pagesModel.showBrowserPage({ tor: true }); },
        category: "tool",
    },
    {
        id: "mcp-inspector",
        label: "MCP Inspector",
        icon: createIconElement("mcp"),
        create: () => { pagesModel.showMcpInspectorPage(); },
        category: "tool",
    },
    {
        id: "mneme-config",
        label: "Mneme",
        icon: createIconElement("memory", { color: MEMORY_ICON_COLOR }),
        create: () => { pagesModel.showMnemeConfigPage(); },
        category: "tool",
    },
    {
        id: "storybook",
        label: "Storybook",
        icon: createIconElement("storybook"),
        create: () => { pagesModel.showStorybookPage(); },
        category: "tool",
    },
    {
        id: "video-view",
        label: "Video Player",
        icon: createIconElement("player", { color: DEFAULT_BROWSER_COLOR }),
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
        icon: createIconElement("globe", { color: profile.color }),
        create: () => { pagesModel.showBrowserPage({ profileName: profile.name }); },
        category: "tool" as const,
    }));

    return [...staticItems, ...profileItems];
}
