import { showDialog } from "./Dialogs";
import { Dialog, DialogContent, Panel, Text, Button } from "../../uikit";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { TComponentState } from "../../core/state/state";

const trustBoardDialogId = Symbol("trustBoardDialog");

interface TrustBoardDialogProps {
    boardPath: string; // absolute board-root path, for display
}

class TrustBoardDialogModel extends TDialogModel<TrustBoardDialogProps, boolean> {
    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.close(false);
        }
    };
}

function TrustBoardDialog({ model }: ViewPropsRO<TrustBoardDialogModel>) {
    const state = model.state.use();

    return (
        <Dialog name="trust-board-dialog" onKeyDown={model.handleKeyDown}>
            <DialogContent
                title="Trust this board?"
                icon="warning"
                onClose={() => model.close(false)}
                minWidth={420}
                maxWidth={640}
            >
                <Panel direction="column" gap="md" paddingX="xxl" paddingY="xl">
                    <Text>
                        Trusting this board lets it run programs on your computer with your
                        full user privileges — including reading and changing your files and
                        using any signed-in command-line tools (cloud CLIs, git, etc.).
                    </Text>
                    <Text>Only trust boards you created or fully understand.</Text>
                    <Text color="warning">
                        If you're not sure about a board, ask your AI agent to review its
                        scripts before trusting it.
                    </Text>
                    <Text color="light">{state.boardPath}</Text>
                </Panel>
                <Panel direction="row" justify="end" gap="sm" padding="md">
                    <Button onClick={() => model.close(false)}>Cancel</Button>
                    <Button variant="primary" onClick={() => model.close(true)}>
                        Trust Board
                    </Button>
                </Panel>
            </DialogContent>
        </Dialog>
    );
}

Views.registerView(trustBoardDialogId, TrustBoardDialog as DefaultView);

export function showTrustBoardDialog(boardPath: string) {
    const model = new TrustBoardDialogModel(new TComponentState({ boardPath }));
    return showDialog({
        viewId: trustBoardDialogId,
        model,
    }) as Promise<boolean>;
}
