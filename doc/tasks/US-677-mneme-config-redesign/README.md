# US-677 — Mneme config editor: single-page redesign + toolbar cleanup

**Status:** Implemented — awaiting manual smoke test. Typecheck + lint green.
**Epic:** EPIC-032 (Mneme), Phase 5. Redesign of the editor built in
[US-664](../US-664-mneme-config-editor/README.md).

## Goal

Collapse the Mneme config editor's three tabbed pages (**Roots / Index / Model**) into a **single
scrollable page** with two sections — a small **Model** block on top and the **Roots** block below
(Index inventory folded into each root) — and slim down the top toolbar. Section headers become
dark-background toolbars so the two sections read as distinct.

## Background

Current implementation (`src/renderer/editors/mneme-config/`):

- **`MnemeConfigView.tsx`** — root view. One `EditorToolbar` (dark) packs, left→right:
  status `Dot` + "Connected/Connecting…/Disconnected" text + `url`, a flex spacer, the model label
  (`name · precision · ready`), a `Divider`, a refresh `IconButton` ("Refresh status" →
  `refreshStatus()`), a **"Reindex all"** button (`reindex()`), a **"Restart Mneme"** button
  (`restartMneme()`), a `Divider`, and the **`SegmentedControl`** tab switch
  (`Roots`/`Index`/`Model` → `setTab`). Below the toolbar: an optional connection-error row and an
  optional model-health warning row. The body renders one of `RootsPanel` / `IndexPanel` /
  `ModelPanel` based on `s.tab`.
- **`RootsPanel.tsx`** — header row `<Text bold>Roots</Text>` + `+ Add root` button, then a
  `RootRow` per `s.status.roots` (name, folder, doc count, index size; model/precision/version;
  Filters toggle; Reindex/Cancel; Remove; reindex `ProgressBar`; `FiltersEditor`).
- **`IndexPanel.tsx`** — header `<Text bold>Index inventory</Text>`, then per root the same roots
  list but showing `s.staleIndexes[root.name]` entries (each: active `Dot`, `modelId / vN`, byte
  size, "active" label **or** a `Delete` danger button). Populated by `loadIndexInventory()` (walks
  `.mneme` via `fs.listDir`), triggered today on switch to the Index tab.
- **`ModelPanel.tsx`** — header `<Text bold>Embedding model</Text>` + `Update model` button
  (`updateModel()`); optional download `ProgressBar`; no-model warning; else model
  name/precision/version + ready `Dot`, cache dir, and a per-file table (filename/present/verified/
  size).
- **`MnemeConfigEditorModel.ts`** — `editorId="mneme-config"`, owns the **shared** `mnemeConnection`
  singleton. State includes `tab: MnemeConfigTab`. `setTab()` updates `tab` and calls
  `loadIndexInventory()` when switching to "index". `getRestoreData()` resets transient fields.
  `MnemeConfigTab` type is declared here and imported by the view.

Reusable building blocks:
- `EditorToolbar` (`editors/base/EditorToolbar.tsx`) — `Panel background="dark"` wrapper; the
  top-level toolbar already uses it.
- MCP-inspector precedent for **section headers**: `<Panel background="dark" borderBottom>` inline
  (`editors/mcp-inspector/ToolsPanel.tsx`) — closest match to "section header as a small toolbar".
- `RefreshIcon` (`theme/icons.tsx`); warning color via `Dot color="warning"` /
  `IconButton` styling against `color.warning.text` (`theme/color.ts`).

## Implementation plan

### 0. `IconButton` — add `warning` prop (`uikit/IconButton/IconButton.tsx`)

Mirror the existing `active` prop with a warning variant:
- Add `warning?: boolean` to `IconButtonProps` (doc: "Warning/attention state — tints the icon with
  `color.warning.text`. Overrides `active` when both are set.").
- Destructure `warning` and emit `data-warning={warning || undefined}` on `Root`. To guarantee the
  override regardless of CSS rule order, **suppress `data-active` when `warning` is set**:
  `data-active={(active && !warning) || undefined}`.
- Add the styled rule **after** the `&[data-active]` rule:
  `"&[data-warning]": { color: color.warning.text }` (and a matching
  `'&[data-variant="chip"][data-warning]'` if needed — not required for this task's usage).
- `color.warning.text` already exists in `theme/color.ts`; no new token.

This is a small additive primitive change consumed immediately by the toolbar restart control
(step 1).

### 1. Toolbar (`MnemeConfigView.tsx`)

Rework the single `EditorToolbar`:
- **Restart control:** replace the text `Restart Mneme` button with an `IconButton` using
  `RefreshIcon`, `title="Restart Mneme"`, `warning` (the new prop from step 0), placed **immediately
  after the status text** (before `url`). Render it **only when not connected**
  (`s.connectionStatus !== "connected"` — i.e. "Connecting…"/"Disconnected"/"error").
- **Remove** the model label (`name · precision · ready`) and its trailing `Divider` — model info
  now lives in the Model section.
- **Remove** the `SegmentedControl` tab switch and its leading `Divider`.
- **Move** the `Reindex all` button out of the toolbar into the Roots section header (step 3).
- **Remove** the existing "Refresh status" `IconButton` entirely — the 1500 ms poll loop already
  keeps `wiki_status` fresh (resolved, Concern 1). `refreshStatus()` stays as a method (still called
  internally after mutations); only its toolbar button goes away.

Resulting left→right toolbar: status `Dot` → status text → (restart refresh-icon, warning, only when
not connected) → `url` → flex spacer. No icons on the right.

### 2. Single-page body (`MnemeConfigView.tsx`)

- Remove the `s.tab` switch. The body becomes one scroll column rendering, in order:
  1. **Model section** (`ModelPanel`) — top block.
  2. **Roots section** (`RootsPanel`) — below.
- Keep the connection-error and model-health warning rows where they are (between toolbar and body).
- Trigger `loadIndexInventory()` on **connect** instead of on tab switch (update the `useEffect` to
  depend on `connected` only, drop the `s.tab === "index"` guard).

### 3. Roots section (`RootsPanel.tsx`)

- Replace the plain header row with a **dark section header** (`<Panel background="dark"
  borderBottom>` — matching MCP inspector) titled **"Roots"**, with **both** buttons on the right:
  `+ Add root` (`addRoot()`) and `Reindex all` (`reindex()` with no arg; carry over the
  `disabled={!connected || !!s.reindexProgress["__all__"]}` guard from the old toolbar).
- **Minimal merge — the only new bit is an "active" indicator (resolved, Concern 2).** The root row
  already shows the active index (`index: gte-multilingual-base-int8 · v2`). Add a small **active
  indicator** (e.g. `Dot color="success"` / "active" tag) next to that model string. All other
  Index-tab fields (model id, version, byte size) are already present on the Roots row — do **not**
  duplicate them.
- **Stale/extra indexes (the rare multi-index case):** the Index tab also exposed `Delete` for
  *non-active* indexes (alternate model versions left on disk after a model change). Keep that
  capability: when `s.staleIndexes[root.name]` contains entries **beyond the active one**, render
  those extra entries as a compact sub-list under the row, each with its size + `Delete`
  (`deleteIndex(...)`). When there's only the active index (the common case), show nothing extra —
  just the inline active indicator. `loadIndexInventory()` still populates `s.staleIndexes`.

### 4. Model section (`ModelPanel.tsx`)

- Replace the plain header row with a **dark section header** titled **"Embedding model"**, with the
  `Update model` button (`updateModel()`, disabled while downloading) on the right.
- Body unchanged (download progress, no-model warning, model details + per-file table).
- It now renders as the first block in the scroll (no longer a standalone tab).

### 5. Model + cleanup (`MnemeConfigEditorModel.ts`, `mnemeTypes.ts`)

- Remove the `tab` field, `setTab()`, and the `MnemeConfigTab` type (and its import/use in the
  view). Update `getRestoreData()`/state init accordingly.
- Delete `IndexPanel.tsx` (content merged into `RootsPanel`/`RootRow`). Remove its import from
  `MnemeConfigView.tsx`.
- `loadIndexInventory()` now runs on connect; verify it still populates `s.staleIndexes` for all
  roots up front.

## Concerns / open questions

1. **Refresh-status button — RESOLVED:** drop it. Since the 1500 ms poll already refreshes
   `wiki_status`, the toolbar "Refresh status" `IconButton` is removed; the restart control becomes
   the only icon (warning refresh icon, only when disconnected).
2. **Index-inventory merge — RESOLVED:** the Roots row already carries all index fields; the only
   addition is an inline **"active" indicator** next to the model string. Stale/extra non-active
   indexes (rare, post-model-change) still get a compact `Delete` sub-list under the row; nothing
   extra when there's a single index.
3. **Section headers — RESOLVED:** scrolling (not sticky), via inline `<Panel background="dark"
   borderBottom>` per the MCP-inspector precedent. With 2–3 roots everything typically fits without
   scrolling.
4. **Warning-colored `IconButton` — RESOLVED:** add a `warning?: boolean` prop to the `IconButton`
   primitive (mirroring the existing `active` prop), emitting `data-warning` and styling the icon
   with a warning color. `warning` **overrides** `active` when both are set. See step 0.
5. **Restored-page `tab`.** Removing `tab` from state is safe for new pages; restored pages that
   serialized a `tab` value simply ignore the now-unknown field. No migration needed.

## Acceptance criteria

- [ ] `IconButton` has a `warning` prop that tints the icon with `color.warning.text` and overrides
      `active`.
- [ ] The editor shows **one scrollable page** — no `Roots/Index/Model` tab switch.
- [ ] **Model** section is the top block; **Roots** section is below; both have dark-background
      headers.
- [ ] Model info (name/precision/ready, files, cache dir, Update model) appears in the Model
      section; the old toolbar model label is gone.
- [ ] Each root row shows an inline **"active" indicator** next to its index model string; the
      separate Index tab/panel is removed. Stale/extra non-active indexes still get a `Delete`
      sub-list when present.
- [ ] Toolbar shows the status dot + label, with a **warning-colored restart control** (tooltip
      "Restart Mneme") immediately after the label, **visible only when not connected**; the old
      "Refresh status" icon is gone.
- [ ] `Reindex all` lives in the **Roots** section header alongside `+ Add root` (with the same
      disabled guard); `+ Add root` still works.
- [ ] `restartMneme()`, `reindex()`, `addRoot()`, `updateModel()`, `deleteIndex()`, Filters
      editing, and live reindex/download progress all still function.
- [ ] `loadIndexInventory()` runs on connect (no longer gated on a tab).
- [ ] `npm run lint` and typecheck pass.

## Notes

EPIC-032 deferred-review model: stays `[ ]` on the dashboard; `/review`, `/document`, `/userdoc` run
at epic close. Renderer (TS/React) editor — review rules apply (not a Rust crate).
