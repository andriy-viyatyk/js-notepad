# Completed Epics

Last 10 completed epics, newest first. Older epics are pruned.

---

## EPIC-046 — [Board Environment Variables](EPIC-046.md)

Gave boards a first-class way to store secrets (connection strings, API keys, passwords) **outside** the board folder, so copying, sharing, or committing a board never leaks them. A single, user-configured `.env.json` file (`board-vars.file` setting) holds a `namespace → profile → key → value` schema and is optionally password-encrypted by reusing Persephone's existing file-encryption mechanism (`shell.encryption`/`ui.password`/`TextFileModel.decrypt`) — deliberately **not** OS-bound (`safeStorage`/DPAPI), which breaks on non-persistent pooled VMs. A session-singleton `BoardEnvStore` (`api/board-vars/`) models the encrypted-file access flow directly on the existing `BrowserBookmarks` pattern (load → detect encryption → prompt once per session → session-unlocked). Each board's namespace is its manifest's **`author`/`name`** when both are explicitly set, else its root path — stable across a board's dev-repo copy and its installed copy, with a non-blocking advisory dialog at registration time when two boards' computed namespaces collide. Boards read/write only their own namespace via a new bridge API, **`persephone.var.get/set/list/show`**, routed through `board-vars-bridge.ts` with requests serialized on a shared chain so concurrent boards can't each pop a dialog at once — `BoardWebview` resolves the namespace itself from the calling board's root, so a board can never name or reach another board's slice. A new built-in editor (`env-vars-view`, `*.env.json`) gives users a namespace-list + profile-tabs + AVGrid review/edit view (plain text, no masking — simpler than the originally-designed reveal-toggle and unnecessary for a file already kept outside the shareable board folder), reachable from Settings or `persephone.var.show()`. Finally, an agent-facing admin surface, **`app.boardVars`** (`get`/`set`/`list`/`listNamespaces`/`namespaceFor`/`show`), gives scripts unrestricted namespace access — unlike the board-side bridge, deliberately not namespace-locked, since `execute_script` already carries full app trust equal to `app.fs`/`app.settings` — so an agent can provision a freshly-scaffolded board's secrets in the same script that created it. Reviewed at epic level — one must-fix (`app.boardVars.show()` with no namespace could resolve to the wrong editor if the configured file didn't literally end in `.env.json`; fixed to force the `env-vars-view` editor explicitly) plus a stale inline type widened for accuracy.

- [x] [US-887: Vars store foundation — settings path + `.env.json` schema + `BoardEnvStore`](../tasks/US-887-board-vars-foundation/README.md)
- [x] [US-888: Board API `persephone.var.get/set/list` + "Create environment variables storage" dialog](../tasks/US-888-board-vars-bridge-api/README.md)
- [x] [US-889: `*.env.json` built-in editor + `persephone.var.show()`](../tasks/US-889-board-vars-editor/README.md)
- [x] [US-890: Namespace collision warning at board registration](../tasks/US-890-board-vars-collision-warning/README.md)
- [x] [US-891: Agent-facing `app.boardVars` admin API + board-guide docs](../tasks/US-891-board-vars-agent-api/README.md)

---

## EPIC-045 — [Published Boards Catalog](EPIC-045.md)

Let users **discover and install boards the project publishes** — custom editors, viewers, and tools — from inside Persephone, without leaving the file they're opening. A public GitHub repo (`andriy-viyatyk/persephone-boards`) is the catalog: `main` carries a `boards-manifest.json` describing every published board, and each board version is a per-board GitHub **Release** ZIP asset. A main-process **catalog service** (`published-boards-service.ts`, mirroring `version-service`) fetches the raw manifest on a 24h gate, caches the last-good copy for offline use, and broadcasts changes; a **download service** (`board-download-service.ts`) streams each release ZIP with an incremental **sha256** verify. Installation is deliberately **two consented steps** that keep the "nothing is trusted without the user's dialog click" invariant intact: **Download** (byte-progress, checksum-verified, extracted locally — trusts *nothing*; the board sits inert on disk, reviewable by the user or their AI agent) and **Register board** (the standard `showTrustBoardDialog` — only then does the normal custom-editor machinery pick the board up). Opening a file whose type has no installed editor but matches a published board shows a **`+` entry** in the editor switch (`Text | +`) that maps to a real registered **Board Info editor** (`editors/board-info/`) — a host-capable holder (adopts/yields `CONTENT_HOST_TRAIT` without rendering) so `Text ↔ + ↔ board` switches transfer the content host losslessly. The Board Info editor serves both **install mode** (Download → Register, multi-match tiles) and **properties mode** (info, an on-demand version history for **update/rollback** via a safe temp-extract + folder-swap that never destroys a working board, Uninstall/Unregister, Open board). Updates surface **silently** — an "Update available" badge in the Tools & Editors → Boards tab (context-menu Update) and a dot on the in-board Properties button; the swap is guarded by an open-pages/busy precondition with a "Close pages & continue" shortcut. A board's `standalone` bit (derived: no masks → standalone; masks → opt-in) drives **pin gating** (only standalone boards are pinnable), and per-version **`minAppVersion`** compatibility hides/refuses versions an older app can't run while keeping older compatible versions installable. The **`app.boards`** script API gained a full lifecycle + catalog surface (`registerBoard`/`unregisterBoard`/`renameBoard`; `searchPublished`/`getPublishedVersions`/`downloadPublished`/`installPublished`/`uninstallBoard`/`checkPublishedUpdates`) under the request-vs-grant model — an agent can drive discover → download → review → register → update/rollback → uninstall with at most one dialog click per privilege step. A new full-page **Tools & Editors hub** (`editors/tools-hub/`, a singleton page) is the page-sized counterpart of the sidebar panel (opened via its "Open in new tab" button); its **Search boards** tab is the sole catalog-browsing surface (browse/filter/install without a matching file open + Refresh catalog), and the panel and hub share extracted components (`PinnedRail`, `BuiltinEditorsList`, the trusted-boards/tools lists). The About page's "Check for Updates" now also force-refreshes the catalog and shows an "Available boards" count. Publishing is a version bump + merge to `main`: a **GitHub Action** (`persephone-boards` repo) zips each board, creates the tagged release, and rewrites both catalog manifests with no manual steps — validated end-to-end by publishing `drawio-viewer` v1.0.0 from the live catalog. Reviewed at epic level — one must-fix hardened (a catalog `id` charset guard + a path-containment check close a catalog-driven path-traversal vector) plus a `formatBytes` de-duplication; security invariant verified to hold on every trust-adjacent path.

- [x] [US-862: Catalog service (main): manifest fetch, cache, periodic check, IPC](../tasks/US-862-catalog-service/README.md)
- [x] [US-863: Install engine: download + sha256 verify + extract + install registry](../tasks/US-863-install-engine/README.md)
- [x] US-866: persephone-boards repo: initial commit + publish script + GitHub Action (separate repo)
- [x] [US-868: Agent API: `app.boards.registerBoard` / `unregisterBoard` / `renameBoard`](../tasks/US-868-agent-board-lifecycle/README.md)
- [x] [US-864: "+" editor-switch entry + Board Info editor (install mode, progress)](../tasks/US-864-switch-entry-board-info/README.md)
- [x] [US-865: Updates: version compare, activation toast, safe re-install, sidebar badges](../tasks/US-865-updates/README.md)
- [x] [US-867: Board Info editor: properties mode + version history & rollback](../tasks/US-867-board-info-properties/README.md)
- [x] [US-869: Agent API: catalog — searchPublished / installPublished / versions / uninstall](../tasks/US-869-agent-catalog-api/README.md)
- [x] [US-870: Tools & Editors hub page (Built-in / Registered boards / Search boards / Tools + Pinned)](../tasks/US-870-tools-hub/README.md)
- [x] US-871: SegmentedControl tooltip support + "+" switch-entry tooltip
- [x] US-872: About "Check for Updates" also force-refreshes the boards catalog

---

## EPIC-044 — [Board Secondary Views](EPIC-044.md)

Added the last piece that lets a **Board** stand in for a full built-in editor: a board can now contribute one or more **secondary (sidebar) views** — a second board-relative `.html` rendered in its own sidebar panel and wired to the *same* board model as the main view — closing the gap that kept editors like Todo (a main list + a coordinated "Lists/Tags" sidebar panel) from moving out of Persephone's core and into boards. A board declares views in `board-manifest.json` (**`secondaryViews: [{ id, html?, title? }]`**, read by a `fileMasks`-independent reader) and/or replaces them at runtime with **`persephone.setSecondaryViews([...])`**; each declared view maps to a stable panel-id family **`board-secondary:<viewId>`** that the secondary-view registry resolves — via a new **`registerPrefix`** — to a single generic **`BoardSecondaryView`** component. Frames stay synchronized through a new **`persephone.state.*`** shared-state channel (`init`/`get`/`set`/`merge`/`onChange`) injected into **every** board frame, authoritative on the Persephone side (`BoardEditorState.sharedState` on the base `BoardEditorModel`, so *every* board gets it), with writes round-tripped through the host and ordered by a monotonic `sharedStateSeq` guard, and **opt-in persistence** — only keys declared via `state.init(defaults, { restorableKeys })` are written to the page descriptor, so large/transient state never bloats the open-pages file. Each frame learns its role synchronously at boot via **`persephone.view`** (`"main"` or the view id, delivered on a `view=` URL param) so one HTML file can encapsulate every view. The second iframe reuses `BoardWebview` with `entry` + **`isMain`** props: because all frames share one `model.id`, only the main frame owns the automation target / CDP registration / ui.log reset / autofocus, and **job reaping is per-sink** (a secondary frame's teardown reaps only its own `boardId`, never the shared owner) — so closing a secondary panel never tree-kills the main frame's processes or breaks its automation. Board panels die on navigate-away (Pattern A); busy-board re-promotion re-derives them. The **proving ground** is the built-in Todo reimplemented as a **content-host board with a Lists/Tags secondary view** (selection→filter coordinated purely through `persephone.state.*`, file content through `persephone.host.*`), authored outside the repo (`C:\projects\persephone-boards\todo`) and registered **alongside** the built-in Todo as an A/B test — the built-in editor is untouched. **US-858** lifts the v1 main-frame-only automation limit by mapping each board frame onto the `IBrowserTarget` **tab** abstraction (frames-as-tabs): `browser_tabs` lists them, `select` opens+activates the sidebar panel, and each frame registers for CDP under its own `${model.id}/${tab}` key. Authoring the Todo board surfaced a reliability inventory (**US-859**) that drove two hardening tasks: **US-860** made `persephone.host.getContent`/`getLanguage` **await the handshake internally** (safe in any call order — the editor-switch empty-render trap is gone, no ready-gate needed), made `setContent` read-your-own-write, added a **generation-counter guard** to `customEditorRegistry.refresh()` (a stale overlapping refresh from a rapid untrust+trust board-folder rename can no longer clobber the newer result), and delegated `BoardContentEditorModel.modified` to its host so a dirty content-host board reports correctly in `list_pages` / the tab dot; **US-861** mirrors board-frame `console.error`/`console.warn` to the board's `ui.log` (new `board:log` message) and made **`board_refresh` deterministic** (awaits the remounted main frame's load + CDP re-registration via `waitForFrameLoad`, returns `frameReady`) so a snapshot right after a refresh can't hit the stale pre-reload frame. Reviewed at epic level — clean, no architecture or coding-standard violations.

- [x] [US-851: Manifest + base-model plumbing for declared secondary views](../tasks/US-851-manifest-model-plumbing/README.md)
- [x] [US-852: `persephone.state.*` shared-state bridge (get/set/merge/onChange) + opt-in persistence](../tasks/US-852-shared-state-bridge/README.md)
- [x] [US-853: Second-iframe rendering + `board-secondary:*` panel family + multi-frame safety](../tasks/US-853-second-iframe-rendering/README.md)
- [x] [US-854: `persephone.setSecondaryViews` dynamic control](../tasks/US-854-set-secondary-views/README.md)
- [x] [US-855: Persistence & restore hardening](../tasks/US-855-persistence-restore-hardening/README.md)
- [x] [US-856: Docs, guides, demo board](../tasks/US-856-docs-guides-demo-board/README.md)
- [x] [US-857: Proving-ground Todo board (content-host board with secondary views, A/B alongside the built-in)](../tasks/US-857-todo-board/README.md)
- [x] [US-858: Automate secondary views via `browser_*` (frames-as-tabs)](../tasks/US-858-automate-secondary-views/README.md)
- [x] [US-859: Board authoring reliability & predictability for agents (problem inventory — triaged)](../tasks/US-859-board-authoring-reliability/README.md)
- [x] [US-860: Board bridge readiness & registry hardening (US-859 #1–#5, #13)](../tasks/US-860-board-bridge-readiness/README.md)
- [x] [US-861: Board debugging observability (US-859 #8, #10)](../tasks/US-861-board-debug-observability/README.md)

---

## EPIC-043 — [Content-Host Boards](EPIC-043.md)

Delivered EPIC-042's explicitly-deferred content-host variant: a custom-editor **Board can now let Persephone own the file it edits**, the same way every built-in editor does. A board declares **`editorKind: "content-host"`** in `board-manifest.json` (vs. the default `"simple"`, which is EPIC-042's direct-`filePath` behavior); Persephone then builds the board **with an `IContentHost`** — the exact `TextFileModel` that backs Monaco/Grid/Notebook — so it keeps the content pipe (`file://` / `https://` / archive providers), encoding detection, encryption, the auto-save cache, dirty/modified tracking, the tab's unsaved dot, the "save changes?" release prompt, and Ctrl+S. The board works with the content through an injected **`persephone.host.*`** bridge (`getContent` / `setContent` / `onContentChange` / `getLanguage` / `save`). The model is a new subclass **`BoardContentEditorModel extends BoardEditorModel`** (composing the host via `CONTENT_HOST_TRAIT`, template `MonacoEditor`) that inherits all board machinery (iframe/trust/toolbar/automation/icon) unchanged and adds only the host composition — so plain boards are untouched. Because the host is shared, a content-host board **switches with Monaco/Grid by transferring the same host** (no reload, no data loss) in both directions, and — unlike the simple board — works over **non-local files** (`https://`, inside archives, encrypted) since Persephone owns the pipe. Construction/switch/persistence branch on the kind (`PagesLifecycleModel`, `PageModel.switchMainEditor` both directions, and a `PagesPersistenceModel.restorePage` board branch placed before the generic `if (d.host)` so a restored content-host board rebuilds the subclass + host); all three `isPlainLocalPath` gates are lifted by kind. The content bridge rides a net-new renderer→iframe push (`host:content`, echo-guarded) plus a new shim inbound handler, and the shim injects an automatic `window`-level Ctrl+S (opt-out via `preventDefault`) so saving needs zero board code; content-host boards support no busy retention (the host transfers out on switch). Two custom-editor polish items shipped alongside: a simple custom-editor board now shows the **file name** (not the board name) in its tab, and a file claimed by a trusted custom-editor board shows that **board's icon** in the Explorer tree / file lists / tabs (the board icon wins over the language icon when the board is the file's default editor — e.g. `.drawio` shows the drawio-viewer icon). The **DrawIO viewer board** (authored in the external boards repo, not bundled) was converted from simple to content-host as the proving ground: it renders `.drawio` XML via `host.getContent()`/`onContentChange()`, the user edits the raw XML in Monaco (host transfers on switch), switches back to see the updated diagram, and Ctrl+S saves. Reviewed at epic level — clean, no must-fix concerns (the sanctioned `components/icons` → `editors/board` icon import was recorded in the dependency rules).

- [x] [US-843: Manifest `editorKind` + association plumbing](../tasks/US-843-editorkind-plumbing/README.md)
- [x] [US-844: `BoardContentEditorModel` — the content-host board model (crux)](../tasks/US-844-board-content-editor-model/README.md)
- [x] [US-845: Construction + switch + persistence integration](../tasks/US-845-construction-switch-persistence/README.md)
- [x] [US-846: Content bridge (`persephone.host.*`) + view wiring + auto-save](../tasks/US-846-content-bridge-view-wiring/README.md)
- [x] US-847: Convert the DrawIO viewer to content-host (proving ground, authored outside the repo)
- [x] [US-848: Show file name (not board name) in tab for a simple custom-editor board](../tasks/US-848-simple-board-file-title/README.md)
- [x] [US-849: Show the board icon for board-associated files in the Explorer tree](../tasks/US-849-explorer-board-file-icon/README.md)

---

## EPIC-042 — [Boards as Custom Editors](EPIC-042.md)

Closed the last gap between a Board and a first-class editor: a **trusted** board can now register itself as the editor for a file type, appearing in the page's **editor switch** next to the built-in editor (Monaco/Grid/…) and — when it outranks the built-in — becoming the default open target. A board declares the association in `board-manifest.json`: **`fileMasks`** (glob masks matched against the file basename, e.g. `*.drawio`, `*.grid.json`), **`editorPriority`** (its slot on the existing resolution ladder — monaco 0 / grid 20 / draw 50 / viewers 100 / category 200; strictly-greater wins, built-ins win ties), and **`editorName`** (switch-widget label). The fields are honored only when the board is trusted. Board editors are runtime-discovered, so they live in a **separate reactive `customEditorRegistry`** (never mutated into the static `editorRegistry`) keyed by the virtual id **`board-editor:<boardRoot>`**; `resolveEditorIdForFile` merges built-in + board candidates at the two file-open decision points (direct open + `openRawLink` file resolver), gated to real local files only (`isPlainLocalPath`). An untrust drops associations live (no filesystem watcher). Switching to a board reuses navigation's unsaved-changes guard (`confirmRelease()` — Save/Don't Save/Cancel; cancel aborts, staying on the built-in) and rebuilds through `createEditorFromFile` in both directions (no shared content host); a board's `editorId` is dynamic while acting as a custom editor but `getRestoreData()` pins `"board-view"` for persistence, and MCP/automation detection broadened via `isBoardEditorId`. The file path reaches the board as the async bridge method **`persephone.getFilePath()`** (delivered through `ILinkData.filePath` → `BoardEditorState.filePath` → `BoardPortInitMsg`), which the board reads/writes with the existing `persephone.readFile()`/`writeFile()` — the simple direct-`filePath` case (the content-host variant reusing Persephone's content pipe is deferred to a successor epic). The **DrawIO viewer board** (authored in a separate external boards repo, not bundled) is the proving ground — a read-only `.drawio` (diagrams.net) viewer that validated the whole path end-to-end and retired the built-in DrawIO-viewer plan. Its authoring surfaced and fixed two plumbing gaps (the render-path `board-editor:<root>` → `board-view` module mapping in `RenderEditor`, and reusing `SwitchWidget` in `BoardToolbar` so the switch-back UI shows while on a board). Reviewed at epic level — clean, no architecture/standards violations.

- [x] [US-836: Board manifest — `fileMasks` + `editorPriority` + editor identity](../tasks/US-836-board-manifest-file-association/README.md)
- [x] [US-837: Custom-editor registry — reactive `mask → trusted board` map](../tasks/US-837-custom-editor-registry/README.md)
- [x] [US-838: filePath into the board — async `persephone.getFilePath()`](../tasks/US-838-filepath-into-board/README.md)
- [x] [US-839: Resolution + switch integration (the crux)](../tasks/US-839-resolution-switch-integration/README.md)
- [x] [US-840: DrawIO viewer board (proving ground) — retires the built-in US-454 plan](../tasks/US-840-drawio-viewer-board/README.md)

---

## EPIC-041 — [Unified Focused/Unfocused List Selection](EPIC-041.md)

Spread the Explorer file-tree's **two-state selection** to every selectable list in the app: a selected/hovered row is subtle **gray** (`background.light` / `background.message`) when its list is **not** focused, and **blue** (`background.treeSelection`) with a **blue outline** (`border.active`) when the list **is** focused. Previously this behavior lived only inside the `Tree` primitive, reachable only via `keyboardNav`, while every other list hand-rolled its own selection with a different token and no focused-vs-unfocused distinction. The mechanism is pure CSS — `:focus-within` gated by a container `data-focus-selection` attribute + a focusable (`tabIndex=0`) container, **no JS focus state**. US-829 extracted the visuals into one shared contract (`uikit/shared/selection-style.ts` — `rowSelectionBase` on the row, `focusSelectionOverride` on descendant-row containers, `rowFocusSelectionOverride` on standalone rows), refactored `Tree`/`TreeItem` onto it with **zero visual change** (Explorer is the live regression guard), and added `ListItem`/`ListBox` `selectionStyle="focus"` + a `Tree` `focusSelection` opt-in, decoupling focus-styling from `keyboardNav`. US-830 flipped the already-shared-primitive consumers (Rest Client tree, Notebook Categories via `focusSelection`; MCP Tools, Storybook, Links list-mode + pinned via `selectionStyle="focus"`) — the blue focused override moved to a **row-hosted** rule so a standalone `ListItem` (outside `ListBox`) is self-contained and its container needs only `data-focus-selection` + `tabIndex=0`. US-831 retrofitted the five hand-rolled surfaces (App menu `FolderItem`, Notebook Tags, ToDo, MCP Resources, Links Tags/Hostnames — the last two gaining a real selected background, replacing today's text-only blue) via a new minimal UIKit **`SelectableRow`** primitive — the Rule-7-clean home for the focus CSS that editor code (no Emotion) can't express inline. **No new color tokens, no theme edits.** Reviewed at epic level — clean, no architecture/standards violations.

- [x] [US-829: Shared focus-aware selection style](../tasks/US-829-shared-selection-style/README.md) — `uikit/shared/selection-style.ts`; `Tree`/`TreeItem` refactor (zero visual change); `ListItem`/`ListBox` `selectionStyle="focus"` + `Tree` `focusSelection`; decoupled from `keyboardNav`
- [x] [US-830: Shared-primitive consumers](../tasks/US-830-shared-primitive-consumers/README.md) — Rest Client tree, Notebook Categories (Tree); MCP Tools, Storybook, Links list-mode + pinned (ListBox); row-hosted `rowFocusSelectionOverride` for standalone `ListItem`
- [x] [US-831: Bespoke-row retrofits](../tasks/US-831-bespoke-row-retrofits/README.md) — App menu, Notebook Tags, ToDo, MCP Resources, Links Tags/Hostnames; new `uikit/SelectableRow` primitive

---

## EPIC-040 — [Dependency & Platform Updates (Keep Persephone Current)](EPIC-040.md)

A housekeeping cycle to pull Persephone's runtime and key libraries current so it never drifts into an unupdatable state (stale Chromium = site breakage; stale toolchains = painful multi-major migrations later). Each bump was isolated to its own task and verified against the surfaces it could affect, so any regression stays attributable. Landed: **Electron 39 → 43** (Castlabs `+wvcus` fork — Chromium 150 / Node 24, Widevine DRM + VMP signing preserved; also fixed an Electron-43 cross-origin regression by enabling `corsEnabled` on the `app-asset://` scheme), a **safe batch** of minor/patch npm bumps, **`@anthropic-ai/sdk` 0.86 → 0.111** (no code change — narrow, stable Messages-API slice), **`monaco-editor` 0.52 → 0.55** (top-level `monaco.typescript`/`monaco.css` namespace move; upstream menu-paste bug patched), the **ESLint flat-config migration** (eslint 9 + `@typescript-eslint` 8 + react-hooks 7), **Vite 5 → 8** (rolldown) with **Electron Forge fully removed** — dev now runs on an own `scripts/dev.mjs` (renderer dev server + HMR + watch-built main/preload/board-shim + Electron restart), prod on `scripts/build-prod.mjs`; and the last deferred majors **`csv-parse` 6 → 7** and **`picomatch` 2 → 4** (both verified behavior-identical against their sole consumers). Fuses were dropped with Forge (never actually applied in shipped builds; re-adding via an electron-builder `afterPack` hook is an optional hardening follow-up in the backlog). Reviewed at epic level — clean, no architecture/standards violations. **US-826 (TypeScript 5.9 → 7.0)** was deferred to the backlog: TS 7 is the native Go compiler with no JS API, and typescript-eslint peer-caps `typescript` `<6.1.0`. Residual release-time QA (DRM playback in a signed build + packaged installer) is tracked in the backlog for the next signed build.

- [x] [US-821: Update Electron to 43.0.0 (Castlabs +wvcus)](../tasks/US-821-electron-43-upgrade/README.md) — residual signed-build DRM/installer QA in backlog
- [x] [US-822: Safe batch — low-risk minor/patch npm bumps](../tasks/US-822-safe-batch-minor-bumps/README.md)
- [x] [US-823: Upgrade `@anthropic-ai/sdk` (0.86 → 0.111)](../tasks/US-823-anthropic-sdk-major/README.md)
- [x] [US-824: Upgrade `monaco-editor` (0.52 → 0.55)](../tasks/US-824-monaco-editor-major/README.md)
- [x] [US-825: ESLint flat-config migration](../tasks/US-825-eslint-flat-config-migration/README.md)
- [ ] [US-826: Upgrade TypeScript (5.9 → 7.0)](../tasks/US-826-typescript-7/README.md) — **deferred → [backlog](../tasks/backlog.md)** (blocked on typescript-eslint native-TS7 support)
- [x] [US-827: Upgrade Vite (5 → 8)](../tasks/US-827-vite-8/README.md) — Electron Forge removed
- [x] [US-828: Remaining deferred majors (csv-parse / picomatch)](../tasks/US-828-remaining-deferred-majors/README.md)

---

## EPIC-038 — [Agent Tools Registry](EPIC-038.md)

Added an **Agent Tools registry** — Persephone's *executable memory*, complementing Mneme's *knowledge* memory. An agent (or user) turns a working integration script into a persistent, reusable **tool**: a folder (a *toolset*) holding a `tools-manifest.json` declaring one or more tools plus scripts in **any language**, an optional `.env` for secrets, and an optional `README`. Once registered, any MCP-connected agent discovers tools with **`search_tools`** (Claude-Code-`ToolSearch`-style — matches return complete, ready-to-call definitions) and runs them with **`execute_tool`** (args delivered as JSON on **stdin**, results returned via a `##PERSEPHONE_RESULT##<json>` sentinel line — last-wins so noisy stdout is harmless; failures carry `stderr` + `exitCode` + `toolsetRoot` so the agent fixes the tool rather than working around it). The MCP surface is **constant-size** regardless of how many tools exist (`search_tools` / `execute_tool` / `refresh_toolset` / `create_toolset`) — deliberately *not* dynamic first-class tools, to avoid per-session schema bloat and flaky `listChanged` support. The design mirrors the Boards subsystem end-to-end: folder + manifest identity (`tools-manifest.ts`), a **user-only trust registry** (`tools-trust.ts` / `trustedTools.txt`, exact-path match — registration ≡ trust, never stored in the manifest, never exposed on `app`/scripts so a script can't self-register or self-execute), a reactive enumeration model (`registered-tools.ts`), template scaffolding (`tool-template/` + `tool-scaffold.ts`), and the command-runner execution engine (`tool-executor.ts` — cwd = toolset root, `.env` injection, `timeoutMs` tree-kill, self-rotating per-toolset `tools-execution.log`). Every agent-initiated registration (`create_toolset`, or registering a copied folder) is gated by a **"Register this toolset?"** confirmation dialog — a deliberate divergence from boards' auto-trust, because a registered tool later runs headlessly on every call. Management UI (US-805, re-scoped from a standalone list editor): registered toolsets surface on the two boards panels (an Explorer-sibling **Boards/Tools** switch + a third **Tools** segment in the global Tools & Editors panel), a lightweight **per-toolset editor** (`persephone-toolset://`, `toolset-view`) shows manifest info + tool list + execution log, and `tools-manifest.json` gets a register-gated **Open Toolset** icon in the Explorer tree. Toolsets are **portable** — self-contained relative-path folders with a `requirements` field for provisioning a new machine. Reviewed at epic level (close-out review clean; two optional correctness fixes applied — removed an unused icon; corrected an empty-`.env` doc claim).

- [x] US-801: Toolset package format + registry (`tools-manifest.json`, `toolsTrust`, `registeredTools` model)
- [x] US-802: Execution engine (stdin-JSON args, `.env` secrets, timeout, output contract, in-memory stats + self-rotating per-toolset log)
- [x] US-803: MCP surface (`search_tools` full-definition results / `execute_tool` / `refresh_toolset` + `mcp-res-tools.md` guide + instructions; `create_toolset` deferred to US-804)
- [x] US-804: Scaffolding + authoring template (`assets/tool-template/`, `createToolset` scaffold, registration confirmation dialog, `create_toolset` MCP tool)
- [x] US-805: Management UI — toolsets on the Boards/Tools panels + a per-toolset editor + `tools-manifest.json` open-icon (no standalone list editor)

---

## EPIC-037 — [Migrate Board `<webview>` → `<iframe>`](EPIC-037.md)

Replaced the board host `<webview>` tag with an in-DOM **cross-origin `<iframe src="board://<host>/index.html">`**, eliminating the tag's guaranteed per-open cold start (fresh out-of-process renderer + ephemeral partition + an async `registerBoardProtocol` round-trip before navigation — ~0.5–2 s) so a board now opens **instantly, like any built-in editor**. The trusted-code threat model justifies the move: a board is local, user-authorized, extension-like code (it can already `execute()` arbitrary processes), so SOP + `nodeIntegrationInSubFrames: false` + the served CSP is adequate isolation, and the in-DOM iframe composes naturally under all host overlays (the reason `WebContentsView` was rejected). Each board loads a **distinct `board://<host>`** origin (a stable hash of the board root minted by `registerBoard` in main), giving per-board storage isolation without separate session partitions; the `board://` handler moved from per-partition to a **single host-routed** handler on the shared session. The privileged bridge left the (now-deleted) `preload-board.ts` for a **`MessagePort` RPC**: main mints a `MessageChannelMain` port pair per board, the renderer brokers a one-time handshake transferring `port1` into the frame (`targetOrigin: "board://<host>"`), then the board talks **directly** to a main-process handler over the duplex port (`execute` streaming, dialogs, files, links, notify, theme push). The `window.persephone` surface is rebuilt by a browser-IIFE shim (`board-shim.ts`) the handler inlines into served HTML before the first author script. Automation (`browser_*`) was re-pointed below the frozen `IBrowserTarget` seam to target the board **frame** via CDP (`BoardTargetModel` + `cdp-service` `registerBoardFrame`), so the agent contract is byte-for-byte unchanged. The redundant open-time auto-reload (the "blink") was removed — manual **Reload** + a new **`board_refresh`** MCP tool replace it. Load failures funnel into the board's `ui.log` from four detectors (main `did-fail-load` + 404 logging; shim `securitypolicyviolation`, `window.onerror`/`unhandledrejection`; handshake watchdog). A go/no-go gate (US-775) confirmed the dramatic open-latency win before the bridge/automation rewrites committed; a live POC (US-776) de-risked the cross-origin port transfer + streaming end-to-end first. Reviewed at epic level (close-out fixed 2 concerns: `</script` escaping of the inlined shim source; a minimal `BoardEditorModel.dispose()` to clear the live iframe ref + frame CDP registration).

- [x] [US-769: Remove board auto-reload (blink fix); keep manual Reload; add `board_refresh` MCP tool](../tasks/US-769-remove-board-auto-reload/README.md)
- [x] [US-770: `<iframe>` host (no `sandbox` attr) + cross-origin `board://<host>` loading; host-routed handler; host CSP fix](../tasks/US-770-iframe-host-and-handler/README.md)
- [x] [US-771: `MessagePort` RPC bridge — `MessageChannelMain` board↔main; shim injected by `board://` handler; retire `preload-board.ts`](../tasks/US-771-messageport-bridge/README.md)
- [x] [US-772: Storage & theme parity verification (per-board-host origin isolation; no-flash + retint)](../tasks/US-772-storage-theme-parity/README.md)
- [x] [US-773: Automation parity (CDP on board frame + `BoardTargetModel`; focus→overlay dismissal)](../tasks/US-773-automation-frame-parity/README.md)
- [x] [US-774: Lifecycle — load-failure reporting (modes A+B+D+E); switch/close/dispose; multi-window](../tasks/US-774-board-lifecycle-parity/README.md)
- [x] US-775: **Go/no-go gate** — GO (iframe opens instantly vs. `<webview>` ~0.5–2 s); no production-code scope
- [x] [US-776: POC — `<iframe>` pre-script injection & bridge handshake (proven end-to-end; gate passed)](../tasks/US-776-iframe-bridge-poc/README.md)

---

## EPIC-036 — [Boards: Explorer-integrated switcher & in-board chrome](EPIC-036.md)

Reoriented Boards around the **Explorer root** instead of around `.persephone`. Introduced a single reusable, fully-expanded **`BoardsTree`** (folders compacted VSCode-style; pure `boards-tree-build.ts`) rendered everywhere boards are listed: a new **Explorer-sibling "Boards" panel** (`BoardsSecondaryView`, backed by `ExplorerEditor` exactly like Search, scoped to the Explorer root), the global **"Tools & Editors → Custom Boards & Editors"** tab (retrofitted onto the same tree, multi-root), and an **in-board toolbar** switcher popover. A new **Create-board dialog** (folder picker defaulting to the Explorer root + name + live target-location label) replaced the old name-only prompt. The **`.persephone` project mode was removed entirely** — the `persephone-folder://` scheme, the project Board editor's board-list view (`BoardListSecondaryView`), and the Explorer "Create .persephone project" / "Trust all boards" affordances are gone; `BoardEditorModel` is now single-board only, and a `.persephone` folder is an ordinary folder. An open board gained a Persephone **`BoardToolbar`** (Reload, Show-log, full board path → switcher popover, and a File Explorer button that opens the sidebar Explorer rooted at the board's parent folder); the switcher's scope rides a new persisted `ILinkData.explorerRoot` captured at open. Trust became **hierarchical** (`board-trust` is ancestor-aware, outer wins) so a board nested in a trusted folder is auto-trusted and the registry never holds a nested pair. Reviewed at epic level (close-out review clean — no concerns). Follow-on polish: `BoardsTree` hover-row highlight + a reusable `TreeItem` `trailingVisibility` opt-in.

- [x] [US-759: `BoardsTree` component — single reusable fully-expanded boards tree (single-root + multi-root)](../tasks/US-759-boards-tree/README.md)
- [x] [US-760: "Create board" dialog — folder picker + name + computed location](../tasks/US-760-create-board-dialog/README.md)
- [x] [US-761: Boards as an Explorer-sibling panel (mirror Search; remove Explorer Refresh)](../tasks/US-761-boards-explorer-panel/README.md)
- [x] [US-762: Single-board-only `BoardEditorModel`; remove `.persephone` project mode](../tasks/US-762-single-board-only/README.md)
- [x] [US-763: In-board toolbar — Reload, Show-log, path + boards popover](../tasks/US-763-in-board-toolbar/README.md)
- [x] [US-764: Retrofit Tools & Editors Boards tab onto `BoardsTree`](../tasks/US-764-tools-editors-boards-tree/README.md)
- [x] [US-766: Trust registry — forbid nested boards (inherited trust, outer wins)](../tasks/US-766-trust-no-nested-boards/README.md)

---

## EPIC-035 — [Boards Anywhere — portable boards, manifest identity, board-level trust, link/MCP open & sidebar registry](EPIC-035.md)

Generalized EPIC-034's Web Boards from "a board lives inside a `.persephone` project" into **portable, first-class custom tools**. A board is now identified by a **`board-manifest.json`** at its root (descriptive metadata only — no trust or behavior fields) and can live **anywhere on disk**; `.persephone/boards/` stays as the default create location. Trust moved from per-project to **per-board** — a path-keyed registry (`board-trust.ts` / `trustedBoards.txt`) that is also the **known-boards registry** (trusted ≡ registered); trust is never read from the manifest, foreign boards prompt a "Trust board" dialog, and boards Persephone creates are auto-trusted at creation. Boards open through a new **`persephone-board://`** in-app link scheme routed via `openRawLink` (parser-only, sibling of `persephone-folder://`). A board lifecycle API (**`app.boards`** — `createBoard`/`createDemoBoard`/`openBoard` + `app.openRawLink`) plus **`create_board`/`open_board` MCP tools** and a `read_guide("boards")` agent guide let an agent stand up and develop a board end-to-end with no user clicks. The **Explorer** adds an "Open Board" trailing button on `board-manifest.json` rows (row click still opens the JSON), and the sidebar **"Tools & Editors"** panel gained a **"Custom Boards & Editors"** tab listing trusted boards grouped by folder — boards are pinnable alongside built-in editors (unified `PinnedRef` over the `pinned-editors` setting) and pinned boards appear in the add-page dropdown. Reviewed at epic level (close-out fixed 2 concerns: stale board files in `folder-structure.md`; `app.ui.notify` vs the `ui` singleton). The Custom Editor axis (file-extension routing, file-as-input) is deferred to a successor epic.

- [x] [US-745: `board-manifest.json` — board identity file](../tasks/US-745-board-manifest/README.md)
- [x] [US-746: Boards anywhere — decouple board location from `.persephone/boards/`](../tasks/US-746-boards-anywhere/README.md)
- [x] [US-747: Trust at board level — per-board registry; project gate → "Trust all boards in this project" bulk action](../tasks/US-747-board-level-trust/README.md)
- [x] [US-748: Open-a-board link scheme (`persephone-board://`)](../tasks/US-748-open-board-link-scheme/README.md)
- [x] [US-749: Explorer "Open Board" row button](../tasks/US-749-explorer-open-board-button/README.md)
- [x] [US-750: Board lifecycle — `create_board`/`open_board` MCP tools + `app.boards` + `app.openRawLink` + agent boards guide](../tasks/US-750-board-lifecycle-api-mcp/README.md)
- [x] [US-751: Sidebar "Tools & Editors" Custom Boards & Editors tab + pinnable boards (remove ≡ untrust)](../tasks/US-751-tools-editors-boards-tab/README.md)

---

## EPIC-034 — [Web Board — HTML-page board with `persephone.execute` + board scripts](EPIC-034.md)

Added **Web Boards**: small local apps whose UI is a plain HTML page the user owns, hosted in a **sandboxed `<webview>`** (sandbox + contextIsolation on, nodeIntegration off, CSP forbidding remote network) served over a per-partition **`board://`** protocol, with a single injected `window.persephone` bridge. The bridge's one method, **`execute()`**, streams a real OS process spawned in the main process (a shared **command runner** — `runner-channels.ts` + `app.proc` — with whole-tree kill and per-owner reaping), plus an integration tier (`notify`, `openRawLink`, native file dialogs) and a live **`--p-*` theme contract** (CSS variables + JS mirror with `onThemeChange`). Boards live under a project's **`.persephone/boards/<Name>/`** behind a **per-project trust gate** (RCE-explicit confirmation; an untrusted project won't render). The **Board editor** (Pattern B, survive-navigation) provides a sidebar board list + main management surface with create/delete, "Create Demo board", per-board custom icons, `ui.log`, and live reload; a **"Create .persephone project"** Explorer context menu bootstraps a project. Boards are authored and debugged by an **AI agent over MCP** — they are first-class **`browser_*` automation targets** (the automation layer duck-types `editorId`, pulling no editor module into its bundle). Shipped a recommended-components catalog under **`boards-assets/`** (`manifest.json` + 9 component skins + a no-dependency native `<dialog>` pattern) and a living, self-documenting **demo board** (`assets/demo-board/`). Reviewed at epic level (close-out fixed 4 concerns: automation static-import isolation, board view/factory split, proc-contract drift guard, async `fs.append`).

- [x] [US-719: Command runner — shared main-process streaming spawn service (IPC interface; consumed by board preload, renderer `app` API, and optional MCP tool)](../tasks/US-719-command-runner/README.md)
- [x] [US-720: Process lifecycle — whole-tree kill (`taskkill /T`) + per-owner reaping](../tasks/US-720-process-lifecycle/README.md)
- [x] [US-721: Project trust gate + dialog (per `.persephone`; `trustedProjects.txt`; RCE-explicit confirmation)](../tasks/US-721-project-trust-gate/README.md)
- [x] [US-722: `.persephone` folder + Board editor + folder-click routing (sidebar board list + main management)](../tasks/US-722-board-editor-routing/README.md)
- [x] [US-723: `board://` protocol + locked-down webview + bridge injection + CSP](../tasks/US-723-board-protocol-webview/README.md)
- [x] [US-724: `persephone` bridge (board preload) — `execute()` handle (thin client over US-719) + integration tier (`openRawLink`, `notify`, file dialogs)](../tasks/US-724-board-bridge/README.md)
- [x] [US-725: Theme contract — `--p-*` CSS variables + `persephone.theme` (live update)](../tasks/US-725-theme-contract/README.md)
- [x] [US-726: Templates & scaffolding + `ui.log` + live reload](../tasks/US-726-config-templates-log/README.md)
- [x] [US-727: Recommended-components manifest + first skin (Tabulator)](../tasks/US-727-tabulator-skin/README.md)
- [x] [US-728: Demo board — bundle `assets/demo-board/` + "Create Demo board" entry points (empty-state button + "+ New board" `SplitButton` dropdown; snapshots the prepared demo, no project-creation dialog)](../tasks/US-728-demo-board/README.md)
- [x] [US-730: Web Boards as `browser_*` MCP automation targets (snapshot/click/type a board's webview; reuse the existing CDP engine)](../tasks/US-730-board-mcp-automation/README.md)
- [x] [US-731: "Create .persephone project" Explorer context menu (create-or-reveal `.persephone` → select → open Board editor; no dialog)](../tasks/US-731-create-persephone-project/README.md)
- [x] US-732: Shared board base stylesheet — `assets/board-base.css` (page bg, themed scrollbars, monospace default) copied into every board by the scaffolder; both templates link it first
- [x] [US-734: Recommended component — Chart.js (charts/dashboards; JS theme adapter)](../tasks/US-734-chartjs-skin/README.md)
- [x] [US-735: Recommended component — Flatpickr (date / time / range picker; `--p-*` CSS skin)](../tasks/US-735-flatpickr-skin/README.md)
- [x] [US-736: Recommended component — Tom Select (rich select / tags / autocomplete; `--p-*` CSS skin)](../tasks/US-736-tom-select-skin/README.md)
- [x] [US-737: Recommended component — marked + highlight.js (markdown render + code highlighting; `--p-*` code theme)](../tasks/US-737-markdown-skin/README.md)
- [x] [US-738: Recommended component — Mermaid (diagrams; JS `themeVariables` from `persephone.theme`)](../tasks/US-738-mermaid-skin/README.md)
- [x] [US-739: Recommended component — Split.js (resizable layout panes; `--p-*` CSS skin)](../tasks/US-739-split-skin/README.md)
- [x] [US-740: Recommended component — SortableJS (drag-to-reorder lists / kanban; `--p-*` CSS skin)](../tasks/US-740-sortablejs-skin/README.md)
- [x] [US-741: Recommended component — Tippy.js (tooltips / popovers / menus; `--p-*` CSS skin)](../tasks/US-741-tippy-skin/README.md)
- [x] [US-742: Recommended component — native `<dialog>` modal (no-dependency pattern skin)](../tasks/US-742-dialog-modal-skin/README.md)
- [x] [US-744: Per-board custom icon (`icon.svg`/`png`/`ico` → tab + tile + sidebar row; `BoardIcon` fallback)](../tasks/US-744-board-icon/README.md)

---

## EPIC-032 — [Mneme — Wiki / Vector Memory service](EPIC-032.md)

Built **Mneme**, a standalone Rust knowledge-base service that turns any folder of Markdown into a locally-indexed, searchable **vector memory** (SQLite FTS5 + `sqlite-vec`, on-device int8 ONNX embedding via `ort`), exposing hybrid full-text + semantic search and file-like read/write/edit/glob/grep tools over MCP. Integrated into Persephone end-to-end: a single shared auto-reconnecting MCP client with resource-subscription live-refresh, a `MnemeProvider` (read/write/edit), an Explorer-like tree sidebar with create/rename/delete + OS and cross-root drag-drop, a root search view (markdown-rendered results, tag/date filters), a config & monitoring editor (roots, include/ignore, reindex progress, model download/inventory, log), a Settings toggle with sidecar auto-launch, a tri-state header indicator, and first-run routing to download the model. Inference is **CPU-only** (DirectML/GPU benchmarked and removed). Shipped via electron-builder `extraFiles` (`mneme.exe`, ONNX statically linked, no bundled DLLs); the ~357 MB embedding model is a **separate GitHub release** (`mneme-models-v1`) downloaded on first use. Reviewed at epic level (US-690/691/692) and per-task for the Rust crate.

- [x] [US-651: Mneme — App architecture](../tasks/US-651-mneme-architecture/README.md)
- [x] [US-652: Project scaffold + config + Document Store](../tasks/US-652-mneme-scaffold/README.md)
- [x] [US-653: Frontmatter + chunker + SQLite schema (FTS5 + sqlite-vec)](../tasks/US-653-mneme-index-schema/README.md)
- [x] [US-654: Indexer + watcher + reconcile](../tasks/US-654-mneme-indexer-watcher/README.md)
- [x] [US-655: MCP server (Streamable HTTP, loopback, text-search) + agent guide](../tasks/US-655-mneme-mcp-server/README.md)
- [x] [US-656: Model Provisioner (download + sha256 + cache)](../tasks/US-656-mneme-model-provisioner/README.md)
- [x] [US-657: Embedding Engine (ort, CPU)](../tasks/US-657-mneme-embedding-engine/README.md)
- [x] [US-658: Hybrid search (sqlite-vec KNN + RRF)](../tasks/US-658-mneme-hybrid-search/README.md)
- [x] [US-659: Concurrency & responsiveness (worker, WAL, reindex job)](../tasks/US-659-mneme-concurrency/README.md)
- [x] [US-666: grep tags/dateRange/-n + mneme://status resource](../tasks/US-666-mneme-grep-filters-status-resource/README.md)
- [x] [US-660: Persephone settings + sidecar auto-launch](../tasks/US-660-mneme-settings-sidecar/README.md)
- [x] [US-671: MCP connection auto-reconnect](../tasks/US-671-mcp-connection-auto-reconnect/README.md)
- [x] [US-670: Resource-subscription emit (capability + subscribe/unsubscribe + watcher fan-out)](../tasks/US-670-mneme-resource-subscription-emit/README.md)
- [x] [US-661: McpConnectionManager subscription support (client wiring)](../tasks/US-661-mcp-subscription-support/README.md)
- [x] [US-662: MnemeProvider (read/write/edit + live-refresh)](../tasks/US-662-mneme-provider/README.md)
- [x] [US-673: Single shared MCP connection (fix status timeouts)](../tasks/US-673-mneme-single-connection/README.md)
- [x] [US-663: MnemeTreeProvider + Explorer-like sidebar panel](../tasks/US-663-mneme-tree-provider/README.md)
- [x] [US-674: Tree editing — create/rename/delete files & folders](../tasks/US-674-mneme-tree-editing/README.md)
- [x] [US-675: Tree — drag-and-drop file upload from the OS](../tasks/US-675-mneme-tree-file-drop/README.md)
- [x] [US-676: Root main view — search with displayed results](../tasks/US-676-mneme-root-search-view/README.md)
- [x] [US-678: Search — tag & date filters](../tasks/US-678-mneme-search-filters/README.md)
- [x] US-679: Sanitize FTS5 query (hyphens/operators no longer error)
- [x] [US-680: Search results — render as markdown via MarkdownBlock](../tasks/US-680-mneme-search-results-markdown/README.md)
- [x] US-681: Lower default `topK` 10→5 + document `topK`/`subtree` in tool description
- [x] [US-685: Decouple wiki file set from index set (full filesystem navigability)](../tasks/US-685-mneme-filesystem-navigability/README.md)
- [x] [US-686: `read` returns images as vision blocks + `upload`](../tasks/US-686-mneme-binary-tools/README.md)
- [x] [US-687: Relative `mneme://` links open attachments in the Image viewer](../tasks/US-687-mneme-relative-links/README.md)
- [x] [US-683: Rename `wiki_*` tools to bare names + de-wiki wording](../tasks/US-683-mneme-wiki-naming-generalization/README.md)
- [x] [US-668: `root_config` tool (live include/ignore)](../tasks/US-668-mneme-root-config-tool/README.md)
- [x] [US-664: Config & monitoring editor (+ header indicator)](../tasks/US-664-mneme-config-editor/README.md)
- [x] [US-677: Config editor — single-page redesign + toolbar cleanup](../tasks/US-677-mneme-config-redesign/README.md)
- [x] [US-669: Async long-running ops + live progress (add-root, model download, log file)](../tasks/US-669-mneme-async-add-root-indexing/README.md)
- [x] [US-688: Tree — own drag-drop (intra-root move + cross-root / cross-window copy)](../tasks/US-688-mneme-tree-cross-root-dnd/README.md)
- [x] [US-689: Small enhancements (Log button → mneme.log; +`getDataFolder` IPC)](../tasks/US-689-mneme-small-enhancements/README.md)
- [x] [US-690: Epic completion — code review](../tasks/US-690-epic032-review/README.md)
- [x] [US-691: Epic completion — developer docs](../tasks/US-691-epic032-document/README.md)
- [x] [US-692: Epic completion — user docs](../tasks/US-692-epic032-userdoc/README.md)
- [x] [US-693: Make "Apply & reindex" async (non-blocking)](../tasks/US-693-mneme-async-apply-filters/README.md)
- [x] [US-694: CPU-only embedding (GPU/DirectML benchmarked & removed) + folder opens in Explorer](../tasks/US-694-mneme-adaptive-gpu-embedding/README.md)
- [x] [US-695: "Remove root" deletes the on-disk `.mneme` index folder](../tasks/US-695-mneme-remove-root-delete-index/README.md)
- [x] US-696: Quiet the host console (stderr capped at WARN+ when `mneme.log` sink exists)
- [x] [US-665: Installer + first release (electron-builder `extraFiles` mneme.exe; model GitHub release)](../tasks/US-665-mneme-installer-release/README.md)

---

## EPIC-031 — [Git Functionality Enhancements (incremental)](EPIC-031.md)

Grew git from the read-only v1 (EPIC-030) into day-to-day tooling, built incrementally — one user-requested increment at a time, with a **per-task** review model (not the deferred epic-level pass). Delivered: a **"Changes" panel** (working-tree status → stage / unstage / reset → **commit** via a Commit dialog with editable author + branch), a **"Branches & Tags" panel** (browse, switch, create branch, click-to-reveal in the graph), **Push** and **Pull** (Git-Extensions-style split-button; shared fetch / ahead-behind / `GIT_TERMINAL_PROMPT=0` fail-fast auth foundation; never force-pushes), a Git Tree **bottom panel** (Commit + Diff tabs), **auto-refresh** (recursive watcher + `GIT_OPTIONAL_LOCKS=0`), persisted grid column layout, File Diff compare-commits improvements, and a new UIKit **`SplitButton`**. All mutating ops stay behind the off-by-default "Git integration" setting and degrade gracefully. Small one-off tweaks were logged in the rolling **US-625** (batch-reviewed 2026-06-10). Close-out: all tasks reviewed per-task — no outstanding review at close. Future git work will be filed as separate tasks/epics.

- [x] [US-616: Changes panel — status backend + unstaged/staged display](../tasks/US-616-git-changes-panel/README.md)
- [x] [US-617: Changes panel — manual close + empty-page + persistence](../tasks/US-617-git-changes-close-lifecycle/README.md)
- [x] [US-618: Git Diff "File History" panel + datetime column + L/R side-select](../tasks/US-618-git-diff-revisions-panel/README.md)
- [x] [US-619: Multiple same-type secondary panels (composite panel keys)](../tasks/US-619-multi-panel-secondary-views/README.md)
- [x] US-620: Changes panel — "Show Git Tree" header button
- [x] US-621: Git Tree toolbar — repository name (basename + full path on hover)
- [x] US-622: Git Tree grid — preserve column width/order across refresh/load-more
- [x] US-623: Git Tree grid — persist column layout in editor state
- [x] [US-624: Git Tree auto-refresh — recursive watcher + `--no-optional-locks`](../tasks/US-624-git-tree-autorefresh/README.md)
- [x] [US-625: Rolling log of small git tweaks (closed with epic; entries batch-reviewed)](../tasks/US-625-git-small-enhancements/README.md)
- [x] [US-629: Git Tree bottom panel + "Commit" tab](../tasks/US-629-git-tree-commit-panel/README.md)
- [x] [US-630: Git Tree "Diff" tab (changed files + per-file diff)](../tasks/US-630-git-tree-commit-diff-tab/README.md)
- [x] [US-631: Changes panel — stage / unstage / reset + AVGrid `FileGrid`](../tasks/US-631-git-stage-unstage/README.md)
- [x] [US-632: Changes panel — Commit staged files (Commit dialog)](../tasks/US-632-git-commit/README.md)
- [x] [US-634: Git Tree "Branches & Tags" panel + relocate "x" close](../tasks/US-634-git-branches-tags-panel/README.md)
- [x] [US-635: "Branches & Tags" panel — polish + click-to-reveal in graph](../tasks/US-635-git-branches-panel-polish/README.md)
- [x] [US-636: Switch to branch / remote branch / commit](../tasks/US-636-git-switch-branch-commit/README.md)
- [x] [US-637: File Diff — "commits to compare" link metadata](../tasks/US-637-git-diff-compare-commits/README.md)
- [x] [US-638: Create branch (grid "Create branch here" + Commit dialog)](../tasks/US-638-git-create-branch/README.md)
- [x] [US-641: Git Push + shared fetch / ahead-behind / auth foundation](../tasks/US-641-git-push/README.md)
- [x] [US-642: Git Pull — split-button + conflict reporting + UIKit `SplitButton`](../tasks/US-642-git-pull/README.md)

---

## EPIC-030 — [Git Integration — Git Tree + File Diff editors](EPIC-030.md)

Read-first git tooling, v1. Git access via **simple-git** in the main process (`git-service.ts` + `git-ipc.ts`), exposed to the renderer through a settings-gated, directory-cached API (`api/git.ts`). A new **"Git integration" setting** (off by default) gates everything — when off, zero git activity. Git membership is detected **once on the shared `TextFileModel` host** (`gitRepo` via `rev-parse`), so every text editor inherits the **"Git Diff" switch** with no per-editor code. Two new registered editors: a **Git Tree** editor (opened from the `.git` node in Explorer — branch/commit history on `AVGrid` + an SVG `BranchTreeCell` painting a ported VS Code MIT swimlane layout, paginated via the editor-owned `GitTreeModel`), and a **File Diff** editor (host-adopting, Monaco side-by-side diff with `from`/`to` revision pickers that reuse the Git Tree component in a popover; the Unstaged side is editable and writes back). v1 is strictly read/inspect — no mutating git operations. Close-out: `/review`, `/document`, `/userdoc` run as a single deferred pass over US-610–US-613. **Review disposition:** the `styled.*` usage in `components/git-tree/` was flagged against `coding-style.md:109` but **accepted** as consistent with existing `components/` precedent (`tree-provider/`, `file-search/`, `icons/`); the rule was left unchanged.

- [x] US-610: Git service + IPC + "Git integration" setting + host detection
- [x] US-611: Git Tree component (AVGrid + SVG BranchTreeCell + swimlane layout)
- [x] US-612: Git Tree editor + Explorer `.git` entry point
- [x] US-613: File Diff editor

---

## EPIC-029 — [Standalone PageNavigator → `SecondaryViews`, a reusable panel host](EPIC-029.md)

Renamed `PageNavigator` → `SecondaryViews` family and turned the component controlled (`views` + `ISecondaryViewsState` + `setState` props — no longer bound to `PageModel`). Widened `editor.page` from the concrete `PageModel` to a new `IPageHost` interface; `BrowserPanelHost` is the second implementer, hosting the bookmarks sidebar inside the Browser empty page and drawer. The `secondaryEditor` field renamed `secondaryView` everywhere, including persisted state. Link Editor panels became always-open (no close affordance, no duplicate in-view panels). Notebook, Todo, and Rest Client moved their bespoke splitter side-panel layouts into `SecondaryViews`. The stale `editors/base/IPageHost.ts` stub (deleted in US-607) was removed; `IPageHost` now lives at `api/pages/IPageHost.ts`. Close-out: `/review` (US-607), `/document` (US-608), `/userdoc` (US-609).

- **Phase 1a — Foundation**
- [x] [US-595: Rename `secondaryEditor`→`secondaryView` + `PageNavigator`→`SecondaryViews` family](../tasks/US-595-rename-secondary-view/README.md)
- [x] [US-596: `ISecondaryViewsState` + controlled `SecondaryViews` component](../tasks/US-596-controlled-secondary-views/README.md)
- [x] [US-597: `IPageHost` typing for `editor.page` (+ derived `isMain`)](../tasks/US-597-ipagehost-typing/README.md)
- **Phase 1b — Per-editor adoption**
- [x] [US-598: Explorer — adopt + verify under new infra](../tasks/US-598-explorer-adopt/README.md)
- [x] [US-599: Archive — adopt + verify under new infra](../tasks/US-599-archive-adopt/README.md)
- [x] [US-600: Links — finalize `IPageHost` membership + `isMain`](../tasks/US-600-links-finalize-ipagehost/README.md)
- [x] [US-600-a: Links — always-on `SecondaryViews`, drop in-view panels, unify Category click](../tasks/US-600-a-links-secondaryviews-refactor/README.md)
- **Phase 2 — Browser**
- [x] [US-601: Browser adopts `SecondaryViews` in its empty page + bookmarks drawer](../tasks/US-601-browser-secondaryviews/README.md)
- **Phase 3 — Remaining editors**
- [x] [US-602: Notebook → `SecondaryViews`](../tasks/US-602-notebook-secondaryviews/README.md)
- [x] [US-603: Todo → `SecondaryViews`](../tasks/US-603-todo-secondaryviews/README.md)
- [x] [US-604: Rest Client → `SecondaryViews`](../tasks/US-604-rest-client-secondaryviews/README.md)
- **Phase 4 — Close-out**
- [x] US-607: Epic close-out — `/review` (code audit vs architecture docs)
- [x] US-608: Epic close-out — `/document` (dev docs in `/doc/`)
- [x] US-609: Epic close-out — `/userdoc` (user docs in `/docs/`)

---

## EPIC-028 — [Unified Editor Architecture — Editors as Standalone Models](EPIC-028.md)

Single-hierarchy editor rewrite via strangler-fig migration over 37 tasks. All 22 editors became top-level `EditorModel` subclasses; text-bearing editors share `IContentHost`; owner-orchestrated switching via `CONTENT_HOST_TRAIT`. The `ContentViewModel` subsystem and the `EditorView` type alias are gone. Major version bump 3.0.10 → 4.0.1. Task folders and the `EPIC-028-editor-architecture/` design folder (walkthroughs, mockups, concerns log) were deleted on close — the per-task READMEs and walkthroughs were in-flight implementation contracts, not enduring reference material. The architectural outcome is captured in `/doc/architecture/editors.md` and the EPIC-028.md doc above. `/review`, `/document`, `/userdoc` skipped per user direction (US-583 / US-584 / US-585 already refreshed the dev-doc and user-doc surfaces).

- **Phase A — Foundation**
- [x] US-547: Foundation primitives — `EditorModel`, `IContentHost`, `ComponentQueue`, `TOneState` selector subscribe, new `editorRegistry`, `PageDescriptor` v4 types, `CONTENT_HOST_TRAIT` (inert)
- [x] US-548: PageModel adapter layer — unified `editors[]` + `_mainEditorId`; `LegacyEditorAdapter`; persistence dual-reads (v3 or v4) writes v4; `compareGroups` to `PagesModel.state`
- [x] US-549: Shared chrome — `PageToolbar` + `TextChrome`; NavPanel button auto-renders for sidebar editors; portal refs retired
- **Phase B — Cross-cutting**
- [x] US-550: MCP + scripting facades partial — `mcp-handler.ts` MI1–MI5; `page.asX()` gains `force?: boolean`; `PageWrapper.type` retired
- **Phase C — Per-editor migrations**
- [x] US-551: Monaco / Text editor migration — `MonacoEditor` v4 class + `<MonacoBody>`; `CONTENT_HOST_TRAIT` + cross-camp switch
- [x] US-552: Grid editor migration — 3 registry ids collapsed into 1 class with `format`
- [x] US-552-B: Host-managed editor view state — generic `getEditorState`/`setEditorState` on `IContentHost`; HS1 pattern established
- [x] US-553: LogView editor migration — `LogViewEditor` over `TextFileModel` host; cleanup of `acquireViewModelSync` callsites
- [x] US-554: Markdown editor migration — search + compact-mode + scroll machinery
- [x] US-560: Svg editor migration — baseline Tier-5 template
- [x] US-561: Html editor migration — identity-only state slice
- [x] US-562: Mermaid editor migration — async render + lightMode HS1
- [x] US-564: Graph editor migration — six owned submodels relocated; canvas-ref bridge
- [x] US-565: Draw editor migration — bidirectional Excalidraw payload loop; HS1 darkMode
- [x] US-555: Link editor migration — first sidebar-owning Tier-5; `beforeNavigateAway` + `onMainEditorChanged` first exercises
- [x] US-556: Todo editor migration — first non-sidebar-owning Tier-5 since Draw
- [x] US-563: Rest Client editor migration — `RestClientShared` extraction; response-cache split-by-scale
- [x] US-557: Notebook editor migration — outer-only scope; inner per-note deferred to US-579
- [x] US-558: Browser editor migration — first no-host v4 editor; first to embed another v4 EditorModel (drawer LinkEditor)
- [x] US-566: Compare editor migration — verification pass (zero source changes; landed in US-548 + US-549)
- [x] US-567: Explorer editor migration — first secondary-only `EditorModel` v4 native
- [x] US-568: PDF editor migration — generic v4-native no-host restore branch (`V4_NO_HOST_EDITOR_IDS`) + `wrapLegacyForPage` early-return for v4 instances
- [x] US-569: Image editor migration — dual-resource lifecycle (blob URL + cache file)
- [x] US-570: Archive editor migration — first no-host sidebar-owning v4 editor; completes EX8 `instanceof` chain
- [x] US-571: Video editor migration — streaming-server session lifecycle + VLC integration; `PageToolbar.noSpacer` opt-in
- [x] US-572: Settings editor migration — simplest no-host (identity-only state)
- [x] US-573: About editor migration — near-clone of Settings
- [x] US-574: MCP Inspector editor migration — most stateful no-host; mechanically the Video pattern in place
- [x] US-575: Storybook editor migration — singleton with persisted UI state
- [x] US-576: Category editor migration — only tree-provider consumer; closes walkthrough-30
- **Phase D — Cleanup**
- [x] US-581: Native v4 editor registry — internalize matching + retire legacy-registry dependency
- [x] US-579: Notebook inner per-note migration — embedded v4 `EditorModel` instances per note via duck-typed `NoteItemEditModel` host
- [x] US-559: Strangler-fig retirement — delete `LegacyEditorAdapter` + content-view subsystem + dual-read persistence; fold legacy `EditorModel` base into `TextFileModel`; bump 3.0.10 → 4.0.1
- [x] US-582: Post-strangler cleanup — drop `V4` prefix, fold `editors/base/v4/*` up, strip EPIC-028 narrative across ~135 files
- [x] US-583: EPIC-028 documentation audit + punch list — 72 files audited, 20 changes identified, U1/U2/U3 user-locked
- [x] US-584: Dev-doc refresh for EPIC-028 close-out — 9 architecture files updated, `editor-guide.md` rewritten, `CLAUDE.md` Key Files refreshed, 5 diagrams rewritten + 2 retired
- [x] US-585: User-doc + QA sweep for EPIC-028 close-out — `page.md` + `editors.md` + `whats-new.md` v4.0.1 section; 37 spot-check files clean

---

## EPIC-025 — [Unified Component Library and Storybook Editor](EPIC-025.md)

- [x] US-437: Design system HTML — closed; exploration complete
- [x] [US-438: Pattern research — adopted patterns + component naming table](../tasks/US-438-pattern-research/README.md)
- [x] US-439: New components folder setup + CLAUDE.md
- [x] US-426: Design tokens — spacing, sizing, border-radius, font-size constants
- [x] [US-427: Layout primitives — Flex, HStack, VStack, Panel, Card, Spacer](../tasks/US-427-layout-primitives/README.md)
- [x] [US-440: Bootstrap component set — minimal components needed for Storybook](../tasks/US-440-bootstrap-components/README.md)
- [x] [US-434: Storybook editor — component browser, live preview, property editor](../tasks/US-434-storybook-editor/README.md)
- [x] [US-450: UIKit Toolbar — semantic landmark, roving tabindex, Storybook adoption](../tasks/US-450-uikit-toolbar/README.md)
- [x] [US-451: UIKit layout refactor — unified Panel + Storybook lighthouse](../tasks/US-451-uikit-panel-refactor/README.md)
- [x] [US-432: Dialog component — new implementation + migration](../tasks/US-432-dialog-component/README.md)
- [x] [US-466: UIKit Popover — overlay primitive](../tasks/US-466-uikit-popover/README.md)
- [x] [US-467: UIKit Tooltip — overlay primitive](../tasks/US-467-uikit-tooltip/README.md)
- [x] [US-468: UIKit ListBox — virtualized list primitive](../tasks/US-468-uikit-listbox/README.md)
- [x] [US-469: UIKit RadioGroup — selection primitive](../tasks/US-469-uikit-radiogroup/README.md)
- [x] [US-470: UIKit Textarea — multi-line text input primitive](../tasks/US-470-uikit-textarea/README.md)
- [x] [US-471: UIKit Input — start/end slots](../tasks/US-471-uikit-input-slots/README.md)
- [x] [US-472: UIKit Select — searchable single-value combobox](../tasks/US-472-uikit-select/README.md)
- [x] [US-473: UIKit Popover — resizable mode](../tasks/US-473-uikit-popover-resizable/README.md)
- [x] [US-474: UIKit PathInput — hierarchical-path autocomplete input](../tasks/US-474-uikit-pathinput/README.md)
- [x] [US-475: UIKit Tag and TagsInput — pill primitive + tag-row composite](../tasks/US-475-uikit-tag/README.md)
- [x] [US-452: About screen — UIKit migration](../tasks/US-452-about-screen-migration/README.md)
- [x] [US-455: MermaidView — UIKit migration](../tasks/US-455-mermaid-view-migration/README.md)
- [x] [US-456: SvgView — UIKit migration](../tasks/US-456-svg-view-migration/README.md)
- [x] [US-457: HtmlView — UIKit migration](../tasks/US-457-html-view-migration/README.md)
- [x] [US-458: ImageViewer — UIKit migration](../tasks/US-458-image-viewer-migration/README.md)
- [x] [US-459: BaseImageView — UIKit adoption](../tasks/US-459-base-image-view-adoption/README.md)
- [x] [US-460: MarkdownSearchBar — UIKit migration](../tasks/US-460-markdown-search-bar-migration/README.md)
- [x] [US-461: Shared FindBar — consolidate MarkdownSearchBar + BrowserFindBar](../tasks/US-461-shared-findbar-consolidation/README.md)
- [x] [US-462: TorStatusOverlay — UIKit migration](../tasks/US-462-tor-status-overlay-migration/README.md)
- [x] [US-463: BrowserDownloadsPopup + DownloadButton — UIKit migration](../tasks/US-463-browser-downloads-migration/README.md)
- [x] [US-464: UrlSuggestionsDropdown — UIKit migration](../tasks/US-464-url-suggestions-dropdown-migration/README.md)
- [x] [US-465: CompareEditor — UIKit migration](../tasks/US-465-compare-editor-migration/README.md)
- [x] [US-476: AlertsBar + AlertItem — UIKit migration](../tasks/US-476-alerts-bar-migration/README.md)
- [x] [US-477: Progress dialog — UIKit migration](../tasks/US-477-progress-dialog-migration/README.md)
- [x] [US-481: UIKit Menu + WithMenu](../tasks/US-481-uikit-menu-with-menu/README.md)
- [x] [US-484: UIKit ListBox extensions — row tooltip, context menu, predicate selection, section rows](../tasks/US-484-uikit-listbox-extensions/README.md)
- [x] [US-485: UIKit Tree — virtualized expand/collapse tree primitive](../tasks/US-485-uikit-tree/README.md)
- [x] [US-488: UIKit Tree extensions — drag-and-drop via traits](../tasks/US-488-uikit-tree-dnd/README.md)
- [x] [US-489: UIKit Tree extensions — lazy children loading](../tasks/US-489-uikit-tree-lazy-load/README.md)
- [x] [US-486: UIKit Splitter — resizable divider primitive](../tasks/US-486-uikit-splitter/README.md)
- [x] [US-487: UIKit model-view migrations — Select, Menu, Popover, PathInput](../tasks/US-487-uikit-model-view-migrations/README.md)
- [x] [US-478: PageTabs / PageTab — UIKit migration](../tasks/US-478-page-tabs-migration/README.md)
- [x] [US-479: FileList + RecentFileList — UIKit migration](../tasks/US-479-filelist-migration/README.md)
- [x] [US-490: OpenTabsList — UIKit migration](../tasks/US-490-opentabslist-migration/README.md)
- [x] [US-491: FolderItem + MenuBar left list — UIKit migration](../tasks/US-491-folderitem-migration/README.md)
- [x] [US-495: ScriptLibraryPanel — UIKit migration](../tasks/US-495-scriptlibrarypanel-migration/README.md)
- [x] [US-496: ToolsEditorsPanel — UIKit migration](../tasks/US-496-toolseditorspanel-migration/README.md)
- [x] [US-497: TreeProviderView — UIKit Tree migration](../tasks/US-497-treeproviderview-migration/README.md)
- [x] [US-492: Sidebar — final integration testing and cleanup](../tasks/US-492-sidebar-integration-testing/README.md)
- [x] [US-480: MarkdownView — UIKit migration](../tasks/US-480-markdown-view-migration/README.md)
- [x] [US-503: UIKit `Dot` primitive — colored circle for status / swatch / palette](../tasks/US-503-uikit-dot/README.md)
- [x] [US-498: Settings page — UIKit migration](../tasks/US-498-settings-page-migration/README.md)
- [x] [US-504: UIKit ghost variants + hover-reveal pattern](../tasks/US-504-uikit-ghost-and-hover-reveal/README.md)
- [x] [US-499: TodoEditor — UIKit migration](../tasks/US-499-todoeditor-migration/README.md)
- [x] [US-500: TextEditor chrome — UIKit migration](../tasks/US-500-text-editor-chrome-migration/README.md)
- [x] [US-533: UIKit `Autocomplete` primitive — free-text input with suggestions dropdown](../tasks/US-533-uikit-autocomplete/README.md)
- [x] [US-534: UIKit primitive extensions — `Text.color` free-form, `Textarea` width/flex, `Panel.dimmed`](../tasks/US-534-uikit-primitive-extensions/README.md)
- [x] [US-501: RestClient editor — UIKit migration](../tasks/US-501-rest-client-migration/README.md)
- [x] [US-502: MCP Inspector — UIKit migration](../tasks/US-502-mcp-inspector-migration/README.md)
- [x] [US-505: Archive editor — UIKit migration](../tasks/US-505-archive-editor-migration/README.md) — absorbed into other migrations
- [x] [US-506: Category editor — UIKit migration](../tasks/US-506-category-editor-migration/README.md) — absorbed into other migrations
- [x] [US-507: Explorer + Search secondary editors — UIKit migration](../tasks/US-507-explorer-secondary-editors-migration/README.md) — absorbed into other migrations
- [x] [US-508: Draw editor — UIKit migration](../tasks/US-508-draw-editor-migration/README.md)
- [x] [US-509: Grid editor chrome — UIKit migration](../tasks/US-509-grid-editor-chrome-migration/README.md)
- [x] [US-511: PDF Viewer — UIKit migration](../tasks/US-511-pdf-viewer-migration/README.md) — absorbed into other migrations
- [x] [US-516: UIKit Breadcrumb primitive](../tasks/US-516-uikit-breadcrumb/README.md)
- [x] [US-517: UIKit CollapsiblePanelStack primitive](../tasks/US-517-uikit-collapsible-panel-stack/README.md)
- [x] [US-512: Notebook editor — UIKit migration](../tasks/US-512-notebook-editor-migration/README.md)
- [x] [US-519: UIKit primitive additions for Graph editor migration](../tasks/US-519-uikit-graph-editor-precursors/README.md)
- [x] [US-513: Graph editor — UIKit migration](../tasks/US-513-graph-editor-migration/README.md)
- [x] [US-520: UIKit primitive additions for Video / Audio editor migration](../tasks/US-520-uikit-video-editor-precursors/README.md)
- [x] [US-514: Video / Audio Player editor — UIKit migration](../tasks/US-514-video-audio-player-migration/README.md)
- [x] [US-521: UIKit `name` debug attribute for all primitives](../tasks/US-521-uikit-name-debug-attribute/README.md)
- [x] [US-515: Browser editor chrome — UIKit migration](../tasks/US-515-browser-editor-chrome-migration/README.md)
- [x] [US-522: UIKit `name` debug-attribute rollout across migrated screens](../tasks/US-522-uikit-debug-naming-rollout/README.md)
- [x] [US-523: LinkEditor — UIKit migration](../tasks/US-523-link-editor-migration/README.md)
- [x] [US-529: UIKit ProgressBar primitive — inline linear progress](../tasks/US-529-uikit-progress-bar/README.md)
- [x] [US-524: LogView editor — UIKit migration](../tasks/US-524-log-view-editor-migration/README.md)
- [x] [US-525: App shell + PageNavigator — chrome migration](../tasks/US-525-app-shell-chrome-migration/README.md)
- [x] [US-530: Editor base shared chrome — UIKit migration](../tasks/US-530-editor-base-chrome-migration/README.md)
- [x] [US-531: `showPopupMenu` — UIKit Menu migration](../tasks/US-531-show-popup-menu-migration/README.md)
- [x] [US-535: `MenuItem` caller-import flips](../tasks/US-535-menuitem-import-flips/README.md)
- [x] [US-536: `components/data-grid/` → `uikit/AVGrid/` migration](../tasks/US-536-uikit-datagrid/README.md)
- [x] [US-538: UIKit `RenderGrid` — virtualization primitive promotion](../tasks/US-538-uikit-rendergrid/README.md)
- [x] [US-539: UIKit `MultiSelect` — multi-value selection primitive](../tasks/US-539-uikit-multiselect/README.md)
- [x] [US-537: RestClient `TreeView` → UIKit `Tree` flip](../tasks/US-537-treeview-flip-restclient/README.md)
- [x] [US-542: Grid options popovers — `Popper` → UIKit `Popover` flip](../tasks/US-542-grid-options-popover-flip/README.md)
- [x] [US-543: KEEP folders — UIKit migration of legacy primitive consumers](../tasks/US-543-keep-folders-uikit-migration/README.md)
- [x] [US-532: Final `components/` sweep — empty the legacy folder](../tasks/US-532-legacy-components-removal/README.md)
- [x] [US-545: EPIC-025 documentation audit + punch list](../tasks/US-545-doc-audit/README.md)
- [x] [US-546: Dev-doc refresh for EPIC-025 close-out](../tasks/US-546-dev-doc-refresh/README.md)
- [x] [US-547: User-doc + QA + asset-guide sweep for EPIC-025 close-out](../tasks/US-547-user-doc-sweep/README.md)
- [x] US-518: UIKit ListBox `selectionStyle="accent"` + Storybook left-panel migration

---

## EPIC-026 — [Trait System — Universal Data Adaptation Layer](EPIC-026.md)

- [x] [US-428: Trait system core — TraitKey, TraitSet, Traited, traited()](../tasks/US-428-trait-system-core/README.md)
- [x] [US-444: Trait-based drag-drop infrastructure + link pilot — TraitRegistry, serialization, native HTML5 DnD, convert link-drag](../tasks/US-444-trait-drag-drop-infrastructure/README.md)
- [x] [US-447: Convert remaining data drags to trait-based system](../tasks/US-447-convert-data-drags-to-traits/README.md)
- [x] [US-448: Cross-type drop targets — FILE_FOLDER→Links import, cross-editor category drops, LINK→RestClient](../tasks/US-448-cross-type-drop-targets/README.md)
- [x] [US-449: Remove React-DnD dependency — convert component-level drags to native HTML5](../tasks/US-449-remove-react-dnd/README.md)
- [x] US-446: Documentation — trait system guide in /doc/architecture/

---

## EPIC-024 — [Video Player Editor](EPIC-024.md)

- [x] US-412: Video player standalone editor — model, registration, UI shell
- [x] US-413: Video playback component (video.js + hls.js)
- [x] US-414: URL input with cURL parsing and format detection
- [x] US-415: IProvider streaming extension (readStream + range support)
- [x] US-416: Local video streaming server for VLC and proxied sources
- [x] US-417: VLC integration — settings and launch

---

## EPIC-023 — [Unified ILinkData Pipeline](EPIC-023.md)

- [x] US-404: Define `ILinkData` interface and helper functions
- [x] US-405: Loosen EventChannel constraint and consolidate link pipeline events
- [x] US-406: Refactor Layer 1 parsers to use ILinkData
- [x] US-407: Refactor Layer 2 resolvers to use ILinkData
- [x] US-408: Refactor Layer 3 open handler and replace ISourceLink
- [x] US-409: Update all pipeline callers to use createLinkData / linkToLinkData
- [x] US-410: Update script API types, IoNamespace, and editor-types
- [x] US-411: Update architecture documentation

---

## EPIC-021 — [Browser Automation API (Lightweight RPA)](EPIC-021.md)

- [x] US-365: CDP integration (Electron debugger API)
- [x] US-366: Browser query and interaction API
- [x] US-367: Browser wait methods (waitForSelector, waitForNavigation)
- [x] US-368: Tab management and background automation
- [x] US-371: Browser accessibility snapshot
- [x] US-369: MCP browser automation commands
- [x] US-375: Automation layer architecture (refactoring)
- [x] US-376: Input dispatch via CDP (Trusted Types fix)
- [x] US-377: Ref resolution improvements
- [x] US-374: Accessibility snapshot: include iframes, detect overlays/popups
- [x] US-372: Fix script implicit return with block-body callbacks
- [x] US-373: Missing Playwright MCP browser tools (browser_hover implemented)
- [x] US-379: Fix browser_evaluate — accept `function` param (Playwright compat)
- [x] US-380: Fix browser_select_option — accept `values` array (Playwright compat)
- [x] US-381: Fix browser_wait_for — add `time` and `textGone` params (Playwright compat)
- [x] US-382: Fix browser_tabs — action-based interface (Playwright compat)
- [x] US-378: Known issues & edge cases (review before epic completion)
- [x] US-383: Block browser automation on incognito/Tor pages
- [x] US-384: MCP browser tools toggle (optional Playwright tools)
- [ ] US-370: Data protection hooks (PHI sanitization layer) — moved to backlog

---

## EPIC-020 — [Browser Network Request Logging & Resource Discovery](EPIC-020.md)

- [x] US-362: Network request logging in main process
- [x] US-363: Merge network logs into Show Resources
- [x] US-364: Open non-GET network requests in RestClient

---

## EPIC-018 — [Secondary Editors — Content Applications](EPIC-018.md)

- [x] US-337: Add `imgSrc` to ITreeProviderItem
- [x] US-338: Move favicon-cache to shared location
- [x] US-339: ItemTile component
- [x] US-340: CategoryView tile modes
- [x] US-341: Rename CategoryEditor → ExplorerFolderEditor + view mode
- [x] US-342: Test in Explorer — fixes and adjustments
- [x] US-343: Make folder editor provider-agnostic
- [x] US-344: LinkTreeProvider
- [x] US-345: Shared panel components
- [x] US-346: Extract LinksList and LinksTiles
- [x] US-348: LinkEditor refactoring — browser removal, context menus
- [x] US-349: CategoryView uses LinksList/LinksTiles
- [x] US-350: ILink type consolidation
- [x] US-351: Secondary editor registration
- [x] US-352: Clean up and unify link actions
- [x] US-353: Replace CategoryTree with TreeProviderView in LinkCategoryPanel
- [x] US-354: Consolidate ILink drag-drop into LinkDragEvent
- [x] US-355: Standalone link collection page
- [x] US-356: Multi-file drop handler
- [x] US-357: Link secondary editor fixes
- [x] US-358: HTML resource extraction
- [x] US-359: Links panel improvements
- [x] US-361: Adopt libarchive-wasm for multi-format archive support

## EPIC-019 — [Explorer as Secondary Editor + Multi-Panel Support](EPIC-019.md)

- [x] US-327: Multi-panel secondaryEditor
- [x] US-328: Create ExplorerEditorModel
- [x] US-329: Wire PageModel to ExplorerEditorModel
- [x] US-330: Search as Explorer panel
- [x] US-331: Per-editor highlighting
- [x] US-332: Simplify pageNavigatorModel
- [x] US-333: Replace expandSecondaryPanel event with direct method
- [x] US-334: Explorer/Search state persistence
- [x] US-335: Update documentation for EPIC-019
- [x] US-336: Improve Explorer/Archive panel highlighting

## EPIC-017 — [Page/Editor Architecture Refactor](EPIC-017.md)

- [x] US-317: Rename core types
- [x] US-318: Rename PageModel → EditorModel
- [x] US-319: Rename editor subclasses + EditorModule interface
- [x] US-320: Rename remaining editor names for consistency
- [x] US-321: Create PageModel class
- [x] US-322: Wire PagesModel to PageModel
- [x] US-323: Simplify navigatePageTo
- [x] US-324: Clean up EditorModel
- [x] US-326: EPIC-017 post-refactor bug fixes

## EPIC-016 — [Secondary Editors — Sidebar Extension System](EPIC-016.md)

- [x] US-312: Source link persistence
- [x] US-313: Secondary editor lifecycle
- [x] US-314: Secondary editor registry
- [x] US-315: ZipPageModel + ZipSecondaryEditor
- [x] US-316: Refactor PageNavigator for secondary editor models

## EPIC-015 — [ITreeProvider — Browsable Source Abstraction](EPIC-015.md)

- [x] US-290: Tree provider types
- [x] US-291: FileTreeProvider
- [x] US-292: ZipTreeProvider
- [x] US-293: TreeProviderView
- [x] US-295: CategoryView
- [x] US-296: Nav panel tree provider
- [x] US-297: Folder editor
- [x] US-298: NavigationData
- [x] US-299: Navigator toggle
- [x] US-300: Sidebar tree provider
- [x] US-301: Page navigator panels
- [x] US-302: Secondary provider
- [x] US-303: Link pipe utils
- [x] US-304: Navigation data persistence
- [x] US-305: Collapsible panel history
- [x] US-306: File search component
- [x] US-307: Search panel integration
- [x] US-308: Decommission nav search
- [x] US-310: Remove file explorer
- [x] US-311: Explorer autorefresh

## EPIC-012 — [Unified Link & Provider Architecture](EPIC-012.md)

- [x] US-260: EventChannel LIFO
- [x] US-261: Interfaces/types
- [x] US-262: FileProvider/ContentPipe
- [x] US-263: Link event channels
- [x] US-264: Raw link parsers
- [x] US-265: Pipe resolvers
- [x] US-266: Open handler
- [x] US-267: Migrate entry points
- [x] US-268: Migrate TextFileIOModel
- [x] US-269: Zip transformer
- [x] US-270: HTTP provider
- [x] US-271: Script API docs
- [x] US-273: cURL parser
- [x] US-274: Migrate reference editors
- [x] US-275: Decrypt transformer
- [x] US-276: Pipe serialization
- [x] US-288: Review EPIC-012
- [x] US-289: Browser image cache

## EPIC-013 — [Rebrand to "Persephone"](EPIC-013.md)

## EPIC-010 — [Rest Client](EPIC-010.md)

