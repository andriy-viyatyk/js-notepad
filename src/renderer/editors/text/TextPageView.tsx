import styled from "@emotion/styled";
import { clsx } from "clsx";
import { TextFileModel } from "./TextPageModel";
import { PageToolbar } from "../base/EditorToolbar";
import { TextToolbar } from "./TextToolbar";
import { ScriptPanel } from "./ScriptPanel";
import { TextFooter } from "./TextFooter";
import color from "../../theme/color";
import { EncryptionPanel } from "./EncryptionPanel";
import { ActiveEditor } from "./ActiveEditor";
import { FlexSpace } from "../../components/layout/Elements";

const TextPageViewRoot = styled.div({
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

interface TextPageViewProps {
    model: TextFileModel;
}

export function TextPageView({ model }: TextPageViewProps) {
    const { showEncryptionPanel, restored } = model.state.use((s) => ({
        showEncryptionPanel: s.showEncryptionPanel,
        restored: s.restored,
    }));

    return (
        <TextPageViewRoot
            className={clsx("file-page")}
            onKeyDown={model.handleKeyDown}
            tabIndex={0}
        >
            <PageToolbar borderBottom>
                <TextToolbar
                    model={model}
                    setEditorToolbarRefLast={model.setEditorToolbarRefLast}
                    setEditorToolbarRefFirst={model.setEditorToolbarRefFirst}
                />
            </PageToolbar>
            {restored ? <ActiveEditor model={model} /> : <FlexSpace />}
            <ScriptPanel model={model} />
            <PageToolbar borderTop className="footer-bar">
                <TextFooter model={model} />
            </PageToolbar>
            {showEncryptionPanel && (
                <EncryptionPanel
                    model={model}
                    onSubmit={model.onSubmitPassword}
                    onCancel={model.onCancelPassword}
                />
            )}
        </TextPageViewRoot>
    );
}

// Re-export with old name for backward compatibility
export { TextPageView as TextFilePage };
