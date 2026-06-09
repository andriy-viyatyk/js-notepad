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
import React, { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import styled from "@emotion/styled";
import { clsx } from "clsx";

import { AVGrid, AVGridModel } from "../../uikit/AVGrid";
import type { CellFocus, Column, TCellFormater, TCellRenderer, TCellRendererProps } from "../../uikit/AVGrid";
import type { GitRefKind } from "../../../ipc/git-ipc";
import type { GitTreeModel } from "./GitTreeModel";
import { SideSelectToggle } from "./SideSelectToggle";
import { TruncatedText } from "../../uikit/TruncatedText";
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

/**
 * Side-select wiring for the Git Diff "File History" panel (US-618). When passed,
 * `GitTree` prepends a fixed, sticky-left L/R status column whose toggles reflect
 * (and mutate) the diff's `from`/`to`. Row-aware (works for both commit rows and
 * the synthetic Unstaged/Staged rows) so all diff-specific logic stays in the
 * panel and `GitTree` stays generic. Not used by the popovers (they pick a single
 * endpoint via `onSelectCommit`).
 */
export interface GitTreeSideSelect {
    /** Changes whenever the diff's from/to changes — the trigger for repainting
     *  the L/R column (`gridRef.update({ columns: [0] })`). */
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

export interface GitTreeProps {
    /** Optional debug label forwarded to the underlying AVGrid. */
    name?: string;
    /** Data + load/pagination model, owned by the editor (model-view). The
     *  component renders from `model.state` and calls `model.loadMore()` /
     *  `model.loadAll()`; it never fetches directly. */
    model: GitTreeModel;
    /** Currently selected commit hash (highlights the row). */
    selectedHash?: string;
    /** Fired when a row is clicked. */
    onSelectCommit?: (hash: string) => void;
    /** Compact layout for the file-scoped views (File-Diff popover + File History
     *  panel): date + subject + hash, no swimlane graph (US-618). */
    compact?: boolean;
    /** Git Diff "File History" panel only (US-618): adds a leading L/R side-select
     *  column. Omit for the popovers and the whole-repo editor. */
    sideSelect?: GitTreeSideSelect;
    /** Synthetic rows prepended before the commit history (US-618) — the panel's
     *  Unstaged/Staged endpoint rows. Build with `syntheticCommitRow`. Memoize at
     *  the caller so the rows reference is stable. */
    leadingRows?: GitCommitRow[];
}

const RefTag = styled.span({
    display: "inline-block",
    flexShrink: 0, // chips keep their size; the subject's TruncatedText absorbs shrink
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

function rowOf(props: TCellRendererProps): GitCommitRow | undefined {
    return props.model.data.rows[props.row] as GitCommitRow | undefined;
}

// Synthetic endpoint rows (Unstaged/Staged) render their label muted + italic so
// they read as special rows, not commits (US-618).
const SpecialSubject = styled.span({
    fontStyle: "italic",
    color: color.text.light,
}, { label: "GitTreeSpecialSubject" });

// Each text column wraps its content in <TruncatedText> (like AVGrid's DataCell):
// it ellipsizes when it doesn't fit the column and shows the full text in a
// hover tooltip. The ref chips stay full-size (RefTag flexShrink:0); the
// subject's TruncatedText absorbs the shrink.
const subjectFormatter: TCellFormater = (props) => {
    const r = rowOf(props);
    if (!r) return null;
    if (r.recordType !== "commit") {
        return <SpecialSubject>{r.subject}</SpecialSubject>;
    }
    return (
        <>
            {r.refs.map((ref) => (
                <RefTag key={`${ref.kind}:${ref.name}`} style={{ color: REF_COLOR[ref.kind] }}>
                    {ref.name}
                </RefTag>
            ))}
            <TruncatedText>{r.subject}</TruncatedText>
        </>
    );
};

const authorFormatter: TCellFormater = (props) => {
    const r = rowOf(props);
    return r ? <TruncatedText>{r.authorName}</TruncatedText> : null;
};

// Developer-friendly, zero-padded, local-time format `YYYY-MM-DD HH:mm` (24-hour,
// no seconds — US-618). Used by every git-history view (popovers, Revisions panel,
// whole-repo editor) since both date columns route through here.
const pad = (n: number) => String(n).padStart(2, "0");
const dateText = (ms: number) => {
    if (!ms) return "";
    const d = new Date(ms);
    return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
};

const dateFormatter: TCellFormater = (props) => {
    const r = rowOf(props);
    return r ? <TruncatedText>{dateText(r.authorDate)}</TruncatedText> : null;
};

const hashFormatter: TCellFormater = (props) => {
    const r = rowOf(props);
    return r ? <TruncatedText>{r.shortHash}</TruncatedText> : null;
};

// Cell root for the L/R side-select column. A custom cellRenderer fully replaces
// DataCell, so it applies `props.style` (absolute box from RenderGrid), forwards
// `className` (row-selected / row-hovered overlays), and paints its own cell
// chrome — mirroring BranchTreeCell.
const SideSelectCellRoot = styled.div(
    {
        // border-box so the 1px borderRight stays INSIDE the column width — without
        // it the border overflows by 1px into the date cell and clips its left
        // selection border (matches AVGrid's default DataCell; US-618).
        boxSizing: "border-box",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: color.grid.dataCellBackground,
        borderBottom: `solid 1px ${color.grid.borderColor}`,
        borderRight: `solid 1px ${color.grid.borderColor}`,
    },
    { label: "SideSelectCell" },
);

// Build the L/R cell renderer bound (via a stable ref) to the live `sideSelect`,
// so `from`/`to` changes are reflected without rebuilding the columns (which would
// reset user-dragged widths). The owning component forces this column to re-render
// on selection change via `gridRef.update({ columns: [0] })`.
function makeSideSelectCell(ref: RefObject<GitTreeSideSelect | undefined>): TCellRenderer {
    function SideSelectCell(props: Readonly<TCellRendererProps>) {
        const { row, model, style, className } = props;
        const r = model.data.rows[row] as GitCommitRow | undefined;
        const sel = ref.current;
        if (!r || !sel) {
            return <SideSelectCellRoot style={style} className={clsx(className)} />;
        }
        return (
            <SideSelectCellRoot style={style} className={clsx(className)}>
                <SideSelectToggle
                    showLeft={sel.showLeft(r)}
                    leftActive={sel.isLeftActive(r)}
                    rightActive={sel.isRightActive(r)}
                    onPickLeft={() => ref.current?.onPickLeft(r)}
                    onPickRight={() => ref.current?.onPickRight(r)}
                />
            </SideSelectCellRoot>
        );
    }
    return SideSelectCell;
}

// Rows are flat (commit fields spread in), so AVGrid range-copy reads `row[key]`
// directly for the string columns. Only the graph (no field) and the date
// (number → readable) need an explicit `formatValue`.
function buildColumns(
    maxColumns: number,
    compact: boolean,
    sideSelectCell?: TCellRenderer,
): Column<GitCommitRow>[] {
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
    const date: Column<GitCommitRow> = {
        key: "authorDate",
        name: "Date",
        // Compact (file-scoped): ~date-only width (`YYYY-MM-DD`), resizable to
        // reveal the time. Whole-repo editor: wide enough for the full string.
        width: compact ? 94 : 160,
        resizible: true,
        cellFormater: dateFormatter,
        formatValue: (_c, r) => dateText(r.authorDate),
    };
    if (compact) {
        // File-scoped views: no swimlane graph (meaningless for a filtered, single
        // -file history); date leads the content columns (US-618).
        const cols: Column<GitCommitRow>[] = [date, subject, hash];
        if (sideSelectCell) {
            // L/R side-select — fixed, sticky-left, non-resizable status column
            // (Revisions panel only).
            cols.unshift({
                key: "--side-select--",
                name: "",
                width: 56,
                isStatusColumn: true,
                cellRenderer: sideSelectCell,
                formatValue: () => "",
            });
        }
        return cols;
    }
    const graph: Column<GitCommitRow> = {
        key: "graph",
        name: "",
        width: graphWidth(maxColumns),
        resizible: true,
        cellRenderer: makeBranchTreeCell(maxColumns),
        formatValue: () => "",
    };
    return [
        graph,
        subject,
        { key: "authorName", name: "Author", width: 140, resizible: true, cellFormater: authorFormatter },
        date,
        hash,
    ];
}

export function GitTree({
    name,
    model,
    selectedHash,
    onSelectCommit,
    compact = false,
    sideSelect,
    leadingRows,
}: GitTreeProps) {
    const { commits, loadingMore, hasMore } = model.state.use((s) => ({
        commits: s.commits,
        loadingMore: s.loadingMore,
        hasMore: s.hasMore,
    }));
    const rows = useMemo(() => {
        const commitRows = toCommitRows(commits, LANE_COLORS);
        return leadingRows?.length ? [...leadingRows, ...commitRows] : commitRows;
    }, [commits, leadingRows]);
    const maxColumns = useMemo(() => maxColumnCount(rows), [rows]);

    // Live `sideSelect` behind a stable ref so the L/R cell reads current
    // `from`/`to` without rebuilding columns (which would reset widths).
    const sideSelectRef = useRef<GitTreeSideSelect | undefined>(sideSelect);
    sideSelectRef.current = sideSelect;
    const hasSideSelect = !!sideSelect;
    const sideSelectCell = useMemo(
        () => (hasSideSelect ? makeSideSelectCell(sideSelectRef) : undefined),
        [hasSideSelect],
    );

    // AVGrid model handle — used to repaint only the L/R column when the diff's
    // from/to changes (US-618: `update({ columns: [0] })`).
    const gridRef = useRef<AVGridModel<GitCommitRow>>(undefined);
    useEffect(() => {
        if (hasSideSelect) gridRef.current?.update({ columns: [0] });
    }, [hasSideSelect, sideSelect?.selectionKey]);

    // Columns are stateful so AVGrid's resize handler (via setColumns) can
    // persist user-dragged widths. Rebuilt when the structure changes
    // (compact toggled, sideSelect added/removed, or maxColumns shifts after
    // loading different commits) — that resets widths, the right behavior on a
    // structural change.
    const [columns, setColumns] = useState<Column<GitCommitRow>[]>(() =>
        buildColumns(maxColumns, compact, sideSelectCell),
    );
    useEffect(() => {
        setColumns(buildColumns(maxColumns, compact, sideSelectCell));
    }, [maxColumns, compact, sideSelectCell]);

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
                    <LoadMoreLink onClick={() => void model.loadMore()}>Load more</LoadMoreLink>
                    <LoadMoreSep>·</LoadMoreSep>
                    <LoadMoreLink onClick={() => void model.loadAll()}>Load all</LoadMoreLink>
                </>
            )}
        </LoadMoreRow>
    ) : undefined;

    return (
        <AVGrid<GitCommitRow>
            ref={gridRef}
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
