import type { VanillaView, VanillaViewCtor } from "../../uikit/shared/vanilla-view";

export type PageSlotStyle = (element: HTMLDivElement) => void;
export interface PageSlotViewProps { pageId: string; }

/** Owns one stable page placeholder and one retained native page. */
export class PageSlot {
    readonly element: HTMLDivElement;

    private nativeView: VanillaView<PageSlotViewProps> | undefined;
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
        const nativeView = this.nativeView;
        this.nativeView = undefined;
        this.element.remove();

        // Remove the placeholder before disposing the native view. This is deliberate for
        // foreign-document views: the webview/iframe is detached before its resources are torn
        // down, so disposal cannot leave a live foreign document in the page tree.
        if (nativeView) nativeView.dispose();
    }
}
