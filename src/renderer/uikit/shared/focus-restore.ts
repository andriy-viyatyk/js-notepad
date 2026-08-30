/**
 * Give focus back to the control a transient surface took it from.
 *
 * A dialog, menu, or full-window editor overlay records the active element on open and re-focuses
 * it on close. That is correct for keyboard users, but it is *not* a user action, and anything
 * listening for `focusin` cannot tell the two apart: `:focus-visible` reports whatever the browser
 * inferred from the last real interaction, which after a mouse-driven close is not reliable.
 *
 * So the restorer says so explicitly. `focus()` dispatches `focusin` synchronously, so a listener
 * that consults `isRestoringFocus()` sees the flag for exactly the restore it belongs to. The
 * counter (rather than a boolean) keeps nesting honest if a restore ever runs inside another.
 *
 * The tooltip attachment is the first consumer: without this, closing an "Unsaved Changes" dialog
 * re-focused the tab's close button and popped its tooltip open under a pointer that had been
 * somewhere else for several seconds.
 */
let restoreDepth = 0;

/** Re-focus `element` as a restore rather than as a user action. */
export function restoreFocus(element: HTMLElement): void {
    restoreDepth++;
    try {
        element.focus();
    } finally {
        restoreDepth--;
    }
}

/** True while a `restoreFocus()` call is dispatching its focus events. */
export function isRestoringFocus(): boolean {
    return restoreDepth > 0;
}
