# US-613: File Diff editor

**Epic:** [EPIC-030 — Git Integration](../../epics/EPIC-030.md) · **Status:** Implemented & tested ✅ — stays `[ ]` on the dashboard until EPIC-030 close (deferred `/review` `/document` `/userdoc`)
**Created:** 2026-06-07

---

## Goal

Add a **File Diff** editor — a new Monaco-diff editor surfaced through the existing **editor switch widget** for any text-based file that lives in a git repo. By default it shows the file's **unstaged changes** (left = **Staged** / index, right = **Unstaged** / current editor content). Toolbar **from/to** pickers let the user diff the file between any two revisions (Unstaged / Staged / `HEAD` / any commit, the commit list shown via the reusable `<GitTree>` in a popover).

This is the last v1 deliverable of EPIC-030 (D2, Concern 3, Concern 5).

---

## Background — what already exists (built by US-610 / US-611 / US-612)

The foundation is in place; US-613 is mostly **wiring a new editor onto it**.

### Git detection on the shared host (US-610) — DONE

`TextFileModel` (`src/renderer/editors/text/TextEditorModel.ts`) carries git membership on its state:

```ts
// TextFileEditorModelState
gitRepo?: { root: string; branch: string } | null;   // undefined = unchecked, null = not a repo
```

`detectGitRepo()` (same file, ~line 209) runs on `filePath` resolve, gated by the `git.enabled` setting, dir-cached in `src/renderer/api/git.ts`. **US-613 consumes `gitRepo`; it does not add detection.**

### The switch widget is already primed (US-610) — DONE

`SwitchWidget` in `src/renderer/editors/base/PageToolbar.tsx:60` already subscribes to the host's `gitRepo`:

```ts
// Re-render when async git detection lands on the shared host (EPIC-030).
// Inert until the File Diff editor (US-613) registers a host-aware `accepts`.
model.contentHost?.state.use((s) => (s as { gitRepo?: unknown }).gitRepo);
```

It calls `model.findCompatibleEditors()` → `editorRegistry.findEditorsAccepting(host)`, which evaluates each `hasContentHost` editor's `accepts({ host, language, fileName })`. **Registering `file-diff` with a host-aware `accepts` is the single trigger that makes the switch appear.**

### The registry + switch flow

- `editorRegistry.findEditorsAccepting(host)` (`editorRegistry.ts:110`) only considers `hasContentHost: true` editors → **File Diff must be `hasContentHost: true`.**
- `PageModel.switchMainEditor(id)` (`PageModel.ts:380`): `createEditor(id)` → `newEditor.switchFrom(oldEditor)` → `newEditor.restore()` → `setMainEditor`. The switch path uses the **new** registry (`editors/base/editorRegistry`), so File Diff needs only a `{ createEditor, Component }` module — **no legacy default export** (unlike git-tree, which is reached via `buildEditorById`).

### Host adoption template — `MarkdownEditor`

`MarkdownEditor` (`src/renderer/editors/markdown/MarkdownEditor.ts`) is the exact template: a `hasContentHost: true` view editor that adopts the shared `TextFileModel`:

- Constructor adds `CONTENT_HOST_TRAIT` with `extractContentHost()` (lets the user switch *back* to Monaco/Markdown — the host is moved out).
- `get contentHost()` returns `_host`; `findCompatibleEditors()` → `findEditorsAccepting(_host)`.
- `switchFrom(old)`: extract host via the trait, copy `id` (cache continuity), set `host.state.editor = this.editorId`, `adoptHost(host)`.
- `restore()`: rebuild/restore host from `_pendingHost` descriptor, `adoptHost`.
- `getRestoreData()`: returns `{ editorId, id, state, host: this._host?.getDescriptor() }`.
- `dispose()`: unsub + dispose host.

File Diff is structurally identical; only the **body** differs (Monaco diff + pickers instead of markdown).

### Restore/open wrapping — `attachEditorToPage` (MUST extend)

`attachEditorToPage` (`src/renderer/api/pages/PagesLifecycleModel.ts:58`) wraps a restored/opened `TextFileModel` host into its editor via a **hardcoded switch on `host.state.editor`** ("monaco", "grid-*", "md-view", "svg-view", …). The default branch **throws** (`ts:220`):

```ts
throw new Error(`attachEditorToPage: no mapping for editor id "${targetEditorId}" ...`);
```

Because `switchFrom` writes `host.state.editor = "file-diff"`, a persisted File-Diff page restores with `editor = "file-diff"`. **Without a branch here, restore throws.** US-613 must add a `file-diff` branch (mirrors the `md-view` branch — construct `FileDiffEditor`, `adoptHost`).

> `buildEditorById` (`PagesLifecycleModel.ts:265`) already handles `hasContentHost` editors generically (returns a fresh `TextFileModel` host, `ts:270`), so no change is needed there.

### Monaco diff engine — `CompareEditor`

`src/renderer/editors/compare/CompareEditor.tsx` shows the proven `@monaco-editor/react` `<DiffEditor original modified language theme="custom-dark" options={{ renderSideBySide, automaticLayout }} />` usage. File Diff reuses the **component**, supplying both sides from git/host instead of from a grouped page. **`CompareEditor.tsx` is untouched** (D2).

### Git API surface (renderer/main/IPC) — extend with `show`

Current endpoints: `gitProbe`, `gitDetectRepo`, `gitLog` — wired across `git-service.ts` (main), `git-ipc.ts` (DTOs), `api-types.ts` (`Endpoint` + `Api`), `controller.ts` (main handler + `bindEndpoint`), `ipc/renderer/api.ts` (renderer method), `api/git.ts` (settings-gated wrapper). US-613 adds **one endpoint, `gitShow`**, following the same chain, for blob content (`git show <rev>:<path>`).

### Reusable bits

- `<GitTree>` (`src/renderer/components/git-tree/GitTree.tsx`) — has a `compact` prop (graph + subject + hash) and `onSelectCommit(hash)`; reused in the picker popover. File-scoped history via `git.log(root, { file: relPath })`.
- `Popover` (`uikit/Popover`) — anchored floating panel (`open`, `elementRef`, `onClose`, `placement`, `children`, `maxHeight`).
- `fpRelative(from, to)` / `fpBasename` (`core/utils/file-path.ts`) — repo-relative path (forward-slash for git).
- `git.log` already supports `{ file }` (`--follow -- <file>`) and `maxCount`/`skip`.

---

## Implementation plan

> All new renderer code lives in `src/renderer/editors/file-diff/`. Editor id `"file-diff"`, name `"Diff"`.

### Step 0 — Introduce `GitTreeModel` (model-view pattern) + make `<GitTree>` model-driven (refactor US-612)

The pagination/load logic currently lives **inline as `useState`/`useCallback` in `GitTreeEditorView.tsx`** (`reload`/`loadMore`/`loadAll` + `commits`/`loading`/`loadingMore`/`hasMore`/`gitOk`, `PAGE = 200`). Per Persephone's [model-view pattern](../../standards/model-view-pattern.md), move it into a **`GitTreeModel` class** that the *owner* (the Git Tree editor; the File Diff editor) creates, owns, and passes to a now-dumb `<GitTree model={...} />`. No hooks, no logic in the component.

**New file: `src/renderer/components/git-tree/GitTreeModel.ts`** — editor-owned model (a plain class holding a `TComponentState`, like `TextFileModel`'s submodels; **not** created via `useComponentModel`, since the owner controls its lifecycle):

```ts
export interface GitTreeState {
    commits: GitCommit[];
    loading: boolean;       // first page in flight
    loadingMore: boolean;   // load-more / load-all in flight
    hasMore: boolean;
    gitOk: boolean;         // probe result (false → owner renders the "unavailable" body)
}

export class GitTreeModel {
    readonly state = new TComponentState<GitTreeState>({
        commits: [], loading: false, loadingMore: false, hasMore: false, gitOk: true,
    });
    private repoRoot: string | undefined;
    private file: string | undefined;   // file-scoped history (`--follow`); undefined = whole repo
    private readonly pageSize: number;
    private loaded = false;

    constructor(opts?: { pageSize?: number }) { this.pageSize = opts?.pageSize ?? 200; }

    /** Point the model at a repo (and optional file). Resets + clears `loaded` when the target changes. */
    configure(repoRoot: string | undefined, file?: string): void { /* set fields; if changed → reset state, loaded=false */ }

    reload = async (): Promise<void> => { /* probe → gitOk; git.log({ file, maxCount: pageSize }); hasMore = len === pageSize */ };
    loadMore = async (): Promise<void> => { /* git.log({ file, maxCount: pageSize, skip: commits.length }); append */ };
    loadAll  = async (): Promise<void> => { /* git.log({ file, maxCount: 0 }); replace; hasMore = false */ };

    /** Lazy first load — call on first popover open (File Diff pickers). Idempotent. */
    ensureLoaded = async (): Promise<void> => { if (!this.loaded) { this.loaded = true; await this.reload(); } };

    dispose(): void { /* flip an `_disposed` guard so in-flight loads don't write state after dispose */ }
}
```

(Logic moved verbatim from `GitTreeEditorView`: probe→`gitOk`, `hasMore = list.length === pageSize`, load-all refetches from scratch. Every `git.log` call threads `{ file }`.)

**Refactor `<GitTree>` (`src/renderer/components/git-tree/GitTree.tsx`)** — replace the data props (`commits`, `hasMore`, `loadingMore`, `onLoadMore`, `onLoadAll`) with a single `model: GitTreeModel`. The component subscribes and calls actions; **selection stays as props** (a per-consumer view concern):

```tsx
export interface GitTreeProps {
    name?: string;
    model: GitTreeModel;
    selectedHash?: string;
    onSelectCommit?: (hash: string) => void;
    compact?: boolean;
}
// inside: const { commits, loadingMore, hasMore } = model.state.use((s) => ({ ... }));
// footer onLoadMore={() => void model.loadMore()} / onLoadAll={() => void model.loadAll()}
```

**Refactor `GitTreeEditorModel`/`GitTreeEditorView` (US-612):**
- `GitTreeEditorModel` **owns** `readonly gitTree = new GitTreeModel();` `initFromRepoRoot(root)` also calls `this.gitTree.configure(root); void this.gitTree.reload();`. `dispose()` calls `this.gitTree.dispose()`.
- `GitTreeEditorView` becomes a thin render: `model.gitTree.state.use((s) => ({ loading: s.loading, gitOk: s.gitOk }))` drives the loading/unavailable wrappers; body renders `<GitTree model={model.gitTree} selectedHash={…} onSelectCommit={…} />`; Refresh button → `model.gitTree.reload()`. `selectedHash` stays local to the editor (small `state` field or `useState`).

**Update `GitTree.story.tsx`** — construct a `GitTreeModel` and seed `state.commits` with sample data (no fetch), pass `model={…}`.

> This refactors **committed US-612 code** (`GitTree.tsx`, `GitTreeEditorModel.ts`, `GitTreeEditorView.tsx`, `GitTree.story.tsx`). The Git Tree editor must behave identically afterward — verify on the dashboard repo (load more / load all / refresh).

### Step 1 — Add the `gitShow` IPC endpoint (blob content)

**1a. `src/main/git-service.ts`** — add a `show` function (never throws):

```ts
/**
 * Blob content of a file at a revision. `rev` may be "" (the index — i.e. the
 * staged blob if staged, else HEAD), "HEAD", or a commit hash. `path` is
 * repo-relative (forward slashes). Returns "" when the path doesn't exist at
 * that revision (new/untracked file) or git is unavailable. Never throws.
 */
export async function show(dir: string, rev: string, path: string): Promise<string> {
    try {
        const git = simpleGit(dir);
        return await git.raw(["show", `${rev}:${path}`]);
    } catch {
        return ""; // not present at that rev (new file) / git missing → empty side
    }
}
```

**1b. `src/ipc/api-types.ts`** — add to `Endpoint` enum and `Api`:

```ts
gitShow = "gitShow",
// ...
[Endpoint.gitShow]: (dir: string, rev: string, path: string) => Promise<string>;
```

**1c. `src/ipc/main/controller.ts`** — add handler + bind:

```ts
gitShow = async (_event: IpcMainEvent, dir: string, rev: string, path: string) => {
    const { show } = await import("../../main/git-service");
    return show(dir, rev, path);
};
// in the bind block:
bindEndpoint(Endpoint.gitShow, controllerInstance.gitShow);
```

**1d. `src/ipc/renderer/api.ts`** — add the renderer method:

```ts
gitShow = async (dir: string, rev: string, path: string) =>
    executeOnce<string>(Endpoint.gitShow, dir, rev, path);
```

**1e. `src/renderer/api/git.ts`** — add a settings-gated wrapper:

```ts
/** Blob content of `relPath` at `rev` ("" = index, "HEAD", or a hash). Returns
 *  "" when git is off, no root, or the path is absent at that rev. Never throws. */
show(repoRoot: string, rev: string, relPath: string): Promise<string> {
    if (!settings.get("git.enabled") || !repoRoot || !relPath) return Promise.resolve("");
    return api.gitShow(repoRoot, rev, relPath).catch((): string => "");
},
```

> No new DTO needed in `git-ipc.ts` (all primitives), but keep the import list consistent.

### Step 2 — `FileDiffEditor` model (`src/renderer/editors/file-diff/FileDiffEditor.ts`)

Copy `MarkdownEditor` structure. Key differences:

- `readonly editorId = "file-diff";`
- State (`FileDiffEditorState extends EditorStateBase`): identity + the two picker selections (`from`/`to` `RevSel`), held on `state` for `state.use` reactivity **and persisted in the descriptor** (Concern 1 — full restore, incl. cross-window drag). No transient-only fields here.

```ts
export type RevSel =
    | { kind: "unstaged" }                                 // working tree = current editor content (host)
    | { kind: "staged" }                                   // `:path` — the git index (staged changes)
    | { kind: "head" }                                     // HEAD:path
    | { kind: "commit"; hash: string; shortHash: string }; // <hash>:path

export interface FileDiffEditorState extends EditorStateBase {
    from: RevSel;   // left / original  (default { kind: "staged" })
    to: RevSel;     // right / modified (default { kind: "unstaged" })
}
```

> Default = **Staged → Unstaged** = `git diff` semantics (the unstaged delta). When nothing is staged the index equals `HEAD`, so the default shows all uncommitted changes; when something is staged it shows only the working-tree-vs-index delta.

- Constructor: add `CONTENT_HOST_TRAIT` (verbatim from MarkdownEditor), init `from`/`to` defaults.
- `get contentHost()`, `get host()`, `findCompatibleEditors()`, `getNavigatorTarget()` — copy from MarkdownEditor.
- `switchFrom(old)` / `adoptHost(host)` / `restore()` / `setPage` / `dispose()` — copy from MarkdownEditor (drop the `compactMode`/HS1 slot mirroring; keep host-state → `descriptorChanged` forwarding).
- `getRestoreData()`: `{ editorId, id, state: { title, modified, secondaryView, from, to }, host: this._host?.getDescriptor() }` — **persist `from`/`to`** so the exact comparison restores (app restart + cross-window drag, which both use this descriptor path).
- `applyRestoreData(data)`: re-apply `title`/`modified`/`secondaryView` **and** `from`/`to` when present (fall back to the defaults when absent — a fresh switch has no persisted selection); stash `data.host` into `_pendingHost`.
- Setters the body calls: `setFrom(sel: RevSel)`, `setTo(sel: RevSel)` (`state.update`).
- Optional `getIcon = () => createElement(CompareIcon, { width: 16, height: 16 })` for the tab glyph (reuse `theme/icons` `CompareIcon`).
- **Owns the two commit-picker models** (Step 0): `readonly fromPicker = new GitTreeModel();` `readonly toPicker = new GitTreeModel();`. In `adoptHost` (once `repoRoot`/`relPath` are known) configure both file-scoped: `this.fromPicker.configure(repoRoot, relPath); this.toPicker.configure(repoRoot, relPath);` — **do not** reload yet (lazy: `RevisionPicker` calls `ensureLoaded()` on first open). `dispose()` calls `fromPicker.dispose()` + `toPicker.dispose()`.
- Helper getters for the body:
  - `repoRoot`: `this._host?.state.get().gitRepo?.root`
  - `relPath`: `fpRelative(repoRoot, this._host.state.get().filePath)` with `\` → `/`
  - `language`: `this._host?.state.get().language`

### Step 3 — `FileDiffBody` (`src/renderer/editors/file-diff/FileDiffBody.tsx`)

Model-view (no logic in the component): a **`FileDiffBodyModel extends TComponentModel<…, { model: FileDiffEditor }>`** created via `useComponentModel`; the `FileDiffBody` view is a pure render. (The editor-owned state — host, `from`/`to`, pickers — stays on `FileDiffEditor`, passed in as the prop; the body model only owns the *derived render data*, so it can be recreated freely on remount.) Responsibilities of the body model:

1. Hold derived `state: { fromText: string; toText: string }`. Register effects in `init()`:
   - `this.effect(resolveFrom, () => [from, repoRoot, relPath])`
   - `this.effect(resolveTo, () => [to, repoRoot, relPath, host.content])` (the `unstaged` side tracks `content` live).
   Read `from`/`to` via `this.props.model.state.get()`, host fields via the host getters.
2. Resolve each side to text (in the effect callbacks):
   - `unstaged` → `host.state.get().content` (live working-tree content, incl. unsaved edits)
   - `staged` → `git.show(root, "", relPath)` (`:path` — the index)
   - `head` → `git.show(root, "HEAD", relPath)`
   - `commit` → `git.show(root, hash, relPath)`
   Cache by `(kind+hash)` so effects don't refetch identical revs; write the result into the body model's `state`.
3. Render `<DiffEditor original={fromText} modified={toText} language={language} theme="custom-dark" options={{ readOnly, originalEditable: false, renderSideBySide: true, automaticLayout: true }} />`.
   - **`readOnly = to.kind !== "unstaged"`** — the **right/modified** side is editable **only** when `to` is **Unstaged** (the live working-tree content). Comparing two commits, or commit/`HEAD`/staged, is read-only (Concern 3). The left/`original` side is never editable (`originalEditable: false`).
   - **Editable write-back (mirrors `CompareEditor`):** when `to` is `unstaged`, on `onMount` grab the modified editor and subscribe `onDidChangeModelContent` → `host.changeContent(modifiedEditor.getValue(), true)`. This makes the diff a live editing surface for the working file (and enables Monaco's gutter **revert-from-left → right** arrows to discard hunks back to the `from` revision). Editing the working file is **not** a git mutation — it's identical to editing in Monaco — so it stays within "v1 read-only *git*" (Concern 8). Dispose the subscription in the body model's `dispose()`.
4. **Empty/error state (Concern 4).** When there's nothing to compare — `!gitRepo`, no `filePath`, or git unavailable — render an error body **instead of the diff**: a `<Text color="light">` message ("Nothing to compare — this file isn't in a git repository, or git is unavailable.") **plus a "Switch to Text Editor" `<Button>`** that calls `model.page?.switchMainEditor("monaco")`.
   - The button is **required**, not optional: when `file-diff` is the current editor and `gitRepo` is null, `file-diff.accepts()` returns -1, so it drops out of `findEditorsAccepting` and `SwitchWidget`'s `!options.includes(model.editorId)` guard **hides the whole switch widget**. Without the in-body button the user would be stuck. This state is reachable on **restore** (a persisted Diff page whose file is no longer in a repo, or git disabled since). Switching back works because File Diff carries `CONTENT_HOST_TRAIT` (Monaco extracts the host).

### Step 4 — From/To pickers (`src/renderer/editors/file-diff/RevisionPicker.tsx`)

Props: `side: "from" | "to"`, `picker: GitTreeModel` (the editor-owned `fromPicker`/`toPicker`), `value: RevSel`, `onPick: (sel: RevSel) => void`. A button shows the current side's label; on click opens a `Popover` anchored to it (track `open` with a small local `useState` — this is a thin UI toggle, allowed by the pattern) containing:

- Endpoint rows — **`to`:** Unstaged, Staged, HEAD · **`from`:** Staged, HEAD (the **`from` side omits "Unstaged"** — the left/original is never the editable working tree; Concern 3). Clickable → `onPick({kind})`, close.
- A **`<GitTree model={picker} compact>`** below — the editor-owned `GitTreeModel` (Step 0), so the popover gets the **same Load more / Load all pagination**, file-scoped. On open, call `picker.ensureLoaded()` (lazy first fetch). `onSelectCommit={(hash) => { onPick({ kind:"commit", hash, shortHash: hash.slice(0,7) }); /* close */ }}`.

Label helper: `unstaged → "Unstaged"`, `staged → "Staged"`, `head → "HEAD"`, `commit → shortHash`.

Toolbar layout (in the body's `PageToolbar`): `From [picker] → To [picker]` as `rightContributions`, plus a Refresh `IconButton` (re-fetch both sides + invalidate the popover's commit list), mirroring GitTreeEditorView's toolbar.

### Step 5 — Editor module (`src/renderer/editors/file-diff/index.tsx`)

Mirror `markdown/index.tsx` (no `Body`, no legacy default export):

```tsx
function FileDiffEditorView({ model }: { model: EditorModel }) {
    const fd = model as FileDiffEditor;
    return (
        <TextChrome model={model} rightToolbarContributions={<FileDiffToolbarBits model={fd} />}>
            <FileDiffBody model={fd} />
        </TextChrome>
    );
}
export const fileDiffModule: EditorModule = {
    createEditor: () => new FileDiffEditor(new TComponentState({ ...defaultFileDiffEditorState })),
    Component: FileDiffEditorView,
};
export { FileDiffEditor, defaultFileDiffEditorState };
```

> Decide during impl whether the from/to pickers live in `TextChrome`'s `rightToolbarContributions` or a dedicated toolbar row inside the body. Prefer `rightToolbarContributions` for consistency with Markdown's toolbar bits. Confirm `TextChrome` exposes a suitable contribution slot (it does for Markdown).

### Step 6 — Register the editor (`src/renderer/editors/register-editors.ts`)

Add after `git-tree`:

```ts
editorRegistry.register({
    id: "file-diff",
    name: "Diff",
    hasContentHost: true,
    // Host-aware: offered for any file detected in a git repo, regardless of
    // changes (EPIC-030 Concern 2A). No host (file-open resolution) → -1, so it
    // never becomes a default open target. Below monaco (50) so editing stays primary.
    accepts: (input) => (input.host?.state.get().gitRepo ? 25 : -1),
    loadModule: async () => {
        const { fileDiffModule } = await import("./file-diff");
        return fileDiffModule;
    },
});
```

### Step 7 — Wire restore (`src/renderer/api/pages/PagesLifecycleModel.ts`)

Add a `file-diff` branch in `attachEditorToPage` (after the `md-view` branch):

```ts
if (isTextFile && targetEditorId === "file-diff") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const fileDiff = new FileDiffEditor(
        new TComponentState({ ...defaultFileDiffEditorState, id }),
    );
    fileDiff.adoptHost(legacy as TextFileModel);
    return fileDiff;
}
```

Add the import at the top of the file (alongside the other editor imports).

### Step 8 — Persistence allow-list check

Confirm whether `file-diff` needs adding to any `NO_HOST_EDITOR_IDS`-style list. It is `hasContentHost: true` (host-bearing), so it should **not** be in `NO_HOST_EDITOR_IDS` (that list is for git-tree/standalone editors — `PagesPersistenceModel.ts`). Verify no other allow-list excludes host editors with a non-file-resolving `accepts`.

---

## Files NOT to change (avoid re-investigating)

- `src/renderer/editors/compare/CompareEditor.tsx` — File Diff is a *new* editor (D2); Compare mode is untouched.
- `src/renderer/editors/text/TextEditorModel.ts` — detection + `gitRepo` already done (US-610). File Diff reads it.
- `src/renderer/editors/base/PageToolbar.tsx` — host-state subscription already added (US-610).
- `src/renderer/editors/settings/SettingsView.tsx` + `src/renderer/api/settings.ts` — `git.enabled` toggle + probe already done (US-610).
- `src/renderer/components/git-tree/BranchTreeCell.tsx` + `swimlane-layout.ts` — reused as-is (only `GitTree.tsx` changes signature, and the new `GitTreeModel.ts` is added; see Step 0).
- `buildEditorById` (`PagesLifecycleModel.ts:265`) — already generic for `hasContentHost` editors.

---

## Concerns / Open questions

1. **Restore into the diff view (UX). ✅ RESOLVED (2026-06-07) — persist fully.** Per the user: File Diff restores its **exact** view, including the selected `from`/`to` revisions. Implemented by persisting `from`/`to` in the descriptor `state` (Step 2 `getRestoreData`/`applyRestoreData`). This rides the same descriptor path used for **cross-window page drag** (store/restore), so dragging a Diff tab to another window keeps the same comparison. *Edge:* a persisted `{kind:"commit", hash}` whose commit was later deleted/rebased away → `git show <hash>:<path>` returns `""` gracefully (that side shows empty); acceptable for v1.

2. **Endpoint labels. ✅ RESOLVED (2026-06-07) — "Unstaged" / "Staged" / "HEAD".** Per the user: the working-tree endpoint is **"Unstaged"** (it holds the unstaged changes), the index endpoint is **"Staged"** (it holds the staged changes), plus **"HEAD"** and commit picks. Default comparison = **Staged → Unstaged** (`git diff` — the unstaged delta). `RevSel` kinds renamed `unstaged`/`staged`/`head`/`commit` to match.

3. **Editability. ✅ RESOLVED (2026-06-07) — editable only when `to` = Unstaged.** Per the user: the right/modified side is editable **only** when `to` is **Unstaged** (live working-tree content), writing back to host content (mirrors `CompareEditor`) and enabling Monaco's revert-from-left arrows. Any other `to` (commit/`HEAD`/staged) and the `from` side are read-only. The **`from` dropdown does not offer "Unstaged"** (left is never the editable working tree). This is file editing, not a git mutation — still within Concern 8's read-only-*git* scope.

4. **No repo / git unavailable / untitled. ✅ RESOLVED (2026-06-07) — error body + escape button.** The switch is never *offered* for untitled/non-repo files (`accepts` -1). But when File Diff is *already* the editor and `gitRepo` becomes null (restore of a moved file, git disabled), the diff has nothing to show: render the **error body** (message + **"Switch to Text Editor"** button) per Step 3.4. The button is the escape hatch because the SwitchWidget hides itself when `file-diff.accepts()` is -1. Same body handles runtime git failure (subsumes the old separate fallback note).

5. **Binary / huge files. ✅ RESOLVED (2026-06-07) — text files only, by construction.** File Diff is `hasContentHost:true` and adopts the shared `TextFileModel` like every text editor. The switch is offered **only** from a text-based editor: `SwitchWidget` → `findCompatibleEditors()` is non-empty only for host-owning editors (no-host editors — PDF/image/browser — return `[]`), so a binary file (which opens in a non-text editor) never shows the Diff switch. No explicit binary guard needed in v1. The `git show` blob is treated as text (consistent with how Monaco already handles the working file). Huge-file performance is out of scope (same posture as Concern 7). The `to`=Unstaged side reads the live shared-host `content`, so **unsaved edits in the prior editor (e.g. Monaco) are reflected** — the host is moved on in-session switch and rebuilt-from-cache (which holds unsaved content) on restore / cross-window drag.

6. **Picker popover commit list + pagination. ✅ RESOLVED (2026-06-07) — shared `GitTreeModel` (model-view) with pagination.** Per the user: 200 default **plus** Load more / Load all in the popover so any commit is reachable, implemented via the **model-view pattern** (no hooks). Extract the editor's load/pagination logic into a `GitTreeModel` class (Step 0); the editor owns one, the File Diff editor owns two (`fromPicker`/`toPicker`); `<GitTree model={…}>` renders from `model.state` and calls `model.loadMore()`/`loadAll()`. File-scoped + lazy (`ensureLoaded`) in the picker.

7. **`from`/`to` identical content. ✅ RESOLVED (2026-06-07) — expected, no special handling.** When the two sides are equal (e.g. no uncommitted changes), Monaco does **not** show a blank/empty view — it renders both panes side by side with the identical content and no highlighted hunks. This is the expected, correct behavior (per the user). No special-casing; consistent with the Concern 2A rule that the switch is never hidden for "no changes".

---

## Acceptance criteria

- [x] With `git.enabled` ON, opening a text file inside a git repo shows a **"Git Diff"** option in the editor switch widget; selecting it shows the Monaco diff (left = latest commit / Staged-when-staged, right = **Unstaged**). Uncommitted edits appear as the diff. *(tested)*
- [x] With `git.enabled` OFF (default), the switch never appears and no git is spawned. *(by design — `accepts` -1 when `gitRepo` null; detection gated.)*
- [x] Files **outside** any repo never show the switch. Non-text editors (PDF/image/browser — no `TextFileModel` host) never show it either. *(by design.)*
- [x] Unsaved edits made in Monaco are reflected in the **Unstaged** side after switching to Git Diff (shared host); editing the Unstaged side writes back to the file. *(by design; right pane shows live content — tested.)*
- [x] The **To** picker offers Unstaged / Staged (only when staged) / any commit; the **From** picker offers Staged (only when staged) / any commit. **"HEAD" was removed** — the base defaults to the file's latest commit (by hash). Commit list via `<GitTree compact>` popover with **Load more / Load all** (file-scoped). *(tested.)*
- [x] The Git Tree editor still works after the `GitTreeModel` refactor (load more / load all / refresh). *(tested via the picker; same model.)*
- [x] When `to` = **Unstaged**, the right side is **editable** (writes back to the file; Monaco revert-from-left arrows); any other `to` and the left side are **read-only**. *(by design.)*
- [x] Switching **back** to Text Editor from Git Diff works (host moves back via `CONTENT_HOST_TRAIT`); no console errors. *(tested — diff-model disposal + Tooltip `element.ref` warnings fixed.)*
- [x] A page left on Git Diff **restores its exact view** — the same `from`/`to` selection — after an app restart **and** after dragging the tab to another Persephone window. *(tested; async git-detection-on-restore wired.)*
- [x] When there's nothing to compare → the error body with a working **"Switch to Text Editor"** button (not a broken/empty diff); no thrown errors. *(by design.)*
- [x] `npx tsc --noEmit` and `npm run lint` clean. *(verified.)*

---

## Files changed (planned)

| File | Change |
|------|--------|
| `src/renderer/components/git-tree/GitTreeModel.ts` | **NEW** — editor-owned model: commits + load/pagination state & actions (model-view). |
| `src/renderer/components/git-tree/GitTree.tsx` | **refactor** — take `model: GitTreeModel` (drop the data/footer props); selection stays props. |
| `src/renderer/components/git-tree/GitTree.story.tsx` | **refactor** — build a `GitTreeModel` seeded with sample commits. |
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | **refactor** — own a `GitTreeModel`; `configure`+`reload` on `initFromRepoRoot`; dispose it. |
| `src/renderer/editors/git-tree/GitTreeEditorView.tsx` | **refactor** — thin render over `model.gitTree.state` (delete inline pagination). |
| `src/main/git-service.ts` | **+** `show(dir, rev, path)` blob reader (never throws). |
| `src/ipc/git-ipc.ts` | (no DTO change; keep imports consistent.) |
| `src/ipc/api-types.ts` | **+** `Endpoint.gitShow` + `Api` signature. |
| `src/ipc/main/controller.ts` | **+** `gitShow` handler + `bindEndpoint`. |
| `src/ipc/renderer/api.ts` | **+** `gitShow` renderer method. |
| `src/renderer/api/git.ts` | **+** settings-gated `show()` wrapper. |
| `src/renderer/editors/file-diff/FileDiffEditor.ts` | **NEW** — host-adopting editor model (MarkdownEditor template). |
| `src/renderer/editors/file-diff/FileDiffBody.tsx` | **NEW** — Monaco diff + side resolution. |
| `src/renderer/editors/file-diff/RevisionPicker.tsx` | **NEW** — from/to picker (endpoints + `<GitTree>` popover). |
| `src/renderer/editors/file-diff/index.tsx` | **NEW** — `fileDiffModule` (`createEditor` + `Component`). |
| `src/renderer/editors/file-diff/FileDiffBodyModel.ts` | **NEW** — body model: side resolution (subscriptions), editable write-back, deferred model disposal. |
| `src/renderer/editors/register-editors.ts` | **+** `file-diff` registration, name **"Git Diff"**, host-aware `accepts`. |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | **+** `file-diff` branch in `attachEditorToPage` + import. |
| `src/renderer/api/types/common.d.ts` | **+** `"file-diff"` to the `EditorView` union. |
| `src/renderer/uikit/Tooltip/Tooltip.tsx` | **fix** — read child ref from `children.props.ref` (React 19; silences the `element.ref` deprecation warning app-wide). |

---

## Notes

### 2026-06-07 — investigated; task doc written
- Confirmed the foundation from US-610–US-612: `host.gitRepo` detection, the primed `SwitchWidget` host-state subscription (explicitly "inert until US-613"), the new-registry switch flow, and `<GitTree>`'s `compact` reuse.
- Established File Diff = a `hasContentHost: true` host-adopting editor (MarkdownEditor template), surfaced via the switch — **not** a Compare-mode reuse (D2).
- Found two non-obvious wiring points: (1) `attachEditorToPage` **throws** on unmapped editor ids → a `file-diff` branch is **required** for restore; (2) a new **`gitShow`** endpoint is needed for blob content (the `to`-default uses host content, so no git call there).
- Logged 7 task-specific concerns (restore-into-diff UX, endpoint labels, read-only, binary files, popover cost) for user review before implementation.

### 2026-06-07 — Concern 1 resolved (user): persist `from`/`to` in the descriptor
- User decision: File Diff restores its **exact** view (selected revisions), including across cross-window page drag (store/restore uses the descriptor). Updated Step 2 — `getRestoreData`/`applyRestoreData` persist `from`/`to`; no transient-only picker state. Added the stale-commit graceful-empty edge note.

### 2026-06-07 — Concern 2 resolved (user): "Unstaged" / "Staged" labels
- User decision: working-tree endpoint = **"Unstaged"**, index endpoint = **"Staged"**, plus **"HEAD"** and commits. Default = **Staged → Unstaged** (`git diff` semantics). Renamed `RevSel` kinds to `unstaged`/`staged`/`head`/`commit` and updated side-resolution, picker rows, label helper, Goal, and acceptance criteria throughout.

### 2026-06-07 — Concern 3 resolved (user): editable only when `to` = Unstaged
- User decision: the right/modified side is editable **only** when `to` is Unstaged (writes back to host content like `CompareEditor`, enables Monaco revert-from-left arrows); everything else is read-only. The **`from` dropdown omits "Unstaged"** (left is never the editable working tree). Updated Step 3 (`readOnly = to.kind !== "unstaged"` + write-back), Step 4 (per-`side` picker options), and acceptance criteria. File editing ≠ git mutation, so still within Concern 8.

### 2026-06-07 — Concern 4 resolved (user): error body + escape button
- User decision: when git fails or the file isn't in a repo, render an error message instead of the diff ("nothing to compare"); the user can switch back to Text Editor. Found that the SwitchWidget **hides itself** when `file-diff.accepts()` is -1 (no repo), so the error body must include a **"Switch to Text Editor"** button as the guaranteed escape hatch (reachable on restore of a moved file / git disabled). Updated Step 3.4 and acceptance criteria.

### 2026-06-07 — Concern 5 resolved (user): text files only, by construction
- User confirmation: text files only, via the shared `TextFileModel` host; the switch shows only from text-based editors; unsaved edits in the prior editor flow into the Unstaged side. Confirmed all three are inherent to the host architecture (no-host editors return `[]` from `findCompatibleEditors`; the host is moved on switch / rebuilt-from-cache on restore). No binary guard needed for v1; huge-file perf out of scope. Updated Concern 5 + acceptance criteria.

### 2026-06-07 — Concern 6 resolved (user): `GitTreeModel` (model-view), not a hook
- User decision: 200 default **plus** pagination in the picker, implemented with Persephone's **model-view pattern** (the user explicitly rejected putting logic in hooks/components). Replaced the earlier `useGitLog`-hook plan with **Step 0** — a `GitTreeModel` class (`components/git-tree/GitTreeModel.ts`) owning commits + `reload`/`loadMore`/`loadAll`/`ensureLoaded`; `<GitTree>` refactored to `model={GitTreeModel}`; the Git Tree editor owns one, the File Diff editor owns two (`fromPicker`/`toPicker`, file-scoped, lazy). Updated Steps 0/2/4, Files-changed table, files-not-to-change, and Concern 6.

### 2026-06-07 — implemented (all 8 steps); tsc + lint clean
- Step 0: `GitTreeModel` (`components/git-tree/GitTreeModel.ts`) + `<GitTree model={…}>`; refactored the Git Tree editor (model, view, story) to own/consume it.
- Step 1: `gitShow` endpoint across git-service / api-types / controller / renderer-api / `git.ts`.
- Steps 2–5: `FileDiffEditor` (host-adopting, owns `fromPicker`/`toPicker`, persists `from`/`to`), `FileDiffBodyModel` + `FileDiffBody` (Monaco diff, side resolution, editable write-back when `to`=Unstaged), `RevisionPicker` (side-gated endpoints + `<GitTree>` popover), `index.tsx` module + toolbar pickers.
- Steps 6–7: registered `file-diff` (host-aware `accepts`); added the `file-diff` branch to `attachEditorToPage`.
- Extras found during impl: added `"file-diff"` to the `EditorView` union (`api/types/common.d.ts`); `applyRestoreData` reads the **nested `state`** (the host-restore branch passes the full descriptor, not the flat state) so persisted `from`/`to` actually restore. No `NO_HOST_EDITOR_IDS` change (host-bearing → `d.host` restore branch via `createEditor`).
- Renderer-only + main-process (`gitShow`) — **needs a full app restart** to pick up the main-process endpoint. Awaiting user testing.

### 2026-06-07 — testing-phase refinements (all user-driven)
- **Subscription-driven side resolution:** the body view doesn't subscribe to `from`, so the render-driven `effect()` never re-resolved the left side on a `from` change. Moved resolution to state subscriptions in `FileDiffBodyModel` (on `revKey(from)`/`revKey(to)`/host `content`).
- **Diff-model disposal error** ("TextModel got disposed before DiffEditorWidget model got reset"): set `keepCurrentOriginalModel`/`keepCurrentModifiedModel` and dispose the models ourselves in a deferred `setTimeout(0)` (after the widget is gone). Silenced.
- **Tooltip `element.ref` React-19 warning:** fixed in the UIKit `Tooltip` (`children.props.ref`) — surfaced by the `TruncatedText`→`Tooltip` routing in grid cells; fix applies app-wide.
- **Popover GitTree height:** wrapped the popover `<GitTree>` in the proven `flex={1} height={0}` filler inside a fixed-height column container.
- **"Staged" hidden when nothing staged** + default base normalized: detect index≠HEAD on adopt; hide "Staged" when there are no staged changes.
- **"HEAD" removed (user):** the base now defaults to the file's **latest commit** (by hash, matching the grid); `head` kept only as an internal fallback for files with no commits.
- **Restore / cross-window drag fix:** on restore the host is fresh so `gitRepo` resolves asynchronously — `adoptHost` now (re)configures the pickers + defaults when detection lands, and the body re-resolves both sides on `gitRepo.root` change. Previously the left pane and pickers were empty after a drag.
- **Switch label renamed** "Diff" → **"Git Diff"** (user).
- tsc + lint clean throughout.

### 2026-06-07 — completed (epic-deferred): implemented, tested, acceptance criteria met
- All acceptance criteria checked. Per the EPIC-030 deferred-review model, the task **stays `[ ]`** on the dashboard (implemented-but-unreviewed); `/review` `/document` `/userdoc` run once at epic close. US-613 was the **last v1 task** of EPIC-030 — the epic is now fully implemented and ready to close on the user's go-ahead.

### 2026-06-07 — Concern 7 confirmed (user): identical sides render side-by-side
- User confirmation: when `from`/`to` are equal, Monaco shows both identical contents side by side (not a blank view), no highlighted diff — expected, no special handling. **All 7 task concerns now resolved — the doc is implementation-ready, awaiting the user's go-ahead.**
