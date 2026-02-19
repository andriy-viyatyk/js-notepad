import styled from "@emotion/styled";
import clsx from "clsx";
import React, { ReactElement, useRef } from "react";
import color from "../../theme/color";

export type SplitterType = "vertical" | "horizontal";

const SplitterRoot = styled.div<{ type: SplitterType }>((props) => ({
    width: props.type === "vertical" ? 6 : undefined,
    height: props.type === "horizontal" ? 6 : undefined,
    backgroundColor: color.background.default,
    cursor: props.type === "vertical" ? "ew-resize" : "ns-resize",
    flexShrink: 0,
    flexGrow: 0,
    boxSizing: "border-box",
    borderTop:
        props.type === "horizontal"
            ? `1px solid ${color.background.light}`
            : undefined,
    borderRight:
        props.type === "vertical"
            ? `1px solid ${color.background.light}`
            : undefined,
    "&:hover": {
        backgroundColor: color.background.light,
    },
}));

interface SplitterProps extends React.HTMLAttributes<HTMLDivElement> {
    type: SplitterType;
    initialWidth?: number;
    initialHeight?: number;
    onChangeWidth?: (width: number) => void;
    onChangeHeight?: (height: number) => void;
    /**
     * Which border of the panel controlled by onChangeWidth/onChangeHeight the splitter sits on.
     * Example: if the splitter is below a panel whose height is tracked, use "bottom".
     * "right"/"bottom" → drag right/down increases size; "left"/"top" → drag right/down decreases size.
     */
    borderSized?: "right" | "left" | "top" | "bottom";
    className?: string;
}

export function Splitter({
    type,
    initialWidth = 200,
    onChangeWidth,
    initialHeight = 200,
    onChangeHeight,
    borderSized = "right",
    className,
    ...otherProps
}: SplitterProps): ReactElement {
    const splitterRef = useRef<HTMLDivElement>(null);
    const beforeDragWidth = useRef<number>(initialWidth);
    const beforeDragHeight = useRef<number>(initialHeight);
    const startX = useRef<number>(0);
    const startY = useRef<number>(0);

    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();

        // Capture the pointer - all pointer events now go to this element
        e.currentTarget.setPointerCapture(e.pointerId);

        startX.current = e.clientX;
        startY.current = e.clientY;
        beforeDragWidth.current = initialWidth;
        beforeDragHeight.current = initialHeight;
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        // Only process if pointer is captured (dragging)
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;

        const dx = e.clientX - startX.current;
        const dy = e.clientY - startY.current;

        onChangeWidth?.(
            beforeDragWidth.current +
                dx * (borderSized === "right" ? 1 : -1)
        );
        onChangeHeight?.(
            beforeDragHeight.current +
                dy * (borderSized === "bottom" ? 1 : -1)
        );
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        // Pointer is automatically released, but you can do it explicitly
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    return (
        <SplitterRoot
            ref={splitterRef}
            type={type}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={clsx("splitter", className)}
            {...otherProps}
        />
    );
}

/** @deprecated Use Splitter instead */
export const Spliter = Splitter;
/** @deprecated Use SplitterType instead */
export type SpliterType = SplitterType;
