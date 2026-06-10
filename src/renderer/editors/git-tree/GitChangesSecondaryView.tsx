import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import { GitTreeEditorModel } from "./GitTreeEditorModel";
import { FileGrid, type FileGridItem } from "../../components/file-grid";
import { GitStatusBadge } from "../../components/git-tree";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Spacer } from "../../uikit/Spacer";
import { Splitter } from "../../uikit/Splitter";
import { IconButton } from "../../uikit/IconButton/IconButton";
import type { MenuItem } from "../../uikit/Menu";
import { showConfirmationDialog } from "../../ui/dialogs/ConfirmationDialog";
import { RefreshIcon, CloseIcon, GitIcon, FilterArrowUpIcon, FilterArrowDownIcon, DeleteIcon } from "../../theme/icons";
import type { GitFileChange } from "../../../ipc/git-ipc";

/** Expand a selection to git path args — renames need both new + old path so
 *  `git add` / `git reset` follow the rename (US-631). */
function expandPaths(changes: GitFileChange[]): string[] {
    return changes.flatMap((c) => (c.oldPath ? [c.path, c.oldPath] : [c.path]));
}

// =============================================================================
// Git Tree "Changes" secondary view (EPIC-031 / US-616).
//
// Two-part panel: unstaged (top) + staged (bottom), each a FileList with proper
// file icons, single-click → open the file's Git Diff, and a right-aligned
// colored status badge. Survives navigation (Pattern B; only-manual-close).
// =============================================================================

export default function GitChangesSecondaryView({ model, headerRef }: SecondaryViewProps) {
    // Type-guard before any hooks (same pattern as LinkTagsSecondaryView).
    if (!(model instanceof GitTreeEditorModel)) return null;
    return <GitChangesBody model={model} headerRef={headerRef} />;
}

function GitChangesBody({
    model,
    headerRef,
}: {
    model: GitTreeEditorModel;
    headerRef: SecondaryViewProps["headerRef"];
}) {
    const { unstaged, staged, gitOk } = model.changes.state.use((s) => ({
        unstaged: s.unstaged,
        staged: s.staged,
        gitOk: s.gitOk,
    }));

    // Unique changed-file count for the header (US-625 log #3). A file can appear in
    // BOTH lists (partially staged: some hunks staged, others not) — union the
    // repo-relative paths so it's counted once, rather than unstaged+staged which
    // would double-count it.
    const fileCount = useMemo(() => {
        const paths = new Set<string>();
        for (const c of unstaged) paths.add(c.path);
        for (const c of staged) paths.add(c.path);
        return paths.size;
    }, [unstaged, staged]);

    const rootRef = useRef<HTMLDivElement>(null);
    const [bottomHeight, setBottomHeight] = useState<number | undefined>(undefined);

    // Range selection per list (transient — not persisted, US-631 Concern #7).
    // Both arrow buttons live on the Staged header: ↓ stages the Unstaged
    // selection, ↑ unstages the Staged selection (US-631 Concern #4).
    const [selUnstaged, setSelUnstaged] = useState<GitFileChange[]>([]);
    const [selStaged, setSelStaged] = useState<GitFileChange[]>([]);

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

    const header = (
        <>
            {`[${model.repoName}] Changes (${fileCount})`}
            <Spacer />
            {/* Promote the Git Tree back to the page's main view (US-620). Useful
                after clicking a changed file opened its diff as the main editor —
                this brings the commit tree back without leaving the panel. */}
            <IconButton
                name="git-changes-show-tree"
                size="sm"
                title="Show Git Tree"
                icon={<GitIcon />}
                onClick={(e) => {
                    e.stopPropagation();
                    model.showGitTree();
                }}
            />
            <IconButton
                name="git-changes-refresh"
                size="sm"
                title="Refresh"
                icon={<RefreshIcon />}
                onClick={(e) => {
                    e.stopPropagation();
                    model.refresh();
                }}
            />
            {/* Unconditional "x" — intentionally NOT gated on "is main" like
                ArchiveSecondaryView. Closing while the Git Tree is the main
                editor leaves an empty page by design (US-617 Concern 2). Do not
                "align" this to the archive pattern. */}
            <IconButton
                name="git-changes-close"
                size="sm"
                title="Close Git Tree"
                icon={<CloseIcon />}
                onClick={(e) => {
                    e.stopPropagation();
                    void model.requestClose();
                }}
            />
        </>
    );

    return (
        <Panel
            name="git-changes"
            ref={rootRef}
            direction="column"
            flex={1}
            overflow="hidden"
            width="100%"
        >
            {headerRef && createPortal(header, headerRef)}
            {!gitOk ? (
                <Panel padding="md">
                    <Text color="light">Git is unavailable.</Text>
                </Panel>
            ) : (
                <>
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
                            moveLabel="Stage"
                            moveIcon={<FilterArrowDownIcon />}
                            onMove={stage}
                            onReset={reset}
                            onSelectionChange={setSelUnstaged}
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
                            moveLabel="Unstage"
                            moveIcon={<FilterArrowUpIcon />}
                            onMove={unstage}
                            onSelectionChange={setSelStaged}
                            toolbarRight={stagedButtons}
                        />
                    </Panel>
                </>
            )}
        </Panel>
    );
}

function ChangesList({
    model,
    changes,
    label,
    moveLabel,
    moveIcon,
    onMove,
    onReset,
    onSelectionChange,
    toolbarRight,
}: {
    model: GitTreeEditorModel;
    changes: GitFileChange[];
    /** Path-column header text — doubles as the section label (US-631). */
    label: string;
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
    /** Optional right-aligned toolbar content (the Staged stage/unstage buttons). */
    toolbarRight?: ReactNode;
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
            if (change) model.openChangeDiff(change);
        },
        [model, changeMap],
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
        (item: FileGridItem): ReactNode => {
            const change = changeMap.get(item.filePath);
            return change ? <GitStatusBadge status={change.status} /> : null;
        },
        [changeMap],
    );

    return (
        <>
            {toolbarRight && (
                <Panel
                    name="git-changes-toolbar"
                    direction="row"
                    align="center"
                    paddingX="xs"
                    shrink={false}
                >
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
