import React from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import type { IconName } from "../../theme/icon-registry";
import { renderIcon } from "../shared/slots";
import { spacing, gap, radius, height } from "../tokens";
import { IconButton } from "../IconButton/IconButton";
import { Text } from "../Text/Text";

// --- Types ---

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface NotificationProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Severity. Drives background, text, border, icon, and close-button hover color. */
    type: NotificationSeverity;
    /** Notification message. Renders with `white-space: pre-wrap` so `\n` are preserved. */
    message: string;
    /** Body click handler. The close-button click does NOT propagate here. */
    onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
    /** Close-button click handler. When omitted, the close button is not rendered. */
    onClose?: () => void;
}

// --- Styled ---

const Root = styled.div(
    {
        position: "relative",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        columnGap: gap.lg,
        padding: `${spacing.md}px ${spacing.xxxl}px ${spacing.md}px ${spacing.md}px`,
        border: "1px solid",
        borderColor: color.border.default,
        borderRadius: radius.lg,
        animation: "notification-slide-in 0.2s ease-in-out",

        "& [data-part='icon']": {
            display: "inline-flex",
            alignItems: "center",
            "& svg": { width: height.iconLg, height: height.iconLg },
        },
        "& [data-part='close']": {
            position: "absolute",
            top: spacing.sm,
            right: spacing.sm,
        },

        // --- Severity ---
        '&[data-severity="info"]': {
            backgroundColor: color.background.message,
            "& [data-part='icon']": { color: color.icon.default },
        },
        '&[data-severity="error"]': {
            backgroundColor: color.error.background,
            color: color.error.text,
            borderColor: color.error.border,
            '& [data-part="close"] [data-type="icon-button"]':       { color: color.error.text },
            '& [data-part="close"] [data-type="icon-button"]:hover': { color: color.error.textHover },
        },
        '&[data-severity="success"]': {
            backgroundColor: color.success.background,
            color: color.success.text,
            borderColor: color.success.border,
            '& [data-part="close"] [data-type="icon-button"]':       { color: color.success.text },
            '& [data-part="close"] [data-type="icon-button"]:hover': { color: color.success.textHover },
        },
        '&[data-severity="warning"]': {
            backgroundColor: color.warning.background,
            color: color.warning.text,
            borderColor: color.warning.border,
            '& [data-part="close"] [data-type="icon-button"]':       { color: color.warning.text },
            '& [data-part="close"] [data-type="icon-button"]:hover': { color: color.warning.textHover },
        },

        "&[data-clickable]": { cursor: "pointer" },
    },
    { label: "Notification" },
);

const SLIDE_IN_KEYFRAMES = `@keyframes notification-slide-in {
    from { transform: translateX(300px); }
    to   { transform: translateX(0); }
}`;

const SEVERITY_ICON: Record<NotificationSeverity, IconName> = {
    info:    "info",
    success: "success",
    warning: "warning",
    error:   "error",
};

const ARIA_ROLE: Record<NotificationSeverity, "alert" | "status"> = {
    error:   "alert",
    warning: "status",
    success: "status",
    info:    "status",
};

const ARIA_LIVE: Record<NotificationSeverity, "assertive" | "polite"> = {
    error:   "assertive",
    warning: "polite",
    success: "polite",
    info:    "polite",
};

// --- Component ---

export const Notification = React.forwardRef<HTMLDivElement, NotificationProps>(
    function Notification({ name, type, message, onClick, onClose, ...rest }, ref) {
        const handleClose = (e: React.MouseEvent) => {
            e.stopPropagation();
            onClose?.();
        };

        return (
            <>
                <style>{SLIDE_IN_KEYFRAMES}</style>
                <Root
                    ref={ref}
                    data-type="notification"
                    data-name={name}
                    data-severity={type}
                    data-clickable={onClick ? "" : undefined}
                    role={ARIA_ROLE[type]}
                    aria-live={ARIA_LIVE[type]}
                    onClick={onClick}
                    {...rest}
                >
                    <span data-part="icon">{renderIcon(SEVERITY_ICON[type])}</span>
                    <Text size="base" color="inherit" preWrap>{message}</Text>
                    {onClose && (
                        <span data-part="close">
                            <IconButton
                                size="sm"
                                icon="close"
                                title="Close"
                                onClick={handleClose}
                            />
                        </span>
                    )}
                </Root>
            </>
        );
    },
);
