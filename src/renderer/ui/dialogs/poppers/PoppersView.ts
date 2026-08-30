import { TGlobalState } from "../../../core/state/state";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { getDialogView, type DialogViewCtor, type DialogViewProps } from "../dialog-view-registry";
import type { IPopperViewData } from "./types";

const popperState = new TGlobalState<IPopperViewData[]>([]);

interface PopperSlot {
    readonly root: HTMLElement;
    readonly nativeView: VanillaView<DialogViewProps>;
    readonly nativeCtor: DialogViewCtor;
}

export class PoppersView extends VanillaView<undefined> {
    private readonly slots = new Map<IPopperViewData, PopperSlot>();

    public constructor(props: undefined) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
    }

    protected onMount(): void {
        this.reconcile(popperState.get());
        this.own(popperState.subscribe(() => this.reconcile(popperState.get())));
    }

    protected onDispose(): void {
        const slots = Array.from(this.slots.values());
        this.slots.clear();
        this.disposeSlots(slots);
    }

    private reconcile(poppers: IPopperViewData[]): void {
        const current = new Set(poppers);
        const removed: PopperSlot[] = [];

        for (const [data, slot] of this.slots) {
            if (!current.has(data)) {
                this.slots.delete(data);
                removed.push(slot);
            }
        }
        this.disposeSlots(removed);

        for (const popper of poppers) {
            let slot = this.slots.get(popper);
            const nativeCtor = getDialogView(popper.viewId);
            if (slot && slot.nativeCtor !== nativeCtor) {
                this.slots.delete(popper);
                this.disposeSlots([slot]);
                slot = undefined;
            }

            if (!slot) {
                slot = this.createSlot(popper, nativeCtor);
                this.slots.set(popper, slot);
            } else {
                this.updateSlot(slot, popper);
            }
        }

        this.reorder(poppers);
    }

    private createSlot(
        popper: IPopperViewData,
        nativeCtor: DialogViewCtor | undefined,
    ): PopperSlot {
        const props: DialogViewProps = {
            model: popper.model,
        };
        if (!nativeCtor) {
            throw new Error(
                `No native dialog view registered for "${popper.viewId.toString()}".`,
            );
        }
        const nativeView = new nativeCtor(props);
        const root = nativeView.root;
        this.root.append(root);

        const slot: PopperSlot = { root, nativeView, nativeCtor };
        nativeView.mount();
        return slot;
    }

    private updateSlot(slot: PopperSlot, popper: IPopperViewData): void {
        const props: DialogViewProps = {
            model: popper.model,
        };
        slot.nativeView.update(props);
    }

    private disposeSlots(slots: PopperSlot[]): void {
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

    private reorder(poppers: IPopperViewData[]): void {
        poppers.forEach((popper, index) => {
            const slot = this.slots.get(popper);
            if (!slot) return;
            const current = this.root.children[index];
            if (current !== slot.root) this.root.insertBefore(slot.root, current ?? null);
        });
    }

}

export async function showPopper<R>(data: IPopperViewData): Promise<R> {
    data.model.result = new Promise<R>((resolve) => {
        data.model.onClose = (res) => {
            const poppers = popperState.get();
            if (poppers.includes(data)) {
                popperState.set(poppers.filter((popper) => popper !== data));
            }
            resolve(res);
        };
        popperState.set((state) => [...state, data]);
    });

    return data.model.result;
}

export const closePopper = (viewId: symbol) => {
    const currentPopper = popperState.get().find((popper) => popper.viewId === viewId);
    if (currentPopper) currentPopper.model.close(currentPopper);
};

export const visiblePoppers = () => popperState.get();
