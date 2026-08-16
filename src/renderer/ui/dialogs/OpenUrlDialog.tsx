import { Dialog, DialogContent, Panel, Button, Textarea } from "../../uikit";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { TComponentState } from "../../core/state/state";
import { showDialog } from "./Dialogs";

const openUrlDialogId = Symbol("openUrlDialog");

interface OpenUrlDialogState {
    value: string;
}

export type OpenUrlDialogResult = { type: "url"; value: string } | { type: "file" } | undefined;

class OpenUrlDialogModel extends TDialogModel<OpenUrlDialogState, OpenUrlDialogResult> {
    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.close(undefined);
        }

        // Ctrl+Enter to submit (Enter alone creates newlines in Textarea)
        if (e.key === "Enter" && e.ctrlKey) {
            e.preventDefault();
            this.submit();
        }
    };

    setValue = (value: string) => {
        this.state.update((s) => { s.value = value; });
    };

    submit = () => {
        const value = this.state.get().value?.trim();
        if (value) {
            this.close({ type: "url", value });
        }
    };

    openFile = () => {
        this.close({ type: "file" });
    };
}

function OpenUrlDialog({ model }: ViewPropsRO<OpenUrlDialogModel>) {
    const state = model.state.use();
    const isEmpty = !state.value?.trim();

    return (
        <Dialog name="open-url-dialog" onKeyDown={model.handleKeyDown} autoFocus={false}>
            <DialogContent
                title="Open"
                icon="open-file"
                onClose={() => model.close(undefined)}
                minWidth={500}
                maxWidth={800}
            >
                <Panel direction="column" paddingX="xxl" paddingTop="xl" paddingBottom="sm">
                    <Textarea
                        name="open-url-input"
                        autoFocus
                        value={state.value}
                        onChange={model.setValue}
                        placeholder="Paste file path, URL, or cURL command"
                        minHeight={80}
                        maxHeight={300}
                        size="sm"
                    />
                </Panel>
                <Panel direction="row" align="center" justify="between" padding="md">
                    <Button name="open-url-file" icon="open-file" onClick={model.openFile}>
                        Open File
                    </Button>
                    <Panel direction="row" gap="sm">
                        <Button name="open-url-cancel" onClick={() => model.close(undefined)}>
                            Cancel
                        </Button>
                        <Button name="open-url-submit" onClick={model.submit} disabled={isEmpty}>
                            Open
                        </Button>
                    </Panel>
                </Panel>
            </DialogContent>
        </Dialog>
    );
}

Views.registerView(openUrlDialogId, OpenUrlDialog as DefaultView);

export function showOpenUrlDialog(): Promise<OpenUrlDialogResult> {
    const model = new OpenUrlDialogModel(new TComponentState({ value: "" }));
    return showDialog({
        viewId: openUrlDialogId,
        model,
    }) as Promise<OpenUrlDialogResult>;
}
