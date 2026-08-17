import { useCallback, useMemo } from "react";
import { SelectEntry } from "../logTypes";
import type { LogViewEditor } from "../LogViewEditor";
import { DialogContainer } from "./DialogContainer";
import { DialogHeader } from "./DialogHeader";
import { ButtonsPanel } from "./ButtonsPanel";
import { Panel, Select, IListBoxItem } from "../../../uikit";

// =============================================================================
// Component
// =============================================================================

interface SelectDialogViewProps {
    entry: SelectEntry;
    updateEntry: (updater: (draft: SelectEntry) => void) => void;
    model: LogViewEditor;
}

const DEFAULT_BUTTONS = ["OK"];

export function SelectDialogView({ entry, updateEntry, model: vm }: SelectDialogViewProps) {
    const resolved = entry.button !== undefined;
    const buttons = entry.buttons ?? DEFAULT_BUTTONS;

    const selectItems = useMemo<IListBoxItem[]>(
        () => entry.items.map((label) => ({ value: label, label })),
        [entry.items],
    );

    const selectedItem = useMemo<IListBoxItem | null>(
        () => entry.selected != null ? { value: entry.selected, label: entry.selected } : null,
        [entry.selected],
    );

    const handleSelect = useCallback(
        (item: IListBoxItem) => {
            updateEntry((draft) => {
                draft.selected = typeof item.value === "string" ? item.value : String(item.value);
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

    const requirementNotMet = !entry.selected;

    return (
        <DialogContainer resolved={resolved}>
            <Panel name="log-select-dialog" direction="column" minWidth={200}>
                <DialogHeader title={entry.title} />
                <Panel name="log-select-control" paddingX="md" paddingY="sm">
                    <Select<IListBoxItem>
                        name="log-select"
                        items={selectItems}
                        value={selectedItem}
                        onChange={handleSelect}
                        placeholder={entry.placeholder}
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
