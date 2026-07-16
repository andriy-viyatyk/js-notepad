# US-860: Board bridge readiness & registry hardening

**Epic:** [EPIC-044 — Board Secondary Views](../../epics/EPIC-044.md) · **Fixes:** US-859 problems #1–#5, #13 · **Status:** implemented + live-verified (2026-07-16)

## Goal

Remove the board-authoring *reliability* bugs from the US-859 inventory: make `persephone.host.*` safe to call at any time (no handshake-ordering trap), make `getContent()` read-your-own-write after `setContent()`, and fix the `customEditorRegistry.refresh()` async race that can leave a board unregistered after a trust change.

## Background

- **Handshake trap (US-859 #1–#3).** `src/board-shim.ts` gates `host.getContent()`/`getLanguage()` on a synchronous `hostEnabled` check (rejects when false) and `host.onContentChange()` silently no-ops — but `hostEnabled` is only set when the `__persephoneInit` handshake message lands (`board-shim.ts` handshake listener). A board reached via the editor-switch runs its `load()` before the handshake → `getContent()` rejects → empty render. The shim already has the right pattern: `getFilePath()` uses a settle-once resolver queue (`filePathSettled`/`filePathResolvers`) and is safe at any time — and it settles on the **same handshake** that sets `hostEnabled`.
- **Stale read-after-write (US-859 #4).** The renderer-side echo-guard (`BoardWebview.tsx` `lastBoardContentRef`) means a frame's own `setContent()` never comes back as a `host:content` push, so the shim's local replica (`hostContent`) goes stale and `getContent()` returns the pre-write value.
- **Registry race (US-859 #13).** `src/renderer/editors/board/custom-editor-registry.ts` `refresh()` is async (awaits one manifest read per trusted root) and fires per trust mutation via `boardTrust.subscribePaths` with no in-flight sequencing. A rapid untrust+trust pair (board folder rename) starts two overlapping refreshes; the stale one can finish last and clobber the correct entry list.

## Implementation plan

### 1. `src/board-shim.ts` — make `host.*` await the handshake

- [ ] Add a `whenHandshake(): Promise<void>` helper next to `settleFilePath` that resolves once the handshake has settled (reuse the existing machinery — `filePathSettled` is set by every handshake, plain boards included):
  ```ts
  function whenHandshake(): Promise<void> {
      if (filePathSettled) return Promise.resolve();
      return new Promise((resolve) => filePathResolvers.push(() => resolve()));
  }
  ```
- [ ] `host.getContent()` — await the handshake before deciding reject-vs-resolve:
  ```ts
  // before
  getContent(): Promise<string> {
      if (!hostEnabled) return Promise.reject(new Error(...));
      if (hostContentSettled) return Promise.resolve(hostContent);
      return new Promise<string>((resolve) => hostContentResolvers.push(resolve));
  }
  // after
  async getContent(): Promise<string> {
      await whenHandshake();
      if (!hostEnabled) throw new Error("persephone.host is available only for content-host boards");
      if (hostContentSettled) return hostContent;
      return new Promise<string>((resolve) => hostContentResolvers.push(resolve));
  }
  ```
- [ ] `host.getLanguage()` — same transformation (await `whenHandshake()` first; keep the resolver-queue path for content not yet settled).
- [ ] `host.onContentChange()` — drop the `hostEnabled` gate entirely; always register the callback and return a real unsubscriber. On a plain board no `host:content` push ever arrives, so the callback simply never fires (harmless, and registration made *before* the handshake now works).
- [ ] Update the `host` JSDoc: `getContent`/`getLanguage` still reject on a plain board, but only **after** the handshake answers the question — calling order no longer matters.

### 2. `src/board-shim.ts` — read-your-own-write in `setContent()`

- [ ] In `host.setContent(content)`, update the local replica before posting, so a subsequent `getContent()` reflects the write while the echo-guard semantics of `onContentChange` stay untouched:
  ```ts
  setContent(content: string): void {
      // Keep the local replica in sync with our own write (the renderer echo-guard
      // never pushes it back), so a read-after-write returns what was written.
      hostContent = content;
      if (!hostContentSettled) {
          hostContentSettled = true;
          for (const r of hostContentResolvers) r(content);
          hostContentResolvers.length = 0;
      }
      ... existing postMessage ...
  }
  ```
  Do **not** fire `hostChangeCbs` here — a frame's own write must not re-fire its own `onContentChange` (the echo-guard contract, EPIC-043 O3).

### 3. `src/renderer/editors/board/custom-editor-registry.ts` — generation-guard `refresh()`

- [ ] Add `private refreshGen = 0;` to `CustomEditorRegistry`. In `refresh()`, capture `const gen = ++this.refreshGen;` on entry and bail before the state write if a newer refresh has started:
  ```ts
  async refresh(): Promise<void> {
      const gen = ++this.refreshGen;
      const roots = boardTrust.listPaths();
      ... build entries ...
      if (gen !== this.refreshGen) return; // a newer refresh superseded this one
      this.state.update((s) => { s.entries = entries; });
  }
  ```
  Note: `roots` is read synchronously at entry, so the *newest* refresh always sees the newest trust list; discarding stale generations is sufficient (no queueing needed).

### 4. `src/renderer/editors/board/BoardContentEditorModel.ts` — `modified` delegation (US-859 #5, added during verification)

- [x] Live testing reproduced US-859 #5 exactly: after a board `setContent()`, `list_pages` reported `modified: false` while the tab dot showed dirty. Root cause: `PageModel.modified` aggregates the raw editor instances' `modified` (`editors.some(e => e.modified)`), but `BoardContentEditorModel`'s dirty lives on its composed `TextFileModel` host — the editor's own `state.modified` is never set. (The tab strip was right because it reads `page.mainEditor`, which unwraps to the host.) Fix: `override get modified()` returning `this._host?.modified ?? false`.

## Implementation notes (2026-07-16)

Implemented as planned, plus the #5 fix above. Live-verified against the running dev build with a throwaway content-host board (scratchpad `us860-test`, mask `*.us860.txt`) written the previously-broken "naive" way — `host.onContentChange()` registered synchronously at script top and `host.getContent()` awaited first thing, **no ready-gate**:

- Rendered `CONTENT[hello\n]` (getContent resolved pre-handshake-call ✓), `RW-OK` (read-your-own-write ✓), and the early-registered `onContentChange` fired on the seed push but **not** for the board's own write (echo-guard intact ✓). Confirmed visually via `browser_take_screenshot` (per the new self-verification guidance).
- `list_pages` reported `modified: true` after the board's `setContent` (#5 ✓); the write round-tripped to the content host (`page.content` showed it).
- The scratch board + its trust entries were removed after the test.

## Concerns

- **`setContent()` before the first snapshot** settles the replica with the written value; a later initial `host:content` push then fires `onContentChange` (as a change) and overwrites. This is the pre-existing push-ordering race, unchanged in practice — boards write only after reading. Accepted.
- The Todo board's `await persephone.getFilePath()` ready-gate workaround remains valid (now redundant); it is left in place, its `CLAUDE.md` gotcha rewritten.

## Acceptance criteria

- A content-host board whose `load()` calls `persephone.host.getContent()` / `onContentChange()` **first thing, with no ready-gate**, renders correctly when reached via the editor-switch (the US-857 empty-render trap is gone).
- `host.getContent()` immediately after `host.setContent(x)` resolves to `x` in the writing frame; the other frame still receives `onContentChange`.
- On a plain (non-content-host) board, `getContent()`/`getLanguage()` still reject with the same error message; `onContentChange` registers but never fires.
- Renaming a trusted board folder (untrust+trust back-to-back) leaves the board correctly registered in `customEditorRegistry` without a manual extra `refresh()`.

## Files changed

| File | Change |
|------|--------|
| `src/board-shim.ts` | `whenHandshake()` helper; `host.getContent`/`getLanguage` await the handshake; `onContentChange` gate removed; `setContent` updates the local replica |
| `src/renderer/editors/board/custom-editor-registry.ts` | Generation counter guard in `refresh()` |
| `src/renderer/editors/board/BoardContentEditorModel.ts` | `override get modified()` → host's dirty flag (US-859 #5) |

**No changes needed:** `src/renderer/editors/board/BoardWebview.tsx` (echo-guard stays), `src/main/board-bridge.ts`, `src/ipc/board-bridge-channels.ts` (no wire change from this task — US-861 adds `board:log`), `board-trust.ts`, `PageModel.ts` (the aggregate getter is correct once the editor reports its host's flag).
