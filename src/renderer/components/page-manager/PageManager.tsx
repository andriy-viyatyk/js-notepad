import type { ReactElement } from "react";
import { mountVanilla, type VanillaViewCtor } from "../../uikit/shared/mount";
import { PageManagerView, type PageManagerProps } from "./PageManagerView";

export type { PageManagerProps } from "./PageManagerView";

export function PageManager(props: PageManagerProps): ReactElement {
    return mountVanilla(
        PageManagerView as VanillaViewCtor<PageManagerProps>,
        props,
    );
}
