import type React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import { PageTabsView } from "./PageTabsView";

export function PageTabs(props: object): React.ReactElement {
    return mountVanilla(PageTabsView, props);
}
