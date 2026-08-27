# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active

- *(no epic)*
  - [ ] US-1131: **guard the `VanillaView` constructor rule mechanically — schedule before the next conversion epic.** *The constructor must not create or touch child DOM* (`uikit/CLAUDE.md`) has now been broken **four times across three epics**: `MermaidBodyView` (EPIC-059, see US-1055), `NotificationView` (EPIC-066), and both `BlockingBranchView` and `ProgressPillView` (EPIC-055). **Two were live crashes.** None was caught by `tsc`, ESLint, `build-prod` or a story render — `private x: T | undefined` makes the constructor compile and the failure is a runtime `TypeError` on an unexercised path. Options: an ESLint rule forbidding `this.<field>` writes and `this.child(...)` in a `VanillaView` constructor, or a base-class assertion that fails loudly in development. Every remaining De-React epic writes new `VanillaView` subclasses, so the fifth instance is already being invited. Supersedes the "raise priority" note on US-1055. **EPIC-070 adds a design constraint:** its close review found `PageSlot.renderNative` missing a mount-failure rollback, which would have left a page permanently blank for the session. That is the same *class* — a failure on a path no gate exercises — but not a constructor violation, so the guard as sketched would not have caught it. Whatever is built should cover mount/construction failure handling too, or the ticket should say explicitly that it does not.
  - [ ] US-1132: three pre-existing `uikit/` lifecycle findings from EPIC-069's close review, none in code that epic added: `ListBoxView` retains obsolete entries in `rowViews` (added at `:329`/`:335`, removed only at `:424`); `DataGridView` omits `releaseChild()` on replaced branches; `ToolbarView` reuses a single-use DOM `IconRef` — worth investigating alongside the nested React root EPIC-069 measured in `ToolbarView`, which may share a cause.
  - [ ] US-1109: the interaction behind US-1108 is a general trap worth removing rather than
    documenting once. `DataGridView.invalidatePushed()` discards the baseline that makes "this option
    disappeared" detectable, and `collectValues` drops `undefined`, so **any** consumer that maps a
    cleared value to `undefined` silently loses the clear. Options: have `invalidatePushed` retain the
    key set (not the values) so a disappearance is still representable, or stop dropping `undefined`
    in `collectValues` and let the union diff carry it. The second is closer to the shim's stated
    exclusion-not-allow-list design but changes what reaches `create()`, so it needs the story
    harness run over all five `DataGrid` consumers. No other consumer has the `|| undefined`
    coercion today, so this is latent rather than live.
  - [ ] US-1111: `editors/text/ScriptPanel.ts:16` uses `const nodefs = require("fs")` directly,
    against `CLAUDE.md`'s no-direct-`fs` rule — seven call sites, all reading and writing script
    library files. Pre-existing (it was `ScriptPanel.tsx:23` before EPIC-067) and it lives in the
    model rather than the converted view, so it was explicitly excluded from that epic's scope and
    raised again by its close review. Move to `app.fs`, or add it to the documented exception list in
    `coding-style.md` with the reason — the `writeFileSync`/`existsSync`/`mkdirSync` calls are
    synchronous inside user actions, so the async `app.fs` port is a behaviour change, not a rename.
  - [ ] US-1091: `data-part="react-slot"` is stamped unconditionally by `uikit/Dialog/DialogView.tsx:87` and `uikit/Tag/TagView.tsx:88`, before either view picks its native or React arm — so a host holding plain DOM carries the React marker and the De-React programme's Rule 4 instrument counts roots that do not exist. `fill-slot.ts` stamps it only on its real React container, so the defect is limited to those two views; `data-react-root` (set only by `mountReactHandle`, deleted on dispose) is the reliable marker. Measured in EPIC-065: `EditLinkDialog` open reported 1 root under the both-markers instrument and 0 under `data-react-root`. Fix: stamp the marker only on the React branch. Deferred out of EPIC-065 to avoid putting unreviewed `uikit/` changes inside a closed epic. Counterpart to EPIC-063 E5-3, which added the marker because a root was *invisible* — same lesson, opposite direction.
  - [ ] US-1055 **(the rule behind it is now tracked as US-1131 — four violations, two of them live crashes)**: `mermaid/MermaidBodyView.ts` builds its child DOM in the constructor, against `uikit/CLAUDE.md:496-502` ("the constructor … must not create child DOM"; `mount()` is where child DOM is built). Found by EPIC-060's close review, which fixed the same violation in the five views it owned; this one is from EPIC-059 and was left out of scope. Move child creation and attachment into `onMount()`, keeping exactly-once child mounts and FIFO cleanup ordering. Low risk, but it is the file every later editor conversion copies — see [`doc/tasks/epic60-review.md`](tasks/epic60-review.md).
  - [ ] US-1050: `unregister_toolset` MCP tool — the agent can `create_toolset` (with a user confirmation prompt) but has no way to unregister/remove one; cleaning up a scratch toolset required reaching into the internal `toolsTrust.untrust` via `execute_script`. Add an MCP tool (in `src/renderer/api/mcp/tool-commands.ts` beside `refresh_toolset`) that unregisters a toolset by root path; folder deletion stays the agent's own fs call. Decide whether it needs a confirmation prompt like registration (unregistering is less dangerous than registering — probably no prompt, but flag it).
  - [ ] US-1041: `SearchChannel.cancel` should carry a search id — the main process cancels per window (`event.sender.id`), so a disposed FileSearch view cannot cancel its own worker without risking another view's search
  - [ ] [US-1039: Tree search clear does not restore expansion after a zero-match search](tasks/US-1039-tree-search-clear-restore/README.md)

## Planned

- [De-React roadmap](de-react.md) — multi-epic programme to replace React with direct DOM
  manipulation. Epics are created from it one at a time. Epic C is split four ways: **C1 is
  complete as EPIC-054**, **C2 is complete as [EPIC-055](epics/EPIC-055.md)**, **C3 is complete as
  [EPIC-056](epics/EPIC-056.md)**, and **C4 is complete as [EPIC-057](epics/EPIC-057.md)** — the last
  epic in Epic C. **Epic D is complete as [EPIC-058](epics/EPIC-058.md)** — the shell is vanilla and
  the application root is flipped. **Epic E is split: E1 is complete as
  [EPIC-059](epics/EPIC-059.md)** — the four editor seams every conversion needs now exist, each with
  a converted pilot — and **E2 is complete as [EPIC-060](epics/EPIC-060.md)**: the five
  `EditorModule.Body` providers are vanilla and that React contract is deleted from the registry.
  `react-markdown` now has no importer. **E3 is complete as [EPIC-061](epics/EPIC-061.md)** — it took
  the other shared contract, `@monaco-editor/react`, across 13 mount points behind two `VanillaView`
  hosts, and closed by uninstalling the package. **Both editor-wide contracts are now gone**, so E4
  onward are scoped by line count, which is what EPIC-060's E2-1 said to fall back to when no contract
  exists. What remains: the editors, of which the large ones are `graph` (3,259), `link-editor` (2,847)
  and `notebook` (2,001) — two of them also carrying removal-ledger entries (`RenderGrid`,
  `RenderFlexGrid`, `highlight`'s React form), so they are conversion *plus* collection work — and the
  14 `<TextChrome>` call sites, which convert for free once the last shell is vanilla and are therefore
  deliberately **last** in Epic E (EPIC-059 E1-8). **E4 was [EPIC-062](epics/completed.md), now complete** — `uikit/RenderGrid/` is deleted and `uikit/VirtualGrid/` is the only virtualization engine. It
  corrects the "line count from here on" note: a shared contract does exist, it is just owned by
  `uikit/` rather than `editors/` — `RenderGrid`'s cell contract returns a `ReactNode`, pinning all
  12 of its importers to React. E4 deleted `uikit/RenderGrid/` outright, collected two removal-ledger
  entries plus an unplanned third (`RenderGrid.tsx` was the fourth Emotion importer), and took the
  notebook Monaco-churn measurement E3 withdrew and handed forward (E3-6), whose cause was
  `renderInfo.ts:314` keying virtualized cells by row index. **Line count is the axis from E5
  onward** — no shared contract remains to scope by. **E5 is
  [EPIC-063](epics/completed.md), complete 2026-08-25, and it corrected that claim for the second
  consecutive epic**: the surviving contract is
  `ReactSecondaryViewDefinition` in `ui/secondary-views/secondary-view-registry.ts`, which pins 13 of
  the 14 registered sidebar panels to React through the registry rather than through their own
  content. E4-1's generalisation is what catches it — *"no contract left" is a claim about the whole
  import graph, not about one folder* — and the standing check is now that **the axis of the next
  epic is not predicted from the folder the current one touched**. E5 also detonates a latent defect
  the vanilla arm has carried since E1 (a `console.warn` for a React icon fallback the DOM header
  cannot render), which is why its first task is the icon arm rather than a conversion. Deliberately
  out of scope: `SecondaryViews.tsx`, the host's own React face, whose only consumer is the browser
  editor (Rule 1) — that face survives, as does `BoardWebview`'s island inside the board panel.
  **Closing property met:** the registry is single-armed, `LazySecondaryView.tsx`,
  `SideBarPanelHeader.tsx` and `EditorIcon.tsx` are deleted, neither contract file imports React, and
  the sidebar measures **0 React roots** (from 6). E5 also fixed the programme's Rule 4 *instrument*:
  `mountReactHandle` now marks its host `data-react-root`, because a root created outside `fillSlot`
  was previously invisible to the count. **E6 is complete as [EPIC-064](epics/EPIC-064.md)**, 2026-08-25 — the search
  E5-1 requires was run, and candidate 1 is the contract: `uikit/shared/slots.ts`'s
  `IconRef = IconName | ReactNode` and its `renderIcon()`, which returns a `ReactNode`. Measured live,
  **44 of the app's 72 React roots (61%) exist only to render an SVG that already has a DOM builder** —
  every icon in the app has one. E6 is therefore a call-site migration (205 sites) behind a type
  narrowing, not a component conversion. It also **corrects E5-8's own consequence**: deleting the
  member does *not* remove `createRoot` from `uikit/`, because `fillSlot` is fed separately by
  `Button` children and `Input` slots from React callers — *deleting a contract removes the callers it
  pins, not every caller of the machinery underneath it*. Second finding, a reporting correction:
  **130 of the renderer's 262 non-story `.tsx` files contain no JSX at all** (28 never mention React),
  so the `.tsx` counts every epic has reported overstate the remaining React. **E7's candidate is
  already measured** (E6-8): `core/state/view.tsx`'s dialog/popper view registry — 14 vanilla arms to
  4 React, whose conversion deletes the file and collects a residual Emotion importer. Still
  unscheduled: `graph` (3,259), the browser editor (1,692), and the 24 `<TextChrome>` call sites,
  which stay last. **Closing property met:** `IconRef` is `IconName | Node`, `renderIcon` is deleted, and icon React
  roots measure **0** (from 44) on every page set tried. It corrected its own closing property at
  close (E6-11): `SlotText` does *not* narrow, because the link-editor tooltip genuinely needs React —
  the same over-reach E6-1 was written to catch, this time in this epic's own document. Its most
  transferable finding: **when a contract changes from a value to a resource, every cache of that
  value becomes a bug** — the single-use DOM-node hazard hit four times through four mechanisms, and
  no automated gate could see any of them. **E7 is complete as [EPIC-065](epics/completed.md)** — it takes the third contract E6-8 measured
  in advance: `core/state/view.tsx`'s dialog/popper view registry, 14 vanilla registrations against 4
  React. Its opening sweep re-verified the candidate rather than trusting the record, and rejected the
  obvious rival on a number — `trailing?: React.ReactNode` has 5 call sites of which **0 pass JSX**, a
  dead arm rather than a contract. Two findings already: the Rule 4 instrument had to change, because
  these roots exist only while a dialog is open (10 across the four, never more than ~4 at once), so a
  whole-app count would move by 2 and read as noise — **the metric has to match how the cost is
  incurred**; and **line count inverts the real difficulty**, since the two largest files have zero
  React hooks while the smallest carries the epic's only state-migration risk, which corrects E4-1's
  fallback axis to *line count picks the surface, not the order of tasks within it*. It also verified
  EPIC-064's closing property in the wild (0 icon arms on a real 6-page session, not the fixture) and
  measured that it leaves `theme/GlobalStyles.tsx` as the **last non-story Emotion importer**. Next
  free epic number: **EPIC-066**; next free task number: **US-1093**. **Closing property met:**
  `core/state/view.tsx` is deleted, `ui/dialogs/dialog-view-registry.ts` is the only registry, and the
  four surfaces open with **0** React roots (from 10). It leaves `theme/GlobalStyles.tsx` as the last
  non-story Emotion importer. It named **no E8 candidate on purpose** — E5-1 requires the next
  epic to run its own contract search, and E7 is the third consecutive epic whose axis was found by
  searching rather than inherited from the folder the previous one touched. **E8 is
  [EPIC-066](epics/completed.md), complete 2026-08-26** — that search was run over the whole import graph and found
  the contract in the one number nobody had looked at: **65 already-vanilla `.ts` files still import
  React**, and **48 of the React symbols they use are event types**. The contract is that *the public
  props of converted views are typed with React event types*, mediated by `toPublicEvent` in
  `uikit/shared/react-compat.ts` — so a vanilla view wraps the native event it already has, and its
  caller unwraps it again. **All 27 wrap sites are cast, 17 of them with the double `as unknown as`**,
  which is the compiler stating that the prop type is wrong; the other end reads `.nativeEvent` at 32
  sites and needs 11 lossy `as KeyboardEvent`/`as MouseEvent` casts. The tell is the dual-armed
  `"nativeEvent" in e ? e.nativeEvent : e` in `core/events/context-menu.ts` and `core/traits/dnd.ts`
  — the same shape as every contract this programme has deleted, now found in the two accessors every
  context menu and every drop target funnels through. Two scoping decisions worth carrying forward:
  **Rule 4 will not move**, because `toPublicEvent` translates events rather than creating roots (the
  second consecutive epic needing a different metric — the root count measures the React that
  *renders*, not the React that *types*); and the ordering is **hardest first**, because one seam
  decision governs all 27 sites, so the pilot is a React-faced view (`Textarea`, whose
  `ClipboardEvent` is the WebIDL case the Proxy was built for) rather than one of the eight easy
  pure-vanilla files. Rivals rejected on numbers: `Tree`/`ListBox` `renderItem` (**0** real callers —
  a dead arm, the third time that pattern has appeared), `highlight()`'s React form (**1** caller,
  blocked behind graph), and the graph editor (line count, and a contract exists). Deliberately out of
  scope: `applyRestProps`/`clearRestListeners` (**39/38** files) and `bindRef` (17) — the JSX
  rest-props compatibility layer that made incremental conversion possible, which can only go after
  the last JSX caller and therefore belongs with `<TextChrome>` at the end. **Closing property met,
  with two corrections recorded rather than quietly dropped:** `toPublicEvent` and
  `PublicEventHandler` are **module-private, not deleted** — `applyRestProps` calls both, so the
  epic's own two non-goals contradicted each other and it went unnoticed until the external count hit
  zero (E8-13); and **one dual arm survives**, `core/events/context-menu.ts`, because four genuine
  React components in the browser and link editors still dispatch real SyntheticEvents (E8-14).
  Everything else reads 0: 27 wrap sites, 17 `as unknown as`, 11 lossy casts, and 31 of the 32
  `.nativeEvent` reads are gone; already-vanilla `.ts` files importing React went **65 → 58**.
  **Rule 4 deliberately did not move** (7 roots), as E8-4 predicted — the root count measures the
  React that *renders*, not the React that *types*, and that is increasingly what remains. Its
  transferable finding is a test, now written into
  [`model-view-pattern.md`](standards/model-view-pattern.md): **a `mountVanilla` face is not a React
  implementation**, so React event types on its props are nominal for every caller — which is what
  distinguishes a dead dual arm from a load-bearing one. Its most expensive lesson is a process one:
  the task breakdown was mis-cut **three times** by scoping to directories, costing one red build,
  before settling on *the connected component of the prop-type graph* as the atomic unit. Next free
  epic number: **EPIC-067**; next free task number: **US-1099**. **No E9 candidate is named here on
  purpose** — E5-1 requires the next epic to run its own contract search, now four consecutive times
  vindicated. What remains unscheduled: `graph` (8,100 lines across the folder), the browser editor
  (1,692), and the `editors/base` chrome with its 24 `<TextChrome>` call sites, which stay last
  (E1-8) — and which now share their fate with the `applyRestProps` bridge.
  **E9 is complete as [EPIC-067](epics/completed.md)**, and it is the chrome — the item the previous
  three epics all deferred. The search that found it (E5-1's rule, fifth consecutive time) measured
  **107 of the renderer's 126 remaining JSX-bearing files in `editors/`**, so the folder was never in
  doubt; the contract inside it is `TextChromeProps`' four `ReactNode` members, consumed by **14**
  editors — the same one-type-pins-its-callers shape as `RenderCellFunc` (E4),
  `ReactSecondaryViewDefinition` (E5), `IconRef` (E6) and `Views.registerView` (E7). The evidence that
  the pin is the *type* and not the content: **7 of the 14 editors have an already-vanilla `BodyView`
  and their only remaining `.tsx` file is the `index.tsx` that wraps it in `<TextChrome>`**.
  Two figures are corrected here. First, the "24 call sites" above is wrong — measured now it is
  **14**, in 14 files; a `<TextChrome` grep returns 16, of which one is the definition and one a
  comment in `graph/GraphBody.tsx:302`. The removal ledger had it right and this entry restated it
  wrongly. Second, **E1-8's "deliberately last" has expired**: its reasoning was that the slot
  contents "are the same React trees either way", true on 2026-08-24 when every body was React and
  false now that seven are vanilla. What survives of the objection is a bounded, disclosed
  regression. **That bound was then measured and found wrong, in the epic's own favour-checking
  direction:** `fillSlot` takes its React arm for any slot value that is not `null`/`false`/a
  string/a `Node`, so the moment a chrome piece is native while its parent is still React that
  parent's children become a root — which makes the cost the chrome's *internal* composition, not the
  editor bodies. A chrome-pinned editor therefore goes **2 → 4–5 → 0**, and the peak is inherent to
  the epic rather than to its ordering: bottom-up and top-down peak identically, and the only order
  that avoids it converts a component and its parent in one change, which Rule 1 forbids. E1-8 was
  right about both mechanism and magnitude and wrong only in treating a transient cost as a permanent
  reason. The generalisation, the fourth of its kind: *a deferral is a measurement with
  a date on it*, and this one read as a rule for two epics without being re-checked. Baseline measured
  live before scoping: **11 React roots**, of which 4 are one per mounted editor, 4 are per-page
  secondary-views hosts, **2 are `fillSlot` roots opened inside a native `IconButton` by the React
  chrome** (`text-chrome-footer` → `text-toggle-script`, text hosts only), and 1 is `GlobalStyles`.
  Deliberately out of scope: every editor *body* (the 7 React ones relocate their root rather than
  lose it), `PageToolbar`/`EditorToolbar`/`ContentHostFooter`'s React faces (10 callers survive), and
  the `applyRestProps` bridge — E8 deferred that "to the end, with `<TextChrome>`" and E9 splits the
  pairing, because the survivors keep it fed. Rivals rejected: `uikit/Panel`'s face (380 tags, but
  machinery not a contract, and it removes no roots), `SecondaryViews.tsx` (17 lines for 4 roots — the
  best remaining roots-per-line and named the **E10 candidate**), and the large editors (`graph`,
  `browser`, `mcp-inspector`, `rest-client`), which have no contract and are line-count work *after*
  E9. **Re-cut to eight tasks after reading the three chrome files**: `PageToolbar` gets its own task
  because `SwitchWidget` composes five reactive inputs and three custom React hooks, and the split
  moves the epic's first measurable win forward — `ContentHostFooter`'s `ScriptToggleButton` is what
  produces the measured slot root, so converting it takes 13 of the 14 editors from 2 roots to 1
  before anything structural moves. The baseline is **already taken**: all 14 chrome callers measure
  exactly **2** roots (1 editor + 1 `fillSlot` slot root) and every non-chrome editor measures **1**,
  which makes the slot count an exact discriminator for "renders through `<TextChrome>`" and gives
  the epic a mechanical per-task gate. Three further §6.1 masked defects were found and verified
  while scoping — `ProviderIcon`'s self-documented forced re-render, `NavPanelButton`'s unsubscribed
  visibility, and `ScriptPanel`'s result-less `libraryService.state.use()` — all recorded in the epic
  so no task misfiles one as a rendering bug. **Re-cut a second time, to nine tasks**, when Codex's
  first task document surfaced the consequence of an ordering error in the epic: `ScriptPanel` is a
  child of `TextChrome` but it is *not* the chrome's leaf — `EditorToolbar` is — so converting
  `ScriptPanel` first would have forced a `fillSlot` React root for its toolbar and **added** a root
  in an epic measured in roots. Caught at plan review, before implementation. The generalisation is
  E8's lesson pointed at a different graph: derive the order from the import graph, not from the
  containment relationship you happen to be thinking about.
  **Closed 2026-08-26 with its property met:** `TextChrome.tsx` deleted at 0 callers, all 14 editors
  on the `View` arm, six opening with **0** React roots and the other seven relocating their root into
  a still-React body; the documented 4–5 intermediate peak is gone. Four §6.1 masked defects were
  given real channels, and two service subscriptions were added beside their hooks rather than reaching
  past a façade. The close review caught the epic's **own** regression, which is its sharpest lesson:
  *replacing a forced re-render with a channel is only complete when every **writer** of the value goes
  through it* — `pipe` was a plain field that `PagesLifecycleModel` assigned directly, so the footer's
  provider badge was missing on every normally opened file; fixed by making `pipe` an accessor over the
  channel. Two pre-existing §6.1 bugs surfaced during verification and are tracked as US-1108 and
  US-1110. `svg-view`'s root count is recorded as **unmeasured** — `addEditorPage` does not force an
  editor id, so that row had measured `monaco` in both the baseline and the first closing draft, the
  fourth Rule 4 instrument correction in the programme.
  **E10 is complete as [EPIC-068](epics/completed.md)** — and its contract search is the first in the
  programme to come back **negative**. Five epics running found one React-typed member pinning
  otherwise-vanilla callers; every candidate here fails that test, each for a different reason, which
  is what makes the negative credible: `EditorModule.Component` is **load-bearing** (15 editors on the
  arm, but their bodies are genuinely React); the three surviving chrome props are **nominal**, since
  all three files are pure `mountVanilla` shims and E8's own test says such a face binds no React
  implementation; `theme/icons.tsx`'s `SvgIconComponent` is live but thin (**45** importers, 713 lines,
  yet only **32** JSX usages, 14 of them inside editors that convert anyway — its shape is still
  inverted, a React component with an *optional* DOM builder, which is why
  `createIconComponentElement` throws, but fixing it frees nobody); the `applyRestProps` bridge is a
  real contract whose **precondition is unmet** (40/39/18 importers, and **20** `uikit/*View.tsx` files
  are `.tsx` for it alone); `Story.component: React.ComponentType` is a **genuine contract pinning a
  harness rather than the app** (45 stories, one spread at `LivePreview.tsx:64`), deferred with its
  measurement recorded; and `CategoryViewProps.renderItems` has **1** caller — the third rejection on
  caller count. What the negative says is that the remaining React is **terminal**: React because its
  own content is React, not because a type above it demands React. So the axis is content, and the cut
  is **the connected component of the `PageToolbar` module graph** (E8's atomic unit) — six editors,
  **2,895** of the 9,497 JSX lines left in `editors/`, chosen over "the small editors first" (2,497
  lines, collects **nothing**). Two findings already. The baseline was taken on the user's **real
  six-page session**: **4** roots, of which 3 are one per open React-arm editor, all born at
  `ui/app/AsyncEditorView.ts:146`, and `[data-part="react-slot"]` reads **0** — independently
  confirming E9's closing claim on a live session rather than its fixture. And E9's named E10
  candidate, `SecondaryViews.tsx`, was **re-verified and rejected**: credited with 4 roots when
  written, it accounts for **0** now — the fifth instance of *a forward-looking note is a measurement
  with a date on it*, and the reason E5-1's search rule keeps paying. Also corrected: the removal
  ledger records six `PageToolbar` callers, but the module has a **seventh** through its `SwitchWidget`
  export (`board/BoardToolbar.tsx:160`) — grep the module path, not the component name.
  **Closed 2026-08-26 with its property met:** `PageToolbar.ts` deleted at 0 callers, the `Component`
  arm 15 → **9**, the `View` arm 15 → **21**, `editors/` non-story `.tsx` 94 → **76**, and each of the
  six editors contributing **0** React roots where it contributed 1. Five of six verified live with
  real content; **`git-tree` is recorded as statically verified but live-unverified** — both
  programmatic open routes are closed and the user was working in the app — the same discipline E9
  applied to `svg-view`. Its close review found **two real regressions that every gate missed**, both
  now fixed, and the first names a defect class this conversion pattern manufactures: *a `useMemo`
  whose result feeds a callback becomes dead code if the port defines the recompute but never calls
  it* — `changeMapFor()` was defined and never called, so commit badges and an "Open in new Tab"
  action were silently missing while `tsc`, ESLint and `build-prod` stayed green. An empty `Map` is
  still a `Map`, and the symptom is *absence*, which no root count can measure. The second is the
  **persistent-child consequence**: an inactive `<audio>` a native parent now keeps mounted received
  the video source and emitted spurious loading/error states, because React used to suppress that for
  free by unmounting. Together with the epic's `DocumentFragment` finding these are one lesson from
  three directions — *what React did for free by destroying things must become explicit when nothing
  is destroyed*. It also **retired one of its own concerns** rather than implementing it (the
  predicted post-paint sizing for `BoardScreenshot`, which measures nothing) and recorded a genuine
  cross-rule interaction: *a view that measures its own root cannot use a `display: contents` root*.
  **E11 is complete as [EPIC-069](epics/completed.md)** — the Storybook contract, and the first search
  in this programme to *reverse its predecessor's verdict*: E10 had measured `Story.component` and
  deferred it as "pinning a harness, not the app", but it pinned `uikit/`. `Story.component` goes 44
  callers → **2** (`Panel`, `Text`, permanently), `.story.tsx` 43 → **2**, the Storybook editor's six
  `.tsx` → **0**, `uikit/` non-story `.tsx` 70 → **51**, and all **45** stories render. Its own
  headline was wrong in a useful way — it predicted "≥15 faces deleted" and deleted **2**, because a
  face file is also its props-type module, so **20 of 49 React components were removed as dead code**
  while deleting the *files* is a type-relocation job for Epic F. It also found **three unreleased
  bugs, two of them live crashes** (no toast could render; the blocking progress overlay could not
  render), which together make **four violations of one rule across three epics** — *the constructor
  must not create or touch child DOM* — none of them catchable by any gate. Guarding that
  mechanically (**US-1131**) is due before the next conversion epic.
  **E12 is scoped as [EPIC-070](epics/EPIC-070.md)** — the shell's React-typed content: the three
  remaining contracts outside `editors/` that declare React for content the producer already has as
  DOM (the per-page React island, the icon component type, and `FileList.getTrailing`). Its search
  found something larger than its own cut and recorded it rather than acting on it: **the programme's
  headline metric is a proxy and it is wrong.** `EditorModule.Component` callers "9 → 8" measures
  which arm a module registers on, not whether the editor produces React — `monaco` is registered on
  the `View` arm and mounts `MonacoBody` as a React element through a slot that already accepts
  `Node`, and the live baseline shows a React root on every open Monaco page. **Twelve `View`-arm
  editors still produce React** (`graph` 199 JSX markers, `rest-client` 130, `link-editor` 40 + 34
  `createElement`, `notebook` 42, `log-view` 24), every one of them live. That re-cuts what remains of
  Epic E, and it is the **seventh instance** of *the proxy is not the measurement* — the first where
  the proxy was the programme's own headline count.
  **E12 is complete as [EPIC-070](epics/completed.md) (2026-08-27)** — roots **6 → 3** on the baseline
session, and the Rule 4 instrument is honest for the first time: `1 (GlobalStyles) + 1 per
React-producing editor instance`, with no per-open-tab term. 116 icon React components → **1**, 17
slot contracts widened to `SlotContent`, both laundering sites and 15 dead faces/barrels/stubs gone;
`editors/` deliberately unchanged. Its close review found three real defects including a
`uikit/ → components/` import **silenced with an eslint suppression** — the same tell as the casts the
epic deleted. Next free epic number: **EPIC-071**; next free task number: **US-1142**.

*(other recorded epic ideas live in [`tasks/backlog.md`](tasks/backlog.md))*

---

## How This Dashboard Works

### Structure

Each section (Active / Planned) lists epics as top-level items and tasks as sub-items:

```
- **EPIC-XXX** — [Title](epics/EPIC-XXX.md)
  - [ ] US-YYY: Task title
  - [x] US-ZZZ: Completed task title
- *(no epic)*
  - [ ] US-AAA: Standalone task
```

### Starting work

1. Move an epic or task from **Planned** to **Active**
2. Mark the task `[ ]` → `[x]` when done

### Completing a standalone task (no epic)

1. Mark task `[x]` in Active section
2. Move it to [`/doc/tasks/completed.md`](tasks/completed.md)
3. Remove from this dashboard

### Completing an epic

1. All tasks under the epic should be `[x]`
2. Move the entire epic block (with tasks) to [`/doc/epics/completed.md`](epics/completed.md)
3. Remove from this dashboard

### Creating new work

- **New epic:** Add to Planned with link to its doc in `/doc/epics/` — but only when it is
  genuinely next up. An epic that is a recorded idea rather than scheduled work belongs in
  [`/doc/tasks/backlog.md`](tasks/backlog.md) under "Recorded Epics", with its doc's
  **Status** set to `Backlog`. Move it here when work is about to start.
- **New task (with epic):** Add as sub-item under the epic
- **New task (standalone):** Add under `*(no epic)*`

### Task ID Format

`US-XXX` — sequential number. `EPIC-XXX` — sequential number.
