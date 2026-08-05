# EPIC-047: Move the PDF Viewer to a Published Board

## Status

**Status:** Completed
**Created:** 2026-08-04
**Completed:** 2026-08-05

## Overview

The built-in PDF viewer ships pdf.js as a **21 MB** static asset folder (`assets/pdfjs/`) that is
copied verbatim into the installer, whether or not a given user ever opens a PDF. The viewer itself
is thin — an `<object>` pointing at pdf.js's own stock `viewer.html` — so almost all of that weight
is a third-party bundle, exactly the kind of payload the published-boards catalog exists to move out
of the installer and make opt-in.

This epic relocates the PDF viewer into a `pdf-viewer` board in the `persephone-boards` catalog,
verifies it matches the built-in viewer's behavior while both still exist side by side, and only then
deletes the built-in editor and its asset folder.

## Feasibility summary

The move is possible. The board plumbing it needs already exists and is already in production use by
other catalog boards; the open risk is confined to the board CSP.

**What already works in our favor**

- `board-manifest.json` supports `fileMasks: ["*.pdf"]` + `editorKind: "simple"` +
  `editorPriority`, which is exactly how a board becomes the editor for a file type.
- A simple (non-content-host) custom-editor board receives the opened file's path via
  `persephone.getFilePath()`, and can read binary content with
  `persephone.files.readFile(path, { encoding: "base64" })`.
- Two shipped catalog boards already follow this pattern for binary formats: `excel-viewer`
  (bundles a ~1 MB `xlsx` library, reads base64) and `pe-viewer` (parses PE binaries in-frame).
  `sqlite-viewer` demonstrates the alternative pattern — heavy work delegated to a Node backend
  script via `persephone.executeNode`.
- The built-in editor has very little logic to port: `PdfEditor.ts` handles state, pipe
  reconstruction and a temp cache file; `PdfView.tsx` is 25 lines that build a
  `app-asset://pdfjs/web/viewer.html?file=safe-file://…` URL. The user-visible viewer UI is entirely
  pdf.js's stock viewer, not our code.

**The main risk — the board CSP is currently too tight for pdf.js**

`BOARD_CSP` in `src/main/board-protocol-service.ts` is `default-src 'none'` plus explicit
`script-src`/`style-src`/`img-src`/`font-src`/`connect-src`/`media-src`. Consequences:

| Missing directive | pdf.js feature it blocks |
|---|---|
| `frame-src` / `child-src` | A board cannot nest an iframe at all — blocks reusing pdf.js's stock `viewer.html` |
| `worker-src` | `pdf.worker.mjs` cannot start; pdf.js falls back to an in-thread fake worker (UI jank on large files) |
| `'wasm-unsafe-eval'` | `openjpeg.wasm` — JPEG 2000 images inside PDFs fail to decode |
| `'unsafe-eval'` | `pdf.sandbox.mjs` — embedded AcroForm JavaScript (acceptable to drop) |

No board in the catalog today uses a Worker or WebAssembly, so none of this is empirically proven —
it needs a spike before the rest of the epic is committed to. All four widenings stay same-origin
(`'self'` / `blob:`); none of them re-admits remote content, so the sandbox's core property is
preserved. The decision to widen is nonetheless an app-security decision and belongs in the spike's
outcome, not assumed here.

**Non-local sources: a binary content host** *(this subsection records the original reasoning; the
design was superseded — see **Decisions** and [US-907](../tasks/US-907-board-binary-source/README.md))*

Archive-embedded and remote PDFs must keep working, so the board needs the content pipe rather than a
plain local `readFile`. The mechanism to copy is the existing content-host board
(`editorKind: "content-host"` → `BoardContentEditorModel`, used by the `todo` board), which composes
an `IContentHost` and pushes content into the frame as a `host:content` message, exposed to the board
as `persephone.host.getContent()` / `onContentChange()`.

A binary sibling — `editorKind: "binary-host"` — follows the same shape but carries bytes and is
**read-only for now**: no `setContent`, no save, no dirty tracking. Notably, the model it needs is
almost exactly `PdfEditor` minus the view: own a `ContentPipe` built from the source (including
`archive.zip!entry.pdf` bang notation, as `PdfEditor.ensurePipe()` does), `readBinary()` it, and hand
the bytes to the frame. Archive and HTTP support then comes for free, because the resolver layer
already builds the correct pipe for those sources before the editor ever sees them.

Two ways to get the bytes into the frame, to be decided in the spike since it interacts with the CSP
question:

- **Push** — send an `ArrayBuffer` over `postMessage` (structured clone / transferable, not base64:
  no 33% inflation and no encode cost). Simple and symmetric with `host:content`, but the whole
  document sits in memory twice (the model must retain a copy to re-push after a `board_refresh`),
  and pdf.js loads it as one blob with no progressive rendering.
- **Serve** — write the pipe's bytes to a temp cache file (again, exactly what `PdfEditor.restore()`
  already does for non-local sources) and let the `board://` handler serve them at a reserved path
  such as `board://<host>/~source`. pdf.js's viewer is built for HTTP range requests, so this gives
  progressive rendering of large documents, avoids a large `postMessage`, and needs no `blob:` in
  `connect-src`. The cost is teaching `board-protocol-service` (main) about a renderer-owned pipe's
  cache file.

The Serve variant is the better fit for large PDFs and is the recommended default; Push is the
simpler fallback and may be adequate if measurements show it is.

**Two implementation routes**

- **Route A (preferred): bundle pdf.js's stock `viewer.html` and iframe it.** The board's
  `index.html` reads the file, wraps the bytes in a `blob:` URL, and points a nested
  `<iframe src="lib/pdfjs/web/viewer.html?file=…">` at it (same origin, so the child can read the
  parent's blob URL). This inherits the full stock UI for free — search, thumbnails, outline, page
  navigation, zoom/fit, rotate, text-selection layer, annotations, print, download — and is the
  closest possible match to today's behavior. Requires `frame-src 'self'` plus `worker-src`/`blob:`
  in `connect-src`.
- **Route B (fallback): the board page is a hand-written pdf.js canvas viewer.** Imports `pdf.mjs`
  as a library and renders pages to `<canvas>`. Avoids `frame-src`, but every viewer feature has to
  be re-implemented, which is a large amount of work and makes feature regressions near-certain.

Recommendation: Route A, with Route B held in reserve if the spike concludes `frame-src` must stay
closed.

**A free win, independent of the move**

Of the 21 MB, roughly **10.5 MB is dead weight that ships today**: ~9.5 MB of `.map` source maps
(`pdf.worker.mjs.map` alone is 5.2 MB) and pdf.js's own 1 MB sample document
`web/compressed.tracemonkey-pldi-09.pdf`. Both are present in `release/win-unpacked`, so they are in
the installer. Pruning them is a zero-behavior-change task worth doing regardless of whether the
board move lands, and it also halves the board archive users would download.

Remaining real payload after pruning: `pdf.worker.mjs` 1.9 MB, `pdf.mjs` 0.8 MB,
`pdf.sandbox.mjs` 0.7 MB, locale 2.5 MB, cmaps 1.5 MB, standard_fonts 0.8 MB, wasm 0.8 MB,
`viewer.css` 0.3 MB, `viewer.mjs` 0.6 MB — around 10 MB, further reducible by dropping
`pdf.sandbox.mjs` (no embedded-JS support in a sandboxed board anyway) and trimming locales.

## Goals

- Cut roughly 21 MB from the installer and make PDF viewing an opt-in catalog install.
- Reach behavioral parity with the built-in viewer before anything is deleted, verified against a
  written checklist rather than by impression.
- Keep the two implementations coexisting during the whole verification phase, so a failed board is
  never a regression for users.
- Leave the app's board sandbox no weaker than a same-origin-only policy.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| US-904 | Prune shipped pdf.js dead weight (`.map` files, sample PDF) from `assets/pdfjs/` | Done |
| US-905 | `pdf-viewer` board v1 in `persephone-boards` — local files only; doubles as the CSP spike (Worker / WASM / nested iframe), settles Route A vs B | Done |
| US-906 | Widen `BOARD_CSP` for the directives US-905 proved necessary (same-origin only) | Done |
| US-907 | [Binary source for custom-editor boards — read the page's content pipe from a board, whatever the source](../tasks/US-907-board-binary-source/README.md) | Done |
| US-908 | `pdf-viewer` board v2 — archive-embedded and remote PDFs (largely delivered by US-907: the board needed only `editorSources: "any"` + error handling) | Done |
| US-909 | Parity verification against the built-in viewer (checklist below) | Done |
| US-910 | Publish `pdf-viewer` to the catalog (`boards-manifest.json`, release archive, versions manifest) | Done |
| US-911 | [Remove the built-in PDF editor, `assets/pdfjs/`, and the now-unused `safe-file://` scheme — then drop the board's `editorPriority` from 200](../tasks/US-911-remove-builtin-pdf/README.md) | Done |

US-905 is deliberately both the first deliverable and the spike: a working local-file board answers
every CSP question empirically, and if the answers are bad it is the cheapest possible point to
discover that. US-906 unblocks whatever US-905 found missing; US-907 and US-908 then close the
non-local gap before parity is judged.

## Parity checklist (US-909)

Verify against the same set of PDFs in both the built-in viewer and the board:

- Open from Explorer, from a tab's file-open dialog, and by drag-and-drop.
- Page navigation, scrolling, zoom, fit-width / fit-page, rotate.
- Text selection and copy; in-document search (and no collision with the app's own Ctrl+F).
- Thumbnails sidebar, document outline / bookmarks.
- Print, and Save-as / download from inside the `board://` frame.
- Large document (100+ pages) — responsiveness, and whether the Worker actually started.
- A PDF containing JPEG 2000 images (the WASM path).
- A PDF inside an archive (`archive.zip!doc.pdf`) and a PDF opened from an HTTP URL — the binary-host
  path (US-907 / US-908). These are the cases the built-in editor handles by reading through the
  content pipe into a temp cache file, and the ones most likely to regress.
- Session restore: close and reopen the app with a PDF tab open.
- Tab title, tab icon, and the tab context menu (Show in File Explorer / Copy File Path).
- Both light and dark themes.

## Decisions

Settled before implementation; recorded here so they are not re-litigated:

- **CSP is checked first**, via the v1 board itself (US-905) rather than a throwaway test board.
- **Non-local sources are not droppable.** Archive-embedded and `https` PDFs must work; the content
  pipe is made reachable from the board (US-907).
- **The binary source is read-only for now.** No write-back, no save, no dirty tracking. A writable
  variant is out of scope for this epic.
- **No mirrored `editorKind: "binary-host"`.** The epic first assumed a binary sibling of the text
  content host — a new manifest kind plus a pipe-owning model subclass. US-907's investigation
  superseded that: a simple custom-editor board already receives the page's live pipe, so the whole
  capability reduces to **materializing** a non-local source to a local cache file. No model subclass
  and no restore-time discriminator.
- **One accessor, not two: `getFilePath()` always returns a readable local path.** For an archive
  entry or a URL it returns a cache file Persephone materialized from the pipe (named after the
  source, so a board's file-name label stays correct); for a plain local file it returns the source
  path unchanged. The board-facing contract does not change at all — no new API and nothing for board
  authors to learn, which also means no board-documentation change. A separate bytes accessor was
  considered and rejected: its failure mode is silent (works locally, fails on the sources an author
  never tests).
- **One manifest field is still required: `editorSources: "local" | "any"`.** `resolveEditorIdForFile`
  refuses to offer a non-local file (archive entry / URL) to a *simple* board, so the board would
  never be constructed for the very sources this epic must support. That decision is made before any
  board code runs, so unlike the bytes API it cannot be opt-in-by-calling. It is a declarative gate on
  the existing Custom Editor axis, not a revival of `binary-host`. The gate must stay closed by
  default: `excel-viewer` / `pe-viewer` read via `readFile` and would break on those sources.
- **Uninstalled-board fallback: accepted as-is.** After US-911 a `.pdf` with no board installed falls
  to monaco, whose large-binary guard already warns and declines to render fully. No placeholder
  editor, no catalog hint.
- **`editorPriority` during coexistence: set it above `pdf-view`'s 100** so the board is the default
  while both exist. ~~Reset it to a low value before publishing (US-910)~~ — **revised: it ships at
  200 and is lowered later.** Lowering it before the built-in editor is removed would break the
  published board outright: `pdf-view` claims `.pdf` at 100 and ties go to the built-in, so a
  low-priority board would install and then never open a PDF. 200 is correct in both worlds (it also
  clears monaco's 0 floor once `pdf-view` is gone), so the reset is purely ladder hygiene — squatting
  on the top `category` tier leaves no room for another board to claim `.pdf`. ~~It moves to US-911 …
  and ships as a board version bump.~~ **Revised again in US-911: 200 stays published, and the drop
  ships unreleased.** Once `pdf-view` is gone nothing built-in claims `.pdf`, so 200 keeps working
  indefinitely and the drop has no user-visible effect. Publishing it as its own version would spend a
  version number and an update prompt for nothing, and would create a `minAppVersion` sequencing
  hazard that not publishing avoids entirely. The 200 → 100 edit is committed to `persephone-boards`
  `develop` and rides along with the board's next functional release.
- **`safe-file://` is removed** along with the built-in editor (US-911).
- **pdf.js license and version travel with the board** (`lib/LICENSE`, `lib/VERSION.txt`), matching
  `excel-viewer` and `sqlite-viewer`.
- **Update cadence shifting to the catalog is accepted.** pdf.js security fixes will arrive as board
  version bumps rather than app releases.

## Open questions

- ~~**Route A vs Route B**~~ — **settled: Route A.** US-905 confirmed a board can nest an iframe and
  reuse pdf.js's stock `viewer.html` once `frame-src 'self'` is granted. No hand-written canvas
  viewer is needed.
- ~~**Push vs Serve for the binary host**~~ — **settled: neither.** US-907's investigation found that
  `ContentPipe.readBinary()` is all-or-nothing, so an HTTP source is fully downloaded before the
  board sees a byte either way — progressive rendering was the last argument for serving bytes over
  `board://`, and it is not available to us. Push was dropped because the model would have to retain
  the whole document to re-push it after a frame reload. The plan is to **materialize a non-local
  source to a temp cache file** (exactly what `PdfEditor` already does) and hand the board its
  **path**, which it reads with the existing `readFile` RPC — so the bytes never enter the renderer
  at all. See [US-907](../tasks/US-907-board-binary-source/README.md).
- ~~**Whether the binary source needs a manifest `editorKind` at all**~~ — **settled: it does not.**
  See the corresponding entry under **Decisions**.
- ~~**Print and Save-as from inside a `board://` frame**~~ — **settled: both work.** Closed by the
  US-909 manual pass; no bridge support and no further CSP change were needed.
- ~~**Memory ceiling.**~~ — **moot: Push was not chosen.** Nothing retains the document, so the
  double-hold this question was about cannot occur. What remains is ordinary and unbounded in the
  same way the built-in editor always was: materializing a non-local source reads it fully into
  memory once before writing the cache file, and the board holds the frame's copy. No file-size
  limit was introduced.

## Notes

### 2026-08-04
- Epic created. Measured `assets/pdfjs/` at 21 MB shipped, of which ~10.5 MB is `.map` files plus
  pdf.js's own 1 MB sample PDF — pruning those is a standalone win (US-904).
- Confirmed the required board capabilities already exist (`fileMasks` + `editorKind: "simple"` +
  `getFilePath()` + base64 `readFile`), with `excel-viewer` and `pe-viewer` as working precedents.
- Confirmed no existing board uses a Worker or WebAssembly, so pdf.js's Worker and `openjpeg.wasm`
  paths are unproven under `BOARD_CSP`. This is the epic's gating risk (US-905).

### 2026-08-05
- Concerns reviewed and settled — see **Decisions**. Non-local sources will be served by a new
  read-only `editorKind: "binary-host"` modeled on the existing text content host, rather than by a
  bridge call that reads a path. Observation behind the choice: `PdfEditor`'s entire non-view logic
  *is* pipe ownership plus temp-cache handling, so this generalizes the built-in editor into a board
  capability instead of reimplementing it. The uninstalled-board fallback was accepted as-is
  (monaco's large-binary guard is sufficient), removing one task from the plan.
- US-904 implemented: `assets/pdfjs/` pruned from 21 MB to 11 MB (4 source maps, 9.1 MB; pdf.js's own
  sample document, 1.0 MB) with the dangling `sourceMappingURL` trailers stripped from the four
  corresponding `.mjs` files. `assets/pdfjs/PRUNED.md` records the procedure so the next pdf.js
  upgrade re-applies it instead of silently restoring 10 MB. Also documents what must NOT be pruned
  (locales, cmaps, standard fonts, wasm, sandbox) so the same instinct does not cause a regression.
- US-905 + US-906 implemented. The `pdf-viewer` board (tracked as `BT-006` in `persephone-boards`)
  renders local PDFs through pdf.js's unmodified stock viewer in a nested same-origin iframe, with
  the full toolbar working — verified live: 14-page document, thumbnails sidebar, in-document search
  (9 matches highlighted), page navigation, zoom, intact text layer, real Worker (no "fake worker"
  fallback), clean `ui.log`.

  **CSP spike result** — probed from inside the board frame on 4.0.18:

  | Capability | Directive | Before | After |
  |---|---|---|---|
  | Nested iframe | `frame-src` | blocked (frame ended at `chrome-error://chromewebdata/`) | works |
  | pdf.js Worker | `worker-src` | already worked | works |
  | WebAssembly | `script-src 'wasm-unsafe-eval'` | blocked | works |

  The Worker was permitted all along — `worker-src` falls back through `child-src` to
  `script-src 'self'`, which `BOARD_CSP` already granted (verified by round-tripping a message from
  `pdf.worker.mjs`, not merely constructing it). `BOARD_CSP` gained `frame-src 'self'` and
  `'wasm-unsafe-eval'`, both same-origin only — no remote content is admitted — plus an explicit
  `worker-src 'self'` so the inherited fallback cannot break silently if `script-src` is tightened.
- US-907 investigated and documented. Two findings changed its shape: a simple custom-editor board
  **already receives the page's live content pipe** (`createEditorFromFile` assigns it; the board
  disposed it unread), and `IContentHost.content` is a `string` — so the text content host cannot be
  reused for bytes and any binary variant is parallel code. Together those argue for a much smaller
  mechanism than a mirrored `editorKind: "binary-host"`. The lighter design was reviewed and
  **approved** — recorded under **Decisions**; the earlier `binary-host` assumption is superseded.
  A follow-up check then found the real blocker: `resolveEditorIdForFile` never offers a non-local
  file to a simple board, so US-908 would have failed even with the bridge work done. That adds one
  declarative manifest field (`editorSources`) to US-907 — also recorded under **Decisions**.
- US-907 implemented and verified live: the `pdf-viewer` board now opens a local PDF, an
  archive-embedded PDF, and a remote `http(s)` PDF, all through the same unchanged board code path
  (`getFilePath()` → `readFile`). Implementation found **two more resolution gates** beyond the one the
  investigation identified — the Layer 2 file resolver skipped the merged resolver entirely for a
  non-local url, and the http resolver picks its editor from a hardcoded extension table. Both are
  fixed, the http one deliberately narrowly (a board may override the table's editor, but the table
  still decides browser-vs-content, so a board claiming `*.html` cannot hijack web navigation). Also
  fixed a cache-folder leak on restored pages, and a dev-server papercut where the board shim was
  cached for the process lifetime despite `dev.mjs` documenting the opposite. Details and evidence in
  the task document.
- US-907's remaining concerns reviewed and accepted (no live reload, no encryption for binary sources,
  materialization memory, base64 inflation deferred, empty switch widget, per-tab cache files, the
  URL-query mask limitation). The two-accessor design was then dropped in favor of redefining
  `getFilePath()` — see **Decisions**. Net effect: US-907 changes app internals only, and both the
  board-facing API and the board authoring docs stay as they are.
- Two design points from US-905 worth keeping: the board hands bytes to the viewer via
  `contentWindow.PDFViewerApplication.open({ data })` rather than a `blob:` URL, because the nested
  frame is same-origin and a blob URL would have required widening `connect-src` too; and the iframe
  is loaded with an **empty** `?file=`, which suppresses the stock viewer's auto-open of the sample
  document pruned out in US-904 (`file = params.get("file") ?? defaultUrl` then `if (file) …`).
- US-908 implemented, entirely in `persephone-boards` (no app change). Confirms the US-907 design
  claim in the strongest available way: **the board has no source-specific code**. Its whole
  contribution is the declarative `editorSources: "any"` gate plus a `try/catch`, because
  `getFilePath()` can now reject (missing archive entry, HTTP failure) where before it could only
  return a path or `undefined`. Two changes followed from the new *timing* rather than the new
  sources — the viewer frame now loads in parallel with `getFilePath()` (for a remote PDF that call
  completes only after the whole download, since the content pipe is all-or-nothing), and an
  "Opening…" status covers that window so a remote open is never an unexplained blank frame. Verified
  live across a local file, `pdfs.zip!sample.pdf`, and a remote `https` PDF — all 14 pages rendered
  through one code path — plus the rejection case, which reports "File not found in archive". The
  board's version stays **1.0.0**: 1.0.0 is unpublished, so archive/remote support is folded into the
  first release notes rather than shipped as a bump nobody could have installed.
- US-910 published: `pdf-viewer-v1.0.0` is live in the catalog (3.5 MB ZIP from an 11 MB folder,
  sha256-verified, `minAppVersion: 4.0.18`). Published **ahead of the 4.0.18 release** by decision —
  the board needs `frame-src` / `wasm-unsafe-eval` and the `editorSources` gate, none of which have
  shipped, so `isCompatible` keeps it uninstallable until 4.0.18 goes out and it then becomes
  available with no further action. The alternative was holding the merge and remembering it at
  release time. Two things to know about the catalog entry: the publish script writes a **fixed field
  set**, so `editorSources` and `editorPriority` do NOT appear in `boards-manifest.json` — they travel
  inside the release ZIP's own `board-manifest.json`, which is what `customEditorRegistry` reads, so
  nothing is lost. And US-909's parity gaps (print / Save-as from a `board://` frame) are still
  unverified at 1.0.0; a fix ships as 1.0.1.
- US-909 verified by the user's own manual pass over the parity checklist against the same documents
  in both viewers: everything works, including the two items that were open questions rather than
  expectations — **print and Save-as from inside the `board://` frame**. Both needed no bridge support
  and no further CSP change, which retires the epic's fallback plan for them. With parity confirmed
  and 1.0.0 published, the only thing keeping the built-in editor alive is US-911 itself.
- US-911 investigated and documented: [task doc](../tasks/US-911-remove-builtin-pdf/README.md). The
  deletion itself is mechanical — 17 sites, and `safe-file://` has exactly one producer
  (`PdfView.tsx`), so the scheme leaves cleanly. Three findings changed the task's shape. **Remote
  `.pdf` URLs cannot simply lose their entry** in the `httpContentExtensions` table: that table also
  decides browser-vs-content, and the board override is only consulted when a mapping exists, so
  deleting the row would send every remote PDF to the browser tab *even with the board installed* —
  regressing a case US-908 verified. **A persisted PDF tab silently disappears** on restore once
  `pdf-view` leaves `NO_HOST_EDITOR_IDS` (the descriptor hits the "unrecognized editor descriptor"
  branch); a small compat shim that reopens it through `resolveEditorIdForFile` would land it in the
  board instead. And **`target: "pdf-view"` survives in users' saved `.links.json` files** even after
  the `EditLinkDialog` option is removed, so that path needs a live check. Separately, the epic's
  "publish the priority drop as a version bump" decision is worth revisiting: with nothing built-in
  claiming `.pdf`, 200 → 100 is invisible to users, so a standalone 1.0.1 spends a version number and
  an update prompt for no observable change — folding it into the board's next functional release is
  the cheaper path.
- US-911's concerns reviewed and **all settled** — recorded in the task document. The remote-`.pdf`
  route gets the board-else-browser fallback (a `browserFallback` mapping flag, so an installed board
  still wins and a bare Chromium tab is the no-board outcome). The other four are all "accept the
  degradation, add no code": a persisted PDF tab is **dropped** on the one upgrade that removes the
  editor rather than carrying a permanent compat shim; a saved link with `target: "pdf-view"` gets no
  remap (the `.pdf` extension routes it anyway); and the script-facing `EditorId` value is removed
  outright with no alias. The reasoning is the same in each case — a one-upgrade or effectively-unused
  concern is not worth permanent code to maintain. And `editorPriority` **stays at 200 in the published
  board**, with the drop to 100 committed unreleased; see the revised entry under **Decisions**.
- US-911 implemented. The built-in `pdf-view` editor, `assets/pdfjs/` (11 MB) and the `safe-file://`
  scheme are gone; `tsc --noEmit` and `npm run lint` are clean. The only site the investigation missed
  was `src/renderer/editors/index.ts`, which still re-exported `./pdf` from the editors barrel — caught
  immediately by the build. `safe-file://` came out as cleanly as predicted: one producer, plus two
  blocklists and one allowlist regex that merely named it. Five prose-only sites were corrected so no
  dangling reference to a deleted editor survives — notably the `create_page` MCP tool description,
  which listed `pdf-view` among the unsupported page-editors. Also learned: `assets/editor-types/*.d.ts`
  is **mirrored from `src/renderer/api/types/`** by the dev server, so those two copies do not need
  separate edits.

  Remote `.pdf` URLs now route board-first: `httpContentExtensions` gained an optional
  `browserFallback` flag (with `editor` becoming optional), so `.pdf` stays in the table — which is what
  keeps the board lookup reachable — and falls through to `openLinkInBrowser()` only when no board
  claims it. With the board installed, US-908's verified path is unchanged; without it, Chromium's own
  PDF viewer handles the URL in a browser tab, which is a better uninstalled-board fallback than the
  epic originally accepted for remote sources.
