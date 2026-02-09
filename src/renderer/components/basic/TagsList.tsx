import styled from "@emotion/styled";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import color from "../../theme/color";
import { ChevronLeftIcon, ChevronRightIcon } from "../../theme/icons";

// =============================================================================
// Styles
// =============================================================================

const TagsListRoot = styled.div({
    display: "flex",
    flexDirection: "column",
    overflow: "auto",
    fontSize: 13,
    width: "100%",

    "& .tag-item": {
        display: "flex",
        alignItems: "center",
        padding: "4px 8px",
        cursor: "pointer",
        color: color.text.light,
        "&:hover": {
            backgroundColor: color.background.light,
        },
        "&.selected": {
            color: color.misc.blue,
        },
    },

    "& .tag-name": {
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },

    "& .tag-count": {
        marginLeft: 8,
        fontSize: 12,
        color: color.text.light,
    },

    "& .tag-expand": {
        width: 16,
        height: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 4,
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

    // Sticky back header when viewing subcategories
    "& .back-header": {
        position: "sticky",
        top: 0,
        backgroundColor: color.background.default,
        borderBottom: `1px solid ${color.border.light}`,
        zIndex: 1,
    },
});

// =============================================================================
// Types
// =============================================================================

export interface TagsListProps {
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
    /** Additional class name */
    className?: string;
}

interface TagGroup {
    /** Display name */
    name: string;
    /** Full tag value for selection */
    value: string;
    /** Has subcategories to drill into */
    hasChildren: boolean;
}

interface SubTag {
    /** Display name (part after separator) */
    name: string;
    /** Full tag value for selection */
    value: string;
}

// =============================================================================
// Component
// =============================================================================

export function TagsList(props: TagsListProps) {
    const {
        tags,
        value,
        onChange,
        getCount,
        separator = ":",
        rootLabel = "All",
        className,
    } = props;

    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

    // Sync expandedCategory with external value changes (e.g., from Breadcrumb navigation)
    useEffect(() => {
        if (value === "") {
            // Root selected - collapse to top level
            setExpandedCategory(null);
        } else if (value.includes(separator)) {
            // Categorized tag - expand to its parent
            const sepIndex = value.indexOf(separator);
            const parentName = value.slice(0, sepIndex);
            setExpandedCategory(parentName);
        } else {
            // Simple tag - collapse to top level
            setExpandedCategory(null);
        }
    }, [value, separator]);

    // Parse tags into groups
    const { groups, subTags } = useMemo(() => {
        const simpleGroups: TagGroup[] = [];
        const categoryGroups = new Map<string, TagGroup>();
        const childrenMap = new Map<string, SubTag[]>();

        for (const tag of tags) {
            const sepIndex = tag.indexOf(separator);

            if (sepIndex === -1) {
                // Simple tag (no separator)
                simpleGroups.push({
                    name: tag,
                    value: tag,
                    hasChildren: false,
                });
            } else {
                // Has separator - categorized tag
                const parentName = tag.slice(0, sepIndex);
                const childPart = tag.slice(sepIndex + 1);
                const parentValue = parentName + separator;

                // Ensure parent category exists
                if (!categoryGroups.has(parentName)) {
                    categoryGroups.set(parentName, {
                        name: parentName,
                        value: parentValue,
                        hasChildren: false,
                    });
                }

                // If there's a child part, add it to children
                if (childPart) {
                    if (!childrenMap.has(parentName)) {
                        childrenMap.set(parentName, []);
                    }
                    childrenMap.get(parentName)!.push({
                        name: childPart,
                        value: tag,
                    });

                    // Mark parent as having children
                    categoryGroups.get(parentName)!.hasChildren = true;
                }
                // If no child part (e.g., "release:"), it's just a parent marker
            }
        }

        // Combine and sort: simple tags first within same name, then alphabetically
        const allGroups = [
            ...simpleGroups,
            ...Array.from(categoryGroups.values()),
        ].sort((a, b) => {
            const nameCompare = a.name.localeCompare(b.name);
            if (nameCompare !== 0) return nameCompare;
            // Same name: simple tags first, then categories
            return a.hasChildren ? 1 : -1;
        });

        // Sort children alphabetically
        for (const children of childrenMap.values()) {
            children.sort((a, b) => a.name.localeCompare(b.name));
        }

        return {
            groups: allGroups,
            subTags: childrenMap,
        };
    }, [tags, separator]);

    // Get count for display
    const getDisplayCount = (tagValue: string) => {
        return getCount?.(tagValue);
    };

    // Check if a tag is selected (exact match or starts with for parent selection)
    const isSelected = (tagValue: string) => {
        if (value === tagValue) return true;
        // Parent is selected if value starts with parent value (e.g., value="release:1.0.1" starts with "release:")
        if (tagValue.endsWith(separator) && value.startsWith(tagValue)) return true;
        return false;
    };

    // Handle item click
    const handleItemClick = (tagValue: string) => {
        onChange(tagValue);
    };

    // Handle expand click (drill into subcategories)
    const handleExpandClick = (e: React.MouseEvent, groupName: string) => {
        e.stopPropagation();
        setExpandedCategory(groupName);
        // Select the parent category when expanding
        onChange(groupName + separator);
    };

    // Handle back click
    const handleBackClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedCategory(null);
    };

    // Render expanded view (subcategories)
    if (expandedCategory !== null) {
        const children = subTags.get(expandedCategory) || [];
        const parentValue = expandedCategory + separator;
        const parentCount = getDisplayCount(parentValue);

        return (
            <TagsListRoot className={className}>
                {/* Sticky back header */}
                <div
                    className={clsx("tag-item", "back-header", {
                        selected: isSelected(parentValue),
                    })}
                    onClick={() => handleItemClick(parentValue)}
                >
                    <span
                        className="tag-expand"
                        onClick={handleBackClick}
                    >
                        <ChevronLeftIcon />
                    </span>
                    <span className="tag-name">{expandedCategory}</span>
                    {parentCount !== undefined && (
                        <span className="tag-count">{parentCount}</span>
                    )}
                </div>

                {/* Subcategories */}
                {children.map((child) => {
                    const count = getDisplayCount(child.value);
                    return (
                        <div
                            key={child.value}
                            className={clsx("tag-item", {
                                selected: value === child.value,
                            })}
                            onClick={() => handleItemClick(child.value)}
                        >
                            {/* Spacer for alignment */}
                            <span className="tag-expand" />
                            <span className="tag-name">{child.name}</span>
                            {count !== undefined && (
                                <span className="tag-count">{count}</span>
                            )}
                        </div>
                    );
                })}
            </TagsListRoot>
        );
    }

    // Total count for "All" option
    const totalCount = getDisplayCount("");

    // Render top-level groups
    return (
        <TagsListRoot className={className}>
            {/* "All" option to clear tag filter */}
            <div
                className={clsx("tag-item", { selected: value === "" })}
                onClick={() => handleItemClick("")}
            >
                <span className="tag-expand" />
                <span className="tag-name">{rootLabel}</span>
                {totalCount !== undefined && (
                    <span className="tag-count">{totalCount}</span>
                )}
            </div>

            {groups.map((group) => {
                const count = getDisplayCount(group.value);
                const selected = isSelected(group.value);

                return (
                    <div
                        key={group.value}
                        className={clsx("tag-item", { selected })}
                        onClick={() => handleItemClick(group.value)}
                    >
                        {group.hasChildren ? (
                            <span
                                className="tag-expand"
                                onClick={(e) => handleExpandClick(e, group.name)}
                            >
                                <ChevronRightIcon />
                            </span>
                        ) : (
                            <span className="tag-expand" />
                        )}
                        <span className="tag-name">{group.name}</span>
                        {count !== undefined && (
                            <span className="tag-count">{count}</span>
                        )}
                    </div>
                );
            })}
        </TagsListRoot>
    );
}
