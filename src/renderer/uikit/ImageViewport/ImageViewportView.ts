import { createComponentModelDriver } from "../../core/state/model";
import { VanillaView } from "../shared/vanilla-view";
import {
    defaultImageViewportState,
    ImageViewportModel,
    type ImageViewportProps,
    type ImageViewportState,
} from "./ImageViewport";
import "./ImageViewport.css";

export class ImageViewportView extends VanillaView<ImageViewportProps> {
    private readonly driver;
    private image: HTMLImageElement | undefined;
    private zoomIndicator: HTMLDivElement | undefined;
    private sourceTimer: ReturnType<typeof setTimeout> | undefined;
    private currentSrc: string;
    private live = true;
    private visibilityReconcilePending = false;

    constructor(props: ImageViewportProps) {
        super(props);
        this.driver = createComponentModelDriver(
            { src: props.src, onModel: props.onModel },
            ImageViewportModel,
            defaultImageViewportState,
        );
        this.own(() => this.driver.dispose());
        this.currentSrc = props.src;
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

        const model = this.driver.model;
        // These refs must be assigned before init() installs the wheel and resize behavior.
        model.setContainerRef(this.root as HTMLDivElement);
        model.setImageRef(this.image);

        this.listen(this.root, "mousedown", model.handleMouseDown);
        this.listen(this.root, "mousemove", model.handleMouseMove);
        this.listen(this.root, "mouseup", model.handleMouseUp);
        this.listen(this.root, "mouseleave", model.handleMouseUp);
        this.listen(this.root, "dblclick", model.handleDoubleClick);
        this.listen(this.root, "keydown", model.handleKeyDown);
        this.listen(this.image, "load", model.handleImageLoad);
        this.listen(this.zoomIndicator, "click", model.resetView);

        this.driver.mount();
        this.scheduleSourceCheck(this.props.src);
        this.bind(this.driver.model.state, (state) => state, (state) => {
            this.applyState(state);
            this.queueVisibilityReconcile();
        });
    }

    protected onUpdate(props: ImageViewportProps): void {
        const previousSrc = this.currentSrc;
        this.driver.update({ src: props.src, onModel: props.onModel });
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
    }

    private scheduleSourceCheck(src: string): void {
        if (this.sourceTimer !== undefined) {
            clearTimeout(this.sourceTimer);
        }
        this.sourceTimer = setTimeout(() => {
            this.sourceTimer = undefined;
            if (this.live && this.props.src === src && this.image?.complete) {
                this.driver.model.handleImageLoad();
            }
        }, 50);
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
                model.isContainerVisible()
            ) {
                const currentFitScale = model.calculateFitScale();
                if (Math.abs(currentFitScale - state.fitScale) > 0.001) {
                    model.resetView();
                }
            }
        });
    }
}
