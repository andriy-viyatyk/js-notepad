import type React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import { PageContentView } from "./PageContentView";

export function PageContentBridge({ pageId }: { pageId: string }): React.ReactElement {
    return mountVanilla(PageContentView, { pageId });
}
