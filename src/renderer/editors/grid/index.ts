import { TComponentState } from "../../core/state/state";
import { TextChromeView } from "../base/TextChromeView";
import { ButtonView, type ButtonViewProps } from "../../uikit/Button/ButtonView";
import { IconButtonView, type IconButtonViewProps } from "../../uikit/IconButton/IconButtonView";
import { InputView } from "../../uikit/Input/InputView";
import type { InputProps } from "../../uikit/Input/InputView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { showColumnsOptions } from "./components/ColumnsOptions";
import { showCsvOptions } from "./components/CsvOptions";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";
import { GridEditor, defaultGridEditorState, type GridEditorState } from "./GridEditor";
import { GridBodyView, getVisibleRowsLabel } from "./GridBodyView";
import type { DataGridInstance } from "../../uikit/DataGrid";
import type { GridEditorId } from "./util";
import "../../uikit/Button/Button.css";

function createContentsRoot(): HTMLSpanElement {
    const root = document.createElement("span");
    root.style.display = "contents";
    return root;
}

function requireGridModel(model: EditorModel): GridEditor {
    if (!(model instanceof GridEditor)) throw new Error("Grid view received an invalid model.");
    return model;
}

interface GridToolbarProps {
    model: GridEditor;
    getGridModel: () => DataGridInstance<any> | null;
}

class GridToolbarView extends VanillaView<GridToolbarProps> {
    private model: GridEditor;
    private readonly getGridModel: () => DataGridInstance<any> | null;
    private columnsButton: IconButtonView | undefined;
    private csvButton: ButtonView | undefined;

    public constructor(props: GridToolbarProps) {
        super(props, createContentsRoot());
        this.model = props.model;
        this.getGridModel = props.getGridModel;
    }

    protected onMount(): void {
        this.columnsButton = this.child(new IconButtonView(this.columnsButtonProps()));
        this.root.append(this.columnsButton.root);
        this.columnsButton.mount();
        this.syncCsvButton();
    }

    protected onUpdate(props: GridToolbarProps): void {
        this.model = props.model;
        this.syncCsvButton();
        this.columnsButton?.update(this.columnsButtonProps());
        this.csvButton?.update(this.csvButtonProps());
    }

    protected onDispose(): void {
        this.columnsButton = undefined;
        this.csvButton = undefined;
    }

    private syncCsvButton(): void {
        if (this.model.format === "csv" && !this.csvButton) {
            this.csvButton = this.child(new ButtonView(this.csvButtonProps()));
            this.root.append(this.csvButton.root);
            this.csvButton.mount();
        } else if (this.model.format !== "csv" && this.csvButton) {
            this.releaseChild(this.csvButton);
            this.csvButton = undefined;
        }
    }

    private columnsButtonProps(): IconButtonViewProps {
        return {
            name: "grid-columns",
            size: "sm",
            title: "Edit Columns",
            icon: "columns",
            onClick: this.handleColumnsClick,
        };
    }

    private csvButtonProps(): ButtonViewProps {
        return {
            name: "grid-csv-options",
            size: "sm",
            variant: "ghost",
            title: "Csv Options",
            onClick: () => {
                const button = this.csvButton?.root;
                if (button) void showCsvOptions(button, this.model);
            },
            children: "⚙-csv",
        };
    }

    private readonly handleColumnsClick = (event: MouseEvent): void => {
        const grid = this.getGridModel();
        if (!grid || !(event.currentTarget instanceof Element)) return;
        void showColumnsOptions(
            event.currentTarget,
            grid,
            this.model.format === "csv",
            this.model.onUpdateRows,
        );
    };
}

class GridSearchInputView extends VanillaView<{ model: GridEditor }> {
    private model: GridEditor;
    private input: InputView | undefined;
    private clearButton: IconButtonView | undefined;
    private stateSubscription: (() => void) | undefined;

    public constructor(props: { model: GridEditor }) {
        super(props, createContentsRoot());
        this.model = props.model;
    }

    protected onMount(): void {
        this.input = this.child(new InputView(this.inputProps(this.model.state.get().search)));
        this.root.append(this.input.root);
        this.input.mount();
        this.bindState();
        this.sync(this.model.state.get().search);
        this.own(() => {
            this.stateSubscription?.();
            this.stateSubscription = undefined;
        });
    }

    protected onUpdate(props: { model: GridEditor }): void {
        if (props.model !== this.model) {
            this.model = props.model;
            this.bindState();
        }
        this.sync(this.model.state.get().search);
    }

    protected onDispose(): void {
        this.input = undefined;
        this.clearButton = undefined;
    }

    private bindState(): void {
        this.stateSubscription?.();
        this.stateSubscription = this.model.state.subscribe<string>(
            (search) => this.sync(search),
            (state) => state.search,
        );
    }

    private sync(search: string): void {
        if (search && !this.clearButton) {
            this.clearButton = this.child(new IconButtonView(this.clearButtonProps()));
            this.root.append(this.clearButton.root);
            this.clearButton.mount();
        } else if (!search && this.clearButton) {
            this.releaseChild(this.clearButton);
            this.clearButton = undefined;
        }
        this.input?.update(this.inputProps(search));
    }

    private inputProps(search: string): InputProps {
        return {
            name: "grid-search",
            size: "sm",
            width: 200,
            value: search,
            onChange: this.model.setSearch,
            placeholder: "Search...",
            endSlot: this.clearButton?.root,
        };
    }

    private clearButtonProps(): IconButtonViewProps {
        return {
            name: "grid-search-clear",
            size: "sm",
            title: "Clear Search",
            icon: "close",
            onClick: this.model.clearSearch,
        };
    }
}

interface GridFooterProjection {
    rowCount: GridEditorState["rowCount"];
    filterCount: number;
    displayedRowCount: GridEditorState["displayedRowCount"];
}

function selectGridFooter(state: GridEditorState): GridFooterProjection {
    return {
        rowCount: state.rowCount,
        filterCount: state.filters.length,
        displayedRowCount: state.displayedRowCount,
    };
}

export class GridEditorView extends VanillaView<{ model: EditorModel }> {
    private model: GridEditor | undefined;
    private gridModel: DataGridInstance<any> | null = null;
    private body: GridBodyView | undefined;
    private toolbar: GridToolbarView | undefined;
    private searchInput: GridSearchInputView | undefined;
    private chrome: TextChromeView | undefined;
    private footer: HTMLSpanElement | undefined;

    public constructor(props: { model: EditorModel }) {
        super(props, createContentsRoot());
    }

    protected onMount(): void {
        const model = requireGridModel(this.props.model);
        this.model = model;
        const body = this.child(new GridBodyView({ model, onModel: this.onGridModel }));
        const toolbar = this.child(new GridToolbarView({ model, getGridModel: this.getGridModel }));
        const searchInput = this.child(new GridSearchInputView({ model }));
        const footer = document.createElement("span");
        footer.className = "records-count";
        const chrome = this.child(new TextChromeView({
            model: this.props.model,
            children: body.root,
            toolbarContributions: toolbar.root,
            rightToolbarContributions: searchInput.root,
            footerContributions: footer,
        }));

        this.body = body;
        this.toolbar = toolbar;
        this.searchInput = searchInput;
        this.chrome = chrome;
        this.footer = footer;
        this.root.append(body.root, toolbar.root, searchInput.root, footer, chrome.root);
        body.mount();
        toolbar.mount();
        searchInput.mount();
        chrome.mount();
        this.bind(this.model.state, selectGridFooter, (projection) => {
            this.updateFooter(projection);
        });
    }

    protected onUpdate(props: { model: EditorModel }): void {
        const model = requireGridModel(props.model);
        if (model !== this.model) {
            throw new Error("Grid view received a different model instance.");
        }
        const body = this.body;
        const toolbar = this.toolbar;
        const searchInput = this.searchInput;
        const chrome = this.chrome;
        if (!body || !toolbar || !searchInput || !chrome) return;
        body.update({ model, onModel: this.onGridModel });
        chrome.update({
            model: props.model,
            children: body.root,
            toolbarContributions: toolbar.root,
            rightToolbarContributions: searchInput.root,
            footerContributions: this.footer,
        });
        this.updateFooter(selectGridFooter(model.state.get()));
    }

    protected onDispose(): void {
        this.gridModel = null;
        this.model = undefined;
        this.body = undefined;
        this.toolbar = undefined;
        this.searchInput = undefined;
        this.chrome = undefined;
        this.footer = undefined;
    }

    private readonly getGridModel = (): DataGridInstance<any> | null => this.gridModel;

    private readonly onGridModel = (grid: DataGridInstance<any> | null): void => {
        this.gridModel = grid;
    };

    private updateFooter(projection: GridFooterProjection): void {
        if (!this.footer || !this.model) return;
        void projection;
        this.footer.textContent = getVisibleRowsLabel(this.model);
    }
}

function makeModule(id: GridEditorId): EditorModule {
    return {
        createEditor: () =>
            new GridEditor(new TComponentState({ ...defaultGridEditorState }), id),
        View: GridEditorView,
        BodyView: GridBodyView,
    };
}

export const gridJsonModule: EditorModule = makeModule("grid-json");
export const gridCsvModule: EditorModule = makeModule("grid-csv");
export const gridJsonlModule: EditorModule = makeModule("grid-jsonl");

export { GridEditor, defaultGridEditorState } from "./GridEditor";
export type { GridEditorState, GridQueueEvent } from "./GridEditor";
export type { GridFormat, GridEditorId } from "./util";

// Re-exports kept for outside callers (utils + popovers).
export type { GridData, GridColumn } from "./utils/grid-utils";
export {
    getRowKey,
    registerRow,
    registerRows,
    getGridDataWithColumns,
    nextColumnKeys,
} from "./utils/grid-utils";
export { showColumnsOptions } from "./components/ColumnsOptions";
export { showCsvOptions } from "./components/CsvOptions";
