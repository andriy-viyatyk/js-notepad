// Focus-ownership helpers for the editor autofocus flows.
//
// Persephone editors autofocus themselves so that activating a page (opening a
// new tab, switching tabs) lets the user type immediately without an extra
// click. But *navigating* a page — loading a new editor into the already-active
// page from a sidebar panel (Explorer tree click, Git panel, Archive/Mneme
// trees) — must NOT steal focus: the user is still working in the sidebar
// (e.g. walking the Explorer tree with the keyboard).
//
// The two cases are distinguished by where keyboard focus lives at the moment
// the editor would grab it: during sidebar-driven navigation, focus is inside
// the secondary-views container; during activation it is on the page chrome or
// the body (clicking a tab blurs the sidebar), and keyboard-driven page
// switches (which keep sidebar focus) go through `showPage`, which focuses the
// editor unconditionally.

/**
 * True when keyboard focus currently lives inside a sidebar (secondary-views)
 * panel. Editors consult this to skip their mount/navigation autofocus; page
 * activation paths (tab switch / new page) do not consult it.
 */
export function isFocusInSidebar(): boolean {
    return !!document.activeElement?.closest(
        '[data-name="secondary-views-container"]',
    );
}
