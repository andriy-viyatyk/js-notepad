import { Editor } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import styled from "@emotion/styled";

import { TextFileModel } from "./TextPageModel";
import { TModel } from "../../core/state/model";
import { useEffect } from "react";
import { pagesModel } from "../../store";
import { api } from "../../../ipc/renderer/api";
import { TComponentState } from "../../core/state/state";

const TextEditorRoot = styled.div({
    flex: "1 1 auto",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
});

export const defaultTextEditorState = {
    hasSelection: false,
};

export type TextEditorState = typeof defaultTextEditorState;

export class TextEditorModel extends TModel<TextEditorState> {
    private pageModel: TextFileModel;
    editorRef = null as monaco.editor.IStandaloneCodeEditor | null;
    private wheelListenerCleanup: (() => void) | null = null;
    private selectionListenerDisposable: monaco.IDisposable | null = null;
    /** Set before mount to scroll Monaco to a specific line after it initializes */
    pendingRevealLine: number | null = null;
    private highlightDecorations: monaco.editor.IEditorDecorationsCollection | null = null;
    private pendingHighlightText: string | undefined = undefined;

    constructor(pageModel: TextFileModel) {
        super(new TComponentState(defaultTextEditorState));
        this.pageModel = pageModel;
    }

    handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
        this.editorRef = editor;
        this.focusEditor();
        this.setupWheelZoom(editor);
        this.setupSelectionListener(editor);

        if (this.pendingRevealLine) {
            const line = this.pendingRevealLine;
            this.pendingRevealLine = null;
            editor.revealLineInCenter(line);
            editor.setPosition({ lineNumber: line, column: 1 });
        }

        if (this.pendingHighlightText) {
            this.setHighlightText(this.pendingHighlightText);
            this.pendingHighlightText = undefined;
        }
    };

    handleEditorChange = (value: string | undefined) => {
        this.pageModel.changeContent(value || "", true);
    };

    focusEditor = () => {
        this.editorRef?.focus();
    };

    /**
     * Apply find-match decorations for search highlighting.
     * Stores as pending if editor is not yet mounted.
     */
    setHighlightText = (text: string | undefined) => {
        const editor = this.editorRef;
        const model = editor?.getModel();
        if (!editor || !model) {
            this.pendingHighlightText = text;
            return;
        }

        if (!text?.trim()) {
            this.highlightDecorations?.clear();
            return;
        }

        const matches = model.findMatches(text, false, false, false, null, false);
        const decorations: monaco.editor.IModelDeltaDecoration[] = matches.map(match => ({
            range: match.range,
            options: { className: "findMatch" },
        }));

        if (this.highlightDecorations) {
            this.highlightDecorations.set(decorations);
        } else {
            this.highlightDecorations = editor.createDecorationsCollection(decorations);
        }
    };

    revealLine = (lineNumber: number) => {
        if (this.editorRef) {
            this.editorRef.revealLineInCenter(lineNumber);
            this.editorRef.setPosition({ lineNumber, column: 1 });
            this.editorRef.focus();
        } else {
            this.pendingRevealLine = lineNumber;
        }
    };

    setupSelectionListener = (editor: monaco.editor.IStandaloneCodeEditor) => {
        this.selectionListenerDisposable = editor.onDidChangeCursorSelection(
            (e) => {
                const selection = editor.getSelection();
                const hasSelection = selection ? !selection.isEmpty() : false;

                if (this.state.get().hasSelection !== hasSelection) {
                    this.state.update((s) => {
                        s.hasSelection = hasSelection;
                    });
                }
            }
        );
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

    setupWheelZoom = (editor: monaco.editor.IStandaloneCodeEditor) => {
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

            editorDomNode.addEventListener("wheel", handleWheel, {
                passive: false,
                capture: true,
            });

            this.wheelListenerCleanup = () => {
                editorDomNode.removeEventListener("wheel", handleWheel, {
                    capture: true,
                });
            };
        }
    };

    onDispose = () => {
        this.highlightDecorations?.clear();
        this.highlightDecorations = null;
        this.selectionListenerDisposable?.dispose();
        this.selectionListenerDisposable = null;
        this.wheelListenerCleanup?.();
        this.wheelListenerCleanup = null;
    };
}

interface TextEditorProps {
    model: TextFileModel;
}

export function TextEditor({ model }: TextEditorProps) {
    const editorModel = model.editor;
    const { content, language } = model.state.use((s) => ({
        content: s.content,
        language: s.language,
    }));

    useEffect(() => {
        const subscription = pagesModel.onFocus.subscribe((pageModel) => {
            if (pageModel === (model as any)) {
                setTimeout(() => {
                    editorModel.focusEditor();
                }, 0);
            }
        });
        return () => {
            subscription.unsubscribe();
            editorModel.onDispose();
        };
    }, []);

    return (
        <TextEditorRoot>
            <Editor
                value={content}
                language={language}
                onMount={editorModel.handleEditorDidMount}
                onChange={editorModel.handleEditorChange}
                theme="custom-dark"
                options={{
                    automaticLayout: true,
                }}
            />
        </TextEditorRoot>
    );
}
