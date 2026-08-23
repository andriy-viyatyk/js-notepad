import type React from "react";
import { TGlobalState } from "../../../core/state/state";
import { Views } from "../../../core/state/view";
import { fillSlot } from "../../../uikit/shared/fill-slot";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { getDialogView, type DialogViewCtor, type DialogViewProps } from "../dialog-view-registry";
import type { IPopperViewData } from "./types";

const popperState = new TGlobalState<IPopperViewData[]>([]);

interface PopperSlot {
    readonly root: HTMLElement;
    readonly nativeView?: VanillaView<DialogViewProps>;
    readonly nativeCtor?: DialogViewCtor;
    reactCleanup?: () => void;
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
            className: "dialog",
        };
        const nativeView = nativeCtor ? new nativeCtor(props) : undefined;
        const root = nativeView?.root ?? document.createElement("span");
        if (!nativeView) root.style.display = "contents";
        this.root.append(root);

        const slot: PopperSlot = { root, nativeView, nativeCtor };
        if (nativeView) {
            nativeView.mount();
        } else {
            slot.reactCleanup = fillSlot(root, this.renderReact(popper));
        }
        return slot;
    }

    private updateSlot(slot: PopperSlot, popper: IPopperViewData): void {
        const props: DialogViewProps = {
            model: popper.model,
            className: "dialog",
        };
        if (slot.nativeView) {
            slot.nativeView.update(props);
        } else {
            slot.reactCleanup = fillSlot(slot.root, this.renderReact(popper));
        }
    }

    private disposeSlots(slots: PopperSlot[]): void {
        let firstError: unknown;
        let hasError = false;
        for (const slot of slots) {
            try {
                if (slot.nativeView) {
                    slot.nativeView.dispose();
                    slot.root.remove();
                } else {
                    // Detach first: fillSlot defers the nested React unmount to a microtask.
                    slot.root.remove();
                    slot.reactCleanup?.();
                }
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

    private renderReact(popper: IPopperViewData): React.ReactNode {
        return Views.renderView(popper.viewId, {
            model: popper.model,
            className: "dialog",
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
