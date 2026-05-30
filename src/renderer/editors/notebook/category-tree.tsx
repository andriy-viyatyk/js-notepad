import React from "react";
import type { ITreeItem } from "../../uikit/Tree";
import color from "../../theme/color";

export interface CategoryItem extends ITreeItem {
    value: string;
    category: string;
    items?: CategoryItem[];
}

type CategoriesMap = {
    [key: string]: { category: string; map?: CategoriesMap };
};

function renderLabel(name: string, size: number | undefined): React.ReactNode {
    return (
        <span style={{ display: "flex", alignItems: "center", width: "100%" }}>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                {name}
            </span>
            {size !== undefined && (
                <span style={{ marginLeft: 4, fontSize: 12, color: color.text.light }}>
                    {size}
                </span>
            )}
        </span>
    );
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
            label: renderLabel(key, getSize(entry.category)),
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
        label: renderLabel(rootLabel, getSize("")),
        items: buildChildren(map, getSize),
    };

    return [root];
}
