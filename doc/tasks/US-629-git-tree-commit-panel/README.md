# US-629: Git Tree editor — bottom panel scaffold + "Commit" tab

**Epic:** [EPIC-031: Git Functionality Enhancements](../../epics/EPIC-031.md)
**Status:** Planned (awaiting user review)

## Goal

Add a resizable bottom panel to the **Git Tree editor**, modelled on Git Extensions' bottom pane, with a tab strip ("Commit" / "Diff"). This task delivers the **scaffold** (resizable splitter + tab strip + persisted height/active-tab) and fully implements the **"Commit" tab**, which shows the metadata of the commit currently selected in the commit tree: author + email, date, full hash, ref badges (branches/tags at the commit), and the full commit message. (Parent/child links are intentionally **not** shown — those relationships are already visible in the commit graph.) The **"Diff" tab** is scaffolded as a placeholder here and implemented in **US-630**.

## Background

### Where it goes — `GitTreeEditorView`

The editor body is a thin model-view render (`src/renderer/editors/git-tree/GitTreeEditorView.tsx`). Its current structure:

```tsx
<Panel name="git-tree-editor-root" direction="column" flex={1} overflow="hidden" background="default">
    <PageToolbar …>…</PageToolbar>
    {body}   // <Panel direction="column" flex={1} height={0}><GitTree …/></Panel>
</Panel>
```

The selected commit is **already tracked** in this view as local state (line 30):

```tsx
const [selectedHash, setSelectedHash] = useState<string | undefined>(undefined);
…
<GitTree model={model.gitTree} selectedHash={selectedHash} onSelectCommit={setSelectedHash} … />
```

`GitTree` (`src/renderer/components/git-tree/GitTree.tsx`) is **controlled**: it fires `onSelectCommit(hash)` on row click and highlights `selectedHash`. There is no separate selection model to wire — the hash is enough; the full row is read from `model.gitTree.state.get().commits`.

### Commit row data already in memory

Each loaded commit (`GitCommit`, `src/ipc/git-ipc.ts:65`) carries: `hash`, `shortHash`, `subject`, `authorName`, `authorDate` (epoch ms), `refs: GitRef[]` (branch/tag/HEAD decorations **at** the commit). So date, hash, subject, and ref badges need **no** new backend. (Parent/child are deliberately not surfaced in this tab — see Goal.)

**Missing from `GitCommit`:** author *email* and the full commit *message body* (only `subject`, the first line, is loaded). These are the only backend additions in this task.

### UIKit primitives to compose with (all confirmed present)

| Primitive | File | Role here |
|-----------|------|-----------|
| `Splitter` | `src/renderer/uikit/Splitter/Splitter.tsx` | `orientation="horizontal"`, `side="after"` — resizable divider between the commit grid (above) and the bottom panel (below). Controlled `value`/`onChange` (px). |
| `SegmentedControl` | `src/renderer/uikit/SegmentedControl/SegmentedControl.tsx` | Tab strip. Controlled `value` + `onChange`; `items: {value,label}[]`; `size="sm"`. (There is no dedicated Tabs component — this is the canonical tab strip.) |
| `Panel` | `src/renderer/uikit/Panel/Panel.tsx` | Flex layout. Use `shrink={false}` + fixed `height` for the bottom panel; `flex={1}` + `height={0}` for fill regions. |
| `Text` | `src/renderer/uikit/Text` | Labels / values. |

**Reference implementation** — the "Changes" secondary view already does an in-editor `Splitter` split with persisted height: `src/renderer/editors/git-tree/GitChangesSecondaryView.tsx:151` (horizontal splitter, `side="after"`, `border="before"`, height in `useState`, `ResizeObserver` for initial sizing). Mirror its pattern.

### Persistence pattern (US-623)

`GitTreeEditorState` (`GitTreeEditorModel.ts:18`) already round-trips `columnLayout` through the page descriptor via bound setters (`setColumnLayout`). Add `bottomPanelHeight` and `bottomPanelTab` the same way so the panel size + active tab survive navigation-away/back and app restart.

## Implementation plan

### 1. Backend — add author email + lazy full-message fetch

**`src/ipc/git-ipc.ts`** — add `authorEmail` to `GitCommit`:

```ts
export interface GitCommit {
    hash: string;
    shortHash: string;
    parents: string[];
    subject: string;
    authorName: string;
    authorEmail: string;   // NEW — from %ae
    authorDate: number;
    refs: GitRef[];
}
```

**`src/main/git-service.ts`**:

- Extend `LOG_FORMAT` (line 57) to include `%ae` right after `%an`:
  ```ts
  const LOG_FORMAT = ["%H", "%P", "%s", "%an", "%ae", "%at", "%D"].join(FIELD_SEP) + RECORD_SEP;
  ```
- Update `parseLog` (line 88) destructure + push:
  ```ts
  const [hash, parentField, subject, authorName, authorEmail, at, decorations] = line.split(FIELD_SEP);
  …
  out.push({ hash, shortHash: hash.slice(0, 7), parents, subject: subject ?? "",
             authorName: authorName ?? "", authorEmail: authorEmail ?? "",
             authorDate: Number(at) * 1000 || 0, refs: parseDecorations(decorations ?? "") });
  ```
- Add a lazy full-message getter (the panel fetches it only for the selected commit, so the log payload stays lean):
  ```ts
  /** Full commit message (subject + body) for one commit. "" when absent / git
   *  unavailable. Never throws. Used by the Git Tree "Commit" panel (US-629). */
  export async function commitMessage(dir: string, hash: string): Promise<string> {
      try {
          return (await simpleGit(dir).raw(["show", "-s", "--format=%B", hash])).trimEnd();
      } catch {
          return "";
      }
  }
  ```

**IPC wiring** for `commitMessage` (follow the existing `gitShow` pattern exactly):
- `src/ipc/api-types.ts` — add `gitCommitMessage = "gitCommitMessage"` to the `Endpoint` enum + `[Endpoint.gitCommitMessage]: (dir: string, hash: string) => Promise<string>;` to the `Api` type.
- `src/ipc/main/controller.ts` — add handler `gitCommitMessage = async (_e, dir, hash) => { const { commitMessage } = await import("../../main/git-service"); return commitMessage(dir, hash); };` and `bindEndpoint(Endpoint.gitCommitMessage, controllerInstance.gitCommitMessage);` in `init()`.
- `src/renderer/api.ts` (renderer api class) — `gitCommitMessage = async (dir: string, hash: string) => executeOnce<string>(Endpoint.gitCommitMessage, dir, hash);`.

**`src/renderer/api/git.ts`** — add gated wrapper (mirror `show`):
```ts
commitMessage(repoRoot: string, hash: string): Promise<string> {
    if (!settings.get("git.enabled") || !repoRoot || !hash) return Promise.resolve("");
    return api.gitCommitMessage(repoRoot, hash).catch((): string => "");
},
```

### 2. Persist panel height + active tab in editor state

**`src/renderer/editors/git-tree/GitTreeEditorModel.ts`**:

- Extend `GitTreeEditorState` (line 18):
  ```ts
  /** Bottom panel height in px (US-629). Undefined → default. */
  bottomPanelHeight?: number;
  /** Active bottom-panel tab (US-629). Undefined → "commit". */
  bottomPanelTab?: "commit" | "diff";
  ```
- Add bound setters next to `setColumnLayout` (line 125):
  ```ts
  setBottomPanelHeight = (h: number): void => { this.state.update((s) => { s.bottomPanelHeight = h; }); };
  setBottomPanelTab = (t: "commit" | "diff"): void => { this.state.update((s) => { s.bottomPanelTab = t; }); };
  ```

### 3. Insert the bottom panel in the editor view

**`src/renderer/editors/git-tree/GitTreeEditorView.tsx`** — the commit-grid `body` stays in a `flex={1}` region; add a `Splitter` + bottom `Panel` **after** it, **inside** the existing `git-tree-editor-root` column. Only render the panel when there are commits (skip during the error / initial-loading placeholders). The panel is capped at **80% of the root container's height** so it can never crowd out the grid on short windows — measure the root with a `ResizeObserver` (mirror `GitChangesSecondaryView.tsx:54-73`) and clamp both the `Splitter max` and the rendered height. Sketch:

```tsx
const DEFAULT_PANEL_H = 240;
const rootRef = useRef<HTMLDivElement>(null);
const [containerH, setContainerH] = useState(0);
useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setContainerH(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
}, []);
const { bottomPanelHeight, bottomPanelTab } = model.state.use((s) => ({
    bottomPanelHeight: s.bottomPanelHeight, bottomPanelTab: s.bottomPanelTab,
}));
const maxH = containerH > 0 ? Math.round(containerH * 0.8) : Infinity;       // 80% cap
const panelH = Math.min(bottomPanelHeight ?? DEFAULT_PANEL_H, maxH);         // clamp persisted/default
const tab = bottomPanelTab ?? "commit";
…
return (
    <Panel ref={rootRef} name="git-tree-editor-root" direction="column" flex={1} overflow="hidden" background="default">
        <PageToolbar …>…</PageToolbar>
        {body}
        {gitOk && hasCommits && (
            <>
                <Splitter name="git-tree-bottom-splitter" orientation="horizontal"
                          value={panelH} onChange={model.setBottomPanelHeight}
                          side="after" border="before" min={120} max={maxH} />
                <Panel name="git-tree-bottom-panel" direction="column"
                       shrink={false} height={panelH} minHeight={120} maxHeight={maxH} overflow="hidden">
                    <Panel name="git-tree-bottom-tabs" direction="row" align="center"
                           paddingX="sm" paddingY="xs" shrink={false} background="light" borderBottom>
                        <SegmentedControl name="git-tree-bottom-tab-select" size="sm"
                            value={tab} onChange={(v) => model.setBottomPanelTab(v as "commit" | "diff")}
                            items={[{ value: "commit", label: "Commit" }, { value: "diff", label: "Diff" }]} />
                    </Panel>
                    <Panel direction="column" flex={1} height={0} overflow="hidden">
                        {tab === "commit" && (
                            <CommitInfoPanel repoRoot={model.state.get().repoRoot}
                                gitTree={model.gitTree} selectedHash={selectedHash} />
                        )}
                        {tab === "diff" && (
                            // US-630 fills this in. Placeholder for now.
                            <Panel padding="md" align="center" justify="center" flex={1}>
                                <Text color="light">Diff view — coming in US-630.</Text>
                            </Panel>
                        )}
                    </Panel>
                </Panel>
            </>
        )}
    </Panel>
);
```

### 4. New `CommitInfoPanel` component

**New file:** `src/renderer/editors/git-tree/CommitInfoPanel.tsx`. Presentational (mirrors the existing view-layer precedent where `selectedHash` lives in the view). Props: `{ repoRoot: string; gitTree: GitTreeModel; selectedHash?: string }`.

Behaviour:
- Read the loaded commits: `const commits = gitTree.state.use((s) => s.commits);`
- Resolve the selected commit: `const commit = commits.find(c => c.hash === selectedHash);`
- Lazy-fetch the full message on selection change:
  ```tsx
  const [message, setMessage] = useState("");
  useEffect(() => {
      let live = true;
      if (!commit) { setMessage(""); return; }
      void git.commitMessage(repoRoot, commit.hash).then((m) => { if (live) setMessage(m); });
      return () => { live = false; };
  }, [repoRoot, commit?.hash]);
  ```
- Empty state when no `commit`: `<Text color="light">Select a commit to see its details.</Text>`.
- Layout — a scrollable details block (`overflow="auto"`), label/value rows for **Author** (`authorName <authorEmail>`), **Date** (formatted from `authorDate`), **Commit hash** (full `hash`), ref badges (reuse the existing decoration rendering — see `BranchTreeCell.tsx` / `GitStatusBadge.tsx` for styling cues), and the full **message** below (monospace, preserve newlines via `white-space: pre-wrap`). No parent/child rows — those relationships live in the commit graph.
- Date formatting: use the same locale formatting the filtered-list datetime column uses (US-618) for consistency — check `src/renderer/components/git-tree/` for an existing `formatGitDate`-style helper before adding one.

## Concerns / Open questions

1. **"Contained in branches / tags" + "Derives from tag" lines — RESOLVED: out of scope, not building.** The Git Extensions screenshot shows three extra lines below the message (*Contained in branches*, *Contained in [no] tag*, *Derives from tag: vX + N commits*). These would need extra git calls (`git branch --contains`, `git tag --contains`, `git describe`). **Decision (user, 2026-06-10): do NOT implement these — show only data already on hand** (author/date/hash/parents/children/refs/message). No follow-up task is planned; if ever wanted, it would be a separate task created on demand. This keeps the feature light, not a Git Extensions clone.
2. **Parent/child — RESOLVED: not shown.** (Decision, user, 2026-06-10.) The commit graph already makes these relationships visible, so the tab omits them entirely. This also removes the "children beyond the loaded window" limitation that a derived child list would have had.
3. **Always-visible vs collapsible — RESOLVED: always visible.** (Decision, user, 2026-06-10.) The bottom pane is always on, resizable, with `min={120}`. No collapse/restore toggle.
4. **Default height + 80% cap — RESOLVED.** (Decision, user, 2026-06-10.) Default `DEFAULT_PANEL_H = 240px`, persisted after first user resize. The panel is additionally capped at **80% of the root container height** (`maxH = round(containerH * 0.8)`), applied to both `Splitter max` and the bottom `Panel`'s `height`/`maxHeight`, so on a short window the grid is never crowded out. Requires a `ResizeObserver` on the editor root (see step 3 sketch + `GitChangesSecondaryView.tsx:54-73`). *Impl note:* if `Panel` doesn't forward `ref`, attach the observer the same way `GitChangesSecondaryView` does (it already measures its container).
5. **Selection persistence — RESOLVED: not persisted.** (Decision, user, 2026-06-10.) `selectedHash` stays view-local — after navigate-away/back the panel starts empty until the user clicks a commit.

## Files Changed

| File | Change |
|------|--------|
| `src/ipc/git-ipc.ts` | Add `authorEmail` to `GitCommit`. |
| `src/main/git-service.ts` | `%ae` in `LOG_FORMAT`; parse `authorEmail`; new `commitMessage(dir, hash)`. |
| `src/ipc/api-types.ts` | `gitCommitMessage` endpoint + `Api` signature. |
| `src/ipc/main/controller.ts` | `gitCommitMessage` handler + `bindEndpoint`. |
| `src/renderer/api.ts` | `gitCommitMessage` executor. |
| `src/renderer/api/git.ts` | Gated `commitMessage` wrapper. |
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | `bottomPanelHeight` + `bottomPanelTab` state + bound setters. |
| `src/renderer/editors/git-tree/GitTreeEditorView.tsx` | Splitter + bottom panel + SegmentedControl tab strip; mount `CommitInfoPanel`; Diff placeholder. |
| `src/renderer/editors/git-tree/CommitInfoPanel.tsx` | **New** — commit metadata + message renderer. |

### Files that need NO changes
- `GitTree.tsx` / `GitTreeModel.ts` — selection (`selectedHash` + `onSelectCommit`) already exists; commits already loaded with parents/refs.
- `Splitter.tsx`, `SegmentedControl.tsx`, `Panel.tsx`, `Text` — used as-is.
- `git.show` and the existing log/status endpoints — unchanged.

## Acceptance criteria

- [ ] The Git Tree editor shows a resizable bottom panel below the commit grid, with "Commit" and "Diff" tabs.
- [ ] Dragging the divider resizes the panel; the height persists across navigation-away/back and app restart.
- [ ] The active tab persists the same way.
- [ ] Selecting a commit in the tree updates the "Commit" tab to that commit's author (name + email), date, full hash, ref badges, and full message.
- [ ] With no commit selected, the panel shows an empty-state hint.
- [ ] The "Diff" tab shows a placeholder (implemented in US-630).
- [ ] All behaviour is gated behind the "Git integration" setting and degrades gracefully when git is unavailable (no thrown errors).
