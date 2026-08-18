import React from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { height, radius } from "../tokens";

// --- Types ---

export interface SliderProps
    extends Omit<
        React.InputHTMLAttributes<HTMLInputElement>,
        "value" | "onChange" | "min" | "max" | "step" | "type" | "size" |
        "style" | "className"
    > {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Current value. */
    value: number;
    /** Change handler — receives the parsed number directly. */
    onChange: (value: number) => void;
    /** Minimum value. */
    min: number;
    /** Maximum value. */
    max: number;
    /** Step. Default: 1. */
    step?: number;
    /** Control size. Default: "md". */
    size?: "sm" | "md";
    /** Disabled state. */
    disabled?: boolean;
    /** Fixed width — number → px, string passes through. Default: fills parent (100%). */
    width?: number | string;
    /**
     * Fill the played portion of the track with `color.border.active`, computed
     * from `(value - min) / (max - min)`. Default: false (uniform track).
     * Useful for media seek-bars where the elapsed portion should be visually
     * distinct from the remaining portion.
     */
    showProgress?: boolean;
}

// --- Styled ---

const Root = styled.input(
    {
        appearance: "none",
        WebkitAppearance: "none",
        background: "transparent",
        outline: "none",
        cursor: "pointer",
        margin: 0,
        width: "100%",
        flex: "1 1 auto",
        minWidth: 0,

        // Webkit
        "&::-webkit-slider-runnable-track": {
            height: 4,
            borderRadius: radius.xs,
            background: `var(--slider-track-bg, ${color.border.default})`,
        },
        "&::-webkit-slider-thumb": {
            appearance: "none",
            WebkitAppearance: "none",
            width: 12,
            height: 12,
            marginTop: -4,
            borderRadius: "50%",
            background: color.border.active,
            cursor: "pointer",
            border: "none",
        },

        // Firefox
        "&::-moz-range-track": {
            height: 4,
            borderRadius: radius.xs,
            background: `var(--slider-track-bg, ${color.border.default})`,
        },
        "&::-moz-range-thumb": {
            width: 12,
            height: 12,
            border: "none",
            borderRadius: "50%",
            background: color.border.active,
            cursor: "pointer",
        },

        '&[data-size="sm"]': {
            height: height.controlSm,
        },
        '&[data-size="md"]': {
            height: height.controlMd,
        },

        "&[data-disabled]": {
            opacity: 0.4,
            pointerEvents: "none",
        },
    },
    { label: "Slider" },
);

// --- Component ---

export function Slider({
    name,
    value,
    onChange,
    min,
    max,
    step = 1,
    size = "md",
    disabled,
    width,
    showProgress,
    ...rest
}: SliderProps) {
    const rootStyle = React.useMemo<React.CSSProperties | undefined>(() => {
        const out: React.CSSProperties & Record<string, string | number> = {};
        if (width !== undefined) out.width = typeof width === "number" ? width : width;
        if (showProgress) {
            const range = max - min;
            const pct = range > 0 ? ((value - min) / range) * 100 : 0;
            const clamped = Math.max(0, Math.min(100, pct));
            out["--slider-track-bg"] = `linear-gradient(to right, ${color.border.active} ${clamped}%, ${color.border.default} ${clamped}%)`;
        }
        return Object.keys(out).length > 0 ? out : undefined;
    }, [width, showProgress, value, min, max]);

    return (
        <Root
            data-type="slider"
            data-name={name}
            data-size={size}
            data-disabled={disabled || undefined}
            data-show-progress={showProgress || undefined}
            type="range"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            style={rootStyle}
            {...rest}
        />
    );
}
