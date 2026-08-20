import React from "react";
import { attachTooltip, type TooltipAttachment } from "../Tooltip/attach-tooltip";
import { createIconElement, isIconName, renderIcon } from "../shared/slots";
import { fillSlot } from "../shared/fill-slot";
import { applyRestProps, bindRef, clearRestListeners, createRestPropsState, type RestPropsState } from "../shared/react-compat";
import { VanillaView } from "../shared/vanilla-view";
import type { IconRef } from "../shared/slots";
import type { IconButtonProps } from "./IconButton";

export type IconButtonViewProps = IconButtonProps;

export class IconButtonView extends VanillaView<IconButtonViewProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private readonly iconHost = document.createElement("span");
    private iconCleanup: (() => void) | undefined;
    private tooltip: TooltipAttachment | undefined;
    private refCleanup: (() => void) = () => undefined;
    private boundRef: React.Ref<HTMLButtonElement> | undefined;

    public constructor(props: IconButtonViewProps) {
        super(props, document.createElement("button"));
        this.iconHost.dataset.part = "icon";
    }

    protected onMount(): void {
        this.applyProps(this.props);
        this.root.append(this.iconHost);
        this.updateIcon(this.props.icon);
        this.setRef(this.props.ref);
        this.tooltip = attachTooltip(this.root, { content: this.props.title ?? null });
        this.own(() => this.tooltip?.dispose());
        this.own(() => this.clearIcon());
        this.own(() => this.clearRef());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: IconButtonViewProps): void {
        this.applyProps(props);
        this.updateIcon(props.icon);
        this.setRef(props.ref);
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
            title: _title,
            icon: _icon,
            hideUntilParentHover,
            strikethrough,
            ref: _ref,
            children: _children,
            ...rest
        } = props;

        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
        const button = this.root as HTMLButtonElement;
        button.type = props.type ?? "button";
        button.disabled = Boolean(disabled);
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

    /**
     * `fillSlot` owns the transition between icon arms — it must not be
     * pre-cleared, or the React root it caches per host is discarded and the
     * next call builds a second root on the same element.
     */
    private updateIcon(icon: IconRef): void {
        if (typeof icon === "string") {
            this.iconCleanup = fillSlot(
                this.iconHost,
                createIconElement(isIconName(icon) ? icon : icon as never),
            );
            return;
        }
        this.iconCleanup = fillSlot(this.iconHost, renderIcon(icon));
    }

    private clearIcon(): void {
        this.iconCleanup?.();
        this.iconCleanup = undefined;
    }

    private setRef(ref: React.Ref<HTMLButtonElement> | undefined): void {
        if (ref === this.boundRef) return;
        this.refCleanup();
        this.boundRef = ref;
        this.refCleanup = bindRef(this.root as HTMLButtonElement, ref);
    }

    private clearRef(): void {
        this.refCleanup();
        this.refCleanup = () => undefined;
        this.boundRef = undefined;
    }
}
