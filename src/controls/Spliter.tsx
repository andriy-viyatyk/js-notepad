import styled from "@emotion/styled";
import React, { ReactElement, useRef } from "react";
import color from "../theme/color";

export type SpliterType = "vertical" | "horizontal";

const SpliterRoot = styled.div<{ type: SpliterType }>((props) => ({
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

interface SpliterProps extends React.HTMLAttributes<HTMLDivElement> {
    type: SpliterType;
    initialWidth?: number;
    initialHeight?: number;
    onChangeWidth?: (width: number) => void;
    onChangeHeight?: (height: number) => void;
    borderSized?: "right" | "left" | "top" | "bottom";
    className?: string;
}

export function Spliter({
    type,
    initialWidth = 200,
    onChangeWidth,
    initialHeight = 200,
    onChangeHeight,
    borderSized = "right",
    className,
    ...otherProps
}: SpliterProps): ReactElement {
    const beforeDragWidth = useRef<number>(initialWidth);
    const beforeDragHeight = useRef<number>(initialHeight);
    const startX = useRef<number>(0);
    const startY = useRef<number>(0);

    const handleMouseDown = (e: React.MouseEvent) => {
        startX.current = e.clientX;
        startY.current = e.clientY;
        beforeDragWidth.current = initialWidth;
        beforeDragHeight.current = initialHeight;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const dx = moveEvent.clientX - startX.current;
            const dy = moveEvent.clientY - startY.current;
            onChangeWidth?.(
                beforeDragWidth.current +
                    dx * (borderSized === "right" ? 1 : -1)
            );
            onChangeHeight?.(
                beforeDragHeight.current +
                    dy * (borderSized === "bottom" ? 1 : -1)
            );
        };

        const handleMouseUp = () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    };

    return (
        <SpliterRoot
            type={type}
            onMouseDown={handleMouseDown}
            className={className}
            {...otherProps}
        />
    );
}
