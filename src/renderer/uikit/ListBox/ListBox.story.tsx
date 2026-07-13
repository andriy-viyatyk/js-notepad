import React, { useMemo, useState } from "react";
import { ListBox, IListBoxItem, ListItemRenderContext } from "./ListBox";
import { ListItem } from "./ListItem";
import { IconButton } from "../IconButton/IconButton";
import { Panel } from "../Panel/Panel";
import {
    GlobeIcon,
    CloseIcon,
    CopyIcon,
    RemoveIcon,
} from "../../theme/icons";
import { ContextMenuEvent } from "../../api/events/events";
import type { MenuItem } from "../Menu";
import { Story } from "../../editors/storybook/storyTypes";

const REGULAR_ITEMS: IListBoxItem[] = Array.from({ length: 60 }, (_, i) => ({
    value: i,
    label: `Suggestion ${i} — apple banana cherry`,
    icon: <GlobeIcon />,
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
                icon: <GlobeIcon />,
            });
        }
    }
    return out;
})();

interface DemoProps {
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
}

function ListBoxDemo({
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
}: DemoProps) {
    const [value, setValue] = useState<IListBoxItem | null>(null);
    const [active, setActive] = useState<number>(0);
    const [removed, setRemoved] = useState<Set<IListBoxItem["value"]>>(new Set());

    const items = useMemo(() => {
        const base = sections
            ? SECTIONED_ITEMS
            : REGULAR_ITEMS.filter((it) => !removed.has(it.value));
        return base;
    }, [sections, removed]);

    const renderItem = customRow
        ? (ctx: ListItemRenderContext<IListBoxItem>) => (
            <ListItem
                id={ctx.id}
                icon={ctx.item.icon}
                label={ctx.item.label}
                searchText={searchText}
                selected={ctx.selected}
                active={ctx.active}
                tooltip={tooltip ? `Tooltip: ${ctx.item.label}` : undefined}
                trailing={
                    <IconButton
                        icon={<CloseIcon />}
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
                icon: <CopyIcon />,
                onClick: () => {},
            },
            {
                label: "Remove",
                icon: <RemoveIcon />,
                onClick: () => {},
            },
        ]
        : undefined;

    const onContextMenu = contextMenu
        ? (e: React.MouseEvent<HTMLDivElement>) => {
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
    ],
};
