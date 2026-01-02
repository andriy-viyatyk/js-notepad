import styled from "@emotion/styled";
import { clsx } from "clsx";
import { TextFileModel } from "./TextFilePage.model";
import { TextEditor } from "./TextEditor";

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
            <TextEditor model={model} />
        </TextFilePageRoot>
    );
}
