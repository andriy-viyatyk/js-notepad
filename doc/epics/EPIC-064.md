# EPIC-064 — De-React Epic E6: delete the `ReactNode` arm from the uikit icon contract

**Status:** Complete
**Created:** 2026-08-25
**Completed:** 2026-08-25
**Roadmap:** [de-react.md](../de-react.md) §7 "Epic E"
**Predecessors:** [EPIC-059](EPIC-059.md) (E1 — seams), [EPIC-060](EPIC-060.md) (E2 — editor bodies),
[EPIC-061](EPIC-061.md) (E3 — the Monaco wrapper), [EPIC-062](completed.md) (E4 — the `RenderGrid`
cell contract), [EPIC-063](completed.md) (E5 — the secondary-view registry)

---

## The closing property

`IconRef`'s `ReactNode` member **is deleted from the tree**, and with it the only reason the app
builds a React root to show an SVG. Concretely:

- `uikit/shared/slots.ts` narrows to `IconRef = IconName | Node`, and `renderIcon()` — whose return
  type is `ReactNode` — is **deleted**. `createIconElement()`, already in the same file with 106 call
  sites, is the only icon producer left.
  **Corrected at close:** this bullet originally also promised `SlotText = string | Node`. It does not
  narrow — see §E6-11.
- `uikit/Button/ButtonView.tsx` and `uikit/IconButton/IconButtonView.tsx` lose their ungated
  `renderIcon` branches. Both already take a DOM path for a string icon name; the React branch is
  what remains.
- Every icon *value* in the app is a registry name or a DOM `Node`. The 142 `icon={<XIcon />}` JSX
  sites and the 63 `React.createElement(XIcon, …)` sites become `icon="x"` or
  `createIconElement("x", props)`.
- `components/icons/icon-elements.ts` drops the `{ kind: "react"; value: ReactNode }` member of
  `EditorIconElement` — the arm E5 left behind when it added `EditorModel.getIconElement`.

That is compiler-checkable: after close, `grep -rn "renderIcon" src/renderer/` returns nothing outside
historical comments, and `grep -rn "ReactNode" src/renderer/uikit/shared/slots.ts` returns exactly one
line — the `SlotText` declaration (§E6-11).

---

## E6-1 — The contract search, and what E5-8 got right and wrong

E5-1 made the standing rule explicit: *a claim that no contract remains is not evidence until the
whole import graph has been searched for one*, and predicting the next epic's axis from the folder
the current epic touched has now failed twice (E3→E4, E4→E5). So this epic opened by searching,
starting from the two candidates [E5-8](completed.md) recorded rather than from a guess.

**Candidate 1 is the contract.** `uikit/shared/slots.ts`:

```ts
export type IconRef = IconName | ReactNode;
export type SlotText = string | ReactNode;
export function renderIcon(icon: IconRef, props?: SvgIconProps): ReactNode { … }
```

Same shape as every predecessor — `EditorModule.Body` (E2), the Monaco wrapper (E3),
`RenderCellFunc` (E4), `ReactSecondaryViewDefinition` (E5): **one type in a shared module whose
`ReactNode` member pins its callers to React regardless of their own content.** The closest analogy
is E4: `RenderGrid`'s cell contract *returned* a `ReactNode`, and so does `renderIcon`.

**But E5-8's stated consequence is wrong, and this epic must not inherit it.** E5-8 wrote that
"deleting the `ReactNode` member is what finally removes `createRoot` from `uikit/`." Measured, that
is only 44/54ths true. `fillSlot`'s own type is `SlotContent = string | Node | ReactNode`, and it is
fed from two directions:

| Producer | Live slot arms | Fate in E6 |
|---|---:|---|
| Icon hosts — `renderIcon` via `ButtonView` / `IconButtonView` | **44** | → 0 |
| `Button` children, `Input` `startSlot`/`endSlot`, `Dialog`/`Checkbox`/`CollapsiblePanelStack` children, `ListItem`/`TreeItem` `tooltip` | **10** | **survive** |

The second group is JSX children handed in by React callers — among them `editors/base/TextChrome`,
which E1-8 fixed as deliberately **last** in Epic E. Rule 2 keeps `SlotContent` wide until those
callers are gone. So `fillSlot` keeps its React arm, `mount.tsx` keeps `createRoot`, and **`uikit/`
does not become React-free in this epic.** Saying otherwise would be the fourth instance of the
programme's recurring error — predicting a downstream endpoint from an upstream one.

**The generalisation to carry forward:** *deleting a contract removes the callers it pins, not every
caller of the machinery underneath it.* `renderIcon` is a contract; `fillSlot` is machinery that
outlives it.

**Candidate 2 was ruled out, unchanged.** The `editors/base` chrome (`<TextChrome>` across 24 files,
`ContentHostFooter.tsx`, `IContentHost.ts`) stays last for E1-8's reason: converting it early costs
React roots rather than saving them. Its five icon call sites are in scope; the chrome itself is not.

**The search also turned up a third contract, which is E7's, not this epic's** — see §E6-8. It is
recorded with its measurements already taken, so E7 opens from a measured list rather than a
prediction, exactly as E5-8 intended.

---

## E6-2 — Measured surface at epic open (2026-08-25)

### Live React roots

Measured in the running app with both markers queried (`[data-react-root]` and
`[data-part="react-slot"]` — E5-3's corrected instrument), on a working session of 7 open pages:
2 boards, 1 notebook, 2 markdown previews, 2 browser tabs.

| | Count |
|---|---:|
| **Live React roots, total** | **72** |
| …`fillSlot` React arms (both markers on one element) | 54 |
| … …of which the host is an **icon** slot | **44** |
| … …other slot content (children / tooltips / input slots) | 10 |
| …direct `mountReactHandle` roots | 18 |
| `fillSlot` spans with no React root | 0 |

**44 of 72 live React roots — 61% of every React root in the application — exist only because
`renderIcon` returns a `ReactNode`.** Sampled DOM confirms the waste directly: inside each of those
roots is a plain `<svg data-part="close-icon">`, rendered by React into a `display: contents` span
inside a `<span data-part="icon">` that a `VanillaView` already owns.

The 18 direct roots are `AsyncEditorView` (React editor bodies), `PageSlot`, `BoardSecondaryView`,
`index.tsx`'s `GlobalStyles`, `PopoverView` and `ToolbarView`. All survive E6 (§E6-7).

### Icon-producing call sites

| Form | Sites | Where |
|---|---:|---|
| `icon={<XIcon />}` / `icon: <XIcon />` | **142** | `editors/` 135, `content/` 6, `ui/` 1 |
| `React.createElement(XIcon, …)` | **63** | `ui/sidebar/tools-editors-registry.ts` 20, `ui/sidebar/MenuBarView.ts` 12, `ui/tabs/PageTabView.ts` 7, `ui/sidebar/RecentFileListView.ts` 4, ~20 editor-model `getIcon()` at 1 each |
| **Total** | **205** | |

The `createElement` group matters out of proportion to its size: **all 63 sites are in `.ts` files
that are already `VanillaView`s or plain models.** `PageTabView.ts:402` builds its close glyph with
`React.createElement(CloseIcon, …)` and hands it to `fillSlot` — a vanilla view paying a React root
per tab, for an icon whose DOM builder is one import away.

### `SlotText` is negligible

10 declaration sites (`emptyMessage`, `tooltip`) and **1** call site that passes JSX. Narrowing
`SlotText` is a rounding error attached to the same commit, not a task.

---

## E6-3 — This is legacy, not a capability gap

Worth stating plainly because it inverts the usual conversion cost. Nothing has to be *built*:

- **173 icon components** exist — 118 in `theme/icons.tsx`, 55 in `theme/language-icons.ts`; 116 are
  named in `theme/icon-registry.ts` (`IconName`), and the language icons resolve by filename.
- **Every one of them has a DOM builder.** `createIconWithViewBox` attaches `createElement` whenever
  the icon body is a string, and every body is now a string or template literal. EPIC-058 D2 closed
  the last gap when `language-icons` moved from `.tsx` to `.ts`.
- `PersephoneIcon` is the single icon whose body is JSX; it carries a hand-written `createElement`.
  See concern 1 in §E6-6 — its DOM arm is not theme-reactive.
- `components/icons/icon-elements.ts` already provides the whole file/board/favicon precedence chain
  in DOM form, and E5 added `EditorModel.getIconElement` for editor glyphs.

So E6 is a **call-site migration behind a type narrowing**, not a component conversion. No
`VanillaView` is written in this epic. That is unusual for this programme, and it is why the Rule 4
payoff per unit of risk is the best available: `tsc` finds every remaining site the moment the type
narrows.

---

## E6-4 — Rule 4 metric

**Metric:** live React roots in the main window, both markers queried, split by producer.

**Reproducible page set** — US-1077 fixes it, because the open-epic 72 was taken on a working session
and is not reproducible: a fresh window with the sidebar open, plus one text page, one board, one
browser tab and one markdown preview. The baseline is re-taken on that set and recorded before any
call site changes.

**Target:** icon-host slot arms **→ 0**. Total roots fall by the icon count; the ~10 non-icon slot
arms and the 18 direct roots are expected to survive, and that survival is a stated non-goal, not a
shortfall.

**What must not be claimed at close:** that `uikit/` is React-free, or that `createRoot` is gone.
See E6-1.

---

## E6-5 — The `.tsx` extension is lying, and it has inflated every epic's numbers

Every epic in this programme has reported a `.tsx` file count as a secondary progress figure — E5
reported `editors/` going from 145 `.tsx`/23,235 lines to 124/19,903. Measured now, across the
renderer's 262 non-story `.tsx` files:

| | Files |
|---|---:|
| Contain real JSX (`</Tag`, `/>`) — genuinely React-shaped | 132 |
| **No JSX at all** | **130** |
| …of which use a React API (`mountVanilla` shims, `createElement`) | 102 |
| …of which **never mention React** — the extension is pure residue | **28** |

The 28 are 14 `ui/dialogs/*.tsx` (already-vanilla dialogs), 4 `components/tree-provider/*.tsx`,
7 under `editors/` (`LogBody`, `MarkdownBlock`, `MonacoEditorHost`, `MonacoDiffEditorHost`,
`FindBar`, `ColorizedCode`, `mneme-config/index`), and 3 in `uikit/` (`Popover.tsx`,
`RadioGroupView.tsx`, `SpacerView.tsx`). Renaming them is `git mv` plus importer touch-ups.

The other 102 are a subtler point, recorded rather than acted on: a `mountVanilla` shim needs no JSX,
so **a `.tsx` count measures "files that could hold JSX", not React**. Of 72 pure shims, only 3 have
no remaining importer outside stories and `uikit/index.ts` — Rule 2 keeps the rest, so "delete the
unused shims" is not an epic, and E6 says so explicitly to stop it being re-proposed.

This is the same *kind* of finding as E5-3's instrument fix: the number was wrong because of how it
was gathered. E5's was a selector that could not see a root; this one is a file extension that says
React where there is none. **E6 fixes the count and re-states it going forward; it does not
retro-edit earlier epic documents** — historical documents are never rewritten.

---

## E6-6 — Concerns / open questions

1. **`PersephoneIcon`'s DOM arm is not theme-reactive.** The React component reads
   `themeState.use(...)` and re-renders on a theme flip; `PersephoneIcon.createElement` calls
   `themeState.get()` once and returns a static SVG. Any site migrated from the React form to
   `createIconElement("persephone")` stops following the theme. **Resolution required before
   US-1082 touches a Persephone-glyph site**: either subscribe inside the DOM builder (which needs a
   disposer that `createIconElement`'s signature does not currently carry), or have the one or two
   callers re-create the element on theme change. Flagged because it is exactly the class of defect
   that `tsc`, lint, the build and the root count are all blind to — as both of EPIC-063's post-close
   defects were.
2. **Icon props travel with the element.** `icon={<RefreshIcon width={14} height={14} />}` becomes
   `createIconElement("refresh", { width: 14, height: 14 })`, which returns a `Node` and needs no
   type widening — but every migrated site must carry its props across. The 14×14 board-toolbar icons
   and the `color`-carrying Mneme glyph are the sites where a dropped prop would be visible.
3. **A `Node` is single-use; a `ReactNode` is a value.** React re-renders an element description
   freely, whereas appending the same DOM node twice *moves* it. Any site that passes one icon value
   into two hosts must build one node per host. Worth an explicit grep during US-1081/US-1082 rather
   than trusting the compiler.
4. **`editors/base` icon sites sit in files that stay React.** Changing `icon={<RunIcon />}` to
   `icon="run"` inside `TextChrome.tsx` is a prop-value change in a React file. That is Rule 2
   satisfied, not violated — but it must not be mistaken for starting the chrome conversion, and the
   task brief has to say so.
5. **Story coverage.** Icon rendering is exercised through the existing Button/IconButton/Tree/ListBox
   stories. No new story is owed by this epic.
6. **`EditorIconElement`'s react arm.** Deleting it assumes every editor icon producer now answers
   `getIconElement`. E5 added the method to six models and kept a dev-only `console.error` for the
   gap. US-1084 must confirm that error is unreachable before deleting the arm, and delete the
   warning with it.

---

## E6-7 — Non-goals, with reasons

| Surface | Why it stays |
|---|---|
| `fillSlot`'s React arm and `mount.tsx`'s `createRoot` | Fed by `Button` children, `Input` slots and dialog children from React callers (Rule 2). E6-1 corrects E5-8's claim to the contrary. |
| `mountVanilla` and the 72 React shims | 69 still have a real importer. Rule 2. |
| `editors/base` chrome (`<TextChrome>` ×24, `ContentHostFooter`, `IContentHost`) | E1-8: converting it early costs roots. Only its icon *values* change. |
| `PopoverView` / `ToolbarView` `mountReactHandle` roots | They host React `children` from React callers. Same Rule 2 bind. |
| `EditorErrorBoundary` | React class component; goes when the last React editor subtree it guards goes. |
| The browser editor (1,692 lines) and `graph` (3,259) | Unscheduled conversions; only their icon sites are in scope. |
| The 102 no-JSX React-API `.tsx` files | Renaming them is cosmetic churn on files whose React use is real. Only the 28 residue files are renamed. |
| `core/state/view.tsx` and the dialog-view registry | The third contract this epic's search found. It is **E7** — §E6-8. |

---

## E6-8 — Contract candidate for E7 *(recorded, measured, not scoped)*

So E7's search starts from a measured list, per E5-1.

**`core/state/view.tsx` — the dialog/popper view registry, a dual-armed contract in exactly E5's
shape.** `Views.registerView(viewId, React.FC)` / `renderView(): ReactElement` is the React arm;
`ui/dialogs/dialog-view-registry.ts`'s `registerDialogView(viewId, VanillaViewCtor)` is the vanilla
arm; `DialogsView.ts` and `PoppersView.ts` consult the native registry first and fall back to
`Views.renderView` through `fillSlot`. Measured:

| | Count | Lines |
|---|---:|---:|
| Registrations on the vanilla arm | **14** | — |
| Registrations still on the React arm | **4** | 1,064 |

The four are `editors/browser/BrowserDownloadsPopup.tsx` (207),
`editors/grid/components/ColumnsOptions.tsx` (394), `editors/grid/components/CsvOptions.tsx` (107)
and `editors/link-editor/EditLinkDialog.tsx` (356). Converting them deletes `core/state/view.tsx`
(95 lines) entire — `Views`, `View`, `DefaultView`, `IViewRegistration` — and **collects a residual
Emotion importer** (`ViewRoot = styled.div`), which puts it on the removal ledger as well as the
conversion list. Its closing property is compiler-checkable in the same way E5's was.

Two reasons it is E7 and not E6: it is a component conversion (four dialogs with their own state)
where E6 is a mechanical call-site migration, and it costs roots only while a dialog is open, where
E6's 44 are on screen continuously. Contract-per-epic is the programme's convention; both qualify,
and the one with the standing Rule 4 payoff goes first.

Still unscheduled after that: `graph` (3,259), the browser editor (1,692), and the `editors/base`
chrome with its 24 `<TextChrome>` call sites, which stay last.

---

## E6-9 — Task breakdown

Eight tasks. Rule 3 holds at every boundary: the type narrows **last** (US-1084), so `main` compiles
and runs after each one. Rule 1 holds because no task changes both a component and its parent.
Typecheck green is a completion condition of every task, not a follow-up — EPIC-063 had a red `tsc`
handed back as "out of scope" and it was not.

| Task | Scope | Size |
|---|---|---|
| **US-1077** | Fix the reproducible page set; take the Rule 4 baseline split by producer; record it here. | S |
| **US-1078** | Extension hygiene: `git mv` the 28 no-JSX/no-React `.tsx` → `.ts`, touch importers (Vite caches the old specifier — a renderer reload does not clear it), and re-state the programme's `.tsx` figures per E6-5. Independent of every other task. | S |
| **US-1079** | The 63 `React.createElement(XIcon, …)` sites in already-vanilla files: `tools-editors-registry.ts` (20), `MenuBarView.ts` (12), `PageTabView.ts` (7), `RecentFileListView.ts` (4), ~20 editor-model `getIcon()`. Largest single root win. | M |
| **US-1080** | uikit internals: delete the ungated `renderIcon` branch in `ButtonView` and `IconButtonView`; audit `Tag`, `ListItem`, `TreeItem`, `SectionItem`, `SplitButton`, `SelectableRow`, `TruncatedText`, `DialogContentView`. `IconRef` stays wide (Rule 1). | M |
| **US-1081** | `editors/` icon sites, part 1: `link-editor` (19), `rest-client` (15), `graph` (14), `git-tree` (10). | M |
| **US-1082** | `editors/` icon sites, part 2: `browser` (17), `video` (6), `text`/`settings`/`html` (5 each), `mermaid`/`draw`/`board` (4 each), the remaining singles, and `content/tree-context-menus.tsx` (6). Resolves concern 1 before touching any Persephone-glyph site. | L |
| **US-1083** | `editors/base` chrome icon values (5) and `ui/sidebar` (1) — prop values only; the chrome stays React. | S |
| **US-1084** | Narrow `IconRef` to `IconName \| Node` and `SlotText` to `string \| Node`; delete `renderIcon`; drop `EditorIconElement`'s react arm and E5's dev warning once proven unreachable; re-measure and record the close. | M |

---

## E6-10 — Progress

Implementation started 2026-08-25.

### US-1077 — Rule 4 baseline and instrument *(done)*

**The absolute root count is not reproducible from a page set alone — it also depends on which page
is active.** Measured twice in the same 6-page session, changing only the active tab:

| Active editor | Total roots | Icon slot arms | Other slot arms | Direct `mountReactHandle` |
|---|---:|---:|---:|---:|
| browser-view | **72** | **44** | 10 | 18 |
| monaco (scratch page, 8 tabs) | **54** | **31** | 8 | 15 |

Inactive editors stay mounted, so the delta is not the whole editor — it is the active editor's own
chrome. The browser editor alone carries 13 toolbar icon arms.

With monaco active, the 31 icon arms sit in: **tab-strip 8** (one close glyph per tab, plus the
language/empty-language icons), **editor-body 20**, **other 3**.

**So the epic's acceptance criterion is the invariant, not the absolute.** At close:

> `iconArms === 0` under *any* page set and *any* active page.

The absolutes above are recorded as observations with their conditions attached, and the same two
conditions are re-measured at close for a like-for-like comparison. This is the same lesson as E5-3
in a weaker form: a number is only evidence together with how it was gathered.

### US-1078 — Extension hygiene *(done)*

**26 renames and 2 deletions**, not 28 renames. The audit's premise held for 26 files. The other two
were something else, and finding them is the more useful result:

`components/tree-provider/CategoryViewModel.tsx` and `TreeProviderViewModel.tsx` were three-line
**self-referential re-export shims** — `export * from "./CategoryViewModel"` inside
`CategoryViewModel.tsx`, working only because TS/Vite resolve `.ts` before `.tsx` so the shim
re-exports the real module rather than itself. Their own comment says "HMR compatibility for running
development sessions that imported the former `.tsx` module": a transient bridge for a dev session
that ended weeks earlier (both dated 16 Aug against 24-25 Aug implementations), **committed to git by
mistake**. Nothing imports them — every specifier in the repo is extensionless, and extensionless
resolution always picks the `.ts`. Deleted. A repo-wide scan for the same shape found no others, so
these two were the only ones.

Worth recording as a class: a rename-hygiene sweep is also a *dead-scaffolding* sweep, because both
show up as "a file whose extension does not match its contents". The mechanism that hid them is the
resolution order that made them work in the first place.

| | Before | After |
|---|---:|---:|
| Non-story `.tsx` files under `src/renderer` | 262 | **234** |
| …of which contain no JSX | 130 | **102** |
| …of which never mention React | 28 | **0** |

`npx tsc --noEmit` exit 0 (verified independently, not on report), `npm run lint` clean. The 102
remaining no-JSX files are the `mountVanilla` shims and `createElement` users of §E6-5 — real React
use, deliberately left alone.

**Renames wedged the running renderer.** After the 28 file moves the dev server's HMR could not
recover and the renderer stopped answering MCP; `tsc` stayed green throughout, so nothing in the
build signalled it. Recovered by touching a main-process file to force an app restart. This is the
same Vite stale-specifier hazard EPIC-063 hit, in its more severe form: there, one panel failed with
`Failed to fetch dynamically imported module`; here the whole renderer went quiet. **A batch rename
must be followed by an app restart, not a renderer reload.**

### US-1079 — `React.createElement(XIcon)` in framework-free files *(done)*

All 63 sites converted; `grep -rnE "React\.createElement\(\s*[A-Za-z]*Icon" --include=*.ts` returns
**0**. The only `createElement(<Icon>` left in `.ts` files are the legacy `getIcon` React arms on 16
editor models, which US-1084 deletes. `tsc --noEmit` exit 0 (verified independently), lint clean.

**A latent defect, and it explains the tab-strip measurement.** `PageTabView.ts:382` called

```ts
createEditorIconElement({ noLanguage: true, getIcon: editor.getIcon })
```

and never forwarded `getIconElement`. EPIC-063 added the DOM arm *inside*
`createEditorIconElement` and gave six editor models a `getIconElement`, but the tab strip never
passed it — so **the DOM arm was dead for every tab icon** and each no-language tab rendered its
glyph through React even where its model had a working DOM builder. `syncEditorKind` had the matching
staleness: `Boolean(editor?.getIcon)` as the "has an icon" presence check, which would have gone
false for any model that answered only the DOM arm. Both fixed. This is the same shape as E5-2's
latent icon defect: an arm added at the callee and never wired at the caller, invisible to `tsc`
because both properties are optional.

**Concern 3 materialised — and it was a real bug, not a hypothetical.** §E6-6 warned that a DOM
`Node` is single-use where a `ReactNode` is a value. The pinned sidebar rail and the page-tab add
menu share one `allItems` array; with React icons both hosts rendered the same descriptor
independently, but with DOM nodes **opening the add menu would have moved the rail's icon into the
menu and left the rail blank.** Fixed at `PageTabsView.ts:291` with a deep clone for the second host:

```ts
// Pinned items are also displayed in the sidebar rail. Clone native icons so
// opening this menu cannot move the rail's single-use DOM node to the menu.
const icon = item.icon instanceof Node ? item.icon.cloneNode(true) : item.icon;
```

The general rule for the remaining tasks: **wherever one icon value reaches two hosts, the second
host needs a clone.** `tsc` cannot see this — both arms are the same type — so it is a grep, and the
symptom is a *disappearing* icon somewhere else on screen, not a broken one where you are working.

11 editor models gained a `getIconElement` beside their existing `getIcon` (MnemeRoot and GitTree
already had one). Every prop was carried across, including the `color`-bearing Mneme and Video
glyphs. No `PersephoneIcon` site fell in scope, so §E6-6 concern 1 is still unresolved and still owed
before US-1082.

Two substitutions I checked rather than trusted: `FolderIcon` → `createFolderIconElement()` is an
exact match (same emoji, 13px, 3px padding-bottom), and `getLanguageMenuItems()` builds its ~90 icon
nodes fresh per menu open, so the single-use hazard does not apply there — at the cost of ~90 SVG
elements per open instead of ~90 React descriptors, which is bounded and only on user action.

### Concern 1 resolved — and it was already a shipped defect

§E6-6 flagged that `PersephoneIcon`'s DOM builder is not theme-reactive, as a risk to be resolved
*before* migrating a Persephone-glyph site. Investigating it found only two consumers in the whole
app, and the risk had already landed:

- `ui/app/MainPageView.ts:98` **already** used `createIconElement("persephone")`, built once in
  `buildHeader()` with no `themeState` subscription. Theme switching calls `themeState.set(...)`
  without reloading, so **the app-menu glyph kept the previous light/dark background until something
  else rebuilt the header.** A real user-visible bug in `main`, introduced when the header was
  converted (EPIC-058 era) and not by this epic.
- `editors/about/AboutView.tsx:156` renders `<PersephoneIcon width={64} height={64} />` — the only
  remaining React consumer, and the only one that was theme-correct.

**Resolution, recorded as the rule for the rest of the epic:** a builder that returns a *detached*
element cannot own a subscription without leaking it, so `createIconElement` stays non-reactive and
**theme reactivity is the owner's responsibility.** `MainPageView` now rebuilds its glyph through a
`themeState` binding (`bindMenuGlyphToTheme`), which both resolves the concern and fixes the shipped
defect. `AboutView` stays on the React arm — its editor is unscheduled, and it is the one site where
the React form is doing something the DOM form genuinely cannot.

The general shape is worth keeping: **the concern was right about the mechanism and wrong about the
tense.** Auditing "what could this migration break" found the thing it had already broken somewhere
else, because the DOM arm had been adopted at one site ahead of the contract.

### Live verification after US-1079 (2026-08-25)

Measured on the same conditions as the epic-open row — browser tab active — so the numbers are
like-for-like (6 open pages against the baseline's 7):

| | At open | After US-1079 | |
|---|---:|---:|---|
| Live React roots, total | 72 | **18** | −75% |
| Icon slot arms | 44 | **12** | −73% |
| …in the tab strip | 8 | **0** | the `getIconElement` fix |
| …in the sidebar | 0 | **0** | (E5 already cleared it) |
| Other slot arms | 10 | 1 | |
| Direct `mountReactHandle` roots | 18 | 5 | |

**Every one of the 12 remaining icon arms is the browser editor** — `toolbar-home`, `toolbar-back`,
`toolbar-forward`, `toolbar-reload`, `url-navigate`, `url-bookmark-toggle`, `toolbar-bookmarks`,
`toolbar-downloads`, `toolbar-more`, `toolbar-devtools`, `toolbar-close`, `add-tab-button` — which is
exactly US-1082's scope (`BrowserView.tsx`, `BrowserTabsPanel.tsx`, `DownloadButton.tsx`). The single
remaining non-icon arm is the url-input's `end-slot`, a React children slot that survives by design
(§E6-7).

The theme fix was verified live rather than by inspection: `applyTheme("light-modern")` moves the
app-menu glyph's background to `#c5d5e0` and `applyTheme("default-dark")` back to `#2c3e50`. Worth
recording that the first attempt reported the fix as *not* working — the test had passed a
non-existent theme id (`default-light`; the light theme is `light-modern`), and `applyTheme` returns
early on an unknown id, so `themeState` never changed and the binding correctly did nothing. A
verification that exercises nothing looks exactly like a broken fix.

### US-1080 — uikit internals *(done)*

**No `renderIcon` call site remains anywhere in the tree.** Only the definition
(`shared/slots.ts:32`) and the public re-export (`uikit/index.ts:35`) survive, both for US-1084.

The finding worth keeping: **`renderIcon` went dead without being replaced.** Its only job was to turn
an icon *name* into a React element; a caller that already hands over a `ReactNode` needs no
conversion, because `fillSlot` accepts a `ReactNode` natively. So once the name path became DOM, the
last-resort branch simplified from `fillSlot(host, renderIcon(icon))` to `fillSlot(host, icon)` and
the function had no callers left. **The contract was thinner than the type made it look** — the
`ReactNode` member of `IconRef` was load-bearing, the function converting *into* it was not.

`ButtonView` needed the real work. Its fast path required a simple icon **and** simple children; those
are independent, so it now splits into two `display: contents` hosts when the icon has a DOM form but
the children do not — keeping the icon out of React while the label stays a React subtree, and
preserving the button's flex `gap`, which measures icon and label as adjacent direct children.

A **dev-only, once-per-shape `console.warn`** (`uikit/shared/react-icon-warning.ts`) now fires on the
last-resort branch, keyed by component plus React element type. This makes the remaining React icon
callers **discoverable at runtime** rather than only by grep — the useful inversion being that a
`.tsx` call site passing `icon={<X/>}` announces itself when the component actually renders, which
catches sites a grep pattern would miss.

**One hardening I applied on review** rather than accepting as handed over: `ensureSplitHosts()`
called `root.append(iconHost, childrenHost)` on every update, and `append` on an already-attached node
is a *move*. The children host can own a live React root (fillSlot's React arm) and focused content,
so re-appending each update would detach and reattach that subtree for nothing. Now guarded on
`parentNode !== this.root`.

Live count after this task is unchanged, which is correct rather than disappointing: the 12 remaining
icon arms are browser-editor call sites passing React *elements*, so they take the last-resort branch
until US-1082 migrates them. What changed is that they now warn.

**Measurement note for anyone comparing numbers in this section:** the active page dominates the
total. Immediately after this task the app measured 6 roots with a markdown preview active and 18 with
the browser tab active — the same tree, a different tab. Every row above states its active editor for
that reason.

### US-1081 — `editors/` icon sites, part 1 *(done)*

All four folders at **0** remaining `icon={<...>}` sites: link-editor (19), rest-client (15), graph
(14), git-tree (10). `tsc --noEmit` and `npm run lint` both exit 0.

Two graph-local icons with no registry entry got DOM builders beside their React forms
(`createShapeIconElement`, `createLevelIconElement` in `editors/graph/GraphIcons.tsx`) — adding
builders is in scope, converting the graph editor is not.

**The single-use rule changed real code, not just call sites.** Both REST language menus built their
icon arrays inside a `useMemo`; a memoised array of DOM nodes is reused on the next render, so
reopening the menu would have re-appended nodes that had already been moved. Both are now rebuilt per
render, with the reason recorded at the site. That is a deliberate trade — a small per-render cost for
correctness — and it is the *second* time this hazard has forced a structural change rather than a
substitution (US-1079 was the first, with `cloneNode`).

**The reported STOP was correct, and I finished it myself.** `GraphTooltip.tsx:242` passes
`copied ? <CheckIcon /> : <CopyIcon />`, where those are *file-local* React components — 12×12,
stroke-based, `0 0 16 16` — not the registry's `copy`/`check`, which are fill-based at 24 and 16.
Substituting the registry names would have changed the rendering, so stopping was right. The fix was
the same one already applied to the graph legend icons in this task: local DOM builders producing the
identical SVG. My brief had listed only the six legend sites as the "add a builder" exception, which
is why it read as out of scope — **the brief was over-specific, not the judgement wrong.** The
builders return a fresh element per call, which matters here because the two glyphs alternate on the
same host as `copied` flips.

### Part of US-1084 landed early, as a consequence of removing 5 copy-pasted casts

Reviewing US-1081's output found `asIconRef(element) { return element as unknown as IconRef; }`
**duplicated into five files**, plus an identity helper `iconName(icon) { return icon; }` in
`MenuBarView`. The casts existed for one reason: `IconRef = IconName | ReactNode` does not admit a DOM
`Node`, so every site handing over a built SVG had to lie to the compiler.

The fix is the type, not the sites. `IconRef` is now `IconName | Node | ReactNode` — purely additive,
no caller affected — and all five helpers are deleted. **0 `as unknown as IconRef` remain.**

Widening then made two things fail to compile, and both fixes are US-1084 work pulled forward:

- `renderIcon` returned `ReactNode` but could now receive a `Node`. It had no call sites left after
  US-1080, so it is **deleted**, along with its `uikit/index.ts` re-export. The epic's closing
  property for that function is met.
- `createEditorIconElement` returned `{ kind: "react" }` for any non-string icon. It now returns
  `{ kind: "element" }` for an `Element`, so a producer that already builds DOM never takes the React
  arm.

US-1084 is correspondingly reduced: what remains there is deleting the `ReactNode` member itself,
narrowing `SlotText`, and removing `EditorIconElement`'s react arm plus E5's dev warning once the
last React icon caller is gone.

**Why this ordering was better than waiting.** Leaving five `as unknown as` casts scattered across
the tree until a later task would have made each of them look like a local decision, and a cast that
survives one task tends to be copied by the next. The type was wrong; the casts were the symptom.

### US-1082 — `editors/` icon sites, part 2 *(done)*

88 sites converted; the scope grep returns nothing outside `editors/base`. `tsc --noEmit` exit 0,
`npm run lint` exit 0 with no warnings.

**Live verification with the browser tab active — the epic's core target is met:**

| | At open | Now |
|---|---:|---:|
| **Icon slot arms** | **44** | **0** |
| Live React roots, total | 72 | **4** |
| Other slot arms | 10 | 1 (`text-toggle-script`) |
| Direct `mountReactHandle` roots | 18 | 3 |

All 12 browser-editor arms are gone. What remains is exactly what §E6-7 said would remain: one
`TextChrome` children slot, and three direct `mountReactHandle` roots.

The single-use hazard appeared a **third** time — a module-scope DOM node in `AudioVisualizer`, which
is the worst version of it, since a module constant is shared by every instance for the process
lifetime. Local DOM builders were added for the visualizer and log glyphs and the settings colour
dot, following the `GraphIcons` pattern from US-1081 rather than stopping.

No STOP cases arose. The Tor spinner and the download-progress indicator — the two live-updating
glyphs I expected to be blockers — turned out not to be `IconRef` values at all; they are children and
overlays, so they were never in scope.

**Tally of the single-use hazard across the epic: three occurrences, three different mechanisms** —
a shared items array (US-1079), a `useMemo` cache (US-1081), and a module-scope constant (US-1082).
Every one was invisible to `tsc`, lint and the build, and in every case the symptom would have been an
icon vanishing somewhere *other* than the code being changed. This is the epic's most transferable
finding: **when a contract changes from a value to a resource, every cache of that value becomes a
bug**, and caches are exactly what a codebase accumulates for values.

### US-1083 — `editors/base` chrome and `ui/sidebar` icon values *(done)*

8 sites, 4 files. **Zero `icon={<X/>}` / `icon: <X/>` sites remain anywhere in `src/renderer`.**
Seven took the string form (`icon="run"`, `icon={pinned ? "pin-filled" : "pin"}`); the one carrying
props kept its exact sizing with `createIconElement("remove", { width: 14, height: 14 })`. That site
sits inside a `useCallback`'d function that returns a fresh array per call, so the node is built per
menu open — no single-use hazard, checked rather than assumed.

`TextChrome` and `PageToolbar` remain React components. Changing a prop *value* inside them is Rule 2
satisfied; E1-8's "convert the chrome last" still stands untouched.

### US-1084 — narrow the contract *(done)*

`IconRef = IconName | Node`. Removed with it:

- the last-resort React icon branches in `ButtonView` and `IconButtonView`;
- `uikit/shared/react-icon-warning.ts`, **deleted** — it existed to make the React callers
  discoverable, and there are none;
- `EditorModel.getIcon?: () => React.ReactNode` and its assignment in all 16 editor models;
- `EditorIconElement`'s `{ kind: "react" }` member, `createEditorIconElement`'s `getIcon` parameter,
  and EPIC-063's dev-only `console.error` in `SecondaryViewsView` for the icon-with-no-DOM-form case
  (E5-2's warning outlives its cause by exactly one epic);
- the two easy React `SlotText` values (`emptyMessage={<Text/>}` in the sidebar board/tool lists),
  now DOM text elements.

`grep -rn 'kind: "react"'` returns two hits, both in `fill-slot.ts`'s own `ActiveReactSlot` — kept
deliberately, because `SlotContent` still carries children from React callers (§E6-1).

---

## E6-11 — The closing property, corrected at close

The property as written promised `SlotText = string | Node` alongside the `IconRef` narrowing. **It
does not narrow, and forcing it would have been the wrong call.** Three React `SlotText` values
existed at close; two were `emptyMessage={<Text/>}` and converted trivially. The third is
`PinnedLinksPanel.tsx:109`:

```tsx
tooltip={<LinkTooltipContent link={link} imageProxy={model.imageProxy} />}
```

a 145-line React component rendering images and interactive tags. Converting it is a **component**
conversion in an unscheduled editor — Rule 1 territory, not a value change.

**This is the same error E6-1 was written to catch, and this time the document making it was this
one.** E6-1 corrected E5-8 for predicting a downstream endpoint (`createRoot` leaves `uikit/`) from an
upstream one (the `ReactNode` member leaves `IconRef`) — and then this epic's own closing property
predicted a *sibling* endpoint (`ReactNode` leaves `slots.ts`) from the same premise. The generalisation
holds in both directions:

> Deleting a contract removes the callers it pins. It does not remove a *different* contract that
> happens to live in the same file, share a name, or be declared on the adjacent line.

`IconRef` and `SlotText` were two contracts in one file with one member in common. Only one of them was
this epic's.

---

## E6-12 — Result

### Rule 4, measured live on both open-epic conditions

| Active editor | Metric | At open | At close |
|---|---|---:|---:|
| browser-view | **Icon slot arms** | **44** | **0** |
| browser-view | Live React roots, total | 72 | 6 |
| browser-view | Other slot arms | 10 | 1 |
| browser-view | Direct `mountReactHandle` roots | 18 | 5 |
| monaco | Icon slot arms | 31 | 0 |
| monaco | Live React roots, total | 54 | 6 |

**The target invariant holds: `iconArms === 0` under every page set and active page tried.** The
surviving roots are the ones §E6-7 named in advance — `Input`'s `end-slot`, and the direct roots owned
by `AsyncEditorView`, `PageSlot`, `BoardSecondaryView`, `GlobalStyles`, `Popover`/`Toolbar`.

### Call sites and files

| | At open | At close |
|---|---:|---:|
| `icon={<XIcon/>}` / `icon: <XIcon/>` | 142 | **0** |
| `React.createElement(XIcon, …)` | 63 | **0** |
| Non-story `.tsx` files under `src/renderer` | 262 | **234** |
| …containing no JSX | 130 | 102 |
| …never mentioning React | 28 | **0** |

`npx tsc --noEmit` exit 0 and `npm run lint` exit 0 with zero warnings, both verified directly rather
than on report.

### Verified live

Icon arms measured **0** with the browser tab active, with a markdown preview active, and with
freshly opened rest-client, link-editor and graph pages. Glyphs confirmed still rendering rather than
merely counted absent: 6 tab close icons, 9 browser-toolbar SVGs, the app-menu glyph, 14 SVGs in a
rest-client body, 16 in a link editor, 22 in a graph.

**`0` empty `<svg>` elements on screen in every configuration.** That check is worth keeping: an empty
`<svg>` is the signature of `createEmptyIconElement`, the fallback `createIconElement` returns for an
unknown name or a missing DOM builder — so it is the one cheap runtime test for "a migrated site now
names an icon that does not exist". A wrong name is otherwise silent: `tsc` accepts it if it is a valid
`IconName`, and the glyph simply vanishes.

The theme binding was verified by flipping `applyTheme` in both directions (§ above).

### Not verified live

Surfaces whose icon values were migrated but never rendered during this epic: `notebook`, `video`,
`draw`, `settings`, `env-vars`, `archive`, `log-view`, `mneme-config`, `mneme-root`, `tools-hub`,
`mcp-inspector`, the board toolbar, `git-tree`, and the dialogs. The `0`-empty-`<svg>` check above is
the cheap sweep for those; running it with each of those surfaces open would close the gap.

### Epic-close review — 3 concerns, all real, all fixed

The review pass found three defects. None was style; all three were the sort the build cannot see,
which is what the review was aimed at.

1. **A silently ignored SVG attribute.** `editors/graph/GraphIcons.tsx` passed `strokeWidth: 1.5`
   through a generic `appendSvgChild` that does `setAttribute(name, value)` verbatim. **SVG attribute
   names are case-sensitive**, so `strokeWidth` is not `stroke-width` — the group shape's border fell
   back to the default width. Fixed and verified live (`stroke-width="1.5"`, no camelCase attribute
   present). Note the near-miss: `viewBox` and `preserveAspectRatio` *are* genuinely camelCase in SVG,
   so a blanket "kebab-case everything" rule would have broken the working builders. This is the
   hazard of hand-writing DOM that a JSX compiler used to normalise.
2. **A fourth single-use-`Node` instance**, in `SplitButton.story.tsx`: one icon node shared by the
   primary button and a menu row, so opening the menu would blank the button. Fixed with a
   `makeIcon()` factory. That the fourth occurrence was in a *story* is the point — the story is a
   consumer like any other, and the hazard follows the pattern, not the file's importance.
3. **Five new non-null assertions** (`DrawIcon.createElement!()` ×4 and `this.iconHost!` ×2) against
   the project standard. Rather than guard each site, the fix removes the need: a shared
   `createIconComponentElement(icon, props)` in `theme/icons.tsx` throws a named error when a builder
   is genuinely absent, and `ButtonView.ensureSplitHosts()` now **returns** its two hosts so the
   compiler can see they exist. Same principle as the `asIconRef` removal — when several sites reach
   for the same escape hatch, fix what made the hatch necessary.

`tsc --noEmit` exit 0 and `npm run lint` exit 0 with zero warnings after the fixes.

**Recorded, not fixed:** 37 pre-existing `Icon.createElement!()` sites in
`components/tree-provider/item-menus.ts` (18), `ui/dialogs/poppers/grid-context-menu.tsx` (11),
`showPopupMenu.ts` (4) and `plural-actions.ts` (4). All predate this epic — verified against `HEAD` —
and most name registry icons, so they could become plain names. Deliberately left: sweeping 37 sites
*after* the review pass would close the epic on unreviewed code, and unlike the `asIconRef` casts this
debt was not introduced here. It belongs to whichever epic next touches those files, and
`createIconComponentElement` is now the pattern to move them to.

### `/document` and `/userdoc`

Nine developer docs corrected — `doc/standards/{component-guide,editor-guide}.md`,
`doc/architecture/{editors,secondary-views,context-menu,browser-editor,folder-structure,key-files,scripting}.md`
— for the narrowed `IconRef`, `getIconElement` as the only editor-icon contract, the single-use rule,
the empty-`<svg>` diagnostic, and the renamed `.ts` paths.

**Two things I got wrong in the brief, both caught by the run:**

1. I predicted `/userdoc` would have nothing to write, because the epic changed no user-visible
   behaviour. **That was wrong, and by my own hand:** the theme fix in `MainPageView` (§ concern 1)
   *is* user-visible — the app-menu glyph now follows a theme switch immediately. It is in
   `docs/whats-new.md` as a bug fix. The lesson is narrow but real: an epic can be internal in
   aggregate and still ship one user-facing fix, and the fix I made myself mid-epic was the one I
   forgot to account for.
2. I forbade edits under `src/`, which blocked `src/renderer/uikit/CLAUDE.md` — **documentation that
   happens to live under `src/`**. It carried the epic's most misleading stale claim: that
   `ListItem`'s `icon` "accept[s] React values — which the majority of real call sites use". Corrected
   by hand, along with adding the single-use rule to the same guard-rail list where an author will
   meet it. Left alone deliberately: the "Component file template" further down is a React + Emotion
   template, stale in a much larger way that belongs to whichever epic retires the shims, not here.

### Findings that outlast the epic

1. **When a contract changes from a value to a resource, every cache of that value becomes a bug.**
   The single-use `Node` hazard hit three times through three different mechanisms — a shared items
   array, a `useMemo`, a module-scope constant — and was invisible to `tsc`, lint and the build every
   time. The symptom is always an icon vanishing *somewhere other than* the code being changed.
2. **A contract can be thinner than its type suggests.** `renderIcon` went dead without being
   replaced: its only job was name → React element, so once the name path was DOM, a `ReactNode` icon
   went straight to `fillSlot`. The type member was load-bearing; the function converting into it was
   not.
3. **A `.tsx` count measures "files that could hold JSX", not React** — 130 of 262 held none, and 28
   never mentioned React at all. Progress figures in earlier epics are overstated for this reason.
4. **A rename-hygiene sweep is also a dead-scaffolding sweep**, because both present as "a file whose
   extension disagrees with its contents". It found two committed HMR shims.
5. **Auditing what a migration could break finds what it already broke.** Concern 1 was written about
   a future regression; the regression had already shipped at the one site that adopted the DOM arm
   ahead of the contract.
6. **A verification that exercises nothing looks exactly like a broken fix** — an invalid theme id made
   a working fix report as failed.

### The instrument

Canonical measurement, run through `execute_script`. Both markers are queried (E5-3), and slot arms
are split by whether the host is an icon slot:

```js
const zoneOf = (e) => { /* walk up to page-tabs / side-bar / secondary-views / page-editor */ };
const all = Array.from(document.querySelectorAll('[data-react-root],[data-part=react-slot]'));
const slotArms = all.filter((e) => e.dataset.part === 'react-slot');
const iconArms = slotArms.filter((e) => {
    const h = e.parentElement;
    return !!h && (h.dataset.part === 'icon' || h.dataset.name === 'icon');
});
return JSON.stringify({ total: all.length, iconArms: iconArms.length,
    directRoots: all.length - slotArms.length });
```

Two `execute_script` traps cost a round trip each and are recorded so the next measurement does not
repeat them: a `//` line comment anywhere in the script fails to parse, and a script whose helper
functions contain `return` needs an **explicit top-level `return`** — otherwise the runner yields
`undefined` with no error.
