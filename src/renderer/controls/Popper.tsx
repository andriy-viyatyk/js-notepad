import {
    ForwardedRef,
    forwardRef,
    ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
} from "react";
import {
    Placement,
    useFloating,
    VirtualElement,
    offset as floatingOffset,
    flip,
    useMergeRefs,
    autoUpdate,
    size,
} from "@floating-ui/react";
import styled from "@emotion/styled";
import color from "../theme/color";
import { ResizeHandleIcon } from "../theme/icons";
import clsx from "clsx";

export const PopperRoot = styled.div(
    {
        backgroundColor: color.background.default,
        border: `1px solid ${color.border.default}`,
        borderRadius: 6,
        boxShadow: color.shadow.default,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        WebkitAppRegion: "no-drag",
        overflow: "auto",
        "& .resize-handle": {
            position: "absolute",
            bottom: 0,
            right: 0,
            width: 10,
            height: 10,
            cursor: "nwse-resize",
            color: color.icon.light,
            "&.isTopPlacement": {
                bottom: "auto",
                top: 0,
                cursor: "nesw-resize",
                transform: "rotate(-90deg)",
            },
        },
    },
    { label: "PopperRoot" },
);

export interface PopperPosition {
    elementRef?: Element | VirtualElement | null;
    x?: number;
    y?: number;
    placement?: Placement;
    offset?: [number, number]; // [skidding, distance].  *Skidding - shift left/right if pupup at the bottom/top.
    anchorType?: "vertical" | "horizontal";
}

export interface PopperProps extends PopperPosition {
    children?: ReactNode;
    className?: string;
    open?: boolean;
    resizable?: boolean;
    onClose?: (r?: any) => void;
    onKeyDown?: (event: React.KeyboardEvent) => void;
    onResize?: (width: number, height: number) => void;
    tabIndex?: number;
    maxHeight?: number | string; // Optional: allow parent to override max-height
    allowClickInClass?: string;
}

const verticalPlacements: Placement[] = [
    "bottom-start",
    "bottom-end",
    "top-start",
    "top-end",
];

const horizontalPlacements: Placement[] = [
    "right-start",
    "right-end",
    "left-start",
    "left-end",
];

export const Popper = forwardRef(function PopperComponent(
    props: PopperProps,
    ref: ForwardedRef<HTMLDivElement | null>,
) {
    const {
        className,
        elementRef,
        placement: placementProps,
        x,
        y,
        children,
        open,
        offset,
        onClose,
        onKeyDown,
        resizable,
        onResize,
        tabIndex,
        maxHeight,
        anchorType = "vertical",
        allowClickInClass,
    } = props;
    const placement = placementProps
        ? placementProps
        : anchorType === "vertical"
          ? "bottom-start"
          : "right-start";

    const initialSizeRef = useRef<{ width: number; height: number } | null>(
        null,
    );
    const placeRef = useMemo<Element | VirtualElement | undefined>(() => {
        if (elementRef) {
            return elementRef;
        }
        if (x !== undefined && y !== undefined) {
            return {
                getBoundingClientRect: () => ({
                    top: y,
                    left: x,
                    bottom: y,
                    right: x,
                    width: 0,
                    height: 0,
                }),
            } as VirtualElement;
        }
        return undefined;
    }, [elementRef, x, y]);

    const onOpenChange = useCallback(
        (value: boolean) => {
            if (value) {
                onClose?.();
            }
        },
        [onClose],
    );

    const middleware = useMemo(() => {
        const baseMiddleware = [
            flip({
                fallbackPlacements: anchorType === "vertical"
                    ? verticalPlacements
                    : horizontalPlacements,
            }),
            size({
                apply({
                    availableHeight,
                    elements,
                }: {
                    availableHeight: number;
                    elements: { floating: HTMLElement };
                }) {
                    // Apply max-height based on available space (with 20px padding)
                    Object.assign(elements.floating.style, {
                        maxHeight: `${Math.max(100, availableHeight - 20)}px`,
                    });
                },
            }),
        ];

        if (offset) {
            return [
                floatingOffset({ mainAxis: offset[1], crossAxis: offset[0] }),
                ...baseMiddleware,
            ];
        }

        return baseMiddleware;
    }, [offset, anchorType]);

    const {
        refs,
        floatingStyles,
        placement: actualPlacement,
    } = useFloating({
        open,
        onOpenChange,
        placement,
        middleware,
        strategy: "fixed",
        whileElementsMounted: autoUpdate,
    });

    const isTopPlacement = actualPlacement.startsWith("top");

    const internalRef = useRef<HTMLDivElement | null>(null);
    const mergedRefs = useMergeRefs([refs.setFloating, ref, internalRef]);

    useEffect(() => {
        refs.setPositionReference(placeRef ?? null);
    }, [placeRef, refs]);

    const handleClickOutside = useCallback(
        (event: MouseEvent) => {
            const clickedInsideClass = allowClickInClass
                ? (event.target as Element).closest(`.${allowClickInClass}`)
                : false;

            if (
                open &&
                internalRef.current &&
                !internalRef.current.contains(event.target as Node) &&
                !clickedInsideClass
            ) {
                onClose?.();
            }
        },
        [onClose, open, internalRef, allowClickInClass],
    );

    useEffect(() => {
        document.addEventListener("mousedown", handleClickOutside);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [handleClickOutside]);

    function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
        if (event.pointerType === "mouse" && event.buttons !== 1) {
            return;
        }

        if (!internalRef.current) {
            return;
        }

        if (!initialSizeRef.current) {
            const { width: initialWidth, height: initialHeight } =
                internalRef.current.getBoundingClientRect();
            initialSizeRef.current = {
                width: initialWidth,
                height: initialHeight,
            };
        }

        const currentTarget = internalRef.current;

        if (!currentTarget) {
            return;
        }

        const { pointerId } = event;
        const { width: startingWidth, height: startingHeight } =
            currentTarget.getBoundingClientRect();
        const startingX = event.clientX;
        const startingY = event.clientY;

        function onPointerMove(e: PointerEvent) {
            if (!initialSizeRef.current) {
                return;
            }
            const { width: initialWidth, height: initialHeight } =
                initialSizeRef.current;

            e.preventDefault();
            const width = startingWidth + e.clientX - startingX;
            const height = isTopPlacement
                ? startingHeight + -e.clientY + startingY
                : startingHeight + e.clientY - startingY;
            if (
                width > 0 &&
                height > 0 &&
                width > initialWidth &&
                height > initialHeight
            ) {
                internalRef.current?.style.setProperty("width", `${width}px`);
                internalRef.current?.style.setProperty("height", `${height}px`);
                onResize?.(width, height);
            }
        }

        function onLostPointerCapture() {
            currentTarget.removeEventListener("pointermove", onPointerMove);
            currentTarget.removeEventListener(
                "lostpointercapture",
                onLostPointerCapture,
            );
        }

        currentTarget.setPointerCapture(pointerId);
        currentTarget.addEventListener("pointermove", onPointerMove);
        currentTarget.addEventListener(
            "lostpointercapture",
            onLostPointerCapture,
        );
    }

    if (!open || !placeRef) {
        return null;
    }

    return (
        <PopperRoot
            ref={mergedRefs}
            className={className}
            style={{
                ...floatingStyles,
                zIndex: 1000,
                ...(maxHeight && { maxHeight }),
            }}
            onKeyDown={onKeyDown}
            tabIndex={tabIndex}
        >
            {children}
            {resizable && (
                <ResizeHandleIcon
                    className={clsx("resize-handle", { isTopPlacement })}
                    onPointerDown={onPointerDown}
                />
            )}
        </PopperRoot>
    );
});
