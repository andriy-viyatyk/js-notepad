import styled from "@emotion/styled";

import { TAG_COLORS } from "../../theme/palette-colors";
import color from "../../theme/color";
import { fontSize, radius, spacing } from "../../uikit/tokens";
import type { GitRef, GitRefKind } from "../../../ipc/git-ipc";

// A decoration-ref chip (branch / tag / HEAD / remote). Shared by the Git Tree
// commit grid (subject column) and the Commit info panel (US-629). Lives in
// components/ so it may use Emotion (accepted precedent for this folder — cf.
// GitStatusBadge). Colors picked from the shared palette by name (theme-safe,
// no raw hardcodes): branch = blue, remote = lighter blue, tag = pink, HEAD =
// green.
const paletteHex = (name: string) =>
    TAG_COLORS.find((c) => c.name === name)?.hex ?? color.text.default;

export const REF_COLOR: Record<GitRefKind, string> = {
    head: paletteHex("Lime Green"),
    branch: paletteHex("Dodger Blue"),
    remote: paletteHex("Cornflower Blue"),
    tag: paletteHex("Hot Pink"),
};

const Chip = styled.span({
    display: "inline-block",
    flexShrink: 0, // chips keep their size; an adjacent TruncatedText absorbs shrink
    marginRight: spacing.sm,
    padding: `0 ${spacing.sm}px`,
    borderRadius: radius.xs,
    fontSize: fontSize.xs,
    fontWeight: 600,
    border: `1px solid ${color.border.default}`,
    // `color` (text) is set per-kind inline; border stays neutral.
});

export function RefBadge({ refData }: { refData: GitRef }) {
    return <Chip style={{ color: REF_COLOR[refData.kind] }}>{refData.name}</Chip>;
}
