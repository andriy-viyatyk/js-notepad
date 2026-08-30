import type { ITreeItem } from "../../uikit/Tree";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";

export interface CategoryItem extends ITreeItem {
    value: string;
    category: string;
    items?: CategoryItem[];
}

type CategoriesMap = {
    [key: string]: { category: string; map?: CategoriesMap };
};

function createCategoryLabel(name: string, size: number | undefined): Node {
    // `width: "100%"` and NOT `flex: true` + `width: 0`: the Tree's `.label` host is a plain
    // block, so a flex-grow on this element is inert and an explicit `width: 0` wins outright —
    // the name collapsed to zero width and only the shrink-proof count stayed visible. The previous implementation
    // wrapped its parts in a `display: flex; width: 100%; min-width: 0` span for exactly this reason; mirror it.
    const label = createPanelElement({
        name: "notebook-category-label",
        direction: "row",
        align: "center",
        width: "100%",
        minWidth: 0,
        overflow: "hidden",
        gap: "sm",
    });
    // The name takes the remaining width and ellipsizes; the count never shrinks.
    const text = createTextElement(name, { truncate: true });
    text.style.flex = "1 1 auto";
    text.style.minWidth = "0";
    label.append(text);
    if (size !== undefined) {
        const count = createTextElement(String(size), { color: "light", size: "sm" });
        count.style.flexShrink = "0";
        label.append(count);
    }
    return label;
}

function buildChildren(
    node: CategoriesMap,
    getSize: (category: string) => number | undefined,
): CategoryItem[] {
    const result: CategoryItem[] = [];
    for (const key of Object.keys(node).sort()) {
        const entry = node[key];
        const item: CategoryItem = {
            value: entry.category,
            category: entry.category,
            label: createCategoryLabel(key, getSize(entry.category)),
        };
        if (entry.map) {
            item.items = buildChildren(entry.map, getSize);
        }
        result.push(item);
    }
    return result;
}

export function buildCategoryTreeItems(
    categories: string[],
    getSize: (category: string) => number | undefined,
    rootLabel = "All",
): CategoryItem[] {
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
                current = current[part].map;
            }
        });
    });

    const root: CategoryItem = {
        value: "",
        category: "",
        label: createCategoryLabel(rootLabel, getSize("")),
        items: buildChildren(map, getSize),
    };

    return [root];
}
