import { applyRestProps, clearRestListeners, createRestPropsState, setRestProp } from "../shared/dom-props";
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
    private rootClickEnabled = false;

    public constructor(props: TagProps) {
        super(props, document.createElement("span"));
    }

    protected onMount(): void {
        this.applyConstructionRestProps(this.props);
        this.applyProps(this.props);
        this.createRemoveButton();
        this.updateContent(this.props);
        this.own(() => this.clearContent());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: TagProps): void {
        this.applyProps(props);
        this.updateTargetedRestProps(props);
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
            children: _children, ..._rest
        } = props;

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
        if (onClick && !disabled) this.root.dataset.clickable = "";
        else delete this.root.dataset.clickable;
        if (props.onRemove) this.root.dataset.removable = "";
        else delete this.root.dataset.removable;
        if (props.onRemove) this.root.dataset.removeAffordance = removeAffordance;
        else delete this.root.dataset.removeAffordance;
    }

    private applyConstructionRestProps(props: TagProps): void {
        const {
            name: _name,
            label: _label,
            icon: _icon,
            onRemove: _onRemove,
            onClick,
            selected: _selected,
            disabled,
            variant: _variant,
            tone: _tone,
            size: _size,
            truncate: _truncate,
            removeAffordance: _removeAffordance,
            removeAriaLabel: _removeAriaLabel,
            children: _children,
            ...rest
        } = props;
        this.rootClickEnabled = Boolean(onClick && !disabled);
        applyRestProps(this.root, { ...rest, onClick: this.rootClickEnabled ? this.onRootClick : undefined }, this.restPropsState);
    }

    private updateTargetedRestProps(props: TagProps): void {
        const rootClickEnabled = Boolean(props.onClick && !props.disabled);
        if (rootClickEnabled !== this.rootClickEnabled) {
            this.rootClickEnabled = rootClickEnabled;
            setRestProp(
                this.root,
                "onClick",
                rootClickEnabled ? this.onRootClick : undefined,
                this.restPropsState,
            );
        }
        setRestProp(this.root, "title", props.title, this.restPropsState);
    }

    private updateContent(props: TagProps): void {
        this.updateIcon(props.icon);

        if (props.label) {
            if (!this.labelElement) {
                this.labelElement = document.createElement("span");
                this.root.insertBefore(this.labelElement, this.removeButton ?? null);
            }
            this.labelElement.textContent = props.label;
        } else if (this.labelElement) {
            this.labelElement.remove();
            this.labelElement = undefined;
        }

        if (props.children != null && props.children !== false) {
            if (!this.childrenHost) {
                this.childrenHost = document.createElement("span");
                this.childrenHost.dataset.part = "children-slot";
                this.childrenHost.style.display = "contents";
                this.root.insertBefore(this.childrenHost, this.removeButton ?? null);
            }
            this.childrenCleanup = fillSlot(this.childrenHost, props.children);
        } else if (this.childrenHost) {
            this.childrenCleanup?.();
            this.childrenCleanup = undefined;
            this.childrenHost.remove();
            this.childrenHost = undefined;
        }

        const removeButton = this.removeButton;
        if (!removeButton) return;
        removeButton.hidden = !props.onRemove;
        removeButton.tabIndex = props.onRemove ? 0 : -1;
        removeButton.setAttribute("aria-label", props.removeAriaLabel ?? "Remove tag");
        removeButton.disabled = Boolean(props.disabled || !props.onRemove);
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

    private createRemoveButton(): void {
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.dataset.part = "remove";
        removeButton.append(createIconElement("close"));
        this.listen(removeButton, "click", this.onRemoveClick);
        this.root.append(removeButton);
        this.removeButton = removeButton;
    }

    private readonly onRootClick = (): void => {
        if (!this.props.disabled) this.props.onClick?.();
    };

    private clearContent(): void {
        this.iconCleanup?.();
        this.childrenCleanup?.();
        this.iconHost?.remove();
        this.labelElement?.remove();
        this.childrenHost?.remove();
        this.removeButton?.remove();
        this.iconHost = undefined;
        this.labelElement = undefined;
        this.childrenHost = undefined;
        this.removeButton = undefined;
    }
}
