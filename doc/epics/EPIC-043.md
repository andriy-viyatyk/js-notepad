# EPIC-043: Content-Host Boards — boards that edit a file through Persephone's content host

## Status

**Status:** 🟢 Design finalized — opened **2026-07-15**; **all open questions (CH1–CH8) resolved** and an **independent gap review** (fresh agent, no context) passed with its HIGH/MEDIUM findings folded in (see Notes, 2026-07-15). Tasks **not yet carved**; each gets a full Goal → Background → Implementation Plan → Concerns → Acceptance doc **before** its implementation. Do **not** start implementation until the tasks are carved and the user says "let's implement".
**Follows:** [EPIC-042 — Boards as Custom Editors](EPIC-042.md) (the direct predecessor; this epic delivers EPIC-042's explicitly-deferred **CE8 content-host variant**).

## The big idea

EPIC-042 let a board act as an editor for a file type — but only in the **simple** way: the board receives a `filePath` (`persephone.getFilePath()`) and reads/writes the file **directly** through the bridge's `readFile`/`writeFile`. The board owns the file; Persephone owns nothing. That means the board misses everything Persephone's content layer does for its own editors:

- the **content pipe** (`file://` / `https://` / archive providers),
- **encoding** detection,
- **encryption** (transparent decrypt/encrypt transformers),
- the **auto-save cache** (dual-pipe crash recovery),
- **dirty / modified** tracking, the tab's unsaved dot, and the "save changes?" release prompt,
- **Ctrl+S save** through the same machinery every other editor uses.

This epic adds the **content-host** board variant. Such a board declares its kind in `board-manifest.json`; Persephone then builds it **with a content host** — the exact same `IContentHost` (`TextFileModel`) that backs Monaco, Grid, Notebook, Markdown, etc. Persephone keeps the file, the pipe, the encryption, the cache, and the dirty state; the board works with the content through an injected surface:

```js
const text = await persephone.host.getContent();   // current content (string)
persephone.host.setContent(newText);                // set content + mark modified
persephone.host.onContentChange(cb);                // react to external changes (reload / other view)
```

**Why it matters:**
- **Boards become first-class editors.** A content-host board switches with Monaco/Grid by **transferring the same host** (no data loss, no reload) — not the dispose-and-rebuild dance EPIC-042's simple board needed.
- **Works beyond local files.** Because Persephone owns the pipe, a content-host board can edit a file opened over `https://` or inside an archive, and an **encrypted** file — none of which the simple board can do (EPIC-042 CE4 restricted it to real local paths).
- **The migration path for built-in editors.** Todo, Notebook (and others) could eventually ship as content-host boards, shrinking Persephone's core — the motivation EPIC-042 named. This epic builds the plumbing that makes that possible.

## Scope

**In scope:**
- A manifest **kind** discriminator (`editorKind`) that tells Persephone to set the board up **with a content host**.
- A **content-host board model** that composes an `IContentHost` exactly as `MonacoEditor` does (host adoption via `CONTENT_HOST_TRAIT`, save/dirty via the host, restore from pipe/cache).
- **Construction + switch integration** so a content-host board is built with a host from the file's pipe, and switches with built-in editors by transferring the shared host (both directions).
- The **content bridge**: `persephone.host.getContent()` / `setContent()` / `onContentChange()` / `getLanguage()` / `save()`, delivered renderer↔iframe.
- One **proving-ground** content-host board authored outside the repo (mirroring EPIC-042's DrawIO board).

**Out of scope:**
- Migrating the existing built-in editors (Todo, Notebook, …) to boards — this epic only proves the path with one new board; the migrations are follow-up work.
- Any new pipe/provider/transformer types — the epic reuses the existing content pipe verbatim.
- Non-text (binary-only) content hosts — the host is `TextFileModel` (UTF-8 string content). A board that wants raw bytes keeps using the simple `readFile`/`writeFile` path (EPIC-042).

## Recommended architecture — new subclass model (not enhancing `BoardEditorModel`)

The user asked which is better: **a new board model** that holds a content host, or **enhancing the existing `BoardEditorModel`** with host functionality. Recommendation: **a new subclass, `BoardContentEditorModel extends BoardEditorModel`.**

The content host is **composable, not inherited** — a text editor *has* a host (`private _host: TextFileModel`), it *is not* a host. `MonacoEditor` and `GridEditor` both compose `_host` and register `CONTENT_HOST_TRAIT`; the host itself (`TextFileModel`, `IContentHost`) is a separate object. So a board model can compose one the same way, and a subclass inherits **all** of `BoardEditorModel`'s board machinery (the trust gate, the `<iframe>`/`BoardWebview`, `BoardToolbar`, the `BoardTargetModel` automation adapter, the busy-retention handles, the icon, `reloadToken`/`refreshBoards`) for free, adding only the host composition on top.

**Why subclass, not enhance in place:**

| Concern | Subclass (recommended) | Enhance `BoardEditorModel` in place |
|---|---|---|
| Plain boards (the majority) | Untouched — zero regression risk | Every host-related method forks on a runtime `kind` flag; the most-used board class carries two lifecycles |
| Divergent behavior (`skipSave`, save/dirty, switch model, `dispose`, `getRestoreData`, `findCompatibleEditors`, `contentHost`) | Clean overrides isolated in the subclass | 8+ `if (this.hasHost)` branches tangled in one class |
| Switch semantics | Subclass transfers the shared host (like Monaco↔Grid); base keeps dispose-and-rebuild | One method must do both |
| Reference implementation | `MonacoEditor` (the smallest content-host editor, ~314 lines) is the direct template for the added surface | — |

The subclass reuses `MonacoEditor` as the template for the *host* surface (`_host` + `CONTENT_HOST_TRAIT` in the constructor; `switchFrom`/`restore`/`adoptHost`/`contentHost`; `saveState`/`confirmRelease` delegated to `host.io`) and reuses `BoardEditorModel` for the *board* surface. Construction picks the class by the manifest `editorKind`. This is the crux task (US-844).

> Rejected alternative — a fresh class modeled directly on `MonacoEditor` that re-implements board rendering: massive duplication of the board machinery (iframe, trust, toolbar, automation, busy). The subclass avoids it.

## Background — what already exists (verified 2026-07-15)

| Piece | Where | State |
|-------|-------|-------|
| `IContentHost` + sole implementer `TextFileModel` | `editors/base/IContentHost.ts`; `editors/text/TextEditorModel.ts:63` | **Done.** `state.content` (UTF-8) + `state.language`; `changeContent(str, byUser)` sets content **and** marks `modified` + schedules cache autosave (`TextEditorModel.ts:249`); `changeLanguage` (`:127`); `modified` getter (`:104`); `confirmRelease` (`:434`). |
| `CONTENT_HOST_TRAIT` (host transfer on switch) | `editors/base/editor-traits.ts` | **Done.** `extractContentHost()` transfers host ownership out of the old editor. `MonacoEditor.switchFrom` (`MonacoEditor.ts:214`) / `GridEditor.switchFrom` (`GridEditor.ts:243`) show the pattern; base `switchFrom` throws (`EditorModel.ts:116`). |
| Host construction from a path | `PagesLifecycleModel.ts` | **Done.** `newTextFileModel(filePath)` (`TextEditorModel.ts:440`); pipe from path via `createPipeFromPath` (`PagesLifecycleModel.ts:250`: http(s) → `HttpProvider`, `archive!entry` → `FileProvider`+`ArchiveTransformer`, else `FileProvider`); host lazily self-creates a pipe on `restore()` via `TextFileIOModel.ensurePipe()`. |
| Save / cache / encryption | `editors/text/TextFileIOModel.ts`, `TextFileEncryptionModel.ts` | **Done, below the host line.** `saveFile()` writes through the pipe + clears `modified` (`TextFileIOModel.ts:80`); `cachePipe` field (`:19`), debounced autosave via `markModificationUnsaved` → `saveModifications`/`doSaveModifications` (`:337`/`:367`); encryption is a `DecryptTransformer` on the pipe — transparent to any content consumer. A board never touches these. |
| View↔host read/write pattern | `editors/grid/GridEditor.ts:343,724` | **Done.** Read: subscribe `host.state` on `s => s.content` → re-parse. Write-back: serialize → stash `_changedContent` (echo guard) → `host.changeContent(content, true)`. **The board content bridge mirrors this echo-guard exactly.** |
| `hasContentHost` registration + host-first construction | `register-editors.ts:126` (grid-json, `true`) / `:442` (board-view, **`false`**); `PagesLifecycleModel.ts:298` | **Done.** `buildEditorById` returns a **host** (not an editor) for `hasContentHost` ids and lets `attachEditorToPage` wrap it into the class from `host.state.editor`. `board-view` is in the **no-host** branch (`:335`); custom `board-editor:<root>` ids are branched earlier (`:291`) and build a board **without** a host. |
| EPIC-042 board-editor plumbing | `board-manifest.ts`, `custom-editor-registry.ts`, `BoardEditorModel.ts` | **Done.** Manifest `fileMasks`/`editorPriority`/`editorName`; reactive `customEditorRegistry` (`mask → trusted board`); `board-editor:<root>` virtual ids; `resolveEditorIdForFile` merges built-in + board candidates; `isBoardEditorId`; `BoardEditorModel` gets its file via `getFilePath()` + reads/writes with `readFile`/`writeFile`. This epic **extends** all of it — the resolution/registry/id layer is reused unchanged; only construction + the model + the bridge grow. |
| Board bridge surface | `board-shim.ts`, `board-bridge.ts`, `board-bridge-channels.ts`, `BoardWebview.tsx` | **Done.** Two channels: board↔main over the `MessagePort` (`execute`, dialogs, `readFile`/`writeFile`, theme); board↔host-renderer over `window.parent.postMessage` + the init handshake (`BoardPortInitMsg` carries `busy` + `filePath`; `BoardToHostMsg` posts `board:busy`/`board:interact`/`board:error`). `getFilePath()`/`getBoardBusy()` use the "settle-once, await-any-time" pattern (`board-shim.ts:544`/`:536`). **`persephone.host` is absent from the shim surface (`board-shim.ts:482`), reserved for this epic (EPIC-042 CE5).** |

## Idea-by-idea design notes

### 1. Manifest `editorKind` discriminator

Add to `BoardManifest` (`board-manifest.ts`):

```ts
/** How Persephone sets this board up as a file editor (EPIC-043).
 *  - absent / "simple": EPIC-042 behavior — board gets a filePath (`getFilePath`) and
 *    reads/writes directly via `readFile`/`writeFile`. No Persephone content host.
 *  - "content-host": Persephone builds the board WITH a content host (the pipe,
 *    encoding, encryption, cache, and dirty state) and injects `persephone.host.*`. */
editorKind?: "simple" | "content-host";
```

- Carried into `BoardEditorAssociation` (`getBoardEditorAssociation`) as a normalized `editorKind` (default `"simple"`), and onto `CustomEditorMatch` in the registry, so construction can pick the model without re-reading the manifest.
- **Trusted-only**, same as every EPIC-042 field — the kind is honored only for a trusted board.
- Resolution (`resolveEditorIdForFile`, `fileMasks`/`editorPriority`, the `board-editor:<root>` id) is **unchanged** — the kind affects only which **model** the construction path builds.

### 2. `BoardContentEditorModel` — the content-host board model (crux)

`class BoardContentEditorModel extends BoardEditorModel`, composing an `IContentHost` (template: `MonacoEditor`):

- **Constructor:** create `_host: TextFileModel | null`, register the trait via `this.traits.add(CONTENT_HOST_TRAIT, { extractContentHost })` (verified API — Monaco `MonacoEditor.ts:84`, Grid `GridEditor.ts:155`); `extractContentHost()` unsubscribes + nulls `_host` + returns it (copy `MonacoEditor.ts:72-83`).
- **`get contentHost()`** → `this._host` (override the base `null`).
- **`switchFrom(oldEditor)`** — extract the old editor's host via `CONTENT_HOST_TRAIT`, preserve `oldEditor.id` (cache-file continuity), `adoptHost(host)`. This is what makes Monaco→board (and Grid→board) transfer the live content with no reload (`MonacoEditor.ts:214` template).
- **`restore()`** — if no host was adopted, build one from the file's pipe (`newTextFileModel(filePath)` / `TextFileModel.fromDescriptor(pendingHost)`), `await host.restore()`, `adoptHost`.
- **`adoptHost(host)`** — wire `host.state.subscribe → descriptorChanged` for persistence, subscribe `s => s.content` (+ language) → push into the iframe (US-846), copy title/id.
- **`getRestoreData()`** — extend with `host: this._host?.getDescriptor()` (so the pipe/content restores across restart) while still pinning `editorId: "board-view"` per EPIC-042's persistence rule. The presence of `host` on a board descriptor is the **content-host-vs-plain discriminator** at restore (a plain board never carries one). See the restore-branch note in design note #3 — this is **not** free; `restorePage` must be taught the branch, else the board is dropped (HIGH-1). **CH6.**
- **`saveState()`** → `this._host?.io.saveState()`; **`confirmRelease(closing)`** → `this._host?.confirmRelease(closing)` (so the unsaved-changes prompt fires from the host, like every text editor).
- **`skipSave = false`** (base board is `true`); the board is now a real editor whose dirty state Persephone tracks.
- **`findCompatibleEditors()`** — return the file's natural built-in id + this board (like the base override), but **without** the `isPlainLocalPath` gate (content-host boards support https/archive — CH4).
- **`dispose()`** — dispose `_host` **iff** it was not extracted (copy `MonacoEditor`); then `super.dispose()` for the board teardown (iframe/CDP/busy reaping).
- **No busy retention (CH7 — decided):** override `keepAliveOnNavigation()` → `false` and `survivesNavigation()` → `false` (unconditionally), and `setBusy()` → **no-op + `console.warn`** (the model can't write the board's `ui.log` — that's `BoardWebview.appendLog`; a `console.warn` is the honest sink, optionally a `board:error` breadcrumb to the frame). A content-host board's host **transfers out** on switch (`CONTENT_HOST_TRAIT`), so a surviving host-less board would be a broken zombie, and duplicating the host would desync two writers of the same file. `getBoardBusy()` stays honestly `false`.

### 3. Construction + switch integration

- **`register-editors.ts`:** keep `board-view` `hasContentHost: false`. The content-host board is **not** built host-first (it isn't chosen by `host.state.editor`); it is built in the `board-editor:<root>` branch, which already returns a fully-formed `EditorModel` (verified — `attachEditorToPage` returns it unchanged, `PagesLifecycleModel.ts:67`). So no generic host-wrap entry is needed. **CH5 (confirmed).**
- **`buildEditorById` `board-editor:` branch (`PagesLifecycleModel.ts:291`):** read the manifest `editorKind` (via `customEditorRegistry`); `"content-host"` → build a pipe from the `filePath` (`createPipeFromPath`), a `TextFileModel` host, a `BoardContentEditorModel`, `adoptHost`, set `filePath`; `"simple"` → the existing `BoardEditorModel` path.
- **`createEditorFromFile`** — same kind branch, so the switch-back and openRawLink paths build the right model.
- **`switchMainEditor` board-boundary branch (EPIC-042) — both sub-paths spelled out (HIGH-2).** A `board-editor:<root>` id is **not** in `editorRegistry`, so the generic host-transfer tail (`editorRegistry.getById(newEditorId)` → **throws** `"No editor registered"`) can never be used, and `editorRegistry.createEditor` can never build a board. All board involvement is caught in the existing board-boundary branch (via `parseBoardEditorId`), which today does dispose-and-rebuild for every case. Branch it on kind:
  - **built-in → content-host board:** build the board with `boardModule.createEditor()` + `initFromBoardRoot(root, filePath)`, then call `board.switchFrom(oldBuiltin)` so it extracts + adopts the built-in's host (**not** `editorRegistry.createEditor + switchFrom`). No `confirmRelease` (host transfers, nothing lost).
  - **content-host board → built-in:** this also runs in the board-boundary branch (the *old* editor's id is `board-editor:<root>`, so `boardInvolved` is true — not the generic tail). Build the built-in via `editorRegistry.createEditor(builtinId)` + `builtin.switchFrom(oldBoard)`; the built-in extracts the board's host (works because the board registers `CONTENT_HOST_TRAIT`). No `confirmRelease`.
  - **simple board (either direction):** keep EPIC-042's dispose-and-rebuild + `confirmRelease`/abort-on-cancel.
  - `setMainEditor` then disposes the old board after its host is extracted — the host survives (adopted by the new editor); the board's iframe/CDP/`reapBoardOwner` tear down. This is the intended switch-away behavior.
- **Persistence restore branch (HIGH-1 — the biggest gap; `PagesPersistenceModel.restorePage`).** `restorePage` evaluates `if (d.host) { editorRegistry.createEditor(d.editorId=…"board-view") … applyRestoreData … restore }` (`:78`) **before** the `NO_HOST_EDITOR_IDS` board branch (`:101`). For a content-host board (pinned `board-view`, now carrying `d.host`) that generic host branch builds a **plain `BoardEditorModel`** (never the content-host subclass, host never reconstructed), calls the **base no-op `applyRestoreData`** (so `boardRoot`/`filePath` in `d.state` are never applied), then `restore()` throws `"legacy project-mode board editor"` (`BoardEditorModel.ts:219`) → the tab **vanishes**. **Fix:** add a board branch in `restorePage` **before** `if (d.host)`: when `d.editorId === "board-view" && d.host`, construct a `BoardContentEditorModel`, `Object.assign` `d.state` (as the NO_HOST branch does), reconstruct the host via `TextFileModel.fromDescriptor(d.host)`, `adoptHost`, then `restore()`. Applies equally to cross-window move (`movePageIn` → `restorePage`) and `duplicatePage`.
- **Lift the local-file gate for content-host boards — ALL THREE gates (CH4 / MEDIUM-3).** `isPlainLocalPath` gates in three places, not two: (1) `resolveEditorIdForFile` (`custom-editor-registry.ts:164`) — its `if (!filePath || !isPlainLocalPath) return builtinId` early-return sits **before** the board scan, so it must be **restructured** to still scan for content-host boards on non-local paths (simple boards stay gated); (2) `BoardContentEditorModel.findCompatibleEditors` — drop the gate (its subclass override); (3) **`PageToolbar.tsx:80` `useBoardsForFile(isPlainLocalPath(filePath) ? filePath : "")`** — the switch-widget gate that surfaces a board from a built-in editor; filter simple-vs-content-host by path locality (the kind rides `CustomEditorMatch`, US-843) so a content-host board appears as a switch option over `https://`/archive. Missing (3) is why the headline "share a host over non-local files" would silently fail.
- **Detection:** `isBoardEditorId` already covers `board-editor:<root>` for MCP/automation — the content-host board reuses it unchanged.

### 4. Content bridge — `persephone.host.*`

The content host is a **renderer-side** object (`BoardContentEditorModel._host`), so the content bridge must ride the **board↔host-renderer** channel (`window.parent.postMessage` + `iframe.contentWindow.postMessage`) — **not** the main `MessagePort` (main has no access to the host; theme goes over the port only because it's computed renderer-side and relayed through main, which content can't do). But note this is a **net-new ongoing channel**, not a mirror of an existing one (MEDIUM-4): `filePath`/`busy` are one-shot at the handshake (`BoardPortInitMsg`), and `BoardWebview` posts into the iframe **only** in `transferPort` today. So the epic builds: a repeated renderer→iframe push + a new inbound message kind in the shim's `window` listener (which currently handles only `__persephoneInit`, `board-shim.ts:178`).

- **Renderer → board (push):** `BoardWebview` subscribes to the model's `host.state` (content + language) and posts `{ __persephone: "host:content", content, language }` to `iframe.contentWindow.postMessage(…, "board://<host>")` — an initial snapshot **after** the frame `load`/handshake (so the shim's listener already exists — sequencing matters), then on every host change. **Echo-guarded:** skip the push whose content equals the board's last `setContent` value (mirror `GridEditor._changedContent`, `GridEditor.ts:345,724`).
- **Board → renderer (setContent):** the shim posts `{ __persephone: "board:setContent", content }` to `window.parent`; `BoardWebview.onMessage` routes it to `model.hostChangeContent(content)` → `host.changeContent(content, /*byUser*/ true)` (with the echo stash).
- **View-layer wiring (MEDIUM-5 — must be specified).** `BoardWebview`/`BoardEditorView` are typed `model: BoardEditorModel` and know nothing about a host; the subclass inherits the board *rendering* for free but **not** the content wiring. Add: (a) a content-host check (`model.contentHost` truthy) driving the push subscription; (b) the `host.state` subscribe→push effect (set up per `load`); (c) inbound routing in `BoardWebview.onMessage` (`:144`) for `board:setContent`/`board:save` → `model.hostChangeContent`/`model.hostSave`. Decide: branch `BoardWebview` on kind vs. a thin content-host-aware wrapper.
- **Empty/error state.** `BoardEditorView` already renders `BoardNotFoundView`/`UntrustedBoardView`. Specify what a content-host board shows when the **host** fails to restore (file missing/deleted) — now a *file*, not just a board folder, can be absent — vs. the existing board-not-found path.
- **Shim `persephone.host` namespace (`board-shim.ts`):**
  - `getContent(): Promise<string>` — resolves to the latest pushed snapshot (settle-once + await-any-time, mirroring `getFilePath`).
  - `setContent(content: string): void` — post to parent.
  - `onContentChange(cb: (content: string, language?: string) => void): () => void` — fire on each push (skipping the board's own echo).
  - `getLanguage(): Promise<string | undefined>` — from the pushed snapshot.
  - `save(): void` — request Persephone to save the host (see CH3).
- **Wire types (`board-bridge-channels.ts`):** add `board:setContent` to `BoardToHostMsg`; add a renderer→iframe `BoardHostContentMsg { __persephone: "host:content"; content: string; language?: string }`.

### 5. Save & dirty semantics

With a real host, dirty state, the tab's unsaved dot, and the "save changes?" release prompt come for free (Persephone tracks `host.modified`; navigation runs `confirmRelease` → `host.confirmRelease`). The tab context-menu Save (via `onGetMenuItems` → host menu items) works too.

**Automatic Ctrl+S (CH3 — decided).** A board renders `BoardWebview`/`BoardToolbar`, **not** `<TextChrome>`, so `TextFileActionsModel`'s Ctrl+S handler is not wired to the iframe. Rather than make the board author wire saving, the **shim injects a document-level Ctrl+S handler** so saving just works with zero board code:

```js
// board-shim.ts — built-in save fallback (registered on `window`, bubble phase, so any
// board handler on document/an element runs FIRST and can opt out via preventDefault).
window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        if (e.defaultPrevented) return;   // the board claimed it — stand down
        e.preventDefault();
        window.parent.postMessage({ __persephone: "board:save" }, hostPostTarget);
    }
});
```

- The listener is on `window` (bubble phase): board handlers on `document`/elements fire earlier in bubbling, so a board that wants custom save behavior simply calls `e.preventDefault()` and the shim's fallback stands down (the `defaultPrevented` gate). Ordering is reliable because the shim registers before any author script (injected into `<head>` first), but on a **more general** target than a typical board handler.
- `BoardWebview.onMessage` routes `board:save` → `model.hostSave()` → `host.io.saveFile()` — the real save through the pipe (encryption/cache/dirty-clear), renderer-side like the rest of the content bridge.
- `persephone.host.save()` remains as an optional **programmatic** API (e.g. a Save button in the board's own UI), but is not something the author must wire — the default Ctrl+S covers it.

### 6. Proving-ground: convert the DrawIO viewer to content-host (CH8 — decided)

Convert the existing **DrawIO viewer board** (EPIC-042's proving ground, in `C:\projects\persephone-boards\drawio-viewer`, outside the repo) from "simple" to "content-host". It's ideal precisely because the viewer isn't itself an editor — the workflow proves the headline feature (**board and Monaco sharing one host**):

1. Open a `.drawio` → the board renders its XML, read via `persephone.host.getContent()` (replacing today's `getFilePath()` + `readFile()`).
2. Switch to **Monaco** → the host **transfers** (no reload / no data loss); the user edits the raw XML.
3. Switch back to DrawIO → the host transfers back; the board re-renders from current content → the edits show on the diagram.
4. **Ctrl+S** saves through the pipe automatically (CH3) — no board save code.

- Exercises `getContent` + `onContentChange` + two-way host transfer + auto-save + dirty tracking. The viewer is read-only, so it never calls `setContent` — editing is Monaco's job (the classic source-edit / live-preview pairing). `setContent` stays a general bridge API, just unexercised by this board.
- Board-side changes (outside the repo): manifest `editorKind: "content-host"`; `app.js` reads content from `persephone.host.getContent()` and re-renders on `persephone.host.onContentChange()`; keep the file-name toolbar label from `getFilePath()` (still delivered). The `onContentChange` handler must degrade to the existing error/empty state on transiently invalid XML (Monaco can produce it mid-edit) rather than crash.
- Also demonstrates a board **migrating** from EPIC-042 "simple" to "content-host" — a reference for future migrations.
- **Monaco language for `.drawio` (LOW-6).** After a board→Monaco switch the host language comes from the extension (`TextFileIOModel.restore`); `.drawio` likely resolves to `plaintext`, so the raw XML shows **unhighlighted**. Not a blocker (the board renders the XML itself), but for a nicer edit view consider mapping `.drawio` → `xml` (Monaco language), or accept plaintext. Decide at carve time.

## Proposed tasks (build order — NOT yet carved)

Each gets a full Goal → Background → Implementation Plan → Concerns → Acceptance doc **before** implementation, once CH1–CH8 are resolved.

| Task | Title | Depends on |
|------|-------|-----------|
| US-843 | **Manifest `editorKind` + association plumbing.** Add `editorKind` to `BoardManifest`; carry it through `getBoardEditorAssociation` + `CustomEditorMatch`; authoring-guide doc. Pure data-model, inert until construction consumes it. | — |
| US-844 | **`BoardContentEditorModel` (crux — the model).** Subclass of `BoardEditorModel` composing an `IContentHost`: `_host` + `CONTENT_HOST_TRAIT`, `switchFrom`/`restore`/`adoptHost`/`contentHost`, `saveState`/`confirmRelease` delegation, `getRestoreData` host descriptor, `dispose`, `findCompatibleEditors`. Template: `MonacoEditor`. | US-843 |
| US-845 | **Construction + switch + persistence integration.** `buildEditorById`/`createEditorFromFile` kind branch (build host + `BoardContentEditorModel`); `switchMainEditor` board-boundary host-transfer both directions (`boardModule.createEditor`+`initFromBoardRoot`+`switchFrom` to-board; `editorRegistry.createEditor`+`switchFrom` from-board); **`PagesPersistenceModel.restorePage` board branch before `if (d.host)`** (HIGH-1); lift all **three** `isPlainLocalPath` gates by kind incl. `PageToolbar.tsx:80` + the `resolveEditorIdForFile` early-return restructure (MEDIUM-3). | US-844 |
| US-846 | **Content bridge (`persephone.host.*`) + view wiring + auto-save.** Net-new renderer→iframe push channel + shim inbound handler (MEDIUM-4); wire types (`board:setContent`, `host:content`, `board:save`); **`BoardWebview`/`BoardEditorView` content-host wiring** — kind detect, `host.state` subscribe→push (post-`load`, echo-guarded), route `board:setContent`/`board:save` → `hostChangeContent`/`hostSave`, host-restore-failure empty state (MEDIUM-5); shim `persephone.host` (`getContent`/`setContent`/`onContentChange`/`getLanguage`/`save`) + the document-level Ctrl+S fallback (CH3). | US-844 |
| US-847 | **Convert the DrawIO viewer to content-host (outside repo).** Manifest `editorKind: "content-host"`; read content via `host.getContent()` + `onContentChange()` (drop `readFile`); prove the epic end-to-end (edit XML in Monaco → diagram updates → Ctrl+S). | US-845, US-846 |
| — | **Epic close-out.** `/review`, `/document` (architecture editors doc + board authoring guide + `mcp-res-boards.md`), `/userdoc`. | all above |

## Open questions / design constraints to resolve before carving

- **CH1 — Manifest field name & shape. ✅ decided (user, 2026-07-15): the string `editorKind: "simple" | "content-host"`** (default `"simple"`) — extensible and self-documenting, chosen over a boolean `contentHost: true`.
- **CH2 — Content type. ✅ decided (user, 2026-07-15): UTF-8 string only.** The host is `TextFileModel`, so `getContent`/`setContent` carry a plain string. A binary/`base64` content host is out of scope — a binary board keeps EPIC-042's `readFile`/`writeFile`.
- **CH3 — Save gesture. ✅ decided (user, 2026-07-15): the shim injects an automatic document-level Ctrl+S** so the board author writes nothing. A `window` keydown listener (registered before author scripts) catches Ctrl/Cmd+S, and — unless a board handler already called `preventDefault()` (the opt-out) — posts `board:save` → `BoardWebview` → `host.io.saveFile()`. `persephone.host.save()` stays as an optional programmatic API (e.g. an in-board Save button), not a requirement. See design note #5.
- **CH4 — Lift the local-file-only limit. ✅ decided (user, 2026-07-15).** Content-host boards work over `https://`/archive/encrypted — the switch option + resolution drop the `isPlainLocalPath` gate **for content-host kind**; the simple board keeps it.
- **CH5 — Construction path. ✅ decided (user, 2026-07-15): the `board-editor:<root>` branch.** The content-host board is built in that branch (returning a formed editor with an adopted host), **not** via the generic host-first `attachEditorToPage` wrap (which keys on `host.state.editor` and knows nothing about boards).
- **CH6 — Persistence. ✅ decided (user, 2026-07-15).** `getRestoreData` persists the host descriptor (pipe + cache) **and** the stable board id + board root + filePath, so an app-restart / cross-window move restores a content-host board with its content intact.
- **CH7 — Busy retention × content host. ✅ decided (user, 2026-07-15): content-host boards do NOT support busy.** The host transfers out on switch, so a surviving host-less board is a broken zombie, and duplicating the host would give two unsynchronized writers of the same file. `BoardContentEditorModel` overrides `keepAliveOnNavigation`/`survivesNavigation` → `false` and `setBusy()` → **no-op + `console.warn`** (chosen over a hard throw so generic board code that calls `setBoardBusy` doesn't crash; the model can't reach the board's `ui.log`). `getBoardBusy()` returns `false`. See design note #2.
- **CH8 — Proving-ground board choice. ✅ decided (user, 2026-07-15): convert the DrawIO viewer to content-host.** It reads XML via `host.getContent()` and re-renders on `onContentChange()`; the user edits the XML in Monaco (host transfers), switches back to see the updated diagram, and Ctrl+S saves. Read-only viewer → `setContent` unexercised (Monaco does the editing). See design note #6.

## Relationship to EPIC-042

EPIC-042 delivered the manifest association (`fileMasks`/`editorPriority`/`editorName`), the reactive custom-editor registry, `board-editor:<root>` ids, `resolveEditorIdForFile`, the switch-widget merge, and `getFilePath()` — and explicitly deferred the content-host variant (CE8), reserving the `persephone.host` namespace (CE5) and leaving the local-file-only limit (CE4) as the seam for a successor. This epic reuses the entire resolution/registry/id layer unchanged and adds: the manifest **kind**, the **host-backed model**, the **kind-aware construction/switch**, and the **`persephone.host` bridge**.

## Notes

### 2026-07-15 — epic opened in Planning
- Structured the user's vision (content-host boards with `persephone.host.getContent`/`setContent`) into candidate tasks (US-843→US-847) + the CH1–CH8 design questions.
- Verified the content-host machinery via a source sweep: `IContentHost`/`TextFileModel`, `CONTENT_HOST_TRAIT` transfer, host construction from a pipe, save/cache/encryption below the host line, and the view↔host echo-guard write-back pattern (`GridEditor`).
- **Model decision recommended:** a new subclass `BoardContentEditorModel extends BoardEditorModel` composing an `IContentHost` (template `MonacoEditor`) — reuses all board machinery via inheritance, isolates the content-host lifecycle, and leaves plain boards untouched. The enhance-in-place alternative was rejected (forks 8+ host methods on a runtime flag inside the most-used board class).
- Kept in **Planning** — awaiting user resolution of CH1–CH8 before any task is carved.

### 2026-07-15 — independent gap review (fresh agent, no context)
A context-free agent verified every concrete claim against source. **Premise + factual claims confirmed sound** (content-host core, trait-transfer `this.traits.add(CONTENT_HOST_TRAIT, …)` both-direction extraction, echo-guard, CH5 board-editor branch returns a formed editor, bridge handshake, CH7 override shapes, CH3 DOM ordering, and — unlike EPIC-042 — **no `RenderEditor` gap** (`RenderEditor.tsx:17` already maps `board-editor:<root>` → `board-view`, inherited free by the subclass)). Verdict pre-fix: **not implementation-ready** — persistence broken + several crux mechanics under-specified. **Fixed the findings in the design notes:**
- **HIGH-1 — CH6 persistence was broken + self-contradictory.** A board pinned `board-view` but carrying `d.host` is grabbed by `restorePage`'s generic `if (d.host)` branch (`:78`, before the board branch `:101`) → builds a **plain** `BoardEditorModel`, base no-op `applyRestoreData`, then `restore()` throws `"legacy project-mode board editor"` (`BoardEditorModel.ts:219`) → **tab dropped**. Added the fix to design note #3: a `restorePage` board branch **before** `if (d.host)` that builds `BoardContentEditorModel`, applies `d.state`, reconstructs the host from `d.host`, `adoptHost`, `restore()`; `d.host`-on-a-board is the content-host-vs-plain discriminator. Covers `movePageIn`/`duplicatePage`.
- **HIGH-2 — switch-to-board can't use the generic tail.** `board-editor:<root>` isn't in `editorRegistry`, so `editorRegistry.getById`/`createEditor` throws/can't build it. Design note #3 now spells out both sub-paths inside the board-boundary branch: to-board = `boardModule.createEditor`+`initFromBoardRoot`+`board.switchFrom(oldBuiltin)`; from-board = `editorRegistry.createEditor`+`builtin.switchFrom(oldBoard)`; both skip `confirmRelease`.
- **MEDIUM-3 — CH4 missed the third gate.** Added `PageToolbar.tsx:80` `useBoardsForFile` gate + the `resolveEditorIdForFile:164` early-return restructure to the plan (else a content-host board never appears as a switch option over non-local files).
- **MEDIUM-4 — content push is net-new, not a filePath/busy mirror.** Reframed design note #4: `filePath`/`busy` are one-shot; theme rides the port; content needs a brand-new repeated renderer→iframe post + a new shim inbound handler (`board-shim.ts:178` handles only `__persephoneInit` today), sequenced post-`load`.
- **MEDIUM-5 — view layer was unaddressed.** Added the `BoardWebview`/`BoardEditorView` content-host wiring (kind detect, `host.state`→push subscription, `board:setContent`/`board:save` routing, host-restore-failure empty state) to design note #4 + US-846.
- **LOW-6/7 — nits fixed:** `.drawio`→Monaco language note (design note #6); line refs corrected (`board-shim.ts:544`/`:536`; `TextFileIOModel` autosave `:337`/`:367`; `persephone.host` absent at `:482`); CH7 log sink corrected (`console.warn`, the model can't reach `ui.log`).

### 2026-07-15 — CH1 / CH2 / CH4 / CH5 / CH6 decided (user) — design finalized
- **CH1 ✅** manifest field is the string `editorKind: "simple" | "content-host"` (default `"simple"`), over a boolean.
- **CH2 ✅** content is UTF-8 string only; binary boards keep `readFile`/`writeFile`.
- **CH4 ✅** content-host boards drop the `isPlainLocalPath` gate (https/archive/encrypted); the simple board keeps it.
- **CH5 ✅** built in the `board-editor:<root>` branch, not the generic host-first wrap.
- **CH6 ✅** `getRestoreData` persists the host descriptor alongside the board id/root/filePath.
- **All CH1–CH8 resolved — design finalized.** Ready for task carving (US-843→US-847) on the user's go-ahead.

### 2026-07-15 — CH8 decided (user)
- **CH8 ✅ convert the DrawIO viewer to content-host.** The read-only viewer reads XML via `host.getContent()` + re-renders on `onContentChange()`; editing happens in Monaco (host transfers on switch), switch-back shows the updated diagram, Ctrl+S saves. Proves `getContent`/`onContentChange`/two-way host transfer/auto-save; `setContent` stays available but unexercised. Design note #6 + US-847 updated.

### 2026-07-15 — CH7 decided (user)
- **CH7 ✅ no busy for content-host boards.** The host transfers out on switch (a surviving host-less board is a broken zombie) and duplicating the host would desync two writers — so `BoardContentEditorModel` overrides `keepAliveOnNavigation`/`survivesNavigation` → `false` and `setBusy()` → no-op + a one-line `ui.log` warning (over a hard throw). Design note #2 + CH7 updated.

### 2026-07-15 — CH3 decided (user)
- **CH3 ✅ automatic Ctrl+S via the shim.** The board author writes no save code: the shim registers a `window`-level Ctrl+S handler (before author scripts) that posts `board:save` → `host.io.saveFile()` unless a board handler already called `preventDefault()` (the opt-out). `persephone.host.save()` stays as an optional programmatic API, not a requirement. Design note #5 + US-846 updated.
