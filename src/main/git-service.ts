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
import type { GitCommit, GitLogOptions, GitProbeResult, GitRef, GitRepoInfo } from "../ipc/git-ipc";

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
const LOG_FORMAT = ["%H", "%P", "%s", "%an", "%at", "%D"].join(FIELD_SEP) + RECORD_SEP;

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
        const [hash, parentField, subject, authorName, at, decorations] =
            line.split(FIELD_SEP);
        if (!hash) continue;
        const parents = parentField?.trim() ? parentField.trim().split(" ") : [];
        out.push({
            hash,
            shortHash: hash.slice(0, 7),
            parents,
            subject: subject ?? "",
            authorName: authorName ?? "",
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
