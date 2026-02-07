import { Editor } from "@monaco-editor/react";
import styled from "@emotion/styled";
import { NoteItemEditModel } from "./NoteItemEditModel";

// =============================================================================
// Styles
// =============================================================================

const MiniTextEditorRoot = styled.div({
    flex: "1 1 auto",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 100,
});

// =============================================================================
// Component
// =============================================================================

interface MiniTextEditorProps {
    model: NoteItemEditModel;
}

/**
 * Simplified Monaco editor for note items.
 * - No line numbers
 * - No minimap
 * - Minimal chrome
 */
export function MiniTextEditor({ model }: MiniTextEditorProps) {
    const editorModel = model.editor;
    const { content, language } = model.state.use((s) => ({
        content: s.content,
        language: s.language,
    }));

    return (
        <MiniTextEditorRoot>
            <Editor
                value={content}
                language={language}
                onMount={editorModel.handleEditorDidMount}
                onChange={editorModel.handleEditorChange}
                theme="custom-dark"
                options={{
                    // Disable line numbers
                    lineNumbers: "off",
                    lineNumbersMinChars: 0,
                    lineDecorationsWidth: 4,  // Left padding
                    glyphMargin: false,

                    // Disable minimap
                    minimap: { enabled: false },

                    // Disable overview ruler
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    overviewRulerBorder: false,

                    // Simplify scrollbars
                    scrollbar: {
                        vertical: "auto",
                        horizontal: "auto",
                        verticalScrollbarSize: 8,
                        horizontalScrollbarSize: 8,
                    },

                    // Other simplifications
                    folding: false,
                    renderLineHighlight: "none",
                    matchBrackets: "near",
                    renderWhitespace: "none",
                    guides: {
                        indentation: false,
                        bracketPairs: false,
                    },

                    // Auto layout
                    automaticLayout: true,

                    // Padding (top/bottom only, left is via lineDecorationsWidth)
                    padding: { top: 4, bottom: 4 },
                }}
            />
        </MiniTextEditorRoot>
    );
}
