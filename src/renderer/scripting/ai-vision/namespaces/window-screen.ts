import { pagesModel } from "../../../api/pages";
import type { IBrowserAccessFlags } from "../../../editors/browser/agent-access";
import { BROWSER_AUTOMATION_MEMBERS } from "../browser-automation-members";
import type { IAiVisionDescriptor } from "../../../../shared/ai-vision/types";

const WINDOW_SCREEN_HELP = `Persephone's own application window, not a browser page. The ten shared
automation operations act on the complete current app-window accessibility tree, including the
active page's visible content. snapshot() returns refs that must be passed explicitly as
{ ref: "..." }; plain strings are always CSS selectors. App navigation and browser tabs are absent
because this target has neither; open and switch Persephone pages through pages and
pages.showPage(pageId). Prefer ui.elements for a named, curated shell control and its purpose;
window.screen.snapshot() is the complete, purpose-free fallback for everything currently on screen,
including content or controls not in the curated list. Inactive page content is hidden and does not
appear. HTML-preview and board iframe accessibility trees are merged when present, but an iframe
with fewer than three AX nodes is omitted by MIN_IFRAME_NODES, so omission can mean a nearly-empty
iframe rather than a blank preview. The app window has no elements inventory of its own.

summarize() returns host identity only ({ kind: "WindowScreen" }). Because a terminal
window.screen walk ends before this descriptor's restricted() is consulted by the per-hop resolver
(src/shared/ai-vision/resolver.ts:85-87), it never exposes active-page content, title, URL, editor id,
or privacy state. screenshot() may return undefined when its CDP session is unavailable, and
unavailable object fields are omitted from call answers rather than represented by undefined or null.
As verified live by US-1335, snapshots returned no password or ordinary input value; US-1336 found
that Chromium can omit hidden loaded frame subtrees, and doc/architecture/browser-editor.md explains
that the app snapshot contains only the active page's content.`;

/**
 * The app-window boundary is stricter than the adjacent browser-page boundary. The latter uses
 * agentMayAccessBrowserPage(state) and its openedByAgent exception; this whole-window host cannot
 * use that exception because its snapshot includes the active private page.
 */
function restrictedWindowScreen(): string | undefined {
    const activeEditor = pagesModel.activePage?.mainEditorInstance;
    if (!activeEditor || activeEditor.editorId !== "browser-view") return undefined;

    const state = activeEditor.state.get() as IBrowserAccessFlags;
    const mode = state.isTor ? "Tor" : state.isIncognito ? "incognito" : undefined;
    if (!mode) return undefined;
    return `Persephone's own window cannot be automated while its active page is in ${mode} mode. `
        + "Whole-window snapshots and actions would expose that private page. Activate a non-private "
        + "page with pages.showPage(pageId), then retry.";
}

export function describeWindowScreen(_instance: unknown): IAiVisionDescriptor {
    return {
        kind: "WindowScreen",
        summary: "Persephone's own window accessibility and automation host.",
        members: [...BROWSER_AUTOMATION_MEMBERS],
        help: WINDOW_SCREEN_HELP,
        restricted: restrictedWindowScreen,
        summarize: () => ({ kind: "WindowScreen" }),
    };
}
