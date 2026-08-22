import { TAG_COLORS } from "../../theme/palette-colors";
import color from "../../theme/color";

const paletteHex = (name: string) => TAG_COLORS.find((c) => c.name === name)?.hex ?? color.text.default;
const STATUS_META: Record<string, { letter: string; colorName: string }> = {
    M: { letter: "M", colorName: "Orange" }, A: { letter: "A", colorName: "Lime Green" },
    D: { letter: "D", colorName: "Tomato" }, R: { letter: "R", colorName: "Dodger Blue" },
    C: { letter: "C", colorName: "Lime Green" }, U: { letter: "U", colorName: "Tomato" },
    "?": { letter: "U", colorName: "Lime Green" },
};

export function gitStatusMeta(status: string): { letter: string; hex: string } {
    const meta = STATUS_META[status];
    return { letter: meta?.letter ?? status, hex: meta ? paletteHex(meta.colorName) : color.text.light };
}

export function gitStatusMarkup(status: string): string {
    const { letter, hex } = gitStatusMeta(status);
    return `<span class="git-status-badge" title="${status}" style="color:${hex}">${letter}</span>`;
}
