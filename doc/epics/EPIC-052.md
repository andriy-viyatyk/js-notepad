# EPIC-052: De-React Epic A — Style and token foundation

## Status

**Status:** Planned
**Created:** 2026-08-18

## Overview

The second epic of the [de-React roadmap](../de-react.md) (§7, "Epic A"). Its job is to make
styling and theming reachable from code that is not React, so that every later epic can write a
vanilla view without inventing its own way to get a color, a spacing value, or a theme-change
notification.

The roadmap describes it as "emit `theme/color.ts` and `uikit/tokens.ts` as CSS custom properties
on `:root`, per theme, alongside the existing object exports". **Investigation shows the color half
is already done** — see the next section. What remains is the token half, the theme-change
notification path, and the conventions that Epics C, D and E will follow when they replace Emotion
with static CSS.

Like Epic P, every item here is an improvement on its own terms: one of them fixes a bug that is
live on `main` today, and none of them require a single line of vanilla view code.

**Roadmap Rule 5 ("no new React") takes effect when this epic opens.** New UIKit components from
this point are written vanilla-first with a React wrapper. In practice no new UIKit component is
expected during this epic.

## What the roadmap assumed, and what is actually true

The roadmap listed four candidate tasks for Epic A. Measured on the branch at epic open, **three of
the four are already satisfied or misdescribed**:

| Roadmap candidate | Actual state |
|---|---|
| CSS-variable emission for all 10 themes | **Already done, and there are 9 themes, not 10.** `theme/color.ts` is not a color table — all 77 leaves are already `var(--color-*)` strings. Each of the nine files in `theme/themes/` defines exactly those 77 variables: **0 missing, 0 extra, in all nine**. |
| Theme-switch path without a React re-render | **Already done.** `applyTheme()` ([`themes/index.ts:69`](../../src/renderer/theme/themes/index.ts)) writes the variables straight onto `document.documentElement.style`. No React state is involved and no component re-renders to repaint the app. |
| Token pass-through in `GlobalStyles` | **Not done.** `uikit/tokens.ts` is 32 plain numbers with no CSS form. 41 files import it. |
| Emotion-to-CSS conventions in `coding-style.md` | **Not done.** It also carries roadmap open decision #4, which US-975 and US-979 both deferred to this epic; the decision itself is now settled (A6) and US-983 writes it into the standards. |

So the color foundation the roadmap wanted already exists. What it did *not* anticipate is the
gap underneath it: **there is no way to be told that the theme changed.** That is the item that
actually blocks Epic B onward, and it is where most of this epic's weight sits.

## The surface, measured

Counted on the branch at epic open:

| Item | Measure |
|---|---|
| Theme color variables | 77, defined identically by all 9 themes |
| Themes | 9 (`default-dark`, `solarized-dark`, `monokai`, `abyss`, `red`, `tomorrow-night-blue`, `light-modern`, `solarized-light`, `quiet-light`) |
| `theme/color.ts` importers | 93 files — 43 `uikit`, 34 `editors`, 9 `ui`, 7 `components` |
| `uikit/tokens.ts` entries | 32 across five scales (`spacing` 7, `gap` 6, `radius` 6, `height` 6, `fontSize` 7) |
| `uikit/tokens.ts` importers | 41 files — 35 `uikit`, 5 `components`, 1 `editors` (`board-theme.ts`) |
| Theme-dependent consumers with no subscription | 8 call sites reading `isCurrentThemeDark()`, plus `GlobalStyles`' baked data URIs |
| Color resolution paths | 3 (`var()` in CSS, `getResolvedColor()`, `getComputedStyle().getPropertyValue()`) |
| Emotion files (from US-975) | 79 total → 69 eligible production files after excluding stories and the superseded AVGrid set |
| Literal inline styles (from US-979) | 133 `style={{…}}` sites across 51 non-story files |

**The epic's measured number** (roadmap Rule 4): theme-dependent consumers that snapshot without
subscribing → 0; token CSS variables emitted → 31 (32 tokens today, less `radius.full`, which A7
deletes); color resolution paths → 1; and a theme switch still causes zero React re-renders outside
the settings view that initiated it.

## The theme-change gap

This is the substantive discovery of the investigation and the reason this epic is not trivial.

CSS handles theme switching perfectly, because `var()` re-resolves for free. **Everything that is
not CSS does not.** There are nine such consumers and not one of them is subscribed:

- **`onMonacoThemeChange` is a single-slot callback.** `themes/index.ts` holds
  `let monacoThemeCallback: MonacoThemeCallback | null`; registering a second listener silently
  replaces the first. It is a subscription API that supports exactly one subscriber.
- **`isCurrentThemeDark()` is snapshot-read at 8 sites** — `DrawEditor.ts:71`,
  `MermaidEditor.ts:66`, `MermaidOutputView.tsx:57` and `:77`, `MarkdownBlock.tsx:169`,
  `AudioVisualizer.tsx:243`, `icons.tsx:247`, `board-theme.ts:58`. Several seed model state in a
  constructor and never re-read it.
- **`MermaidOutputView.tsx:77` puts `isCurrentThemeDark()` inside a deps array.** It re-evaluates
  only when React re-renders that component for some other reason. This is an accidental dependency
  on reconciliation: delete React and the behaviour disappears with it. It is the clearest example
  of why this epic comes before the view work.
- **`GlobalStyles.tsx:6` bakes a resolved color into the scrollbar-arrow data URIs.**
  `buildGlobalStyles()` runs during render, `AppContent` has no theme subscription, so the arrows
  keep the color they had at startup. **This is a live bug on `main`** — switch to a light theme and
  the scrollbar arrows stay dark until restart. It is independently worth fixing and it is a
  ready-made acceptance check for the subscription work.
- **`ForceGraphRenderer.ts:15` is a third resolution path**, reading variables back out of
  `getComputedStyle(document.documentElement)` rather than through `getResolvedColor()`.

React is not currently hiding all of this — the `GlobalStyles` case is broken today — but it is
hiding some of it, and once views stop re-rendering the rest becomes visible. Fixing it now is
cheap, is verifiable the same day, and is a prerequisite for any vanilla view that paints to a
canvas, a webview, or a data URI.

## Decisions

**A1 — The color foundation is not re-done.** `color.ts` already emits `var()` strings and all nine
themes are complete and drift-free. No task in this epic rewrites the color token table, adds a
build step for it, or changes a variable name. Re-verifying the 77×9 coverage becomes a scan in the
epic's acceptance criteria, not a task.

**A2 — Token variables get an app-local prefix, not the board's.** `board-theme.ts` already
generates exactly the CSS-variable form this epic needs (`mapScale()` → `BOARD_TOKEN_VARS`), but
under the `--p-*` prefix, which is a **frozen public contract for board authors**
(EPIC-034 / US-725). The app emits its own prefix (`--space-*`, `--gap-*`, `--radius-*`, `--size-*`,
`--font-*`) and `board-theme.ts` continues to map app values onto `--p-*`. The *generator* is
hoisted and shared; the *names* stay separate, so a future change to an app token cannot silently
alter a published board contract.

**A3 — One theme state, consumed identically by both worlds.** The theme becomes a `TOneState`
holding at least `{ id, isDark }`, written by `applyTheme()`. React reads it with `use()`; a vanilla
view reads it with `subscribe()`. `onMonacoThemeChange` becomes an ordinary subscriber and its
single-slot field is deleted. No new notification mechanism is invented — this is the existing state
primitive applied to a value that never got one.

**A4 — One color resolution function.** `getResolvedColor()` (theme-table lookup) and
`ForceGraphRenderer`'s `resolveVar()` (computed-style read) collapse into a single exported helper
that accepts either a `--color-*` name or a `var(...)` string. Canvas, data-URI and webview
consumers use it; CSS consumers keep using `var()` and never call it.

**A5 — Epic A writes conventions and infrastructure, not component styles.** No `styled` block is
converted to CSS by this epic except in the single pilot named in US-984, whose purpose is to prove
the conventions are writable. The 69 eligible Emotion files belong to Epics C and D.

**A6 — Roadmap open decision #4: CSS custom properties.** *(User decision, 2026-08-18.)* US-975 and
US-979 both deliberately stopped short of this and handed it here. The answer has two halves,
because dynamic Emotion inputs come in exactly two kinds:

- **Scalar values → a CSS custom property written to `element.style`,** consumed by a static rule.
  `min-width: var(--options-filter-min-width)`, `top: var(--pill-top)`, `width: var(--indent-size)`.
- **Discrete boolean state → a `data-*` attribute and a static rule.** This is not a new mechanism:
  it is already the UIKit state model in `uikit/CLAUDE.md`, and `Dot.tsx` already ships
  `&[data-clickable]`.

**Generated class hooks are rejected.** They reintroduce a runtime style engine, which is precisely
what the migration removes. The custom-property form is also the one boards already run on: the
`--p-*` palette is pushed into the frame and a theme switch is a variable re-push — nothing walks
the component tree recomputing styles. That property is the whole argument, and it is already proven
in production here.

The inventory supports the split cleanly. Every runtime input across the production dynamic files
falls into one of the two buckets, with no third case:

| Site | Input | Form |
|---|---|---|
| `AVGrid/filters/OptionsFilterContent.tsx:16` | `width` | variable |
| `Progress/ProgressOverlay.tsx:42` | `topPx` | variable |
| `Progress/ProgressOverlay.tsx:42` | `clickable` | `data-*` |
| `Spinner/Spinner.tsx:26` | `$size`, `$color` | variable |
| `Tree/SectionItem.tsx:45` | `size` | variable |
| `Tree/SectionItem.tsx:45` | `first` | `data-*` |
| `Tree/TreeItem.tsx:161` / `:171` / `:198` | `size` | variable |
| `Tree/TreeItem.tsx:161` | `first` | `data-*` |

`Slider.tsx:58` already reads a scalar through `var(--slider-track-bg, …)` with a fallback, so both
halves of the rule have an in-repo precedent before Epic A writes a line of code.

**A7 — `radius.full` is deleted from the token scale, not mapped to a variable.** It is used at
exactly three sites in two components — `Dot.tsx:89` and `Slider.tsx:68` / `:84` — and in all three
the element is square (a 12×12 range thumb, an inline-block dot sized by props), so the value means
"make this square a circle", not "use the project's largest radius". A circle is a local decision
belonging to the component that draws one. US-981 replaces the three sites with a literal `50%` and
removes `full` from `radius`. The scale then contains only pixel numbers, so the token→variable
mapping is uniformly `number → Npx` with no special case, and Concern 4 disappears rather than being
answered. (User decision, 2026-08-18.)

**A8 — The theme state lives in `theme/`, not `api/`.** Four reasons, in order of weight:

1. **Startup ordering.** `theme/themes/index.ts` applies the theme at *module load*, reading
   `appSettings.json` synchronously to avoid a flash of the wrong theme. The app model layer does
   not exist yet at that point. Putting the state in `api/` would make `theme/` depend on `api/`
   during its own initialization.
2. **The dependency already points the other way.** `api/settings.ts:277` imports and calls
   `applyTheme()`; three `api/` files import `theme/themes` and none of them own it. Moving the
   state into `api/` would invert that and create a cycle.
3. **`core/state` is dependency-free.** Importing `TOneState` into `theme/` adds no coupling —
   it is the same shape as `editors/board/busy-boards.ts`, a module-level `TOneState` living beside
   its subject.
4. **The theme is not application state.** It is derived from a setting but owned by the renderer's
   styling layer, which is exactly what `theme/` is.

So US-982 adds `theme/theme-state.ts` (or an export from `themes/index.ts`) holding the
`TOneState<{ id, isDark }>`, importing only `core/state`. `api/` and the editors stay consumers.

**A9 — The two Epic P inventories are relocated before the task folders are deleted.** The Emotion
and inline-style inventories exist only inside `doc/tasks/US-975-*/README.md` and
`doc/tasks/US-979-*/README.md`, which are deleted when a task closes. They are this epic's primary
input and must live somewhere durable first.

## Goals

- A vanilla view can take a spacing, radius, size or font value from CSS without importing anything.
- Anything that cannot use `var()` — canvas, Monaco, webviews, data URIs — is *told* when the theme
  changes, through one subscription that is not React.
- There is exactly one way to resolve a token to a concrete value, and one place that knows how.
- A developer converting a component in Epic C has a written answer to "where does this CSS go, what
  is it named, and how do I express the prop-driven parts", proved by one worked example.
- The app is byte-identical to the user, except that the scrollbar arrows now follow the theme.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| US-980 | Relocate the Emotion and inline-style inventories into `doc/` | Implemented |
| US-981 | [Emit `uikit/tokens.ts` as CSS custom properties](../tasks/US-981-token-css-vars/README.md) | Implemented |
| US-982 | One theme state and one color resolver | Planned |
| US-983 | Emotion-to-CSS conventions; settle open decision #4 | Planned |
| US-984 | Pilot: convert one UIKit component to the new conventions | Planned |

### Ordering

**US-980 is first and urgent** — it is a docs move, but the material it rescues is deleted when the
Epic P task folders are cleaned up.

**US-982 is the epic's real content** and is independent of everything else; it can run in parallel
with US-981. **US-983 depends on US-981** (the conventions have to name the token variables) and
**US-984 depends on US-983** (the pilot is what validates the conventions). US-984 is the only task
that touches a component's styling and is the natural place to close the epic.

### Task notes

**US-980 — Relocate the inventories.** The frozen Emotion and inline-style baseline, exact lists,
rationale, and pinned reverification commands live in
[`styling-inventory.md`](../architecture/styling-inventory.md). The document is the single durable
source; nothing is re-measured or converted in this task. This is the task that makes deleting the
Epic P task folders safe.

**US-981 — Token CSS variables.** Emit the 32 token values as `--space-*`, `--gap-*`, `--radius-*`,
`--size-*`, `--font-*` on `:root`, alongside the existing numeric exports, which do not change
(roadmap Rule 2 — 41 importers keep compiling untouched). The generator already exists as
`mapScale()` in `editors/board/board-theme.ts`; hoist it into the theme layer and have
`board-theme.ts` import it rather than duplicating it (A2). Per A7 the task first deletes
`radius.full` — replacing `Dot.tsx:89` and `Slider.tsx:68` / `:84` with a literal `50%` — leaving
31 tokens, all numeric, so the mapping is uniformly `number → Npx`. One thing left to decide during
the task: whether the variables are written at startup beside `applyTheme()` or emitted as a static
stylesheet. Static is preferred — they are theme-independent constants and never change after load.
Note that `Slider.tsx:58` already reads a scalar through `var(--slider-track-bg, …)` with a
fallback, which is the existing in-repo precedent for the A6 answer and worth citing in US-983.
Arithmetic uses
(`spacing.md * 2`) become `calc(var(--space-md) * 2)` on the CSS side; the numeric exports remain
available for JS-side arithmetic and nothing is forced to migrate.

**US-982 — Theme state and resolver.** The substantive task. Introduce the theme `TOneState` (A3),
convert `onMonacoThemeChange` into an ordinary subscription and delete the single-slot field,
collapse the two resolution paths into one helper (A4), and then subscribe the nine consumers listed
in "The theme-change gap" instead of snapshotting. `GlobalStyles`' baked arrow data URIs are the
acceptance check: switch theme, arrows follow, no restart. `MermaidOutputView.tsx:77`'s deps-array
poll is replaced with a real subscription. Boards already re-push their palette on theme change
(`BoardWebview.tsx:362`) and are the pattern the other consumers should match, not an exception.

**US-983 — Conventions and open decision #4.** Write the rules into
[`coding-style.md`](../standards/coding-style.md) §"Styling with Emotion" and
[`uikit/CLAUDE.md`](../../src/renderer/uikit/CLAUDE.md): where a converted component's stylesheet
lives and how it is named, how theme colors and token variables are referenced, how discrete state
and scalar values are expressed (A6), how `keyframes` become stably-named `@keyframes` (US-975 found
three: `Dialog`, `ProgressBar`, `Spinner`), and how specificity and insertion order are preserved —
the hazard both inventories flagged as the one that silently changes the UI. The existing
editor-local CSS convention (4 stylesheets, scoped under a semantic editor root) is the precedent to
extend rather than replace. Decision #4 is already settled (A6) — this task writes it down as a
rule with the naming convention for custom properties, it does not re-open it. Two things the rule
must state that A6 does not: how a custom property is **scoped** (declared on the component root so
it cannot leak into or be captured from an unrelated subtree), and that a variable always has a
usable fallback in the stylesheet, so a component whose script has not run yet still renders.

**US-984 — Pilot.** One small UIKit component converted end to end, to prove the conventions are
writable before Epics C and D rely on them. `Spinner` is the suggested subject because it is tiny
and exercises all three mechanisms at once: static rules, a `keyframes` animation needing a stable
name, and two genuinely dynamic props (`$size`, `$color`) that test the CSS-custom-property answer
to decision #4. If the conventions cannot express Spinner cleanly, they are wrong and it is far
cheaper to learn that here than in Epic C. See Concern 2 — whether this task belongs in Epic A at
all is a scope question for the user.

## Concerns / Open questions

All six questions raised at epic open were resolved by the user on 2026-08-18. They are recorded
here with their answers rather than deleted, because the reasoning is the justification for the
task list above.

1. **Is Epic A worth opening as a whole epic?** *(Resolved — yes.)* After removing the already-done
   color work it is roughly one substantive task (US-982), one mechanical task (US-981), and two
   documentation tasks. The alternative was to fold US-980/US-981/US-982 into Epic B and leave
   US-983/US-984 to open Epic C. It stays a separate epic — small, but an epic — because US-982
   fixes a live bug and the conventions are needed before anyone writes vanilla CSS, so both are
   useful even if the migration stops here. That is the same property that justified Epic P.

2. **Does the pilot (US-984) belong in Epic A?** *(Resolved — yes, it stays.)* The roadmap puts
   UIKit conversion in Epic C, so a pilot is technically Epic C work pulled forward. It is kept
   because a conventions document with zero applications is unverified. Note that Epic B plans its
   own pilot for the *view* contract; this one is for the *style* contract, which is a different
   question and answerable earlier.

3. **Do token CSS variables actually get used before Epic C?** *(Acknowledged risk, accepted.)*
   Nothing consumes them until a vanilla view exists, so US-981 ships a foundation whose names are
   unproven and could turn out wrong once the first real view is written. The mitigation is US-984:
   the pilot is the first consumer, and it is inside this epic, so a naming mistake surfaces here
   rather than in Epic C.

4. **`radius.full` and the non-numeric tokens.** *(Resolved — deleted. See A7.)* All three call
   sites draw a circle on a square element, which is a local decision, not a shared scale value.
   Removing it leaves the token scales entirely numeric, so the token→variable mapping has no
   special case. If a future token is a keyword or multi-value, that is the point to revisit the
   rule — there is no such token today.

5. **Does the theme state belong in `theme/` or in `api/`?** *(Resolved — `theme/`. See A8.)* The
   deciding constraint is startup ordering: the theme is applied at module load, before the model
   layer exists, and `api/settings.ts` already imports `theme/themes` rather than the reverse.
   US-982 must preserve that ordering exactly — it is the one place in the task where a careless
   refactor could reintroduce a visible flash of the wrong theme at startup.

6. **Nothing here resolves roadmap open decisions #1, #3, #5 or #6.** *(Acknowledged.)* Only #4 is in
   scope for this epic. As with Epic P, that is deliberate: it is schedulable before the shape of the
   migration is settled. (Decision #2 — templating — was also settled on 2026-08-18 while this epic
   was being planned, but it belongs to Epic B and changes nothing here. See roadmap §3.4.)

## Notes

### 2026-08-18

- Epic opened from the roadmap after EPIC-051 (Epic P) closed. IDs assigned: EPIC-052, tasks
  US-980 … US-984. The next free epic number is EPIC-053; the next free task number is US-985.
- Investigation found the color-variable half of the roadmap's Epic A description already complete
  (77 variables × 9 themes, no drift) and the theme-change notification path missing entirely. The
  epic was re-scoped around that finding rather than around the roadmap's original candidate list.
- Per the epic deferred-review model, `/review`, `/document` and `/userdoc` run once at epic close,
  not per task.
- All six open questions resolved with the user the same day. Epic A stays a separate (small) epic;
  the US-984 pilot stays in scope; `radius.full` is deleted rather than mapped (A7); and the theme
  state lives in `theme/` rather than `api/` (A8). The Concerns section keeps each question with its
  answer, since the reasoning is what justifies the task list.
- Roadmap open decision #4 settled the same day: **CSS custom properties, not generated class
  hooks** (A6). Recorded in the roadmap's §8 table as well. It is the only one of the roadmap's six
  open decisions this epic touches.
