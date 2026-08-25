import React from "react";
import { RadioGroup, IRadio } from "./RadioGroup";
import { Panel } from "../Panel/Panel";
import { Text } from "../Text/Text";
import { Story } from "../../editors/storybook/storyTypes";

interface DemoProps {
    initialValue?: string;
    orientation?: "horizontal" | "vertical";
    wrap?: boolean;
    gap?: "xs" | "sm" | "md" | "lg" | "xl";
    disabled?: boolean;
    count?: number;
    withIcons?: boolean;
    disableSecond?: boolean;
}

function RadioGroupDemo({
    initialValue,
    orientation = "vertical",
    wrap = false,
    gap = "sm",
    disabled = false,
    count = 4,
    withIcons = false,
    disableSecond = false,
}: DemoProps) {
    const items: IRadio[] = React.useMemo(() => {
        return Array.from({ length: Math.max(1, count) }, (_, i) => ({
            value: `opt-${i + 1}`,
            label: `Option ${i + 1}`,
            icon: withIcons ? "check" : undefined,
            disabled: disableSecond && i === 1,
        }));
    }, [count, withIcons, disableSecond]);

    const [value, setValue] = React.useState<string>(initialValue ?? "opt-1");

    React.useEffect(() => {
        if (initialValue) setValue(initialValue);
    }, [initialValue]);

    // If selection becomes invalid (count shrank, or disabled), pick the first
    // non-disabled item so the demo stays consistent.
    React.useEffect(() => {
        const found = items.find((i) => i.value === value && !i.disabled);
        if (!found) {
            const first = items.find((i) => !i.disabled);
            if (first) setValue(first.value);
        }
    }, [items, value]);

    return (
        <Panel direction="column" gap="md">
            <RadioGroup
                items={items}
                value={value}
                onChange={setValue}
                orientation={orientation}
                wrap={wrap}
                gap={gap}
                disabled={disabled}
                aria-label="Demo radio group"
            />
            <Text>Selected: {value}</Text>
        </Panel>
    );
}

export const radioGroupStory: Story = {
    id: "radio-group",
    name: "RadioGroup",
    section: "Bootstrap",
    component: RadioGroupDemo as React.ComponentType<Record<string, unknown>>,
    props: [
        { name: "initialValue",  type: "string",  default: "opt-1",   label: "Initial value" },
        { name: "orientation",   type: "enum",    options: ["vertical", "horizontal"], default: "vertical" },
        { name: "wrap",          type: "boolean", default: false },
        { name: "gap",           type: "enum",    options: ["xs", "sm", "md", "lg", "xl"], default: "sm" },
        { name: "disabled",      type: "boolean", default: false, label: "Group disabled" },
        { name: "count",         type: "number",  default: 4, min: 1, max: 8, step: 1 },
        { name: "withIcons",     type: "boolean", default: false, label: "Show item icons" },
        { name: "disableSecond", type: "boolean", default: false, label: "Disable item #2" },
    ],
};
