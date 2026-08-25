import { TComponentState } from "../../../core/state/state";
import { CheckboxView } from "../../../uikit/Checkbox/CheckboxView";
import "../../../uikit/Checkbox/Checkbox.css";
import { InputView } from "../../../uikit/Input/InputView";
import { PopoverView } from "../../../uikit/Popover/PopoverView";
import { createPanelElement } from "../../../uikit/Panel/panel-style";
import { RadioGroupView } from "../../../uikit/RadioGroup/RadioGroupView";
import "../../../uikit/RadioGroup/RadioGroup.css";
import type { IRadio } from "../../../uikit/RadioGroup/RadioGroup";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { createTextElement } from "../../../uikit/Text/text-style";
import { TPopperModel } from "../../../ui/dialogs/poppers/types";
import { showPopper } from "../../../ui/dialogs/poppers/Poppers";
import type { DialogViewProps } from "../../../ui/dialogs/dialog-view-registry";
import { registerDialogView } from "../../../ui/dialogs/dialog-view-registry";
import type { GridEditor } from "../GridEditor";

class CsvOptionsModel extends TPopperModel<null, void> {
    el = undefined as Element | undefined;
    gridModel = undefined as GridEditor | undefined;
    other = "";

    setGridModel = (gridModel: GridEditor): void => {
        this.gridModel = gridModel;
        this.other = gridModel.state.get().csvDelimiter;
    };

    setDelimiter = (value: string): void => {
        this.gridModel?.setDelimiter(value);
    };

    setOtherProxy = (value: string): void => {
        const valueToSet = value.length > 1 ? value[0] : value;
        this.other = valueToSet;
        if (valueToSet) {
            this.gridModel?.setDelimiter(valueToSet);
        }
    };

    syncOther = (csvDelimiter: string): void => {
        if (this.other && csvDelimiter && this.other !== csvDelimiter) {
            this.other = csvDelimiter;
        }
    };

    toggleWithColumns = (): void => {
        this.gridModel?.toggleWithColumns();
    };
}

const defaultOffset = [0, 2] as [number, number];
const showCsvOptionsId = Symbol("ShowCsvOptions");

const delimiterItems: IRadio[] = [
    { value: ",", label: "," },
    { value: ";", label: ";" },
    { value: "\t", label: "\\t" },
];

class CsvOptionsContentView extends VanillaView<undefined> {
    private readonly model: CsvOptionsModel;
    private checkboxView!: CheckboxView;
    private radioGroupView!: RadioGroupView;
    private inputView!: InputView;

    public constructor(host: HTMLElement, model: CsvOptionsModel) {
        super(undefined, host);
        this.model = model;
    }

    protected onMount(): void {
        const gridModel = this.model.gridModel;
        if (!gridModel) return;

        const state = gridModel.state.get();
        const checkboxView = this.child(new CheckboxView({
            checked: state.csvWithColumns,
            onChange: this.model.toggleWithColumns,
            children: "First row is header",
        }));
        const radioGroupView = this.child(new RadioGroupView({
            items: delimiterItems,
            value: state.csvDelimiter,
            onChange: this.model.setDelimiter,
        }));
        const inputView = this.child(new InputView({
            size: "sm",
            value: this.model.other,
            onChange: this.handleOtherChange,
            width: 40,
        }));

        const otherPanel = createPanelElement(
            { direction: "row", align: "center", gap: "sm" },
            [createTextElement("Other:"), inputView.root],
        );
        const optionsPanel = createPanelElement(
            {
                name: "csv-options",
                direction: "column",
                align: "start",
                gap: "sm",
                padding: "lg",
                minWidth: 140,
                minHeight: 60,
            },
            [
                checkboxView.root,
                createTextElement("Delimiter:", { color: "light" }),
                radioGroupView.root,
                otherPanel,
            ],
        );
        this.root.append(optionsPanel);

        checkboxView.mount();
        radioGroupView.mount();
        inputView.mount();
        this.checkboxView = checkboxView;
        this.radioGroupView = radioGroupView;
        this.inputView = inputView;

        this.bind(
            gridModel.state,
            (nextState) => ({
                csvDelimiter: nextState.csvDelimiter,
                csvWithColumns: nextState.csvWithColumns,
            }),
            (nextState) => this.syncState(nextState),
        );
    }

    private syncState(state: { csvDelimiter: string; csvWithColumns: boolean }): void {
        this.model.syncOther(state.csvDelimiter);
        this.checkboxView.update({
            checked: state.csvWithColumns,
            onChange: this.model.toggleWithColumns,
            children: "First row is header",
        });
        this.radioGroupView.update({
            items: delimiterItems,
            value: state.csvDelimiter,
            onChange: this.model.setDelimiter,
        });
        this.inputView.update({
            size: "sm",
            value: this.model.other,
            onChange: this.handleOtherChange,
            width: 40,
        });
    }

    private readonly handleOtherChange = (value: string): void => {
        this.model.setOtherProxy(value);
        this.inputView.update({
            size: "sm",
            value: this.model.other,
            onChange: this.handleOtherChange,
            width: 40,
        });
    };
}

class CsvOptionsView extends VanillaView<DialogViewProps> {
    private readonly model: CsvOptionsModel;

    public constructor(props: DialogViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.model = props.model as CsvOptionsModel;
    }

    protected onMount(): void {
        const popoverView = this.child(new PopoverView({
            elementRef: this.model.el,
            offset: defaultOffset,
            open: true,
            onClose: () => { void this.model.close(); },
            placement: "bottom-start",
            contentView: (host) => new CsvOptionsContentView(host, this.model),
        }));
        popoverView.mount();
    }
}

registerDialogView(showCsvOptionsId, CsvOptionsView);

export const showCsvOptions = async (el: Element, gridModel: GridEditor) => {
    const model = new CsvOptionsModel(new TComponentState(null));
    model.el = el;
    model.setGridModel(gridModel);
    await showPopper<void>({
        viewId: showCsvOptionsId,
        model,
    });
};
