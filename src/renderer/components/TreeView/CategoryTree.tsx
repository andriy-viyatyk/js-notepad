import { useCallback, useMemo } from "react";
import { splitWithSeparators } from "../../core/utils/utils";
import { TreeView } from "./TreeView";
import { TreeItem, TreeViewProps } from "./TreeView.model";

export interface CategoryTreeItem extends TreeItem {
    type: "category" | string;
    category: string;
}

export interface CategoryTreeProps<
    T extends CategoryTreeItem = CategoryTreeItem,
> extends Omit<TreeViewProps<T>, "root" | "getLabel" | "getId"> {
    categories: string[];
    separators?: string;
    rootLabel?: string;
    getLabel?: (item: T) => React.ReactNode;
    getId?: (item: T) => string;
}

type CategoriesMap = {
    [key: string]: { category: string; map?: CategoriesMap };
};

function buildCategoryTreeItem(map: CategoriesMap, root: CategoryTreeItem) {
    Object.keys(map).forEach((key) => {
        const item = map[key];
        const treeItem: CategoryTreeItem = {
            type: "category",
            category: item.category,
        };
        root.items = root.items ?? [];
        root.items.push(treeItem);
        if (item.map) {
            buildCategoryTreeItem(item.map, treeItem);
        }
    });

    return root;
}

function buildRoot(categories: string[]): CategoryTreeItem {
    const sortedCategories = [...categories].sort();

    const map: CategoriesMap = {};
    sortedCategories.forEach((category) => {
        const parts = category.split("/");
        let current = map;
        let path = "";
        parts.forEach((part, idx) => {
            path = path ? `${path}/${part}` : part;
            if (!current[part]) {
                current[part] = { category: path };
            }
            if (idx < parts.length - 1) {
                current[part].map = current[part].map ?? {};
                current = current[part].map!;
            }
        });
    });

    const root = buildCategoryTreeItem(map, {
        type: "category",
        category: "",
    });

    return root;
}

export function CategoryTree<T extends CategoryTreeItem = CategoryTreeItem>(
    props: CategoryTreeProps<T>,
) {
    const {
        categories,
        separators = "/\\",
        rootLabel = "Categories",
        getLabel: propsGetLabel,
        getId: propsGetId,
        ...other
    } = props;

    const root = useMemo(() => {
        return buildRoot(props.categories) as T;
    }, [props.categories]);

    const getLabel = useCallback(
        (item: T) => {
            if (propsGetLabel) {
                return propsGetLabel(item);
            }
            const label =
                splitWithSeparators(item.category, separators).pop() || "";
            return label || rootLabel;
        },
        [propsGetLabel, separators, rootLabel],
    );

    const getId = useCallback(
        (item: T) => {
            if (item.type === "category") {
                return `category-${item.category}`;
            }
            if (!propsGetId) {
                throw new Error(
                    "CategoryTree: getId prop is required for non-category items",
                );
            }
            return propsGetId(item);
        },
        [propsGetId],
    );

    return (
        <TreeView {...other} root={root} getLabel={getLabel} getId={getId} />
    );
}
