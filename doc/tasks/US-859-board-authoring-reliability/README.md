# US-859: Board authoring reliability & predictability for agents

**Epic:** [EPIC-044 — Board Secondary Views](../../epics/EPIC-044.md) · **Status:** open (problem inventory — to be triaged by the user)

## Goal

Make **content-host board authoring predictable and reliable for an agent**. During US-857 (the Todo board) the agent hit a series of undocumented / inconsistent behaviors and debugging blind spots that made a straightforward board take multiple diagnose-fix cycles. This task is a **problem inventory** — a checklist of everything that went wrong or was surprising — for the user to investigate and fix separately. No deep investigation here; just the list, with pointers where known.

> Context: the board itself works. These are the friction points that made getting there harder than it should be. Fixing them should let a future agent author a content-host board with secondary views on the first try.

## Problems

### A. Bridge readiness — the big one (reliability)

- [ ] **1. `persephone.host.*` is unusable before the handshake, with no signal and no await.** `host.getContent()` / `getLanguage()` **reject** and `host.onContentChange()` **silently no-ops (doesn't register the callback)** if called before the board handshake sets `hostEnabled`. A board reached via the **editor-switch** (not default file-open) runs its `load()` before the handshake arrives → `getContent()` rejects → the board renders **empty** with no error surfaced. This was the single biggest time sink. Pointer: `src/board-shim.ts` (`hostEnabled` ~L119; handshake handler L253–270; `host.getContent` reject L685–693; `onContentChange` no-op L709–716).
- [ ] **2. Inconsistent readiness semantics across the same bridge.** `getFilePath()` **awaits** the handshake (settle-once + await-any-time, resolves even on plain boards) — but `getContent()`/`getLanguage()` reject and `onContentChange()` no-ops. Same bridge, same handshake, three different behaviors. The only reason the fix works is that `getFilePath()` happens to resolve at the same handshake that sets `hostEnabled`, so `await persephone.getFilePath()` first is a *coincidental* ready-gate. Pointer: `getFilePath` awaits at `src/board-shim.ts:676`.
- [ ] **3. No explicit "host ready" primitive.** There is no `persephone.host.ready()` / `whenReady()` or documented ordering rule. The working pattern (`await getFilePath()` before any `host.*`) is non-obvious and undiscoverable — the agent found it only by instrumenting the shim. A first-class readiness await (or making `host.*` await the handshake like `getFilePath`) would remove the whole class of bug.

### B. Content API footguns

- [ ] **4. `getContent()` returns stale content on the *writing* frame after `setContent()`.** The echo-guard (a frame's own `setContent` doesn't re-fire its own `onContentChange`) also means the writer's local replica is **not** updated — so `getContent()` right after `setContent()` returns the pre-write value. Correct only if the board keeps its own in-memory source of truth. By design, but an undocumented footgun. Pointer: echo-guard in `src/renderer/editors/board/BoardWebview.tsx` push + `src/main/board-bridge.ts`.
- [ ] **5. The `modified` dirty flag looked wrong.** `list_pages` reported `modified: false` immediately after a `setContent()` that *did* update the content host (the other frame's replica showed the new content). Unclear whether the flag is stale, delayed, or the board content-host marks dirty differently — made it hard to tell if a write had propagated. Pointer: dirty tracking on the content-host board model / `list_pages` handler.

### C. Documentation gaps

- [ ] **6. No canonical content-host + secondary-views example.** The Demo board demonstrates secondary views + `persephone.state.*` but is **not** a content-host board (no `host.*`); drawio-viewer is content-host but has **no** secondary views (and, being default-open, never hits problem #1). Nothing shows the two together — the exact shape US-857 needed. A combined reference (or promoting the Todo board to one) would help.
- [ ] **7. The guides don't document the ordering / footguns above.** `read_guide("boards")`, `assets/board-template/CLAUDE.md`, and the Demo board don't mention: the handshake-before-`host.*` ordering (#1–#3), the stale-read-after-write (#4), or that `onContentChange` won't register early. An agent following the docs verbatim writes the buggy version.

### D. Debugging & automation friction

- [ ] **8. No console/error visibility into a board frame.** `execute_script` doesn't capture the board frame's `console.*`, and uncaught board errors aren't surfaced to the agent (only `ui.log` gets "board loaded" + CSP violations). Debugging required manually instrumenting `window.__debug` globals and reading them back via `browser_evaluate` — the agent is otherwise flying blind. A way to see a board's console/errors (route to `ui.log` or an MCP surface) would cut debug time sharply.
- [ ] **9. Combined multi-frame snapshot is confusing.** `browser_snapshot` of a board page returns **both** the main and secondary frames merged into one accessibility tree, interleaved, with no frame boundary — hard to tell which frame rendered what. Inspecting a single frame cleanly requires `browser_tabs select` first. A per-frame snapshot or a frame delimiter would help.
- [ ] **10. `board_refresh` → snapshot race.** Right after `board_refresh`, a snapshot sometimes showed stale / pre-refresh frame content; had to insert a wait. No deterministic "refresh complete / frame re-rendered" signal.
- [ ] **11. `browser_click` on a text-node ref throws.** Clicking a ref that resolved to a `StaticText` failed with `TypeError: this.scrollIntoView is not a function`; had to fall back to a CSS selector / `evaluate`. Minor automation-robustness gap. Pointer: `src/renderer/automation/input.ts` / `ref.ts`.
- [ ] **12. AX-snapshot + DOM-attribute inspection masks visual/layout bugs — the agent declared the UI correct while it was visibly broken.** Two rendering bugs (a secondary frame showing the wrong role because `.root { display:flex }` overrode `[hidden]`; an item title collapsed to `height:0`) were **invisible** to `browser_snapshot` (the elements are in the accessibility tree regardless of being 0-height / below-the-fold) and to `browser_evaluate` checks of `el.hidden` (the *attribute* was correctly `true` while the element was still displayed). The agent reported "verified working"; only the **user's rendered screenshot** revealed the breakage. Compounded by problem #9 (both frames merged into one AX tree, so a frame rendering the wrong view looked plausible). Lesson / possible fixes: an agent should take an actual **screenshot** to validate board UI, not rely on the AX tree + DOM attributes alone; and/or the board guides should warn that `[hidden]` loses to any explicit `display` and recommend `field-sizing: content` for auto-growing textareas. This is the reason the reported "end-to-end verified" was wrong — a real reliability/observability gap for agent self-verification.

### E. Registry / trust

- [ ] **13. `customEditorRegistry.refresh()` has an async race — a board can fail to register after a trust change.** `refresh()` is `async` (awaits a manifest read per trusted root) and is fired per trust mutation via the `subscribePaths` subscription, with **no in-flight sequencing**. A rapid untrust+trust pair (e.g. **renaming** a trusted board's folder) fires two overlapping refreshes; the one started *earlier* (with the stale root list) can finish *last* and clobber the correct result, leaving the renamed board **unregistered** until a later manual `refresh()`. Hit directly while renaming `todo-board` → `todo`: the board dropped out of the custom-editor list and only reappeared after an extra `refresh()` with no pending mutations. Pointer: `src/renderer/editors/board/custom-editor-registry.ts` (`refresh()` + the `boardTrust.subscribePaths` handler). Fix: sequence/debounce refreshes or guard with a generation counter so a stale refresh can't overwrite a newer one.
- [ ] **14. No supported "rename/move a trusted board" flow.** Trust is keyed by absolute path, so renaming a board folder silently breaks its trust + custom-editor registration (the old path lingers in `trustedBoards.txt`, the new path is untrusted). There's no first-class rename that migrates trust. Worked around here by scripting `boardTrust.untrust(old)` + `trust(new)` (which also bypasses the normal trust-consent dialog). Pointer: `src/renderer/api/board-trust.ts`.

## Acceptance criteria

- Each problem above is triaged: fixed, or consciously deferred with a note. Problems #1–#3 (bridge readiness) are the priority — they are the ones that make board authoring *unreliable* rather than merely inconvenient.
- After the fixes, an agent can author a content-host board with secondary views following only `read_guide("boards")` + the board-template guide, without hitting the empty-render trap or needing to instrument the shim.

## Notes

- This inventory is from a single board (US-857); the list is observational, not exhaustive. The user will investigate each item separately.
- Related design context: EPIC-043 (content-host boards, `persephone.host.*`), EPIC-044 (secondary views, `persephone.state.*`), US-858 (frames-as-tabs automation).
