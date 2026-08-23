import React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import { TreeProviderViewImpl } from "./TreeProviderViewImpl";
import type {
    TreeProviderViewModel,
    TreeProviderViewProps,
    TreeProviderViewSavedState,
} from "./TreeProviderViewModel";

export type { TreeProviderViewProps, TreeProviderViewSavedState };

export function TreeProviderView(
    props: TreeProviderViewProps & {
        onModel?: (model: TreeProviderViewModel | null) => void;
    },
): React.ReactElement {
    return mountVanilla(TreeProviderViewImpl, props);
}
