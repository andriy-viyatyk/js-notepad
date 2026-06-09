/**
 * L/R side-select toggle pair (EPIC-031 / US-618).
 *
 * Two small toggles — **L** (left / diff `from`) and **R** (right / diff `to`) —
 * with an accent-active state. Reused by the Git Diff "Revisions" panel in two
 * places: the `GitTree` L/R status column (per commit row, via
 * `makeSideSelectCell`) and the panel's Unstaged/Staged endpoint rows. The
 * Unstaged row passes `showLeft={false}` (the diff `from` is never the working
 * tree), so only the R toggle renders — a same-width placeholder keeps the R
 * icon column-aligned with the commit rows.
 *
 * `components/git-tree/` is app code (not uikit/), so Emotion is allowed for this
 * component's own elements (see GitTree.tsx header).
 */
import styled from "@emotion/styled";

import color from "../../theme/color";
import { fontSize, radius, spacing } from "../../uikit/tokens";

const TOGGLE_W = 20;
const TOGGLE_H = 18;

export interface SideSelectToggleProps {
    /** Optional debug label emitted as `data-name`. */
    name?: string;
    /** L is active (this row holds the diff's `from`/left revision). */
    leftActive: boolean;
    /** R is active (this row holds the diff's `to`/right revision). */
    rightActive: boolean;
    /** Render the L toggle. Default true; Unstaged rows pass false (R only). */
    showLeft?: boolean;
    onPickLeft: () => void;
    onPickRight: () => void;
}

const Root = styled.div({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
}, { label: "SideSelectToggle" });

const Toggle = styled.button({
    width: TOGGLE_W,
    height: TOGGLE_H,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    border: `1px solid ${color.border.default}`,
    borderRadius: radius.xs,
    background: "transparent",
    color: color.text.light,
    fontSize: fontSize.xs,
    fontWeight: 600,
    lineHeight: 1,
    cursor: "pointer",
    userSelect: "none",
    "&:hover:not([data-active])": {
        color: color.text.default,
    },
    // Active = blue-accent background + white text — the same selection tokens the
    // UIKit Button "primary" variant uses, so the active side reads clearly (US-618).
    "&[data-active]": {
        background: color.background.selection,
        color: color.text.selection,
        borderColor: color.background.selection,
    },
}, { label: "SideSelectToggleButton" });

const LeftPlaceholder = styled.span({
    width: TOGGLE_W,
    height: TOGGLE_H,
    flexShrink: 0,
}, { label: "SideSelectTogglePlaceholder" });

export function SideSelectToggle({
    name,
    leftActive,
    rightActive,
    showLeft = true,
    onPickLeft,
    onPickRight,
}: SideSelectToggleProps) {
    return (
        <Root data-type="side-select-toggle" data-name={name}>
            {showLeft ? (
                <Toggle
                    data-type="side-select-left"
                    data-active={leftActive || undefined}
                    title="Compare on the left (from)"
                    onClick={(e) => {
                        e.stopPropagation();
                        onPickLeft();
                    }}
                >
                    L
                </Toggle>
            ) : (
                <LeftPlaceholder aria-hidden />
            )}
            <Toggle
                data-type="side-select-right"
                data-active={rightActive || undefined}
                title="Compare on the right (to)"
                onClick={(e) => {
                    e.stopPropagation();
                    onPickRight();
                }}
            >
                R
            </Toggle>
        </Root>
    );
}
