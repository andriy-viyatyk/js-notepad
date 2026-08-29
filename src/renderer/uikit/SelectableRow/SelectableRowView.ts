import { applyRestProps, clearRestListeners, createRestPropsState } from "../shared/dom-props";
import type { NativeHTMLAttributes, RestPropsState } from "../shared/dom-props";
import { fillSlot, type SlotContent } from "../shared/fill-slot";
import { VanillaView } from "../shared/vanilla-view";
import "./SelectableRow.css";

export interface SelectableRowProps
    extends Omit<NativeHTMLAttributes<HTMLDivElement>, "style" | "className" | "children"> {
    /** Optional debug label emitted as `data-name` on the root element. Never used for styling. */
    name?: string;
    /** True when this row is the current selection. */
    selected?: boolean;
    /** True when this row is the keyboard-active / highlighted row. */
    active?: boolean;
    children: SlotContent;
}

export class SelectableRowView extends VanillaView<SelectableRowProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private contentCleanup: (() => void) | undefined;

    public constructor(props: SelectableRowProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        this.applyProps(this.props);
        this.applyConstructionRestProps(this.props);
        this.updateContent(this.props.children);
        this.own(() => this.clearContent());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: SelectableRowProps): void {
        this.applyProps(props);
        this.updateContent(props.children);
    }

    protected onDispose(): void {
        this.clearContent();
        clearRestListeners(this.root, this.restPropsState);
    }

    private applyProps(props: SelectableRowProps): void {
        const { name, selected, active, children: _children, ..._rest } = props;
        this.root.dataset.type = "selectable-row";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        if (selected) this.root.dataset.selected = "";
        else delete this.root.dataset.selected;
        if (active) this.root.dataset.active = "";
        else delete this.root.dataset.active;
    }

    private applyConstructionRestProps(props: SelectableRowProps): void {
        const { name: _name, selected: _selected, active: _active, children: _children, ...rest } = props;
        // Residual props historically came after the owned JSX attributes.
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
    }

    private updateContent(children: SlotContent): void {
        this.contentCleanup = fillSlot(this.root, children);
    }

    private clearContent(): void {
        this.contentCleanup?.();
        this.contentCleanup = undefined;
    }
}
