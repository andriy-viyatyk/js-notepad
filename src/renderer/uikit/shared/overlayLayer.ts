const OVERLAY_LAYER_ID = "persephone-overlay-layer";

let overlayLayer: HTMLDivElement | undefined;

/**
 * Return the one shared DOM host for global overlays in this renderer document.
 *
 * The host intentionally has no styling. Its children own their positioning and
 * stacking behavior, and the host remains available for future non-React views.
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
