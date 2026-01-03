import styled from "@emotion/styled";
import { clsx } from "clsx";
import { TextFileModel } from "./TextFilePage.model";
import { TextEditor } from "./TextEditor";
import { PageToolbar } from "../shared/PageToolbar";
import { TextFileActions } from "./TextFileActions";
import { ScriptEditor } from "./ScriptEditor";
import { TextFileFooterActions } from "./TextFileFooterActions";

const TextFilePageRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    height: 200,
    rowGap: 2,
    "&:not(.isActive)": {
        display: "none",
    },
});

interface TextFilePageProps {
    model: TextFileModel;
    isActive: boolean;
    className?: string;
}

export function TextFilePage({
    model,
    isActive,
    className,
}: TextFilePageProps) {
    return (
        <TextFilePageRoot
            className={clsx("file-page", className, { isActive })}
            onKeyDown={model.handleKeyDown}
        >
            <PageToolbar borderBottom>
                <TextFileActions model={model} />
            </PageToolbar>
            <TextEditor model={model} />
            <ScriptEditor model={model} />
            <PageToolbar borderTop>
                <TextFileFooterActions model={model} />
            </PageToolbar>
        </TextFilePageRoot>
    );
}
