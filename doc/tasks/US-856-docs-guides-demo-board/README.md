# US-856: Board Secondary Views — docs, guides & demo board

**Epic:** [EPIC-044 — Board Secondary Views](../../epics/EPIC-044.md)
**Status:** Planned — awaiting review (do NOT implement until the user says "let's implement")

## Goal

Document the board **secondary views** + **shared-state** surface for the audience that
actually uses it — board-author AI agents — by updating the two board-author guides and
adding a **live showcase** to the bundled Demo board. This makes the EPIC-044 API surface
(`persephone.state.*`, `persephone.setSecondaryViews`, `persephone.view`, the manifest
`secondaryViews` field) discoverable and copy-pasteable.

## Background

EPIC-044 shipped a large new board API surface across US-851–855, but **none of the
consumer-facing board docs mention it yet** (verified 2026-07-15 — zero hits for
"secondary", "state.", "setSecondaryViews", or "persephone.view" in
`assets/board-template/CLAUDE.md`, `assets/mcp-res-boards.md`, or `assets/demo-board/`).
A board author reading the current guides has no way to discover the feature.

### The API surface to document (authoritative — from the shipped code)

- **Manifest** `secondaryViews: SecondaryViewDecl[]`, each `{ id, html?, title? }` —
  declares sidebar panels. `id` must not contain `::`. `html` defaults to the main entry
  (`index.html`), so one file can serve every view and branch on `persephone.view`. The
  panel icon is always the **board's own glyph** — there is no per-view icon (the inert
  `icon?` field is removed in this task; see C2).
- **`persephone.state.*`** (all frames): `init(defaults, { restorableKeys })`, `get()`
  (Promise, settles on first snapshot then cached — like `host.getContent()`), `set(obj)`,
  `merge(partial)`, `onChange(cb) → off`. Authoritative on the Persephone side; a change in
  one frame is observed in all. **Opt-in persistence:** only `restorableKeys` survive
  restart/reload; undeclared/transient state is never written to the descriptor.
- **`persephone.setSecondaryViews(views)`** (any frame): replace the full set at runtime;
  `[]` removes all. Views die on navigate-away (board is disposed); a busy board that
  survives re-derives them on re-promotion (US-855).
- **`persephone.view`** — `"main"` for the main frame, or the view's `id` for a secondary
  frame. Delivered synchronously at boot (URL query param), so a single HTML file can render
  every view and branch on it.

### Current doc state (verified)

| Doc | Role | Secondary-view content today |
|-----|------|------------------------------|
| `assets/board-template/CLAUDE.md` | Canonical board-author guide (copied into every board; also `read_guide("boards")` source) | none |
| `assets/mcp-res-boards.md` | Condensed **agent-facing** guide (`read_guide("boards")`) | none |
| `assets/demo-board/` (`index.html`, `app.js`, `style.css`, `board-manifest.json`) | Living, self-documenting demo (5 tabs: Overview / Theming / Capabilities / Build Guide / Debugging) | none; single main frame only |
| `doc/architecture/secondary-views.md` | Developer architecture (§10 table of secondary editors) | none — no `board-secondary:*` row |
| `doc/architecture/editors.md` | Developer architecture (Content-Host Boards section) | n/a |
| `docs/boards.md`, `docs/whats-new.md` | End-user docs | none |

### Scope split (deferred-review model) — see Concern C1

Per the epic's deferred-review model, `/review` + `/document` + `/userdoc` run **at epic
close**. This task therefore covers the **board-author deliverables** — the guides + the
demo board (which *are* the feature's usable documentation, not a review sweep). The
**developer architecture** (`secondary-views.md`, `editors.md`) and **end-user docs**
(`boards.md`, `whats-new.md`) are left to the epic-close `/document` + `/userdoc` passes,
which will also absorb US-857's Todo-board changes without a second churn.

## Implementation plan

### Step 0 — Remove the inert `icon` field from `SecondaryViewDecl` (C2)

The per-view icon is never rendered (panels always use the board glyph) and there is no plan
to implement it, so drop the field rather than document around it. Touch exactly these:

- `src/renderer/editors/board/board-manifest.ts`:
  - `SecondaryViewDecl` interface (line ~33) — delete `icon?: string;`.
  - The interface JSDoc (lines ~22–28) — reword "`title` / `icon` label the sidebar panel"
    to just "`title` labels the sidebar panel."
  - `normalizeSecondaryViews` (lines ~204–220) — delete the `const icon = …` line and drop
    `icon` from the pushed object (`out.push({ id, html, title })`).
- `src/ipc/board-bridge-channels.ts` (line ~207) — the `views?` wire shape becomes
  `Array<{ id: string; html?: string; title?: string }>`; update the adjacent comment that
  says it mirrors `SecondaryViewDecl`.
- `src/board-shim.ts` (lines ~603, ~606) — `setSecondaryViews(views: Array<{ id: string;
  html?: string; title?: string }>)` and the `{ id, html?, title?, icon? }` doc comment → drop
  `icon`.

Runtime is unaffected (any stray `icon` a board sends is silently dropped by
`normalizeSecondaryViews`). Verify `npx tsc --noEmit` + `npx eslint` clean after.

### Step 1 — `assets/board-template/CLAUDE.md` (canonical author guide)

Add a new top-level section **"Secondary views & shared state"** after the *Content-host
boards — `persephone.host.*`* section (i.e. after line ~210, before *Long-running
processes*), since it is the natural companion to the host surface. Cover, with runnable
snippets:

1. **What it is** — a board can add sidebar panels (secondary views), each a second
   `board://` iframe over the *same* board; frames stay in sync through a Persephone-owned
   shared-state object. This is the plumbing for editor-like boards (main list + a
   Lists/Tags sidebar).
2. **Declare views (manifest)** — `secondaryViews: [{ id, html?, title? }]`; `html` defaults
   to `index.html`; `id` has no `::`. Panel icon is the board's own icon (do not mention
   `icon`).
3. **`persephone.view`** — one HTML, many roles; branch on it:
   ```js
   if (persephone.view === "main") renderMain();
   else renderSecondary(persephone.view);   // the view's id
   ```
4. **`persephone.state.*`** — `init` (defaults + `restorableKeys` for opt-in persistence),
   `get` (await-first-snapshot), `set` / `merge`, `onChange`. Emphasize: authoritative on
   the Persephone side; `onChange` is the source of truth (a writer sees its own change one
   round-trip later, React-`setState`-style); only `restorableKeys` persist.
5. **`persephone.setSecondaryViews([...])`** — declare/replace at runtime from any frame;
   `[]` clears. Note navigate-away disposes the board (panels don't keep it alive).
6. A compact end-to-end example: main frame declares a view + `state.init(...,
   { restorableKeys: ["selected"] })`; a `selected` change in the sidebar re-renders the
   main list via `onChange`.

Also update the **"More examples — the bundled Demo board"** paragraph (line ~356) to list
secondary views + shared state among what the demo exercises.

### Step 2 — `assets/mcp-res-boards.md` (condensed agent guide)

Mirror Step 1 in condensed form. Add a **"### Secondary views & shared state"** subsection
under "Develop it" (after the `persephone.host.*` bullet, ~line 114), covering the same four
primitives (`secondaryViews` manifest, `persephone.view`, `persephone.state.*` with opt-in
`restorableKeys`, `setSecondaryViews`) in the terser style of that file — a short paragraph
+ one combined snippet. Update the **"Richer reference — the bundled Demo board"** paragraph
(~line 241) to mention the secondary-view showcase tab. Keep it consistent with the
canonical guide (this file is the condensed copy — no contradictions).

### Step 3 — Demo board: a live "Secondary Views" showcase (two views, both patterns)

Ship **two** secondary views (C3): **"Shared State"** served from the main `index.html` (via
`persephone.view`) and **"Notes"** served from a dedicated `detail.html` + `detail.js`. All
three frames (main + both secondaries) share one board model, so `persephone.state.*` keeps
them synchronized — a change in any frame shows in the others.

**3a. `assets/demo-board/board-manifest.json`** — declare both views (no `icon` → board glyph):
```json
{
  "schemaVersion": 1,
  "description": "...",
  "author": "Persephone",
  "repository": "https://github.com/andriy-viyatyk/persephone",
  "secondaryViews": [
    { "id": "shared-state", "title": "Shared State" },
    { "id": "detail", "html": "detail.html", "title": "Notes" }
  ]
}
```
`shared-state` omits `html` → defaults to `index.html`; `detail` points at its own file.

**3b. `assets/demo-board/index.html`** —
- Add a **"Secondary Views"** tab + a `<section class="panel" data-panel="secondary">` in the
  main view: explain the feature, host the shared-state controls (a `message` text input, a
  `counter` with a `＋` button, a live read-out of the current shared state), and hint "open
  the sidebar — two panels, **Shared State** + **Notes** — to watch them sync live."
- The **"Shared State"** secondary reuses this same file — `app.js` renders a compact panel
  when `persephone.view === "shared-state"`.

**3c. `assets/demo-board/app.js`** —
- At boot, branch on `persephone.view`: `"main"` → the existing five-tab demo (plus the new
  Secondary Views tab); `"shared-state"` → hide the main chrome (header / tabs / console) via
  a `body.secondary-frame` class and render only the compact shared-state panel (read-out + a
  `＋` counter button + the message). `app.js` only ever sees `"main"` or `"shared-state"`
  (it is loaded solely by `index.html`); keep the branch a single early check that leaves the
  existing `activate("overview")` path untouched for `"main"`.
- The **main** frame calls `persephone.state.init({ counter: 0, message: "" },
  { restorableKeys: ["counter", "message"] })` — the authoritative init (per the guide).
- Subscribe with `persephone.state.onChange(s => renderState(s))`; write via
  `persephone.state.merge({...})`. Add a note telling the reader to Reload the board and see
  `counter` / `message` persist (opt-in persistence).

**3d. `assets/demo-board/detail.html`** (NEW) — a standalone secondary-view file demonstrating
the dedicated-file pattern: links `board-base.css` + `style.css` + its **own** `./detail.js`
(NOT `app.js`); a heading + a `<textarea>` bound to the shared `message` and a small
read-out.

**3e. `assets/demo-board/detail.js`** (NEW) — tiny, independent of `app.js`: binds the textarea
to the shared `message` (`persephone.state.merge({ message })` on input) and re-renders on
`persephone.state.onChange`. Proves a separate-file secondary view syncs with the main frame
**and** the other secondary.

**3f. `assets/demo-board/style.css`** — minimal styling for the new tab/panel, the
`.secondary-frame` compact layout, and `detail.html` (reuse existing `--p-*` tokens; no new
colors).

### Step 4 — Epic tracking

- `doc/epics/EPIC-044.md`: add US-856 to "Implemented so far"; mark the US-856 task row `✅`
  and note the scope split (guides + demo now; architecture + user docs at epic-close
  `/document` + `/userdoc`). Also trim the **canonical field-names** line's
  `SecondaryViewDecl = { id, html?, title?, icon? }` to `{ id, html?, title? }` (C2); leave
  the historical design-narrative examples as-is. Keep ticket-free where the doc is
  architecture-style.
- `doc/active-work.md`: link the US-856 entry to this document.

## Concerns / decisions

- **C1 — Scope: which docs does US-856 own vs. the epic-close passes?** The epic breakdown
  row for US-856 lists architecture (`secondary-views.md`, `editors.md`) and user docs
  (`boards.md`, `whats-new.md`) *in addition to* the guides + demo. But the epic's
  deferred-review model runs `/document` (developer + `assets/` board docs) and `/userdoc`
  (user docs) **at epic close**. **Resolution (recommend):** US-856 does the **board-author
  guides + demo board** — these are feature deliverables a board author can't work without,
  not a review sweep — and **defers** `secondary-views.md` / `editors.md` / `boards.md` /
  `whats-new.md` to the epic-close passes (which also fold in US-857). *Confirm this split at
  review; if you want the architecture/user docs done now, say so and they'll be added to the
  plan.*
- **C2 — The per-view `icon` decl is inert → remove it.** `SecondaryViewDecl.icon` exists in
  the type but no render path consumes it (the panel header always shows the board glyph).
  **Resolution (user, 2026-07-15):** reusing the board icon for every secondary view is the
  intended behavior — there is no plan for per-view icons — so **remove the `icon` field** from
  the declaration and every wire/shim signature rather than document around it (Step 0). Docs
  then describe decls as `{ id, html?, title? }`.
- **C3 — Demo showcase shape: ship BOTH patterns (user, 2026-07-15).** Two secondary views so
  the demo teaches both HTML-source styles at once: (A) **"Shared State"** served from the
  main `index.html` (no `html` → defaults to it), rendered by `app.js` branching on
  `persephone.view` — the one-file-many-roles pattern; and (B) **"Notes"** served from a
  dedicated `detail.html` + `detail.js` — the standalone-view-file pattern. All three frames
  share the one board model, so `persephone.state.*` syncs them. **Resolution:** implement
  both (Step 3). The single-file frame loads the whole document then hides the chrome via
  `body.secondary-frame` — negligible cost; the dedicated file is fully self-contained.
- **C4 — Don't regress the demo.** The demo currently exercises execute/theme/integration
  cleanly; the new tab and the `persephone.view` boot-branch must not break the existing five
  tabs when loaded as the main frame. Keep the branch a single early check that leaves the
  existing `activate("overview")` path untouched for `view === "main"`.

## Acceptance criteria

1. `assets/board-template/CLAUDE.md` documents `secondaryViews` (manifest), `persephone.view`,
   `persephone.state.*` (incl. `init` + `restorableKeys` opt-in persistence), and
   `setSecondaryViews`, with runnable snippets; does **not** mention the inert `icon` decl.
2. `assets/mcp-res-boards.md` carries the condensed, consistent version of the same (no
   contradictions with the canonical guide).
3. The Demo board declares **two** secondary views and, when opened, shows both a **"Shared
   State"** panel (served from `index.html` via `persephone.view`) and a **"Notes"** panel
   (served from the dedicated `detail.html`). All three frames stay synchronized — a change in
   any one is reflected in the others, driven purely by `persephone.state.*`.
4. The demo's `restorableKeys` values survive a board **Reload** (and app restart); the panel
   demonstrates/notes this.
5. The demo's existing five tabs still work when loaded as the main frame (no regression from
   the `persephone.view` branch).
6. Both guides' "Demo board" pointers mention the secondary-view showcase.
7. Board docs stay **ticket-free** (no `US-XXX` / `EPIC-XXX`) — they are consumer-facing.
8. The three board docs are reconciled (canonical vs. condensed vs. living demo) with no
   drift on the new surface.
9. `SecondaryViewDecl` (+ the wire/shim signatures) no longer carry `icon`; `npx tsc
   --noEmit` and `npx eslint` are clean.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/editors/board/board-manifest.ts` | Remove `icon?` from `SecondaryViewDecl` + its JSDoc + `normalizeSecondaryViews` (C2 / Step 0). |
| `src/ipc/board-bridge-channels.ts` | Drop `icon?` from the `views?` wire shape (+ comment). |
| `src/board-shim.ts` | Drop `icon?` from the `setSecondaryViews` signature + doc comment. |
| `assets/board-template/CLAUDE.md` | New "Secondary views & shared state" section; update the Demo-board pointer. |
| `assets/mcp-res-boards.md` | Condensed "Secondary views & shared state" subsection; update the Demo-board pointer. |
| `assets/demo-board/board-manifest.json` | Add two `secondaryViews`: `{ id: "shared-state", title: "Shared State" }` + `{ id: "detail", html: "detail.html", title: "Notes" }`. |
| `assets/demo-board/index.html` | Add a "Secondary Views" tab + panel with shared-state demo controls. |
| `assets/demo-board/app.js` | `persephone.view` boot-branch (`"main"` vs. `"shared-state"` compact layout); `persephone.state.init/onChange/merge` wiring. |
| `assets/demo-board/detail.html` | **NEW** — dedicated "Notes" secondary-view file (links its own `detail.js`). |
| `assets/demo-board/detail.js` | **NEW** — binds a textarea to the shared `message` via `persephone.state`; independent of `app.js`. |
| `assets/demo-board/style.css` | Styles for the new tab/panel, `.secondary-frame` layout, and `detail.html` (existing `--p-*` tokens only). |
| `doc/epics/EPIC-044.md` | Mark US-856 `✅`; note the scope split. |
| `doc/active-work.md` | Link the US-856 dashboard entry to this doc. |

## Files NOT changed (deferred to the epic-close passes — do not touch in US-856 unless C1 is overridden)

- `doc/architecture/secondary-views.md` — will get a `board-secondary:*` row in §10 + a board
  secondary-view subsection at epic close (`/document`).
- `doc/architecture/editors.md` — board-editor cross-references at epic close (`/document`).
- `docs/boards.md`, `docs/whats-new.md` — end-user coverage at epic close (`/userdoc`).
- Product code beyond the `icon`-field removal (Step 0) — no behavior change; US-856 is docs
  + demo-board content + that one type trim.
- `src/renderer/editors/board/BoardEditorModel.ts`, `BoardWebview.tsx`,
  `BoardSecondaryView.tsx` — they import/route `SecondaryViewDecl` / `views` but never
  reference `icon`, so the field removal doesn't touch them (verified).
- `assets/board-base.css` — shared defaults unchanged (no new shared styling needed).
