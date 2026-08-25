import React, { useMemo, useState } from "react";
import { ListBox, IListBoxItem, ListItemRenderContext } from "./ListBox";
import { ListItem } from "./ListItem";
import { IconButton } from "../IconButton/IconButton";
import { Panel } from "../Panel/Panel";
import { ContextMenuEvent } from "../../api/events/events";
import type { MenuItem } from "../Menu";
import { Story } from "../../editors/storybook/storyTypes";

// Built once at the largest size the story offers and sliced per render, so changing `rowCount`
// does not re-allocate 10,000 objects and the `items` identity stays stable for the repaint gate.
const MAX_REGULAR_ITEMS = 10000;
const REGULAR_ITEMS: IListBoxItem[] = Array.from({ length: MAX_REGULAR_ITEMS }, (_, i) => ({
    value: i,
    label: `Suggestion ${i} — apple banana cherry`,
    icon: "globe",
}));

const SECTIONED_ITEMS: IListBoxItem[] = (() => {
    const out: IListBoxItem[] = [];
    for (let g = 0; g < 4; g++) {
        out.push({
            value: `section-${g}`,
            label: `Group ${g + 1}`,
            section: true,
        });
        for (let i = 0; i < 10; i++) {
            out.push({
                value: `g${g}-i${i}`,
                label: `Item ${g + 1}.${i + 1} — orange grape`,
                icon: "globe",
            });
        }
    }
    return out;
})();

interface DemoProps {
    rowCount?: number;
    searchText?: string;
    keyboardNav?: boolean;
    loading?: boolean;
    customRow?: boolean;
    tooltip?: boolean;
    contextMenu?: boolean;
    predicateSelection?: boolean;
    sections?: boolean;
    variant?: "select" | "browse";
    selectionStyle?: "check" | "accent" | "focus";
    dropActive?: boolean;
}

function ListBoxDemo({
    rowCount = 60,
    searchText = "apple",
    keyboardNav = true,
    loading = false,
    customRow = false,
    tooltip = false,
    contextMenu = false,
    predicateSelection = false,
    sections = false,
    variant = "select",
    selectionStyle = "check",
    dropActive = false,
}: DemoProps) {
    const [value, setValue] = useState<IListBoxItem | null>(null);
    const [active, setActive] = useState<number>(0);
    const [removed, setRemoved] = useState<Set<IListBoxItem["value"]>>(new Set());

    const items = useMemo(() => {
        if (sections) return SECTIONED_ITEMS;
        const count = Math.max(0, Math.min(rowCount, MAX_REGULAR_ITEMS));
        const base = REGULAR_ITEMS.slice(0, count);
        return removed.size === 0 ? base : base.filter((it) => !removed.has(it.value));
    }, [sections, removed, rowCount]);

    const renderItem = customRow
        ? (ctx: ListItemRenderContext<IListBoxItem>) => (
            <ListItem
                id={ctx.id}
                icon={ctx.item.icon}
                label={ctx.item.label}
                searchText={searchText}
                selected={ctx.selected}
                active={ctx.active}
                dropActive={dropActive && ctx.index === 2}
                tooltip={tooltip ? `Tooltip: ${ctx.item.label}` : undefined}
                trailing={
                    <IconButton
                        icon="close"
                        size="sm"
                        aria-label="Remove"
                        onClick={(e) => {
                            e.stopPropagation();
                            setRemoved((s) => {
                                const next = new Set(s);
                                next.add(ctx.item.value);
                                return next;
                            });
                        }}
                    />
                }
            />
        )
        : undefined;

    const getTooltip = tooltip
        ? (it: IListBoxItem): React.ReactNode =>
            typeof it.label === "string" ? `Tooltip: ${it.label}` : null
        : undefined;

    const getContextMenu = contextMenu
        ? (it: IListBoxItem): MenuItem[] => [
            {
                label: typeof it.label === "string" ? `Copy "${it.label}"` : "Copy",
                icon: "copy",
                onClick: () => {},
            },
            {
                label: "Remove",
                icon: "remove",
                onClick: () => {},
            },
        ]
        : undefined;

    const onContextMenu = contextMenu
        ? (e: MouseEvent) => {
            const ctx = ContextMenuEvent.fromNativeEvent(e, "generic");
            ctx.items.push({
                label: "List background action",
                onClick: () => {},
            });
        }
        : undefined;

    const isSelected = predicateSelection
        ? (it: IListBoxItem) =>
            typeof it.value === "number" && it.value % 5 === 0
        : undefined;

    return (
        <Panel direction="column" width={360} height={300}>
            <ListBox
                items={items}
                value={predicateSelection ? null : value}
                onChange={(item) => setValue(item)}
                isSelected={isSelected}
                activeIndex={active}
                onActiveChange={setActive}
                searchText={searchText}
                renderItem={renderItem}
                keyboardNav={keyboardNav}
                loading={loading}
                emptyMessage="no rows"
                getTooltip={getTooltip}
                getContextMenu={getContextMenu}
                onContextMenu={onContextMenu}
                variant={variant}
                selectionStyle={selectionStyle}
            />
        </Panel>
    );
}

export const listBoxStory: Story = {
    id: "list-box",
    name: "ListBox",
    section: "Lists",
    component: ListBoxDemo as React.ComponentType<Record<string, unknown>>,
    props: [
        // 60 rows never exercise the cell pool; raise this to see virtualization work.
        { name: "rowCount",           type: "number",  default: 60, min: 0, max: 10000, step: 100 },
        { name: "searchText",         type: "string",  default: "apple" },
        { name: "keyboardNav",        type: "boolean", default: true },
        { name: "loading",            type: "boolean", default: false },
        { name: "customRow",          type: "boolean", default: false },
        { name: "tooltip",            type: "boolean", default: false },
        { name: "contextMenu",        type: "boolean", default: false },
        { name: "predicateSelection", type: "boolean", default: false },
        { name: "sections",           type: "boolean", default: false },
        { name: "variant",            type: "enum",    options: ["select", "browse"], default: "select" },
        { name: "selectionStyle",     type: "enum",    options: ["check", "accent", "focus"],  default: "check" },
        // Drop feedback is set per row by the consumer (ListBox never sets it), so this needs
        // customRow to be on. Marks the third row as the active drop target.
        { name: "dropActive",         type: "boolean", default: false },
    ],
};
