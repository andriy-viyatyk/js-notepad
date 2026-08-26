# EPIC-067 — De-React E9: the editor chrome contract

**Status:** Complete
**Created:** 2026-08-26
**Completed:** 2026-08-26
**Roadmap:** [De-React programme](../de-react.md), Epic E9. Follows
[EPIC-066](completed.md) (E8, the synthetic-event round trip).

## Closing property

`editors/base/TextChrome.tsx` is **deleted**, and with it the four `ReactNode` members of
`TextChromeProps` (`children`, `toolbarContributions`, `rightToolbarContributions`,
`footerContributions`). All **14** editors that wrapped themselves in `<TextChrome>` register
`View`, not `Component`, so `AsyncEditorView` never calls `mountReactHandle` for any of them.
`editors/text` and `editors/base` hold no `.tsx` file except `EditorError.tsx`.
`ui/app/AsyncEditor.tsx` — the unreferenced React twin of `AsyncEditorView.ts` — is deleted.

The measured number (Rule 4): opening any of the 14 costs **0** React roots, from **2** today for a
text-host editor (its own `Component` root, plus one nested `fillSlot` root inside
`text-chrome-footer`) and **1** for the rest.

**What must not be claimed at close:**

- That `editors/` is React-free. It is not, and by a wide margin — 107 of the renderer's 126
  remaining JSX-bearing files are editor files. E9 removes the last *shared* React type in
  `editors/`, not the React in the editors.
- That the chrome is gone. `PageToolbar`, `EditorToolbar` and `ContentHostFooter` become native
  views but **keep React faces**, because 6, 3 and 1 editors respectively call them without going
  through `TextChrome` (§E9-3). Only `TextChrome` itself is deletable here.
- That `applyRestProps` / `fillSlot` can now go. They cannot — those same survivors keep them fed
  (§E9-7). E8 deferred that bridge "to the end, with `<TextChrome>`"; E9 shows the two were never
  the same deadline.
- That the root count only goes down. It **peaks at 4–5 for a chrome-pinned editor** mid-epic,
  before reaching 0, and that peak is inherent to the epic rather than to its ordering (§E9-4). The
  closing report states the peak alongside the endpoints, so that anyone measuring mid-epic finds
  the number already written down instead of reporting a regression.

---

## E9-1 — The contract, and the search that found it

EPIC-066 named **no E9 candidate on purpose**, so this axis was found by searching the import graph,
per E5-1 — the fifth consecutive time. The search was run over the whole renderer, not over the
folder E8 happened to touch.

**What the sweep measured.** Counting files that contain real JSX (a closing tag or a self-closing
tag — the `.tsx` extension over-reports, per E6's reporting correction):

| Folder | JSX-bearing files |
|---|---:|
| `editors/` | **107** |
| `uikit/` | 6 |
| `ui/` | 5 |
| `components/` | 5 |
| `theme/` | 3 |
| **Total** | **126** |

So the epic is in `editors/`. That is not the interesting part — the interesting part is *what*
in `editors/` is shared, because E2-1's rule is that a conversion epic is scoped by the contract it
deletes and by line count only where none exists.

**The contract.** `editors/base/TextChrome.tsx` declares:

```ts
interface TextChromeProps {
    model: EditorModel;
    children: ReactNode;
    toolbarContributions?: ReactNode;
    rightToolbarContributions?: ReactNode;
    footerContributions?: ReactNode;
}
```

Four `ReactNode` members in a shared module, consumed by **14 editors**. This is the exact shape of
every contract this programme has deleted — `RenderCellFunc`'s `ReactNode` return (E4),
`ReactSecondaryViewDefinition`'s `React.ComponentType` (E5), `IconRef`'s `ReactNode` arm (E6),
`Views.registerView`'s `React.FC` (E7): **one type pinning its callers to React regardless of their
own content.**

**The evidence that "regardless of their own content" is literal here.** Seven of the fourteen
editors have an *already-vanilla* body, supplied as `EditorModule.BodyView`, and their only
remaining `.tsx` file is the `index.tsx` whose entire job is to wrap that vanilla body in
`<TextChrome>`:

| Editor | `index.tsx` | Body | Everything else in the folder |
|---|---:|---|---|
| `markdown` | 70 | `MarkdownBodyView` (vanilla) | `.ts` only |
| `html` | 77 | `HtmlBodyView` (vanilla) | `.ts` only |
| `svg` | 90 | vanilla | `.ts` only |
| `log-view` | 103 | `LogBodyView` (vanilla, via `LogBody.ts`) | `.ts` only |
| `notebook` | 124 | `NotebookBodyView` (vanilla) | `NotebookBody.tsx` — a JSX-free `mountVanilla` face |
| `mermaid` | 143 | `MermaidBodyView` (vanilla) | `.ts` only |
| `grid` | 154 | vanilla | `.ts` only |

`markdown/index.tsx` is the whole epic in one file: it is a React component whose return value is
`<TextChrome>{mountVanilla(MarkdownBodyView, { model: md })}</TextChrome>`, with two small React
helpers (`MarkdownBackButton`, `MarkdownToolbarBits`) that exist only because the slots take
`ReactNode` — and whose own contents are `Button` and `IconButton`, both of which are *already
vanilla views behind `mountVanilla` faces*. Nothing in that file needs React except the type it
renders through.

The other seven callers still have a React body of their own, so for them the contract is not the
only thing holding React:

| Editor | `index.tsx` | React body |
|---|---:|---|
| `env-vars` | 24 | `EnvVarsBody.tsx` |
| `rest-client` | 24 | `RestClientBody.tsx` + 4 more |
| `monaco` | 27 | `MonacoBody.tsx` |
| `file-diff` | 43 | `FileDiffBody.tsx`, `RevisionPicker.tsx` |
| `graph` | 116 | `GraphBody.tsx` + 6 more |
| `link-editor` | 204 | `LinkBody.tsx` + 4 more |
| `draw` | 224 | `DrawBody.tsx` |

**Scope.** 21 files, ~2,453 lines:

| Part | Files | Lines |
|---|---:|---:|
| `editors/base` chrome (`TextChrome`, `PageToolbar`, `ContentHostFooter`, `EditorToolbar`) | 4 | 511 |
| `editors/text/ScriptPanel.tsx` — rendered *by* `TextChrome`, so it converts with it | 1 | 455 |
| The 14 `index.tsx` callers | 14 | 1,423 |
| `ui/app/AsyncEditor.tsx` — deleted, not converted (§E9-3) | 1 | 64 |

`editors/base/EditorError.tsx` (23 lines) stays: its four callers are React bodies outside this
epic (`draw`, `graph`, `link-editor`, `rest-client`).

## E9-2 — The measured baseline

Taken live, on the running app, before anything converted. Six pages open, four editors mounted
(`md-view`, `git-tree` ×2, `grid-csv`), instrument = `[data-react-root]` per E7's correction:

| | Count |
|---|---:|
| Total live React roots | **11** |
| — one per mounted editor (`AsyncEditorView` → `mountReactHandle` on `module.Component`) | 4 |
| — one per page's secondary-views host (`ui/secondary-views/SecondaryViews.tsx`) | 4 |
| — `text-chrome-footer` → `text-toggle-script`, `data-part="react-slot"` | **2** |
| — `theme/GlobalStyles.tsx` (renders no DOM; detached-looking, not a leak) | 1 |

The third row is the one worth reading twice. `text-toggle-script` is a **native** `IconButton`
receiving a `ReactNode` from the **React** chrome, so `fillSlot` opens a React root *inside* a
vanilla view. It appears on exactly the text-host editors — `markdown` and `grid-csv` here, not the
two `git-tree` pages — which is why a chrome-pinned editor costs 2 roots and the others cost 1.

So the per-editor baseline this epic drives to zero is **2 for a text host, 1 otherwise**, and it
must be re-taken per editor in US-1099 before any conversion, because Rule 4's measurement on the
React implementation is the one that cannot be recovered afterwards.

### The per-editor baseline, measured 2026-08-26 (US-1099, done at scoping)

Taken before any conversion, because it cannot be recovered afterwards. Each editor was opened on a
scratch page, roots counted inside `[data-name="page-editor"]`, then the page closed; the residual
returned to 6 after every probe, so nothing leaked. `slot` = roots additionally carrying
`data-part="react-slot"`.

| Editor (module id) | Roots | of which slot | |
|---|---:|---:|---|
| `monaco` | 2 | 1 | chrome-pinned |
| `grid-csv` | 2 | 1 | chrome-pinned |
| `log-view` | 2 | 1 | chrome-pinned |
| `md-view` | 2 | 1 | chrome-pinned |
| `svg-view` | 2 | 1 | **withdrawn — this row measured `monaco`, not the SVG editor; see §E9-11** |
| `html-view` | 2 | 1 | chrome-pinned |
| `mermaid-view` | 2 | 1 | chrome-pinned |
| `graph-view` | 2 | 1 | chrome-pinned |
| `draw-view` | 2 | 1 | chrome-pinned |
| `link-view` | 2 | 1 | chrome-pinned |
| `rest-client` | 2 | 1 | chrome-pinned |
| `notebook-view` | 2 | 1 | chrome-pinned |
| `env-vars-view` | 2 | 1 | chrome-pinned |
| `file-diff` | 2 | 1 | chrome-pinned |
| `mcp-view` | 1 | 0 | survivor (`EditorToolbar`) |
| `git-tree` | 1 | 0 | survivor (`PageToolbar`) |
| `image-view` | 1 | 0 | survivor (`PageToolbar`) |
| `about-view` | 1 | 0 | out of scope, for contrast |
| `settings-view` | 1 | 0 | out of scope, for contrast |

**Two things this corrects in §E9-2's own estimate.** First, the split is not "2 for a text host, 1
otherwise" — **all 14 chrome callers measure 2, with no exceptions**, including the four whose bodies
are heavily React (`graph`, `link-editor`, `rest-client`, `draw`). Every one of them is a text host,
so every one carries the footer. Second, and more useful: **the slot root is an exact discriminator.**
`slot == 1` ⟺ the editor renders through `<TextChrome>`, on all 19 editors measured. That gives the
epic a mechanical progress gate that needs no source reading — after each task, the converted
editor's slot count must be 0, and no other editor's may change.

Not measured, because `addEditorPage` rejects them ("standalone editor that requires a specialized
model") and they need a real file or a dedicated flow: `archive-view`, `board-info`, `board-view`,
`category-view`, `video-view`, `mneme-config`, `browser-view`, `toolset-view`. Six of those eight are
§E9-4 survivors, so **US-1100 must take its own before/after for them in one sitting** — which is
better evidence for a regression than a baseline taken two tasks earlier anyway. `toolset-view` is
the one module already on the `View` arm and should measure 0; confirming that is US-1100's cheapest
sanity check on the instrument.

**Correction to an inherited figure.** EPIC-066's roadmap entry records "24 `<TextChrome>` call
sites". Measured now: **14**, in 14 files, one per editor. A `<TextChrome` grep returns 16 hits, of
which one is the definition and one is a comment in `graph/GraphBody.tsx:302`. The removal ledger's
own figure ("14 `<TextChrome>` and 6 direct `<PageToolbar>`") was right and the roadmap tail
restated it wrongly. Historical documents are append-only, so the correction is recorded here.

## E9-3 — Rivals rejected

| Candidate | Measured | Why not |
|---|---|---|
| `uikit/Panel`'s React face | 380 `<Panel>` tags in 59 editor files | **Machinery, not a contract** — E6's distinction. `createPanelElement` already exists with 84 call sites, and `Panel` sits *inside* its editor's existing root, so deleting the face removes no roots. A mechanical sweep with no closing property. |
| `ui/secondary-views/SecondaryViews.tsx` | 17 lines, **1 root per open page** — 4 of the 11 measured | The best roots-per-line in the tree, but E5 kept it deliberately (the host's own React face, owned by the browser editor) and it pins nothing else. It is a one-task cleanup, not an epic. Recorded as an E10 candidate. |
| `EditorModule.Component` itself | 30 of 31 modules on the React arm | The right *programme* property and the wrong epic one: deleting the arm needs all 30 editors, which is the entire rest of Epic E. E9 removes 14 of the 30. |
| `graph` (8,100 lines), `browser` (1,471), `mcp-inspector` (1,642), `rest-client` (1,668) | line count | Real conversions, but each is independent and none deletes a contract. Per E2-1 these are scoped by line count — **after** E9, when line count is all that is left. |
| `applyRestProps` / `fillSlot` | 40 / 30 files | Cannot go while any React caller feeds them, and E9 leaves ten (§E9-7). |

**One rival was not rejected but absorbed:** `ui/app/AsyncEditor.tsx` is a 64-line React
reimplementation of `AsyncEditorView.ts`, exported from `ui/app/index.ts` and imported by
**nothing**. It reads `module.Editor`, so it belongs to this contract's blast radius; it is deleted
in US-1099 rather than converted. It is also one of `ui/`'s five remaining JSX files.

## E9-4 — E1-8 revisited, and a correction to this section's own first draft

E1-8 fixed the `editors/base` chrome as **deliberately last**, and the removal ledger records why:
converting it ahead of its call sites "would create up to six React roots per open editor against
one today, for no gain, since the slot contents are the same React trees either way."

**This section's first draft said that premise had expired. That was wrong, and the correction is
the most useful thing in this document.** It was written from the observation that 7 of the 14 bodies
are already vanilla, and concluded that the regression would therefore be confined to the 10 editors
that call a chrome piece without going through `TextChrome`. The table it carried claimed
`+1..2` on those 10 and `−1..2` everywhere else.

The first task's plan review disproved it. `fillSlot` (`uikit/shared/fill-slot.ts`) takes its React
arm — `mountReactHandle`, one root — for **any** slot value that is not `null`, `undefined`, `false`,
a string, or a `Node`. So the moment a chrome component is native while its parent is still React,
that parent's children become a root. The bodies were never the relevant input: **the chrome's own
internal composition is**, and Rule 1 guarantees the parent stays React for at least one task.

The honest numbers, for a chrome-pinned editor:

| Stage | Roots | Why |
|---|---:|---|
| Today (§E9-2) | **2** | editor `Component` root + the `text-toggle-script` slot root |
| After the chrome is native, callers still React | **4–5** | one slot root per React-fed chrome seam; 5 while the script panel is open |
| At close | **0** | the 14 callers are `View`s, so no slot is React-fed |

**The peak is a property of the epic, not of the ordering.** Converting bottom-up (as §E9-5 does)
and converting top-down peak identically, because while the 14 callers are React their
`children`/contribution slots must be roots either way. The only ordering that avoids the peak is
converting the chrome and a caller in the same change — which Rule 1 forbids, and which cannot work
for a component shared by 14 callers without maintaining two implementations, the one thing E5's
standing answer rules out.

So what was actually wrong with E1-8 is narrower than "the premise expired", and worth stating
precisely: **E1-8 was right about the mechanism and right about the magnitude; it was wrong only in
treating a transient cost as a permanent reason.** The intermediate is bounded (4–5, not unbounded),
it is confined to the epic that creates it, and its exit condition — the 14 callers converting — is
now cheap in a way it was not in August, because 7 of the bodies no longer need touching. A cost you
pay and recover inside one epic is a sequencing question, not a veto.

The generalisation, which is the fourth of its kind in this programme: **a deferral is a measurement
with a date on it.** E1-8's "last" was correct on its evidence and read as a rule for two epics
without being re-measured. This section then made the mirror-image error in the same paragraph that
diagnosed it — re-measuring the *bodies*, which had changed, and not the *slot mechanism*, which had
not. Both halves are recorded because the second is the one a reader is likely to repeat.

**What this changes operationally.** Nothing about the plan, and two things about the reporting.
First, the closing report states the peak as well as the endpoints; a reader who measures mid-epic
must find the number already written down rather than think they have found a regression. Second the
draining tasks (US-1104 through US-1107) are the ones that pay, so they should not be deferred or
split further for convenience — the epic is at its worst on Rule 4 exactly while they are pending.

## E9-5 — Ordering

Leaf-first, so the intermediate states never hold a React tree inside a native slot that a later
task was going to remove anyway:

The chrome's internal import graph is a chain, and the order is that chain read bottom-up:

```text
EditorToolbar          ← leaf; imports only Panel
  ├── ContentHostFooter
  ├── PageToolbar
  └── ScriptPanel
        └── TextChrome ← composes PageToolbar + ContentHostFooter + ScriptPanel
              └── the 14 index.tsx callers
```

1. **`EditorToolbarView`** — the leaf. 36 lines, six React callers, all of which keep compiling
   through a `mountVanilla` face. Also deletes `ui/app/AsyncEditor.tsx`.
2. **`ScriptPanelView`** — a `TextChrome` child, and also rendered by `BoardEditorView`, which is
   outside the epic and keeps a React face.
3. **`ContentHostFooterView`** — see below; the step that collects the measured slot root.
4. **`PageToolbarView`** — its own task because `SwitchWidget` is the hardest view in the epic
   (§E9-6 concern 8). Six React callers survive it.
5. **`TextChromeView`** — native, composing the three above. `TextChrome.tsx` becomes a shim, and
   Rule 2 keeps the 14 React callers compiling untouched, which is what makes steps 6–9 independent.
6. **The 7 vanilla-bodied callers**, smallest first. Each `index.tsx` → `index.ts` exporting `View`;
   the toolbar-bit helpers become small native views. Every one of these is a −2 on Rule 4.
7. **The 7 React-bodied callers.** Index converts; the body is mounted through `mountReact`, so the
   root **relocates rather than disappears**. Their gain is contract deletion, not roots, and the
   task must say so.
8. **Delete `TextChrome.tsx`** and the `ReactNode` members.

**Why `ContentHostFooter` pays first.** The measured slot root (§E9-2) is produced by
`ContentHostFooter.tsx`'s `ScriptToggleButton`: it renders `<Button name="text-toggle-script">` — a
native view behind a `mountVanilla` face — with a `<span>` as its **child**, so `fillSlot` opens a
React root inside a vanilla component. Once `ContentHostFooterView` builds that span itself, the slot
root disappears **while `TextChrome` is still React**, because most callers pass no
`footerContributions` at all. So step 3 alone should take **10 of the 14** editors from 2 roots to 1
— the epic's earliest payoff, and an independent check on §E9-2's discriminator before anything
structural moves.

**Corrected during US-1101's investigation:** this paragraph first said 13 of 14, "only `notebook`
does". Measured, **four** of the fourteen pass `footerContributions` — `graph` (`index.tsx:102`),
`grid` (`:30`), `link-editor` (`:190`) and `notebook` (`:101`) — plus `BoardEditorView.tsx:92`, which
is outside the epic. Those four keep one slot root until their own task converts their footer bits,
so the win here is 10, not 13. The claim was written from the one caller that came to mind rather
than from a search; it is the smallest error in this document and the easiest kind to repeat.

### The ordering was wrong once, and the correction is the same shape as E8's

The first cut of this epic put `ScriptPanel` in US-1099, on the reasoning that it is a child of
`TextChrome` and Rule 1 therefore requires it first. That is true and incomplete: **`ScriptPanel` is
not a leaf.** `EditorToolbar` sits below it, so a native `ScriptPanelView` written first would have
had to mount `EditorToolbar` through `fillSlot` — which is a `mountReactHandle` root. Today both are
React inside the editor's single existing root, so the toolbar costs **0**; under the mis-ordered
plan it would have cost **+1 whenever the script panel is open**. A task in an epic whose measured
number is React roots would have moved that number the wrong way.

Caught at plan review, before implementation, when Codex's US-1099 document faithfully planned the
React island the mis-ordering forced. The generalisation is E8's own lesson pointed at a different
graph: **derive the order from the import graph, not from the containment relationship you happen to
be thinking about.** "Child of `TextChrome`" and "leaf of the chrome" are different questions, and
only the second one orders the work.

The type graph permits this cut, which is the difference from E8. There, retyping a prop broke every
caller in one compile, so the atomic unit was the connected component of the prop-type graph and
three cuts by folder were wrong. Here the graph is a **star with a compatibility shim at its
centre**: `TextChrome.tsx` keeps accepting `ReactNode` until step 6, so each caller is genuinely
independent and one editor per task is a safe cut. E8's lesson is not that folders are always wrong
— it is that the cut has to be *derived* from the graph, and here the derivation permits what E8's
forbade.

## E9-6 — Concerns

1. **`RunButtons`' selection state has no reactive channel.** `TextChrome.tsx:150` reads
   `const hasSelection = model.hasTextSelection?.() ?? false;` with no subscription — only
   `language` is subscribed. The "Run All Script" button therefore appears today *because React
   re-renders the chrome for unrelated reasons*. This is §6.1's masked-defect class exactly, and the
   third instance (US-1016) is its closest precedent: state the child renders but is never handed.
   A converted view will freeze that button until something else forces an update. The fix belongs
   with the conversion: give the selection a real channel on the model, not a repaint.
2. **`isTextFileHost` is a duck-type with a scar.** `TextChrome.tsx:186-198` discriminates
   `TextFileModel` from `NoteItemEditModel` (the US-557 inner-note fake host) on the presence of
   `setEditorOverlayRef`, because the original discriminator was silently inverted by US-559 —
   symptom: footer, `ScriptPanel`, run and compare buttons all stopped rendering. Carry the check
   and the comment over verbatim; do not "clean it up" into an `instanceof`.
3. **Focus management is a timed subscription.** The `pagesModel.onFocus` effect refocuses the
   chrome root after a 200 ms `setTimeout` when its page becomes active. In a native view this is a
   `bind`/subscription with an owned timer that must be cleared on dispose, or a page switch during
   the window leaks a focus steal into the next editor.
4. **The error boundary does not follow.** `AsyncEditorView` wraps the React arm in
   `EditorErrorBoundary`; the `View` arm gets `try/catch` + `showVanillaError`, which catches
   construction and mount, **not** a descendant React render. The 7 editors in step 5 keep a React
   body, so their index view must mount it inside its own boundary or they lose the protection the
   ledger says survives until the last React editor subtree converts.
5. **Slot ordering is documented behaviour.** `TextChromeProps`' comments specify that
   `toolbarContributions` render between the text-host buttons and the auto-inserted spacer, and
   `rightToolbarContributions` after the spacer and before the switch widget. Native slots must
   reproduce the order, and `footerContributions` must stay ignored on the `NoteItemEditModel`
   branch.
6. **`setEditorOverlayRef` is a ref callback on a bare div** inside the chrome. It becomes a direct
   element handoff — with the same lifetime, so the overlay must be handed back as `null` on
   dispose or the host holds a detached node.
7. **Three more instances of concern 1, all verified in source.** The `hasTextSelection` case is not
   alone; the chrome is full of values read during render with no reactive channel, each surviving
   only because React re-renders the row for unrelated reasons:
   - `ContentHostFooter.tsx`'s `ProviderIcon` says so outright — *"Touch state so the footer
     re-renders normally; pipe is stable per page"* — subscribing to `filePath` purely to force a
     render, then reading `host.pipe` and `pipe.transformers`, neither of which has a channel.
   - `PageToolbar.tsx`'s `NavPanelButton` reads `model.page?.sidebarMandatory`,
     `model.getNavigatorTarget()` and `model.page?.canOpenNavigator(...)` — three plain calls, no
     subscription. Its visibility therefore has no channel at all.
   - `ScriptPanel.tsx:361` calls `libraryService.state.use()` with **no selector and no use of the
     result**, solely so `scriptModel.getAvailableScripts()` is re-read on the next render.
   Each is a §6.1 masked defect waiting for its conversion, and each needs a real channel rather
   than a forced repaint. They are listed here so no task treats one as a rendering bug.
8. **`SwitchWidget` is the hardest view in the epic**, and the reason `PageToolbar` gets its own
   task. It composes **five** reactive inputs — `model.state.use`, `useOptionalState` on
   `model.contentHost?.state`, `customEditorRegistry.useBoardsForFile`,
   `publishedBoards.useCatalogBoardsForFile`, `boardInstallRegistry.useInstalled` — into one
   `ISegment[]`, with ordering rules for the Board Info "+" segment. The last three are custom React
   hooks whose non-React forms must be found or added before the view can be written; that check
   belongs in the task's investigation, not its implementation. One hazard *disappears* on
   conversion and should be deleted rather than ported: the comment at `PageToolbar.tsx:78-81`
   explains that `useOptionalState` is used instead of `contentHost?.state.use(...)` because a
   conditional hook would "render fewer hooks and crash". A native view has no hook count.
9. **`editorRegistry.ts:308-316` normalizes `View` → `Component`** through `mountVanilla`, and
   `RenderEditorView.ts:56` casts `module.Component as unknown as FileEditorComponent`. As modules
   move to `View`, check whether that normalization still has a consumer — `AsyncEditorView` prefers
   `View` and never reads the normalized value. If it is dead it should die here rather than
   silently keep a React path alive for editors that no longer have one.

## E9-6a — The `SlotContent` widening, and why it will recur

*(Found in US-1101's investigation, 2026-08-26. Recorded here rather than in that task because it is
a rule for the rest of the epic, not a decision about the footer.)*

`uikit/Button/ButtonView.ts:104` types its children `React.ReactNode`. **`React.ReactNode` does not
include DOM `Node`**, so a *native* caller cannot hand a converted uikit view a plain element — it
type-errors, and the tempting fix is a cast, which is precisely the shape EPIC-066 spent an epic
deleting.

The correct fix is the seam type that already exists: `uikit/shared/fill-slot.ts:5` declares
`SlotContent = string | Node | React.ReactNode`. So the rule for this epic and after it is:

> **The native class takes `SlotContent`; the React face keeps `React.ReactNode`.**

The face's narrower type flows into the view's wider one, React callers are unaffected (Rule 2), and
a native caller can pass a DOM node — which is what makes `fillSlot` take its **non-React arm** and
therefore what keeps the root count falling instead of rising.

This is EPIC-066's residue surfacing from the other side. E8 retyped converted views' *event* props
away from React types and explicitly left the `fillSlot`/`applyRestProps` family alone as a non-goal.
That was right, but it means every converted uikit view still declares its *children* in React's
vocabulary — invisible for as long as every caller was React, and a hard error the moment one is not.
Expect it in every remaining task that composes a uikit view from native code, and widen only the
views a task actually uses.

## E9-6b — A chrome view composes its toolbar; it does not extend it

*(Found at US-1101's implementation review, 2026-08-26.)*

The first implementation of `ContentHostFooterView` had it `extend EditorToolbarView`, which reads
naturally — the footer *is* a toolbar row — and produced a double cast in the React face:

```ts
const viewConstructor = ContentHostFooterView as unknown as VanillaViewCtor<ContentHostFooterProps>;
```

**That cast is the whole finding.** `VanillaViewCtor<P> = new (props: P) => VanillaView<P>` requires
the constructor's parameter and the view's type parameter to be the same type. Extending
`EditorToolbarView` fixes the latter to `EditorToolbarViewProps` while the constructor takes
`ContentHostFooterProps`, so the two disagree and only a cast hides it. `EditorToolbar.ts` needed no
cast, because there the view's props and the face's props genuinely correspond — the difference is
diagnostic.

An `as unknown as` in this epic is a direct regression against EPIC-066's closing property, which was
reached by deleting all 17 of them. The rule that follows is worth more than the fix:

> **A cast at a `mountVanilla` face means the view's props and the face's props disagree. Fix the
> relationship, not the type.**

Here the relationship was wrong: a footer *contains* a toolbar. `ContentHostFooterView` extends
`VanillaView<ContentHostFooterProps>` and owns an `EditorToolbarView` child whose root is the
footer's own root, so the public DOM is byte-identical — same root, same
`data-name="text-chrome-footer"` — and the types need no help. `PageToolbarView` (US-1102) has the
same shape and must compose for the same reason.

The general form, since inheritance will keep looking attractive in the remaining tasks: a
`VanillaView`'s type parameter is part of its public contract, so inheriting a view in order to
inherit its *root element* silently inherits its *props type* too. Composition costs one field.

## E9-7 — Non-goals

- **Converting any editor body.** The 7 React bodies in step 5 stay React. This epic converts
  `index.tsx` files and the chrome, nothing else.
- **Deleting `PageToolbar`, `EditorToolbar` or `ContentHostFooter`.** Ten callers outside the epic
  keep their React faces alive; the removal-ledger entry for the chrome is updated to name them
  individually rather than closed.
- **Deleting `applyRestProps` / `clearRestListeners` / `bindRef` / `fillSlot`.** E8 deferred these
  "to the end, with `<TextChrome>`". E9 splits that pairing: `<TextChrome>` goes now, the bridge
  cannot, because the ten survivors above plus every remaining React body still feed it. 40 / 39 /
  18 / 30 files respectively.
- **`EditorError.tsx`** — four React callers, all out of scope.
- **`EditorModule`'s dual arm.** It narrows from 30 React modules to 16; deleting the arm is the
  property of whichever epic converts the last one.
- **`ui/secondary-views/SecondaryViews.tsx`** — 4 of the 11 measured roots, and the single best
  remaining roots-per-line target, but out of scope by §E9-3. Named as an E10 candidate.

## E9-8 — Tasks

Task numbers are execution order.

| Task | Title | Status |
|---|---|---|
| US-1099 | `EditorToolbarView` — the chrome's leaf, 6 React callers keep faces; delete `ui/app/AsyncEditor.tsx` | Planned |
| US-1100 | `ScriptPanelView` — `BoardEditorView` keeps a React face | Planned |
| US-1101 | `ContentHostFooterView` — collects the measured slot root: 10 of the 14 editors go 2 → 1 (the other 4 pass `footerContributions`) | Planned |
| US-1102 | `PageToolbarView`, including `SwitchWidget`'s five reactive inputs; re-measure the 6 surviving React callers | Planned |
| US-1103 | `TextChromeView` — native; `TextChrome.tsx` reduced to a `mountVanilla` shim | Planned |
| US-1104 | `markdown`, `html`, `svg`, `log-view` → `View` | Planned |
| US-1105 | `notebook`, `mermaid`, `grid` → `View` (the three with real toolbar-bit clusters) | Planned |
| US-1106 | `env-vars`, `rest-client`, `monaco`, `file-diff` → `View` (React body via `mountReact`) | Planned |
| US-1107 | `graph`, `link-editor`, `draw` → `View`; delete `TextChrome.tsx` and its `ReactNode` members | Planned |

**Nine tasks, re-cut twice from the original seven, and both re-cuts are recorded rather than
renumbered silently** — E8's most expensive lesson was that its boundaries were wrong three times,
and the corrections are what made this epic's cut derivable at all. The first re-cut split
`PageToolbar` out on its own because `SwitchWidget` composes five reactive inputs and three custom
React hooks (§E9-6 concern 8), which is not the same kind of work as a 36-line wrapper. The second
put `EditorToolbar` first, because `ScriptPanel` is not a leaf and the original order would have
added a React root (§E9-5).

One mechanical note for the implementation tasks: **Codex cannot run `git mv`** — its sandbox has
`.git` read-only, so a rename lands as a plain move. That is fine, because git's rename detection
recorded all four of EPIC-066's `.tsx` → `.ts` renames as `R` at commit time from content similarity
alone. No task should spend effort trying to force it.

Green `tsc --noEmit` and clean `npm run lint` are completion conditions of every task, not
follow-ups — E8's mis-cuts were caught by exactly that gate. `.tsx` → `.ts` renames are an explicit
requirement of each task, not a tidy-up: that includes `NotebookBody.tsx`, a JSX-free `mountVanilla`
face that US-1103 deletes or renames, and the `index.tsx` → `index.ts` rename in every one of
US-1102 through US-1105.

## E9-10 — Result after the ninth task (static measures; Rule 4 pending)

All nine tasks are implemented. `npm run typecheck`, `npm run lint` and `npm run build-prod` pass on
the combined tree, run by hand after the last task rather than only per task. **The epic is not
closed**: its headline number is a React-root count, and that can only be taken against a running
renderer (§E9-9a).

| Measure | At open | Now |
|---|---:|---:|
| `<TextChrome>` call sites | 14 | **0** — the file is deleted |
| `TextChromeProps`' `ReactNode` members | 4 | **0** — deleted with the file |
| Editors registering `EditorModule.View` | 1 (`toolset`) | **15** |
| Editors still on the `Component` arm | 30 | 15 |
| `.tsx` files in `editors/base` | 5 | **1** (`EditorError.tsx`) |
| `.tsx` files in `editors/text` | 1 | **0** |
| Renderer non-story `.tsx` files | 225 | **205** |
| JSX-bearing files, renderer-wide | 126 | **106** |
| JSX-bearing files in `editors/` | 107 | **88** |
| `as unknown as` in the chrome | 4 | **1** — the sanctioned duck-type probe |

**Four §6.1 masked defects found and given real channels**, each of which had been working only
because React re-rendered its parent for unrelated reasons:

| Defect | Symptom it would have had | Channel it now uses |
|---|---|---|
| `RunButtons`' `hasTextSelection()` (`TextChrome.tsx:150`) | "Run All Script" frozen on its first state | `model.state.hasSelection`, already written by `MonacoBody.tsx`'s cursor listener — consumed, not invented |
| `ProviderIcon`'s forced re-render (`ContentHostFooter.tsx:71-95`) | Provider badge stuck after Save As, rename, restore or decrypt | a new non-persisted `pipeState` on the text-host model |
| `NavPanelButton`'s three unsubscribed reads (`PageToolbar.tsx:43-63`) | File-explorer button appearing or vanishing a beat late, or not at all | `page.state` plus the file-path and pipe channels |
| `ScriptPanel`'s result-less `libraryService.state.use()` (`:361`) | Script dropdown stale after a language change | explicit `libraryService.state` and `model.state.language` bindings |

The first of those is the one worth remembering: **the channel already existed.** `MonacoEditor`
has kept `hasSelection` in state since long before this epic, and `hasTextSelection()` reads it —
the only thing missing was a subscription. The defect was not an absent capability but an absent
`bind`, which is exactly why it survived four years of the code looking correct.

**Two service APIs were added rather than worked around** (US-1102). `PublishedBoards.state` and
`BoardInstallRegistry.state` are both `private readonly`, and their sync getters cannot notify, so
`subscribeCatalogBoardsForFile` and `subscribeInstalled` were added **beside** their existing hooks,
each sharing one extracted projection with its hook so the two can never drift. Reaching past the
façade into private state, or polling, would both have been cheaper in the hour and wrong.

**What was deliberately not done**, restated as fact rather than estimate, because a closing task
over-reaching is this programme's most repeated failure:

- `PageToolbar`, `EditorToolbar` and `ContentHostFooter` keep React faces — 6, 3 and 1 callers
  outside this epic.
- `EditorError.tsx` stays; four React editor bodies use it.
- `applyRestProps`, `clearRestListeners`, `bindRef` and `fillSlot` all stay, fed by those faces and
  by every remaining React body. E8 scheduled them "with `<TextChrome>`"; that pairing was wrong.
- The registry's `View` → `Component` normalisation shim stays — verified still consumed by
  `ui/app/RenderEditorView.ts`.
- No editor **body** was converted. Seven of the fourteen still import React in their `index.ts`,
  and that is correct: they mount a React body inside an `EditorErrorBoundary`. Their roots
  **relocated** rather than disappeared, which is why the closing property never promised 0 for them.

**What still has to happen before this epic can close.** The Rule 4 measurement in §E9-9a, taken
against a cold-started app, plus the visual pass listed there. Until then the honest status is
"implemented and statically verified", and the epic stays Active.

## E9-11 — The closing measurement, and a correction to the baseline instrument

Taken live on 2026-08-26 after all nine tasks, on the recovered renderer. Each editor was opened on
a scratch page, roots counted inside `[data-name="page-editor"]`, then the page closed.

**The final pass records the editor each page actually resolved to, and that is what exposed a bad
row in §E9-2's baseline.** `app.pages.addEditorPage(editorId, …)` does **not** force the editor: it
creates a text page and lets the normal resolution pick. For thirteen of the fourteen the ask and the
result agree. For `svg-view` they do not — it resolves to **`monaco`**, and so does opening a real
`.svg` file, because the SVG editor is a *preview* the user switches to rather than a default for the
extension. So the `svg-view` row in the baseline table measured monaco, and so did the first draft of
this one.

| Editor | Baseline (§E9-2) | Now | |
|---|---:|---:|---|
| `grid-csv` | 2 | **0** | vanilla body |
| `log-view` | 2 | **0** | vanilla body |
| `md-view` | 2 | **0** | vanilla body |
| `html-view` | 2 | **0** | vanilla body |
| `mermaid-view` | 2 | **0** | vanilla body |
| `notebook-view` | 2 | **0** | vanilla body; the only caller using all four slots |
| `monaco` | 2 | 1 | React body, root relocated |
| `graph-view` | 2 | 1 | React body, root relocated |
| `draw-view` | 2 | 1 | React body, root relocated |
| `link-view` | 2 | 1 | React body, root relocated |
| `rest-client` | 2 | 1 | React body, root relocated |
| `env-vars-view` | 2 | 1 empty / 2 with content | React body |
| `file-diff` | 2 | 2 | React body **plus** its own React toolbar picker |
| `svg-view` | *not measured* | *not measured* | see above — needs an editor switch, which the script instrument cannot drive |

**Six editors reach 0.** Seven relocate their root into their still-React body, which is what
§E9-4 and §E9-7 said would happen and is why the closing property never promised 0 across the board.
The intermediate peak of 4–5 is gone.

Two honesty notes on the comparison itself:

- **The two passes were not run under identical conditions.** The final pass sets content, so that
  editor resolution is real; the baseline pass did not. It changes exactly one row: `env-vars-view`
  reads 1 with no content and 2 with content. Like-for-like against the contentless baseline it is
  2 → 1.
- **The slot-root discriminator from §E9-2 no longer means what it meant.** At baseline,
  `slot == 1` identified "renders through `<TextChrome>`", because the only slot root was the
  footer's. Now every remaining root *is* a slot root, because a React body reaches the chrome
  through its `children` slot. The discriminator was a good progress gate during the epic and is
  retired at its close; it should not be carried into E10 as if it still identified the same thing.

**This is the fourth Rule 4 instrument correction in the programme** (after EPIC-060's page-manager
mis-read, E3-6's Monaco-churn mis-attribution, and E5-3's invisible-root fix). Its shape is the one
E5-3 established: the fix was to make the instrument *report what it actually measured* — the
resolved editor id — rather than to re-read the source. A measurement that cannot name its own
subject is not evidence, and thirteen correct rows were hiding one that had never measured the editor
it was labelled with.

## E9-12 — What the close review caught

`/review` raised three findings. Two were left alone deliberately; one was a live regression this
epic had introduced, and it is the most useful entry in this document.

**The blocker: US-1101's new channel had a writer that bypassed it.** `ContentHostFooterView` binds
`TextFileModel.pipeState`, the channel added to replace `ProviderIcon`'s self-documented forced
re-render. But `pipe` was a plain field kept in step by two explicit `pipeState.set` calls inside
`TextFileIOModel`, and `PagesLifecycleModel.ts:186` assigns `editor.pipe` **directly** on the ordinary
file-open path. So the badge was missing on every normally opened file and appeared only after a Save
As or rename — the opposite of the defect the channel was added to fix, and invisible to typecheck,
lint, build and the root count alike.

Fixed by making `pipe` an **accessor over `pipeState`** rather than patching the one caller, so the
value and the channel cannot diverge and the two now-redundant explicit `set` calls are gone.
Verified live: opening `README.md` shows `Local file — …\README.md` in the footer.

**The transferable lesson, which is the sharpest one in the epic:** *replacing a forced re-render with
a channel is only complete when every writer of the underlying value goes through it.* A forced
re-render reads the value fresh, so it cannot miss a writer; a channel can, and it fails silently in
the direction that looks like "the feature was never wired up". When converting one, do not search for
readers — search for **writers**, and prefer making the field an accessor over the channel so the
compiler enforces what a convention would only ask for.

Two findings deliberately not acted on, recorded so a later reader does not re-raise them:

- `editors/text/ScriptPanel.ts:16`'s `const nodefs = require("fs")` violates `CLAUDE.md`'s no-direct-`fs`
  rule, but it is **pre-existing** (it was `ScriptPanel.tsx:23` before the epic), lives in the model
  rather than the converted view, and was explicitly excluded from US-1100's scope. Logged separately.
- `ScriptPanelView.ts:251,253-257` uses non-null assertions on six toolbar children.
  `createToolbarChildren()` initialises all six before any read and they live as long as the open
  branch, so no null is reachable; `runAllButton`, the one that is conditional, is already guarded.
  Style guidance, not a defect.

## E9-9a — Deferred live verification

*(Recorded 2026-08-26, user decision: the epic was implemented while the user was away and the
machine's screen locked, so "verify it in Persephone" was explicitly deferred to a joint session
rather than skipped.)*

The renderer stopped answering `execute_script` immediately after US-1099 landed. That is the
expected E8-12 symptom, not a defect: the change batch included a `.tsx` → `.ts` rename
(`EditorToolbar.tsx` → `.ts`), which defeats HMR's specifier resolution, and CLAUDE.md's own note
says a renderer reload alone does not clear it. **Per the roadmap's standing rule, a wedged renderer
is not reported as a defect until a cold start reproduces it**, and a cold start was not attempted
because the screen was locked and nothing on it could be seen anyway.

Everything checkable without the renderer *was* checked per task: `npm run typecheck`,
`npm run lint` and `npm run build-prod` all pass, and the diff was reviewed against each task's
plan. What is outstanding is the Rule 4 re-measurement and the visual pass. The baseline in §E9-2 is
safe, because it was taken before any conversion — which is the only measurement that could not have
been recovered later.

**To run in the joint session, against a cold-started app.** Open one chrome-pinned editor
(`md-view` is the cheapest) and one non-chrome editor (`git-tree`), then:

```js
// per open editor: expected 0 after US-1107, and see the §E9-4 peak table mid-epic
document.querySelectorAll('[data-name="page-editor"] [data-react-root]').length
document.querySelectorAll('[data-name="page-editor"] [data-part="react-slot"][data-react-root]').length
// US-1101's specific claim: the text-toggle-script slot root is gone
document.querySelectorAll('[data-name="text-chrome-footer"] [data-react-root]').length   // → 0
// US-1100's specific claim: the script panel adds no root
document.querySelectorAll('[data-name="script-panel"] [data-react-root]').length          // → 0
// US-1099's hideWhenEmpty fix: an empty toolbar row must still collapse
Array.from(document.querySelectorAll('[data-hide-when-empty]'))
    .map(e => [e.dataset.name, getComputedStyle(e).display, e.childElementCount])
```

**Visual checks that no query can stand in for**, listed because each one is a behaviour a converted
view can silently lose: the script panel opening and closing with the `script` footer button; the
splitter dragging the panel height; typing in the script editor without the caret jumping (the
`setValue` guard, §E9-6); the script dropdown refreshing after a language change (the masked defect
US-1100 fixes); the provider badge and encoding label in the footer (US-1101's `ProviderIcon`
channel); the "Run All" button appearing on a selection; the editor-switch segmented control still
offering the same options; and an editor whose toolbar row is genuinely empty still collapsing rather
than showing a blank strip.

## E9-9 — Progress

All three gates — `npm run typecheck`, `npm run lint`, `npm run build-prod` — pass on every task
marked Implemented. Live verification is deferred to the joint session (§E9-9a).

| Task | State | Notes |
|---|---|---|
| US-1099 | **Implemented** | `EditorToolbarView`; `hideWhenEmpty` extended in `Panel.css` with a `:has()` rule so an empty React slot still collapses the row; `AsyncEditor.tsx` deleted; face renamed `.tsx` → `.ts` |
| US-1100 | **Implemented** | `ScriptPanelView`; `ScriptPanel.tsx` → `.ts`, now importing no React at all; `handleKeyDown` retyped to the native `KeyboardEvent`; the stale-dropdown language defect fixed |
| US-1101 | **Implemented** | `ContentHostFooterView` + co-located CSS; `ProviderIcon`'s forced re-render replaced by a real non-persisted `pipeState` channel; `ButtonView` children widened to `SlotContent`; face renamed `.tsx` → `.ts`. One review round: a double cast, see §E9-6b |
| US-1102 | **Implemented** | `PageToolbarView` + `SwitchWidgetView`; `subscribeCatalogBoardsForFile` and `subscribeInstalled` added beside their hooks, each sharing one extracted projection; `NavPanelButton` given real channels |
| US-1103 | **Implemented** | `TextChromeView`; 3 of the 4 `as unknown as` casts removed, the `isTextFileHost` probe kept and improved into a type predicate; `RunButtons` bound to the existing `hasSelection` channel. One review round: the `footerContributions` seam, widened to `SlotContent` |
| US-1104 | **Implemented** | `markdown`, `html`, `svg`, `log-view` — all four reach the target with no React import, no JSX and no cast |
| US-1105 | **Implemented** | `notebook` (the only caller exercising all four slots), `mermaid` (its `useRef` handle became an owned field), `grid` (search input keeps focus) |
| US-1106 | **Implemented** | `env-vars`, `rest-client`, `monaco`, `file-diff` — React bodies kept, each wrapped in `EditorErrorBoundary`; Monaco's `hasSelection` listener verified intact |
| US-1107 | **Implemented** | `graph`, `link-editor`, `draw`; `TextChrome.tsx` deleted at 0 callers; every survivor deliberately kept |
