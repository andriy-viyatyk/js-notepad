import { TDialogModel } from "../../core/state/model";
import { TComponentState } from "../../core/state/state";
import { showDialog } from "./Dialogs";
import { registerDialogView } from "./dialog-view-registry";
import { OpenUrlDialogView } from "./OpenUrlDialogView";

export const openUrlDialogId = Symbol("openUrlDialog");

export interface OpenUrlDialogState {
    value: string;
}

export type OpenUrlDialogResult = { type: "url"; value: string } | { type: "file" } | undefined;

class OpenUrlDialogModel extends TDialogModel<OpenUrlDialogState, OpenUrlDialogResult> {
    handleKeyDown = (e: KeyboardEvent) => {
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

registerDialogView(openUrlDialogId, OpenUrlDialogView);

export function showOpenUrlDialog(): Promise<OpenUrlDialogResult> {
    const model = new OpenUrlDialogModel(new TComponentState({ value: "" }));
    return showDialog({
        viewId: openUrlDialogId,
        model,
    }) as Promise<OpenUrlDialogResult>;
}
