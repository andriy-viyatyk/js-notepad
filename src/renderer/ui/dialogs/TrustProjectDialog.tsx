import { showDialog } from "./Dialogs";
import { Dialog, DialogContent, Panel, Text, Button } from "../../uikit";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { WarningIcon } from "../../theme/icons";
import { TComponentState } from "../../core/state/state";

const trustProjectDialogId = Symbol("trustProjectDialog");

interface TrustProjectDialogProps {
    projectPath: string; // absolute .persephone (or project root) path, for display
}

class TrustProjectDialogModel extends TDialogModel<TrustProjectDialogProps, boolean> {
    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.close(false);
        }
    };
}

function TrustProjectDialog({ model }: ViewPropsRO<TrustProjectDialogModel>) {
    const state = model.state.use();

    return (
        <Dialog name="trust-project-dialog" onKeyDown={model.handleKeyDown}>
            <DialogContent
                title="Trust this project?"
                icon={<WarningIcon />}
                onClose={() => model.close(false)}
                minWidth={420}
                maxWidth={640}
            >
                <Panel direction="column" gap="md" paddingX="xxl" paddingY="xl">
                    <Text>
                        Trusting this project lets its boards run programs on your computer
                        with your full user privileges — including reading and changing your
                        files and using any signed-in command-line tools (cloud CLIs, git, etc.).
                    </Text>
                    <Text>Only trust projects you created or fully understand.</Text>
                    <Text color="light">{state.projectPath}</Text>
                </Panel>
                <Panel direction="row" justify="end" gap="sm" padding="md">
                    <Button onClick={() => model.close(false)}>Cancel</Button>
                    <Button variant="primary" onClick={() => model.close(true)}>
                        Trust Project
                    </Button>
                </Panel>
            </DialogContent>
        </Dialog>
    );
}

Views.registerView(trustProjectDialogId, TrustProjectDialog as DefaultView);

export function showTrustProjectDialog(projectPath: string) {
    const model = new TrustProjectDialogModel(new TComponentState({ projectPath }));
    return showDialog({
        viewId: trustProjectDialogId,
        model,
    }) as Promise<boolean>;
}
