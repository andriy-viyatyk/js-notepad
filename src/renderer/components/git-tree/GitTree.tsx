/**
 * React boundary for the reusable Git Tree.
 *
 * The grid implementation is a native `VanillaView`; this file intentionally keeps only the
 * public prop types and the stable adapter used by existing React callers.
 */
import React from "react";

import { mountVanilla, type VanillaViewCtor } from "../../uikit/shared/mount";
import type { MenuItem } from "../../uikit/Menu";
import type { GitTreeModel } from "./GitTreeModel";
import type { GitCommitRow } from "./swimlane-layout";
import { GitTreeView } from "./GitTreeView";

export interface GitTreeSideSelect {
    /** Changes whenever the diff's from/to changes — the trigger for repainting the L/R column. */
    selectionKey: string;
    /** Render the L (from) toggle for this row (false for the Unstaged row). */
    showLeft: (row: GitCommitRow) => boolean;
    /** This row holds the diff's `from` (left). */
    isLeftActive: (row: GitCommitRow) => boolean;
    /** This row holds the diff's `to` (right). */
    isRightActive: (row: GitCommitRow) => boolean;
    onPickLeft: (row: GitCommitRow) => void;
    onPickRight: (row: GitCommitRow) => void;
}

export type GitColumnLayout = { key: string; width: number | `${number}%` }[];

export interface GitTreeProps {
    /** Optional debug label forwarded to the underlying grid. */
    name?: string;
    /** Data + load/pagination model, owned by the editor. */
    model: GitTreeModel;
    /** Currently selected commit hash (highlights the row). */
    selectedHash?: string;
    /** Fired when a row is clicked. */
    onSelectCommit?: (hash: string) => void;
    /** Compact layout for file-scoped history views. */
    compact?: boolean;
    /** Git Diff "File History" L/R side-select column. */
    sideSelect?: GitTreeSideSelect;
    /** Synthetic rows prepended before the commit history. Memoize at the caller. */
    leadingRows?: GitCommitRow[];
    /** Owner-persisted column layout, applied once at mount. */
    initialColumnLayout?: GitColumnLayout;
    /** Called after user column resize/reorder. */
    onColumnLayoutChange?: (layout: GitColumnLayout) => void;
    /** Per-selection context menu for commit rows. */
    getContextMenuItems?: (rows: GitCommitRow[]) => MenuItem[];
}

export function GitTree(props: GitTreeProps): React.ReactElement {
    return mountVanilla(
        GitTreeView as VanillaViewCtor<GitTreeProps>,
        props,
    );
}
