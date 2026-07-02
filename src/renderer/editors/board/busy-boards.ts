import { TOneState } from "../../core/state/state";
import { fpNormalizeForCompare } from "../../core/utils/file-path";

/**
 * Reactive registry of the boards that are currently BUSY somewhere in this window
 * (US-799): a busy board's processes outlive its iframe, so the board may be running
 * invisibly (its model demoted off a page's main slot). The Boards panel reads this
 * to show a "running" indicator, keeping hidden busy boards discoverable.
 *
 * Maintained by `BoardEditorModel.setBusy`/`dispose` — keyed by the model id (the
 * owner), valued by the board root. Two instances of the same board can both be
 * busy; the exposed roots set de-duplicates.
 */

/** ownerId (BoardEditorModel id) → normalized board root. */
const busyOwners = new Map<string, string>();

const busyBoardsState = new TOneState<{ roots: string[] }>({ roots: [] });

function recompute(): void {
    busyBoardsState.update((s) => {
        s.roots = [...new Set(busyOwners.values())];
    });
}

/** Record / clear an owner's busy flag. `boardRoot` is required only when `busy`. */
export function markBoardBusy(ownerId: string, boardRoot: string | undefined, busy: boolean): void {
    if (busy && boardRoot) {
        busyOwners.set(ownerId, fpNormalizeForCompare(boardRoot));
    } else {
        if (!busyOwners.has(ownerId)) return;
        busyOwners.delete(ownerId);
    }
    recompute();
}

/** Reactive hook: normalized roots of all currently-busy boards in this window. */
export function useBusyBoardRoots(): string[] {
    return busyBoardsState.use((s) => s.roots);
}

/** Non-reactive check (e.g. menu builders). */
export function isBoardRootBusy(boardRoot: string): boolean {
    const key = fpNormalizeForCompare(boardRoot);
    return busyBoardsState.get().roots.includes(key);
}
