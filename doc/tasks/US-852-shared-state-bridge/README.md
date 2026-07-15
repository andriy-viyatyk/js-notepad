# US-852: `persephone.state.*` shared-state bridge (+ opt-in persistence)

**Epic:** [EPIC-044 — Board Secondary Views](../../epics/EPIC-044.md)
**Depends on:** US-851 (state fields `sharedState` / `sharedStateRestorableKeys` already added to `BoardEditorState`).
**Status:** 📝 Planned — ready to implement

## Goal

Give every board a synchronized, in-memory **shared-state object** — `persephone.state.init/get/set/merge/onChange` — injected into all board frames and authoritative on the Persephone side. Only keys a board declares via `state.init(defaults, { restorableKeys })` are persisted (opt-in, D9), so a board can hold large/transient state without bloating the open-pages file. This is the analogue of the "single model" that built-in editors' main + secondary React views share.

This task wires the channel end-to-end but is verifiable with **one frame** (the main board view) — write from the board, observe `onChange`, reload the app, confirm the restorable subset survived. The *second* frame that makes it genuinely "shared" arrives in US-853; the design already supports N frames.

## Background — the `persephone.host.*` precedent (the exact template)

`persephone.host.*` (EPIC-043) already does what we need, over the **direct renderer↔iframe `window.postMessage` channel** (NOT the per-board `MessagePort`). We mirror it field-for-field:

| Concern | `host.*` (copy this) | `state.*` (build this) |
|---------|----------------------|------------------------|
| Shim settle-once + await-any-time getter | `getContent()` — `hostContentSettled` + `hostContentResolvers` (`board-shim.ts:105-127, 613-621`) | `get()` — `sharedStateSettled` + `sharedStateResolvers` |
| Shim change callback list | `onContentChange` — `hostChangeCbs` (`board-shim.ts:110, 637-644`) | `onChange` — `sharedStateCbs` |
| Inbound host→board push listener | `host:content` listener (`board-shim.ts:231-237`) | `state:sync` listener |
| Board→host outbound posts | `board:setContent` / `board:save` (`board-shim.ts:624-633, 661-667`) | `board:setState` / `board:mergeState` / `board:stateInit` |
| Wire types | `BoardHostContentMsg`, `BoardToHostMsg` (`board-bridge-channels.ts:176-202`) | `BoardStateSyncMsg`, extend `BoardToHostMsg` |
| Renderer seed-on-load | `handleLoad` pushes `host:content` (`BoardWebview.tsx:151-161`) | `handleLoad` pushes `state:sync` |
| Renderer push-on-change | `chost.state.subscribe(..., s => s.content)` (`BoardWebview.tsx:240-259`) | `model.state.subscribe(..., s => s.sharedState)` |
| Renderer inbound apply | `onMessage` `board:setContent` → `model.hostChangeContent()` (`BoardWebview.tsx:196-204`) | `onMessage` `board:setState/mergeState/stateInit` → new model methods |

Key facts already verified:
- The direct channel's trust gates are `event.source === window.parent` (inbound to shim) / `e.origin === board://<host>` + `e.source === contentWindow` (inbound to host). Reuse verbatim.
- `board-shim.ts` builds as a dependency-free IIFE; it may only `import type` from `board-bridge-channels.ts`. Our new message interface must live there.
- The shared model: **every board frame shares one `BoardEditorModel` instance** (US-853), so shared state lives on the model (`BoardEditorState.sharedState`) and each frame's `BoardWebview` is its own sync bridge.
- `TOneState` fires subscribers **synchronously** on `.update()`, so bumping a version counter immediately before `.update()` is race-free within the renderer.

## Design — round-trip-through-host, seq-guarded (⚠ deviates from the epic's echo-suppress sketch — see Concerns C1)

The renderer model is the **single source of truth**. Each frame's shim holds a **pure replica** updated only by seq-stamped `state:sync` pushes. `init/set/merge` are fire-and-forget posts to the host; the resulting authoritative state comes **back** to every frame (including the writer). No optimistic local application, no echo-guard — a monotonic `seq` makes delivery order irrelevant.

Flow (single or multi frame, identical):
```
frame.set(x)  ──board:setState──▶  model.setSharedState(x)   [seq++ , state.update]
                                        │ TOneState fires synchronously
                                        ▼
                 every BoardWebview.subscribe(s=>s.sharedState) pushes
                 { state, seq } to ITS frame  ──state:sync──▶  shim.applyStateSync
                                                                 (ignores seq ≤ lastSeq)
                                                                 → cache = state, onChange fires
```
Why this over the epic's `lastWriterFrameId` echo-suppress + optimistic apply: there is **no feedback loop** to suppress (`state:sync` never re-posts), so suppression is a pure optimization — and combined with a seed-on-load push it creates an ordering hazard (an empty seed arriving *after* a synchronous `init()` clobbers it). The `seq` guard removes that hazard for free and is robust under `merge` (the reason the epic rejected value-equality). Net: simpler, race-free, one round-trip of latency on the writer's own change (imperceptible for UI state; `onChange` is the source of truth exactly like React `setState`).

### Restore + opt-in persistence (D9)
- `state.init(defaults, { restorableKeys })` → host `initSharedState`: `sharedState = { ...defaults, ...sharedState }` (**existing/restored values win** — fill-missing), and records `sharedStateRestorableKeys`.
- Base `BoardEditorModel.getRestoreData()` (already overridden to pin `editorId`) additionally rewrites `data.state.sharedState` to **only the declared restorable keys** (a shallow clone — must NOT mutate live state). Undeclared/transient keys never persist. `BoardContentEditorModel.getRestoreData()` calls `super` so content-host boards inherit it.
- On restore, `state.sharedState` comes back as the persisted subset; the board's `init` on next load fills the rest from defaults.

## Implementation plan

### Step 1 — Wire types

**File:** `src/ipc/board-bridge-channels.ts`

1a. Extend the board→host union `BoardToHostMsg` (line 179) with the three state verbs and their payload fields:

```ts
export interface BoardToHostMsg {
    __persephone:
        | "board:interact"
        | "board:error"
        | "board:busy"
        | "board:setContent"
        | "board:save"
        | "board:setState"   // persephone.state.set — replace shared state (EPIC-044)
        | "board:mergeState" // persephone.state.merge — shallow-merge shared state
        | "board:stateInit"; // persephone.state.init — seed defaults + declare restorable keys
    /** `board:error` detail. */
    message?: string;
    /** `board:busy` value. */
    busy?: boolean;
    /** `board:setContent` payload — the new UTF-8 content. */
    content?: string;
    /** `board:setState` full replacement / `board:stateInit` defaults. */
    state?: Record<string, unknown>;
    /** `board:mergeState` shallow-merge partial. */
    partial?: Record<string, unknown>;
    /** `board:stateInit` defaults (fill-missing). */
    defaults?: Record<string, unknown>;
    /** `board:stateInit` keys to persist (opt-in, D9). */
    restorableKeys?: string[];
}
```

1b. Add the host→board push type (mirror `BoardHostContentMsg`, ~line 202):

```ts
/** Shared state pushed renderer → board over `iframe.contentWindow.postMessage` (EPIC-044).
 *  A snapshot after the frame loads (seed), then on every change. `seq` is a monotonic
 *  per-model version: the shim applies a push only when `seq` exceeds the last applied,
 *  so seed-vs-init / set / merge deliveries are order-independent (no echo-guard needed). */
export interface BoardStateSyncMsg {
    __persephone: "state:sync";
    state: Record<string, unknown>;
    seq: number;
}
```

### Step 2 — Model methods + persistence (base model)

**File:** `src/renderer/editors/board/BoardEditorModel.ts`

2a. Add the monotonic version as an instance property (NOT in state — never persisted, resets per session) and three mutators. Place them near the busy/`setBusy` region:

```ts
/** Monotonic shared-state version (EPIC-044) — stamped on every `state:sync` push so a
 *  frame ignores stale/out-of-order deliveries (seed-on-load vs init/set/merge). Instance
 *  property, kept OFF the reactive state: never persisted, resets to 0 each session. */
sharedStateSeq = 0;

/** Replace the shared state (`persephone.state.set`). Bump seq BEFORE `state.update` so the
 *  synchronous subscription fires with the new seq already visible. */
setSharedState(next: Record<string, unknown>): void {
    this.sharedStateSeq++;
    this.state.update((s) => { s.sharedState = next && typeof next === "object" ? next : {}; });
}

/** Shallow-merge into the shared state (`persephone.state.merge`). */
mergeSharedState(partial: Record<string, unknown>): void {
    if (!partial || typeof partial !== "object") return;
    this.sharedStateSeq++;
    this.state.update((s) => { s.sharedState = { ...(s.sharedState ?? {}), ...partial }; });
}

/** Seed defaults (fill-missing — existing/restored values win) + record the restorable
 *  keys (`persephone.state.init`, opt-in persistence D9). Idempotent; last init wins for
 *  the key set. */
initSharedState(defaults: Record<string, unknown>, restorableKeys?: string[]): void {
    this.sharedStateSeq++;
    this.state.update((s) => {
        s.sharedState = { ...(defaults && typeof defaults === "object" ? defaults : {}), ...(s.sharedState ?? {}) };
        if (Array.isArray(restorableKeys)) {
            s.sharedStateRestorableKeys = restorableKeys.filter((k) => typeof k === "string");
        }
    });
}
```

2b. Extend the existing `getRestoreData()` override (currently lines 194-198) to persist only the restorable subset (D9). **Shallow-clone** `data.state` — `super.getRestoreData()` returns the live state object by reference, so mutating it would corrupt the running model:

**Before:**
```ts
    override getRestoreData() {
        const data = super.getRestoreData();
        data.editorId = "board-view";
        return data;
    }
```
**After:**
```ts
    override getRestoreData() {
        const data = super.getRestoreData();
        data.editorId = "board-view";
        // D9 (EPIC-044): persist ONLY the board-declared restorable subset of sharedState —
        // undeclared/transient state must never bloat the open-pages file. Shallow-clone so
        // we don't mutate the live `state` object `super` returned by reference.
        const s = this.state.get();
        const keys = s.sharedStateRestorableKeys;
        let sharedState: Record<string, unknown> | undefined;
        if (keys?.length && s.sharedState) {
            sharedState = {};
            for (const k of keys) {
                if (Object.prototype.hasOwnProperty.call(s.sharedState, k)) {
                    sharedState[k] = s.sharedState[k];
                }
            }
        }
        data.state = { ...(data.state as Record<string, unknown>), sharedState };
        return data;
    }
```

> No change to `BoardContentEditorModel.getRestoreData()` — it already calls `super.getRestoreData()` then adds `data.host`, so it inherits the pick.

### Step 3 — Renderer bridge (`BoardWebview`)

**File:** `src/renderer/editors/board/BoardWebview.tsx`

3a. Import the new type (line 10 region):
```ts
import type { BoardHostContentMsg, BoardPortInitMsg, BoardStateSyncMsg } from "../../../ipc/board-bridge-channels";
```

3b. **Seed-on-load** — in `handleLoad` (after the content-host `host:content` seed, ~line 161), push the current shared state to the freshly-loaded frame. Uses the *current* seq (a snapshot, not a mutation — do NOT bump):
```ts
        // EPIC-044: seed shared state into the freshly-loaded frame (settles persephone.state.get).
        if (win) {
            const stateMsg: BoardStateSyncMsg = {
                __persephone: "state:sync",
                state: model.state.get().sharedState ?? {},
                seq: model.sharedStateSeq,
            };
            win.postMessage(stateMsg, `board://${host}`);
        }
```
(`win` is the already-declared `iframeRef.current?.contentWindow`.)

3c. **Inbound apply** — in the `onMessage` handler (the `if/else if` chain, ~line 196-204), widen the payload type and add three branches:
```ts
        const onMessage = (e: MessageEvent) => {
            const d = e.data as
                {
                    __persephone?: string; message?: string; busy?: boolean; content?: string;
                    state?: Record<string, unknown>; partial?: Record<string, unknown>;
                    defaults?: Record<string, unknown>; restorableKeys?: string[];
                }
                | undefined;
            // … existing guards + branches …
            } else if (d.__persephone === "board:setState") {
                model.setSharedState(d.state ?? {});
            } else if (d.__persephone === "board:mergeState") {
                model.mergeSharedState(d.partial ?? {});
            } else if (d.__persephone === "board:stateInit") {
                model.initSharedState(d.defaults ?? {}, d.restorableKeys);
            }
        };
```

3d. **Push-on-change** — add a new `useEffect` (mirroring the content-host push at lines 240-259) that pushes `state:sync` to *this* frame whenever `sharedState` changes. Every frame's `BoardWebview` runs this, so all frames (including the writer) receive the authoritative state; the shim's `seq` guard dedupes:
```ts
    // EPIC-044: push shared state into this frame on every change (any frame's set/merge/init).
    // No echo-guard — the shim ignores a state:sync whose seq it has already applied.
    useEffect(() => {
        if (!host) return;
        const unsub = model.state.subscribe(
            (sharedState) => {
                const win = iframeRef.current?.contentWindow;
                if (!win) return;
                const msg: BoardStateSyncMsg = {
                    __persephone: "state:sync",
                    state: (sharedState as Record<string, unknown>) ?? {},
                    seq: model.sharedStateSeq,
                };
                win.postMessage(msg, `board://${host}`);
            },
            (s) => s.sharedState,
        );
        return () => unsub();
    }, [host, model]);
```

### Step 4 — Shim surface (`persephone.state.*`)

**File:** `src/board-shim.ts`

4a. Import the new type (with the other `import type` from `board-bridge-channels`, line 31-40): add `BoardStateSyncMsg`.

4b. Add the replica store + apply function (near the host-content block, ~line 99-127):
```ts
// ── Shared state (EPIC-044) ────────────────────────────────────────────────────
// A pure replica of the Persephone-side shared state, updated ONLY by seq-stamped
// `state:sync` pushes. `get()` settles on the first snapshot (await any time), `onChange`
// fires on each subsequent one. Writes (init/set/merge) post to the host and come back
// as a push — onChange is the source of truth, like React setState.
let sharedStateSettled = false;
let sharedState: Record<string, unknown> = {};
let sharedStateSeq = -1; // seed arrives at seq 0
const sharedStateResolvers: Array<(s: Record<string, unknown>) => void> = [];
const sharedStateCbs: Array<(s: Record<string, unknown>) => void> = [];

function applyStateSync(state: Record<string, unknown>, seq: number): void {
    if (seq <= sharedStateSeq) return; // stale / out-of-order — ignore
    sharedStateSeq = seq;
    sharedState = state;
    if (!sharedStateSettled) {
        sharedStateSettled = true;
        for (const r of sharedStateResolvers) r(state);
        sharedStateResolvers.length = 0;
    }
    for (const cb of sharedStateCbs) {
        try {
            cb(state);
        } catch (e) {
            console.error("persephone.state.onChange callback error:", e);
        }
    }
}
```

4c. Add the inbound listener (a SEPARATE `window` listener, next to the `host:content` one at line 231-237 — the handshake listener early-returns non-`__persephoneInit`):
```ts
// Shared-state push (EPIC-044) — renderer → board. Same trust gate as host:content.
window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as BoardStateSyncMsg | undefined;
    if (!data || data.__persephone !== "state:sync") return;
    if (event.source !== window.parent) return;
    if (hostOriginStrict && event.origin !== boot.hostOrigin) return;
    applyStateSync(data.state ?? {}, typeof data.seq === "number" ? data.seq : 0);
});
```

4d. Add the `state` object to the `window.persephone` literal (alongside `host`, ~line 609-668). A small `postHost` helper avoids repeating the try/catch:
```ts
    /** Shared-state channel (EPIC-044) — available on EVERY board frame (main + secondary),
     *  authoritative on the Persephone side. `get()`/`onChange` read the replica; `init`/`set`/
     *  `merge` post to the host and return void (the change arrives via onChange). */
    state: {
        /** Declare defaults (fill-missing — restored values win) + which keys persist across
         *  restart/reload (opt-in, D9). Typically called once by the main view at boot. */
        init(defaults: Record<string, unknown>, options?: { restorableKeys?: string[] }): void {
            try {
                window.parent.postMessage(
                    { __persephone: "board:stateInit", defaults: defaults ?? {}, restorableKeys: options?.restorableKeys },
                    hostPostTarget,
                );
            } catch { /* parent gone */ }
        },
        /** Current shared state — resolves to the first synced snapshot (await any time). */
        get(): Promise<Record<string, unknown>> {
            if (sharedStateSettled) return Promise.resolve(sharedState);
            return new Promise<Record<string, unknown>>((resolve) => sharedStateResolvers.push(resolve));
        },
        /** Replace the whole shared state. */
        set(next: Record<string, unknown>): void {
            try {
                window.parent.postMessage({ __persephone: "board:setState", state: next ?? {} }, hostPostTarget);
            } catch { /* parent gone */ }
        },
        /** Shallow-merge keys into the shared state. */
        merge(partial: Record<string, unknown>): void {
            try {
                window.parent.postMessage({ __persephone: "board:mergeState", partial: partial ?? {} }, hostPostTarget);
            } catch { /* parent gone */ }
        },
        /** Fire on every shared-state change (from any frame). Returns an unsubscribe. */
        onChange(cb: (state: Record<string, unknown>) => void): () => void {
            sharedStateCbs.push(cb);
            return () => {
                const i = sharedStateCbs.indexOf(cb);
                if (i >= 0) sharedStateCbs.splice(i, 1);
            };
        },
    },
```

## Files NOT changed (so the implementer doesn't chase them)

- `src/main/board-bridge.ts` / the per-board `MessagePort` path — `state.*` rides the **direct** renderer↔iframe channel, exactly like `host.*`. The privileged port is untouched.
- `src/main/board-protocol-service.ts` — the shim is served/injected unchanged; a bigger shim is still one inlined script.
- `PagesPersistenceModel.ts` — `sharedState` (picked) + `sharedStateRestorableKeys` ride the existing `board-view` (`Object.assign`) and content-host (`applyRestoreData`) restore branches automatically. Full restore *verification* is US-855.
- `BoardContentEditorModel.ts` — inherits model methods + the `getRestoreData` pick via `super`.
- Any secondary-view rendering / registry / `persephone.view` code — **US-853**. This task ships the channel; the second frame that exercises cross-frame sync comes later.

## Concerns / open questions

- **C1 — Deviation from the epic's D3/crux (echo-suppress + optimistic apply).** The epic sketched a `lastWriterFrameId` echo-guard with the writer applying optimistically and being suppressed on the round-trip. This task instead uses **round-trip-to-all + a monotonic `seq` guard** (no suppression, no optimistic apply). Rationale in the Design section: there is no feedback loop to suppress, and suppression + seed-on-load introduces an init-clobber ordering hazard that `seq` eliminates cleanly (and `seq` is robust under `merge`, which is exactly why the epic rejected value-equality). Behavior delivered is identical from the board author's view (`onChange` fires with authoritative state); the only difference is the writer sees its own change after a sub-millisecond renderer round-trip instead of synchronously. **Flagging for approval** — if you prefer the literal epic design, say so and I'll revise. I recommend this one.
- **C2 — `get()` right after `set()` returns the pre-write value** (until the round-trip lands). Documented contract: reads reflect host state; treat `onChange` as the source of truth (React-`setState` semantics). Matches the epic's O4 (`get()` mirrors `host.getContent()`).
- **C3 — Single-frame verifiability.** With only the main frame (US-853 adds the second), the round-trip still exercises init→persist→restore and set→onChange. Genuine cross-frame sync is verified in US-853/US-857. Not a gap — just noting what this task can and can't demonstrate alone.

## Acceptance criteria

- `persephone.state` exists on every board frame with `init` / `get` / `set` / `merge` / `onChange`; no boot gate (works on plain and content-host boards).
- From the main board view: `set`/`merge` update the state and fire `onChange` with the authoritative value; `get()` resolves to the first snapshot then the latest cached value.
- `state.init(defaults, { restorableKeys })` fills missing keys from defaults (existing/restored values win) and records the restorable keys.
- **Opt-in persistence:** after `init` declaring `restorableKeys`, only those keys are written to the page descriptor; a board that sets keys **without** declaring them (or never calls `init`) persists nothing. Verified by restarting the app and confirming the restorable subset returns and undeclared keys do not.
- No echo loop, no duplicate `onChange`, and out-of-order/duplicate `state:sync` deliveries are ignored (seq guard).
- `npm run typecheck` and `npx eslint` clean; existing boards (no `state.*` usage) are unaffected.

## Files changed summary

| File | Change |
|------|--------|
| `src/ipc/board-bridge-channels.ts` | Extend `BoardToHostMsg` with `board:setState` / `board:mergeState` / `board:stateInit` (+ `state`/`partial`/`defaults`/`restorableKeys` fields); add `BoardStateSyncMsg` (host→board, seq-stamped). |
| `src/renderer/editors/board/BoardEditorModel.ts` | Add `sharedStateSeq` instance prop + `setSharedState` / `mergeSharedState` / `initSharedState`; extend `getRestoreData()` to persist only the restorable subset of `sharedState` (shallow-clone). |
| `src/renderer/editors/board/BoardWebview.tsx` | Seed `state:sync` on load; handle inbound `board:setState/mergeState/stateInit`; push `state:sync` on every `sharedState` change. |
| `src/board-shim.ts` | Add the shared-state replica + `applyStateSync` + `state:sync` listener + the `persephone.state.*` surface. |
