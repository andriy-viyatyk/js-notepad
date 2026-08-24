import { DataGridView } from "../../../uikit/DataGrid/DataGridView";
import type { Column, DataGridProps } from "../../../uikit/DataGrid/types";
import { createPanelElement } from "../../../uikit/Panel/panel-style";
import { IconButtonView } from "../../../uikit/IconButton/IconButtonView";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { pagesModel } from "../../../api/pages";
import { getGridDataWithColumns, getRowKey } from "../../grid/utils/grid-utils";
import type { GridColumn } from "../../grid/utils/grid-utils";
import type { GridOutputEntry } from "../logTypes";
import type { LogViewEditor } from "../LogViewEditor";
import { DIALOG_CONTENT_MAX_HEIGHT } from "../logConstants";
import { DialogHeaderView } from "./DialogHeader";

interface SavedColumn { key: string | number; width?: number; }
export interface GridOutputViewProps { entry: GridOutputEntry; model: LogViewEditor; }

function normalizeColumns(columns?: (string | GridColumn)[]): GridColumn[] | undefined {
    if (!columns || columns.length === 0) return undefined;
    return columns.map((column) => typeof column === "string" ? { key: column } : column);
}

function mergeColumnsWithSaved(detected: Column[], saved?: SavedColumn[]): Column[] {
    if (!saved?.length) return detected;
    const savedMap = new Map(saved.map((column) => [String(column.key), column]));
    const result: Column[] = [];
    for (const savedColumn of saved) {
        const detectedColumn = detected.find((column) => String(column.key) === String(savedColumn.key));
        if (detectedColumn) result.push({ ...detectedColumn, width: savedColumn.width ?? detectedColumn.width });
    }
    return [...result, ...detected.filter((column) => !savedMap.has(String(column.key)))];
}

export class GridOutputView extends VanillaView<GridOutputViewProps> {
    private readonly header: DialogHeaderView;
    private readonly grid: DataGridView;
    private readonly action: IconButtonView;
    private readonly panel = createPanelElement({ name: "log-grid-output", direction: "column", position: "relative", border: true, rounded: "md", overflow: "hidden", width: "fit-content", maxWidth: "100%", revealChildrenOnHover: true });
    private initialColumns: Column[] | undefined;
    private persistTimer: ReturnType<typeof setTimeout> | undefined;
    private pendingColumns: Column[] | undefined;
    private pendingEntryId: string | undefined;
    private currentEntryId: string;

    public constructor(props: GridOutputViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.currentEntryId = props.entry.id;
        this.initialColumns = this.getInitialColumns(props);
        this.header = new DialogHeaderView({ title: props.entry.title });
        this.grid = new DataGridView(this.gridProps(props, this.initialColumns));
        this.action = new IconButtonView({ name: "log-grid-open-in-editor", hideUntilParentHover: true, size: "sm", icon: "open-link", title: "Open in Grid editor", onClick: this.handleOpenInGrid });
        const actions = createPanelElement({ name: "log-grid-hover-actions", position: "absolute", top: 4, right: 4, zIndex: 1 });
        actions.append(this.action.root);
        this.panel.append(this.header.root, this.grid.root, actions);
        this.child(this.header);
        this.child(this.grid);
        this.child(this.action);
    }

    protected onMount(): void { this.header.mount(); this.grid.mount(); this.action.mount(); this.root.append(this.panel); }

    protected onUpdate(props: GridOutputViewProps): void {
        if (props.entry.id !== this.currentEntryId) {
            this.flushColumns();
            this.currentEntryId = props.entry.id;
            this.initialColumns = this.getInitialColumns(props);
        }
        this.header.update({ title: props.entry.title });
        this.grid.invalidatePushed();
        this.grid.update(this.gridProps(props, this.initialColumns));
    }

    protected onDispose(): void {
        if (this.persistTimer !== undefined) clearTimeout(this.persistTimer);
        this.persistTimer = undefined;
        this.flushColumns();
    }

    private getInitialColumns(props: GridOutputViewProps): Column[] {
        const data = getGridDataWithColumns(props.entry.data, normalizeColumns(props.entry.columns));
        const saved = props.model.getItemState(props.entry.id).columns as SavedColumn[] | undefined;
        return mergeColumnsWithSaved(data.columns, saved);
    }

    private gridProps(props: GridOutputViewProps, initialColumns: Column[] | undefined): DataGridProps {
        const data = getGridDataWithColumns(props.entry.data, normalizeColumns(props.entry.columns));
        return {
            columns: initialColumns,
            rows: data.rows,
            getRowKey,
            onColumnsChange: this.handleColumnsChange,
            growToHeight: `${DIALOG_CONTENT_MAX_HEIGHT}px`,
            growToWidth: "100%",
            disableFiltering: true,
        };
    }

    private readonly handleColumnsChange = (columns: Column[]): void => {
        this.pendingColumns = columns;
        this.pendingEntryId = this.props.entry.id;
        if (this.persistTimer !== undefined) clearTimeout(this.persistTimer);
        this.persistTimer = setTimeout(() => { this.persistTimer = undefined; this.flushColumns(); }, 150);
    };

    private flushColumns(): void {
        if (!this.pendingColumns || !this.pendingEntryId) return;
        this.props.model.setItemState(this.pendingEntryId, { columns: this.pendingColumns.map((column) => ({ key: column.key, width: column.width })) });
        this.pendingColumns = undefined;
        this.pendingEntryId = undefined;
    }

    private readonly handleOpenInGrid = (): void => {
        const title = typeof this.props.entry.title === "string" ? this.props.entry.title : "Grid Data";
        pagesModel.addEditorPage("grid-json", "json", title, JSON.stringify(this.props.entry.data, null, 2));
    };
}
