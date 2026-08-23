/** Native implementation of the reusable Git Tree (US-1030). */
import { DataGridView } from "../../uikit/DataGrid/DataGridView";
import {
    defaultColumnWidth,
    type CellContext,
    type CellRenderer,
    type Column,
    type DataGridInstance,
    type DataGridProps,
    type GridContextMenuEvent,
} from "../../uikit/DataGrid";
import type { MenuItem } from "../../uikit/Menu";
import { showGridContextMenu } from "../../ui/dialogs/poppers/grid-context-menu";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { TAG_COLORS } from "../../theme/palette-colors";
import { REF_COLOR } from "./git-ref-color";
import { dateText } from "./git-date";
import type { GitColumnLayout, GitTreeProps, GitTreeSideSelect } from "./GitTree";
import type { GitTreeState } from "./GitTreeModel";
import {
    GIT_TREE_ROW_HEIGHT,
    graphWidth,
    makeBranchTreeCell,
} from "./branch-tree-cell";
import { createLoadMoreFooter, type LoadMoreFooter } from "./load-more-footer";
import { SIDE_SELECT_KEY, handleSideSelectClick, makeSideSelectCell } from "./side-select-cell";
import {
    maxColumnCount,
    toCommitRows,
    type GitCommitRow,
} from "./swimlane-layout";
import "./GitTree.css";

const LANE_COLORS = TAG_COLORS.map((c) => c.hex);
const RESIZE_EMIT_DELAY = 150;
const getRowKey = (row: GitCommitRow) => row.hash;

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

const renderHash = (cell: CellContext<GitCommitRow>): string => {
    const row = cell.row;
    if (!row) return "";
    const isHead = row.recordType === "commit" && row.refs.some((ref) => ref.kind === "head");
    const style = isHead ? ` style="color:${REF_COLOR.head}"` : "";
    return `<span class="avg-cell-text"${style}>${cell.highlight(row.shortHash)}</span>`;
};

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
        width: compact ? 94 : 160,
        resizable: true,
        formatValue: (_c, row) => dateText(row.authorDate),
    };
    if (compact) {
        const columns: Column<GitCommitRow>[] = [date, subject, hash];
        if (sideSelectCell) {
            columns.unshift({
                key: SIDE_SELECT_KEY,
                name: "",
                width: 56,
                isStatusColumn: true,
                render: sideSelectCell,
                formatValue: () => "",
            });
        }
        return columns;
    }
    return [
        {
            key: "graph",
            name: "",
            width: graphWidth(maxColumns),
            resizable: true,
            render: makeBranchTreeCell(maxColumns),
            formatValue: () => "",
        },
        subject,
        { key: "authorName", name: "Author", width: 140, resizable: true },
        date,
        hash,
    ];
}

function applyLayout(
    columns: Column<GitCommitRow>[],
    layout: GitColumnLayout | undefined,
): Column<GitCommitRow>[] {
    if (!layout?.length) return columns;
    const widthByKey = new Map(layout.map((item) => [item.key, item.width]));
    const orderByKey = new Map(layout.map((item, index) => [item.key, index]));
    const withWidth = columns.map((column) =>
        widthByKey.has(String(column.key))
            ? { ...column, width: widthByKey.get(String(column.key)) }
            : column,
    );
    const ordered = withWidth
        .map((column, index) => ({
            column,
            rank: orderByKey.has(String(column.key))
                ? orderByKey.get(String(column.key))!
                : layout.length + index,
        }))
        .sort((a, b) => a.rank - b.rank)
        .map(({ column }) => column);
    return [
        ...ordered.filter((column) => column.isStatusColumn),
        ...ordered.filter((column) => !column.isStatusColumn),
    ];
}

function refitGraphColumn(
    columns: Column<GitCommitRow>[],
    maxColumns: number,
): Column<GitCommitRow>[] {
    const index = columns.findIndex((column) => column.key === "graph");
    if (index < 0) return columns;
    const next = columns.slice();
    next[index] = {
        ...next[index],
        width: graphWidth(maxColumns),
        render: makeBranchTreeCell(maxColumns),
    };
    return next;
}

/**
 * The native grid owns its rows, but the projection remains identity-gated like the former
 * `useMemo([commits, leadingRows])`. This prevents an unrelated parent update from replacing all
 * rows and resetting av-grid's pooled cells.
 */
export class GitTreeView extends VanillaView<GitTreeProps> {
    private readonly gridView: DataGridView<GitCommitRow>;
    private readonly footer: LoadMoreFooter;
    private readonly sideSelectRef: { current: GitTreeSideSelect | undefined };
    private readonly onGridContextMenu = (event: GridContextMenuEvent<GitCommitRow>, items: MenuItem[]) =>
        showGridContextMenu(event, items);
    private readonly onCellClick = (cell: CellContext<GitCommitRow>, event: MouseEvent): void => {
        if (String(cell.column.key) === SIDE_SELECT_KEY) {
            handleSideSelectClick(event.target, cell.row, this.sideSelectRef.current);
            return;
        }
        this.props.onSelectCommit?.(cell.row.hash);
    };
    private readonly onColumnResize = (): void => {
        if (this.emitTimer !== undefined) window.clearTimeout(this.emitTimer);
        this.emitTimer = window.setTimeout(() => {
            this.emitTimer = undefined;
            this.emitLayout();
        }, RESIZE_EMIT_DELAY);
    };
    private readonly onColumnsReorder = (): void => this.emitLayout();
    private emitTimer: number | undefined;
    private grid: DataGridInstance<GitCommitRow> | undefined;
    private columns: Column<GitCommitRow>[];
    private structureKey: string;
    private maxColumns: number;
    private selectedHash: string | undefined;

    /**
     * Last applied `sideSelect.selectionKey`, tracked as a FIELD rather than read back off
     * `this.props` in `onUpdate`. `VanillaView.update()` assigns `this.props = props` *before*
     * calling `onUpdate` (`uikit/shared/vanilla-view.ts:76`), so `this.props` is already the new
     * value there — reading it as "previous" made the repaint guard permanently false.
     */
    private sideSelectKey: string | undefined;
    private lastCommits: readonly unknown[] | undefined;
    private lastLeadingRows: GitCommitRow[] | undefined;
    private rows: GitCommitRow[];
    private boundModel: GitTreeProps["model"];

    constructor(props: GitTreeProps) {
        const sideSelectRef: { current: GitTreeSideSelect | undefined } = {
            current: props.sideSelect,
        };
        const target: { view?: GitTreeView } = {};
        const initialRows = toCommitRows(props.model.state.get().commits, LANE_COLORS);
        const rows = props.leadingRows?.length
            ? [...props.leadingRows, ...initialRows]
            : initialRows;
        const maxColumns = maxColumnCount(rows);
        const sideSelectCell = props.sideSelect
            ? makeSideSelectCell(sideSelectRef)
            : undefined;
        const columns = applyLayout(
            buildColumns(maxColumns, props.compact ?? false, sideSelectCell),
            props.initialColumnLayout,
        );
        const gridView = new DataGridView<GitCommitRow>({
            name: props.name,
            columns,
            rows,
            getRowKey,
            rowHeight: GIT_TREE_ROW_HEIGHT,
            disableSorting: true,
            disableFiltering: true,
            selected: props.selectedHash ? [props.selectedHash] : undefined,
            onGrid: (grid) => target.view?.handleGrid(grid),
            onCellClick: (cell, event) => target.view?.onCellClick(cell, event),
            onColumnResize: () => target.view?.onColumnResize(),
            onColumnsReorder: () => target.view?.onColumnsReorder(),
            onGridContextMenu: (event, items) => target.view?.onGridContextMenu(event, items),
            getContextMenuItems: props.getContextMenuItems
                ? (event) => target.view?.getContextMenuItems(event) ?? []
                : undefined,
            extraElement: null,
            whiteSpaceY: 0,
        });
        super(props, gridView.root);
        target.view = this;
        this.gridView = gridView;
        this.footer = createLoadMoreFooter({
            onLoadMore: () => void this.props.model.loadMore(),
            onLoadAll: () => void this.props.model.loadAll(),
        });
        this.sideSelectRef = sideSelectRef;
        this.columns = columns;
        this.structureKey = this.getStructureKey(props);
        this.maxColumns = maxColumns;
        this.selectedHash = props.selectedHash;
        this.sideSelectKey = props.sideSelect?.selectionKey;
        this.rows = rows;
        this.lastCommits = props.model.state.get().commits;
        this.lastLeadingRows = props.leadingRows;
        this.boundModel = props.model;
        this.child(gridView);
        this.own(() => this.footer.dispose());
        this.own(() => {
            if (this.emitTimer !== undefined) window.clearTimeout(this.emitTimer);
        });
    }

    protected onMount(): void {
        this.gridView.mount();
        this.bind(
            this.props.model.state,
            (state) => ({ commits: state.commits, loadingMore: state.loadingMore, hasMore: state.hasMore }),
            (state) => this.applyState(state),
        );
    }

    protected onUpdate(props: GitTreeProps): void {
        if (props.model !== this.boundModel) {
            throw new Error("GitTreeView model identity cannot change while the view is mounted.");
        }
        const previousSelected = this.selectedHash;
        const previousSideKey = this.sideSelectKey;
        const previousStructure = this.structureKey;
        // No `this.props = props` here: the base class already did it before calling this hook.
        this.sideSelectKey = props.sideSelect?.selectionKey;
        this.sideSelectRef.current = props.sideSelect;
        this.updateStructure(previousStructure);
        this.gridView.update(this.gridProps());
        if (previousSelected !== props.selectedHash) {
            this.selectedHash = props.selectedHash;
            this.grid?.setSelected(props.selectedHash ? [props.selectedHash] : []);
        }
        if (props.sideSelect && previousSideKey !== props.sideSelect.selectionKey) {
            this.grid?.refresh();
        }
    }

    protected onDispose(): void {
        this.props.model.setGrid(undefined);
    }

    private handleGrid(grid: DataGridInstance<GitCommitRow> | null): void {
        this.grid = grid ?? undefined;
        this.props.model.setGrid(grid ?? undefined);
        if (grid && this.props.selectedHash) grid.setSelected([this.props.selectedHash]);
    }

    private applyState(state: {
        commits: GitTreeState["commits"];
        loadingMore: boolean;
        hasMore: boolean;
    }): void {
        const rows = this.projectRows(state.commits);
        const maxColumns = maxColumnCount(rows);
        this.rows = rows;
        if (maxColumns !== this.maxColumns && !this.props.compact && this.grid) {
            this.grid.setColumns(refitGraphColumn(this.grid.getColumns(), maxColumns));
        }
        this.maxColumns = maxColumns;
        this.footer.setLoading(state.loadingMore);
        this.gridView.update(this.gridProps(state));
    }

    private projectRows(commits: GitTreeState["commits"]): GitCommitRow[] {
        if (commits === this.lastCommits && this.props.leadingRows === this.lastLeadingRows) {
            return this.rows;
        }
        const commitRows = toCommitRows(commits, LANE_COLORS);
        const next = this.props.leadingRows?.length
            ? [...this.props.leadingRows, ...commitRows]
            : commitRows;
        this.lastCommits = commits;
        this.lastLeadingRows = this.props.leadingRows;
        return next;
    }

    private updateStructure(previousKey: string): void {
        const nextKey = this.getStructureKey(this.props);
        if (nextKey === previousKey) return;
        this.structureKey = nextKey;
        const sideSelectCell = this.props.sideSelect
            ? makeSideSelectCell(this.sideSelectRef)
            : undefined;
        this.columns = buildColumns(this.maxColumns, this.props.compact ?? false, sideSelectCell);
        this.grid?.setColumns(this.columns);
    }

    private getStructureKey(props: GitTreeProps): string {
        return `${props.compact ?? false}|${!!props.sideSelect}`;
    }

    private gridProps(state?: { hasMore: boolean }): DataGridProps<GitCommitRow> {
        const hasMore = state?.hasMore ?? this.props.model.state.get().hasMore;
        return {
            name: this.props.name,
            rows: this.rows,
            getRowKey,
            rowHeight: GIT_TREE_ROW_HEIGHT,
            disableSorting: true,
            disableFiltering: true,
            extraElement: hasMore ? this.footer.element : null,
            whiteSpaceY: hasMore ? GIT_TREE_ROW_HEIGHT : undefined,
            onCellClick: this.onCellClick,
            onColumnResize: this.onColumnResize,
            onColumnsReorder: this.onColumnsReorder,
            onGridContextMenu: this.onGridContextMenu,
            getContextMenuItems: this.props.getContextMenuItems
                ? (event: GridContextMenuEvent<GitCommitRow>) => this.getContextMenuItems(event)
                : undefined,
        };
    }

    private getContextMenuItems(event: GridContextMenuEvent<GitCommitRow>): MenuItem[] {
        return event.target === "cell"
            ? this.props.getContextMenuItems?.(event.selection?.rows ?? []) ?? []
            : [];
    }

    private emitLayout(): void {
        if (!this.grid || !this.props.onColumnLayoutChange) return;
        this.props.onColumnLayoutChange(
            this.grid.getColumns().map((column) => ({
                key: String(column.key),
                width: column.width ?? defaultColumnWidth,
            })),
        );
    }
}
