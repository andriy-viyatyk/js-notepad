import { useMemo } from "react";
import { settings } from "../../api/settings";
import { DEFAULT_PINNED_EDITORS } from "./tools-editors-registry";

/**
 * Unified pinned-item model for the "Tools & Editors" sidebar and the header
 * "add new page" dropdown. A pinned entry is either a built-in editor/tool or a
 * trusted Board — both live in **one ordered list** so they interleave and
 * reorder freely.
 *
 * Persistence reuses the existing `pinned-editors` settings key (`string[]`),
 * overloading its entries — no migration:
 *   - editor → the bare `CreatableItem.id`, e.g. `"script-js"`.
 *   - board  → `"board:" + absoluteRoot`, e.g. `"board:D:\\boards\\dev-clock"`.
 * Editor ids never contain `":"`, so the `board:` prefix is unambiguous.
 */
export type PinnedRef =
    | { kind: "editor"; id: string }
    | { kind: "board"; root: string };

const BOARD_PREFIX = "board:";

/** Encode a ref to its stored string in the `pinned-editors` array. */
export function encodePin(ref: PinnedRef): string {
    return ref.kind === "board" ? BOARD_PREFIX + ref.root : ref.id;
}

/** Decode a stored string back into a ref. */
export function decodePin(stored: string): PinnedRef {
    return stored.startsWith(BOARD_PREFIX)
        ? { kind: "board", root: stored.slice(BOARD_PREFIX.length) }
        : { kind: "editor", id: stored };
}

/** Current raw pinned-items array (editor ids + `board:<root>` entries). */
export function getPinnedStrings(): string[] {
    return settings.get("pinned-editors") ?? DEFAULT_PINNED_EDITORS;
}

function setPinnedStrings(items: string[]): void {
    settings.set("pinned-editors", items);
}

/** True iff the ref is currently pinned. */
export function isPinned(ref: PinnedRef): boolean {
    return getPinnedStrings().includes(encodePin(ref));
}

/** Append a ref to the pinned list if not already present. */
export function addPin(ref: PinnedRef): void {
    const s = encodePin(ref);
    const cur = getPinnedStrings();
    if (!cur.includes(s)) setPinnedStrings([...cur, s]);
}

/** Remove a ref from the pinned list (idempotent). */
export function removePin(ref: PinnedRef): void {
    const s = encodePin(ref);
    setPinnedStrings(getPinnedStrings().filter((x) => x !== s));
}

/** Reorder: move the entry at `dragIndex` to `hoverIndex`. */
export function movePin(dragIndex: number, hoverIndex: number): void {
    const cur = [...getPinnedStrings()];
    const [removed] = cur.splice(dragIndex, 1);
    cur.splice(hoverIndex, 0, removed);
    setPinnedStrings(cur);
}

/** Reactive decoded pinned list — re-renders on any pin change. */
export function usePinnedRefs(): PinnedRef[] {
    const raw = settings.use("pinned-editors") ?? DEFAULT_PINNED_EDITORS;
    return useMemo(() => raw.map(decodePin), [raw]);
}
