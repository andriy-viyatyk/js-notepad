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
import type { GitCommit, GitFileChange, GitLogOptions, GitProbeResult, GitRef, GitRepoInfo, GitStatusResult } from "../ipc/git-ipc";

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
 * Parse decoration refs (`%D`), e.g. "HEAD -> main, origin/main, tag: v1.0",
 * classifying each by kind so the renderer can color it (US-611).
 */
function parseDecorations(raw: string): GitRef[] {
    const out: GitRef[] = [];
    for (const part of raw.split(",")) {
        const ref = part.trim();
        if (!ref) continue;
        if (ref.startsWith("tag: ")) {
            out.push({ name: ref.slice(5), kind: "tag" });
        } else if (ref === "HEAD") {
            out.push({ name: "HEAD", kind: "head" });
        } else if (ref.startsWith("HEAD -> ")) {
            out.push({ name: ref.slice(8), kind: "head" }); // the checked-out branch
        } else if (ref.includes("/")) {
            out.push({ name: ref, kind: "remote" });
        } else {
            out.push({ name: ref, kind: "branch" });
        }
    }
    return out;
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
            `--pretty=format:${LOG_FORMAT}`,
        ];
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
        return { staged, unstaged };
    } catch {
        return { staged: [], unstaged: [] };
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
