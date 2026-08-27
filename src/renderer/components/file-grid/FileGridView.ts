import type { Column, DataGridProps } from "../../uikit/DataGrid";
import { DataGridView } from "../../uikit/DataGrid/DataGridView";
import { showGridContextMenu } from "../../ui/dialogs/poppers/grid-context-menu";
import { fpExtname } from "../../core/utils/file-path";
import { createFileIconElement, createFolderIconElement, subscribeFileIconElements } from "../icons/icon-elements";
import { prepareFileIcon } from "../icons/language-icon-resolver";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { FileGridItem, FileGridProps } from "./FileGrid";
import "./FileGrid.css";

const ROW_HEIGHT_COMPACT = 20;
const ROW_HEIGHT = 24;

export class FileGridView extends VanillaView<FileGridProps> {
    private readonly columns: Column<FileGridItem>[];
    private readonly grid: DataGridView<FileGridItem>;
    private iconSubscription: (() => void) | undefined;
    private lastLabel: string | undefined;
    private lastItems: FileGridItem[];

    public constructor(props: FileGridProps) {
        const root = document.createElement("div");
        root.dataset.type = "file-grid";
        super(props, root);

        this.columns = this.buildColumns();
        this.lastLabel = props.label;
        this.lastItems = props.items;
        this.grid = this.child(new DataGridView<FileGridItem>(this.gridProps(props)));
        this.own(() => this.iconSubscription?.());
    }

    protected onMount(): void {
        this.root.append(this.grid.root);
        this.grid.mount();
        this.prepareIcons(this.props.items);
        this.iconSubscription = subscribeFileIconElements(() => this.grid.grid?.refresh());
        this.applyRootProps(this.props);
    }

    protected onUpdate(props: FileGridProps): void {
        const previousLabel = this.lastLabel;
        const previousItems = this.lastItems;
        this.applyRootProps(props);
        this.grid.update(this.gridProps(props));
        if (props.label !== previousLabel) {
            const title = this.grid.grid?.getColumns().find((column) => column.key === "title");
            if (title) {
                title.name = props.label ?? "";
                this.grid.grid?.setColumns(this.grid.grid.getColumns());
            }
        }
        if (props.items !== previousItems) this.prepareIcons(props.items);
        this.lastLabel = props.label;
        this.lastItems = props.items;
    }

    private applyRootProps(props: FileGridProps): void {
        if (props.name === undefined) this.root.removeAttribute("data-name");
        else this.root.dataset.name = props.name;
        if (props.compact) this.root.dataset.compact = "true";
        else this.root.removeAttribute("data-compact");
    }

    private buildColumns(): Column<FileGridItem>[] {
        return [
            {
                key: "icon",
                name: "",
                width: 28,
                render: (cell) => cell.row.isFolder
                    ? createFolderIconElement()
                    : createFileIconElement({ path: cell.row.filePath, width: 16, height: 16 }),
                rowCompare: (a, b) => fpExtname(a.filePath).localeCompare(fpExtname(b.filePath)),
                formatValue: () => "",
            },
            { key: "title", name: this.props.label ?? "", width: "10%", dataType: "string" },
            {
                key: "status",
                name: "",
                width: 24,
                dataType: "string",
                render: (cell) => this.props.getTrailing?.(cell) ?? "",
                formatValue: (_cell, row) => row.status ?? "",
            },
        ];
    }

    private gridProps(props: FileGridProps): DataGridProps<FileGridItem> {
        return {
            columns: this.columns,
            rows: props.items,
            getRowKey: (row) => row.filePath,
            rowHeight: props.compact ? ROW_HEIGHT_COMPACT : ROW_HEIGHT,
            onCellClick: (cell) => props.onClick?.(cell.row),
            onCellDoubleClick: (cell) => props.onDoubleClick?.(cell.row),
            onFocusChange: () => props.onSelectionChange?.(this.grid.grid?.getSelection()?.rows ?? []),
            getContextMenuItems: props.getContextMenuItems
                ? (event) => event.target === "cell"
                    ? props.getContextMenuItems?.(event.selection?.rows ?? []) ?? []
                    : []
                : undefined,
            onGridContextMenu: showGridContextMenu,
            disableFiltering: true,
            fitToWidth: true,
            cellBorders: false,
        };
    }

    private prepareIcons(items: FileGridItem[]): void {
        for (const item of items) {
            if (!item.isFolder) prepareFileIcon(item.filePath);
        }
    }
}
