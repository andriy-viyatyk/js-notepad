/**
 * File Diff body model (EPIC-030 / US-613).
 *
 * Resolves the two diff sides (`from`/`to`) to text and owns the editable
 * write-back, keeping the `FileDiffBody` view a pure render (model-view). The
 * editor-owned state (host, `from`/`to`, pickers) lives on `FileDiffEditor`,
 * passed in as the `model` prop; this body model only owns the derived
 * `fromText`/`toText` render data, so it can be recreated freely on remount.
 */
import * as monaco from "monaco-editor";
import { TComponentModel } from "../../core/state/model";
import { git } from "../../api/git";
import type { FileDiffEditor, RevSel } from "./FileDiffEditor";

export interface FileDiffBodyState {
    fromText: string;
    toText: string;
}

export const defaultFileDiffBodyState: FileDiffBodyState = {
    fromText: "",
    toText: "",
};

export interface FileDiffBodyProps {
    model: FileDiffEditor;
}

/** Dependency key for a side selection — changes only when the chosen rev changes. */
function revKey(sel: RevSel): string {
    return sel.kind === "commit" ? `commit:${sel.hash}` : sel.kind;
}

export class FileDiffBodyModel extends TComponentModel<FileDiffBodyState, FileDiffBodyProps> {
    private modifiedEditor: monaco.editor.ICodeEditor | null = null;
    private contentSub: monaco.IDisposable | null = null;
    private subs: (() => void)[] = [];
    // The DiffEditor's two models. We pass keepCurrent*Model so @monaco-editor/react
    // disposes only the widget on unmount (not the models) — disposing the models
    // while the widget still listens triggers monaco's "TextModel got disposed
    // before DiffEditorWidget model got reset". We dispose them ourselves after.
    private originalModel: monaco.editor.ITextModel | null = null;
    private modifiedModel: monaco.editor.ITextModel | null = null;

    private get editor(): FileDiffEditor {
        return this.props.model;
    }

    /** Resolve one side to text: working tree (live host content) or a git blob. */
    private async resolveSide(sel: RevSel): Promise<string> {
        const editor = this.editor;
        if (sel.kind === "unstaged") {
            return editor.host?.state.get().content ?? "";
        }
        const root = editor.repoRoot;
        const relPath = editor.relPath;
        if (!root || !relPath) return "";
        if (sel.kind === "staged") return git.show(root, "", relPath); // `:path` (index)
        if (sel.kind === "head") return git.show(root, "HEAD", relPath);
        // Empty commit hash = the empty tree (root commit's absent parent). Guard
        // it explicitly: `git.show(root, "", relPath)` would return the index, not
        // empty (US-637).
        if (!sel.hash) return "";
        return git.show(root, sel.hash, relPath);
    }

    private resolveAndSet = async (side: "from" | "to"): Promise<void> => {
        const st = this.editor.state.get();
        const text = await this.resolveSide(side === "from" ? st.from : st.to);
        if (!this.isLive) return;
        this.state.update((s) => {
            if (side === "from") s.fromText = text;
            else s.toText = text;
        });
    };

    // Resolution is driven by state SUBSCRIPTIONS (not render-driven `effect()`),
    // because the body view doesn't subscribe to `from` — picking a `from` rev
    // must still re-resolve the left side.
    init(): void {
        const editor = this.editor;
        void this.resolveAndSet("from");
        void this.resolveAndSet("to");
        this.subs.push(
            editor.state.subscribe(() => void this.resolveAndSet("from"), (s) => revKey(s.from)),
        );
        this.subs.push(
            editor.state.subscribe(() => void this.resolveAndSet("to"), (s) => revKey(s.to)),
        );
        // The Unstaged `to` side tracks live host content (edits + external changes).
        const host = editor.host;
        if (host) {
            this.subs.push(
                host.state.subscribe(
                    () => {
                        if (editor.state.get().to.kind === "unstaged") void this.resolveAndSet("to");
                    },
                    (s) => s.content,
                ),
            );
            // On restore, repoRoot/relPath only become available once git detection
            // lands — re-resolve both sides then (git blobs need the root).
            this.subs.push(
                host.state.subscribe(
                    () => {
                        void this.resolveAndSet("from");
                        void this.resolveAndSet("to");
                    },
                    (s) => (s as { gitRepo?: { root: string } | null }).gitRepo?.root,
                ),
            );
        }
    }

    /** Wire editable write-back: when `to` is Unstaged, edits to the modified
     *  side flow back into the working file (host content). Mirrors CompareEditor. */
    onDiffMount = (diffEditor: monaco.editor.IStandaloneDiffEditor): void => {
        this.modifiedEditor = diffEditor.getModifiedEditor();
        const m = diffEditor.getModel();
        this.originalModel = m?.original ?? null;
        this.modifiedModel = m?.modified ?? null;
        this.contentSub?.dispose();
        this.contentSub = this.modifiedEditor.onDidChangeModelContent(() => {
            if (this.editor.state.get().to.kind !== "unstaged") return;
            const host = this.editor.host;
            if (!host || !this.modifiedEditor) return;
            const val = this.modifiedEditor.getValue();
            if (val !== host.state.get().content) host.changeContent(val, true);
        });
    };

    dispose(): void {
        this.subs.forEach((u) => u());
        this.subs = [];
        this.contentSub?.dispose();
        this.contentSub = null;
        this.modifiedEditor = null;
        // Defer model disposal to a macrotask. This dispose() runs during React's
        // unmount commit, but @monaco-editor/react disposes the diff widget in its
        // own (later) cleanup AND monaco 0.52 removes the widget's model listeners
        // asynchronously — so disposing the models now (while the widget still
        // listens) throws "TextModel got disposed before DiffEditorWidget model got
        // reset". By the next macrotask the widget is fully gone. keepCurrent*Model
        // ensures monaco-react never disposes these models, so there's no double-
        // dispose and no leak.
        const original = this.originalModel;
        const modified = this.modifiedModel;
        this.originalModel = null;
        this.modifiedModel = null;
        setTimeout(() => {
            original?.dispose();
            modified?.dispose();
        }, 0);
    }
}
