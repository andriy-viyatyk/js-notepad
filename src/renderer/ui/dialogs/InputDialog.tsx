import { Dialog, DialogContent, Panel, Text, Button, Input, RadioGroup } from "../../uikit";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { ConfirmIcon } from "../../theme/icons";
import { TComponentState } from "../../core/state/state";
import { showDialog } from "./Dialogs";
import { useEffect, useRef } from "react";

const inputDialogId = Symbol("inputDialog");

interface InputDialogProps {
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
    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
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

function InputDialog({ model }: ViewPropsRO<InputDialogModel>) {
    const state = model.state.use();
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setTimeout(() => {
            if (state.selectAll) {
                inputRef.current?.select();
            } else {
                inputRef.current?.focus();
            }
        }, 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only auto-focus: state.selectAll is read at mount-time-via-setTimeout; the dialog re-mounts per open, so the initial value is always current
    }, []);

    return (
        <Dialog name="input-dialog" onKeyDown={model.handleKeyDown} autoFocus={false}>
            <DialogContent
                title={state.title}
                icon={<ConfirmIcon />}
                onClose={() => model.close(undefined)}
                minWidth={340}
                maxWidth={800}
            >
                <Panel direction="column" paddingX="xxl" paddingTop="xl" paddingBottom="sm" gap="md">
                    <Text>{state.message}</Text>
                    <Input
                        name="input-dialog-input"
                        ref={inputRef}
                        value={state.value ?? ""}
                        onChange={model.setValue}
                    />
                </Panel>
                {state.options && state.options.length > 0 && (
                    <Panel paddingX="xxl" paddingY="sm">
                        <RadioGroup
                            name="input-dialog-radio"
                            orientation="horizontal"
                            wrap
                            items={state.options.map((o) => ({ value: o }))}
                            value={state.selectedOption ?? ""}
                            onChange={model.setSelectedOption}
                        />
                    </Panel>
                )}
                <Panel direction="row" justify="end" gap="sm" padding="md">
                    {state.buttons?.map((bt, i) => (
                        <Button
                            key={i}
                            onClick={() => model.close({ value: state.value ?? "", button: bt, selectedOption: state.selectedOption })}
                        >
                            {bt}
                        </Button>
                    ))}
                </Panel>
            </DialogContent>
        </Dialog>
    );
}

Views.registerView(inputDialogId, InputDialog as DefaultView);

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
