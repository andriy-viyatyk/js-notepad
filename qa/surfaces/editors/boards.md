# Surface QA: boards — the board page, Board Info, and the `boards` node

Manual scenarios for the board surfaces. Run through `call` only; do not add or run automated
tests or a test harness for these surfaces. Leave pinned tabs untouched and close only pages the
scenario created. Create test boards in a scratch folder, never inside the repo.

Landed by EPIC-088 (US-1325, US-1326, US-1327).

## Test B.1: Finding a board without knowing a path

**Preparation:** none. This is the scenario the surface exists for — an agent that has never seen
this machine.

**Call:** Read `boards`, then `boards.list()`.

**Verify:** The member list distinguishes the **local** inventory from the **remote** catalog
(`searchPublished`). `list()` returns one record per board root, each carrying `trusted`, and the
`root` value is exactly what `openBoard()` takes. A board with no manifest name simply has **no
`name` key** — not `null`, not `""`. `installed` is present only on catalog-installed boards.

This is the test that fails if enumeration regresses: before EPIC-088 every `boards` member took a
root path and nothing could produce one.

## Test B.2: `list()` is local, offline, and side-effect free

**Preparation:** note which boards are trusted before you start.

**Call:** `boards.list()` several times.

**Verify:** No board is created, trusted, opened or modified. Nothing appears in the tab strip. The
answer does not depend on network availability — update availability comes from the in-memory
catalog, and when that catalog has not loaded `updateAvailable` is **absent** (unknown) rather than
`false`. "There is no update" and "I cannot tell yet" must stay distinguishable.

## Test B.3: A board page reports its own trust state

**Preparation:** a trusted board open as a page.

**Call:** Read `pages[id].editor` on the board page.

**Verify:** `renderState` is `"trusted"`, and `boardRoot`, `boardName`, `frameReady` and `busy` are
present. `busy` is a real `false` on an idle board, not absent.

Then, on a board the user has **not** trusted: `renderState` is `"untrusted"`, `restricted()`
returns text, and `$help` names the Trust-this-Board dialog and the `dialogs[0]` path that answers
it. On a board whose folder is gone, `renderState` is `"not-found"` and it is **not** restricted —
an empty board is not private content.

## Test B.4: Reload, and the honest answer when a board cannot reload

**Preparation:** an open, trusted board page.

**Call:** `pages[id].editor.reload()`.

**Verify:** Returns `{ refreshed: true, pageId, frameReady: true, renderState: "trusted" }`, and it
waits for the frame — a snapshot taken straight afterwards sees the reloaded board, not the stale
one. This is the `board_refresh` replacement path.

Then call `reload()` on an **untrusted** board. It must return **immediately** — no five-second
pause — with `frameReady: false` and the `renderState` that explains why. A reload that blocks and
then claims an unqualified success is the failure this shape exists to prevent.

## Test B.5: Board elements, and the page that must be active

**Preparation:** a trusted board page that is **not** active.

**Call:** Read `elements` on its editor, then activate the page and read them again.

**Verify:** All five are declared either way, but `visible` is honest: everything reads `false`
while the page is inactive, and the four toolbar controls read `true` once it is active.
`board-trust` stays `false` on a trusted board — it lives in the untrusted placeholder. Then
`highlight("board-toolbar-properties")` rings exactly one control and reports `found: true`.

The board switcher is deliberately **not** an element: it is portalled into the overlay layer and a
page-scoped selector could not honestly resolve it.

## Test B.6: Board Info shows only what the board's situation offers

**Preparation:** open Board Info for a locally trusted, non-catalog board (the board toolbar's
properties control).

**Call:** Read `pages[id].editor` and its `elements`.

**Verify:** `mode` is `"properties"`. Only `board-info-open` and `board-info-unregister` report
`visible: true`; every catalog install control (`download`, `register`, `cancel`, `retry`,
`delete`, `uninstall`, `version-install`) is declared and reports `visible: false`. Declaring a
control that *can* appear here and reporting it honestly invisible is the established pattern;
declaring one that could never appear is not.

## Test B.7: The trust boundary holds

**Call:** Look for any member on `boards`, the board facade or the Board Info facade that grants
trust, and try `boards.registerBoard(root)` on an untrusted board.

**Verify:** No member trusts a board directly. `registerBoard` raises the user's trust dialog and
the result carries `attention` naming it. The agent cannot answer it on the user's behalf, and
nothing in `$help` suggests it should.
