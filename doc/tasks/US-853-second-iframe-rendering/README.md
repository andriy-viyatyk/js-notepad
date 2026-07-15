# US-853: Second-iframe rendering + `board-secondary:*` panel family (+ multi-frame safety)

**Epic:** [EPIC-044 — Board Secondary Views](../../epics/EPIC-044.md)
**Depends on:** US-851 (manifest + `secondaryViewDefs`/`secondaryView` plumbing) ✅, US-852 (`persephone.state.*` bridge) ✅
**Status:** planning — awaiting review

## Goal

Render a board's declared secondary views as real sidebar panels: each `board-secondary:<viewId>`
panel hosts a **second `board://` iframe** (over the *same* `BoardEditorModel`) so the main and
secondary frames stay synchronized through the shared-state channel already built in US-852. Do
this without regressing the single-frame board (automation, job reaping, `board://` routing) — the
main and secondary frames share one `model.id` and one `board://` host, so the shared machinery
needs frame-role guards (`isMain`), per-sink job reaping, and refcounted host registration.

## Background — what already exists (verified 2026-07-15)

US-851 + US-852 landed the model + bridge plumbing; this task is the **render + multi-frame-safety**
seam. The load-bearing pieces:

| Piece | Where | State for US-853 |
|-------|-------|------------------|
| `state.secondaryViewDefs` seeded from manifest; `state.secondaryView = defs.map(d => "board-secondary:" + d.id)` derived | `BoardEditorModel.seedSecondaryViews()` / `deriveSecondaryPanels()` (`BoardEditorModel.ts:326`/`:339`) | **Done (US-851).** Populates the panel-id list `contributesPanels()` reads. |
| `contributesPanels()` = `state.secondaryView?.length > 0` | `EditorModel.ts:182` | **Done.** Board contributes panels once `secondaryView` is non-empty. No change. |
| Panel-id family helpers (`BOARD_SECONDARY_PREFIX`, `boardSecondaryPanelId`, `parseBoardSecondaryPanelId`) | `editors/board/board-secondary.ts` | **Done (US-851).** Consumed by the new component + registration. |
| Sidebar render pipeline: `SecondaryViews.tsx` enumerates `(model, panelId)`, filters by `secondaryViewRegistry.has(panelId)`, resolves icon via `.get(panelId)?.icon`; `LazySecondaryView.tsx` loads the component via `.get(panelId)` | `ui/secondary-views/SecondaryViews.tsx:50`, `LazySecondaryView.tsx:23` | **Extend.** Both consumers go through `has()`/`get()`, so making those prefix-aware covers the whole render path. `LazySecondaryView` must also *forward* `panelId` to the component. |
| Secondary-view registry (`register`, `get`, `has`; `SecondaryViewProps = {model, headerRef, icon?, expanded?}` — no `panelId`) | `ui/secondary-views/secondary-view-registry.ts` | **Extend.** Add `panelId` to `SecondaryViewProps`; add prefix registration so one generic component serves the whole `board-secondary:*` family. |
| `BoardWebview` — the `board://` iframe host: mints per-mount `boardId`, one-time port handshake, `setIframe`/`clearIframe`, `registerBoardFrame`/`unregisterBoardFrame`, `ui.log` reset, content-host + shared-state seed/push, focus | `editors/board/BoardWebview.tsx` | **Extend.** Add `entry`/`isMain`/`view` props; gate the frame-owning calls on `isMain`; build the `src` with `entry` + a `view=` role param. |
| `board://` host→root + host→design registry (`registerBoard`/`unregisterBoard`) — **NOT refcounted** (`hostToRoot.delete(host)` unconditional) | `main/board-protocol-service.ts:267`/`:282` | **Fix.** Two frames share one host (`boardRootToHost` is deterministic); a secondary-panel unmount (or a main reload with panels present) would delete the mapping the surviving frame still needs. Refcount by host. |
| Per-owner job reaping: `disposeBoardPort` reaps the **whole owner** (`reapBoardOwner(entry.ownerId)`) when not busy; `ownerId = model.id` shared across frames | `main/board-bridge.ts:412` | **Fix (D10/B1).** A secondary port disposal must reap only its own sink (`boardId`), never the shared owner. The whole owner is reaped only from `reapBoardOwner` (page close / dispose / crash / quit). |
| CDP frame registration keyed on `${model.id}/${BOARD_CDP_TAB}`, frame disambiguated by the iframe URL's `v=<boardId>` substring | `main/cdp-service.ts:50`/`:85`/`:129`, `ipc/main/controller.ts:449` | **Guard, don't change.** The `v=` matcher stays; a new `view=` query param does **not** collide (`view=main` contains no `v=` token). Only the main frame calls `registerBoardFrame` (D7), so the shared key isn't clobbered. |
| Shared-state channel: `state:sync` seed-on-load + push-on-change (per `BoardWebview`), `board:setState`/`mergeState`/`stateInit` inbound → `model.set/merge/initSharedState`; shim replica + `persephone.state.*` | `BoardWebview.tsx:145`/`:283`, `board-shim.ts:130`/`:710` | **Done (US-852).** Because each `BoardWebview` seeds + pushes to its own frame, a second `BoardWebview` over the same model makes both frames converge automatically. US-853 must **verify** it runs in the secondary frame too (O3), and expose the per-frame **role** via `persephone.view`. |
| `board://` handler serves any board file (keyed on `text/html` MIME, not filename) with full shim/boot/palette + CSP; iframe `src` currently hardcodes `index.html?v=<boardId>` | `main/board-protocol-service.ts:204`, `BoardWebview.tsx:328` | **Done + tiny change.** A second `.html` is served identically; only the `src` builder changes. The shim reads `location.search` at boot — no protocol change for `view=`. |
| `SideBarPanelHeader` (icon/badge/title/actions) | `ui/secondary-views/SideBarPanelHeader.tsx` | **Done.** The new component renders one (title from the decl, icon = the board glyph). |
| Trust gate: `BoardEditorView` renders `BoardWebview` **only** when `boardTrust.useIsTrusted(root)` | `editors/board/BoardEditorView.tsx:41` | **Mirror.** The secondary component must gate trust the same way — otherwise an untrusted board's code would run in the sidebar frame (security hole). |

## Design decisions carried from the epic

- **D4** — second iframe = `BoardWebview` + an `entry` prop (default `index.html`), own `MessagePort` (own `boardId`), **shared model** (hence shared state + content host).
- **D5** — `board-secondary:<viewId>` id family → one generic `BoardSecondaryView` component (prefix-aware registry); `SecondaryViewProps` gains `panelId`.
- **D7** — automation targets the **main frame only**; `isMain` gates `setIframe`/`clearIframe` + `registerBoardFrame`/`unregisterBoardFrame`.
- **D10 / B1** — per-sink job reaping; owner reaped only on model dispose.
- **O3** — `persephone.host.*` + `persephone.state.*` run in **every** frame; verify content-host sync in the secondary frame.
- **O6** — `persephone.view` = `"main"` (main) or the view `id` (secondary), delivered synchronously via a `view=<role>` URL query param the shim reads at boot.

## Implementation plan

### Step 1 — `SecondaryViewProps.panelId` + prefix-aware registry

**File:** `src/renderer/ui/secondary-views/secondary-view-registry.ts`

1a. Add `panelId` to `SecondaryViewProps` (backward-compatible — existing panels ignore it):

```ts
export interface SecondaryViewProps {
    model: EditorOrHost;
    /** The rendered panel's bare panel-id (e.g. "board-secondary:lists"). A component
     *  serving a prefix family (see registerPrefix) reads this to know WHICH view it is;
     *  single-id panels can ignore it. */
    panelId: string;
    headerRef: HTMLDivElement | null;
    icon?: React.ReactNode;
    expanded?: boolean;
}
```

1b. Add a **prefix registration** so one generic component serves an entire id family, and make
`get()`/`has()` fall back to a matching prefix after an exact miss:

```ts
class SecondaryViewRegistry {
    private editors = new Map<string, SecondaryViewDefinition>();
    /** Prefix → definition. A panel id that starts with a registered prefix resolves to
     *  that one definition (the component reads SecondaryViewProps.panelId to specialize). */
    private prefixes = new Map<string, SecondaryViewDefinition>();

    register(definition: SecondaryViewDefinition): void {
        this.editors.set(definition.id, definition);
    }

    /** Register one definition for a whole id family (e.g. "board-secondary:"). */
    registerPrefix(prefix: string, definition: SecondaryViewDefinition): void {
        this.prefixes.set(prefix, definition);
    }

    get(id: string): SecondaryViewDefinition | undefined {
        const exact = this.editors.get(id);
        if (exact) return exact;
        for (const [prefix, def] of this.prefixes) {
            if (id.startsWith(prefix)) return def;
        }
        return undefined;
    }

    has(id: string): boolean {
        return this.get(id) !== undefined;
    }
}
```

*Rationale:* the three consumers the epic named (`SecondaryViews.tsx` `has()` filter + `.get()?.icon`,
`LazySecondaryView.tsx` `.get()` load) all route through `get()`/`has()`, so this one change makes the
whole pipeline prefix-aware. The board family's definition carries no `.icon`, so
`SecondaryViews.tsx:96` falls back to `<EditorIcon editor={model} />` — the board's own glyph.

### Step 2 — forward `panelId` to the component

**File:** `src/renderer/ui/secondary-views/LazySecondaryView.tsx`

The `panelId` is already a prop; forward it to the loaded component (line 39):

```tsx
// before
return <Component model={model} headerRef={headerRef} icon={icon} expanded={expanded} />;
// after
return <Component model={model} panelId={panelId} headerRef={headerRef} icon={icon} expanded={expanded} />;
```

### Step 3 — the generic `BoardSecondaryView` component

**New file:** `src/renderer/editors/board/BoardSecondaryView.tsx`

Renders one board secondary panel: reads its `panelId` → view id → the `secondaryViewDefs` entry,
renders a `SideBarPanelHeader` (title from the decl; icon = the forwarded board glyph) and a
`BoardWebview(isMain=false, entry=def.html ?? "index.html", view=def.id)` over the **same** model.
Trust-gated exactly like `BoardEditorView`.

```tsx
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { SideBarPanelHeader } from "../../ui/secondary-views/SideBarPanelHeader";
import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import { boardTrust } from "../../api/board-trust";
import { parseBoardSecondaryPanelId } from "./board-secondary";
import { BoardWebview } from "./BoardWebview";
import type { BoardEditorModel } from "./BoardEditorModel";

export default function BoardSecondaryView({ model, panelId, headerRef, icon }: SecondaryViewProps) {
    const boardModel = model as unknown as BoardEditorModel;
    const s = boardModel.state.use((st) => ({
        boardRoot: st.boardRoot,
        selectedBoard: st.selectedBoard,
        reloadToken: st.reloadToken,
        defs: st.secondaryViewDefs,
    }));
    const viewId = parseBoardSecondaryPanelId(panelId);
    const def = s.defs?.find((d) => d.id === viewId);
    const selectedRoot = s.selectedBoard ? s.boardRoot : undefined;
    // Trust is per board (EPIC-035) — must be gated here too, or an untrusted board's
    // code would run in this sidebar frame. "" (unresolved) is never trusted.
    const trusted = boardTrust.useIsTrusted(selectedRoot ?? "");

    const title = def?.title ?? viewId ?? "View";

    return (
        <Panel direction="column" flex={1} width="100%" height={0} background="default">
            <SideBarPanelHeader name="board-secondary" headerRef={headerRef} icon={icon} title={title} />
            {selectedRoot && def && trusted ? (
                <BoardWebview
                    // Remount on Reload (matches the main frame) so edited files reload.
                    key={`${viewId}__${s.reloadToken}`}
                    model={boardModel}
                    boardRoot={selectedRoot}
                    entry={def.html ?? "index.html"}
                    view={def.id}
                    isMain={false}
                />
            ) : (
                <Panel flex={1} align="center" justify="center" padding="lg">
                    <Text color="light" align="center" size="sm">
                        {!selectedRoot ? "Board not available" : !trusted ? "Trust the board to view this panel" : "View not found"}
                    </Text>
                </Panel>
            )}
        </Panel>
    );
}
```

*Note on `def.icon`:* the decl's `icon` is an optional string (a board-relative image path). Rendering
it as an image would need the resolved `board://` host, which `BoardWebview` mints internally — so v1
uses the forwarded board glyph (`icon` prop) and the panel **title** honors the decl. Per-view custom
icons are a small follow-up (documented in Concerns C4), not a blocker.

### Step 4 — register the prefix

**File:** `src/renderer/editors/register-editors.ts` (with the other secondary-view registrations)

```ts
import { BOARD_SECONDARY_PREFIX } from "./board/board-secondary";
// ...
secondaryViewRegistry.registerPrefix(BOARD_SECONDARY_PREFIX, {
    id: BOARD_SECONDARY_PREFIX,
    label: "Board View", // never shown — BoardSecondaryView renders its own header from the decl
    loadComponent: () => import("./board/BoardSecondaryView"),
});
```

### Step 5 — `entry` / `isMain` / `view` props on `BoardWebview`

**File:** `src/renderer/editors/board/BoardWebview.tsx`

5a. Widen the signature (all optional; defaults preserve today's single-frame behavior):

```tsx
export function BoardWebview({
    model,
    boardRoot,
    entry = "index.html",
    view = "main",
    isMain = true,
}: {
    model: BoardEditorModel;
    boardRoot: string;
    entry?: string;
    view?: string;
    isMain?: boolean;
}) {
```

5b. **`ui.log` reset (line ~74) — main frame only.** The reset overwrites `ui.log` for the board
lifetime; a secondary frame doing it would wipe the main frame's log. Guard the initial write:

```ts
// before:  await fs.write(fpJoin(boardRoot, "ui.log"), logLine("info", "board loaded")).catch(...)
if (isMain) {
    await fs.write(fpJoin(boardRoot, "ui.log"), logLine("info", "board loaded")).catch(() => {});
}
```
(The secondary frame still `appendLog`s its own `board:error` lines — only the *reset* is main-only.)

5c. **`handleLoad` (line ~145) — gate frame-owning + focus calls on `isMain`.** The port request +
content-host seed + shared-state seed stay for **both** frames (each frame needs its own port and its
own seed — O3); only `registerBoardFrame` and the autofocus are main-only:

```ts
const handleLoad = useCallback(() => {
    if (!host) return;
    void api.requestBoardPort(boardId, host, model.id);          // both frames — each needs a port
    if (isMain) void api.registerBoardFrame(model.id, host, boardId); // D7: main owns CDP registration
    // ... content-host seed (both frames — O3) ...
    // ... shared-state seed (both frames) ...
    if (isMain) focusFrame();                                     // secondary panels don't grab focus
}, [host, boardId, model, focusFrame, isMain]);
```

5d. **`setIframe`/`clearIframe` + `unregisterBoardFrame` (the `onMessage` effect, lines ~182/228) —
main frame only.** The message listener + overlay-dismiss + shared-state/content-host inbound handling
stay for both frames; only the iframe-ref ownership + frame unregister are gated:

```ts
useEffect(() => {
    if (!host) return;
    const el = iframeRef.current;
    if (el && isMain) model.setIframe(el);          // D7: only the main frame is the automation target
    const onMessage = (e: MessageEvent) => { /* unchanged — per-frame via e.source guard */ };
    window.addEventListener("message", onMessage);
    return () => {
        window.removeEventListener("message", onMessage);
        if (el && isMain) model.clearIframe(el);
        if (isMain) void api.unregisterBoardFrame(model.id);
    };
}, [host, model, appendLog, isMain]);
```

5e. **`onFocus` subscription (line ~250) — main frame only.** A secondary frame should not steal focus
when the page activates:

```ts
useEffect(() => {
    if (!isMain) return;
    const sub = pagesModel.onFocus.subscribe(...);
    return () => sub.unsubscribe();
}, [model, focusFrame, isMain]);
```

5f. **iframe `src` (line ~328) — add `entry` + the `view=` role param.** The `v=<boardId>` nonce stays
first so CDP resolution is unaffected; `view=` is appended (URL-encoded):

```tsx
src={`board://${host}/${entry}?v=${boardId}&view=${encodeURIComponent(view)}`}
```
The comment block above `src` (US-796) already explains the `v=` nonce; append a sentence that
`view=` carries the frame role for `persephone.view` and does not affect origin, routing, or the CDP
`v=` matcher.

### Step 6 — expose `persephone.view` in the shim

**File:** `src/board-shim.ts`

Read the `view` query param synchronously at boot (right after `boot`/origin setup) and expose it on
the `persephone` surface. Default `"main"` when absent (defensive — a board loaded without the param
is the main view):

```ts
// ── View role (EPIC-044 / O6) ────────────────────────────────────────────────
// Which view this frame renders: "main" for the board's main iframe, or a secondary
// view's id. Delivered synchronously via the iframe src's `view=` query param, so a
// single HTML file can branch on persephone.view to render every view.
let viewRole = "main";
try {
    const v = new URLSearchParams(location.search).get("view");
    if (v) viewRole = v;
} catch {
    // location unavailable — keep "main"
}
```

Add to the `persephone` object literal (a plain readonly string, alongside `version`):

```ts
(window as unknown as { persephone: unknown }).persephone = {
    version: "1.0.0",
    /** This frame's view role (EPIC-044): "main" for the board's main view, or the id of
     *  a declared secondary view. Branch on it to render every view from one HTML file. */
    view: viewRole,
    // ...
```

### Step 7 — refcount `board://` host registration (multi-frame routing)

**File:** `src/main/board-protocol-service.ts`

Two frames of the same board resolve to the **same** host (`boardRootToHost` is deterministic), so
both call `registerBoard`/`unregisterBoard` for that host. Today `unregisterBoard` deletes the mapping
unconditionally — so the first frame to unmount (a closed secondary panel, or the old main frame during
a Reload remount) tears out the routing the surviving frame still depends on. Refcount by host:

```ts
/** board:// host → live registration count. The host→root/design maps are dropped only
 *  when the last frame using that host unregisters (main + secondary frames share a host). */
const hostRefCount = new Map<string, number>();

export function registerBoard(boardRoot, theme, tokens, hostOrigin): string {
    const root = path.resolve(boardRoot);
    const host = boardRootToHost(root);
    hostToRoot.set(host, root);
    hostToDesign.set(host, { theme, tokens, hostOrigin });
    hostRefCount.set(host, (hostRefCount.get(host) ?? 0) + 1);
    return host;
}

export function unregisterBoard(host: string): void {
    const n = (hostRefCount.get(host) ?? 0) - 1;
    if (n > 0) {
        hostRefCount.set(host, n);
        return; // another frame still uses this host — keep the mapping
    }
    hostRefCount.delete(host);
    hostToRoot.delete(host);
    hostToDesign.delete(host);
}
```

*Safety note:* even during a Reload remount (both frames unmount then remount), no `board://` request
occurs while the refcount is transiently low — a frame requests only after its async `registerBoard`
resolves and sets the iframe `src`. Refcounting removes the single-panel-close hazard where a live
frame loses its routing.

### Step 8 — per-sink job reaping (D10 / B1)

**File:** `src/main/board-bridge.ts`

`disposeBoardPort` currently reaps the **whole owner** for a non-busy board. With main + secondary
frames sharing `ownerId = model.id`, a secondary panel closing would tree-kill the main frame's
processes. Reap only the disposed frame's sink; the whole owner is reaped only from `reapBoardOwner`
(page close / dispose / crash / quit):

```ts
export function disposeBoardPort(boardId: string): void {
    const entry = boardPorts.get(boardId);
    if (!entry) return;
    if (entry.watchdog) { clearTimeout(entry.watchdog); entry.watchdog = undefined; }
    try { entry.port.close(); } catch { /* already closed */ }
    boardPorts.delete(boardId);
    if (!busyOwners.has(entry.ownerId)) {
        // Per-sink reaping (D10/B1): a single frame's port going away reaps only THAT
        // frame's jobs — never the shared owner's OTHER frames. The whole owner is
        // reaped only by reapBoardOwner (model dispose, host crash, quit).
        reapJobsBySinkId(boardId);
        ownerSinks.get(entry.ownerId)?.sinkIds.delete(boardId);
    }
}
```

`reapJobsBySinkId` is already imported (`board-bridge.ts:53`). `reapBoardOwner` is unchanged (it still
loops every sink of the owner). Busy retention is unchanged: a busy owner still keeps every frame's
jobs on port disposal.

## Concerns / open questions

- **C1 — `board://` host registration is not refcounted (RESOLVED in plan, Step 7).** Confirmed against
  `board-protocol-service.ts:282` (`hostToRoot.delete(host)` is unconditional). Not covered by the
  epic's B1/B2/B3. The refcount fix is required for a secondary-panel close (US-853) and for the
  US-854 dynamic-remove path; without it the surviving frame 404s on its next `board://` request.
- **C2 — `ui.log` reset must be main-only (RESOLVED in plan, Step 5b).** Two frames resetting the log
  would race and wipe each other's lines. Only the main frame resets; both append errors.
- **C3 — Trust must be gated in the secondary component (RESOLVED in plan, Step 3).** `BoardWebview`
  assumes the caller checked trust (`BoardEditorView` does). `BoardSecondaryView` mirrors the gate;
  an untrusted board contributes the panel *shell* but does not run its code until trusted.
- **C4 — Per-view custom icon (`SecondaryViewDecl.icon`) deferred.** v1 renders the board's own glyph
  for every secondary panel and honors the decl **title**. Rendering `def.icon` (a board-relative
  image over `board://`) is a small follow-up; it is not required for the coordination this task
  proves and is out of scope here. The field is accepted and persisted (US-851); only the rendering
  is deferred.
- **C5 — Focus.** Secondary frames never autofocus (Step 5c/5e) — the main frame keeps focus so
  frame-level shortcuts (Ctrl+S save) target the main view. A user click into a secondary frame still
  focuses it normally (browser default); only *programmatic* focus is main-only.
- **C6 — Sidebar auto-open / activePanel.** Whether the sidebar opens automatically when a board with
  declared views is opened, and `activePanel` selection, are governed by the existing `PageModel` /
  `SecondaryViewsModel` invariants (mandatory-open + activePanel already handled). US-853 verifies the
  panel *renders*; live attach/detach on `setSecondaryViews` and restore-of-`activePanel` are US-854 /
  US-855. No new sidebar-open logic in this task.
- **C7 — `view=` vs the `v=` CDP nonce (RESOLVED — no collision).** The CDP matcher looks for the
  literal substring `v=<boardId>`; `view=main` contains no `v=` token (it is `…w=main`). Keeping the
  `v=` nonce first in the `src` and appending `view=` is safe. Verified against `cdp-service.ts:92`/`:129`.

## Acceptance criteria

- Opening a board whose manifest declares `secondaryViews` shows one sidebar panel per view, each with
  the declared title and the board's icon, each hosting a live `board://` iframe pointed at that view's
  `html` (or `index.html` when omitted).
- Every frame (main + each secondary) exposes `persephone.view` = `"main"` or the view id; a single
  HTML file can branch on it. A change made via `persephone.state.set/merge` in one frame is observed
  via `onChange` in the others (US-852 sync verified across a real second frame).
- `persephone.host.*` (content-host boards) works in a secondary frame — `getContent`/`onContentChange`
  deliver, and `setContent` from either frame syncs to the other (O3).
- Automation (`browser_*`) still targets the **main** frame only; mounting/unmounting a secondary panel
  never changes or breaks the main frame's automation target or CDP registration (D7).
- Closing / removing a secondary panel never kills the main frame's spawned processes (per-sink reaping,
  Step 8); the main frame keeps serving `board://` requests after a secondary panel unmounts (refcounted
  registration, Step 7).
- A board **Reload** remounts both the main and the secondary frames and they re-synchronize (shared
  state lives on the model, not the frame — survives the remount).
- `npm run typecheck` and `npx eslint` clean on all changed files. Manual A/B: a two-view demo board
  (main + one secondary) coordinates a selection through `persephone.state.*`.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/ui/secondary-views/secondary-view-registry.ts` | Add `panelId` to `SecondaryViewProps`; add `registerPrefix` + prefix fallback in `get()`/`has()`. |
| `src/renderer/ui/secondary-views/LazySecondaryView.tsx` | Forward `panelId` to the loaded component. |
| `src/renderer/editors/board/BoardSecondaryView.tsx` | **New.** Generic `board-secondary:*` panel component (trust-gated header + `BoardWebview(isMain=false)`). |
| `src/renderer/editors/register-editors.ts` | Register the `BOARD_SECONDARY_PREFIX` family → `BoardSecondaryView`. |
| `src/renderer/editors/board/BoardWebview.tsx` | Add `entry`/`view`/`isMain` props; gate `setIframe`/`clearIframe` + `registerBoardFrame`/`unregisterBoardFrame` + `ui.log` reset + focus on `isMain`; build `src` with `entry` + `view=`. |
| `src/board-shim.ts` | Read `view` from `location.search` → expose `persephone.view`. |
| `src/main/board-protocol-service.ts` | Refcount `registerBoard`/`unregisterBoard` by host. |
| `src/main/board-bridge.ts` | `disposeBoardPort` reaps per-sink, not per-owner (D10/B1). |

## Files NOT changed (checked — no change needed)

- `src/renderer/editors/board/board-secondary.ts` — panel-id helpers already complete (US-851).
- `src/renderer/editors/board/board-manifest.ts` — `SecondaryViewDecl` + `readBoardSecondaryViews` done (US-851).
- `src/renderer/editors/board/BoardEditorModel.ts` — `seedSecondaryViews`/`deriveSecondaryPanels`/shared-state mutators done (US-851/US-852). Its `dispose()` already calls `reapBoardOwner` (the per-owner reap) — correct under Step 8.
- `src/renderer/editors/base/EditorModel.ts` — `contributesPanels()` already reads `state.secondaryView`.
- `src/renderer/ui/secondary-views/SecondaryViews.tsx` — no edit; it routes through the now-prefix-aware `has()`/`get()`, and its `.get(panelId)?.icon ?? <EditorIcon>` falls back to the board glyph automatically.
- `src/renderer/ui/secondary-views/panel-key.ts` — composite `<editorId>::board-secondary:<id>` already unique/stable.
- `src/main/cdp-service.ts` / `src/ipc/main/controller.ts` — the `v=` nonce matcher is unaffected by `view=`; main-only `registerBoardFrame` keeps the shared key uncontested.
- `src/ipc/board-bridge-channels.ts` — no new message types (US-853 adds no bridge messages; `view` rides the URL, not a message).
