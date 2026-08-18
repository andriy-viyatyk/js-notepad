import React from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { useComponentModel } from "../../core/state/model";
import {
    MinimapModel,
    MinimapState,
    defaultMinimapState,
} from "./MinimapModel";

// --- Types ---

export interface MinimapProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;

    /** The scroll container this minimap mirrors and drives. */
    scrollContainer: HTMLElement | null;
}

// --- Styled ---

const Root = styled.div(
    {
        position: "relative",
        width: 120,
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        msOverflowStyle: "none",
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": {
            display: "none",
        },
        flexShrink: 0,

        '& [data-part="content-container"]': {
            position: "relative",
            pointerEvents: "none",
            userSelect: "none",
        },
        '& [data-part="content"]': {
            transform: "scale(0.15)",
            transformOrigin: "top left",
            opacity: 0.7,
            width: "666%", // 1 / 0.15 = 6.66 — compensates for scale
            position: "absolute",
            top: 0,
            left: 0,
        },
        '& [data-part="indicator"]': {
            position: "absolute",
            left: 0,
            width: "100%",
            background: color.minimapSlider.background,
            boxSizing: "border-box",
            zIndex: 10,
        },
        '& [data-part="indicator"]:hover': {
            background: color.minimapSlider.hoverBackground,
        },
        '& [data-part="indicator"][data-dragging]': {
            background: color.minimapSlider.activeBackground,
        },
    },
    { label: "Minimap" },
);

// --- Component ---

export function Minimap(props: MinimapProps) {
    const { name, scrollContainer, ...rest } = props;
    const model = useComponentModel(
        { scrollContainer },
        MinimapModel,
        defaultMinimapState,
    );
    const state: MinimapState = model.state.use();

    return (
        <Root
            ref={model.setWrapper}
            data-type="minimap"
            data-name={name}
            onClick={model.handleBackgroundClick}
            onMouseEnter={model.mouseEnter}
            {...rest}
        >
            <div data-part="content-container" ref={model.setContentContainer}>
                <div data-part="content" ref={model.setContentMirror} />
            </div>
            <div
                data-part="indicator"
                data-dragging={state.isDragging || undefined}
                style={{
                    top: state.indicatorTop,
                    height: state.indicatorHeight,
                }}
                onPointerDown={model.handlePointerDown}
                onPointerMove={model.handlePointerMove}
                onPointerUp={model.handlePointerUp}
            />
        </Root>
    );
}
