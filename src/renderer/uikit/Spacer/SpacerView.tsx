import type { SpacerProps } from "./Spacer";
import { VanillaView } from "../shared/vanilla-view";
import "./Spacer.css";

export class SpacerView extends VanillaView<SpacerProps> {
    public constructor(props: SpacerProps) {
        super(props, document.createElement("span"));
    }

    protected onMount(): void {
        this.applyProps(this.props);
    }

    protected onUpdate(props: SpacerProps): void {
        this.applyProps(props);
    }

    private applyProps(props: SpacerProps): void {
        this.root.dataset.type = "spacer";
        if (props.name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = props.name;
        if (props.size === undefined) {
            delete this.root.dataset.sized;
            this.root.style.removeProperty("--spacer-size");
        } else {
            this.root.dataset.sized = "";
            this.root.style.setProperty("--spacer-size", typeof props.size === "number" ? `${props.size}px` : props.size);
        }
    }
}
