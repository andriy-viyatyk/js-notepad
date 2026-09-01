# US-1269: De-effect the rest-client editor

Epic: [EPIC-082 — React architecture removal at the call sites](../../epics/EPIC-082.md)

Status: Planned

## Goal

Remove the one `useEffect`-shaped deferred consequence from
`src/renderer/editors/rest-client/ResponseViewerView.ts` while preserving response rendering and
the response viewer's first-pump behavior. Classify the measurement gates in
`RequestBuilderView.ts` and `RestClientShared.ts` as legitimate synchronous prop-pump/DOM
measurement change detection and leave them in place; do not pull EPIC-081's response-pane layout
retry into this task.

## Background

### Verified current shape

The EPIC-082 measurement at commit `caacc80a` matches the current three files:

| File | `createDepsGate()` instances | Deferred bodies | `this.live` | `isLive` |
|---|---:|---:|---:|---:|
| `src/renderer/editors/rest-client/ResponseViewerView.ts` | 3 | 1 | 3 | 0 |
| `src/renderer/editors/rest-client/RequestBuilderView.ts` | 2 | 0 | 0 | 0 |
| `src/renderer/editors/rest-client/RestClientShared.ts` | 1 | 0 | 0 | 0 |

The current source was checked at the following sites. `RequestBuilderView.ts` and
`RestClientShared.ts` contain no `queueMicrotask`, and none of these three files contains an
`isLive` reference.

| File and current site | Gate/consequence | Decision and verified reason |
|---|---|---|
| `src/renderer/editors/rest-client/ResponseViewerView.ts:113`, consumed at `:158-162` | `responseResetGate` detects a new `props.response` identity and queues `setLanguageOverride(null)` behind a microtask guarded by `this.live`. | **Answer 1 — synchronous consequence at the prop-pump write site.** `ResponseViewerView.onUpdate:144-147` receives the already-stored current props, calls the synchronous `createComponentModelDriver.update()` path, and has no render/commit phase or required post-dispatch ordering. `ResponseViewerModel.setProps` is the clearest owner of the local language-reset consequence. Stamp the response before `setLanguageOverride(null)` because the model-state binding at `ResponseViewerView.onMount:136` can synchronously re-enter `sync`. |
| `src/renderer/editors/rest-client/ResponseViewerView.ts:114`, consumed at `:183-187` | `bodyValueGate` limits `MonacoEditorHostView.setValue()` to changed active-tab/executing/body/response inputs, after the response branch has been mounted or updated. | **Leave it.** This is not a deferred body. It is legitimate prop-pump change detection around an existing Monaco host; the model setter cannot perform this DOM/editor-host consequence, and the gate avoids writing a hidden or binary body. Its `prime()` at `:140` preserves the mount-time sync. No `bind()` or `afterDispatch` replacement is clearer. |
| `src/renderer/editors/rest-client/ResponseViewerView.ts:115`, consumed at `:188-192` | `headersValueGate` limits `MonacoEditorHostView.setValue()` for the JSON headers view. | **Leave it.** Like `bodyValueGate`, this is synchronous host update work after `ResponseBranchView.sync:314-340`, not a deferred effect. The gate preserves the existing tab/executing/headers/response scope and its mount-time `prime()` at `:141`; changing it would manufacture churn. |
| `src/renderer/editors/rest-client/RequestBuilderView.ts:80`, consumed at `:163-166` | `bodyMeasureGate` scopes `applyLayout()` or `scheduleBodyMeasure()` to `bodyHeight` changes during `sync:161-181`. | **Leave it.** The consequence depends on the mounted DOM and is measurement-backed: `scheduleBodyMeasure:189-199` uses the owner-bound `this.schedule.raf`, checks connection and positive `offsetHeight`, then writes `bodyHeight`. It is not clearer as a request-model setter or state selector, and there is no deferred effect body to remove. |
| `src/renderer/editors/rest-client/RestClientShared.ts:88`, consumed at `:227` and `:242` | `resultMeasureGate` scopes `syncLayout()` to `resultHeight` changes. | **Leave it.** `syncLayout:252-266` applies pane styles and schedules measurement when no height is known; this is legitimate DOM measurement/layout change detection. The owner-bound retry at `scheduleMeasurement:268-280` remains separate from the gate decision and is EPIC-081 work. No `afterDispatch` replacement is warranted. |

The one body is therefore not an `afterDispatch` site. `afterDispatch` is reserved for a
consequence that must not run inside the dispatch (`src/renderer/core/state/dispatch.ts:37-53`),
and no such ordering requirement exists for resetting this local viewer preference. The existing
microtask only compensates for the removed React effect phase.

### Response reset lifecycle and re-entrancy

`createComponentModelDriver` performs the initial model prop pump at construction and invokes later
`setProps` calls synchronously (`src/renderer/core/state/model.ts:168-186`). The current
`ResponseViewerModel` has no `setProps`; its initial state is created at `:56-60`, and the view
primes `responseResetGate` with the initial response at `ResponseViewerView.onMount:137`, so the
initial mounted sync does not reset the language override.

The implementation should move that first-pump distinction into the model: the constructor-time
`setProps` records the initial response without writing state, and later response identity changes
stamp the new response before calling `setLanguageOverride(null)`. The model `setProps` must remain
synchronous even though `TComponentModel.setProps` permits a Promise
(`src/renderer/core/state/model.ts:95-109`). This preserves the old initial `prime()` behavior and
keeps the guard-removal proof local to the deleted microtask.

The ordering is important because `TOneState.set/update()` publishes synchronously
(`src/renderer/core/state/state.ts:72-93`). A response update arrives through the synchronous chain
`RestClientBodyView.bind:101-106` → `RestDetailView.onUpdate:230-243` →
`ResponseViewerView.onUpdate:144-147`. During `driver.update(props)`, the model's reset setter can
notify the viewer's state binding and re-enter `ResponseViewerView.sync:156-193`. The new response
stamp must already be installed before that setter. The post-pump state read is already an existing
precondition: `ResponseViewerView.onUpdate:144-147` calls
`this.driver.update(props); this.sync(this.driver.model.state.get());`. Once the reset moves into
the model's synchronous `setProps` invoked inside `driver.update`, that existing explicit `sync`
already sees post-reset state after nested work. Retain this sequence; do not add a redundant read
or restructure `onUpdate`.

The recursion bound is the stamped response identity: the nested local-state pass does not alter
`props.response`, so it cannot request the same reset again. The existing response branch update
and content swap are synchronous (`ResponseBranchView.sync:314-340`), and none of the reset path
awaits, schedules a timer/rAF, or registers a third-party callback. If a future child-mount callback
starts writing the parent rest-client state during this path, the response-reset ordering and bound
must be revisited before changing this task's synchronous implementation.

The three `this.live` references in `ResponseViewerView` are complete and all belong to the deleted
microtask lifecycle: the `true` assignment at `:130`, the disposal write at `:131`, and the guard at
`:160`. `ResponseViewerView` itself (`:109-237`) contains no `await`, timer, rAF, or third-party
callback. The async `copyHeaders:381-385` and `saveBinary:386-390` methods belong to the different
`ResponseBranchView` class (`:246-407`) and never used `this.live`; do not add guards to them.
Those methods' post-`await` continuations are a pre-existing, out-of-scope observation: they do not
mutate the disposed viewer's state, so this task neither fixes them nor treats them as a reason to
retain the flag.

### Measurement gates intentionally retained

`RequestBuilderView` does not bind directly to its model state; its parent prop pump passes the
current `RestClientViewState`, while its local `sync` receives `RequestBuilderState` after
`driver.update`. `bodyMeasureGate` therefore prevents ordinary request/body state updates from
re-running layout while still allowing the measured height to trigger the layout consequence. The
gate is primed after the initial mount sync at `:144`, and the owner-bound `bodyMeasureFrame` is
cancelled by the view's cleanup at `:107` and by the scheduler on disposal. The connection and
zero-height checks at `:193` remain load-bearing.

`RestDetailView` has the analogous `resultMeasureGate`: the initial `null` height at
`RestClientShared.ts:227` starts measurement, later height changes at `:242` apply the pane layout,
and the splitter writes/prime path is at `:288-292`. The current `schedule.raf` callback at
`:268-280` is owner-bound but still self-reschedules indefinitely while
`!this.root.isConnected || this.responsePane.offsetHeight <= 0`; it has no `live` guard. The gate
and this spin share only `this.resultHeight` and the gate's `prime([this.resultHeight])` at `:278`
as state/control data; both call the existing `syncLayout()` method, but no other scheduling or
liveness state is shared.

### EPIC-081 collision

The response-pane retry in `src/renderer/editors/rest-client/RestClientShared.ts:268-280` is the
P4 `afterFirstLayout` work assigned to EPIC-081. It is separate source from the `DepsGate` calls at
`:227` and `:242`: the gate decides when `syncLayout()` runs, while `scheduleMeasurement()` owns
the owner-bound `raf` retry and the connection/offset-height check. The current loop still
self-reschedules indefinitely when disconnected or zero-height and has no `live` guard; US-1263
converted handle ownership, not the spin. The limited coupling is the `resultHeight`/gate-prime
handoff: `syncLayout()` calls `scheduleMeasurement()` when `resultHeight` is `null`, and the retry
writes `resultHeight`, calls `syncLayout()`, and primes `resultMeasureGate` at `:278`.

This task must not replace, move, or otherwise fix that loop. Because the gate and retry share only
`resultHeight` and the gate-prime handoff at `:278`, EPIC-081 must rebase whichever change lands
second and preserve the initial-open, zero-height retry, positive-height write, and gate-prime
sequence. That coupling requires a rebase, not a change to the epic boundary.

### Rest-client state and runtime fixture

`src/renderer/editors/rest-client/RestClientEditor.ts` writes the response projection
synchronously when selecting a request (`:309-320`), clearing it for a new request
(`:322-339`), starting a request (`:655-669`), and completing either a successful or failed fetch
(`:753-774`). The fetch itself is asynchronous and remains entirely outside this task; the viewer
only receives its resulting `response`, `responseTime`, and `executing` props through
`RestClientBodyView`.

No `.rest.json` fixture exists in the repository. Runtime verification must create a throwaway
file outside `docs/`, for example `%TEMP%\\us-1269-rest-client.rest.json`, using the real schema
`{ "type": "rest-client", "requests": RestRequest[] }` from
`src/renderer/editors/rest-client/restClientTypes.ts:30-43`. The fixture should contain complete
`RestRequest` records for these requests:

| Request | URL/body | Purpose |
|---|---|---|
| JSON | `GET https://httpbin.org/json` | JSON body formatting, response metadata, Body tab. |
| HTML | `GET https://httpbin.org/html` | HTML/text Monaco rendering and content-type language detection. |
| Binary | `GET https://httpbin.org/image/png` | Binary response branch, image preview, size, save/open actions. |
| HTTP error | `GET https://httpbin.org/status/404` | Non-throwing error status (`404`) in `ResponseMetaView`. |
| Network error | `GET https://example.invalid/` | Fetch rejection rendered as the status-0 `Error` response body. |
| Echo | `POST https://httpbin.org/anything`, raw JSON body and `Content-Type: application/json` | Sending with an editable body and request-builder body controls. |

The implementation must not edit `docs/examples/greek-gods.fg.json` or any other file under
`docs/`; this task has no relevant documentation fixture to reuse. If the external endpoint is
unavailable, use an equivalent throwaway local HTTP responder outside the repository with the same
JSON, HTML, binary, status-error, and rejection cases.

## Implementation Plan

- [ ] Refactor the response reset in `src/renderer/editors/rest-client/ResponseViewerView.ts:62-74,109-193`:

  - Add a synchronous `ResponseViewerModel.setProps(props)` that tracks the applied
    `props.response` identity. On the driver's first constructor-time prop pump, initialise the
    stamp and return without changing `languageOverride`, matching the current
    `responseResetGate.prime` at `:137`. On a later identity change, stamp the new response first,
    then call the existing `setLanguageOverride(null)` setter.
  - Keep the stamp separate from the response value so the initial `null` response is distinguishable
    from an uninitialised stamp. Do not use a real response value as the initial sentinel.
  - Keep `setProps` returning `void`; do not introduce an `await`, Promise continuation, timer,
    animation frame, measurement, or third-party callback. This is the condition that justifies
    removing the former microtask's lifetime guard.
  - Remove `responseResetGate` and its `prime()` call. Remove `ResponseViewerView.live`, its
    `onMount` assignment/cleanup, and only the `this.live` check that guarded the deleted
    `queueMicrotask` at `:159-161`.
  - Retain the existing `ResponseViewerView.onUpdate:144-147` order:
    `driver.update(props)` followed by `this.sync(this.driver.model.state.get())`. This is an
    already-satisfied precondition, not a new change: the model reset may synchronously re-enter the
    state binding, and the existing explicit state read already observes post-nested-work state.
    Only the model stamp-before-setter ordering is new.
  - Retain `bodyValueGate`, `headersValueGate`, their existing dependency meanings, the branch
    swap/update order, both Monaco host updates, and both `prime()` calls at `:140-141`. Do not
    replace them with `bind()` or `afterDispatch`.

- [ ] Add a short Persephone-native comment beside the new model transition explaining that the
  driver prop pump is synchronous, there is no render/commit phase, and a changed response derives
  the local language override reset at that write site. Document the stamp-before-setter reason if
  the helper is not self-explanatory.

- [ ] Leave the gates and measurement paths unchanged in
  `src/renderer/editors/rest-client/RequestBuilderView.ts:80,161-199`:

  - Do not remove `bodyMeasureGate`, convert it to a selector, or replace it with
    `afterDispatch`. Its guarded consequences are `applyLayout()` and the owner-bound measurement
    request, not deferred effect bodies.
  - Preserve `bodyMeasureFrame` release cleanup, `this.schedule.raf`, `root.isConnected`, the
    `offsetHeight <= 0` retry, `setBodyHeight`, and `bodyMeasureGate.prime()` calls.
  - Verify that no incidental formatting or import churn changes this file.

- [ ] Leave the gate and layout loop unchanged in
  `src/renderer/editors/rest-client/RestClientShared.ts:88,227-280`:

  - Do not remove `resultMeasureGate` or convert it to `bind()`/`afterDispatch`; it is legitimate
    measurement/layout change detection with no deferred effect body.
  - Do not touch `scheduleMeasurement()` or its owner-bound self-rescheduling `raf`. The loop is
    EPIC-081 P4 and shares the `resultHeight`/`syncLayout()` handoff recorded above.
  - Preserve the splitter's synchronous height write, gate prime, and layout behavior.

- [ ] Verify the implementation statically and in the running rest-client editor before marking it
  implemented:

  - Confirm `ResponseViewerView.ts` has no `responseResetGate`, `queueMicrotask`, or custom
    `this.live` references. Confirm `bodyValueGate` and `headersValueGate` remain. Confirm
    `RequestBuilderView.ts` still has its measurement gate and owner-bound `raf`, and
    `RestClientShared.ts` still has its result gate and EPIC-081 retry. No new `afterDispatch` call
    is expected in any of the three files.
  - Run the repository lint, typecheck, and production build checks appropriate to the
    implementation, treating a green build as supplementary rather than runtime evidence.
  - Create the throwaway `.rest.json` fixture outside `docs/` and open it in the running app. Send
    the JSON, HTML, binary, and echo requests; verify response metadata and body rendering for
    JSON, text/HTML, binary image, and status-0 network-error bodies. Verify the HTTP 404 response
    is shown as an error status without being confused with a fetch rejection.
  - Switch the selected request repeatedly in the Rest request tree and verify each request's
    response is restored/reset correctly. Within the response viewer switch Body ↔ Headers and
    Headers Table ↔ JSON, and within the request builder switch headers Table ↔ JSON and body
    types, including raw-body editing before sending.
  - Verify the response pane's first-open layout: the initially unmeasurable/zero-height pane
    retries through the existing owner-bound scheduler and settles to a positive height. Resize
    the window and drag/double-click the response splitter/header; verify request/response pane
    proportions, response content visibility, and subsequent response updates remain correct.
  - Dispose/switch away from the editor during repeated response changes and rapid request
    selection churn. Confirm no duplicate language reset, stale Monaco content, post-disposal
    callback, scheduler error, or unhandled rejection appears. Use a throwaway copy for all writes;
    do not modify anything under `docs/`.

### Before → after snippets

Current response reset in `ResponseViewerView.sync:156-162`:

```ts
if (this.responseResetGate.changed([props.response])) {
    queueMicrotask(() => {
        if (this.live) this.driver.model.setLanguageOverride(null);
    });
}
```

Target synchronous model prop-pump consequence (with an explicit first-pump stamp):

```ts
private appliedResponse: RestResponse | null | undefined;
private responseInitialized = false;

setProps = (props: ResponseViewerProps): void => {
    if (!this.responseInitialized) {
        this.appliedResponse = props.response;
        this.responseInitialized = true;
        return;
    }
    if (this.appliedResponse === props.response) return;
    this.appliedResponse = props.response; // stamp before nested state notification
    this.setLanguageOverride(null);
};
```

Existing view code already reads current state after the synchronous driver update; retain it as-is:

```ts
protected onUpdate(props: ResponseViewerProps): void {
    this.driver.update(props); // setProps may synchronously re-enter sync()
    this.sync(this.driver.model.state.get()); // read after nested work
}
```

The two response-host gates remain ordinary prop-pump change detection:

```ts
if (this.bodyValueGate.changed([state.activeTab, props.executing, derived.formattedBody, props.response])) {
    // existing synchronous Monaco host update
}
if (this.headersValueGate.changed([state.activeTab, props.executing, derived.headersAsJson, state.headersView, props.response])) {
    // existing synchronous Monaco host update
}
```

## Concerns

- The response reset is the only deferred body in this task. It uses **answer 1**, not
  `afterDispatch`: the prop pump and model setter are synchronous and no post-dispatch ordering is
  real. A future Promise/await, timer, rAF, measurement, or third-party callback added to
  `ResponseViewerModel.setProps` would invalidate the guard-removal proof and require the relevant
  lifetime guard to return.
- Re-entrancy is the real hazard. The applied response stamp must be written before
  `setLanguageOverride(null)`, because the viewer's bound model state can synchronously call
  `sync()` again. The existing `onUpdate:144-147` state read is the precondition that observes
  current model state after nested work; retain it as-is. The recursion bound is that the stamped
  response identity is unchanged by the local language-reset state update; if response props become
  writable from a child callback, revisit the bound.
- The response reset must preserve first-pump behavior. `depsChanged(undefined, next)` would fire on
  an unprimed first evaluation (`src/renderer/core/state/model.ts:10-16`), but the old gate was
  primed at mount. The new model records the constructor-time initial response without resetting
  state, so it does not silently introduce an initial reset dispatch.
- `bodyValueGate` and `headersValueGate` use identity/value-sensitive prop inputs intentionally.
  They scope existing Monaco hosts after `ResponseBranchView.sync()` and should not be broadened
  into an always-running state listener. `compareSelection` semantics are not a reason to change
  these gates; no selector replacement is planned.
- `RequestBuilderView.bodyMeasureGate` and `RestDetailView.resultMeasureGate` are not defects just
  because they are gates. They guard synchronous consequences that depend on mounted DOM and
  measurement. Removing them would conflate layout scheduling with write-site derivation and add
  churn without removing a deferred body.
- `RestClientShared.ts:268-280` is a collision with EPIC-081. The rAF retry is separate source but
  shares `resultHeight` and the `syncLayout()`/gate-prime handoff. This task leaves it untouched;
  whichever epic runs second must rebase and preserve that handoff rather than treating the gate
  removal as permission to alter the first-layout loop.
- No file under `src/renderer/uikit/` is in scope. `src/renderer/core/state/dispatch.ts`,
  `src/renderer/core/state/state.ts`, `src/renderer/core/state/model.ts`, and
  `src/renderer/core/utils/scheduling.ts` are read-only references for this task.
- The repository has no rest-client fixture. Runtime verification requires a throwaway fixture
  outside `docs/`; neither `docs/examples/greek-gods.fg.json` nor any other documentation file may
  be modified.

No open questions remain: implement one synchronous response-reset derivation, retain all three
non-deferred measurement/host gates, use no `afterDispatch`, and leave the EPIC-081 layout loop for
that epic.

## Acceptance Criteria

- [ ] `ResponseViewerView.ts` removes only the response-reset microtask, `responseResetGate`, and
  the `live` field/writes/check that existed solely for that microtask. No guard protecting an
  await, Promise continuation, timer, rAF, measurement, or third-party callback is removed.
- [ ] `ResponseViewerModel.setProps` resets `languageOverride` synchronously on later response
  identity changes, stamps before the setter, preserves the constructor-time first-pump behavior,
  remains synchronous, and leaves the outer update reading current state after nested work.
- [ ] `bodyValueGate` and `headersValueGate` remain unchanged in purpose and continue to update
  mounted Monaco hosts only for their existing tab/executing/content/response conditions.
- [ ] `RequestBuilderView.ts` remains unchanged in source behavior: its measurement gate, owned
  scheduler release, connection/zero-height retry, and body-pane layout remain intact.
- [ ] `RestClientShared.ts` remains unchanged in source behavior: its result-height gate, splitter
  layout, owner-bound zero-height retry, and gate-prime handoff remain intact. EPIC-081's P4 is not
  implemented here and the collision is recorded for rebasing.
- [ ] No `afterDispatch` conversion is introduced. No file under `src/renderer/uikit/` is changed,
  and no graph, settings, diff, env-vars, or EPIC-081 layout file is modified.
- [ ] Lint, typecheck, and production-build checks pass as supplementary evidence, and runtime
  verification is completed in the running rest-client editor using a throwaway `.rest.json`
  fixture outside `docs/`.
- [ ] Runtime verification covers sending requests; JSON, HTML/text, binary, HTTP-error, and
  network-error response rendering; selected-request switching; response Body/Headers and headers
  Table/JSON tabs; request-builder headers/body controls; first-open and resized response-pane
  layout; rapid updates; and editor disposal without stale or post-disposal work.
- [ ] `doc/active-work.md` and the EPIC-082 task table link US-1269 to this document while keeping
  the task `[ ]`/Planned under the epic.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/editors/rest-client/ResponseViewerView.ts` | Replace the response-reset microtask/gate with a synchronous, stamped model prop-pump consequence; remove only its microtask-specific `live` lifecycle code; retain the two host-update gates. |
| `src/renderer/editors/rest-client/RequestBuilderView.ts` | No source change planned; retain the legitimate body measurement gate and owner-bound retry. |
| `src/renderer/editors/rest-client/RestClientShared.ts` | No source change planned; retain the legitimate result measurement gate and the EPIC-081 response-pane retry. |
| `doc/active-work.md` | Link the existing EPIC-082 / US-1269 dashboard entry to this document. |
| `doc/epics/EPIC-082.md` | Link the US-1269 row in the epic task table to this document. |
| `doc/tasks/US-1269-rest-client-de-effect/README.md` | Record the verified investigation, implementation plan, concerns, acceptance criteria, fixture, and file scope. |

Files explicitly needing no changes: `src/renderer/editors/rest-client/RestClientEditor.ts`,
`src/renderer/editors/rest-client/RestClientBodyView.ts`,
`src/renderer/editors/rest-client/restClientTypes.ts`,
`src/renderer/core/state/dispatch.ts`, `src/renderer/core/state/state.ts`,
`src/renderer/core/state/model.ts`, `src/renderer/core/utils/scheduling.ts`, all files under
`src/renderer/uikit/`, `docs/examples/greek-gods.fg.json`, and all graph/settings/diff/env-vars
files. `RequestBuilderView.ts` and `RestClientShared.ts` are also explicitly unchanged except for
the documented classification of their existing gates; EPIC-081 owns the shared response-pane
layout retry.
