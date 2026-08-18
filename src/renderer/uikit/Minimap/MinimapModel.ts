import React from "react";
import { TComponentModel } from "../../core/state/model";
import type { MinimapProps } from "./Minimap";

export const defaultMinimapState = {
    indicatorTop: 0,
    indicatorHeight: 0,
    isDragging: false,
};

export type MinimapState = typeof defaultMinimapState;

export class MinimapModel extends TComponentModel<MinimapState, MinimapProps> {
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

        const realMirrorHeight = this.contentMirror.getBoundingClientRect().height;
        const heightRatio =
            realMirrorHeight / this.scrollContainer.scrollHeight;
        return heightRatio;
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
                this.startContainerTop +
                (dy / wrapperScale / effectiveScale) * 1.15;
        }
    };

    handleBackgroundClick = (e: React.MouseEvent) => {
        if (!this.scrollContainer || !this.wrapper) return;

        // Ignore clicks on the viewport indicator (it has its own drag logic)
        if ((e.target as HTMLElement).closest('[data-part="indicator"]')) return;

        const wrapperRect = this.wrapper.getBoundingClientRect();
        const clickY = e.clientY - wrapperRect.top + this.wrapper.scrollTop;
        const effectiveScale = this.getScale();
        const { indicatorHeight } = this.state.get();

        // Scroll so the indicator centers on the click point
        this.scrollContainer.scrollTop = (clickY - indicatorHeight / 2) / effectiveScale;
    };

    mouseEnter = () => {
        if (!this.state.get().indicatorHeight) {
            this.syncEverything();
        }
    };

    init = () => {
        window.addEventListener("resize", this.syncEverything);
        this.effect(() => {
            const scrollContainer = this.props.scrollContainer;
            queueMicrotask(() => {
                if (this.isLive && this.props.scrollContainer === scrollContainer) {
                    this.setScrollContainer(scrollContainer);
                }
            });
        }, () => [this.props.scrollContainer]);
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
