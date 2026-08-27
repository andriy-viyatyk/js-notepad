import React, { type ReactNode } from "react";
import { mountReactHandle, type MountedReactRoot, type VanillaViewCtor } from "../../uikit/shared/mount";
import type { VanillaView } from "../../uikit/shared/vanilla-view";

export type PageSlotStyle = (element: HTMLDivElement) => void;
export interface PageSlotViewProps { pageId: string; }

/** Owns one stable page placeholder and either a retained React or native page. */
export class PageSlot {
    readonly element: HTMLDivElement;

    private reactHandle: MountedReactRoot | undefined;
    private nativeView: VanillaView<PageSlotViewProps> | undefined;
    private generation = 0;
    private disposed = false;

    public constructor(
        readonly id: string,
        applyStyle: PageSlotStyle,
    ) {
        this.element = document.createElement("div");
        this.element.dataset.name = "page-slot";
        applyStyle(this.element);
    }

    /** Attach a newly-created placeholder without ever reordering a live one. */
    attach(root: HTMLElement): void {
        if (this.disposed || this.element.parentNode) {
            return;
        }

        root.appendChild(this.element);
    }

    /** Render into one retained root, attaching before its first mount. */
    render(root: HTMLElement, content: ReactNode): void {
        if (this.disposed) {
            return;
        }

        const element = React.createElement(React.Fragment, null, content);
        if (this.reactHandle) {
            this.reactHandle.render(element);
            return;
        }

        this.attach(root);
        this.reactHandle = mountReactHandle(this.element, element);
    }

    /** Attach and mount one native page view, retaining it for the slot lifetime. */
    renderNative(root: HTMLElement, viewConstructor: VanillaViewCtor<PageSlotViewProps>): void {
        if (this.disposed || this.nativeView) {
            return;
        }

        const attachedHere = !this.element.parentNode;
        let view: VanillaView<PageSlotViewProps> | undefined;
        // A construction or mount failure must not leave the slot holding a half-built view:
        // `renderNative` returns early whenever `nativeView` is set, so a retained broken view
        // would never be retried and the page would stay permanently blank. Roll back to the
        // empty state and rethrow, matching AsyncEditorView's mount-failure handling.
        try {
            this.attach(root);
            view = new viewConstructor({ pageId: this.id });
            this.nativeView = view;
            this.element.append(view.root);
            view.mount();
        } catch (error) {
            this.nativeView = undefined;
            try {
                view?.dispose();
            } catch {
                // Preserve the mount failure after attempting cleanup.
            }
            view?.root.remove();
            if (attachedHere) this.element.remove();
            throw error;
        }
    }

    /** Detach immediately, then dispose the nested root after the outer commit. */
    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        const generation = ++this.generation;
        const reactHandle = this.reactHandle;
        this.reactHandle = undefined;
        const nativeView = this.nativeView;
        this.nativeView = undefined;
        this.element.remove();

        // The two arms are mutually exclusive in practice — a slot belongs to one manager, and
        // each manager uses one arm — but dispose must not assume it, or a slot that somehow held
        // both would leak whichever arm the early return skipped. Release each independently, and
        // let a throwing native teardown still leave the React root scheduled for disposal.
        try {
            if (nativeView) {
                nativeView.dispose();
            }
        } finally {
            if (reactHandle) {
                queueMicrotask(() => {
                    if (this.generation !== generation) {
                        return;
                    }
                    reactHandle.dispose();
                });
            }
        }
    }
}
