/**
 * Git Tree component (EPIC-030 / US-611).
 *
 * The reusable history view: an AVGrid whose first column is the SVG
 * `BranchTreeCell` swimlane graph, with subject / author / date / hash columns.
 * Presentational — the caller fetches commits (whole-repo or single-file via
 * `git.log`) and passes them in; layout runs internally. Reused by the Git Tree
 * editor (US-612) and the File Diff commit-picker popover (US-613).
 *
 * `components/` is app code (not uikit/), so Emotion is allowed for this
 * component's own elements — but only props are passed to AVGrid (Rule 7).
 */
import React, { useEffect, useMemo, useState } from "react";
import styled from "@emotion/styled";

import { AVGrid } from "../../uikit/AVGrid";
import type { CellFocus, Column, TCellFormater, TCellRendererProps } from "../../uikit/AVGrid";
import type { GitCommit, GitRefKind } from "../../../ipc/git-ipc";
import { TAG_COLORS } from "../../theme/palette-colors";
import color from "../../theme/color";
import { fontSize, radius, spacing } from "../../uikit/tokens";
import {
    GIT_TREE_ROW_HEIGHT,
    graphWidth,
    makeBranchTreeCell,
} from "./BranchTreeCell";
import {
    maxColumnCount,
    toCommitRows,
    type GitCommitRow,
} from "./swimlane-layout";

const LANE_COLORS = TAG_COLORS.map((c) => c.hex);

// Ref-label colors picked from the shared palette by name (theme-safe, no raw
// hardcodes): branch = blue, remote = lighter blue, tag = pink, HEAD = green.
const paletteHex = (name: string) =>
    TAG_COLORS.find((c) => c.name === name)?.hex ?? color.text.default;
const REF_COLOR: Record<GitRefKind, string> = {
    head: paletteHex("Lime Green"),
    branch: paletteHex("Dodger Blue"),
    remote: paletteHex("Cornflower Blue"),
    tag: paletteHex("Hot Pink"),
};

export interface GitTreeProps {
    /** Optional debug label forwarded to the underlying AVGrid. */
    name?: string;
    /** Commits newest→oldest, as returned by `git.log`. */
    commits: GitCommit[];
    /** Currently selected commit hash (highlights the row). */
    selectedHash?: string;
    /** Fired when a row is clicked. */
    onSelectCommit?: (hash: string) => void;
    /** Compact layout for the File-Diff popover: graph + subject + hash only. */
    compact?: boolean;
    /** More history is available beyond the loaded commits — renders "Load more". */
    hasMore?: boolean;
    /** A "load more" / "load all" fetch is in flight (footer shows a loading label). */
    loadingMore?: boolean;
    /** Called when the user clicks "Load more" (next page; only rendered when hasMore). */
    onLoadMore?: () => void;
    /** Called when the user clicks "Load all" (all remaining commits). */
    onLoadAll?: () => void;
}

const RefTag = styled.span({
    display: "inline-block",
    marginRight: spacing.sm,
    padding: `0 ${spacing.sm}px`,
    borderRadius: radius.xs,
    fontSize: fontSize.xs,
    fontWeight: 600,
    border: `1px solid ${color.border.default}`,
    // `color` (text) is set per-kind inline; border stays neutral.
});

// Pinned to the bottom of the (relative, content-height) render area — the same
// trick AVGrid's built-in add-row button uses. A normal-flow element would
// collapse to the top behind the absolutely-positioned cells. Opaque background
// so it reads as a footer over the bottom whitespace.
const LoadMoreRow = styled.div({
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    height: GIT_TREE_ROW_HEIGHT,
    background: color.background.default,
    fontSize: fontSize.sm,
    userSelect: "none",
});

const LoadMoreLink = styled.span({
    cursor: "pointer",
    color: color.text.default,
    "&:hover": { textDecoration: "underline" },
    "&[data-disabled]": { opacity: 0.6, cursor: "default", textDecoration: "none" },
});

const LoadMoreSep = styled.span({
    color: color.text.light,
});

const SubjectWrap = styled.span({
    display: "inline-flex",
    alignItems: "center",
    minWidth: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
});

function rowOf(props: TCellRendererProps): GitCommitRow | undefined {
    return props.model.data.rows[props.row] as GitCommitRow | undefined;
}

const subjectFormatter: TCellFormater = (props) => {
    const r = rowOf(props);
    if (!r) return null;
    return (
        <SubjectWrap>
            {r.refs.map((ref) => (
                <RefTag key={`${ref.kind}:${ref.name}`} style={{ color: REF_COLOR[ref.kind] }}>
                    {ref.name}
                </RefTag>
            ))}
            {r.subject}
        </SubjectWrap>
    );
};

const authorFormatter: TCellFormater = (props) => rowOf(props)?.authorName ?? "";

const dateText = (ms: number) => (ms ? new Date(ms).toLocaleString() : "");

const dateFormatter: TCellFormater = (props) => dateText(rowOf(props)?.authorDate ?? 0);

const hashFormatter: TCellFormater = (props) => rowOf(props)?.shortHash ?? "";

// Rows are flat (commit fields spread in), so AVGrid range-copy reads `row[key]`
// directly for the string columns. Only the graph (no field) and the date
// (number → readable) need an explicit `formatValue`.
function buildColumns(maxColumns: number, compact: boolean): Column<GitCommitRow>[] {
    const graph: Column<GitCommitRow> = {
        key: "graph",
        name: "",
        width: graphWidth(maxColumns),
        resizible: true,
        cellRenderer: makeBranchTreeCell(maxColumns),
        formatValue: () => "",
    };
    const subject: Column<GitCommitRow> = {
        key: "subject",
        name: "Comment",
        width: compact ? 240 : 360,
        resizible: true,
        cellFormater: subjectFormatter,
    };
    const hash: Column<GitCommitRow> = {
        key: "shortHash",
        name: "Commit",
        width: 80,
        resizible: true,
        cellFormater: hashFormatter,
    };
    if (compact) return [graph, subject, hash];
    return [
        graph,
        subject,
        { key: "authorName", name: "Author", width: 140, resizible: true, cellFormater: authorFormatter },
        { key: "authorDate", name: "Date", width: 160, resizible: true, cellFormater: dateFormatter, formatValue: (_c, r) => dateText(r.authorDate) },
        hash,
    ];
}

export function GitTree({
    name,
    commits,
    selectedHash,
    onSelectCommit,
    compact = false,
    hasMore = false,
    loadingMore = false,
    onLoadMore,
    onLoadAll,
}: GitTreeProps) {
    const rows = useMemo(() => toCommitRows(commits, LANE_COLORS), [commits]);
    const maxColumns = useMemo(() => maxColumnCount(rows), [rows]);

    // Columns are stateful so AVGrid's resize handler (via setColumns) can
    // persist user-dragged widths. Rebuilt when the structure changes
    // (compact toggled, or maxColumns shifts after loading different commits) —
    // that resets widths, which is the right behavior on a structural change.
    const [columns, setColumns] = useState<Column<GitCommitRow>[]>(() =>
        buildColumns(maxColumns, compact),
    );
    useEffect(() => {
        setColumns(buildColumns(maxColumns, compact));
    }, [maxColumns, compact]);

    const selected = useMemo(
        () => new Set<string>(selectedHash ? [selectedHash] : []),
        [selectedHash],
    );

    // Cell focus + range selection (enables AVGrid's range-copy). Held here, in
    // the AVGrid's parent, per the controlled focus/setFocus contract.
    const [focus, setFocus] = useState<CellFocus<GitCommitRow> | undefined>(undefined);

    const loadMore = hasMore ? (
        <LoadMoreRow data-type="git-tree-load-more">
            {loadingMore ? (
                <LoadMoreLink data-disabled>Loading…</LoadMoreLink>
            ) : (
                <>
                    <LoadMoreLink onClick={onLoadMore}>Load more</LoadMoreLink>
                    <LoadMoreSep>·</LoadMoreSep>
                    <LoadMoreLink onClick={onLoadAll}>Load all</LoadMoreLink>
                </>
            )}
        </LoadMoreRow>
    ) : undefined;

    return (
        <AVGrid<GitCommitRow>
            name={name}
            columns={columns}
            setColumns={setColumns}
            rows={rows}
            getRowKey={(r) => r.hash}
            rowHeight={GIT_TREE_ROW_HEIGHT}
            selected={selected}
            onClick={(r) => onSelectCommit?.(r.hash)}
            focus={focus}
            setFocus={setFocus}
            disableFiltering
            disableSorting
            extraElement={loadMore}
        />
    );
}
