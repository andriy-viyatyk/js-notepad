import { mountVanilla } from "../../uikit/shared/mount";
import { FindBarView } from "./FindBarView";
import type { FindBarProps } from "./FindBarView";

export type { FindBarProps } from "./FindBarView";

export function FindBar(props: FindBarProps) {
    return mountVanilla(FindBarView, props);
}
