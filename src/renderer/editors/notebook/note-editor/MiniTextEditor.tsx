import React, { useEffect, useRef } from "react";
import { NoteItemEditModel } from "./NoteItemEditModel";
import type { EditorConfig } from "../../base/EditorConfig";
import { MonacoEditorHost } from "../../shared/MonacoEditorHost";
import type { MonacoEditorHostView } from "../../shared/MonacoEditorHostView";

// =============================================================================
// Component
// =============================================================================

interface MiniTextEditorProps {
    model: NoteItemEditModel;
    editorConfig?: EditorConfig;
}

/**
 * Simplified Monaco editor for note items.
 * - No line numbers
 * - No minimap
 * - Minimal chrome
 * - Auto-resizes based on content
 */
export function MiniTextEditor({ model, editorConfig = {} }: MiniTextEditorProps) {
    const editorModel = model.editor;
    const hostRef = useRef<MonacoEditorHostView | null>(null);
    const { content, language } = model.state.use((s) => ({
        content: s.content,
        language: s.language,
    }));
    const { contentHeight: rawContentHeight } = editorModel.state.use((s) => ({
        contentHeight: s.contentHeight,
    }));

    const fillContainer = editorConfig.fillContainer;

    // Apply max height from context (only in content-sized mode)
    const contentHeight = fillContainer
        ? undefined
        : editorConfig.maxEditorHeight
            ? Math.min(rawContentHeight, editorConfig.maxEditorHeight)
            : rawContentHeight;

    // Apply external search highlighting decorations
    useEffect(() => {
        editorModel.setHighlightText(editorConfig.highlightText);
    }, [editorConfig.highlightText, editorModel]);

    useEffect(() => {
        hostRef.current?.setValue(content);
    }, [content]);

    const rootStyle: React.CSSProperties = fillContainer
        ? { position: "relative", flex: "1 1 auto", overflow: "hidden" }
        : { position: "relative", height: contentHeight };

    return (
        <div style={rootStyle}>
            <MonacoEditorHost
                initialValue={content}
                language={language}
                onMount={(host) => {
                    hostRef.current = host;
                    editorModel.handleEditorDidMount(host.getEditor());
                }}
                onChange={editorModel.handleEditorChange}
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
        </div>
    );
}
