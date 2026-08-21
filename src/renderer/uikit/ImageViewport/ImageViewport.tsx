import type React from "react";
import { TComponentModel } from "../../core/state/model";
import { imageElementToPngBlob } from "./image-raster";
import { mountVanilla } from "../shared/mount";
import { ImageViewportView } from "./ImageViewportView";

// ============================================================================
// Constants
// ============================================================================

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const ZOOM_STEP = 0.1;

// ============================================================================
// ImageViewModel - manages zoom/pan state (decoupled from page model)
// ============================================================================

export const defaultImageViewportState = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    imageWidth: 0,
    imageHeight: 0,
    fitScale: 1,
};

export type ImageViewportState = typeof defaultImageViewportState;

export interface ImageViewportModelProps {
    src: string;
    onModel: ((model: ImageViewportModel | null) => void) | undefined;
}

export class ImageViewportModel extends TComponentModel<ImageViewportState, ImageViewportModelProps> {
    containerRef: HTMLDivElement | null = null;
    imageRef: HTMLImageElement | null = null;

    setContainerRef = (ref: HTMLDivElement | null) => {
        this.containerRef = ref;
    };

    setImageRef = (ref: HTMLImageElement | null) => {
        this.imageRef = ref;
    };

    get zoomPercent(): number {
        return Math.round(this.state.get().scale * 100);
    }

    getImageStyle(): { transform: string; transition: string } {
        const { scale, translateX, translateY, isDragging } = this.state.get();

        // Always allow translation - helps when fit calculation isn't accurate (e.g., SVGs with viewBox)
        return {
            transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
            transition: isDragging ? "none" : "transform 0.1s ease-out",
        };
    }

    // Check if container is visible (not display: none)
    isContainerVisible = (): boolean => {
        if (!this.containerRef) return false;
        const rect = this.containerRef.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };

    // Calculate fit-to-viewport scale
    calculateFitScale = (): number => {
        if (!this.containerRef || !this.imageRef || !this.imageRef.naturalWidth) {
            return 1;
        }

        const containerRect = this.containerRef.getBoundingClientRect();
        // If container is hidden (display: none), return current fitScale to avoid invalid calculation
        if (containerRect.width === 0 || containerRect.height === 0) {
            return this.state.get().fitScale;
        }

        const scaleX = containerRect.width / this.imageRef.naturalWidth;
        const scaleY = containerRect.height / this.imageRef.naturalHeight;
        return Math.min(scaleX, scaleY, 1); // Don't scale up beyond 100%
    };

    // Reset to fit-to-viewport
    resetView = () => {
        const newFitScale = this.calculateFitScale();
        this.state.update((s) => {
            s.fitScale = newFitScale;
            s.scale = newFitScale;
            s.translateX = 0;
            s.translateY = 0;
        });
    };

    // Handle image load
    handleImageLoad = () => {
        const image = this.imageRef;
        if (image) {
            this.state.update((s) => {
                s.imageWidth = image.naturalWidth;
                s.imageHeight = image.naturalHeight;
            });
            this.resetView();
        }
    };

    // Zoom toward a specific point
    zoomAtPoint = (newScale: number, clientX: number, clientY: number) => {
        if (!this.containerRef) return;

        const { scale, translateX, translateY, fitScale } = this.state.get();
        const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
        const rect = this.containerRef.getBoundingClientRect();

        // Point in container coordinates (relative to container center)
        const containerCenterX = rect.width / 2;
        const containerCenterY = rect.height / 2;
        const pointX = clientX - rect.left - containerCenterX;
        const pointY = clientY - rect.top - containerCenterY;

        // Current point in image space (accounting for current translate and scale)
        // With transformOrigin: center, the image center is at container center + translate
        const imagePointX = (pointX - translateX) / scale;
        const imagePointY = (pointY - translateY) / scale;

        // After zoom, we want the same image point to be under the cursor
        // newPointX = imagePointX * clampedScale + newTranslateX
        // We want newPointX = pointX, so:
        const newTranslateX = pointX - imagePointX * clampedScale;
        const newTranslateY = pointY - imagePointY * clampedScale;

        // If zooming to fit or smaller, reset translation
        if (clampedScale <= fitScale) {
            this.state.update((s) => {
                s.scale = clampedScale;
                s.translateX = 0;
                s.translateY = 0;
            });
        } else {
            this.state.update((s) => {
                s.scale = clampedScale;
                s.translateX = newTranslateX;
                s.translateY = newTranslateY;
            });
        }
    };

    // Mouse wheel zoom (called from native event listener, not React)
    handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        const { scale } = this.state.get();
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        const newScale = scale * (1 + delta);
        this.zoomAtPoint(newScale, e.clientX, e.clientY);
    };

    // Mouse drag for panning
    handleMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return; // Only left click

        const { translateX, translateY } = this.state.get();
        this.state.update((s) => {
            s.isDragging = true;
            s.dragStartX = e.clientX - translateX;
            s.dragStartY = e.clientY - translateY;
        });
    };

    handleMouseMove = (e: MouseEvent) => {
        const { isDragging, dragStartX, dragStartY } = this.state.get();
        if (!isDragging) return;

        this.state.update((s) => {
            s.translateX = e.clientX - dragStartX;
            s.translateY = e.clientY - dragStartY;
        });
    };

    handleMouseUp = () => {
        this.state.update((s) => {
            s.isDragging = false;
        });
    };

    // Double-click to reset
    handleDoubleClick = () => {
        this.resetView();
    };

    // Copy image to clipboard as PNG
    copyToClipboard = async () => {
        const image = this.imageRef;
        if (!image) return;
        const blob = await imageElementToPngBlob(image);
        await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
        ]);
    };

    // Keyboard shortcuts
    handleKeyDown = (e: KeyboardEvent) => {
        if (!this.containerRef) return;

        const { scale } = this.state.get();
        const rect = this.containerRef.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        switch (e.key) {
            case "+":
            case "=":
                e.preventDefault();
                this.zoomAtPoint(scale * 1.2, centerX, centerY);
                break;
            case "-":
            case "_":
                e.preventDefault();
                this.zoomAtPoint(scale / 1.2, centerX, centerY);
                break;
            case "0":
                e.preventDefault();
                this.resetView();
                break;
            case "c":
                if (e.ctrlKey) {
                    e.preventDefault();
                    this.copyToClipboard();
                }
                break;
        }
    };

    // Handle window resize
    handleResize = () => {
        // Skip if container is not visible (e.g., tab is hidden)
        if (!this.isContainerVisible()) return;

        const { scale, fitScale } = this.state.get();
        if (scale === fitScale) {
            // If at fit scale, recalculate and stay at fit
            this.resetView();
        } else {
            // Just update fitScale reference
            this.state.update((s) => {
                s.fitScale = this.calculateFitScale();
            });
        }
    };

    // Lifecycle
    init() {
        window.addEventListener("resize", this.handleResize);
        // Add wheel listener with passive: false to allow preventDefault
        this.containerRef?.addEventListener("wheel", this.handleWheel, { passive: false });

        this.props.onModel?.(this);
    }

    dispose() {
        window.removeEventListener("resize", this.handleResize);
        this.containerRef?.removeEventListener("wheel", this.handleWheel);
        this.props.onModel?.(null);
    }
}

export interface ImageViewportProps {
    src: string;
    alt?: string;
    onModel?: (model: ImageViewportModel | null) => void;
}

/** React compatibility face for the framework-free image viewport view. */
export function ImageViewport(props: ImageViewportProps): React.ReactElement {
    return mountVanilla(ImageViewportView, props);
}
