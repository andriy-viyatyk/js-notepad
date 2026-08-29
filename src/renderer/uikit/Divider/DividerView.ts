import { applyRestProps, clearRestListeners, createRestPropsState, type RestPropsState } from "../shared/dom-props";
import { VanillaView } from "../shared/vanilla-view";
import type { DividerProps } from "./Divider";
import "./Divider.css";

export class DividerView extends VanillaView<DividerProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();

    public constructor(props: DividerProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        this.applyProps(this.props);
        this.applyConstructionRestProps(this.props);
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: DividerProps): void {
        this.applyProps(props);
    }

    protected onDispose(): void {
        clearRestListeners(this.root, this.restPropsState);
    }

    private applyProps(props: DividerProps): void {
        const { name, orientation = "horizontal", ..._rest } = props;
        this.root.dataset.type = "divider";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        this.root.dataset.orientation = orientation;
        this.root.setAttribute("role", "separator");
        this.root.setAttribute("aria-orientation", orientation);
    }

    private applyConstructionRestProps(props: DividerProps): void {
        const { name: _name, orientation: _orientation, ...rest } = props;
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
    }
}
