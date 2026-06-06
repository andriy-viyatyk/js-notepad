import { createElement, type ReactNode } from "react";

import {
    EditorModel,
    type EditorStateBase,
} from "../base/EditorModel";
import { GitIcon } from "../../theme/icons";

export interface GitTreeEditorState extends EditorStateBase {
    /** State-type discriminator. */
    type: "gitTreePage";
    /** Absolute repo top-level (the parent of the `.git` folder). */
    repoRoot: string;
}

export const getDefaultGitTreeEditorState = (): GitTreeEditorState => ({
    // Editor instance id — keys this editor in `page.editors[]` and is the
    // cache-file prefix. MUST be non-empty (PageModel.mainEditorInstance treats
    // a falsy id as "no main editor"). Per-instance UUID, like MCP Inspector.
    id: crypto.randomUUID(),
    title: "Git Tree",
    modified: false,
    type: "gitTreePage",
    editor: "git-tree",
    repoRoot: "",
});

/**
 * Git Tree editor (EPIC-030 / US-612).
 *
 * A standalone (no content-host) editor that renders a repository's commit
 * history via the reusable `<GitTree>` component (US-611). Reached only by
 * navigating a repo's `.git` Explorer node to the `git-tree` target — never
 * auto-matched to a file (`accepts: () => -1`).
 */
export class GitTreeEditorModel extends EditorModel<GitTreeEditorState> {
    /** Editor identity. Matches `EditorDescriptor.editorId`. */
    readonly editorId = "git-tree";

    noLanguage = true;
    skipSave = true;

    /** Tab icon — the git glyph (EPIC-030 / US-612). */
    getIcon = (): ReactNode => createElement(GitIcon, { width: 16, height: 16 });

    /** Seed repoRoot + title from a decoded `git-tree://` link. */
    initFromRepoRoot(repoRoot: string): void {
        const folder = repoRoot.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || "Git";
        this.state.update((s) => {
            s.repoRoot = repoRoot;
            s.title = `${folder} — Git`;
        });
    }
}
