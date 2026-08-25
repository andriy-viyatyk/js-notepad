import React, { useState } from "react";
import {
    CollapsiblePanel,
    CollapsiblePanelStack,
} from "./CollapsiblePanelStack";
import { Panel } from "../Panel/Panel";
import { IconButton } from "../IconButton/IconButton";
import { Text } from "../Text/Text";
import { Story } from "../../editors/storybook/storyTypes";

interface DemoProps {
    width?: number;
    initialActive?: string;
}

function CollapsiblePanelStackDemo({
    width = 240,
    initialActive = "tags",
}: DemoProps) {
    const [active, setActive] = useState(initialActive);

    return (
        <Panel direction="row" gap="xl" padding="xl" height={400}>
            <CollapsiblePanelStack
                activePanel={active}
                setActivePanel={setActive}
                width={width}
                minWidth={100}
                maxWidth="60%"
            >
                <CollapsiblePanel id="tags" title="Tags">
                    <Panel direction="column" padding="sm" gap="sm">
                        <Text>Tags content. Click another header to collapse this panel.</Text>
                        <Text size="xs" color="light">
                            Clicking the same header again returns to the previously expanded panel.
                        </Text>
                    </Panel>
                </CollapsiblePanel>
                <CollapsiblePanel id="categories" title="Categories">
                    <Panel direction="column" padding="sm" gap="xs">
                        <Text>Categories content.</Text>
                        <Text size="xs" color="light">- Project</Text>
                        <Text size="xs" color="light">- Settings</Text>
                        <Text size="xs" color="light">- Dev</Text>
                    </Panel>
                </CollapsiblePanel>
                <CollapsiblePanel
                    id="hostnames"
                    title="Hostnames"
                    buttons={
                        <IconButton
                            size="sm"
                            title="Refresh"
                            icon="refresh"
                            onClick={() => alert("refresh")}
                        />
                    }
                >
                    <Panel direction="column" padding="sm">
                        <Text>Hostnames content. Header has a buttons slot — chevron is hidden.</Text>
                    </Panel>
                </CollapsiblePanel>
            </CollapsiblePanelStack>

            <Panel direction="column" gap="md">
                <Text>
                    Active: <strong>{active}</strong>
                </Text>
                <Text size="xs" color="light">
                    Click a panel header to switch. Click the active header to go back to the previous panel.
                </Text>
            </Panel>
        </Panel>
    );
}

export const collapsiblePanelStackStory: Story = {
    id: "collapsible-panel-stack",
    name: "CollapsiblePanelStack",
    section: "Layout",
    component: CollapsiblePanelStackDemo as React.ComponentType<Record<string, unknown>>,
    props: [
        { name: "width",         type: "number", default: 240, min: 100, max: 500, step: 20 },
        { name: "initialActive", type: "enum",   options: ["tags", "categories", "hostnames"], default: "tags" },
    ],
};
