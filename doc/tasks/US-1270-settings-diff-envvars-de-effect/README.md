# US-1270: De-effect settings, file-diff, and env-vars call sites

Epic: [EPIC-082 — React architecture removal at the call sites](../../epics/EPIC-082.md)

Status: Planned

## Goal

Classify the ten `DepsGate` instances across the five measured files and retain every one whose
consequence is legitimate prop-pump, async lifecycle, or DOM/editor-host change detection. Retain
and document the env-vars grid's deliberate per-turn coalescer; this task makes zero behavioral
conversions and changes only that source comment.

## Background

This is the settings + diff + env-vars slice folded into EPIC-082 by its correction 5. The baseline
was measured at commit `caacc80a` and was rechecked against the current source:

| File | `createDepsGate()` instances | Deferred bodies | `this.live` | `isLive` |
|---|---:|---:|---:|---:|
| `src/renderer/editors/settings/sections/McpSectionModel.ts` | 4 | 0 | 0 | 7 |
| `src/renderer/editors/settings/sections/SettingsSections.ts` | 2 | 0 | 0 | 0 |
| `src/renderer/editors/settings/sections/BrowserProfilesSectionModel.ts` | 1 | 0 | 0 | 2 |
| `src/renderer/editors/file-diff/FileDiffBodyView.ts` | 2 | 0 | 0 | 0 |
| `src/renderer/editors/env-vars/EnvVarsBodyView.ts` | 1 | 1 | 4 | 0 |

The expected result is zero behavioral conversions. All ten gates remain: nine in the four
gate-only files and the env-vars gate that protects grid seeding. A gate by itself is not a React
defect; this follows US-1269's reviewed precedent and EPIC-056's deliberate retention of
`DepsGate` for prop-derived change detection. The only source diff is a comment beside the
env-vars coalescer, making its batching boundary explicit.

### Verified gate decisions

| File and site | Consequence | Decision and reason |
|---|---|---|
| `src/renderer/editors/settings/sections/McpSectionModel.ts:29-32`, consumed at `:57-68` | `mcpPortGate` and `mnemePortGate` update the model's editable port strings when the settings-backed props change. `mcpEnabledGate` and `mnemeEnabledGate` stop and recreate the corresponding status subscriptions when enablement props change. | **Leave all four.** These are synchronous prop-pump change detectors owned by the model. Port fields are local edit buffers, and enablement changes control subscription setup; neither is a deferred effect body or clearer as a selector binding. |
| `src/renderer/editors/settings/sections/SettingsSections.ts:125-138` | `gitEnabledGate` scopes `GitIntegrationModel.updateProbe()`, which cancels a prior asynchronous dynamic-import/Git probe and starts a new one only when `git.enabled` changes. | **Leave it.** The gate prevents repeated cancellation/restart during the section's synchronous prop pump. The asynchronous probe's local `alive` cancellation remains unrelated to the gate and must not be changed. |
| `src/renderer/editors/settings/sections/SettingsSections.ts:370-384` | `videoPortGate` scopes `VideoPlayerModel.setPortValue(String(props.videoStreamPort))`, which refreshes the local stream-port input when the setting changes externally. | **Leave it.** This is ordinary prop-derived local-input synchronization. `VideoPlayerSectionView` already binds `state.portValue` to the input at `:422`; replacing the model gate with another trigger adds no clarity. |
| `src/renderer/editors/settings/sections/BrowserProfilesSectionModel.ts:33-45` | `torSocksPortGate` refreshes the local Tor port text after an external `tor.socks-port` change. | **Leave it.** It is the same legitimate prop-pump/edit-buffer pattern as the settings port fields. The model also has independent async confirmation/IPC and timer work; the gate does not guard those continuations. |
| `src/renderer/editors/file-diff/FileDiffBodyView.ts:142-143`, consumed at `:213-225` | `diffValuesGate` scopes `MonacoDiffEditorHostView.setDiffValues(fromText, toText)` and `languageGate` scopes `setLanguage(language)` after host/branch synchronization. | **Leave both.** These are synchronous writes to a mounted Monaco diff host, and the dependency lists deliberately include host identity inputs (`filePath`, `gitRepo`) so a branch swap can be primed at `:227-230`. Neither gate has a deferred body. |
| `src/renderer/editors/env-vars/EnvVarsBodyView.ts:313`, consumed at `:387-399` | The `VariablesGridView` gate scopes rebuilding `seedRows` from a changed namespace/profile/data prop set before updating the mounted `DataGridView`. | **Leave it.** The grid owns a mutable row buffer after mount; reseeding it on every parent state notification would overwrite in-progress edits. `appliedData` is a second, explicit identity check for the model's own synchronous write-back. A selector binding would not replace this prop-pump/grid ownership boundary. |

### MCP liveness audit — all seven remain

`src/renderer/editors/settings/sections/McpSectionModel.ts` extends `TComponentModel`; its `isLive` is the inherited lifecycle flag, not a
microtask flag introduced by any gate. The seven references are:

1. `src/renderer/editors/settings/sections/McpSectionModel.ts:74`: continuation of `api.getMcpStatus().then(...)` before `state.status` is written.
2. `src/renderer/editors/settings/sections/McpSectionModel.ts:76`: rejection continuation of the same MCP status request before clearing `state.status`.
3. `src/renderer/editors/settings/sections/McpSectionModel.ts:79`: `rendererEvents.eMcpStatusChanged` subscription callback before publishing a status event.
4. `src/renderer/editors/settings/sections/McpSectionModel.ts:86`: continuation of `api.getMnemeStatus().then(...)` before `state.mnemeStatus` is written.
5. `src/renderer/editors/settings/sections/McpSectionModel.ts:88`: rejection continuation of the Mneme status request before clearing `state.mnemeStatus`.
6. `src/renderer/editors/settings/sections/McpSectionModel.ts:91`: `rendererEvents.eMnemeStatusChanged` subscription callback before publishing a status event.
7. `src/renderer/editors/settings/sections/McpSectionModel.ts:137`: the 2-second `setTimeout` callback that clears the copied label.

Guards protecting an awaited call, timer, or third-party/event callback stay. The status disposers
at `:96-105` unsubscribe the event callbacks, and `dispose():143-147` clears the timer, but the
already-created Promise continuations still need the `isLive` checks. EPIC-080's US-1264 finding
(only 45 of roughly 215 liveness references provably removable) applies directly here: none of
these seven is a cleanup target.

### Env-vars coalescer and event ordering

`src/renderer/editors/env-vars/EnvVarsBodyView.ts:440-454` deliberately coalesces `onEdit`,
`onAddRows`, and `onDeleteRows` notifications into one `queueMicrotask`. The explicit
`applyQueued` flag means N grid events in one turn produce exactly one `validateRows` →
`rowsToRecord` → `EnvVarsEditor.setProfileData()` sequence. This is a batching boundary, not a
`DepsGate` plus re-validated dependency array and not a React-shaped effect. The roadmap records
the identical documented per-cell grid coalescing at `GridEditor.ts:850` as a well-reasoned,
non-finding under §2.2.

The installed `av-grid` contract was checked in `node_modules/av-grid/dist/options.d.ts` and its
source map: `onEdit` (`:105-110` in the declaration) fires before the grid writes the edited cell,
`onAddRows` (`:175-180`) fires before insertion, and `onDeleteRows` (`:181-182`) fires before
deletion. `EditingModel.editCellAt` confirms the callback precedes `(row as any)[column.key] =
value`. The microtask is therefore also the safe point at which the grid's mutable row buffer has
finished the operation. Making the write synchronous would regress multi-cell paste and multi-row
delete batching and could dispatch back through `EnvVarsBodyView` while av-grid is mid-mutation.

`afterDispatch` is not a substitute: `src/renderer/core/state/dispatch.ts:37-43` runs it inline
when no state dispatch is in flight, and a grid DOM event is outside a dispatch. Keep
`applyQueued`, the microtask, and all four `live` references. The `live` checks guard this
genuinely deferred callback; they are not removable effect-lifetime residue. The existing
`this.appliedData = record` assignment must remain before `setProfileData()` so the eventual
state-driven update does not reseed the grid with the same record.

### Other lifecycle boundaries

`BrowserProfilesSectionModel` has two `isLive` references that remain load-bearing:
`src/renderer/editors/settings/sections/BrowserProfilesSectionModel.ts:85` follows awaited `ipcRenderer.invoke(...)` in
`handleClearData`, and `:90` protects its 2-second clear-label timer. Its other async operations
(`handleRemoveProfile`, bookmark dialogs, and Tor file selection) are outside the `isLive` count
and are not changed.

`FileDiffBodyView` has no liveness flag. The awaited Git/content resolution and its
`isLive` guard are in the different `FileDiffBodyModel` class (`src/renderer/editors/file-diff/FileDiffBodyModel.ts:38-47`), so
they remain untouched. `SettingsSections.ts` contains unrelated awaited file/dialog handlers and
the Git probe's local `alive` cancellation; no guard is removed from those paths.

## Implementation Plan

- [ ] Add a short Persephone-native comment beside
  `src/renderer/editors/env-vars/EnvVarsBodyView.ts:440-454` explaining that multiple grid events
  in one turn collapse into one validate-and-write operation, that `applyQueued` is the batching
  boundary, and that `afterDispatch` is not a substitute because it runs inline outside a state
  dispatch. Do not change `scheduleApply()`, `handleEdit`, `handleAddRows`, `handleDeleteRows`,
  `applyQueued`, the microtask, or any of the four `live` references.

  - Keep `syncSeed`, its fixed `[namespace, profile, data]` dependency signature, its mount-time
    `prime()` at `:360`, the grid callback wiring, and the existing row-key/validation behavior.
  - Keep `this.appliedData = record` before `setProfileData(...)` and preserve the existing
    `grid.isDestroyed()` and lifecycle checks.

- [ ] Leave the four gates in
  `src/renderer/editors/settings/sections/McpSectionModel.ts:29-68`,
  `src/renderer/editors/settings/sections/SettingsSections.ts:123-154,368-385`,
  `src/renderer/editors/settings/sections/BrowserProfilesSectionModel.ts:31-46`, and
  `src/renderer/editors/file-diff/FileDiffBodyView.ts:140-230` unchanged in purpose and source
  behavior. Do not convert them to `bind()` or `afterDispatch`.

- [ ] Preserve every liveness guard protecting an await, timer, or event callback:
  all seven `McpSectionModel.isLive` references and both
  `BrowserProfilesSectionModel.isLive` references. Do not alter the unrelated async model/view
  paths named above.

- [ ] Do not touch `src/renderer/uikit/`, the graph files, `src/renderer/components/tree-provider/`,
  or the EPIC-081 `RestClientShared.ts` surface. This task has no changes in those areas.

- [ ] Verify the comment-only source diff and the four running-app surfaces before considering the
  task implemented. A green build is supplementary evidence only; it cannot prove a no-behavior
  contract by itself.

### Before → after snippets

Current coalescer at `src/renderer/editors/env-vars/EnvVarsBodyView.ts:440-454`:

```ts
private scheduleApply(): void {
    if (this.applyQueued) return;
    this.applyQueued = true;
    queueMicrotask(() => {
        this.applyQueued = false;
        if (!this.live || !this.grid || this.grid.isDestroyed()) return;
        // existing validate-and-write body
    });
}
```

Target comment-only change:

```ts
// Grid events can arrive several times in one turn; applyQueued is the batching boundary that
// collapses them into one validate-and-write. afterDispatch would run inline outside a dispatch,
// so it is not a substitute for this coalescer.
private scheduleApply(): void {
    if (this.applyQueued) return;
    this.applyQueued = true;
    queueMicrotask(() => {
        this.applyQueued = false;
        if (!this.live || !this.grid || this.grid.isDestroyed()) return;
        // existing validate-and-write body
    });
}
```

`handleEdit`, `handleAddRows`, `handleDeleteRows`, `applyQueued`, the microtask, and all four
`live` references remain behaviorally unchanged.

## Concerns

- **Re-entrancy:** `TOneState.update()` notifies synchronously. Stamp `appliedData` before
  `setProfileData()` so the nested body update does not reseed the grid. The grid's own mutation
  remains after the callback, which is the required ordering for av-grid's before-write callbacks.
  The recursion bound is the stamped record identity plus `syncSeed`'s `props.data ===
  appliedData` check; a nested pass cannot request the same seed again.
- **Batching boundary:** `scheduleApply()` deliberately coalesces several grid callbacks in one
  turn. Keep the microtask and `applyQueued` flag unchanged: they ensure one validation and write
  after the grid's mutable row buffer has finished its turn. Runtime verification confirms that
  the existing env-vars editor behavior still works; it must not prescribe a per-event write.
- **First-pump behavior:** `depsChanged(undefined, next)` is true
  (`src/renderer/core/state/model.ts:10-16`), but `VariablesGridView.onMount()` intentionally
  performs the initial seed and then primes at `:360`. Keep that prime and do not replace the gate
  with a real-value sentinel.
- **Selector comparison:** no selector replacement is planned. If a future binding is considered,
  its trigger must remain value-comparable under `compareSelection`
  (`src/renderer/core/state/state.ts:30-42`); a fresh array would fire on every dispatch.
- **Liveness:** all four `VariablesGridView.live` references remain because they guard the
  genuinely deferred coalescer callback. Keep `McpSectionModel.isLive` and
  `BrowserProfilesSectionModel.isLive` because their guards protect awaited calls, event callbacks,
  and timers. Do not infer removability from the count alone.
- **Browser profile rename verification:** source inspection found add and remove controls but no
  dedicated rename control in `src/renderer/editors/settings/sections/BrowserProfilesSection.ts:119-165` or `:434-451`. Runtime checking
  must still exercise a profile re-key/rename through the app's settings-backed path available in
  the running build, then remove the disposable profile; it must record that the Settings UI does
  not expose a standalone rename action rather than inventing one in this task.
- **Fixture safety:** no checked-in source or documentation fixture is required. Runtime env-vars and
  diff checks must create throwaway files/fixtures outside `docs/`; never modify anything under
  `docs/`.
- **Scope:** do not alter any file under `src/renderer/uikit/`, even though the target views import
  UIKit primitives. Do not alter graph, tree-provider, or EPIC-081-owned files.

No implementation questions remain. The planned result is zero behavioral conversions, one
comment-only source change documenting the env-vars coalescer, ten retained gates, all nine
liveness guards retained, and no `afterDispatch` call.

## Acceptance Criteria

- [ ] `EnvVarsBodyView.ts` keeps `scheduleApply()`, `applyQueued`, its microtask, all three grid
  handler call sites, and all four `live` references behaviorally unchanged. Add only a short
  comment explaining that multiple grid events per turn collapse into one validate-and-write, that
  `applyQueued` is the batching boundary, and that `afterDispatch` runs inline outside a dispatch.
- [ ] The env-vars coalescer still validates the final mutable row buffer, preserves empty/duplicate
  validation and warning behavior, stamps `appliedData` before `setProfileData()`, and does not
  cause a nested grid reseed or stale final row snapshot.
- [ ] `VariablesGridView.depsGate` remains unchanged in purpose, its dependency signature stays
  fixed, and its mount-time prime remains. All four `McpSectionModel` gates, both
  `SettingsSections` gates, the Browser Profiles gate, and both File Diff gates remain.
- [ ] All seven `McpSectionModel.isLive` checks remain, with their await/event/timer protections
   intact. Both Browser Profiles `isLive` checks remain. No liveness guard protecting an async or
   callback continuation is removed elsewhere.
- [ ] The source `git diff` for this task contains no behavioral change: the only source change is
  the explanatory `scheduleApply()` comment. The ten gates and all nine `isLive` guards remain with
  their documented reasons, and all four env-vars `live` references remain.
- [ ] No `afterDispatch` conversion is introduced. No file under `src/renderer/uikit/`, graph,
   tree-provider, or EPIC-081-owned source is changed. No unit tests or test harnesses are added.
- [ ] Static lint, typecheck, and production-build checks pass as supplementary evidence.
- [ ] Running-app verification smoke-checks the Settings editor's MCP section: enable and disable
  MCP and Mneme, observe server status/list transitions, change ports, and copy the generated client
  configuration; disposal during status changes produces no stale update or unhandled rejection.
- [ ] Running-app verification smoke-checks Browser Profiles: add a disposable profile, re-key/rename
  it through the available settings-backed path while recording that no dedicated rename control
  exists, remove it, and verify default/profile list updates and no post-disposal clear/timer work.
- [ ] Running-app verification smoke-checks the File Diff editor body with an outside-`docs/` throwaway
  git fixture: empty/non-repository branch, repository diff branch, revision changes, language
  changes, editable unstaged side, and switching away while host/revision updates are active.
- [ ] Running-app verification smoke-checks the env-vars editor with an outside-`docs/` throwaway
  `.env.json`/JSON fixture: namespace/profile selection, variable edit, add, delete, paste/range
  edit, invalid empty/duplicate names, valid persistence, locked/error/empty branches where
  available, rapid edits, and switching/disposal without stale grid writes or unhandled errors.
- [ ] The verification record explicitly states that no file under `docs/` was modified and that
  any throwaway fixture was created outside `docs/`.
- [ ] `doc/active-work.md` links its existing US-1270 dashboard row to this document, and the
  EPIC-082 task table links the US-1270 row to this document while retaining Planned/[ ] status.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/editors/env-vars/EnvVarsBodyView.ts` | Add a comment documenting the deliberate per-turn grid coalescer; make no behavioral change and retain the grid-seeding gate plus all four `live` references. |
| `src/renderer/editors/settings/sections/McpSectionModel.ts` | No source change; retain four legitimate prop-pump gates and all seven async/event/timer liveness guards. |
| `src/renderer/editors/settings/sections/SettingsSections.ts` | No source change; retain Git probe and video-port prop-pump gates. |
| `src/renderer/editors/settings/sections/BrowserProfilesSectionModel.ts` | No source change; retain the Tor port gate and both async/timer liveness guards. |
| `src/renderer/editors/file-diff/FileDiffBodyView.ts` | No source change; retain both synchronous Monaco host-update gates. |
| `doc/active-work.md` | Link the existing US-1270 dashboard row to this document. |
| `doc/epics/EPIC-082.md` | Link the US-1270 row in the epic task table to this document. |
| `doc/tasks/US-1270-settings-diff-envvars-de-effect/README.md` | Record verified scope, gate/liveness decisions, implementation plan, event-ordering constraint, runtime verification, and acceptance criteria. |

Files explicitly needing no changes: every file under `src/renderer/uikit/`; `src/renderer/core/state/dispatch.ts`;
`src/renderer/core/state/state.ts`; `src/renderer/core/state/model.ts`;
`src/renderer/core/utils/scheduling.ts`; `src/renderer/editors/env-vars/EnvVarsEditor.ts`;
`src/renderer/editors/settings/sections/McpSection.ts`;
`src/renderer/editors/settings/sections/BrowserProfilesSection.ts`;
`src/renderer/editors/file-diff/FileDiffBodyModel.ts`; `src/renderer/editors/file-diff/FileDiffEditor.ts`;
all graph files; all files under `src/renderer/components/tree-provider/`; `docs/` and its contents;
and all EPIC-081-owned files.
