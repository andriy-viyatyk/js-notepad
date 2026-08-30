import { createComponentModelDriver } from "../../core/state/model";
import { VanillaView } from "../shared/vanilla-view";
import { imageElementToPngBlob } from "./image-raster";
import {
    defaultImageViewportState,
    type ImageViewportContainerBounds,
    ImageViewportModel,
    type ImageViewportImageDimensions,
    type ImageViewportState,
} from "./ImageViewportModel";
import "./ImageViewport.css";

export interface ImageViewportProps {
    src: string;
    alt?: string;
}

export class ImageViewportView extends VanillaView<ImageViewportProps> {
    private readonly driver;
    private image: HTMLImageElement | undefined;
    private zoomIndicator: HTMLDivElement | undefined;
    private sourceTimer: ReturnType<typeof setTimeout> | undefined;
    private currentSrc: string;
    private live = true;
    private visibilityReconcilePending = false;

    public constructor(props: ImageViewportProps) {
        super(props);
        this.driver = createComponentModelDriver(
            { src: props.src },
            ImageViewportModel,
            defaultImageViewportState,
        );
        this.own(() => this.driver.dispose());
        this.currentSrc = props.src;
    }

    public get model(): ImageViewportModel {
        return this.driver.model;
    }

    protected onMount(): void {
        this.image = document.createElement("img");
        this.zoomIndicator = document.createElement("div");
        this.zoomIndicator.dataset.part = "zoom-indicator";
        this.zoomIndicator.title = "Reset Zoom";
        this.root.dataset.type = "image-view";
        this.root.tabIndex = 0;
        this.image.draggable = false;
        this.image.alt = this.props.alt ?? "Image";
        this.image.src = this.props.src;
        this.root.append(this.image, this.zoomIndicator);

        this.listen(this.root, "mousedown", this.onMouseDown);
        this.listen(this.root, "mousemove", this.onMouseMove);
        this.listen(this.root, "mouseup", this.onMouseUp);
        this.listen(this.root, "mouseleave", this.onMouseUp);
        this.listen(this.root, "dblclick", this.onDoubleClick);
        this.listen(this.root, "keydown", this.onKeyDown);
        this.listen(this.image, "load", this.onImageLoad);
        this.listen(this.zoomIndicator, "click", this.onResetView);
        this.listen(window, "resize", this.onResize);
        // Add wheel listener with passive: false to allow preventDefault
        this.listen(this.root, "wheel", this.onWheel, { passive: false });

        this.driver.mount();
        this.scheduleSourceCheck(this.props.src);
        this.bind(this.driver.model.state, (state) => state, (state) => {
            this.applyState(state);
            this.queueVisibilityReconcile();
        });
    }

    protected onUpdate(props: ImageViewportProps): void {
        const previousSrc = this.currentSrc;
        this.driver.update({ src: props.src });
        this.image?.setAttribute("alt", props.alt ?? "Image");

        if (previousSrc !== props.src) {
            this.currentSrc = props.src;
            if (this.image) this.image.src = props.src;
            this.scheduleSourceCheck(props.src);
        }
    }

    protected onDispose(): void {
        this.live = false;
        if (this.sourceTimer !== undefined) {
            clearTimeout(this.sourceTimer);
            this.sourceTimer = undefined;
        }
        this.image = undefined;
        this.zoomIndicator = undefined;
    }

    private scheduleSourceCheck(src: string): void {
        if (this.sourceTimer !== undefined) {
            clearTimeout(this.sourceTimer);
        }
        this.sourceTimer = setTimeout(() => {
            this.sourceTimer = undefined;
            if (this.live && this.props.src === src && this.image?.complete) {
                this.onImageLoad();
            }
        }, 50);
    }

    private readonly onImageLoad = (): void => {
        const imageDimensions = this.getImageDimensions();
        const containerBounds = imageDimensions.width
            ? this.getContainerBounds()
            : undefined;
        this.driver.model.handleImageLoad(imageDimensions, containerBounds);
    };

    private readonly onWheel = (event: WheelEvent): void => {
        event.preventDefault();
        this.driver.model.zoomAtWheel(
            event.deltaY,
            event.clientX,
            event.clientY,
            this.getContainerBounds(),
        );
    };

    private readonly onMouseDown = (event: MouseEvent): void => {
        if (event.button !== 0) return;
        this.driver.model.startDrag(event.clientX, event.clientY);
    };

    private readonly onMouseMove = (event: MouseEvent): void => {
        this.driver.model.moveDrag(event.clientX, event.clientY);
    };

    private readonly onMouseUp = (): void => {
        this.driver.model.endDrag();
    };

    private readonly onDoubleClick = (): void => {
        this.resetView();
    };

    private readonly onResetView = (): void => {
        this.resetView();
    };

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        const { scale } = this.driver.model.state.get();
        const centerBounds = this.getContainerBounds();
        const centerX = centerBounds.left + centerBounds.width / 2;
        const centerY = centerBounds.top + centerBounds.height / 2;

        switch (event.key) {
            case "+":
            case "=":
                event.preventDefault();
                this.driver.model.zoomAtPoint(
                    scale * 1.2,
                    centerX,
                    centerY,
                    this.getContainerBounds(),
                );
                break;
            case "-":
            case "_":
                event.preventDefault();
                this.driver.model.zoomAtPoint(
                    scale / 1.2,
                    centerX,
                    centerY,
                    this.getContainerBounds(),
                );
                break;
            case "0":
                event.preventDefault();
                this.resetView();
                break;
            case "c":
                if (event.ctrlKey) {
                    event.preventDefault();
                    void this.copyToClipboard();
                }
                break;
        }
    };

    private readonly onResize = (): void => {
        const visibilityBounds = this.getContainerBounds();
        if (!this.driver.model.isContainerVisible(visibilityBounds)) return;
        const imageDimensions = this.getImageDimensions();
        const calculationBounds = imageDimensions.width ? this.getContainerBounds() : undefined;
        this.driver.model.handleResize(
            visibilityBounds,
            calculationBounds,
            imageDimensions,
        );
    };

    public copyToClipboard = async (): Promise<void> => {
        const image = this.image;
        if (!image) return;
        const blob = await imageElementToPngBlob(image);
        await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
        ]);
    };

    private resetView(): void {
        const imageDimensions = this.getImageDimensions();
        this.driver.model.resetView(
            imageDimensions.width ? this.getContainerBounds() : undefined,
            imageDimensions,
        );
    }

    private getContainerBounds(): ImageViewportContainerBounds {
        const rect = this.root.getBoundingClientRect();
        return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
        };
    }

    private getImageDimensions(): ImageViewportImageDimensions {
        return {
            width: this.image?.naturalWidth ?? 0,
            height: this.image?.naturalHeight ?? 0,
        };
    }

    private applyState(state: ImageViewportState): void {
        if (state.isDragging) {
            this.root.dataset.dragging = "";
        } else {
            delete this.root.dataset.dragging;
        }
        const imageStyle = this.driver.model.getImageStyle();
        if (this.image) {
            this.image.style.transform = imageStyle.transform;
            this.image.style.transition = imageStyle.transition;
        }
        if (this.zoomIndicator) {
            this.zoomIndicator.textContent = `${this.driver.model.zoomPercent}%`;
        }
    }

    private queueVisibilityReconcile(): void {
        if (this.visibilityReconcilePending || !this.live) return;
        this.visibilityReconcilePending = true;
        queueMicrotask(() => {
            this.visibilityReconcilePending = false;
            if (!this.live) return;
            const model = this.driver.model;
            const state = model.state.get();
            if (
                state.scale === state.fitScale &&
                model.isContainerVisible(this.getContainerBounds())
            ) {
                const imageDimensions = this.getImageDimensions();
                const currentFitScale = model.calculateFitScale(
                    imageDimensions.width ? this.getContainerBounds() : undefined,
                    imageDimensions,
                );
                if (Math.abs(currentFitScale - state.fitScale) > 0.001) {
                    model.resetView(
                        imageDimensions.width ? this.getContainerBounds() : undefined,
                        imageDimensions,
                    );
                }
            }
        });
    }
}
