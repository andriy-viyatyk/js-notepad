import { SecondaryViews } from "../../ui/secondary-views/SecondaryViews";
import type { BrowserPanelHost } from "./BrowserPanelHost";

/**
 * Controlled `SecondaryViews` mount for the browser surfaces (`BlankPageLinks`
 * + `BookmarksDrawer`). Mirrors `Pages.tsx`'s `SecondaryViewsContent`, but the
 * owner is a `BrowserPanelHost` instead of a `PageModel` (US-601).
 *
 * Renders the bookmarks Link editor's Categories/Tags/Hostnames panels to the
 * left of the links list. The sidebar is mandatory-open, so this never returns
 * `null` while bookmarks are loaded.
 */
export function BrowserSecondaryViews({ host }: { host: BrowserPanelHost }) {
    const nav = host.ensureSecondaryViewsModel();
    const state = nav.state.use();          // open/width/activePanel
    host.state.use((s) => s.version);       // re-derive views on panel-list change
    return (
        <SecondaryViews
            views={host.panelEditors}
            state={state}
            setState={host.setSecondaryViewsState}
        />
    );
}
