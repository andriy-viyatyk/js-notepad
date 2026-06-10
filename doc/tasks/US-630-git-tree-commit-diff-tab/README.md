# US-630: Git Tree editor — "Diff" tab (changed files + per-file diff)

**Epic:** [EPIC-031: Git Functionality Enhancements](../../epics/EPIC-031.md)
**Status:** ✅ Done (2026-06-10) — depends on US-629

## Goal

Implement the **"Diff" tab** of the Git Tree editor's bottom panel (scaffold built in **US-629**). For the commit selected in the commit tree, the Diff tab shows a list of files changed in that commit (left) and, for the file selected in that list, an inline (single-column) diff of the file's change introduced by that commit (right) — mirroring the Git Extensions "Diff" tab. (Inline rather than side-by-side: the bottom panel is too short for two columns — decided 2026-06-10.)

## Background

This task **builds on US-629**, which delivers: the resizable bottom panel, the `SegmentedControl` "Commit"/"Diff" tab strip, the persisted height/active-tab, and the `selectedHash` plumbing in `GitTreeEditorView.tsx`. US-629 leaves a placeholder in the Diff-tab slot:

```tsx
{tab === "diff" && (
    <Panel padding="md" align="center" justify="center" flex={1}>
        <Text color="light">Diff view — coming in US-630.</Text>
    </Panel>
)}
```

This task replaces that placeholder with a real `<CommitDiffPanel>`.

### Backend — what exists, what's missing

- **Per-file content at a revision already exists:** `git.show(repoRoot, rev, relPath)` → `git show <rev>:<path>`, returns `""` when the path is absent at that rev (new file). (`src/renderer/api/git.ts`; `src/main/git-service.ts:185`.) This gives the **after** side (`rev = hash`) and the **before** side (`rev = parentHash`).
- **Missing:** the list of files changed in a commit. Needs a new `commitFiles(dir, hash)` backed by `git diff-tree --no-commit-id --name-status -r --root <hash>`.

### Diff rendering — Monaco `DiffEditor` (inline / single-column)

**Decided 2026-06-10:** render with Monaco's `DiffEditor` in **inline mode** (`renderSideBySide: false`) — a single column with two line-number gutters and red/green change backgrounds. The bottom panel is too short for the side-by-side layout the File Diff editor uses, and inline mode is the native Monaco equivalent of the Git Extensions "Diff" tab. (Raw `git diff` patch text in a `language="diff"` editor was considered and rejected — it matches the screenshot's headers but loses interactive diff folding/navigation.)

The File Diff editor mounts Monaco's `DiffEditor` directly (`src/renderer/editors/file-diff/FileDiffBody.tsx`) — use the same approach but **read-only on both sides** and **inline**:

```tsx
import { DiffEditor } from "@monaco-editor/react";
<DiffEditor language={language} original={before} modified={after}
    options={{ readOnly: true, originalEditable: false, renderSideBySide: false, automaticLayout: true }}
    theme="custom-dark" />
```

It mounts fine inside a `Panel direction="column" flex={1} overflow="hidden"`. For this read-only commit diff, both sides are read-only (no write-back wiring needed — simpler than `FileDiffBodyModel`, which exists to make the unstaged side editable).

### File list — `FileList`

`src/renderer/components/file-list/FileList.tsx` renders a flat, single-click, icon list with optional trailing badges. The "Changes" panel uses it with `GitStatusBadge` trailing (`GitChangesSecondaryView.tsx:215`):

```tsx
const items = changes.map((c) => ({ filePath: c.path, title: c.path }));
<FileList items={items} onClick={onClick} compact
    getTrailing={(item) => <GitStatusBadge status={changeMap.get(item.filePath)?.status} />} />
```

Reuse this exact pattern with the changed-file list from `commitFiles`.

## Implementation plan

### 1. Backend — `commitFiles`

**`src/main/git-service.ts`** — new function (returns the same `GitFileChange` DTO used by `status`):

```ts
/** Files changed by one commit (vs its first parent; `--root` lists all files
 *  for the initial commit). Repo-relative, forward-slashed. "" status letters
 *  map to GitFileChange.status (M/A/D/R/C/T). Never throws — [] on failure.
 *  Git Tree "Diff" tab (US-630). */
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
            const code = parts[0];                 // e.g. "M", "A", "D", "R100", "C075"
            const status = code[0];
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
```

**IPC wiring** (mirror `gitShow` / the `gitCommitMessage` added in US-629):
- `src/ipc/api-types.ts` — `gitCommitFiles = "gitCommitFiles"` + `[Endpoint.gitCommitFiles]: (dir: string, hash: string) => Promise<GitFileChange[]>;`.
- `src/ipc/main/controller.ts` — handler `gitCommitFiles` (lazy-import `commitFiles`) + `bindEndpoint`.
- `src/renderer/api.ts` — `gitCommitFiles = async (dir, hash) => executeOnce<GitFileChange[]>(Endpoint.gitCommitFiles, dir, hash);`.

**`src/renderer/api/git.ts`** — gated wrapper:
```ts
commitFiles(repoRoot: string, hash: string): Promise<GitFileChange[]> {
    if (!settings.get("git.enabled") || !repoRoot || !hash) return Promise.resolve([]);
    return api.gitCommitFiles(repoRoot, hash).catch((): GitFileChange[] => []);
},
```

### 2. New `CommitDiffPanel` component

**New file:** `src/renderer/editors/git-tree/CommitDiffPanel.tsx`. Props: `{ repoRoot: string; gitTree: GitTreeModel; selectedHash?: string }`.

Layout — horizontal split (file list left, diff right):

```tsx
<Panel direction="row" flex={1} overflow="hidden">
    <Panel name="commit-diff-files" direction="column" width={fileListW} shrink={false} overflow="hidden">
        <FileList items={items} compact getTrailing={trailing} onClick={(i) => setSelectedFile(i.filePath)} />
    </Panel>
    <Splitter name="commit-diff-splitter" orientation="vertical" value={fileListW}
              onChange={setFileListW} side="before" border="after" min={140} />
    <Panel name="commit-diff-view" direction="column" flex={1} overflow="hidden">
        {selectedFile ? <DiffEditor … /> : <empty-hint/>}
    </Panel>
</Panel>
```

Behaviour:
- On `selectedHash` change, fetch the changed-file list: `git.commitFiles(repoRoot, hash)` → `useState` list; reset `selectedFile` to the first file (or none).
- Build `FileListItem[]` from the changes (`{ filePath: c.path, title: c.path }`) with `GitStatusBadge` trailing (reuse the `GitChangesSecondaryView` pattern).
- On file select, resolve before/after text:
  ```tsx
  const commit = gitTree.state.get().commits.find(c => c.hash === selectedHash);
  const parent = commit?.parents[0] ?? "";              // "" → root commit, before side = ""
  const change = changes.find(c => c.path === selectedFile);
  const beforePath = change?.oldPath ?? selectedFile;   // rename: read old path on the parent side
  const [before, after] = await Promise.all([
      parent ? git.show(repoRoot, parent, beforePath) : Promise.resolve(""),
      git.show(repoRoot, commit.hash, selectedFile),
  ]);
  ```
  Guard against stale async (the `live` flag pattern) since both `selectedHash` and `selectedFile` can change rapidly.
- Mount `DiffEditor` read-only and **inline**: `original={before}`, `modified={after}`, `options={{ readOnly: true, originalEditable: false, renderSideBySide: false, automaticLayout: true }}`, `theme` from the active theme (see how `FileDiffBody` selects it).
- **Language detection** from the file path — check for an existing helper in `src/renderer/api/setup/configure-monaco.ts` or how `FileDiffBody`/`MonacoEditor` derive `language` from a filename; reuse it rather than re-deriving.
- Empty states: no commit selected → "Select a commit to view its changes."; commit selected but no files → "No file changes in this commit."; commit selected but no file picked → "Select a file to view its diff.".
- Persist `fileListW` (left list width) — small additive state on `GitTreeEditorState` like US-629's `bottomPanelHeight` (`commitDiffListWidth?: number` + bound setter), OR keep it view-local. **Recommendation:** persist it for consistency with the other panel dimensions.

### 3. Wire into the view

**`src/renderer/editors/git-tree/GitTreeEditorView.tsx`** — replace the US-629 Diff placeholder with:
```tsx
{tab === "diff" && (
    <CommitDiffPanel repoRoot={model.state.get().repoRoot}
        gitTree={model.gitTree} selectedHash={selectedHash} />
)}
```

## Concerns / Open questions

1. **Diff base = first parent.** For a merge commit (≥2 parents), the diff is shown against `parents[0]` only (the mainline) — matching Git Extensions' default. Showing combined/`-m` merge diffs is out of scope.
2. **Root (initial) commit.** `--root` makes `diff-tree` list every file as added; the before side is `""` so the diff renders as all-additions. Verified by the `commitFiles` args above.
3. **Renames.** `--name-status` reports `R<score>`; we read `oldPath` (parent side) and `path` (commit side) so the diff compares the right blobs. Copies (`C`) handled the same way.
4. **Large diffs / binary files.** `git.show` returns raw text; a binary blob will render as mojibake in Monaco. Low priority for v1 — could add a binary guard later (the "Changes" panel has the same characteristic). Flag if you want a guard now.
5. **Reuse vs. re-mount of Monaco.** A fresh `DiffEditor` per file selection is simplest and matches `FileDiffBody`. If flicker is noticeable we can keep one editor instance and swap models, but start simple.
6. **`fileListW` persistence** — see plan step 2; defaulting to persist. Tell me if you'd rather keep it view-local.

## Files Changed

| File | Change |
|------|--------|
| `src/main/git-service.ts` | New `commitFiles(dir, hash)`. |
| `src/ipc/api-types.ts` | `gitCommitFiles` endpoint + `Api` signature. |
| `src/ipc/main/controller.ts` | `gitCommitFiles` handler + `bindEndpoint`. |
| `src/renderer/api.ts` | `gitCommitFiles` executor. |
| `src/renderer/api/git.ts` | Gated `commitFiles` wrapper. |
| `src/renderer/editors/git-tree/GitTreeEditorView.tsx` | Replace Diff placeholder with `<CommitDiffPanel>`. |
| `src/renderer/editors/git-tree/CommitDiffPanel.tsx` | **New** — file list + Monaco diff. |
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | *(optional)* `commitDiffListWidth` state + setter, if persisting list width. |

### Files that need NO changes
- `git.show` / `git-service.show` — reused as-is for before/after sides.
- `FileList.tsx`, `GitStatusBadge.tsx`, `Splitter.tsx`, `Panel.tsx` — used as-is.
- `GitTree.tsx` / `GitTreeModel.ts` — `selectedHash` + loaded `commits` (with `parents`) already provide everything the Diff tab needs.
- `FileDiffEditor.ts` / `FileDiffBodyModel.ts` — not reused (read-only diff here needs no write-back model); referenced only as a pattern.

## Acceptance criteria

- [ ] Selecting a commit and switching to the "Diff" tab lists the files that commit changed, each with a status badge.
- [ ] Selecting a file shows a side-by-side diff of that file's change in the commit (parent → commit).
- [ ] The initial (root) commit shows all files as additions; renames diff the correct old/new blobs.
- [ ] The file-list / diff divider is resizable (and persists if step-2 persistence is taken).
- [ ] Sensible empty states for: no commit selected, commit with no changes, no file picked.
- [ ] Gated behind the "Git integration" setting; degrades gracefully (no thrown errors) when git is unavailable.
