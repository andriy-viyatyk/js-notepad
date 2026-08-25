import React, { useState } from "react";
import { Tag } from "./Tag";
import { Panel } from "../Panel/Panel";
import { Text } from "../Text/Text";
import color from "../../theme/color";
import { Story } from "../../editors/storybook/storyTypes";

interface DemoProps {
    label?: string;
    variant?: "filled" | "outlined";
    size?: "sm" | "md";
    selected?: boolean;
    disabled?: boolean;
    removable?: boolean;
    clickable?: boolean;
    removeAffordance?: "always" | "hover";
    withIcon?: boolean;
}

function TagDemo({
    label = "react",
    variant = "filled",
    size = "md",
    selected = false,
    disabled = false,
    removable = true,
    clickable = false,
    removeAffordance = "always",
    withIcon = false,
}: DemoProps) {
    const [lastAction, setLastAction] = useState<string>("(none)");

    const createTagIcon = (): HTMLSpanElement => {
        const element = document.createElement("span");
        element.style.width = "8px";
        element.style.height = "8px";
        element.style.borderRadius = "50%";
        element.style.backgroundColor = color.misc.blue;
        element.style.display = "inline-block";
        return element;
    };

    return (
        <Panel direction="column" gap="md" width={360}>
            <Panel direction="row" wrap gap="sm" align="center">
                <Tag
                    label={label}
                    icon={withIcon ? createTagIcon() : undefined}
                    variant={variant}
                    size={size}
                    selected={selected}
                    disabled={disabled}
                    removeAffordance={removeAffordance}
                    onClick={clickable ? () => setLastAction(`clicked: ${label}`) : undefined}
                    onRemove={removable ? () => setLastAction(`removed: ${label}`) : undefined}
                />
                <Tag
                    label="typescript"
                    icon={withIcon ? createTagIcon() : undefined}
                    variant={variant}
                    size={size}
                    disabled={disabled}
                    removeAffordance={removeAffordance}
                    onClick={clickable ? () => setLastAction("clicked: typescript") : undefined}
                    onRemove={removable ? () => setLastAction("removed: typescript") : undefined}
                />
                <Tag
                    label="hobby:photography"
                    icon={withIcon ? createTagIcon() : undefined}
                    variant={variant}
                    size={size}
                    disabled={disabled}
                    removeAffordance={removeAffordance}
                    onClick={clickable ? () => setLastAction("clicked: hobby:photography") : undefined}
                    onRemove={removable ? () => setLastAction("removed: hobby:photography") : undefined}
                />
            </Panel>
            <Text size="xs" color="light">
                last action: {lastAction}
            </Text>
        </Panel>
    );
}

export const tagStory: Story = {
    id: "tag",
    name: "Tag",
    section: "Bootstrap",
    component: TagDemo as React.ComponentType<Record<string, unknown>>,
    props: [
        { name: "label",            type: "string",  default: "react" },
        { name: "variant",          type: "enum",    options: ["filled", "outlined"], default: "filled" },
        { name: "size",             type: "enum",    options: ["sm", "md"], default: "md" },
        { name: "selected",         type: "boolean", default: false },
        { name: "disabled",         type: "boolean", default: false },
        { name: "removable",        type: "boolean", default: true },
        { name: "clickable",        type: "boolean", default: false },
        { name: "removeAffordance", type: "enum",    options: ["always", "hover"], default: "always", label: "Remove affordance" },
        { name: "withIcon",         type: "boolean", default: false, label: "With icon (dot)" },
    ],
};
