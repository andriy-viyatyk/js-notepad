import React from "react";
import styled from "@emotion/styled";
import { Button } from "../Button/Button";
import { radius } from "../tokens";
import {
    isTraited,
    resolveTraited,
    TraitKey,
    Traited,
    TraitType,
} from "../../core/traits/traits";

// --- Types ---

export interface ISegment {
    /** Stable identifier — what `value` / `onChange` refer to. */
    value: string;
    /** Display label. Falls back to `value` when omitted. */
    label?: React.ReactNode;
    /** Icon rendered before the label. */
    icon?: React.ReactNode;
    /** Tooltip shown on hover/focus. Rendered via the underlying `Button`'s UIKit `Tooltip`. */
    title?: string;
    /** Disables this segment without affecting siblings. */
    disabled?: boolean;
}

/** Trait key for non-IS­egment item arrays — register accessors against this. */
export const SEGMENT_KEY = new TraitKey<TraitType<ISegment>>("segmented-control-segment");

export interface SegmentedControlProps {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    items: ISegment[] | Traited<unknown[]>;
    value: string;
    onChange: (value: string) => void;
    size?: "sm" | "md";
    background?: "default" | "light" | "dark";
    disabled?: boolean;
}

// --- Styled ---

const Root = styled.div(
    {
        display: "inline-flex",
        // Inner segments are square; outer corners are rounded so the group
        // reads as one connected control. The [data-type="button"] selector
        // adds attribute-selector specificity (0,2,0) to beat Button's own
        // border-radius rule (0,1,0) regardless of stylesheet insertion order.
        "& > [data-type=\"button\"]": {
            borderRadius: 0,
        },
        "& > [data-type=\"button\"]:first-of-type": {
            borderTopLeftRadius: radius.md,
            borderBottomLeftRadius: radius.md,
        },
        "& > [data-type=\"button\"]:last-of-type": {
            borderTopRightRadius: radius.md,
            borderBottomRightRadius: radius.md,
        },
        // Overlap adjacent borders so two link variants don't render as 2px.
        "& > [data-type=\"button\"]:not(:first-of-type)": {
            marginLeft: -1,
        },
        // Selected segment sits on top so its primary background covers
        // adjacent borders cleanly.
        "& > [data-variant=\"primary\"]": {
            position: "relative",
            zIndex: 1,
        },

        "&[data-disabled]": {
            opacity: 0.6,
        },
    },
    { label: "SegmentedControl" },
);

// --- Component ---

export function SegmentedControl({
    name,
    items,
    value,
    onChange,
    size = "md",
    background = "default",
    disabled,
}: SegmentedControlProps) {
    const segments = isTraited<unknown[]>(items)
        ? resolveTraited<ISegment>(items, SEGMENT_KEY)
        : items;
    const rootRef = React.useRef<HTMLDivElement>(null);

    // Roving tabindex: only one button is in the tab sequence at a time.
    // Prefer the selected segment; if no segment matches `value`, fall back
    // to the first non-disabled segment so the group remains tab-reachable.
    const selectedIdx = segments.findIndex((s) => s.value === value && !s.disabled);
    const fallbackIdx = selectedIdx >= 0
        ? selectedIdx
        : segments.findIndex((s) => !s.disabled);

    const focusButton = (i: number) => {
        const btn = rootRef.current?.children[i] as HTMLElement | undefined;
        btn?.focus();
    };

    const moveFocus = (currentIdx: number, dir: 1 | -1) => {
        const n = segments.length;
        if (n === 0) return;
        let next = currentIdx;
        for (let step = 0; step < n; step++) {
            next = (next + dir + n) % n;
            if (!segments[next].disabled) {
                focusButton(next);
                onChange(segments[next].value);
                return;
            }
        }
    };

    const handleKey = (e: React.KeyboardEvent, i: number) => {
        switch (e.key) {
            case "ArrowRight":
            case "ArrowDown":
                e.preventDefault();
                e.stopPropagation();
                moveFocus(i, 1);
                break;
            case "ArrowLeft":
            case "ArrowUp":
                e.preventDefault();
                e.stopPropagation();
                moveFocus(i, -1);
                break;
            case "Home": {
                e.preventDefault();
                e.stopPropagation();
                const first = segments.findIndex((s) => !s.disabled);
                if (first >= 0) {
                    focusButton(first);
                    onChange(segments[first].value);
                }
                break;
            }
            case "End": {
                e.preventDefault();
                e.stopPropagation();
                for (let j = segments.length - 1; j >= 0; j--) {
                    if (!segments[j].disabled) {
                        focusButton(j);
                        onChange(segments[j].value);
                        break;
                    }
                }
                break;
            }
        }
    };

    return (
        <Root
            ref={rootRef}
            data-type="segmented-control"
            data-name={name}
            data-roving-host=""
            data-disabled={disabled || undefined}
            role="radiogroup"
        >
            {segments.map((segment, i) => {
                const selected = segment.value === value;
                const segDisabled = disabled || segment.disabled;
                return (
                    <Button
                        key={segment.value}
                        variant={selected ? "primary" : "link"}
                        size={size}
                        background={background}
                        icon={segment.icon}
                        title={segment.title}
                        disabled={segDisabled}
                        role="radio"
                        aria-checked={selected}
                        tabIndex={i === fallbackIdx ? 0 : -1}
                        onClick={() => onChange(segment.value)}
                        onKeyDown={(e) => handleKey(e, i)}
                    >
                        {segment.label ?? segment.value}
                    </Button>
                );
            })}
        </Root>
    );
}
