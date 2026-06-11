import { Dialog, DialogContent, Panel, Text, Button, Input, Textarea } from "../../uikit";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { GitIcon } from "../../theme/icons";
import { TComponentState } from "../../core/state/state";
import { showDialog } from "./Dialogs";

const commitDialogId = Symbol("commitDialog");

interface CommitDialogProps {
    title?: string;
    /** Branch name — editable and required (US-638). Prepopulated with the current
     *  branch; keeping it commits to the current branch, changing it commits onto a
     *  newly created branch. Empty (e.g. detached HEAD) disables Commit. */
    branch?: string;
    /** The original current branch at open — internal, set by `showCommitDialog` from
     *  `branch`. Used to detect whether the user edited the name (drives the action
     *  button label: "Commit" vs "Create branch and Commit"). US-638. */
    originalBranch?: string;
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
    /** Transient — an action is in flight (US-638). Disables the action buttons so the
     *  user can't double-submit while the commit/branch-create runs. */
    committing?: boolean;
}

/** Performs a non-Cancel button's action (commit, possibly creating a branch first).
 *  Returns true → the dialog closes; false → it stays open (e.g. branch creation
 *  failed) so the user can fix the branch name / message and retry. Toasts are raised
 *  inside the callback. Injected by `showCommitDialog`; the dialog stays git-agnostic
 *  (the actual git calls live in the caller's model). US-638. */
type CommitAction = (result: CommitResult) => Promise<boolean>;

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
    /** The (possibly edited) branch name — required, non-empty (US-638). When it differs
     *  from the current branch the caller creates + checks out a new branch before committing. */
    branch: string;
    /** The clicked action button's label (never "Cancel" — Cancel resolves `undefined`). */
    button: string;
}

class CommitDialogModel extends TDialogModel<CommitDialogProps, CommitResult | undefined> {
    /** Injected by `showCommitDialog` — performs the commit (and branch creation).
     *  When set, `canClose` routes a non-Cancel result through it and stays open on
     *  failure; when omitted the dialog closes and resolves the result (US-638). */
    onAction?: CommitAction;

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
            void this.submit(action);
        }
    };

    setMessage = (v: string) => this.state.update((s) => { s.message = v; });
    setName = (v: string) => this.state.update((s) => { s.name = v; });
    setEmail = (v: string) => this.state.update((s) => { s.email = v; });
    setBranch = (v: string) => this.state.update((s) => { s.branch = v; });

    /** Gate the close on the injected action (US-638): a Cancel/X/Esc (`undefined`
     *  result) always closes; a non-Cancel result runs `onAction` and closes only
     *  when it succeeds (false → stay open for fix-and-retry). With no `onAction`
     *  the dialog closes and resolves the result (caller-performs-action path). */
    canClose = async (r?: CommitResult): Promise<boolean> => {
        if (!r) return true;
        if (!this.onAction) return true;
        return this.onAction(r);
    };

    /** Submit with a button label — gated on a non-blank message AND branch, and
     *  guarded against double-submit while an action is in flight. Sets `committing`
     *  for the duration; re-enables if the dialog stayed open (action failed).
     *  Ctrl+Enter routes here too. */
    submit = async (button: string) => {
        const s = this.state.get();
        if (s.committing || !s.message?.trim() || !s.branch?.trim()) return;
        this.state.update((d) => { d.committing = true; });
        const closed = await this.close({
            message: s.message ?? "",
            name: s.name ?? "",
            email: s.email ?? "",
            branch: s.branch ?? "",
            button,
        });
        if (!closed) this.state.update((d) => { d.committing = false; });
    };
}

function CommitDialog({ model }: ViewPropsRO<CommitDialogModel>) {
    const state = model.state.use();
    const buttons = state.buttons ?? defaultCommitDialogProps.buttons ?? ["Commit", "Cancel"];
    const canCommit = !!state.message?.trim() && !!state.branch?.trim();
    const committing = !!state.committing;
    // The branch field was edited away from the original current branch (or HEAD was
    // detached → no original) ⇒ committing will create a new branch first, so relabel
    // the "Commit" action button accordingly (US-638). The button's action identity
    // stays "Commit" — only the visible text changes.
    const branchChanged = !!state.branch?.trim() && state.branch.trim() !== (state.originalBranch ?? "");

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
                        <Text color="light" nowrap>Branch:</Text>
                        <Panel flex={1}>
                            <Input
                                name="commit-branch"
                                value={state.branch ?? ""}
                                onChange={model.setBranch}
                                invalid={!state.branch?.trim()}
                                placeholder="Branch name"
                            />
                        </Panel>
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
                            <Button key={i} disabled={!canCommit || committing} onClick={() => model.submit(bt)}>
                                {bt === "Commit" && branchChanged ? "Create Branch & Commit" : bt}
                            </Button>
                        ),
                    )}
                </Panel>
            </DialogContent>
        </Dialog>
    );
}

Views.registerView(commitDialogId, CommitDialog as DefaultView);

export function showCommitDialog(props: CommitDialogProps & { onAction?: CommitAction }) {
    const { onAction, ...rest } = props;
    const modelState = {
        ...defaultCommitDialogProps,
        ...rest,
        // Remember the current branch so the view can tell whether the user edited it.
        originalBranch: rest.branch,
    };

    const model = new CommitDialogModel(new TComponentState(modelState));
    model.onAction = onAction;
    return showDialog({
        viewId: commitDialogId,
        model,
    }) as Promise<CommitResult | undefined>;
}
