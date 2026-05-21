import { TComponentState } from "../../core/state/state";
import { LogViewEditor, defaultLogViewEditorState } from "./LogViewEditor";
import { LogBody } from "./LogBody";
import { TextChrome } from "../base/v4/TextChrome";
import { IconButton } from "../../uikit";
import { showConfirmationDialog } from "../../ui/dialogs/ConfirmationDialog";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-553 — native Log View editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorV4` is a v4-native LogViewEditor instance.
 */

function TimestampIcon({ active }: { active: boolean }) {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle
                cx="8"
                cy="8"
                r="6.5"
                stroke="currentColor"
                strokeWidth="1"
                opacity={active ? 1 : 0.5}
            />
            <polyline
                points="8,4 8,8 11,10"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={active ? 1 : 0.5}
            />
        </svg>
    );
}

function ClearIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
                d="M2 5h8M2 8h5M2 11h3M10.5 5.5l4 4M14.5 5.5l-4 4"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinecap="round"
            />
        </svg>
    );
}

function LogToolbarBits({ model }: { model: LogViewEditor }) {
    const showTimestamps = model.state.use((s) => s.showTimestamps);
    return (
        <>
            <IconButton
                name="log-clear"
                size="sm"
                icon={<ClearIcon />}
                title="Clear log"
                onClick={async () => {
                    const result = await showConfirmationDialog({
                        message: "Clear all log entries?",
                    });
                    if (result === "Yes") model.clear();
                }}
            />
            <IconButton
                name="log-toggle-timestamps"
                size="sm"
                icon={<TimestampIcon active={showTimestamps} />}
                title={showTimestamps ? "Hide timestamps" : "Show timestamps"}
                onClick={model.toggleTimestamps}
            />
        </>
    );
}

function LogViewEditorView({ model }: { model: V4EditorModel }) {
    const logEditor = model as LogViewEditor;
    return (
        <TextChrome
            model={model}
            toolbarContributions={<LogToolbarBits model={logEditor} />}
        >
            <LogBody model={logEditor} />
        </TextChrome>
    );
}

export const logViewModule: EditorModule = {
    createEditor: () =>
        new LogViewEditor(new TComponentState({ ...defaultLogViewEditorState })),
    Component: LogViewEditorView,
};

export { LogViewEditor, defaultLogViewEditorState };
export type { LogViewEditorState, LogQueueEvent } from "./LogViewEditor";
