import React from "react";
import { SelectableRow } from "./SelectableRow";
import { Panel } from "../Panel/Panel";
import { Story } from "../../editors/storybook/storyTypes";

function SelectableRowPreview({ selected, active }: { selected?: boolean; active?: boolean }) {
    return (
        <div data-focus-selection tabIndex={0} style={{ width: 280 }}>
            <SelectableRow selected={selected} active={active}>
                <Panel padding="md" width="100%">Selectable row</Panel>
            </SelectableRow>
        </div>
    );
}

export const selectableRowStory: Story = {
    id: "selectable-row",
    name: "SelectableRow",
    section: "Lists",
    component: SelectableRowPreview as React.ComponentType<Record<string, unknown>>,
    props: [
        { name: "selected", type: "boolean", default: false },
        { name: "active", type: "boolean", default: false },
    ],
};
