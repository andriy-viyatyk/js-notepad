import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { useFloating, useMergeRefs, autoUpdate } from "@floating-ui/react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { radius } from "../tokens";
import { ResizeHandleIcon } from "../../theme/icons";
import { useComponentModel } from "../../core/state/model";
import { getOverlayLayer } from "../shared/overlayLayer";
import {
    PopoverModel,
    PopoverProps,
    defaultPopoverState,
} from "./PopoverModel";

// --- Styled ---

const Root = styled.div(
    {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        backgroundColor: color.background.default,
        border: `1px solid ${color.border.default}`,
        borderRadius: radius.lg,
        boxShadow: `0 2px 8px ${color.shadow.default}`,
        overflow: "hidden",
        WebkitAppRegion: "no-drag",
        "&[data-scroll]": {
            overflow: "auto",
        },
    },
    { label: "Popover" },
);

const ResizeHandle = styled.div(
    {
        position: "absolute",
        right: 2,
        bottom: 2,
        width: 14,
        height: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "nwse-resize",
        color: color.text.light,
        opacity: 0.6,
        userSelect: "none",
        touchAction: "none",
        zIndex: 1,
        "&:hover": { opacity: 1 },
        '&[data-edge="top"]': {
            top: 2,
            bottom: "unset",
            cursor: "nesw-resize",
            transform: "rotate(-90deg)",
        },
        "& > svg": {
            width: 12,
            height: 12,
        },
    },
    { label: "PopoverResizeHandle" },
);

// --- Component ---

export function Popover({ ref, ...props }: PopoverProps & { ref?: React.Ref<HTMLDivElement> }) {
    const model = useComponentModel(props, PopoverModel, defaultPopoverState);

    // useFloating must run unconditionally on every render — it owns React refs
    // internally. It cannot live in the model class.
    const middleware = model.middleware.value;
    const { refs, floatingStyles, placement: actualPlacement } = useFloating({
        open: props.open,
        onOpenChange: model.onOpenChange,
        placement: props.placement ?? "bottom-start",
        middleware,
        strategy: "fixed",
        whileElementsMounted: autoUpdate,
    });

    // Hand the floating handles to the model so its handlers can use them.
    model.setFloating(refs, actualPlacement);

    // floating-ui's setPositionReference triggers internal setState — running it
    // during render would re-render Popover until React aborts. Defer to a post-
    // commit useEffect (same pattern as the pre-migration code).
    const placeRef = model.placeRef.value;
    useEffect(() => {
        refs.setPositionReference(placeRef ?? null);
    }, [refs, placeRef]);

    const mergedRefs = useMergeRefs([refs.setFloating, ref, model.setInternalRef]);

    const { manualSize } = model.state.use((s) => ({ manualSize: s.manualSize }));

    const {
        name,
        open,
        onKeyDown,
        maxHeight,
        resizable,
        scroll = true,
        children,
        // Captured (not forwarded) — model handles via this.props
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        elementRef: _elementRef,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        x: _x,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        y: _y,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        placement: _placement,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        offset: _offset,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onClose: _onClose,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        outsideClickIgnoreSelector: _outsideClickIgnoreSelector,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        matchAnchorWidth: _matchAnchorWidth,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onResize: _onResize,
        ...rest
    } = props;

    if (!open || !placeRef) return null;

    const inlineStyle: React.CSSProperties = {
        ...floatingStyles,
        zIndex: 1000,
        ...(maxHeight ? { maxHeight } : {}),
        ...(manualSize ? { width: manualSize.width, height: manualSize.height } : {}),
    };

    const isTopPlacement = actualPlacement.startsWith("top");

    return ReactDOM.createPortal(
        <Root
            className={scroll ? "scroll-container" : undefined}
            data-type="popover"
            data-name={name}
            data-scroll={scroll || undefined}
            data-placement={actualPlacement}
            data-resizable={resizable || undefined}
            data-resized={manualSize ? "" : undefined}
            onKeyDown={onKeyDown}
            {...rest}
            ref={mergedRefs}
            style={inlineStyle}
        >
            {children}
            {resizable && (
                <ResizeHandle
                    data-type="popover-resize-handle"
                    data-edge={isTopPlacement ? "top" : "bottom"}
                    onPointerDown={model.onHandlePointerDown}
                >
                    <ResizeHandleIcon />
                </ResizeHandle>
            )}
        </Root>,
        getOverlayLayer(),
    );
}

// Re-export public types from canonical location.
export type { PopoverProps, PopoverPosition } from "./PopoverModel";
