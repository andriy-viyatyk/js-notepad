import { useRef, useEffect, useCallback } from "react";
import * as monaco from "monaco-editor";
import { TextOutputEntry } from "../logTypes";
import { DialogHeader } from "./DialogHeader";
import { IconButton, Panel } from "../../../uikit";
import { OpenLinkIcon } from "../../../theme/icons";
import { pagesModel } from "../../../api/pages";
import { DIALOG_CONTENT_MAX_HEIGHT } from "../logConstants";

// =============================================================================
// Constants
// =============================================================================

const PADDING_VERTICAL = 4;

// =============================================================================
// Component
// =============================================================================

interface TextOutputViewProps {
    entry: TextOutputEntry;
}

export function TextOutputView({ entry }: TextOutputViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

    // Create / dispose Monaco editor
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const editor = monaco.editor.create(container, {
            value: entry.text,
            language: entry.language || "plaintext",
            readOnly: true,
            domReadOnly: true,
            wordWrap: entry.wordWrap !== false ? "on" : "off",
            lineNumbers: entry.lineNumbers ? "on" : "off",
            minimap: { enabled: entry.minimap === true },
            scrollBeyondLastLine: false,
            renderLineHighlight: "none",
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            folding: false,
            contextmenu: false,
            automaticLayout: true,
            scrollbar: {
                alwaysConsumeMouseWheel: false,
            },
            padding: { top: PADDING_VERTICAL, bottom: PADDING_VERTICAL },
        });

        editorRef.current = editor;

        const sizeDisposable = editor.onDidContentSizeChange(() => {
            const contentHeight = editor.getContentHeight();
            const height = Math.min(contentHeight, DIALOG_CONTENT_MAX_HEIGHT);
            container.style.height = `${height}px`;
            editor.layout();
        });

        return () => {
            sizeDisposable.dispose();
            editorRef.current = null;
            editor.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: create the Monaco editor once with the initial entry config; subsequent entry.text changes flow through the separate effect below
    }, []);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;

        const model = editor.getModel();
        if (model) {
            const currentValue = model.getValue();
            if (currentValue !== entry.text) {
                model.setValue(entry.text);
            }
            const currentLang = model.getLanguageId();
            const targetLang = entry.language || "plaintext";
            if (currentLang !== targetLang) {
                monaco.editor.setModelLanguage(model, targetLang);
            }
        }

        editor.updateOptions({
            wordWrap: entry.wordWrap !== false ? "on" : "off",
            lineNumbers: entry.lineNumbers ? "on" : "off",
            minimap: { enabled: entry.minimap === true },
        });
    }, [entry.text, entry.language, entry.wordWrap, entry.lineNumbers, entry.minimap]);

    const handleOpenInEditor = useCallback(() => {
        const title = typeof entry.title === "string" ? entry.title : "Text";
        pagesModel.addEditorPage("monaco", entry.language || "plaintext", title, entry.text);
    }, [entry.text, entry.language, entry.title]);

    return (
        <Panel
            name="log-text-output"
            direction="column"
            position="relative"
            border
            rounded="md"
            overflow="hidden"
            width="100%"
            revealChildrenOnHover
        >
            <DialogHeader title={entry.title} />
            <div ref={containerRef} style={{ overflow: "hidden" }} />
            <Panel
                name="log-text-hover-actions"
                position="absolute"
                top={4}
                right={4}
                zIndex={1}
            >
                <IconButton
                    name="log-text-open-in-editor"
                    hideUntilParentHover
                    size="sm"
                    icon={<OpenLinkIcon />}
                    title="Open in Text editor"
                    onClick={handleOpenInEditor}
                />
            </Panel>
        </Panel>
    );
}
