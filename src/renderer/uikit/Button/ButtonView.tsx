import React from "react";
import { attachTooltip, type TooltipAttachment } from "../Tooltip/attach-tooltip";
import { createIconElement, isIconName, renderIcon } from "../shared/slots";
import { applyRestProps, bindRef, clearRestListeners, createRestPropsState, type RestPropsState } from "../shared/react-compat";
import { fillSlot } from "../shared/fill-slot";
import { VanillaView } from "../shared/vanilla-view";
import type { IconRef } from "../shared/slots";
import type { ButtonProps } from "./Button";

export type ButtonViewProps = ButtonProps;

function isSimpleChildren(value: React.ReactNode): boolean {
    if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return true;
    }
    return Array.isArray(value) && value.every(isSimpleChildren);
}

function appendSimpleChildren(parent: ParentNode, value: React.ReactNode): void {
    if (value == null || typeof value === "boolean") return;
    if (Array.isArray(value)) {
        value.forEach((child) => appendSimpleChildren(parent, child));
        return;
    }
    parent.append(document.createTextNode(String(value)));
}

export class ButtonView extends VanillaView<ButtonViewProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private contentCleanup: (() => void) | undefined;
    private tooltip: TooltipAttachment | undefined;
    private refCleanup: (() => void) = () => undefined;
    private boundRef: React.Ref<HTMLButtonElement> | undefined;

    public constructor(props: ButtonViewProps) {
        super(props, document.createElement("button"));
    }

    protected onMount(): void {
        this.applyProps(this.props);
        this.updateContent(this.props.icon, this.props.children);
        this.setRef(this.props.ref);
        this.tooltip = attachTooltip(this.root, {
            content: this.props.title ?? null,
        });
        this.own(() => this.tooltip?.dispose());
        this.own(() => this.clearContent());
        this.own(() => this.clearRef());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: ButtonViewProps): void {
        this.applyProps(props);
        this.updateContent(props.icon, props.children);
        this.setRef(props.ref);
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
            hideUntilParentHover,
            children: _children,
            ref: _ref,
            ...rest
        } = props;

        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
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

    /**
     * `fillSlot` owns the transition between content arms — it must not be
     * pre-cleared, or the React root it caches per host is discarded and the
     * next call builds a second root on the same element.
     */
    private updateContent(icon: IconRef | undefined, children: React.ReactNode): void {
        const simpleIcon = icon == null || typeof icon === "string";
        if (simpleIcon && isSimpleChildren(children)) {
            // A fragment keeps the icon and the label as direct children of the
            // button, so the flex `gap` between them still applies.
            const content = document.createDocumentFragment();
            if (typeof icon === "string") {
                content.append(createIconElement(isIconName(icon) ? icon : icon as never));
            }
            appendSimpleChildren(content, children);
            this.contentCleanup = fillSlot(this.root, content);
            return;
        }

        const iconNode = icon == null ? null : renderIcon(icon);
        this.contentCleanup = fillSlot(
            this.root,
            React.createElement(React.Fragment, null, iconNode, children),
        );
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

    private clearContent(): void {
        this.contentCleanup?.();
        this.contentCleanup = undefined;
    }
}
