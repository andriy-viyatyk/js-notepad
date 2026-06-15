import { TraitSet } from "./traits";
import { traitRegistry } from "./TraitRegistry";
import type { TraitTypeId } from "./TraitRegistry";

const MIME_TYPE = "application/persephone-trait";

// ── Serialization ────────────────────────────────────────────────────────────

/** Drag payload shape — serialized into dataTransfer. */
export interface TraitDragPayload {
    typeId: string;
    data: unknown;
}

/** Set trait drag data on a native drag event. */
export function setTraitDragData(
    dataTransfer: DataTransfer,
    typeId: TraitTypeId,
    data: unknown,
): void {
    const payload: TraitDragPayload = { typeId, data };
    dataTransfer.setData(MIME_TYPE, JSON.stringify(payload));
    dataTransfer.effectAllowed = "move";
}

/** Read trait drag data from a native drag event. Returns null if not a trait drag. */
export function getTraitDragData(dataTransfer: DataTransfer): TraitDragPayload | null {
    const raw = dataTransfer.getData(MIME_TYPE);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as TraitDragPayload;
    } catch {
        return null;
    }
}

/** Check if a drag event carries trait data (for dragover/dragenter). */
export function hasTraitDragData(dataTransfer: DataTransfer): boolean {
    // Use Array.prototype.indexOf for compat with both string[] and DOMStringList
    return Array.prototype.indexOf.call(dataTransfer.types, MIME_TYPE) >= 0;
}

/** Resolve TraitSet from registry by typeId. */
export function resolveTraits(typeId: string): TraitSet | undefined {
    return traitRegistry.get(typeId);
}

// ── Visual feedback CSS class helpers ────────────────────────────────────────

/** Prevent default to allow drop. Call from onDragOver and onDragEnter handlers. */
export function allowDrop(e: React.DragEvent): void {
    if (hasTraitDragData(e.dataTransfer)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    }
}

// ── OS file drags + event-expando transport (US-675) ──────────────────────────

/** True if the drag carries OS files. During `dragover` only the type is visible
 *  (the file list/paths become readable at `drop`). */
export function isFileDrag(dataTransfer: DataTransfer | null): boolean {
    if (!dataTransfer) return false;
    return Array.prototype.indexOf.call(dataTransfer.types, "Files") >= 0;
}

/** Droppable as a link/file — an internal trait drag OR an OS file drag. Use from
 *  dragenter/dragover so consumers never read `files` themselves. */
export function isLinkDroppable(dataTransfer: DataTransfer | null): boolean {
    return !!dataTransfer && (hasTraitDragData(dataTransfer) || isFileDrag(dataTransfer));
}

/** Expando key carrying a trait descriptor on the native drop event. Used when the
 *  descriptor can't ride `dataTransfer` (setData is illegal during `drop`, and an
 *  OS-originated drag has no `dragstart`). Safe because a transient DOM event is never
 *  spread, serialized, or Immer-copied — unlike data objects, for which symbol
 *  auto-discovery was rejected (see doc/architecture/trait-system.md). */
const LINK_DROP_DESCRIPTOR = Symbol("persephone-link-drop");

/** Attach a trait descriptor to the native drop event (read back via
 *  getTraitDragDataFromEvent). Carries the same serializable `{ typeId, data }`
 *  payload as the dataTransfer MIME. */
export function setEventTraitDragData(e: DragEvent, payload: TraitDragPayload): void {
    (e as DragEvent & { [LINK_DROP_DESCRIPTOR]?: TraitDragPayload })[LINK_DROP_DESCRIPTOR] = payload;
}

/** Read the trait descriptor from a drop event — the event expando first (set by the
 *  global capture handler for OS files), then the `dataTransfer` MIME. Accepts a React
 *  or native DragEvent. The one accessor every drop target uses, so internal trait
 *  drags and OS file drags read identically. */
export function getTraitDragDataFromEvent(e: React.DragEvent | DragEvent): TraitDragPayload | null {
    const native = "nativeEvent" in e ? e.nativeEvent : e;
    const fromEvent = (native as { [LINK_DROP_DESCRIPTOR]?: TraitDragPayload })[LINK_DROP_DESCRIPTOR];
    return fromEvent ?? getTraitDragData(e.dataTransfer);
}
