import type {
    IGitAheadBehindSnapshot,
    IGitChangeList,
    IGitChangesSnapshot,
    IGitCommitSnapshot,
    IGitFileChangeSnapshot,
    IGitRefNodeKind,
    IGitRefsSnapshot,
    IGitTreeEditor,
} from "../../api/types/git-tree-editor";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";
import type { GitTreeEditorModel } from "../../editors/git-tree/GitTreeEditorModel";

const GIT_TREE_ELEMENTS = [
    { name: "git-tree-refresh", purpose: "Refresh the Git Tree history, status, and ref projections." },
    { name: "git-tree-bottom-tab-select", purpose: "Select the visible Commit or Diff detail tab." },
    { name: "git-tree-pull", purpose: "Locate the Git Pull/Fetch controls; repository mutation remains element-only." },
    { name: "git-tree-push", purpose: "Locate the Git Push control; repository mutation remains element-only." },
] as const;

const GIT_TREE_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id: git-tree." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "repoRoot", kind: "property", summary: "The loaded repository root, or undefined when detached or unloaded." },
    { name: "currentRef", kind: "property", summary: "The current branch ref, or undefined for detached HEAD or no repository." },
    { name: "commits", kind: "property", summary: "Copied loaded commits, capped at the model's 200-commit page." },
    { name: "loadedCommitCount", kind: "property", summary: "The number of loaded commits, or undefined without a loaded repository." },
    { name: "hasMore", kind: "property", summary: "Whether another bounded commit page is available." },
    { name: "selectedCommitHash", kind: "property", summary: "The selected commit hash, or undefined when no commit is selected." },
    { name: "selectedCommit", kind: "property", summary: "A copied selected commit, or undefined when no commit is selected." },
    { name: "changes", kind: "property", summary: "Copied staged and unstaged changes, or undefined without a loaded repository." },
    { name: "refs", kind: "property", summary: "Copied branch, remote, and tag refs, or undefined without a loaded repository." },
    { name: "aheadBehind", kind: "property", summary: "Copied ahead/behind counts; real zero counts are preserved." },
    { name: "refresh", kind: "method", signature: "refresh(): void", summary: "Refresh the model-backed Git read projections." },
    { name: "loadMore", kind: "method", signature: "loadMore(): Promise<void>", summary: "Load one additional bounded 200-commit page." },
    { name: "openChange", kind: "method", signature: "openChange(path: string, list?: \"unstaged\" | \"staged\"): void", summary: "Open a validated changed path in File Diff.", caution: "navigates the current page" },
    { name: "revealRef", kind: "method", signature: "revealRef(name: string, kind: \"branch\" | \"remote-branch\" | \"tag\"): void", summary: "Reveal a loaded ref in the mounted Git Tree." },
];

const GIT_TREE_HELP = `Access via pages[i].editor after narrowing editor.id to "git-tree".
Git Tree is a page-scoped no-content-host editor. repoRoot, currentRef, commits, changes, refs,
aheadBehind, and selection are model-backed snapshots. Detached/unloaded state is undefined;
attached clean repositories and repositories with no refs return genuine empty arrays and zero
counts. commits is limited to the first 200 loaded records, loadedCommitCount reports the loaded
count, and loadMore() requests one additional bounded page.

The curated controls are git-tree-refresh and git-tree-bottom-tab-select plus element-only Pull
and Push locations. createElements uses highlightOptions: { all: true }: count is the total number
of matching controls and highlighted is the number of rings drawn. Repeated selectors do not
identify a commit or row. No facade action commits, checks out, switches, stages, unstages,
fetches, pulls, or pushes. openChange(), refresh(), loadMore(), and revealRef() call model paths
only; revealRef() fails clearly when the Git Tree or its mounted target is unavailable.`;

function copyCommit(commit: { hash: string; shortHash: string; parents: string[]; subject: string; authorName: string; authorEmail: string; authorDate: number; refs: Array<{ name: string; kind: "head" | "branch" | "remote" | "tag" }> }): IGitCommitSnapshot {
    return {
        hash: commit.hash,
        shortHash: commit.shortHash,
        parents: [...commit.parents],
        subject: commit.subject,
        authorName: commit.authorName,
        authorEmail: commit.authorEmail,
        authorDate: commit.authorDate,
        refs: commit.refs.map(ref => ({ ...ref })),
    };
}

function copyChange(change: { path: string; status: string; oldPath?: string }): IGitFileChangeSnapshot {
    return { path: change.path, status: change.status, ...(change.oldPath !== undefined ? { oldPath: change.oldPath } : {}) };
}

export class GitTreeEditorFacade implements IAiVisible, IGitTreeEditor {
    constructor(
        private readonly editor: GitTreeEditorModel,
        readonly id: "git-tree",
        readonly name: string,
    ) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(GIT_TREE_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
            highlightOptions: { all: true },
        });
        return {
            kind: "GitTreeEditor",
            summary: "Git Tree read-mostly history, status, refs, and navigation facade.",
            members: [...GIT_TREE_MEMBERS, ...elements.members],
            help: GIT_TREE_HELP,
            elements: GIT_TREE_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({
                kind: "GitTreeEditor",
                id: this.id,
                name: this.name,
                repoRoot: this.repoRoot,
                currentRef: this.currentRef,
                loadedCommitCount: this.loadedCommitCount,
                selectedCommitHash: this.selectedCommitHash,
            }),
        };
    }

    private get attachedRepository(): string | undefined {
        return this.editor.page && this.editor.state.get().repoRoot
            ? this.editor.state.get().repoRoot
            : undefined;
    }

    get repoRoot(): string | undefined { return this.attachedRepository; }
    get currentRef(): string | undefined {
        return this.attachedRepository ? this.editor.branches.state.get().refs.current : undefined;
    }
    get commits(): readonly IGitCommitSnapshot[] | undefined {
        if (!this.attachedRepository) return undefined;
        return this.editor.gitTree.state.get().commits.slice(0, 200).map(copyCommit);
    }
    get loadedCommitCount(): number | undefined {
        return this.attachedRepository ? this.editor.gitTree.state.get().commits.length : undefined;
    }
    get hasMore(): boolean | undefined {
        return this.attachedRepository ? this.editor.gitTree.state.get().hasMore : undefined;
    }
    get selectedCommitHash(): string | undefined {
        return this.attachedRepository ? this.editor.selectedCommitHash : undefined;
    }
    get selectedCommit(): IGitCommitSnapshot | undefined {
        const commit = this.attachedRepository ? this.editor.selectedCommit : undefined;
        return commit ? copyCommit(commit) : undefined;
    }
    get changes(): IGitChangesSnapshot | undefined {
        if (!this.attachedRepository) return undefined;
        const state = this.editor.changes.state.get();
        return { staged: state.staged.map(copyChange), unstaged: state.unstaged.map(copyChange) };
    }
    get refs(): IGitRefsSnapshot | undefined {
        if (!this.attachedRepository) return undefined;
        const refs = this.editor.branches.state.get().refs;
        return {
            current: refs.current,
            localBranches: [...refs.localBranches],
            remotes: [...refs.remotes],
            remoteBranches: [...refs.remoteBranches],
            tags: [...refs.tags],
        };
    }
    get aheadBehind(): IGitAheadBehindSnapshot | undefined {
        if (!this.attachedRepository) return undefined;
        const aheadBehind = this.editor.branches.state.get().aheadBehind;
        return { ...aheadBehind, upstream: aheadBehind.upstream };
    }

    refresh(): void {
        this.requireRepository("refresh");
        this.editor.refresh();
    }

    loadMore(): Promise<void> {
        this.requireRepository("loadMore");
        return this.editor.loadMoreForFacade();
    }

    openChange(path: string, list: IGitChangeList = "unstaged"): void {
        this.requireRepository("openChange");
        const changes = list === "staged"
            ? this.editor.changes.state.get().staged
            : this.editor.changes.state.get().unstaged;
        const change = changes.find(item => item.path === path);
        if (!change) throw new Error(`Git action unavailable: no ${list} change with path ${JSON.stringify(path)}.`);
        this.editor.openChangeDiff({ ...change }, list);
    }

    revealRef(name: string, kind: IGitRefNodeKind): void {
        this.requireRepository("revealRef");
        this.editor.revealRefForFacade(name, kind);
    }

    private requireRepository(action: string): void {
        if (!this.editor.page) throw new Error(`Git ${action} unavailable: no page host attached.`);
        if (!this.attachedRepository) throw new Error(`Git ${action} unavailable: no repository is loaded.`);
    }
}
