import React from "react";
import { mountVanilla } from "../shared/mount";
import { ListBoxView } from "./ListBoxView";
import { IListBoxItem, ListBoxProps } from "./types";

// --- Component ---

function ListBoxShim<T = IListBoxItem>(props: ListBoxProps<T>) {
    return mountVanilla(
        ListBoxView as unknown as new (props: ListBoxProps<T>) => ListBoxView<T>,
        props,
    );
}

export const ListBox = ListBoxShim as <T = IListBoxItem>(
    props: ListBoxProps<T>,
) => React.ReactElement | null;

// Re-export public types and the trait key from the canonical location, so consumers
// can `import { LIST_ITEM_KEY, ListBoxProps } from "./ListBox"`.
export {
    LIST_ITEM_KEY,
} from "./types";
export type {
    IListBoxItem,
    ListBoxProps,
    ListItemRenderContext,
} from "./types";
