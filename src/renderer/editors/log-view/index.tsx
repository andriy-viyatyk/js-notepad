import { TComponentState } from "../../core/state/state";
import { LogViewEditor, defaultLogViewEditorState } from "./LogViewEditor";
import { LogBody } from "./LogBody";
import { TextChrome } from "../base/TextChrome";
import { IconButton } from "../../uikit";
import { showConfirmationDialog } from "../../ui/dialogs/ConfirmationDialog";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

// Opacity follows the owning React state; rebuilding keeps each render's single-use node independent.
function createTimestampIconElement(active: boolean): SVGElement {
    const element = document.createElementNS(SVG_NAMESPACE, "svg");
    element.setAttribute("width", "16");
    element.setAttribute("height", "16");
    element.setAttribute("viewBox", "0 0 16 16");
    element.setAttribute("fill", "none");

    const opacity = active ? "1" : "0.5";
    const circle = document.createElementNS(SVG_NAMESPACE, "circle");
    circle.setAttribute("cx", "8");
    circle.setAttribute("cy", "8");
    circle.setAttribute("r", "6.5");
    circle.setAttribute("stroke", "currentColor");
    circle.setAttribute("stroke-width", "1");
    circle.setAttribute("opacity", opacity);

    const hands = document.createElementNS(SVG_NAMESPACE, "polyline");
    hands.setAttribute("points", "8,4 8,8 11,10");
    hands.setAttribute("stroke", "currentColor");
    hands.setAttribute("stroke-width", "1");
    hands.setAttribute("stroke-linecap", "round");
    hands.setAttribute("stroke-linejoin", "round");
    hands.setAttribute("opacity", opacity);

    element.append(circle, hands);
    return element;
}

function createClearIconElement(): SVGElement {
    const element = document.createElementNS(SVG_NAMESPACE, "svg");
    element.setAttribute("width", "16");
    element.setAttribute("height", "16");
    element.setAttribute("viewBox", "0 0 16 16");
    element.setAttribute("fill", "none");

    const path = document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", "M2 5h8M2 8h5M2 11h3M10.5 5.5l4 4M14.5 5.5l-4 4");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.1");
    path.setAttribute("stroke-linecap", "round");
    element.append(path);
    return element;
}

function LogToolbarBits({ model }: { model: LogViewEditor }) {
    const showTimestamps = model.state.use((s) => s.showTimestamps);
    return (
        <>
            <IconButton
                name="log-clear"
                size="sm"
                icon={createClearIconElement()}
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
                icon={createTimestampIconElement(showTimestamps)}
                title={showTimestamps ? "Hide timestamps" : "Show timestamps"}
                onClick={model.toggleTimestamps}
            />
        </>
    );
}

function LogViewEditorView({ model }: { model: EditorModel }) {
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
