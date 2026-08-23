import { TDialogModel } from "../../core/state/model";
import { TComponentState } from "../../core/state/state";
import { showDialog } from "./Dialogs";
import { registerDialogView } from "./dialog-view-registry";
import { InputDialogView } from "./InputDialogView";

export const inputDialogId = Symbol("inputDialog");

export interface InputDialogProps {
    title?: string;
    message: string;
    value?: string;
    buttons?: string[];
    selectAll?: boolean;
    defaultButton?: string;
    /** Optional radio button options rendered below the input field. */
    options?: string[];
    /** Initially selected option (must match one of `options`). */
    selectedOption?: string;
}

const defaultInputDialogProps: InputDialogProps = {
    title: "Input",
    message: "",
    value: "",
    buttons: ["OK", "Cancel"],
    selectAll: false,
    defaultButton: undefined,
};

export interface InputResult {
    value: string;
    button: string;
    selectedOption?: string;
}

class InputDialogModel extends TDialogModel<InputDialogProps, InputResult | undefined> {
    handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.close(undefined);
        }

        if (e.key === "Enter") {
            e.preventDefault();
            const state = this.state.get();
            if (!state.buttons || state.buttons.length === 0 || !state.value?.trim()) {
                return;
            }
            const defBt = state.defaultButton || (state.buttons ? state.buttons[0] : "OK");
            this.close({ value: state.value || "", button: defBt, selectedOption: state.selectedOption });
        }
    };

    setValue = (value: string) => {
        this.state.update((s) => {
            s.value = value;
        });
    };

    setSelectedOption = (option: string) => {
        this.state.update((s) => {
            s.selectedOption = option;
        });
    };
}

registerDialogView(inputDialogId, InputDialogView);

export function showInputDialog(props: InputDialogProps) {
    const modelState = {
        ...defaultInputDialogProps,
        ...props,
    };

    const model = new InputDialogModel(new TComponentState(modelState));
    return showDialog({
        viewId: inputDialogId,
        model,
    }) as Promise<InputResult | undefined>;
}
