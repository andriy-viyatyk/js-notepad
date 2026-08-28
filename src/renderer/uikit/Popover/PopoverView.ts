import {
    autoUpdate,
    computePosition,
    type VirtualElement,
} from "@floating-ui/dom";
import { createComponentModelDriver } from "../../core/state/model";
import { ResizeHandleIcon } from "../../theme/icons";
import { getOverlayLayer } from "../shared/overlayLayer";
import {
    applyRestProps,
    bindRef,
    clearRestListeners,
    createRestPropsState,
    type RestPropsState,
} from "../shared/dom-props";
import { SubtreeSwap } from "../shared/subtree-swap";
import { VanillaView, type IOwnedView } from "../shared/vanilla-view";
import {
    defaultPopoverState,
    PopoverModel,
    type PopoverProps,
} from "./PopoverModel";
import "./Popover.css";

export type PopoverViewProps = PopoverProps & {
    ref?: Parameters<typeof bindRef<HTMLDivElement>>[1];
    "data-type"?: string;
    /** Internal UIKit seam for a direct vanilla content view. */
    contentView?: (host: HTMLElement) => IOwnedView;
};

function isElementOrVirtualElement(
    value: Element | VirtualElement | null,
): value is Element | VirtualElement {
    return value !== null;
}

class PopoverFloatingView extends VanillaView<PopoverViewProps> {
    private readonly model: PopoverModel;
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private refCleanup: (() => void) | undefined;
    private boundRef: PopoverViewProps["ref"];
    private autoUpdateCleanup: (() => void) | undefined;
    private placeRef: Element | VirtualElement | null = null;
    private positionGeneration = 0;
    private active = true;
    private renderedEdge: "top" | "bottom" | undefined;
    private contentView: IOwnedView | undefined;
    private nativeResizeHandle: HTMLDivElement | undefined;

    public constructor(props: PopoverViewProps, model: PopoverModel) {
        super(props, document.createElement("div"));
        if (props.contentView && props.children != null) {
            throw new Error("PopoverView cannot receive both contentView and children.");
        }
        this.model = model;
        this.model.actualPlacement = props.placement ?? "bottom-start";
        // `data-type` is a caller-visible addressing hook and residual props may override it.
        // The Popover shell therefore uses a class omitted from PopoverProps as its stable style hook.
        this.root.classList.add("popover-shell");
        this.root.style.position = "fixed";
        this.root.style.zIndex = "1000";
    }

    protected onMount(): void {
        this.applyProps(this.props);

        // These listeners belong to the floating branch, so they exist exactly
        // while an open branch is attached to the overlay layer.
        // `pointerdown`, not `mousedown`.
        //
        // `mousedown` is a *compatibility* event: calling `preventDefault()` on the `pointerdown`
        // that precedes it suppresses it entirely. That is the standard way to stop the browser
        // starting a native text selection on a press-and-drag, so any component doing a drag
        // gesture legitimately does it — av-grid does it on every data cell to keep a range
        // drag-select from highlighting the page. The result was a context menu that would not
        // close when the user clicked a grid cell, while clicking the grid's whitespace (no
        // preventDefault) or anywhere else in the app closed it normally.
        //
        // Dismissal must not depend on an event a legitimate gesture is allowed to suppress.
        // `pointerdown` always fires, is not cancellable away, and covers touch and pen for free.
        this.listen(document, "pointerdown", this.onDocumentPointerDown);
        this.listen(document, "keydown", this.onDocumentKeyDown);
        this.listen(this.root, "keydown", this.onRootKeyDown);
        this.listen(this.root, "pointerdown", this.onResizePointerDown);

        if (!this.props.contentView) {
            throw new Error("PopoverView requires a native contentView.");
        }

        // The returned view owns all content below this root; this view owns
        // the resize handle itself.
        this.contentView = this.child(this.props.contentView(this.root));
        (this.contentView as IOwnedView & { mount(): unknown }).mount();
        this.updateNativeResizeHandle();
        this.restartPositioning(this.model.placeRef.value);
    }

    protected onUpdate(props: PopoverViewProps): void {
        if (Boolean(props.contentView) !== Boolean(this.props.contentView)) {
            throw new Error("PopoverView content mode cannot change while mounted.");
        }
        const previousPlaceRef = this.placeRef;
        this.applyProps(props);
        this.updateNativeResizeHandle();

        const nextPlaceRef = this.model.placeRef.value;
        if (nextPlaceRef !== previousPlaceRef) {
            this.restartPositioning(nextPlaceRef);
        } else {
            this.position();
        }
    }

    protected onDispose(): void {
        this.active = false;
        this.positionGeneration++;
        this.autoUpdateCleanup?.();
        this.autoUpdateCleanup = undefined;
        this.model.cancelResize();
        clearRestListeners(this.root, this.restPropsState);
        this.nativeResizeHandle?.remove();
        this.nativeResizeHandle = undefined;

        this.refCleanup?.();
        this.refCleanup = undefined;
        this.boundRef = undefined;
        this.model.setInternalRef(null);

        // SubtreeSwap detaches after dispose(); remove the floating root while
        // its native content view has already released its resources.
        this.root.parentNode?.removeChild(this.root);
    }

    syncManualSize(): void {
        if (!this.active) return;
        this.applyVisualState(this.props);
        // The size middleware is the last writer for viewport max-height and
        // anchor width. Re-run it after a manual-size state change so the
        // ordering remains the same as the React implementation.
        this.position();
    }

    private applyProps(props: PopoverViewProps): void {
        const {
            ref,
            name,
            open: _open,
            maxHeight,
            resizable,
            scroll = true,
            children: _children,
            elementRef: _elementRef,
            x: _x,
            y: _y,
            placement: _placement,
            offset: _offset,
            onClose: _onClose,
            outsideClickIgnoreSelector: _outsideClickIgnoreSelector,
            onKeyDown: _onKeyDown,
            matchAnchorWidth: _matchAnchorWidth,
            onResize: _onResize,
            contentView: _contentView,
            ...rest
        } = props;

        this.root.dataset.type = "popover";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;

        this.model.setInternalRef(this.root as HTMLDivElement);
        this.applyVisualState(props);
        applyRestProps(this.root, rest, this.restPropsState);

        if (ref !== this.boundRef) {
            this.refCleanup?.();
            this.boundRef = ref;
            this.refCleanup = bindRef(this.root, ref);
        }

        // Keep destructuring explicit above: these values are model/view
        // controls, not residual DOM attributes. `scroll` is applied here so
        // classList, rather than a className assignment, owns the hook.
        void maxHeight;
        void resizable;
        void scroll;
    }

    private applyVisualState(props: PopoverViewProps): void {
        const { maxHeight, resizable, scroll = true } = props;
        const manualSize = this.model.state.get().manualSize;
        const actualPlacement = this.model.actualPlacement;

        if (scroll) this.root.dataset.scroll = "";
        else delete this.root.dataset.scroll;
        if (resizable) this.root.dataset.resizable = "";
        else delete this.root.dataset.resizable;
        if (manualSize) this.root.dataset.resized = "";
        else delete this.root.dataset.resized;
        this.root.dataset.placement = actualPlacement;
        this.root.classList.toggle("scroll-container", scroll);

        this.root.style.maxHeight = maxHeight
            ? typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight
            : "";
        this.root.style.width = manualSize ? `${manualSize.width}px` : "";
        this.root.style.height = manualSize ? `${manualSize.height}px` : "";
        this.root.style.zIndex = "1000";
    }

    private updateNativeResizeHandle(): void {
        const shouldRender = Boolean(this.props.resizable);
        if (!shouldRender) {
            this.nativeResizeHandle?.remove();
            this.nativeResizeHandle = undefined;
            return;
        }

        const handle = this.nativeResizeHandle ?? document.createElement("div");
        if (!this.nativeResizeHandle) {
            handle.dataset.type = "popover-resize-handle";
            handle.append(ResizeHandleIcon.createElement());
            this.root.append(handle);
            this.nativeResizeHandle = handle;
        }
        handle.dataset.edge = this.model.isTopPlacement ? "top" : "bottom";
    }

    private readonly onRootKeyDown = (event: KeyboardEvent): void => {
        this.props.onKeyDown?.(event);
    };

    private readonly onResizePointerDown = (event: PointerEvent): void => {
        const target = event.target;
        if (!(target instanceof Element) || !target.closest('[data-type="popover-resize-handle"]')) return;
        this.model.onHandlePointerDown(event);
    };

    private restartPositioning(
        nextPlaceRef: Element | VirtualElement | null,
    ): void {
        this.autoUpdateCleanup?.();
        this.autoUpdateCleanup = undefined;
        this.placeRef = nextPlaceRef;
        this.positionGeneration++;

        if (!isElementOrVirtualElement(nextPlaceRef)) return;

        this.autoUpdateCleanup = autoUpdate(nextPlaceRef, this.root, () => this.position());
        this.position();
    }

    private position(): void {
        const reference = this.placeRef;
        if (!this.active || !this.props.open || !isElementOrVirtualElement(reference)) return;

        const generation = ++this.positionGeneration;
        const placement = this.props.placement ?? "bottom-start";

        void computePosition(reference, this.root, {
            strategy: "fixed",
            placement,
            middleware: this.model.createMiddleware(
                () => this.active
                    && this.props.open
                    && generation === this.positionGeneration
                    && reference === this.placeRef,
            ),
        }).then(({ x, y, placement: actualPlacement }) => {
            if (
                !this.active
                || !this.props.open
                || generation !== this.positionGeneration
                || reference !== this.placeRef
            ) return;

            this.model.actualPlacement = actualPlacement;
            this.root.style.left = `${x}px`;
            this.root.style.top = `${y}px`;
            this.root.dataset.placement = actualPlacement;

            const nextEdge = actualPlacement.startsWith("top") ? "top" : "bottom";
            if (nextEdge !== this.renderedEdge) {
                this.renderedEdge = nextEdge;
                this.updateNativeResizeHandle();
            }
        });
    }

    private readonly onDocumentPointerDown = (event: PointerEvent): void => {
        if (!this.model.internalRef || this.model.internalRef.contains(event.target as Node)) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-type="tooltip"]')) return;
        const ignoreSelector = this.props.outsideClickIgnoreSelector;
        if (ignoreSelector && target?.closest(ignoreSelector)) return;
        this.props.onClose?.();
    };

    private readonly onDocumentKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") this.props.onClose?.();
    };
}

export class PopoverView extends VanillaView<PopoverViewProps> {
    private readonly driver;
    private readonly swap: SubtreeSwap<"open">;
    private activeBranch: PopoverFloatingView | undefined;
    private previousProps: PopoverViewProps;

    public constructor(props: PopoverViewProps) {
        super(props);
        this.previousProps = props;
        this.root.style.display = "contents";

        this.swap = new SubtreeSwap(getOverlayLayer());
        this.own(() => this.swap.dispose());

        this.driver = createComponentModelDriver(
            this.modelProps(props),
            PopoverModel,
            defaultPopoverState,
        );
        this.own(() => this.driver.dispose());
    }

    protected onMount(): void {
        this.driver.mount();
        this.syncBranch();
        this.bind(
            this.driver.model.state,
            (state) => state.manualSize,
            () => this.activeBranch?.syncManualSize(),
        );
    }

    protected onUpdate(props: PopoverViewProps): void {
        const wasOpen = this.previousProps.open;
        this.driver.update(this.modelProps(props));
        if (wasOpen && !props.open) this.driver.model.resetManualSize();
        this.previousProps = props;
        this.syncBranch();
    }

    private syncBranch(): void {
        const props = this.props;
        const placeRef = this.driver.model.placeRef.value;
        if (!props.open || !placeRef) {
            this.activeBranch = undefined;
            this.swap.clear();
            return;
        }

        if (this.activeBranch) {
            this.activeBranch.update(props);
            return;
        }

        let created: PopoverFloatingView | undefined;
        this.swap.set("open", () => {
            created = new PopoverFloatingView(props, this.driver.model);
            this.activeBranch = created;
            return created;
        });

        if (!created) return;
        try {
            created.mount();
        } catch (mountError) {
            this.activeBranch = undefined;
            try {
                this.swap.clear();
            } catch {
                // Preserve the original mount failure after cleanup.
            }
            throw mountError;
        }
    }

    private modelProps(props: PopoverViewProps): PopoverProps {
        const { ref: _ref, contentView: _contentView, ...modelProps } = props;
        return modelProps;
    }
}
