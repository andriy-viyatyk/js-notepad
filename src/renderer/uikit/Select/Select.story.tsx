import React, { useMemo, useState } from "react";
import { Select } from "./Select";
import { Panel } from "../Panel/Panel";
import { Text } from "../Text/Text";
import { IListBoxItem } from "../ListBox";
import { Story } from "../../editors/storybook/storyTypes";

interface DemoProps {
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    size?: "sm" | "md";
    filterMode?: "contains" | "startsWith" | "off";
    itemCount?: number;
    withIcons?: boolean;
    itemsMode?: "array" | "lazy-fn" | "lazy-promise";
    resizable?: boolean;
    width?: number;
    minWidth?: number;
    maxWidth?: number;
}

function buildItems(count: number, withIcons: boolean): IListBoxItem[] {
    const out: IListBoxItem[] = [];
    for (let i = 0; i < count; i++) {
        out.push({
            value: i,
            label: `Option ${i} — apple banana cherry`,
            icon: withIcons ? "globe" : undefined,
        });
    }
    return out;
}

function delay<T>(value: T, ms: number): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function SelectDemo({
    placeholder = "Pick one…",
    disabled = false,
    readOnly = false,
    size = "md",
    filterMode = "contains",
    itemCount = 50,
    withIcons = true,
    itemsMode = "array",
    resizable = false,
    width,
    minWidth,
    maxWidth,
}: DemoProps) {
    const [value, setValue] = useState<IListBoxItem | null>(null);

    const items = useMemo(() => {
        if (itemsMode === "array") {
            return buildItems(itemCount, withIcons);
        }
        if (itemsMode === "lazy-fn") {
            return () => buildItems(itemCount, withIcons);
        }
        return () => delay(buildItems(itemCount, withIcons), 500);
    }, [itemsMode, itemCount, withIcons]);

    return (
        <Panel direction="column" gap="md" width={600}>
            <Select<IListBoxItem>
                items={items}
                value={value}
                onChange={(item) => setValue(item)}
                placeholder={placeholder}
                disabled={disabled}
                readOnly={readOnly}
                size={size}
                filterMode={filterMode}
                resizable={resizable}
                width={width || undefined}
                minWidth={minWidth || undefined}
                maxWidth={maxWidth || undefined}
                aria-label="Demo select"
            />
            <Text size="xs" color="light">
                value: {value ? `{ value: ${JSON.stringify(value.value)}, label: ${JSON.stringify(value.label)} }` : "null"}
            </Text>
        </Panel>
    );
}

export const selectStory: Story = {
    id: "select",
    name: "Select",
    section: "Lists",
    component: SelectDemo as React.ComponentType<Record<string, unknown>>,
    props: [
        { name: "placeholder", type: "string",  default: "Pick one…" },
        { name: "disabled",    type: "boolean", default: false },
        { name: "readOnly",    type: "boolean", default: false },
        { name: "size",        type: "enum",    options: ["sm", "md"], default: "md" },
        { name: "filterMode",  type: "enum",    options: ["contains", "startsWith", "off"], default: "contains", label: "Filter mode" },
        { name: "itemCount",   type: "number",  default: 50, min: 0, max: 1000, step: 50 },
        { name: "withIcons",   type: "boolean", default: true },
        {
            name: "itemsMode",
            type: "enum",
            options: ["array", "lazy-fn", "lazy-promise"],
            default: "array",
            label: "Items mode",
        },
        { name: "resizable", type: "boolean", default: false },
        { name: "width",     type: "number",  default: 0,   min: 0, max: 600, step: 20, label: "Width (0 = unset)" },
        { name: "minWidth",  type: "number",  default: 0,   min: 0, max: 400, step: 20, label: "Min width (0 = unset)" },
        { name: "maxWidth",  type: "number",  default: 0,   min: 0, max: 600, step: 20, label: "Max width (0 = unset)" },
    ],
};
