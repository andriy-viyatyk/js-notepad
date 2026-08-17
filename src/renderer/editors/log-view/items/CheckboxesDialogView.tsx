import { useCallback } from "react";
import { CheckboxesEntry } from "../logTypes";
import type { LogViewEditor } from "../LogViewEditor";
import { DialogContainer } from "./DialogContainer";
import { DialogHeader } from "./DialogHeader";
import { ButtonsPanel } from "./ButtonsPanel";
import { Checkbox, Panel } from "../../../uikit";
import { DIALOG_CONTENT_MAX_HEIGHT } from "../logConstants";

// =============================================================================
// Component
// =============================================================================

interface CheckboxesDialogViewProps {
    entry: CheckboxesEntry;
    updateEntry: (updater: (draft: CheckboxesEntry) => void) => void;
    model: LogViewEditor;
}

const DEFAULT_BUTTONS = ["OK"];

export function CheckboxesDialogView({ entry, updateEntry, model: vm }: CheckboxesDialogViewProps) {
    const resolved = entry.button !== undefined;
    const buttons = entry.buttons ?? DEFAULT_BUTTONS;
    const layout = entry.layout ?? "vertical";

    const handleToggle = useCallback(
        (index: number) => {
            updateEntry((draft) => {
                draft.items[index].checked = !draft.items[index].checked;
            });
        },
        [updateEntry],
    );

    const handleClick = useCallback(
        (label: string) => {
            vm.resolveDialog(entry.id, label);
        },
        [vm, entry.id],
    );

    const requirementNotMet = entry.items.every((item) => !item.checked);

    return (
        <DialogContainer resolved={resolved}>
            <Panel name="log-checkboxes-dialog" direction="column" minWidth={200}>
                <DialogHeader title={entry.title} />
                <Panel
                    name="log-checkbox-list"
                    direction={layout === "flex" ? "row" : "column"}
                    wrap={layout === "flex"}
                    gap={layout === "flex" ? "md" : "xs"}
                    paddingX="md"
                    paddingY="sm"
                    maxHeight={DIALOG_CONTENT_MAX_HEIGHT}
                    overflowY="auto"
                >
                    {entry.items.map((item, i) => (
                        <Checkbox
                            name={`log-checkbox-${i}`}
                            key={i}
                            checked={item.checked ?? false}
                            disabled={resolved}
                            onChange={() => handleToggle(i)}
                        >
                            {item.label}
                        </Checkbox>
                    ))}
                </Panel>
                <ButtonsPanel
                    buttons={buttons}
                    button={entry.button}
                    requirementNotMet={requirementNotMet}
                    onClickButton={handleClick}
                />
            </Panel>
        </DialogContainer>
    );
}
