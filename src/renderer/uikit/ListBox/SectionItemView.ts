import { applyRestProps, clearRestListeners, createRestPropsState } from "../shared/dom-props";
import type { RestPropsState } from "../shared/dom-props";
import { VanillaView } from "../shared/vanilla-view";
import type { SectionItemProps } from "./SectionItem";
import "./SectionItem.css";

/**
 * A non-interactive section header row. Pure DOM: its label is a `string`, so there is no slot, no
 * React root and no tooltip.
 */
export class SectionItemView extends VanillaView<SectionItemProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();

    public constructor(props: SectionItemProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        this.applyProps(this.props);
        this.applyConstructionRestProps(this.props);
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: SectionItemProps): void {
        this.applyProps(props);
    }

    private applyProps(props: SectionItemProps): void {
        const { name, id, label, ..._rest } = props;

        const root = this.root;
        root.dataset.type = "list-section";
        if (name === undefined) root.removeAttribute("data-name");
        else root.dataset.name = name;
        if (id === undefined) root.removeAttribute("id");
        else root.id = id;
        root.setAttribute("role", "presentation");
        root.textContent = label;

    }

    private applyConstructionRestProps(props: SectionItemProps): void {
        const { name: _name, id: _id, label: _label, ...rest } = props;
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
    }

}
