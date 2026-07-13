# US-833: Drag files OUT of the Explorer panel to Windows Explorer / Teams

## Goal

Let the user drag a file from Persephone's **Explorer** panel with **Ctrl held** and
drop it onto **Windows Explorer** (to copy) or into a **Microsoft Teams** chat compose
box (to attach) — while **preserving all existing internal drag behavior** on a plain
drag (drag-into-editor, drag-to-open, move between Explorer folders). Today the Explorer
accepts OS file drops *inward* but cannot produce an OS file drag *outward*; this task
adds the outward direction without sacrificing the inward/internal one.

> **Why a modifier (Ctrl), not a plain drag:** a plain drag serves the in-process HTML5
> drag that internal targets need; the OS export needs a native `webContents.startDrag`,
> and the two cannot be the same gesture (a native drag can't be dropped back onto the
> app's own windows). Ctrl was chosen over Alt because Windows reads a held Alt as
> "create shortcut" — which Explorer/Teams reject — whereas Ctrl means "copy". See the
> Implementation status section for the full path that led here.

## Implementation status

### Attempt 1 (native `startDrag`) — REJECTED by testing
Plain drag started a native OS drag via `webContents.startDrag`. Result:
- Drag-out to **Windows Explorer** and **Teams desktop** worked. ✅
- Dropping back into **any Persephone window** (same or second) did nothing — a native
  drag can't be dropped onto the app's own windows.
- Also: on the tester's corporate laptop, **all OS file drops *into* Persephone are
  blocked** (Explorer→app, VS Code→app — any source), independent of this feature
  (corporate endpoint security intercepting cross-process OLE drops). This makes any
  "internal via OS drop" scheme non-viable in that environment.

Conclusion: internal drag must stay a normal **in-process HTML5 trait drag** (immune to
the OS-drop block); native `startDrag` can't serve the internal case. A single native
drag cannot do both.

### Attempt 3 (FINAL) — Ctrl+drag = native `startDrag`; plain drag = internal
The `DownloadURL` file-promise (Attempt 2) was tested and **rejected**: Explorer accepted
it only via a "Save as" **download** dialog (not a copy), and **Teams refused it**
outright ("no drop" cursor) — Teams wants a real file (CF_HDROP), which only native
`startDrag` produces. Since native `startDrag` can't be dropped back onto the app's own
windows, it can't share the plain gesture with internal drag. Per the user's decision,
drag-out is therefore gated on a modifier.

**Modifier = Ctrl, not Alt.** Alt was tried first and failed: Windows treats a held Alt
during a drag as "create shortcut/link", which Explorer and Teams both reject ("no drop"
cursor) — the trigger key sabotaged the drop. `Ctrl` means "copy" to the OS, which is
exactly what an export is and what the targets accept.
- **Plain drag** → the tree's normal in-process HTML5 trait drag (internal move /
  drag-into-editor), unchanged.
- **Ctrl + drag** → native `webContents.startDrag` (clean copy into Explorer + Teams).

Implementation:
- `TreeProviderView.tsx` — `onDragStartOverride` returns `false` unless `e.ctrlKey`
  (and file provider, non-root); when Ctrl is held it `preventDefault()`s and calls
  `api.startOsFileDrag([href])`, returning `true` to take over the gesture.
- `dnd.ts` `effectAllowed` reverted to `"move"`; `DownloadURL`/`pathToFileUrl` removed.
- Native plumbing (`os-drag-service.ts` `startOsFileDrag` via `webContents.startDrag`,
  win32, shell icon + 1×1 PNG fallback) + IPC endpoint `startOsFileDrag` are the live
  path again.

**Discoverability (follow-up):** Alt isn't self-evident — add a hint (row tooltip and/or
user docs) so users find it. To handle at `/userdoc`.

**Superseded — Attempt 2 (HTML5 trait drag + `DownloadURL` file-promise):**
Keep the tree's normal HTML5 trait drag (internal move / drag-into-editor unchanged —
in-process, works even where OS-drops-in are blocked) and additionally attach an OS
**file-promise** (`dataTransfer.setData("DownloadURL", …)`) so the SAME plain drag can
be dropped onto Explorer / Teams. No modifier, no internal regression.
- `TreeProviderView.tsx` — `onDragStartOverride` now *enriches* the drag (sets
  `DownloadURL`) and returns `false` so the trait drag proceeds; `pathToFileUrl` helper.
- `dnd.ts` — trait drag `effectAllowed` changed `"move"` → `"copyMove"` so an OS drop
  target can accept a copy while internal drops still resolve to a move.
- Native `startDrag` plumbing (`os-drag-service.ts` + `startOsFileDrag` IPC) is left in
  place, unused — kept as the fallback if the file-promise doesn't fire.

**Open risk:** whether Chromium honors a `file://` `DownloadURL` for a **local** file
(this is unproven; it may only work for `http(s)`). Testable via drag-*out*, which is
NOT blocked on the corporate laptop.

Typecheck + lint clean. **Please test drag-out** to Windows Explorer and to a Teams
chat, and confirm internal drag (move within the tree / into an editor) still works.
- File-promise fires → **done**: single plain drag serves both, no modifier.
- File-promise does NOT fire → fall back to plain-drag = native drag-out (Attempt 1,
  which worked for export) + internal move via the existing right-click Cut/Paste.

**Deferred regardless:** multi-file drag, folder-specific handling, user docs.

## Feasibility — YES, a single plain drag can do both

Electron's [`webContents.startDrag({ file | files, icon })`](https://www.electronjs.org/docs/latest/tutorial/native-file-drag-drop)
originates a native Windows **CF_HDROP** drag — the format Windows Explorer and the
Teams desktop app consume as a file drop. The concern with a native drag is that it
"replaces" the HTML5 drag, which *seemed* to preclude internal drops. **It does not**,
because of how Persephone already handles OS file drops (see below): a native drag
dropped back inside the app re-enters as an OS file drop and flows through the exact
same code path an internal drag uses. So one plain drag serves every target.

- **Windows Explorer** — file copy. ✅
- **Microsoft Teams (desktop app)** — Electron/Chromium; accepts CF_HDROP onto the
  compose box, no Teams-specific code. Verify manually; no known blocker.
- **Microsoft Teams (web)** — a browser tab is also an OS file-drop target; expected to
  work, treat as "verify".
- **Internal targets** (link editors, notebook, Mneme tree, open-as-tab, other
  Persephone windows) — **preserved**, via the existing OS-drop normalization.

## Background — the architecture that makes this work

### OS file drops are already normalized into the internal trait payload
This is the linchpin. In `src/renderer/api/internal/GlobalEventService.ts`:
- `init()` registers a **capture-phase** `drop` listener `captureDrop`
  (`GlobalEventService.ts:82,128`). For **any** OS file drag (`isFileDrag`), it resolves
  the dropped paths (`window.electron.getPathForFile`) and attaches an **`OsFile` trait
  descriptor** to the native event via `setEventTraitDragData` — the same
  `{ typeId, data }` shape every internal drag uses.
- The `OsFile` trait (`src/renderer/core/traits/fileLinkTraits.ts:35,41`,
  `TraitTypeId.OsFile`) exposes `FILE_LINK.getFiles()` → `IFileLink[]` with a lazy
  `getBytes()`.
- A **bubble-phase** fallback `handleFileDropFallback` (`GlobalEventService.ts:141`)
  opens dropped files as tabs **only if** no descendant target consumed the drop
  (targets call `stopPropagation`).

Net effect: **every internal drop target reads drags through
`getTraitDragDataFromEvent` and does not care whether the drag came from inside the app
or from the OS.** An OS file drop is already a first-class internal drag.

### The internal drag source (what we're changing)
- Explorer = `TreeProviderView` over a **file provider** (`provider.type === "file"`,
  `node.data.href` = absolute path). `supportsOsClipboard(provider)` in
  `src/renderer/components/tree-provider/os-clipboard.ts` is the exact "local file
  provider" gate to reuse.
- Drag starts in UIKit `TreeModel.onDragStart` (`src/renderer/uikit/Tree/TreeModel.ts:440`),
  which writes an **`ILink` trait payload** `{ items:[node.data], sourceId }` from
  `getDragData` (`TreeProviderView.tsx:169`). The `sourceId` is `provider.sourceUrl`.

### The one difference between an internal drag and an OS-file drag
The internal `ILink` payload carries the `LINK` trait **with `sourceId`**; the `OsFile`
descriptor carries only `FILE_LINK` (no `sourceId`). `sourceId` is what marks a drag as
a **same-provider move** vs a foreign **copy/import** (`canTraitDrop`,
`TreeProviderView.tsx:175-184`). Consequently, if a plain drag becomes a native OS drag:
- Drop into link editor / notebook / Mneme / open-as-tab / another window → consumes
  `FILE_LINK` → **works** (import a copy — identical to dragging a file in from Windows
  Explorer today).
- Drop within the **same** Explorer tree to another folder → would be an import (copy)
  instead of a **move**, and self-drop would import-onto-self.

That gap is closable (Plan step 4).

### IPC + icon plumbing already present
- Controller methods get `event: IpcMainEvent`; `event.sender` **is the `WebContents`**
  that owns `startDrag`. Endpoints: declare in `src/ipc/api-types.ts`, bind in
  `src/ipc/main/controller.ts` (`bindEndpoint`), call from
  `src/ipc/renderer/api.ts` (`executeOnce`). `clipboardWriteFilePaths` is the template.
- `startDrag` needs a non-empty icon `NativeImage` (throws otherwise on Windows). The
  `getFileIcon(filePath)` endpoint (`controller.ts:145`, `fileIconCache`) returns a
  data-URL → `nativeImage.createFromDataURL(...)` in main gives the real shell icon.

## The crux — one empirical behavior to verify FIRST (spike)

Everything rests on: **a `webContents.startDrag` OLE drag, dropped on its own window,
is re-delivered to the web content as an inbound OS file drop** (so `captureDrop`
fires). This is how same-process OLE drag normally behaves, but it cannot be proven
from source — so **Plan step 0 is a throwaway spike** before committing to the full
build.

- **If the spike confirms it** → build the plain-drag design (steps 1-5), zero
  regression.
- **If it does NOT** (Chromium swallows the self-drop / the drag "escapes" the web
  content) → fall back to an **Alt-modifier** design: plain drag stays internal, Alt+drag
  starts the native OS drag. (Same steps 1-3, but step 4 gates on `e.altKey` instead of
  the in-memory bridge, and there is no move-semantics gap to bridge.)

## Implementation plan

0. **Spike (throwaway, ~30 min).** Temporarily make Explorer file rows start a native
   drag (`event.preventDefault()` in `onDragStart` + a hardcoded `startDrag` via a
   quick IPC call). Manually verify: (a) drop on Windows Explorer copies the file;
   (b) drop **back onto a Persephone link editor / the tree in the same window** still
   imports it (proves `captureDrop` fires for a self-originated native drag);
   (c) drop onto a **second Persephone window** imports it there (expected — a second
   window is just another OS drop target, like Explorer). Record the result in this
   doc, then revert the spike.

1. **Main service — `src/main/os-drag-service.ts` (new).**
   - `export async function startOsFileDrag(sender: WebContents, paths: string[]): Promise<void>`
   - Filter to existing absolute paths. Build the icon:
     `fileIconCache.getFileIcon(paths[0])` → `nativeImage.createFromDataURL(...)`; if
     empty, fall back to a small bundled generic-file PNG (add under `assets/`) so
     `startDrag` never throws.
   - Call `sender.startDrag({ file, icon })` for one path, `{ files, icon }` for many
     (never both). `win32`-only; no-op elsewhere (mirrors clip-service degradation).

2. **IPC endpoint — mirror `clipboardWriteFilePaths`.**
   - `src/ipc/api-types.ts`: `Endpoint.startOsFileDrag`, signature `(paths: string[]) => Promise<void>`.
   - `src/ipc/main/controller.ts`: method that lazy-imports `os-drag-service` and calls
     `startOsFileDrag(event.sender, paths)`; add `bindEndpoint(...)`.
   - `src/ipc/renderer/api.ts`: `startOsFileDrag = (paths) => executeOnce(Endpoint.startOsFileDrag, paths)`.

3. **UIKit Tree hook (keep UIKit electron-free).**
   - Add optional prop `onDragStartOverride?: (source, level, e: React.DragEvent) => boolean`
     to `Tree` (`types.ts` + `Tree.tsx`).
   - In `TreeModel.onDragStart` (`TreeModel.ts:440`), before building trait data: if
     `props.onDragStartOverride?.(source, level, e)` returns `true`, the override took
     the gesture (it called `preventDefault`) — `return`. UIKit stays Electron-agnostic.

4. **App wiring + move-semantics bridge — `TreeProviderView.tsx` (+ a small module).**
   - `onDragStartOverride`: return `false` unless `supportsOsClipboard(provider)`. Else:
     gather drag paths (step 5), record an **in-memory internal-drag context**
     `{ sourceId: provider.sourceUrl, paths, typeId: provider.dragTraitTypeId ?? ILink, data: getDragData(node) }`
     in a **per-renderer** module-level singleton (e.g.
     `src/renderer/core/traits/os-drag-context.ts`), `e.preventDefault()`, call
     `api.startOsFileDrag(paths)`, return `true`. Clear the context on `dragend` / next
     drag start.
   - **Bridge in `GlobalEventService.captureDrop`**: when it tags an OS file drop, if the
     dropped paths match **this window's** in-memory internal-drag context (i.e. a
     native drag that started **and ended in the same window**), attach the **original
     `LINK`/`sourceId` payload** instead of the bare `OsFile` descriptor — restoring
     same-provider **move** semantics. All other OS drops (foreign paths, OR a drag from
     Windows Explorer, OR a native drag from **another Persephone window** — whose
     context lives in a different renderer and is therefore invisible here) keep the
     plain `OsFile` copy/import behavior. This is correct: "move" only applies within a
     single provider/tree, which always lives in one window, so a per-renderer singleton
     covers exactly the case that needs it.
   - Pass `onDragStartOverride` to `<Tree/>` (gated on `writable`).

5. **Multi-select paths.** If the dragged node is in the current multi-selection, export
   all selected file paths; else just the dragged node's `href`. Confirm how
   `TreeProviderViewModel` exposes multi-selection during implementation; if only
   single-selection is reliable, ship single-file first and track multi-file as a
   follow-up.

6. **Discoverability + docs.** No modifier needed — dragging "just works". Update user
   docs under `/docs/` to mention dragging files from Explorer to the desktop / Teams.

## Concerns / open questions

1. **Crux verification (Plan step 0)** — the self-drop re-delivery behavior. Highest
   priority; gates the whole plain-drag approach vs the Alt fallback.
2. **Async IPC timing.** `startDrag` runs a moment after `dragstart` (renderer→main
   hop). Documented Electron pattern; works on Windows because the button is still down.
   Verify on a real build. (`nodeIntegration: true` could allow a direct call, but the
   standard `executeOnce` hop is the safe route.)
3. **Icon fallback is mandatory** — empty icon throws.
4. **Provider scope** — only `provider.type === "file"` (absolute paths) may start an OS
   drag. Mneme / archive / link / peer never do. Gate on `supportsOsClipboard`.
5. **Move-vs-copy bridge** (step 4) — verify the in-memory context correctly restores
   move semantics and never leaks across drags (clear on `dragend`). If judged too
   subtle, an acceptable v1 is: accept that intra-Explorer cross-folder drag becomes a
   **copy** (still correct, just not a move) and ship the bridge as a follow-up.
6. **Teams verification** — desktop + web, manual. Note: the existing Explorer "Copy"
   action already lets users **paste** a file into Teams (Ctrl+V), so this is additive,
   not a sole path.
7. **Directories** — allow folder drag to Explorer (CF_HDROP copies the tree); Teams
   typically ignores folders. Suggest allow.

## Acceptance criteria

- [x] **Ctrl + drag** of a file from the Explorer panel onto a Windows Explorer folder
  **copies** the file there (verified).
- [x] **Ctrl + drag** of a file onto a Microsoft Teams **desktop** chat compose box
  attaches it to the draft message (verified).
- [x] **Plain** drag (no modifier) still performs the existing internal behavior — move
  between Explorer folders and drag-into-editor are unchanged (verified).
- [x] Non-file providers (Mneme, archive, link) never start an OS drag (gated on
  `supportsOsClipboard`).
- [x] No crash/throw when a file lacks a resolvable shell icon (1×1 PNG fallback in
  `os-drag-service.ts`).

**Deferred to a follow-up (out of scope for this task):**
- Multi-file (multi-select) drag — ships single-file; `handleOsDragStart` passes only the
  dragged node's `href`.
- Folder drag-out semantics.
- Discoverability hint for Ctrl (handled at `/userdoc` — see below).

## Files changed

| File | Change |
|------|--------|
| `src/main/os-drag-service.ts` | **New.** `startOsFileDrag(sender, paths)` — native `webContents.startDrag` (win32; shell icon via `app.getFileIcon` + 1×1 PNG fallback; single/multi `files`). |
| `src/ipc/api-types.ts` | New `Endpoint.startOsFileDrag` + handler signature `(paths: string[]) => Promise<void>`. |
| `src/ipc/main/controller.ts` | `startOsFileDrag` controller method (lazy-imports the service, passes `event.sender`) + `bindEndpoint`. |
| `src/ipc/renderer/api.ts` | `startOsFileDrag(paths)` client wrapper over `executeOnce`. |
| `src/renderer/uikit/Tree/types.ts` | New `onDragStartOverride?` prop (first-chance `dragstart` hook; UIKit stays Electron-free). |
| `src/renderer/uikit/Tree/TreeModel.ts` | `onDragStart` consults `onDragStartOverride` first; `canDragRow` also enabled by that prop. |
| `src/renderer/components/tree-provider/TreeProviderView.tsx` | Wires `onDragStartOverride` for `supportsOsClipboard` providers: on **Ctrl** (non-root), `preventDefault()` + `api.startOsFileDrag([href])`. |
