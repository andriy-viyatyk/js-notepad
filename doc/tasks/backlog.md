# Task Backlog

Ideas and future tasks not yet planned for implementation.

---

## Agent cold start — the parts deferred from US-929

[US-929](US-929-agent-cold-start/README.md) covered what an agent can do with filesystem tools
alone (settings apply on disk change, an install-root `README.txt`, settings documented in the
guides). Three things were deliberately left out.

- [ ] **Main-process ownership of global settings.** Today every renderer window actuates
  `mcp.enabled` / `mneme.enabled`, so opening two windows double-calls start/stop and correctness
  rests entirely on those functions being idempotent. The clean end state: the main process
  watches `appSettings.json` and owns starting/stopping MCP and Mneme; renderers stop calling
  `setMcpEnabled` / `setMnemeEnabled`. Removes the startup double-call and the fragile reliance
  on idempotency. Per-window settings (script library path, theme, board vars, connection models)
  stay in the renderer — the split is global-vs-per-window, not main-vs-renderer.
- [ ] **Stop-during-start.** `stopMcpHttpServer` returns early on `!httpServer`, so a stop issued
  while the server is still starting is lost and the server ends up running after being disabled.
  `stopMneme` has the same shape. Fold into the item above.
- [ ] **Configure the agent for the user.** The real cold-start blocker is not documentation but
  the client config. Settings already offers *Copy Config*; going from "copy this" to "write it
  for me" (the MCP entry in the user's agent config, optionally a short block appended to
  `~/.claude/CLAUDE.md` — the only file that loads on every session regardless of directory)
  removes the step a first-time user is least equipped to do. A **Claude Code plugin** published
  from the repo could carry the MCP config and the guides together and install in one command;
  worth evaluating first, as it may subsume the rest.

---

## Publish the todo board (follow-up to EPIC-045)

Deferred out of [EPIC-045](../epics/EPIC-045.md) (Published Boards Catalog), which develops and
tests the whole publish/install flow on drawio-viewer only. Once that epic ships:

- [ ] Polish the `todo/` board (`C:\projects\persephone-boards\boards\todo`)
- [ ] Retire the built-in todo editor in favor of the board (migration story for existing users)
- [ ] Publish it: `board-manifest.json` gets `standalone: true` (file editor that can start
  empty) + a `version`, then bump-and-merge to `main`

---

## Dependency & Platform Updates (deferred / residual from EPIC-040)

Carried over when [EPIC-040](../epics/completed.md) closed (2026-07-13). Open a fresh
dependency-update epic when the next upgrade cycle starts.

- [ ] **TypeScript 5.9 → 7.0** — deferred from US-826 (EPIC-040). TS 7 is the native Go compiler
  with no JS compiler API; `@typescript-eslint/*` peer-caps `typescript` `<6.1.0` and consumes the
  JS API, so a full swap breaks lint. Revisit once typescript-eslint ships native-TS7 support.
- [ ] **Fuses hardening** — optional security follow-up. `@electron/fuses` was dropped as a direct
  dep when Forge was removed (US-827); fuses were never actually applied in shipped builds. To
  harden the packaged binary (e.g. `RunAsNode` off, cookie-encryption on), add an electron-builder
  `afterPack` hook that flips the fuses. Not a version bump — a deliberate hardening task.
- [ ] **US-821 release-time QA (residual)** — verify in a **VMP-signed** E43 build that Widevine
  DRM playback (Netflix / Disney+ / Spotify web) is licensed and plays, and that the packaged
  NSIS installer builds and launches. Cannot be checked locally; confirm when the next signed
  build ships. (Code + docs for the Electron 43 upgrade are complete and reviewed.)

---

## Code signing — apply to SignPath Foundation

Persephone ships unsigned. Verified on an installed 4.0.20 build: `Get-AuthenticodeSignature`
on `persephone.exe` returns `NotSigned`. That is worth fixing on its own merits, and it is also
the hard prerequisite for the Windows 11 context-menu item below.

**[SignPath Foundation](https://signpath.io) signs qualifying open-source projects for free**,
OV-level, through a managed CI pipeline. Persephone is MIT-licensed with a public repo, which is
their target profile. Apply there first — every other route costs money:

| Option | Cost | Catch |
|---|---|---|
| SignPath Foundation | Free | Must qualify as OSS |
| Microsoft Store (MSIX) | Free | Store re-signs, but it is a different distribution path |
| Azure Artifact Signing (was Trusted Signing) | ~$9.99/mo | Individuals: **USA and Canada only**; organizations add EU and UK |
| OV certificate | $150–300/yr | HSM or USB token required since June 2023 — a physical token cannot be used from GitHub Actions |
| EV certificate | $400+/yr | Not worth it, see below |

- [ ] **Apply to SignPath Foundation**, then wire signing into `.github/workflows/publish.yml`.
  Note the existing Castlabs EVS step is **VMP** signing for Widevine — unrelated to Authenticode
  and not a substitute. `scripts/vmp-sign.mjs` runs on `afterSign` precisely because on Windows
  VMP signing must follow Authenticode, so an added signtool step must stay ahead of it.

Two facts that change the usual reasoning, both current as of Microsoft's April 2026 guidance:

- **Signing does not remove the SmartScreen warning.** EV's instant-bypass behavior was removed in
  2024; every certificate type now builds reputation per file hash over time. Unsigned still gets
  a materially stronger block, and enterprises may refuse unsigned binaries outright — but do not
  expect a clean first-download experience the day signing lands.
- **From 15 February 2026 certificate lifespans are capped at one year**, so multi-year prepaid
  discounts on traditional certificates are gone.

### Dependent: "Open with persephone" in the Windows 11 top-level context menu

Our Explorer entries are classic registry verbs (`*\shell\`, `Directory\shell\`,
`Directory\Background\shell\`), and Windows 11 puts **every** classic verb under *Show more
options* regardless of publisher. The modern menu only shows commands from apps implementing
`IExplorerCommand` registered through an MSIX package manifest.

VS Code does exactly this — confirmed by reading its manifest on a dev machine: a sparse package
(`Microsoft.VisualStudioCode_…_neutral`, `AllowExternalContent`) declaring
`windows.fileExplorerContextMenus` for `Directory`, `Directory\Background` and `*` — the same
three surfaces we already register — backed by a COM server (`code_explorer_command_x64.dll`).

- [ ] **Blocked on signing above.** Needs a native `IExplorerCommand` DLL (Rust + `windows-rs` is
  viable — the repo already ships three Rust binaries), a sparse MSIX manifest, and installer
  registration. The package must be signed by a certificate the machine already trusts;
  self-signed only works where the cert has been deployed to Trusted Root, so it is not an option
  for public distribution. Users can reach the current entry with Shift+right-click meanwhile.

---

## Recorded Epics (not currently planned)

Epics with a written design that are **not** scheduled work — recorded ideas kept out of the
dashboard so it only shows what is actually being worked on. Each doc keeps its full breakdown;
the task ids below are reserved. To pick one up, move its entry back to the **Planned** section
of [`active-work.md`](../active-work.md) along with its task list.

### Agent transparency roadmap, epics 2–7 (EPIC-085 … EPIC-090)

Sequenced in [agent-transparency-roadmap.md](../agent-transparency-roadmap.md): shell, text
family, data editors, boards and tools, browser (folds `browser_*` into page facades and deletes
the `mcp.browser-tools.enabled` setting), and consolidation (call-only flag, QA re-run on Haiku
and Codex, then deletion of every other tool). Epic documents are written as each one starts;
EPIC-084 on the dashboard is the prerequisite for all of them.

### De-React package 8 — teardown-rebuild renders, `{state,setState}` props, ref drilling

**No document, and deliberately not an epic** — package 8 of the De-React second-pass roadmap
(`doc/de-react-refactoring-2.md`, deleted 2026-09-05 when the user declared De-React finished; it
remains in git history). Recorded 2026-09-01 when EPIC-082
was cut; **re-scoped 2026-09-03** after the four strands were verified against source. Two slices
were worth extracting as tasks, two were not worth doing at all.

**Extracted as standalone tasks (see [active-work.md](../active-work.md) Planned):**

- [US-1282](US-1282-header-host-rename/README.md) — §1.7's ref work. The "43 uses of the
  `(el | null)` unmount convention" claim was wrong: only **8** occurrences are the callback
  protocol, all inside `uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts`, and **nothing
  supplies it** — the sole `CollapsiblePanelProps` producer (`SecondaryViewsView:171-181`) never
  sets the field, so the protocol is unreachable and deletable. The other 35 sites drill a plain
  `HTMLDivElement | null` **element** through ~17 sibling leaf views that each consume it one hop
  down — host-passing, exactly what US-1273 concluded for `toolbarPortalRef`. Actionable work: a
  dead-code deletion plus a `headerRef` → `headerHost` rename.

**Not doing:**

- **§1.4 teardown-and-rebuild `render()`** — dropped as a blanket item, replaced by a rule:
  *rebuild-on-update is a defect only when the rebuilt subtree holds something a user can be in the
  middle of* (focus, caret, selection, scroll offset, `<details>` state, an in-flight drag). By that
  test `AboutView` and `BoardInfoEditorView` are fine — they update on demand and hold nothing. The
  one live specimen is `editors/mcp-inspector/McpInspectorView.ts:255` (`ServerInfoPanelView.render`
  disposes and rebuilds a `MarkdownBlockView` inside an `overflow: auto` panel, resetting the
  Instructions scroll position on every update); fix it if it ever annoys anyone. Also note
  `editors/base/TextChromeView.ts:335,470` never belonged on the list — both `replaceChildren()`
  calls are *branch teardown* on a content-host identity change, where a full rebuild is correct.
- **`ExpandedNoteView.ts:367-369`'s private `setState(partial)`** — dropped. Three lines wrapping
  `state.update`, called 10x with literals. A naming preference with no behavioural difference.
- **§1.5's three `lastProjection` chains** (`GitRefsView:116-120`, `MarkdownBodyView:391-405`,
  `PopoverView:377-380`) — still recorded, still unscheduled. Hand-inlined `React.memo` shallow
  compares where a selector `bind()` would do. Cheap individually; take one when already in the file.
- **The `{ current: T }` ref boxes** (`components/git-tree/GitTreeView.ts:204,242`) — still
  recorded. Out of scope for US-1282, which is scoped to `headerRef`.

### [EPIC-039: Secure Peer-to-Peer Connections](../epics/EPIC-039.md) (Contacts, Chat, Remote Control)

End-to-end-encrypted connection between two Persephone instances — out-of-band contact pairing
(pinned public keys), chat, a `peer://` provider for editing a file on the peer's disk, remote
command control, and a remote window mirror. Persephone's own libsodium layer is the security
boundary; the transport is pluggable (MQTT backend first). 8 tasks: US-813 … US-820.

### [EPIC-022: LinkEditor Embedded Scripts](../epics/EPIC-022.md)

Scripts stored inside `.link.json` files, organized in a "Scripts" panel and triggered by link
events (add/update, before open), so a link collection is self-contained and portable. Runs on
the existing ScriptRunner with an injected scope; each script edits in Monaco over a virtual
`IProvider` backed by the LinkViewModel. 8 tasks: US-396 … US-403.

### [EPIC-014: Claude AI Chat Panel](../epics/EPIC-014.md)

A right-side chat panel over `@anthropic-ai/claude-agent-sdk` (reusing Claude CLI auth), with
Persephone MCP auto-registration, active-page context injection, streamed markdown responses and
conversation persistence. App-level, so conversations survive tab switches. Includes the
`Ctrl+\`` open-PowerShell-at-cwd shortcut that stands in for a full terminal editor.
7 tasks: US-385 … US-391.

### [EPIC-011: Chrome Extension Support for Built-in Browser](../epics/EPIC-011.md)

Load Chrome extensions (ad blockers, password managers, devtools) into the built-in browser's
tabs, per the `electron-chrome-web-store` / profile-scoped-session approach that Flow Browser
uses on the same Castlabs fork. Manifest V3 support is only partial upstream. No task breakdown
written; the doc carries the research notes.

---

## Architecture Improvements

### The three focus-after-page-focus races (deferred out of EPIC-081)

`editors/base/TextChromeView.ts:492`, `editors/board/BoardWebview.ts:154`, and
`editors/browser/BrowserView.ts:464` each wait 100–200 ms after a page-focus event before focusing
their own element. **Recorded 2026-09-01**, deferred out of EPIC-081 after verification: P4's
`firstLayout` cannot fix them, because the element is already laid out — they are waiting for a
*competing* focus to finish. The honest fix is an ordering contract in the focus pipeline, which is
materially larger and riskier than the rest of that epic's sweep and is verifiable only by hand
across three editors. Worth doing when someone is already inside the focus path.

Note these are also raw `setTimeout`, not owner-bound `this.schedule.timeout` — EPIC-080's US-1263
swept rAF sites only. Converting them is not a fix on its own, so do not do it in isolation.

### `cell-tooltip`'s module-global popover observer needs an upstream av-grid hook

`uikit/DataGrid/cell-tooltip.ts:155` installs a `MutationObserver` on `document.body` that matches
`.avg-popover` by class name and is "installed once for the module and never torn down".
**Recorded 2026-09-01**, routed out of EPIC-081: the comment already names the right fix — an
av-grid popover open/close hook — which is an upstream change, not a Persephone one. Pick this up
alongside the next av-grid version adoption, where the upstream surface is already in scope.

### Two more callers of `getExpandedMap()` have US-1039's hint-only blind spot

Surfaced by the `/review` pass on US-1039 (2026-08-29) and verified against source, but
deliberately **not** fixed there — widening a batch under review defeats the point of reviewing it.

`TreeModel.getExpandedMap()` returns `{ ...state.expanded }`, i.e. **explicit toggles only**. A tree
whose expansion came from the `defaultExpandedValues` hint — every restored or freshly-built tree
the user has not clicked in — reports an empty map. `buildTree` merges hint ∪ state to compensate
(`TreeProviderViewModel.ts:310-327`) and US-1039 gave `setSearchText` the same treatment via
`expandedResolver`. Two callers still take the raw map:

1. **`getState()` (`:514`) — state persistence, and the more serious of the two.** It saves
   `expandedPaths` from the raw map, so a tree restored from saved state and never clicked in would
   persist an **empty** expansion, losing it on the next launch. Note the counter-evidence before
   acting: repeated renderer reloads during US-1039 restored the full expansion every time, so
   either `getState()` is not called on that path or something else repopulates it. **Establish
   whether it actually fires before treating this as live** — it is a code-shape hazard with no
   observed symptom yet.
2. **`getExpandedPaths()` (`:685`) — shallow (1-2 character) search.** `filterTreeShallow` uses the
   expanded-path set to decide what to show, so on a hint-only tree it behaves as though nothing is
   expanded. This **matches an observation during US-1039**: a shallow search on a freshly reloaded
   tree collapsed the view to the root. Likely live, and cheap to fix with the same resolver.

The fix for both is the one already used twice: resolve through `expandedResolver` instead of
reading `getExpandedMap()` directly. Worth doing together so the class is finished rather than
three-quarters done — and worth considering whether `getExpandedMap()` itself should return the
effective map, which would remove the trap instead of patching its fourth and fifth exits.


### Six unsafe type assertions deferred by EPIC-072

EPIC-072's `/review` pass left these unfixed rather than widen its scope, and they are still
present (re-checked 2026-08-30, after the review file that recorded them was deleted):

- `as unknown as` — `src/renderer/editors/board/index.ts`, `src/renderer/editors/board/BoardEditorView.ts`
- `as never` — `src/renderer/editors/browser/BrowserView.ts` (4 sites)

Two other entries on the original list are already gone: `UrlSuggestionsDropdown.ts`'s `as never`
and `BoardToolbar.ts`'s definite-assignment `!`. The `BrowserView.ts` ESLint suppression was not
re-verified. Low priority — each assertion is local and none is known to be wrong; the value is in
removing the class, not in fixing a bug.

### A content-host editor's module failure is still a silent no-op

US-1185 guarded the three silent `createEditorFromFile` call sites, but only **no-host** file editors
(those declaring `newEditorModel`: image, archive, video, category, git-tree, mneme-root, board,
toolset) load their editor module inside that call. `buildEditorById` returns a plain `TextFileModel`
host early for **any** editor registered `hasContentHost: true`, *without loading the module at all* —
it is resolved later, in `attachEditorToPage` or the view layer. So a module failure for env-vars,
file-diff or the text editors surfaces on a path nothing guards, and that is the common case. This is
the **third** silent path in the family (US-1163 covered standalone pages, US-1185 covered no-host
files); it is uncovered, and finding it cost two wrong probes because breaking a content-host editor
looks exactly like a failed fix. Worth closing so the class is finished rather than two-thirds done.

### `ToolbarView` lets a caller append into its root, then wipes it

`ToolbarView.onUpdate` calls `fillSlot(this.root, props.children)`, which owns the root and can destroy
anything a caller appended directly when the requested children differ or are empty. Matching slot
nodes now remain in place, but direct appends still violate the contract. **Both** of its callers did
that: `Toolbar.story.ts` (live defect, fixed as US-1187) and `StorybookEditorView.ts:81`, which escapes
only because it never calls `this.toolbar.update(...)` — latent, and one future `update()` from an
empty application toolbar. Two of two callers making the same mistake reads as an under-documented
contract rather than carelessness.
Options: document it on `ToolbarProps.children`, or make `ToolbarView` refuse/absorb a manual append
so the hazard cannot be hit. Cheap either way, and it removes a trap rather than a bug.


### Smoke-test the script `app` surface at runtime

The project has no test framework, so nothing exercises `app.*` through the real script path
(`ScriptContext` → `AppWrapper`). That is why `app.boardVars` shipped a full release as `undefined`
for every script while `app.boardVars` on the real singleton worked fine — the code was there, the
wrapper getter was not.

`AppWrapper` now carries a compile-time member-name check against `IApp`, which catches an omitted
getter. It cannot catch a getter that returns `undefined` because a service failed to load in
`App.initServices()` — the whole namespace block is `undefined as unknown as I…` until that runs.

- [ ] Decide on a test runner (none exists today; Vitest is the natural fit for a Vite project)
- [ ] Add a script-path smoke check asserting every `IApp` member is defined after
  `initServices()` resolves — cheap, and it covers the failure the type check cannot see
- [ ] Consider extending the member-name check to `PageCollectionWrapper` / `PageWrapper`, which
  have the same shape of gap (no `implements` clause, richer concrete return types)

### Script Service Enhancements

**Goal:** Expand scripting with hooks and toolbar builder API.

**Target State:**
- `ScriptHooks.ts` - language/event hooks system
- `ToolbarBuilder.ts` - API for scripts to add toolbar items
- Expanded ScriptContext with `app` and `toolbar` namespaces

#### Script Hooks System

**Tasks:**
- [ ] Create `scripting/ScriptHooks.ts`
- [ ] Define hook types: `onLanguageChange`, `onFileOpen`, `onFileSave`
- [ ] Create hooks registry and execution logic
- [ ] Integrate with TextFileModel language change
- [ ] Add UI for configuring hooks

#### Toolbar Builder API

**Tasks:**
- [ ] Create `scripting/ToolbarBuilder.ts`
- [ ] Define API: `toolbar.addButton()`, `toolbar.addCombobox()`, `toolbar.clear()`
- [ ] Connect to editor toolbar ref system
- [ ] Add to ScriptContext

#### Expand ScriptContext

**Tasks:**
- [ ] Add `app` namespace: `openFile()`, `showAlert()`, `showConfirm()`
- [ ] Add `toolbar` namespace
- [ ] Document new script capabilities

**Complexity:** High

---

### Script Output Mode Improvement

**Goal:** Allow scripts to control output page content directly without being overwritten.

**Current Behavior:**
- Script executes
- On success: return value overwrites `page.grouped.content` (prints "undefined" if no return)
- On error: error message with stack trace overwrites `page.grouped.content`
- Any assignment to `page.grouped.content` during script execution is overwritten

**Problem:** Scripts cannot incrementally write to output (useful for long-running tasks that want to show progress).

**Proposed Behavior:**
- If script does NOT assign to `page.grouped.content`: preserve current behavior (return value → output)
- If script DOES assign to `page.grouped.content`: "manual output mode"
  - Do NOT overwrite with return value
  - Script controls output content directly
  - On error in manual mode: show error dialog instead of overwriting output page

**Use Cases:**
- Long-running scripts that append progress updates to output
- Scripts that want to format output in a specific way during execution
- Scripts that build output incrementally

**Tasks:**
- [ ] Track whether `page.grouped.content` was assigned during script execution
- [ ] Modify ScriptRunner to check output mode after execution
- [ ] In manual mode: skip writing return value to output
- [ ] In manual mode on error: show error dialog instead of overwriting output
- [ ] Update scripting documentation with new behavior
- [ ] Add examples of incremental output scripts

**Complexity:** Medium

---

### Undo/Redo for TextPageModel

**Goal:** Implement undo/redo at the TextPageModel level so all editors (Grid, Notebook, Markdown, etc.) inherit undo/redo support, similar to how VS Code provides undo/redo for custom editors via its text document model.

**Current State:**
- Only Monaco editor has undo/redo (via its own internal history)
- When switching from Monaco to Grid editor, Monaco unmounts and its undo/redo history is lost
- Grid editor, Notebook editor, and other editors have no undo/redo support

**Target State:**
- TextPageModel maintains an undo/redo history stack tracking content changes
- All editors that modify content through TextPageModel automatically get undo/redo
- `Ctrl+Z` / `Ctrl+Shift+Z` work in Grid editor, Notebook editor, etc.
- History survives editor switches (e.g., Monaco → Grid → Monaco)

**Tasks:**
- [ ] Design undo/redo history model in TextPageModel (operation stack with content snapshots or diffs)
- [ ] Implement `undo()` and `redo()` methods on TextPageModel
- [ ] Add global keyboard handler for `Ctrl+Z` / `Ctrl+Shift+Z` when non-Monaco editors are active
- [ ] Integrate with Grid editor data changes
- [ ] Integrate with Notebook editor changes
- [ ] Handle history limits (max stack size) to prevent memory issues
- [ ] Preserve Monaco's own undo/redo when Monaco is active (avoid double-handling)

**Complexity:** High

---

### Shared folder-watcher service (Explorer + consumers)

**Goal:** Extract folder-change watching into a single shared service that multiple consumers subscribe to, instead of each feature opening its own `DirectoryWatcher`.

**Motivation:** The Explorer already watches folders for changes. Features that live *inside* a watched folder — e.g. the Board editor (EPIC-034) reflecting boards added/removed under `.persephone/boards/` — would otherwise each need their own watcher. A single watcher on a **parent** folder can detect descendant changes and fan out events to all interested subscribers (Explorer, Board editor, …), avoiding duplicate OS watchers on overlapping paths.

**Sketch:**
- A service owning `DirectoryWatcher` instances (`core/utils/file-watcher.ts`), de-duplicated by path — one watcher per parent; nested subscribers share it.
- Subscribe API (e.g. `watch(path, cb): unsubscribe`); the service merges the minimal set of OS watchers and routes change events to matching subscribers.
- Explorer migrates to it; the Board editor's board-list live refresh (EPIC-034 / US-722 C6) becomes a subscriber rather than its own watcher.

**Complexity:** Medium

---

## New Features

### Tool Editors Infrastructure

**Goal:** Editors for structured data files.

> ToDo Editor moved to active tasks: US-022

#### Bookmarks Editor (`*.link.json`)

Categorized bookmarks with tags.

**Tasks:**
- [ ] Create `editors/tools/bookmarks/` structure
- [ ] Create `BookmarkPageModel` extending PageModel
- [ ] Create `BookmarkEditor.tsx` component
- [ ] Register for `*.link.json` files
- [ ] Implement bookmark management with categories

**Complexity:** High (each)

---

### Hex Editor

**Goal:** Open and view/edit binary files (`.bin`, `.dat`, `.wasm`, `.exe`, `.dll`, etc.) in hex format.

Developers frequently need to inspect binary data — file headers, protocols, WASM modules. A hex view with offset columns, hex bytes, and ASCII representation. Could build on top of existing virtualization for large files.

**Complexity:** Medium-High

---

### Log Viewer

**Goal:** Specialized viewer for `.log` files with live tail, line filtering, regex search, and severity-level coloring.

Developers deal with logs daily and plain text editors don't help. A dedicated view with real-time filtering, severity highlighting (ERROR/WARN/INFO/DEBUG), and follow-tail mode would be very useful.

**Complexity:** Medium

---

### REST Client

**Goal:** Lightweight API testing tool using `.http` file format (same as VS Code REST Client extension).

Note: persephone already supports a basic REST workflow — create a JS file, write `const resp = await fetch(...); return await resp.json()` and execute it. A dedicated REST editor would add a more visual experience with request/response panels, headers UI, and history. Discussable whether the added value justifies the effort.

**Complexity:** High

---

### Regex Tester

**Goal:** Interactive regex testing tool with live match highlighting and capture group display.

Note: Users can already test regex via scripting (`page.content.match(/.../g)`), but a dedicated tool with visual highlighting of matches, named groups, and replace preview would be more convenient. Discussable.

**Complexity:** Medium

---

### JWT Decoder

**Goal:** Paste or open a JWT token, see decoded header and payload with expiration check.

Note: Already achievable via script panel (`page.content.split(".").slice(0,2).map(atob)`), but a dedicated viewer with formatted JSON output, expiration status, and signature info could be more convenient. Discussable — low effort but also low differentiation.

**Complexity:** Low

---

### Color Palette Editor

**Goal:** Create and edit color palettes with a palette generator for background/foreground combinations.

Good candidate for a tool editor. Could generate proper color schemes for web apps — complementary, analogous, triadic palettes. Display swatches, convert between hex/rgb/hsl, check contrast ratios (WCAG), and export as CSS variables or JSON.

**Complexity:** Medium-High

---

### System Information Editor (`*.sys.json`)

**Goal:** A diagnostic editor that scans and displays comprehensive Windows system information — running processes, services, startup apps, scheduled tasks, network connections, and more — to help investigate system issues like malware, performance problems, or network connectivity.

**Motivation:**
- Investigating system issues (suspicious processes, high CPU usage, unexpected network activity) currently requires manual PowerShell/Task Manager work
- Network diagnostics (e.g., detecting a network adapter running at lower speed than expected) require separate tools
- Having a persistent `.sys.json` file allows comparing scans over time to detect new/removed processes or services — critical for identifying malware or unwanted software

**Core Features:**

1. **File-based persistence** — opens/saves `*.sys.json` files containing last scan data
2. **Refresh/Scan button** — collects system information by spawning PowerShell processes
3. **Diff highlighting** — after a new scan, highlights what's NEW and what's REMOVED compared to the previous scan stored in the file
4. **Executable path resolution** — every process/service is matched to its real executable path on disk so the user knows where it comes from

**Data to Collect (via PowerShell):**

| Category | Description |
|----------|-------------|
| Running Processes | Name, PID, executable path, CPU %, memory usage, start time, command line arguments |
| Services (all) | Name, display name, status (running/stopped), startup type, executable path |
| Startup Applications | Name, command, location (registry key or startup folder), publisher |
| Scheduled Tasks | Name, status, next run time, last run result, action (executable + args), trigger type |
| Active Network Connections | Local/remote address:port, protocol (TCP/UDP), state, owning process name + PID |
| Network Adapters | Name, speed, status, link speed vs max speed, IP configuration, DNS servers |
| Installed Software | Name, version, publisher, install date, install location |
| System Overview | OS version, uptime, CPU model, RAM total/available, disk usage |

**Additional Detail Drill-Down (not stored in scan file):**
- Per-process: open handles, loaded DLLs, digital signature / publisher info
- Per-service: dependencies, recovery actions, associated registry entries
- Per-startup item: file properties (signed?, when modified?, file size)
- Per-network connection: DNS reverse lookup of remote IPs, geolocation hints
- Windows Registry queries for known autorun locations

**System Monitoring:**
- Network adapter speed monitoring (detect when adapter negotiates lower speed than expected)
- CPU usage anomaly summary
- Disk I/O summary

**UI Concept:**
- Tabbed or accordion sections for each category (Processes, Services, Startup, Tasks, Network, etc.)
- Summary bar showing counts and key stats
- Diff indicators: green for new entries, red/strikethrough for removed entries since last scan
- Search/filter within each section
- Click on an item to see additional details (fetched on demand, not stored)

**Technical Notes:**
- Register for `*.sys.json` file pattern in EditorRegistry
- Data collection runs in main process (spawn PowerShell with appropriate commands)
- IPC channel for renderer to request scans and receive results
- Consider scan progress indicator since full system scan may take several seconds
- Store scan timestamp and machine identifier in the JSON file

**Complexity:** High

---

### Certificate Viewer

**Goal:** Open `.pem`, `.crt`, `.cer` files and display parsed certificate details (issuer, subject, expiry, chain).

DevOps and backend developers deal with certificates frequently and usually resort to `openssl` CLI commands. A visual viewer would be more convenient.

**Complexity:** Low-Medium | **Priority:** Very Low

---

### Font Preview

**Goal:** Open `.ttf`, `.woff`, `.woff2` font files and preview glyphs at different sizes with customizable sample text.

Frontend developers occasionally need to inspect fonts. Could show glyph table, character set coverage, and font metadata.

**Complexity:** Low-Medium | **Priority:** Low

---

### Custom Editor Plugins (Single-File HTML)

**Goal:** Allow loading external React (or any web) applications as custom editors inside persephone, enabling a plugin-like extensibility model without a full plugin framework.

**Concept:**
- Any React application bundled into a single `.html` file (via `vite-plugin-singlefile` or similar) can be loaded as a custom editor
- The editor host loads the HTML file in an Electron `<webview>` tag
- A preload script injects a `window.jsNotepad` API into the guest page, giving it access to page content, settings, and editor lifecycle

**Architecture:**
```
persephone
  └─ CustomEditorHost (registered as a page-editor)
       └─ <webview src="file:///path/to/editor.html" preload="custom-editor-api.js">
            └─ Custom React/HTML App
                 └─ uses window.jsNotepad API
```

**API Surface (injected via preload):**
- `jsNotepad.getContent()` / `jsNotepad.setContent(value)` — read/write page content
- `jsNotepad.getLanguage()` — current language mode
- `jsNotepad.onContentChanged(callback)` — subscribe to external content changes
- `jsNotepad.getTheme()` — current theme info for visual consistency
- `jsNotepad.showMessage(text)` / `jsNotepad.showConfirm(text)` — basic UI dialogs

**Key Decisions:**
- **`<webview>` vs `<iframe>`**: `<webview>` preferred — native preload support, better isolation, proper IPC bridge
- **Single-file bundling**: Eliminates asset management; one `.html` file = one editor plugin
- **Registration**: Could register by file extension pattern (e.g., `*.xyz` → custom editor) or via a manifest file

**Use Cases:**
- Domain-specific editors (diagram editors, form builders, visual config editors)
- Third-party integrations without modifying persephone core
- User-created tools that need richer UI than the scripting system provides

**Tasks:**
- [ ] Design the `jsNotepad` API contract (TypeScript interface)
- [ ] Create preload script that bridges webview ↔ persephone stores
- [ ] Create `CustomEditorHost` component with `<webview>` management
- [ ] Register custom editors in EditorRegistry (manifest or settings-based)
- [ ] Build a sample custom editor as a proof of concept
- [ ] Document how to create and register custom editor plugins
- [ ] Handle theme synchronization between host and guest

**Complexity:** High

---

### Other Feature Ideas

| Idea | Description | Complexity |
|------|-------------|------------|
| Settings UI | Visual settings editor | Medium |

---

## Developer Experience

| Idea | Description | Complexity |
|------|-------------|------------|
| Testing Infrastructure | Vitest setup with component tests. Postponed until core features stabilize to avoid test rewrites during refactoring. | Medium |
| Storybook | Component development environment | Medium |
| CI/CD Pipeline | Automated builds and releases | Medium |
| Performance Monitoring | Track bundle size, startup time | Low |

---

## User Experience

### Graph detail panel collapses on selection change and never restores

Found 2026-09-01 while verifying US-1267 (EPIC-082), and **confirmed pre-existing** — reproduced on
the pre-US-1267 file before the change, so it is not refactoring fallout.

With the graph detail panel expanded, selecting a different node collapses it, and re-selecting the
original node does not restore it; the user must click the header again every time. The mechanism:
`GraphDetailModel.wasExpanded` is initialised `true`, but the **initial no-selection prop pump** takes
the `hasSelection === false` branch and overwrites it with `false`. That branch fires on the first
pump in both the old and new code, because `depsChanged(undefined, next)` returns `true`
(`core/state/model.ts:10-16`) so the original `DepsGate` also reported a change on its first
evaluation. The `wasExpanded = true` initialiser is therefore dead in both versions, and the
"restore the panel on first selection" path can only ever restore `false`.

Deliberately **not** fixed in US-1267: that task's contract was to be behaviour-preserving, and
changing this would have made the diff no longer reviewable as a pure de-effecting. Whoever picks it
up should decide what the intended behaviour is first — the code reads as though the panel was meant
to remember its expanded state across selections.


| Idea | Description | Complexity |
|------|-------------|------------|
| Markdown Diagram Viewer | Zoom/pan for Mermaid diagrams in Markdown preview; option to open diagram in separate Mermaid editor page | Medium |
| Middle-click Tab Close | Close tab with middle mouse button (standard behavior) | Low |
| Sidebar Toggle Shortcut | Add `Ctrl+B` to show/hide sidebar | Low |
| Keyboard Shortcuts Panel | View/customize shortcuts | Medium |
| Themes | Multiple color themes | Medium |
| Welcome Page | Onboarding for new users | Low |
| Command Palette | VS Code-like Ctrl+Shift+P | Medium |

---

## Documentation

| Idea | Description | Complexity |
|------|-------------|------------|
| Video Tutorials | Screen recordings of features | Medium |
| API Reference | Script API documentation | Low |

### Guide routing for models that skip guides

QA against Haiku found a failure mode prose cannot fix: on **imperative** requests about the app
("change the language of this tab", "highlight this link", "open this in the built-in PDF
editor") the agent reads no guide at all, then improvises against live state — one run spent 42
tool calls rediscovering a fact `list_pages` answers in one, another closed the user's tab while
guessing. Strengthening the server `instructions` was tried and verified live; it changed
nothing on two of the three, because the instructions are part of what gets skipped. The same
test passes first try on Sonnet, which reads the guide before doing anything.

One of the three was fixed by prose after all: naming the thing precisely ("the Monaco
syntax-highlighting mode" instead of "the language") took that case from 42 tool calls and no
guide read to 15 calls opening the guide first. Worth trying **before** reaching for structure —
ambiguity, not indifference, is what sends a weak model exploring. What remains below is for the
cases where the request is already unambiguous and the guide is still skipped.

The remaining lever is **structural rather than textual** — put the correction where an agent
cannot route around it:

- Editor-related tool errors (`create_page` with an unknown editor id, `set_page_content` on a
  page with no language) name the guide *and* the fact, e.g. "there is no `pdf-view` editor; PDF
  is a board — `read_guide(\"ui-editors\")`".
- Tool descriptions for `create_page` / `list_pages` state that `language` is the Monaco
  syntax-highlighting mode and that non-text editors have none.

Worth doing only if agent-facing quality on weak models matters; on capable models the guides
already work.

### `app.editors.resolveId()` ignores board-provided editors

`app.editors.resolveId("x.pdf")` returns `"monaco"` on a machine where the **PDF Viewer board is
installed and does open `.pdf`** — so the script API contradicts what `app.pages.openFile()`
actually does. Found during QA, when a test agent used it as a sanity check and was misled.
Either resolve through the same board-aware path, or document the limitation on the method.

---

## Browser Automation

### US-370: Data protection hooks (PHI sanitization layer)

**Goal:** Add hooks to the browser automation layer that sanitize sensitive data (PHI, PII) before it is returned by `browser_snapshot` or passed to AI agents.

**Background:** EPIC-021 deferred this task. The automation layer is now stable and this would be a clean insertion point. See [EPIC-021.md](../epics/EPIC-021.md) section US-370 for the original design notes.

**Complexity:** Medium-High

---

## Technical Debt

### Two residuals from closed De-React entries *(2026-08-28)*

Both are what survived re-measuring [US-1091 and US-1132](../active-work.md) after the De-React
programme closed. Neither is a defect; both are questions or cosmetics, which is why they are here
rather than on the dashboard.

- [ ] **Rename `data-part="react-slot"`.** The name is now a lie: `DialogView.ts:73` and
  `TagView.ts:124` stamp it on a permanently native host, and nothing in the app renders React
  outside `editors/draw/`. Three stylesheets select on it — `uikit/ListBox/ListItem.css:111,113`,
  `uikit/Panel/Panel.css:68`, `uikit/Tree/TreeItem.css:133` — so it is a coordinated rename, not a
  one-line change. `children-slot` or `slot` would say what it is. Purely a readability fix; the
  De-React root-counting instrument it used to mislead is retired, and `data-react-root` (written
  only by `editors/draw/react-island.ts:22`) is the marker that means anything.
- [ ] **Decide whether `ListBoxView`'s `rowViews` retention on eviction is correct.** It looks
  deliberate: `releaseCell` (`:405-414`) removes a view on a *kind change* and its comment says
  "never on eviction", because a recycled wrapper keeps its view (`:383`), and re-adding listeners
  on recycle "would stack an unbounded set on every pooled cell". So a view outlives an eviction on
  purpose. The open question is whether a wrapper that leaves the pool entirely — rather than being
  recycled — takes its view out of `rowViews` with it, or whether the set grows with scroll distance
  until teardown disposes it at `:104`/`:246`. Answer it by scrolling a long list and reading
  `rowViews.size`; if it tracks the pool it is fine as written and deserves a comment saying so.

### Panel roots with caller-overridden `data-type`

- [ ] **Restore a stable Panel inspection contract.** Eight existing `<Panel>` call sites pass a
  custom `data-type` through residual props, so their roots are not addressable as
  `[data-type="panel"]`; six also omit `name`. They are preserved for compatibility by US-1003's
  private `panel-root` stylesheet class, but a follow-up should give these app-specific roots a
  stable `data-type`/`data-name` contract without changing their visual behavior. Audit
  `browser_snapshot`, `app.ui.highlightElement`, and any DOM selectors before choosing whether to
  add a separate component marker or repair the callers.

| Issue | Description | Complexity |
|-------|-------------|------------|
| US-195: Simplify `addEditorPage` + content | `addEditorPage` now accepts optional `content` param (added in PagesLifecycleModel). ~6 callsites still use `isTextFileModel(page)` + `page.changeContent()` pattern instead: mcp-handler `set_page_content`/`ui_push`, ScriptContext log pages, Grid/Markdown/Mermaid/Text `openInEditor()`. Migrate them to use the new parameter. | Low |
| TypeScript Strict Mode | Enable stricter type checking | Medium |
| Reduce Bundle Size | Analyze and optimize bundle | Medium |
| Accessibility Audit | Keyboard nav, screen readers | Medium |
| Memory Leak Audit | Check for subscription leaks | Low |
| Orphaned duplicate webview repro hunt | Observed once during US-806: two live guest webContents for one browser tab (stale element stayed mounted after an abandoned view tree; pins a whole guest renderer process). Trigger unknown. A detector in `BrowserView.tsx` logs `[browser] duplicate webview mount…` when it recurs — investigate on first sighting. Evidence summary in the US-806 entry of `completed.md`. | Medium |
| Browser editor selector split | `BrowserEditorView` subscribes to a ~28-key selector; every browser state update re-renders the toolbar/URL-bar subtree (~110 components). Webview subtree is already memoized (US-806); splitting the selector / extracting memoized toolbar components would cut the remaining per-event render cost. | Medium |
| Explorer tree keyboard actions (remainder) | Selection/focus visuals and Ctrl+C/X/V, Delete, F2 keys are covered by US-808. Remaining: multi-select, dimming cut items. | Medium |
| `moveItemsInto` skips the refresh after a directory-only category move | In `tree-drop-actions.ts`, when a provider has `renameCategoryPath` and the dragged set is **all** directories, the sub-trees move but `remaining` is empty, so every following branch fails and the function returns `false` — the caller never re-lists. Affects link-collection trees only (the file provider has no `renameCategoryPath`); the move itself succeeds, the tree just shows stale rows until the next refresh. Pre-existing; preserved verbatim by the US-941 refactor rather than fixed inside it. | Low |

---

## Moving to Active

When ready to work on a backlog item:

1. Create task folder: `doc/tasks/US-XXX-name/`
2. Write detailed README.md
3. Add to [`active-work.md`](../active-work.md) in the Planned section
4. Remove from this file

## Adding Ideas

Feel free to add ideas here with:
- Brief description
- Rough complexity estimate
- Any initial thoughts on approach
