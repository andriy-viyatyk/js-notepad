import type React from "react";
import type { MenuItem } from "../../uikit/Menu";
import type { SlotText } from "../../uikit/shared/slots";
import { mountVanilla } from "../../uikit/shared/mount";
import { BoardsTreeView } from "./BoardsTreeView";

/**
 * The single reusable boards view (EPIC-036 / US-759). A presentational tree of boards built
 * from a finite path list and rendered via the UIKit `Tree`, fully expanded. Pure component —
 * no trust reads, no link encoding, no pin state: consumers wire those through the slots.
 *
 * Used in single-root mode (Explorer panel, in-board toolbar popover — pass `baseRoot`) and
 * multi-root mode (global Tools & Editors tab — omit `baseRoot`). Folder nodes show a
 * `FolderIcon` and toggle on the chevron; board nodes show their board glyph and fire
 * `onOpenBoard` on click. The implementation lives in `BoardsTreeView`; this file is the
 * React compatibility shim used by surviving callers.
 */
export interface BoardsTreeProps {
    /** Debug label → `data-name` (UIKit Rule 1). */
    name?: string;
    /** Absolute board-root paths to display (e.g. the trusted-boards registry, pre-filtered). */
    boards: string[];
    /** Single-root mode: relativize paths to this base. Omit for multi-root (forest). */
    baseRoot?: string;
    /** Fires when a board row is clicked. The consumer opens it (e.g. via `persephone-board://`). */
    onOpenBoard: (root: string) => void;
    /** Optional right-aligned per-board action (e.g. the global tab's pin button). Boards only. */
    renderTrailing?: (root: string) => React.ReactNode;
    /** When provided and `false` for a board, its trailing reveals on row hover only; otherwise
     *  it stays visible (e.g. a pinned board keeps its filled pin). Boards only; default visible. */
    trailingVisible?: (root: string) => boolean;
    /** Optional per-board context menu (e.g. the global tab's "Remove"). Boards only. */
    getBoardContextMenu?: (root: string) => MenuItem[] | undefined;
    /** Shown when `boards` is empty. */
    emptyMessage?: SlotText | Node;
}

export function BoardsTree(props: BoardsTreeProps): React.ReactElement {
    return mountVanilla(BoardsTreeView, props);
}
