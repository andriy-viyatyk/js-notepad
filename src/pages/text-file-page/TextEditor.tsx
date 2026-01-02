import { Editor } from "@monaco-editor/react";
import { editor as MonacoEditor } from "monaco-editor";
import { TextFileModel } from "./TextFilePage.model";
import { TComponentModel, useComponentModel } from "../../common/classes/model";
import { useEffect } from "react";
import { pagesModel } from "../../model/pages-model";
import { api } from "../../ipc/renderer/api";

interface TextEditorProps {
    model: TextFileModel;
}

class TextEditorModel extends TComponentModel<null, TextEditorProps> {
    editorRef = null as MonacoEditor.IStandaloneCodeEditor | null;
    wheelListenerCleanup: (() => void) | null = null;

    handleEditorDidMount = (editor: MonacoEditor.IStandaloneCodeEditor) => {
        this.editorRef = editor;
        this.focusEditor();
        this.setupWheelZoom(editor);
    };

    handleEditorChange = (value: string | undefined) => {
        this.props.model.changeContent(value || "");
    }

    focusEditor = () => {
        this.editorRef?.focus();
    }

    setupWheelZoom = (editor: MonacoEditor.IStandaloneCodeEditor) => {
        const editorDomNode = editor.getDomNode();
        if (editorDomNode) {
            const handleWheel = (e: WheelEvent) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    if (e.deltaY < 0) {
                        api.zoom(0.5);
                    } else {
                        api.zoom(-0.5);
                    }
                }
            };

            editorDomNode.addEventListener('wheel', handleWheel, { 
                passive: false,
                capture: true 
            });

            this.wheelListenerCleanup = () => {
                editorDomNode.removeEventListener('wheel', handleWheel, { capture: true });
            };
        }
    };

    onDestroy = () => {
        this.wheelListenerCleanup?.();
        this.wheelListenerCleanup = null;
    }
}

export function TextEditor(props: TextEditorProps) {
    const editorModel = useComponentModel(props, TextEditorModel, null);
    const state = props.model.state.use();

    useEffect(() => {
        const subscription = pagesModel.onFocus.subscribe((pageModel) => {
            if (pageModel === props.model as any) {
                setTimeout(() => {
                    editorModel.focusEditor();
                }, 0);
            }
        });
        return () => { 
            subscription.unsubscribe();
            editorModel.onDestroy();
        };
    }, []);

    return (
        <Editor
            value={state.content}
            language={state.language}
            onMount={editorModel.handleEditorDidMount}
            onChange={editorModel.handleEditorChange}
            theme="custom-dark"
        />
    )
}