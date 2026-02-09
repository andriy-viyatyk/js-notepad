import { Editor } from "@monaco-editor/react";
import styled from "@emotion/styled";
import { NoteItemEditModel } from "./NoteItemEditModel";
import { useEditorConfig } from "../../base";

// =============================================================================
// Styles
// =============================================================================

const MiniTextEditorRoot = styled.div({
    position: "relative",
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
 * - Auto-resizes based on content
 */
export function MiniTextEditor({ model }: MiniTextEditorProps) {
    const editorModel = model.editor;
    const editorConfig = useEditorConfig();
    const { content, language } = model.state.use((s) => ({
        content: s.content,
        language: s.language,
    }));
    const { contentHeight: rawContentHeight } = editorModel.state.use((s) => ({
        contentHeight: s.contentHeight,
    }));

    // Apply max height from context
    const contentHeight = editorConfig.maxEditorHeight
        ? Math.min(rawContentHeight, editorConfig.maxEditorHeight)
        : rawContentHeight;

    return (
        <MiniTextEditorRoot style={{ height: contentHeight }}>
            <Editor
                key={model.id}  // Force remount when note changes (ensures onMount is called)
                height={contentHeight}
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

                    // Minimap controlled by context
                    minimap: { enabled: !editorConfig.hideMinimap },

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

                    // Don't add extra space after last line
                    scrollBeyondLastLine: false,

                    // Padding (top/bottom only, left is via lineDecorationsWidth)
                    padding: { top: 4, bottom: 4 },
                }}
            />
        </MiniTextEditorRoot>
    );
}
