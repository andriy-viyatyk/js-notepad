import React, { useMemo, useState } from "react";
import { MultiListBox } from "./MultiListBox";
import { Panel } from "../Panel/Panel";
import { Text } from "../Text/Text";
import { IListBoxItem } from "../ListBox";
import { Story } from "../../editors/storybook/storyTypes";

interface DemoProps {
    itemCount?: number;
    withIcons?: boolean;
    disabled?: boolean;
    readOnly?: boolean;
    showSearch?: boolean;
    filterMode?: "contains" | "startsWith" | "off";
    selectAll?: boolean;
    rowHeight?: number;
    maxVisibleItems?: number;
    height?: number;
}

function buildItems(count: number, withIcons: boolean): IListBoxItem[] {
    const out: IListBoxItem[] = [];
    for (let i = 0; i < count; i++) {
        out.push({
            value: i,
            label: `Option ${i} — apple banana cherry`,
            icon: withIcons ? "globe" : undefined,
            disabled: i % 13 === 0 && i !== 0,
        });
    }
    return out;
}

function MultiListBoxDemo({
    itemCount = 50,
    withIcons = true,
    disabled = false,
    readOnly = false,
    showSearch = true,
    filterMode = "contains",
    selectAll = true,
    rowHeight = 24,
    maxVisibleItems = 10,
    height,
}: DemoProps) {
    const items = useMemo(() => buildItems(itemCount, withIcons), [itemCount, withIcons]);
    const [value, setValue] = useState<IListBoxItem[]>([]);

    return (
        <Panel direction="column" gap="md" width={420}>
            <MultiListBox<IListBoxItem>
                items={items}
                value={value}
                onChange={setValue}
                disabled={disabled}
                readOnly={readOnly}
                showSearch={showSearch}
                filterMode={filterMode}
                selectAll={selectAll}
                rowHeight={rowHeight}
                maxVisibleItems={maxVisibleItems}
                height={height || undefined}
            />
            <Text size="xs" color="light">
                {value.length} selected{value.length > 0 ? `: ${value.map((v) => v.value).join(", ")}` : ""}
            </Text>
        </Panel>
    );
}

export const multiListBoxStory: Story = {
    id: "multilistbox",
    name: "MultiListBox",
    section: "Lists",
    component: MultiListBoxDemo as React.ComponentType<Record<string, unknown>>,
    props: [
        { name: "itemCount",       type: "number",  default: 50,  min: 0, max: 1000, step: 50 },
        { name: "withIcons",       type: "boolean", default: true },
        { name: "disabled",        type: "boolean", default: false },
        { name: "readOnly",        type: "boolean", default: false },
        { name: "showSearch",      type: "boolean", default: true },
        { name: "filterMode",      type: "enum",    options: ["contains", "startsWith", "off"], default: "contains", label: "Filter mode" },
        { name: "selectAll",       type: "boolean", default: true, label: "Show select-all" },
        { name: "rowHeight",       type: "number",  default: 24, min: 16, max: 48, step: 2 },
        { name: "maxVisibleItems", type: "number",  default: 10, min: 3,  max: 30, step: 1, label: "Max visible rows" },
        { name: "height",          type: "number",  default: 0,  min: 0,  max: 600, step: 20, label: "Height (0 = unset)" },
    ],
};
