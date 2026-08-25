import React from "react";
import { WithMenu } from "./WithMenu";
import { Button } from "../Button/Button";
import { Panel } from "../Panel/Panel";
import { Text } from "../Text/Text";
import type { MenuItem } from "./types";
import { Story } from "../../editors/storybook/storyTypes";

const SMALL_ITEMS: MenuItem[] = [
    { label: "New Page",      icon: "folder-open", hotKey: "Ctrl+N",       onClick: () => alert("New Page")        },
    { label: "Open File…",    icon: "folder-open", hotKey: "Ctrl+O",       onClick: () => alert("Open File")       },
    { label: "Save",          icon: "save",       hotKey: "Ctrl+S",       onClick: () => alert("Save")            },
    { label: "Save As…",      icon: "save",       hotKey: "Ctrl+Shift+S", onClick: () => alert("Save As")         },
    { label: "Rename",        icon: "rename",                              onClick: () => alert("Rename"), startGroup: true },
    { label: "Copy Path",     icon: "copy",                                onClick: () => alert("Copy Path")       },
    { label: "Close",         icon: "close",      hotKey: "Ctrl+W",       onClick: () => alert("Close"), startGroup: true, minor: true },
    { label: "Close All",     icon: "close",                              onClick: () => alert("Close All")       },
    { label: "Disabled item", disabled: true,                                   onClick: () => alert("Should not run")  },
];

const SUBMENU_ITEMS: MenuItem[] = [
    {
        label: "File",
        icon: "folder-open",
        items: [
            { label: "New Page", icon: "folder-open", hotKey: "Ctrl+N", onClick: () => alert("New") },
            { label: "Open…",    icon: "folder-open", hotKey: "Ctrl+O", onClick: () => alert("Open") },
        ],
    },
    {
        label: "Edit",
        icon: "copy",
        items: [
            { label: "Copy",  hotKey: "Ctrl+C", onClick: () => alert("Copy") },
            { label: "Paste", hotKey: "Ctrl+V", onClick: () => alert("Paste") },
        ],
    },
    { label: "Settings", icon: "settings", onClick: () => alert("Settings") },
];

const FRUITS = ["Apple", "Banana", "Cherry", "Date", "Elderberry"];
const LARGE_ITEMS: MenuItem[] = Array.from({ length: 60 }).map((_, i) => ({
    label: `Item ${String(i + 1).padStart(2, "0")} — ${FRUITS[i % FRUITS.length]}`,
    onClick: () => alert(`Item ${i + 1}`),
}));

interface DemoProps {
    variant?: "small" | "submenus" | "large-search";
    placement?: string;
    offsetX?: number;
    offsetY?: number;
}

const MenuDemo = ({
    variant = "small",
    placement = "bottom-start",
    offsetX = -4,
    offsetY = 4,
}: DemoProps) => {
    const items =
        variant === "submenus"     ? SUBMENU_ITEMS :
        variant === "large-search" ? LARGE_ITEMS   :
        SMALL_ITEMS;
    return (
        <Panel direction="column" gap="md" padding="lg" align="start">
            <Text size="sm" color="light">
                Variant: {variant}
                {variant === "large-search" ? "  (search appears at >20 items)" : ""}
            </Text>
            <WithMenu
                items={items}
                placement={placement as any}
                offset={[offsetX, offsetY]}
            >
                {(setOpen) => (
                    <Button
                        onClick={(e) => setOpen(e.currentTarget)}
                        icon="settings"
                    >
                        Open menu
                    </Button>
                )}
            </WithMenu>
        </Panel>
    );
};

const PLACEMENTS = [
    "top", "top-start", "top-end",
    "bottom", "bottom-start", "bottom-end",
    "left", "left-start", "left-end",
    "right", "right-start", "right-end",
];

export const menuStory: Story = {
    id: "menu",
    name: "Menu",
    section: "Overlay",
    component: MenuDemo as any,
    props: [
        { name: "variant",   type: "enum",   options: ["small", "submenus", "large-search"], default: "small" },
        { name: "placement", type: "enum",   options: PLACEMENTS, default: "bottom-start" },
        { name: "offsetX",   type: "number", default: -4 },
        { name: "offsetY",   type: "number", default: 4 },
    ],
};
