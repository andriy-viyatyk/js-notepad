import styled from "@emotion/styled";
import { clsx } from "clsx";
import { TextFileModel } from "./TextFilePage.model";
import { PageToolbar } from "../shared/PageToolbar";
import { TextFileActions } from "./TextFileActions";
import { ScriptEditor } from "./ScriptEditor";
import { TextFileFooterActions } from "./TextFileFooterActions";
import color from "../../theme/color";
import { EncriptionPanel } from "./EncriptionPanel";
import { ActiveEditor } from "./ActiveEditor";
import { FlexSpace } from "../../components/layout/Elements";

const TextFilePageRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    height: 200,
    rowGap: 2,
    position: "relative",
    "& .footer-bar": {
        paddingRight: 8,
        "& .footer-label": {
            padding: "0 8px 0 0",
            color: color.text.light,
            "&::before": {
                content: '"|"',
                marginRight: 8,
                color: color.border.default,
            },
        },
        "& .hide-empty": {
            "&:empty": {
                display: "none",
            },
        },
    },
});

interface TextFilePageProps {
    model: TextFileModel;
}

export function TextFilePage({ model }: TextFilePageProps) {
    const { showEncryptionPanel, restored } = model.state.use((s) => ({
        showEncryptionPanel: s.showEncryptionPanel,
        restored: s.restored,
    }));

    return (
        <TextFilePageRoot
            className={clsx("file-page")}
            onKeyDown={model.handleKeyDown}
            tabIndex={0}
        >
            <PageToolbar borderBottom>
                <TextFileActions
                    model={model}
                    setEditorToolbarRefLast={model.setEditorToolbarRefLast}
                    setEditorToolbarRefFirst={model.setEditorToolbarRefFirst}
                />
            </PageToolbar>
            {restored ? <ActiveEditor model={model} /> : <FlexSpace />}
            <ScriptEditor model={model} />
            <PageToolbar borderTop className="footer-bar">
                <TextFileFooterActions model={model} />
            </PageToolbar>
            {showEncryptionPanel && (
                <EncriptionPanel
                    model={model}
                    onSubmit={model.onSubmitPassword}
                    onCancel={model.onCancelPassword}
                />
            )}
        </TextFilePageRoot>
    );
}
