import { ReactNode } from "react";
import { TextFileModel } from "./TextFilePage.model";
import { Button } from "../../controls/Button";
import { RunAllIcon, RunIcon } from "../../theme/icons";

interface TextFileActionsProps {
    model: TextFileModel;
}

export function TextFileActions({ model }: TextFileActionsProps) {
    const actions: ReactNode[] = [];
    const hasSelection = model.editor.state.use(s => s.hasSelection);

    const { language } = model.state.use(s => ({ language: s.language }));
    if (language === 'javascript') {
        actions.push(
            <Button
                key="run-script"
                type="icon"
                size="small"
                title={hasSelection ? "Run Selected Script (F5)" : "Run Script (F5)"}
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

    return <>{actions}</>
}