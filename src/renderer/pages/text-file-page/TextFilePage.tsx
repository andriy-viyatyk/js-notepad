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
import { EncriptionPanel } from "./EncriptionPanel";
import { useEffect } from "react";

const TextFilePageRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    height: 200,
    rowGap: 2,
    position: "relative",
    "& .encoding-label": {
        padding: "0 8px",
        color: color.text.light,
    },
    "& .encription-pannel": {
        position: "absolute",
        top: 2,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10,
    },
});

interface TextFilePageProps {
    model: TextFileModel;
    className?: string;
}

export function TextFilePage({
    model,
    className,
}: TextFilePageProps) {
    const { encoding, showEncryptionPanel } = model.state.use((s) => ({
        encoding: s.encoding,
        showEncryptionPanel: s.showEncryptionPanel,
    }));

    return (
        <TextFilePageRoot
            className={clsx("file-page", className)}
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
            {showEncryptionPanel && (
                <EncriptionPanel
                    model={model}
                    className="encription-pannel"
                    onSubmit={model.onSubmitPassword}
                    onCancel={model.onCancelPassword}
                />
            )}
        </TextFilePageRoot>
    );
}
