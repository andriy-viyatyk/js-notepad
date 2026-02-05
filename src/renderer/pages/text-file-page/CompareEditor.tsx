import styled from "@emotion/styled";
import * as monaco from "monaco-editor";
import { TextFileModel } from "./TextFilePage.model";
import { DiffEditor } from "@monaco-editor/react";
import { PageToolbar } from "../shared/PageToolbar";
import { Button } from "../../components/basic/Button";
import { CompareIcon } from "../../theme/icons";
import { TComponentModel, useComponentModel } from "../../core/state/model";
import { useEffect } from "react";
import color from "../../theme/color";

const CompareEditorRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    height: "100%",
    "& .file-path": {
        flex: "1 1 auto",
        overflow: "hidden",
        direction: "rtl",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        textAlign: "left",
        color: color.text.light,
        "&.file-path-left": {
            textAlign: "right",
        },
    },
    "& .arrow-icon": {
        margin: "0 8px",
        fontSize: 20,
    },
});

interface CompareEditorProps {
    model: TextFileModel;
    groupedModel: TextFileModel;
}

class CompareEditorModel extends TComponentModel<null, CompareEditorProps> {
    didChangeSubscription: monaco.IDisposable | null = null;
    editor: monaco.editor.IStandaloneDiffEditor | null = null;

    editorDidMount = (editor: monaco.editor.IStandaloneDiffEditor) => {
        this.editor = editor;
        const modifiedEditor = editor.getModifiedEditor();
        this.didChangeSubscription = modifiedEditor.onDidChangeModelContent(
            () => {
                const newValue = modifiedEditor.getValue();
                this.props.groupedModel.changeContent(newValue, true);
            },
        );
    };

    dispose() {
        this.didChangeSubscription?.dispose();
        this.editor?.dispose();
        this.editor = null;
    }
}

export function CompareEditor(props: CompareEditorProps) {
    const { model, groupedModel } = props;
    const editorModel = useComponentModel(props, CompareEditorModel, null);

    const { language, content, filePath, title } = model.state.use((s) => ({
        language: s.language,
        content: s.content,
        filePath: s.filePath,
        title: s.title,
    }));
    const { groupedContent, groupedFilePath, groupedTitle } =
        groupedModel.state.use((s) => ({
            groupedContent: s.content,
            groupedFilePath: s.filePath,
            groupedTitle: s.title,
        }));

    useEffect(() => {
        return () => {
            editorModel.dispose();
        };
    }, []);

    return (
        <CompareEditorRoot>
            <PageToolbar borderBottom>
                <div
                    className="file-path file-path-left"
                    title={filePath || title}
                >
                    {filePath || title}
                </div>
                <span className="arrow-icon">→</span>
                <div
                    className="file-path"
                    title={groupedFilePath || groupedTitle}
                >
                    {groupedFilePath || groupedTitle}
                </div>
                <Button
                    size="small"
                    type="icon"
                    title="Exit Compare Mode"
                    onClick={() => {
                        model.setCompareMode(false);
                        groupedModel.setCompareMode(false);
                    }}
                >
                    <CompareIcon />
                </Button>
            </PageToolbar>
            <DiffEditor
                language={language}
                original={content}
                modified={groupedContent}
                onMount={editorModel.editorDidMount}
                options={{
                    readOnly: false,
                    renderSideBySide: true,
                    automaticLayout: true,
                }}
                theme="custom-dark"
            />
        </CompareEditorRoot>
    );
}
