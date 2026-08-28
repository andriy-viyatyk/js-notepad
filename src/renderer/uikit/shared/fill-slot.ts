import type React from "react";

/** Native slot values are implemented here; the React arm remains in the type until Epic F. */
export type SlotContent = string | Node | React.ReactNode;

interface ActiveNodeSlot {
    kind: "node";
    generation: number;
}

interface ActiveTextSlot {
    kind: "text";
    generation: number;
}

interface ActiveEmptySlot {
    kind: "empty";
    generation: number;
}

type ActiveSlot = ActiveNodeSlot | ActiveTextSlot | ActiveEmptySlot;

const activeSlots = new WeakMap<HTMLElement, ActiveSlot>();

function isEmptySlot(slot: SlotContent): boolean {
    return slot == null || typeof slot === "boolean";
}

function isTextSlot(slot: SlotContent): boolean {
    return typeof slot === "string" || typeof slot === "number" || typeof slot === "bigint";
}

/** Append the native subset of SlotContent without creating a React root. */
function appendNativeSlot(parent: Node, slot: SlotContent): boolean {
    if (isEmptySlot(slot)) return true;
    if (slot instanceof Node) {
        parent.appendChild(slot);
        return true;
    }
    if (isTextSlot(slot)) {
        parent.appendChild(document.createTextNode(String(slot)));
        return true;
    }
    if (Array.isArray(slot)) {
        const fragment = document.createDocumentFragment();
        for (const child of slot) {
            if (!appendNativeSlot(fragment, child)) return false;
        }
        parent.appendChild(fragment);
        return true;
    }
    return false;
}

/**
 * Fill a view-owned DOM region with native text, nodes, fragments, or arrays of those values.
 *
 * React.ReactNode remains in the public type alias for Epic F's type-surface work, but no live
 * caller in the renderer supplies a React node here. Unsupported React-only values therefore
 * leave the host empty rather than creating a hidden runtime bridge.
 *
 * Callers must not run a previous cleanup before calling again: this function owns the transition,
 * and superseded cleanups become no-ops on their own.
 */
export function fillSlot(host: HTMLElement, slot: SlotContent): () => void {
    const generation = (activeSlots.get(host)?.generation ?? 0) + 1;
    host.replaceChildren();

    const active: ActiveSlot = isEmptySlot(slot)
        ? { kind: "empty", generation }
        : isTextSlot(slot)
            ? { kind: "text", generation }
            : { kind: "node", generation };

    if (!isEmptySlot(slot) && !appendNativeSlot(host, slot)) {
        active.kind = "empty";
    }
    activeSlots.set(host, active);

    if (active.kind === "empty") return () => undefined;

    return () => {
        if (
            activeSlots.get(host) !== active
            || active.generation !== generation
        ) return;
        activeSlots.delete(host);
        host.replaceChildren();
    };
}
