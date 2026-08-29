import { TComponentState } from "../../../core/state/state";
import type { CellEditEvent, Column, DataGridInstance, DataType } from "../../../uikit/DataGrid/types";
import { DataGridView } from "../../../uikit/DataGrid/DataGridView";
import { PopoverView } from "../../../uikit/Popover/PopoverView";
import type { PopoverViewProps } from "../../../uikit/Popover/PopoverView";
import { ButtonView } from "../../../uikit/Button/ButtonView";
import "../../../uikit/Button/Button.css";
import { SpacerView } from "../../../uikit/Spacer/SpacerView";
import { createPanelElement, applyPanelAttributes, resolvePanelAttributes } from "../../../uikit/Panel/panel-style";
import { createTextElement } from "../../../uikit/Text/text-style";
import { SubtreeSwap } from "../../../uikit/shared/subtree-swap";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { TPopperModel } from "../../../ui/dialogs/poppers/types";
import { parseBoolean, parseNumber, parseString } from "../../../core/utils/parse-utils";
import { showPopper, visiblePoppers } from "../../../ui/dialogs/poppers/Poppers";
import type { DialogViewProps } from "../../../ui/dialogs/dialog-view-registry";
import { registerDialogView } from "../../../ui/dialogs/dialog-view-registry";

const minWidth = 240;
const minHeight = 160;
const maxWidth = 440;
const maxHeight = 300;

/**
 * The popover's own columns — and none of them is a status column any more.
 *
 * All three carried `isStatusColumn: true` under the React grid, where it only affected the
 * *header*: no resize, no drag-reorder. av-grid reads it as "not a data column" and therefore
 * **refuses to edit it** (`EditingModel`), which would have made this popover — whose entire job
 * is editing these three fields — read-only. The header intent that still matters is expressed
 * directly with `resizable`.
 *
 * What is lost is that the user can now drag these three headers around. It is cosmetic: this
 * grid's column layout is not persisted, so a reorder lasts until the popover closes.
 */
const getColumns = (isCsv: boolean): Column[] => [
    {
        key: "visible",
        dataType: "boolean",
        name: "👁",
        width: 40,
        resizable: false,
    },
    {
        key: "newDataType",
        name: "Type",
        options: ["string", "number", "boolean"],
        width: 100,
        resizable: true,
        hidden: isCsv,
    },
    {
        key: "newKey",
        name: "Key*",
        resizable: true,
        width: 240,
    },
];

interface EditColumnRow {
    idx: string;
    oldHidden?: boolean;
    visible: boolean;
    oldKey?: string;
    newKey?: string;
    oldName?: string;
    newName?: string;
    oldDataType?: DataType;
    newDataType?: DataType;
}

const getRowKey = (row: EditColumnRow) => row.idx;

/**
 * `rows` is **not** here (US-1020 / D1). This popover's grid owns its own row array the same way
 * the editor's does — immer would deep-freeze anything put into this state, and av-grid writes
 * `row[key] = value` itself when a cell is edited. The rows live on the model as a plain field
 * and are read back through `getRows()`.
 */
const defaultColumnsOptionsState = {
    deleted: [] as EditColumnRow[],
    changed: false,
    error: "",
};

type ColumnsOptionsState = typeof defaultColumnsOptionsState;

class ColumnsOptionsModel extends TPopperModel<ColumnsOptionsState, undefined> {
    el = undefined as Element | undefined;
    /** The editor's grid, whose columns this popover edits. */
    gridModel = undefined as DataGridInstance<any> | undefined;
    /** This popover's own grid, which owns the `EditColumnRow` array. */
    grid = undefined as DataGridInstance<EditColumnRow> | undefined;
    /** The rows, before this popover's grid exists to own them. */
    rows = [] as EditColumnRow[];
    isCsv = false;
    onUpdateRows = undefined as
        | ((updateFunc: (rows: any[]) => any[]) => void)
        | undefined;
    width = undefined as number | undefined;
    height = undefined as number | undefined;
    rowIndex = 0;

    prepareEditColumns = () => {
        const columns = this.gridModel?.getColumns() ?? [];
        this.rows = columns.map((col) => ({
            idx: (this.rowIndex++).toString(),
            oldHidden: col.hidden,
            visible: !col.hidden,
            oldKey: col.key.toString(),
            newKey: col.key.toString(),
            oldName: col.name,
            newName: col.name,
            oldDataType: col.dataType,
            newDataType: col.dataType,
        }));
    };

    calcInitialSize = () => {
        const width = this.gridModel?.element.offsetWidth;
        const height = this.gridModel?.element.offsetHeight;
        if (width && height) {
            this.width = Math.min(Math.max(width, minWidth), maxWidth);
            this.height = Math.min(Math.max(height, minHeight), maxHeight);
        }
    };

    setGrid = (grid: DataGridInstance<EditColumnRow> | null) => {
        this.grid = grid ?? undefined;
    };

    /** The edit rows, wherever they currently live. */
    private liveRows = (): EditColumnRow[] => {
        return (this.grid?.getRows() as EditColumnRow[] | undefined) ?? this.rows;
    };

    /** The rows the view hands back on every render — the grid's own array, never a stale seed. */
    rowsForGrid = (): readonly EditColumnRow[] => this.liveRows();

    private markChanged = () => {
        if (this.state.get().changed) return;
        this.state.update((s) => {
            s.changed = true;
        });
    };

    /**
     * A key was typed — carry it into the caption unless the caption was set by hand.
     *
     * av-grid has already written `row[columnKey]` by the time this runs, so the "previous" key
     * is not available to compare against. `oldName` is, and it is the better test anyway: the
     * caption tracks the key while it still matches the key it was derived from.
     */
    onEdit = (edit: CellEditEvent<EditColumnRow>) => {
        const row = edit.row;
        if (edit.columnKey === "newKey" && (!row.newName || row.newName === row.oldName)) {
            row.newName = edit.value;
        }
        this.markChanged();
    };

    onAddRows = () => {
        this.markChanged();
    };

    newRow = (): EditColumnRow => ({
        idx: (this.rowIndex++).toString(),
        visible: true,
        newDataType: "string" as DataType,
    });

    onDeleteRows = (e: { rows: readonly EditColumnRow[] }) => {
        const removed = [...e.rows];
        this.state.update((s) => {
            s.deleted = [...s.deleted, ...removed];
            s.changed = true;
        });
    };

    private updateRows = (rows: any[]) => {
        const columns = this.liveRows();
        const { deleted } = this.state.get();
        const deletedKeys = deleted
            .map((r) => r.oldKey)
            .filter((key) => !columns.find((c) => c.newKey === key));
        const changedKeys = columns.filter(
            (c) => c.oldKey && c.oldKey !== c.newKey
        );
        const changedTypes = columns.filter(
            (c) => c.oldKey && c.oldDataType !== c.newDataType
        );

        if (!deletedKeys.length && !changedKeys.length && !changedTypes.length) {
            return rows;
        }

        return rows.map((row) => {
            const newRow = { ...row };
            for (const delKey of deletedKeys) {
                delete newRow[delKey];
            }
            for (const change of changedKeys) {
                newRow[change.newKey] = newRow[change.oldKey];
                delete newRow[change.oldKey];
            }
            for (const change of changedTypes) {
                switch (change.newDataType) {
                    case "number":
                        newRow[change.newKey] = parseNumber(
                            newRow[change.newKey]
                        );
                        break;
                    case "boolean":
                        newRow[change.newKey] = parseBoolean(
                            newRow[change.newKey]
                        );
                        break;
                    default:
                        newRow[change.newKey] = parseString(
                            newRow[change.newKey]
                        );
                        break;
                }
            }
            return newRow;
        });
    };

    private updateColumns = (columns: Column[]): Column[] => {
        const rows = this.liveRows();

        return rows
            .filter((r) => r.newKey)
            .map((row) => {
                const existing = columns.find((c) => c.key === row.oldKey);
                return {
                    ...existing,
                    key: row.newKey,
                    name: row.newName || row.newKey,
                    dataType: row.newDataType,
                    hidden: !row.visible,
                    ...(existing
                        ? {}
                        : {
                              resizible: true,
                              filterType: "options",
                          }),
                };
            });
    };

    private validate = () => {
        const keys = new Set<string>();
        const rows = this.liveRows();
        for (const row of rows) {
            if (row.newKey) {
                if (keys.has(row.newKey)) {
                    this.state.update((s) => {
                        s.error = "Duplicate key";
                    });
                    return false;
                }
                keys.add(row.newKey);
            } else {
                this.state.update((s) => {
                    s.error = "Key is required";
                });
                return false;
            }
        }
        return true;
    };

    applyChanges = () => {
        if (!this.validate()) {
            return;
        }
        // Rows first, then columns — the order matters now, where it did not under the React
        // grid. `setColumns` validates the new keys against the rows the grid currently holds,
        // and exempts only keys it already has, so applying a **rename** before the row data
        // carries the new key throws `Unknown column`. Rewriting the rows first means every new
        // key is in the data by the time the columns arrive.
        this.onUpdateRows?.(this.updateRows);
        const grid = this.gridModel;
        if (grid) grid.setColumns(this.updateColumns(grid.getColumns()));
        this.close(undefined);
    };
}

const defaultOffset = [0, 2] as [number, number];
const showColumnsOptionsId = Symbol("ShowColumnsOptions");

interface ColumnsOptionsFooterProps {
    readonly model: ColumnsOptionsModel;
    readonly error: string;
}

class ColumnsOptionsFooterView extends VanillaView<ColumnsOptionsFooterProps> {
    public constructor(props: ColumnsOptionsFooterProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        applyPanelAttributes(
            this.root,
            resolvePanelAttributes({
                direction: "row",
                align: "center",
                justify: "end",
                gap: "lg",
                paddingX: "lg",
                paddingY: "xs",
            }),
        );

        const cancelButton = this.child(new ButtonView({
            name: "columns-options-cancel",
            onClick: () => this.props.model.close(undefined),
            children: "Cancel",
        }));
        const applyButton = this.child(new ButtonView({
            name: "columns-options-apply",
            variant: "primary",
            onClick: this.props.model.applyChanges,
            children: "Apply",
        }));
        const spacer = this.child(new SpacerView({}));
        const children: Node[] = [];
        if (this.props.error) children.push(createTextElement(this.props.error, { color: "error" }));
        children.push(spacer.root, cancelButton.root, applyButton.root);
        this.root.append(...children);
        spacer.mount();
        cancelButton.mount();
        applyButton.mount();
    }
}

class ColumnsOptionsContentView extends VanillaView<undefined> {
    private readonly model: ColumnsOptionsModel;
    private readonly columns: Column[];
    private gridView: DataGridView<EditColumnRow> | undefined;
    private footerSwap: SubtreeSwap<string> | undefined;

    public constructor(host: HTMLElement, model: ColumnsOptionsModel) {
        // Adopt the popover host so the panel, grid and footer remain direct native children of
        // the floating root. PopoverFloatingView owns the host's root attributes.
        super(undefined, host);
        this.model = model;
        this.columns = getColumns(model.isCsv);
    }

    protected onMount(): void {
        const outerPanel = createPanelElement({
            name: "columns-options",
            direction: "column",
            flex: 1,
            position: "relative",
            minWidth: this.model.width ?? minWidth,
            minHeight: this.model.height ?? minHeight,
        });
        const headerPanel = createPanelElement({
            direction: "row",
            background: "dark",
            paddingX: "sm",
            paddingY: "xs",
            borderBottom: true,
        }, [createTextElement("Edit Columns", { size: "sm", color: "light" })]);
        outerPanel.append(headerPanel);

        const gridView = this.child(new DataGridView<EditColumnRow>(this.gridProps()));
        // A definite height base. `[data-type="data-grid"]` is `flex: 1 1 auto`, so the host's
        // basis is its *content* — and av-grid's own root is `height: 100%`, which cannot resolve
        // against an indefinite parent. It therefore falls back to the scroll area's initial
        // ~51px, the host grows to fill the popover around it, and the grid never re-measures:
        // the popover looks right and the columns list is a sliver. `height: 0` makes the base
        // definite while the inherited `flex-grow: 1` still fills the panel (US-1191).
        gridView.root.style.height = "0";
        outerPanel.append(gridView.root);
        this.root.append(outerPanel);
        gridView.mount();
        this.gridView = gridView;

        const footerSwap = new SubtreeSwap<string>(outerPanel);
        this.footerSwap = footerSwap;
        this.own(() => footerSwap.dispose());

        this.bind(
            this.model.state,
            (state) => state,
            (state) => {
                this.gridView?.update(this.gridProps());
                this.syncFooter(state.changed ? state.error : null);
            },
        );
    }

    private gridProps(): Parameters<DataGridView<EditColumnRow>["update"]>[0] {
        return {
            name: "columns-options-grid",
            columns: this.columns,
            rows: this.model.rowsForGrid(),
            getRowKey,
            rowNoun: "column",
            disableSorting: true,
            editable: true,
            canAddRows: true,
            canDeleteRows: true,
            newRow: this.model.newRow,
            onGrid: this.model.setGrid,
            onEdit: this.model.onEdit,
            onAddRows: this.model.onAddRows,
            onDeleteRows: this.model.onDeleteRows,
        };
    }

    private syncFooter(error: string | null): void {
        const footerSwap = this.footerSwap;
        if (!footerSwap) return;

        let created: ColumnsOptionsFooterView | undefined;
        footerSwap.set(error, (footerError) => {
            created = new ColumnsOptionsFooterView({ model: this.model, error: footerError });
            return created;
        });
        created?.mount();
    }
}

class ColumnsOptionsView extends VanillaView<DialogViewProps> {
    private readonly model: ColumnsOptionsModel;

    public constructor(props: DialogViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.model = props.model as ColumnsOptionsModel;
    }

    protected onMount(): void {
        const popoverView = this.child(new PopoverView({
            elementRef: this.model.el,
            offset: defaultOffset,
            open: true,
            placement: "bottom-start",
            resizable: true,
            onClose: () => {
                if (visiblePoppers().length === 1 && !this.model.state.get().changed) {
                    this.model.close(undefined);
                }
            },
            contentView: (host) => new ColumnsOptionsContentView(host, this.model),
        } satisfies PopoverViewProps));
        popoverView.mount();
    }
}

registerDialogView(showColumnsOptionsId, ColumnsOptionsView);

export const showColumnsOptions = async (
    el: Element,
    gridModel: DataGridInstance<any>,
    isCsv: boolean,
    onUpdateRows: (updateFunc: (rows: any[]) => any[]) => void
) => {
    const model = new ColumnsOptionsModel(
        new TComponentState(defaultColumnsOptionsState)
    );
    model.el = el;
    model.gridModel = gridModel;
    model.isCsv = isCsv;
    model.onUpdateRows = onUpdateRows;
    model.prepareEditColumns();
    model.calcInitialSize();
    await showPopper<void>({
        viewId: showColumnsOptionsId,
        model,
    });
};
