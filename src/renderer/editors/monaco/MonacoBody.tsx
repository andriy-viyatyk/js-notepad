import { Editor } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { useCallback, useEffect, useRef } from "react";
import type React from "react";

import type { MonacoEditor, MonacoQueueRequest } from "./MonacoEditor";
import type { TextFileModel } from "../text/TextEditorModel";
import { api } from "../../../ipc/renderer/api";
import { isFocusInSidebar } from "../../core/utils/focus-utils";
import { convertHtmlToMarkdown, readClipboardHtml } from "../text/paste-rich-text";
import { Panel } from "../../uikit/Panel";

interface MonacoBodyProps {
    model: MonacoEditor;
}

export function MonacoBody({ model }: MonacoBodyProps) {
    const monacoRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
    const cleanupsRef = useRef<(() => void)[]>([]);
    const host = model.contentHost as TextFileModel | null;

    // Subscribe to host content / language / encryption slice. Use a stable
    // empty object when host is missing so hook order stays consistent.
    const sliced = (host?.state.use((s) => ({
        content: s.content,
        language: s.language,
        encrypted: s.encrypted,
    })) ?? { content: "", language: "plaintext", encrypted: false }) as {
        content: string;
        language: string | undefined;
        encrypted: boolean | undefined;
    };

    // Drain fire-and-forget events (revealLine / highlightText / focus).
    model.typedQueue.use((ev) => {
        const ed = monacoRef.current;
        if (!ed) return;
        switch (ev.type) {
            case "revealLine":
                ed.revealLineInCenter(ev.line);
                ed.setPosition({ lineNumber: ev.line, column: 1 });
                ed.focus();
                break;
            case "highlightText":
                applyFindMatchDecorations(ed, decorationsRef, ev.text);
                break;
            case "focus":
                ed.focus();
                break;
        }
    });

    // Handle request/reply queries (getSelectedText / insertText / etc.).
    model.typedQueue.useRequest((req: MonacoQueueRequest) => {
        const ed = monacoRef.current;
        if (!ed) throw new Error("Monaco not mounted");
        switch (req.type) {
            case "getSelectedText": {
                const sel = ed.getSelection();
                if (!sel || sel.isEmpty()) return "";
                return ed.getModel()?.getValueInRange(sel) ?? "";
            }
            case "getCursorPosition": {
                const p = ed.getPosition();
                return p
                    ? { lineNumber: p.lineNumber, column: p.column }
                    : { lineNumber: 1, column: 1 };
            }
            case "insertText": {
                const sel = ed.getSelection();
                if (!sel) return undefined;
                ed.executeEdits("script", [
                    {
                        range: new monaco.Range(
                            sel.startLineNumber,
                            sel.startColumn,
                            sel.startLineNumber,
                            sel.startColumn,
                        ),
                        text: req.text,
                        forceMoveMarkers: true,
                    },
                ]);
                return undefined;
            }
            case "replaceSelection": {
                const sel = ed.getSelection();
                if (!sel) return undefined;
                ed.executeEdits("script", [
                    { range: sel, text: req.text, forceMoveMarkers: true },
                ]);
                return undefined;
            }
        }
    });

    const handleMount = useCallback(
        (ed: monaco.editor.IStandaloneCodeEditor) => {
            monacoRef.current = ed;
            const cleanups: (() => void)[] = [];
            cleanups.push(setupWheelZoom(ed));
            cleanups.push(setupSelectionListener(ed, model));
            cleanups.push(setupRichPaste(ed, host));
            cleanupsRef.current = cleanups;
            // Mount-autofocus lets the user type right after opening/switching to
            // this page — but sidebar-driven navigation (Explorer click) must not
            // pull focus out of the sidebar (US-808).
            if (!isFocusInSidebar()) ed.focus();
        },
        [model, host],
    );

    useEffect(() => {
        return () => {
            for (const fn of cleanupsRef.current) fn();
            cleanupsRef.current = [];
            decorationsRef.current?.clear();
            decorationsRef.current = null;
            monacoRef.current = null;
        };
    }, []);

    const handleChange = useCallback(
        (value: string | undefined) => {
            host?.changeContent(value ?? "", true);
        },
        [host],
    );

    if (!host) return null;

    return (
        <Panel name="monaco-body" direction="column" flex position="relative" overflow="hidden">
            <Editor
                value={sliced.content}
                language={sliced.language}
                onMount={handleMount}
                onChange={handleChange}
                theme="custom-dark"
                options={{
                    automaticLayout: true,
                    readOnly: !!sliced.encrypted,
                    // OS file drops are handled app-wide (open as tab / import into trees);
                    // don't let Monaco insert a dropped file into the editor text.
                    dropIntoEditor: { enabled: false },
                }}
            />
        </Panel>
    );
}

// ── Inline setup helpers (each returns a teardown closure) ──────────────

function setupWheelZoom(ed: monaco.editor.IStandaloneCodeEditor): () => void {
    const dom = ed.getDomNode();
    if (!dom) return () => undefined;
    const handler = (e: WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        e.stopPropagation();
        api.zoom(e.deltaY < 0 ? 0.5 : -0.5);
    };
    dom.addEventListener("wheel", handler, { passive: false, capture: true });
    return () => dom.removeEventListener("wheel", handler, { capture: true });
}

function setupSelectionListener(
    ed: monaco.editor.IStandaloneCodeEditor,
    model: MonacoEditor,
): () => void {
    const sub = ed.onDidChangeCursorSelection(() => {
        const sel = ed.getSelection();
        const has = sel ? !sel.isEmpty() : false;
        if (model.state.get().hasSelection !== has) {
            model.state.update((s) => {
                s.hasSelection = has;
            });
        }
    });
    return () => sub.dispose();
}

function setupRichPaste(
    ed: monaco.editor.IStandaloneCodeEditor,
    host: TextFileModel | null,
): () => void {
    if (!host) return () => undefined;
    const action = ed.addAction({
        id: "paste-as-rich",
        label: "Paste as Markdown / HTML",
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyV,
        ],
        run: async () => {
            const language = host.state.get().language;
            if (language !== "markdown" && language !== "html") return;
            const html = await readClipboardHtml();
            if (!html) return;
            const text = language === "html" ? html : await convertHtmlToMarkdown(html);
            const sel = ed.getSelection();
            if (sel) {
                ed.executeEdits("paste", [
                    { range: sel, text, forceMoveMarkers: true },
                ]);
            }
        },
    });
    return () => action.dispose();
}

function applyFindMatchDecorations(
    ed: monaco.editor.IStandaloneCodeEditor,
    ref: React.MutableRefObject<monaco.editor.IEditorDecorationsCollection | null>,
    text: string | undefined,
): void {
    const m = ed.getModel();
    if (!m) return;
    if (!text?.trim()) {
        ref.current?.clear();
        return;
    }
    const matches = m.findMatches(text, false, false, false, null, false);
    const decorations: monaco.editor.IModelDeltaDecoration[] = matches.map((match) => ({
        range: match.range,
        options: { className: "findMatch" },
    }));
    if (ref.current) ref.current.set(decorations);
    else ref.current = ed.createDecorationsCollection(decorations);
}
