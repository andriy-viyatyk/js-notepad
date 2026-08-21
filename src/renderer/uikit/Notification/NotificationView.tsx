import React from "react";
import type { NotificationProps, NotificationSeverity } from "./Notification";
import { createIconElement } from "../shared/slots";
import { applyTextAttributes, resolveTextAttributes } from "../Text/text-style";
import { applyRestProps, bindRef, clearRestListeners, createRestPropsState, toPublicEvent, type RestPropsState } from "../shared/react-compat";
import { SubtreeSwap } from "../shared/subtree-swap";
import { VanillaView } from "../shared/vanilla-view";
import { IconButtonView } from "../IconButton/IconButtonView";
import type { IconButtonProps } from "../IconButton/IconButton";
import "./Notification.css";
import "../Text/Text.css";
import "../IconButton/IconButton.css";

const SEVERITY_ICON: Record<NotificationSeverity, "info" | "success" | "warning" | "error"> = {
    info: "info",
    success: "success",
    warning: "warning",
    error: "error",
};

const ARIA_ROLE: Record<NotificationSeverity, "alert" | "status"> = {
    error: "alert",
    warning: "status",
    success: "status",
    info: "status",
};

const ARIA_LIVE: Record<NotificationSeverity, "assertive" | "polite"> = {
    error: "assertive",
    warning: "polite",
    success: "polite",
    info: "polite",
};

interface CloseButtonProps {
    onClose: () => void;
}

class CloseButtonView extends VanillaView<CloseButtonProps> {
    private readonly button: IconButtonView;

    public constructor(props: CloseButtonProps) {
        super(props, document.createElement("span"));
        this.root.dataset.part = "close";
        const buttonProps: IconButtonProps = {
            size: "sm",
            icon: "close",
            title: "Close",
            onClick: (event) => {
                event.stopPropagation();
                this.props.onClose();
            },
        };
        this.button = this.child(new IconButtonView(buttonProps));
    }

    protected onMount(): void {
        this.root.append(this.button.root);
        this.button.mount();
    }
}

export class NotificationView extends VanillaView<NotificationProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private iconHost: HTMLSpanElement | undefined;
    private messageElement: HTMLSpanElement | undefined;
    private closeSwap: SubtreeSwap<string> | undefined;
    private refCleanup: () => void = () => undefined;
    private boundRef: React.Ref<HTMLDivElement> | undefined;

    public constructor(props: NotificationProps) {
        super(props, document.createElement("div"));
        this.root.classList.add("notification-root");
        this.iconHost.dataset.part = "icon";
    }

    protected onMount(): void {
        this.iconHost = document.createElement("span");
        this.iconHost.dataset.part = "icon";
        this.messageElement = document.createElement("span");
        this.closeSwap = new SubtreeSwap<string>(this.root);
        this.root.append(this.iconHost, this.messageElement);
        this.applyProps(this.props);
        this.updateIcon(this.props.type);
        this.updateMessage(this.props.message);
        this.setRef(this.props.ref);
        this.listen(this.root, "click", (event) => {
            this.props.onClick?.(
                toPublicEvent(event) as React.MouseEvent<HTMLDivElement>,
            );
        });
        this.own(() => this.closeSwap?.dispose());
        this.own(() => this.clearRef());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
        this.updateClose(this.props.onClose);
    }

    protected onUpdate(props: NotificationProps): void {
        this.applyProps(props);
        this.updateIcon(props.type);
        this.updateMessage(props.message);
        this.setRef(props.ref);
        this.updateClose(props.onClose);
    }

    private applyProps(props: NotificationProps): void {
        const {
            name,
            type,
            onClick: _onClick,
            onClose: _onClose,
            message: _message,
            ref: _ref,
            children: _children,
            ...rest
        } = props;

        this.root.dataset.type = "notification";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        this.root.dataset.severity = type;
        if (props.onClick) this.root.dataset.clickable = "";
        else delete this.root.dataset.clickable;
        this.root.setAttribute("role", ARIA_ROLE[type]);
        this.root.setAttribute("aria-live", ARIA_LIVE[type]);

        // Match the React component: residual attributes are applied after the
        // owned markers, so a caller's residual data-* value still wins. The
        // private class is intentionally outside that surface because the
        // public props omit className.
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
    }

    private updateIcon(type: NotificationSeverity): void {
        this.iconHost?.replaceChildren(createIconElement(SEVERITY_ICON[type]));
    }

    private updateMessage(message: string): void {
        if (!this.messageElement) return;
        applyTextAttributes(
            this.messageElement,
            resolveTextAttributes({ size: "base", color: "inherit", preWrap: true }),
        );
        this.messageElement.textContent = message;
    }

    private updateClose(onClose: NotificationProps["onClose"]): void {
        if (!this.closeSwap) return;
        let mountedView: CloseButtonView | undefined;
        this.closeSwap.set(onClose ? "close" : null, () => {
            mountedView = new CloseButtonView({
                onClose: () => this.props.onClose?.(),
            });
            return mountedView;
        });
        mountedView?.mount();
    }

    private setRef(ref: React.Ref<HTMLDivElement> | undefined): void {
        if (ref === this.boundRef) return;
        this.refCleanup();
        this.boundRef = ref;
        this.refCleanup = bindRef(this.root, ref);
    }

    private clearRef(): void {
        this.refCleanup();
        this.refCleanup = () => undefined;
        this.boundRef = undefined;
    }
}
