import { useCallback } from "react";
import { TextInputEntry } from "../logTypes";
import type { LogViewEditor } from "../LogViewEditor";
import { DialogContainer } from "./DialogContainer";
import { DialogHeader } from "./DialogHeader";
import { ButtonsPanel } from "./ButtonsPanel";
import { Input, Panel } from "../../../uikit";

// =============================================================================
// Component
// =============================================================================

interface TextInputDialogViewProps {
    entry: TextInputEntry;
    updateEntry: (updater: (draft: TextInputEntry) => void) => void;
    model: LogViewEditor;
}

const DEFAULT_BUTTONS = ["OK"];

export function TextInputDialogView({ entry, updateEntry, model: vm }: TextInputDialogViewProps) {
    const resolved = entry.button !== undefined;
    const buttons = entry.buttons ?? DEFAULT_BUTTONS;
    const currentValue = entry.text ?? entry.defaultValue ?? "";

    const handleTextChange = useCallback(
        (text: string) => {
            updateEntry((draft) => {
                draft.text = text;
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

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter" && !resolved) {
                const defaultBtn = buttons[buttons.length - 1];
                const label = defaultBtn.startsWith("!") ? defaultBtn.slice(1) : defaultBtn;
                const hasRequired = buttons.some((b) => b.startsWith("!"));
                if (!hasRequired || currentValue.trim()) {
                    vm.resolveDialog(entry.id, label);
                }
            }
        },
        [vm, entry.id, resolved, buttons, currentValue],
    );

    const requirementNotMet = !currentValue.trim();

    return (
        <DialogContainer resolved={resolved}>
            <Panel name="log-text-input-dialog" direction="column" minWidth={300}>
                <DialogHeader title={entry.title} />
                <Panel name="log-text-input-field" paddingX="md" paddingY="sm">
                    <Input
                        name="log-text-input"
                        value={currentValue}
                        onChange={handleTextChange}
                        placeholder={entry.placeholder}
                        disabled={resolved}
                        onKeyDown={handleKeyDown}
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
