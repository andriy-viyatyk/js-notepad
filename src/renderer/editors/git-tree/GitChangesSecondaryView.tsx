import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import { GitTreeEditorModel } from "./GitTreeEditorModel";
import { FileList, type FileListItem } from "../../components/file-list";
import { GitStatusBadge } from "../../components/git-tree";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Spacer } from "../../uikit/Spacer";
import { Splitter } from "../../uikit/Splitter";
import { IconButton } from "../../uikit/IconButton/IconButton";
import { RefreshIcon, CloseIcon, GitIcon } from "../../theme/icons";
import type { GitFileChange } from "../../../ipc/git-ipc";

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

    const rootRef = useRef<HTMLDivElement>(null);
    const [bottomHeight, setBottomHeight] = useState<number | undefined>(undefined);

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
            {`[${model.repoName}] Changes`}
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
                        <ChangesList model={model} changes={unstaged} label="Unstaged" />
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
                        <ChangesList model={model} changes={staged} label="Staged" />
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
}: {
    model: GitTreeEditorModel;
    changes: GitFileChange[];
    label: string;
}) {
    // Key changes by repo-relative path (unique within a list); the FileList
    // item's filePath carries that path for icon + tooltip + lookup.
    const changeMap = useMemo(() => {
        const m = new Map<string, GitFileChange>();
        for (const c of changes) m.set(c.path, c);
        return m;
    }, [changes]);

    // Show the repo-relative path (not just the basename) so duplicate file
    // names (e.g. several "index.ts") are distinguishable — like Git Extensions.
    const items = useMemo<FileListItem[]>(
        () => changes.map((c) => ({ filePath: c.path, title: c.path })),
        [changes],
    );

    const onClick = useCallback(
        (item: FileListItem) => {
            const change = changeMap.get(item.filePath);
            if (change) model.openChangeDiff(change);
        },
        [model, changeMap],
    );

    const getTrailing = useCallback(
        (item: FileListItem): ReactNode => {
            const change = changeMap.get(item.filePath);
            return change ? <GitStatusBadge status={change.status} /> : null;
        },
        [changeMap],
    );

    return (
        <>
            <Panel name="git-changes-section-label" padding="xs">
                <Text color="light">{label}</Text>
            </Panel>
            {items.length === 0 ? (
                <Panel padding="md">
                    <Text color="light">No changes</Text>
                </Panel>
            ) : (
                <FileList items={items} onClick={onClick} getTrailing={getTrailing} compact />
            )}
        </>
    );
}
