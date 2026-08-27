# US-1154 — EPIC-072 / E14 baseline

**Epic:** [EPIC-072](../../epics/EPIC-072.md) — De-React E14, the `Component` arm dies
**Status:** Complete (2026-08-27)

## Goal

Capture the pre-change measurement E14's closing statements are checked against, using instruments
validated before use, and record precisely what could **not** be measured and why.

## Static baseline

Measured with `scratchpad/e14-jsx.mjs` (gen-4 stripper — see §E14-3 of the epic; validated in-file
against three known answers before use). All non-story `.tsx` under `src/renderer/`.

| Figure | Value |
|---|---|
| JSX markers, whole renderer | **566** across 43 files |
| JSX markers, `editors/` | **542** across 36 files |
| Non-story `.tsx`, whole renderer | **85** |
| Non-story `.tsx` holding **zero** JSX | **42** |
| `EditorModule.Component` callers | **2** — `editors/board/index.tsx`, `editors/browser/index.tsx` |
| `@floating-ui/react` importers | **1** — `editors/browser/BrowserTabsPanel.tsx` |

E14's in-scope subsystems:

| Subsystem | Markers | Lines | Files |
|---|---:|---:|---:|
| `editors/browser` | 111 | 1,479 | 8 |
| `editors/board` | 46 | 865 | 7 |
| `ui/sidebar` (`TrustedBoardsListView`, `TrustedToolsListView`) | 6 | 247 | 2 |
| `ui/app/EditorErrorBoundary.tsx` | 4 | 30 | 1 |
| `editors/base/EditorError.tsx` | 2 | 24 | 1 |
| **Total** | **169** | **2,645** | **19** |

## Live baseline

Captured 2026-08-27 against the running dev server via `execute_script` over the renderer's MCP
endpoint. Session state at capture: **5 pages** — one `board-editor` (the `todo` board), one `monaco`,
two `md-view`, one `browser-view` **with 5 tabs**. 5 connected `<webview>` elements, 0 `<iframe>`
(the board page was not the active page, so its iframe was not built).

**The app measures 9 React roots, and 7 of them are the browser.**

| Root chain (`data-name` ancestry) | Count | What it is |
|---|---:|---|
| `(unnamed)` | 1 | `theme/GlobalStyles.tsx` — the Emotion root, Epic F's target |
| `page-editor<page-slot` | 1 | an `EditorModule.Component` arm mount |
| `editor-toolbar` → `browser-toolbar-content` | 1 | the browser's toolbar content |
| `url-input<url-bar<browser-toolbar-content` | 1 | a **nested** root inside the browser toolbar |
| `page-slot<webview-area<browser-body` | **5** | **one per browser tab** |

**The finding: `browser` has a per-open-tab React root term.** Five tabs produced five roots, one for
each `PageManager` `renderPage` callback returning a React fragment (`BrowserView.tsx:598-618`). This
is the same content-dependent shape E13 measured in `tools-hub`'s row-per-root list, and it explains
why E13 could report *one* React root across a seventeen-tab session: no browser page was open. Any
root figure published for a session containing a browser is a figure for that session's tab count.

`board` contributes **one** root when its page is active — its whole React tree is a single
`Component`-arm mount, and `BoardWebview`'s iframe lives inside it natively.

## What could not be measured, and why

Recorded so a later reader does not mistake absence for zero.

1. **The `tools-hub` Registered-boards row-per-root baseline was not re-captured in this tree.** The
   editor is reachable only through `pagesModel.showToolsHubPage()`, which the scripting wrapper does
   not expose (`app.pages` offers `showAboutPage`, `showSettingsPage`, `showMcpInspectorPage`,
   `showBrowserPage` — not the hub), and its two UI entry points are both inside menus
   (`ui/tabs/PageTabsView.ts:310` "Show All…"; the menu-bar Tools & Editors panel via
   `MenuBarView.ts:496`). E13's figure was 26 roots, 24 of them per-row.
   **This does not block US-1155** — see the instrument change below.
2. **Per-page root attribution failed.** `app.pages.showPage(p)` called from a script did not change
   the active page (seven successive calls returned an identical digest), and `offsetParent` reported
   0 for all five connected `<webview>` elements. Per-page attribution needs interactive driving, not
   scripting. The whole-app figures above are stable and were reproduced across four separate calls.
3. **`page-slot` is not a partition.** A browser tab is a `page-slot` nested inside the browser's own
   `page-slot`, so a per-slot digest double-counts every browser tab into its parent. The first digest
   attempt reported 12 slots for 5 pages. Any future per-slot instrument must scope to direct children
   or subtract nested slots — recorded because a naive `querySelectorAll("[data-name=page-slot]")`
   digest looks authoritative and is not.

## Instrument change to the epic's statement 3

The epic originally stated statement 3 as a **difference**: open the tools-hub boards tab at N and
N−1 rows and confirm the root count does not move. That was chosen because E13 established Rule 4 has
no content-independent form on a virtualised surface.

Attempting to capture the baseline showed a better instrument exists. Replace the difference with an
**absolute over a subtree**:

> The `TrustedBoardsListView` / `TrustedToolsListView` subtree contains **zero** `[data-react-root]`
> at any row count.

Zero is content-independent — it holds for 0 rows and for 1,000 — so it needs no baseline, no second
capture at a different row count, and no way to be satisfied by luck. It is strictly stronger than
"the count did not move", which a change from *one root per row* to *one root per list* would also
satisfy. §E14-7 C10 and US-1155's acceptance criteria are updated accordingly, and item 1 above stops
being a blocker.

The general form is worth keeping: **when a count is content-dependent, do not measure its stability —
measure its absence in the subtree that owns it.**

## Acceptance criteria

- [x] Static marker/file figures captured with a validated instrument
- [x] Live root count captured with each root attributed to a named DOM chain
- [x] The per-tab browser term identified and quantified
- [x] Everything unmeasurable recorded with its reason, and separated from things measured as zero
- [x] Statement 3's instrument reconsidered against what the measurement showed

## Files changed

| File | Change |
|---|---|
| `doc/tasks/US-1154-e14-baseline/README.md` | this document |
| `doc/epics/EPIC-072.md` | statement 3 and §E14-7 C10 replaced with the subtree-absolute instrument |
| `scratchpad/e14-jsx.mjs`, `e14-faces.mjs`, `e14-callers.mjs`, `e14-digest.js`, `e14-per-page.js`, `mcp-file.mjs` | instruments (not in the repo) |
