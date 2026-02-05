import styled from "@emotion/styled";

import { showDialog } from "./Dialogs";
import { Dialog, DialogContent } from "./Dialog";
import color from "../../theme/color";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { ConfirmIcon } from "../../theme/icons";
import { Button } from "../../components/basic/Button";
import { TComponentState } from "../../core/state/state";

const ConfirmationDialogContent = styled(DialogContent)(
    {
        minWidth: 300,
        maxWidth: 800,
        "& .confirmation-message": {
            padding: "16px 24px",
            fontSize: 16,
            color: color.text.default,
        },
        "& .confirmation-dialog-buttons": {
            display: "flex",
            flexDirection: "row",
            justifyContent: "flex-end",
            columnGap: 8,
            padding: 8,
        },
        "& .dialog-button": {
            minWidth: 60,
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            padding: "4px 12px",
            "&.ok-button": {
                backgroundColor: color.background.light,
            },
            "&:hover": {
                borderColor: color.border.active,
            },
        },
    },
    { label: "ConfirmationDialogContent" }
);

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
        <Dialog onKeyDown={model.handleKeyDown}>
            <ConfirmationDialogContent
                title={
                    <>
                        <ConfirmIcon color={color.icon.default} /> {state.title}
                    </>
                }
                onClose={() => model.close(undefined)}
            >
                <div className="confirmation-message">{state.message}</div>
                <div className="confirmation-dialog-buttons">
                    {state.buttons?.map((bt, i) => (
                        <Button
                            key={i}
                            onClick={() => model.close(bt)}
                            className="dialog-button"
                        >
                            {bt}
                        </Button>
                    ))}
                </div>
            </ConfirmationDialogContent>
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
