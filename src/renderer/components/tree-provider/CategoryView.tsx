import React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import { CategoryViewImpl } from "./CategoryViewImpl";
import type { CategoryViewProps } from "./CategoryViewModel";

export type { CategoryViewProps, CategoryViewMode, CategoryItemsRendererProps } from "./CategoryViewModel";

export function CategoryView(props: CategoryViewProps): React.ReactElement {
    return mountVanilla(CategoryViewImpl, props);
}
