import React from "react";
import { mountVanilla } from "../shared/mount";
import { TreeView } from "./TreeView";
import { ITreeItem, TreeProps } from "./types";

// --- Component ---

function TreeShim<T = ITreeItem>(props: TreeProps<T>) {
    return mountVanilla(
        TreeView as unknown as new (props: TreeProps<T>) => TreeView<T>,
        props,
    );
}

export const Tree = TreeShim as <T = ITreeItem>(
    props: TreeProps<T>,
) => React.ReactElement | null;

// Re-export public types and the trait key from the canonical location.
export { TREE_ITEM_KEY } from "./types";
export type {
    ITreeItem,
    TreeProps,
    TreeRow,
    TreeItemRenderContext,
} from "./types";
