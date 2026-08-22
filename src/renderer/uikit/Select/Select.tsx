import React from "react";
import { mountVanilla } from "../shared/mount";
import { IListBoxItem } from "../ListBox";
import { SelectView } from "./SelectView";
import type { SelectProps } from "./SelectModel";

// =============================================================================
// Component
// =============================================================================

type SelectShimProps<T> = SelectProps<T> & { ref?: React.Ref<HTMLInputElement> };

function SelectShim<T = IListBoxItem>(props: SelectShimProps<T>) {
    return mountVanilla(
        SelectView as unknown as new (props: SelectShimProps<T>) => SelectView<T>,
        props,
    );
}

export const Select = SelectShim as <T = IListBoxItem>(
    props: SelectShimProps<T>,
) => React.ReactElement | null;

// Re-export public types from canonical location.
export type { SelectProps, ItemsSource, SelectItemsResult } from "./SelectModel";
