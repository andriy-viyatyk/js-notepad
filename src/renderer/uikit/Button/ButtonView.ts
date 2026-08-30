import { applyRestProps, clearRestListeners, createRestPropsState, setRestProp } from "../shared/dom-props";
import type { NativeButtonHTMLAttributes, RestPropsState } from "../shared/dom-props";
import { attachTooltip, type TooltipAttachment } from "../Tooltip/attach-tooltip";
import { createIconElement, createIconPlaceholderElement, isIconName } from "../shared/slots";
import { fillSlot } from "../shared/fill-slot";
import { VanillaView } from "../shared/vanilla-view";
import type { IconRef } from "../shared/slots";
import type { SlotContent } from "../shared/fill-slot";

export interface ButtonProps extends Omit<NativeButtonHTMLAttributes<HTMLButtonElement>, "title" | "onKeyDown" | "children"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    title?: string;
    onKeyDown?: (event: KeyboardEvent) => void;
    variant?: "default" | "primary" | "ghost" | "danger" | "link";
    size?: "sm" | "md";
    icon?: IconRef;
    background?: "default" | "light" | "dark";
    block?: boolean;
    hideUntilParentHover?: boolean;
    children?: SlotContent;
}

export type ButtonViewProps = ButtonProps;

function isSimpleChildren(value: SlotContent): boolean {
    if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return true;
    }
    return Array.isArray(value) && value.every(isSimpleChildren);
}

function appendSimpleChildren(parent: ParentNode, value: SlotContent): void {
    if (value == null || typeof value === "boolean") return;
    if (value instanceof Node) {
        parent.append(value);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((child) => appendSimpleChildren(parent, child));
        return;
    }
    parent.append(document.createTextNode(String(value)));
}

export class ButtonView extends VanillaView<ButtonViewProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private contentCleanup: (() => void) | undefined;
    private iconHost: HTMLSpanElement | undefined;
    private iconCleanup: (() => void) | undefined;
    private childrenHost: HTMLSpanElement | undefined;
    private childrenCleanup: (() => void) | undefined;
    private tooltip: TooltipAttachment | undefined;

    public constructor(props: ButtonViewProps) {
        super(props, document.createElement("button"));
    }

    protected onMount(): void {
        this.applyConstructionRestProps(this.props);
        this.applyProps(this.props);
        this.updateContent(this.props.icon, this.props.children);
        this.listen(this.root, "keydown", this.handleKeyDown);
        this.tooltip = attachTooltip(this.root, {
            content: this.props.title ?? null,
        });
        this.own(() => this.tooltip?.dispose());
        this.own(() => this.clearContent());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: ButtonViewProps): void {
        this.applyProps(props);
        this.updateTargetedRestProps(props);
        this.updateContent(props.icon, props.children);
        this.tooltip?.update({ content: props.title ?? null });
    }

    private applyProps(props: ButtonViewProps): void {
        const {
            name,
            variant = "default",
            size = "md",
            background = "default",
            block,
            icon: _icon,
            disabled,
            title: _title,
            onKeyDown: _onKeyDown,
            hideUntilParentHover,
            children: _children,
            ..._rest
        } = props;

        const button = this.root as HTMLButtonElement;
        button.type = props.type ?? "button";
        button.disabled = Boolean(disabled);
        this.root.dataset.type = "button";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        this.root.dataset.variant = variant;
        this.root.dataset.size = size;
        this.root.dataset.bg = background;
        if (block) this.root.dataset.block = "";
        else delete this.root.dataset.block;
        if (disabled) this.root.dataset.disabled = "";
        else delete this.root.dataset.disabled;
        if (hideUntilParentHover) this.root.dataset.visibility = "parent-hover";
        else delete this.root.dataset.visibility;
    }

    private applyConstructionRestProps(props: ButtonViewProps): void {
        const {
            name: _name,
            variant: _variant,
            size: _size,
            background: _background,
            block: _block,
            icon: _icon,
            disabled: _disabled,
            title: _title,
            onKeyDown: _onKeyDown,
            hideUntilParentHover: _hideUntilParentHover,
            children: _children,
            ...rest
        } = props;
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
    }

    private updateTargetedRestProps(props: ButtonViewProps): void {
        const rest = props as Record<string, unknown>;
        setRestProp(this.root, "onClick", rest.onClick, this.restPropsState);
        setRestProp(this.root, "role", rest.role, this.restPropsState);
        setRestProp(this.root, "aria-checked", rest["aria-checked"], this.restPropsState);
        setRestProp(this.root, "tabIndex", rest.tabIndex, this.restPropsState);
    }

    /**
     * `fillSlot` owns the transition between content arms — it must not be
     * pre-cleared, or the cached slot state is discarded and the
     * next call builds a second root on the same element.
     */
    private updateContent(icon: IconRef | undefined, children: SlotContent): void {
        const simpleIcon = icon == null || typeof icon === "string" || icon instanceof Node;
        if (simpleIcon && isSimpleChildren(children)) {
            this.clearSplitContent();
            // A fragment keeps the icon and the label as direct children of the
            // button, so the flex `gap` between them still applies.
            const content = document.createDocumentFragment();
            if (typeof icon === "string") {
                content.append(isIconName(icon) ? createIconElement(icon) : createIconPlaceholderElement());
            } else if (icon instanceof Node) {
                content.append(icon);
            }
            appendSimpleChildren(content, children);
            this.contentCleanup = fillSlot(this.root, content);
            return;
        }

        if (icon != null) {
            // Separate display-contents hosts keep a DOM icon separate from the label while the label may
            // remain in its own subtree. Both hosts stay layout-transparent, so the button's own
            // flex `gap` still measures the icon and label as adjacent direct children.
            this.contentCleanup?.();
            this.contentCleanup = undefined;
            const { iconHost, childrenHost } = this.ensureSplitHosts();
            const iconContent = typeof icon === "string"
                ? (isIconName(icon) ? createIconElement(icon) : createIconPlaceholderElement())
                : icon;
            this.iconCleanup = fillSlot(iconHost, iconContent);
            this.childrenCleanup = fillSlot(childrenHost, children);
            return;
        }

        this.clearSplitContent();
        this.contentCleanup = fillSlot(this.root, children);
    }

    private ensureSplitHosts(): { iconHost: HTMLSpanElement; childrenHost: HTMLSpanElement } {
        if (!this.iconHost) {
            this.iconHost = document.createElement("span");
            this.iconHost.style.display = "contents";
        }
        if (!this.childrenHost) {
            this.childrenHost = document.createElement("span");
            this.childrenHost.style.display = "contents";
        }
        // Append only when not already parented. `append` on an attached node is a *move*, and the
        // children host can own focused content plus the slot-managed subtree — so
        // re-appending on every update would detach and reattach that subtree for no reason.
        if (this.iconHost.parentNode !== this.root || this.childrenHost.parentNode !== this.root) {
            this.root.append(this.iconHost, this.childrenHost);
        }
        return { iconHost: this.iconHost, childrenHost: this.childrenHost };
    }

    private clearContent(): void {
        this.contentCleanup?.();
        this.contentCleanup = undefined;
        this.clearSplitContent();
    }

    private clearSplitContent(): void {
        this.iconCleanup?.();
        this.childrenCleanup?.();
        this.iconCleanup = undefined;
        this.childrenCleanup = undefined;
        this.iconHost?.remove();
        this.childrenHost?.remove();
        this.iconHost = undefined;
        this.childrenHost = undefined;
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        this.props.onKeyDown?.(event);
    };
}
