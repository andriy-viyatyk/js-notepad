/**
 * Main-process git wrapper (EPIC-030 / US-610).
 *
 * Owns all `simple-git` usage — a thin promise wrapper over the user's
 * installed `git` CLI (no native bindings; no git binary bundled). Lazy-imported
 * by the IPC controller. Every operation is best-effort and NEVER throws: a
 * missing git binary or a non-repo directory resolves to a "not available"
 * result, so the renderer degrades gracefully (EPIC-030 Concern 4).
 *
 * v1 exposes exactly two operations — availability probe + repo detection.
 * Log/show/diff arrive with US-611/US-613 as further endpoints.
 */
import { simpleGit } from "simple-git";
import type { GitAheadBehind, GitCommit, GitFetchOptions, GitFileChange, GitIdentity, GitLogOptions, GitMutationResult, GitProbeResult, GitPullOptions, GitPullResult, GitPushOptions, GitPushResult, GitRef, GitRefs, GitRepoInfo, GitStatusResult, GitSwitchTarget } from "../ipc/git-ipc";
import { errMessage } from "../shared/utils";

/**
 * Run a mutating git op under this module's "never throws" contract: success is
 * `{ ok: true }`, any failure is `{ ok: false, error }` for the renderer to toast.
 * Used by the mutations whose whole body is "run the commands, report failure".
 */
async function mutation(run: () => Promise<void>): Promise<GitMutationResult> {
    try {
        await run();
        return { ok: true };
    } catch (e) {
        return { ok: false, error: errMessage(e) };
    }
}

/** `git --version` availability probe for the settings page. Never throws. */
export async function probeGit(): Promise<GitProbeResult> {
    try {
        const out = await simpleGit().raw(["--version"]); // "git version 2.43.0"
        const m = out.match(/(\d+\.\d+\.\d+)/);
        return { installed: true, version: m?.[1] };
    } catch {
        return { installed: false };
    }
}

/**
 * Resolve the repo root + branch for a directory. Returns `null` when `dir`
 * is not inside a git repo, or git is unavailable. Never throws.
 *
 * Uses `rev-parse --show-toplevel` — correct for submodules, worktrees, and
 * bare repos where `.git` is a FILE rather than a folder (so deliberately NOT
 * a hand-rolled `.git` directory walk).
 */
export async function detectRepo(dir: string): Promise<GitRepoInfo | null> {
    try {
        const git = simpleGit(dir);
        const root = (await git.revparse(["--show-toplevel"])).trim();
        if (!root) return null;
        let branch = "HEAD";
        try {
            branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim() || "HEAD";
        } catch {
            // Detached HEAD or a fresh repo with no commits — keep "HEAD".
        }
        return { root, branch };
    } catch {
        return null; // not a repo, or git missing → graceful (Concern 4)
    }
}

// Field + record separators for the log pretty-format. Unit/record separator
// control chars never appear in commit text, so subjects with commas, pipes,
// quotes, etc. parse unambiguously.
const FIELD_SEP = "\x1f";
const RECORD_SEP = "\x1e";
const LOG_FORMAT = ["%H", "%P", "%s", "%an", "%ae", "%at", "%D"].join(FIELD_SEP) + RECORD_SEP;

/**
 * Parse decoration refs (`%D` under `--decorate=full`), classifying each by kind
 * so the renderer can color it (US-611). Full ref paths are used so a local branch
 * whose name contains a slash (e.g. "feature/api") is NOT mistaken for a remote —
 * the namespace prefix is authoritative, not a "contains /" heuristic (US-636 fix).
 *
 * Examples (full form): "HEAD -> refs/heads/main", "refs/heads/feature/api",
 * "refs/remotes/origin/main", "tag: refs/tags/v1.0". The returned `name` is the
 * short form (prefix stripped): "main", "feature/api", "origin/main", "v1.0".
 */
function parseDecorations(raw: string): GitRef[] {
    const out: GitRef[] = [];
    for (const part of raw.split(",")) {
        const ref = part.trim();
        if (!ref) continue;
        if (ref.startsWith("tag: ")) {
            // "tag: refs/tags/v1.0" → "v1.0"
            out.push({ name: stripRefPrefix(ref.slice(5), "refs/tags/"), kind: "tag" });
        } else if (ref === "HEAD") {
            out.push({ name: "HEAD", kind: "head" }); // detached HEAD
        } else if (ref.startsWith("HEAD -> ")) {
            // "HEAD -> refs/heads/main" → the checked-out branch "main"
            out.push({ name: stripRefPrefix(ref.slice(8), "refs/heads/"), kind: "head" });
        } else if (ref.startsWith("refs/heads/")) {
            out.push({ name: ref.slice("refs/heads/".length), kind: "branch" });
        } else if (ref.startsWith("refs/remotes/")) {
            out.push({ name: ref.slice("refs/remotes/".length), kind: "remote" });
        } else if (ref.startsWith("refs/tags/")) {
            out.push({ name: ref.slice("refs/tags/".length), kind: "tag" });
        } else {
            // Unexpected short/bare form — default to branch (no slash heuristic).
            out.push({ name: ref, kind: "branch" });
        }
    }
    return out;
}

/** Strip a known ref namespace prefix when present (leaves the value otherwise). */
function stripRefPrefix(ref: string, prefix: string): string {
    return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref;
}

function parseLog(raw: string): GitCommit[] {
    const out: GitCommit[] = [];
    for (const record of raw.split(RECORD_SEP)) {
        const line = record.trim();
        if (!line) continue;
        const [hash, parentField, subject, authorName, authorEmail, at, decorations] =
            line.split(FIELD_SEP);
        if (!hash) continue;
        const parents = parentField?.trim() ? parentField.trim().split(" ") : [];
        out.push({
            hash,
            shortHash: hash.slice(0, 7),
            parents,
            subject: subject ?? "",
            authorName: authorName ?? "",
            authorEmail: authorEmail ?? "",
            authorDate: Number(at) * 1000 || 0,
            refs: parseDecorations(decorations ?? ""),
        });
    }
    return out;
}

/**
 * Capped commit history for a repo (newest first, topo-ordered so a parent
 * never precedes all its children). Optionally scoped to one file (--follow).
 * Never throws — returns [] when git is unavailable or `dir` is not a repo.
 *
 * Parents come from `%P` (all parents, space-separated); `--topo-order` keeps
 * the swimlane layout (US-611) correct without needing `--parents`.
 */
export async function log(dir: string, opts: GitLogOptions = {}): Promise<GitCommit[]> {
    const max = opts.maxCount ?? 500;
    try {
        const git = simpleGit(dir);
        const args = [
            "log",
            "--topo-order",
            // Full ref paths so `%D` distinguishes local branches (refs/heads/…)
            // from remote-tracking ones (refs/remotes/…) even when a local branch
            // name contains a slash, e.g. "feature/api" (US-636 fix).
            "--decorate=full",
            `--pretty=format:${LOG_FORMAT}`,
        ];
        // Walk every ref, not just HEAD — the whole-repo Git Tree then shows all
        // branches' commits (like Git Extensions) even when HEAD is behind another
        // branch (US-636). File-scoped history keeps the HEAD/--follow walk.
        if (opts.all) args.push("--all");
        // max <= 0 means "no limit" — load all commits ("Load all", US-612).
        if (max > 0) args.push(`--max-count=${max}`);
        if (opts.skip && opts.skip > 0) args.push(`--skip=${opts.skip}`);
        if (opts.file) args.push("--follow", "--", opts.file);
        const raw = await git.raw(args);
        return parseLog(raw);
    } catch {
        return [];
    }
}

/**
 * Working-tree status split into staged (index) and unstaged (working-tree)
 * changes (EPIC-031 / US-616). Untracked files appear under `unstaged` with
 * status `?`; git-ignored files are omitted by `git status` (and thus here).
 * Never throws — returns empty arrays when git is unavailable or `dir` is not
 * a repo.
 *
 * simple-git's `status()` gives each file an `index` (staged) code and a
 * `working_dir` (unstaged) code; `' '` means "unchanged in that column". A file
 * can appear in both lists (e.g. staged then edited again).
 */
export async function status(dir: string): Promise<GitStatusResult> {
    try {
        // GIT_OPTIONAL_LOCKS=0 (≡ `git --no-optional-locks status`) stops status
        // from rewriting `.git/index` to refresh its stat-cache. That write would
        // otherwise trip the Git Tree auto-refresh watcher (US-624) into a loop:
        // watch → refresh → status → rewrite index → watch → … The two-arg
        // `.env(name, value)` SUPPLEMENTS the inherited process env (PATH etc.);
        // the single-object form would replace it.
        const s = await simpleGit(dir).env("GIT_OPTIONAL_LOCKS", "0").status();
        const staged: GitFileChange[] = [];
        const unstaged: GitFileChange[] = [];
        for (const f of s.files) {
            // Renames are encoded by simple-git as "old -> new" in `path`.
            let path = f.path;
            let oldPath: string | undefined;
            const arrow = path.indexOf(" -> ");
            if (arrow >= 0) {
                oldPath = path.slice(0, arrow);
                path = path.slice(arrow + 4);
            }
            if (f.index && f.index !== " " && f.index !== "?") {
                staged.push({ path, status: f.index, ...(oldPath ? { oldPath } : {}) });
            }
            if (f.working_dir && f.working_dir !== " ") {
                unstaged.push({ path, status: f.working_dir, ...(oldPath ? { oldPath } : {}) });
            }
        }
        // `s.current` is the branch name ("main"), null when detached/no commits.
        // Carried here so the commit dialog (US-632) can show it without a 2nd round-trip.
        return { staged, unstaged, branch: s.current ?? undefined };
    } catch {
        return { staged: [], unstaged: [] };
    }
}

/**
 * Repository refs for the "Branches & Tags" panel (EPIC-031 / US-634): local
 * branches, remote names + remote-tracking branches, and tags, plus the current
 * branch. Never throws — returns all-empty on failure or when `dir` is not a repo.
 *
 * `%(refname:short)` strips the namespace, so each namespace is queried
 * separately to keep the lists unambiguous. `GIT_OPTIONAL_LOCKS=0` keeps these
 * reads from rewriting `.git` (same loop-safety as `status`, US-624). Remote
 * names come from `git remote` (a remote may exist with zero branches); the
 * symbolic `<remote>/HEAD` ref is dropped.
 */
export async function refs(dir: string): Promise<GitRefs> {
    const empty: GitRefs = { localBranches: [], remotes: [], remoteBranches: [], tags: [] };
    try {
        const git = simpleGit(dir).env("GIT_OPTIONAL_LOCKS", "0");
        // Sorted most-recent-first: branches/remotes by commit date, tags by
        // creation date (`creatordate` covers both lightweight + annotated tags).
        // The renderer re-sorts alphabetically on demand; this is the default order.
        const list = async (namespace: string, sortKey: string): Promise<string[]> => {
            const raw = await git.raw([
                "for-each-ref",
                `--sort=${sortKey}`,
                "--format=%(refname:short)",
                namespace,
            ]);
            return raw.split("\n").map((l) => l.trim()).filter(Boolean);
        };
        const [localBranches, remoteRefs, tags] = await Promise.all([
            list("refs/heads", "-committerdate"),
            list("refs/remotes", "-committerdate"),
            list("refs/tags", "-creatordate"),
        ]);
        // Drop the symbolic "<remote>/HEAD" pointer — it's not a real branch.
        const remoteBranches = remoteRefs.filter((r) => !r.endsWith("/HEAD"));

        let remotes: string[] = [];
        try {
            const raw = await git.raw(["remote"]);
            remotes = raw.split("\n").map((l) => l.trim()).filter(Boolean);
        } catch { /* no remotes configured */ }

        let current: string | undefined;
        try {
            const head = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
            // "HEAD" means detached — leave current undefined.
            if (head && head !== "HEAD") current = head;
        } catch { /* detached / no commits */ }

        return { current, localBranches, remotes, remoteBranches, tags };
    } catch {
        return empty;
    }
}

/**
 * Configured fetch URL of a remote (US-644 — "Copy Remote URL" in the Git Tree
 * tab menu). Returns "" when git is unavailable, the dir is not a repo, the
 * remote name is empty, or the remote has no URL. Never throws.
 */
export async function remoteUrl(dir: string, remote: string): Promise<string> {
    if (!remote) return "";
    try {
        const git = simpleGit(dir).env("GIT_OPTIONAL_LOCKS", "0");
        const raw = await git.raw(["remote", "get-url", remote]);
        return raw.trim();
    } catch {
        return "";
    }
}

/**
 * Blob content of a file at a revision (EPIC-030 / US-613). `rev` may be:
 *   - ""      → the index (`:path`) — the staged blob if staged, else HEAD,
 *   - "HEAD"  → the last commit,
 *   - a hash  → that commit.
 * `path` is repo-relative (forward slashes). Returns "" when the path doesn't
 * exist at that revision (new/untracked file) or git is unavailable. Never throws.
 */
export async function show(dir: string, rev: string, path: string): Promise<string> {
    try {
        const git = simpleGit(dir);
        return await git.raw(["show", `${rev}:${path}`]);
    } catch {
        return ""; // absent at that rev (new file) / git missing → empty side
    }
}

/**
 * Full commit message (subject + body) for one commit (EPIC-031 / US-629).
 * Fetched lazily by the Git Tree "Commit" panel for the selected commit only,
 * so the `log` payload stays lean (it carries just the subject). Returns ""
 * when the commit is absent or git is unavailable. Never throws.
 */
export async function commitMessage(dir: string, hash: string): Promise<string> {
    try {
        return (await simpleGit(dir).raw(["show", "-s", "--format=%B", hash])).trimEnd();
    } catch {
        return "";
    }
}

/**
 * Files changed by one commit, vs its first parent (`--root` lists every file
 * for the initial commit). Returns the same `GitFileChange` DTO as `status()`:
 * repo-relative forward-slashed paths with M/A/D/R/C/T status letters, and
 * `oldPath` for renames/copies. Used by the Git Tree "Diff" tab (EPIC-031 /
 * US-630). Never throws — [] on failure or when git is unavailable.
 */
export async function commitFiles(dir: string, hash: string): Promise<GitFileChange[]> {
    try {
        const raw = await simpleGit(dir).raw([
            "diff-tree", "--no-commit-id", "--name-status", "-r", "--root", hash,
        ]);
        const out: GitFileChange[] = [];
        for (const line of raw.split("\n")) {
            const t = line.trim();
            if (!t) continue;
            const parts = t.split("\t");
            const status = parts[0][0]; // "M" | "A" | "D" | "R100" → "R" | "C075" → "C" | "T"
            if (status === "R" || status === "C") {
                // rename/copy: <code>\t<oldPath>\t<newPath>
                out.push({ path: parts[2], status, oldPath: parts[1] });
            } else {
                out.push({ path: parts[1], status });
            }
        }
        return out;
    } catch {
        return [];
    }
}

/**
 * Stage paths — move working-tree changes into the index (EPIC-031 / US-631,
 * the first mutating git op). `git add -- <paths>` also stages deletions and
 * untracked files, and operates on the WHOLE path (not per-hunk) so a
 * partially-staged file becomes fully staged. `paths` is repo-relative
 * (forward-slashed); for a rename pass both new + old path. Never throws —
 * returns `{ ok:false, error }` so the renderer can surface failure.
 */
export async function stage(dir: string, paths: string[]): Promise<GitMutationResult> {
    if (!paths.length) return { ok: true };
    return mutation(async () => {
        await simpleGit(dir).add(paths);
    });
}

/**
 * Unstage paths — move index changes back to the working tree (EPIC-031 /
 * US-631). `git reset -- <paths>` (≡ `git reset HEAD -- <paths>`) operates on
 * the whole path, so a partially-staged file becomes fully unstaged. On an
 * initial-commit repo there is no HEAD to reset against, so fall back to
 * `git rm --cached` to unstage the freshly-added blobs. Never throws.
 */
export async function unstage(dir: string, paths: string[]): Promise<GitMutationResult> {
    if (!paths.length) return { ok: true };
    const git = simpleGit(dir);
    try {
        await git.reset(["--", ...paths]);
        return { ok: true };
    } catch {
        // No-HEAD repo (no commits yet): `reset` fails — `rm --cached` unstages.
        return mutation(async () => {
            await git.raw(["rm", "--cached", "--", ...paths]);
        });
    }
}

/**
 * Discard working-tree changes — "Reset" for the Unstaged list (EPIC-031 /
 * US-631). Tracked paths are restored to their staged/HEAD version via
 * `git checkout -- <paths>`; untracked paths (status '?') are removed from disk
 * via `git clean -f -- <paths>`. DESTRUCTIVE — the caller confirms first. Never
 * throws.
 */
export async function discard(
    dir: string,
    trackedPaths: string[],
    untrackedPaths: string[],
): Promise<GitMutationResult> {
    if (!trackedPaths.length && !untrackedPaths.length) return { ok: true };
    const git = simpleGit(dir);
    return mutation(async () => {
        if (trackedPaths.length) await git.raw(["checkout", "--", ...trackedPaths]);
        if (untrackedPaths.length) await git.raw(["clean", "-f", "--", ...untrackedPaths]);
    });
}

/**
 * Effective git author identity (EPIC-031 / US-632) — `git config user.name` /
 * `user.email`, the layered system→global→local resolution. Used to PREPOPULATE the
 * commit dialog (what Git Extensions reads — the user never types it because it lives in
 * `~/.gitconfig`). Each key throws when unset → "" (no identity configured). Never throws.
 */
export async function getIdentity(dir: string): Promise<GitIdentity> {
    const read = async (key: string): Promise<string> => {
        try {
            return (await simpleGit(dir).raw(["config", key])).trim();
        } catch {
            return ""; // key unset (or git unavailable) → empty
        }
    };
    const [name, email] = await Promise.all([read("user.name"), read("user.email")]);
    return { name, email };
}

/**
 * Commit the staged index with `message` (EPIC-031 / US-632). `simpleGit().commit`
 * commits only what is staged (no `-a`). When `identity` carries a name/email, it is
 * applied as a PER-COMMIT override (`-c user.name=… -c user.email=…` via simple-git's
 * `config` option) — NO config file is written (decided "per-commit only"). Rejects an
 * empty/whitespace message rather than relying on git (which would need
 * `--allow-empty-message`). Never throws — returns `{ ok:false, error }` so the renderer
 * can toast hook/identity failures (e.g. missing identity, failing pre-commit hook).
 */
export async function commit(
    dir: string,
    message: string,
    identity?: GitIdentity,
): Promise<GitMutationResult> {
    if (!message.trim()) return { ok: false, error: "Empty commit message" };
    return mutation(async () => {
        // Only attach the override when at least one field is set, so a blank dialog
        // (git unconfigured + nothing typed) falls through to git's own resolution /
        // error rather than committing as "<empty> <empty@>".
        const opts = identity && (identity.name || identity.email)
            ? { config: [`user.name=${identity.name}`, `user.email=${identity.email}`] }
            : undefined;
        await simpleGit(dir, opts).commit(message);
    });
}

/**
 * Switch HEAD to a branch / remote branch / commit / tag (EPIC-031 / US-636) — the
 * first history-moving op. Uses `git switch` (git ≥ 2.23):
 *   - branch  → `switch <name>`
 *   - remote  → `switch -c <short> --track <ref>`, falling back to `switch <short>`
 *               when the local branch already exists (so re-switching just works)
 *   - commit  → `switch --detach <hash>` (detached HEAD)
 *   - tag     → `switch --detach <tag>`  (detached HEAD)
 * Never throws — a dirty tree that would be overwritten makes git exit non-zero and
 * is returned as `{ ok:false, error }` for the renderer to toast.
 */
export async function switchTo(dir: string, target: GitSwitchTarget): Promise<GitMutationResult> {
    return mutation(async () => {
        const git = simpleGit(dir);
        switch (target.type) {
            case "branch":
                await git.raw(["switch", target.name]);
                break;
            case "commit":
                await git.raw(["switch", "--detach", target.hash]);
                break;
            case "tag":
                await git.raw(["switch", "--detach", target.name]);
                break;
            case "remote": {
                // "origin/feature/x" → local "feature/x" (strip the first segment = remote name).
                const short = target.ref.slice(target.ref.indexOf("/") + 1);
                try {
                    await git.raw(["switch", "-c", short, "--track", target.ref]);
                } catch {
                    // Local branch already exists → just switch to it.
                    await git.raw(["switch", short]);
                }
                break;
            }
        }
    });
}

/**
 * Create a branch (EPIC-031 / US-638). `startPoint` is a commit hash / ref;
 * omitted → current HEAD. `checkout` true uses `git switch -c` (create + check
 * out, carrying the staged index so a following commit lands on the new branch);
 * false uses `git branch` (create only, HEAD unmoved). An invalid or already-
 * existing name — or a dirty tree git would overwrite when checking out a
 * historical commit — makes git exit non-zero → returned as `{ ok:false, error }`
 * for the renderer to toast (we never pass `-f`). Never throws.
 */
export async function createBranch(
    dir: string,
    name: string,
    startPoint?: string,
    checkout = false,
): Promise<GitMutationResult> {
    if (!name.trim()) return { ok: false, error: "Empty branch name" };
    return mutation(async () => {
        const git = simpleGit(dir);
        const args = checkout
            ? ["switch", "-c", name, ...(startPoint ? [startPoint] : [])]
            : ["branch", name, ...(startPoint ? [startPoint] : [])];
        await git.raw(args);
    });
}

/**
 * Fetch remote-tracking branches (US-641). When `opts.remote` is given, fetch
 * only that remote; otherwise `--all --prune`. Sets GIT_TERMINAL_PROMPT=0 so
 * HTTPS without a helper fails fast rather than hanging. Never throws.
 */
export async function fetch(dir: string, opts: GitFetchOptions = {}): Promise<GitMutationResult> {
    return mutation(async () => {
        const git = simpleGit(dir).env("GIT_TERMINAL_PROMPT", "0");
        if (opts.remote) {
            await git.raw(["fetch", "--prune", opts.remote]);
        } else {
            await git.raw(["fetch", "--all", "--prune"]);
        }
    });
}

/**
 * Ahead/behind count for the current branch vs its upstream (US-641).
 * Uses `rev-list --left-right --count @{upstream}...HEAD`:
 *   left count  = commits on upstream not on HEAD = "behind"
 *   right count = commits on HEAD not on upstream = "ahead"
 * Returns `{ hasUpstream: false }` gracefully when there is no upstream
 * (new/local-only branch). Never throws.
 */
export async function aheadBehind(dir: string): Promise<GitAheadBehind> {
    try {
        const git = simpleGit(dir).env("GIT_OPTIONAL_LOCKS", "0").env("GIT_TERMINAL_PROMPT", "0");
        // Get the upstream name for display.
        let upstream: string | undefined;
        try {
            upstream = (await git.raw(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])).trim();
        } catch {
            // No upstream configured.
            return { ahead: 0, behind: 0, hasUpstream: false };
        }
        const raw = (await git.raw(["rev-list", "--left-right", "--count", "@{upstream}...HEAD"])).trim();
        const parts = raw.split(/\s+/);
        const behind = parseInt(parts[0] ?? "0", 10) || 0;
        const ahead = parseInt(parts[1] ?? "0", 10) || 0;
        return { ahead, behind, upstream, hasUpstream: true };
    } catch {
        return { ahead: 0, behind: 0, hasUpstream: false };
    }
}

/**
 * Push the current (or specified) branch to its upstream remote (US-641).
 * Passes `-u <remote> <branch>` to set the tracking reference whenever the
 * current branch has no upstream — detected fresh here rather than trusting the
 * caller, so the combined "Commit & Push" flow on a just-created branch reliably
 * establishes tracking (the renderer's cached ahead/behind can still reflect the
 * previous branch at push time). `opts.setUpstream` forces `-u` regardless. The
 * remote defaults to "origin"; when origin is absent falls back to the single
 * configured remote. Never force-pushes. A non-fast-forward rejection is
 * surfaced as `{ ok:false, rejected:true }` — the user must fetch/pull first.
 * Sets GIT_TERMINAL_PROMPT=0 so HTTPS without credentials fails fast. Never throws.
 */
export async function push(dir: string, opts: GitPushOptions = {}): Promise<GitPushResult> {
    try {
        const git = simpleGit(dir).env("GIT_TERMINAL_PROMPT", "0");

        // Resolve the remote: use opts.remote if given, else "origin", else the sole remote.
        let remote = opts.remote;
        if (!remote) {
            try {
                const remoteList = (await git.raw(["remote"])).split("\n").map((l) => l.trim()).filter(Boolean);
                remote = remoteList.includes("origin") ? "origin" : remoteList[0];
            } catch {
                remote = "origin";
            }
        }

        // Resolve the branch: use opts.branch if given, else the current branch.
        let branch = opts.branch;
        if (!branch) {
            try {
                const head = (await git.raw(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
                branch = head && head !== "HEAD" ? head : undefined;
            } catch {
                // ignore
            }
        }

        // Set the upstream when the current branch has none (or the caller forces it).
        // Detect freshly here so a just-created branch reliably gets `-u` tracking.
        let setUpstream = !!opts.setUpstream;
        if (!setUpstream) {
            try {
                await git.raw(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
                // Upstream exists → a normal push, no `-u` needed.
            } catch {
                setUpstream = true;
            }
        }

        if (setUpstream && remote && branch) {
            await git.raw(["push", "-u", remote, branch]);
        } else if (remote && branch) {
            await git.raw(["push", remote, branch]);
        } else {
            await git.raw(["push"]);
        }
        return { ok: true };
    } catch (e) {
        const msg = errMessage(e);
        // Detect non-fast-forward rejection — git outputs "[rejected]" and
        // "fetch first" / "cannot fast-forward" in the error stream.
        const rejected = /\[rejected\]|fetch first|cannot fast.forward|non-fast-forward/i.test(msg);
        return { ok: false, error: msg, rejected };
    }
}

/**
 * Pull from the current branch's upstream (US-642). Merge by default; `--rebase` when
 * `opts.rebase`, `--ff-only` when `opts.ffOnly`. Sets GIT_TERMINAL_PROMPT=0 so HTTPS
 * without a credential helper fails fast; GIT_OPTIONAL_LOCKS=0 to avoid a stat-cache
 * rewrite while the working tree is updated. Detects conflicts from the error text and
 * populates `conflicts[]`. Never throws.
 */
export async function pull(dir: string, opts: GitPullOptions = {}): Promise<GitPullResult> {
    try {
        const git = simpleGit(dir)
            .env("GIT_OPTIONAL_LOCKS", "0")
            .env("GIT_TERMINAL_PROMPT", "0");

        const args = ["pull"];
        if (opts.rebase) args.push("--rebase");
        if (opts.ffOnly) args.push("--ff-only");

        const out = await git.raw(args);
        return { ok: true, summary: out.trim() || undefined };
    } catch (e) {
        const msg = errMessage(e);
        // Conflicts: git outputs "CONFLICT" lines and exits non-zero.
        const hadConflicts = /CONFLICT|Automatic merge failed/i.test(msg);
        const conflicts: string[] = [];
        if (hadConflicts) {
            for (const m of msg.matchAll(/CONFLICT[^\n]*?: Merge conflict in (.+)/g)) {
                conflicts.push(m[1].trim());
            }
        }
        return { ok: false, error: msg, hadConflicts, conflicts: conflicts.length ? conflicts : undefined };
    }
}
