# EPIC-070 — De-React E12: the shell's React-typed content

**Status:** Complete
**Created:** 2026-08-27
**Completed:** 2026-08-27
**Roadmap:** [De-React programme](../de-react.md), Epic E12. Follows
[EPIC-069](completed.md) (E11, the Storybook contract).

## Closing property

Three contracts outside `editors/` still declare **React** for content the producer already has as
**DOM**, and each is paid for in a way that can be measured:

| # | Contract | Where | Paid for by |
|---|---|---|---|
| 1 | `renderPage: (id: string) => ReactNode` | [`PageManagerView.ts:11`](../../src/renderer/components/page-manager/PageManagerView.ts), [`AppPageManagerView.ts:18`](../../src/renderer/components/page-manager/AppPageManagerView.ts), consumed by `PageSlot.render(root, content: ReactNode)` ([`PageSlot.ts:32`](../../src/renderer/components/page-manager/PageSlot.ts)) | **one React root per page**, measured below |
| 2 | `SvgIconComponent = ((props) => ReactElement) & { createElement?: … }` | [`theme/icons.tsx:12`](../../src/renderer/theme/icons.tsx) | 30 `.ts` files importing a React component type; two silent-empty-`<svg>` holes |
| 3 | `getTrailing?: (item) => ReactNode` | [`FileList.tsx:22`](../../src/renderer/components/file-list/FileList.tsx) | an `as unknown as` cast at [`CommitDiffPanel.ts:325`](../../src/renderer/editors/git-tree/CommitDiffPanel.ts) and a laundering helper at [`GraphLegendPanel.tsx:22`](../../src/renderer/editors/graph/GraphLegendPanel.tsx) |

All three have a DOM twin **already built and already dominant**: `PageContentView` is native,
`createIconElement(name)` serves every non-JSX call site, and `fillSlot` has accepted
`string | Node | React.ReactNode` since Epic B. E12 deletes the React-only declaration in each case.

**The closing property is a statement about what is left, not about a count:** after E12, every
React element produced outside `editors/` exists *because an unconverted editor needs it* —
`uikit/shared/mount.tsx` (the boundary itself), `theme/GlobalStyles.tsx` (Emotion, Epic F),
`ui/app/EditorErrorBoundary.tsx` (required by `AsyncEditorView`'s `Component` arm), one generic
`Icon` face for the JSX call sites inside React editors, and the `uikit/` faces those editors call.
**Nothing outside `editors/` produces React for its own sake.**

The measured number (Rule 4) is the **live React root count with its open-page list**, in the form
E11 established. Baseline, taken 2026-08-27 on a running dev session (§E12-2): **7 roots on 3 pages**
(2 monaco, 1 board). Predicted after E12: **4**, and the *rule* becomes honest —
`1 (GlobalStyles) + 1 per React-producing editor instance + 1 per element-valued slot fill` — with
no term that scales with the number of open tabs.

**What must not be claimed at close:**

- **That the renderer is React-free, or nearly.** `editors/` holds **1337 of the 1399** JSX markers
  in the renderer (§E12-1). E12 touches the 62-marker tail. The programme's remaining bulk is
  untouched and E12 must not be reported as progress against it.
- **That the icon React arm is deleted.** It is *reduced from 116 components to one*. 24 of the 31
  JSX icon call sites are inside unconverted editors (`browser`, `board`, `graph`, `settings`,
  `link-editor`, `about`), and a DOM `SVGElement` cannot be rendered by JSX. One generic
  `<Icon name=… />` face survives with a removal-ledger row.
- **That the root count drops to 1.** Predicted 7 → 4 on the baseline session. The three roots that
  remain are `GlobalStyles`, the board editor's `Component` arm, and two Monaco bodies — and the
  Monaco pair is the finding in §E12-1, not something E12 fixes.
- **That the page-island contract is gone.** Its React arm survives for `BrowserView.tsx:599`, the
  browser editor's internal tabs. `PageManagerView` stays two-armed until the browser editor
  converts; only `AppPageManagerView`'s app-page path goes single-armed native.
- **That every `.tsx` outside `editors/` became `.ts`.** 75 of the 92 non-story non-editor `.tsx`
  files contain no JSX at all and would rename cleanly — and E12 deliberately does **not** rename
  them (§E12-6). That is closing by shrinking a number, which E11 rejected on its own headline
  prediction.

## E12-1 — The search, and what it found about the programme's own metric

### The contract search

E11 closed on a promotion: re-measuring a candidate its predecessor had deferred *("a genuine
contract pinning a harness, not the app")* found that it pinned `uikit/`. E12's search ran the same
way — enumerate every remaining React-typed field in a contract or registry position, then ask of
each whether a DOM twin exists and who pays for the declaration.

Six survived enumeration. Three are in scope (the table above). The other three are out, with
reasons:

- **`EditorModule.Component`** ([`editorRegistry.ts:38`](../../src/renderer/editors/base/editorRegistry.ts))
  — already two-armed; 8 callers left. Epic E closes it, not E12.
- **`EditorErrorBoundary.children: ReactNode`** — a React error boundary is React by definition, and
  `AsyncEditorView` needs one for every `Component`-arm editor. Genuinely terminal until Epic F.
- **`TextChromeViewProps.children: SlotContent`**
  ([`TextChromeView.ts:20`](../../src/renderer/editors/base/TextChromeView.ts)) — **already
  `SlotContent`.** Nothing to delete. This one is worth its own subsection, below, because reading it
  produced the epic's largest finding.

### The programme's headline metric is a proxy, and it is wrong

`monaco` is registered on the **`View` arm** — `View: MonacoEditorView`
([`monaco/index.ts:53`](../../src/renderer/editors/monaco/index.ts)) — and has counted as converted
since E2. Its view is a `VanillaView`. But its constructor does this:

```ts
const chrome = new TextChromeView({
    model: props.model,
    children: createElement(
        EditorErrorBoundary,
        null,
        createElement(MonacoBody, { model }),   // MonacoBody.tsx, 239 lines
    ),
});
```

`TextChromeViewProps.children` accepts `Node`. Monaco hands it a React element anyway, so every open
Monaco page carries a React root. **The live baseline proves it**: two of the seven roots sit at
`react-slot → text-chrome-children → text-chrome-root → page-editor`, first child
`DIV[monaco-body]`, on the two Monaco pages (§E12-2).

Monaco is not alone. Counting only files that actually *produce* React elements (JSX closing markers,
or `createElement(` in a `.ts` file), **twelve editors registered on the `View` arm still produce
React**:

| Editor | Arm | JSX markers | `createElement(` calls | Producing `.ts` files |
|---|---|---|---|---|
| `graph` | View | 199 | 8 | 3 |
| `rest-client` | View | 130 | 5 | 2 |
| `link-editor` | View | 40 | 34 | 5 |
| `env-vars` | View | 34 | 4 | 1 |
| `file-diff` | View | 8 | 13 | 1 |
| `draw` | View | 5 | 3 | 1 |
| `monaco` | View | 2 | 4 | 1 |
| `notebook` | View | 0 | 42 | 7 |
| `log-view` | View | 0 | 24 | 16 |
| `markdown` | View | 0 | 17 | 4 |
| `grid` | View | 0 | 5 | 3 |
| `video` | View | 0 | 5 | 5 |

Every one of the largest bodies is live — `GraphDetailPanel` ← `GraphBody` ← `index.ts`,
`RequestBuilder`/`ResponseViewer` ← `RestClientShared`, `EnvVarsBody` ← `index.ts`, `LinkBody` ←
`index.ts` and two browser files, `MonacoBody` ← `index.ts`. None is dead code.

**So "`EditorModule.Component` callers: 9 → 8" was never a measure of Epic E's progress.** It
measures which arm a module registers on, and a module can register `View` while its body stays
React — the two-way boundary composes in that direction by design (§de-react.md 5). This is the
**seventh instance** of *the proxy is not the measurement* in this programme, and the first where the
proxy was the programme's own headline metric rather than a convenience count. The correction goes to
[`de-react.md`](../de-react.md) at scoping time, not at close, because it re-cuts what remains of
Epic E and should not wait on E12 finishing.

E12 does **not** act on it. Converting those bodies is Epic E work and it deletes nothing —
`TextChromeViewProps.children` is already `SlotContent`, so there is no contract at the end of it.
See §E12-3 for why that disqualifies it as this epic's cut.

### The honest JSX surface

Two proxies failed while measuring this, both worth recording because the second is new:

1. **The opening-tag count is inflated by string literals.** `theme/icons.tsx` scores 335 tags by
   `<[A-Za-z]` and holds **21** JSX markers — the other 314 are `<path>`/`<g>`/`<rect>` inside the
   115 SVG **string** bodies. E11 recorded the inverse error (the tag count *under*-counted
   `React.createElement` stories); this is the same instrument failing in the other direction.
2. **The opening-tag count is also inflated by generic type arguments.** `React.Ref<HTMLButtonElement>`
   matches `<[A-Z]…>`, so `uikit/IconButton/IconButtonView.tsx` scored 3 "JSX tags" while containing
   none. Fifteen `uikit/*View.tsx` files were misread this way.

What a type annotation cannot produce is a **closing** marker. Counting `/>`, `</` and `<>` outside
strings and comments:

| Folder | JSX markers | Files with JSX / non-story `.tsx` |
|---|---|---|
| `editors/` | 1337 | 63 / 70 |
| `theme/` | 23 | 3 / 3 |
| `components/` | 17 | 5 / 13 |
| `uikit/` | 12 | 6 / 51 |
| `ui/` | 10 | 3 / 23 |
| `content/`, `index.tsx` | 0 | 0 / 2 |

**The application shell is done.** `ui/` holds 10 markers across 3 files of 23; `uikit/` holds 12
across 6 of 51. And **75 of the 92 non-story non-editor `.tsx` files contain no JSX whatsoever** —
they are `.tsx` because they hold React *types*, which is E11's type-relocation finding one level up.

## E12-2 — The live baseline

Taken 2026-08-27 against the running dev session, via `execute_script`. E11's standing rule applies:
*a roots figure without the open-page list is not a measurement.*

**Session:** 3 pages — 2 × `monaco`, 1 × `board`. **7 roots, 2 `react-slot` markers.**

| # | Depth | Ancestor chain (nearest first) | First child | What it is |
|---|---|---|---|---|
| 1 | 0 | *(none)* | — | `GlobalStyles` (Emotion; Epic F) |
| 2 | 0 | `pages-container` → `app-content` | `DIV` | **`PageSlot` root, page 1** |
| 3 | 1 | `react-slot` → `text-chrome-children` → `text-chrome-root` → `page-editor` → `pages-container` | `DIV[monaco-body]` | `MonacoBody` (§E12-1) |
| 4 | 0 | `pages-container` → `app-content` | `DIV` | **`PageSlot` root, page 2** |
| 5 | 1 | `react-slot` → `text-chrome-children` → `text-chrome-root` → `page-editor` → `pages-container` | `DIV[monaco-body]` | `MonacoBody` |
| 6 | 0 | `pages-container` → `app-content` | `DIV` | **`PageSlot` root, page 3** |
| 7 | 1 | `page-editor` → `pages-container` → `app-content` | `DIV[board-host]` | `board`, `Component` arm |

Roots 2, 4 and 6 are the contract. Each holds exactly one `DIV` — the `mountVanilla` host that
`PageContentBridge` returns — and nothing else React. The full path for every app page today is:

```
PagesView (native)
  └─ AppPageManagerView (native)
       └─ PageSlot.render → mountReactHandle          ← a React root
            └─ PageContentBridge (React, 7 lines)     ← the only React in the path
                 └─ mountVanilla → PageContentView (native)
                      └─ RenderEditorView (native) → AsyncEditorView (native)
```

**A React root per page, between two native layers, containing one React component whose entire body
is `mountVanilla(PageContentView, { pageId })`.** `RenderEditor.tsx` is the same shim one level down,
with no caller at all.

Predicted after E12: **4 roots** — 1, 3, 5, 7 above. Roots 3, 5 and 7 stop being nested and become
top-level; the count falls by exactly the number of open pages, which is the term that made E10's
arithmetic wrong.

**The baseline procedure is recorded so the closing measurement uses the same instrument** (E11's
rule: the verification path must be the real one). Query `[data-react-root]`, and for each root walk
`parentElement` counting ancestors that also carry the attribute (depth), collecting
`data-name`/`data-type`/`data-part` (chain) and `firstElementChild`. Do **not** use
`data-part="react-slot"` for root counts — `uikit/Dialog/DialogView.tsx:86` and
`uikit/Tag/TagView.tsx:88` stamp it unconditionally (US-1091).

## E12-3 — Why this cut, and the three alternatives that lost

**A. Convert the twelve `View`-arm editors that still produce React bodies** (§E12-1) — `graph` 199
markers, `rest-client` 130, `link-editor` 40 + 34 `createElement`, `notebook` 42 across 7 files,
`log-view` 24 across 16. **Rejected.** It is the largest thing the search found and it deletes
nothing: `TextChromeViewProps.children` is already `SlotContent`, so the epic would close by
shrinking a number with no contract at the end of it — the failure mode E2 named and E11 re-applied
when it rejected the form-and-panel cut. It is also several epics of work, not one. The *finding*
goes into `de-react.md` immediately (§E12-1) so Epic E's remaining roadmap is re-cut on it; the
*work* is Epic E's.

**B. Widen the remaining 14 `ReactNode`-declared props to `SlotContent`.** Measured: `ListItem.label`
and `.trailing` ([`ListItem.tsx:24,44`](../../src/renderer/uikit/ListBox/ListItem.tsx),
[`types.ts:27`](../../src/renderer/uikit/ListBox/types.ts)), `SegmentedControl.label`,
`SelectableRow.children`, `Panel.children`, `SplitButton.children`, `TruncatedText.children`,
`PopoverModel.children`, `CheckboxView.updateChildren`, `SvgIconProps.children`, `PageSlot.render`,
`FileList.getTrailing`. Note the asymmetry it would fix: `TreeItem.label` is `React.ReactNode | Node`
and `ListItem.label` is `React.ReactNode`, for the same slot consumer. **Rejected as a standalone
cut** — it is a widening, not a removal, and E11's six widenings were a *side effect* of converting a
real consumer, not a goal. Folded into E12 (§E12-7) only where contract 3 needs it, and the two
laundering sites are deleted with it.

**C. and D.** E11 measured and rejected the *form-and-panel editors* and the *last two `editors/base`
chrome files*. Both rejections stand, with their reasoning in
[EPIC-069 E11-3](EPIC-069.md#e11-3--why-this-cut-and-the-two-alternatives-that-lost). Not
re-derived here.

**Why the chosen cut.** It is the only remaining group where the React declaration is *single-armed*,
the DOM twin is *already built and dominant*, and the cost is *measurable today* — a root per page, a
cast, a laundering helper, two silent-empty-`<svg>` holes. It also finishes a region rather than
denting one: after E12 the shell and theme are done, and everything left is `editors/`.

## E12-4 — The icon contract, measured

`theme/icons.tsx` is 714 lines and **21 JSX markers**, all of them inside two components — `SvgIcon`
and the `IconWithViewBox` returned by `createIconWithViewBox`. Everything else is data.

| Measurement | Value |
|---|---|
| Exported icon components | **116** |
| Icons defined with a **string** body (⇒ have `.createElement`) | **116 of 116** |
| Icons defined with a JSX body (⇒ no DOM builder) | **0** |
| Icons registered in [`theme/icon-registry.ts`](../../src/renderer/theme/icon-registry.ts) | **116 of 116** |
| Files importing `theme/icons` | **45** — 30 `.ts`, 13 `.tsx`, 2 stories |
| JSX call sites (`<XIcon />`) | **31** across 17 files |

Three facts follow, and together they are the whole case:

1. **`createElement?` is optional for a reason that no longer exists.** The type carries a comment
   explaining it: *"an icon defined with a JSX body has no string source to build from, so callers
   cannot assume it exists."* Zero icons are JSX-bodied. The optionality is vacuous, and it is not
   free — `createIconComponentElement` **throws** when the builder is missing
   ([`icons.tsx:26`](../../src/renderer/theme/icons.tsx)), and `createIconElement` has **two
   dev-only-warn-then-return-an-empty-`<svg>`** paths for an unknown name and a missing builder
   ([`slots.ts:34-50`](../../src/renderer/uikit/shared/slots.ts)). That second one is not
   hypothetical: **E11 hit it**, spent a round chasing "empty SVGs" that were caused by passing
   `icon: "folder"` when the registry name is `folder-open`. An unresolvable icon renders blank
   instead of failing — precisely the masked-defect class §6.1 exists to name.
2. **30 `.ts` files import a React component type to reach an optional DOM builder.** That is the
   same shape as E11's finding, one layer out: the contract pins the *vanilla* half of the app.
3. **Three ways to obtain an icon are in simultaneous use** — a registry name
   (`createIconElement("folder-open")`, the dominant path), a React component
   (`<FolderIcon />`, 31 sites), and a component reached for its builder
   (`createIconComponentElement(DrawIcon)` in `editors/draw`, `graph` and `html`). The third exists
   only because the second is a React component; delete the React call signature and it collapses
   into the first.

**Three dead React faces come free.** `components/icons/` holds the native
[`icon-elements.ts`](../../src/renderer/components/icons/icon-elements.ts) — which every real
consumer uses (`FileListView`, `FileGridView`, `FileSearchView`, `TreeProviderViewImpl`,
`PageTabView`, `SecondaryViewsView`, `ImageEditor`, `PinnedLinksPanel`) — plus three React faces with
**no live component caller**:

- `TreeProviderItemIcon.tsx` (91 lines, 9 markers) — zero importers.
- `LanguageIcon.tsx` (321 lines, 4 markers) — `LanguageIcon`/`FileTypeIcon` have zero component
  callers; only the non-React `prepareFileIcon` is live, from `FileGridView.ts:6`. Relocate it and
  the file goes.
- `FileIcon.tsx` (18 lines, 2 markers) — re-exported by `ui/sidebar/index.ts:3` and imported by
  nobody. (Two `.tsx` files mention `FolderIcon` — both in prose comments.)

That is E11's type-relocation finding again, and this time the relocation is one function.

## E12-5 — Concerns

1. **`PageSlot`'s deferred dispose exists for a React reason, and the React arm keeps it.** `dispose()`
   detaches synchronously, then disposes the root in a `queueMicrotask` behind a generation guard,
   because a React root cannot be unmounted during its parent's commit. A native arm has no such
   constraint and should dispose directly — but the guard must survive for the arm
   `BrowserView.tsx:599` still uses. Do not "simplify" it away.
2. **The `hasBeenActive` laziness is load-bearing.** `AppPageManagerView.reconcile` renders a slot
   only for pages that have been active at least once, so restoring a 20-tab session does not
   construct 20 editors. A native arm must preserve exactly that predicate, and the closing
   measurement must confirm it — a session restored with many tabs should still show one editor
   constructed, not all of them.
3. **Grouped pages and compare mode are the risky path, not the plain one.** `GroupContainer`
   reparents slot placeholders and `applyStandaloneStyle` rewrites their inline styles on every
   compare toggle. E10's persistent-child finding applies with force: React unmounting a subtree used
   to suppress side effects for free, and a native parent that keeps an inactive branch mounted makes
   them live. Check `<webview>` (browser, board), `<audio>`/`<video>`, and Monaco instances
   specifically, on group / ungroup / compare-on / compare-off.
4. **The icon React arm must not be declared dead.** 24 of the 31 JSX sites are inside unconverted
   editors. One generic `<Icon name={…} />` face survives, and it needs a removal-ledger row naming
   the editors that keep it alive — not a note saying icons are done.
5. **Removing the optionality must also forbid re-adding a JSX-bodied icon.** Making `createElement`
   required fixes today's 116, but `SvgIconProps.children?: ReactNode` still admits a React body, so
   the hole reopens the first time someone passes one. `createIconWithViewBox` should accept a string
   body only, and `IconBody = string | ReactNode` should lose its React half.
6. **`createIconElement`'s empty-`<svg>` fallbacks are a behaviour change to remove.** Today an
   unknown name warns in dev and renders blank in production. Failing loudly is correct and is what
   would have saved E11 a round — but an icon name arrives from persisted state in some paths
   (toolsets, boards, tree providers), so a hard throw could break a restore. Decide per source:
   compile-time-known names should be a type error, and runtime-sourced names should render a visible
   placeholder rather than an invisible one.
7. **`icon-registry.ts` imports all 116 icons eagerly**, which defeats code splitting for anything
   that touches an icon by name. Out of scope, but the conversion must not widen it — do not add
   eager imports, and if the registry has to be rebuilt, keep the import graph no worse.
8. **The `.tsx` → `.ts` rename on `theme/icons` risks E11's stale-import trap.** All importers found
   are static, so touching the importer should suffice — but if the error survives with a **frozen
   `?t=` timestamp**, that is the dynamic-import case and it needs the dev server restarted, not
   another touch.
9. **Widening a `uikit/` prop is a public-API change.** `SlotContent` is a `uikit`-owned type and
   `ReactNode` is the foreign one, so these widenings move *toward* extraction-readiness
   (§de-react.md 3.5) — but `uikit/CLAUDE.md` still governs, and the `ListItem`/`TreeItem` asymmetry
   should be resolved in `TreeItem`'s direction rather than inventing a third spelling.
10. **US-1131 is still unguarded and this epic writes new `VanillaView` subclasses.** *The
    constructor must not create or touch child DOM* has been broken four times across three epics,
    twice as a live crash, and nothing catches it. Either land US-1131 first or make it an explicit
    review gate on every task here. §E12-2's path shows why: the native page arm is a new view class
    on the app's hottest path, and a constructor `TypeError` there is a blank window.
11. **`PagesView`'s own constructor already builds a child** (`new AppPageManagerView(...)` before
    `super()`, then `this.child(manager)`) and passes `manager.root` as its own root. That is the
    established pattern for a view that *is* its child, not a violation — but the native page arm will
    tempt a copy of it into `PageSlot`, where the placeholder must stay stable across renders.

## E12-6 — Non-goals

- **Converting any editor body.** Not `MonacoBody`, not `GraphBody`, not `RequestBuilder`. §E12-1
  measures them and `de-react.md` records the correction; the work is Epic E's.
- **Renaming the 75 zero-JSX non-editor `.tsx` files to `.ts`.** They would rename cleanly and it
  would change nothing. E11's headline prediction failed for exactly this reason and its lesson is
  that the extension is not the measurement — a file is renamed here only if a task already touches
  it for another reason.
- **`theme/GlobalStyles.tsx` and Emotion.** Epic F / D6.
- **`ui/app/EditorErrorBoundary.tsx`.** Required by `AsyncEditorView`'s `Component` arm; terminal
  until the last React-arm editor goes.
- **`uikit/Popover/PopoverView.tsx:227-236`, `uikit/Dialog/DialogView.tsx:161-164`,
  `uikit/Menu/WithMenu.tsx:69-71`.** Residual JSX arms serving React callers. Leaving them is the
  point; "tidying" them is how a converted view acquires a second implementation.
- **`icon-registry.ts` code splitting** (concern 7).
- **`PageManagerView`'s React arm.** Survives for the browser editor's internal tabs.
- **US-1091** (`data-part="react-slot"` stamped unconditionally). It affects the instrument, so
  §E12-2 works around it by using `data-react-root`; fixing it stays its own ticket.

## E12-7 — Tasks

| # | ID | Task | Notes |
|---|---|---|---|
| 1 | US-1133 | Capture the live DOM + roots baseline, and the icon-render baseline | Procedure in §E12-2. Must include the open-page list, per-root depth/chain, and a rendered-icon inventory for a page that exercises many icons. E11's rule: this is the only instrument that sees a silent conversion regression. |
| 2 | US-1134 | Give `PageSlot` a native arm and `AppPageManagerView` a view-valued page contract | `renderPage` gains a DOM/view arm; `PageSlot.render` stops calling `mountReactHandle` on that arm. Preserve the `hasBeenActive` laziness (concern 2) and the deferred dispose on the React arm (concern 1). |
| 3 | US-1135 | Point `PagesView` at the native arm; delete `PageContentBridge.tsx` and `RenderEditor.tsx` | `RenderEditor` has no caller today. Verify grouped / compare paths against concern 3 before and after. Collect `AppPageManager.tsx` and `PageManager.tsx` if their caller count reaches zero. |
| 4 | US-1136 | `theme/icons.tsx` → `theme/icons.ts`: drop the React call signature; make the DOM builder required | `SvgIconComponent` becomes a builder + `viewBox`, not a component. Forbid a JSX body (concern 5). `createIconComponentElement`'s throw becomes unreachable and goes. |
| 5 | US-1137 | Add one generic `Icon` React face, and close the empty-`<svg>` holes | The single surviving React arm (§E12-5 concern 4) plus the fallback decision from concern 6 — a type error where the name is static, a visible placeholder where it is runtime-sourced. |
| 6 | US-1138 | Convert the 31 JSX icon call sites | `createIconElement` in native files; `<Icon name=… />` in the 24 sites inside React editors. `createIconComponentElement(DrawIcon)` in `draw`/`graph`/`html` collapses to a registry name. |
| 7 | US-1139 | Collect the three dead `components/icons/` faces | Relocate `prepareFileIcon` out of `LanguageIcon.tsx`; drop the `ui/sidebar/index.ts:3` re-export; delete all three files. §E12-4. |
| 8 | US-1140 | Widen `FileList.getTrailing` and the `ListBox` family to `SlotContent`; delete both laundering sites | Removes `CommitDiffPanel.ts:325`'s `as unknown as` and `GraphLegendPanel.tsx:22`'s `asReactNode()` (6 uses). Resolve the `ListItem`/`TreeItem` asymmetry in `TreeItem`'s direction (concern 9). |
| 9 | US-1141 | Closing measurement and epic review pass | Same instrument as US-1133, same session shape. `/review`, `/document`, `/userdoc` via Codex. |

## E12-8 — The closing measurement

**Taken 2026-08-27 after all four implementation tasks, following a cold restart** (not a hot-swap),
on the same session shape as the baseline: 7 pages open, 3 ever activated.

### Live

| Metric | Baseline | Close |
|---|---|---|
| `[data-react-root]` count | **6** | **3** |
| — page-level (`PageSlot`) roots | 3 | **0** |
| — nested at depth 1 | 2 | **0** |
| — `GlobalStyles` | 1 | 1 |
| Rendered `<svg>` — **empty** | 0 | **0** |
| Rendered `<svg>` — inside a React root | **204** | **4** |
| Icon placeholders rendered | n/a | **0** |
| `data-name="page-slot"` markers | 0 (unaddressable) | **7** |
| Placeholders rendered / open | 3 of 7 | lazy, unchanged |

The three surviving roots are exactly the predicted ones: `GlobalStyles`, `MonacoBody`, and the board
editor's `board-host`. **The roots rule is now `1 (GlobalStyles) + 1 per React-producing editor
instance`, with no term that scales with open tabs** — which is the whole point of the cut, and the
first time in this programme the Rule 4 instrument can be stated without a caveat about the session.

### Static

| Metric | Baseline | Close |
|---|---|---|
| Renderer non-story `.tsx` | 162 | **136** |
| — `ui/` | 23 | **9** |
| — `components/` | 13 | **3** |
| — `theme/` | 3 | **1** (`GlobalStyles.tsx`) |
| — `editors/` | 70 | **70** (unchanged, by design) |
| Non-editor JSX markers | 62 across 17 files | **11 across 11 files** |
| `editors/` JSX markers | **1337** | **1337** (unchanged, by design) |
| `Story`-style icon React components | 116 | **1** generic face |
| `theme/icons` importers holding a React type | 32 `.ts` | **0** |
| Named icon JSX tags | 30 | **0** |
| `ReactNode`-declared slot contracts | 17 | **0** |
| DOM→React laundering sites | 2 (+6 call sites) | **0** |

Diff: **121 files changed, +416 / −1823**; 32 files deleted, 11 added, 89 modified. All three gates
green (`typecheck`, `lint`, `build-prod`).

### The closing property, checked file by file

Eleven non-editor files still contain JSX, and **every one of them exists because something else
needs it** — which is the property this epic set out to establish:

| File | Markers | Why it survives |
|---|---|---|
| `ui/sidebar/TrustedBoardsListView.tsx` | 5 | live view, kept by the `tools-hub` editor |
| `uikit/Popover/PopoverView.tsx` | 4 | React arm for React callers |
| `ui/app/EditorErrorBoundary.tsx` | 4 | required by `AsyncEditorView` + 8 editor modules |
| `uikit/Dialog/DialogView.tsx` | 3 | React arm |
| `uikit/Menu/WithMenu.tsx` | 2 | React render-prop API |
| `uikit/shared/mount.tsx` | 1 | **the two-way boundary itself** |
| `uikit/Text/Text.tsx`, `uikit/Panel/Panel.tsx` | 1 each | the two faces with no vanilla twin (C1's decision, E11's ledger) |
| `ui/sidebar/TrustedToolsListView.tsx` | 1 | live view, kept by `tools-hub` |
| `theme/GlobalStyles.tsx` | 1 | Emotion — Epic F / D6 |
| `uikit/Icon/Icon.tsx` | 1 | the one generic icon face |

**Nothing outside `editors/` produces a React element for its own sake.**

### What is NOT claimed

- **No progress against Epic E.** `editors/` is unchanged at 1337 markers across 63 files, reported
  deliberately so this epic is not misread as denting the programme's remaining bulk.
- **The icon React arm is not deleted**, it is reduced 116 → 1, and the generic face is kept alive by
  20 call sites inside unconverted editors.
- **The page-island contract is not deleted**, only its app-page implementation. `PageManagerView`
  keeps its React arm for `BrowserView.tsx`'s internal tabs.
- **No interactive verification was performed** — see the outstanding human list in §E12-10.

### Original figures to report (from scoping)

Each against the baseline in §E12-2 and §E12-4:

- **Live React roots with the open-page list.** Baseline 7 on 3 pages (2 monaco, 1 board); predicted
  4. Report the session shape, not just the number — E10's "3" and E11's "16" were both true.
- **The roots *rule*.** State it in the honest form and check it holds: `1 (GlobalStyles) + 1 per
  React-producing editor instance + 1 per element-valued slot fill`, with no per-open-tab term.
- **`renderPage` React-arm callers.** 2 → 1 (`BrowserView.tsx:599`).
- **`theme/icons` importers holding a React type.** 30 `.ts` files → 0.
- **Icon React components.** 116 → 1.
- **JSX icon call sites.** 31 → the count inside React editors only.
- **`as unknown as` / laundering sites for DOM-into-`ReactNode`.** 2 → 0.
- **Non-editor JSX markers.** Baseline 62 across 17 files.
- **Editors' JSX markers.** Baseline 1337 across 63 files — reported to show it is **unchanged**, so
  E12 is not read as progress against Epic E.
- **Session restored with many tabs constructs one editor, not all of them** (concern 2).
- Gates: `tsc --noEmit` green, `npm run lint` clean, `npm run build-prod` passing.

## E12-9 — Progress

Re-cut to six units before implementation (§E12-10). All six are complete; all gates green.

- [x] US-1133 — the live DOM / roots / icon baseline
- [x] US-1134 — the page-island contract end to end (absorbs the old US-1135)
- [x] US-1136 — the icon contract, generic `Icon` face, both empty-`<svg>` holes (absorbs US-1137, and the call-site migration and icon-face collection from US-1138/US-1139)
- [x] US-1138 — collect the dead shell faces and barrels (re-scoped; 9 faces, 4 barrels, 2 stubs, 6 splits)
- [x] US-1140 — widen 17 slot contracts; delete both laundering sites
- [x] US-1141 — closing measurement (§E12-8), `/review` / `/document` / `/userdoc`, and the human
  interactive pass

**The interactive pass is done.** The user ran the deferred list — grouping, ungrouping, compare
on/off, `<webview>` and media pages, Monaco through those transitions, and the theme-dependent
Persephone icon — and reported the UI correct. Combined with the scripted verification after a cold
start, that discharges §E12-5 concern 3 and every item recorded as outstanding.

**Nothing was committed by this epic's work.**

## E12-10 — Findings during implementation

*(appended as the epic runs; this document is append-only from here)*

### The nine tasks were re-cut to six before implementation started

§E12-7's table splits work that cannot land separately. Four pairs each share a compile boundary —
the contract change and its only consumer, or the type change and the face that keeps the tree
compiling — so implementing them as separate tasks would mean landing a deliberately broken tree
between them. Re-cut, keeping the lower ID of each pair:

| Was | Now | Why merged |
|---|---|---|
| US-1134 + US-1135 | **US-1134** — the page-island contract, end to end | The native arm and `PagesView` are one change; `PageContentBridge` cannot be deleted until its caller moves. |
| US-1136 + US-1137 | **US-1136** — the icon contract | Making the DOM builder required breaks all 31 JSX call sites unless the generic `Icon` face lands in the same change. |
| US-1138 + US-1139 | **US-1138** — the 31 call sites, and collecting the three dead faces | Both are call-site edits over the same files; the dead faces become deletable only once their last JSX reference is gone. |
| US-1140 | US-1140 — slot-prop widening, both laundering sites | unchanged |
| US-1141 | US-1141 — closing measurement and review | unchanged |

US-1133 (baseline) is unchanged and is **complete** — see
[`doc/tasks/US-1133-e12-baseline/README.md`](../tasks/US-1133-e12-baseline/README.md).

This is the second epic in a row whose task grouping was wrong at scoping time, and the two failures
are opposite: E11's grouping was built on a predicate that turned out not to describe the work
(JSX tag counts), whereas E12's was built on a correct description that ignored **whether each unit
compiles on its own**. A task boundary is a boundary in the *build*, not only in the prose.

### The baseline is captured, and it settled two of the epic's own numbers

Full data in [US-1133](../tasks/US-1133-e12-baseline/README.md). Two corrections to §E12-2, both from
re-reading the live DOM rather than the session I first sampled:

- **The session is 7 pages, not 3.** §E12-2 recorded "7 roots on 3 pages" because `list_pages` had not
  been correlated with the DOM. The truth is better for the epic: **7 pages open, 3 ever activated,
  and only the 3 activated ones carry a React root.** The 4 never-activated placeholders hold nothing
  at all — `display: none`, zero children, no root. So the contract costs one root per *activated*
  page, and concern 2's `hasBeenActive` laziness is not a risk to be careful of but a measured
  property with a number attached.
- **The root count is not stable within one session.** Successive probes minutes apart read **7, then
  6**, because an editor's own nested root disposed in between. Neither reading was wrong. This is the
  third time this programme has had to restate the same caution (E10 reported 3, E11 measured 16 on
  the same build), so the closing measurement reports the count **plus** the page list **plus** the
  per-root chain, or it reports nothing.

Two further baseline facts that the epic did not anticipate:

- **238 SVGs render and exactly 0 are empty.** That makes the icon conversion's verification
  unambiguous — `createIconElement`'s empty-`<svg>` fallback is currently never firing, so any empty
  SVG afterwards is a regression and not a pre-existing condition. E11 had no such baseline and
  misattributed three of them.
- **204 of the 238 SVGs count as "inside a React root" today**, because a `PageSlot` root wraps a
  page's *entire* subtree including all of its native content. Any instrument asking "is this inside
  React?" is therefore meaningless at present — which makes it a good closing metric, since after
  US-1134 it should collapse to the board editor's own icons.

### Deferred human verification — run and passed (2026-08-27)

**Resolved.** The user ran the list below and reported the UI correct, including the grouped/compare
and `<webview>` transitions that §E12-5 concern 3 named as the epic's real risk. Nothing in it needed
a follow-up fix. The list is kept as written because it is the reusable checklist for the next epic
that touches the page host — and because the split it records (what a script can verify versus what
needs a person) is the part worth carrying forward, not the outcome.

**This run was performed with the user away and the screen locked**, at their instruction: *"If
something you cannot verify — record it in epic document and we will verify it my morning."* The DOM
baseline and the closing DOM measurement are both scriptable and were/will be taken. What is **not**
scriptable is anything needing a visible window or a pointer, and US-1134 is the task where that
matters, because §E12-5 concern 3 names the grouped/compare path as the risky one.

Deferred to a single human pass, in an order that can be run in one sitting:

**Updated after implementation — items 1 and 2 turned out to be scriptable and were verified.**
Synthetic clicks on the tab strip work, so page switching and lazy activation were both exercised
live after a cold start: three pages activated and rendered, four never-activated placeholders still
holding nothing. What remains genuinely needs a pointer and a visible window, because it involves
drag, splitter interaction, and watching for side effects that only show up visually.

1. ~~Plain page switching~~ — **verified live** (tab clicks; each page renders, no blank page).
2. ~~Lazy activation~~ — **verified live** (7 placeholders, 3 rendered, 4 empty after a cold start).
3. **Group / ungroup.** Group two text pages, drag the splitter, ungroup. Both pages keep their
   content and scroll position; the splitter appears only for the active group.
4. **Compare on / off.** Enter compare mode on a grouped text pair and leave it. Content survives both
   transitions; no duplicated editor.
5. **A `<webview>` page through the same four transitions** — a browser page and a board page. **This
   is the one most likely to fail**: a reparented `<webview>` reloads, and E10's persistent-child
   finding was an inactive `<audio>` going live once a native parent stopped unmounting it. Watch for
   a page reloading when it should not, and for a hidden page still playing or fetching.
6. **A media page** (video/audio) left on an inactive tab — it must not start or continue playing.
7. **Monaco specifically**, through group and compare, since it keeps an editor-owned nested React
   root that this task deliberately does not touch.

8. **The Persephone app-menu icon in both light and dark theme.** It is the only theme-dependent
   icon, its React arm was deleted, and its DOM builder must re-read `themeState` at call time rather
   than capture `isDark` once. Toggle the theme and watch the menu button's glyph change.
9. **The About page's large Persephone logo** — the single call site that used to render the JSX arm
   and now goes through the generic `Icon` face.
10. **A general glance for missing or X-shaped icons.** An unresolvable icon name now renders a
    visible X placeholder carrying `data-icon-placeholder="true"`. A scripted count found **zero** of
    them, so this is a belt-and-braces look rather than an expected failure.

If any of 3–7 misbehaves, the cause is almost certainly in `PageSlot`'s native disposal ordering or in
`AppPageManagerView`'s style reapplication, not in the editor. If 8 or 9 misbehaves, it is the
`PersephoneIcon` builder's theme reactivity.

### US-1134 is implemented and measured: roots 6 → 3, exactly as predicted

All three gates green (`typecheck`, `lint`, `build-prod`). Diff is 3 files modified, 6 deleted,
nothing else. Measured live against the **same session shape as the baseline** — 7 pages open, the
same 3 activated (`md-view`, `monaco`, `board-editor`; the customer file was deliberately left
unactivated) — by clicking the tab strip to reproduce it after the reload:

| Metric | Baseline | After US-1134 |
|---|---|---|
| Pages open / ever activated | 7 / 3 | 7 / 3 |
| `[data-react-root]` count | **6** | **3** |
| — page-level (`PageSlot`) roots | **3** | **0** |
| — nested at depth 1 | 2 | **0** |
| — `GlobalStyles` | 1 | 1 |
| `data-name="page-slot"` markers | 0 (unaddressable) | **7** |
| Placeholders rendered | 3 of 7 | 3 of 7 |
| Rendered `<svg>` | 238 | 211 |
| — **empty** | **0** | **0** |
| — inside a React root | **204** | **4** |

The three survivors are exactly the predicted ones: `GlobalStyles`, `MonacoBody`, and the board
editor's `board-host`. Both formerly-nested roots are now at **depth 0** — §E12-2 predicted that they
"stop being nested and become top-level", and they did, which is why the count falls by 3 rather than
by 5.

**The roots rule is now honest.** Measured form: `1 (GlobalStyles) + 1 per React-producing editor
instance`, with **no term that scales with open tabs** — 7 pages open, 4 of them costing nothing at
all. That was the point of the cut, and it is the first time in this programme that the Rule 4
instrument can be stated without a caveat about the session.

**`svgInsideReactRoots` 204 → 4 confirms the corrupted-instrument finding.** Before the change, 204 of
238 icons counted as "inside React" purely because a `PageSlot` root wrapped each page's entire native
subtree. The residual 4 are real: they are inside the two React-producing editors.

**What is verified and what is not.** Verified live: the app renders, all three activated pages mount,
no page is blank, no icon renders empty, the marker lands on all seven placeholders, and lazy
activation still holds at 3 of 7. **Not verified:** every interactive transition in the
human-verification list above — grouping, ungrouping, compare on/off, and the `<webview>` and media
cases. Those need a visible window and were not attempted beyond what a synthetic click could reach.

### The review pass found four concerns; two were real defects and both are fixed

`/review`, `/document` and `/userdoc` ran via Codex sub-agents. `/review` changed no files and raised
four concerns; `/userdoc` correctly wrote nothing (this epic has no intended user-visible change).
Each concern was verified against source before acting, and two were real.

**1. `PageSlot.renderNative` had no mount-failure rollback — a real defect, fixed.** The method
returns early whenever `nativeView` is already set. So if the view's constructor or `mount()` threw,
the slot kept a half-built view forever, `renderNative` never retried, **and that page stayed
permanently blank** for the rest of the session. `AsyncEditorView.renderEditor` already had exactly
this rollback; the new arm did not. Now wrapped: clear the field, dispose what was built, remove the
root, rethrow. This is the same defect class as the `VanillaView` constructor rule (US-1131) — a
failure on a path no gate exercises — arriving through a different door, which is worth noting because
US-1131's proposed guard would **not** have caught it.

**2. `PageSlot.dispose` could leak one arm — fixed defensively.** It disposed the native view and
`return`ed, so a slot somehow holding both arms would leak the React root. The arms are mutually
exclusive in practice (a slot belongs to one manager, each manager uses one arm), but dispose should
not depend on that. Now both are released independently, with the React disposal in a `finally` so a
throwing native teardown cannot strand it.

**3. `uikit/` imported from `components/` — a real layer violation, fixed.** The new generic `Icon`
face was placed in `components/icons/Icon.tsx`, and `uikit/Popover/PopoverView.tsx:10` imported it —
**the only `uikit/ → components/` import in the codebase**, against uikit's standalone/extraction-ready
rule (`uikit/CLAUDE.md`, [uikit-vs-components-split](../standards/uikit-vs-components-split.md)). Moved
to `uikit/Icon/Icon.tsx` and repointed all 13 importers. `uikit/ → theme/` is the established
direction (`uikit/shared/slots.ts` already depends on `theme/icon-registry`), so the face belongs in
uikit, not the other way round.

This one is worth generalising: **the epic's own closing property named where React may live, but not
where the thing that replaces it may live.** A single generic face is the right design and it was put
in the wrong package, because "components/icons/" is where the icons *were*. A conversion that
introduces a new shared primitive has to ask which layer owns it, not inherit the old file's home.

**4. `PersephoneIcon` theme reactivity — checked, not a defect.** `createElement` calls
`themeState.get().isDark` **inside the builder** (`icons.ts:210-211`), so each invocation re-reads the
theme, and `MainPageView.ts:136` re-invokes `createIconElement("persephone")` on theme change. The
capture-once risk the review flagged does not exist in the implementation. Left as-is; the visual
confirmation is still item 8 on the human list, since only a person can see the glyph change.

All three gates re-run green after the fixes, and the live state is unchanged: 3 roots
(`GlobalStyles`, `monaco-body`, `board-host`), 0 empty SVGs, 0 icon placeholders, ornament rendering.

### US-1138 is implemented, and the sweep found far more than the shell faces I had measured

All three gates green. Deleted **9 faces** (`GitStatusBadge.tsx`, `RefBadge.tsx`, six `ui/sidebar/`
faces, `PageTabs.tsx`), **4 dead barrels** (`file-grid`, `file-list`, `sidebar`, `tabs` — all zero
importers), and **2 post-split stubs**. Split **6 files** into live non-React cores keeping their
module paths stable, so none of their consumers needed editing: `FileGrid.ts` (2 importers),
`FileList.ts` (4), `FileSearch.ts` (2), `Dialogs.ts` (14), `Poppers.ts` (4), `PageTab.ts` (2).

**The stub lesson transferred and paid for itself immediately.** US-1136's split had left a 10-line
zero-importer re-export shim behind, which I only caught by inspection. Passing that finding into this
task's brief — *after each split, re-check the file you split from* — caused it to find and delete two
more of its own (`CategoryView.ts`, `TreeProviderView.ts`). That is the difference E11 named between a
correction applied once and a correction written into the next brief: **the first is a fix, the second
is a class removed.** Two epics running, the mechanism holds.

**Every "keep" is justified by a named consumer, and that list *is* the closing property.** Ten files
survive with a reason: four `ui/sidebar/` faces plus `SecondaryViews.tsx`, `GitTree.tsx` and
`grid-context-menu.tsx` are each held alive by a specific unconverted editor; `EditorErrorBoundary.tsx`
by `AsyncEditorView` and eight editor modules. Recording *why* each one stays is what makes the
closing property checkable rather than rhetorical — and it means Epic F inherits a list of exactly
which editor conversion frees which file.

### `theme/Ornament.tsx` was one more dead face, and it was hiding behind my own scope fence

Found during the closing measurement, not by the sweep — because I had fenced `theme/` off from
US-1138 to avoid a collision with the concurrent icon task. `Ornament.tsx` exported both
`createOrnamentElement()` (live; `PageContentView.ts` uses it) and an `Ornament` React component with
**zero importers** that rendered the *same artwork* through `dangerouslySetInnerHTML`. Identical shape
to `PersephoneIcon`: one drawing, two renderers, one of them dead. Converted to `Ornament.ts`, React
face removed, verified live (`.page-ornament` still renders).

The lesson is about the fence, not the file: **a scope boundary drawn to prevent a collision also
hides whatever is behind it.** Two concurrent tasks needed `theme/` isolated, which was right — but
the exclusion has to come back as a follow-up item, or it silently becomes a permanent gap. It was
only caught because the closing measurement enumerated *every* remaining non-editor `.tsx` and asked
what justified each one, rather than checking a count.

### US-1140 is implemented: 17 contracts widened, both laundering sites deleted

All three gates green. Verified statically:

| Measurement | Before | After |
|---|---|---|
| Contracts declaring `ReactNode` for slot content | 17 | **0** |
| `asReactNode` laundering helper + call sites | 1 + 6 | **0** |
| `as unknown as FileListProps[…]` cast | 1 | **0** |
| `SlotContent` references in the renderer | — | **131** |

**The two rejections held under verification, and one of them is stronger than the plan claimed.**
`Panel.children` renders `{children}` directly as a JSX child (`Panel.tsx:149`) with no `fillSlot`, so
a DOM node would be an invalid React child. `PopoverProps.children` looked like a candidate until
`PopoverView.ts:56-57` turned up: it **throws** if given both `contentView` and `children`. So the
native arm already exists as a *separate prop*, and widening `children` would have made that guard
ambiguous about which arm a DOM node belongs to. A widening that lies is worse than a narrow type,
and this is what that looks like in practice.

**The surviving `ReactNode` declarations outside `editors/` are now exactly the justified ones**, which
is the check that matters more than the count: `EditorErrorBoundary.children` (a React error boundary
by definition), `Panel.children` and `PopoverModel.children` (the two rejections),
`CollapsiblePanelStackProps.children` (the *stack's* React children, a different prop from the panel
content that E11 widened), `PageSlot.render(content: ReactNode)` (the surviving React arm for the
browser editor's internal tabs), and three internal React helpers in `fill-slot.ts`, `highlight.ts`
and `TruncatedTextView.tsx`. Nothing is left that a native producer would have to cast through.

**Two findings from the round, both about the shape of a good correction.**

First, **Codex pushed back on one of my corrections and was right.** I had generalised from
`ButtonView.tsx:11-13` — where `Omit<ButtonProps, "children"> & { children?: SlotContent }` becomes
redundant once the public prop is widened — and asked for the same treatment at
`CollapsiblePanelStackView.tsx:12`. But that `Omit` swaps React `children` for a `panels: CollapsiblePanelProps[]`
array; it is **structural, not a redundant redeclaration**, and removing it would have put a React
`children` prop back into a vanilla view's props and its rest-prop spreading. The `ButtonView` one was
removed, that one stays. *A pattern verified in one place is a hypothesis everywhere else.*

Second, **a widening can introduce the very defect it removes.** The plan proposed widening
`TruncatedText.children` to `SlotContent` and *recording* that `getTextFromReactChildren` has no arm
for a DOM node, so a native caller's overflow tooltip would simply be empty. That would have shipped a
public prop accepting a value it silently degrades on — this epic's defect class, reintroduced by the
fix for it. One line closes it (`children instanceof Node → children.textContent ?? ""`). The general
rule: **widening a type is a promise; if the implementation cannot keep it, either keep the promise or
do not widen.**

### US-1136 is implemented: the icon contract is builder-only, 116 React components → 1 face

All three gates green. 67 files touched, **−1369 lines net**. Verified statically and live:

| Measurement | Before | After |
|---|---|---|
| `theme/icons.tsx` | 713 lines, 21 JSX markers | **`theme/icons.ts`**, no runtime React (one erased `import type { SVGProps }`) |
| `SvgIconComponent` | `((props) => ReactElement) & { createElement?, viewBox? }` | `{ createElement: SvgIconDomBuilder; viewBox? }` — **no call signature, builder required** |
| Named icon JSX tags (`<WarningIcon />` …) | 30 | **0** |
| Generic `<Icon>` call sites | 1 | **20** |
| `icon as never` laundering sites | **6** | **0** |
| Unknown-name behaviour | dev warning + **invisible** empty `<svg>` | visible placeholder, or a thrown invariant violation |
| Renderer non-story `.tsx` | 162 | **154** |
| Live: rendered `<svg>` / empty / placeholders | 238 / 0 / n-a | 79 / **0** / **0** |

**The unknown-name policy landed as designed, split by provenance.** `createIconElement(name: IconName)`
now **throws** `Icon registry invariant violated` — reachable only if code has bypassed the type
system, since `IconName` is a literal union. Runtime-sourced names go through
`createIconPlaceholderElement`, which renders a **visible X glyph** in `currentColor` at the requested
size, carrying `data-icon-placeholder="true"` and an `icon-placeholder` class. So a bad icon name is
now visible to a user *and* addressable by the DOM instrument — where before it was invisible to both.
That is the concrete repair of the defect that cost E11 a wasted round.

**Verified live after a cold start** (the change defeated HMR and the renderer had to be restarted —
see below): the app renders, 0 empty SVGs, **0 placeholders rendered**, meaning no call site was
migrated to a name the registry does not have. That last figure is the one worth keeping: a migration
of 20 tags could easily have introduced a typo'd name, and the placeholder count is what would have
caught it.

**The conversion manufactured a fresh dead face, and the epic's own sweep caught it.** The
`LanguageIcon.tsx` split left behind a 10-line pure re-export shim with **zero importers** — a new
instance of the exact pattern this epic is closing, created *by* the work that closes it. Deleted
during verification. The lesson is small but sharp: **a split leaves a stub, and a stub is a face.**
Any future split should end by re-checking the file it split *from*.

**Recovering the wedged renderer.** A 67-file change defeated HMR; renderer-side MCP calls timed out
while the main process still answered. The documented first remedy (touch a file under `src/main/` to
force a main-process rebuild) did **not** recover it. A full dev-server restart did, and a cold start
is the honest test of a change this size anyway — it exercises the real bootstrap rather than a
hot-swap. Worth recording that for a change of this magnitude the cheap remedy is not worth trying
first: go straight to the restart.

### §E12-4's icon measurements were wrong in three ways, and the investigation caught all three

The scoping numbers in §E12-4 came from a regex over `icons.tsx` rather than from the file's AST, and
the corrections matter because the epic's premise rested on them:

| §E12-4 claim | Truth | Why the scoping measurement lied |
|---|---|---|
| "Icons defined with a JSX body: **0** of 116" | **1** — `PersephoneIcon` (`icons.tsx:240-283`) | The regex matched only the `createIcon(...)(…)` form. It found 115 of 116, and *that gap was the answer* — I read the 115 as "all of them" instead of asking what the missing one was. |
| `LanguageIcon.tsx` needs "`prepareFileIcon` relocated" to become deletable | It needs a **split**; four symbols are live | `components/icons/icon-elements.ts` — the native path every real consumer uses — imports `prepareFileIcon`, `resolveFileIcon`, `subscribeFileIconChanges` and `FileTypeIconProps` from it. I checked component callers and never checked non-component ones. |
| "24 of the 31 JSX call sites are inside unconverted editors" | **19** of 31, across 16 files not 17 | Counted by grep over file paths rather than by resolving which files were staying. |

The claim that survived is the one the epic actually turns on: **all 116 icons have a working DOM
builder**, so `createElement?`'s optionality is vacuous. `PersephoneIcon` has one too — assigned by
hand at `icons.tsx:285` from `getPersephoneBody`, a **template-string duplicate of the same artwork**
that its JSX body draws. So the icon whose existence refuted my count is also the strongest case for
the change: it is the only icon maintained twice, the two copies can drift silently, and its string
copy is already the production path (`MainPageView.ts:103` and `:136` use
`createIconElement("persephone")`; only `AboutView.tsx:156` renders the JSX arm).

**The pattern is the same one E11 named, arriving for the fourth time in two epics: the proxy is not
the measurement.** What is new is the failure mode — not a proxy that over-counted, but a proxy that
*nearly* matched and so was not questioned. 115 of 116 looks like agreement. It was a one-item
discrepancy that contained the whole finding, and it is the same shape as E11's rejected
form-and-panel cut, where "chasing that discrepancy is what found E11's contract." **A count that is
off by one is not a rounding error; it is an unexamined case.**

### The unknown-icon-name hole is entered deliberately, from six places

§E12-4 described `createIconElement`'s empty-`<svg>` fallback as a hole that could be hit. It is
routed into, on purpose, by six `uikit/` call sites spelled:

```ts
createIconElement(isIconName(icon) ? icon : icon as never)
```

Both branches call `createIconElement`, so `isIconName`'s answer is computed and thrown away; the
cast exists only to silence the type error. The six are `Button/ButtonView.tsx:119` and `:136`,
`Dialog/DialogContentView.tsx:199`, `IconButton/IconButtonView.tsx:107`,
`RadioGroup/RadioGroupView.ts:136`, and `Tag/TagView.tsx:133`.

Meanwhile **four** sites already do it correctly — `isIconName(icon) ? createIconElement(icon) : null`
at `ListBox/ListItemView.ts:229`, `Menu/MenuView.ts:49`, `Tree/TreeItemView.ts:311`, and
`ui/sidebar/PinnedRailView.ts:170`. So `uikit/` carries **both spellings of the same decision**, and
the fix is not a new policy but one spelling applied to all ten.

Worth stating plainly, because it changes what "fixed" means: **the correct existing spelling renders
`null`, which is just as invisible as the empty `<svg>`.** Both current behaviours fail silently. That
is why US-1136 introduces a *visible* placeholder rather than simply adopting the majority spelling —
it is an improvement on both, and E11's wasted round chasing empty SVGs is the evidence that
invisibility is the actual defect.

### `ui/app/index.ts` and two more faces are dead — found while reviewing US-1134's plan

The plan proposed deleting `RenderEditor.tsx` and removing its re-export from `ui/app/index.ts` while
keeping the barrel's other two exports. Verification showed the barrel has **no importers anywhere in
`src/`**, and both remaining exports are themselves zero-caller 7-line `mountVanilla` shims:
`MainPage.tsx` (`index.tsx` constructs `MainPageView` directly) and `Pages.tsx` (`MainPageView`
constructs `PagesView` directly). So US-1134 collects **five** zero-caller React shims in one
directory rather than two: `PageContentBridge.tsx`, `RenderEditor.tsx`, `MainPage.tsx`, `Pages.tsx`
and the `index.ts` barrel, plus `components/page-manager/AppPageManager.tsx`.

The pattern is now familiar enough to state as a rule: **a `mountVanilla` face outlives its last
caller silently, because deleting the caller is what makes the face dead and nothing re-checks the
face.** E11 found 20 of them in `uikit/`; this is six more in the shell. Whatever Epic F does about
the removal ledger should include a mechanical "faces with zero callers" sweep, because every
conversion epic manufactures more of them and none of them fails a gate.
