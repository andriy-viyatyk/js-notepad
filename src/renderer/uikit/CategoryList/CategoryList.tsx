import React, { useEffect, useMemo, useState } from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { fontSize, spacing } from "../tokens";
import { ChevronLeftIcon, ChevronRightIcon } from "../../theme/icons";

// --- Types ---

export interface CategoryListProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** All values shown by the list. */
    items: string[];
    /** Currently selected value ("" selects the root pseudo-item). Controlled. */
    value: string;
    /** Called when the user picks a row. */
    onChange: (value: string) => void;
    /**
     * Per-row count display. Receives the full value, parent-with-separator, or "" for the
     * root pseudo-item. Returning `undefined` suppresses the count for that row.
     */
    getCount?: (value: string) => number | undefined;
    /**
     * Separator that triggers drill-in for parent rows. Pass `"\0"` to disable drill-in
     * entirely (the list then behaves as a flat list). Default: `":"`.
     */
    separator?: string;
    /** Label for the root pseudo-item. Default: `"All"`. */
    rootLabel?: React.ReactNode;
}

interface CategoryGroup {
    /** Display name */
    name: string;
    /** Full value for selection */
    value: string;
    /** Has subcategories to drill into */
    hasChildren: boolean;
}

interface SubCategory {
    /** Display name (part after separator) */
    name: string;
    /** Full value for selection */
    value: string;
}

// --- Styled ---

const Root = styled.div(
    {
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
        fontSize: fontSize.md,
        width: "100%",

        '& [data-part="row"]': {
            display: "flex",
            alignItems: "center",
            padding: `${spacing.sm}px ${spacing.md}px`,
            cursor: "pointer",
            color: color.text.light,
            "&:hover": {
                backgroundColor: color.background.light,
            },
            "&[data-selected]": {
                color: color.misc.blue,
            },
        },

        '& [data-part="name"]': {
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
        },

        '& [data-part="count"]': {
            marginLeft: spacing.md,
            fontSize: fontSize.sm,
            color: color.text.light,
        },

        '& [data-part="expand"]': {
            width: 16,
            height: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginRight: spacing.sm,
            flexShrink: 0,
            color: color.text.light,
            "&:hover": {
                color: color.text.default,
            },
            "& svg": {
                width: 12,
                height: 12,
            },
        },

        // Sticky back header when drilled in
        '& [data-part="row"][data-state="open"]': {
            position: "sticky",
            top: 0,
            backgroundColor: color.background.default,
            borderBottom: `1px solid ${color.border.light}`,
            zIndex: 1,
        },
    },
    { label: "CategoryList" },
);

// --- Component ---

export function CategoryList({
    name,
    items,
    value,
    onChange,
    getCount,
    separator = ":",
    rootLabel = "All",
    ...rest
}: CategoryListProps) {
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

    // Sync expandedCategory with external value changes (e.g., Breadcrumb navigation)
    useEffect(() => {
        if (value === "") {
            setExpandedCategory(null);
        } else if (value.includes(separator)) {
            const sepIndex = value.indexOf(separator);
            setExpandedCategory(value.slice(0, sepIndex));
        } else {
            setExpandedCategory(null);
        }
    }, [value, separator]);

    const { groups, subCategories } = useMemo(() => {
        const simpleGroups: CategoryGroup[] = [];
        const parentGroups = new Map<string, CategoryGroup>();
        const childrenMap = new Map<string, SubCategory[]>();

        for (const item of items) {
            const sepIndex = item.indexOf(separator);

            if (sepIndex === -1) {
                simpleGroups.push({ name: item, value: item, hasChildren: false });
            } else {
                const parentName = item.slice(0, sepIndex);
                const childPart = item.slice(sepIndex + 1);
                const parentValue = parentName + separator;

                if (!parentGroups.has(parentName)) {
                    parentGroups.set(parentName, {
                        name: parentName,
                        value: parentValue,
                        hasChildren: false,
                    });
                }

                if (childPart) {
                    if (!childrenMap.has(parentName)) {
                        childrenMap.set(parentName, []);
                    }
                    childrenMap.get(parentName).push({
                        name: childPart,
                        value: item,
                    });

                    parentGroups.get(parentName).hasChildren = true;
                }
            }
        }

        const allGroups = [
            ...simpleGroups,
            ...Array.from(parentGroups.values()),
        ].sort((a, b) => {
            const nameCompare = a.name.localeCompare(b.name);
            if (nameCompare !== 0) return nameCompare;
            return a.hasChildren ? 1 : -1;
        });

        for (const children of childrenMap.values()) {
            children.sort((a, b) => a.name.localeCompare(b.name));
        }

        return { groups: allGroups, subCategories: childrenMap };
    }, [items, separator]);

    const isSelected = (rowValue: string) => {
        if (value === rowValue) return true;
        if (rowValue.endsWith(separator) && value.startsWith(rowValue)) return true;
        return false;
    };

    const handleRowClick = (rowValue: string) => {
        onChange(rowValue);
    };

    const handleExpandClick = (e: React.MouseEvent, groupName: string) => {
        e.stopPropagation();
        setExpandedCategory(groupName);
        onChange(groupName + separator);
    };

    const handleBackClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedCategory(null);
    };

    if (expandedCategory !== null) {
        const children = subCategories.get(expandedCategory) || [];
        const parentValue = expandedCategory + separator;
        const parentCount = getCount?.(parentValue);

        return (
            <Root data-type="category-list" data-name={name} className="scroll-container" {...rest}>
                <div
                    data-part="row"
                    data-state="open"
                    data-selected={isSelected(parentValue) || undefined}
                    onClick={() => handleRowClick(parentValue)}
                >
                    <span data-part="expand" onClick={handleBackClick}>
                        <ChevronLeftIcon />
                    </span>
                    <span data-part="name">{expandedCategory}</span>
                    {parentCount !== undefined && (
                        <span data-part="count">{parentCount}</span>
                    )}
                </div>
                {children.map((child) => {
                    const count = getCount?.(child.value);
                    return (
                        <div
                            key={child.value}
                            data-part="row"
                            data-selected={value === child.value || undefined}
                            onClick={() => handleRowClick(child.value)}
                        >
                            <span data-part="expand" />
                            <span data-part="name">{child.name}</span>
                            {count !== undefined && (
                                <span data-part="count">{count}</span>
                            )}
                        </div>
                    );
                })}
            </Root>
        );
    }

    const totalCount = getCount?.("");

    return (
        <Root data-type="category-list" data-name={name} className="scroll-container" {...rest}>
            <div
                data-part="row"
                data-selected={value === "" || undefined}
                onClick={() => handleRowClick("")}
            >
                <span data-part="expand" />
                <span data-part="name">{rootLabel}</span>
                {totalCount !== undefined && (
                    <span data-part="count">{totalCount}</span>
                )}
            </div>

            {groups.map((group) => {
                const count = getCount?.(group.value);
                const selected = isSelected(group.value);

                return (
                    <div
                        key={group.value}
                        data-part="row"
                        data-selected={selected || undefined}
                        onClick={() => handleRowClick(group.value)}
                    >
                        {group.hasChildren ? (
                            <span
                                data-part="expand"
                                onClick={(e) => handleExpandClick(e, group.name)}
                            >
                                <ChevronRightIcon />
                            </span>
                        ) : (
                            <span data-part="expand" />
                        )}
                        <span data-part="name">{group.name}</span>
                        {count !== undefined && (
                            <span data-part="count">{count}</span>
                        )}
                    </div>
                );
            })}
        </Root>
    );
}
