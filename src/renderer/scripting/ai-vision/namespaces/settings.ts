import { pagesModel } from "../../../api/pages";
import { ui } from "../../../api/ui";
import type { BrowserProfile } from "../../../api/settings";
import type { ISettings } from "../../../api/types/settings";
import { createElements } from "../elements";
import type { IAiElementDeclaration, IAiMember, IAiVisionDescriptor } from "../../../../shared/ai-vision/types";

interface SettingsCatalogRow {
    readonly key: string;
    readonly label: string;
    readonly purpose: string;
}

interface SettingsCatalogSection {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly elementName: string;
    readonly rows: readonly SettingsCatalogRow[];
}

const SETTINGS_CATALOG: readonly SettingsCatalogSection[] = [
    {
        id: "theme",
        title: "Theme",
        description: "Application appearance and color theme.",
        elementName: "settings-section-theme",
        rows: [
            { key: "theme", label: "Theme", purpose: "Application color theme; the available dark and light themes are selected here." },
        ],
    },
    {
        id: "window-behavior",
        title: "Window Behavior",
        description: "Controls what happens when the last Persephone window closes.",
        elementName: "settings-section-window-behavior",
        rows: [
            { key: "window.close-to-tray", label: "Close to tray", purpose: "Whether closing the last window hides Persephone in the tray or quits it." },
        ],
    },
    {
        id: "browser-profiles",
        title: "Browser Profiles",
        description: "Manage isolated browser sessions, defaults, bookmarks, and Tor.",
        elementName: "settings-section-browser-profiles",
        rows: [
            { key: "browser-profiles", label: "Browser profiles", purpose: "Isolated browser profiles with their own cookies, storage, and cache." },
            { key: "browser-default-profile", label: "Default browser profile", purpose: "The profile used when opening a new browser tab; empty selects the built-in default." },
            { key: "browser-default-bookmarks-file", label: "Default profile bookmarks", purpose: "The .link.json file holding bookmarks for the default browser profile." },
            { key: "browser-incognito-bookmarks-file", label: "Incognito bookmarks", purpose: "The separate .link.json bookmarks file used in incognito mode." },
            { key: "tor.exe-path", label: "Tor executable", purpose: "The tor.exe path required for Browser (Tor) mode; empty disables it." },
            { key: "tor.socks-port", label: "Tor SOCKS port", purpose: "The SOCKS proxy port used by Tor." },
            { key: "tor.bookmarks-file", label: "Tor bookmarks", purpose: "The .link.json bookmarks file used for Browser (Tor) mode." },
        ],
    },
    {
        id: "link-behavior",
        title: "Links",
        description: "Choose where links opened from editors go.",
        elementName: "settings-section-link-behavior",
        rows: [
            { key: "link-open-behavior", label: "Link opening behavior", purpose: "Whether external links open in the default OS browser or the nearest internal Browser tab." },
        ],
    },
    {
        id: "default-browser",
        title: "Default Browser",
        description: "Register Persephone as a Windows default browser and inspect registration status.",
        elementName: "settings-section-default-browser",
        rows: [],
    },
    {
        id: "file-search",
        title: "File Search",
        description: "Choose which files content search includes and skips.",
        elementName: "settings-section-file-search",
        rows: [
            { key: "search-extensions", label: "Search extensions", purpose: "Comma-separated file extensions included in content search." },
            { key: "search-exclude", label: "Search exclusions", purpose: "Folders and globs skipped by content search." },
        ],
    },
    {
        id: "mcp",
        title: "MCP Server / Mneme",
        description: "Configure MCP, main-process scripting, and Mneme services.",
        elementName: "settings-section-mcp",
        rows: [
            { key: "mcp.enabled", label: "MCP server", purpose: "Whether the MCP HTTP server is enabled for AI agents to drive Persephone." },
            { key: "mcp.port", label: "MCP port", purpose: "The loopback port used by the MCP HTTP server." },
            { key: "mcp.browser-tools.enabled", label: "MCP browser tools", purpose: "Whether the browser, board, and Persephone-window MCP tools are exposed." },
            { key: "main.scripting.enabled", label: "Main-process scripting", purpose: "Whether call → main.script.execute may run code in Persephone's main process." },
            { key: "mneme.enabled", label: "Mneme", purpose: "Whether the local Mneme markdown knowledge base is enabled." },
            { key: "mneme.port", label: "Mneme port", purpose: "The loopback port used by Mneme's HTTP/MCP server." },
        ],
    },
    {
        id: "git-integration",
        title: "Git Integration",
        description: "Enable the Git Tree and Git Diff editors.",
        elementName: "settings-section-git-integration",
        rows: [
            { key: "git.enabled", label: "Git integration", purpose: "Whether Git Tree and Git Diff editors are enabled; Git must be on PATH." },
        ],
    },
    {
        id: "board-vars",
        title: "Board Environment Variables",
        description: "Choose the external file holding per-board variables and secrets.",
        elementName: "settings-section-board-vars",
        rows: [
            { key: "board-vars.file", label: "Board environment variables file", purpose: "The external .env.json file holding per-board variables and secrets." },
        ],
    },
    {
        id: "script-library",
        title: "Script Library",
        description: "Choose the folder for saved scripts and reusable modules.",
        elementName: "settings-section-script-library",
        rows: [
            { key: "script-library.path", label: "Script library path", purpose: "The folder for saved scripts and reusable modules; empty means no library is linked." },
        ],
    },
    {
        id: "drawing-library",
        title: "Drawing Library",
        description: "Choose the folder for reusable Excalidraw shapes.",
        elementName: "settings-section-drawing-library",
        rows: [
            { key: "drawing.library-path", label: "Drawing library path", purpose: "The Excalidraw reusable-shapes folder; empty uses the automatic default." },
        ],
    },
    {
        id: "video-player",
        title: "Video Player",
        description: "Configure external video decoding and the local video stream.",
        elementName: "settings-section-video-player",
        rows: [
            { key: "vlc-path", label: "VLC path", purpose: "The vlc.exe path used for formats Chromium cannot decode; empty enables auto-detection." },
            { key: "video-stream.port", label: "Video stream port", purpose: "The local port used by the video streaming server." },
        ],
    },
    {
        id: "terminal",
        title: "Terminal",
        description: "Choose the command used by Open Terminal here.",
        elementName: "settings-section-terminal",
        rows: [
            { key: "terminal.command", label: "Terminal command", purpose: "The command used by Open Terminal here; empty auto-detects pwsh, powershell, or cmd." },
        ],
    },
];

const SETTINGS_ELEMENTS: readonly IAiElementDeclaration[] = SETTINGS_CATALOG.flatMap((section) =>
    section.rows.map((row) => ({
        name: row.key,
        purpose: `${row.label}: ${row.purpose}`,
        selector: `[data-name="${section.elementName}"]`,
    })),
);

const SETTINGS_NO_ROW_ERRORS: Readonly<Record<string, string>> = {
    "tab-recent-languages": "Setting \"tab-recent-languages\" is a real setting, but it has no row on the Settings page. Use settings.get(\"tab-recent-languages\") or settings.set(\"tab-recent-languages\", value); it is owned by each page tab's language menu.",
    "search-max-file-size": "Setting \"search-max-file-size\" is a real setting, but it has no row on the Settings page. Use settings.get(\"search-max-file-size\") or settings.set(\"search-max-file-size\", value); it is owned by File Search behavior.",
    "pinned-editors": "Setting \"pinned-editors\" is a real setting, but it has no row on the Settings page. Use settings.get(\"pinned-editors\") or settings.set(\"pinned-editors\", value); it is owned by the + new-page menu.",
    "visualizer-effect": "Setting \"visualizer-effect\" is a real setting, but it has no row on the Settings page. Use settings.get(\"visualizer-effect\") or settings.set(\"visualizer-effect\", value); it is owned by the audio visualizer in the Video Player.",
    "audio-shuffle": "Setting \"audio-shuffle\" is a real setting, but it has no row on the Settings page. Use settings.get(\"audio-shuffle\") or settings.set(\"audio-shuffle\", value); it is owned by the Shuffle control in the Video Player.",
};

/**
 * Keys an agent may not switch off through `call`, because doing so severs the very channel the
 * call arrived on — and nothing on the far side can switch them back. Found by US-1307's acceptance
 * run: asked only WHERE the MCP server is turned off, the test agent highlighted the right control
 * and then set `mcp.enabled` to false, disconnecting itself. Recovery needed a hand-edit of
 * appSettings.json, which no agent can reach once its transport is gone.
 *
 * This is a one-way door, so it is refused rather than cautioned. `app.settings.set` is untouched:
 * the user's own scripts, and the Settings page itself, still turn these off normally.
 */
const SELF_SEVERING_KEYS: Readonly<Record<string, string>> = {
    "mcp.enabled": "the MCP server you are calling through",
    "mcp.port": "the MCP server's port, which drops your connection",
};

function getOwnRecordValue<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
    return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

const SETTINGS_PAGE_ROOT_SELECTOR = '[data-name="settings-root"]';
const SETTINGS_HIGHLIGHT_ATTEMPTS = 120;

function hasOnScreenBox(element: HTMLElement): boolean {
    const rectangle = element.getBoundingClientRect();
    return rectangle.width > 0 && rectangle.height > 0 && element.offsetParent !== null;
}

function waitForSettingsSection(selector: string): Promise<void> {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const check = (): void => {
            attempts += 1;
            const settingsRoot = document.querySelector<HTMLElement>(SETTINGS_PAGE_ROOT_SELECTOR);
            const section = document.querySelector<HTMLElement>(selector);
            if (!settingsRoot) {
                if (attempts >= SETTINGS_HIGHLIGHT_ATTEMPTS) {
                    reject(new Error("Settings page did not mount in time."));
                    return;
                }
                requestAnimationFrame(check);
                return;
            }
            if (section && hasOnScreenBox(section)) {
                resolve();
                return;
            }
            if (attempts >= SETTINGS_HIGHLIGHT_ATTEMPTS) {
                reject(new Error("the section for this key is not on screen."));
                return;
            }
            requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
    });
}

const highlightSettingsElement = async (selector: string, message?: string) => {
    await pagesModel.showSettingsPage();
    await waitForSettingsSection(selector);
    const result = await ui.highlightElement(selector, message);
    if (!result.found) {
        throw new Error(`The Settings section selector ${JSON.stringify(selector)} was not found by the highlighter.`);
    }
    return result;
};

const settingsElements = createElements(SETTINGS_ELEMENTS, highlightSettingsElement, {
    itemLabel: "setting key",
    validNamesLabel: "Valid setting keys",
    unknownNameError: (name) => getOwnRecordValue(SETTINGS_NO_ROW_ERRORS, name),
});

const SETTINGS_MEMBERS: readonly IAiMember[] = [
    { name: "theme", kind: "property", summary: "Current theme name; readonly." },
    { name: "get", kind: "method", signature: "get<T = any>(key: string)", summary: "Read a setting; unknown keys return undefined." },
    { name: "set", kind: "method", signature: "set<T = any>(key: string, value: T)", summary: "Persist a setting automatically after a debounce. Asking WHERE a setting is changed is not asking to change it — for that, use settings.highlight(key) and leave the value alone.", caution: "changes application configuration and may actuate services through onChanged; a few keys are refused here because they would disconnect you" },
    { name: "onChanged", kind: "property", summary: "Change notification event; the event object is not an AiVision node." },
    { name: "browserProfiles", kind: "property", summary: "Configured browser profile names; readonly projection of the browser-profiles setting." },
    { name: "defaultBrowserProfile", kind: "property", summary: "Configured default browser profile name; an empty string selects the built-in default." },
    { name: "sections", kind: "property", summary: "The Settings page's fixed-order sections and hand-written setting-key rows." },
    ...settingsElements.members,
];

export function describeSettings(instance: unknown): IAiVisionDescriptor {
    const settings = instance as ISettings;
    return {
        kind: "Settings",
        summary: "Read and persist application configuration with change notifications.",
        members: SETTINGS_MEMBERS,
        elements: SETTINGS_ELEMENTS,
        provide: (name) => {
            if (name === "sections") return { value: SETTINGS_CATALOG };
            if (name === "set") {
                return {
                    value: (key: string, value: unknown): void => {
                        const what = getOwnRecordValue(SELF_SEVERING_KEYS, key);
                        if (what && (value === false || typeof value === "number")) {
                            throw new Error(
                                `Refusing to change ${JSON.stringify(key)} from here: it controls ${what},`
                                + " and once it is gone you cannot undo this. If the user asked WHERE this is"
                                + ` changed, show them instead with settings.highlight(${JSON.stringify(key)}).`
                                + " If they genuinely want it off, ask them to do it on the Settings page.",
                            );
                        }
                        settings.set(key, value);
                    },
                };
            }
            if (name === "browserProfiles") {
                return { value: settings.get<BrowserProfile[]>("browser-profiles").map((profile) => profile.name) };
            }
            if (name === "defaultBrowserProfile") {
                return { value: settings.get<string>("browser-default-profile") };
            }
            return settingsElements.provide(name);
        },
        help: `The Settings page has 13 fixed-order sections. Read sections to find the hand-written setting-key catalog, and use highlight(key) to open or activate Settings and point at a supported key's section. The five real settings without a Settings-page row remain available through get/set. browserProfiles and defaultBrowserProfile are convenient read-only projections for choosing browser profiles. Use set only when you intend to persist an application change.`,
        summarize: () => ({ kind: "Settings", theme: settings.theme }),
    };
}
