import { TGlobalState } from "../../core/state/state";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import {
    getDialogView,
    type DialogViewCtor,
    type DialogViewProps,
    type IDialogViewData,
} from "./dialog-view-registry";

export const dialogsState = new TGlobalState<IDialogViewData[]>([]);

interface DialogSlot {
    readonly key: string;
    readonly root: HTMLElement;
    readonly nativeView: VanillaView<DialogViewProps>;
    readonly nativeCtor: DialogViewCtor;
}

export class DialogsView extends VanillaView<undefined> {
    private readonly slots = new Map<string, DialogSlot>();

    public constructor(props: undefined) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
    }

    protected onMount(): void {
        this.reconcile(dialogsState.get());
        this.own(dialogsState.subscribe(() => this.reconcile(dialogsState.get())));
    }

    protected onDispose(): void {
        const slots = Array.from(this.slots.values());
        this.slots.clear();
        this.disposeSlots(slots);
    }

    private reconcile(dialogs: IDialogViewData[]): void {
        const currentKeys = new Set(dialogs.map((dialog) => this.keyFor(dialog)));
        const removed: DialogSlot[] = [];

        for (const [key, slot] of this.slots) {
            if (!currentKeys.has(key)) {
                this.slots.delete(key);
                removed.push(slot);
            }
        }
        this.disposeSlots(removed);

        for (const dialog of dialogs) {
            const key = this.keyFor(dialog);
            let slot = this.slots.get(key);
            const nativeCtor = getDialogView(dialog.viewId);

            if (slot && slot.nativeCtor !== nativeCtor) {
                this.slots.delete(key);
                this.disposeSlots([slot]);
                slot = undefined;
            }

            if (!slot) {
                slot = this.createSlot(dialog, key, nativeCtor);
                this.slots.set(key, slot);
            } else {
                this.updateSlot(slot, dialog);
            }
        }

        this.reorder(dialogs);
    }

    private createSlot(
        dialog: IDialogViewData,
        key: string,
        nativeCtor: DialogViewCtor | undefined,
    ): DialogSlot {
        const props: DialogViewProps = {
            model: dialog.model,
            className: "dialog",
        };
        if (!nativeCtor) {
            throw new Error(
                `No native dialog view registered for "${dialog.viewId.toString()}".`,
            );
        }
        const nativeView = new nativeCtor(props);
        const root = nativeView.root;
        this.root.append(root);

        const slot: DialogSlot = { key, root, nativeView, nativeCtor };
        nativeView.mount();
        return slot;
    }

    private updateSlot(slot: DialogSlot, dialog: IDialogViewData): void {
        const props: DialogViewProps = {
            model: dialog.model,
            className: "dialog",
        };
        slot.nativeView.update(props);
    }

    private disposeSlots(slots: DialogSlot[]): void {
        let firstError: unknown;
        let hasError = false;
        for (const slot of slots) {
            try {
                slot.nativeView.dispose();
                slot.root.remove();
            } catch (error) {
                if (!hasError) {
                    hasError = true;
                    firstError = error;
                }
            }
        }
        if (hasError) throw firstError;
    }

    private reorder(dialogs: IDialogViewData[]): void {
        dialogs.forEach((dialog, index) => {
            const slot = this.slots.get(this.keyFor(dialog));
            if (!slot) return;
            const current = this.root.children[index];
            if (current !== slot.root) this.root.insertBefore(slot.root, current ?? null);
        });
    }

    private keyFor(dialog: IDialogViewData): string {
        return dialog.internalId ?? dialog.viewId.toString();
    }
}

export async function showDialog<R>(data: IDialogViewData): Promise<R> {
    data.internalId = crypto.randomUUID();
    data.model.result = new Promise<R>(resolve => {
        data.model.onClose = res => {
            dialogsState.set(oldState => oldState.filter(item => item !== data));
            resolve(res as R);
        };
        dialogsState.set(oldState => [...oldState, data]);
    });

    return data.model.result as Promise<R>;
}

export const closeDialog = (viewId: symbol) => {
    const currentDialog = dialogsState.get().find(dialog => dialog.viewId === viewId);
    if (currentDialog) currentDialog.model.close(currentDialog);
};
