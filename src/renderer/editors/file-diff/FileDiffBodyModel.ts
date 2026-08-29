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
import type { MonacoDiffEditorHostView } from "../shared/MonacoDiffEditorHostView";
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

    // Resolution is driven by state SUBSCRIPTIONS because the body view doesn't subscribe to
    // `from` — picking a `from` rev must still re-resolve the left side.
    init(): void {
        const editor = this.editor;
        void this.resolveAndSet("from");
        void this.resolveAndSet("to");
        this.own(editor.state.subscribe(() => void this.resolveAndSet("from"), (s) => revKey(s.from)));
        this.own(editor.state.subscribe(() => void this.resolveAndSet("to"), (s) => revKey(s.to)));
        // The Unstaged `to` side tracks live host content (edits + external changes).
        const host = editor.host;
        if (host) {
            this.own(host.state.subscribe(
                    () => {
                        if (editor.state.get().to.kind === "unstaged") void this.resolveAndSet("to");
                    },
                    (s) => s.content,
                ));
            // On restore, repoRoot/relPath only become available once git detection
            // lands — re-resolve both sides then (git blobs need the root).
            this.own(host.state.subscribe(
                    () => {
                        void this.resolveAndSet("from");
                        void this.resolveAndSet("to");
                    },
                    (s) => (s as { gitRepo?: { root: string } | null }).gitRepo?.root,
                ));
        }
    }

    /** Wire editable write-back: when `to` is Unstaged, edits to the modified
     *  side flow back into the working file (host content). Mirrors CompareEditor. */
    onDiffMount = (host: MonacoDiffEditorHostView): void => {
        this.modifiedEditor = host.getEditor().getModifiedEditor();
        host.listenToModifiedContent(() => {
            if (this.editor.state.get().to.kind !== "unstaged") return;
            const host = this.editor.host;
            if (!host || !this.modifiedEditor) return;
            const val = this.modifiedEditor.getValue();
            if (val !== host.state.get().content) host.changeContent(val, true);
        });
    };

    dispose(): void {
        this.modifiedEditor = null;
    }
}
