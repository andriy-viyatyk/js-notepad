/**
 * Git Tree component (EPIC-030 / US-611; moved onto av-grid in EPIC-057 / US-1021).
 *
 * The reusable history view: a grid whose first column is the SVG `BranchTreeCell` swimlane graph,
 * with subject / author / date / hash columns. Presentational — the caller fetches commits
 * (whole-repo or single-file via `git.log`) and passes them in; layout runs internally. Reused by
 * the Git Tree editor (US-612) and the File Diff commit-picker popover (US-613).
 *
 * ## No state, on purpose
 *
 * `uikit/AVGrid` was fully controlled: this component held `columns` and `focus` in React state,
 * passed them down, and took setters back. av-grid owns both, so the state, the view model, the
 * `setColumns` wrapper and its deferred rebuild are all gone (EPIC-057 C4-2, US-1021 D1). What is
 * left is props in, imperative calls out — which is also the shape Epic D/E will convert to a
 * vanilla view.
 *
 * The cells are `render` hooks returning HTML strings, so their styling lives in `GitTree.css`
 * rather than in Emotion. `components/` is app code, so the CSS goes in `@layer app`, which
 * outranks av-grid's own layer.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";

import {
    DataGrid,
    defaultColumnWidth,
    type CellContext,
    type CellRenderer,
    type Column,
    type DataGridInstance,
    type GridContextMenuEvent,
} from "../../uikit/DataGrid";
import type { MenuItem } from "../../uikit/Menu";
import { showGridContextMenu } from "../../ui/dialogs/poppers/grid-context-menu";
import type { GitTreeModel } from "./GitTreeModel";
import { TAG_COLORS } from "../../theme/palette-colors";
import { REF_COLOR } from "./RefBadge";
import { dateText } from "./git-date";
import {
    GIT_TREE_ROW_HEIGHT,
    graphWidth,
    makeBranchTreeCell,
} from "./branch-tree-cell";
import { createLoadMoreFooter } from "./load-more-footer";
import { SIDE_SELECT_KEY, handleSideSelectClick, makeSideSelectCell } from "./side-select-cell";
import {
    maxColumnCount,
    toCommitRows,
    type GitCommitRow,
} from "./swimlane-layout";
import "./GitTree.css";

const LANE_COLORS = TAG_COLORS.map((c) => c.hex);

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
     *  the L/R column (`grid.refresh()`). */
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

/**
 * Serializable grid column layout — the user's dragged widths + column order
 * (order = array index), keyed by `Column.key`. The owner (e.g. the Git Tree
 * editor) persists this in its descriptor state so widths/order survive
 * navigation-away/back and app restart (US-623). Holds only plain data — the
 * non-serializable `Column` objects (cell renderers/formatters) are rebuilt by
 * the component from data + this layout.
 */
export type GitColumnLayout = { key: string; width: number | `${number}%` }[];

export interface GitTreeProps {
    /** Optional debug label forwarded to the underlying grid. */
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
    /** Owner-persisted column layout (width + order) applied ONCE at mount, so
     *  user resizing/reordering survives a remount (navigation-back / restart).
     *  Read-once — later changes to this prop are ignored; the live layout is
     *  reported back via `onColumnLayoutChange` (US-623). */
    initialColumnLayout?: GitColumnLayout;
    /** Called whenever the user resizes or reorders a column (NOT on the
     *  component's own structural rebuilds / graph re-fit). The owner stores this
     *  in its descriptor state (US-623). */
    onColumnLayoutChange?: (layout: GitColumnLayout) => void;
    /** Per-selection context menu for commit rows (US-636). Returns the items for
     *  the current grid selection; `undefined`/`[]` suppresses the menu. Only the
     *  whole-repo editor passes this — the file-scoped popovers / History panel
     *  omit it (no switch from a filtered single-file view). */
    getContextMenuItems?: (rows: GitCommitRow[]) => MenuItem[];
}

const getRowKey = (row: GitCommitRow) => row.hash;

/** Resize fires on every pointermove, and the owner persists what it reports. */
const RESIZE_EMIT_DELAY = 150;

/**
 * The subject cell: decoration chips, then the commit subject.
 *
 * `cell.highlight()` escapes and marks the active search words in one call — this grid sets no
 * search string, so it is the escaping that matters, and it is the right way to put a commit
 * subject into a `render` string either way.
 *
 * The text span carries av-grid's own `avg-cell-text` class, which is how a `render` column opts
 * into the truncation the library gives a plain text cell — and, through the same class, into the
 * hover-to-read tooltip (US-1024). It must stay a **direct** child of the cell, which is what the
 * library's rule selects; the chips are its siblings.
 */
const renderSubject = (cell: CellContext<GitCommitRow>): string => {
    const row = cell.row;
    if (!row) return "";
    if (row.recordType !== "commit") {
        return `<span class="git-special-subject avg-cell-text">${cell.highlight(row.subject)}</span>`;
    }
    let chips = "";
    for (const ref of row.refs) {
        chips +=
            `<span class="git-ref-badge" style="color:${REF_COLOR[ref.kind]}">` +
            `${cell.highlight(ref.name)}</span>`;
    }
    return `${chips}<span class="avg-cell-text">${cell.highlight(row.subject)}</span>`;
};

/**
 * The short hash, green on the HEAD commit — so the active commit stays marked even when HEAD is
 * detached and has no branch label to colour (US-636).
 *
 * A `render` rather than a `cellClass` because `REF_COLOR.head` is palette hex, not a CSS custom
 * property, so a stylesheet cannot name it without hardcoding a colour.
 */
const renderHash = (cell: CellContext<GitCommitRow>): string => {
    const row = cell.row;
    if (!row) return "";
    const isHead = row.recordType === "commit" && row.refs.some((ref) => ref.kind === "head");
    // The colour goes on the text span itself rather than on a wrapper around it: av-grid's
    // truncation rule selects a *direct* child of the cell, so nesting would leave the HEAD
    // commit's hash as the one cell in the column that neither ellipsizes nor tooltips.
    const style = isHead ? ` style="color:${REF_COLOR.head}"` : "";
    return `<span class="avg-cell-text"${style}>${cell.highlight(row.shortHash)}</span>`;
};

/**
 * Rows are flat (commit fields spread in), so range-copy reads `row[key]` directly for the string
 * columns and Author needs no hook at all — av-grid's default cell shows `row[key]` and ellipsizes
 * it. Only the graph and the side-select column (no field) and the date (number → readable) need
 * an explicit `formatValue`.
 */
function buildColumns(
    maxColumns: number,
    compact: boolean,
    sideSelectCell?: CellRenderer<GitCommitRow>,
): Column<GitCommitRow>[] {
    const subject: Column<GitCommitRow> = {
        key: "subject",
        name: "Comment",
        width: compact ? 240 : 360,
        resizable: true,
        render: renderSubject,
    };
    const hash: Column<GitCommitRow> = {
        key: "shortHash",
        name: "Commit",
        width: 80,
        resizable: true,
        render: renderHash,
    };
    const date: Column<GitCommitRow> = {
        key: "authorDate",
        name: "Date",
        // Compact (file-scoped): ~date-only width (`YYYY-MM-DD`), resizable to
        // reveal the time. Whole-repo editor: wide enough for the full string.
        width: compact ? 94 : 160,
        resizable: true,
        formatValue: (_c, r) => dateText(r.authorDate),
    };
    if (compact) {
        // File-scoped views: no swimlane graph (meaningless for a filtered, single
        // -file history); date leads the content columns (US-618).
        const cols: Column<GitCommitRow>[] = [date, subject, hash];
        if (sideSelectCell) {
            // L/R side-select — fixed, sticky-left, non-resizable status column
            // (Revisions panel only). `isStatusColumn` also makes av-grid ignore the press
            // entirely (no focus move, no range drag), which is half the row-click suppression.
            cols.unshift({
                key: SIDE_SELECT_KEY,
                name: "",
                width: 56,
                isStatusColumn: true,
                render: sideSelectCell,
                formatValue: () => "",
            });
        }
        return cols;
    }
    const graph: Column<GitCommitRow> = {
        key: "graph",
        name: "",
        width: graphWidth(maxColumns),
        resizable: true,
        render: makeBranchTreeCell(maxColumns),
        formatValue: () => "",
    };
    return [
        graph,
        subject,
        { key: "authorName", name: "Author", width: 140, resizable: true },
        date,
        hash,
    ];
}

/**
 * Apply an owner-persisted layout (width + order) to freshly-built columns
 * (US-623). Widths are matched by key; the array is reordered to the stored
 * order. Keys absent from the layout (e.g. a column added since the layout was
 * saved) keep their relative order at the end. A no-op when no layout is stored.
 *
 * Status columns are hoisted back to the front afterwards. av-grid stops a status *header* from
 * being dragged but does not exclude it as a drop target, so a user can land a normal column ahead
 * of it — and the resulting `stickyLeft` then spans a non-status column. Without this guard a
 * persisted layout would faithfully restore that (US-1021).
 */
function applyLayout(
    cols: Column<GitCommitRow>[],
    layout: GitColumnLayout | undefined,
): Column<GitCommitRow>[] {
    if (!layout?.length) return cols;
    const widthByKey = new Map(layout.map((l) => [l.key, l.width]));
    const orderByKey = new Map(layout.map((l, i) => [l.key, i]));
    const withWidth = cols.map((c) =>
        widthByKey.has(String(c.key)) ? { ...c, width: widthByKey.get(String(c.key)) } : c,
    );
    const ordered = withWidth
        .map((c, i) => ({
            c,
            rank: orderByKey.has(String(c.key)) ? orderByKey.get(String(c.key)) : layout.length + i,
        }))
        .sort((a, b) => a.rank - b.rank)
        .map((x) => x.c);
    return [
        ...ordered.filter((c) => c.isStatusColumn),
        ...ordered.filter((c) => !c.isStatusColumn),
    ];
}

/**
 * Re-fit ONLY the graph (swimlane) column to a new branch-lane count, in place —
 * preserving its position and every other column's user-set width + order. Both
 * the width and the cell renderer encode `maxColumns`, so update both (US-622).
 * Returns the same array reference when there is no graph column (compact views),
 * so the caller can skip the `setColumns`.
 *
 * The array handed in is `grid.getColumns()`, which is the grid's live array — already carrying
 * every user width and the user's exact order — so nothing has to be merged. The `slice()` is
 * what keeps this from writing through it.
 */
function refitGraphColumn(
    cols: Column<GitCommitRow>[],
    maxColumns: number,
): Column<GitCommitRow>[] {
    const i = cols.findIndex((c) => c.key === "graph");
    if (i < 0) return cols;
    const next = cols.slice();
    next[i] = {
        ...next[i],
        width: graphWidth(maxColumns),
        render: makeBranchTreeCell(maxColumns),
    };
    return next;
}

export function GitTree(props: GitTreeProps) {
    const {
        name,
        model,
        selectedHash,
        onSelectCommit,
        compact = false,
        sideSelect,
        leadingRows,
        initialColumnLayout,
        onColumnLayoutChange,
        getContextMenuItems,
    } = props;
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

    const gridRef = useRef<DataGridInstance<GitCommitRow> | undefined>(undefined);

    /**
     * The columns, built ONCE — and never handed to the grid again.
     *
     * `DataGridView` diffs value props by identity and pushes changes through `setOptions`, so a
     * new `columns` identity on any later render would replace the grid's live array and wipe the
     * widths the user dragged. The grid owns the columns from `create()` onward (US-1021 D1);
     * structural rebuilds and the graph re-fit go through `grid.setColumns()` below.
     */
    const initialColumns = useRef<Column<GitCommitRow>[] | undefined>(undefined);
    if (!initialColumns.current) {
        initialColumns.current = applyLayout(
            buildColumns(maxColumns, compact, sideSelectCell),
            initialColumnLayout,
        );
    }

    /**
     * Report the live layout to the owner for persistence.
     *
     * Wired only to `onColumnResize` / `onColumnsReorder`, which av-grid raises **only** from user
     * interaction — a programmatic `setColumns` reaches `onColumnsChange` and nothing else. So the
     * component's own rebuilds are silent structurally, where the React version needed a wrapper
     * to tell the two apart (US-1021 F1). Both callbacks fire after the array is updated, so
     * `getColumns()` is already current.
     */
    const emitLayout = useCallback(() => {
        const grid = gridRef.current;
        if (!grid || !onColumnLayoutChange) return;
        onColumnLayoutChange(
            grid.getColumns().map((c) => ({
                key: String(c.key),
                width: c.width ?? defaultColumnWidth,
            })),
        );
    }, [onColumnLayoutChange]);

    // A resize fires on every pointermove and the owner persists what it receives, so trail it.
    // A reorder fires once per drop and emits directly.
    const emitTimer = useRef<number | undefined>(undefined);
    const scheduleEmitLayout = useCallback(() => {
        if (emitTimer.current !== undefined) window.clearTimeout(emitTimer.current);
        emitTimer.current = window.setTimeout(() => {
            emitTimer.current = undefined;
            emitLayout();
        }, RESIZE_EMIT_DELAY);
    }, [emitLayout]);
    useEffect(
        () => () => {
            if (emitTimer.current !== undefined) window.clearTimeout(emitTimer.current);
        },
        [],
    );

    // Register the grid with the model so the owning editor can focus a commit row imperatively —
    // e.g. reveal a branch/tag clicked in the "Branches & Tags" panel (US-634) — and seed the
    // selection, since `selected` is an initial-only option (US-1021 F2).
    const onGrid = useCallback(
        (grid: DataGridInstance<GitCommitRow> | null) => {
            gridRef.current = grid ?? undefined;
            model.setGrid(grid ?? undefined);
            if (grid && selectedHash) grid.setSelected([selectedHash]);
        },
        // `selectedHash` is deliberately not a dependency: this runs on mount and on a model
        // change, and the effect below owns every later change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [model],
    );

    /**
     * Columns are generated ONCE on first mount, then preserved across refresh / load-more
     * (US-622):
     *   - A *structural* change (compact toggled, or the L/R side-select column added/removed)
     *     rebuilds from scratch — resetting widths/order is the right behavior there.
     *   - Otherwise, when more commits load and the branch-lane count shifts, we re-fit ONLY the
     *     graph column — its width and cell renderer both depend on `maxColumns` — leaving every
     *     other column's user width and the user's column order untouched. Compact views (no
     *     graph) are fully preserved.
     *
     * Synchronous, unlike the React version's `queueMicrotask` hop: there is no `setState` here to
     * loop back through render, so there is nothing to defer and no staleness to re-check.
     */
    const structureKey = `${compact}|${hasSideSelect}`;
    const builtStructureKey = useRef(structureKey);
    const previousMaxColumns = useRef(maxColumns);
    useEffect(() => {
        const grid = gridRef.current;
        const structureChanged = builtStructureKey.current !== structureKey;
        const maxColumnsChanged = previousMaxColumns.current !== maxColumns;
        builtStructureKey.current = structureKey;
        previousMaxColumns.current = maxColumns;
        if (!grid) return;
        if (structureChanged) {
            grid.setColumns(buildColumns(maxColumns, compact, sideSelectCell));
        } else if (maxColumnsChanged && !compact) {
            grid.setColumns(refitGraphColumn(grid.getColumns(), maxColumns));
        }
    }, [structureKey, maxColumns, compact, sideSelectCell]);

    // The row highlight. `selected` is initial-only in the shim — av-grid owns the selection after
    // `create()` — so this is imperative rather than a prop (US-1021 F2).
    useEffect(() => {
        gridRef.current?.setSelected(selectedHash ? [selectedHash] : []);
    }, [selectedHash]);

    // Repaint the L/R glyphs when the diff's from/to moves. `refresh()` rather than a scoped
    // repaint: ~100 cells, no DOM insertions or removals, once per click (US-1021 F4).
    useEffect(() => {
        if (hasSideSelect) gridRef.current?.refresh();
    }, [hasSideSelect, sideSelect?.selectionKey]);

    const footer = useMemo(
        () =>
            createLoadMoreFooter({
                onLoadMore: () => void model.loadMore(),
                onLoadAll: () => void model.loadAll(),
            }),
        [model],
    );
    useEffect(() => footer.setLoading(loadingMore), [footer, loadingMore]);
    useEffect(() => () => footer.dispose(), [footer]);

    const onCellClick = useCallback(
        (cell: CellContext<GitCommitRow>, e: MouseEvent) => {
            if (String(cell.column.key) === SIDE_SELECT_KEY) {
                handleSideSelectClick(e.target, cell.row, sideSelectRef.current);
                // A `return`, not `stopPropagation`: this callback is the last statement of
                // av-grid's own delegated click handler, so there is no grid work left to cancel —
                // and the column is `isStatusColumn`, so the press moved no focus either.
                return;
            }
            onSelectCommit?.(cell.row.hash);
        },
        [onSelectCommit],
    );

    /**
     * Host items above av-grid's own, gated to data cells the way the React grid's
     * `ContextMenuModel` gated them. `undefined` when the prop is absent, because passing a
     * function at all is meaningful to av-grid — and here it would only add an empty array.
     */
    const gridMenuItems = useMemo(
        () =>
            getContextMenuItems
                ? (e: GridContextMenuEvent<GitCommitRow>): MenuItem[] =>
                      e.target === "cell"
                          ? getContextMenuItems(e.selection?.rows ?? [])
                          : []
                : undefined,
        [getContextMenuItems],
    );

    return (
        <DataGrid<GitCommitRow>
            name={name}
            onGrid={onGrid}
            columns={initialColumns.current}
            rows={rows}
            getRowKey={getRowKey}
            rowHeight={GIT_TREE_ROW_HEIGHT}
            disableSorting
            disableFiltering
            // The footer is taller than av-grid's default 20px trailing slack, so it reserves its
            // own room rather than overlapping the last row (US-1021 F5).
            extraElement={hasMore ? footer.element : null}
            whiteSpaceY={hasMore ? GIT_TREE_ROW_HEIGHT : undefined}
            onCellClick={onCellClick}
            onColumnResize={scheduleEmitLayout}
            onColumnsReorder={emitLayout}
            getContextMenuItems={gridMenuItems}
            // Draw the menu with the application's own popup menu. This is where EPIC-057 C4-5
            // closes Rule 6 for this consumer: the `showAppPopupMenu` call lives app-side, and the
            // grid hands the event outward instead of reaching into `ui/`.
            onGridContextMenu={showGridContextMenu}
        />
    );
}
