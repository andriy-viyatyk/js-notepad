# US-840: DrawIO viewer board (EPIC-042 proving ground)

## Goal

Build the first real **custom-editor board** — a read-only `.drawio` (diagrams.net) viewer — proving
the EPIC-042 path end-to-end (manifest `fileMasks` → custom-editor registry → resolution → switch →
`persephone.getFilePath()`). The board lives **outside** the Persephone repo, in
`C:\projects\persephone-boards\drawio-viewer\` (a general-purpose boards folder the user will push to
its own git repository later). This retires the built-in-editor plan in [US-454](../US-454-drawio-viewer/README.md).

## Background

### How this differs from US-454

US-454 planned a **built-in** editor (`/src/renderer/editors/drawio/`, `app-asset://` viewer, registered
in `register-editors.ts`). EPIC-042 makes boards able to *be* file editors, so US-840 delivers the same
user-visible feature as a **portable board** instead — no new Persephone editor code. The Persephone repo
gains only this task doc + close-out doc edits; all board code lives in the external folder.

### The plumbing is already live (US-836→US-839, committed on `upcoming-v4.0.14`)

- **`board-manifest.json`** honors `fileMasks` (glob, matched against basename), `editorPriority` (ladder:
  monaco 0 / grid 20 / draw 50 / viewers 100 / category 200), `editorName` — but **only when the board is
  trusted** (`board-manifest.ts` `getBoardEditorAssociation`).
- **`customEditorRegistry`** (`src/renderer/editors/board/custom-editor-registry.ts`) enumerates trusted
  boards, reads manifests, maps file → boards. `resolveEditorIdForFile` merges built-in + board priority;
  a board wins file-open only when its priority is strictly greater than the best built-in claimant.
  `.drawio` has **no** built-in claimant (Monaco floor 0), so any `editorPriority > 0` makes the board the
  default, switchable back to Monaco.
- **`persephone.getFilePath()`** (board bridge, US-838) resolves to the associated file's absolute path at
  the port handshake; `undefined` for a plainly-opened board.
- **Switch + resolution** (US-839) already route a trusted `.drawio`-associated board through direct open,
  `openRawLink`, and the editor-switch widget.

So US-840 is **entirely board authoring** — nothing in Persephone's source needs to change for it to work.

### Board authoring surface (from `assets/board-template/CLAUDE.md`)

- Board = `index.html` + `app.js` (+ CSS/assets) hosted in a locked-down cross-origin `<iframe>` on the
  `board://` scheme. Bridge object `window.persephone`.
- **CSP** (`board-protocol-service.ts` `BOARD_CSP`): `default-src 'none'`; `script-src 'self' 'unsafe-inline'`;
  `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:`; `font-src 'self' data:`;
  **`connect-src 'self'`** (no remote fetch); `media-src 'self' blob:`. → **All libraries must be vendored
  locally and referenced by relative path.** No CDN.
- `persephone.getFilePath(): Promise<string|undefined>` — the associated file path. Safe to `await` anytime.
- `persephone.readFile(path, options?)` — text by default; `{ encoding: "base64" }` for binary. Absolute
  path reads anywhere. (Viewer is read-only, so no `writeFile` this task.)
- `persephone.onThemeChange(cb)` / `getTheme()` → `{ id, isDark, vars }` — live `--p-*` palette.
- `board-base.css` (page bg, themed scrollbars, monospace) is copied into every scaffolded board and linked
  first by `index.html`.
- **Trust:** the custom-editor registry only enumerates **trusted** boards. A board scaffolded via
  `create_board` / `app.boards.createBoard` is **auto-trusted at creation** (`board-scaffold.ts`
  `createBoardFromTemplate` → `boardTrust.trust(boardRoot)`), so the `.drawio` association goes live
  immediately for testing without a manual trust step.

### `.drawio` format + renderer

- `.drawio` = XML: root `<mxfile>` with one or more `<diagram>` (multi-page). Each `<diagram>` body is
  either plain `<mxGraphModel>` or **deflate-raw + base64 + URI-encoded** (compressed).
- **`viewer-static.min.js`** (jgraph/drawio, Apache-2.0) exposes `GraphViewer` — the same self-contained
  renderer GitHub uses for `.drawio` previews. It auto-decompresses encoded `<diagram>` bodies, renders
  multi-page with native page tabs, and inlines its shape stencils (that is the whole point of the
  *static* build → offline-friendly). Verified reachable & pinnable:
  `https://raw.githubusercontent.com/jgraph/drawio/v30.3.8/src/main/webapp/js/viewer-static.min.js`
  (HTTP 200, ~3.97 MB). Latest release at carve time: **v30.3.8**.
- Rendering API: put a `<div class="mxgraph" data-mxgraph='{...json...}'></div>` in the DOM, then call
  `GraphViewer.processElements()`. Config JSON keys: `xml` (the file text), `toolbar` (e.g.
  `"pages zoom layers lightbox"` → page tabs + zoom), `nav`, `resize`, `page`, `border`, `highlight`.

## Implementation plan

> This board is authored in `C:\projects\persephone-boards\drawio-viewer\`. The steps below are executed
> at implementation time (after "let's implement"), largely via MCP board tools + file writes; they do
> **not** modify the Persephone repo except where noted.

### Step 1 — Scaffold the board (gets `board-base.css` + auto-trust)

- Create the container: `C:\projects\persephone-boards\` already exists (empty).
- Scaffold via MCP `create_board { name: "drawio-viewer", dir: "C:\\projects\\persephone-boards" }`
  (or `app.boards.createBoard("drawio-viewer", "C:\\projects\\persephone-boards")`). This:
  - copies `board-template` + `board-base.css` into `…\drawio-viewer\`,
  - writes a valid `board-manifest.json`,
  - **auto-trusts** the board (so the `.drawio` association is live for testing).

### Step 2 — `board-manifest.json` (Custom Editor fields)

Overwrite `…\drawio-viewer\board-manifest.json`:
```json
{
  "schemaVersion": 1,
  "name": "DrawIO Viewer",
  "description": "Read-only viewer for diagrams.net / draw.io (.drawio) diagrams.",
  "author": "",
  "repository": "",
  "fileMasks": ["*.drawio"],
  "editorPriority": 100,
  "editorName": "DrawIO"
}
```
- `editorPriority: 100` → board is the **default** editor for `.drawio` (no built-in claimant), switchable
  to Monaco (raw XML) via the switch widget.

### Step 3 — Vendor the renderer (offline)

- Create `…\drawio-viewer\lib\`.
- Download `viewer-static.min.js` from the pinned tag into `lib\viewer-static.min.js`:
  `https://raw.githubusercontent.com/jgraph/drawio/v30.3.8/src/main/webapp/js/viewer-static.min.js`
- Download `LICENSE` (Apache-2.0) → `lib\LICENSE`
  (`https://raw.githubusercontent.com/jgraph/drawio/v30.3.8/LICENSE`).
- Write `lib\VERSION.txt` recording `v30.3.8` + the source URL.
- Reference it by **relative** path in `index.html` (`<script src="./lib/viewer-static.min.js"></script>`).

### Step 4 — `index.html`

- Link `./board-base.css`, then the board's own `<style>`, then `./lib/viewer-static.min.js`, then `./app.js`.
- Set the drawio offline/base-path globals in an inline `<script>` **before** the viewer script loads, to
  suppress any remote resource fetch (`connect-src 'self'` would block them anyway — this avoids console
  noise / partial-render): e.g. `window.mxLoadResources = false; window.mxLoadStylesheets = false;` and, if
  needed, `window.RESOURCES_PATH`/`STENCIL_PATH`/`IMAGE_PATH`/`mxBasePath` pointed at `./lib` or left empty.
  (Exact set verified in Step 7.)
- Body: a full-height `#diagram` container (holds the injected `.mxgraph` div) + a hidden `#empty` /
  `#error` state region.
- Background `var(--p-bg)`, fill the iframe (100vw/100vh, no page padding — the diagram owns the canvas).

### Step 5 — `app.js`

- `const P = window.persephone;`
- On load:
  1. `const filePath = await P.getFilePath();`
  2. If no `filePath` → show the empty state ("Open a .drawio file to view it") and stop (plain-board open).
  3. `const xml = await P.readFile(filePath);` (text).
  4. Build the config object `{ xml, toolbar: "pages zoom layers lightbox", nav: true, resize: true, border: 8 }`,
     set it as `data-mxgraph` (JSON-stringified, HTML-attribute-escaped) on a fresh
     `<div class="mxgraph">` inside `#diagram`, then `GraphViewer.processElements()`.
  5. Wrap in try/catch → on failure `P.notify(msg, "error")` + show `#error` with the message.
- **Refresh:** add a small "Refresh" affordance (re-read + re-render) since boards don't auto-reload on file
  change; or rely on the in-board Reload button (decide in Step 7 — a board-local Refresh button is nicer).
- **Theme:** `P.onThemeChange()` → keep the container background in sync with `--p-bg`; re-run
  `processElements()` if a dark/light swap needs re-rendering. (Full diagram color inversion is optional —
  see DC7.)

### Step 6 — `icon.svg` (optional)

- Add a simple diagram-glyph `icon.svg` so the tab/switch shows a DrawIO-ish icon. Fallback glyph is fine
  if skipped.

### Step 7 — Verify (open a real `.drawio`)

- Open the board once (`open_board`) so it's trusted + enumerated; confirm `customEditorRegistry` lists it.
- Open a single-page `.drawio` → renders in the board (not Monaco).
- Open a multi-page `.drawio` → GraphViewer page tabs switch pages.
- Open a `.drawio` with a **compressed** `<diagram>` body → renders (viewer auto-inflates).
- Open a shapes-heavy diagram → confirm no blocked remote fetches (DevTools / `ui.log`); vendor/patch base
  paths if any remote request appears (DC4).
- Switch board ⇄ Monaco via the switch widget; confirm `confirmRelease` semantics and that Monaco shows raw
  XML.
- Reload the app with the `.drawio` page open → restores as the board (US-839 `getRestoreData` pins
  `board-view`; re-resolves the file).

### Step 8 — Persephone-repo bookkeeping (only repo change)

- Mark US-454 superseded (its plan is retired by the board). Add a note in US-454's README pointing to
  US-840 / EPIC-042, or fold it into the epic close-out.
- Dashboard: US-840 stays `[ ]` under EPIC-042 until epic-level review (deferred-review model).

## Concerns / open questions

- **DC1 — Viewer-only (MVP).** Matches US-454 + the epic ("DrawIO **viewer** board"). Editing needs the full
  diagrams.net webapp (~10 MB, embed postMessage protocol, two-way state sync) + `persephone.writeFile` —
  much larger. **Recommend: ship read-only now; track editing as a future task.** Confirm.
- **DC2 — Board folder name.** `C:\projects\persephone-boards\drawio-viewer`. OK, or prefer a different name
  (e.g. `drawio`)?
- **DC3 — Scaffold via `create_board`, then customize.** Recommended over hand-creating files, because it
  copies `board-base.css`, writes a valid manifest, and **auto-trusts** the board (the association only
  works for trusted boards). We then overwrite `index.html`/`app.js`/`board-manifest.json` and add `lib/`.
  Confirm.
- **DC4 — Offline satellite assets (main risk).** `viewer-static.min.js` inlines standard stencils, but a
  diagram embedding remote images, or the viewer probing `mxgraph/images/*` from a remote base, would be
  blocked by CSP (`connect-src 'self'`, `img-src 'self' data: blob:`). Mitigation: set the base-path/no-load
  globals (Step 4) and verify with a shapes-heavy diagram (Step 7). `.drawio.png` / `.drawio.svg`
  (XML-embedded exports) are **out of scope** — only the `*.drawio` mask. Acceptable?
- **DC5 — `editorPriority: 100` → board is the default `.drawio` editor.** Double-click / drag / `openRawLink`
  of a `.drawio` opens the board; the user can switch to Monaco for raw XML. Alternative: `0` = switch-option
  only (Monaco stays default). **Recommend 100** (a viewer is the natural default for a diagram). Confirm.
- **DC6 — The board is NOT committed to the Persephone repo.** It lives in `C:\projects\persephone-boards`,
  destined for its own git repo. The Persephone repo's US-840 footprint is just this task doc + the
  close-out doc edits. Confirm we keep the board out of the persephone repo.
- **DC7 — Dark-mode rendering.** MVP: match the board/container background to `--p-bg` and re-render on theme
  change. Full diagram color inversion for dark themes (drawio's own dark-mode transform) is optional and
  can be deferred. Acceptable?
- **DC8 — Multi-page + compressed bodies.** Handled natively by GraphViewer (page tabs via `toolbar: "pages"`;
  auto-inflate). Low risk — validated in Step 7.

## Acceptance criteria

- [ ] `C:\projects\persephone-boards\drawio-viewer\` is a valid, trusted board (`board-manifest.json` with
      `fileMasks: ["*.drawio"]`, `editorPriority: 100`, `editorName: "DrawIO"`).
- [ ] Opening a `.drawio` file (double-click / drag / navigator / `openRawLink`) opens it in the DrawIO board,
      not Monaco.
- [ ] The editor-switch widget offers **DrawIO ⇄ (raw) Monaco**; switching both ways works and honors
      `confirmRelease`.
- [ ] Single-page, multi-page (page tabs), and compressed-body `.drawio` files all render correctly.
- [ ] No remote network access at runtime (fully offline; the viewer library + LICENSE vendored under `lib/`).
- [ ] `persephone.getFilePath()` drives the board; a plainly-opened board (no file) shows an empty state
      rather than erroring.
- [ ] The page restores as the DrawIO board across an app restart.
- [ ] `lib/LICENSE` (Apache-2.0) + `lib/VERSION.txt` (pinned v30.3.8 + source URL) present.

## Implementation notes (2026-07-14) — proving-ground findings

Building the real board surfaced **two US-839 plumbing gaps** (the whole point of a proving ground —
the epic path had never been exercised by an actual file-associated board). Both are fixed in Persephone
source and belong to the EPIC-042 close-out `/review` + `/document`:

1. **Render path didn't handle the virtual id (`RenderEditor.tsx`).** US-839 wired *construction*
   (`buildEditorById`) and *switch* (`switchMainEditor`) for `board-editor:<root>`, but the **view** loader
   (`RenderEditor.tsx` → `getEditorModule`) still did a static `editorRegistry.getById(editorId)`, which
   throws `No editor registered for id: board-editor:<root>`. Symptom: the crash banner **and** a board
   that never mounts (AsyncEditor's rejected loader → perpetual loading spinner). **Fix:** map any
   `board-editor:<root>` id to the `board-view` view module (same `BoardEditorModel`, same component).

2. **No switch-back UI from a board (`BoardToolbar.tsx` + `PageToolbar.tsx`).** A board renders its own
   `BoardToolbar` (not `PageToolbar`), so the editor-switch `SwitchWidget` never appeared while on the board
   — the user could go Monaco→board but not back. US-839's `BoardEditorModel.findCompatibleEditors()`
   assumed a widget that wasn't rendered. **Fix:** `export` `SwitchWidget` from `PageToolbar.tsx` and render
   it in `BoardToolbar` (its own guard hides it for a plainly-opened board). Board↔Monaco now looks
   identical to every other editor switch (label "Text Editor | DrawIO").

Board-side decisions made during authoring:

3. **Own page tabs instead of GraphViewer's toolbar.** GraphViewer's built-in page/zoom toolbar needs remote
   sprite/stylesheet assets that the board CSP forbids (`connect-src 'self'`, `img-src 'self'`), so with
   `mxLoadStylesheets/mxLoadResources=false` it isn't created at all. The board parses the `<diagram>` pages
   itself and renders an always-visible tab bar (each page re-wrapped into a single-page `<mxfile>` and fed
   to GraphViewer, which decompresses encoded bodies). Better UX than drawio's hover toolbar, and offline.
4. **CSP: repoint remote base URLs to `./lib` (DC4).** `viewer-static.min.js` otherwise injects the MathJax
   loader from `viewer.diagrams.net` (CSP violation in `ui.log`). Setting `window.DRAW_MATH_URL` +
   `STENCIL/IMAGE/SHAPES/RESOURCES_PATH` + `mxBasePath` to same-origin `./lib` before the viewer loads makes
   any missing asset a harmless local 404 rather than a CSP violation. Log is clean after this.

**Verified (window 0, MCP automation):** `.drawio` resolves to the board (default, priority 100) via both
direct open and `openRawLink`; single-page, multi-page (tab-switch Boxes↔Circles), and compressed-body files
all render; board↔Monaco switch both ways (Monaco shows raw XML; `confirmRelease` honored); plainly-opened
board shows the empty state (no switch widget); `ui.log` clean (offline). Not verified: persistence across a
full app restart (relies on US-839 `getRestoreData` pinning `board-view`).

## Files changed / created summary

| File | Change |
|------|--------|
| `C:\projects\persephone-boards\drawio-viewer\board-manifest.json` | NEW (external repo) — Custom Editor fields |
| `C:\projects\persephone-boards\drawio-viewer\index.html` | NEW (external) — container + tabs + viewer script + CSP base-path globals |
| `C:\projects\persephone-boards\drawio-viewer\app.js` | NEW (external) — getFilePath → readFile → parse pages → GraphViewer + own tabs |
| `C:\projects\persephone-boards\drawio-viewer\board-base.css` | NEW (external) — copied by scaffold |
| `C:\projects\persephone-boards\drawio-viewer\lib\viewer-static.min.js` | NEW (external) — vendored drawio v30.3.8 |
| `C:\projects\persephone-boards\drawio-viewer\lib\LICENSE` | NEW (external) — Apache-2.0 |
| `C:\projects\persephone-boards\drawio-viewer\lib\VERSION.txt` | NEW (external) — pinned version + URL |
| `C:\projects\persephone-boards\drawio-viewer\icon.svg` | NEW (external) — board icon |
| `src/renderer/ui/app/RenderEditor.tsx` | MODIFY — map `board-editor:<root>` → `board-view` view module (fix #1) |
| `src/renderer/editors/base/PageToolbar.tsx` | MODIFY — `export` `SwitchWidget` for reuse (fix #2) |
| `src/renderer/editors/board/BoardToolbar.tsx` | MODIFY — render `SwitchWidget` (switch-back from a board; fix #2) |
| `doc/tasks/US-840-drawio-viewer-board/README.md` | NEW (this doc) |
| `doc/epics/EPIC-042.md` | MODIFY — link the carved US-840 row + implementation note |
| `doc/active-work.md` | MODIFY — US-840 entry under EPIC-042 Active |

## Files NOT changed (verified — the plumbing was already live)

- `src/renderer/editors/board/custom-editor-registry.ts`, `board-manifest.ts` — registry + manifest honor
  `fileMasks`/`editorPriority` already (US-836/837).
- `src/renderer/api/pages/PagesLifecycleModel.ts`, `content/resolvers.ts`, `PageModel.ts`,
  `BoardEditorModel.ts` — resolution + switch construction + `getFilePath` wired (US-839/838). (`RenderEditor`,
  `PageToolbar`, `BoardToolbar` DID need the fixes above — the two US-839 gaps.)
- No new Persephone editor under `src/renderer/editors/` — this replaces US-454's built-in plan entirely.
</content>
</invoke>
