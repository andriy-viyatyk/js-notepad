# EPIC-042: Boards as Custom Editors — file association, editor switch, filePath-in boards

## Status

**Status:** 📝 Planning — created **2026-07-14**; **design finalized (CE1–CE8 all resolved 2026-07-14)**, ready for task carving on the user's go-ahead
**Follows:** [EPIC-035 — Boards Anywhere](EPIC-035.md) (the direct predecessor; this epic is EPIC-035's explicitly-named **successor** — see EPIC-035 C6/C8 and its "Future axis — Custom Editor" section)

> Design is **finalized** — all open questions (CE1–CE8 below) resolved. Tasks are **not yet carved**; each gets a full Goal → Background → Implementation Plan → Concerns → Acceptance doc **before** its implementation begins. Do **not** start implementation until the tasks are carved and the user says "let's implement".

## The big idea

A **Board** is already a portable, sandboxed mini-app that opens on a Persephone page and can do almost anything (EPIC-034/035). The one thing it can't do yet is behave like an **editor for a file type**: open a file, be offered in the editor **switch** next to Monaco, and read/write that file.

This epic closes that gap. A board declares file associations in its `board-manifest.json` (`fileExtensions`). When a user opens a matching file, the board appears in the page's **editor switch widget**, so they can flip between the default Monaco editor and the board — the same way they flip between Monaco and the Grid/Markdown/Preview editors today.

**Why it matters:**
- **Offload heavy/niche editors to boards** — e.g. [US-454 (DrawIO viewer)](../tasks/US-454-drawio-viewer/README.md): rather than bundling a heavy `.drawio` library into Persephone's core, ship a standalone board associated with `.drawio` files. Same for a `.exe` details viewer, an encryption-key-file inspector (backlog), etc.
- **Shrink the built-in surface (future)** — once boards can be editors, some built-in editors (Todo, Notebook) could migrate to boards, making Persephone's core simpler. Out of scope here, but the motivation.
- **User extensibility** — a user (or their agent) can build a custom editor for any file type without touching Persephone's code.

## Scope — the SIMPLE case only

There are **two kinds** of board-editor envisioned. This epic delivers **only the first**:

1. **Simple (this epic):** the board receives a **`filePath`** and reads/writes the file **directly** (via the board bridge's existing `readFile`/`writeFile` RPC). No Persephone content pipe involved.
2. **Content-host (future, out of scope — CE8):** the board reuses Persephone's **content host** — Persephone keeps the file-pipe logic (caching, encryption, and the `file://` / `https://` / archive protocols) and the board works with content through an injected surface (`persephone.host.getContent()` / `persephone.host.setContent()`). This is the harder, richer variant; deferred to a successor epic.

So the deliverable is: **board registration as an editor with file association + the editor switch for registered boards + forwarding a `filePath` into the board.**

## Goals

- **Manifest file association** — `board-manifest.json` gains `fileExtensions` (+ a display name and default/priority policy). Trusted-boards-only (EPIC-035 C6).
- **Custom-editor registry** — a reactive registry that enumerates **trusted** boards, reads their manifests, and maps `extension → board(s)`. Reacts to trust changes.
- **Resolution + switch integration** — file-open resolution (`editorRegistry.resolveId` → `resolve` → `match.acceptFile`; **not** the dead `resolveForFile`) and the switch widget (`PageToolbar` → `findCompatibleEditors`) become aware of file-associated boards, so a board shows up as a switch option (and, opt-in, the default open target) for matching files.
- **filePath into the board** — forward a `filePath` through the `persephone-board://` open path (the seam EPIC-035/US-748 left) into `BoardEditorModel` and out to the board as `persephone.filePath` (top-level; no `host` namespace this epic), reusing the existing `readFile`/`writeFile` bridge.
- **Proving ground** — implement the DrawIO viewer (US-454) as the first real custom-editor board, validating the whole path end-to-end and retiring the built-in-editor plan for it.

## Background — what already exists (verified 2026-07-14)

| Piece | Where | State |
|-------|-------|-------|
| `fileExtensions` reservation | `board-manifest.ts` `BoardManifest` | Reserved in a comment ("the Custom Editor axis. Not part of v1"). Not implemented. |
| Board file bridge | `board-bridge-channels.ts` / `board-bridge.ts` / `board-shim.ts` | **Done** — `readFile`/`writeFile` RPC (utf8/base64, path relative-to-root or absolute); `openRawLink` already carries an optional `editor` id. |
| Board open-by-link | `persephone-board-link.ts` + `parsers.ts` (`target: "board-view"`) | **Done** — encodes only `boardRoot`; the scheme's JSDoc already says a future `filePath` "rides as `ILinkData` metadata … never baked into this URL." |
| `BoardEditorModel` | `editors/board/BoardEditorModel.ts` | `initFromBoardRoot(boardRoot)` (no `filePath`); `editorId` hardcoded `"board-view"` (L69). The `board-view` **EditorDefinition** (`register-editors.ts:442`) is `hasContentHost: false`, `accepts: () => -1` — so a board never matches a file today. |
| Trusted-boards registry | `board-trust.ts` | **Done** — `boardTrust.listPaths()` / `useTrustedPaths()` / `isTrusted()` (ancestor-aware). The source of "which boards are trusted". |
| Editor registry | `editorRegistry.ts` + `register-editors.ts` + `editor-matchers.ts` | Static registration. **File-open = `resolveId` → `resolve` → `match.acceptFile`** (`resolveForFile` exists but is **dead — zero callers**). Switch = `findEditorsAccepting`(host) / `getSwitchOptions`(language). Only `hasContentHost: true` editors appear in `findEditorsAccepting`. |
| Switch widget | `editors/base/PageToolbar.tsx` `SwitchWidget` | Renders a `SegmentedControl` from `model.findCompatibleEditors()`; switch calls `page.switchMainEditor(id)`. |
| Switch mechanics | `PageModel.ts` `switchMainEditor` → `createEditor(id)` → `switchFrom(old)` → `restore()` → `setMainEditor` | Assumes `id` is a statically-registered editor; `switchFrom` inherits the shared content host. |

## Idea-by-idea design notes

### 1. Manifest `fileMasks` + `editorPriority` (+ editor identity)

- Add to `BoardManifest`:
  - `fileMasks?: string[]` — **glob masks** matched against the file name (not plain extensions),
    e.g. `["*.drawio"]` or `["*.grid.json"]`. `*` = any run, `?` = one char; a bare extension
    (`".drawio"`) is coerced to `*.drawio`. Compound/mask patterns are a **requirement** (a board
    must be able to claim `*.grid.json`), so the field is masks, not a plain-extension `endsWith`.
  - `editorPriority?: number` — **configurable resolution priority (CE1, decided).** Slots the board into Persephone's existing `match.acceptFile` numeric ladder (real editor ids): `monaco` = 0 floor, `grid-json`/`grid-csv`/`grid-jsonl` = 20, `draw-view` = 50, `pdf-view`/`image-view`/`archive-view`/`video-view` = 100, `category-view` = 200. The board wins file-open resolution (becomes the **default** editor for its extensions) when its priority is the highest claimant for that file. For `.drawio` there is no built-in claimant, so any value > 0 makes the board the default over Monaco (e.g. set `100`). A board is **always** a switch option regardless of priority; the priority only decides whether it *also* becomes the default open target. Omitted/`0` → switch-option-only (Monaco stays default).
  - an optional **editor display name** (e.g. `editorName`) used as the switch-widget label (falls back to the board name).
- **Trusted-only (CE3 / EPIC-035 C6):** the association is *acted upon* only when the board is trusted. An untrusted board's `fileExtensions` is ignored entirely — no switch option, no routing. Passive identity ("open board" button) is unchanged.

### 2. Custom-editor registry (`extension → trusted board`)

- A new reactive module (e.g. `editors/board/custom-editor-registry.ts`) that:
  - enumerates `boardTrust.listPaths()`, reads each board's manifest (`readBoardManifest`), and builds an `extension → board[]` map;
  - exposes `getBoardsForFile(fileName): { boardRoot, name, priority }[]` and a reactive hook;
  - refreshes when the trusted list changes and re-reads a board's manifest on open (no persistent file watcher assumed — CE7).

### 3. Resolution + switch integration (the crux)

The editor registry is static; boards are runtime-discovered. Board editors live in their own **custom-editor registry** (design note #2), never mutated into the static `editorRegistry` (CE6). The two query points below consult **both** registries and **merge** candidates, applying the CE1/CE2 priority + tie-break across the merged list. Each file-associated board is a distinct id **`board-editor:<boardRoot>`** in that merged list (there is one `board-view` model but potentially many associated boards).

> ⚠️ **`resolveForFile` is dead code — do NOT use it.** `editorRegistry.resolveForFile()` (`editorRegistry.ts:90`) has **zero callers**. The real file-open resolution is `editorRegistry.resolveId(filePath)` → `resolve()` → `match.acceptFile` (`editorRegistry.ts:127–144`). Target `resolveId`/`resolve`, not `resolveForFile`.

**(a) File-open resolution.** `resolveId(filePath)` is called at `PagesLifecycleModel.newEditorModel` (`PagesLifecycleModel.ts:263`, `?? "monaco"`) and in `resolvers.ts:161,178`. The merge: given a raw file path, compare the best built-in `acceptFile` priority against the highest-priority trusted board from `getBoardsForFile()` (CE1 ladder: `monaco` 0 / `grid-*` 20 / `draw-view` 50 / `pdf-view`/`image-view`/`archive-view`/`video-view` 100 / `category-view` 200; CE2 tie-break built-in-first). If a board wins, resolution yields its `board-editor:<boardRoot>` id.

**(b) Construction path — the missing bridge from "file path → board with that filePath".** `buildEditorById(editorId, filePath)` (`PagesLifecycleModel.ts:277`) currently: unknown/`hasContentHost` ids → `newTextFileModel(filePath)` (so an unhandled `board-editor:` id would silently open as **text** — the bug to avoid), and a `switch (editorId)` with per-editor `case`s for no-host editors (`pdf-view`/`image-view`/`archive-view`/`video-view`/`category-view`, each `mod.default.newEditorModel(filePath)`). **Add a `board-editor:` prefix branch** in `buildEditorById` (before the `!def || hasContentHost` text fallback) that decodes the boardRoot from the id and builds a `BoardEditorModel` initialized with **both** `boardRoot` and the target `filePath`. This requires `initFromBoardRoot` to gain a `filePath` (or a new `initAsCustomEditor(boardRoot, filePath)`); `BoardEditorState` gains `filePath`.

**(c) Switch widget.** `SwitchWidget` (`PageToolbar.tsx`) renders `model.findCompatibleEditors()` and its per-id label comes from `editorRegistry.getById(id)?.name ?? id`. Three concrete changes:
  - **Merge the options.** A shared helper (e.g. on the custom-editor registry) returns the associated `board-editor:<root>` options for the current file. Host editors (Monaco etc.) currently return `editorRegistry.findEditorsAccepting(host)` — which skips non-host editors (`editorRegistry.ts:116`), so boards will never appear unless appended here. `MonacoEditor.findCompatibleEditors()` (and peers) must append the board matches; `BoardEditorModel.findCompatibleEditors()` (base returns `[]`) must return the merged `[<built-in id>, board-editor:<root>]` so the widget shows while on the board.
  - **Label resolution.** `SwitchWidget` must resolve a `board-editor:<root>` label from the custom-editor registry (manifest `editorName`/board name), not `editorRegistry.getById` (which returns undefined → raw-id label).
  - **Switch-back guard.** See the `editorId` reconciliation below — without it the widget hides while on the board.

**(d) `editorId` reconciliation (design gap — must fix).** `BoardEditorModel.editorId` is hardcoded `"board-view"` (`BoardEditorModel.ts:69`). But the merged switch list uses `board-editor:<root>`. Two breakages while the page is on the board: the `SwitchWidget` guard `!options.includes(model.editorId)` (`PageToolbar.tsx:74`) hides the widget (**user can't switch back to Monaco**), and `SegmentedControl value={model.editorId}` matches no segment. **Fix:** when a `BoardEditorModel` is acting as a custom editor, its `editorId` must be the virtual `board-editor:<root>` (dynamic, derived from `boardRoot`) rather than the constant `"board-view"`. A board opened plainly (from the Boards panel / `persephone-board://` with no filePath) keeps `"board-view"`.

**(e) `switchMainEditor` path.** `PageModel.switchMainEditor(newEditorId)` (`PageModel.ts:450`) does `editorRegistry.getById(newEditorId)` and **throws** for an unregistered id — so a `board-editor:<root>` id must be branched **before** that lookup: recognize the `board-editor:` prefix, build the `BoardEditorModel` (boardRoot + filePath extracted from the old editor's host — design note #4), run the CE4 `confirmRelease()` guard on the old editor (abort on cancel), then `setMainEditor`. Switching back (board → built-in) re-resolves the file id and rebuilds normally.

**File path at switch time.** The old editor's file path is read from its host (`filePath` lives on the host — cf. `editorRegistry.ts:113` reading `(host as {filePath?}).filePath ?? title`). `switchFrom`/the switch branch reads `oldEditor.contentHost?.filePath` (or `oldEditor.filePath`).

### 4. filePath into the board (simple case) — CE5 decided

- **Minimal new surface: just `persephone.filePath`** (top-level, next to the existing `readFile`/`writeFile` — **no `host` namespace in this epic**). The board reads/writes that file with the **existing top-level `persephone.readFile()` / `persephone.writeFile()`** (already on `window.persephone`, `board-shim.ts` ~L490/494 — utf8/base64).
- **`persephone.host` is reserved for the future content-host variant** (CE8): `persephone.host.getContent()` / `setContent()` will front Persephone's content pipe. It is **not** introduced now — nothing to hang on it yet.
- **Delivery:** forward `filePath` on the `persephone-board://` open as `ILinkData` metadata (US-748 seam) → store on `BoardEditorState.filePath` → hand to the board at the port handshake (`BoardPortInitMsg` already carries `busy`; add `filePath`) → expose as `persephone.filePath` in the shim. Like `busy`, it is `undefined` until the handshake arrives, then set — the board waits for it (or re-reads on the shim's ready signal).
- `BoardEditorModel.switchFrom(oldEditor)` must extract the `filePath` from the old editor's host (rather than inheriting a content host). Switching back re-resolves the built-in editor for the file.
- **No board typings `.d.ts` exists** — the board surface is not typed in a `.d.ts`; the shim self-casts `window.persephone` as `unknown`, and the authoring surface is documented in **prose** (`assets/board-template/CLAUDE.md`, `assets/mcp-res-boards.md`). So documenting `persephone.filePath` is a **prose doc update** in the close-out, not a typings-file change — don't hunt for a `.d.ts`.

### 5. Save / dirty semantics (CE4 — decided: reuse the release guard)

The simple board writes the on-disk file directly, bypassing the content pipe (cache/encryption/watch/`https`/archive). Rather than invent new save rules, **switching to a board reuses the existing unsaved-changes guard** — the same `confirmRelease()` prompt (Save / Don't Save / Cancel) that navigation already runs:
- **Switch-to-board runs `oldEditor.confirmRelease()`** (the exact call `PagesLifecycleModel.navigatePageTo` makes at line ~737). Today `PageModel.switchMainEditor` does **not** call it — grid↔monaco switches share one host, so nothing is discarded. A board switch **releases** the Monaco host (Monaco is not a panel contributor / keep-alive, so `setMainEditor` disposes it), so the guard must fire. If `confirmRelease()` returns **false** (user cancelled), **abort the switch — the page stays on Monaco.** On Save or Don't Save, proceed.
- **Switch-back (Board→Monaco) is a fresh re-open, so no stale cache.** Because switching to the board disposed the Monaco host, switching back re-resolves the file and builds a fresh built-in editor that reads current disk content — which is exactly whatever the board wrote directly. No special reload logic needed; the dispose-and-rebuild switch model handles it.
- **Local-file-only.** Simple boards need a **real local file** (a writable `file://` path). A page opened over `https://` or inside an archive has no such path — the board switch option is hidden there (this is precisely what the content-host variant, CE8, would later solve).
- Boards are never `modified` in the page model; unsaved-state tracking for board-side edits is the board's own concern (out of scope — the board owns its file directly).

### 6. DrawIO as the proving ground

- Implement US-454 as a board associated with `.drawio`, replacing the built-in-viewer plan. Validates manifest → registry → resolution → switch → filePath end-to-end and delivers a user-visible feature.

## Proposed tasks (build order — NOT yet carved)

Each will get a full Goal → Background → Implementation Plan → Concerns → Acceptance doc **before** implementation, once CE1–CE8 are resolved.

| Task | Title | Depends on |
|------|-------|-----------|
| [US-836](../tasks/US-836-board-manifest-file-association/README.md) | **Manifest `fileMasks` + `editorPriority` + editor identity.** Extend `BoardManifest` (`fileMasks` glob masks, `editorPriority` per CE1, editor display name) + normalize/matcher/accessor helpers; update the board authoring guide's manifest reference. _(carved 2026-07-14; `fileMasks` supersedes the reserved `fileExtensions` — masks support compound patterns like `*.grid.json`)_ | — |
| [US-837](../tasks/US-837-custom-editor-registry/README.md) | **Custom-editor registry.** Reactive `mask → trusted board` map built from `boardTrust` + manifests; `getBoardsForFile`; refresh on trust change (CE3/CE7); adds `boardTrust.subscribePaths` + the `board-editor:<root>` virtual-id helpers. _(carved 2026-07-14)_ | US-836 |
| US-XXX | **filePath into the board.** Forward `filePath` via `persephone-board://` → `BoardEditorState.filePath` → `BoardPortInitMsg` → `persephone.filePath`; `switchFrom` extracts filePath from the old host. | registry task |
| US-XXX | **Resolution + switch integration (crux).** Merge the custom-editor registry into `resolveId`/`resolve` (**not** dead `resolveForFile`); `buildEditorById` `board-editor:` branch (→ BoardEditorModel + filePath); `findCompatibleEditors` merge + label; virtual `board-editor:<root>` identity incl. dynamic `BoardEditorModel.editorId`; `switchMainEditor` prefix branch + `confirmRelease()` on switch-to-board / abort on cancel (CE4); fresh re-resolve on switch-back (CE4/CE6). See design note #3 (a–e). | filePath task |
| US-XXX | **DrawIO viewer board (US-454).** First real custom-editor board for `.drawio`; retires the built-in US-454 plan. Proves the epic end-to-end. | switch integration task |
| — | **Epic close-out.** `/review`, `/document` (board authoring guide + `mcp-res-boards.md` + architecture editors doc), `/userdoc` (web-boards + what's-new). | all above |

(The middle three may collapse into fewer tasks at carve time — decided after CE-questions are resolved.)

## Open questions / design constraints to resolve before carving

- **CE1 — Default editor vs switch-only. ✅ decided (user, 2026-07-14): configurable via a manifest `editorPriority`.** A board with `fileExtensions` is **always** a switch option; its `editorPriority` (a number on Persephone's existing resolution ladder — monaco 0 / grid 20 / draw 50 / viewers 100 / category 200) decides whether it *also* wins file-open resolution and becomes the **default** editor for those extensions. Omitted/`0` → switch-option-only, built-in default unchanged. For `.drawio` the board sets a priority > 0 (e.g. 100) to be the default. See design note #1.
- **CE2 — Precedence / collisions. ✅ decided (user, 2026-07-14).** Falls out of CE1's numeric priority: the **highest `editorPriority`** wins the file-open default; a board only overrides a built-in when its priority exceeds the built-in's `acceptFile` priority for that file. **Tie-break (same priority):** **built-ins first, then boards in trusted-list order.** So on an exact tie a built-in editor keeps the default over a board, and two boards at the same priority order by their position in the trusted-boards list. All matching editors still appear as switch options, disambiguated by display name.
- **CE3 — Trust gating (inherits EPIC-035 C6). ✅ decided (user, 2026-07-14): hard constraint, and reactive.** Only a **trusted** board can be registered as a file-associated editor; an untrusted board's `fileExtensions` is fully ignored (no switch option, no routing). **Un-trusting a board removes it from the editor associations immediately** — the custom-editor registry is reactive to `boardTrust` state, so a board dropped from the trusted list disappears from file-open resolution and the switch widget without an app restart (ties into CE7). A page already open on a now-untrusted board falls back to the built-in editor / the board's untrusted placeholder.
- **CE4 — Save/dirty consistency. ✅ decided (user, 2026-07-14): reuse the existing release guard.** Switch-to-board runs the same unsaved-changes prompt navigation uses — `oldEditor.confirmRelease()` (Save / Don't Save / Cancel). Cancel → **abort the switch, stay on Monaco**; Save/Don't-Save → proceed. Switch-back re-resolves the file fresh from disk (the board switch disposed the Monaco host), so board-side writes are picked up with no stale-cache handling. The board option is offered **only for a real local `file://` path** (hidden for `https://` / archive — CE8's future territory). See design note #5. *(was the riskiest area — now resolved cleanly by reuse.)*
- **CE5 — Board file surface name. ✅ decided (user, 2026-07-14).** Add **only `persephone.filePath`** (top-level — the associated file path). Reads/writes reuse the **existing top-level `persephone.readFile()` / `persephone.writeFile()`** (already implemented). **No `host` namespace this epic** — `persephone.host.getContent()/setContent()` will be introduced by the future content-host variant (CE8), since those front Persephone's content host; there is nothing to put under `host` yet. See design note #4.
- **CE6 — Virtual editor identity. ✅ decided (user, 2026-07-14): two separate registries, merged.** Board editors live in their own custom-editor registry, kept **separate** from the static `editorRegistry`. File-open resolution and the switch widget query **both** registries and merge the candidates; each file-associated board gets a distinct id `board-editor:<boardRoot>`. No dynamic (de)registration of `EditorDefinition`s in the static registry — the board side stays reactive independently. See design note #3.
- **CE7 — Refresh on manifest/trust change. ✅ decided (user, 2026-07-14).** The custom-editor registry reacts to `boardTrust` state (a trust/untrust flips associations live — CE3) and re-reads a board's manifest on open; **no persistent file watcher**. A mid-session `fileExtensions` edit takes effect on the next board open / trust refresh rather than instantly — acceptable.
- **CE8 — Content-host board variant = OUT OF SCOPE. ✅ decided (user, 2026-07-14): successor epic.** The richer "content editor" board (reusing Persephone's content host — caching, encryption, `file`/`https`/archive protocols — via `persephone.host.getContent()/setContent()`) is deferred, along with migrating built-in editors (Todo, Notebook) to boards. This epic does **only** the simple direct-`filePath` case. The `persephone.host` namespace (CE5) and the local-file-only limit (CE4) leave the seam for the successor.

## Future axis (out of scope here)

- **Content-host board variant (CE8)** — boards that reuse Persephone's content pipe.
- **Migrating built-in editors to boards** — e.g. Todo, Notebook → boards, to shrink Persephone's core. Motivates the epic; not part of it.

## Relationship to EPIC-035

EPIC-035 delivered portability + manifest identity + board-level trust + open-by-link + MCP + sidebar, and explicitly deferred the **Custom Editor** axis to a successor epic (C6, C8), leaving two seams in place:
- the `fileExtensions` field **reserved** in `BoardManifest`;
- the `persephone-board://` open path documented to carry a future **`filePath`** on `ILinkData`.

This epic builds on both.

## Notes

### 2026-07-14 — epic opened in Planning
- Structured the user's vision into candidate tasks + the CE1–CE8 design questions.
- Verified the seams EPIC-035 left (reserved `fileExtensions`, `filePath`-on-`ILinkData` open path) and that the board file bridge (`readFile`/`writeFile`, `openRawLink` `editor` param) already exists.
- Central tension flagged: **CE4** (save/dirty consistency for a board that bypasses the content pipe) and **CE6** (virtual editor identity bridging runtime board discovery into the static registry).
- Kept in **Planning** — awaiting user refinement of CE1–CE8 before any task is carved.

### 2026-07-14 — CE1 decided (user)
- **CE1 ✅ configurable priority.** A manifest `editorPriority` (number) places the board on Persephone's existing resolution ladder; highest claimant becomes the default editor for the extension. A board is always a switch option; priority only governs the default. For `.drawio` the board sets priority > 0 to be default over Monaco. Collapses most of **CE2** (precedence = numeric priority); only the same-priority tie-break remains open.
- **CE2 ✅ tie-break decided.** Same-priority ties sort **built-ins first, then boards in trusted-list order** — a built-in keeps the default over a board on an exact tie.
- **CE3 ✅ trust-gated + reactive.** Only trusted boards register as editors; un-trusting removes the association immediately (reactive registry — ties into CE7). An open page on a now-untrusted board falls back to the built-in / untrusted placeholder.
- **CE4 ✅ reuse the release guard.** Switch-to-board runs `oldEditor.confirmRelease()`; cancel aborts the switch (stay on Monaco). Switch-back re-resolves fresh from disk (host was disposed), so board writes are picked up with no stale-cache logic. Board offered only for real local `file://` paths.
- **CE5 ✅ minimal surface.** Add only **`persephone.filePath`** (top-level, no `host` namespace this epic); reuse existing top-level `persephone.readFile`/`writeFile`. `persephone.host.getContent/setContent` (and the `host` namespace itself) deferred to the content-host epic (CE8).
- **CE6 ✅ two registries, merged.** Board editors live in a separate custom-editor registry (not mutated into the static `editorRegistry`); resolution + switch query both and merge, each board keyed `board-editor:<boardRoot>`.
- **CE7 ✅ reactive, no watcher.** Registry reacts to `boardTrust` state + re-reads a manifest on open; no persistent file watcher (a mid-session `fileExtensions` edit lands on next open/refresh).
- **CE8 ✅ out of scope.** Content-host variant (`persephone.host.getContent/setContent`) + built-in→board migration deferred to a successor epic. This epic ships the simple direct-`filePath` case only.
- **All constraints (CE1–CE8) resolved.** Design finalized; ready for task carving on the user's go-ahead.

### 2026-07-14 — US-837 carved (custom-editor registry)
- Second task carved: [US-837](../tasks/US-837-custom-editor-registry/README.md) — the reactive `mask → trusted board` registry (mirrors `registeredTools`), plus two enabling pieces the crux task needs: a read-only `boardTrust.subscribePaths` (missing today — `boardTrust`'s state is private, unlike `toolsTrust`) and the shared `board-editor:<root>` virtual-id helpers (`boardEditorId` / `parseBoardEditorId`).
- **Enumerates `boardTrust.listPaths()` directly** (mirrors `registeredTools` + the Boards sidebar) — a board trusted only via an ancestor folder isn't enumerated. **By design (user, 2026-07-14): nested boards are unsupported** — each board lives in its own separate folder; the ancestor/inherited-trust handling exists only so nesting doesn't crash the app, never as a supported topology. No subtree-discovery feature is planned.
- **Sync `getBoardsForFile` over async-loaded state**: returns `[]` before init → graceful built-in fallback. Records the timing seam for US-838, which must call `ensureInitialized()` eagerly at bootstrap since `resolveId` is sync.
- Registry stays **unwired** this task (inert, like US-836); US-838 consumes it. Only observable change: the new `subscribePaths` method.

### 2026-07-14 — US-836 carved + `fileExtensions` → `fileMasks` (user)
- First task carved: [US-836](../tasks/US-836-board-manifest-file-association/README.md) (manifest fields + normalize/matcher/accessor + authoring-guide doc; pure data-model, inert until the registry/resolution tasks).
- **Field is `fileMasks`, not `fileExtensions` (user requirement).** A custom editor must register for **compound / mask** patterns like `*.grid.json`, not only a bare extension. Implemented as glob masks (`*`/`?`) compiled to a case-insensitive RegExp matched against the file name; a bare extension is coerced to `*.<ext>` for convenience. The reserved `fileExtensions` name in `board-manifest.ts` is **superseded**. Later registry/resolution tasks match via the shared `matchesFileMask` helper and still apply `editorPriority` on the existing numeric ladder; overlap with a built-in mask is legitimate and resolved by priority + the CE2 tie-break.

### 2026-07-14 — independent gap review (fresh agent, no context)
A context-free agent verified every concrete claim against the source. Design (CE1–CE8) confirmed sound and internally consistent; "what already exists" claims almost all accurate. **Fixed the findings:**
- **Factual (HIGH): `resolveForFile` is dead code (zero callers).** Real file-open path is `resolveId` → `resolve` → `match.acceptFile` (call sites `PagesLifecycleModel.ts:263`, `resolvers.ts:161,178`). Corrected throughout + added a warning callout in design note #3.
- **Crux made concrete (design note #3 a–e):** the `board-editor:<root>` construction path via a new `buildEditorById` `board-editor:` branch (mirroring the pdf/image/archive `case`s; unknown ids currently fall to `newTextFileModel` — the silent-text bug to avoid); the `switchMainEditor` prefix branch (it throws on unregistered ids); the `findCompatibleEditors` merge + label resolution (host editors' `findEditorsAccepting` skips non-host editors, so boards must be appended); and the **`editorId` reconciliation** — `BoardEditorModel.editorId` is hardcoded `"board-view"` (L69) but the switch list uses `board-editor:<root>`, which would hide the switch widget and block switch-back unless the board's `editorId` is dynamic when acting as a custom editor.
- Priority ladder rewritten with **real editor ids** (`draw-view`, `pdf-view`, `grid-json`, …).
- Clarified there is **no board `.d.ts`** — `persephone.filePath` is a prose doc update.
- Verdict was "not implementation-ready" pre-fix (crux rested on `resolveForFile` + omitted construction/identity mechanics); those are now specified with file:line hooks.
