import styled from "@emotion/styled";
import clsx from "clsx";
import React, { useEffect } from "react";
import color from "../theme/color";
import { TComponentModel, useComponentModel } from "../common/classes/model";

export const MinimapRoot = styled.div({
    "&.minimap-wrapper": {
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
    },
    "& .minimap-content-container": {
        position: "relative",
        pointerEvents: "none",
        userSelect: "none",
    },
    "& .minimap-content": {
        transform: "scale(0.15)",
        transformOrigin: "top left",
        opacity: 0.7,
        width: "666%", // 1 / 0.15 = 6.66 - compensates for scale
        position: "absolute",
        top: 0,
        left: 0,
    },
    "& .minimap-viewport-indicator": {
        position: "absolute",
        left: 0,
        width: "100%",
        background: color.minimapSlider.background,
        boxSizing: "border-box",
        zIndex: 10,
        "&:hover": {
            background: color.minimapSlider.hoverBackground,
        },
        "&.isDragging": {
            background: color.minimapSlider.activeBackground,
        }
    },
});

interface MinimapProps extends React.HTMLAttributes<HTMLDivElement> {
    scrollContainer: HTMLElement | null;
}

const defaultMinimapState = {
    indicatorTop: 0,
    indicatorHeight: 0,
    isDragging: false,
};

type MinimapState = typeof defaultMinimapState;

class MinimapModel extends TComponentModel<MinimapState, MinimapProps> {
    BASE_SCALE = 0.15;
    scrollContainer: HTMLElement | null = null;
    contentMirror: HTMLDivElement | null = null;
    contentContainer: HTMLDivElement | null = null;
    wrapper: HTMLDivElement | null = null;
    observer: MutationObserver | null = null;
    // indicator drag
    startY = 0;
    startContainerTop = 0;

    setScrollContainer = (el: HTMLElement | null) => {
        if (this.scrollContainer === el) return;

        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        if (this.scrollContainer) {
            this.scrollContainer.removeEventListener(
                "scroll",
                this.syncEverything,
            );
        }

        this.scrollContainer = el;

        if (this.scrollContainer) {
            this.observer = new MutationObserver(() => {
                if (this.contentMirror && this.scrollContainer) {
                    this.contentMirror.innerHTML =
                        this.scrollContainer.innerHTML;
                    this.syncEverything();
                }
            });
            this.scrollContainer.addEventListener(
                "scroll",
                this.syncEverything,
            );

            this.observer.observe(this.scrollContainer, {
                childList: true,
                subtree: true,
                characterData: true,
            });

            this.syncEverything();
        }
    };

    setContentMirror = (el: HTMLDivElement | null) => {
        this.contentMirror = el;
    };

    setContentContainer = (el: HTMLDivElement | null) => {
        this.contentContainer = el;
    };

    setWrapper = (el: HTMLDivElement | null) => {
        this.wrapper = el;
    };

    getScale = () => {
        if (!this.scrollContainer || !this.contentMirror)
            return this.BASE_SCALE;

        const mirrorScrollHeight = this.contentMirror.scrollHeight;
        const heightRatio =
            mirrorScrollHeight / this.scrollContainer.scrollHeight;
        const effectiveScale = heightRatio * this.BASE_SCALE;
        return effectiveScale;
    };

    syncEverything = () => {
        if (
            !this.scrollContainer ||
            !this.wrapper ||
            !this.contentMirror ||
            !this.contentContainer
        )
            return;

        const { scrollTop, scrollHeight, clientHeight } = this.scrollContainer;
        const wrapperHeight = this.wrapper.clientHeight;

        // Update content if it hasn't been copied yet
        if (this.contentMirror.innerHTML === "") {
            this.contentMirror.innerHTML = this.scrollContainer.innerHTML;
        }

        const effectiveScale = this.getScale();

        // Calculate dimensions based on effective scale
        const scaledContentHeight = scrollHeight * effectiveScale;
        const indicatorHeight = clientHeight * effectiveScale;
        const indicatorTop = scrollTop * effectiveScale;

        // Set container height to match the visual scaled height
        this.contentContainer.style.height = `${scaledContentHeight}px`;

        // Update indicator position
        this.state.update((s) => {
            s.indicatorTop = isNaN(indicatorTop) ? 0 : indicatorTop;
            s.indicatorHeight = isNaN(indicatorHeight) ? 0 : indicatorHeight;
        });

        // Sync minimap scroll position
        if (scaledContentHeight > wrapperHeight) {
            const maxMainScroll = scrollHeight - clientHeight;
            const maxMiniScroll = scaledContentHeight - wrapperHeight;
            const scrollRatio =
                maxMainScroll > 0 ? scrollTop / maxMainScroll : 0;

            this.wrapper.scrollTop = scrollRatio * maxMiniScroll;
        } else {
            this.wrapper.scrollTop = 0;
        }
    };

    handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();

        // Capture the pointer - all pointer events now go to this element
        e.currentTarget.setPointerCapture(e.pointerId);

        this.startY = e.clientY;
        this.startContainerTop = this.scrollContainer
            ? this.scrollContainer.scrollTop
            : 0;
        this.state.update((s) => {
            s.isDragging = true;
        });
    };

    handlePointerUp = (e: React.PointerEvent) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        this.state.update((s) => {
            s.isDragging = false;
        });
    };

    handlePointerMove = (e: React.PointerEvent) => {
        // Only process if pointer is captured (dragging)
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;

        const dy = e.clientY - this.startY;
        const effectiveScale = this.getScale();
        const wrapperScale = this.wrapper
            ? this.wrapper.clientHeight / this.wrapper.scrollHeight
            : 1;

        if (this.scrollContainer) {
            this.scrollContainer.scrollTop =
                this.startContainerTop + dy / wrapperScale / effectiveScale * 1.15;
        }
    };

    mouseEnter = () => {
        if (!this.state.get().indicatorHeight) {
            this.syncEverything();
        }
    };

    init = () => {
        window.addEventListener("resize", this.syncEverything);
    };

    dispose = () => {
        this.observer?.disconnect();
        this.observer = null;
        this.scrollContainer?.removeEventListener(
            "scroll",
            this.syncEverything,
        );
        window.removeEventListener("resize", this.syncEverything);
    };
}

export function Minimap({
    scrollContainer,
    className,
    ...props
}: MinimapProps) {
    const model = useComponentModel(
        { scrollContainer },
        MinimapModel,
        defaultMinimapState,
    );
    const state = model.state.use();

    useEffect(() => {
        model.setScrollContainer(scrollContainer);
    }, [scrollContainer]);

    useEffect(() => {
        model.init();
        return () => {
            model.dispose();
        };
    }, []);

    return (
        <MinimapRoot
            ref={model.setWrapper}
            className={clsx("minimap-wrapper", className)}
            onMouseEnter={model.mouseEnter}
            {...props}
        >
            <div
                className="minimap-content-container"
                ref={model.setContentContainer}
            >
                <div className="minimap-content" ref={model.setContentMirror} />
            </div>
            <div
                className={clsx("minimap-viewport-indicator", {
                    isDragging: state.isDragging,
                })}
                style={{
                    top: state.indicatorTop,
                    height: state.indicatorHeight,
                }}
                onPointerDown={model.handlePointerDown}
                onPointerMove={model.handlePointerMove}
                onPointerUp={model.handlePointerUp}
            />
        </MinimapRoot>
    );
}
