import React from "react";
import { mountVanilla } from "../shared/mount";
import { NotificationView } from "./NotificationView";

// --- Types ---

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface NotificationProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onClick"> {
    ref?: React.Ref<HTMLDivElement>;
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Severity. Drives background, text, border, icon, and close-button hover color. */
    type: NotificationSeverity;
    /** Notification message. Renders with `white-space: pre-wrap` so `\n` are preserved. */
    message: string;
    /** Body click handler. The close-button click does NOT propagate here. */
    onClick?: (event: MouseEvent) => void;
    /** Close-button click handler. When omitted, the close button is not rendered. */
    onClose?: () => void;
}

export function Notification(props: NotificationProps): React.ReactElement {
    return mountVanilla(NotificationView, props);
}
