import { Editor } from "@monaco-editor/react";
import { IDisposable, editor as MonacoEditor } from "monaco-editor";
import styled from "@emotion/styled";

import { TextFileModel } from "./TextFilePage.model";
import { TModel } from "../../common/classes/model";
import { useEffect } from "react";
import { pagesModel } from "../../model/pages-model";
import { api } from "../../ipc/renderer/api";
import { TComponentState } from "../../common/classes/state";

const TextEditorRoot = styled.div({
    flex: '1 1 auto',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
});

export const defaultTextEditorState = {
    hasSelection: false,
}

export type TextEditorState = typeof defaultTextEditorState;

export class TextEditorModel extends TModel<TextEditorState> {
    private pageModel: TextFileModel;
    editorRef = null as MonacoEditor.IStandaloneCodeEditor | null;
    private wheelListenerCleanup: (() => void) | null = null;
    private selectionListenerDisposable: IDisposable | null = null;

    constructor(pageModel: TextFileModel) {
        super(new TComponentState(defaultTextEditorState));
        this.pageModel = pageModel;
    }

    handleEditorDidMount = (editor: MonacoEditor.IStandaloneCodeEditor) => {
        this.editorRef = editor;
        this.focusEditor();
        this.setupWheelZoom(editor);
        this.setupSelectionListener(editor);
    };

    handleEditorChange = (value: string | undefined) => {
        this.pageModel.changeContent(value || "");
    }

    focusEditor = () => {
        this.editorRef?.focus();
    }

    setupSelectionListener = (editor: MonacoEditor.IStandaloneCodeEditor) => {
        this.selectionListenerDisposable = editor.onDidChangeCursorSelection((e) => {
            const selection = editor.getSelection();
            const hasSelection = selection ? !selection.isEmpty() : false;
            
            if (this.state.get().hasSelection !== hasSelection) {
                this.state.update(s => { s.hasSelection = hasSelection; });
            }
        });
    };

    getSelectedText = (): string => {
        if (!this.editorRef) {
            return "";
        }
        
        const selection = this.editorRef.getSelection();
        if (!selection || selection.isEmpty()) {
            return "";
        }
        
        return this.editorRef.getModel()?.getValueInRange(selection) || "";
    };

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
        this.selectionListenerDisposable?.dispose();
        this.selectionListenerDisposable = null;
        this.wheelListenerCleanup?.();
        this.wheelListenerCleanup = null;
    }
}

interface TextEditorProps {
    model: TextFileModel;
}

export function TextEditor({model}: TextEditorProps) {
    const editorModel = model.editor;
    const pageState = model.state.use();

    useEffect(() => {
        const subscription = pagesModel.onFocus.subscribe((pageModel) => {
            if (pageModel === model as any) {
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
        <TextEditorRoot>
            <Editor
                value={pageState.content}
                language={pageState.language}
                onMount={editorModel.handleEditorDidMount}
                onChange={editorModel.handleEditorChange}
                theme="custom-dark"
            />
        </TextEditorRoot>
    )
}