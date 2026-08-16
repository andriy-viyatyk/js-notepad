import { showDialog } from "./Dialogs";
import { Dialog, DialogContent, Panel, Text, Button } from "../../uikit";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { TComponentState } from "../../core/state/state";

const confirmationDialogId = Symbol("confirmationDialog");

interface ConfirmationDialogProps {
    title?: string;
    message: string;
    buttons?: string[];
}

const defaultConfirmationDialogProps: ConfirmationDialogProps = {
    title: "Confirmatioin",
    message: "",
    buttons: ["Yes", "Cancel"],
};

class ConfirmationDialogModel extends TDialogModel<
    ConfirmationDialogProps,
    string
> {
    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.close(undefined);
        }
    };
}

function ConfirmationDialog({ model }: ViewPropsRO<ConfirmationDialogModel>) {
    const state = model.state.use();

    return (
        <Dialog name="confirmation-dialog" onKeyDown={model.handleKeyDown}>
            <DialogContent
                title={state.title}
                icon="confirm"
                onClose={() => model.close(undefined)}
                minWidth={300}
                maxWidth={800}
            >
                <Panel direction="column" paddingX="xxl" paddingY="xl">
                    <Text>{state.message}</Text>
                </Panel>
                <Panel direction="row" justify="end" gap="sm" padding="md">
                    {state.buttons?.map((bt, i) => (
                        <Button key={i} onClick={() => model.close(bt)}>
                            {bt}
                        </Button>
                    ))}
                </Panel>
            </DialogContent>
        </Dialog>
    );
}

Views.registerView(confirmationDialogId, ConfirmationDialog as DefaultView);

export function showConfirmationDialog(props: ConfirmationDialogProps) {
    const modelState = {
        ...defaultConfirmationDialogProps,
        ...props,
    };

    const model = new ConfirmationDialogModel(new TComponentState(modelState));
    return showDialog({
        viewId: confirmationDialogId,
        model,
    }) as Promise<string>;
}
