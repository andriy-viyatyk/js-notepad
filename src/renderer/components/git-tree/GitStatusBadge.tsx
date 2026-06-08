import styled from "@emotion/styled";
import { TAG_COLORS } from "../../theme/palette-colors";
import color from "../../theme/color";

// Status badge for a changed file (EPIC-031 / US-616). Lives in components/ so
// it may use Emotion (accepted precedent for this folder — cf. GitTree.tsx ref
// tags). Colors come from the shared TAG_COLORS palette by name (theme-safe, no
// raw hex), mirroring GitTree's REF_COLOR approach.

const paletteHex = (name: string) =>
    TAG_COLORS.find((c) => c.name === name)?.hex ?? color.text.default;

// git status codes → (letter, palette color). Untracked ('?') is shown as "U"
// (a new file), green like an addition. Falls back to the raw code, neutral.
const STATUS_META: Record<string, { letter: string; colorName: string }> = {
    M: { letter: "M", colorName: "Orange" },       // modified
    A: { letter: "A", colorName: "Lime Green" },   // added (staged)
    D: { letter: "D", colorName: "Tomato" },       // deleted
    R: { letter: "R", colorName: "Dodger Blue" },  // renamed
    C: { letter: "C", colorName: "Lime Green" },   // copied
    U: { letter: "U", colorName: "Tomato" },       // unmerged / conflict
    "?": { letter: "U", colorName: "Lime Green" }, // untracked (new file)
};

const Badge = styled.span({
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1,
    paddingLeft: 6,
    userSelect: "none",
});

export function GitStatusBadge({ status }: { status: string }) {
    const meta = STATUS_META[status];
    const letter = meta?.letter ?? status;
    const hex = meta ? paletteHex(meta.colorName) : color.text.light;
    return (
        <Badge data-type="git-status-badge" title={status} style={{ color: hex }}>
            {letter}
        </Badge>
    );
}
