import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { GitTreeEditorModel } from "./GitTreeEditorModel";
import { FileGrid, type FileGridItem } from "../../components/file-grid";
import { gitStatusMarkup } from "../../components/git-tree/git-status-meta";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Spacer } from "../../uikit/Spacer";
import { Splitter } from "../../uikit/Splitter";
import { Button } from "../../uikit/Button";
import { IconButton } from "../../uikit/IconButton/IconButton";
import type { MenuItem } from "../../uikit/Menu";
import { showConfirmationDialog } from "../../ui/dialogs/ConfirmationDialog";
import { showCommitDialog } from "../../ui/dialogs/CommitDialog";
import { FilterArrowUpIcon, FilterArrowDownIcon, DeleteIcon } from "../../theme/icons";
import type { GitFileChange } from "../../../ipc/git-ipc";
import { TComponentModel, useComponentModel } from "../../core/state/model";

/** Expand a selection to git path args — renames need both new + old path so
 *  `git add` / `git reset` follow the rename (US-631). */
function expandPaths(changes: GitFileChange[]): string[] {
    return changes.flatMap((c) => (c.oldPath ? [c.path, c.oldPath] : [c.path]));
}

interface GitChangesState {
    selUnstaged: GitFileChange[];
    selStaged: GitFileChange[];
}

class GitChangesModel extends TComponentModel<GitChangesState, { model: GitTreeEditorModel }> {
    setSelUnstaged = (changes: GitFileChange[]) => {
        this.state.update((s) => { s.selUnstaged = changes; });
    };

    setSelStaged = (changes: GitFileChange[]) => {
        this.state.update((s) => { s.selStaged = changes; });
    };
}

// =============================================================================
// Git "Changes" segment body (US-781).
//
// The working-tree status surface of the merged "Git" panel: unstaged (top) +
// staged (bottom), each a FileGrid with proper file icons, single-click → open
// the file's Git Diff, and a right-aligned colored status badge. Header-less —
// the merged panel (`GitPanelSecondaryView`) owns the shared SideBarPanelHeader
// and the segment toolbar; this body renders only the two lists. Extracted from
// the former standalone "Changes" secondary view.
// =============================================================================

export function GitChangesView({ model }: { model: GitTreeEditorModel }) {
    const viewModel = useComponentModel({ model }, GitChangesModel, {
        selUnstaged: [],
        selStaged: [],
    });
    const { selUnstaged, selStaged } = viewModel.state.use();
    const { unstaged, staged, gitOk, branch } = model.changes.state.use((s) => ({
        unstaged: s.unstaged,
        staged: s.staged,
        gitOk: s.gitOk,
        branch: s.branch,
    }));

    const rootRef = useRef<HTMLDivElement>(null);
    const [bottomHeight, setBottomHeight] = useState<number | undefined>(undefined);

    // Range selection per list (transient — not persisted, US-631 Concern #7).
    // Both arrow buttons live on the Staged header: ↓ stages the Unstaged
    // selection, ↑ unstages the Staged selection (US-631 Concern #4).

    const stage = useCallback(
        (changes: GitFileChange[]) => {
            if (changes.length) void model.changes.stagePaths(expandPaths(changes));
        },
        [model],
    );
    const unstage = useCallback(
        (changes: GitFileChange[]) => {
            if (changes.length) void model.changes.unstagePaths(expandPaths(changes));
        },
        [model],
    );

    // "Reset" (Unstaged only) — discard working-tree changes; untracked files are
    // deleted. Destructive, so confirm first (US-631).
    const reset = useCallback(
        async (changes: GitFileChange[]) => {
            if (!changes.length) return;
            const n = changes.length;
            const detail = changes.some((c) => c.status === "?")
                ? "Uncommitted changes will be discarded and untracked files deleted."
                : "Uncommitted changes will be discarded.";
            const choice = await showConfirmationDialog({
                title: "Reset changes",
                message: `Reset ${n} file${n > 1 ? "s" : ""}? ${detail} This cannot be undone.`,
                buttons: ["Reset", "Cancel"],
            });
            if (choice !== "Reset") return;
            void model.changes.resetChanges(changes);
        },
        [model],
    );

    // Commit the staged index (US-632). Fetch the effective identity, open the dialog
    // prepopulated (branch + name/email + message). The dialog DRIVES the commit via the
    // injected `onAction` (US-638): it stays open on failure (invalid/duplicate branch
    // name) for a fix-and-retry, and closes only on success. A changed branch name (or a
    // detached HEAD whose field started empty) creates + checks out a new branch first, so
    // the commit lands on it; the identity is applied as a per-commit override.
    const doCommit = useCallback(async () => {
        const id = await model.changes.getIdentity();
        await showCommitDialog({
            branch,
            name: id.name,
            email: id.email,
            buttons: ["Commit", "Commit & Push", "Cancel"],
            onAction: async (result) => {
                if (result.button !== "Commit" && result.button !== "Commit & Push") return false;
                const newBranch = result.branch.trim() !== (branch ?? "") ? result.branch.trim() : undefined;
                const committed = await model.changes.commit(
                    result.message,
                    { name: result.name, email: result.email },
                    newBranch,
                );
                if (!committed) return false;
                if (result.button === "Commit & Push") {
                    await model.branches.push();
                }
                return true;
            },
        });
    }, [model, branch]);

    // Primary action above the Staged grid — disabled when nothing is staged.
    const commitButton = (
        <Button name="git-commit" disabled={!staged.length} onClick={doCommit}>
            Commit
        </Button>
    );

    // Right-aligned buttons for the Staged section's toolbar.
    const stagedButtons = (
        <>
            <IconButton
                name="git-stage"
                size="sm"
                title="Stage selected"
                icon={<FilterArrowDownIcon />}
                disabled={!selUnstaged.length}
                onClick={() => stage(selUnstaged)}
            />
            <IconButton
                name="git-unstage"
                size="sm"
                title="Unstage selected"
                icon={<FilterArrowUpIcon />}
                disabled={!selStaged.length}
                onClick={() => unstage(selStaged)}
            />
        </>
    );

    // Initialize the split to ~50% once the panel has a measured height.
    useEffect(() => {
        if (bottomHeight !== undefined || !rootRef.current) return;
        const el = rootRef.current;
        let timer: ReturnType<typeof setTimeout>;
        const observer = new ResizeObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const h = el.clientHeight;
                if (h > 0) {
                    setBottomHeight(Math.max(60, h * 0.5));
                    observer.disconnect();
                }
            }, 200);
        });
        observer.observe(el);
        return () => { clearTimeout(timer); observer.disconnect(); };
    }, [bottomHeight]);

    const handleChangeHeight = useCallback((h: number) => {
        const container = rootRef.current;
        const maxH = container ? container.clientHeight * 0.85 : h;
        setBottomHeight(Math.max(60, Math.min(h, maxH)));
    }, []);

    if (!gitOk) {
        return (
            <Panel padding="md">
                <Text color="light">Git is unavailable.</Text>
            </Panel>
        );
    }

    return (
        <Panel
            name="git-changes"
            ref={rootRef}
            direction="column"
            flex={1}
            overflow="hidden"
            width="100%"
        >
            <Panel
                name="git-changes-unstaged"
                direction="column"
                flex={1}
                overflow="hidden"
                minHeight={60}
            >
                <ChangesList
                    model={model}
                    changes={unstaged}
                    label="Unstaged"
                    listKind="unstaged"
                    moveLabel="Stage"
                    moveIcon={<FilterArrowDownIcon />}
                    onMove={stage}
                    onReset={reset}
                    onSelectionChange={viewModel.setSelUnstaged}
                />
            </Panel>
            <Splitter
                name="git-changes-splitter"
                orientation="horizontal"
                value={bottomHeight ?? 150}
                onChange={handleChangeHeight}
                side="after"
                border="before"
            />
            <Panel
                name="git-changes-staged"
                direction="column"
                overflow="hidden"
                shrink={false}
                height={bottomHeight ?? 150}
                minHeight={60}
            >
                <ChangesList
                    model={model}
                    changes={staged}
                    label="Staged"
                    listKind="staged"
                    moveLabel="Unstage"
                    moveIcon={<FilterArrowUpIcon />}
                    onMove={unstage}
                    onSelectionChange={viewModel.setSelStaged}
                    toolbarRight={stagedButtons}
                    toolbarLeft={commitButton}
                />
            </Panel>
        </Panel>
    );
}

function ChangesList({
    model,
    changes,
    label,
    listKind,
    moveLabel,
    moveIcon,
    onMove,
    onReset,
    onSelectionChange,
    toolbarRight,
    toolbarLeft,
}: {
    model: GitTreeEditorModel;
    changes: GitFileChange[];
    /** Path-column header text — doubles as the section label (US-631). */
    label: string;
    /** Which list this is — picks the diff comparison preselected on single
     *  click (Staged → Last commit ↔ Staged; Unstaged → default) (US-637). */
    listKind: "unstaged" | "staged";
    /** Verb for the move action ("Stage" / "Unstage") — used in the context menu. */
    moveLabel: string;
    /** Icon for the move context-menu item. */
    moveIcon: ReactNode;
    /** Move these changes to the other list (stage/unstage). Used by double-click
     *  (one file) and the context menu (the selection) (US-631). */
    onMove: (changes: GitFileChange[]) => void;
    /** When set (Unstaged list only), adds a "Reset" context-menu item that
     *  discards the selection's changes (US-631). */
    onReset?: (changes: GitFileChange[]) => void;
    /** Range selection changed → report the selected changes to the parent. */
    onSelectionChange: (changes: GitFileChange[]) => void;
    /** Optional right-aligned content for the bottom bar (the Staged stage/unstage buttons). */
    toolbarRight?: ReactNode;
    /** Optional left-aligned content for the bottom bar (the Staged "Commit" button). */
    toolbarLeft?: ReactNode;
}) {
    // Key changes by repo-relative path (unique within a list); the FileGrid
    // item's filePath carries that path for icon + tooltip + lookup.
    const changeMap = useMemo(() => {
        const m = new Map<string, GitFileChange>();
        for (const c of changes) m.set(c.path, c);
        return m;
    }, [changes]);

    // Show the repo-relative path (not just the basename) so duplicate file
    // names (e.g. several "index.ts") are distinguishable — like Git Extensions.
    const items = useMemo<FileGridItem[]>(
        () => changes.map((c) => ({ filePath: c.path, title: c.path, status: c.status })),
        [changes],
    );

    const onClick = useCallback(
        (item: FileGridItem) => {
            const change = changeMap.get(item.filePath);
            if (change) model.openChangeDiff(change, listKind);
        },
        [model, changeMap, listKind],
    );

    const onDoubleClick = useCallback(
        (item: FileGridItem) => {
            const change = changeMap.get(item.filePath);
            if (change) onMove([change]);
        },
        [changeMap, onMove],
    );

    // Right-click → "Stage"/"Unstage" the selection (same action as the arrow
    // buttons / double-click), prepended above AVGrid's built-in Copy items.
    const getContextMenuItems = useCallback(
        (selected: FileGridItem[]): MenuItem[] => {
            const sel = selected
                .map((i) => changeMap.get(i.filePath))
                .filter((c): c is GitFileChange => !!c);
            if (!sel.length) return [];
            const n = sel.length;
            const items: MenuItem[] = [{
                label: `${moveLabel} ${n} file${n > 1 ? "s" : ""}`,
                icon: moveIcon,
                onClick: () => onMove(sel),
            }];
            if (onReset) {
                items.push({
                    label: `Reset ${n} file${n > 1 ? "s" : ""}`,
                    icon: <DeleteIcon />,
                    startGroup: true,
                    onClick: () => onReset(sel),
                });
            }
            return items;
        },
        [changeMap, moveLabel, moveIcon, onMove, onReset],
    );

    const handleSelectionChange = useCallback(
        (selected: FileGridItem[]) => {
            onSelectionChange(
                selected
                    .map((i) => changeMap.get(i.filePath))
                    .filter((c): c is GitFileChange => !!c),
            );
        },
        [changeMap, onSelectionChange],
    );

    const getTrailing = useCallback(
        (cell: import("../../uikit/DataGrid").CellContext<FileGridItem>): string => {
            const change = changeMap.get(cell.row.filePath);
            return change ? gitStatusMarkup(change.status) : "";
        },
        [changeMap],
    );

    return (
        <>
            {/* Single bar above the grid: left-aligned "Commit" + right-aligned
                stage/unstage arrows (Staged list only). */}
            {(toolbarLeft || toolbarRight) && (
                <Panel
                    name="git-changes-toolbar"
                    direction="row"
                    align="center"
                    paddingX="xs"
                    paddingY="xs"
                    gap="sm"
                    shrink={false}
                >
                    {toolbarLeft}
                    <Spacer />
                    {toolbarRight}
                </Panel>
            )}
            <Panel direction="column" flex={1} height={0} overflow="hidden">
                <FileGrid
                    name={`git-changes-${label.toLowerCase()}`}
                    label={label}
                    items={items}
                    onClick={onClick}
                    onDoubleClick={onDoubleClick}
                    onSelectionChange={handleSelectionChange}
                    getTrailing={getTrailing}
                    getContextMenuItems={getContextMenuItems}
                    compact
                />
            </Panel>
        </>
    );
}
