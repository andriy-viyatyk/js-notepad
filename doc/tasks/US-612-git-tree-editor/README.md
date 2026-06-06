# US-612: Git Tree editor + Explorer `.git` entry point

**Epic:** [EPIC-030 — Git Integration](../../epics/EPIC-030.md)
**Status:** Implemented & verified (2026-06-06) — typecheck + full `npm run lint` clean; render / in-page navigation / refresh / load-more / **load-all** / range-select + copy / tab icon / horizontal scroll all confirmed in the running app against the real Persephone repo (667 commits). See **Post-implementation notes** for deltas from the original plan. Epic-deferred: stays `[ ]` on the dashboard until EPIC-030 close-out runs `/review` + `/document` + `/userdoc`.
**Depends on:** US-610 (git service + IPC + `git.enabled` setting + `git.probe`) — **done**; US-611 (Git Tree component + `git.log`) — **done**.
**Consumed by:** nothing (leaf v1 task; US-613 File Diff is independent and reuses US-611's component directly).

---

## Goal

Register a **`git-tree` editor** — a standalone (no content-host) full-tab editor that mounts the US-611 `<GitTree>` component, fed by `git.log(repoRoot)` — and wire its **entry point**: clicking the repo's **`.git` folder in the Explorer panel navigates that page to the Git Tree editor** (the same in-page navigation as clicking a folder → folder view). Gated by the off-by-default `git.enabled` setting (EPIC-030 D6 / Concern 4); when git is unavailable the editor body shows a graceful error message.

This is the "*very simple* Git Tree editor — essentially just the component" of the locked v1 scope (EPIC-030 Initial Scope #2, Concern 1).

---

## Background — what already exists and what to build on

### US-611 component (mount target) — `src/renderer/components/git-tree/`

`<GitTree commits={GitCommit[]} selectedHash? onSelectCommit? compact? name? />` (`GitTree.tsx`). Presentational: caller fetches commits, the component runs the swimlane layout and renders an `AVGrid`. Exported from `components/git-tree/index.ts` along with `GIT_TREE_ROW_HEIGHT`. The editor passes `compact={false}` and the full commit list.

### Data layer (already wired, US-610/US-611) — `src/renderer/api/git.ts`

```ts
git.log(repoRoot: string, opts?: GitLogOptions): Promise<GitCommit[]>  // [] when git.enabled off / unavailable; never throws
git.probe(): Promise<GitProbeResult>   // { installed, version? } — used to decide the error body
```

US-612 is the **first end-to-end exercise of the real `git.log` path** (US-611 verified it only against a synthetic DAG in Storybook).

### The entry-point mechanism — in-page navigation, identical to `category-view`

The Explorer is a **secondary view (sidebar panel)** bound to a page. Clicking an item navigates **that page** (it does not open a new tab). Verified flow:

1. **`ExplorerSecondaryView.tsx:60`** — `const url = model.treeProvider.getNavigationUrl(item)` → `app.events.openRawLink.sendAsync(createLinkData(url, { pageId, sourceId: "explorer" }))`. **It passes the originating `pageId`.**
2. **`content/parsers.ts`** (Layer 1) — a prefix parser sets `data.url`/`data.target` and forwards to `openLink` (the `tree-category://` parser at `:67` is the template).
3. **`content/resolvers.ts`** (Layer 2) — for a virtual `://` URL with no real pipe, the file resolver's **virtual-path branch** (`:57`) creates a placeholder file pipe and fires `openContent`. (Comment there: *"CategoryEditor resolves its treeProvider from secondary views, not the pipe."*)
4. **`content/open-handler.ts:31`** (Layer 3) — because `data.pageId` is set, it calls **`pagesModel.lifecycle.navigatePageTo(pageId, filePath, { target, pipe, sourceLink })`** — navigating the **current** page, not opening a new one.
5. **`navigatePageTo`** (`PagesLifecycleModel.ts:644`) — `isVirtualPath` (`includes("://")`) skips the file-exists check; calls `createEditorFromFile(filePath, pipe, target)` → `newEditorModelByTarget` → **`buildEditorById(target, filePath)`** (`:265`).
6. **`buildEditorById`** — for a no-host editor id it switches to a per-editor builder. **`category-view` is exactly this case** (`:294`): `import("../../editors/category/CategoryEditor")` → `mod.default.newEditorModel(filePath)`, which **decodes the virtual link** and seeds the model:
   ```ts
   newEditorModel: async (filePath?: string) => {
       const model = new CategoryEditorModel();
       if (filePath) { const link = decodeCategoryLink(filePath); if (link) model.initFromLink(link); }
       return model;
   }
   ```

**Git-tree rides this exact pipeline.** A `git-tree://<repoRoot>` URL + a parser (mirroring `tree-category://`) + a new `buildEditorById` case (mirroring `category-view`) is the entire open path — **zero new page/lifecycle methods**. Because navigation is keyed to the Explorer's `pageId`, the same repo opened from Explorer in two different pages yields two independent Git Tree editors (duplicates across pages — Decision F, per user).

### Standalone (no-host) editor pattern — mirror **Category** / **Settings** / **MCP Inspector**

| Concern | Reference | What to do for `git-tree` |
|---------|-----------|---------------------------|
| Editor model | `editors/settings/SettingsEditor.ts`, `editors/category/CategoryEditorModel.ts` | `GitTreeEditorModel extends EditorModel<GitTreeEditorState>`, `editorId = "git-tree"`, `noLanguage = true`, `skipSave = true`. State carries `repoRoot`. |
| Legacy module (`newEditorModel(filePath)` decodes the link) | `editors/category/CategoryEditor.tsx:182` | `newEditorModel(filePath)` → `decodeGitTreeLink(filePath)` → set `repoRoot` + title. Plus `newEmptyEditorModel`/`newEditorModelFromState`/`Editor` for contract completeness. |
| `index.tsx` (`*Module` + re-exports + `default`) | `editors/settings/index.tsx`, `editors/storybook/index.tsx` | `gitTreeModule: EditorModule = { createEditor, Component }`; re-export model/state; `export { default } from "./GitTreeEditorView"`. |
| Registry entry | `register-editors.ts:362` (`category-view`), `:318` (settings) | `editorRegistry.register({ id:"git-tree", name:"Git Tree", hasContentHost:false, accepts:()=>-1, loadModule:()=>import("./git-tree") })`. `accepts:()=>-1` — never auto-matched to a file; only reached via the `git-tree://` target. |
| `buildEditorById` case | `PagesLifecycleModel.ts:294` (`category-view`) | Add `case "git-tree": { const mod = await import("../../editors/git-tree"); return mod.default.newEditorModel(filePath); }`. |
| Editor-id / editor-type unions | `api/types/common.d.ts:51` (`EditorView`), `shared/types.ts:1` (`EditorType`) | Add `"git-tree"` to `EditorView`; add `"gitTreePage"` to `EditorType`. |
| Restore-across-restart set | `PagesPersistenceModel.ts:29` (`NO_HOST_EDITOR_IDS`, includes `category-view`) | Add `"git-tree"` — restores via `createEditor` + `Object.assign(state)`; the persisted `repoRoot` in state rebuilds it. |

### Explorer `.git` detection — `FileTreeProvider`

- **`FileTreeProvider.list()`** (`content/tree-providers/FileTreeProvider.ts:43`) builds folder `ILink`s. It uses `nodefs`/`path` directly (sanctioned exception) — fits the cheap `.git` marker check.
- **`FileTreeProvider.getNavigationUrl(item)`** (`:124`) returns `encodeCategoryLink(...)` for any directory today; we special-case the verified `.git` item to return `git-tree://<repoRoot>`.
- **`ILink`** (`api/types/io.tree.d.ts:104`) has `target?` but no icon field; the icon is resolved by **`TreeProviderItemIcon`** (`isDirectory → <FolderIcon/>`). We add an optional `icon` hint and check it first.

---

## Design decisions (resolved in this investigation)

| # | Decision | Rationale |
|---|----------|-----------|
| **A** | The editor is a **standalone no-host editor** (`hasContentHost:false`, `accepts:()=>-1`), parameterized by `repoRoot`, reached only via the `git-tree://` target. | It renders a repo, not a file/buffer — same category as Category View / Settings / MCP Inspector. |
| **B** | The `.git` click **navigates the current page** through the **existing `openRawLink → openLink → openContent → navigatePageTo` pipeline** (Explorer passes `pageId`), exactly like folder → `category-view`. Open path = a `git-tree://` parser (mirrors `tree-category://`) + a `buildEditorById` case (mirrors `category-view`). | Reuses proven in-page navigation; **no new page/lifecycle method**. Matches the user's requirement: navigate the current page, do not open a new tab. |
| **C** | `.git` verified by a **cheap synchronous marker heuristic** in `list()` — `existsSync(join(gitPath,"HEAD")) && existsSync(join(gitPath,"objects"))` — **gated by `git.enabled`**. No git spawn per listing. | EPIC-030 Concern 2B; distinguishes a real repo from a coincidentally-named folder. When `git.enabled` is off the check is skipped (no behavior change). |
| **D** | `repoRoot` = **parent directory of the `.git` folder** = the `dirPath` being listed. | Simple and correct for standard repos. (Worktree/submodule `.git` *files* are out of scope — Concern 2, recorded in the epic.) |
| **E** | Add an optional **`icon?: string` semantic hint to `ILink`**; set `icon:"git"` on the verified item; `TreeProviderItemIcon` renders **`GitIcon`** (theme/icons.tsx) when `item.icon === "git"`. | EPIC-030 Concern 2B chose "icon hint over renderer special-case" — reusable, no `.git`-name sniffing in the view. |
| **F** | **In-page navigation, not a singleton.** Clicking `.git` replaces the current page's editor with the Git Tree editor. The same repo opened from the Explorer in **multiple pages** yields **independent Git Tree editors (duplicates across pages allowed)**. | Per user (2026-06-06). Falls out of the navigation pipeline for free — navigation is keyed to the Explorer's `pageId`, with no global de-dup. |
| **G** | **Load on mount; a `<PageToolbar>` with a single manual Refresh button.** The button re-runs `git.log(repoRoot)`. | Per user (Concern 4). Reactive/auto-refresh on repo changes stays post-v1; manual refresh covers "I committed in a terminal, reload". |
| **H** | **Error body** when git is unavailable: on mount, if `git.probe()` reports not-installed (or `git.enabled` off), render a centered message instead of the component. An empty-but-valid repo renders the component with zero rows (not an error). | EPIC-030 Concern 4 graceful degradation; distinguishes "git missing" from "repo has no commits". |
| **I** | **"Load more" pagination** via a new pass-through `extraElement?: ReactNode` prop on `AVGrid` → `RenderGrid.extraElement`. `git.log` gains `skip`; the editor accumulates contiguous 200-commit pages; `<GitTree>` renders a Load-more button (as `extraElement`) while `hasMore`. | Per user (Concern 5). The `extraElement` slot already exists in `RenderGrid`; AVGrid just needs to forward a caller-supplied node (today it only fills it from the internal add-row button). Reusable for any future AVGrid consumer. |

---

## Implementation plan

### Step 1 — Type unions

- **`src/renderer/api/types/common.d.ts`** (`EditorView`, ~`:51`): add `| "git-tree"`.
- **`src/shared/types.ts`** (`EditorType`, `:1`): add `| "gitTreePage"`.

### Step 2 — `git-tree://` link scheme — `src/renderer/content/git-tree-link.ts` (NEW)

Mirror `tree-provider-link.ts`; lives in `content/` so both `FileTreeProvider` and `parsers.ts` import it without crossing layers:

```ts
export const GIT_TREE_PREFIX = "git-tree://";

/** Encode a repo root as a git-tree:// URL (base64 so any path/char is safe). */
export function encodeGitTreeLink(repoRoot: string): string {
    return GIT_TREE_PREFIX + btoa(JSON.stringify({ repoRoot }));
}

/** Decode a git-tree:// URL back to its repo root, or null if invalid. */
export function decodeGitTreeLink(raw: string): { repoRoot: string } | null {
    if (!raw.startsWith(GIT_TREE_PREFIX)) return null;
    try { return JSON.parse(atob(raw.slice(GIT_TREE_PREFIX.length))); }
    catch { return null; }
}
```

### Step 3 — Editor model — `src/renderer/editors/git-tree/GitTreeEditorModel.ts` (NEW)

Mirror `SettingsEditor.ts` + `CategoryEditorModel.ts`:

```ts
import { EditorModel, type EditorStateBase } from "../base/EditorModel";

export interface GitTreeEditorState extends EditorStateBase {
    type: "gitTreePage";
    /** Absolute repo top-level (parent of the .git folder). */
    repoRoot: string;
}

export const getDefaultGitTreeEditorState = (): GitTreeEditorState => ({
    id: crypto.randomUUID(), // editor instance id — keys page.editors[]; MUST be non-empty (mainEditorInstance treats falsy id as "no main editor")
    title: "Git Tree",
    modified: false,
    type: "gitTreePage",
    editor: "git-tree",
    repoRoot: "",
});

export class GitTreeEditorModel extends EditorModel<GitTreeEditorState> {
    readonly editorId = "git-tree";
    noLanguage = true;
    skipSave = true;

    /** Seed repoRoot + title from a decoded git-tree:// link. */
    initFromRepoRoot(repoRoot: string): void {
        const folder = repoRoot.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || "Git";
        this.state.update((s) => { s.repoRoot = repoRoot; s.title = `${folder} — Git`; });
    }
}
```

### Step 4 — Editor view — `src/renderer/editors/git-tree/GitTreeEditorView.tsx` (NEW)

- `useComponentModel(model)` (copy import/usage from `StorybookEditorView.tsx`) to read `repoRoot`.
- A `load()` callback: `const probe = await git.probe();` then `const commits = await git.log(repoRoot);`. Hold `commits`, `loading`, `gitOk` (= `probe.installed`) in local state. Call it on mount / `repoRoot` change.
- **Toolbar (Decision G):** render `<PageToolbar model={model} borderBottom>` (mirror `CategoryEditor.tsx:129`) containing one `<IconButton name="git-tree-refresh" size="sm" title="Refresh" icon={<RefreshIcon/>} onClick={load} />` (from `uikit/IconButton`, `RefreshIcon` from `theme/icons`). Disable it while `loading`.
- Body render: `!settings.get("git.enabled") || gitOk === false` → centered `<GitUnavailable/>` message (Emotion, theme tokens only); loading → minimal placeholder; else → fill with `<GitTree commits={commits} compact={false} />`. (Toolbar stays visible in all three states.)
- Legacy `EditorModule` default export (mirror `editors/category/CategoryEditor.tsx:182`):
  ```ts
  const gitTreeEditorModule: EditorModule = {
      Editor: GitTreeEditorView as unknown as EditorModule["Editor"],
      newEditorModel: async (filePath?: string) => {
          const model = new GitTreeEditorModel(new TComponentState(getDefaultGitTreeEditorState()));
          if (filePath) { const link = decodeGitTreeLink(filePath); if (link) model.initFromRepoRoot(link.repoRoot); }
          return model as unknown as EditorModel;
      },
      newEmptyEditorModel: async (t: EditorType) => t === "gitTreePage"
          ? new GitTreeEditorModel(new TComponentState(getDefaultGitTreeEditorState())) as unknown as EditorModel : null,
      newEditorModelFromState: async (state) => new GitTreeEditorModel(
          new TComponentState({ ...getDefaultGitTreeEditorState(), ...(state as Partial<GitTreeEditorState>) }),
      ) as unknown as EditorModel,
  };
  export default gitTreeEditorModule;
  ```

> **UIKit Rule 7:** `editors/git-tree/` is app code — Emotion is fine for the view's own chrome (error body, layout); pass only props to `<GitTree>`.

### Step 5 — `index.tsx` — `src/renderer/editors/git-tree/index.tsx` (NEW)

Mirror `editors/settings/index.tsx`: `gitTreeModule: EditorModule = { createEditor, Component }` (`createEditor` for the persistence-restore path); re-export model/state; `export { default as gitTreeEditorModule, default } from "./GitTreeEditorView"`.

### Step 6 — Register the editor — `src/renderer/editors/register-editors.ts`

After the `category-view` block (`:362`):
```ts
editorRegistry.register({
    id: "git-tree",
    name: "Git Tree",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { gitTreeModule } = await import("./git-tree");
        return gitTreeModule;
    },
});
```

### Step 7 — `buildEditorById` case — `src/renderer/api/pages/PagesLifecycleModel.ts:294`

Add alongside `category-view`:
```ts
case "git-tree": {
    const mod = await import("../../editors/git-tree");
    return mod.default.newEditorModel(filePath);
}
```
(No `showGitTreePage`, no `PagesModel`/`pages.d.ts`/`PageCollectionWrapper` changes — navigation reuses the file-open pipeline.)

### Step 8 — `git-tree://` parser — `src/renderer/content/parsers.ts`

Add to `registerRawLinkParsers()`, mirroring the `tree-category://` parser at `:67` (forward to `openLink`, do **not** open a page directly):
```ts
// git-tree:// parser — repo history view; navigates the current page (EPIC-030 / US-612)
app.events.openRawLink.subscribe(async (data) => {
    if (!data.href.startsWith(GIT_TREE_PREFIX)) return;
    data.url = data.href;
    data.target ??= "git-tree";
    data.handled = false;
    await app.events.openLink.sendAsync(data);
    data.handled = true;
});
```
(Import `GIT_TREE_PREFIX` from `./git-tree-link`.)

### Step 9 — `.git` detection + redirect — `src/renderer/content/tree-providers/FileTreeProvider.ts`

1. Import `settings` (`../../api/settings`) and `encodeGitTreeLink` (`./git-tree-link`). Add a gated marker check:
   ```ts
   private isGitRepoDir(gitPath: string): boolean {
       if (!settings.get("git.enabled")) return false;
       try {
           return nodefs.existsSync(path.join(gitPath, "HEAD"))
               && nodefs.existsSync(path.join(gitPath, "objects"));
       } catch { return false; }
   }
   ```
2. In `list()`, in the `isDir` branch, when `entry.name === ".git"` and `this.isGitRepoDir(fullPath)`, set `target: "git-tree"` and `icon: "git"` on the folder item.
3. In `getNavigationUrl(item)`, before the existing directory branch:
   ```ts
   if (item.target === "git-tree") return encodeGitTreeLink(path.dirname(item.href)); // repoRoot = parent of .git
   ```
   (`getNavigationUrlByHref` needs no change — the redirect only originates from a live `list()` item carrying `target`.)

### Step 10 — `ILink.icon` + Explorer icon — `io.tree.d.ts` + `TreeProviderItemIcon.tsx`

1. **`api/types/io.tree.d.ts`** (`ILink`, after `target?`): `/** Optional semantic icon hint (e.g. "git") overriding the default folder/file icon. */ icon?: string;`
2. **`GitIcon` — DONE (2026-06-06).** Added to `src/renderer/theme/icons.tsx` (code-branch glyph, `currentColor`). No new icon file.
3. **`components/tree-provider/TreeProviderItemIcon.tsx`**: import `GitIcon` from `../../theme/icons`; before the `isDirectory` branch:
   ```ts
   if (item.icon === "git") return <GitIcon width={16} height={16} />;
   ```

### Step 11 — AVGrid `extraElement` pass-through — `src/renderer/uikit/AVGrid/`

1. **`model/AVGridModel.ts`** (`AVGridProps<R>`, after `growToWidth` `:67`): add
   ```ts
   /** Caller-supplied node rendered after the last row (forwarded to RenderGrid.extraElement).
    *  Ignored when `onAddRows` is set (the internal add-row button wins). */
   extraElement?: React.ReactNode;
   ```
2. **`AVGrid.tsx`** (`:256`): after the `if (model.props.onAddRows) { … }` block, fall back to the prop:
   ```ts
   extraElement = extraElement ?? model.props.extraElement;
   ```
   (No other change — it's already passed to `RenderGridStyled extraElement={extraElement}` at `:300`.)

> This is an additive UIKit prop, not a new primitive — pure pass-through to an existing `RenderGrid` slot. No story change required, but exercising it via the Git Tree story (US-611) is a free regression check.

### Step 12 — `git.log` `skip` — `src/ipc/git-ipc.ts` + `src/main/git-service.ts`

1. **`git-ipc.ts`** (`GitLogOptions`): add `/** Skip the first N commits (pagination). */ skip?: number;`.
2. **`git-service.ts`** `log()`: when `opts.skip` is set, push `\`--skip=${opts.skip}\`` into the args (alongside the existing `--max-count`). `git log --topo-order --skip=N --max-count=M` returns the contiguous next window. (`api.gitLog` / `git.log` already forward the whole `opts` object — no renderer change.)

### Step 13 — `<GitTree>` load-more props — `src/renderer/components/git-tree/GitTree.tsx` (US-611, modify)

Add to `GitTreeProps`:
```ts
/** Called when the user clicks "Load more" (only rendered when hasMore). */
onLoadMore?: () => void;
/** More history is available beyond the loaded commits. */
hasMore?: boolean;
/** A load-more fetch is in flight (button shows a loading label, disabled). */
loadingMore?: boolean;
```
Build a load-more node and pass it to AVGrid only when `hasMore`:
```tsx
const loadMore = hasMore ? (
    <LoadMoreRow data-type="git-tree-load-more" onClick={loadingMore ? undefined : onLoadMore}>
        {loadingMore ? "Loading…" : "Load more"}
    </LoadMoreRow>
) : undefined;
// …
<AVGrid … extraElement={loadMore} />
```
`LoadMoreRow` = a small Emotion-styled clickable row (theme tokens / `color.*` only — `components/` is app code, so Emotion on its *own* element is allowed; only `extraElement` (a ReactNode) is passed to AVGrid, never `style`/`className`). Compact mode unaffected.

### Step 14 — Editor pagination state — `GitTreeEditorView.tsx` (extends Step 4)

Replace the single `load()` with paged state:
```ts
const PAGE = 200;
// local state: commits, loading (initial), loadingMore, hasMore, gitOk
const reload = async () => { /* probe; git.log(repoRoot, { maxCount: PAGE }); set commits; hasMore = list.length === PAGE */ };
const loadMore = async () => {
    // git.log(repoRoot, { maxCount: PAGE, skip: commits.length });
    // append; hasMore = list.length === PAGE
};
```
- Mount / `repoRoot` change → `reload()`. Toolbar **Refresh** → `reload()` (resets to page 1).
- **Selection (Concern 6):** track `selectedHash` in local state; pass `selectedHash` + `onSelectCommit={setSelectedHash}` to `<GitTree>` — row highlight only, no detail pane.
- Pass `commits`, `hasMore`, `loadingMore`, `onLoadMore={loadMore}` to `<GitTree>`.

---

## Concerns / open questions

- **Concern 1 — `GitIcon` style. ✅ RESOLVED (2026-06-06).** A downloaded **code-branch** SVG (svgrepo "code-branch-solid", CC0) was added as **`GitIcon`** in `src/renderer/theme/icons.tsx` via `createIcon(32)` with `fill="currentColor"` (theme-safe; no hardcoded color). Already in the tree + typecheck-clean. Implementation just imports it in `TreeProviderItemIcon`.

- **Concern 2 — entry point covers standard repos only (`.git` is a directory). ✅ RESOLVED (2026-06-06) — out of scope of this epic.** Worktrees/submodules use a `.git` *file* (`gitdir:` pointer) and won't match the marker; they get no Explorer entry point. The File-Diff switch still works for files inside them (US-610 `rev-parse`). Recorded in EPIC-030 Out-of-scope.

- **Concern 3 — open behavior. ✅ RESOLVED (2026-06-06).** Per user: clicking `.git` in the Explorer **navigates the current page** to the Git Tree editor (not a new tab), via the existing in-page navigation pipeline. The same folder open in **multiple pages** → each page opens its **own** Git Tree editor (duplicates across pages allowed). No singleton / page-reuse logic.

- **Concern 4 — refresh affordance. ✅ RESOLVED (2026-06-06).** Per user: include a **manual Refresh button on the editor toolbar** (`<PageToolbar>` + `<IconButton icon={<RefreshIcon/>}>` re-running `git.log`). Reactive/auto-refresh on repo changes stays post-v1.

- **Concern 5 — pagination / "load more". ✅ RESOLVED (2026-06-06) — implement it.** Per user: add a **"Load more" button at the bottom of the grid** via a new pass-through `extraElement` prop on `AVGrid` (forwarded to `RenderGrid.extraElement`, where the internal add-row button already renders). `git.log` gains a `skip` option; the editor pages contiguous windows and the `<GitTree>` component renders the button when more history remains. See Decision I + Steps 11–14.
  - **Page size:** load **200** commits per page (snappier first paint than 500; tunable). `hasMore` = "the last page came back full" (`length === pageSize`).
  - **Correctness:** `--topo-order` is a stable total order for a fixed repo, so `--skip=N --max-count=200` returns a contiguous next window; concatenating pages yields exactly what one larger `git log` would, so the swimlane layout (re-run over the accumulated array) stays correct. If the repo changes between pages, Refresh resets cleanly (acceptable for v1 manual paging).

- **Concern 6 — selection / click behavior. ✅ RESOLVED (2026-06-06) — local highlight only.** Per user: the editor tracks the clicked commit's hash in local view state and passes it to `<GitTree selectedHash … onSelectCommit … />`, so the row highlights. **No commit-detail pane in v1** — the selection has no further effect (a detail pane is a post-v1 task).

---

## Acceptance criteria

- [x] `git-tree` editor is registered (`hasContentHost:false`, `accepts:()=>-1`); `"git-tree"` ∈ `EditorView`, `"gitTreePage"` ∈ `EditorType`, `"git-tree"` ∈ `NO_HOST_EDITOR_IDS`.
- [x] With `git.enabled` **on**, a real repo's `.git` folder in the Explorer shows the git icon; clicking it **navigates the current page** (does not open a new tab) to a **Git Tree** view titled `<folder> — Git` rendering the repo's real history via the US-611 component. *(Tab also carries the git icon via `getIcon`.)*
- [x] The same repo's `.git` opened from the Explorer in two different pages produces two independent Git Tree editors (per-page duplicates allowed). *(By design — navigation is keyed to the Explorer's `pageId` with no global de-dup.)*
- [x] With `git.enabled` **off**: the `.git` folder behaves exactly as today (plain folder, no icon, navigates into the folder); no git spawns; no marker checks. *(Gated `isGitRepoDir`.)*
- [x] The editor toolbar shows a **Refresh** button (right edge) that re-runs `git.log(repoRoot)` from page 1 and updates the view (disabled while loading).
- [x] When more than one page (200) of history exists, **"Load more · Load all"** renders pinned at the bottom of the grid; "Load more" appends the next contiguous page, "Load all" loads the full history; the swimlane graph stays continuous and the footer disappears at the end.
- [x] `AVGrid` renders a caller-supplied `extraElement` below the last row; existing AVGrid consumers (add-row button) are unaffected.
- [x] Clicking a commit row highlights it; cell focus + **range selection + copy** (Ctrl+C / Shift+C) work; no detail pane (v1).
- [x] Git installed-but-fails / not on PATH → the editor body shows a graceful "Git is unavailable" message (never throws); an empty repo renders the component with zero rows. *(Implemented via `git.probe()`; degradation path by design.)*
- [x] A persisted Git Tree page restores across restart from its `repoRoot` (via the `NO_HOST_EDITOR_IDS` path), degrading to the error body if git is unavailable at restore time. *(Implemented; restore path by design.)*
- [x] `npm run lint` and typecheck clean. App compiles & runs; nothing changes with `git.enabled` off.

---

## Post-implementation notes (deltas from the plan, 2026-06-06)

Found during testing — recorded for the epic close-out review:

1. **Editor instance id must be non-empty.** `getDefaultGitTreeEditorState` now uses `crypto.randomUUID()` (not `""`). `PageModel.mainEditorInstance` treats a falsy `id` as "no main editor", so an empty id rendered a blank page. (Matches MCP Inspector.)
2. **Grid fill needs a column-flex wrapper.** `RenderGrid`'s root is `flex: 1 1 auto` with a `height: 100` fallback — in a `row` parent the 100px wins. The editor body Panel (and the Storybook wrapper) are `direction="column"` so the grid fills the page.
3. **Horizontal scrollbar.** Dropped `fitToWidth` from the component's `<AVGrid>` (`fitToWidth` → `overflowX: hidden`). Resized columns now scroll horizontally like the Grid editor.
4. **Load-more footer is `position: absolute; bottom: 0`** (full-width, opaque bg) — the render area is `position: relative` with absolutely-positioned cells, so a normal-flow element collapsed behind row 0. Two links: **"Load more · Load all"**.
5. **"Load all".** Added per user. `git-service.log()` treats `maxCount <= 0` as *no limit* (omits `--max-count`); the editor's `loadAll` re-fetches the entire history from HEAD and replaces the list. (`--max-count=0` means "show 0 commits", which was the initial bug.) `GitLogOptions.skip` was added for "Load more" paging.
6. **Tab icon.** `GitTreeEditorModel.getIcon` returns `<GitIcon>`, so the page tab shows the git glyph.
7. **Flat rows + copy.** `GitCommitRow` now **`extends GitCommit`** (commit fields spread in by `toCommitRows`) instead of nesting under `.commit` — AVGrid is built for flat rows and range-copy reads `row[key]`. `focus`/`setFocus` are wired (held in `GitTree`) to enable cell focus + range selection + copy; only the graph (`""`) and date (number→string) columns need an explicit `formatValue`.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/api/types/common.d.ts` | Add `"git-tree"` to `EditorView` |
| `src/shared/types.ts` | Add `"gitTreePage"` to `EditorType` |
| `src/renderer/content/git-tree-link.ts` | **New** — `git-tree://` encode/decode + `GIT_TREE_PREFIX` |
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | **New** — model + state (`id: crypto.randomUUID()`) + `initFromRepoRoot` + `getIcon` (tab icon) |
| `src/renderer/editors/git-tree/GitTreeEditorView.tsx` | **New** — view (`<PageToolbar>` + Refresh button, mounts `<GitTree>`, error/loading body) + legacy `EditorModule` default export (`newEditorModel` decodes the link) |
| `src/renderer/editors/git-tree/index.tsx` | **New** — `gitTreeModule` + re-exports + `default` |
| `src/renderer/editors/register-editors.ts` | Register `git-tree` |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | Add `git-tree` case to `buildEditorById` |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | Add `"git-tree"` to `NO_HOST_EDITOR_IDS` |
| `src/renderer/content/parsers.ts` | Add `git-tree://` parser (forwards to `openLink`) |
| `src/renderer/content/tree-providers/FileTreeProvider.ts` | `.git` marker check (gated) → `target:"git-tree"` + `icon:"git"`; `getNavigationUrl` redirect |
| `src/renderer/api/types/io.tree.d.ts` | Add `icon?: string` to `ILink` |
| `src/renderer/theme/icons.tsx` | **DONE (2026-06-06)** — added `GitIcon` (code-branch glyph, `currentColor`) |
| `src/renderer/components/tree-provider/TreeProviderItemIcon.tsx` | Render `<GitIcon/>` when `item.icon === "git"` |
| `src/renderer/uikit/AVGrid/model/AVGridModel.ts` | Add `extraElement?: React.ReactNode` to `AVGridProps` |
| `src/renderer/uikit/AVGrid/AVGrid.tsx` | Fall back to `model.props.extraElement` when no `onAddRows` |
| `src/ipc/git-ipc.ts` | Add `skip?: number` to `GitLogOptions`; `maxCount: 0` = no limit |
| `src/main/git-service.ts` | `log()` pushes `--skip=N`; omits `--max-count` when `max <= 0` (load-all) |
| `src/renderer/editors/git-tree/GitTreeEditorView.tsx` | (also) Refresh on the right; `loadMore`/`loadAll` pagination; local selection |
| `src/renderer/components/git-tree/swimlane-layout.ts` | **(US-611, modify)** `GitCommitRow extends GitCommit` (flat rows); `toCommitRows` spreads `...commit` |
| `src/renderer/components/git-tree/GitTree.tsx` | **(US-611, modify)** flat-field access; `onLoadMore`/`onLoadAll`/`hasMore`/`loadingMore` + Load-more/all `extraElement`; `focus`/`setFocus` for range-copy; per-column `formatValue` only where needed |

### Files needing NO changes
- `src/renderer/components/git-tree/BranchTreeCell.tsx`, `index.ts` — unchanged (`BranchTreeCell` reads only `.node`/`.edges`, unaffected by the flatten).
- `src/renderer/api/git.ts`, `src/ipc/api-types.ts`, `src/ipc/main/controller.ts`, `src/ipc/renderer/api.ts` — these forward the whole `GitLogOptions` object generically, so `skip`/`maxCount:0` flow through with no edits. (Only `git-ipc.ts` + `git-service.ts` change.)
- `src/renderer/uikit/RenderGrid/**` — `extraElement` slot already exists; only AVGrid's forwarding changes.
- `src/renderer/content/resolvers.ts`, `open-handler.ts` — the virtual-path branch + `pageId` navigation already handle `git-tree://` exactly as `tree-category://`; no edits.
- `src/renderer/api/pages/PagesModel.ts`, `api/types/pages.d.ts`, `scripting/api-wrapper/PageCollectionWrapper.ts` — **no** `showGitTreePage`; navigation reuses the file-open pipeline.
- `src/renderer/editors/base/editorRegistry.ts` — `git-tree` registers through the existing `register()` API.
