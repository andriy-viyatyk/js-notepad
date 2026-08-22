# The Rule 4 measurement — procedure

This file *is* the reproducibility guarantee. The BEFORE run happens in US-1019, on the React grid,
before anything is touched; the AFTER run happens in US-1023, months later, against a different
implementation, possibly by a different person, reading only this page. Nothing runs it but a
person — it is a written procedure, not a harness.

## What is being compared, and what the required number is

Three interactions: (a) first paint, (b) one scroll frame, (c) one pointer step of a range drag.
They are **not** equally trustworthy, and the honest ranking came out of the investigation rather
than into it:

| | Verdict |
|---|---|
| **(c) One drag step** | **The epic's required number**, and it is a *count*, not a time. av-grid's own claim is "2 cells marked per pointer move, 0 DOM mutations, identical at row 100 and at row 99,000". The React grid's `FocusModel.updateFocus` recomputes a selection rectangle covering every row from the anchor, so row 99,000 is exactly where the two diverge. A MutationObserver counts this exactly; a millisecond would not. |
| **(a) First paint** | Solid — tens to hundreds of ms, well above noise, and the DOM-node count is an exact integer. One caveat to state in the result: the reading is *open-to-first-cell* and includes CSV parsing, which the port does not touch. It is a constant offset in both readings, not pure paint. |
| **(b) One scroll frame** | **The weakest, and it must not be reported as a frame time.** A settled scroll frame costs ~1 ms against a 16.7 ms vsync budget in either implementation; `requestAnimationFrame` would report 16.7 ms for both and say nothing. Worse, the deterministic counters are expected to come back *nearly identical*, because `uikit/VirtualGrid/renderInfo.ts` is a near-verbatim port of `uikit/RenderGrid/renderInfo.ts` (its own header comment says so) — same overscan, same reuse, same early exits. The only real difference is React reconciliation CPU, which is a timing. Report it as a CPU ratio over 300 steps with a stated error bar. |

## Environment, pinned

- **The BEFORE build is commit `44739cb0`** — the last commit before US-1019, with `av-grid` absent
  from `package.json` and `uikit/DataGrid/` not yet created. This was written down *because* step 1
  had not been run when step 2 landed: the working tree now has the dependency installed, so the
  BEFORE app is no longer what `npm run dist` builds from HEAD. It is still exactly recoverable —
  `git worktree add ../persephone-before 44739cb0 && npm ci && npm run dist` in that worktree — and
  the measurement is only unrecoverable if that commit is lost, which it is not. Do not take the
  BEFORE reading from a tree that has `av-grid` in `package.json`: the `--p-*` bridge and the
  layered stylesheet both change global CSS, and `installPVarBridge()` runs at startup.
- **The production build, never `npm start`.** `scripts/dev.mjs:36-41` builds `mode: "development",
  minify: false`, and React dev-mode overhead is the single largest available distortion on the
  BEFORE side. Run `npm run dist` and measure the installed exe. Record the app version.
- **There is no `StrictMode` anywhere in `src/`** (verified; single `createRoot` at
  `uikit/shared/mount.tsx:135`), so React does not double-render. **Record this as a verified fact**
  so that nobody adds it later and silently invalidates the BEFORE numbers.
- Maximized window, sidebar collapsed, no grouped page, display scaling and Chromium zoom
  untouched. There is no `setBounds` in `api/window.ts`, so the window cannot be pinned
  programmatically — which is why the *measured pixel box* is recorded in the result table instead.
- Fresh app launch for each of (a), (b), (c). Never measure after an edit-reload.

## The instrument

MCP `execute_script`, or a script page. Scripts run **in the renderer with full DOM access** —
`ScriptRunnerBase` executes via `fn.call(context)` with no worker and no sandbox
(`src/renderer/scripting/ScriptRunnerBase.ts:11-15`), and `execute_script` returns captured console
output (`src/renderer/api/mcp/page-commands.ts:111`). So a script can install a `MutationObserver`,
drive the gesture, print numbers, and leave no file behind. Use `execute_script` rather than a
script page so no output page is created and the grid is never resized mid-measurement.

**One selector pair addresses both implementations**, which is what makes the counts portable:

| | React | av-grid |
|---|---|---|
| Root | `[data-type="render-grid"]` (`RenderGrid.tsx:86`) | `[data-type="render-grid"]` (`api.md` DOM contract) |
| Data cell | `.data-cell` + `data-row` / `data-col` (`DataCell.tsx:182-186`) | `[data-type="data-cell"]` + `data-row` / `data-col` |

So every query below uses `'.data-cell, [data-type="data-cell"]'`.

### Zero source changes are required

The primary metrics come from a `MutationObserver`, which needs no instrumentation. This matters:
the BEFORE side is a codebase about to be deleted, and "did you remember to revert the counter"
is a failure mode worth not having.

**Optional, and clearly marked as such in the result:** two temporary lines give the *explanatory*
counters a MutationObserver cannot see (a React re-render that produces identical DOM mutates
nothing). If used, they are recorded as an optional row and reverted:

```tsx
// src/renderer/uikit/AVGrid/AVGrid.tsx — in the RenderGridStyled props (~:297)
onRender={() => { (window as any).__gridCommits = ((window as any).__gridCommits ?? 0) + 1; }}
// and as the first line of the renderCell callback body (~:237)
(window as any).__gridCells = ((window as any).__gridCells ?? 0) + 1;
```

`onRender` is an existing public prop of the React engine (`RenderGridModel.ts:78`, called at
`RenderGrid.tsx:82`) that `AVGrid` simply never forwarded. The AFTER equivalents are free:
`grid.render.stats` carries `paints`, `cellsAppended`, `cellsRemoved`, `lastPaintMs`,
`totalPaintMs` and pool hit/miss — the same object `uikit/VirtualGrid` already exposes
(`VirtualGridView.ts:95-103`, `resetStats()` at `:443`). av-grid keeps no module-level grid
registry, so the port must stash the instance once for a script to reach it:
`(gridEl as any).__avgrid = grid`.

## The fixture

Generated by script, never by hand:

```js
const COLS = 20, ROWS = 100000;
const head = Array.from({ length: COLS }, (_, c) => `c${String(c).padStart(2, "0")}`).join(",");
const lines = [head];
for (let r = 0; r < ROWS; r++) {
    const row = new Array(COLS);
    for (let c = 0; c < COLS; c++) row[c] = `${String(r).padStart(6, "0")}-${String(c).padStart(2, "0")}x`;
    lines.push(row.join(","));
}
await app.fs.write("C:/persephone-bench/bench-100k.grid.csv", lines.join("\n"));
```

100,000 × 20 matches av-grid's own baseline dataset, so its history table stays a sanity check on
order of magnitude. **Every value is exactly 12 characters and every header 3** — that is not
cosmetic. Column widths are content-derived (`uikit/AVGrid/column-width.ts:9-15,38-49`:
`charWidth 8`, `padding 20`, `min 60`, `max 300`), and av-grid derives them from a row scan, so
uniform content makes both implementations land on the same width for all 20 columns. Without it,
the number of columns on screen could drift silently between the two runs.

The `.grid.csv` suffix routes the file to the CSV grid editor
(`editors/base/editor-matchers.ts:53-56`). Open with `app.pages.openFile(...)` and leave it active.

## The gate — run before every measurement, both times

```js
const root = document.querySelector('[data-type="render-grid"]');
const box = [...root.querySelectorAll("*")].find((e) => e.scrollHeight > e.clientHeight + 1);
const cells = root.querySelectorAll('.data-cell, [data-type="data-cell"]');
console.log(JSON.stringify({ vw: box.clientWidth, vh: box.clientHeight, cells: cells.length, dpr: devicePixelRatio }));
```

Both implementations default to `rowHeight: 24` (`RenderGridModel.ts:23`; av-grid's documented
default) and `overscanRow: 0` / `overscanColumn: 0` on the React side, so this *should* match.

**If the visible cell count differs by more than 2 between BEFORE and AFTER, the run is void.**
That single check is the whole defence against "the two implementations put a different number of
rows on screen", which is the trap that would quietly invalidate every other number on the page.
Note that av-grid's own overscan defaults are `4` / `1`; set `overscanRow: 0, overscanColumn: 0`
explicitly on the AFTER run so the two are comparable.

## (a) First paint

Warm the JIT: open and close the fixture **three times** and discard those runs. Then:

```js
const t0 = performance.now();
let firstCell = 0, last = 0, added = 0;
const mo = new MutationObserver((recs) => {
    for (const r of recs) added += r.addedNodes.length;
    last = performance.now();
    if (!firstCell && document.querySelector('.data-cell, [data-type="data-cell"]')) firstCell = last;
});
mo.observe(document.body, { childList: true, subtree: true });
window.__gridCommits = 0; window.__gridCells = 0;
await app.pages.openFile("C:/persephone-bench/bench-100k.grid.csv");
await new Promise((r) => setTimeout(r, 1500));
mo.disconnect();
console.log(JSON.stringify({
    toFirstCell: +(firstCell - t0).toFixed(1),
    toQuiescent: +(last - t0).toFixed(1),
    nodesAdded: added,
    commits: window.__gridCommits, cellRenders: window.__gridCells,
}));
```

Median of 5, after the 3 discards. Treat any single first-paint reading as ±30% — av-grid's own
history records cold-JIT drift of a few ms on this metric.

## (b) One scroll frame

Do not measure fps. Measure total pipeline work over a scripted scroll, un-gated by vsync:

```js
const root = document.querySelector('[data-type="render-grid"]');
const box = [...root.querySelectorAll("*")].find((e) => e.scrollHeight > e.clientHeight + 1);
let muts = 0;
const mo = new MutationObserver((rs) => {
    for (const r of rs) muts += r.addedNodes.length + r.removedNodes.length + (r.type === "attributes" ? 1 : 0);
});

box.scrollTop = 0;
await new Promise((r) => setTimeout(r, 300));           // settle, and prime the cell pool
window.__gridCommits = 0; window.__gridCells = 0;
mo.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
const t0 = performance.now();
for (let i = 0; i < 300; i++) { box.scrollTop += 40; await new Promise((r) => setTimeout(r, 0)); }
const total = performance.now() - t0;
mo.disconnect();
console.log(JSON.stringify({
    msPerStep: +(total / 300).toFixed(3),
    mutationsPerStep: +(muts / 300).toFixed(2),
    commitsPerStep: +(window.__gridCommits / 300).toFixed(2),
    cellRendersPerStep: +(window.__gridCells / 300).toFixed(1),
}));
```

`setTimeout(0)` rather than `requestAnimationFrame` is deliberate: rAF locks the loop to the display
cadence and the measurement degenerates into a clock reading. 300 steps × 40 px ≈ 500 rows, well
inside 100k, and divides per-step noise by 300. Median of 5 runs. The counters should be identical
every run; if they are not, say so in the result rather than averaging them away.

**Cross-check:** one DevTools Performance recording of the same loop; take the Summary panel's
**Scripting** total and divide by 300. (The main window is frameless with the devtools call
commented out in `src/main/open-window.ts`; uncomment locally if the shortcut does not respond.)

## (c) One drag step — the required number

**The two implementations use different input mechanisms and the procedure must not paper over
it.** The React grid drives range selection through **HTML5 drag-and-drop**: cells are `draggable`
with `onDragStart` / `onDragEnter` / `onDragEnd` (`DataCell.tsx:206-211`, handled in
`FocusModel.ts:486,507,529`). av-grid drives it through `pointerdown` + `pointermove` on `window`,
and **coalesces to one focus change per cell**, not per pointer move.

So the comparable unit is **one cell-boundary crossing**. The gesture code differs; the unit does
not. Never compare "events dispatched".

Fixed gesture: anchor at **row 100, column 2**, extend straight down **200 rows**, column fixed.
Then repeat the whole thing anchored at **row 99,000** — that is the flat-cost gate, and it is where
the React grid is expected to diverge, because `updateFocus` recomputes a rectangle spanning every
row from the anchor.

**Primary method — by hand.** Start the MutationObserver, perform the drag with the mouse (slowly,
straight down, ~200 rows), stop the observer, then read the selection's actual row span off the grid
and divide. Exact, works identically in both implementations, and depends on no synthetic-event
assumption:

```js
const root = document.querySelector('[data-type="render-grid"]');
let muts = 0;
const mo = new MutationObserver((rs) => {
    for (const r of rs) muts += r.addedNodes.length + r.removedNodes.length + (r.type === "attributes" ? 1 : 0);
});
mo.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
console.log("drag now — straight down about 200 rows, then run the stop snippet");
// stop snippet: mo.disconnect(); console.log({ muts, rowsCrossed: <read from the grid>, perStep: muts / rowsCrossed });
```

**Optional scripted variant**, if it reproduces the same counts as the hand drag — worth trying,
because it removes the human from the loop, but not worth trusting unverified. BEFORE dispatches a
synthetic HTML5 drag (`DataTransfer` is constructible in Chromium, and the React handlers read only
`dropEffect` and the cell indices): `mousedown` then `dragstart` on the anchor, then `dragenter` per
target cell. AFTER dispatches `pointerdown` on the anchor, then `pointermove` on **`window`** with
real `clientX` / `clientY` from each target cell's `getBoundingClientRect()`, then `pointerup` on
`window`. Scroll between blocks of rows that are not reachable without scrolling.

## Traps, and what defends against each

| Trap | Defence |
|---|---|
| React StrictMode double-render | Verified absent. Recorded as a fact so it is not introduced later. |
| Dev-mode React overhead | Production installer build only. App version recorded. |
| HMR / stale state | Production build has no HMR; fresh launch per measurement. |
| First-run JIT warmup | 3 discarded runs before (a); 300 ms settle and a primed pool before (b) and (c); median of 5. |
| Different row heights ⇒ different rows on screen | The gate records the visible cell count; a delta > 2 voids the run. Set av-grid's overscan to 0/0 to match. |
| Content-derived column widths differing | Uniform 12-char values make both implementations pick one identical width for all 20 columns. Confirmed by the same gate. |
| Different gesture mechanism | The unit is one cell-boundary crossing, same anchor, same column, same count — not one dispatched event. |
| A script creating an output page and resizing the grid | Measure through MCP `execute_script`, which creates no page. |
| Window / zoom / DPI drift months later | `devicePixelRatio`, `vw`, `vh` and the cell count go **in the result table**, not into an assumption. |
| Reading av-grid's own benchmark file as the AFTER number | Don't. `C:\projects\av-grid\tasks\benchmark-results.md` measures a board with synthetic rows, not Persephone's grid editor. Order-of-magnitude sanity check only. |

## The result table

Filled in below for BEFORE in US-1019; the AFTER column is filled in US-1023 and copied to
EPIC-057's closing notes.

| | BEFORE (React `AVGrid` + `RenderGrid`) | AFTER (av-grid) |
|---|---|---|
| Date · app version · machine | | |
| Viewport px · visible cells · DPR | | must match ±2 cells |
| **(a) Open → first data cell**, median of 5 | | |
| (a) DOM nodes added on first paint | | |
| (a) *(optional)* cell renders / React commits | | |
| **(b) Scroll ms per step**, 300 × 40 px, median of 5 | | |
| (b) DevTools Scripting total ÷ 300 | | |
| (b) DOM mutations per step | | |
| **(c) Drag @ row 100 — DOM mutations per cell-step** | | |
| **(c) Drag @ row 99,000 — DOM mutations per cell-step** | | |
| (c) Flat-cost ratio (row 99,000 ÷ row 100) | | |

Reliability line to carry with the table: **(a) solid; (b) a CPU ratio with roughly ±20% error,
because the virtualization geometry is a near-verbatim port and only React reconciliation time
differs; (c) exact counts, and the epic's required number is (c) at row 99,000.**
