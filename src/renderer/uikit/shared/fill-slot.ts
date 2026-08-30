/** Values that can be rendered directly into a view-owned DOM slot. */
export type NativeSlotContent =
    | string
    | number
    | bigint
    | boolean
    | null
    | undefined
    | Node
    | NativeSlotContent[];
export type SlotContent = NativeSlotContent;

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

/**
 * Append SlotContent's native values; active-record cleanup prevents stale handles from clearing
 * a newer fill on the same host.
 */
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
 * Do `host`'s children already match exactly what `slot` would put there?
 *
 * Re-appending a node that is already in place is not a no-op. `replaceChildren()` detaches the
 * subtree, and Chromium resets the scroll position of every scroller inside it — silently, with no
 * scroll event, so nothing downstream can notice the loss and correct it. Panels are refilled from
 * `CollapsiblePanelStackView.updateContent` on *every* update, including ones provoked by an
 * unrelated page, and the panel content is a retained view root rather than a fresh node. That is
 * how closing a background tab sent the Explorer tree back to the top while its rows stayed
 * painted where the old offset put them, leaving the first screenful blank.
 *
 * Only node content is compared. Text is cheap to rebuild and carries no state worth preserving,
 * and a `DocumentFragment` never matches: appending one moves its children out, so by the time a
 * caller hands the same fragment back it has already emptied itself.
 */
function slotMatchesHost(host: HTMLElement, slot: SlotContent): boolean {
    const expected: Node[] = [];
    const collect = (value: SlotContent): boolean => {
        if (isEmptySlot(value)) return true;
        if (value instanceof Node) {
            if (value.nodeType === Node.DOCUMENT_FRAGMENT_NODE) return false;
            expected.push(value);
            return true;
        }
        if (Array.isArray(value)) return value.every(collect);
        return false;
    };
    if (!collect(slot)) return false;

    const actual = host.childNodes;
    if (actual.length !== expected.length) return false;
    return expected.every((node, index) => actual[index] === node);
}

/**
 * Fill a view-owned DOM region with native text, nodes, fragments, or arrays of those values.
 *
 * Callers must not run a previous cleanup before calling again: this function owns the transition,
 * and superseded cleanups become no-ops on their own.
 *
 * A fill that would reproduce the children already present is skipped at the DOM level but still
 * takes a new generation, so the bookkeeping is identical either way — see `slotMatchesHost` for
 * why touching the DOM anyway is not free.
 */
export function fillSlot(host: HTMLElement, slot: SlotContent): () => void {
    const generation = (activeSlots.get(host)?.generation ?? 0) + 1;
    const alreadyFilled = slotMatchesHost(host, slot);
    if (!alreadyFilled) host.replaceChildren();

    const active: ActiveSlot = isEmptySlot(slot)
        ? { kind: "empty", generation }
        : isTextSlot(slot)
            ? { kind: "text", generation }
            : { kind: "node", generation };

    if (!isEmptySlot(slot) && !alreadyFilled && !appendNativeSlot(host, slot)) {
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
