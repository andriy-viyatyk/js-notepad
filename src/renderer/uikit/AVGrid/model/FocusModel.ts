import { clsx } from "clsx";
import { CellFocus, Column } from "../avGridTypes";
import { AVGridDataChangeEvent } from "./AVGridData";
import { AVGridModel } from "./AVGridModel";
import type { RenderCell } from "../../RenderGrid";

type SelType = "click" | "shiftClick" | "rightClick" | "startDrag" | "drag";

const navigationKeys = [
    "ArrowDown",
    "ArrowUp",
    "ArrowLeft",
    "ArrowRight",
    "Tab",
    "PageDown",
    "PageUp",
    "Home",
    "End",
] as const;

type NavigationKey = (typeof navigationKeys)[number];

type NavigationContext<R> = {
    rows: readonly R[];
    columns: Column[];
    rowIndex: number;
    columnIndex: number;
};

function isNavigationKey(key: string): key is NavigationKey {
    return navigationKeys.includes(key as NavigationKey);
}

function getSelectionRange(focus?: CellFocus) {
    let res = {
        rowStart: -1,
        rowEnd: -1,
        colStart: -1,
        colEnd: -1,
    };
    if (focus && focus.selection) {
        const rowRange = [
            focus.selection.rowStart,
            focus.selection.rowEnd,
        ].sort((a, b) => a - b);
        const colRange = [
            focus.selection.colStart,
            focus.selection.colEnd,
        ].sort((a, b) => a - b);
        res = {
            rowStart: rowRange[0],
            rowEnd: rowRange[1],
            colStart: colRange[0],
            colEnd: colRange[1],
        };
    }
    return res;
}

function inSelection(col: number, row: number, focus?: CellFocus) {
    const selection = getSelectionRange(focus);
    return (
        row >= selection.rowStart &&
        row <= selection.rowEnd &&
        col >= selection.colStart &&
        col <= selection.colEnd
    );
}

export class FocusModel<R> {
    readonly model: AVGridModel<R>;
    focusFromIndex = false;

    private readonly navigationHandlers: Record<
        NavigationKey,
        (context: NavigationContext<R>, event: React.KeyboardEvent<HTMLDivElement>) => void
    > = {
        ArrowDown: (context, event) => this.navigateArrowDown(context, event),
        ArrowUp: (context, event) => this.navigateArrowUp(context, event),
        ArrowLeft: (context, event) => this.navigateArrowLeft(context, event),
        ArrowRight: (context, event) => this.navigateArrowRight(context, event),
        Tab: (context, event) => this.navigateTab(context, event),
        PageDown: (context) => this.navigatePageDown(context),
        PageUp: (context) => this.navigatePageUp(context),
        Home: (context, event) => this.navigateHome(context, event),
        End: (context, event) => this.navigateEnd(context, event),
    };

    constructor(model: AVGridModel<R>) {
        this.model = model;
        this.model.data.onChange.subscribe(this.onDataChange);
        this.model.events.cell.onMouseDown.subscribe(this.onCellMouseDown);
        this.model.events.cell.onDragStart.subscribe(this.onCellDragStart);
        this.model.events.cell.onDragEnter.subscribe(this.onCellDragEnter);
        this.model.events.cell.onDragEnd.subscribe(this.onCellDragEnd);
        this.model.events.content.onKeyDown.subscribe(this.onContentKeyDown);
    }

    focusClass = (col: number, row: number) => {
        const { columns, rows } = this.model.data;
        const { getRowKey, focus } = this.model.props;

        const column = columns[col];
        const focused =
            focus?.rowKey === getRowKey(rows[row]) &&
            focus?.columnKey === column.key;
        const selection = focus?.selection;
        const rRange = [
            selection?.rowStart ?? -1,
            selection?.rowEnd ?? -1,
        ].sort((a, b) => a - b);
        const cRange = [
            selection?.colStart ?? -1,
            selection?.colEnd ?? -1,
        ].sort((a, b) => a - b);

        return clsx({
            focused,
            inSelection:
                row >= rRange[0] &&
                row <= rRange[1] &&
                col >= cRange[0] &&
                col <= cRange[1],
            inSelectionTop:
                row === rRange[0] && col >= cRange[0] && col <= cRange[1],
            inSelectionBottom:
                row === rRange[1] && col >= cRange[0] && col <= cRange[1],
            inSelectionLeft:
                col === cRange[0] && row >= rRange[0] && row <= rRange[1],
            inSelectionRight:
                col === cRange[1] && row >= rRange[0] && row <= rRange[1],
        });
    };

    focusCell = (rowIndex: number, colIndex: number, withScroll?: boolean) => {
        const { columns, rows } = this.model.data;

        if (
            rowIndex < 0 ||
            rowIndex >= rows.length ||
            colIndex < 0 ||
            colIndex >= columns.length
        ) {
            return;
        }

        const row = rows[rowIndex];
        const col = columns[colIndex];

        this.updateFocus(row, col, rowIndex, colIndex, "click", withScroll);
    };

    selectRange = (
        startRowIndex: number,
        startColIndex: number,
        endRowIndex: number,
        endColIndex: number
    ) => {
        const { getRowKey, setFocus } = this.model.props;
        const { columns, rows } = this.model.data;
        const startCol = columns[startColIndex];
        const endCol = columns[endColIndex];
        const startRow = rows[startRowIndex];
        const endRow = rows[endRowIndex];
        if (startCol && endCol && startRow && endRow && setFocus) {
            setFocus({
                columnKey: endCol.key,
                rowKey: getRowKey(endRow),
                isDragging: false,
                selection: {
                    colKeyStart: startCol.key,
                    rowKeyStart: getRowKey(startRow),
                    colKeyEnd: endCol.key,
                    rowKeyEnd: getRowKey(endRow),
                    colStart: startColIndex,
                    rowStart: startRowIndex,
                    colEnd: endColIndex,
                    rowEnd: endRowIndex,
                },
            });
            this.model.update({ all: true });
        }
    };

    focusNewRows = (
        startIndex: number,
        count: number,
        oldFocus?: CellFocus<R>
    ) => {
        const endRowIndex = startIndex + count - 1;
        const startColIndex = oldFocus?.selection?.colStart ?? 0;
        const endColIndex = oldFocus?.selection?.colEnd ?? 0;
        this.selectRange(startIndex, startColIndex, endRowIndex, endColIndex);
    };

    getGridFocus = () => {
        const { focus, getRowKey } = this.model.props;
        const { rows, columns } = this.model.data;

        if (focus && focus.columnKey && focus.rowKey) {
            const rowIndex = rows.findIndex(
                (r) => getRowKey(r) === focus.rowKey
            );
            const colIndex = columns.findIndex(
                (c) => c.key === focus.columnKey
            );
            return {
                row: rows[rowIndex],
                column: columns[colIndex],
                rowIndex,
                colIndex,
            };
        }
    };

    get singleCellSelected() {
        const { focus } = this.model.props;
        return (
            focus &&
            focus.columnKey &&
            focus.rowKey &&
            (!focus.selection ||
                (focus.selection.colKeyStart === focus.selection.colKeyEnd &&
                    focus.selection.rowKeyStart === focus.selection.rowKeyEnd))
        );
    }

    get selectedCount() {
        const { focus } = this.model.props;
        const rowCount =
            focus && focus.selection
                ? Math.abs(focus.selection.rowEnd - focus.selection.rowStart) +
                  1
                : focus?.rowKey
                  ? 1
                  : 0;
        const columnCount =
            focus && focus.selection
                ? Math.abs(focus.selection.colEnd - focus.selection.colStart) +
                  1
                : focus?.columnKey
                  ? 1
                  : 0;
        const minRow =
            focus && focus.selection
                ? Math.min(focus.selection.rowStart, focus.selection.rowEnd)
                : 0;
        const minCol =
            focus && focus.selection
                ? Math.min(focus.selection.colStart, focus.selection.colEnd)
                : 0;
        return { rows: rowCount, columns: columnCount, minRow, minCol };
    }

    getGridSelection = () => {
        const { focus, getRowKey } = this.model.props;
        const { rows, columns } = this.model.data;

        if (focus && focus.columnKey && focus.rowKey) {
            const endRowIndex = rows.findIndex(
                (r) => getRowKey(r) === focus.rowKey
            );
            const endColIndex = columns.findIndex(
                (c) => c.key === focus.columnKey
            );
            const startRowIndex = focus.selection?.rowKeyStart
                ? rows.findIndex(
                      (r) => getRowKey(r) === focus.selection?.rowKeyStart
                  )
                : endRowIndex;
            const startColIndex = focus.selection?.colKeyStart
                ? columns.findIndex(
                      (c) => c.key === focus.selection?.colKeyStart
                  )
                : endColIndex;
            const rowRange = [startRowIndex, endRowIndex].sort((a, b) => a - b);
            const colRange = [startColIndex, endColIndex].sort((a, b) => a - b);

            return {
                rows: rows.slice(rowRange[0], rowRange[1] + 1),
                columns: columns.slice(colRange[0], colRange[1] + 1),
                focusCol: endColIndex,
                focusRow: endRowIndex,
                rowRange,
                colRange,
            };
        }
    };

    private onDataChange = (e?: AVGridDataChangeEvent) => {
        if (!e) return;
        if (e.rows || e.columns) {
            this.validateFocus();
        }
    };

    private updateFocus = (
        row: any,
        col: Column,
        rowIndex: number,
        colIndex: number,
        selType: SelType,
        withScroll?: boolean
    ) => {
        const getRowKey = this.model.props.getRowKey;
        const rows = this.model.data.rows;

        this.model.props.setFocus?.((foc) => {
            if (selType === "drag" && !foc?.isDragging) {
                return foc;
            }

            if (
                selType === "rightClick" &&
                inSelection(colIndex, rowIndex, foc)
            ) {
                return foc;
            }

            let oldRow = -1;
            const rowRange =
                this.model.renderModel?.renderInfo.current?.renderRange.rows;
            if (foc && this.model.renderModel && rowRange) {
                // skip header (r === 0)
                oldRow =
                    rowRange.find(
                        (r) => r > 0 && getRowKey(rows[r - 1]) === foc.rowKey
                    ) ?? -1;
            }

            this.model.renderModel?.update({
                rows: oldRow < 0 ? [rowIndex + 1] : [oldRow, rowIndex + 1],
            });

            if (withScroll) {
                Promise.resolve().then(() => {
                    this.model.renderModel?.scrollTo(rowIndex + 1, colIndex);
                });
            }

            const currentSel = {
                rowKeyEnd: getRowKey(row),
                colKeyEnd: col.key as keyof R,
                rowEnd: rowIndex,
                colEnd: colIndex,
            };

            const startSel =
                selType === "startDrag" ||
                selType === "click" ||
                selType === "rightClick" ||
                (selType === "shiftClick" && !foc?.selection) ||
                !foc?.selection
                    ? {
                          rowKeyStart: getRowKey(row),
                          colKeyStart: col.key as keyof R,
                          rowStart: rowIndex,
                          colStart: colIndex,
                      }
                    : {
                          rowKeyStart: foc.selection.rowKeyStart,
                          colKeyStart: foc.selection.colKeyStart,
                          rowStart: foc.selection.rowStart,
                          colStart: foc.selection.colStart,
                      };

            const oldSel = foc?.selection;

            if (oldSel) {
                this.model.update({
                    cells: [...this.cellsToUpdate(oldSel), ...this.cellsToUpdate({...currentSel, ...startSel})],
                });
            }

            return {
                rowKey: currentSel.rowKeyEnd,
                columnKey: currentSel.colKeyEnd,
                isDragging: selType === "startDrag" || Boolean(foc?.isDragging),
                selection: {
                    ...currentSel,
                    ...startSel,
                },
            };
        });
    };

    private cellsToUpdate(
        selection: CellFocus<R>["selection"],
    ) {
        const cells: RenderCell[] = [];
        if (selection) {
            const minRow = Math.min(selection.rowStart, selection.rowEnd);
            const maxRow = Math.max(selection.rowStart, selection.rowEnd);
            const minCol = Math.min(selection.colStart, selection.colEnd);
            const maxCol = Math.max(selection.colStart, selection.colEnd);
            for (let i = minRow; i <= maxRow; i++) {
                for (let j = minCol; j <= maxCol; j++) {
                    cells.push({ row: i + 1, col: j });
                }
            }
        }
        return cells;
    }

    validateFocus = () => {
        const getRowKey = this.model.props.getRowKey;
        const { rows, columns } = this.model.data;

        this.model.props.setFocus?.((oldFocus) => {
            if (oldFocus) {
                const rowIndex = rows.findIndex(
                    (r) => getRowKey(r) === oldFocus.rowKey
                );
                const colIndex = columns.findIndex(
                    (c) => c.key === oldFocus.columnKey
                );
                if (rowIndex < 0 || colIndex < 0 || this.focusFromIndex) {
                    this.focusFromIndex = false;
                    if (!rows.length || !columns.length) {
                        return undefined;
                    }
                    const rIdx = Math.min(
                        oldFocus.selection?.rowEnd ?? 0,
                        rows.length - 1
                    );
                    const cIdx = Math.min(
                        oldFocus.selection?.colEnd ?? 0,
                        columns.length - 1
                    );
                    return {
                        columnKey: columns[cIdx].key,
                        rowKey: getRowKey(rows[rIdx]),
                        isDragging: false,
                        selection: {
                            colStart: cIdx,
                            colKeyStart: columns[cIdx].key,
                            rowStart: rIdx,
                            rowKeyStart: getRowKey(rows[rIdx]),
                            colEnd: cIdx,
                            colKeyEnd: columns[cIdx].key,
                            rowEnd: rIdx,
                            rowKeyEnd: getRowKey(rows[rIdx]),
                        },
                    };
                }
                const oldSelection = oldFocus.selection;
                if (oldSelection) {
                    const startRowIndex = rows.findIndex(
                        (r) => getRowKey(r) === oldSelection.rowKeyStart
                    );
                    const startColIndex = columns.findIndex(
                        (c) => c.key === oldSelection.colKeyStart
                    );
                    if (
                        startRowIndex !== oldSelection.rowStart ||
                        startColIndex !== oldSelection.colStart ||
                        rowIndex !== oldSelection.rowEnd ||
                        colIndex !== oldSelection.colEnd
                    ) {
                        this.model.renderModel?.update({ all: true });
                        if (this.model.flags.noScrollOnFocus) {
                            this.model.flags.noScrollOnFocus = false;
                        } else {
                            this.model.renderModel?.scrollToRow(
                                rowIndex + 1,
                                "center"
                            );
                        }
                        return {
                            ...oldFocus,
                            selection: {
                                ...oldSelection,
                                rowStart: rowIndex,
                                colStart: colIndex,
                                rowEnd: rowIndex,
                                colEnd: colIndex,
                            },
                        };
                    }
                }
            }
            return oldFocus;
        });
    };

    private onCellMouseDown = (data?: {
        e: React.MouseEvent<HTMLDivElement>;
        row: any;
        col: Column;
        rowIndex: number;
        colIndex: number;
    }) => {
        if (!data) return;
        this.updateFocus(
            data.row,
            data.col,
            data.rowIndex,
            data.colIndex,
            data.e.shiftKey
                ? "shiftClick"
                : data.e.button === 0
                  ? "click"
                  : "rightClick"
        );
    };

    private onCellDragStart = (data?: {
        e: React.DragEvent<HTMLDivElement>;
        row: any;
        col: Column;
        rowIndex: number;
        colIndex: number;
    }) => {
        if (!data) return;
        if (this.model.props.setFocus) {
            const img = new Image();
            img.src =
                "data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=";
            data.e.dataTransfer.setDragImage(img, 0, 0);
            data.e.dataTransfer.setData("text/plain", "cell-sel");
        }
        this.updateFocus(
            data.row,
            data.col,
            data.rowIndex,
            data.colIndex,
            "startDrag"
        );
    };

    private onCellDragEnter = (data?: {
        e: React.DragEvent<HTMLDivElement>;
        row: any;
        col: Column;
        rowIndex: number;
        colIndex: number;
    }) => {
        if (!data) return;
        data.e.preventDefault();
        data.e.dataTransfer.dropEffect = "move";
        this.updateFocus(
            data.row,
            data.col,
            data.rowIndex,
            data.colIndex,
            "drag"
        );
    };

    private onCellDragEnd = (data?: {
        e: React.DragEvent<HTMLDivElement>;
        row: any;
        col: Column;
        rowIndex: number;
        colIndex: number;
    }) => {
        if (!data) return;
        this.model.props.setFocus?.((foc) =>
            foc ? { ...foc, isDragging: false } : undefined
        );
    };

    private visibleRowCount() {
        return this.model.renderModel?.visibleRowCount ?? 1;
    }

    private navigateArrowDown(
        context: NavigationContext<R>,
        event: React.KeyboardEvent<HTMLDivElement>
    ) {
        if (context.rowIndex < context.rows.length - 1) {
            context.rowIndex = event.ctrlKey
                ? Math.min(
                      context.rows.length - 1,
                      context.rowIndex + this.visibleRowCount()
                  )
                : context.rowIndex + 1;
        } else if (
            !event.ctrlKey &&
            this.model.props.onAddRows &&
            (!this.model.data.newRowKey ||
                (this.model.models.editing.isEditing &&
                    this.model.state.get().cellEdit?.rowKey ===
                        this.model.data.newRowKey))
        ) {
            if (this.model.models.editing.isEditing) {
                this.model.models.editing.closeEdit(true, true);
            }
            context.rows = [
                ...context.rows,
                ...this.model.actions.addNewRow(false, true),
            ];
            context.rowIndex++;
        }
    }

    private navigateArrowUp(
        context: NavigationContext<R>,
        event: React.KeyboardEvent<HTMLDivElement>
    ) {
        if (context.rowIndex > 0) {
            context.rowIndex = event.ctrlKey
                ? Math.max(0, context.rowIndex - this.visibleRowCount())
                : context.rowIndex - 1;
        }
    }

    private navigateArrowLeft(
        context: NavigationContext<R>,
        event: React.KeyboardEvent<HTMLDivElement>
    ) {
        context.columnIndex = event.ctrlKey
            ? 0
            : Math.max(0, context.columnIndex - 1);
    }

    private navigateArrowRight(
        context: NavigationContext<R>,
        event: React.KeyboardEvent<HTMLDivElement>
    ) {
        if (event.ctrlKey) {
            if (context.columnIndex === context.columns.length - 1) {
                if (this.model.props.onAddColumns) {
                    context.columns = [
                        ...context.columns,
                        ...this.model.actions.addNewColumns(1),
                    ];
                    context.columnIndex++;
                }
            } else {
                context.columnIndex = context.columns.length - 1;
            }
        } else if (context.columnIndex < context.columns.length - 1) {
            context.columnIndex++;
        }
    }

    private navigateTab(
        context: NavigationContext<R>,
        event: React.KeyboardEvent<HTMLDivElement>
    ) {
        if (event.shiftKey) {
            if (context.columnIndex > 0) {
                context.columnIndex--;
            } else {
                context.columnIndex = context.columns.length - 1;
                context.rowIndex = Math.max(0, context.rowIndex - 1);
            }
            return;
        }

        context.columnIndex =
            context.columnIndex < context.columns.length - 1
                ? context.columnIndex + 1
                : 0;

        if (
            context.columnIndex === 0 &&
            context.rowIndex === context.rows.length - 1 &&
            this.model.props.onAddRows &&
            !this.model.data.newRowKey
        ) {
            context.rows = [
                ...context.rows,
                ...this.model.actions.addNewRow(false, true),
            ];
            context.rowIndex++;
        } else if (
            context.columnIndex === 0 &&
            context.rowIndex < context.rows.length - 1
        ) {
            context.rowIndex++;
        }
    }

    private navigatePageDown(context: NavigationContext<R>) {
        context.rowIndex = Math.min(
            context.rows.length - 1,
            context.rowIndex + this.visibleRowCount()
        );
    }

    private navigatePageUp(context: NavigationContext<R>) {
        context.rowIndex = Math.max(0, context.rowIndex - this.visibleRowCount());
    }

    private navigateHome(
        context: NavigationContext<R>,
        event: React.KeyboardEvent<HTMLDivElement>
    ) {
        context.rowIndex = 0;
        if (event.ctrlKey) {
            context.columnIndex = 0;
        }
    }

    private navigateEnd(
        context: NavigationContext<R>,
        event: React.KeyboardEvent<HTMLDivElement>
    ) {
        context.rowIndex = context.rows.length - 1;
        if (event.ctrlKey) {
            context.columnIndex = context.columns.length - 1;
        }
    }

    private onContentKeyDown = (event?: React.KeyboardEvent<HTMLDivElement>) => {
        if (!event) return;

        const { getRowKey, focus } = this.model.props;
        if (
            (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
            this.model.models.editing.isEditing
        ) {
            return;
        }

        if (isNavigationKey(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            const { rows, columns } = this.model.data;
            const context: NavigationContext<R> = {
                rows,
                columns,
                rowIndex: rows.findIndex((row) => getRowKey(row) === focus?.rowKey),
                columnIndex: columns.findIndex(
                    (column) => column.key === focus?.columnKey
                ),
            };
            if (context.rowIndex >= 0 && context.columnIndex >= 0) {
                this.navigationHandlers[event.key](context, event);
                this.updateFocus(
                    context.rows[context.rowIndex],
                    context.columns[context.columnIndex],
                    context.rowIndex,
                    context.columnIndex,
                    event.shiftKey && event.key !== "Tab" ? "shiftClick" : "click",
                    true
                );
            }
        }

        if (event.ctrlKey && focus && event.code === "KeyA") {
            event.preventDefault();
            event.stopPropagation();
            const { rows, columns } = this.model.data;
            this.selectRange(0, 0, rows.length - 1, columns.length - 1);
        }
    };
}
