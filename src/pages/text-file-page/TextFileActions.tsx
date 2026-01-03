import { ReactNode } from "react";
import { TextFileModel } from "./TextFilePage.model";
import { Button } from "../../controls/Button";
import { RunIcon } from "../../theme/icons";

interface TextFileActionsProps {
    model: TextFileModel;
}

export function TextFileActions({ model }: TextFileActionsProps) {
    const actions: ReactNode[] = [];

    const { language } = model.state.use(s => ({ language: s.language }));
    if (language === 'javascript') {
        actions.push(
            <Button
                key="run-script"
                type="icon"
                size="small"
                title="Run Script (F5)"
                onClick={model.runScript}
            >
                <RunIcon />
            </Button>
        );
    }

    return <>{actions}</>
}