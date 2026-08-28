import { createComponentModelDriver } from "../../core/state/model";
import {
    applyRestProps,
    clearRestListeners,
    createRestPropsState,
} from "../shared/dom-props";
import { VanillaView } from "../shared/vanilla-view";
import { defaultMinimapState, MinimapModel, type MinimapState } from "./MinimapModel";
import type { MinimapProps } from "./Minimap";
import "./Minimap.css";

export class MinimapView extends VanillaView<MinimapProps> {
    private readonly driver;
    private readonly restState = createRestPropsState();
    private contentContainer: HTMLDivElement | undefined;
    private contentMirror: HTMLDivElement | undefined;
    private indicator: HTMLDivElement | undefined;

    constructor(props: MinimapProps) {
        super(props);
        this.driver = createComponentModelDriver(
            { scrollContainer: props.scrollContainer },
            MinimapModel,
            defaultMinimapState,
        );
        this.own(() => this.driver.dispose());

    }

    protected onMount(): void {
        this.contentContainer = document.createElement("div");
        this.contentContainer.dataset.part = "content-container";
        this.contentMirror = document.createElement("div");
        this.contentMirror.dataset.part = "content";
        this.contentContainer.append(this.contentMirror);

        this.indicator = document.createElement("div");
        this.indicator.dataset.part = "indicator";
        this.root.dataset.type = "minimap";
        if (this.props.name !== undefined) {
            this.root.dataset.name = this.props.name;
        }
        this.root.append(this.contentContainer, this.indicator);

        const model = this.driver.model;
        model.setWrapper(this.root);
        model.setContentContainer(this.contentContainer);
        model.setContentMirror(this.contentMirror);

        this.listen(this.root, "click", (event) => {
            const handler = this.props.onClick;
            if (handler) {
                handler(event);
            } else {
                model.handleBackgroundClick(event);
            }
        });
        this.listen(this.root, "mouseenter", (event) => {
            const handler = this.props.onMouseEnter;
            if (handler) {
                handler(event);
            } else {
                model.mouseEnter();
            }
        });
        this.listen(this.indicator, "pointerdown", model.handlePointerDown);
        this.listen(this.indicator, "pointermove", model.handlePointerMove);
        this.listen(this.indicator, "pointerup", model.handlePointerUp);

        applyRestProps(this.root, this.getRestProps(), this.restState);
        this.own(() => clearRestListeners(this.root, this.restState));

        // All three DOM refs must exist before init installs the model's observers and listeners.
        this.driver.mount();
        model.setScrollContainer(this.props.scrollContainer);
        this.bind(this.driver.model.state, (state) => state, (state) => {
            this.applyState(state);
        });
    }

    protected onUpdate(props: MinimapProps): void {
        const model = this.driver.model;
        const scrollContainerChanged = model.scrollContainer !== props.scrollContainer;
        this.driver.update({ scrollContainer: props.scrollContainer });
        if (props.name === undefined) {
            delete this.root.dataset.name;
        } else {
            this.root.dataset.name = props.name;
        }
        applyRestProps(this.root, this.getRestProps(props), this.restState);
        if (scrollContainerChanged) {
            model.setScrollContainer(props.scrollContainer);
        }
    }

    private getRestProps(props: MinimapProps = this.props): Record<string, unknown> {
        const {
            name: _name,
            scrollContainer: _scrollContainer,
            children: _children,
            onClick: _onClick,
            onMouseEnter: _onMouseEnter,
            ...rest
        } = props;
        return rest as Record<string, unknown>;
    }

    private applyState(state: MinimapState): void {
        const indicator = this.indicator;
        if (!indicator) return;
        if (state.isDragging) {
            indicator.dataset.dragging = "";
        } else {
            delete indicator.dataset.dragging;
        }
        indicator.style.top = `${state.indicatorTop}px`;
        indicator.style.height = `${state.indicatorHeight}px`;
    }
}
