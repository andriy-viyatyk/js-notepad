import { ReactNode } from "react";
import { TextFileModel } from "./TextFilePage.model";
import { Button } from "../../controls/Button";
import { RunAllIcon, RunIcon } from "../../theme/icons";
import { SwitchButtons } from "../../controls/SwitchButtons";
import { PageEditor } from "../../../shared/types";
import { FlexSpace } from "../../controls/Elements";

interface TextFileActionsProps {
    model: TextFileModel;
}

const jsonSwitchOptions: PageEditor[] = ["monaco", "grid-json"];
const jsonSwitchLabels: {
    [key in PageEditor]: ReactNode;
} = {
    monaco: "JSON",
    "grid-json": "Grid",
};
const getJsonSwitchLabel = (option: PageEditor) =>
    jsonSwitchLabels[option] || jsonSwitchLabels["monaco"];

export function TextFileActions({ model }: TextFileActionsProps) {
    const actions: ReactNode[] = [];
    const { hasSelection } = model.editor.state.use((s) => ({
        hasSelection: s.hasSelection,
    }));

    const { language, editor } = model.state.use((s) => ({
        language: s.language,
        editor: s.editor,
    }));

    if (language === "javascript") {
        actions.push(
            <Button
                key="run-script"
                type="icon"
                size="small"
                title={
                    hasSelection
                        ? "Run Selected Script (F5)"
                        : "Run Script (F5)"
                }
                onClick={() => model.runScript()}
            >
                <RunIcon />
            </Button>
        );
        if (hasSelection) {
            actions.push(
                <Button
                    key="run-all_script"
                    type="icon"
                    size="small"
                    title="Run All Script"
                    onClick={() => model.runScript(true)}
                >
                    <RunAllIcon />
                </Button>
            );
        }
    }

    const lastItems: ReactNode[] = [];
    if (language === "json") {
        lastItems.push(
            <SwitchButtons
                options={jsonSwitchOptions}
                value={editor || "monaco"}
                onChange={model.changeEditor}
                getLabel={getJsonSwitchLabel}
                style={{ margin: 1 }}
            />
        );
    }

    if (lastItems.length > 0) {
        actions.push(
            <FlexSpace key="flex-space" />,
            ...lastItems
        )
    }

    return <>{actions}</>;
}
