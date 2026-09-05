import { ui } from "../../../api/ui";
import { createElements } from "../elements";
import type { IAiElementDeclaration, IAiMember, IAiVisionDescriptor } from "../../../../shared/ai-vision/types";

const HEADER_ELEMENTS: readonly IAiElementDeclaration[] = [
    { name: "app-header", purpose: "The always-present top shell strip containing tabs, status indicators, and window controls." },
    { name: "persephone-menu", purpose: "Opens the Menu Bar, where app features not on a tab live." },
    { name: "page-tabs", purpose: "The strip of open-page tabs; tabs can be reordered, moved, and opened into their tab menu." },
    { name: "page-tabs-wrapper", purpose: "The tab strip's scroll area." },
    { name: "page-tabs-scroll-left", purpose: "Scrolls the tab strip left; only present when the tabs overflow." },
    { name: "page-tabs-scroll-right", purpose: "Scrolls the tab strip right; only present when the tabs overflow." },
    { name: "page-tabs-add", purpose: "Adds an empty page; its split arrow opens the editor/profile menu." },
    { name: "page-tab", purpose: "Any open-page tab in the strip. Click one to activate that page; drag to reorder or move it.", selector: "[data-name=\"page-tab\"]" },
    { name: "tab-language", purpose: "The active tab's language button — this is where the editor's syntax-highlighting language is changed. Absent for editors that declare no language, which show the editor's icon instead.", selector: "[data-name=\"page-tab\"][data-active] [data-name=\"tab-language\"]" },
    { name: "tab-close", purpose: "Closes the active tab (ungroups it when the page is grouped).", selector: "[data-name=\"page-tab\"][data-active] [data-name=\"tab-close\"]" },
    { name: "tab-sound", purpose: "Mutes or unmutes the active tab; only present while that page is audible or muted.", selector: "[data-name=\"page-tab\"][data-active] [data-name=\"tab-sound\"]" },
    { name: "autoload-reload", purpose: "Reloads autoload scripts; only present when their files changed on disk and need re-running." },
    { name: "zoom-indicator", purpose: "Shows the current zoom and resets it when clicked; only present when the window is zoomed." },
    { name: "window-minimize", purpose: "Minimizes the application window." },
    { name: "window-toggle", purpose: "Maximizes or restores the application window." },
    { name: "window-close", purpose: "Closes the application window." },
    { name: "status-indicators", purpose: "Contains the shell's optional Snip, Mneme, and MCP indicators." },
    { name: "header-snip-button", purpose: "Opens the Snip Screen / Snip Persephone capture menu." },
    { name: "mneme-indicator", purpose: "Shows Mneme status and opens its configuration page; only present when Mneme is enabled." },
    { name: "mcp-indicator", purpose: "Shows MCP connection status and opens the request log; only present while the MCP server is running." },
];

const USER_INTERFACE_MEMBERS: readonly IAiMember[] = [
    { name: "confirm", kind: "method", signature: "confirm(message: string, options?: IConfirmOptions)", summary: "Show a confirmation dialog and wait for the user's choice.", caution: "blocks on user input" },
    { name: "input", kind: "method", signature: "input(message: string, options?: IInputOptions)", summary: "Show an input dialog and wait for the user's response.", caution: "blocks on user input" },
    { name: "password", kind: "method", signature: "password(options?: IPasswordOptions)", summary: "Show a password dialog.", caution: "blocks on user input and handles secret text" },
    { name: "notify", kind: "method", signature: "notify(message: string, type?: NotificationType)", summary: "Show a toast notification.", caution: "visibly interrupts the user and may wait for a click" },
    { name: "textDialog", kind: "method", signature: "textDialog(options: ITextDialogOptions)", summary: "Show a Monaco text dialog.", caution: "visibly opens a dialog and waits for the user" },
    { name: "showProgress", kind: "method", signature: "showProgress<T>(promise: Promise<T>, label?: string)", summary: "Show a progress overlay while a promise is pending.", caution: "changes the visible UI" },
    { name: "createProgress", kind: "method", signature: "createProgress(label?: string)", summary: "Create a progress handle whose show method displays an overlay.", caution: "can create visible progress UI" },
    { name: "notifyProgress", kind: "method", signature: "notifyProgress(label: string, timeout?: number)", summary: "Show a centered auto-dismissing notification.", caution: "changes the visible UI" },
    { name: "addScreenLock", kind: "method", signature: "addScreenLock()", summary: "Lock the screen with a blocking overlay until released.", caution: "blocks user interaction" },
    { name: "highlightElement", kind: "method", signature: "highlightElement(selector: string, text?: string, options?: IHighlightOptions)", summary: "Draw an explanatory highlight in the app window.", caution: "changes the visible UI; returns as soon as the overlay is drawn — the user dismisses it afterwards" },
    { name: "clearHighlights", kind: "method", signature: "clearHighlights(id?: string)", summary: "Remove one or all highlights.", caution: "changes the visible UI" },
];

export function describeUserInterface(_instance: unknown): IAiVisionDescriptor {
    const elements = createElements(HEADER_ELEMENTS, ui.highlightElement.bind(ui));
    return {
        kind: "UserInterface",
        summary: "Dialogs, notifications, progress overlays, screen locks, app-window highlights, and curated shell controls through ui.elements.",
        members: [...USER_INTERFACE_MEMBERS, ...elements.members],
        provide: elements.provide,
        elements: HEADER_ELEMENTS,
        help: "Use UI methods only when the requested interaction or visible feedback is intended for the user. Use ui.elements to discover curated shell controls, their purpose, selectors, and live visibility.",
        summarize: () => ({ kind: "UserInterface" }),
    };
}
