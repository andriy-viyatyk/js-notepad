import type React from "react";
import { mountVanilla } from "../shared/mount";
import { DialogView } from "./DialogView";
import "./Dialog.css";

// --- Types ---

export type DialogPosition = "center" | "right";

export interface DialogProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className"> {
    ref?: React.Ref<HTMLDivElement>;
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Where to anchor the dialog body. Default: "center". */
    position?: DialogPosition;
    /** Click on the backdrop (outside the dialog body). */
    onBackdropClick?: () => void;
    /** Auto-focus the first focusable child on mount. Default: true. */
    autoFocus?: boolean;
    children?: React.ReactNode;
}

export function Dialog(props: DialogProps): React.ReactElement {
    return mountVanilla(DialogView, props);
}
