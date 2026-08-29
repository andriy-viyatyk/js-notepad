# US-1192 — Detox the settings sections

## Goal

Remove the settings section call sites' dependence on TComponentModel's React-shaped hooks surface. The five affected views will own their models through createComponentModelDriver, while the existing settings, status, port-editing, async-probe, and disposal behaviour remains unchanged.

This document is planning-only. No implementation, tests, test harnesses, or dashboard changes are part of US-1192.

## Background

### Verified scope and baseline

The settings editor is assembled by src/renderer/editors/settings/SettingsView.ts:63-94; it constructs the affected sections with empty props and mounts each section once. The current section views therefore receive their live configuration from settings.onChanged, rather than from a parent prop update.

The current tree has exactly eight this.effect( registrations in five files:

| Effect | Current code and dependency | Behaviour to preserve |
|---|---|---|
| Browser Profiles | BrowserProfilesSectionModel.init() at src/renderer/editors/settings/sections/BrowserProfilesSectionModel.ts:31-38; [this.props.torSocksPort] | Keep the editable Tor port field in sync only when the configured Tor port changes. |
| Default Browser | DefaultBrowserSectionModel.init() at src/renderer/editors/settings/sections/DefaultBrowserSectionModel.ts:13-15; no deps | Check Windows default-browser registration once when the section opens. |
| MCP port | McpSectionModel.init() at src/renderer/editors/settings/sections/McpSectionModel.ts:27-31; [this.props.mcpPort] | Seed/update state.portValue from the configured MCP port. |
| Mneme port | McpSectionModel.init() at src/renderer/editors/settings/sections/McpSectionModel.ts:32-35; [this.props.mnemePort] | Seed/update state.mnemePortValue from the configured Mneme port. |
| MCP status | McpSectionModel.init() at :36; [this.props.mcpEnabled] | Preserve the status fetch and rendererEvents.eMcpStatusChanged listener lifecycle. |
| Mneme status | McpSectionModel.init() at :37; [this.props.mnemeEnabled] | Preserve the status fetch and rendererEvents.eMnemeStatusChanged listener lifecycle. |
| Git integration | GitIntegrationModel.init() at src/renderer/editors/settings/sections/SettingsSections.ts:126-139; [this.props.gitEnabled] | Probe Git only while enabled; clear the probe when disabled; invalidate an old async probe on a toggle. |
| Video Player | VideoPlayerModel.init() at src/renderer/editors/settings/sections/SettingsSections.ts:340-345; [this.props.videoStreamPort] | Mirror the configured port into the editable input without deferring it. |

The verified replacement matrix is:

| Existing dependency | Existing settings event path | Gate in model setProps(props) | Direct consequence after driver.update() |
|---|---|---|---|
| BrowserProfilesModel.torSocksPort | BrowserProfilesSectionView already listens to tor.socks-port as part of its seven-key filter | [props.torSocksPort] | setTorPortValue(String(props.torSocksPort)) only when that slot changes. |
| McpSectionModel.mcpPort | McpSectionView already listens to mcp.port as part of its five-key filter | [props.mcpPort] | setPortValue(String(props.mcpPort)) only for the MCP field. |
| McpSectionModel.mnemePort | McpSectionView already listens to mneme.port as part of its five-key filter | [props.mnemePort] | setMnemePortValue(String(props.mnemePort)) only for the Mneme field. |
| McpSectionModel.mcpEnabled | McpSectionView already listens to mcp.enabled | [props.mcpEnabled] | stop the current MCP status listener, then start one replacement. |
| McpSectionModel.mnemeEnabled | McpSectionView already listens to mneme.enabled | [props.mnemeEnabled] | stop the current Mneme status listener, then start one replacement. |
| GitIntegrationModel.gitEnabled | GitIntegrationSectionView already listens only to git.enabled | [props.gitEnabled] | clear the probe synchronously when false; start the guarded async probe when true. |
| VideoPlayerModel.videoStreamPort | VideoPlayerSectionView already listens to video-stream.port as part of its two-key filter | [props.videoStreamPort] | setPortValue(String(props.videoStreamPort)) synchronously. |

All seven gates are intentional and model-owned. The settings implementation emits its event even
when a caller sets the same value, while the old effect uses depsChanged/Object.is and therefore
does not rerun in that case. The Browser Profiles, MCP, and Video listeners also receive unrelated
keys; a model's gate preserves the old effect's narrower dependency list instead of treating every
section refresh as a prop change. setProps(props) runs after TComponentModel has assigned
this.props, which is the same dependency-comparison moment the old effect received. The existing
settings subscriptions remain the explicit update source; no second settings listener should be
added to a model or view.

The current views call model internals at these verified sites:

| View | Current internal calls |
|---|---|
| BrowserProfilesSectionView | src/renderer/editors/settings/sections/BrowserProfilesSection.ts:365-366, :451, :456 |
| DefaultBrowserSectionView | src/renderer/editors/settings/sections/DefaultBrowserSection.ts:71-73 |
| McpSectionView | src/renderer/editors/settings/sections/McpSection.ts:112-113, :191, :197 |
| GitIntegrationSectionView | src/renderer/editors/settings/sections/SettingsSections.ts:170-171, :183, :187 |
| VideoPlayerSectionView | src/renderer/editors/settings/sections/SettingsSections.ts:360-361, :375, :379 |

src/renderer/core/state/model.ts currently makes createComponentModelDriver call setPropsInternal() in its constructor, _initInternal() in mount(), and onUnmountInternal() in dispose(). US-1192 will use that existing public driver boundary; it will not edit model.ts or remove any TComponentModel member. US-1193 owns that later cleanup.

src/renderer/uikit/shared/deps-gate.ts compares fixed-length arrays with the same Object.is-per-slot depsChanged implementation used by the old effects. The converted models will call prime() from init() after their initial seed, before setting their initialisation guard; subsequent setProps(props) calls use changed(). The clean reference is src/renderer/uikit/ListBox/ListBoxView.ts:59-153 for driver ownership and update ordering, although its gate is view-owned because ListBox's signature is a rendering concern rather than a model prop-transition concern.

There is one required ordering guard for every converted dependency-based model. The driver invokes
setPropsInternal() in its constructor at src/renderer/core/state/model.ts:250-253, before it ever
invokes init() at :265-269. Each model therefore needs a private initialized flag that starts false;
setProps(props) returns immediately while it is false, init() performs the initial seed/subscription
work and primes every gate, and initialized becomes true only at the end of init(). Otherwise the
constructor pump would run each transition once, then init() would run it again; MCP would start,
stop, and restart both status listeners during construction.

### Important current behaviours

BrowserProfilesSectionView subscribes to seven setting keys at BrowserProfilesSection.ts:449-455, including bookmark-path keys that are not model props. The model effect watches only torSocksPort, so the conversion must not reset the Tor input on an unrelated profile/bookmark change. The existing sync() also updates the default and incognito bookmark rows, the keyed profile list, Tor row, name input, Add button, and colour dots at BrowserProfilesSection.ts:491-501.

McpSectionView subscribes to five keys at McpSection.ts:195-202. mcp.port and mneme.port must update only their corresponding state-backed input; mcp.browser-tools.enabled must not restart either status listener. McpSectionModel.subscribeMcpStatus() and subscribeMnemeStatus() each perform an immediate status fetch, attach one renderer-event listener, and return a cleanup that calls the renderer event subscription's unsubscribe() at McpSectionModel.ts:40-62. The current effect cleanup runs before the next effect callback, so each actual mcp.enabled or mneme.enabled dependency change has exactly one stop followed by one new start. The replacement will retain one stored disposer per status listener, make the restart explicit, ignore same-value setting notifications through the corresponding gate, and dispose both listeners from the model's normal driver-owned disposal path.

The current status effects do not conditionally skip subscription when the Boolean is false: both
status fetches and both renderer-event listeners are started by init() for the initial props, and a
real Boolean dependency change restarts the corresponding listener. The replacement must retain
that observable lifecycle while making the stop/start pair explicit; changing it to “subscribe only
while enabled” would be a behaviour change.

GitIntegrationModel dynamically imports ../../../api/git, calls git.probe(), and uses an alive closure to ignore results after the dependency cleanup at SettingsSections.ts:127-138. The disabled branch currently queues setProbe(null) only because the old effect ran during a React render phase. The vanilla update path can write that state synchronously.

VideoPlayerModel queues a state mirror at SettingsSections.ts:341-344 for the same obsolete render-phase reason. VideoPlayerSectionView already binds portValue to the InputView and updates the VLC path independently at SettingsSections.ts:374-408; the conversion must retain both paths.

The epic's dated queueMicrotask references have drifted: the current Git workaround is at
SettingsSections.ts:129 and the current Video workaround is at :343. The MCP lines at
McpSectionModel.ts:28 and :32 are synchronous port-mirror effects, not queueMicrotask calls.

DefaultBrowserSectionModel has no meaningful props and is only a 47-line holder for state, checkStatus(), the register/unregister handlers, and the one run-once effect. Per the epic, it will be collapsed into DefaultBrowserSectionView; the model file will be deleted rather than converted into a driver-backed model.

### Before → after shape

The current Browser Profiles and MCP view paths directly invoke the hooks-emulation lifecycle:

~~~ts
// Before — BrowserProfilesSection.ts:363-366, 449-456
const model = new BrowserProfilesSectionModel(new TComponentState(defaultBrowserProfilesSectionState));
this.model = model;
model.setPropsInternal(this.currentProps());
model._initInternal();
// ...
model.setPropsInternal(this.currentProps());
this.sync(model.state.get());
this.own(() => model.onUnmountInternal());
~~~

~~~ts
// After — the section still constructs its driver in onMount, while the model owns the gate
const initialProps = this.currentProps();
this.driver = createComponentModelDriver(
    initialProps,
    BrowserProfilesSectionModel,
    defaultBrowserProfilesSectionState,
);
this.own(() => this.driver.dispose());
// onMount: build children, this.driver.mount(), then sync(this.driver.model.state.get())
// on a relevant settings event: this.driver.update(this.currentProps());
// then sync(this.driver.model.state.get())
~~~

~~~ts
// Before — McpSectionModel.ts:28-37
this.effect(() => { this.state.update((state) => { state.portValue = String(this.props.mcpPort); }); },
    () => [this.props.mcpPort]);
this.effect(() => { this.state.update((state) => { state.mnemePortValue = String(this.props.mnemePort); }); },
    () => [this.props.mnemePort]);
this.effect(() => this.subscribeMcpStatus(), () => [this.props.mcpEnabled]);
this.effect(() => this.subscribeMnemeStatus(), () => [this.props.mnemeEnabled]);
~~~

~~~ts
// After — the model owns the gate and the complete prop-transition lifecycle
private initialized = false;
private readonly mcpPortGate = createDepsGate();

init(): void {
    this.setPortValue(String(this.props.mcpPort));
    this.setMnemePortValue(String(this.props.mnemePort));
    this.startMcpStatusSubscription();
    this.startMnemeStatusSubscription();
    this.mcpPortGate.prime([this.props.mcpPort]);
    // ...prime the other three model-owned gates...
    this.initialized = true;
}

setProps = (props: McpSectionProps): void => {
    if (!this.initialized) return;
    if (this.mcpPortGate.changed([props.mcpPort])) this.setPortValue(String(props.mcpPort));
    // ...check the other three model-owned gates...
};
~~~

~~~ts
// After — the view has only the two-line pump-and-sync update path
this.driver.update(this.currentProps());
this.syncState(this.driver.model.state.get());
~~~

~~~ts
// After — direct initialisation plus explicit, model-owned status cleanup
init(): void {
    // Initial seeds/subscriptions and gate prime happen here; initialized is set last.
}
dispose(): void {
    this.stopMcpStatusSubscription();
    this.stopMnemeStatusSubscription();
    // Clear copiedTimer as before.
}
~~~

The two render-phase workarounds become synchronous writes after the driver pump:

~~~ts
// Before — SettingsSections.ts:129 and :343
queueMicrotask(() => { if (this.isLive) this.setProbe(null); });
queueMicrotask(() => { if (this.isLive && this.state.get().portValue !== portValue) this.setPortValue(portValue); });
~~~

~~~ts
// After — the corresponding model setProps() path, after the constructor guard
if (!this.initialized) return;
if (this.gitEnabledGate.changed([props.gitEnabled]) && !props.gitEnabled) this.setProbe(null);
if (this.videoPortGate.changed([props.videoStreamPort])) {
    this.setPortValue(String(props.videoStreamPort));
}
~~~

The exact snippets above describe the intended lifecycle and comparison points; the implementation must use the repository's existing formatting and callback names at the cited methods.

## Implementation Plan

1. **Convert BrowserProfilesSectionModel and BrowserProfilesSectionView.**

   - In src/renderer/editors/settings/sections/BrowserProfilesSection.ts, import createComponentModelDriver/ComponentModelDriver and createDepsGate/DepsGate.
   - Construct the driver with currentProps(), BrowserProfilesSectionModel, and defaultBrowserProfilesSectionState in BrowserProfilesSectionView.onMount(), where the model is constructed today. Expose the driver model through the existing child-view model references or a getter; no child (ProfileHeaderView, ProfileRowView, TorProfileRowView) should receive a new model instance.
   - Register this.driver.dispose() with own(). Remove the three direct internal calls at the verified mount/settings/disposal sites. Keep the existing settings subscription and its seven key filter, but route its live props through the driver.
   - Move one DepsGate into BrowserProfilesSectionModel.ts for [props.torSocksPort]. Add private initialized = false; make setProps(props) return while it is false, otherwise mirror the port only when the gate reports a real dependency change; prime the gate and set initialized at the end of init() after the initial seed. This preserves a user's in-progress port text when another relevant setting changes and avoids the driver's constructor pump running the transition before init().
   - Remove the model effect registration, keep all profile, bookmark, Tor, timer, and dispose() methods unchanged, and replace the view's settings callback with the two-line driver.update(this.currentProps()) plus sync(this.driver.model.state.get()) path.

2. **Collapse Default Browser into DefaultBrowserSectionView.**

   - Delete src/renderer/editors/settings/sections/DefaultBrowserSectionModel.ts.
   - In DefaultBrowserSection.ts, move the verified DefaultBrowserSectionState shape and default state into the view file, retain TComponentState for the state source, and move checkStatus(), handleRegister(), handleUnregister(), and handleOpenSettings() onto DefaultBrowserSectionView.
   - Keep the existing SubtreeSwap, DefaultBrowserStatusView, syncStatus(), and state binding. Replace new DefaultBrowserSectionModel(...), setPropsInternal(), _initInternal(), and onUnmountInternal() with a view-owned state lifecycle. Add a private view-lifetime flag because VanillaView.disposed is private; set it to false in onDispose(). Guard the checkStatus() continuation and the busy = false writes in both handleRegister() and handleUnregister() finally blocks. Call checkStatus() once from onMount() after the status surface and binding are ready.
   - Preserve the current status keys (checking and registered/busy), button callbacks, busy-state try/finally, and Windows API calls exactly.

3. **Convert McpSectionModel and McpSectionView.**

   - In McpSection.ts, replace the model construction/internal lifecycle calls with a typed ComponentModelDriver<McpSectionState, McpSectionProps, McpSectionModel>, constructed from currentProps() in McpSectionView.onMount(). Register driver.dispose() with own() and retain the existing state bind() and syncState() projection.
   - Replace the existing direct model.setPropsInternal() in the settings callback with exactly the two-line driver.update(this.currentProps()) plus syncState(this.driver.model.state.get()) path. Preserve the five-key filter; no gate or status-subscription lifecycle belongs in the view.
   - In McpSectionModel.ts, remove the four effect registrations. Add private initialized = false and four private DepsGates. init() must seed both editable port strings, start one MCP plus one Mneme status subscription, prime all four gates, and set initialized last. setProps(props) must return while uninitialised, then mirror only the changed port slot and stop/start only the corresponding status subscription when its Boolean slot changes. Do not use mcp.browserToolsEnabled as a status dependency.
   - Store the current renderer-event disposer for each service in the model. dispose() must call both stop methods (which each unsubscribe at most once) before clearing copiedTimer. A same-value settings.set() notification must not restart a listener, matching depsChanged and the old effect. Each real toggle must perform exactly one disposer call and exactly one new rendererEvents subscription for the corresponding service; disposal must stop each current listener once. Keep the asynchronous getMcpStatus()/getMnemeStatus() fetches and their isLive guards behaviourally equivalent.

4. **Convert Git integration in SettingsSections.ts.**

   - Import the driver and gate types/functions in src/renderer/editors/settings/sections/SettingsSections.ts and remove the now-unused TComponentState import if no other code in the file needs it.
   - In GitIntegrationModel, replace the effect registration with direct init() startup and a model-owned [props.gitEnabled] DepsGate. Guard setProps(props) until initialized, then perform the explicit enabled transition only when that gate changes. Keep the dynamic import("../../../api/git"), git.probe(), and failure handling, but store the current alive cancellation as a field/cancel function and add dispose() to cancel it; otherwise a late probe would call the unguarded setProbe() after the section closes. The disabled transition writes probe = null synchronously.
   - In GitIntegrationSectionView.onMount(), construct/register a typed driver, remove all three direct internal calls, and keep the git.enabled settings subscription, state binding, checkbox, status swap, and sync() projection. Its callback reduces to driver.update(this.currentProps()) followed by sync(model.state.get()); no gate or probe lifecycle belongs in the view.

5. **Convert Video Player in SettingsSections.ts.**

   - In VideoPlayerModel, remove the effect, add a model-owned [props.videoStreamPort] DepsGate and initialized guard, seed portValue and prime the gate in init(), and synchronously mirror only a changed port from setProps(props). Do not retain queueMicrotask.
   - In VideoPlayerSectionView.onMount(), construct/register a typed driver using the current video-stream.port, remove the internal lifecycle calls, and retain the vlc-path plus video-stream.port settings filter. Its callback reduces to driver.update(this.currentProps()) followed by sync(); the existing state binding continues to render the input and the changed port is mirrored inside the model's setProps().
   - Preserve the existing state.portValue binding, input validation in handlePortBlur(), and independent vlc-path display updates.

6. **Verify the removal boundary and behaviour.**

   - Re-run the renderer-wide census after the implementation: grep "this\.effect[<(]" src/renderer must return zero hits, and no file outside src/renderer/core/state/ may call setPropsInternal, _initInternal, or onUnmountInternal. src/renderer/core/state/model.ts remains unchanged for US-1193.
   - Run the project's normal type/lint/build checks available for this repository; do not add unit tests or a test harness.
   - Manually open Settings and exercise Browser Profiles, Default Browser, MCP/Mneme, Git, and Video Player. Settings must open without createComponentModelDriver.mount() throwing for a missed effect. Specifically toggle MCP and Mneme on/off repeatedly and verify each matching status listener has one active instance, starts once per real toggle, stops once per real toggle, and is stopped on section disposal. Verify that ports remain editable until their own setting changes and that async Git/default-browser status does not update a disposed section.

## Concerns

- **MCP subscription cardinality is the primary risk.** The old effect cleanup was the only thing preventing duplicate eMcpStatusChanged/eMnemeStatusChanged listeners. Start each service once in init(), keep its disposer in one model field, and make the enabled dependency transition an explicit stop-then-start operation from McpSectionModel.setProps(). dispose() must stop both current listeners before clearing the timer. Do not add a second status subscription in the view.
- **Settings events include unrelated and same-value notifications.** Browser Profiles receives bookmark/profile keys in addition to tor.socks-port; MCP receives browser-tools and both port keys in addition to its toggles; Video receives vlc-path in addition to its port. Each model gate must compare only the exact old effect dependency and must be primed in that model's init() before initialized becomes true.
- **The section views have empty public props.** SettingsView.ts constructs them with {} and does not pump them later. Keep the existing settings subscriptions as the explicit live-update source; after each relevant event the view should only call driver.update(this.currentProps()) and sync(...). Do not invent a new top-level settings subscription in SettingsView.ts.
- **Initialisation order matters.** Each affected driver is constructed in its view's onMount(), after the section has the settings context but before the model's child-dependent work. The driver still pumps initial props before mount(); each model's initialized guard must therefore make that first setProps() call a no-op, then init() must seed/subscribe, prime all model gates, and set initialized last. driver.mount() must occur after child DOM setup, matching the existing clean lifecycle pattern.
- **Disposal must cover work formerly owned by effect cleanup.** McpSectionModel.dispose() must unsubscribe both stored renderer-event listeners. GitIntegrationModel.dispose() must cancel the current alive probe continuation because Git's setProbe() has no liveness guard. Video Player has no asynchronous cleanup requirement because its conversion is synchronous.
- **Async results are not cancellation tokens.** Preserve the existing MCP isLive checks and Git alive cancellation semantics; do not introduce a new status-generation policy in this task, because that could change which late status fetch wins.
- **Scope boundary.** Do not change memo()/IMemo, depsChanged, DepsGate, the driver implementation, settings/event primitives, unrelated settings sections, or any model hooks removal. Those belong to later epic tasks or are explicitly out of scope.

## Acceptance Criteria

- [ ] src/renderer/editors/settings/sections/BrowserProfilesSection.ts uses createComponentModelDriver; it contains no setPropsInternal, _initInternal, or onUnmountInternal call, and its Tor-port mirror is gated only by torSocksPort.
- [ ] src/renderer/editors/settings/sections/BrowserProfilesSectionModel.ts contains no effect() registration; profile mutations, bookmark operations, Tor controls, and timer disposal behave as before.
- [ ] DefaultBrowserSectionModel.ts is deleted and DefaultBrowserSection.ts owns the same state/status/registration behaviour, including one status check on open and safe async disposal.
- [ ] src/renderer/editors/settings/sections/McpSection.ts uses createComponentModelDriver, contains no model-internal lifecycle calls, and keeps the five existing setting keys and state binding; its update callback is only driver.update(this.currentProps()) followed by syncState(...).
- [ ] McpSectionModel.ts contains no effect() registration; its initialized guard blocks the driver's constructor pump, init() seeds/subscribes/primes, setProps() owns all four dependency gates, and dispose() unsubscribes both stored status listeners before clearing copiedTimer. MCP and Mneme status listeners are each started initially, restarted exactly once per real matching toggle, and stopped exactly once on disposal with no duplicate active listener.
- [ ] SettingsSections.ts contains no effect registrations or direct model-internal lifecycle calls. Git and Video use typed drivers; their model setProps() hooks own the gates, Git dispose() cancels a late probe, Git clears/probes synchronously at the update boundary, and Video mirrors the configured port synchronously without queueMicrotask.
- [ ] No memo()/IMemo, TComponentModel, DepsGate, depsChanged, settings API, renderer event primitive, or unrelated settings section is changed by this task.
- [ ] A renderer-wide census confirms grep "this\.effect[<(]" src/renderer returns zero hits, and no file outside src/renderer/core/state/ calls setPropsInternal, _initInternal, or onUnmountInternal.
- [ ] Settings opens without createComponentModelDriver.mount() throwing for a missed effect. Manual verification covers browser profiles, default browser, MCP/Mneme toggles, Git enable/disable, and Video Player port/path changes. No unit tests or test harnesses are added.

## Files Changed

| Path | Planned change |
|---|---|
| src/renderer/editors/settings/sections/BrowserProfilesSectionModel.ts | Remove the one effect registration; retain model operations and lifecycle disposal. |
| src/renderer/editors/settings/sections/BrowserProfilesSection.ts | Add driver ownership, replace internal calls, and reduce settings updates to driver pump plus sync. |
| src/renderer/editors/settings/sections/DefaultBrowserSectionModel.ts | Delete; the small model is collapsed into the view. |
| src/renderer/editors/settings/sections/DefaultBrowserSection.ts | Own the default-browser state, handlers, one-time status check, and status projection. |
| src/renderer/editors/settings/sections/McpSectionModel.ts | Remove four effects; add direct initialisation and explicit status-subscription lifecycle methods. |
| src/renderer/editors/settings/sections/McpSection.ts | Add driver ownership, replace internal calls, and preserve the five-key settings update path. |
| src/renderer/editors/settings/sections/SettingsSections.ts | Convert Git and Video models/views to drivers; keep dependency gates and async cleanup in the models. |

Files that need **NO changes**:

- src/renderer/core/state/model.ts — TComponentModel internals and createComponentModelDriver are US-1193 scope; US-1192 only consumes the existing driver.
- src/renderer/uikit/shared/deps-gate.ts — reuse createDepsGate() and its existing comparator; do not alter DepsGate or depsChanged.
- src/renderer/uikit/ListBox/ListBoxView.ts — read-only clean driver/gate reference.
- src/renderer/editors/settings/SettingsView.ts — its section construction remains {} and should not gain a second settings subscription.
- src/renderer/editors/settings/sections/settings-native.ts — DOM/style helpers are unrelated.
- src/renderer/editors/settings/sections/FileSearchSection.ts and ThemeSection.ts — already use their own direct settings subscriptions and are outside the five-file effect scope.
- src/renderer/api/settings.ts, src/renderer/api/internal.ts, src/renderer/core/state/events.ts, and src/ipc/renderer/renderer-events.ts — current subscription return shapes and event dispatch are inputs to this conversion, not changes for US-1192.
- doc/active-work.md — the user will add/update the dashboard entry.
