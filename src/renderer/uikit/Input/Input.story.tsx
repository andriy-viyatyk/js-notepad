import React from "react";
import { Input } from "./Input";
import { IconButton } from "../IconButton/IconButton";
import { Panel } from "../Panel/Panel";
import { Text } from "../Text/Text";
import { SearchIcon } from "../../theme/icons";
import { height } from "../tokens";
import { Story } from "../../editors/storybook/storyTypes";

interface DemoProps {
    initialValue?: string;
    placeholder?: string;
    size?: "sm" | "md";
    variant?: "default" | "ghost";
    tone?: "default" | "accent";
    disabled?: boolean;
    readOnly?: boolean;
    slotPreset?: "none" | "chevron" | "search" | "unit";
}

function InputDemo({
    initialValue = "Hello",
    placeholder = "Placeholder text",
    size = "md",
    variant = "default",
    tone = "default",
    disabled = false,
    readOnly = false,
    slotPreset = "none",
}: DemoProps) {
    const [value, setValue] = React.useState<string>(initialValue);

    React.useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    let startSlot: React.ReactNode = undefined;
    let endSlot: React.ReactNode = undefined;

    if (slotPreset === "chevron") {
        endSlot = <IconButton icon="chevron-down" size="sm" tabIndex={-1} disabled={disabled} />;
    } else if (slotPreset === "search") {
        startSlot = <SearchIcon width={height.iconMd} height={height.iconMd} />;
        if (value !== "") {
            endSlot = (
                <IconButton
                    icon="close"
                    size="sm"
                    tabIndex={-1}
                    disabled={disabled}
                    onClick={() => setValue("")}
                />
            );
        }
    } else if (slotPreset === "unit") {
        endSlot = <Text color="light">kg</Text>;
    }

    return (
        <Panel direction="column" gap="md">
            <Input
                value={value}
                onChange={setValue}
                placeholder={placeholder}
                size={size}
                variant={variant}
                tone={tone}
                disabled={disabled}
                readOnly={readOnly}
                startSlot={startSlot}
                endSlot={endSlot}
                aria-label="Demo input"
            />
            <Text>Value: {JSON.stringify(value)}</Text>
            <Text size="sm" color="light">
                Tip: switch <code>variant</code> to <code>ghost</code> to see the inline-edit
                chrome (transparent at rest, hover/focus borders only).
            </Text>
        </Panel>
    );
}

export const inputStory: Story = {
    id: "input",
    name: "Input",
    section: "Bootstrap",
    component: InputDemo as React.ComponentType<Record<string, unknown>>,
    props: [
        { name: "initialValue", type: "string", default: "Hello",                label: "Initial value" },
        { name: "placeholder",  type: "string", default: "Placeholder text" },
        { name: "size",         type: "enum",   options: ["sm", "md"], default: "md" },
        { name: "variant",      type: "enum",   options: ["default", "ghost"], default: "default" },
        { name: "tone",         type: "enum",   options: ["default", "accent"], default: "default", label: "Text tone" },
        { name: "disabled",     type: "boolean", default: false },
        { name: "readOnly",     type: "boolean", default: false },
        {
            name: "slotPreset",
            type: "enum",
            options: ["none", "chevron", "search", "unit"],
            default: "none",
            label: "Slot preset",
        },
    ],
};
