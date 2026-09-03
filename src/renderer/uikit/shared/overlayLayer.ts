const OVERLAY_LAYER_ID = "persephone-overlay-layer";

let overlayLayer: HTMLDivElement | undefined;

/**
 * Return the one shared DOM host for global overlays in this renderer document.
 *
 * The host intentionally has no styling. Its children own their positioning and
 * stacking behavior, and the host remains available for future native views.
 */
export function getOverlayLayer(): HTMLDivElement {
    if (
        overlayLayer &&
        overlayLayer.ownerDocument === document &&
        overlayLayer.isConnected
    ) {
        return overlayLayer;
    }

    const existing = document.getElementById(OVERLAY_LAYER_ID);
    if (existing) {
        if (!(existing instanceof HTMLDivElement)) {
            throw new Error(`Overlay layer must be a div: #${OVERLAY_LAYER_ID}`);
        }
        overlayLayer = existing;
        return existing;
    }

    const layer = document.createElement("div");
    layer.id = OVERLAY_LAYER_ID;
    layer.dataset.type = "overlay-layer";
    document.body.appendChild(layer);
    overlayLayer = layer;
    return layer;
}

/**
 * Announce a pointer press this document cannot see, so open overlays dismiss.
 *
 * A press inside a separate frame — the browser editor's `<webview>` guest, or the HTML
 * viewer's sandboxed iframe — fires no `pointerdown` here, so `PopoverView`'s outside-click
 * listener never runs. A menu therefore stayed open over the very content the user was
 * clicking, and in the browser editor the guest covers nearly the whole page, leaving almost
 * nowhere to click to dismiss it. Each frame reports its own presses (the webview preload
 * sends `guest-pointerdown`; the HTML viewer's injected script posts `html:interact`) and
 * this replays the outside-click those listeners are waiting for.
 *
 * `pointerdown` specifically, and this is the part that rotted: dismissal used to be
 * `mousedown`, so the HTML viewer's ping dispatched one. `PopoverView` moved to `pointerdown`
 * — deliberately, because `mousedown` is a compatibility event a drag gesture may suppress
 * (see the note in `PopoverFloatingView.onMount`) — which left the ping firing an event
 * nothing listens for any more.
 *
 * `document.body` is the target because it is outside every popover root by construction, and
 * no other renderer code listens for `pointerdown` on the document, so this dismisses
 * overlays and does nothing else.
 */
export function dismissOverlays(): void {
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
}
