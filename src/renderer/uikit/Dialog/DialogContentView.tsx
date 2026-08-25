import React from "react";
import { cssLength } from "../Input/InputView";
import { IconButtonView } from "../IconButton/IconButtonView";
import { createIconElement, isIconName, type IconRef } from "../shared/slots";
import { fillSlot } from "../shared/fill-slot";
import { applyRestProps, bindRef, clearRestListeners, createRestPropsState, type RestPropsState } from "../shared/react-compat";
import { SubtreeSwap } from "../shared/subtree-swap";
import { VanillaView } from "../shared/vanilla-view";
import type { DialogContentProps } from "./DialogContent";

const SIZING = [
    ["width", "width"],
    ["height", "height"],
    ["minWidth", "min-width"],
    ["maxWidth", "max-width"],
    ["minHeight", "min-height"],
    ["maxHeight", "max-height"],
] as const;

function setOptionalDataAttribute(
    root: HTMLElement,
    name: string,
    value: string | undefined,
): void {
    if (value === undefined) root.removeAttribute(name);
    else root.setAttribute(name, value);
}

function hasSlot(value: React.ReactNode | Node): boolean {
    return value !== undefined && value !== null && value !== false;
}

export class DialogContentView extends VanillaView<DialogContentProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private header: HTMLDivElement | undefined;
    private titleBox: HTMLSpanElement | undefined;
    private iconHost: HTMLSpanElement | undefined;
    private headerButtonsHost: HTMLSpanElement | undefined;
    private bodyHost: HTMLDivElement | undefined;
    private iconCleanup: (() => void) | undefined;
    private headerButtonsCleanup: (() => void) | undefined;
    private childrenCleanup: (() => void) | undefined;
    private closeSwap: SubtreeSwap<"close"> | undefined;
    private closeSwapParent: HTMLElement | undefined;
    private closeView: IconButtonView | undefined;
    private refCleanup: (() => void) | undefined;
    private boundRef: React.Ref<HTMLDivElement> | undefined;

    public constructor(props: DialogContentProps) {
        super(props, document.createElement("div"));
        this.root.classList.add("dialog-content-shell");
    }

    public setTitle(title: string | undefined): void {
        if (this.titleBox) this.titleBox.textContent = title ?? "";
    }

    protected onMount(): void {
        this.bodyHost = document.createElement("div");
        this.bodyHost.dataset.part = "body";
        this.bodyHost.style.display = "contents";
        this.root.append(this.bodyHost);

        this.applyProps(this.props);
        this.syncStructure(this.props);
        this.childrenCleanup = fillSlot(this.bodyHost, this.props.children);
        this.setRef(this.props.ref);

        this.own(() => this.childrenCleanup?.());
        this.own(() => this.clearHeaderSlots());
        this.own(() => this.closeSwap?.dispose());
        this.own(() => this.clearRef());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: DialogContentProps): void {
        this.applyProps(props);
        this.syncStructure(props);
        if (this.bodyHost) this.childrenCleanup = fillSlot(this.bodyHost, props.children);
        this.setRef(props.ref);
    }

    protected onDispose(): void {
        this.clearHeaderSlots();
        this.clearRef();
    }

    private applyProps(props: DialogContentProps): void {
        const {
            name,
            title: _title,
            icon: _icon,
            onClose: _onClose,
            headerButtons: _headerButtons,
            width: _width,
            height: _height,
            minWidth: _minWidth,
            maxWidth: _maxWidth,
            minHeight: _minHeight,
            maxHeight: _maxHeight,
            children: _children,
            ref: _ref,
            ...rest
        } = props;

        const hasHeader = props.title !== undefined
            || props.icon !== undefined
            || props.onClose !== undefined
            || props.headerButtons !== undefined;

        this.root.dataset.type = "dialog-content";
        setOptionalDataAttribute(this.root, "data-name", name);
        if (hasHeader) this.root.dataset.hasHeader = "true";
        else delete this.root.dataset.hasHeader;
        this.writeSizing(props);
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
        this.root.classList.add("dialog-content-shell");
    }

    private writeSizing(props: DialogContentProps): void {
        for (const [prop, cssProperty] of SIZING) {
            const value = props[prop];
            if (value === undefined) this.root.style.removeProperty(cssProperty);
            else this.root.style.setProperty(cssProperty, cssLength(value));
        }
    }

    private syncStructure(props: DialogContentProps): void {
        const hasHeader = props.title !== undefined
            || props.icon !== undefined
            || props.onClose !== undefined
            || props.headerButtons !== undefined;

        if (!hasHeader) {
            this.clearHeader();
            return;
        }

        if (!this.header || !this.titleBox || !this.closeSwap || !this.bodyHost) {
            this.createHeader();
        }
        this.ensureCloseSwap();

        const header = this.header;
        const titleBox = this.titleBox;
        const bodyHost = this.bodyHost;
        if (!header || !titleBox || !bodyHost) return;
        titleBox.textContent = props.title ?? "";

        this.syncIcon(props.icon);
        this.syncHeaderButtons(props.headerButtons);
        this.syncClose(props.onClose);
        // Keep the body after the header if the header was added during an update.
        if (bodyHost.previousSibling !== header) {
            this.root.insertBefore(header, bodyHost);
        }
    }

    private createHeader(): void {
        const header = document.createElement("div");
        header.dataset.part = "header";
        const titleBox = document.createElement("span");
        titleBox.dataset.part = "title";
        const iconHost = document.createElement("span");
        iconHost.dataset.part = "icon";
        iconHost.style.display = "contents";
        const headerButtonsHost = document.createElement("span");
        headerButtonsHost.dataset.part = "header-buttons";
        headerButtonsHost.style.display = "contents";

        header.append(titleBox);
        this.root.insertBefore(header, this.bodyHost ?? null);
        this.header = header;
        this.titleBox = titleBox;
        this.iconHost = iconHost;
        this.headerButtonsHost = headerButtonsHost;
    }

    private syncIcon(icon: IconRef | undefined): void {
        if (!hasSlot(icon)) {
            this.iconCleanup?.();
            this.iconCleanup = undefined;
            this.iconHost?.remove();
            this.iconHost = undefined;
            return;
        }

        if (!this.iconHost) {
            const header = this.header;
            const titleBox = this.titleBox;
            if (!header || !titleBox) return;
            this.iconHost = document.createElement("span");
            this.iconHost.dataset.part = "icon";
            this.iconHost.style.display = "contents";
            header.insertBefore(this.iconHost, titleBox);
        }

        const content = typeof icon === "string"
            ? createIconElement(isIconName(icon) ? icon : icon as never)
            : icon;
        this.iconCleanup = fillSlot(this.iconHost, content);
    }

    private syncHeaderButtons(buttons: React.ReactNode): void {
        if (!hasSlot(buttons)) {
            this.headerButtonsCleanup?.();
            this.headerButtonsCleanup = undefined;
            this.headerButtonsHost?.remove();
            this.headerButtonsHost = undefined;
            return;
        }

        if (!this.headerButtonsHost) {
            const header = this.header;
            if (!header) return;
            this.headerButtonsHost = document.createElement("span");
            this.headerButtonsHost.dataset.part = "header-buttons";
            this.headerButtonsHost.style.display = "contents";
            const before = this.closeView?.root ?? null;
            header.insertBefore(this.headerButtonsHost, before);
        }
        this.headerButtonsCleanup = fillSlot(this.headerButtonsHost, buttons);
    }

    private syncClose(onClose: (() => void) | undefined): void {
        if (!this.closeSwap) return;
        if (!onClose) {
            this.closeView = undefined;
            this.closeSwap.clear();
            return;
        }

        const closeProps = {
            size: "sm" as const,
            icon: "close" as const,
            onClick: onClose,
            "aria-label": "Close",
        };
        if (this.closeView) {
            this.closeView.update(closeProps);
            return;
        }

        let created: IconButtonView | undefined;
        this.closeSwap.set("close", () => {
            created = new IconButtonView(closeProps);
            return created;
        });
        if (created) {
            this.closeView = created;
            created.mount();
        }
    }

    private clearHeader(): void {
        this.closeView = undefined;
        this.closeSwap?.clear();
        this.clearHeaderSlots();
        this.header?.remove();
        this.header = undefined;
        this.titleBox = undefined;
    }

    private ensureCloseSwap(): void {
        const parent = this.header ?? this.root;
        if (this.closeSwap && this.closeSwapParent === parent) return;
        this.closeSwap?.dispose();
        this.closeSwap = new SubtreeSwap(parent);
        this.closeSwapParent = parent;
    }

    private clearHeaderSlots(): void {
        this.iconCleanup?.();
        this.iconCleanup = undefined;
        this.headerButtonsCleanup?.();
        this.headerButtonsCleanup = undefined;
        this.iconHost?.remove();
        this.iconHost = undefined;
        this.headerButtonsHost?.remove();
        this.headerButtonsHost = undefined;
    }

    private setRef(ref: React.Ref<HTMLDivElement> | undefined): void {
        if (ref === this.boundRef) return;
        this.refCleanup?.();
        this.boundRef = ref;
        this.refCleanup = bindRef(this.root as HTMLDivElement, ref);
    }

    private clearRef(): void {
        this.refCleanup?.();
        this.refCleanup = undefined;
        this.boundRef = undefined;
    }
}
