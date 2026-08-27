import { applyRestProps, clearRestListeners, createRestPropsState, type RestPropsState } from "../shared/react-compat";
import { fillSlot, type SlotContent } from "../shared/fill-slot";
import { createIconElement } from "../shared/slots";
import { VanillaView } from "../shared/vanilla-view";
import type { CheckboxProps } from "./Checkbox";

export class CheckboxView extends VanillaView<CheckboxProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private readonly iconHost: HTMLSpanElement;
    private readonly childrenHost: HTMLSpanElement;
    private childrenCleanup: (() => void) | undefined;
    private icon: SVGElement | undefined;

    public constructor(props: CheckboxProps) {
        super(props, document.createElement("label"));
        this.iconHost = document.createElement("span");
        this.iconHost.dataset.part = "icon";
        this.childrenHost = document.createElement("span");
        this.childrenHost.dataset.part = "children";
        this.childrenHost.style.display = "contents";
    }

    protected onMount(): void {
        this.root.append(this.iconHost, this.childrenHost);
        this.applyProps(this.props);
        this.updateIcon(this.props.checked);
        this.updateChildren(this.props.children);
        this.listen(this.root, "click", this.handleClick);
        this.own(() => this.clearContent());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: CheckboxProps): void {
        this.applyProps(props);
        this.updateIcon(props.checked);
        this.updateChildren(props.children);
    }

    protected onDispose(): void {
        this.clearContent();
        clearRestListeners(this.root, this.restPropsState);
    }

    private applyProps(props: CheckboxProps): void {
        const { name, checked, onChange: _onChange, disabled, children: _children, ...rest } = props;
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
        this.root.dataset.type = "checkbox";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        this.root.dataset.checked = String(checked);
        if (disabled) this.root.dataset.disabled = "";
        else delete this.root.dataset.disabled;
    }

    private updateIcon(checked: boolean): void {
        const next = createIconElement(checked ? "checked" : "unchecked");
        if (this.icon) this.iconHost.replaceChild(next, this.icon);
        else this.iconHost.append(next);
        this.icon = next;
    }

    private updateChildren(children: SlotContent): void {
        this.childrenCleanup = fillSlot(this.childrenHost, children);
    }

    private readonly handleClick = (event: MouseEvent): void => {
        // JSX spread was last in the React implementation, so a caller's
        // onClick replaced the default toggle handler. Keep that contract.
        if (typeof this.props.onClick === "function" || this.props.disabled) return;
        event.preventDefault();
        this.props.onChange(!this.props.checked);
    };

    private clearContent(): void {
        this.childrenCleanup?.();
        this.childrenCleanup = undefined;
        this.iconHost.replaceChildren();
        this.childrenHost.replaceChildren();
        this.icon = undefined;
    }
}
