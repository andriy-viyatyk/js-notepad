# EPIC-071 — De-React E13: the editor bodies that still build React

**Status:** Implemented; review complete — awaiting the deferred interactive pass (§E13-13), then close
**Created:** 2026-08-27
**Roadmap:** [de-react.md](../de-react.md) — Epic E, thirteenth epic
**Predecessor:** [EPIC-070](EPIC-070.md) (E12 — the shell's React-typed content)



---

## E13-15 — Close review findings

The close review covered the whole uncommitted E13 tree. It found no dead useMemo/useCallback port in mcp-inspector or link-editor, no additional hidden-branch lifetime issue in the requested surfaces, no constructor/onMount DOM or fragment-to-slot issue, and no new as any or ESLint suppression. The following findings remain open and were not changed by the review:

| Severity | Location | Finding |
|---|---|---|
| Medium | src/renderer/editors/mcp-inspector/McpInspectorView.ts:244 | ServerInfoPanelView mounts MarkdownBlockView without owning/disposing it when the panel changes or is destroyed. |
| Medium | src/renderer/editors/settings/sections/BrowserProfilesSection.ts:401-407,477-486 | Incognito-bookmark-path changes are subscribed but do not update incognitoBookmarks. |
| Medium | src/renderer/editors/link-editor/panels/LinkCategoryPanel.ts:42-50,53-55; LinkCategorySecondaryView.ts:60-71 | bind() remains attached to the old model if the model identity changes. |
| Low | mcp-inspector/McpInspectorView.ts:118,133-137; link-editor/index.ts:260; link-editor/panels/LinkCategoryPanel.ts:79 | Newly introduced as unknown as assertions. |
| Low | mneme-config/MnemeConfigView.ts:75,99; RootsPanel.ts:83-85,184-185,277,308-309; ModelPanel.ts:61,98; mneme-root/MnemeRootEditorView.ts:109-111,182,282-286 | Newly introduced as never assertions. |
| Low | tools-hub/ToolsHubView.ts:26-27; SearchBoardsTab.ts:52-54,229; about/AboutView.ts:52-56,194; mcp-inspector/ToolsPanel.ts:23-25,82-83,86-89,91-94; PromptsPanel.ts:22-24,138,182,184-186,290,310-311; ResourcesPanel.ts:26-28,148-149,173-174,177-178,181,245; ToolArgForm.ts:135,137; McpInspectorView.ts:43-47,52-55,167,208,212,222,230; mneme-config/MnemeConfigView.ts:34,48,56-58,95; ModelPanel.ts:24,46-47,71,87; RootsPanel.ts:42-47,121-129,131-134,136,247,260,266-270; mneme-root/MnemeRootEditorView.ts:61-65,168,251-258 | Newly introduced definite-assignment ! assertions. |
| Low | tools-hub/SearchBoardsTab.ts:177; mcp-inspector/ToolsPanel.ts:131; settings/sections/SettingsSections.ts:205; settings/sections/McpSection.ts:274,279 | Newly introduced expression assertions. |

The review did not act on these findings. mneme-root remains unverified by policy, link-editor tiles mode remains unverified, and the stable Settings 25-vs-24 button delta remains unattributed; all three are still deferred in §E13-13. No app was run and no commit was made by the review.
---

## Closing property

E12 closed the shell: nothing outside `editors/` produces a React element for its own sake. What
remains is **content** — sixteen editor bodies that are React because their own markup is React, with
no type above them demanding it. E10's contract search came back negative, E12's re-ran it and agreed,
and this epic's search (§E13-1) agrees a third time. So E13 is the first epic in this programme scoped
purely by body, and it must say precisely what it closes by, because "convert some editors" is not a
closing property.

It closes on four statements, each checkable:

| # | Statement | Instrument |
|---|---|---|
| 1 | `EditorModule.Component` has exactly **two** callers, and both are the editors that host a `<webview>` — `browser` and `board` | `grep -l '^\s*Component:' editors/*/index.ts*` |
| 2 | **Six** `uikit/` React faces are deleted at zero callers — `Divider`, `Breadcrumb`, `ListItem`, `TagsInput`, `DateInput`, `ProgressBar` — and the **three** faces that are *already* zero-caller (`Tree`, `TruncatedText`, `Tooltip`) are swept with them | the corrected face scanner in §E13-12 |
| 3 | On the everyday text-editing path the application has **one** React root, `GlobalStyles` | `[data-react-root]` on the captured session shape |
| 4 | `MonacoBody`, `LinkBody` and the six `Component`-arm bodies in the cut produce no React element; `EditorErrorBoundary` importers go 9 → 7 | the corrected `createElement` instrument in §E13-2 |

### What must not be claimed

Each of these is a true sentence about this epic that would become false if stated one degree stronger.

- **Not "Epic E is nearly done."** The cut is 59% of the remaining JSX *markers* but leaves the two
  hardest bodies untouched: `graph` (3,278 lines, a canvas, the last consumer of `highlight.ts`'s
  React form) and `rest-client` (1,649 lines), plus `browser` (two `<webview>` elements, the last
  `@floating-ui/react` importer) and `board` (the trust flow and the `BoardWebview` island).
- **Not "the app has one React root."** It has one *on the session shape measured in §E13-3*. Opening
  any of `graph`, `rest-client`, `env-vars`, `file-diff`, `draw`, `browser` or `board` adds one. E11's
  rule stands: a roots figure without the open-page list is not a measurement.
- **Not "the `Component` arm is deleted."** It is reduced to two, and the two are named so E14 inherits
  a scope rather than a search. `EditorErrorBoundary` and the registry's `View` → `Component`
  normalisation shim both survive, because the arm does.
- **Not `Panel`, `Text`, `Button`, `Icon`, `Dot`, `Spacer`, `Checkbox`, `WithMenu`, `Spinner`, `Select`,
  `Tag`, `IconButton`, `Input`, `Textarea`, `Splitter`, `SegmentedControl`, `SelectableRow`,
  `Autocomplete`, `Slider` or `ListBox` collected.** Every one keeps at least one value caller outside
  the cut; §E13-12 records which. Four of these — `Select`, `Tag`, `IconButton`, `Input` — were claimed
  as collected in this document's first draft and are not; see §E13-12.

---

## E13-1 — The contract search, negative for the third consecutive time

E5-1 requires every epic to search the import graph for a React-typed declaration that pins callers
which would otherwise be vanilla, rather than inherit the previous epic's axis. Six epics running
(E4–E9) that search found one. E10's came back negative, E11 reversed E10's own verdict on
`Story.component`, E12's found the shell's three. This one is negative, and the candidates fail for
different reasons — which is what makes the negative credible rather than a failure to look.

| Candidate | Measured | Verdict |
|---|---|---|
| `EditorModule.Component: React.ComponentType` | 8 callers | **Load-bearing.** Each of the eight bodies is genuinely React, so the arm pins nobody. Unchanged from E10's reading, re-verified |
| `EditorErrorBoundary` (`ui/app/EditorErrorBoundary.tsx`) | 9 importers, 7 of them `View`-arm editors | **A consequence, not a contract.** It is required *because* the body inside it is React; converting a body removes its need. It cannot be deleted until the last React body goes |
| `uikit/shared/highlight.ts` React form | **1** consumer (`graph/GraphBody.tsx`) | One caller is not a contract — the fourth rejection on caller count. The removal ledger's row is stale and is corrected in §E13-5 |
| `WithMenu`'s render-prop face | 5 callers (`browser`, `rest-client` ×3, `settings`) | A render prop has no vanilla equivalent; `openMenu` already sits underneath it. Precondition unmet |
| `applyRestProps` / `clearRestListeners` / `bindRef` / `fillSlot` | unchanged since E10 | **Precondition unmet** — still waiting on the last JSX caller |
| `TextChromeViewProps.children` | already `SlotContent` | **Already widened**, by Epic B. E12 measured this and declined to act: an epic built on it deletes nothing |
| `Story.component` for `Panel`/`Text` | 2, permanent | Settled by C1 — neither has a vanilla twin |

**So the axis is content, and content means bodies.** The remaining Epic E is sixteen editor bodies;
this epic takes eight of them and the next takes the rest. That is the honest shape, and stating it
plainly is better than manufacturing a contract to close against — the failure E2 named.

---

## E13-2 — E12's corrective table was contaminated, and five editors are already free

E12's headline finding was that this programme's arm count is a proxy: `EditorModule.Component`
callers measures which arm a module *registers on*, not whether it produces React. That finding is
correct and stands. **The table it published to prove it is not.** Its `createElement` column counted
`document.createElement` and, after E12's own icon migration, `SomeIcon.createElement()` — the DOM
builder that epic had just created.

Re-measured, excluding `document.createElement`, `createElementNS`, and `*Icon.createElement` /
`icon.createElement` / `component.createElement`:

| Editor | E12 claimed | Actually React `createElement` | What the residue was |
|---|---|---|---|
| `notebook` | 42 across 7 files | **0** | 39 `document.createElement`, 5 `RunIcon`/`icon.createElement` |
| `log-view` | 24 across 16 files | **0** | 24 of 24 `document.createElement` |
| `markdown` | 17 | **0** | 17 `document.createElement`, 7 icon builders |
| `grid` | 5 | **0** | 5 of 5 `document.createElement` |
| `video` | 5 | **0** | 5 `document.createElement`, 1 `PlayerIcon.createElement` |

**All five produce no React at all.** They hold zero JSX and zero React `createElement`; they are
fully converted, and E12 listed them as unconverted. This is the **ninth** instance of *the proxy is
not the measurement*, and the first where the contaminated instrument was the one built to correct a
proxy — the correcting measurement inherited the very defect it was diagnosing. The generalisation
worth carrying: **an instrument built to replace a proxy must be validated against the thing it
newly touches.** E12 created 116 `Icon.createElement` call sites and then counted `createElement`.

### The honest body count

React production = JSX closing markers (`/>`, `</`, `<>` outside strings and comments — E12's
instrument, which is sound) plus genuine React `createElement`. Sixteen editors produce React:

| Editor | JSX markers | React `createElement` | JSX-bearing files | lines | arm |
|---|---:|---:|---:|---:|---|
| `settings` | 284 | 0 | 8 | 829 | Component |
| `mcp-inspector` | 238 | 0 | 8 | 1,650 | Component |
| `graph` | 199 | 6 | 7 | 3,278 | View |
| `rest-client` | 130 | 5 | 5 | 1,649 | View |
| `browser` | 118 | 3 | 8 | 1,481 | Component |
| `mneme-config` | 114 | 0 | 3 | 589 | Component |
| `board` | 46 | 1 | 8 | 907 | Component |
| `tools-hub` | 42 | 0 | 3 | 272 | Component |
| `mneme-root` | 41 | 0 | 2 | 286 | Component |
| `link-editor` | 40 | 14 | 5 | 931 | View |
| `env-vars` | 34 | 5 | 1 | 405 | View |
| `about` | 34 | 0 | 2 | 242 | Component |
| `file-diff` | 8 | 14 | 2 | 207 | View |
| `draw` | 5 | 3 | 1 | 164 | View |
| `monaco` | 2 | 4 | 1 | 239 | View |
| `base` (`EditorError.tsx`) | 2 | 0 | 1 | 24 | — |
| **Total** | **1,337** | **54** | **65** | | |

Free of React, and therefore not in any remaining epic: `notebook`, `log-view`, `markdown`, `grid`,
`video`, `image`, `mermaid`, `compare`, `archive`, `text`, `svg`, `explorer`, `git-tree`, `category`,
`board-info`, `toolset`.

### The seven `View`-arm producers share one shape

Every one is a `VanillaView` chrome handing a React body through a slot:

```ts
// editors/monaco/index.ts:23 — and the same four lines in the other six
children: createElement(EditorErrorBoundary, null, createElement(MonacoBody, { model })),
```

So the `View` arm is honest about the chrome and silent about the body. `TextChromeViewProps.children`
has accepted `Node` since Epic B, so each of these seven is unblocked *today* — the only work is the
body.

---

## E13-3 — The live baseline, and why `MonacoBody` is the best remaining target

Measured on the user's real session at scoping (structure only — no page content read), 7 pages open,
4 with a resolved editor:

| | Count |
|---|---:|
| `[data-react-root]` | **4** |
| `[data-part="react-slot"]` | 3 |
| `[data-name="page-slot"]` | 7 |

Root chains: one at `div < div < body` (`GlobalStyles`), and **three** at
`span < span < text-chrome-root`, each with first child `DIV[monaco-body]`.

**Three of the app's four live React roots are `MonacoBody`, and the fourth is Emotion.** E12's rule
holds exactly — roots are `1 (GlobalStyles) + 1 per React-producing editor instance`, with no term
that scales with open tabs — and on the everyday text-editing path the only React-producing editor
instance is Monaco.

`MonacoBody.tsx` is **239 lines with 2 JSX markers**, and its entire render is:

```tsx
<Panel name="monaco-body" direction="column" flex position="relative" overflow="hidden">
    <MonacoEditorHost initialValue={…} language={…} onMount={handleMount} onChange={handleChange} options={…} />
</Panel>
```

`MonacoEditorHostView` — the vanilla twin `MonacoEditorHost` mounts — was built in E1 and converted in
E3. `createPanelElement` has 378 call sites. The remaining 230 lines are hooks wiring (one state
slice, two typed-queue subscriptions, a mount callback, three effects) plus four helpers at the bottom
of the file that are already framework-free. **One 239-line file removes three of four live roots**,
which makes it the best Rule 4 payoff per unit of risk since E6's icon contract — and unlike E6 it is
a single-file change.

This is why E13 includes `monaco` even though it is not part of the group that gives the epic its
collection: the roots metric and the collection metric point at different files, and taking both costs
one task.

---

## E13-4 — The cut, and the collection it earns

**Eight editors: the `Component` arm's six non-webview members, plus `monaco` and `link-editor`.**

| Editor | JSX markers | lines | why in |
|---|---:|---:|---|
| `settings` | 284 | 829 | holds `Select`, `IconButton`, `Input`, `Divider` |
| `mcp-inspector` | 238 | 1,650 | holds `Tag`, `Divider` |
| `mneme-config` | 114 | 589 | holds `Tag`, `Divider` |
| `tools-hub` | 42 | 272 | holds `Tag` |
| `mneme-root` | 41 | 286 | `Component` arm |
| `about` | 34 | 242 | holds `Divider` |
| `link-editor` | 40 | 931 | holds `IconButton`, `Input`, `Breadcrumb` via `createElement` |
| `monaco` | 2 | 239 | 3 of 4 live roots (§E13-3) |
| **Total** | **795** (59% of 1,337) | **5,038** across 32 files | |

### What it collects

> **SUPERSEDED — see §E13-12.** The table below was built with a JSX matcher that missed every
> multi-line opening tag, so it lists four faces as collected that are not (`Select`, `Tag`,
> `IconButton`, `Input`) and understates the live-caller set. It is kept unedited as the record of what
> the epic was scoped on. **Use §E13-12 for any collection or deletion decision.**

A `uikit/` React face is collectable when every caller that uses it *as a value* — JSX tag or
`createElement` argument — lies inside the cut.

| Face | Value callers | Collected |
|---|---|:-:|
| `Select` | `settings` | ✔ |
| `Divider` | `about`, `mcp-inspector`, `mneme-config`, `settings` | ✔ |
| `Tag` | `mcp-inspector`, `mneme-config`, `tools-hub` | ✔ |
| `IconButton` | `settings`, `link-editor` (`createElement`) | ✔ |
| `Input` | `settings`, `link-editor` (`createElement`) | ✔ |
| `Breadcrumb` | `link-editor` only (`createElement`) | ✔ |
| `Checkbox` | `settings`, **`rest-client`** | ✘ |
| `Spacer` | `mcp-inspector`, `mneme-config`, **`browser`**, **`rest-client`** | ✘ |
| `Dot` | `mcp-inspector`, `mneme-config`, `settings`, **`board`**, **`browser`** | ✘ |
| `WithMenu` | `settings`, **`browser`**, **`rest-client`** | ✘ |
| `Spinner` | `mneme-root`, **`browser`**, **`draw`**, **`graph`** | ✘ |
| `Button` | 10 holders, 5 outside | ✘ |
| `Text` | 14 holders, 8 outside | ✘ |
| `Panel` | 16 holders, 9 outside | ✘ |
| `Icon` | `about`, `board`, `browser`, `graph`, `link-editor`, `settings` | ✘ |

**Six collected.** Five more (`Checkbox`, `Spacer`, `Dot`, `WithMenu`, `Spinner`) fall to E14 with
`browser`, `board`, `rest-client`, `graph` and `draw`, which is worth recording so E14 inherits the
list rather than re-deriving it.

### And fifteen faces that are already dead

> **SUPERSEDED — see §E13-12.** It is **three** (`Tree`, `TruncatedText`, `Tooltip`), not fifteen.
> Twelve of the fifteen have live callers that the scoping matcher could not see.

Separately from the cut, these `uikit/*.tsx` faces have **zero** value callers anywhere in the
renderer right now, and every one holds zero JSX itself — they are `mountVanilla` shims that outlived
their last caller:

`Autocomplete`, `DateInput`, `ListBox`, `ListItem`, `ProgressBar`, `SegmentedControl`,
`SelectableRow`, `Slider`, `Splitter`, `TagsInput`, `Textarea`, `Tooltip`, `Tree`, `TruncatedText`,
and `AlertsBar` (whose *component* is dead; the file is retained per the removal ledger because
`src/renderer/index.tsx` imports the live `AlertsBarView` and the module owns `alertsBarModel`).

E12 said Epic F should include a mechanical zero-caller sweep, "because every conversion epic
manufactures more and none of them fails a gate." **E13 executes that sweep rather than deferring it
again**, for the reason E12 gave and for one more: three of these fifteen are the exact faces E11
cited when it rejected this cut (§E13-6), so leaving them in place is what would let the next epic
re-derive a stale rejection. Per E11's type-relocation finding, deleting a face is usually a
type-relocation job — each of the fifteen is measured for type importers in its task, and a file that
is still the live props module is renamed `.ts`, not deleted.

### Why not the alternatives

- **The whole `Component` arm** (adding `browser` and `board`) would delete the arm outright, plus
  `EditorToolbar.ts`, `ContentHostFooter.ts` and the `@floating-ui/react` dependency — a much stronger
  close. It loses on 6,256 lines *and* on concentrating all four remaining hard hazards (two
  `<webview>` elements destroyed by reparenting, the board trust flow, the `BoardWebview` island, the
  floating-ui port) in one epic. E11 rejected the same concentration; that reasoning has not expired.
- **`{browser, mcp-inspector, mneme-config}`** is `EditorToolbar.ts`'s exact caller set, so it deletes
  a removal-ledger entry and uninstalls `@floating-ui/react` — two real collections, 3,720 lines. It
  loses because it collects **zero** `uikit/` faces: `Divider`, `Tag` and `Spacer` each miss by
  exactly one holder outside it, and it takes the webview hazard for a smaller haul.
- **The seven `View`-arm bodies** (§E13-2) would make the arm honest — the closing property E12's
  finding most directly invites. It loses on 6,979 lines, of which `graph` alone is 3,278 with a
  canvas. E14 can take it once `graph` and `rest-client` are the only two left.

---

## E13-5 — Measurement corrections this epic records

Four of the five are corrections to instruments built during this scoping and then caught, which is
the point of recording them: each is a way to under- or over-count that survives a green build.

1. **E12's corrective table was contaminated by E12's own migration** — §E13-2. Ninth instance of
   *the proxy is not the measurement*; first where the contaminated instrument was the corrective one.
2. **A JSX-tag grep misses `createElement(Face, …)`.** The first face-holder table built here credited
   `Breadcrumb` with zero callers and under-counted `IconButton`, `Input`, `Button` and `Text`.
   `link-editor/index.ts` alone holds four faces alive that way, and `file-diff/index.ts` holds
   `Text`. Same shape as E11's tagless-wrapper finding, arriving from the consumer side: **a component
   with no JSX tag anywhere can still have live callers.**
3. **A module-path grep misses barrel re-exports.** The first cut of the face scanner matched import
   *paths* and reported five zero-caller faces. `WithMenu` alone has five callers, every one importing
   it from `uikit` or `uikit/Menu`. **Match the symbol, not the path** — a barrel is a caller's alias
   for a file it never names.
4. **A comment is not a caller.** `Tooltip.tsx` looked held by `link-editor` because
   `LinkTooltip.tsx:21` mentions `<Tooltip content={…}>` in prose while the code uses the vanilla
   `attach-tooltip`. Same family as E9's `<TextChrome` grep returning a comment at
   `graph/GraphBody.tsx:302`.
5. **The removal ledger's `highlight.ts` row is stale.** It reads "Two editor consumers still use it:
   GraphBody and LinkCategoryPanel"; `LinkCategoryPanel` is gone. One consumer remains,
   `graph/GraphBody.tsx`, so the row's unblock condition is now a single editor. Corrected in the
   roadmap at close.

---

## E13-6 — E11's rejection of this cut has expired, and E11 is why

E11 measured the *form-and-panel* group — `settings`, `mcp-inspector`, `mneme-config`, `mneme-root`,
`about`, `tools-hub` — described it as "the safest large group left in `editors/`", and rejected it
on two grounds:

> They lost because they close by shrinking a number, and because the three uikit faces they appeared
> to strand (`DateInput`, `ProgressBar`, `TagsInput`) each keep one caller: their own story.

**E11 then deleted every story.** All three faces now have zero callers, verified. So the second
ground was dissolved by the epic that raised it, and the first is answered by adding `link-editor` and
`monaco`: the cut now collects six live faces, sweeps fifteen dead ones, and moves the live root count
to one — three collections, none of which is a number shrinking.

This is the **third** time re-measuring has *promoted* a rejected or deferred candidate rather than
rejecting an inherited one (E11 promoted E10's `Story.component`; E12 promoted the shell contracts
E10 had called nominal), and the ninth instance overall of *a forward-looking note is a measurement
with a date on it*. The sharper version, since it now holds twice: **when an epic rejects a cut on a
blocker it is itself about to remove, the rejection expires at that epic's close, not later.** E11's
own note should have said so. E13's equivalent debt is recorded in §E13-9 for E14.

---

## E13-7 — Concerns

1. **`mcp-inspector` and `link-editor` hold 93 of the cut's ~100 memo/callback sites** —
   `mcp-inspector` 19 `useMemo` + 28 `useCallback`, `link-editor` 4 + 36. E10's close review found the
   defect class this exactly invites: *a `useMemo` whose result feeds a callback becomes dead code if
   the port defines the recompute but never calls it* — `CommitDiffPanel`'s `changeMapFor()` was
   defined and never called, and `tsc`, ESLint and `build-prod` all stayed green because an empty
   `Map` is still a `Map`. **Every ported `useMemo`/`useCallback` must be checked for a live caller,
   and that check is an acceptance criterion on each task, not a review item.** The symptom is
   *absence*, which no count can measure.
2. **`link-editor` is the messiest small editor in the cut**: 9 `useState`, 10 `useEffect`, 8
   `useRef`, `LinkTooltip.tsx`, `PinnedLinksPanel.tsx`, and three registered secondary views. It earns
   its place on collection (three faces) but it should be its own task, sequenced late, and its
   `index.ts` `createElement` chrome contributions converted *before* `LinkBody`, per E9's rule to
   derive order from the import graph rather than the containment relationship.
3. **`MonacoBody` is the everyday text path.** A regression here is a regression in the application's
   primary function, and it will not show up as a blank page — Monaco mounts through
   `MonacoEditorHostView` either way. The risks are the two typed-queue subscriptions
   (`typedQueue.use` / `useRequest` drive `revealLine`, `highlightText`, `focus`, `getSelectedText`,
   `getCursorPosition`, `insertText`, `replaceSelection` — the whole scripting surface for text pages)
   and the mount autofocus guarded by `isFocusInSidebar()` (US-808). Both need live verification, not
   a root count.
4. **`useState` → what?** 18 `useState` across the cut. E1-7's decision stands: a vanilla view has no
   render function for state to live in, so the lift and the translation are one edit. But
   `mcp-inspector`'s 7 are the only ones dense enough to need a decision — a `TComponentState` slice on
   the model, or view fields with explicit `bind()`. Recommend the model slice where the value is read
   by more than one child, view fields otherwise, and record which was chosen per file.
5. **`bind()` is only for state that outlives the view** (E10). Several of these editors subscribe to
   changing sources — `mneme-config`'s roots, `mcp-inspector`'s selected tool. `bind()` registers its
   unsubscribe through `own()`, which has no early-release API, so re-binding a changing source both
   leaks and lets stale sources push values.
6. **The persistent-child consequence** (E10): React unmounting a subtree suppressed side effects for
   free. `mcp-inspector`'s panels and `settings`' sections are tab/section switches today; a native
   parent that keeps inactive branches mounted makes them live. Every conditional branch must be
   audited for a side effect that was previously suppressed by unmounting.
7. **No `DocumentFragment` into a slot** (E10) and **a cache of a single-use DOM node is a bug**
   (E6). Both classes recur in every conversion epic in this programme.
8. **US-1131 is due before this epic, and this epic is the reason.** The dashboard says the
   `VanillaView` constructor guard is "due before the next conversion epic"; E13 writes roughly thirty
   new `VanillaView` subclasses, the largest batch since E9. Four violations across three epics, two
   of them live crashes, none catchable by any gate. **Recommend absorbing US-1131 as E13's first
   task** rather than running the epic and inviting the fifth instance — it is cheap, it is mechanical,
   and it protects everything after it. It must also cover mount/construction failure, per the
   EPIC-070 amendment on that ticket.
9. **The fifteen-face sweep is a type-relocation job, not a deletion** (E11). Budget for renames to
   `.ts` and for moving props interfaces, and expect the file count to fall by far less than fifteen.
   E11 predicted "≥15 faces deleted" and deleted 2.
10. **A dead barrel hides a dead face** (E12). Each of the fifteen has an `index.ts`; check it, and
    check `uikit/index.ts`, or the sweep will leave re-exports pointing at deleted symbols.
11. **`link-editor` and `settings` both sit beside registered secondary views.**
    `LinkCategorySecondaryView`, `LinkTagsSecondaryView` and `LinkHostnamesSecondaryView` are already
    vanilla per E5, but they are in the same folder and will be read during the conversion. Do not
    widen scope into them.

---

## E13-8 — Non-goals

- **`graph` and `rest-client`.** The two large React bodies; E14's core.
- **`browser` and `board`.** The webview pair; they keep the `Component` arm alive by design here.
- **`env-vars`, `file-diff`, `draw`.** Small `View`-arm React bodies left for E14 so this epic's
  hazard profile stays flat; none of them collects anything on its own.
- **`EditorErrorBoundary`, the `Component` arm, the `View` → `Component` normalisation shim.** All
  three survive because `browser` and `board` do.
- **`applyRestProps` / `clearRestListeners` / `bindRef` / `fillSlot`.** Precondition still unmet.
- **`@floating-ui/react`, `react-markdown`, `hast-util-to-jsx-runtime`, Emotion.** Epic F, except that
  `@floating-ui/react` needs `browser` first.
- **Renaming `.tsx` files that hold no JSX.** E12's rule: a rename that changes nothing is the
  number-shrinking failure. Only rename where a face's React half actually dies.
- **Any editor in the free list** (§E13-2). They are done; do not re-open them to tidy.

---

## E13-9 — Tasks

Ordered so that each task's collection is possible when it runs, and so the two hook-heavy editors
come after the pattern is established by simpler ones.

| # | Task | Scope |
|---|---|---|
| 1 | US-1142 | The `VanillaView` constructor/mount guard (US-1131), absorbed per §E13-7.8 |
| 2 | US-1143 | `monaco` — `MonacoBody.tsx` → `MonacoBodyView`; the roots headline (§E13-3) |
| 3 | US-1144 | `about` + `tools-hub` — the two simplest bodies; establishes the pattern |
| 4 | US-1145 | `mneme-root` + `mneme-config` |
| 5 | US-1146 | `settings` — 8 files, 284 markers; collects `Select` |
| 6 | US-1147 | `mcp-inspector` — 8 files, 238 markers, 47 memo/callback sites (§E13-7.1) |
| 7 | US-1148 | `link-editor` — `index.ts` chrome contributions first, then `LinkBody`; collects `Breadcrumb` |
| 8 | US-1149 | The face collection: `Select`, `Divider`, `Tag`, `IconButton`, `Input`, `Breadcrumb` |
| 9 | US-1150 | The zero-caller sweep: the fifteen dead faces, their barrels, and `uikit/index.ts` |
| 10 | US-1151 | Closing measurement against §E13-3's baseline, and the roadmap/ledger corrections in §E13-5 |

**Carried into E14 so it inherits a scope rather than a search:** `browser`, `board`, `graph`,
`rest-client`, `env-vars`, `file-diff`, `draw` — seven bodies, roughly 8,100 lines. It collects
`Checkbox`, `Spacer`, `Dot`, `WithMenu`, `Spinner`, `highlight.ts`'s React form, `EditorToolbar.ts`,
`ContentHostFooter.ts`, `EditorErrorBoundary`, the `Component` arm and the normalisation shim, and it
uninstalls `@floating-ui/react`. It is the last epic in Epic E. **Per §E13-6, E14 must re-measure any
blocker E13 removes rather than inherit this paragraph** — it is a measurement with a date on it.

---

## E13-10 — Progress

- [x] US-1142 — `VanillaView` constructor/mount guard
- [x] US-1143 — `monaco`
- [x] US-1144 — `about` + `tools-hub`
- [x] US-1145 — `mneme-root` + `mneme-config`
- [x] US-1146 — `settings`
- [x] US-1147 — `mcp-inspector`
- [x] US-1148 — `link-editor`
- [x] US-1149 — face collection
- [x] US-1150 — zero-caller sweep
- [x] US-1151 — closing measurement

---

## E13-11 — Findings during implementation

*Appended as tasks land. Each entry is a correction or a lesson that outlives its task.*

### US-1142 — "four violations of one rule" was three violations of two rules, and one non-defect

The premise this task inherited — from EPIC-069's close and carried in US-1131 — is that *the
constructor must not create or touch child DOM* had been broken **four times across three epics**. The
investigation measured it and the premise is wrong in three ways.

**First, `this.child(...)` in a constructor is not a violation; the contract explicitly permits it.**
`src/renderer/uikit/CLAUDE.md`'s lifecycle list says *"Ownership and mounting are separate operations.
`claimViewOwnership(view)` and `this.child(view)` only register lifetime ownership; they do not call
`mount()`"*, and `vanilla-view.ts:157-163` confirms `child()` neither mounts nor attaches. There are
**157 constructor `this.child(...)` calls across 59 classes**, including `MonacoEditorView:30`,
`PagesView:13`, `RenderEditorView:19`, `MainPageView:63-66` and every dialog view E7 wrote. The first
plan proposed forbidding them and migrating the baseline — a ~75-class refactor with no defect behind
it, arriving as a side effect of a guard task. Caught at plan review.

**Second, the four incidents are two distinct classes, and one of the four is not a defect.**

| Class | Incidents | Signature | Measured baseline |
|---|---|---|---:|
| **A — read-before-create** | `NotificationView` (`this.iconHost.dataset`), `BlockingBranchView` (`this.header`/`this.content`) — **both live crashes** | a field whose only assignment is in `onMount()`, dereferenced synchronously in the constructor | **0** |
| **B — claim-twice** | `ProgressPillView` — a leak, not a crash | a field assigned from `this.child(...)` in more than one method | 4 candidates |
| *(neither)* | `MermaidBodyView` | — | — |

`MermaidBodyView` (`:79-107`) and its `MermaidLoadingView` (`:47-64`) do create → claim → hand the
child root to `createPanelElement` → `mount()` in `onMount()`, exactly like the other ~75 classes.
Nothing reads an uncreated field; nothing is claimed twice. **US-1055 is a style deviation from an
over-strict sentence, not the live violation the dashboard has called it since EPIC-060.** The
programme has been carrying a "known live crash path" that does not exist.

**Third, three of the rule's four prohibitions were already perfectly clean, and the fourth is the
convention.** Brace-matched across all 197 files containing `extends VanillaView`: constructor
listeners **0**, timers **0**, measurement **0** — while child-DOM `append*` is at **49 sites**. So the
three clauses that cost nothing to enforce were never enforced, and the one clause that would cost ~75
classes is the one the rule stated most prominently.

**The generalisation, and it is a new one for this programme:** *a rule with no enforcement drifts
toward whichever clause is cheapest to violate, and the drift is invisible while the rule reads as a
single sentence.* Every epic since C1 has cited this rule as one prohibition and counted violations
against it; splitting it into four clauses and measuring each separately is what showed that three had
never been violated and the fourth had never been obeyed. The related lesson from E12 —
*a count that is off by one is not a rounding error, it is an unexamined case* — has a companion here:
**a count of violations against a compound rule is not a measurement of anything**, because it silently
sums incidents from clauses with completely different baselines.

Consequences applied in this task: the rule text is narrowed to *whatever the constructor touches, the
constructor must have created; whatever `onMount()` creates, only `onMount()` and later may touch* —
which covers all three real incidents and all ~75 existing sites — with the listener/subscription/
measurement/timer prohibitions kept verbatim and now enforced at zero baseline. US-1055 is closed as
not-a-defect.

**And a real defect in EPIC-070's own fix, found by the same investigation.**
`components/page-manager/PageSlot.ts` calls `attach(root)` at `:57` and `new viewConstructor(...)` at
`:58`, both **outside** the `try` that begins at `:63`. EPIC-070's close review added that `try` for
mount failure and stopped there, so a **constructor** throw still leaves the slot attached with no
rollback and the page permanently blank — the exact failure the EPIC-070 fix was written to prevent,
surviving one door along. *A rollback added for one failure mode is not a rollback.*

### US-1143 — the headline closing property is met at task 2 of 10

`MonacoBody.tsx` (238 lines) is `MonacoBodyView.ts`; `editors/monaco/` now contains **zero**
references to `react`, `createElement` or `EditorErrorBoundary`. Verified live after a **cold dev-server
restart** (the rename is reached through a dynamic `import()`, which E11 established HMR cannot clear),
against the US-1151 baseline:

| Check | Baseline | After | |
|---|---:|---:|:-:|
| `monaco` React roots | 1 | **0** | ✔ |
| **whole-app React roots** | 4 | **1** | ✔ |
| `CANVAS` (Monaco internals) | 3 | 3 | ✔ |
| `TEXTAREA` | 1 | 1 | ✔ |
| the six `data-name` markers | 6 | 6 | ✔ |
| `emptySvgs` | 0 | 0 | ✔ |
| `.monaco-editor` present | yes | yes | ✔ |

Element count went 115 → 84, which is the React slot wrapper's own spans disappearing; the plan
deliberately did not make 115 an acceptance criterion (a count is not the surface — the markers are).

**All seven typed-queue operations were exercised live, not inspected.** This matters more than the
root count: the queue is the entire scripting surface for text pages, and a break in it is invisible to
`tsc`, ESLint, `build-prod` and any DOM digest. `insertText` wrote four lines; `getCursorPosition`
returned `{5,1}`; `revealLine(3)` moved the cursor to line 3; `getSelectedText` returned `""` with no
selection and the full buffer after a real `Control+a`; `setHighlightText("bravo")` produced exactly
**1** `.findMatch` decoration and clearing it returned to **0**; `replaceSelection` replaced the whole
buffer; and `focus` left `document.activeElement` inside `.monaco-editor`. Real keyboard input was used
for the selection because a dynamically imported `monaco-editor` reports **0 editor instances** — E12's
*importing app modules by path gives a second instance* finding, arriving in a new place.

**Two design decisions from the plan review worth carrying to the remaining conversions.** First,
**`bind()` was the wrong tool and the plan said why**: `TextHostEditorModel` reassigns `_host` at
`:80`, `:208` and `:222` through `adoptHost`/extraction, so the state source changes identity, and
`bind()` registers its unsubscribe through `own()` with no early-release API — a permanent bind would
leave the old host pushing content into the current editor. The conversion uses a replaceable selector
subscription torn down in `onUpdate()`. That is E10's *`bind()` is only for state that outlives the
view* finding applied prospectively for the first time rather than discovered as a bug.
Second, **`ComponentQueue.subscribe()` drains what was queued at subscribe time**
(`ComponentQueue.ts:35`, `:87`), so the handlers must be registered *after* the Monaco host mounts or a
restore-time `revealLine` is drained into a handler with no editor and silently dropped. Ordering is
load-bearing and the React version got it right only by accident of effect ordering.

**Removing `EditorErrorBoundary` from this body is not a loss of coverage**, because US-1142 replaced it
with something wider: `VanillaView.mount()` now disposes and rethrows on a failed `onMount()`, and
`PageSlot`/`AsyncEditorView` roll back their own attachment. A React-only render guard became a
lifecycle-wide one. The two tasks were planned independently and this dependency was found at review.

### US-1142 — verified by behaviour, not by inspection

The guard is four enforced ESLint clauses (constructor listeners/subscriptions, timers, layout
measurement — all three at a measured **zero** baseline — plus Class A) and one narrow Class B rule; all
four Class B candidates turned out legitimate (distinct classes, or a released branch replacement). The
`mount()` rollback was exercised directly against a view whose `onMount()` throws: the original error is
preserved, the owned child is disposed, `onDispose()` is correctly **skipped** on the half-built parent,
and a second `mount()` does not retry. `npm run typecheck` and `npm run lint` both clean, re-run
independently.

**A residual gap in the guard, recorded rather than closed:** the rule matches only `extends VanillaView`
directly. Verified today there are **no** indirect subclasses at any depth, so coverage is complete — but
it is complete by accident of the current tree, and the first `class X extends SomeOtherView` silently
leaves the guard's scope. E9 already met that shape (`ContentHostFooterView extends EditorToolbarView`,
which it removed because *a footer contains a toolbar; it is not one*). The cheap closure is a fifth rule
forbidding any class from extending a `VanillaView` subclass — zero baseline today, and it makes the
direct match complete by construction. Not done here to keep the guard task from growing; it belongs in
the same ticket family as US-1131.

### US-1144 — the largest React concentration in the app is a per-row root, and it is not in an editor

Scoping this task produced a measurement that outlives it. The `tools-hub` "Registered boards" tab
holds **26** React roots in the editor and **29** app-wide — more than every editor body in the cut
combined. They decompose by DOM chain into three shapes:

| Roots | Chain | Owner | Freed by E13? |
|---:|---|---|:-:|
| **1** | `div < div < div < @page-editor < div < div < @page-slot` | the `tools-hub` React body (`Component` arm) | ✔ |
| **1** | `#react-slot < div < div < div …` | `ui/sidebar/TrustedBoardsListView.tsx:155-157` — `fillSlot(React.createElement(TrustedBoardsTreeSlot))` | ✘ shell |
| **24** | `#react-slot < span < div < div < #area < #scroll` | one `fillSlot` React arm **per rendered row** inside a virtualized scroll area (16 `<img>`, 88 tree rows) | ✘ shell |

**So this task removes exactly one of the twenty-six**, and the honest acceptance criterion is not a
count at all: *exactly one root disappears — the one whose chain ends at `@page-editor` — and every
remaining root's chain begins at `#react-slot`.* I initially told the implementing agent the tab held
**1** root; it wrote that into the acceptance criteria, and an unqualified "0" or "1" there would have
made the closing measurement report a catastrophic regression on a correct result. Caught by measuring
instead of predicting.

**The finding, and it sharpens E11's:** E11 established that the root count is not monotonically
decreasing, because it varies with which pages are open. This is worse — **it varies with how much
content exists and how much of it is on screen.** A root count for this surface is meaningless without
the number of registered boards and the window height. Two consequences:

- *Rule 4's instrument has no content-independent form on virtualized surfaces.* Every roots figure this
  programme has published for a list-bearing surface is a figure for one machine's data.
- **The best remaining roots-per-line target in the tree is not an editor.** It is
  `TrustedBoardsTreeSlot` / `TrustedToolsTreeSlot`, two shell components E12 named as deliberate
  survivors of its closing property — *"views held by the `tools-hub` and browser editors"* — without
  measuring what they cost. E12's list was right about which files survived and silent about their
  weight. That is a candidate for E14 or a shell follow-up, measured here so the next scoping does not
  have to find it: **E12's survivor list is a list of files, not a list of roots, and one entry on it
  outweighs all eight editors in E13's cut.**

**A collection the plan missed and now makes.** Four `ui/sidebar/*.tsx` `mountVanilla` faces have
`editors/tools-hub/ToolsHubView.tsx` as their **only** caller — `BuiltinEditorsList.tsx`,
`PinnedRail.tsx`, `TrustedBoardsList.tsx`, `TrustedToolsList.tsx` — because the sidebar itself
constructs the native views directly (`ui/sidebar/ToolsEditorsPanelView.ts:99-100`). Converting one
editor therefore deletes four shell files. The first plan stated the task collected nothing, on the
correct-but-incomplete grounds that face collection is US-1149's job; US-1149 owns `uikit/` faces, and
these are `ui/sidebar/` faces that only this conversion can free. **E12's rule holds again — a
`mountVanilla` face outlives its last caller silently — and this is the first time in the programme a
conversion *freed* four rather than manufacturing more.**

**US-1144 verified live after a cold restart.** `about`: 1 → **0** roots, all five `about-*` markers
present, 3 buttons, and the SVG's geometry identical to the baseline (`g` 1, `circle` 5, `path` 8,
`line` 3) — the check that an icon did not silently become the blank placeholder. `tools-hub`, per tab,
against the chain-based criterion rather than a count:

| Tab | roots before | after | roots at `@page-editor` | all survivors start at `#react-slot` | buttons |
|---|---:|---:|---:|:-:|---:|
| Built-in | 1 | **0** | 0 | ✔ | 24 = 24 |
| Registered boards | 26 | **25** | 0 | ✔ | 37 = 37 |
| Search boards | 1 | **0** | 0 | ✔ | 21 = 21 |
| Tools | 2 | **1** | 0 | ✔ | 13 = 13 |

`emptySvgs` 0 on every tab. Four `ui/sidebar/*.tsx` faces deleted; the `Component` arm is **8 → 6**.

**The tab sequence incidentally verified the persistent-child fix**, which is the part no static check
could reach: the tabs were visited Built-in → Registered boards → Search boards → Tools, and "Search
boards" measured **0** roots immediately after "Registered boards" measured 25. So the outgoing
branch's twenty-four per-row React roots were genuinely released by `releaseChild()`, not hidden. Had
the conversion kept inactive branches mounted — the EPIC-068 hazard — that cell would have read 25.
*A measurement taken in sequence tests teardown for free; the same four digests taken from four fresh
page loads would have proven nothing about disposal.*

---

## E13-12 — The face-holder table was wrong, and the instrument failure is the worst kind

§E13-4's collection table is superseded by this section. The scoping scanner used
`grep -E "<Sym[[:space:]/>]"` to find a face's JSX value callers. **grep is line-based, and
`[[:space:]]` does not match end-of-line** — so a tag written the way every multi-prop tag in this
codebase is written:

```tsx
                            <TagsInput
                                name="mneme-filter-tags"
```

has nothing after the symbol on its own line and **was invisible to the scanner**. Every multi-line
JSX opening tag in the renderer went uncounted. Found when US-1145's investigation reported
`MnemeRootEditorView.tsx:140,152` using `<TagsInput` and `:167,178` using `<DateInput` — two faces
this document had listed as *already zero-caller*.

**This is the worst of the four miscounting modes this epic has found, because it failed in the
direction that invites deletion.** The other three (a tag grep missing `createElement`, a path grep
missing barrels, a comment counted as a caller) made live faces look live or dead faces look live —
conservative errors. This one made **twelve live faces look dead**, and the epic had scheduled a task
to delete them.

### Corrected: faces this cut collects

Value callers = JSX tag (matched with `<Sym([[:space:]/>]|$)`) **or** `createElement(Sym, …)`,
excluding stories, `uikit/` itself, and comment-only mentions verified by inspection.

| Face | Value callers | Collected by E13 |
|---|---|:-:|
| `Divider` | `mcp-inspector`, `mneme-config`, `settings` | ✔ |
| `Breadcrumb` | `link-editor` | ✔ |
| `ListItem` | `link-editor` (`PinnedLinksPanel.tsx:101`) | ✔ |
| `TagsInput` | `mneme-root` | ✔ |
| `DateInput` | `mneme-root` | ✔ |
| `ProgressBar` | `mneme-config` | ✔ |
| `Select` | `settings`, `mneme-root`, **`graph`** (`GraphExpansionSettings.tsx:129`) | ✘ |
| `Tag` | `mcp-inspector`, `mneme-config`, `link-editor`, **`ui/sidebar/TrustedBoardsListView.tsx:86`** | ✘ |
| `IconButton` | 10 holders, 6 outside the cut | ✘ |
| `Input` | 7 holders, 4 outside the cut | ✘ |
| `Textarea` | `mcp-inspector`, `mneme-root`, `settings`, **`rest-client`** | ✘ |
| `SelectableRow` | `mcp-inspector`, **`env-vars`** | ✘ |
| `SegmentedControl` | `mcp-inspector`, **`env-vars`**, **`rest-client`** | ✘ |
| `Splitter` | `link-editor`, `mcp-inspector`, **`browser`**, **`rest-client`** | ✘ |
| `Autocomplete` | **`rest-client`** | ✘ |
| `Slider` | **`graph`** | ✘ |
| `ListBox` | **`browser`** | ✘ |
| `Spinner`, `Checkbox`, `Spacer`, `Dot`, `WithMenu`, `Icon`, `Button`, `Text`, `Panel`, `DataGrid` | multiple, several outside | ✘ |

**Still six collected, but four of the six changed identity.** `Select`, `Tag`, `IconButton` and
`Input` are *not* collectable — each keeps a caller in `graph`, the shell, `browser`, `env-vars` or
`rest-client`. In their place: `ListItem`, `TagsInput`, `DateInput`, `ProgressBar`.

### Corrected: faces that are already dead

**Three, not fifteen** — `Tree`, `TruncatedText` and `Tooltip`, each of whose only remaining mentions
are prose in comments (`GitTreeEditorModel.ts:228`, `RestRequestTreeView.ts:42`, `LinkTooltip.tsx:21`).
`AlertsBar`'s component is dead but its file is retained per the removal ledger, because
`src/renderer/index.tsx` imports the live `AlertsBarView` and the module owns `alertsBarModel`.

**So US-1150's "zero-caller sweep" is a three-file job, not fifteen** — and E12's request that a later
epic run a *mechanical* sweep is now doubly justified: the sweep this epic scoped by hand was wrong by
twelve, in the dangerous direction. A sweep that consists of a hand-written grep is not mechanical.

### The generalisation

E12 recorded *the proxy is not the measurement* eight times and this epic has added a ninth. This is a
different failure and deserves its own name: **the instrument's blind spot has a shape, and the shape
is usually the codebase's dominant formatting convention.** The scanner did not fail on exotic code —
it failed on the *normal* way to write a JSX tag with props, which is why it failed so widely and so
invisibly. The check that would have caught it costs one line: run the scanner against a case you
already know the answer to. Every face in the corrected table was verifiable by opening one file.

**Consequence for the remaining tasks:** US-1149's collection list and US-1150's sweep list both come
from this section, not from §E13-4. And no face may be deleted on a grep alone — each deletion must
name the file and line of its last removed caller, and confirm by inspection that a remaining mention
is not code.

### US-1145 — `mneme-config` verified; `mneme-root` deliberately not verified

`mneme-config` and `mneme-root` are native; the `Component` arm is **6 → 4** (`board`, `browser`,
`mcp-inspector`, `settings` remain). The only surviving `createElement` calls in either folder are
`MemoryIcon.createElement` — the icon **DOM** builder E12 created, not React. This is the same residue
that contaminated E12's own table (§E13-2), so it is called out rather than counted.

`mneme-config`, opened through the `mneme-indicator` route (`ui/app/MainPageView.ts:193`), structure
only:

| Check | Baseline | After |
|---|---:|---:|
| React roots | 1 | **0** |
| react-slots | — | 0 |
| buttons | — | 14 |
| svgs / **empty** | — | 2 / **0** |

`editor-toolbar` is present, confirming `EditorToolbarView` is used directly while the React
`EditorToolbar` face is correctly retained for `browser` and `mcp-inspector`. Eighteen `data-name`
markers are present, three of them per-root triples (`mneme-filters-<root>`, `mneme-reindex-<root>`,
`mneme-remove-<root>`) — **root names are redacted here deliberately**; they are customer identifiers
and this document records structure, not data.

**`mneme-root` is recorded as UNVERIFIED, and this one is a policy decision rather than a gap.** Every
other unverified item in this programme (`svg-view` in E9, `git-tree` in E10) was unverified because a
route was closed. Here the route is open and works — `explorer-open-mneme`
(`ExplorerSecondaryView.ts:332-342`) — but exercising it renders the user's live customer notes, and
this epic's discipline is that no verification step may cause customer work data to be read or
recorded. A structure-only digest would not *include* the data, but it would require rendering it, and
the correct call is not to. **`mneme-root` needs an interactive pass by the user**, listed in §E13-13.

*The distinction is worth keeping:* "unmeasured because the instrument cannot reach it" and "unmeasured
because measuring it is not allowed" are different states, and a closing table that merges them tells a
later epic to go and try harder on something it must not do.

### An operational note: the MCP channel does not survive killing the app

Each cold restart in this epic drops Claude Code's own connection to the renderer's MCP server, and it
does not re-establish inside the session. The recovery is that the server itself is fine — Persephone
prints `MCP HTTP server started: http://127.0.0.1:7865/mcp` on boot — so the tools remain reachable by
speaking MCP over HTTP directly (initialize → `notifications/initialized` → `tools/call`, honouring the
`mcp-session-id` header and an SSE-framed reply). Worth recording because this epic needs a cold
restart per task: **every `.tsx` → `.ts` rename here is reached through a dynamic `import()`, and E11
established that HMR cannot clear a stale dynamic specifier — only a dev-server restart can.**

---

## E13-13 — Deferred verification: what needs the user's own pass before this epic closes

Recorded per the user's instruction (2026-08-27): anything that cannot be verified programmatically is
written down here and the task proceeds, rather than blocking. Every item below has passed
`tsc`, ESLint and `build-prod`, and every item's *structure* has been checked where a route existed —
what remains is interaction and appearance, which no DOM digest can assert.

| # | Surface | What was verified | What still needs a human | Why it could not be automated |
|---|---|---|---|---|
| 1 | **`mneme-root`** | Nothing. Static only | Open a Mneme root from the Explorer tree (`explorer-open-mneme`) and confirm the page renders, filters apply, tags/date inputs work, and notes open | **Policy, not capability.** The route works, but exercising it renders the user's live customer notes, and this epic's rule is that verification must never cause customer work data to be read or recorded |
| 2 | **`mneme-config`** | 0 React roots, 14 buttons, 0 empty SVGs, 18 markers present | Click through: add/remove a root, re-index one root and all, open the log, update the model, and confirm the progress branch appears **and disappears** | The disposal of the download/progress branch is a timing behaviour; a digest can see the branch exists, not that it was torn down |
| 3 | **`about`** | 1 → 0 roots, 3 buttons, 5 markers, SVG geometry identical | Press "Check for updates" and confirm the four status branches (checking / up-to-date / available / error) each render and replace each other | The update check needs the network and a real release feed |
| 4 | **`tools-hub`** | Per-tab roots 0/25/0/1, chain-based criterion met, buttons match on all four tabs, branch teardown proven by measuring in sequence | Confirm the Search-boards tab still searches, installs and updates a board, and that the Pinned rail drag/pin behaviour is intact | Installing a board mutates the user's board registry; the pinned rail is pointer-driven |
| 5 | **`monaco`** | 1 → 0 roots, `CANVAS` 3 / `TEXTAREA` 1 preserved, all seven typed-queue operations exercised live, focus lands in the editor | Ordinary editing on a real file: typing, undo, Ctrl+wheel zoom, **Ctrl+Shift+V rich paste** for markdown/HTML, and the script Run buttons | Wheel zoom and rich paste need real input plus clipboard HTML |
| 6 | **The `VanillaView` guard (US-1142)** | The `mount()` rollback exercised directly: original error preserved, child disposed, `onDispose` skipped, no retry. `PageSlot` construction now inside the rollback scope | Nothing specific — but any view that fails to mount should now show the error page rather than a blank tab, worth noticing if it ever happens | A real mount failure cannot be provoked in the running app without breaking something on purpose |

**Item 3 of this table — the `settings` button delta — is RESOLVED and no longer needs the user.** The
close review attributed it to `LibraryPathSectionView` always building a clear button that React rendered
conditionally; it is fixed and Settings now matches the baseline on 15 of 16 counts. See §E13-16. Two
items remain: `mneme-root` (item 1) and `link-editor`'s tiles mode.

**Two session artifacts to clean up at close, both mine:** the utility pages this epic opened for
verification (`about`, `settings`, `mcp-inspector`, `link-editor`, `tools-hub`, `mneme-config`) are still
open, and there are two empty `untitled` pages that a `closePage` call did not remove. All are empty or
singleton and trivially closable; they were left rather than risk closing a page of the user's.

### US-1146 — `settings` converted, with one unattributed delta

The densest surface in the cut is native; the `Component` arm is **6 → 3** (`board`, `browser`,
`mcp-inspector`). Twelve source files replaced (the epic's brief said eight — the investigation found
the real count, which is why the brief told it not to trust the list). Verified after a cold restart
via `app.pages.showSettingsPage()`:

| Check | Baseline | After | |
|---|---:|---:|:-:|
| React roots | 1 | **0** | ✔ |
| `INPUT` | 7 | 7 | ✔ |
| `LABEL` | 5 | 5 | ✔ |
| **`BR`** | 12 | **12** | ✔ |
| `svg` / **empty** | 14 / 0 | 14 / **0** | ✔ |
| SVG geometry (`g`/`rect`/`path`/`line`/`circle`/`ellipse`) | 26/5/12/10/2/3 | identical | ✔ |
| `SPAN` | 165 | 165 | ✔ |
| `H1` / `PRE` / `CODE` | 1/1/1 | 1/1/1 | ✔ |
| the three `settings-*` markers | 3 | 3 | ✔ |
| `DIV` | 267 | 223 | expected — React wrapper divs |
| **`BUTTON`** | **24** | **25** | **unexplained** |

The `BR` row is the one worth pausing on: the investigation found those twelve line breaks are **not
authored JSX** — Monaco's colorizer emits them inside `ColorizedCodeView`, reached from the MCP
section's code block. A port that hand-rolled that block would have silently lost twelve line breaks
and changed the layout, with every gate green. *The parity check that matters is the one whose answer
you had to go and find.*

**The `BUTTON` +1 is the single unattributed measurement in this epic, and it is recorded rather than
waved through.** What was ruled out: it is not an async branch resolving late (stable at 25 from 250 ms
through 5 s across a close-and-reopen cycle); it is not an invisible or orphaned element (all 25 are
visible and every one has either text or an icon — zero iconless-and-textless buttons); and it is not a
duplicated control inside one row (grouping by enclosing row shows a plausible set: 9 icon buttons, 16
text buttons, no repeated signature within a row). `DotView`'s root is a `<span>`, so the profile colour
dot — the obvious suspect, since the `WithMenu` render prop was replaced by `openMenu` — is not it.

The two remaining explanations are that a conditional branch's **state** differed between the two
measurements (several settings rows switch between a badge `<span>` and a `set default` `<button>`, and
the MCP rows depend on registration state), or that one control is now a semantic `<button>` where
React rendered a non-button clickable. Distinguishing them requires reverting the twelve files and
re-measuring, which would put six tasks of completed work at risk for a one-element delta on a page
whose other fifteen counts are byte-identical. **It is listed in §E13-13 for the interactive pass**:
open Settings and confirm no control is missing or duplicated.

*The general point is about the instrument, not this button.* A count-based digest can prove a
regression and cannot prove its absence: fifteen matching counts plus one mismatch is a strong result,
but the mismatch is only interpretable against a **state-matched** baseline, and a settings page's state
is exactly what a baseline cannot freeze. E11's rule — a figure without the state it was measured in is
not a measurement — applies to element counts, not just root counts.

### US-1147 — a token count is not a site count, and §E13-7.1's figures were tokens

§E13-7.1 sized this task's risk as *"`mcp-inspector` 19 `useMemo` + 28 `useCallback`"* and *"93 of the
cut's ~100 memo/callback sites"*. Those are **textual token counts**. Re-measured:

| | textual | executable calls | non-sites |
|---|---:|---:|---|
| `useMemo` | 19 | **12** | 5 imports, 2 comment-only mentions (`ToolArgForm.tsx:43,45`) |
| `useCallback` | 28 | **23** | 5 imports |
| **total** | **47** | **35** | **12** |
| `useState` | 7 | **4** | 3 imports |
| `useEffect` | 4 | **2** | 2 imports |
| `useRef` | 4 | **2** | 2 imports |

So the epic's "7 `useState`" was three imports and four values, and an implementation that trusted it
would have invented three state fields that do not exist. **Zero of the 35 executable sites are dead
code today**, which is worth stating: the EPIC-068 defect class is not pre-existing here, so any
missing caller after the port is introduced by the port.

**This is the third instrument failure in this epic and all three are the same mistake in different
clothing:** the JSX `append` count (49 sites read as 2), the face matcher (twelve live faces read as
dead), and now hook tokens read as call sites. Each time the pattern matched *something real* — an
identifier, a symbol, a token — that was not the thing being counted. The rule this epic can add to
E12's *the proxy is not the measurement*: **a grep counts occurrences of a string; a measurement counts
occurrences of a behaviour, and the gap between them is always populated by imports, comments, types
and generics.** My own `useMemo(` refinement still missed `useMemo<IListBoxItem[]>(` — narrowing a
pattern is not the same as validating it.

The task document's response is the right one and worth copying: it tabulates **all 47 occurrences**,
labels each of the 12 non-sites explicitly rather than dropping them, and gives every executable site a
named live consumer and a named native destination. A table that lists what it excluded cannot be
misread as a site count.

### US-1148 — EPIC-064's `SlotText` blocker has expired, and the type is wrong in both directions

EPIC-064 declined to narrow `SlotText` and recorded why: *"`SlotText` does not narrow, because the
link-editor tooltip genuinely needs React"* — and it flagged that as a case of the over-reach E6-1 was
written to catch, appearing in the correcting epic's own document. US-1148's investigation re-measured
it: **`LinkTooltipContent` is live, but the `uikit/Tooltip` React face is not**, and the vanilla
`uikit/Tooltip/attach-tooltip` path is what `LinksListView.ts:25` already uses. So the stated blocker no
longer holds. **Tenth instance of *a forward-looking note is a measurement with a date on it*, and the
second in this epic where the expiry was caused by the very epic that wrote the note.**

**`SlotText` is not narrowed here, deliberately.** It is `string | React.ReactNode` at
`uikit/shared/slots.ts:9` with **15 consumer declarations** across `uikit/` (`ListItem`, `ListItemView`,
`ListBox/types`, `Tree/TreeItem`, `TreeItemView`, `Tree/types`, `Select`, `MultiSelect`, `MultiListBox`,
`Autocomplete`) and two editors outside this cut (`board/BoardsTree.tsx`, `tools/ToolsTree.tsx`), plus
`components/tree-provider`. Narrowing it is a contract change across `uikit/` and two unconverted
editors — a different epic's shape, not task 7 of this one.

**What is worth handing forward is the second half of the measurement, which nobody has recorded.**
`board/BoardsTree.tsx:36` and `tools/ToolsTree.tsx:34` both declare `emptyMessage?: SlotText | Node`.
They union `Node` **on top of** `SlotText` — meaning the type was already insufficient for its callers
in the DOM direction while still being too wide in the React direction. So `SlotText` is simultaneously
missing the arm its consumers need and carrying an arm none of them will need once the tooltip case is
gone. That is the shape E12 named as *widening a type is a promise*, seen from the other side: **a
consumer that unions an extra arm onto an imported type is telling you the type is wrong, and it does it
silently, because adding an arm compiles.**

The candidate for E14 or Epic F, with the measurement already taken: replace `SlotText` with
`SlotContent` (`string | Node | React.ReactNode`, already exported from `fill-slot.ts` and already what
`fillSlot` accepts) at all 15 sites, then delete the `React.ReactNode` arm when the last React consumer
goes. The two `| Node` unions disappear as a side effect. **Re-measure before acting** — this paragraph
is itself a forward-looking note.

### US-1147 — `mcp-inspector` converted, and the closing property on the arm is met

`mcp-inspector` is native. **`EditorModule.Component` now has exactly two callers — `board` and
`browser`, the two `<webview>` editors — which is this epic's closing property #1, met.** All three
gates re-run independently: `typecheck`, `lint`, `build-prod` all clean.

Verified after a cold restart, disconnected (the state the baseline captured):

| Check | Baseline | After | |
|---|---:|---:|:-:|
| React roots | **2** | **0** | ✔ |
| react-slots | 1 | 0 | ✔ |
| buttons | 4 | 4 | ✔ |
| inputs | 3 | 3 | ✔ |
| the eight `data-name` markers | 8 | 8 | ✔ |
| `emptySvgs` | 0 | 0 | ✔ |

Both roots are gone, including the `fillSlot` root the still-React body used to open **inside** the
native `EditorToolbar` view — EPIC-069's two-way-boundary mechanism, retired here for this editor while
`EditorToolbar`'s React face is correctly retained for `browser`.

**The panels were verified with a live connection, which the baseline could not cover** — by pointing
the inspector at Persephone's own MCP server (`http://127.0.0.1:7865/mcp`, which the app logs at boot).
Connected: **0** React roots, `emptySvgs` 0, Tools showing **33 list rows** of real data, and the panel
switcher offering **Info / Tools / Resources / History**.

**That panel set is the best evidence in this epic that a ported recompute is actually live.** The
switcher offers no "Prompts" segment — because Persephone's MCP server exposes no prompts — which means
the capability-dependent segment computation (`McpInspectorView.tsx:95`'s `useMemo`, feeding
`SegmentedControl.items`) is not merely defined but **being called with real capability data and
changing its output accordingly**. That is precisely EPIC-068's silent-regression class caught from the
positive side: a dead recompute would have produced a static or empty segment list, and no root count,
element count or gate would have noticed. *The test for a ported computation is not that it exists but
that its output varies with its input — so verify it in a state where the correct answer is "fewer
things than usual".*

**One measurement artifact worth recording.** A first pass read 3 buttons where the baseline had 4, and
the shortfall was **timing, not code**: the digest was taken 2.2 s after switching a page that had just
been in the connected state, so the disconnected connection bar had not finished settling. Re-measured
on a clean disconnected page it is 4, exactly. A missing control is the dangerous direction (the symptom
of EPIC-068's class is *absence*), so this was chased rather than assumed — but it also means **a
single-sample digest of a page that just changed state can manufacture a phantom regression.** The
`settings` +1 button in US-1146 is *not* this: that one was stable across 250 ms to 5 s and a
close-and-reopen cycle.

### Interim whole-app measurement after seven tasks

Measured on a live session with **17 open tabs** (the epic's verification pages accumulated):

| Instrument | Value |
|---|---:|
| `[data-react-root]` | **1** |
| its chain | `div < div < body < html` — `GlobalStyles`, the Emotion root |
| `[data-name="page-tab"]` | 17 |
| `[data-name="page-slot"]` | 17 |
| empty `<svg>` app-wide | **0** |

**Closing property #3 is met, and more strongly than it was written.** It promised one React root "on
the everyday text-editing path"; the measurement is one root across seventeen open pages of mixed type.
The only React left in a running Persephone is Emotion's stylesheet root, which Epic F removes.

Two qualifications, so this is not over-read. It holds for *these* seventeen pages — `board` and
`browser` are still on the `Component` arm and each costs a root when open, as do `graph`,
`rest-client`, `env-vars`, `file-diff` and `draw`, and `tools-hub`'s "Registered boards" tab costs one
per visible row from the shell. And the count is a function of what is open and activated, which is
E11's standing rule. But the per-open-tab term E12 removed has stayed removed: **seventeen pages, zero
roots between them.**

### US-1148 — `link-editor` is React-free, and `editors/` JSX is down 60%

`editors/link-editor/` contains **zero** React imports, JSX and `createElement`. All 32 executable hook
sites have live callers; `index.ts`'s chrome contributions were converted **before** `LinkBody`, per
EPIC-067's rule that order comes from the import graph — converting the body first would have forced a
`fillSlot` React root for its chrome and *added* a root.

`Breadcrumb` and `ListItem` now measure **zero** value callers anywhere (JSX tag and `createElement`
both), as §E13-12 predicted — the two faces this task frees for US-1149.

**`editors/` JSX markers: 1337 → 535.** The epic's cut has removed **802 markers, 60% of the editor JSX
that remained when it opened.** The 535 left belong to `graph`, `rest-client`, `browser`, `board`,
`env-vars`, `file-diff`, `draw` and `editors/base/EditorError.tsx` — E14's scope.

Verified on a **populated** link file (five invented links in a scratch file; the user's own
`.link.json` data was never opened):

| Check | Value |
|---|---:|
| React roots in the editor | **0** |
| whole-app React roots | **1** (`GlobalStyles`) |
| elements / buttons / inputs | 188 / 16 / 1 |
| `emptySvgs` | 0 |

The list body renders real rows — `link-row`, `link-row-wrapper`, `link-row-edit`, `link-row-delete`,
`links-list-focus-scope` — and all of the baseline's markers are present except `link-editor-empty`,
which correctly disappears once the file has content. The sidebar's Collections panel independently
picked up the scratch file's categories, so the already-vanilla secondary views still receive data from
the converted body.

**The tiles view mode is UNVERIFIED and is listed in §E13-13.** `link-editor-view-mode` did not respond
to a synthetic click on its button with a menu I could enumerate, so the list↔tiles switch — which is
also the branch that must be *destroyed* rather than hidden — was not exercised. The list mode is
verified; the tiles mode and the switch between them need the user's pass. *Recording it beats
asserting that identical before/after digests prove a toggle works: they prove nothing changed, which is
exactly what a non-functioning toggle also looks like.*

---

## E13-14 — Closing measurement

All nine implementation tasks landed; the full table is in
[US-1151](../tasks/US-1151-e13-baseline/README.md). `typecheck`, `lint` and `build-prod` re-run
independently after the last task: clean. **82 files changed, +673 / −6,201**, 56 added, 52 deleted.

**All four closing properties are met.**

1. **`EditorModule.Component` has exactly two callers — `board` and `browser`.** The remaining React
   editors are precisely the two that host a `<webview>`, which is the statement E14 inherits as a
   scope instead of a search.
2. **Nine faces removed from the value graph: 2 deleted outright (`Tree.tsx`, `Tooltip.tsx`), 7
   type-relocated to `.ts`.** EPIC-069's finding held exactly — *deleting a React face is a
   type-relocation job, not a deletion* — and this epic's prediction of "six collected, three already
   dead" survived re-measurement.
3. **One React root, `GlobalStyles`, across seventeen open tabs.** The property was written as "on the
   everyday text-editing path" and the measurement is stronger than that.
4. **All eight converted editor folders contain zero React imports, JSX and `createElement`.**

`editors/` JSX markers **1,337 → 535** (60% of the remaining editor JSX removed); `editors/` non-story
`.tsx` 76 → 36; `uikit/` 51 → 39; renderer 136 → 85. `emptySvgs` is 0 on every digest and 0 app-wide.

### What must not be claimed, restated against the result

- **Epic E is not finished.** 535 markers remain, in `graph` (the largest single body left, with a
  canvas and the last `highlight.ts` React consumer), `rest-client`, `browser`, `board`, `env-vars`,
  `file-diff`, `draw` and `editors/base/EditorError.tsx`.
- **The app does not have one React root unconditionally.** It has one for these seventeen pages. Each
  of the seven remaining React editors costs one when open, and `tools-hub`'s "Registered boards" tab
  costs one **per visible row** from shell code this epic did not touch.
- **Two things are unverified and both are recorded, not assumed** — `mneme-root` (policy: verifying it
  renders customer data) and `link-editor`'s tiles mode (the switch did not respond to a synthetic
  click). Plus one **unattributed** measurement: `settings` shows 25 buttons against a baseline of 24,
  with fifteen other counts byte-identical. All three are in §E13-13.

### The epic's own headline was met at task 2 of 10

`MonacoBody.tsx` — one 239-line file — accounted for three of the four live React roots. §E13-3 called
it "the best Rule 4 payoff per unit of risk since E6's icon contract"; that held. The remaining eight
tasks bought the *arm* property, the *collection* property, and the guard — none of which the root count
would have shown. **A single metric would have declared this epic finished after its second task**,
which is the clearest argument yet for the four-part closing property this document opened with rather
than a number.

### The finding worth carrying above all others

This epic corrected its own instrument **four times**, and every correction was the same mistake:

| Instrument | Read as | Actually | Direction of error |
|---|---:|---:|---|
| E12's `createElement` column | 12 React-producing `View`-arm editors | **7** — five were `document.createElement` and icon builders | over-counted work |
| constructor `append` scan | 2 sites | **49** | under-counted the convention |
| JSX face matcher (`<Sym[[:space:]/>]`) | 15 dead faces | **3** — twelve were live behind multi-line tags | **invited deletion** |
| hook token count | 47 sites | **35** — twelve were imports and comments | over-counted risk |

E12 named this family *the proxy is not the measurement*, eight times. What this epic adds is the
mechanism: **a grep counts occurrences of a string; a measurement counts occurrences of a behaviour,
and the gap between them is always filled by imports, comments, types, generics and the codebase's own
dominant formatting convention.** The face matcher is the one that matters, because it failed in the
direction that destroys code, and it failed on *normal* code — a tag with props on the next line. My
own refinement of the hook pattern to `useMemo(` then missed `useMemo<T>(`: **narrowing a pattern is not
validating it.** The validation costs one line — run the instrument against a case whose answer you
already know — and no epic in this programme has done it before writing a number down.

---

## E13-15 — Close review: nine findings, six fixed, three handed off

> **SUPERSEDED IN PART — see §E13-16.** This section records the *first* fix round, written from the
> review file while the review was still running. The completed review has **nine** findings, not six,
> and its numbering differs. The four fixes below are correct and were independently re-verified by the
> finished review; §E13-16 covers the five findings this section could not see, including the one that
> resolved the `settings` button delta.

The review ran report-only so each finding could be judged before being acted on. **Four are
regressions this epic introduced and are fixed; two are pre-existing and are tracked as US-1152.** The
split was established by checking each cited file's git status, not by reading the finding: all four
fixed ones live in files this epic **created**, and both handed-off ones live in files it never
modified (`LinkCategoryPanel.ts` is modified, but its entire diff is the React-tooltip swap, so the
rebinding defect the finding describes predates it).

| # | Severity | Where | Introduced? | Outcome |
|---|---|---|:-:|---|
| 1 | defect | `settings/sections/BrowserProfilesSection.ts:429` — the Incognito bookmarks row was a local, never retained or re-synced | ✔ new file | **fixed** — retained as a claimed child and updated from `sync()` |
| 2 | defect | `mcp-inspector/ResourceContentView.ts:151` — `.dispose()` on children claimed with `this.child()`, never `releaseChild()` | ✔ new file | **fixed** — `releaseChild()` for claimed views |
| 3 | risk | `BrowserProfilesSection.ts:47,297` — a fresh `this.listen()` per update on nodes `replaceChildren()` throws away | ✔ new file | **fixed** — delegated listeners, both now in `onMount()` only |
| 4 | risk | `SettingsSections.ts:370` — same shape in the VLC path branch | ✔ new file | **fixed** — one delegated listener on a stable `display: contents` container |
| 5 | defect | `link-editor/panels/LinkCategoryPanel.ts` + `LinkCategorySecondaryView.ts` — panel retargeted to another editor never replaces its subscriptions | ✘ pre-existing | **US-1152** |
| 6 | risk | `mneme-root/MnemeTreeSecondaryView.ts` — `bind()` re-called on model change, old subscriptions never released | ✘ pre-existing | **US-1152** |

Verified after the fixes, on a cold restart: `settings`, `mcp-inspector` and `about` all at **0** React
roots; `settings` still 7 inputs / 5 labels / 12 `BR` / 14 svgs; `emptySvgs` **0** app-wide.

**Findings 1 and 2 are the two classes this programme's reviews find most often, and both are the same
mistake as a previous epic's.** Finding 2 is literally US-1132's `releaseChild` class, recorded from
EPIC-069's close review, recurring in new code four tasks later — because nothing enforces it. Finding
1 is EPIC-068's *a `useMemo` whose result feeds a callback becomes dead code if the port defines the
recompute but never calls it*, in its structural form: a child **view** created and never wired to the
sync path. The symptom is again *absence* — a row that silently stops updating — and again nothing saw
it: `tsc` was green because the local was used, ESLint was green, the build was green, and every DOM
digest matched because the row renders correctly **until the setting changes.**

**Findings 3 and 4 name a gap in the guard US-1142 built.** That guard forbids `this.listen()` in a
**constructor**, at a measured zero baseline. It says nothing about `this.listen()` inside a method
called repeatedly — which is the same defect (a subscription registered through `own()` with no early
release) arriving through a different door. The fix chosen was **delegation** rather than
teardown-then-rebind, because delegation removes the class: a listener on a container that is never
replaced cannot accumulate. **The lint rule that would close this properly is "no `this.listen()`
outside `onMount()` or the constructor" — worth measuring before E14**, since every conversion epic
writes exactly this code. Added to US-1131's family.

*The process point:* asking for the review **report-only** and judging the findings myself was what
separated the four from the two. A review that fixes as it goes would have "fixed" two pre-existing
defects inside this epic's diff, making them invisible to the ticket that should own them — and it
would have inflated this epic's apparent regression count by half.

---

## E13-16 — The completed review, and the button delta was a real regression

§E13-15 was written from the review file mid-run. The finished review holds **nine** findings under a
different numbering, and it independently re-verified the first round's four fixes as clean. Final
tally: **six fixed, three handed off.**

### Finding 3 resolved the one thing this epic could not explain, and the answer was a defect

`settings` measured **25** buttons against a baseline of **24**. I ruled out timing, invisibility and
in-row duplication, could not attribute it, and listed it for the user's eye. The review found it at
source: `LibraryPathSectionView.onMount()` always creates the `Unlink`/`Reset` `ButtonView` and merely
sets `disabled: !value`, while the deleted React version rendered it **conditionally** —
`{libraryPath && <Button …>Unlink</Button>}` at `SettingsSections.tsx:209` and `:230`. With one library
path empty, that is exactly +1 button. A third instance existed for the board-vars file at `:185`.

Fixed by restoring the conditional with explicit child ownership — create/claim/mount when the path
becomes non-empty, `releaseChild()` when it empties. **Settings now matches the baseline on 15 of 16
element counts**, the sixteenth being `DIV` 267 → 223, which is React's wrapper divs disappearing:

| | `BUTTON` | `SPAN` | `LABEL` | `INPUT` | `BR` | `svg` | `g`/`rect`/`path`/`line`/`circle`/`ellipse` | `H1`/`PRE`/`CODE` |
|---|---:|---:|---:|---:|---:|---:|---|---|
| baseline | 24 | 165 | 5 | 7 | 12 | 14 | 26/5/12/10/2/3 | 1/1/1 |
| now | **24** | 165 | 5 | 7 | 12 | 14 | identical | identical |

**The lesson is about what a count can and cannot prove, and it corrects what I wrote in §E13-15.**
There I concluded that "fifteen matching counts plus one mismatch is a strong result, but the mismatch
is only interpretable against a state-matched baseline" — and used that to justify handing it to the
user. That reasoning was wrong in a specific way: **I treated an unexplained mismatch as probably-benign
because everything around it matched.** The correct reading is the opposite. Fifteen exact matches are
evidence the instrument is *sound*, which makes the sixteenth more likely to be real, not less. A
digest with one unexplained delta is a digest with one unexplained defect until someone reads the
source. **The count told the truth; I discounted it.** And note what actually resolved it: reading the
deleted file against the new one — the check the review did and I did not.

A disabled control where the baseline had none is also the mirror of EPIC-068's persistent-child
hazard: React's conditional rendering removed the control for free, and a native view that always
builds it has to reproduce the removal explicitly. *What React did by not rendering must become an
explicit deletion when something always renders.*

### The other five

| # | Severity | What | Outcome |
|---|---|---|---|
| 4 | nit | 6 `as unknown as VanillaView<unknown>` erasing panel types in `McpInspectorView.ts` | **fixed** — a typed panel union |
| 5 | nit | 2 double casts at link-editor React→native boundaries | **1 fixed**; the tooltip cast **documented, not removed** (below) |
| 6 | nit | 17 `undefined as never` clears in the two new Mneme views, +7 more found | **fixed** — optional fields with guards |
| 7 | nit | definite-assignment `!` on fields assigned only in `onMount()` | **fixed** — **135 assertions removed**, 8 extra fields found |
| 8 | nit | non-null assertions standing in for branch narrowing | **fixed** — 5 replaced with guarded branches |
| 1, 2, 9 | defect/risk | secondary views that bind as if their model were fixed | **US-1152**, now **five files** |

**One cast deliberately survives, and it is documented rather than silenced** —
`LinkCategoryPanel.ts:79`. `createLinkTooltipContent` returns a DOM node while the entire chain
(`TreeProviderViewModel.getTooltip`, `Tree`'s own `getTooltip`, `TreeItemView`) is typed `SlotText`,
which has no `Node` arm even though `fillSlot` beneath it has accepted `Node` since Epic B. Removing it
honestly means the 15-declaration `SlotText` → `SlotContent` migration §E13-11 defers. The tell that
this is a contract gap rather than sloppiness sits one line above it in the same type:
`renderTrailing?: (item) => React.ReactNode | Node` already carries the arm `getTooltip` is missing. A
comment at the site now names the reason and the owning item — which is the distinction E12's
*a suppression comment is the same tell as a cast* was really about: the fault was the **silence**, not
the cast.

**Finding 9 grew US-1152 from two files to five**, all pre-existing, all secondary views, all the same
shape: *a view that accepts a replaceable model but binds as if the model were fixed.* Five instances
of one shape is a pattern to fix once, not five tickets — which is why it is recorded as one.

### A process finding about the review itself

The first review call lost its findings to a transport timeout after thirty minutes of silence. The
second was told to **append each finding to `doc/tasks/EPIC-071-review.md` the moment it was confirmed**
and to reply with only the path — and that call also timed out, yet nothing was lost, because the file
was on disk. **A long delegated task must write its artifact incrementally, not compose it in its
reply**; the reply is the least durable part of the transaction. The cost of not doing this was one
wasted thirty-minute review and a report to the user that undercounted the findings by a third.

---

## E13-17 — Closed with two surfaces unverified, by decision

The epic is closed at the user's instruction with items 1 and 2 of §E13-13 still outstanding. Recording
them here rather than in the epic's own deferred list, because a deferred list inside a closed epic is
where an unverified surface goes to be forgotten:

- **`mneme-root` was never rendered.** Its route (`explorer-open-mneme`) works; opening it renders the
  user's live customer notes, and this epic's rule was that no verification step may cause customer work
  data to be read or recorded. It has a green `tsc`/ESLint/`build-prod`, a converted body with zero React
  imports, and **no runtime evidence whatsoever.** It is the only surface in the cut in that state.
- **`link-editor`'s tiles view mode was never exercised.** The list mode is verified at 0 React roots on
  a populated file; the list↔tiles switch did not respond to synthetic input, so neither the tiles body
  nor the branch teardown between the two modes has runtime evidence. The teardown is the part that
  matters — it is EPIC-068's persistent-child hazard, and it is the one branch in this epic whose
  disposal was not observed. (Contrast `tools-hub`, where visiting four tabs in sequence proved teardown
  for free.)

Both are carried on the dashboard as **US-1153**. The distinction §E13-11 drew still holds and is the
reason this is two items rather than one line: *"unmeasured because the instrument cannot reach it" and
"unmeasured because measuring it is not allowed" are different states*, and only the first is worth
retrying with a better instrument.
