import React from "react";
import {
    flip,
    offset as floatingOffset,
    size,
    type Middleware,
    type MiddlewareState,
    type Placement,
    type VirtualElement,
} from "@floating-ui/dom";
import { TComponentModel } from "../../core/state/model";

// =============================================================================
// Public types
// =============================================================================

/**
 * Positioning subset of `PopoverProps`. Shape-identical to legacy `PopperPosition`
 * (minus `anchorType`). Encapsulated `showSomething()` modules can carry a
 * `PopoverPosition` on their model and spread it directly into `<Popover>`.
 */
export interface PopoverPosition {
    elementRef?: Element | VirtualElement | null;
    x?: number;
    y?: number;
    placement?: Placement;
    /** [skidding, distance] — skidding shifts perpendicular to the main axis. */
    offset?: [number, number];
}

export interface PopoverProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className">,
        PopoverPosition {
    /** Optional debug label emitted as `data-name` on the popover's floating root.
     *  Use to disambiguate multiple instances in DOM inspector output. Never used for styling. */
    name?: string;
    /** Whether the popover is rendered. When false, no DOM is mounted. */
    open: boolean;
    /** Called on click-outside or Escape. */
    onClose?: () => void;
    /** Caller-set max-height override. The component also auto-caps to viewport. */
    maxHeight?: number | string;
    /**
     * CSS selector. A click outside the popover that lands on an element matching
     * this selector (or whose ancestor matches) does NOT trigger `onClose`. Used by
     * sibling-rendered families (e.g. submenus sharing a `data-type`) and sticky
     * input dropdowns where clicks on the input itself should keep the popover open.
     */
    outsideClickIgnoreSelector?: string;
    /**
     * Match the floating element's width to the anchor's width. Useful for
     * combobox / autocomplete / suggestions dropdowns. The width updates
     * automatically on `autoUpdate` (resize, scroll). Default: false.
     */
    matchAnchorWidth?: boolean;
    /**
     * When true, a resize handle is rendered at the bottom-right corner. The user
     * can drag it to grow the popover above its initial / anchor-matched size.
     * Once the user has dragged, the popover keeps its new size for the rest of
     * the open session — `matchAnchorWidth` no longer re-applies. On close, the
     * manual size is discarded; opening again starts fresh.
     */
    resizable?: boolean;
    /** Fired during a drag with the live `(width, height)`. Optional. */
    onResize?: (width: number, height: number) => void;
    /**
     * Whether the popover root is the scroll container. Default: true. Set to false when the
     * caller wants to manage its own internal scroll area (e.g. `Menu` keeps a non-scrolling
     * search header above a scrollable list, so the scrollbar doesn't span the search row).
     * When false, the root is `overflow: hidden` and the global `scroll-container` class is
     * not applied — children must render their own scroll wrapper if content can exceed the
     * popover height.
     */
    scroll?: boolean;
    children?: React.ReactNode;
}

// =============================================================================
// State
// =============================================================================

interface ManualSize {
    width: number;
    height: number;
}

export interface PopoverState {
    manualSize: ManualSize | null;
}

export const defaultPopoverState: PopoverState = { manualSize: null };

// =============================================================================
// Model
// =============================================================================

export class PopoverModel extends TComponentModel<PopoverState, PopoverProps> {
    // --- refs (DOM) ---
    internalRef: HTMLDivElement | null = null;

    setInternalRef = (el: HTMLDivElement | null) => {
        this.internalRef = el;
    };

    // --- internal drag baseline (not state — flipping it must not re-render) ---
    private initialSize: ManualSize | null = null;

    actualPlacement: Placement = "bottom-start";

    // --- derived ---

    placeRef = this.memo<Element | VirtualElement | null>(
        () => {
            const { elementRef, x, y } = this.props;
            if (elementRef) return elementRef;
            if (x !== undefined && y !== undefined) {
                return {
                    getBoundingClientRect: () => ({
                        top: y, left: x, bottom: y, right: x, width: 0, height: 0,
                    }),
                } as VirtualElement;
            }
            return null;
        },
        () => [this.props.elementRef, this.props.x, this.props.y],
    );

    createMiddleware = (isCurrent: () => boolean): Middleware[] => {
        const m: Middleware[] = [
            flip(),
            size({
                apply: ({
                    availableHeight,
                    rects,
                    elements,
                }: MiddlewareState & {
                    availableHeight: number;
                    availableWidth: number;
                }) => {
                    if (!isCurrent()) return;
                    // This intentionally overwrites a manual maxHeight prop,
                    // matching the legacy size middleware's last-writer order.
                    // Taking the minimum is a separate behavior decision.
                    const styles: Record<string, string> = {
                        maxHeight: `${Math.max(100, availableHeight - 20)}px`,
                    };
                    if (this.props.matchAnchorWidth && !this.state.get().manualSize) {
                        styles.width = `${rects.reference.width}px`;
                    }
                    Object.assign(elements.floating.style, styles);
                },
            }),
        ];
        const offsetProp = this.props.offset;
        if (offsetProp) {
            m.unshift(floatingOffset({ mainAxis: offsetProp[1], crossAxis: offsetProp[0] }));
        }
        return m;
    };

    get isTopPlacement(): boolean {
        return this.actualPlacement.startsWith("top");
    }

    // --- handlers ---

    onHandlePointerDown = (event: PointerEvent) => {
        if (event.pointerType === "mouse" && event.buttons !== 1) return;
        const root = this.internalRef;
        if (!root) return;
        event.preventDefault();
        event.stopPropagation();

        const startRect = root.getBoundingClientRect();
        if (!this.initialSize) {
            this.initialSize = { width: startRect.width, height: startRect.height };
        }
        const initial = this.initialSize;
        const startX = event.clientX;
        const startY = event.clientY;
        const isTop = this.isTopPlacement;

        const onPointerMove = (e: PointerEvent) => {
            if (!this.internalRef) return;
            e.preventDefault();
            const dx = e.clientX - startX;
            const dy = isTop ? -(e.clientY - startY) : e.clientY - startY;
            const w = Math.max(initial.width, startRect.width + dx);
            const h = Math.max(initial.height, startRect.height + dy);
            this.state.update((s) => {
                s.manualSize = { width: w, height: h };
            });
            this.props.onResize?.(w, h);
        };
        const onLost = () => {
            root.removeEventListener("pointermove", onPointerMove);
            root.removeEventListener("lostpointercapture", onLost);
            root.removeEventListener("pointerup", onLost);
            if (this.resizeCleanup === onLost) this.resizeCleanup = undefined;
        };

        this.cancelResize();
        this.resizePointerId = event.pointerId;
        root.setPointerCapture(event.pointerId);
        root.addEventListener("pointermove", onPointerMove);
        root.addEventListener("lostpointercapture", onLost);
        root.addEventListener("pointerup", onLost);
        this.resizeCleanup = onLost;
    };

    private resizeCleanup: (() => void) | undefined;

    cancelResize = (): void => {
        const cleanup = this.resizeCleanup;
        this.resizeCleanup = undefined;
        cleanup?.();
        const root = this.internalRef;
        if (root && this.resizePointerId !== undefined && root.hasPointerCapture(this.resizePointerId)) {
            root.releasePointerCapture(this.resizePointerId);
        }
        this.resizePointerId = undefined;
    };

    private resizePointerId: number | undefined;

    resetManualSize = (): void => {
        this.state.update((state) => {
            state.manualSize = null;
        });
        this.initialSize = null;
    };

    // --- lifecycle ---

    init() {}
}
