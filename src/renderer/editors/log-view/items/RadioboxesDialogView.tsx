import { useCallback, useMemo } from "react";
import { RadioboxesEntry } from "../logTypes";
import type { LogViewEditor } from "../LogViewEditor";
import { DialogContainer } from "./DialogContainer";
import { DialogHeader } from "./DialogHeader";
import { ButtonsPanel } from "./ButtonsPanel";
import { Panel, RadioGroup } from "../../../uikit";
import { DIALOG_CONTENT_MAX_HEIGHT } from "../logConstants";

// =============================================================================
// Component
// =============================================================================

interface RadioboxesDialogViewProps {
    entry: RadioboxesEntry;
    updateEntry: (updater: (draft: RadioboxesEntry) => void) => void;
    model: LogViewEditor;
}

const DEFAULT_BUTTONS = ["OK"];

export function RadioboxesDialogView({ entry, updateEntry, model: vm }: RadioboxesDialogViewProps) {
    const resolved = entry.button !== undefined;
    const buttons = entry.buttons ?? DEFAULT_BUTTONS;
    const layout = entry.layout ?? "vertical";

    const radioItems = useMemo(
        () => entry.items.map((label) => ({ value: label, label })),
        [entry.items],
    );

    const handleSelect = useCallback(
        (label: string) => {
            updateEntry((draft) => {
                draft.checked = label;
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

    const requirementNotMet = !entry.checked;

    return (
        <DialogContainer resolved={resolved}>
            <Panel name="log-radioboxes-dialog" direction="column" minWidth={200}>
                <DialogHeader title={entry.title} />
                <Panel
                    name="log-radio-list"
                    paddingX="md"
                    paddingY="sm"
                    maxHeight={DIALOG_CONTENT_MAX_HEIGHT}
                    overflowY="auto"
                >
                    <RadioGroup
                        name="log-radio-group"
                        items={radioItems}
                        value={entry.checked ?? ""}
                        onChange={handleSelect}
                        orientation={layout === "flex" ? "horizontal" : "vertical"}
                        wrap={layout === "flex"}
                        gap="xs"
                        disabled={resolved}
                    />
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
