import React from "react";
import "./Spinner.css";
import { ProgressIcon } from "../../theme/icons";

// --- Types ---

export interface SpinnerProps
    extends Omit<React.HTMLAttributes<HTMLSpanElement>, "style" | "className" | "color"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Outer size in px. Default: 32. */
    size?: number;
    /** CSS color override applied to the spinner stroke. Default: inherits via currentColor. */
    color?: string;
}

// --- Component ---

export function Spinner({ name, size = 32, color, ...rest }: SpinnerProps) {
    const style = {
        "--spinner-size": `${size}px`,
        ...(color ? { "--spinner-color": color } : {}),
    } as React.CSSProperties;

    return (
        <span
            {...rest}
            data-type="spinner"
            data-name={name}
            role="status"
            aria-live="polite"
            aria-label="Loading"
            style={style}
        >
            <ProgressIcon />
        </span>
    );
}
