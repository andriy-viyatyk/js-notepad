import { TAG_COLORS } from "../../theme/palette-colors";
import color from "../../theme/color";
import type { GitRefKind } from "../../../ipc/git-ipc";

const paletteHex = (name: string) =>
    TAG_COLORS.find((c) => c.name === name)?.hex ?? color.text.default;

/** Palette colours shared by the native grid renderer and the React ref chip. */
export const REF_COLOR: Record<GitRefKind, string> = {
    head: paletteHex("Lime Green"),
    branch: paletteHex("Dodger Blue"),
    remote: paletteHex("Cornflower Blue"),
    tag: paletteHex("Hot Pink"),
};
