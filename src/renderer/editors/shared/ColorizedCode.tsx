import { mountVanilla } from "../../uikit/shared/mount";
import { ColorizedCodeView } from "./ColorizedCodeView";
import type { ColorizedCodeProps } from "./ColorizedCodeView";

export type { ColorizedCodeProps } from "./ColorizedCodeView";

export function ColorizedCode(props: ColorizedCodeProps) {
    return mountVanilla(ColorizedCodeView, props);
}
