import * as monaco from "monaco-editor";

import type {
    MonacoEditor,
    MonacoQueueEvent,
    MonacoQueueRequest,
} from "./MonacoEditor";
import type {
    TextFileEditorModelState,
    TextFileModel,
} from "../text/TextEditorModel";
import {
    MonacoEditorHostView,
    type MonacoEditorHostProps,
} from "../shared/MonacoEditorHostView";
import { api } from "../../../ipc/renderer/api";
import { isFocusInSidebar } from "../../core/utils/focus-utils";
import { convertHtmlToMarkdown, readClipboardHtml } from "../text/paste-rich-text";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import "../../uikit/Panel/Panel.css";

interface HostSlice {
    content: string;
    language: string | undefined;
    encrypted: boolean | undefined;
}

function selectHostSlice(state: TextFileEditorModelState): HostSlice {
    return {
        content: state.content,
        language: state.language,
        encrypted: state.encrypted,
    };
}

export class MonacoBodyView extends VanillaView<{ model: MonacoEditor }> {
    private model: MonacoEditor;
    private host: TextFileModel | null = null;
    private hostView: MonacoEditorHostView | undefined;
    private editor: monaco.editor.IStandaloneCodeEditor | undefined;
    private decorations: monaco.editor.IEditorDecorationsCollection | undefined;
    private hostCleanups: Array<() => void> = [];

    private hostSubscription: (() => void) | undefined;
    private queueSubscription: (() => void) | undefined;
    private requestSubscription: (() => void) | undefined;

    public constructor(props: { model: MonacoEditor }) {
        super(props, createPanelElement({
            name: "monaco-body",
            direction: "column",
            flex: true,
            position: "relative",
            overflow: "hidden",
        }));
        this.model = props.model;
    }

    protected onMount(): void {
        this.model = this.props.model;
        this.mountHostIfPresent();
        this.subscribeToCurrentHost();
        this.subscribeToCurrentQueue();
    }

    protected onUpdate(props: { model: MonacoEditor }): void {
        const nextHost = props.model.contentHost as TextFileModel | null;
        const modelChanged = props.model !== this.model;
        const hostChanged = nextHost !== this.host;

        if (modelChanged || hostChanged) {
            if (modelChanged) this.releaseQueueSubscriptions();
            this.releaseCurrentHost();
            this.model = props.model;
            this.mountHostIfPresent();
            this.subscribeToCurrentHost();
            if (modelChanged || !this.queueSubscription) this.subscribeToCurrentQueue();
            return;
        }

        if (this.host) this.syncHost(selectHostSlice(this.host.state.get()));
    }

    protected onDispose(): void {
        this.releaseQueueSubscriptions();
        this.releaseCurrentHost();
        this.decorations?.clear();
        this.decorations = undefined;
        this.editor = undefined;
        this.hostView = undefined;
        this.host = null;
    }

    private mountHostIfPresent(): void {
        const host = this.model.contentHost as TextFileModel | null;
        this.host = host;
        if (!host) return;

        const slice = selectHostSlice(host.state.get());
        const view = this.child(new MonacoEditorHostView({
            ...this.hostViewProps(slice),
        }));
        this.hostView = view;
        this.root.append(view.root);
        view.mount();
    }

    private subscribeToCurrentHost(): void {
        const host = this.host;
        const hostView = this.hostView;
        if (!host || !hostView) return;

        const model = this.model;
        const unsubscribe = host.state.subscribe(
            (slice: HostSlice) => {
                if (this.model !== model || this.host !== host || this.hostView !== hostView) return;
                this.syncHost(slice);
            },
            selectHostSlice,
        );
        const release = this.ownSubscription(() => {
            unsubscribe();
            if (this.hostSubscription === release) this.hostSubscription = undefined;
        });
        this.hostSubscription = release;
        this.syncHost(selectHostSlice(host.state.get()));
    }

    private syncHost(slice: HostSlice): void {
        const view = this.hostView;
        if (!view?.isReady) return;
        view.update(this.hostViewProps(slice));
        view.setValue(slice.content);
    }

    private hostViewProps(slice: HostSlice): MonacoEditorHostProps {
        return {
            initialValue: slice.content,
            language: slice.language,
            onMount: this.onHostMount,
            onChange: this.handleChange,
            options: {
                automaticLayout: true,
                readOnly: !!slice.encrypted,
                // OS file drops are handled app-wide (open as tab / import into trees);
                // don't let Monaco insert a dropped file into the editor text.
                dropIntoEditor: { enabled: false },
            },
        };
    }

    private subscribeToCurrentQueue(): void {
        if (!this.hostView?.isReady) return;

        const queue = this.model.typedQueue;
        const unsubscribe = queue.subscribe(this.handleQueueEvent);
        const release = this.ownSubscription(() => {
            unsubscribe();
            if (this.queueSubscription === release) this.queueSubscription = undefined;
        });
        this.queueSubscription = release;

        const unregister = queue.register(this.handleQueueRequest);
        this.requestSubscription = unregister;
        this.own(() => {
            unregister();
            if (this.requestSubscription === unregister) this.requestSubscription = undefined;
        });
    }

    private releaseQueueSubscriptions(): void {
        this.queueSubscription?.();
        this.queueSubscription = undefined;
        this.requestSubscription?.();
        this.requestSubscription = undefined;
    }

    private releaseCurrentHost(): void {
        this.hostSubscription?.();
        this.hostSubscription = undefined;
        this.releaseHostCleanups();
        this.decorations?.clear();
        this.decorations = undefined;

        const hostView = this.hostView;
        this.hostView = undefined;
        this.editor = undefined;
        this.host = null;
        if (hostView) this.releaseChild(hostView);
    }

    private releaseHostCleanups(): void {
        const cleanups = this.hostCleanups;
        this.hostCleanups = [];
        cleanups.forEach((cleanup) => cleanup());
    }

    private readonly onHostMount = (hostView: MonacoEditorHostView): void => {
        this.hostView = hostView;
        const ed = hostView.getEditor();
        this.editor = ed;
        this.hostCleanups = [
            this.registerHostCleanup(setupWheelZoom(ed)),
            this.registerHostCleanup(setupSelectionListener(ed, this.model)),
            this.registerHostCleanup(setupRichPaste(ed, this.host)),
        ];
        // Mount-autofocus lets the user type right after opening/switching to
        // this page — but sidebar-driven navigation (Explorer click) must not
        // pull focus out of the sidebar (US-808).
        if (!isFocusInSidebar()) ed.focus();
    };

    private registerHostCleanup(cleanup: () => void): () => void {
        let active = true;
        const release = (): void => {
            if (!active) return;
            active = false;
            cleanup();
        };
        this.own(release);
        return release;
    }

    private readonly handleChange = (value: string): void => {
        if (!this.hostView?.isReady) return;
        this.host?.changeContent(value, true);
    };

    private readonly handleQueueEvent = (event: MonacoQueueEvent): void => {
        const editor = this.editor;
        if (!editor || !this.hostView?.isReady) return;
        switch (event.type) {
            case "revealLine":
                editor.revealLineInCenter(event.line);
                editor.setPosition({ lineNumber: event.line, column: 1 });
                editor.focus();
                break;
            case "highlightText":
                this.applyFindMatchDecorations(event.text);
                break;
            case "focus":
                editor.focus();
                break;
            case "openFind":
                editor.trigger("api", "actions.find", undefined);
                break;
            case "openReplace":
                editor.trigger("api", "editor.action.startFindReplaceAction", undefined);
                break;
        }
    };

    private readonly handleQueueRequest = (request: MonacoQueueRequest): unknown => {
        const editor = this.editor;
        if (!editor || !this.hostView?.isReady) throw new Error("Monaco not mounted");
        switch (request.type) {
            case "getSelectedText": {
                const selection = editor.getSelection();
                if (!selection || selection.isEmpty()) return "";
                return editor.getModel()?.getValueInRange(selection) ?? "";
            }
            case "getCursorPosition": {
                const position = editor.getPosition();
                return position
                    ? { lineNumber: position.lineNumber, column: position.column }
                    : { lineNumber: 1, column: 1 };
            }
            case "insertText": {
                const selection = editor.getSelection();
                if (!selection) return undefined;
                editor.executeEdits("script", [{
                    range: new monaco.Range(
                        selection.startLineNumber,
                        selection.startColumn,
                        selection.startLineNumber,
                        selection.startColumn,
                    ),
                    text: request.text,
                    forceMoveMarkers: true,
                }]);
                return undefined;
            }
            case "replaceSelection": {
                const selection = editor.getSelection();
                if (!selection) return undefined;
                editor.executeEdits("script", [
                    { range: selection, text: request.text, forceMoveMarkers: true },
                ]);
                return undefined;
            }
        }
    };

    private applyFindMatchDecorations(text: string | undefined): void {
        const editor = this.editor;
        const model = editor?.getModel();
        if (!editor || !model) return;
        if (!text?.trim()) {
            this.decorations?.clear();
            return;
        }

        const matches = model.findMatches(text, false, false, false, null, false);
        const decorations: monaco.editor.IModelDeltaDecoration[] = matches.map((match) => ({
            range: match.range,
            options: { className: "findMatch" },
        }));
        if (this.decorations) this.decorations.set(decorations);
        else this.decorations = editor.createDecorationsCollection(decorations);
    }
}

function setupWheelZoom(ed: monaco.editor.IStandaloneCodeEditor): () => void {
    const dom = ed.getDomNode();
    if (!dom) return () => undefined;
    const handler = (event: WheelEvent) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        event.stopPropagation();
        api.zoom(event.deltaY < 0 ? 0.5 : -0.5);
    };
    dom.addEventListener("wheel", handler, { passive: false, capture: true });
    return () => dom.removeEventListener("wheel", handler, { capture: true });
}

function setupSelectionListener(
    ed: monaco.editor.IStandaloneCodeEditor,
    model: MonacoEditor,
): () => void {
    const subscription = ed.onDidChangeCursorSelection(() => {
        const selection = ed.getSelection();
        const hasSelection = selection ? !selection.isEmpty() : false;
        if (model.state.get().hasSelection !== hasSelection) {
            model.state.update((state) => {
                state.hasSelection = hasSelection;
            });
        }
    });
    return () => subscription.dispose();
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
            const selection = ed.getSelection();
            if (selection) {
                ed.executeEdits("paste", [
                    { range: selection, text, forceMoveMarkers: true },
                ]);
            }
        },
    });
    return () => action.dispose();
}
