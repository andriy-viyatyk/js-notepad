import styled from "@emotion/styled";
import { clsx } from "clsx";
import { TextFileModel } from "./TextFilePage.model";
import { TextEditor } from "./TextEditor";
import { PageToolbar } from "../shared/PageToolbar";
import { TextFileActions } from "./TextFileActions";
import { ScriptEditor } from "./ScriptEditor";
import { TextFileFooterActions } from "./TextFileFooterActions";
import { FlexSpace } from "../../controls/Elements";
import color from "../../theme/color";

const TextFilePageRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    height: 200,
    rowGap: 2,
    "&:not(.isActive)": {
        display: "none",
    },
    "& .encoding-label": {
        padding: "0 8px",
        color: color.text.light,
    }
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
    const encoding = model.state.use(s => s.encoding);

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
                <FlexSpace />
                <span className="encoding-label">{encoding || "utf-8"}</span>
            </PageToolbar>
        </TextFilePageRoot>
    );
}
