import styled from "@emotion/styled";
import { clsx } from "clsx";
import { TextFileModel } from "./TextFilePage.model";
import { TextEditor } from "./TextEditor";
import { PageHeader } from "../shared/PageHeader";
import { TextFileActions } from "./TextFileActions";

const TextFilePageRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    height: 200,
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
            <PageHeader>
                <TextFileActions model={model} />
            </PageHeader>
            <TextEditor model={model} />
        </TextFilePageRoot>
    );
}
