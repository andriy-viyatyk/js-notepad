import {
    autoUpdate,
    computePosition,
    flip,
    offset as floatingOffset,
    shift,
    type Placement,
    type ReferenceElement,
} from "@floating-ui/dom";
import { fillSlot, type SlotContent } from "../shared/fill-slot";
import { getOverlayLayer } from "../shared/overlayLayer";
import { overlayRegistry } from "../shared/overlayRegistry";
import { isRestoringFocus } from "../shared/focus-restore";
import { tooltipRegistry } from "../shared/tooltipRegistry";
import "./Tooltip.css";

export interface TooltipOptions {
    content: SlotContent;
    placement?: Placement;
    offset?: [number, number];
    delayShow?: number;
    delayHide?: number;
    disabled?: boolean;
    name?: string;
    /**
     * Position against this instead of against the trigger. Defaults to the trigger.
     *
     * Events and identity stay with the trigger; only geometry comes from here. That split is
     * what lets one attachment serve many targets inside a single element — a data grid's cells
     * are pooled and recycled, so they are unusable as triggers (their `mouseenter` is not
     * dependable and an attachment would outlive its occupant) but perfectly good as *anchors*.
     * Floating UI accepts a virtual element, `{ getBoundingClientRect, contextElement }`, wherever
     * it accepts a real one, so the anchor need not be in the DOM at all.
     *
     * Keep `contextElement` pointing at something stable: it is what `autoUpdate` uses to find the
     * overflow ancestors to watch, so a moving `contextElement` re-subscribes on every change.
     */
    anchor?: ReferenceElement;
}

export interface TooltipAttachment {
    update(options: TooltipOptions): void;
    /**
     * Open it as a real hover would — the show delay, the suppression re-check when the delay
     * fires, and the singleton claim all apply.
     *
     * For the case the trigger's own events cannot express: content that became showable while
     * the pointer was *already* inside the trigger. `update()` deliberately never schedules a
     * show, so without this a delegating host would set content to a cell's text and nothing
     * would ever open it.
     */
    show(): void;
    /** Close it after the hide delay, as leaving the trigger would. Content is kept. */
    hide(): void;
    dispose(): void;
}

const DEFAULT_PLACEMENT: Placement = "top";
const DEFAULT_OFFSET: [number, number] = [0, 8];
const DEFAULT_DELAY_SHOW = 800;
const DEFAULT_DELAY_HIDE = 100;

function isEmptyContent(content: SlotContent): boolean {
    return content === null || content === undefined || content === false;
}

function isSuppressed(trigger: Element): boolean {
    return overlayRegistry.isSuppressed(trigger) || tooltipRegistry.isDragging();
}

function applyName(root: HTMLElement, name: string | undefined): void {
    if (name === undefined) root.removeAttribute("data-name");
    else root.dataset.name = name;
}

/**
 * Attach a tooltip to an existing trigger without changing the trigger's DOM shape.
 * The attachment owns the floating root and all resources created by the tooltip, but it
 * never detaches or otherwise mutates the trigger element on disposal.
 */
export function attachTooltip(
    trigger: Element,
    initialOptions: TooltipOptions,
): TooltipAttachment {
    const id = tooltipRegistry.nextId();
    let options = initialOptions;
    let disposed = false;
    let open = false;
    let showTimer: number | undefined;
    let hideTimer: number | undefined;
    let floatingRoot: HTMLDivElement | undefined;
    let contentHost: HTMLDivElement | undefined;
    let contentDisposer: (() => void) | undefined;
    let stopAutoUpdate: (() => void) | undefined;
    let positionGeneration = 0;

    const clearTimers = (): void => {
        if (showTimer !== undefined) {
            window.clearTimeout(showTimer);
            showTimer = undefined;
        }
        if (hideTimer !== undefined) {
            window.clearTimeout(hideTimer);
            hideTimer = undefined;
        }
    };

    const close = (): void => {
        if (!open) {
            clearTimers();
            return;
        }

        open = false;
        clearTimers();
        stopAutoUpdate?.();
        stopAutoUpdate = undefined;
        tooltipRegistry.close(id);
        contentDisposer?.();
        contentDisposer = undefined;
        contentHost = undefined;
        floatingRoot?.remove();
        floatingRoot = undefined;
        positionGeneration++;
    };

    const clearHideTimer = (): void => {
        if (hideTimer !== undefined) {
            window.clearTimeout(hideTimer);
            hideTimer = undefined;
        }
    };

    const scheduleHide = (): void => {
        clearTimers();
        hideTimer = window.setTimeout(() => {
            hideTimer = undefined;
            close();
        }, options.delayHide ?? DEFAULT_DELAY_HIDE);
    };

    const position = (): void => {
        const root = floatingRoot;
        if (!root || disposed || !open) return;

        const generation = ++positionGeneration;
        const placement = options.placement ?? DEFAULT_PLACEMENT;
        const [crossAxis, mainAxis] = options.offset ?? DEFAULT_OFFSET;

        void computePosition(options.anchor ?? trigger, root, {
            placement,
            strategy: "fixed",
            middleware: [
                floatingOffset({ mainAxis, crossAxis }),
                flip(),
                shift({ padding: 4 }),
            ],
        }).then(({ x, y, placement: actualPlacement }) => {
            if (disposed || !open || generation !== positionGeneration || root !== floatingRoot) return;
            root.style.left = `${x}px`;
            root.style.top = `${y}px`;
            root.dataset.placement = actualPlacement;
        });
    };

    const show = (): void => {
        if (disposed || open || options.disabled || isEmptyContent(options.content)) return;
        if (isSuppressed(trigger)) return;

        clearTimers();
        showTimer = window.setTimeout(() => {
            showTimer = undefined;
            // Re-check at fire time — an overlay may have opened during the show delay.
            if (disposed || options.disabled || isEmptyContent(options.content) || isSuppressed(trigger)) return;

            open = true;
            const claimed = tooltipRegistry.open(id, trigger, close);
            if (!claimed) {
                open = false;
                return;
            }

            const root = document.createElement("div");
            root.dataset.type = "tooltip";
            root.dataset.placement = options.placement ?? DEFAULT_PLACEMENT;
            root.setAttribute("role", "tooltip");
            applyName(root, options.name);
            root.style.position = "fixed";
            root.style.zIndex = "1100";

            const body = document.createElement("div");
            body.dataset.part = "content";
            root.append(body);
            getOverlayLayer().append(root);
            floatingRoot = root;
            contentHost = body;
            contentDisposer = fillSlot(body, options.content);

            root.addEventListener("mouseenter", clearTimers);
            root.addEventListener("mouseleave", scheduleHide);
            stopAutoUpdate = autoUpdate(options.anchor ?? trigger, root, position);
            position();
        }, options.delayShow ?? DEFAULT_DELAY_SHOW);
    };

    const onMouseEnter = (): void => show();
    const onMouseLeave = (): void => scheduleHide();
    const onFocusIn = (): void => {
        // A transient surface handing focus back is not the user focusing this control, and a
        // tooltip that opens under a pointer which left seconds ago reads as a ghost. `focusin`
        // fires synchronously inside `restoreFocus()`, so the flag is exact for this event.
        if (isRestoringFocus()) return;
        show();
    };
    const onFocusOut = (event: FocusEvent): void => {
        const relatedTarget = event.relatedTarget;
        if (relatedTarget instanceof Node && trigger.contains(relatedTarget)) return;
        scheduleHide();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") close();
    };
    const onOverlayChange = (): void => {
        if (open && overlayRegistry.isSuppressed(trigger)) close();
    };
    const onTooltipRegistryChange = (): void => {
        if (open && tooltipRegistry.isDragging()) close();
    };

    trigger.addEventListener("mouseenter", onMouseEnter);
    trigger.addEventListener("mouseleave", onMouseLeave);
    trigger.addEventListener("focusin", onFocusIn);
    trigger.addEventListener("focusout", onFocusOut);
    trigger.addEventListener("keydown", onKeyDown);
    const unsubscribeOverlay = overlayRegistry.subscribe(onOverlayChange);
    const unsubscribeTooltip = tooltipRegistry.subscribe(onTooltipRegistryChange);

    const attachment: TooltipAttachment = {
        update(nextOptions): void {
            if (disposed) return;
            const previousPlacement = options.placement ?? DEFAULT_PLACEMENT;
            const previousOffset = options.offset ?? DEFAULT_OFFSET;
            const previousAnchor = options.anchor ?? trigger;
            options = nextOptions;

            if (options.disabled || isEmptyContent(options.content)) {
                close();
                return;
            }

            if (open && contentHost && floatingRoot) {
                // fillSlot owns the host across arms; the superseded cleanup is
                // a no-op, but the reference must not be kept.
                contentDisposer = fillSlot(contentHost, options.content);
                applyName(floatingRoot, options.name);
                const nextOffset = options.offset ?? DEFAULT_OFFSET;
                const nextAnchor = options.anchor ?? trigger;
                if (nextAnchor !== previousAnchor) {
                    // The anchor is watched, not just read: `autoUpdate` is subscribed to the
                    // previous one's scroll and resize ancestors, so it has to be re-pointed as
                    // well as re-measured. A caller that swaps anchors per hovered target passes a
                    // fresh object each time, which is what makes identity the signal.
                    stopAutoUpdate?.();
                    stopAutoUpdate = autoUpdate(nextAnchor, floatingRoot, position);
                    position();
                } else if (
                    previousPlacement !== (options.placement ?? DEFAULT_PLACEMENT)
                    || previousOffset[0] !== nextOffset[0]
                    || previousOffset[1] !== nextOffset[1]
                ) position();
            }
        },
        show(): void {
            // Cancel a pending hide first. The internal `show()` returns early while `open` is
            // still true and would leave that timer running, so a hide-then-show inside the hide
            // delay — which is exactly what moving between two adjacent targets looks like —
            // would close a tooltip the caller just asked to keep.
            clearHideTimer();
            show();
        },
        hide(): void {
            if (disposed) return;
            scheduleHide();
        },
        dispose(): void {
            if (disposed) return;
            disposed = true;
            close();
            unsubscribeOverlay();
            unsubscribeTooltip();
            trigger.removeEventListener("mouseenter", onMouseEnter);
            trigger.removeEventListener("mouseleave", onMouseLeave);
            trigger.removeEventListener("focusin", onFocusIn);
            trigger.removeEventListener("focusout", onFocusOut);
            trigger.removeEventListener("keydown", onKeyDown);
        },
    };

    return attachment;
}
