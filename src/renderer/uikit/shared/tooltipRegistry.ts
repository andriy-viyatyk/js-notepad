// =============================================================================
// Tooltip registry — coordinates tooltips so only ONE is ever visible, and
// suppresses all tooltips while a native drag is in progress.
// =============================================================================
//
// This complements `overlayRegistry` (which suppresses tooltips while context
// menus / popovers / dialogs are open). Two distinct concerns are handled here:
//
//   1. Singleton — at most one tooltip is open at a time. When a tooltip opens it
//      claims the slot via `open(...)`, closing whatever was previously open.
//      Resolution is "innermost wins": a more-specific (DOM-descendant) tooltip
//      always beats its ancestor, regardless of which one's hover-delay fired
//      first. This fixes nested double-tooltips (e.g. a tree row's path tooltip
//      plus a richer tooltip on the row's label) — the inner one wins.
//
//   2. Drag suppression — while the user drags anything (HTML5 drag), every
//      tooltip stays suppressed and any open one is closed immediately. A tooltip
//      shown mid-drag covers the items under it and blocks drop targets. Drag
//      state is observed globally via document-level listeners, so no call-site
//      needs to thread its drag state into <Tooltip>.

type Subscriber = () => void;

interface ActiveTooltip {
    id: number;
    trigger: Element | null;
    close: () => void;
}

let active: ActiveTooltip | null = null;
let dragging = false;
const subscribers = new Set<Subscriber>();
let version = 0;

function notify() {
    version++;
    subscribers.forEach((cb) => cb());
}

// Global drag listeners are installed lazily on first use (first subscribe /
// first isDragging) so this module stays inert until a Tooltip mounts.
let listenersInstalled = false;
function ensureListeners() {
    if (listenersInstalled || typeof document === "undefined") return;
    listenersInstalled = true;
    const onDragStart = () => {
        if (dragging) return;
        dragging = true;
        // Close whatever is open — it would otherwise hover over the drop target.
        if (active) {
            active.close();
            active = null;
        }
        notify();
    };
    const onDragEnd = () => {
        if (!dragging) return;
        dragging = false;
        notify();
    };
    // Capture phase so we react even if a handler downstream stops propagation.
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("dragend", onDragEnd, true);
    document.addEventListener("drop", onDragEnd, true);
}

let nextId = 1;

export const tooltipRegistry = {
    /** Allocate a stable per-instance id (called once per Tooltip). */
    nextId(): number {
        return nextId++;
    },

    /**
     * Claim the singleton "one tooltip visible" slot for tooltip `id`.
     *
     * Returns `false` when a more-specific tooltip already owns the slot — i.e. the
     * active tooltip's trigger is a DOM-descendant of `trigger` (so `trigger` is an
     * ancestor). In that case the caller must stay closed. Otherwise the previously
     * active tooltip is closed and this one becomes active; returns `true`.
     */
    open(id: number, trigger: Element | null, close: () => void): boolean {
        if (active && active.id !== id) {
            if (trigger && active.trigger && trigger.contains(active.trigger)) {
                // A nested (more-specific) tooltip is already showing — this one is
                // its ancestor, so it loses. Stay closed.
                return false;
            }
            active.close();
        }
        active = { id, trigger, close };
        return true;
    },

    /** Release the slot if tooltip `id` currently owns it. */
    close(id: number): void {
        if (active && active.id === id) active = null;
    },

    /** True while a native drag is in progress — every tooltip stays suppressed. */
    isDragging(): boolean {
        ensureListeners();
        return dragging;
    },

    /** Subscribe to registry changes — returns an unsubscribe function. */
    subscribe(cb: Subscriber): () => void {
        ensureListeners();
        subscribers.add(cb);
        return () => {
            subscribers.delete(cb);
        };
    },

    /** Snapshot for `useSyncExternalStore` — monotonic version that bumps on every change. */
    getVersion(): number {
        return version;
    },
};
