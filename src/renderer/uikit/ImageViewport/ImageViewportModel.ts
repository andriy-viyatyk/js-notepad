import { TComponentModel } from "../../core/state/model";

// ============================================================================
// Constants
// ============================================================================

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const ZOOM_STEP = 0.1;

export interface ImageViewportContainerBounds {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface ImageViewportImageDimensions {
    width: number;
    height: number;
}

// ============================================================================
// ImageViewportModel - manages zoom/pan state (decoupled from page model)
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
}

export class ImageViewportModel extends TComponentModel<ImageViewportState, ImageViewportModelProps> {
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

    isContainerVisible = (containerBounds: ImageViewportContainerBounds): boolean =>
        containerBounds.width > 0 && containerBounds.height > 0;

    calculateFitScale = (
        containerBounds: ImageViewportContainerBounds | undefined,
        imageDimensions: ImageViewportImageDimensions,
    ): number => {
        if (!imageDimensions.width) return 1;
        // If container is hidden (display: none), return current fitScale to avoid invalid calculation
        if (!containerBounds || containerBounds.width === 0 || containerBounds.height === 0) {
            return this.state.get().fitScale;
        }

        const scaleX = containerBounds.width / imageDimensions.width;
        const scaleY = containerBounds.height / imageDimensions.height;
        return Math.min(scaleX, scaleY, 1); // Don't scale up beyond 100%
    };

    resetView = (
        containerBounds: ImageViewportContainerBounds | undefined,
        imageDimensions: ImageViewportImageDimensions,
    ): void => {
        const newFitScale = this.calculateFitScale(containerBounds, imageDimensions);
        this.state.update((s) => {
            s.fitScale = newFitScale;
            s.scale = newFitScale;
            s.translateX = 0;
            s.translateY = 0;
        });
    };

    handleImageLoad = (
        imageDimensions: ImageViewportImageDimensions,
        containerBounds: ImageViewportContainerBounds | undefined,
    ): void => {
        this.state.update((s) => {
            s.imageWidth = imageDimensions.width;
            s.imageHeight = imageDimensions.height;
        });
        this.resetView(containerBounds, imageDimensions);
    };

    zoomAtPoint = (
        newScale: number,
        clientX: number,
        clientY: number,
        containerBounds: ImageViewportContainerBounds,
    ): void => {
        const { scale, translateX, translateY, fitScale } = this.state.get();
        const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

        // Point in container coordinates (relative to container center)
        const containerCenterX = containerBounds.width / 2;
        const containerCenterY = containerBounds.height / 2;
        const pointX = clientX - containerBounds.left - containerCenterX;
        const pointY = clientY - containerBounds.top - containerCenterY;

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

    zoomAtWheel = (
        deltaY: number,
        clientX: number,
        clientY: number,
        containerBounds: ImageViewportContainerBounds,
    ): void => {
        const { scale } = this.state.get();
        const delta = deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        this.zoomAtPoint(scale * (1 + delta), clientX, clientY, containerBounds);
    };

    startDrag = (clientX: number, clientY: number): void => {
        const { translateX, translateY } = this.state.get();
        this.state.update((s) => {
            s.isDragging = true;
            s.dragStartX = clientX - translateX;
            s.dragStartY = clientY - translateY;
        });
    };

    moveDrag = (clientX: number, clientY: number): void => {
        const { isDragging, dragStartX, dragStartY } = this.state.get();
        if (!isDragging) return;

        this.state.update((s) => {
            s.translateX = clientX - dragStartX;
            s.translateY = clientY - dragStartY;
        });
    };

    endDrag = (): void => {
        this.state.update((s) => {
            s.isDragging = false;
        });
    };

    handleResize = (
        visibilityBounds: ImageViewportContainerBounds,
        calculationBounds: ImageViewportContainerBounds | undefined,
        imageDimensions: ImageViewportImageDimensions,
    ): void => {
        // Skip if container is not visible (e.g., tab is hidden)
        if (!this.isContainerVisible(visibilityBounds)) return;

        const { scale, fitScale } = this.state.get();
        if (scale === fitScale) {
            // If at fit scale, recalculate and stay at fit
            this.resetView(calculationBounds, imageDimensions);
        } else {
            // Just update fitScale reference
            this.state.update((s) => {
                s.fitScale = this.calculateFitScale(calculationBounds, imageDimensions);
            });
        }
    };
}
