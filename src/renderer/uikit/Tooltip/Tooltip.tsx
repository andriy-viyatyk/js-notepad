import React, { cloneElement, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import ReactDOM from "react-dom";
import {
    Placement,
    useFloating,
    offset as floatingOffset,
    flip,
    shift,
    autoUpdate,
} from "@floating-ui/react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { fontSize, radius, spacing } from "../tokens";
import { overlayRegistry } from "../shared/overlayRegistry";
import { getOverlayLayer } from "../shared/overlayLayer";
import { tooltipRegistry } from "../shared/tooltipRegistry";

// --- Types ---

export interface TooltipProps {
    /** Optional debug label emitted as `data-name` on the tooltip's floating root. Use to
     *  disambiguate multiple instances in DOM inspector output. Never used for styling. */
    name?: string;
    /**
     * Tooltip body. Plain strings render as text; ReactNode lets the consumer compose richer
     * content. When `null`, `undefined`, or `false`, the tooltip is suppressed and the trigger
     * renders unwrapped.
     */
    content: React.ReactNode;
    /**
     * Single React element whose ref forwards to a DOM node. UIKit components and standard HTML
     * elements all qualify.
     */
    children: React.ReactElement<Record<string, unknown>>;
    /** Floating-ui placement. Default: "top". */
    placement?: Placement;
    /** [skidding, distance] — skidding shifts perpendicular to the main axis. Default: [0, 8]. */
    offset?: [number, number];
    /** Milliseconds to wait after pointer enter before opening. Default: 800. */
    delayShow?: number;
    /** Milliseconds to wait after pointer leave before closing. Default: 100. */
    delayHide?: number;
    /** When true, the tooltip is fully suppressed regardless of `content`. */
    disabled?: boolean;
}

// --- Styled ---

const Root = styled.div(
    {
        backgroundColor: color.background.default,
        color: color.text.default,
        border: `1px solid ${color.border.default}`,
        borderRadius: radius.md,
        boxShadow: `0 2px 8px ${color.shadow.default}`,
        fontSize: fontSize.sm,
        padding: spacing.md,
        maxWidth: 360,
        pointerEvents: "auto",
        userSelect: "text",
        WebkitAppRegion: "no-drag",
    },
    { label: "Tooltip" },
);

// --- Component ---

export function Tooltip({
    name,
    content,
    children,
    placement = "top",
    offset = [0, 8],
    delayShow = 800,
    delayHide = 100,
    disabled,
}: TooltipProps) {
    const [open, setOpen] = useState(false);
    const [id] = useState(tooltipRegistry.nextId);
    const showTimerRef = useRef<number | null>(null);
    const hideTimerRef = useRef<number | null>(null);
    const triggerElRef = useRef<Element | null>(null);

    // Re-render when the overlay registry changes so suppression state updates live.
    useSyncExternalStore(overlayRegistry.subscribe, overlayRegistry.getVersion);
    const suppressedByOverlay = overlayRegistry.isSuppressed(triggerElRef.current);

    // Re-render when a drag starts/ends so tooltips stay suppressed for its duration.
    useSyncExternalStore(tooltipRegistry.subscribe, tooltipRegistry.getVersion);
    const suppressedByDrag = tooltipRegistry.isDragging();

    const middleware = useMemo(
        () => [
            floatingOffset({ mainAxis: offset[1], crossAxis: offset[0] }),
            flip(),
            shift({ padding: 4 }),
        ],
        [offset],
    );

    const { refs, floatingStyles, placement: actualPlacement } = useFloating({
        open,
        onOpenChange: setOpen,
        placement,
        middleware,
        strategy: "fixed",
        whileElementsMounted: autoUpdate,
    });

    const clearTimers = useCallback(() => {
        if (showTimerRef.current !== null) {
            window.clearTimeout(showTimerRef.current);
            showTimerRef.current = null;
        }
        if (hideTimerRef.current !== null) {
            window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
    }, []);

    useEffect(() => clearTimers, [clearTimers]);

    const scheduleShow = useCallback(() => {
        clearTimers();
        if (overlayRegistry.isSuppressed(triggerElRef.current)) return;
        showTimerRef.current = window.setTimeout(() => {
            showTimerRef.current = null;
            // Re-check at fire time — an overlay may have opened during the delay.
            if (overlayRegistry.isSuppressed(triggerElRef.current)) return;
            setOpen(true);
        }, delayShow);
    }, [clearTimers, delayShow]);

    const scheduleHide = useCallback(() => {
        clearTimers();
        hideTimerRef.current = window.setTimeout(() => {
            hideTimerRef.current = null;
            setOpen(false);
        }, delayHide);
    }, [clearTimers, delayHide]);

    const suppressed = disabled || content === null || content === undefined || content === false || suppressedByOverlay || suppressedByDrag;

    // Close an already-open tooltip the moment an overlay covers it or a drag begins.
    useEffect(() => {
        if (open && (suppressedByOverlay || suppressedByDrag)) {
            clearTimers();
            setOpen(false);
        }
    }, [open, suppressedByOverlay, suppressedByDrag, clearTimers]);

    // Singleton: at most one tooltip visible at a time. On open, claim the shared slot
    // (closing any other open tooltip); release it on close/unmount. If a more-specific
    // (nested) tooltip already owns the slot, this one loses and stays closed.
    useEffect(() => {
        if (!open) return;
        const claimed = tooltipRegistry.open(id, triggerElRef.current, () => setOpen(false));
        if (!claimed) {
            setOpen(false);
            return;
        }
        return () => tooltipRegistry.close(id);
    }, [open, id]);

    // React 19: ref is a regular prop — read it from `props.ref`. Accessing
    // `children.ref` triggers a deprecation warning ("Accessing element.ref was
    // removed in React 19").
    const childRef = (children.props as { ref?: React.Ref<unknown> }).ref;
    const mergedRef = useCallback(
        (node: Element | null) => {
            triggerElRef.current = node;
            refs.setReference(node);
            if (typeof childRef === "function") childRef(node);
            else if (childRef && typeof childRef === "object")
                (childRef as React.MutableRefObject<Element | null>).current = node;
        },
        [refs, childRef],
    );

    // Forwarded handler shape — props we may chain into the cloned child.
    type ChildHandlers = {
        onMouseEnter?: (e: React.MouseEvent) => void;
        onMouseLeave?: (e: React.MouseEvent) => void;
        onFocus?: (e: React.FocusEvent) => void;
        onBlur?: (e: React.FocusEvent) => void;
        onKeyDown?: (e: React.KeyboardEvent) => void;
    };
    const childProps = children.props as ChildHandlers;
    const trigger = cloneElement(children, {
        ref: mergedRef,
        onMouseEnter: (e: React.MouseEvent) => {
            childProps.onMouseEnter?.(e);
            if (!suppressed) scheduleShow();
        },
        onMouseLeave: (e: React.MouseEvent) => {
            childProps.onMouseLeave?.(e);
            if (!suppressed) scheduleHide();
        },
        onFocus: (e: React.FocusEvent) => {
            childProps.onFocus?.(e);
            if (!suppressed) scheduleShow();
        },
        onBlur: (e: React.FocusEvent) => {
            childProps.onBlur?.(e);
            if (!suppressed) scheduleHide();
        },
        onKeyDown: (e: React.KeyboardEvent) => {
            childProps.onKeyDown?.(e);
            if (e.key === "Escape" && open) {
                clearTimers();
                setOpen(false);
            }
        },
    });

    if (suppressed || !open) return trigger;

    return (
        <>
            {trigger}
            {ReactDOM.createPortal(
                <Root
                    ref={refs.setFloating}
                    data-type="tooltip"
                    data-name={name}
                    data-placement={actualPlacement}
                    role="tooltip"
                    style={{ ...floatingStyles, zIndex: 1100 }}
                    onMouseEnter={clearTimers}
                    onMouseLeave={scheduleHide}
                >
                    {content}
                </Root>,
                getOverlayLayer(),
            )}
        </>
    );
}
