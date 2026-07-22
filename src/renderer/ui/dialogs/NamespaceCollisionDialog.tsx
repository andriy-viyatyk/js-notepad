import { showDialog } from "./Dialogs";
import { Dialog, DialogContent, Panel, Text, Button } from "../../uikit";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { WarningIcon } from "../../theme/icons";
import { TComponentState } from "../../core/state/state";

const namespaceCollisionDialogId = Symbol("namespaceCollisionDialog");

interface NamespaceCollisionDialogProps {
    namespace: string; // the colliding "author/name" namespace, for display
    collidingRoot: string; // absolute root path of the already-trusted board using it
}

class NamespaceCollisionDialogModel extends TDialogModel<NamespaceCollisionDialogProps, boolean> {
    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.close(false);
        }
    };
}

function NamespaceCollisionDialog({ model }: ViewPropsRO<NamespaceCollisionDialogModel>) {
    const state = model.state.use();

    return (
        <Dialog name="namespace-collision-dialog" onKeyDown={model.handleKeyDown}>
            <DialogContent
                title="Environment variables namespace already registered"
                icon={<WarningIcon />}
                onClose={() => model.close(false)}
                minWidth={420}
                maxWidth={640}
            >
                <Panel direction="column" gap="md" paddingX="xxl" paddingY="xl">
                    <Text>
                        Another registered board already uses the namespace "{state.namespace}"
                        for its environment variables. Registering this board too means they'll
                        share the same stored variables.
                    </Text>
                    <Text color="light">{state.collidingRoot}</Text>
                    <Text>
                        If that's intentional (e.g. a shared configuration), register anyway.
                        Otherwise, cancel and give this board a distinct author/name in its
                        board-manifest.json, then register again.
                    </Text>
                </Panel>
                <Panel direction="row" justify="end" gap="sm" padding="md">
                    <Button onClick={() => model.close(false)}>Cancel</Button>
                    <Button variant="primary" onClick={() => model.close(true)}>
                        Register Anyway
                    </Button>
                </Panel>
            </DialogContent>
        </Dialog>
    );
}

Views.registerView(namespaceCollisionDialogId, NamespaceCollisionDialog as DefaultView);

export function showNamespaceCollisionDialog(namespace: string, collidingRoot: string) {
    const model = new NamespaceCollisionDialogModel(
        new TComponentState({ namespace, collidingRoot }),
    );
    return showDialog({
        viewId: namespaceCollisionDialogId,
        model,
    }) as Promise<boolean>;
}
