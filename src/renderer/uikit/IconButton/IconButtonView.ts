import { applyRestProps, clearRestListeners, createRestPropsState } from "../shared/dom-props";
import type { NativeButtonHTMLAttributes, RestPropsState } from "../shared/dom-props";
import { attachTooltip, type TooltipAttachment } from "../Tooltip/attach-tooltip";
import { createIconElement, createIconPlaceholderElement, isIconName } from "../shared/slots";
import { fillSlot } from "../shared/fill-slot";
import { VanillaView } from "../shared/vanilla-view";
import type { IconRef } from "../shared/slots";
// Owned by the view, not the shim: a vanilla parent may compose `IconButtonView` directly (`Select`
// does, for its chevron), and it imports `IconButton` type-only — which erases at compile time — so
// the stylesheet has to travel with the DOM-owning view. Matches `InputView`.
import "./IconButton.css";

export interface IconButtonProps extends Pick<NativeButtonHTMLAttributes<HTMLButtonElement>, "autoFocus" | "type" | "hidden" | "role" | "tabIndex" | "children" | `aria-${string}` | `data-${string}`> {
    name?: string;
    title?: string;
    onClick?: (event: MouseEvent) => void;
    disabled?: boolean;
    // DOM Node icons support registry-excluded language icons.
    icon: IconRef;
    size?: "sm" | "md";
    variant?: "default" | "chip";
    active?: boolean;
    warning?: boolean;
    hideUntilParentHover?: boolean;
    strikethrough?: boolean;
}

export type IconButtonViewProps = IconButtonProps;

export class IconButtonView extends VanillaView<IconButtonViewProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private readonly iconHost = document.createElement("span");
    private iconCleanup: (() => void) | undefined;
    /**
     * The last icon *name* written to the host. A composed parent pushes props on every update —
     * `Select`'s chevron once per keystroke — and `createIconElement` would rebuild the `svg`
     * each time.
     */
    private appliedIconName: string | undefined;
    private appliedIconNode: Node | undefined;
    private tooltip: TooltipAttachment | undefined;

    public constructor(props: IconButtonViewProps) {
        super(props, document.createElement("button"));
        this.iconHost.dataset.part = "icon";
    }

    protected onMount(): void {
        this.applyConstructionRestProps(this.props);
        this.applyProps(this.props);
        this.root.append(this.iconHost);
        this.updateIcon(this.props.icon);
        this.listen(this.root, "click", this.handleClick);
        this.tooltip = attachTooltip(this.root, { content: this.props.title ?? null });
        this.own(() => this.tooltip?.dispose());
        this.own(() => this.clearIcon());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: IconButtonViewProps): void {
        this.applyProps(props);
        this.updateIcon(props.icon);
        this.tooltip?.update({ content: props.title ?? null });
    }

    private applyProps(props: IconButtonViewProps): void {
        const {
            name,
            size = "md",
            variant = "default",
            active,
            warning,
            disabled,
            hidden,
            title: _title,
            onClick: _onClick,
            icon: _icon,
            hideUntilParentHover,
            strikethrough,
            children: _children,
            ..._rest
        } = props;

        const button = this.root as HTMLButtonElement;
        button.type = props.type ?? "button";
        button.disabled = Boolean(disabled);
        // `hidden` is applied here, not left to the construction-time rest props: a caller that
        // toggles visibility does so on `update()`, and the rest-prop path runs only once. The
        // matching `[data-type="icon-button"][hidden]` rule in IconButton.css beats the author
        // display rule that the UA `[hidden]` rule would otherwise lose to.
        button.hidden = Boolean(hidden);
        this.root.dataset.type = "icon-button";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        this.root.dataset.size = size;
        this.root.dataset.variant = variant;
        if (active && !warning) this.root.dataset.active = "";
        else delete this.root.dataset.active;
        if (warning) this.root.dataset.warning = "";
        else delete this.root.dataset.warning;
        if (disabled) this.root.dataset.disabled = "";
        else delete this.root.dataset.disabled;
        if (strikethrough) this.root.dataset.strikethrough = "";
        else delete this.root.dataset.strikethrough;
        if (hideUntilParentHover) this.root.dataset.visibility = "parent-hover";
        else delete this.root.dataset.visibility;
    }

    private applyConstructionRestProps(props: IconButtonViewProps): void {
        const {
            name: _name,
            size: _size,
            variant: _variant,
            active: _active,
            warning: _warning,
            disabled: _disabled,
            title: _title,
            onClick: _onClick,
            icon: _icon,
            hideUntilParentHover: _hideUntilParentHover,
            strikethrough: _strikethrough,
            children: _children,
            ...rest
        } = props;
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
    }

    /**
     * `fillSlot` owns the transition between icon arms — it must not be
     * pre-cleared, or the cached slot state is discarded and the
     * next call builds a second root on the same element.
     */
    private updateIcon(icon: IconRef): void {
        if (typeof icon === "string") {
            if (this.appliedIconName === icon) return;
            this.appliedIconName = icon;
            this.appliedIconNode = undefined;
            this.iconCleanup = fillSlot(
                this.iconHost,
                isIconName(icon) ? createIconElement(icon) : createIconPlaceholderElement(),
            );
            return;
        }
        if (icon instanceof Node) {
            if (this.appliedIconNode === icon) return;
            this.appliedIconName = undefined;
            this.appliedIconNode = icon;
            this.iconCleanup = fillSlot(this.iconHost, icon);
            return;
        }
    }

    private clearIcon(): void {
        this.iconCleanup?.();
        this.iconCleanup = undefined;
        this.appliedIconName = undefined;
        this.appliedIconNode = undefined;
    }

    private readonly handleClick = (event: MouseEvent): void => {
        this.props.onClick?.(event);
    };
}
