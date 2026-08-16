import { showDialog } from "./Dialogs";
import { Dialog, DialogContent, Panel, Text, Button } from "../../uikit";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { TComponentState } from "../../core/state/state";

/**
 * Confirmation dialog gating AGENT-initiated toolset registration (EPIC-038 / US-804 / C3).
 * Registering a toolset lets its tools run as headless OS processes with the user's privileges,
 * and — unlike a board (a visible artifact) — later edits to those tools run without re-prompting,
 * so registration is the user's one checkpoint on capability growth. Mirrors `TrustBoardDialog`.
 *
 * Only the MCP `create_toolset` path uses this. User-initiated registration in the management UI
 * (US-805) needs no dialog — the user already picked the folder.
 */
const registerToolsetDialogId = Symbol("registerToolsetDialog");

export interface RegisterToolsetDialogProps {
    toolsetName: string;
    toolsetRoot: string; // absolute toolset-root path, for display
    tools: { name: string; description: string }[];
}

class RegisterToolsetDialogModel extends TDialogModel<RegisterToolsetDialogProps, boolean> {
    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.close(false);
        }
    };
}

function RegisterToolsetDialog({ model }: ViewPropsRO<RegisterToolsetDialogModel>) {
    const state = model.state.use();

    return (
        <Dialog name="register-toolset-dialog" onKeyDown={model.handleKeyDown}>
            <DialogContent
                title="Register this toolset?"
                icon="warning"
                onClose={() => model.close(false)}
                minWidth={440}
                maxWidth={680}
            >
                <Panel direction="column" gap="md" paddingX="xxl" paddingY="xl">
                    <Text>
                        An AI agent wants to register a toolset. Once registered, its tools run as
                        programs on your computer with your full user privileges — headlessly,
                        whenever the agent calls them, and after the agent edits them, with no
                        further prompt.
                    </Text>
                    <Text>Only register toolsets you created or fully understand.</Text>
                    <Text color="warning">
                        If you're not sure, ask your AI agent to explain what these tools do before
                        registering.
                    </Text>
                    <Text color="light">{`${state.toolsetName}  —  ${state.toolsetRoot}`}</Text>
                    {state.tools.map((t) => (
                        <Text key={t.name} color="light">{`• ${t.name} — ${t.description}`}</Text>
                    ))}
                </Panel>
                <Panel direction="row" justify="end" gap="sm" padding="md">
                    <Button onClick={() => model.close(false)}>Cancel</Button>
                    <Button variant="primary" onClick={() => model.close(true)}>
                        Register toolset
                    </Button>
                </Panel>
            </DialogContent>
        </Dialog>
    );
}

Views.registerView(registerToolsetDialogId, RegisterToolsetDialog as DefaultView);

export function showRegisterToolsetDialog(props: RegisterToolsetDialogProps): Promise<boolean> {
    const model = new RegisterToolsetDialogModel(new TComponentState(props));
    return showDialog({
        viewId: registerToolsetDialogId,
        model,
    }) as Promise<boolean>;
}
