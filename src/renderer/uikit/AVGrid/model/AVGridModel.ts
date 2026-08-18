import { CSSProperties, ReactNode, SetStateAction } from "react";
import {
    CellEdit,
    CellFocus,
    Column,
    TFilter,
    TSortColumn,
} from "../avGridTypes";
import { TComponentModel } from "../../../core/state/model";
import type { MenuItem } from "../../Menu";
import { RenderGridModel } from "../../RenderGrid";
import type { RerenderInfo } from "../../RenderGrid";
import { IState } from "../../../core/state/state";
import { ColumnsModel } from "./ColumnsModel";
import { AVGridData } from "./AVGridData";
import { SortColumnModel } from "./SortColumnModel";
import { RowsModel } from "./RowsModel";
import { SelectedModel } from "./SelectedModel";
import { AVGridEvents } from "./AVGridEvents";
import { FocusModel } from "./FocusModel";
import { EditingModel } from "./EditingModel";
import { CopyPasteModel } from "./CopyPasteModel";
import { ContextMenuModel } from "./ContextMenuModel";
import { EffectsModel } from "./EffectsModel";
import { AVGridActions } from "./AVGridActions";
import type { FiltersModel } from "../filters/FiltersModel";

export interface AVGridProps<R> {
    /** Called with the live model on mount and null on unmount. */
    onModel?: (model: AVGridModel<R> | null) => void;
    /** Optional debug label emitted as `data-name` on the rendered RenderGrid root.
     *  Use to disambiguate multiple AVGrid instances in DOM inspector output. */
    name?: string;
    columns: Column<R>[];
    rows: R[];
    getRowKey: (row: R) => string;
    rowHeight?: number;
    searchString?: string;
    /** External highlight text (highlight-only, no row filtering) */
    highlightString?: string;
    filters?: TFilter[];
    filtersModel?: FiltersModel;
    readonly?: boolean;
    disableFiltering?: boolean;
    disableSorting?: boolean;
    loading?: boolean;
    entity?: string;

    selected?: ReadonlySet<string>;
    setSelected?: (value: SetStateAction<ReadonlySet<string>>) => void;
    focus?: CellFocus<R>;
    setFocus?: (value: SetStateAction<CellFocus<R> | undefined>) => void;

    editRow?: (columnKey: string, rowKey: string, value: any) => void;
    onAddRows?: (count: number, insertIndex?: number) => R[];
    onDeleteRows?: (rowKeys: string[]) => void;
    setColumns?: (columns: SetStateAction<Column<R>[]>) => void;
    onAddColumns?: (count: number, insertBeforeKey?: string) => Column<R>[];
    onDeleteColumns?: (columnKeys: (keyof R | string)[]) => void;

    onClick?: (row: R, col: Column<R>) => void;
    onDoubleClick?: (row: R, col: Column<R>) => void;
    /** Caller-supplied context-menu items for a data-cell right-click, prepended
     *  above the built-in copy/insert/delete items. Receives the current row
     *  selection (the right-clicked row is selected first). Return [] to add none. */
    getContextMenuItems?: (selectedRows: R[]) => MenuItem[];
    onMouseDown?: (e: React.MouseEvent) => void;
    onCellClass?: (row: R, col: Column<R>) => string;
    onColumnsChanged?: () => void;
    onVisibleRowsChanged?: () => void;
    onDataChanged?: () => void;

    scrollToFocus?: boolean;
    fitToWidth?: boolean;
    /** Render the static cell grid lines (header bottom border + each cell's
     *  bottom/right border + the first column's left border). Default `true`.
     *  Set `false` for a borderless list look — selection and focus borders are
     *  unaffected. */
    cellBorders?: boolean;
    growToHeight?: CSSProperties["height"];
    growToWidth?: CSSProperties["height"];
    /** Caller-supplied node rendered after the last row (forwarded to
     *  RenderGrid.extraElement). Ignored when `onAddRows` is set — the internal
     *  add-row button takes that slot. */
    extraElement?: ReactNode;
}

export interface AVGridState<R> {
    sortColumn?: TSortColumn;
    cellEdit: CellEdit<R>;
    rerender: number;
}

export const defaultAVGridState: AVGridState<any> = {
    sortColumn: undefined,
    cellEdit: {
        columnKey: "",
        rowKey: "",
        value: undefined,
        dontSelect: false,
        changed: false,
    },
    rerender: new Date().getTime(),
};

export class AVGridModels<R> {
    readonly columns: ColumnsModel<R>;
    readonly sortColumn: SortColumnModel<R>;
    readonly rows: RowsModel<R>;
    readonly selected: SelectedModel<R>;
    readonly focus: FocusModel<R>;
    readonly editing: EditingModel<R>;
    readonly copyPaste: CopyPasteModel<R>;
    readonly contextMenu: ContextMenuModel<R>;
    readonly effects: EffectsModel<R>;

    constructor(model: AVGridModel<R>) {
        this.columns = new ColumnsModel<R>(model);
        this.sortColumn = new SortColumnModel(model);
        this.rows = new RowsModel<R>(model);
        this.selected = new SelectedModel<R>(model);
        this.focus = new FocusModel<R>(model);
        this.editing = new EditingModel<R>(model);
        this.copyPaste = new CopyPasteModel<R>(model);
        this.contextMenu = new ContextMenuModel<R>(model);
        this.effects = new EffectsModel<R>(model);
    }
}

export class AVGridModel<R> extends TComponentModel<
    AVGridState<R>,
    AVGridProps<R>
> {
    renderModel: RenderGridModel | null = null;
    readonly data: AVGridData<R>;
    readonly events: AVGridEvents<R>;
    readonly actions: AVGridActions<R>;
    readonly models: AVGridModels<R>;
    readonly flags = {
        noScrollOnFocus: false,
    };

    constructor(
        modelState:
            | IState<AVGridState<R>>
            | (new (defaultState: AVGridState<R>) => IState<AVGridState<R>>),
        defaultState?: AVGridState<R>
    ) {
        super(modelState, defaultState);
        this.data = new AVGridData<R>([], []);
        this.events = new AVGridEvents(this);
        this.models = new AVGridModels<R>(this);
        this.actions = new AVGridActions<R>(this);
    }

    useModel = () => {
        this.models.columns.useModel();
        this.models.sortColumn.useModel();
        this.models.rows.useModel();
        this.models.selected.useModel();
        this.models.editing.useModel();
        this.models.effects.useModel();

        this.state.use(s => s.rerender);
    };

    update = (rerender?: RerenderInfo) => {
        this.renderModel?.update(rerender);
    };

    setRenderModel = (renderModel: RenderGridModel | null) => {
        this.renderModel = renderModel;
    };

    focusGrid = () => {
        this.renderModel?.gridRef.current?.focus();
    };

    dataChanged = () => {
        setTimeout(() => {
            this.props.onDataChanged?.();
        }, 0);
    };

    rerender = () => {
        this.state.update((s) => {
            s.rerender = new Date().getTime();
        });
    };

    init() {
        this.props.onModel?.(this);
    }

    onUnmount = () => {
        this.props.onModel?.(null);
    };
}
