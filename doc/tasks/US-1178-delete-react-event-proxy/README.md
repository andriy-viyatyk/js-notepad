# US-1178 — delete the React event proxy

**Epic:** [EPIC-074 — De-React Epic F: React confined](../../epics/EPIC-074.md) (task F-e)
**Status:** Blocked on F-f (US-1179) — see Ordering
**Created:** 2026-08-28

## Goal

Delete `toPublicEvent`, the `Proxy` that synthesizes a React `SyntheticEvent` for every rest-prop
listener, so residual handlers receive the browser's native `Event`. Removes ~50 lines and the last
`React.SyntheticEvent` reference.

## Ordering — this runs AFTER F-f, and the reason matters

The runtime half of this contract (`applyRestProps`, which decides what a handler *receives*) and its
type half (`React.HTMLAttributes`, which decides what the call site *believes* it receives) are owned
by different tasks. Doing runtime first leaves every `on*` handler receiving a native `Event` while
its declared type still promises a synthetic one — nothing fails to compile, and
`editors/link-editor/index.ts:260`'s `event.nativeEvent` silently becomes `undefined`.

F-f changes the types first, so `tsc` enumerates the affected call sites. By the time this task runs
they are already corrected, and this task only removes the wrapper. See EPIC-074 F-5 decision 3.

**Consequence for this task:** by the time you start, the handler types are already native and
`applyRestProps` is already passing a proxy *that satisfies them* (the proxy forwards unknown
properties to the underlying native event, so a corrected call site works either way). This task
makes the runtime match the declaration.

## Background — why the proxy is deletable

`toPublicEvent` (in the F-f-renamed `uikit/shared/dom-props.ts`, formerly `react-compat.ts:21-61`)
builds a `Proxy` over the native event and defines eight React-only members on it. Measured
consumption of each, across the whole renderer:

| Member | Non-`react-compat` consumers |
|---|---|
| `isPersistent` | **0** |
| `isDefaultPrevented` | **0** |
| `isPropagationStopped` | **0** |
| `persist` | **0** (32 textual `.persist` hits are all unrelated `persist()` methods on services — `main/download-service.ts`, `api/board-install-registry.ts`, etc.) |
| `nativeEvent` | **2** — see below |
| `target` / `currentTarget` / `preventDefault` / `stopPropagation` | native already provides all four |

So five of the eight members have no consumer at all, and the other four are native. The only real
dependency is `nativeEvent`, with two call sites:

- **`core/events/context-menu.ts:62`** — already shape-tolerant and needs no behaviour change:
  ```ts
  const nativeEvent = "nativeEvent" in event ? event.nativeEvent : event;
  ```
  Its parameter type is `MouseEvent | { nativeEvent: MouseEvent }`. Once the proxy is gone the
  `"nativeEvent" in event` branch is dead. **Simplify it, but keep the function accepting a plain
  `MouseEvent`** — and check its other callers before narrowing the parameter type.
- **`editors/link-editor/index.ts:260`** — `onClick: (event) => this.openViewModeMenu(event.nativeEvent)`.
  **F-f already fixed this** to pass `event` directly. Verify that, do not fix it twice.

## Implementation plan

1. In `uikit/shared/dom-props.ts`: delete `toPublicEvent` and the `PublicEventHandler` type alias,
   and remove the `react` import. In the listener construction (formerly `react-compat.ts:113-120`),
   call the handler with the native event:

   ```ts
   // Before
   const listener: EventListener = (event) => {
       (value as PublicEventHandler)(toPublicEvent(event));
   };
   // After
   const listener: EventListener = (event) => {
       (value as (event: Event) => void)(event);
   };
   ```

   Keep the `doubleclick` → `dblclick` mapping and the `previous.listeners` bookkeeping exactly as
   they are — those are behaviours, not React compatibility.

2. Simplify `core/events/context-menu.ts:62` per above.

3. Confirm no `nativeEvent` reference remains anywhere: `grep -rn "nativeEvent" src/` should return
   nothing outside comments.

4. The file should now contain **no** React reference of any kind — that is the point. `grep -in react`
   over it should return nothing, comments included (concern C21: the epic's closing measurement is
   grep-shaped, so a stale mention is a defect).

## Files that need NO changes

- The 39 views calling `applyRestProps` — they pass handlers; none reads a synthetic-only member.
  (F-f may already have touched their *types*; this task touches none of them.)
- `uikit/shared/mount.tsx` — F-h's work.
- `editors/link-editor/index.ts` — F-f fixed `:260`; verify, do not re-edit.

## Concerns

1. **This is a real behaviour change on every rest-prop listener in the app, and no build catches
   it.** The declared and actual event objects converge here, but any handler that *implicitly*
   relied on a proxy behaviour — property forwarding, the `Object.create(null)` target, the
   propagation flag — changes. The measurements above say nothing does; verify at runtime, not by
   compiling.
2. **WebIDL brand checks were the reason the proxy was written the way it is.** The comment at
   `react-compat.ts:22-26` records that `KeyboardEvent.key` and `ClipboardEvent.clipboardData` throw
   when read from an `Object.create(event)` receiver. Deleting the proxy removes that hazard entirely
   rather than working around it — but it means any code that *was* relying on the proxy's forwarding
   now touches the native event directly. That is the desired end state; note it in the commit.
3. **Do not narrow `ContextMenuEvent.fromNativeEvent`'s parameter type without checking its callers.**
   It is called from several editors.

## Acceptance criteria

1. `toPublicEvent` and `PublicEventHandler` no longer exist.
2. `grep -rn "nativeEvent" src/` returns nothing outside comments.
3. `grep -in "react" src/renderer/uikit/shared/dom-props.ts` returns nothing.
4. `npm run typecheck`, `npm run lint`, `npm run build-prod` pass.
5. **Presence checks — required, because criteria 1-4 cannot see this task's actual risk:**
   - **A rest-prop listener fires.** `DotView` forwards `onClick` through `applyRestProps`
     (`DotView.ts:75-78`); the `Dot` story is the reachable surface. Click it and confirm the handler
     runs.
   - **`aria-expanded` still serialises.** Open a `Select` or `PathInput` popover and read the
     attribute: it must be the string `"false"` when closed, not absent.
   - **The link-editor view-mode menu opens.** This is the call site the ordering decision exists to
     protect, and it is also an already-unverified surface from US-1153 — worth clearing both here.
   - **A context menu opens** on a tree row or grid cell, exercising `ContextMenuEvent.fromNativeEvent`
     through its simplified path.
   - **A keyboard handler reads `event.key`.** This is the WebIDL brand-check case from concern 2 —
     type in the browser URL bar or a `TagsInput` and confirm keys register.

## Files changed

| File | Change |
|---|---|
| `uikit/shared/dom-props.ts` | `toPublicEvent`, `PublicEventHandler`, React import deleted; listener passes the native event |
| `core/events/context-menu.ts` | dead `"nativeEvent" in event` branch simplified |
