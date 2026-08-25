import React, { useMemo, useState } from "react";
import { MultiSelect } from "./MultiSelect";
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
    selectAll?: boolean;
    resizable?: boolean;
    matchAnchorWidth?: boolean;
    formatVariant?: "default" | "comma-join";
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

function MultiSelectDemo({
    placeholder = "Pick options…",
    disabled = false,
    readOnly = false,
    size = "md",
    filterMode = "contains",
    itemCount = 50,
    withIcons = true,
    selectAll = true,
    resizable = false,
    matchAnchorWidth = true,
    formatVariant = "default",
    width,
    minWidth,
    maxWidth,
}: DemoProps) {
    const items = useMemo(() => buildItems(itemCount, withIcons), [itemCount, withIcons]);
    const [value, setValue] = useState<IListBoxItem[]>([]);

    const formatSelection = useMemo(() => {
        if (formatVariant === "comma-join") {
            return (v: IListBoxItem[]) => {
                if (v.length === 0) return "";
                const labels = v
                    .map((it) => (typeof it.label === "string" ? it.label.split(" — ")[0] : String(it.value)))
                    .slice(0, 3)
                    .join(", ");
                return v.length > 3 ? `${labels}, +${v.length - 3} more` : labels;
            };
        }
        return undefined;
    }, [formatVariant]);

    return (
        <Panel direction="column" gap="md" width={520}>
            <MultiSelect<IListBoxItem>
                items={items}
                value={value}
                onChange={setValue}
                placeholder={placeholder}
                disabled={disabled}
                readOnly={readOnly}
                size={size}
                filterMode={filterMode}
                selectAll={selectAll}
                resizable={resizable}
                matchAnchorWidth={matchAnchorWidth}
                formatSelection={formatSelection}
                width={width || undefined}
                minWidth={minWidth || undefined}
                maxWidth={maxWidth || undefined}
                aria-label="Demo multi-select"
            />
            <Text size="xs" color="light">
                {value.length} selected
                {value.length > 0 ? `: ${value.map((v) => v.value).join(", ")}` : ""}
            </Text>
        </Panel>
    );
}

export const multiSelectStory: Story = {
    id: "multiselect",
    name: "MultiSelect",
    section: "Lists",
    component: MultiSelectDemo as React.ComponentType<Record<string, unknown>>,
    props: [
        { name: "placeholder",      type: "string",  default: "Pick options…" },
        { name: "disabled",         type: "boolean", default: false },
        { name: "readOnly",         type: "boolean", default: false },
        { name: "size",             type: "enum",    options: ["sm", "md"], default: "md" },
        { name: "filterMode",       type: "enum",    options: ["contains", "startsWith", "off"], default: "contains", label: "Filter mode" },
        { name: "itemCount",        type: "number",  default: 50, min: 0, max: 1000, step: 50 },
        { name: "withIcons",        type: "boolean", default: true },
        { name: "selectAll",        type: "boolean", default: true,  label: "Show select-all" },
        { name: "resizable",        type: "boolean", default: false },
        { name: "matchAnchorWidth", type: "boolean", default: true,  label: "Match anchor width" },
        {
            name: "formatVariant",
            type: "enum",
            options: ["default", "comma-join"],
            default: "default",
            label: "Format selection",
        },
        { name: "width",    type: "number", default: 0, min: 0, max: 600, step: 20, label: "Width (0 = unset)" },
        { name: "minWidth", type: "number", default: 0, min: 0, max: 400, step: 20, label: "Min width (0 = unset)" },
        { name: "maxWidth", type: "number", default: 0, min: 0, max: 600, step: 20, label: "Max width (0 = unset)" },
    ],
};
