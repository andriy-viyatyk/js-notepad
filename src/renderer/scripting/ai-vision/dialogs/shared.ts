import type { IDialogViewData } from "../../../ui/dialogs/dialog-view-registry";
import type { IAiVisionDescriptor, IAiVisible } from "../../../../shared/ai-vision/types";

export type DialogEntry = IDialogViewData;

export type DialogAdapter = IAiVisible & {
    readonly entry: DialogEntry;
    readonly title?: string;
    readonly message?: string;
    readonly buttons: readonly string[];
    click(button: string): Promise<unknown>;
    cancel(): Promise<undefined>;
};

export function dialogState<T>(entry: DialogEntry): T {
    return entry.model.state.get() as T;
}

export function modelWith<T>(entry: DialogEntry): T {
    return entry.model as unknown as T;
}

export function requireButton(buttons: readonly string[], button: string): void {
    if (!buttons.includes(button)) {
        throw new Error(`Unknown or unavailable dialog button ${JSON.stringify(button)}.`);
    }
}

export function descriptor(
    kind: string,
    summary: string,
    members: IAiVisionDescriptor["members"],
): IAiVisionDescriptor {
    return { kind, summary, members };
}

export async function closeWithResult(entry: DialogEntry, result: unknown): Promise<boolean> {
    return await entry.model.close(result);
}

export async function cancelDialog(entry: DialogEntry): Promise<undefined> {
    await entry.model.close(undefined);
    return undefined;
}
