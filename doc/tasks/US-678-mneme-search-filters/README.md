# US-678 — Mneme search: tag & date filters

**Status:** Implemented — awaiting manual smoke test. Typecheck + lint green. (Tag pickers use the
`TagsInput` primitive — chips + autocomplete — rather than `MultiSelect`; see Concern 2.)
Follow-up to [US-676](../US-676-mneme-root-search-view/README.md).
**Epic:** EPIC-032 (Mneme), Phase 4.

## Goal

Extend the Mneme root search view (built in US-676) with the remaining `wiki_search` filter inputs —
**tags**, **excludeTags**, and **dateRange** — in a collapsible "Filters" section under the search
bar, so a query can be narrowed by metadata and time. The mode combobox already ships in US-676; this
task adds only the filter surface.

## Background

US-676 delivers the search view in `src/renderer/editors/mneme-root/`:

- **`MnemeRootEditorModel.ts`** — `MnemeRootEditorState` already carries the search fields
  `searchQuery`, `searchMode`, `searching`, `results`, `searchNote?`, `searchError?`, `hasSearched`
  (all transient; `skipSave = true`). `getDefaultMnemeRootEditorState()` seeds them
  (`searchQuery: ""`, `searchMode: "hybrid"`, `searching: false`, `results: []`,
  `hasSearched: false`). `runSearch()` calls `wiki_search` with exactly:
  ```ts
  arguments: { query, mode: searchMode, subtree: rootName, topK: 20 }
  ```
  Mneme calls use the raw `client = mnemeConnection.getClient()` → `client.callTool({ name, arguments
  }, undefined, { timeout })` pattern with `parseToolResult<T>` (from `../mneme-config/mnemeTypes`).
- **`MnemeRootEditorView.tsx`** — column layout: search-bar `Panel` (Textarea + mode `Select` +
  Search `Button`), then a status strip, then the results scroll `Panel`. The Filters section slots
  **between the search-bar Panel and the status strip**.

### `wiki_search` filter arguments (authoritative — confirmed from the live MCP schema)

```
tags?:        string[]                      // doc must carry ALL of these (default [])
excludeTags?: string[]                      // doc must carry NONE of these (default [])
dateRange?:   { from?: string|null,         // inclusive lower bound, ISO YYYY-MM-DD, vs `created`
                to?:   string|null }        // inclusive upper bound
ext?:         string[]                      // RESERVED — only .md is indexed; ignored → omit
```

### `wiki_tags` (tag vocabulary, for the pickers)

```
wiki_tags { subtree?: "{root}" } → { tags: [ { tag: string, count: number }, … ] }
```

Scope with `subtree: rootName` to get the root's tag vocabulary. Mirror `runSearch`'s call pattern.

### Reusable building blocks

- **`TagsInput`** (`src/renderer/uikit/TagsInput/`) — **chosen over `MultiSelect`**. Props:
  `value: string[]`, `onChange: (string[]) => void`, `items?: string[]` (autocomplete vocabulary),
  `placeholder`, `size`, `disabled`, `readOnly`, `tagVariant: "filled" | "outlined"`. Renders the
  selected tags as **removable chips** and offers an inline add-input with autocomplete from `items`
  (dedups on add). `value`/`onChange` are `string[]`, matching the model state exactly — no
  `IListBoxItem` conversion. Free-typing a tag not in the vocabulary is allowed (harmless: an unknown
  tag simply matches nothing). (`MultiSelect` also exists but is list-only with a `"(n) selected"`
  trigger and no chips — a worse fit for this.)
- **No date primitive exists yet** — this task adds one: a small `DateInput` UIKit primitive
  (step 0) wrapping the native date picker behind a string `value`/`onChange` API, so any future
  enhancement (a themed calendar) is centralized in one place. `Input` (`uikit/Input`) already
  forwards `type` via `...rest`, so `DateInput` can compose `Input` with `type="date"` and reuse its
  chrome; native value is an ISO `YYYY-MM-DD` string (`""` when unset).
- **Collapsible pattern** — mirror `mneme-config/RootsPanel.tsx` `RootRow`: a `Button variant="link"`
  toggle ("Filters" / "Hide filters") + chevron, with `{expanded && <FiltersPanel/>}`. Expand state
  is transient view UI → local `useState` in the view (the filter *values* live in model state).
- **Icons** (`theme/icons.tsx`): `ChevronDownIcon` (expanded) / `ChevronRightIcon` (collapsed),
  `CloseIcon` (clear). No generic `FilterIcon` — use the link toggle + chevron; no new icon needed.
- **No Emotion in `editors/`** — layout via UIKit `Panel` props only.

## Implementation plan

### 0. New UIKit primitive `DateInput` (`src/renderer/uikit/DateInput/`)

A thin primitive that wraps the native date picker so the screen consumes a stable UIKit API and any
future enhancement (themed calendar) is a one-place change. Follows the UIKit authoring rules
(`uikit/CLAUDE.md`): `data-type="date-input"` on the root, string value API, `Omit<…>` + spread
`...rest`, tokens/colors only, `name?` → `data-name`.

- **`DateInput.tsx`** — `DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>,
  "style" | "className" | "onChange" | "size" | "value" | "type">` with:
  `name?`, `value: string` (ISO `YYYY-MM-DD` or `""`), `onChange?: (value: string) => void`,
  `disabled?`, `readOnly?`, `size?: "sm" | "md"`, `min?: string`, `max?: string`,
  `width?: number | string`. **Compose the existing `Input` primitive** with `type="date"`
  (reuses chrome/tokens), forwarding `value`/`onChange`/`size`/`disabled`/`min`/`max`/`width` and
  spreading `...rest`. The string `onChange` passes straight through from `Input`.
- **`index.ts`** — re-export `DateInput` + `DateInputProps`.
- **`DateInput.story.tsx`** — minimal story (value/size/disabled controls), matching the UIKit
  storybook convention.
- Export from the UIKit barrel (`src/renderer/uikit/index.ts`).

(Per the "ship a primitive with its first consumer" precedent used for `IconButton.warning` in
US-677 — this primitive is created and immediately consumed by step 3.)

### 1. Extend editor state (`MnemeRootEditorModel.ts`)

Add to `MnemeRootEditorState` (all transient):

```ts
filterTags: string[];        // include — doc must carry all
filterExcludeTags: string[]; // exclude — doc must carry none
dateFrom: string;            // ISO YYYY-MM-DD or "" (unset)
dateTo: string;              // ISO YYYY-MM-DD or "" (unset)
tagVocab: string[];          // available tags for this root (from wiki_tags)
tagVocabLoaded: boolean;     // guards a one-shot lazy load
```

Defaults in `getDefaultMnemeRootEditorState()`: `filterTags: []`, `filterExcludeTags: []`,
`dateFrom: ""`, `dateTo: ""`, `tagVocab: []`, `tagVocabLoaded: false`. (Store tag **names** as
`string[]`; convert to/from `IListBoxItem` in the view.)

### 2. Filter actions (`MnemeRootEditorModel.ts`)

- `setFilterTags(tags: string[])`, `setExcludeTags(tags: string[])`, `setDateFrom(d: string)`,
  `setDateTo(d: string)` — each a one-line `state.update`.
- `clearFilters()` — reset `filterTags`, `filterExcludeTags`, `dateFrom`, `dateTo` to empty.
- `async loadTagVocab()` — guard on `tagVocabLoaded` / no `rootName` / no client; call `wiki_tags`
  with `{ subtree: rootName }`, `parseToolResult<{ tags: { tag: string; count: number }[] }>`, set
  `tagVocab = data.tags.map((t) => t.tag)` and `tagVocabLoaded = true`. Best-effort (swallow errors —
  filters still work via typeahead-less empty list; a failed load just yields no suggestions).
- **Fold filters into `runSearch()`** — build the arguments conditionally so empty filters are
  omitted:
  ```ts
  const { searchQuery, searchMode, rootName, filterTags, filterExcludeTags, dateFrom, dateTo } =
      this.state.get();
  const args: Record<string, unknown> = { query, mode: searchMode, subtree: rootName, topK: 20 };
  if (filterTags.length) args.tags = filterTags;
  if (filterExcludeTags.length) args.excludeTags = filterExcludeTags;
  if (dateFrom || dateTo) args.dateRange = { from: dateFrom || null, to: dateTo || null };
  // … client.callTool({ name: "wiki_search", arguments: args }, …)
  ```

### 3. Filters section (`MnemeRootEditorView.tsx`)

The whole search surface is **one dark toolbar** at default-toolbar density — `Panel
direction="column" gap="sm" background="dark" borderBottom shrink={false} paddingX="sm" paddingY="xs"`
(matches `EditorToolbar`). It contains the search row always, and the filter rows when expanded:

- **Search row** (`Panel direction="row" gap="sm" align="start"`): `Textarea` (flex 1), mode
  `Select`, the **Filters toggle**, then **Search**. The Filters toggle is a `Button` with
  `ChevronRightIcon` (collapsed) / `ChevronDownIcon` (expanded) and label "Filters" (active count
  folded in, e.g. "Filters (2)"). Local `const [filtersOpen, setFiltersOpen] = useState(false)`; on
  open, call `model.loadTagVocab()`.
- **Filter rows** — rendered inside the same toolbar (only when `filtersOpen`), separated from the
  search row by the toolbar's `gap`:
  - **Tags (include):** `TagsInput` — `value={filterTags}`, `onChange={model.setFilterTags}`,
    `items={tagVocab}` (autocomplete), `placeholder="Add tag…"`, `disabled={!rootName}`. Renders
    removable chips.
  - **Tags (exclude):** same wired to `filterExcludeTags` / `setExcludeTags`, with
    `tagVariant="outlined"` to distinguish exclusions.
  - **Date range:** two `DateInput` (step 0) — `value={dateFrom}` `onChange={model.setDateFrom}` and
    `value={dateTo}` `onChange={model.setDateTo}`, with small `Text` "from"/"to" labels.
  - **Clear:** a `Button variant="link"` with `CloseIcon` → `model.clearFilters()`, right-aligned on
    the date row (`justify="between"`), shown only when a filter is active.
- **Behavior:** changing a filter does **not** auto-search; it applies on the next `runSearch()`
  (Enter / Search button), matching the US-676 mode combobox.

### 4. Active-filter count helper (view)

`const activeFilterCount = (filterTags.length ? 1 : 0) + (filterExcludeTags.length ? 1 : 0) +
((dateFrom || dateTo) ? 1 : 0);` — drives the toggle-row indicator and whether "Clear" shows.

## Concerns / open questions

1. **Date input — RESOLVED:** add a `DateInput` UIKit primitive (step 0) wrapping the **native** date
   picker behind a string `value`/`onChange` API. The native calendar popup is browser-rendered (not
   UIKit-themed) for now — acceptable on Electron/Windows — but because the screen consumes
   `DateInput`, any later enhancement (a themed calendar) is a single-file change with no call-site
   churn.
2. **Tag picker — RESOLVED:** `TagsInput` (chips + autocomplete) seeded from `wiki_tags` (scoped to
   `rootName`), chosen over `MultiSelect` because it renders **removable chips**, takes `string[]`
   directly, and allows free-typing. Vocabulary loads **lazily on first filter expand**, not on
   connect.
3. **`wiki_search` filter arg names — RESOLVED:** confirmed against the live MCP schema — `tags:
   string[]`, `excludeTags: string[]`, `dateRange: { from, to }`. (Not `dateAfter`/`dateBefore`.)
4. **`ext` filter — RESOLVED:** omit. The schema marks it reserved/ignored (only `.md` is indexed).
5. **Filter expand state — RESOLVED:** local `useState` in the view (transient UI). Filter *values*
   live in model state so `runSearch` can read them and they survive re-renders.
6. **No `FilterIcon` — RESOLVED:** use the link-style toggle + chevron; no new icon. (Add a funnel
   icon to `icons.tsx` only if later desired.)
7. **dateRange semantics:** filters on the document's `created` date (per the tool), not modified.
   Worth a one-line UI hint ("created date") — minor, can be a tooltip.

## Acceptance criteria

- [ ] A `DateInput` UIKit primitive exists (wraps the native date picker; string ISO value/onChange)
      with an index export, barrel export, and a storybook entry.
- [ ] A collapsible **Filters** section sits under the search bar (toggle with chevron; collapsed by
      default).
- [ ] **Include tags** and **exclude tags** `TagsInput`s (removable chips + autocomplete), seeded
      from `wiki_tags` (scoped to the root, loaded on first expand), feed `tags` / `excludeTags`.
- [ ] **Date from / to** inputs feed `dateRange: { from, to }`; either bound may be set alone.
- [ ] Empty filters are **omitted** from the `wiki_search` payload.
- [ ] Filters apply on explicit submit (Enter / Search), matching the mode combobox UX.
- [ ] Active filters are visibly indicated (count) and **clearable** in one action.
- [ ] No Emotion in the view — UIKit primitives only.
- [ ] `npm run lint` and typecheck pass.

## Files changed (planned)

| File | Change |
|------|--------|
| `src/renderer/uikit/DateInput/DateInput.tsx` | **New primitive** — wraps native `<input type="date">` (composes `Input`); string ISO `value`/`onChange`; `data-type="date-input"`. |
| `src/renderer/uikit/DateInput/index.ts` | Re-export `DateInput` + `DateInputProps`. |
| `src/renderer/uikit/DateInput/DateInput.story.tsx` | Minimal storybook entry. |
| `src/renderer/uikit/index.ts` | Export `DateInput` from the UIKit barrel. |
| `src/renderer/editors/mneme-root/MnemeRootEditorModel.ts` | Add filter + tag-vocab state fields + defaults; `setFilterTags` / `setExcludeTags` / `setDateFrom` / `setDateTo` / `clearFilters` / `loadTagVocab`; fold filters into `runSearch()` arguments. |
| `src/renderer/editors/mneme-root/MnemeRootEditorView.tsx` | Add the collapsible Filters section (toggle + two `TagsInput`s + two `DateInput`s + Clear + active-count) between the search bar and status strip. |

Files that need **no** change: `Input` (consumed as-is by `DateInput`), `TagsInput` (reused),
`mnemeTypes.ts` (`parseToolResult` reused), `mneme-connection.ts`, other UIKit primitives (`Panel`,
`Button`, `Tag`, `Text`), the mneme content parsers/resolvers, the editor registry.

## Notes

EPIC-032 deferred-review model: stays `[ ]` on the dashboard; `/review`, `/document`, `/userdoc` run
at epic close.
