# US-676 — Mneme root main view: search with displayed results

**Status:** Implemented — awaiting manual smoke test. Typecheck + lint green.
Filters (tags / dateRange) are split into the follow-up [US-678](../US-678-mneme-search-filters/README.md).
**Epic:** EPIC-032 (Mneme), Phase 4. Builds on [US-663](../US-663-mneme-tree-provider/README.md)
(mneme-root editor + tree provider) and [US-662](../US-662-mneme-provider/README.md) (mneme:// open
path).

## Goal

Replace the placeholder "Mneme" main view of the `mneme-root` editor with a **search view**: a query
input plus a displayed ranked-results list, scoped to the editor's root, opening a result document
via `openRawLink("mneme://{root}/{path}")`. This is the main-editor counterpart to the per-root tree
secondary panel — reachable via the new chevron "Open Mneme search" button on the tree panel header.

## Background

### The mneme-root editor (US-663) — current state

- **`MnemeRootEditorModel.ts`** (`src/renderer/editors/mneme-root/`):
  - `editorId = "mneme-root"`, `noLanguage = true`, `skipSave = true`, `showBackgroundOrnament = true`,
    `treeProvider: MnemeTreeProvider | null`, `_statusSub`.
  - State `MnemeRootEditorState extends EditorStateBase` (lines 13–24):
    ```ts
    type: "mnemeRootPage";
    rootFolder: string;   // absolute OS path of the root folder
    rootName: string;     // resolved root name ("TestWiki"); empty until resolved
    resolving: boolean;   // true while wiki_list_roots call is in flight
    error?: string;       // not registered / not connected
    ```
  - `rootName` is resolved by the private `resolveRoot()` (line 134): it calls `wiki_list_roots`,
    matches `r.folder` against `state.rootFolder` (case-insensitive), and writes `s.rootName` +
    `s.title`. Empty until that async call returns.
  - Accesses the shared MCP connection via `mnemeConnection.getClient()`
    (`src/renderer/api/mneme-connection.ts`) — returns `Client | null` (null when not connected).
  - Subscribes to `mnemeConnection.onStatusChange` via `ensureStatusSub()` (line 125) and retries
    `resolveRoot()` when the connection comes up; `_statusSub` is cleared in `dispose()`. It does
    **not** use `mnemeStatusModel` and does **not** poll. The shared connection auto-reconnects.
- **`MnemeRootEditorView.tsx`** — the placeholder (lines 19–27): a centred column with `<Text
  size="lg">Mneme</Text>` and an optional `rootName` line. This is what we replace.

### wiki_search MCP tool

No TypeScript wrapper exists — calls go through the raw client pattern (mirror `resolveRoot()`'s
`wiki_list_roots` call at `MnemeRootEditorModel.ts` lines 146–151):

```ts
const client = mnemeConnection.getClient();
if (!client) { /* not connected */ }
const result = await client.callTool(
    { name: "wiki_search", arguments: { query, subtree: rootName, topK: 20 } },
    undefined,
    { timeout: 15_000 },
);
const data = parseToolResult<WikiSearchResult>(result);
```

`parseToolResult<T>` lives in `src/renderer/editors/mneme-config/mnemeTypes.ts` (lines 126–139;
checks `structuredContent`, falls back to `content[0].text` JSON) — already imported by the model.

**Request args** (from US-655 / EPIC-032 docs): `query: string`, `mode?: "text" | "vector" |
"hybrid"` (default hybrid; degrades to text until the embedding model is provisioned), `subtree?:
"{root}"` (scope to one root — just the root name, no path), `tags?`, `excludeTags?`, `dateRange?:
{from?, to?}` (ISO `YYYY-MM-DD`), `topK?` (default 10), `ext?` (default `.md`).

**Result shape:**

```ts
interface WikiSearchResult {
    results: WikiSearchHit[];
    note?: string;   // present when vector/hybrid degraded to text
}
interface WikiSearchHit {
    uri:     string;   // "mneme://{root}/{path}" — directly openable
    title:   string;
    tags:    string[];
    snippet: string;
    score:   number;   // bm25(); results already ranked — DO NOT re-sort
}
```

### Opening a result

`hit.uri` is already a full `mneme://{root}/{path}` URL, routed by the mneme:// parser/resolver
(US-662). Mirror the tree view's open (`MnemeTreeSecondaryView.tsx` lines 40–42):

```ts
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";

void app.events.openRawLink.sendAsync(
    createLinkData(hit.uri, { pageId: model.page?.id, sourceId: model.id }),
);
```

### UI precedent + constraints

- Closest precedent: `src/renderer/components/file-search/FileSearch.tsx` + `FileSearchModel.ts`
  (debounced input via `debounce` from `src/shared/utils.ts`, virtualized `RenderGrid` results).
- **Emotion is NOT allowed in `src/renderer/editors/`** (uikit/CLAUDE.md Rule 7 — Emotion only under
  `src/renderer/ui/`). Express all layout through UIKit `Panel` props. Use `Input`
  (`uikit/Input`, `tone="accent"`), `Panel`, `Text`, `Spinner`, `Tag`, `IconButton`.
- With `topK: 20`, a plain `.map()` over a scrolling `Panel` is sufficient; `RenderGrid` is not
  required for v1.

## Implementation plan

### 1. Search types (`MnemeRootEditorModel.ts`, top of file)

Add `WikiSearchHit` / `WikiSearchResult` interfaces (above the state interface). Keep them local to
the model file for now (no shared types churn).

### 2. Extend editor state (`MnemeRootEditorState`)

Add transient search fields (none persisted — `skipSave = true`; also reset them in any
`getRestoreData()`/state-init path so a restored page starts clean):

```ts
searchQuery: string;                          // current input text
searchMode: "text" | "vector" | "hybrid";     // search mode (default "hybrid")
searching: boolean;                           // a wiki_search call is in flight
results: WikiSearchHit[];                     // last result set (already ranked; render in order)
searchNote?: string;                          // degraded-mode note from the tool
searchError?: string;                         // "Not connected" / call failure
hasSearched: boolean;                         // false until first search → drives initial vs "no results"
```

Add defaults in `getDefaultMnemeRootEditorState()`: `searchQuery: ""`, `searchMode: "hybrid"`,
`searching: false`, `results: []`, `hasSearched: false`.

### 3. Search actions (`MnemeRootEditorModel.ts`)

- `setQuery(q: string)` — write `s.searchQuery = q`. (No auto-search — explicit submit only,
  Concern 1.)
- `setMode(mode: "text" | "vector" | "hybrid")` — write `s.searchMode = mode`. (Does not auto-run;
  takes effect on the next `runSearch()`.)
- `async runSearch()` — guard on empty `searchQuery.trim()` and on `rootName` (still resolving →
  no-op). Set `searching = true`, clear `searchError`. Get `client = mnemeConnection.getClient()`;
  if null → `searchError = "Mneme is not connected"`, `searching = false`, return. Call `wiki_search`
  with `{ query, mode: s.searchMode, subtree: rootName, topK: 20 }` (timeout 15 s),
  `parseToolResult<WikiSearchResult>`, write `results`, `searchNote = data?.note`,
  `hasSearched = true`. On throw → `searchError` + empty results. Always clear `searching` in a
  `finally`.
- `openResult(uri: string)` — `wiki_search` returns `uri` **scheme-less** (`{root}/{path}`, e.g.
  "TestWiki/work/docker.md"), so prepend `mneme://` before navigating (otherwise the parser rejects
  it with "Invalid file path"). Then `app.events.openRawLink.sendAsync(createLinkData(href, {
  pageId: this.page?.id, sourceId: this.id }))`.

### 4. Replace the view (`MnemeRootEditorView.tsx`)

Rebuild as a column `Panel` (UIKit props only — no Emotion):

1. **Search bar** (`Panel direction="row" gap="sm" padding="md" align="start"`):
   - **Query input — `Textarea` (`uikit/Textarea`), NOT `Input`.** Use **`singleLine`** (the user's
     "multiline off"): Enter is suppressed and pasted newlines stripped, but the text still **wraps
     and grows vertically** — useful for long semantic-search queries. Bind `value={searchQuery}`,
     `onChange={model.setQuery}`, `placeholder={`Search ${rootName}…`}`, `flex={1}`, a `minHeight`
     (~1 row) and a `maxHeight` (~5 rows, then scroll). `onKeyDown`: on `Enter` (no Shift) call
     `e.preventDefault(); model.runSearch()` — because `Textarea`'s caller `onKeyDown` runs **before**
     its internal `singleLine` Enter-suppression and `preventDefault()` takes ownership.
   - **Mode combobox — `Select` (`uikit/Select`).** Items `[{label:"Hybrid",value:"hybrid"},
     {label:"Text",value:"text"},{label:"Vector",value:"vector"}]`, `value` mapped from
     `searchMode`, `onChange` → `model.setMode(item.value)`. Small fixed `width`. Default selection
     = Hybrid. (Concern 2 — needed for testing.)
   - **Search button** — a `Button`/`IconButton` (`SearchIcon`) calling `model.runSearch()`.
   - Disable the input + Search button + Select while `resolving` or `searching`.
2. **Status strip** (conditional): `Spinner` + "Searching…" while `searching`; `searchError` in
   `Text color="error"`; `searchNote` (degraded mode) in `Text color="light"`.
3. **Results** (scroll `Panel flex={1}`, `height={0}` so it fills without overflow — see
   `[[feedback_uikit_panel_height_zero]]`): `model.results.map()` → one row each: title (bold),
   snippet (light), tags as small `Tag`s, then the **document path as a `Text variant="link"`**
   (after the tags). **Only the path link navigates** (`onClick` → `model.openResult(hit.uri)`); the
   row itself is not clickable. Render in result order — **do not sort by score**.
4. **Empty/initial states:** `hasSearched && results.length === 0 && !searching` → "No results";
   `!hasSearched` → a short hint ("Type a query and press Enter"); `!rootName` → "Connecting…".

Subscribe with `model.state.use(...)` for `searchQuery`, `searching`, `results`, `searchNote`,
`searchError`, `hasSearched`, `rootName`, `resolving`, `error`.

### 5. Wire-up check

`index.tsx` / `MnemeRootEditorView`'s `EditorModule` already register the editor — no registry
change. The new chevron button on the tree panel header (added in this same change set) promotes the
editor to main, surfacing this view. No new connection/poll lifecycle — `getClient()` at query time
is enough.

## Concerns / open questions

1. **Search trigger — RESOLVED:** explicit submit only — **Enter** (no Shift) **and** a **Search
   button**. No search-as-you-type (vector/hybrid is a heavy MCP round-trip). The query field is a
   **`Textarea` with `singleLine`** so long queries wrap and the control grows vertically while Enter
   still submits.
2. **Search mode exposure — RESOLVED:** include a **mode combobox** (`Select`) with
   `Hybrid`/`Text`/`Vector`, **Hybrid selected by default**. The user needs all modes to test Mneme.
   Still surface the tool's degraded `note` when present.
3. **Filter surface (tags / dateRange) — RESOLVED:** **deferred to follow-up
   [US-678](../US-678-mneme-search-filters/README.md)** (mode combobox stays here; only the filter UI
   moves out). To be implemented right after US-676 so Mneme can be tested fully.
4. **Result row content & density — ACCEPTED:** title + path + snippet + tags. Snippet-match
   highlighting is out of scope for v1.
5. **Relationship to the config editor / global header — RESOLVED:** no relationship. This view is
   strictly per-root (scoped via `subtree: rootName`); independent of the singleton `mneme-config`
   editor.

## Acceptance criteria

- [ ] The `mneme-root` editor main view shows a **search input + ranked results list** (placeholder
      "Mneme" view gone).
- [ ] The query input is a **`Textarea` (`singleLine`)** that wraps/grows for long queries;
      **Enter** and a **Search button** both run the search.
- [ ] A **mode combobox** (`Select`: Hybrid/Text/Vector) is present with **Hybrid** selected by
      default, and its value is passed as `mode` to `wiki_search`.
- [ ] Search is scoped to the editor's root (`subtree: rootName`) and renders results **in tool
      order** (no client-side score sort).
- [ ] Each result row shows the document path as a **link after the tags**; clicking the link opens
      the document via `openRawLink("mneme://{root}/{path}")` (scheme prepended) on the current page.
      The row itself does not navigate.
- [ ] Loading, empty/initial, degraded-mode (`note`), and not-connected states are all handled.
- [ ] No Emotion in the view — layout is UIKit `Panel` props only.
- [ ] The tree panel header's chevron "Open Mneme search" button promotes this editor to the page's
      main view (delivered alongside this task).
- [ ] `npm run lint` and typecheck pass.

## Files changed (planned)

| File | Change |
|------|--------|
| `src/renderer/editors/mneme-root/MnemeRootEditorModel.ts` | Add `WikiSearchHit`/`WikiSearchResult` types; add search state fields (incl. `searchMode`) + defaults; add `setQuery` / `setMode` / `runSearch` / `openResult`. |
| `src/renderer/editors/mneme-root/MnemeRootEditorView.tsx` | Replace placeholder with search bar (`Textarea singleLine` + mode `Select` + Search button) + status strip + results list (UIKit only). |
| `src/renderer/editors/mneme-root/MnemeTreeSecondaryView.tsx` | **Done in this change set** — chevron "Open Mneme search" button promotes the editor to main. |

Files that need **no** change: `mneme-connection.ts`, `mnemeTypes.ts` (`parseToolResult` reused),
`content/parsers.ts` + `resolvers.ts` (mneme:// already routed), `link-data.ts`, the editor registry.

## Notes

EPIC-032 deferred-review model: stays `[ ]` on the dashboard; `/review`, `/document`, `/userdoc` run
at epic close. Renderer (TS/React) editor — review rules apply.
