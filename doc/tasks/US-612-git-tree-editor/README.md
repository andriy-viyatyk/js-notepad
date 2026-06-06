# US-612: Git Tree editor + Explorer `.git` entry point

**Epic:** [EPIC-030 — Git Integration](../../epics/EPIC-030.md)
**Status:** Investigated — plan ready for review (2026-06-06). Not started.
**Depends on:** US-610 (git service + IPC + `git.enabled` setting + `git.detectRepoForFile`/`probe`) — **done**; US-611 (Git Tree component + `git.log`) — **done**.
**Consumed by:** nothing (leaf v1 task; US-613 File Diff is independent and reuses US-611's component directly).

---

## Goal

Register a **`git-tree` editor** — a standalone (non-content-host) full-tab editor that mounts the US-611 `<GitTree>` component, fed by `git.log(repoRoot)` — and wire its **entry point**: clicking the repo's **`.git` folder in the Explorer** opens the Git Tree editor for that repo. Both are gated by the off-by-default `git.enabled` setting (EPIC-030 D6 / Concern 4); when git is unavailable the editor body shows a graceful error message.

This is the "*very simple* Git Tree editor — essentially just the component" of the locked v1 scope (EPIC-030 Initial Scope #2, Concern 1).

---

## Background — what already exists and what to build on

### US-611 component (mount target) — `src/renderer/components/git-tree/`

`<GitTree commits={GitCommit[]} selectedHash? onSelectCommit? compact? name? />` (`GitTree.tsx`). Presentational: caller fetches commits, the component runs the swimlane layout and renders an `AVGrid`. Exported from `components/git-tree/index.ts` along with `GIT_TREE_ROW_HEIGHT`. The editor passes `compact={false}` and the full commit list.

### Data layer (already wired, US-611) — `src/renderer/api/git.ts`

```ts
git.log(repoRoot: string, opts?: GitLogOptions): Promise<GitCommit[]>  // [] when git.enabled off / unavailable; never throws
git.probe(): Promise<GitProbeResult>   // { installed, version? } — used to decide the error body
git.detectRepoForFile(filePath): Promise<GitRepoInfo | null>           // not needed here (entry point uses a marker heuristic)
```

US-612 is the **first end-to-end exercise of the real `git.log` path** (US-611 verified it only against a synthetic DAG in Storybook).

### Standalone (no-host) editor pattern — mirror **MCP Inspector** / **Settings** / **Storybook**

A `git-tree` editor is a no-content-host, parameterized standalone editor. The closest analog is **MCP Inspector** (parameterized by `url`); Settings/Storybook are the singleton analogs. The pattern, per file:

| Concern | Reference | What to do for `git-tree` |
|---------|-----------|---------------------------|
| Editor model | `editors/settings/SettingsEditor.ts`, `editors/mcp-inspector/McpInspectorEditorModel.ts` | `GitTreeEditorModel extends EditorModel<GitTreeEditorState>`, `editorId = "git-tree"`, `noLanguage = true`, `skipSave = true`. State carries `repoRoot`, `branch`. |
| Legacy module (`newEmptyEditorModel` / `newEditorModelFromState` / `Editor`) | `editors/storybook/StorybookEditorView.tsx:84` (default export) | A `git-tree` legacy `EditorModule` default-exported from the View file, gated on `editorType === "gitTreePage"`. |
| `index.tsx` (named `*Module` + re-exports + `default`) | `editors/storybook/index.tsx`, `editors/settings/index.tsx` | `gitTreeModule: EditorModule = { createEditor, Component }`; re-export model/state/ids; `export { default } from "./GitTreeEditorView"`. |
| Registry entry | `register-editors.ts:351` (storybook), `:318` (settings) | `editorRegistry.register({ id:"git-tree", name:"Git Tree", hasContentHost:false, accepts:()=>-1, loadModule:()=>import("./git-tree") })`. `accepts: () => -1` — never auto-selected; only opened explicitly. |
| Open method | `PagesLifecycleModel.ts:1002` (`showMcpInspectorPage`) | `showGitTreePage({ repoRoot, branch? })` — create model, set `repoRoot`/`branch` on state, get-or-focus per-repo page, `addPage`. Surface on `PagesModel` + `pages.d.ts` + `PageCollectionWrapper` (script API parity, like the others). |
| Editor-id / editor-type unions | `api/types/common.d.ts:51` (`EditorView`), `shared/types.ts:1` (`EditorType`) | Add `"git-tree"` to `EditorView`; add `"gitTreePage"` to `EditorType`. |
| Restore-across-restart set | `PagesPersistenceModel.ts:29` (`NO_HOST_EDITOR_IDS`) | Add `"git-tree"` so a persisted git-tree page restores via `createEditor` + `Object.assign(state)`. `newEditorModelFromState` rebuilds it from the persisted `repoRoot`. |

`showMcpInspectorPage` (exact shape to copy):
```ts
showMcpInspectorPage = async (options?: { url?: string }): Promise<void> => {
    const mcpModule = await import("../../editors/mcp-inspector");
    const model = await mcpModule.default.newEmptyEditorModel("mcpInspectorPage");
    if (model) {
        if (options?.url) model.state.update((s) => { (s as unknown as { url?: string }).url = options.url; });
        this.addPage(wrap(model));
    }
};
```

### Explorer entry point — the open pipeline (already in place)

Tree click flow (verified): `ExplorerSecondaryView.tsx:60` → `model.treeProvider.getNavigationUrl(item)` → `app.events.openRawLink.sendAsync(createLinkData(url, …))`. The `openRawLink` parsers (`content/parsers.ts`) are the routing hook — each detects a prefix and either forwards to `openLink` or (for `git-tree`) opens a page directly and sets `data.handled = true`.

- **`FileTreeProvider.list()`** (`content/tree-providers/FileTreeProvider.ts:43`) builds `ILink` folder items. It uses `nodefs`/`path` directly (sanctioned exception) — perfect for the cheap `.git` marker check.
- **`FileTreeProvider.getNavigationUrl(item)`** (`:124`) currently returns `encodeCategoryLink(...)` for any directory (navigates *into* it). We special-case the verified `.git` item to return a `git-tree://` URL instead.
- **`ILink`** (`api/types/io.tree.d.ts:104`) has `target?: string` but **no icon field**. The Explorer icon is resolved by **`TreeProviderItemIcon`** (`components/tree-provider/TreeProviderItemIcon.tsx`): `isDirectory → <FolderIcon/>` (an emoji, `components/icons/FileIcon.tsx:21`). We add an optional `icon` hint to `ILink` and check it first.
- **`encodeCategoryLink`/`decodeCategoryLink`** (`content/tree-providers/tree-provider-link.ts`) is the precedent for a base64-of-JSON link scheme; the `tree-category://` parser (`parsers.ts:67`) is the precedent for a prefix parser. The `git-tree://` scheme + parser mirror both.

---

## Design decisions (resolved in this investigation)

| # | Decision | Rationale |
|---|----------|-----------|
| **A** | The editor is a **standalone no-host editor** (`hasContentHost:false`, `accepts:()=>-1`), parameterized by `repoRoot` in its state. Opened only via `showGitTreePage` — never auto-matched to a file. | It renders a repo, not a file/buffer; identical category to MCP Inspector / Settings / Storybook. |
| **B** | Entry point routes through a **`git-tree://<repoRoot>` URL + an `openRawLink` parser** that calls `showGitTreePage` and stops the pipeline (`handled=true`). | Reuses the existing tree-click → `getNavigationUrl` → `openRawLink` path with zero new plumbing; mirrors the `tree-category://` parser. A non-content editor must not flow through the content pipe layers (resolvers/open-handler). |
| **C** | `.git` verified by a **cheap synchronous marker heuristic** in `list()` — `existsSync(join(gitPath,"HEAD")) && existsSync(join(gitPath,"objects"))` — **gated by `git.enabled`**. No git spawn per listing. | EPIC-030 Concern 2B chosen approach; distinguishes a real repo from a coincidentally-named `.git` folder without per-listing git cost. When `git.enabled` is off, the check is skipped entirely (no behavior change). |
| **D** | `repoRoot` = the **parent directory of the `.git` folder** = the `dirPath` being listed (`fullPath = join(dirPath, ".git")`). | Simple and correct for standard repos. (Worktree/submodule `.git` *files* don't match the dir heuristic — out of scope, see Concern 2.) |
| **E** | Add an optional **`icon?: string` semantic hint to `ILink`**; set `icon:"git"` on the verified item; `TreeProviderItemIcon` renders a new `<GitIcon/>` when `item.icon === "git"`. | EPIC-030 Concern 2B chose "icon hint over renderer special-case" — reusable, no `.git`-name sniffing in the view layer. |
| **F** | **Per-repo singleton page** — page id `git-tree:<repoRoot>`; `showGitTreePage` focuses an existing page with that id instead of opening duplicates. | One Git Tree per repo is the natural model; avoids stacking identical tabs. Mirrors `requireWellKnownPage`'s find-or-create (`PagesLifecycleModel.ts:413`) but keyed by repo. |
| **G** | **Load on mount; no toolbar in v1** beyond what the component provides. A small **refresh** affordance is optional and may be deferred. | Concern 1: "the editor is just the component." History is fetched once on mount via `git.log`; reactive auto-refresh is explicitly post-v1 (Out of scope). |
| **H** | **Error body** when git is unavailable: on mount, if `git.probe()` reports not-installed (or `git.enabled` is off), render a centered message ("Git is unavailable — check your installation") instead of the component. An empty-but-valid repo renders the component with zero rows (not an error). | EPIC-030 Concern 4 graceful-degradation requirement; distinguishes "git missing" from "repo has no commits". |

---

## Implementation plan

### Step 1 — Type unions

- **`src/renderer/api/types/common.d.ts`** (`EditorView`, ~`:51`): add `| "git-tree"`.
- **`src/shared/types.ts`** (`EditorType`, `:1`): add `| "gitTreePage"`.

### Step 2 — `git-tree://` link scheme — `src/renderer/content/git-tree-link.ts` (NEW)

Mirror `tree-provider-link.ts`. Keep it in `content/` so both `FileTreeProvider` (content) and `parsers.ts` (content) import it without crossing layers:

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

Mirror `SettingsEditor.ts` + `McpInspectorEditorModel.ts` state factory:

```ts
import { EditorModel, type EditorStateBase } from "../base/EditorModel";

export interface GitTreeEditorState extends EditorStateBase {
    type: "gitTreePage";
    /** Absolute repo top-level (the parent of the .git folder). */
    repoRoot: string;
    /** Branch label for the title, when known. */
    branch?: string;
}

export const getDefaultGitTreeEditorState = (): GitTreeEditorState => ({
    id: "",                 // set to `git-tree:${repoRoot}` by showGitTreePage / fromState
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
}
```

(`EditorStateBase` provides `id/title/modified/editor`; copy the exact import + shape from `SettingsEditor.ts`. Title is set to the repo folder name + " — Git" by `showGitTreePage`.)

### Step 4 — Editor view — `src/renderer/editors/git-tree/GitTreeEditorView.tsx` (NEW)

- `useComponentModel(model)` (the standard editor-view hook — copy the import/usage from `StorybookEditorView.tsx`) to read `repoRoot`/`branch` from state.
- On mount / when `repoRoot` changes: `const probe = await git.probe();` then `const commits = await git.log(repoRoot);`. Hold `commits`, `loading`, and `gitOk` (probe.installed) in local component state.
- Render:
  - `gitOk === false` (or `!settings.get("git.enabled")`) → a centered `<GitUnavailable/>` message (Emotion-styled div, theme tokens only). Concern 4 / Decision H.
  - loading → a minimal spinner/placeholder (reuse an existing loading affordance if one is handy; otherwise a simple "Loading history…").
  - else → fill the body with `<GitTree commits={commits} compact={false} />` (selection is local view state, optional in v1 — `onSelectCommit` may be a no-op since there's no detail pane in v1).
- The legacy `EditorModule` default export at the bottom (mirror `StorybookEditorView.tsx:84`):
  ```ts
  const gitTreeEditorModule: EditorModule = {
      Editor: GitTreeEditorView as unknown as EditorModule["Editor"],
      newEditorModel: async () => new GitTreeEditorModel(new TComponentState(getDefaultGitTreeEditorState())) as unknown as EditorModel,
      newEmptyEditorModel: async (t: EditorType) => t === "gitTreePage"
          ? new GitTreeEditorModel(new TComponentState(getDefaultGitTreeEditorState())) as unknown as EditorModel
          : null,
      newEditorModelFromState: async (state) => new GitTreeEditorModel(
          new TComponentState({ ...getDefaultGitTreeEditorState(), ...(state as Partial<GitTreeEditorState>) }),
      ) as unknown as EditorModel,
  };
  export default gitTreeEditorModule;
  ```

> **UIKit Rule 7:** `editors/git-tree/` is app code — Emotion is fine for the view's own chrome (error body, layout), but pass only props to `<GitTree>` / AVGrid.

### Step 5 — `index.tsx` — `src/renderer/editors/git-tree/index.tsx` (NEW)

Mirror `editors/settings/index.tsx`:
```tsx
import { TComponentState } from "../../core/state/state";
import { GitTreeEditorModel, getDefaultGitTreeEditorState } from "./GitTreeEditorModel";
import { GitTreeEditorView } from "./GitTreeEditorView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function GitTreeEditorComponent({ model }: { model: EditorModel }) {
    return <GitTreeEditorView model={model as GitTreeEditorModel} />;
}
export const gitTreeModule: EditorModule = {
    createEditor: () => new GitTreeEditorModel(new TComponentState(getDefaultGitTreeEditorState())),
    Component: GitTreeEditorComponent,
};
export { GitTreeEditorModel, getDefaultGitTreeEditorState } from "./GitTreeEditorModel";
export type { GitTreeEditorState } from "./GitTreeEditorModel";
export { default as gitTreeEditorModule, default } from "./GitTreeEditorView";
```
(Confirm `editorRegistry.EditorModule` has `createEditor`/`Component` — settings/storybook `index.tsx` both use that exact shape.)

### Step 6 — Register the editor — `src/renderer/editors/register-editors.ts`

After the `storybook-view` block (`:351`):
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

### Step 7 — `showGitTreePage` — `src/renderer/api/pages/PagesLifecycleModel.ts`

Add near `showMcpInspectorPage` (`:1002`). Per-repo singleton (Decision F):
```ts
showGitTreePage = async (options: { repoRoot: string; branch?: string }): Promise<void> => {
    const pageId = `git-tree:${options.repoRoot}`;
    const existing = this.model.query.findPage(pageId);
    if (existing) { this.model.navigation.showPage(pageId); return; }

    const gitTreeModule = await import("../../editors/git-tree");
    const model = await gitTreeModule.default.newEmptyEditorModel("gitTreePage");
    if (!model) return;
    const folder = options.repoRoot.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || "Git";
    model.state.update((s) => {
        const gs = s as unknown as { id: string; title: string; repoRoot: string; branch?: string };
        gs.id = pageId;
        gs.title = `${folder} — Git`;
        gs.repoRoot = options.repoRoot;
        gs.branch = options.branch;
    });
    const page = new PageModel(pageId);
    this.addPage(wrap(model), page);
};
```
(Copy `wrap`, `findPage`, `showPage`, `PageModel`, `addPage` usage verbatim from neighbors. Verify `this.model.query.findPage` / `this.model.navigation.showPage` signatures against `requireWellKnownPage` at `:413` — they're used there identically.)

Then surface it (parity with `showMcpInspectorPage`):
- **`PagesModel.ts`** (~`:263`): `showGitTreePage = (options: { repoRoot: string; branch?: string }) => this.lifecycle.showGitTreePage(options);`
- **`api/types/pages.d.ts`** (~`:104`): `showGitTreePage(options: { repoRoot: string; branch?: string }): Promise<void>;`
- **`scripting/api-wrapper/PageCollectionWrapper.ts`** (~`:125`): thin pass-through (lets scripts/MCP open it; consistent with the others).

### Step 8 — `git-tree://` parser — `src/renderer/content/parsers.ts`

Add a parser in `registerRawLinkParsers()` (mirror the `tree-category://` parser at `:67`, but open a page directly — do **not** forward to `openLink`):
```ts
// git-tree:// parser — opens the Git Tree editor for a repo (EPIC-030 / US-612)
app.events.openRawLink.subscribe(async (data) => {
    const decoded = decodeGitTreeLink(data.href);
    if (!decoded) return;
    const { pagesModel } = await import("../api/pages");   // confirm the export path used elsewhere in content/
    await pagesModel.showGitTreePage({ repoRoot: decoded.repoRoot });
    data.handled = true;
});
```
(Import `decodeGitTreeLink` from `./git-tree-link`. Check how `open-handler.ts` imports `pagesModel` and reuse that exact import.)

### Step 9 — Explorer `.git` detection + redirect — `src/renderer/content/tree-providers/FileTreeProvider.ts`

1. Import `settings` (`../../api/settings`) and the link helper (`./git-tree-link` → `encodeGitTreeLink`). Add a private gated marker check:
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
3. In `getNavigationUrl(item)`: before the existing directory branch, add
   ```ts
   if (item.target === "git-tree") {
       return encodeGitTreeLink(path.dirname(item.href)); // repoRoot = parent of .git
   }
   ```
   (`getNavigationUrlByHref` does not need this — the `.git` redirect only originates from a live `list()` item that carries `target`.)

### Step 10 — `ILink.icon` + Explorer icon — `io.tree.d.ts` + `TreeProviderItemIcon.tsx` + a `GitIcon`

1. **`api/types/io.tree.d.ts`** (`ILink`, after `target?`): `/** Optional semantic icon hint (e.g. "git") overriding the default folder/file icon. */ icon?: string;`
2. **`components/icons/`**: add a small `GitIcon` (decision pending — see Concern 3). Theme-safe (no hardcoded color, or a sanctioned palette/identity color).
3. **`components/tree-provider/TreeProviderItemIcon.tsx`**: at the top of the component, before the `isDirectory` branch:
   ```ts
   if (item.icon === "git") return <GitIcon />;
   ```

---

## Concerns / open questions — NEED USER INPUT

- **Concern 1 — `GitIcon` style.** `FolderIcon` is just an emoji (`📁`). For `.git` we can (a) use an emoji, (b) add a small inline-SVG git glyph. There is no clean git emoji, so an SVG reads best — but git's brand orange (`#F05133`) is a hardcoded color. Options: SVG colored via `currentColor` (theme-neutral), SVG with a sanctioned palette entry, or an emoji. **Proposed: small inline-SVG git glyph using `currentColor`** (theme-safe, recognizable). _Decision needed._

- **Concern 2 — entry point only covers standard repos (`.git` is a directory).** The marker heuristic matches a real `.git` *folder* (HEAD + objects). Git **worktrees** and **submodules** use a `.git` *file* (a `gitdir:` pointer), which won't match — so those won't get the entry point in v1. This matches EPIC-030's "v1 = simple" stance and the File-Diff switch still works for files in them (US-610). **Proposed: accept the limitation for v1, note it in Out-of-scope.** _Confirm._

- **Concern 3 — per-repo singleton page (Decision F).** Opening `.git` for the same repo twice focuses the existing tab rather than stacking duplicates. Alternative: allow multiple Git Tree tabs per repo (like MCP Inspector). **Proposed: per-repo singleton.** _Confirm._

- **Concern 4 — refresh affordance (Decision G).** v1 loads history once on mount. A manual **refresh** button is cheap and genuinely useful (history changes as the user commits in a terminal). **Proposed: include a single small refresh button in the editor; reactive/auto-refresh stays post-v1.** _Decide: include refresh, or strictly "just the component"?_

- **Concern 5 — commit count cap.** `git.log` defaults to `maxCount: 500` (US-611, Concern 7). v1 shows the most recent 500 with no "load more". **Proposed: keep the 500 default, no pagination (deferred).** _Confirm._

- **Concern 6 — selection / click behavior.** v1 has no commit-detail pane, so `onSelectCommit` has nowhere to go. **Proposed: track selection as local highlight only (or omit it) — no detail pane in v1** (matches Concern 1). _Confirm._

---

## Acceptance criteria

- [ ] `git-tree` editor is registered (`hasContentHost:false`, `accepts:()=>-1`); `"git-tree"` ∈ `EditorView`, `"gitTreePage"` ∈ `EditorType`, `"git-tree"` ∈ `NO_HOST_EDITOR_IDS`.
- [ ] With `git.enabled` **on**, a real repo's `.git` folder in Explorer shows a git icon and, when clicked, opens a **Git Tree** tab titled `<folder> — Git` rendering the repo's real history via the US-611 component.
- [ ] Clicking the same repo's `.git` again **focuses** the existing tab (per-repo singleton).
- [ ] With `git.enabled` **off**: the `.git` folder behaves exactly as today (plain folder, no icon, navigates into the folder); no git spawns; no marker checks.
- [ ] Git installed-but-fails / not on PATH → the editor body shows a graceful "Git is unavailable" message (never throws); an empty repo renders the component with zero rows (not an error).
- [ ] A persisted Git Tree page restores across restart from its `repoRoot` (via `newEditorModelFromState`), degrading to the error body if git is unavailable at restore time.
- [ ] `npm run lint` and typecheck clean. App compiles & runs; nothing changes with `git.enabled` off.

---

## Files changed

| File | Change |
|------|--------|
| `src/renderer/api/types/common.d.ts` | Add `"git-tree"` to `EditorView` |
| `src/shared/types.ts` | Add `"gitTreePage"` to `EditorType` |
| `src/renderer/content/git-tree-link.ts` | **New** — `git-tree://` encode/decode + `GIT_TREE_PREFIX` |
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | **New** — model + state + default factory |
| `src/renderer/editors/git-tree/GitTreeEditorView.tsx` | **New** — view (mounts `<GitTree>`, error/loading body) + legacy `EditorModule` default export |
| `src/renderer/editors/git-tree/index.tsx` | **New** — `gitTreeModule` + re-exports + `default` |
| `src/renderer/editors/register-editors.ts` | Register `git-tree` |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | Add `showGitTreePage` (per-repo singleton) |
| `src/renderer/api/pages/PagesModel.ts` | Surface `showGitTreePage` |
| `src/renderer/api/types/pages.d.ts` | Declare `showGitTreePage` |
| `src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts` | Script-API pass-through for `showGitTreePage` |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | Add `"git-tree"` to `NO_HOST_EDITOR_IDS` |
| `src/renderer/content/parsers.ts` | Add `git-tree://` parser → `showGitTreePage`, `handled=true` |
| `src/renderer/content/tree-providers/FileTreeProvider.ts` | `.git` marker check (gated) → `target:"git-tree"` + `icon:"git"`; `getNavigationUrl` redirect |
| `src/renderer/api/types/io.tree.d.ts` | Add `icon?: string` to `ILink` |
| `src/renderer/components/icons/GitIcon.tsx` (or add to `FileIcon.tsx`) | **New** — `GitIcon` (style pending Concern 1) |
| `src/renderer/components/tree-provider/TreeProviderItemIcon.tsx` | Render `<GitIcon/>` when `item.icon === "git"` |

### Files needing NO changes
- `src/renderer/components/git-tree/**` (US-611) — consumed via props only; no edits.
- `src/renderer/api/git.ts`, `src/main/git-service.ts`, `src/ipc/**` — the `git.log`/`probe` data layer is complete from US-610/US-611.
- `src/renderer/content/resolvers.ts`, `open-handler.ts` — the `git-tree://` parser opens the page directly and stops the pipeline; the content-pipe layers are not involved (the editor is host-less).
- `src/renderer/editors/base/editorRegistry.ts` — `git-tree` registers through the existing `register()` API; no engine change.
