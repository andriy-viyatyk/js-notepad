import styled from "@emotion/styled";
import { forwardRef, useEffect, useImperativeHandle } from "react";
import { TComponentModel, useComponentModel } from "../../core/state/model";
import color from "../../theme/color";

// ============================================================================
// Styled Components
// ============================================================================

export const BaseImageViewRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#1e1e1e",
    outline: "none",
    "& img": {
        transformOrigin: "center center",
        userSelect: "none",
        maxWidth: "none", // Allow scaling beyond container
        maxHeight: "none",
    },
    "& .zoom-indicator": {
        position: "absolute",
        bottom: 12,
        right: 12,
        padding: "4px 8px",
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        color: color.text.default,
        borderRadius: 4,
        fontSize: 12,
        fontFamily: "monospace",
        cursor: "pointer",
        "&:hover": {
            backgroundColor: "rgba(0, 0, 0, 0.8)",
        },
    },
    "&.dragging": {
        cursor: "grabbing",
    },
    "&.can-drag": {
        cursor: "grab",
    },
});

// ============================================================================
// Constants
// ============================================================================

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const ZOOM_STEP = 0.1;

// ============================================================================
// ImageViewModel - manages zoom/pan state (decoupled from page model)
// ============================================================================

export const defaultImageViewState = {
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

export type ImageViewState = typeof defaultImageViewState;

// Props are empty - view model doesn't need external props
interface ImageViewModelProps {}

export class ImageViewModel extends TComponentModel<ImageViewState, ImageViewModelProps> {
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

    getImageStyle(): React.CSSProperties {
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
    handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only left click

        const { translateX, translateY } = this.state.get();
        this.state.update((s) => {
            s.isDragging = true;
            s.dragStartX = e.clientX - translateX;
            s.dragStartY = e.clientY - translateY;
        });
    };

    handleMouseMove = (e: React.MouseEvent) => {
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

        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(image, 0, 0);

        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/png")
        );
        if (!blob) return;

        await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
        ]);
    };

    // Keyboard shortcuts
    handleKeyDown = (e: React.KeyboardEvent) => {
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
    init = () => {
        window.addEventListener("resize", this.handleResize);
        // Add wheel listener with passive: false to allow preventDefault
        this.containerRef?.addEventListener("wheel", this.handleWheel, { passive: false });
    };

    dispose = () => {
        window.removeEventListener("resize", this.handleResize);
        this.containerRef?.removeEventListener("wheel", this.handleWheel);
    };
}

// ============================================================================
// BaseImageView Component - reusable image viewer with zoom/pan
// ============================================================================

export interface BaseImageViewRef {
    copyToClipboard: () => Promise<void>;
}

export interface BaseImageViewProps {
    src: string;
    alt?: string;
}

export const BaseImageView = forwardRef<BaseImageViewRef, BaseImageViewProps>(function BaseImageView({ src, alt = "Image" }, ref) {
    const viewModel = useComponentModel({}, ImageViewModel, defaultImageViewState);
    // Subscribe to full state - all properties affect rendering
    const state = viewModel.state.use();

    useImperativeHandle(ref, () => ({
        copyToClipboard: viewModel.copyToClipboard,
    }), [viewModel]);

    // Initialize and cleanup
    useEffect(() => {
        viewModel.init();
        return () => viewModel.dispose();
    }, []);

    // Recalculate fit scale when tab becomes visible again (after being hidden during resize)
    useEffect(() => {
        if (state.scale === state.fitScale && viewModel.isContainerVisible()) {
            const currentFitScale = viewModel.calculateFitScale();
            if (Math.abs(currentFitScale - state.fitScale) > 0.001) {
                viewModel.resetView();
            }
        }
    });

    // Reset view when src changes (e.g., SVG content updated)
    useEffect(() => {
        // Small delay to let image load with new src
        const timeoutId = setTimeout(() => {
            if (viewModel.imageRef?.complete) {
                viewModel.handleImageLoad();
            }
        }, 50);
        return () => clearTimeout(timeoutId);
    }, [src]);

    const imageStyle = viewModel.getImageStyle();
    const zoomPercent = viewModel.zoomPercent;

    return (
        <BaseImageViewRoot
            ref={viewModel.setContainerRef}
            className={`${state.isDragging ? "dragging" : ""} can-drag`}
            onMouseDown={viewModel.handleMouseDown}
            onMouseMove={viewModel.handleMouseMove}
            onMouseUp={viewModel.handleMouseUp}
            onMouseLeave={viewModel.handleMouseUp}
            onDoubleClick={viewModel.handleDoubleClick}
            onKeyDown={viewModel.handleKeyDown}
            tabIndex={0}
        >
            <img
                ref={viewModel.setImageRef}
                src={src}
                alt={alt}
                draggable={false}
                onLoad={viewModel.handleImageLoad}
                style={imageStyle}
            />
            <div
                className="zoom-indicator"
                onClick={viewModel.resetView}
                title="Reset Zoom"
            >
                {zoomPercent}%
            </div>
        </BaseImageViewRoot>
    );
});
