# US-857: Proving-ground Todo board

**Epic:** [EPIC-044 — Board Secondary Views](../../epics/EPIC-044.md) · **Status:** implemented, MCP-verified end-to-end (awaiting user testing)

## Implementation notes (2026-07-15)

Board authored at `C:\projects\persephone-boards\todo` (7 files). Verified live via MCP against `_test/sample.todo.json`:
- Both frames render real content; **Lists & Tags** panel shows correct counts (All 2/3, Work 1/2, Home 1/1).
- **Selection→filter coupling** via `persephone.state.*`: clicking "Work" in the panel filtered the main view cross-frame ("2 of 3 items").
- **Content-host round-trip**: adding an item in the main view propagated to the host, updated the panel's counts live (cross-frame `onContentChange`), and `host.save()` persisted it to disk (4-space JSON, `type:"todo-editor"`).
- **Bidirectional compatibility**: the built-in Todo opens the board-authored file cleanly (all items/comments/tags); the switch shows both "ToDo" and "Todo".
- **Persistence**: `selectedList` survived board reload; `searchText` (non-restorable) did not.
- **No CSP violations** (`ui.log` clean).

**Fixes discovered in testing:**
1. **Handshake timing (Concern 2 resolution).** `persephone.host.getContent()`/`onContentChange()` reject/no-op if called before the board handshake sets `hostEnabled` — and unlike `getFilePath()` they do **not** await it. A board reached via the editor-switch (not default-open) runs `load()` before the handshake, so `getContent()` rejected and the board rendered empty. **Fix:** `await persephone.getFilePath()` first (it resolves when the handshake lands), then wire the host. Documented in the board's `CLAUDE.md` gotchas. The echo-guard behavior (own `setContent` doesn't re-fire own `onContentChange`; the *other* frame does receive it) matched the O3/US-853 design.
2. **`[hidden]` overridden by `display`.** `.root`/`.empty { display:flex }` beat the UA `[hidden] { display:none }`, so `el.hidden = true` didn't hide anything: the secondary frame rendered the *main* role (Lists/Tags pushed below the fold) and the empty-state showed with items present. **Fix:** `[hidden] { display:none !important }`.
3. **Textarea collapsed to `height:0`.** A JS `autoGrow` measured `scrollHeight` before layout. **Fix:** CSS `field-sizing: content`, JS sizing removed.

**Visual-parity styling pass (user request).** Restyled to resemble the built-in Todo editor: inherit board-base.css **monospace** (dropped the sans-serif override), **subtle** selection tint (`color-mix`) instead of a bright fill, sidebar reordered ("New list…" on top, centered LISTS/TAGS headers, "New tag…" pinned at bottom), item **tag chip moved to the right** with a hover-only delete, and a **centered "Done"** divider with rule lines. Also fixed a class-name collision — the empty-tag dot modifier `"empty"` matched the empty-state `.empty` rule (`flex/display/padding`), blowing the dot up to 48px; renamed to `no-color`.

**Verification caveat:** bugs #2/#3 were **visual** and were NOT caught by `browser_snapshot`/`browser_evaluate` (the accessibility tree and the `hidden` *attribute* both looked correct); they surfaced only from the **user's rendered screenshot**. Fixed and re-verified via screenshot. Captured as a self-verification gap in [US-859](../US-859-board-authoring-reliability/README.md) (problem #12).

## Goal

Reimplement the built-in **Todo** editor as a **content-host board with a secondary view**, authored as a real standalone board folder in `C:\projects\persephone-boards\todo` (mirroring the outside-repo `drawio-viewer`). The board renders the todo list in its main view and a **Lists & Tags** panel in a sidebar secondary view, coordinating selection→filter purely through `persephone.state.*` and reading/writing the `.todo.json` file exclusively through `persephone.host.*`. It registers **alongside** the built-in Todo (switch-option-only, `editorPriority: 0`) as the A/B acceptance test for EPIC-044. **The built-in Todo editor is not touched or removed.**

This is the epic's acceptance vehicle: it exercises every seam the epic built — declared secondary views, `persephone.state.*` shared state with opt-in persistence, `persephone.view` role-branching, and the shared content host in every frame.

## Background

### The three reference boards (all verified 2026-07-15)

| Reference | What it proves | Path |
|-----------|----------------|------|
| **drawio-viewer** | The outside-repo **content-host** custom-editor pattern (`fileMasks` + `editorKind: "content-host"` + `editorPriority` + `editorName`; reads content via `persephone.host.*`, never `readFile`; vendors `board-base.css` locally; ships its own `CLAUDE.md`). | `C:\projects\persephone-boards\drawio-viewer\` |
| **demo-board** | **Secondary views + shared state**: manifest `secondaryViews`, one `index.html` branched on `persephone.view`, `persephone.state.init/get/merge/onChange` with `restorableKeys` (main view owns `init`). | `C:\projects\persephone\assets\demo-board\` |
| **built-in Todo** | The exact behavior to reproduce (data shape, filter/sort, selection coupling). | `C:\projects\persephone\src\renderer\editors\todo\` |

The Todo board **combines** the first two axes: a content-host custom editor **and** a board that declares a secondary view.

### The `.todo.json` data model (from the built-in — the on-disk contract to preserve)

The file is JSON: `TodoData` plus a `type: "todo-editor"` discriminator, pretty-printed with **4-space** indent (`src/renderer/editors/todo/TodoEditor.ts:321`):

```jsonc
{
  "type": "todo-editor",
  "lists": ["Work", "Home"],
  "tags": [
    { "name": "urgent", "color": "tomato" },
    { "name": "later",  "color": "" }
  ],
  "items": [
    {
      "id": "b1c2…",              // crypto.randomUUID()
      "list": "Work",             // list name; "" = unassigned
      "title": "Ship the release",
      "done": false,
      "createdDate": "2026-07-12T09:00:00.000Z",   // ISO
      "doneDate": null,           // ISO when done, else null
      "comment": "blocked",       // null = no comment; "" or string = comment shown
      "tag": "urgent"             // tag NAME reference; null = no tag
    }
  ],
  "state": { "b1c2…": { "contentHeight": 64 } }   // per-item UI state, keyed by item.id
}
```

Type definitions live in `src/renderer/editors/todo/todoTypes.ts`:
- `TodoItem = { id, list, title, done, createdDate, doneDate: string|null, comment: string|null, tag: string|null }`
- `TodoTag = { name, color }` — `color` is a value from `TAG_COLORS` (`theme/palette-colors`); `""` = no color.
- `TodoData = { lists: string[]; tags: TodoTag[]; items: TodoItem[]; state: Record<itemId, {contentHeight?}> }`

**Normalization rules the board must reproduce on load** (`TodoEditor.ts:328-421`):
- Empty/blank content → empty `TodoData` (`{lists:[],tags:[],items:[],state:{}}`).
- Dedup `lists` (first wins); dedup `tags` by `name`, drop blank names.
- Per-item: missing `id` → new UUID; `done` strict `=== true`; missing `createdDate` → now; `comment` kept if defined else `null`; `tag || null`.
- **Orphan auto-add**: any `item.list` not in `lists` is appended to `lists`; any `item.tag` not in `tags` is appended as `{name, color:""}`.
- **Single-list auto-select**: if exactly one list exists and none selected, it becomes the selected list.
- On JSON parse error: show an error state and **do not overwrite** the raw content (so a hand-broken file is preserved).

### Filter / sort algorithm (`applyFilters`, `TodoEditor.ts:497-556`)

`filteredItems` derives from `items` given `selectedList`, `selectedTag`, `searchText`:
1. If `selectedList !== ""` → keep `item.list === selectedList`.
2. If `selectedTag !== ""` → keep `item.tag === selectedTag`.
3. `searchText` → multi-word **AND**, each word matched (lowercased) against `title | comment | list | tag`.
4. **Sort**: undone items first (preserving array order), then done items by `doneDate` **descending**.

`listCounts` (`loadListCounts`, `TodoEditor.ts:433-461`): per list `{undone, total}`; the `""` key holds the "All" aggregate.

### Selection coupling (the coordination the epic proves)

In the built-in, `selectedList` and `selectedTag` live on **one** editor-state object shared by the main body and the secondary panel. The secondary panel calls `setSelectedList`/`setSelectedTag` → `applyFilters()` → the main body re-reads `filteredItems`. Selection persists **per-window**, outside the file, via `host.editorSettings["todo-view"]` (it is NOT file content).

**In the board this becomes `persephone.state.*`:** `selectedList` + `selectedTag` (+ transient `searchText`) are shared-state keys; every frame reads them via `state.onChange` and computes its own `filteredItems`/`listCounts` from the parsed data. `selectedList`/`selectedTag` are the **restorable** keys (persist across restart/reload); `searchText` is transient (not restorable), matching the built-in.

### Bridge surface the board uses (from `src/board-shim.ts`)

- `persephone.view` → `"main"` or a secondary view id (here `"lists"`), known synchronously at boot.
- `persephone.host.getContent()` / `setContent(text)` / `onContentChange(cb)` / `getLanguage()` / `save()` — content-host bridge (rejects on a plain board). A frame's **own** `setContent` does not re-fire its `onContentChange` (echo-guarded); **cross-frame** changes DO fire the other frame's `onContentChange` (verified as O3/US-853). Ctrl+S auto-saves via the shim — no board save code needed.
- `persephone.state.init(defaults, {restorableKeys})` / `get()` / `set()` / `merge()` / `onChange(cb)` — shared state; the **main view owns `init`**.
- `persephone.getFilePath()` — for the file-name label only (never for content).
- `persephone.notify(msg, level)` — user-facing toasts (e.g. on write failure).

### How the board is served & trusted (no repo code change)

- `board://` serves **every** file from the board root as-is (`board-protocol-service.ts:211-258`); it injects the `--p-*` palette + boot context + shim into served HTML `<head>`. There is **no** shared `board-base.css` — the board must **vendor its own copy** locally (copy `assets/board-base.css`), exactly as drawio-viewer does.
- The board CSP is `script-src 'self'` / `connect-src 'self'` — **no remote network**. All code is inline or same-origin; the Todo board needs no external libraries.
- For the `*.todo.json` custom-editor association to light up, the board must be **trusted/registered** (custom-editor registry reads trusted boards). The user trusts it once by opening it (`open_board` / the Trust dialog) — same as drawio-viewer. Once trusted, `.todo.json` files show **"Todo"** as a switch option (built-in "ToDo" stays the default because `editorPriority: 0`).

## Implementation plan

All board files are **new**, authored in `C:\projects\persephone-boards\todo\` (outside the Persephone repo). Only the doc/dashboard updates land in the repo.

### Step 1 — Scaffold the board folder

Create `C:\projects\persephone-boards\todo\` with:

```
todo/
  board-manifest.json
  index.html          # main list view + Lists&Tags secondary view (branched on persephone.view)
  app.js              # all logic: parse/serialize + host + shared state + render (both roles)
  style.css           # todo-specific styling (--p-* tokens only, no hardcoded colors)
  board-base.css      # vendored copy of assets/board-base.css
  icon.svg            # board glyph (a checklist icon)
  CLAUDE.md           # board notes (todo-specific; defers generic bridge to read_guide("boards"))
```

Vendor `board-base.css`: `cp C:\projects\persephone\assets\board-base.css C:\projects\persephone-boards\todo\board-base.css`.

### Step 2 — `board-manifest.json`

Combine the content-host editor axis (drawio-viewer) with the secondary-views axis (demo):

```json
{
  "schemaVersion": 1,
  "name": "Todo",
  "description": "Todo list editor (content-host board) with a Lists & Tags sidebar — EPIC-044 proving ground.",
  "author": "Persephone",
  "repository": "",
  "fileMasks": ["*.todo.json"],
  "editorPriority": 0,
  "editorName": "Todo",
  "editorKind": "content-host",
  "secondaryViews": [
    { "id": "lists", "title": "Lists & Tags" }
  ]
}
```

- `editorPriority: 0` → **switch-option-only**; built-in Todo (`acceptFile` priority 20) stays the default editor for `.todo.json`. This is the intended A/B surface (two Todo editors in the switch).
- `editorName: "Todo"` → distinct from built-in "ToDo" on the switch widget.
- One secondary view `lists` (no `html` → served from `index.html`, told apart by `persephone.view`).

### Step 3 — `index.html`

One HTML file serving both roles. Structure:
- `<head>`: `<link rel="stylesheet" href="./board-base.css">` then `<link rel="stylesheet" href="./style.css">`. (The palette/boot/shim are injected by the host before these.)
- `<body>` with **two** top-level containers, exactly one shown per role:
  - `#main-root` — the main list view: a header row (file-name label + search `<input>` + item-count), a quick-add row (`<input>` + Add button), and `#todo-list` (the scrollable item list).
  - `#lists-root` — the Lists & Tags panel: `#lists-section` (New-list input + "All" row + per-list rows) and `#tags-section` ("All Tags" row + per-tag rows + New-tag input).
- `<script src="./app.js"></script>` at end of body.

`app.js` toggles which root is visible based on `persephone.view` (add a `secondary-frame` body class for the `lists` role, mirroring the demo).

### Step 4 — `app.js` (core module, both roles)

Single IIFE. Shared foundation first, then role-branch — mirror the demo's boot shape.

**4a. Boot & role branch**
```js
const P = window.persephone;
const role = (P && P.view) || "main";   // "main" | "lists"
```

**4b. Content model layer (both roles run this)**
- `let data = emptyTodoData();` — cache of the parsed document.
- `parse(text)` → `TodoData` applying **all** normalization rules from Background (dedup, orphan auto-add, per-item normalize, single-list auto-select). Never throws — on JSON error set an `error` flag and keep the last good `data`.
- `serialize(data)` → `JSON.stringify({ type: "todo-editor", lists, tags, items, state }, null, 4)`.
- `async function load()`: `data = parse(await P.host.getContent())`; render. Wrap in try/catch — if `getContent` rejects (plain, non-content-host open) render an empty-state message ("Open a .todo.json file to edit it here.") and return.
- `P.host.onContentChange((text) => { data = parse(text); render(); })` — re-render on any host change (including cross-frame writes). **Guard against clobbering an in-progress edit** (see Concern 1).
- `write()` — `P.host.setContent(serialize(data))`. Discrete mutations (add/toggle/delete/add-list/etc.) call `write()` immediately; free-text edits (title, comment) **debounce** ~300ms (mirrors the built-in's debounced serialize) to avoid a write+re-render per keystroke.

**4c. Shared-state layer**
- **Main only**: `P.state.init({ selectedList: "", selectedTag: "", searchText: "" }, { restorableKeys: ["selectedList", "selectedTag"] });`
- Both roles keep a local `sel = { selectedList: "", selectedTag: "", searchText: "" }` mirror updated from `P.state.onChange((s) => { sel = { ...sel, ...s }; render(); })`.
- Selection/search writes go through `P.state.merge({ ... })` (never mutate `sel` directly — `onChange` is the source of truth, matching the demo).

**4d. Derived helpers (pure, both roles)**
- `filteredItems(data, sel)` — implements the filter+sort algorithm from Background.
- `listCounts(data)` — `{ [listName|""]: {undone, total} }`.

**4e. Mutations (operate on `data`, then `write()`)** — reproduce the built-in method set:
- Items: `addItem(title)` (into `sel.selectedList`; no-op if none selected — disable the quick-add otherwise), `toggleItem(id)` (flip `done`, set/clear `doneDate`), `updateItemTitle(id, v)`, `setItemComment(id, v|null)`, `setItemTag(id, name|null)`, `deleteItem(id)` (confirm).
- Lists: `addList(name)`, `renameList(old, new)` (also rewrite `item.list`), `deleteList(name)` (confirm; reassign or clear items — match built-in), `setSelectedList(name)` → `state.merge`.
- Tags: `addTag(name)`, `renameTag(old, new)` (also rewrite `item.tag`), `setTagColor(name, color)`, `deleteTag(name)` (confirm; clear `item.tag`), `setSelectedTag(name)` → `state.merge`.
- Search: `setSearchText(v)` → `state.merge({searchText})`.

**4f. Render**
- `render()` dispatches on `role`:
  - `main`: file-name label (`P.getFilePath()` basename), search box value, quick-add enabled iff a list is selected, and `#todo-list` = filtered items. Each item row: done checkbox, title (editable), optional comment, tag chip (click → tag menu), created/done date, delete button. Insert a **"Done" separator** before the first done item (matches built-in). Render the item-count footer ("N items" / "M of N items").
  - `lists`: Lists section ("All" + per-list rows with counts + add/rename/delete, highlight `sel.selectedList`), Tags section ("All Tags" + per-tag rows with color dot/picker + add/rename/delete, highlight `sel.selectedTag`).
- Use the `--p-*` tokens for all styling; **no hardcoded colors**. Tag colors come from a local `TAG_COLORS` list (copy the value list from `theme/palette-colors`) rendered as swatches.

**Scope of features to reproduce (this task):** add/toggle/edit-title/comment/tag/delete items; list & tag CRUD + selection; search; filter+sort; done-separator; count badges; selection persistence.
**Deferred (not required for acceptance):** drag-to-reorder items, per-item height persistence (the `state` height map) — these are UI-virtualization niceties from the built-in's `RenderFlexGrid` and are orthogonal to the state/host coordination this proving ground validates. The board still round-trips the `state` map faithfully (parse→serialize) even though it doesn't write heights.

### Step 5 — `style.css`

Todo-specific layout using `--p-*` tokens only (spacing/radius/font/color vars). Include a `.secondary-frame` body-class ruleset that lays out the compact Lists & Tags panel. No hardcoded colors, no remote fonts.

### Step 6 — `icon.svg`

A simple checklist glyph (single-color, uses `currentColor` so it themes). Small, inline-safe.

### Step 7 — `CLAUDE.md` (board notes)

Todo-specific notes only (defer the generic bridge/theme/CSP reference to `read_guide("boards")` + the Demo board), mirroring `drawio-viewer/CLAUDE.md`. Cover: the `.todo.json` shape + `type:"todo-editor"` discriminator, the host round-trip, the `persephone.state.*` selection coupling, `persephone.view` role branch, the debounced-write + re-render-guard decisions, and the run/test loop (`board_refresh` → `browser_snapshot`/`browser_tabs`).

### Step 8 — Repo doc updates (in the Persephone repo)

- `doc/active-work.md` — move US-857 from Planned to **Active** under EPIC-044, linked to this task doc.
- `doc/epics/EPIC-044.md` — the US-857 row already scopes this; refine only if the manifest/priority details drift (it currently says `editorPriority: 0`, switch-option-only — matches).

## Concerns / open questions

1. **Re-render clobbering an in-progress edit (the main authoring risk).** When the `lists` frame writes `data` (e.g. add a list), the `main` frame's `host.onContentChange` fires and re-renders `#todo-list` — which could blow away a title textarea the user is mid-typing, or move the caret. Mitigations to apply: (a) debounce free-text writes so a keystroke doesn't immediately round-trip; (b) on re-render, **skip/patch** the row currently holding focus (check `document.activeElement`) rather than replacing it, mirroring the demo's caret-guard (`if (document.activeElement !== input) input.value = …`); (c) key rows by `item.id` and update in place where practical. A full framework is overkill — a focused-row guard is enough for the proving ground. **Flagged for review.**

2. **A frame's own `setContent` echo vs cross-frame delivery.** The design relies on: my own `setContent` NOT re-firing my `onContentChange` (so `main` doesn't re-render from its own write and self-clobber), while the *other* frame's `onContentChange` DOES fire (so it re-renders). This is the O3 behavior US-853 verified. If in practice the echo-guard suppresses cross-frame delivery too, the `lists` panel would go stale after a `main` write — in that case fall back to also mirroring structural changes (counts) through `persephone.state.*`. **Verify during live testing.**

3. **`editorPriority: 0` vs default.** Confirmed switch-option-only: built-in Todo stays the default for `.todo.json` (its `acceptFile` priority is 20). To open the board editor the user opens a `.todo.json` (built-in) then switches to "Todo". If instead we want the board to be the default, bump `editorPriority` above 20 — **but the epic intent is A/B with the built-in as default**, so keep 0.

4. **Trust/registration flow for testing.** The board is outside the repo and must be trusted before the `.todo.json` association activates. Plan: `open_board("C:\\projects\\persephone-boards\\todo")` (or the Trust dialog) once. Document this in the board's `CLAUDE.md` and in the test steps. No repo code handles this — it's the standard trusted-board flow.

5. **`state` height map fidelity.** The board defers writing per-item `contentHeight`, but must **preserve** any existing `state` map across parse→serialize so switching to the built-in Todo (which uses it) doesn't lose heights. Parse keeps `state` as-is; serialize writes it back untouched.

6. **Final bundling is out of scope.** Per the epic, the board is authored in `persephone-boards/` and validated via the trusted-board flow; shipping it inside the app (e.g. under `boards-assets/` or a create-template) is a **later** decision, not part of US-857.

7. **Confirm-dialog affordance.** The built-in uses confirm dialogs for delete list/tag/item. The board has `P.notify` but confirmation should use a lightweight in-board confirm (e.g. a small inline confirm or `window.confirm` is blocked under CSP? — `window.confirm` works in the frame). Use a minimal in-board confirm UI to avoid depending on `window.confirm`. **Minor — decide in implementation.**

## Acceptance criteria

- A `C:\projects\persephone-boards\todo\` board exists with the files in Step 1; once trusted, opening a `.todo.json` shows **"Todo"** as a switch option alongside the built-in "ToDo" (built-in remains the default).
- Switching a `.todo.json` to the Todo renders the todo items in the main view and a **Lists & Tags** panel in the sidebar (the declared secondary view).
- Content round-trips through `persephone.host.*` only (no `readFile`/`writeFile`): adding/toggling/editing/deleting items and list/tag CRUD all persist to the `.todo.json` file; Ctrl+S saves; switching to Monaco shows the updated JSON and switching back reflects edits — no data loss, no reload.
- Selecting a list or tag in the **Lists & Tags** panel filters the main list (selection→filter coupling), driven entirely by `persephone.state.*`; the main and secondary frames stay in sync.
- `selectedList` / `selectedTag` **survive app restart and board reload** (restorable keys); `searchText` does not (transient).
- The on-disk format matches the built-in (`{type:"todo-editor", lists, tags, items, state}`, 4-space indent), including orphan auto-add, single-list auto-select, and preservation of the `state` map — a file authored by the board opens cleanly in the built-in Todo and vice-versa.
- No CSP violations in `ui.log`; no hardcoded colors (all `--p-*`); the board is self-contained (vendored `board-base.css`, no remote network).
- User-verified end-to-end. The built-in Todo editor is unchanged.

## Files Changed

### New — board files (outside the repo, `C:\projects\persephone-boards\todo\`)

| File | Purpose |
|------|---------|
| `board-manifest.json` | Content-host custom editor (`*.todo.json`, `editorKind: "content-host"`, `editorPriority: 0`, `editorName: "Todo"`) + `secondaryViews: [{id:"lists", title:"Lists & Tags"}]`. |
| `index.html` | Shell for both roles (`#main-root` + `#lists-root`); links `board-base.css` → `style.css`; loads `app.js`. |
| `app.js` | All logic: parse/serialize `.todo.json`, `persephone.host.*` wiring, `persephone.state.*` selection coupling, filter/sort, mutations, and render for `main` + `lists` roles (branched on `persephone.view`). |
| `style.css` | Todo layout, `--p-*` tokens only, `.secondary-frame` panel styling. |
| `board-base.css` | Vendored copy of `assets/board-base.css`. |
| `icon.svg` | Board glyph (checklist, `currentColor`). |
| `CLAUDE.md` | Board-specific notes (data shape, host round-trip, state coupling, view branch, test loop). |

### Modified — Persephone repo (docs only)

| File | Change |
|------|--------|
| `doc/active-work.md` | Move US-857 to Active under EPIC-044, linked to this task doc. |
| `doc/epics/EPIC-044.md` | Refine the US-857 row only if manifest details drift (currently accurate). |

### Files NOT changed (do not investigate/modify)

- `src/renderer/editors/todo/**` — the **built-in** Todo editor is untouched (the board is a parallel reimplementation; A/B test).
- `src/renderer/editors/board/**`, `src/board-shim.ts`, `src/main/board-protocol-service.ts`, `board-manifest.ts` — all board machinery already supports content-host + secondary views (EPIC-044 US-851–US-856); no code change is needed to run this board.
- `src/renderer/editors/board/custom-editor-registry.ts` — resolves the association from the trusted manifest as-is.
- Any registration file (`register-editors.ts`) — a board is registered by trust, not by repo code.
