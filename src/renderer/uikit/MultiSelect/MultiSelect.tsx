import React from "react";
import { mountVanilla } from "../shared/mount";
import { IListBoxItem } from "../ListBox";
import { MultiSelectView } from "./MultiSelectView";
import type { MultiSelectProps } from "./MultiSelectModel";

// =============================================================================
// Component
// =============================================================================

type MultiSelectShimProps<T> = MultiSelectProps<T> & { ref?: React.Ref<HTMLInputElement> };

function MultiSelectShim<T = IListBoxItem>(props: MultiSelectShimProps<T>) {
    return mountVanilla(
        MultiSelectView as unknown as new (props: MultiSelectShimProps<T>) => MultiSelectView<T>,
        props,
    );
}

export const MultiSelect = MultiSelectShim as <T = IListBoxItem>(
    props: MultiSelectShimProps<T>,
) => React.ReactElement | null;

// Re-export public types from canonical location.
export type { MultiSelectProps } from "./MultiSelectModel";
