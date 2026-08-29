import { applyRestProps, clearRestListeners, createRestPropsState } from "../shared/dom-props";
import type { NativeHTMLAttributes, RestPropsState } from "../shared/dom-props";
import { fillSlot, type SlotContent } from "../shared/fill-slot";
import { createIconElement, createIconPlaceholderElement, isIconName } from "../shared/slots";
import { VanillaView } from "../shared/vanilla-view";
import type { IconRef } from "../shared/slots";
import "./Tag.css";

export interface TagProps
    extends Omit<
        NativeHTMLAttributes<HTMLSpanElement>,
        "style" | "className" | "onClick" | "children"
    > {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Tag label — rendered as the primary content. */
    label: string;
    /** Optional leading element (e.g. a colored dot). */
    icon?: IconRef;
    /** When provided, renders an X button after the label that calls this on click. */
    onRemove?: () => void;
    /** When provided, the tag becomes clickable; fires on body click. */
    onClick?: () => void;
    /** Toggle/selected state — visually filled with `background.selection`. */
    selected?: boolean;
    /** Disabled state — opacity 0.5, pointer-events none. */
    disabled?: boolean;
    /** Visual variant. Default: "filled". */
    variant?: "filled" | "outlined";
    /** Semantic color tone. Default: "default". */
    tone?: "default" | "error" | "warning" | "success";
    /** Size variant. Default: "md". */
    size?: "sm" | "md";
    /** Ellipsize the label when the tag is constrained by a flex parent. Sets
     *  `min-width: 0` so the tag can shrink below its content, and truncates the
     *  label span with an ellipsis. Default: false. */
    truncate?: boolean;
    /** Remove-button visibility. Default: "always". */
    removeAffordance?: "always" | "hover";
    /** Accessible label for the remove button. Default: "Remove tag". */
    removeAriaLabel?: string;
    children?: SlotContent;
}
export class TagView extends VanillaView<TagProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private iconHost: HTMLSpanElement | undefined;
    private iconCleanup: (() => void) | undefined;
    private labelElement: HTMLSpanElement | undefined;
    private childrenHost: HTMLSpanElement | undefined;
    private childrenCleanup: (() => void) | undefined;
    private removeButton: HTMLButtonElement | undefined;

    public constructor(props: TagProps) {
        super(props, document.createElement("span"));
    }

    protected onMount(): void {
        this.applyProps(this.props);
        this.updateContent(this.props);
        this.own(() => this.clearContent());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: TagProps): void {
        this.applyProps(props);
        this.updateContent(props);
    }

    protected onDispose(): void {
        this.clearContent();
        clearRestListeners(this.root, this.restPropsState);
    }

    private applyProps(props: TagProps): void {
        const {
            name, label: _label, icon: _icon, onRemove: _onRemove, onClick,
            selected, disabled, variant = "filled", tone = "default", size = "md",
            truncate, removeAffordance = "always", removeAriaLabel: _removeAriaLabel,
            children: _children, ...rest
        } = props;

        const onRootClick = onClick && !disabled
            ? () => onClick()
            : undefined;
        applyRestProps(this.root, { ...rest, onClick: onRootClick }, this.restPropsState);
        this.root.dataset.type = "tag";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        this.root.dataset.variant = variant;
        this.root.dataset.tone = tone;
        this.root.dataset.size = size;
        if (truncate) this.root.dataset.truncate = "";
        else delete this.root.dataset.truncate;
        if (disabled) this.root.dataset.disabled = "";
        else delete this.root.dataset.disabled;
        if (selected) this.root.dataset.selected = "";
        else delete this.root.dataset.selected;
        if (onRootClick) this.root.dataset.clickable = "";
        else delete this.root.dataset.clickable;
        if (props.onRemove) this.root.dataset.removable = "";
        else delete this.root.dataset.removable;
        if (props.onRemove) this.root.dataset.removeAffordance = removeAffordance;
        else delete this.root.dataset.removeAffordance;
    }

    private updateContent(props: TagProps): void {
        this.updateIcon(props.icon);

        if (props.label) {
            if (!this.labelElement) {
                this.labelElement = document.createElement("span");
                this.root.append(this.labelElement);
            }
            this.labelElement.textContent = props.label;
        } else if (this.labelElement) {
            this.labelElement.remove();
            this.labelElement = undefined;
        }

        if (props.children != null && props.children !== false) {
            if (!this.childrenHost) {
                this.childrenHost = document.createElement("span");
                this.childrenHost.dataset.part = "react-slot";
                this.childrenHost.style.display = "contents";
                this.root.append(this.childrenHost);
            }
            this.childrenCleanup = fillSlot(this.childrenHost, props.children);
        } else if (this.childrenHost) {
            this.childrenCleanup?.();
            this.childrenCleanup = undefined;
            this.childrenHost.remove();
            this.childrenHost = undefined;
        }

        if (props.onRemove) {
            if (!this.removeButton) {
                this.removeButton = document.createElement("button");
                this.removeButton.type = "button";
                this.removeButton.dataset.part = "remove";
                this.listen(this.removeButton, "click", this.onRemoveClick);
                this.removeButton.append(createIconElement("close"));
                this.root.append(this.removeButton);
            }
            this.removeButton.setAttribute("aria-label", props.removeAriaLabel ?? "Remove tag");
            this.removeButton.disabled = Boolean(props.disabled);
        } else if (this.removeButton) {
            this.removeButton.removeEventListener("click", this.onRemoveClick);
            this.removeButton.remove();
            this.removeButton = undefined;
        }
    }

    private updateIcon(icon: IconRef | undefined): void {
        if (icon == null) {
            this.iconCleanup?.();
            this.iconCleanup = undefined;
            this.iconHost?.remove();
            this.iconHost = undefined;
            return;
        }
        if (!this.iconHost) {
            this.iconHost = document.createElement("span");
            this.iconHost.dataset.part = "icon";
            this.iconHost.style.display = "contents";
            this.root.insertBefore(this.iconHost, this.root.firstChild);
        }
        if (typeof icon === "string") {
            this.iconCleanup = fillSlot(this.iconHost, isIconName(icon) ? createIconElement(icon) : createIconPlaceholderElement());
        } else {
            this.iconCleanup = fillSlot(this.iconHost, icon);
        }
    }

    private readonly onRemoveClick = (event: Event): void => {
        event.stopPropagation();
        if (!this.props.disabled) this.props.onRemove?.();
    };

    private clearContent(): void {
        this.iconCleanup?.();
        this.childrenCleanup?.();
        this.iconHost?.remove();
        this.labelElement?.remove();
        this.childrenHost?.remove();
        this.removeButton?.removeEventListener("click", this.onRemoveClick);
        this.removeButton?.remove();
        this.iconHost = undefined;
        this.labelElement = undefined;
        this.childrenHost = undefined;
        this.removeButton = undefined;
    }
}
