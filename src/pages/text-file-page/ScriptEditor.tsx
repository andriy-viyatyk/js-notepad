import { Editor } from "@monaco-editor/react";
import styled from "@emotion/styled";

import { TComponentModel, useComponentModel } from "../../common/classes/model";
import { TextFileModel } from "./TextFilePage.model";
import { Spliter } from "../../controls/Spliter";
import color from "../../theme/color";
import { PageToolbar } from "../shared/PageToolbar";
import { CloseIcon, RunIcon } from "../../theme/icons";
import { Button } from "../../controls/Button";
import { FlexSpace } from "../../controls/Elements";

const ScriptEditorRoot = styled.div({
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    "& .splitter": {
        backgroundColor: color.background.dark,
    },
    "& .page-toolbar": {
        marginBottom: 2,
    },
});

interface ScriptEditorProps {
    model: TextFileModel;
}

class ScriptEditorModel extends TComponentModel<null, ScriptEditorProps> {
    handleEditorChange = (value: string | undefined) => {
        this.props.model.script.changeContent(value || "");
    };

    handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.code === "F5") {
            e.preventDefault();
            this.props.model.runRelatedScript();
        }
    };
}

export function ScriptEditor(props: ScriptEditorProps) {
    const scriptModel = useComponentModel(props, ScriptEditorModel, null);
    const state = props.model.script.state.use();

    if (!state.open) {
        return null;
    }

    return (
        <ScriptEditorRoot
            style={{ height: state.height }}
            onKeyDown={scriptModel.handleKeyDown}
        >
            <Spliter
                type="horizontal"
                initialHeight={state.height}
                borderSized="top"
                onChangeHeight={props.model.script.setHeight}
            />
            <PageToolbar borderTop>
                <Button
                    title="Run Script (F5)"
                    type="icon"
                    size="small"
                    onClick={props.model.runRelatedScript}
                >
                    <RunIcon />
                </Button>
                <FlexSpace />
                <Button
                    title="Close Script Editor"
                    type="icon"
                    size="small"
                    onClick={props.model.script.toggleOpen}
                >
                    <CloseIcon />
                </Button>
            </PageToolbar>
            <Editor
                value={state.content}
                language="javascript"
                onChange={scriptModel.handleEditorChange}
                theme="custom-dark"
            />
        </ScriptEditorRoot>
    );
}
