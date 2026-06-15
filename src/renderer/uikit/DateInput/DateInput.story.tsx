import React from "react";
import { DateInput } from "./DateInput";
import { Panel } from "../Panel/Panel";
import { Text } from "../Text/Text";
import { Story } from "../../editors/storybook/storyTypes";

interface DemoProps {
    initialValue?: string;
    size?: "sm" | "md";
    disabled?: boolean;
    readOnly?: boolean;
}

function DateInputDemo({
    initialValue = "",
    size = "md",
    disabled = false,
    readOnly = false,
}: DemoProps) {
    const [value, setValue] = React.useState<string>(initialValue);

    React.useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    return (
        <Panel direction="column" gap="md">
            <DateInput
                value={value}
                onChange={setValue}
                size={size}
                disabled={disabled}
                readOnly={readOnly}
                width={180}
                aria-label="Demo date"
            />
            <Text>Value: {JSON.stringify(value)}</Text>
            <Text size="sm" color="light">
                Native date picker wrapped as a UIKit primitive — value is an ISO
                <code> YYYY-MM-DD</code> string.
            </Text>
        </Panel>
    );
}

export const dateInputStory: Story = {
    id: "date-input",
    name: "DateInput",
    section: "Bootstrap",
    component: DateInputDemo as React.ComponentType<Record<string, unknown>>,
    props: [
        { name: "initialValue", type: "string", default: "", label: "Initial value (YYYY-MM-DD)" },
        { name: "size", type: "enum", options: ["sm", "md"], default: "md" },
        { name: "disabled", type: "boolean", default: false },
        { name: "readOnly", type: "boolean", default: false },
    ],
};
