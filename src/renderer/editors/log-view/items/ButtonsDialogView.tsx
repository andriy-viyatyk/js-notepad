import { useCallback } from "react";
import { ButtonsEntry } from "../logTypes";
import type { LogViewEditor } from "../LogViewEditor";
import { DialogContainer } from "./DialogContainer";
import { DialogHeader } from "./DialogHeader";
import { ButtonsPanel } from "./ButtonsPanel";

// =============================================================================
// Component
// =============================================================================

interface ButtonsDialogViewProps {
    entry: ButtonsEntry;
    model: LogViewEditor;
}

export function ButtonsDialogView({ entry, model: vm }: ButtonsDialogViewProps) {
    const resolved = entry.button !== undefined;

    const handleClick = useCallback(
        (label: string) => {
            vm.resolveDialog(entry.id, label);
        },
        [vm, entry.id],
    );

    return (
        <DialogContainer resolved={resolved}>
            <DialogHeader title={entry.title} />
            <ButtonsPanel
                buttons={entry.buttons}
                button={entry.button}
                onClickButton={handleClick}
            />
        </DialogContainer>
    );
}
