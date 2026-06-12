/**
 * Renderer-side git API (EPIC-030 / US-610).
 *
 * Thin wrapper the text-file host calls to detect repo membership, plus the
 * settings-page availability probe. Owns the **per-directory detection cache**
 * (EPIC-030 Concern 2A): the first file opened in a folder spawns git; every
 * sibling is a cache hit. Negative results are cached too, so files outside any
 * repo never re-spawn git.
 *
 * Honors the "git.enabled" setting — when off, no git activity happens at all.
 */
import { fpDirname } from "../core/utils/file-path";
import { api } from "../../ipc/renderer/api";
import { settings } from "./settings";
import type { GitRepoInfo, GitProbeResult, GitCommit, GitLogOptions, GitStatusResult, GitFileChange, GitMutationResult, GitIdentity, GitRefs, GitSwitchTarget, GitFetchOptions, GitAheadBehind, GitPushOptions, GitPushResult, GitPullOptions, GitPullResult } from "../../ipc/git-ipc";

const EMPTY_STATUS: GitStatusResult = { staged: [], unstaged: [] };
const EMPTY_IDENTITY: GitIdentity = { name: "", email: "" };
const EMPTY_REFS: GitRefs = { localBranches: [], remotes: [], remoteBranches: [], tags: [] };
const NO_UPSTREAM: GitAheadBehind = { ahead: 0, behind: 0, hasUpstream: false };
const PUSH_FAIL: GitPushResult = { ok: false, error: "git disabled" };
const PULL_FAIL: GitPullResult = { ok: false, error: "git disabled" };

// dir → resolved repo info (or null). Stores the in-flight promise so
// concurrent opens in the same directory collapse to a single git spawn.
// Lives for the process lifetime (v1 — no invalidation; EPIC-030 Concern E).
const repoCache = new Map<string, Promise<GitRepoInfo | null>>();

export const git = {
    /**
     * Detect repo membership for a file path. Returns `null` (no git spawn)
     * when the "git.enabled" setting is off, for untitled buffers, or for
     * archive entries (paths containing "!" are not real on-disk files).
     */
    detectRepoForFile(filePath: string | undefined): Promise<GitRepoInfo | null> {
        if (!settings.get("git.enabled") || !filePath || filePath.includes("!")) {
            return Promise.resolve(null);
        }
        const dir = fpDirname(filePath);
        if (!dir) return Promise.resolve(null);

        let p = repoCache.get(dir);
        if (!p) {
            p = api.gitDetectRepo(dir).catch((): GitRepoInfo | null => null);
            repoCache.set(dir, p);
        }
        return p;
    },

    /** Settings-page availability probe (`git --version`). Not cached. */
    probe(): Promise<GitProbeResult> {
        return api.gitProbe();
    },

    /**
     * Commit history for a repo root (optionally scoped to one file). Returns
     * `[]` (no git spawn) when the "git.enabled" setting is off or no root is
     * given. Not cached — history changes between calls (EPIC-030 / US-611).
     */
    log(repoRoot: string, opts: GitLogOptions = {}): Promise<GitCommit[]> {
        if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve([]);
        return api.gitLog(repoRoot, opts).catch((): GitCommit[] => []);
    },

    /**
     * Blob content of `relPath` at a revision (EPIC-030 / US-613). `rev` is ""
     * (the index — staged blob if staged, else HEAD), "HEAD", or a commit hash.
     * `relPath` is repo-relative (forward slashes). Returns "" when git is off,
     * no root/path, or the path is absent at that revision. Never throws.
     */
    show(repoRoot: string, rev: string, relPath: string): Promise<string> {
        if (!settings.get("git.enabled") || !repoRoot || !relPath) return Promise.resolve("");
        return api.gitShow(repoRoot, rev, relPath).catch((): string => "");
    },

    /**
     * Working-tree status for a repo root, split into staged / unstaged
     * (EPIC-031 / US-616). Untracked files arrive under `unstaged` ('?');
     * ignored files are omitted. Returns empty arrays (no git spawn) when the
     * "git.enabled" setting is off or no root is given. Never throws.
     */
    status(repoRoot: string): Promise<GitStatusResult> {
        if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve(EMPTY_STATUS);
        return api.gitStatus(repoRoot).catch((): GitStatusResult => EMPTY_STATUS);
    },

    /**
     * Full commit message (subject + body) for one commit (EPIC-031 / US-629).
     * Fetched lazily by the Git Tree "Commit" panel for the selected commit.
     * Returns "" when git is off, no root/hash, or the commit is absent. Never throws.
     */
    commitMessage(repoRoot: string, hash: string): Promise<string> {
        if (!settings.get("git.enabled") || !repoRoot || !hash) return Promise.resolve("");
        return api.gitCommitMessage(repoRoot, hash).catch((): string => "");
    },

    /**
     * Files changed by one commit (vs its first parent) for the Git Tree "Diff"
     * tab (EPIC-031 / US-630). Same `GitFileChange` DTO as `status()`. Returns []
     * (no git spawn) when git is off or no root/hash is given. Never throws.
     */
    commitFiles(repoRoot: string, hash: string): Promise<GitFileChange[]> {
        if (!settings.get("git.enabled") || !repoRoot || !hash) return Promise.resolve([]);
        return api.gitCommitFiles(repoRoot, hash).catch((): GitFileChange[] => []);
    },

    /**
     * Stage paths (move working-tree → index) for the "Changes" panel
     * (EPIC-031 / US-631). The first mutating git op. Returns `{ ok:true }`
     * (no-op) when git is off or no root/paths; on IPC failure resolves to
     * `{ ok:false, error }` — never throws.
     */
    stage(repoRoot: string, paths: string[]): Promise<GitMutationResult> {
        if (!settings.get("git.enabled") || !repoRoot || !paths.length) return Promise.resolve({ ok: true });
        return api.gitStage(repoRoot, paths).catch((e): GitMutationResult => ({ ok: false, error: String(e) }));
    },

    /** Unstage paths (move index → working-tree) for the "Changes" panel
     *  (EPIC-031 / US-631). Symmetric to `stage`. Never throws. */
    unstage(repoRoot: string, paths: string[]): Promise<GitMutationResult> {
        if (!settings.get("git.enabled") || !repoRoot || !paths.length) return Promise.resolve({ ok: true });
        return api.gitUnstage(repoRoot, paths).catch((e): GitMutationResult => ({ ok: false, error: String(e) }));
    },

    /**
     * Discard working-tree changes — "Reset" for the Unstaged list (EPIC-031 /
     * US-631). Tracked paths restore to staged/HEAD; untracked paths are deleted.
     * DESTRUCTIVE — the caller confirms first. Returns `{ ok:true }` (no-op) when
     * git is off or nothing to do; never throws.
     */
    discard(repoRoot: string, trackedPaths: string[], untrackedPaths: string[]): Promise<GitMutationResult> {
        if (!settings.get("git.enabled") || !repoRoot || (!trackedPaths.length && !untrackedPaths.length)) {
            return Promise.resolve({ ok: true });
        }
        return api.gitDiscard(repoRoot, trackedPaths, untrackedPaths).catch((e): GitMutationResult => ({ ok: false, error: String(e) }));
    },

    /**
     * Effective git author identity for prepopulating the commit dialog (EPIC-031 /
     * US-632). Returns empty strings (no git spawn) when git is off or no root is given.
     * Never throws.
     */
    getIdentity(repoRoot: string): Promise<GitIdentity> {
        if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve(EMPTY_IDENTITY);
        return api.gitIdentity(repoRoot).catch((): GitIdentity => EMPTY_IDENTITY);
    },

    /**
     * Commit the staged index (EPIC-031 / US-632). `identity` (from the dialog) is applied
     * as a per-commit override — no config file is written. Returns `{ ok:true }` (no-op)
     * when git is off or no root/message; on IPC failure resolves to `{ ok:false, error }`
     * — never throws.
     */
    commit(repoRoot: string, message: string, identity?: GitIdentity): Promise<GitMutationResult> {
        if (!settings.get("git.enabled") || !repoRoot || !message.trim()) return Promise.resolve({ ok: true });
        return api.gitCommit(repoRoot, message, identity).catch((e): GitMutationResult => ({ ok: false, error: String(e) }));
    },

    /**
     * Repository refs (local branches, remotes + remote-tracking branches, tags,
     * current branch) for the "Branches & Tags" panel (EPIC-031 / US-634). Returns
     * an empty set (no git spawn) when git is off or no root is given. Never throws.
     */
    refs(repoRoot: string): Promise<GitRefs> {
        if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve(EMPTY_REFS);
        return api.gitRefs(repoRoot).catch((): GitRefs => EMPTY_REFS);
    },

    /**
     * Switch HEAD to a branch / remote branch / commit / tag (EPIC-031 / US-636).
     * Returns `{ ok:true }` (no-op) when git is off or no root; on failure resolves
     * to `{ ok:false, error }` so the model can toast. Never throws.
     */
    switchTo(repoRoot: string, target: GitSwitchTarget): Promise<GitMutationResult> {
        if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve({ ok: true });
        return api.gitSwitch(repoRoot, target).catch((e): GitMutationResult => ({ ok: false, error: String(e) }));
    },

    /**
     * Create a branch (EPIC-031 / US-638). `startPoint` is a commit hash / ref
     * (omitted → HEAD); `checkout` true creates + checks out (`git switch -c`,
     * carrying the staged index), false creates only (`git branch`). Returns
     * `{ ok:true }` (no-op) when git is off or no root/name; on failure (invalid /
     * duplicate name, dirty-tree checkout) resolves to `{ ok:false, error }` so
     * the caller can toast. Never throws.
     */
    createBranch(repoRoot: string, name: string, startPoint?: string, checkout?: boolean): Promise<GitMutationResult> {
        // git-off / no-root are genuine no-ops (ok:true); a blank name is an ERROR —
        // mirror git-service's own guard rather than masking it as success.
        if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve({ ok: true });
        if (!name.trim()) return Promise.resolve({ ok: false, error: "Empty branch name" });
        return api.gitCreateBranch(repoRoot, name, startPoint, checkout).catch((e): GitMutationResult => ({ ok: false, error: String(e) }));
    },

    /**
     * Fetch remote-tracking branches (US-641). Fetches all remotes when `opts.remote`
     * is omitted. Returns `{ ok:true }` (no-op) when git is off or no root given.
     * Never throws.
     */
    fetch(repoRoot: string, opts?: GitFetchOptions): Promise<GitMutationResult> {
        if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve({ ok: true });
        return api.gitFetch(repoRoot, opts).catch((e): GitMutationResult => ({ ok: false, error: String(e) }));
    },

    /**
     * Ahead/behind count for the current branch vs its upstream (US-641). Returns
     * `{ hasUpstream: false }` (no-op) when git is off, no root, or the branch has no
     * upstream. Never throws.
     */
    aheadBehind(repoRoot: string): Promise<GitAheadBehind> {
        if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve(NO_UPSTREAM);
        return api.gitAheadBehind(repoRoot).catch((): GitAheadBehind => NO_UPSTREAM);
    },

    /**
     * Push the current branch to its upstream remote (US-641). When the branch has
     * no upstream, pass `opts.setUpstream=true` to set it. Never force-pushes. Returns
     * `{ ok:false }` (no-op) when git is off or no root given. Never throws.
     */
    push(repoRoot: string, opts?: GitPushOptions): Promise<GitPushResult> {
        if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve(PUSH_FAIL);
        return api.gitPush(repoRoot, opts).catch((e): GitPushResult => ({ ok: false, error: String(e) }));
    },

    /**
     * Pull from the current branch's upstream (US-642). Returns `{ ok:false }` (no-op)
     * when git is off or no root given. On conflict, `hadConflicts` is true and
     * `conflicts[]` lists the affected paths. Never throws.
     */
    pull(repoRoot: string, opts?: GitPullOptions): Promise<GitPullResult> {
        if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve(PULL_FAIL);
        return api.gitPull(repoRoot, opts).catch((e): GitPullResult => ({ ok: false, error: String(e) }));
    },

    /**
     * Configured URL of a remote (US-644 — "Copy Remote URL" in the Git Tree tab
     * menu). Returns "" (no git spawn) when git is off, no root/remote, or the
     * remote has no URL. Never throws.
     */
    getRemoteUrl(repoRoot: string, remote: string): Promise<string> {
        if (!settings.get("git.enabled") || !repoRoot || !remote) return Promise.resolve("");
        return api.gitRemoteUrl(repoRoot, remote).catch((): string => "");
    },
};
