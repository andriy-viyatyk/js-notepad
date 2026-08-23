import type { ReactElement } from "react";
import { mountVanilla, type VanillaViewCtor } from "../../uikit/shared/mount";
import { AppPageManagerView, type AppPageManagerProps } from "./AppPageManagerView";

export type { AppPageManagerProps } from "./AppPageManagerView";

export function AppPageManager(props: AppPageManagerProps): ReactElement {
    return mountVanilla(
        AppPageManagerView as VanillaViewCtor<AppPageManagerProps>,
        props,
    );
}
