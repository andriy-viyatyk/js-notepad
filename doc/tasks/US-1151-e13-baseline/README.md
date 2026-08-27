# US-1151 — EPIC-071 (E13) baseline and closing measurement

**Epic:** [EPIC-071](../../epics/EPIC-071.md)
**Status:** baseline captured 2026-08-27; closing measurement pending

This is the pre-change record the epic's closing property (§E13-3, §E13-4) is checked against. It is
captured before any E13 task lands so a silent conversion regression has something to fail against —
E11's finding that *a DOM baseline is the only instrument that sees a silent conversion regression*.

**Content discipline:** every digest below records **structure only** — element counts, tag counts,
`data-name` counts, React-root and slot counts. No `textContent` was read from any page, and the
Evergreen note/link pages and Mneme roots were never activated or opened. This is the same discipline
US-1133 applied in E12.

---

## Whole-app baseline (the user's real session)

Measured on the session as found, 7 pages open, 4 with a resolved editor:

| Instrument | Value |
|---|---:|
| `[data-react-root]` | **4** |
| `[data-part="react-slot"]` | 3 |
| `[data-name="page-slot"]` | 7 |
| `[data-name="page-editor"]` | 4 |

Root identities: 1 × `GlobalStyles` (chain `div < div < body < html`), 3 × `MonacoBody`
(chain `span < span < text-chrome-root`, first child `DIV[monaco-body]`).

**This is the figure §E13-3's closing property is measured against: 4 → 1 on this session shape.**

### An activation effect worth recording

Opening and activating previously-inactive pages took the count 4 → 8 without any code change. The
extra roots were 2 × `board-host`, 1 × `board-secondary-content` and 1 × `text-chrome-footer` — all
belonging to pages that were already open but had never been activated, so their editors had never
instantiated. **This is not a leak**; it is E12's finding restated from the other direction: an
inactive page costs nothing, so *activating* pages raises the count. It means a roots figure must
state not only which pages are open but **which have been activated** — a sharper form of E11's rule
that a roots figure without the open-page list is not a measurement. The closing measurement must
reproduce the activation set, not just the page set.

### Session artifacts left behind

Two `untitled` pages exist that the baseline run created; one `closePage` call did not take effect and
the two are indistinguishable from a pre-existing empty page by any property available to the script
(no file, unmodified, unpinned). **They were deliberately left rather than guessed at** — closing a
page that might be the user's is worse than leaving an empty tab. Both are empty and unmodified.
The utility pages this baseline opened (`about`, `settings`, `mcp-inspector`, `link-editor`) were also
left open, because the per-task verification needs them; they are singletons and trivially closable at
epic close.

---

## Per-editor baselines

Captured with each editor open and **visible** (an inactive page measures 0×0 and 0 roots), reading
the visible `[data-name="page-editor"]` host.

### `monaco` — `addEditorPage("monaco")`

| | |
|---|---:|
| elements | 115 |
| **React roots** | **1** |
| react-slots | 1 |
| svgs / empty | 1 / 0 |
| buttons | 2 |

`data-name`s: `text-chrome-root`, `text-chrome-top`, `page-nav-panel`, **`monaco-body`**,
`text-chrome-footer`, `text-toggle-script`.
Tags: `DIV` 81, `SPAN` 23, `BUTTON` 2, `svg` 1 (`g`/`rect`/`line`/`path` 1 each), `TEXTAREA` 1,
`CANVAS` 3.

The one root is `MonacoBody`. `CANVAS` 3 and `TEXTAREA` 1 are Monaco's own internals and must survive
the conversion unchanged — they are the check that Monaco itself still mounted.

### `about` — `showAboutPage()`

| | |
|---|---:|
| elements | 54 |
| **React roots** | **1** |
| react-slots | 0 |
| svgs / empty | 1 / 0 |
| buttons | 3 |

`data-name`s: `about-root`, `about-content`, `about-check-updates`, `about-github`,
`about-report-issue`.
Tags: `DIV` 23, `SPAN` 10, `BUTTON` 3, `svg` 1 (`g` 1, `circle` 5, `path` 8, `line` 3).

The three buttons and the five `about-*` markers are the whole acceptance surface.

### `settings` — `showSettingsPage()`

| | |
|---|---:|
| elements | 555 |
| **React roots** | **1** |
| react-slots | 0 |
| svgs / empty | 14 / 0 |
| buttons | 24 |
| inputs | 7 |

`data-name`s: `settings-root`, `settings-content`, `settings-view-file`.
Tags: `DIV` 267, `SPAN` 165, `LABEL` 5, `BUTTON` 24, `INPUT` 7, `svg` 14, `g` 26, `rect` 5, `path` 12,
`line` 10, `circle` 2, `ellipse` 3, `H1` 1, `PRE` 1, `CODE` 1, `BR` 12.

**24 buttons, 7 inputs, 14 non-empty svgs, 5 `LABEL`s** — this is the densest surface in the cut, and
the one where E12's *an unresolvable icon renders blank instead of failing* hazard would show up as
`emptySvgs > 0`. `BR` 12 is worth noting: it is markup the conversion must reproduce, and a native
view that drops it changes the layout silently.

### `mcp-inspector` — `showMcpInspectorPage()`

| | |
|---|---:|
| elements | 58 |
| **React roots** | **2** |
| react-slots | 1 |
| svgs / empty | 3 / 0 |
| buttons | 4 |
| inputs | 3 |

`data-name`s: `mcp-inspector-root`, **`editor-toolbar`**, `mcp-connection-bar`,
`mcp-saved-connections`, `mcp-transport`, `mcp-url`, `mcp-connect`, `mcp-body`.
Tags: `DIV` 30, `SPAN` 9, `INPUT` 3, `BUTTON` 4, `svg` 3, `g` 5, `path` 2, `line` 2.

**Two roots, not one** — this is the only editor in the cut that costs two, and the reason is visible
in the `data-name` list: `editor-toolbar` is `EditorToolbar`'s native view, and the React body feeds it
through `fillSlot`, nesting a React root inside the editor's own root. That is E11's two-way-boundary
mechanism, and it means **converting `mcp-inspector` removes 2 roots, not 1.** Measured disconnected
(no MCP server attached), so this digest is the connection-bar state only; the tools/resources/prompts
panels are not in it.

### `link-editor` — `addEditorPage("link-view", "json", "untitled.link.json")`

| | |
|---|---:|
| elements | 55 |
| **React roots** | **1** |
| react-slots | 1 |
| svgs / empty | 2 / 0 |
| buttons | 5 |
| inputs | 1 |

`data-name`s: `text-chrome-root`, `text-chrome-top`, `link-editor-breadcrumb-categories`,
`link-editor-add`, `link-editor-view-mode`, `link-editor-search`, `page-editor-switch`,
`link-editor-root`, `link-editor-center`, `link-editor-empty`, `text-chrome-footer`,
`text-toggle-script`.
Tags: `DIV` 15, `SPAN` 28, `BUTTON` 5, `svg` 2, `g` 2, `path` 2, `INPUT` 1.

Captured **empty** (a new untitled link file), so `link-editor-empty` is present and the list/tiles
bodies are not. A conversion check on a populated link file is still needed and is recorded as a gap
below. Note `link-editor-breadcrumb-categories` — that is the `Breadcrumb` face this epic collects,
reached through `createElement` in `index.ts`.

---

### `tools-hub` — captured via the tab-strip route, per tab

Opened through the `page-tabs-add` split-button caret → "Show All…" (`ui/tabs/PageTabsView.ts:310`),
then each tab clicked in turn. **This editor must be measured per tab; a single digest is not a
baseline for it.**

| Tab | elements | React roots | react-slots | svgs / empty | buttons | inputs | key `data-name`s |
|---|---:|---:|---:|---:|---:|---:|---|
| Built-in | 347 | **1** | 0 | 39 / 0 | 24 | 0 | `tools-hub-tabs`, `tools-builtin-list` |
| Registered boards | 696 | **26** | 25 | 48 / 0 | 37 | 0 | `tools-hub-tabs`, `sidebar-trusted-boards-list` |
| Search boards | 394 | **1** | 0 | 24 / 0 | 21 | 1 | `tools-hub-tabs`, `search-boards-filter`, `search-boards-refresh` |
| Tools | 180 | **2** | 1 | 18 / 0 | 13 | 0 | `tools-hub-tabs`, `sidebar-trusted-tools-list` |

`emptySvgs` is **0** on all four tabs. The "Registered boards" 26 is **content- and viewport-dependent**
(24 of them are one `fillSlot` root per rendered row, measured with 16 boards and 88 tree rows), so it
must never be used as an absolute expected value — see the chain-based criterion in EPIC-071 §E13-11.

## Gaps — recorded rather than assumed

Per the epic's standing discipline (E9 on `svg-view`, E10 on `git-tree`): an editor that could not be
opened programmatically is recorded as **unmeasured**, never assumed.

| Editor | Why unmeasured | Route for its own task |
|---|---|---|
| ~~`tools-hub`~~ | **Resolved.** `app.pages.showToolsHubPage` is not exposed on the scripting wrapper, but the UI route works: `page-tabs-add` caret → "Show All…". Baseline captured above | — |
| `mneme-config` | Same — `showMnemeConfigPage` exists at `PagesModel.ts:271` but is not on the script wrapper | Sidebar, when US-1145 runs |
| `mneme-root` | **No dedicated opener exists at all**, on the wrapper or on `PagesModel`. It is reached from the Mneme tree | Sidebar Mneme tree, when US-1145 runs. Its roots are the user's real Mneme roots, so its digest must stay structure-only |

**A fourth gap, and it is an instrument finding:** `addEditorPage(editorId)` still does not force the
editor. `addEditorPage("link-view")` — without the language and filename arguments — produced a page
whose digest was **`monaco-body`**, i.e. Monaco. That is E9's `svg-view` finding recurring exactly, one
epic after E9 "fixed the instrument" by having it report the resolved editor id. What actually caught it
here was the **digest**, not the resolved id: `page.currentEditorId` read back `undefined` through the
script wrapper, so the `matched` flag was silently useless while the `data-name` list was decisive.
**Generalised for the closing measurement: identify an editor by the markers it renders, not by an id
the API reports.** A digest cannot lie about which editor produced it.

Six of the eight editors in the cut are **standalone** editors that reject `addEditorPage` outright
with a clear error naming the dedicated method — a good error, and the reason the gap table above is
short rather than a list of silent mis-measurements.

---

## Closing measurement checklist

Run at US-1151, reproducing the activation set, not just the page set:

- [ ] Whole-app roots on the baseline session shape: expect **1** (`GlobalStyles`)
- [ ] `monaco`: 1 → **0** roots; `CANVAS` 3 and `TEXTAREA` 1 still present; the six `data-name`s unchanged
- [ ] `about`: 1 → **0**; 3 buttons, 5 `about-*` markers unchanged
- [ ] `settings`: 1 → **0**; 24 buttons, 7 inputs, 14 svgs, **0 empty svgs**, `BR` 12 preserved
- [ ] `mcp-inspector`: **2 → 0** (both the body root and the `fillSlot` root inside `editor-toolbar`)
- [ ] `link-editor`: 1 → **0**; all twelve `data-name`s unchanged; also verified on a **populated** link file
- [ ] `tools-hub`, `mneme-config`, `mneme-root`: baseline and closing digest both captured via the sidebar
- [ ] `emptySvgs` is **0** on every digest — E12's blank-icon hazard
- [ ] `Component` arm: exactly 2 callers, `browser` and `board`
- [ ] The six collected faces are gone and the fifteen dead faces are swept

---

## Closing measurement — 2026-08-27

All nine implementation tasks landed. `npm run typecheck`, `npm run lint` and `npm run build-prod`
re-run independently after the final task: all clean.

### The four closing properties

| # | Property | Result |
|---|---|:-:|
| 1 | `EditorModule.Component` has exactly **two** callers, both `<webview>` editors | **`board`, `browser`** ✔ |
| 2 | Six freed faces removed, three already-dead swept | **2 deleted outright, 7 type-relocated to `.ts`** ✔ |
| 3 | One React root on the everyday path | **1** (`GlobalStyles`) across **17 open tabs** ✔ |
| 4 | The converted bodies produce no React element | zero React imports/JSX/`createElement` in all eight editor folders ✔ |

### Static figures

| Instrument | At open | At close |
|---|---:|---:|
| `EditorModule.Component` callers | 8 | **2** |
| `editors/` JSX markers | 1,337 | **535** |
| `editors/` non-story `.tsx` | 76 | **36** |
| `uikit/` non-story `.tsx` | 51 | **39** |
| renderer non-story `.tsx` | 136 | **85** |
| `uikit/` JSX markers | 12 | 13 |
| `ui/` JSX markers | 10 | 10 |
| `components/` JSX markers | 0 | 0 |
| `theme/` JSX markers | 1 | 1 |

Diff: **82 files changed, +673 / −6,201**, plus 56 new files and 52 deletions.

### Live per-editor results

| Editor | roots before | after | parity checks |
|---|---:|---:|---|
| `monaco` | 1 | **0** | `CANVAS` 3, `TEXTAREA` 1, six markers, all seven typed-queue ops exercised live |
| `about` | 1 | **0** | 3 buttons, 5 markers, SVG geometry identical |
| `tools-hub` Built-in | 1 | **0** | 24 buttons |
| `tools-hub` Registered boards | 26 | **25** | only the `@page-editor` root removed; 24 survivors are per-row shell roots |
| `tools-hub` Search boards | 1 | **0** | 21 buttons |
| `tools-hub` Tools | 2 | **1** | 13 buttons |
| `mneme-config` | 1 | **0** | 14 buttons, `editor-toolbar` present, 18 markers |
| `mneme-root` | — | — | **not verified — policy** (renders customer data) |
| `settings` | 1 | **0** | `INPUT` 7, `LABEL` 5, `BR` 12, `svg` 14, SVG geometry identical, `SPAN` 165; **`BUTTON` 24 → 25 unattributed** |
| `mcp-inspector` disconnected | 2 | **0** | 4 buttons, 3 inputs, 8 markers |
| `mcp-inspector` connected | — | **0** | 33 tool rows against a live MCP server; capability-driven panel set correct |
| `link-editor` populated | 1 | **0** | 188 elements, 16 buttons, real list rows; **tiles mode not exercised** |
| Storybook | 1 | 1 | expected — `LivePreview`'s root for the two permanent React stories |

`emptySvgs` is **0** on every digest taken, and **0 app-wide**.

### Storybook integrity

US-1149 touched nine face modules that stories sit beside, so this was checked rather than assumed.
`storyRegistry.ts` is **unchanged**; 45 story files remain; the Storybook editor renders with all nine
of its `storybook-*` markers. Seven of the nine touched faces' stories were rendered directly
(`Divider`, `ProgressBar`, `TruncatedText`, `Breadcrumb`, `TagsInput`, `DateInput`, `Tooltip`) — all
show visible content with 0 empty SVGs. The other two are not separate rows: `ListItem` has no story of
its own, and `Tree.story.ts:307` declares `section: "Lists"`, so it sits under a section header rather
than at top level. **The conclusive check is that `tsc --noEmit` passes**: a story importing a deleted
export could not compile, and `Tree.story.ts` imports `TreeView` and `TreeProps` from `./types`, never
the deleted `Tree.tsx`.
