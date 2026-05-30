import React, { useEffect, useMemo, useState } from "react";
import { ListBox, IListBoxItem, ListItemRenderContext } from "../../uikit/ListBox";
import { Panel } from "../../uikit/Panel";
import { ChevronLeftIcon, ChevronRightIcon } from "../../theme/icons";
import color from "../../theme/color";

// =============================================================================
// Types
// =============================================================================

export interface TagsListViewProps {
    /** All unique tags */
    tags: string[];
    /** Selected tag value: "" | "dev" | "release:" | "release:1.0.1" (empty = All) */
    value: string;
    /** Called when selection changes */
    onChange: (value: string) => void;
    /** Get count for a tag (receives full tag, parent with separator, or empty string for total) */
    getCount?: (tag: string) => number | undefined;
    /** Category separator (default: ":") */
    separator?: string;
    /** Label for the "All" option (default: "All") */
    rootLabel?: string;
}

interface TagItem extends IListBoxItem {
    value: string;
    name: string;
    count?: number;
    hasChildren?: boolean;
    isAll?: boolean;
    isBack?: boolean;
}

interface TagGroup {
    name: string;
    value: string;
    hasChildren: boolean;
}

interface SubTag {
    name: string;
    value: string;
}

// =============================================================================
// Component
// =============================================================================

export function TagsListView(props: TagsListViewProps) {
    const {
        tags,
        value,
        onChange,
        getCount,
        separator = ":",
        rootLabel = "All",
    } = props;

    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

    // Sync expandedCategory with external value changes (e.g. Breadcrumb navigation)
    useEffect(() => {
        if (value === "") {
            setExpandedCategory(null);
        } else if (value.includes(separator)) {
            const sepIndex = value.indexOf(separator);
            const parentName = value.slice(0, sepIndex);
            setExpandedCategory(parentName);
        } else {
            setExpandedCategory(null);
        }
    }, [value, separator]);

    // Parse tags into groups + per-parent children map
    const { groups, subTags } = useMemo(() => {
        const simpleGroups: TagGroup[] = [];
        const categoryGroups = new Map<string, TagGroup>();
        const childrenMap = new Map<string, SubTag[]>();

        for (const tag of tags) {
            const sepIndex = tag.indexOf(separator);

            if (sepIndex === -1) {
                simpleGroups.push({ name: tag, value: tag, hasChildren: false });
            } else {
                const parentName = tag.slice(0, sepIndex);
                const childPart = tag.slice(sepIndex + 1);
                const parentValue = parentName + separator;

                if (!categoryGroups.has(parentName)) {
                    categoryGroups.set(parentName, {
                        name: parentName,
                        value: parentValue,
                        hasChildren: false,
                    });
                }

                if (childPart) {
                    if (!childrenMap.has(parentName)) {
                        childrenMap.set(parentName, []);
                    }
                    childrenMap.get(parentName).push({ name: childPart, value: tag });
                    categoryGroups.get(parentName).hasChildren = true;
                }
            }
        }

        const allGroups = [
            ...simpleGroups,
            ...Array.from(categoryGroups.values()),
        ].sort((a, b) => {
            const nameCompare = a.name.localeCompare(b.name);
            if (nameCompare !== 0) return nameCompare;
            return a.hasChildren ? 1 : -1;
        });

        for (const children of childrenMap.values()) {
            children.sort((a, b) => a.name.localeCompare(b.name));
        }

        return { groups: allGroups, subTags: childrenMap };
    }, [tags, separator]);

    // Compute items per current view (top-level vs drilled-in)
    const items = useMemo<TagItem[]>(() => {
        if (expandedCategory === null) {
            const out: TagItem[] = [
                {
                    value: "",
                    name: rootLabel,
                    label: rootLabel,
                    count: getCount?.(""),
                    isAll: true,
                },
            ];
            for (const g of groups) {
                out.push({
                    value: g.value,
                    name: g.name,
                    label: g.name,
                    count: getCount?.(g.value),
                    hasChildren: g.hasChildren,
                });
            }
            return out;
        }

        const parentValue = expandedCategory + separator;
        const out: TagItem[] = [
            {
                value: parentValue,
                name: expandedCategory,
                label: expandedCategory,
                count: getCount?.(parentValue),
                isBack: true,
            },
        ];
        const children = subTags.get(expandedCategory) || [];
        for (const child of children) {
            out.push({
                value: child.value,
                name: child.name,
                label: child.name,
                count: getCount?.(child.value),
            });
        }
        return out;
    }, [expandedCategory, groups, subTags, rootLabel, separator, getCount]);

    // Selection predicate — exact match OR parent prefix
    const isSelected = (item: TagItem): boolean => {
        if (item.value === value) return true;
        if (item.value.endsWith(separator) && value.startsWith(item.value) && value !== "") {
            return true;
        }
        return false;
    };

    const renderItem = (ctx: ListItemRenderContext<TagItem>): React.ReactNode => {
        const item = ctx.source;
        return (
            <div
                data-selected={ctx.selected || undefined}
                style={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    height: "100%",
                    boxSizing: "border-box",
                    paddingLeft: 8,
                    paddingRight: 8,
                    backgroundColor: ctx.selected ? color.background.selection : undefined,
                    color: ctx.selected ? color.text.selection : color.text.light,
                }}
            >
                {item.isBack ? (
                    <span
                        onClick={(e) => {
                            e.stopPropagation();
                            setExpandedCategory(null);
                        }}
                        style={{
                            width: 16,
                            height: 16,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 4,
                            cursor: "pointer",
                        }}
                    >
                        <ChevronLeftIcon style={{ width: 12, height: 12 }} />
                    </span>
                ) : item.hasChildren ? (
                    <span
                        onClick={(e) => {
                            e.stopPropagation();
                            setExpandedCategory(item.name);
                            onChange(item.value);
                        }}
                        style={{
                            width: 16,
                            height: 16,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 4,
                            cursor: "pointer",
                        }}
                    >
                        <ChevronRightIcon style={{ width: 12, height: 12 }} />
                    </span>
                ) : (
                    <span style={{ width: 16, marginRight: 4 }} />
                )}

                <span
                    style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {item.name}
                </span>

                {item.count !== undefined && (
                    <span style={{ marginLeft: 8, fontSize: 12 }}>
                        {item.count}
                    </span>
                )}
            </div>
        );
    };

    return (
        <Panel name="notebook-tags-list" direction="column" flex={1} overflow="hidden" width="100%">
            <ListBox<TagItem>
                name="notebook-tags-listbox"
                items={items}
                isSelected={isSelected}
                onChange={(item) => onChange(item.value)}
                renderItem={renderItem}
                variant="browse"
                rowHeight={26}
            />
        </Panel>
    );
}
