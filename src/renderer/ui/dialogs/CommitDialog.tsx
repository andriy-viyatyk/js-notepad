import { Dialog, DialogContent, Panel, Text, Button, Input, Textarea } from "../../uikit";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { GitIcon } from "../../theme/icons";
import { TComponentState } from "../../core/state/state";
import { showDialog } from "./Dialogs";

const commitDialogId = Symbol("commitDialog");

interface CommitDialogProps {
    title?: string;
    /** Current branch name shown read-only at the top; undefined → detached / no branch. */
    branch?: string;
    /** Initial commit message. */
    message?: string;
    /** Author name, prepopulated from git config (editable). */
    name?: string;
    /** Author email, prepopulated from git config (editable). */
    email?: string;
    /** Action buttons. The "Cancel" button always closes with `undefined`; any other
     *  button closes with the result (gated on a non-empty message). Default
     *  `["Commit", "Cancel"]`; the future push task passes `["Commit", "Commit and Push",
     *  "Cancel"]` (US-632 / EPIC-031). */
    buttons?: string[];
}

const defaultCommitDialogProps: CommitDialogProps = {
    title: "Commit",
    branch: undefined,
    message: "",
    name: "",
    email: "",
    buttons: ["Commit", "Cancel"],
};

export interface CommitResult {
    message: string;
    name: string;
    email: string;
    /** The clicked action button's label (never "Cancel" — Cancel resolves `undefined`). */
    button: string;
}

class CommitDialogModel extends TDialogModel<CommitDialogProps, CommitResult | undefined> {
    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.close(undefined);
            return;
        }
        // Ctrl/Cmd+Enter commits with the first non-Cancel (default) action button.
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            const s = this.state.get();
            const action = s.buttons?.find((b) => b !== "Cancel") ?? "Commit";
            this.submit(action);
        }
    };

    setMessage = (v: string) => this.state.update((s) => { s.message = v; });
    setName = (v: string) => this.state.update((s) => { s.name = v; });
    setEmail = (v: string) => this.state.update((s) => { s.email = v; });

    /** Close with the result — only if the message is non-blank (the dialog's action
     *  buttons are disabled otherwise, but Ctrl+Enter routes here too). */
    submit = (button: string) => {
        const s = this.state.get();
        if (!s.message?.trim()) return;
        this.close({
            message: s.message ?? "",
            name: s.name ?? "",
            email: s.email ?? "",
            button,
        });
    };
}

function CommitDialog({ model }: ViewPropsRO<CommitDialogModel>) {
    const state = model.state.use();
    const buttons = state.buttons ?? defaultCommitDialogProps.buttons ?? ["Commit", "Cancel"];
    const canCommit = !!state.message?.trim();

    return (
        <Dialog name="commit-dialog" onKeyDown={model.handleKeyDown} autoFocus={false}>
            <DialogContent
                title={state.title ?? "Commit"}
                icon={<GitIcon />}
                onClose={() => model.close(undefined)}
                width={520}
            >
                <Panel direction="column" paddingX="xxl" paddingTop="xl" paddingBottom="sm" gap="md">
                    <Panel direction="row" gap="sm" align="center">
                        <Text color="light">Branch:</Text>
                        <Text>{state.branch || "(detached / no branch)"}</Text>
                    </Panel>

                    <Panel direction="row" gap="sm" align="center">
                        <Text color="light" nowrap>Author:</Text>
                        <Panel flex={1}>
                            <Input
                                name="commit-author-name"
                                value={state.name ?? ""}
                                onChange={model.setName}
                                placeholder="Name"
                            />
                        </Panel>
                        <Panel flex={1}>
                            <Input
                                name="commit-author-email"
                                value={state.email ?? ""}
                                onChange={model.setEmail}
                                placeholder="Email"
                            />
                        </Panel>
                    </Panel>

                    <Textarea
                        name="commit-message"
                        value={state.message ?? ""}
                        onChange={model.setMessage}
                        placeholder="Commit message"
                        minHeight={120}
                        maxHeight={300}
                        autoFocus
                    />
                </Panel>

                <Panel direction="row" justify="end" gap="sm" padding="md">
                    {buttons.map((bt, i) =>
                        bt === "Cancel" ? (
                            <Button key={i} onClick={() => model.close(undefined)}>
                                {bt}
                            </Button>
                        ) : (
                            <Button key={i} disabled={!canCommit} onClick={() => model.submit(bt)}>
                                {bt}
                            </Button>
                        ),
                    )}
                </Panel>
            </DialogContent>
        </Dialog>
    );
}

Views.registerView(commitDialogId, CommitDialog as DefaultView);

export function showCommitDialog(props: CommitDialogProps) {
    const modelState = {
        ...defaultCommitDialogProps,
        ...props,
    };

    const model = new CommitDialogModel(new TComponentState(modelState));
    return showDialog({
        viewId: commitDialogId,
        model,
    }) as Promise<CommitResult | undefined>;
}
