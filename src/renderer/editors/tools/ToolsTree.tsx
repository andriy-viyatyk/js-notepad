import type React from "react";
import type { MenuItem } from "../../uikit/Menu";
import type { SlotText } from "../../uikit/shared/slots";
import { mountVanilla } from "../../uikit/shared/mount";
import { ToolsTreeView } from "./ToolsTreeView";
import type { ToolsetTreeInput } from "./tools-tree-build";

/**
 * The single reusable registered-tools view (EPIC-038 / US-805). A presentational tree of
 * toolsets built from a finite list and rendered via the UIKit `Tree`, fully expanded. Pure
 * component — no trust reads, no link encoding: consumers wire those through the slots. Mirrors
 * `BoardsTree`.
 *
 * Used in single-root mode (Explorer panel Tools mode — pass `baseRoot`) and multi-root mode
 * (global Tools & Editors "Tools" segment — omit `baseRoot`). Folder nodes show a `FolderIcon`;
 * toolset nodes show a `ToolsIcon` and fire `onOpenToolset` on click. The implementation lives in
 * `ToolsTreeView`; this file is the React compatibility shim used by surviving callers.
 */
export interface ToolsTreeProps {
    /** Debug label → `data-name` (UIKit Rule 1). */
    name?: string;
    /** Registered toolsets to display (`{ root, name }`). */
    toolsets: ToolsetTreeInput[];
    /** Single-root mode: relativize paths to this base. Omit for multi-root (forest). */
    baseRoot?: string;
    /** Fires when a toolset row is clicked. The consumer opens it (e.g. via `persephone-toolset://`). */
    onOpenToolset: (root: string) => void;
    /** Optional right-aligned per-toolset action. Toolsets only. */
    renderTrailing?: (root: string) => React.ReactNode;
    /** Optional per-toolset context menu (e.g. "Remove"). Toolsets only. */
    getContextMenu?: (root: string) => MenuItem[] | undefined;
    /** Shown when `toolsets` is empty. */
    emptyMessage?: SlotText | Node;
}

export function ToolsTree(props: ToolsTreeProps): React.ReactElement {
    return mountVanilla(ToolsTreeView, props);
}
