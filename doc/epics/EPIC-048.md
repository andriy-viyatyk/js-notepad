# EPIC-048: Persephone UI Guidance for Agents

## Status

**Status:** Completed
**Created:** 2026-08-09
**Completed:** 2026-08-09

## Overview

An agent connected over MCP can already *drive* Persephone's own window — `browser_snapshot({ pageId: "app" })`
renders the React shell as an accessibility tree and `browser_click` operates it. What the agent
cannot do is *explain* it. Nothing in the guide set says what the header's Persephone glyph does,
what the "…" in the corner is, what the Menu Bar's four static folders are, or which of the ~40
editors exists and what each is for. A first-time user asking "where do I change the language of
this tab?" gets an answer assembled from a raw DOM snapshot, if at all.

This epic gives the agent two things it lacks: **semantic documentation of the Persephone
interface**, split across guides so no single page is unreadable, and a **highlight-with-tooltip
affordance** so the agent can point at an element on screen instead of describing it in prose.

## Feasibility summary

Feasible, and cheaper than it looks — most of the mechanism already exists. Three findings shape
the plan.

**1. The element-addressing contract already exists: `data-name`.**

The codebase has a long-standing convention that UIKit primitives take a `name` prop and emit it as
`data-name` on their root element — `Panel`, `Button`, `IconButton`, `SplitButton`, `ListBox`,
`Splitter`, `Tree`, `Select`, and ~60 other files. The app shell already uses it deliberately:

| Element | Selector today |
|---|---|
| Menu (Persephone glyph) button | `[data-name="persephone-menu"]` |
| Add-page split button | `[data-name="page-tabs-add"]` |
| Zoom indicator | `[data-name="zoom-indicator"]` |
| Window minimize / maximize / close | `[data-name="window-minimize"]`, `…-toggle`, `…-close` |
| Snip menu trigger | `[data-name="header-snip-button"]` |
| Menu Bar toolbar buttons | `[data-name="menubar-open-file"]`, `…-new-window`, `…-about`, `…-settings` |
| Menu Bar folder list | `[data-name="menubar-folders"]` |
| Sidebar panel container / splitter | `[data-name="secondary-views-container"]`, `…-splitter` |

So the epic does **not** introduce a parallel `#id` scheme. It audits `data-name` coverage, fills
the gaps (the tab strip and its individual tabs use `data-type` rather than `data-name`; the
status-indicator cluster, the MCP and Mneme indicators, and the editor host have no attribute at
all), and then *documents* the resulting selectors as a stable contract the guides may rely on.
Adding an id scheme on top would mean two conventions to keep in sync, both drifting.

**2. Both injection paths are already open.**

`execute_script` runs on the renderer's main thread (`scriptRunner.runWithCapture` — not the
worker), so a script has full DOM access to the app window today. `browser_evaluate` reaches
browser pages and board frames. An overlay written as dependency-free DOM code therefore works
everywhere the agent can already reach.

**3. `app.ui` is an established, easy-to-extend namespace.**

`IUserInterface` (`src/renderer/api/types/ui.d.ts`) → `UserInterface`
(`src/renderer/api/ui.ts`) → wired in `App.initServices()`. Adding methods is a three-file change
with an existing pattern to copy, and `assets/editor-types/ui.d.ts` is mirrored automatically by
the dev server.

### The design decision this settles: snippet **and** API, one source

A `app.ui.showElementTooltip(...)` method alone would only ever cover Persephone's own window —
boards and browser pages are separate frames the renderer's `app` object cannot touch. A snippet
alone works everywhere but costs the agent 1–2 KB of script text on every call, for what will be
the most common case by far (pointing at Persephone's own UI).

The plan takes both, from **one implementation**: a self-contained, dependency-free module at
`assets/ui-highlight.js` that mounts the overlay from a plain options object. In the app window,
`app.ui.highlightElement(selector, text, options)` fetches and runs that module (renderer can read
`app-asset://`), giving the agent a one-line call. Outside the renderer the same code travels as a
paste-able snippet for `browser_evaluate`. One behavior, one place to fix a bug.

Note that `app-asset:` is unreachable from browser pages, which is why the snippet must travel as
text rather than as a fetched URL outside the renderer — deliberate, and not a gap to close. The
mechanism is the *absence of a handler*: `registerAssetProtocol` (`src/main/main-setup.ts`)
installs it on `nopersist` and `persist:file-access` only, while browser pages run in
`persist:browser-*` / incognito / Tor partitions. `BLOCKED_PROTOCOLS`
(`src/main/browser-service.ts`) is a navigation guard on `will-navigate` and would **not** stop a
`fetch` — it is not what protects this. Boards are the exception, since
`initBoardProtocol(appPartition)` puts board frames in the app session.

**Scope priority: the app window is the target; browser pages are not.** The whole point of the
epic is helping a first-time user find their way around Persephone, so the app window drives every
design decision and nothing about it gets compromised to suit another context. Boards are a
natural secondary target (agents author boards, so pointing at a board's own controls is the same
job). Web pages in the built-in browser are a nice-to-have: the snippet will work there because
it is plain DOM code, but no requirement, size budget, or feature is shaped by that case. Where a
web page needs less, it may get less — a bare highlight ring with no tooltip is a perfectly good
outcome there, since the agent is already talking to the user in chat and can explain the
highlight in the reply.

### Documentation shape

Two new guides rather than one, because the editor catalog is the bulk of the content and a user
asking about the tab strip should not have to page past 40 editor descriptions:

- **`assets/mcp-res-ui.md`** — what Persephone is *for*, the always-visible chrome (title bar,
  tab strip, add-page button, window controls, zoom indicator, snip menu, MCP and Mneme
  indicators), the Menu Bar and its four static folders, the sidebar panels, page grouping, the
  selector table, and the highlight recipe. This is the entry point.
- **`assets/mcp-res-ui-editors.md`** — the editor catalog from the user's point of view: what each
  editor is for, how the user opens it, what it can do. Condensed from the existing user doc
  `docs/editors.md` (873 lines), which is the source material and stays authoritative for humans.

Both register in `resourceFiles` / the `read_guide` enum in `src/main/mcp-http-server.ts` and get
one pointer line in the server instructions, exactly as the overview and browser guides did.

## Goals

- An agent can answer "what is this button?" and "where do I find X?" about Persephone's UI from
  documentation, not from guessing at a DOM snapshot.
- An agent can point at an element on screen — in the app window, a board, or a browser page —
  with a highlight and its own explanatory text, dismissible by the user.
- Selector stability is a written contract, so a guide that names `[data-name="page-tabs-add"]`
  does not quietly rot the next time that button is refactored.
- No second addressing scheme: `data-name` stays the single convention.
- The guides stay readable — split by subject, entry point first, no page that must be read whole.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| US-924 | [Element addressing contract — complete `data-name` coverage on the app shell, document it as stable](../tasks/US-924-ui-element-contract/README.md) | Done |
| US-925 | [`assets/agent/ui-highlight.js` overlay + `app.ui.highlightElement` / `clearHighlights`](../tasks/US-925-ui-highlight-overlay/README.md) | Done |
| US-926 | [`assets/mcp-res-ui.md` — UI overview guide, selector table, highlight recipe, MCP wiring](../tasks/US-926-ui-guide/README.md) | Done |
| US-927 | [`assets/mcp-res-ui-editors.md` — the editor catalog for user guidance (also wires its `read_guide` entry)](../tasks/US-927-ui-editors-guide/README.md) | Done |
| US-929 | [Agent cold start — settings apply on disk change, install-dir `README.txt`, settings documented in the guides](../tasks/US-929-agent-cold-start/README.md) | Done |
| US-928 | QA scenarios + user docs | Done |

US-924 comes first because both guides quote selectors, and quoting a selector that is about to
change is the one ordering mistake worth avoiding. US-925 is independent of the guides and can run
in parallel. US-926 depends on both (it documents the selectors *and* the recipe); US-927 depends
on nothing but is written after US-926 so the two guides cross-link correctly.

### US-924 — Element addressing contract

Audit `data-name` across the app shell and fill the gaps. Known gaps found during investigation:

- `src/renderer/ui/tabs/PageTabs.tsx` — root uses `data-type="page-tabs"`; add `data-name="page-tabs"`.
  Keep `data-type` (`scrollToActive` queries it).
- `src/renderer/ui/tabs/PageTab.tsx` — individual tabs carry `data-type="page-tab"` and
  `data-active`; add a per-tab `data-name` (e.g. `page-tab`) so a tab is addressable as a class of
  element, with the existing attributes distinguishing instances.
- `src/renderer/ui/app/MainPage.tsx` — `.status-indicators` container, `.mcp-indicator`,
  `.mneme-indicator` have `className` only; add `data-name`.
- `src/renderer/ui/app/Pages.tsx` / `RenderEditor.tsx` — the editor host area, so "the editor
  itself" is addressable.
- Check the tab language selector, the grouped-page splitter, and the alerts bar.

Then write the contract into `doc/architecture/` (likely a new short section in
`doc/architecture/pages-architecture.md` or a dedicated file): `data-name` values named in an MCP
guide are a **public contract** — renaming one is a documentation change too.

Deliberately **not** in scope: renaming any existing `data-name`, or adding `data-name` to editor
internals (an editor's own DOM is the editor's business and is reachable through the accessibility
snapshot).

### US-925 — Highlight & tooltip overlay

`assets/ui-highlight.js`: an IIFE exposing `window.__persephoneHighlight` with

- `show({ selector, text, title?, placement?, scroll?, id? })` → `{ found: boolean, count: number }`
- `showMany([...])` for multiple simultaneous callouts
- `clear(id?)` — clear one or all

Behavior: outline ring around the matched element (positioned overlay, never mutating the target's
own styles), a tooltip card with optional title, the agent's text, and a **Close** button; `Esc`
clears; a repeat `show` with the same `id` replaces rather than stacks; `scroll: true` calls
`scrollIntoView` first; returns a serializable result so the agent learns immediately when a
selector matched nothing. Omitting `text` yields a ring with no card — the minimal form intended
for web pages, where the agent explains the highlight in chat instead.

**Stacking.** The overlay mounts on `document.body` with a z-index above everything the app can
produce — `MenuBarRoot` sits at `zIndex: 6` and dialogs/poppers stack above it, so US-925 starts by
finding the app's actual ceiling and then clears it by a wide margin. A callout the user cannot see
because the sidebar is open is a failure of the exact case the feature exists for.

**Lifetime.** The overlay repositions on `scroll` and `resize` and removes itself when the target
leaves the DOM. Nothing more: no `MutationObserver` following a moving element, no re-query on
React re-render. If a highlight goes stale in some unusual case, the user closes it — which is
cheaper than the machinery to prevent it, and v1 does not need that machinery to be useful.

Then `app.ui.highlightElement()` / `app.ui.clearHighlights()` in `src/renderer/api/types/ui.d.ts`
+ `src/renderer/api/ui.ts`, loading the module once via `fetch("app-asset://ui-highlight.js")` and
caching it. `assets/editor-types/ui.d.ts` mirrors automatically.

**Styling: deliberately theme-independent.** The overlay carries one fixed look in every theme, in
the app window, in a board, and on a web page: an orange ring and card border, with the card
filled in a light tint of the same hue (the saturated accent is right for the frame but too dark
behind body text). This is
a design requirement, not a limitation worked around: a callout that blends into the surrounding
theme is indistinguishable from the app's own UI, and the user must be able to tell at a glance
that *the agent* put it there. The same look everywhere also means the user learns it once and
recognises it in a board or a web page too.

It is a documented exception to the project's no-hardcoded-colors rule, on the same footing as the
existing `fs` / `path` exceptions: the file is a standalone injectable asset with no Persephone
module graph available to it (it cannot import `src/renderer/theme/color`), and its colors are
deliberately *not* theme tokens. Reading `--p-*` variables inside boards was considered and
rejected for exactly this reason — it would make the overlay look native, which is the opposite of
what it is for. The exception gets a line in `doc/standards/coding-style.md`.

Contrast and readability must therefore be checked against both app themes and against a board or
page with an arbitrary background, since the overlay never adapts to either.

### US-926 — `assets/mcp-res-ui.md` + MCP wiring

Content: what Persephone is for (one paragraph an agent can paraphrase to a new user); the
always-visible chrome, element by element, each with its purpose *and* its selector; the Menu Bar
(Open Tabs / Recent Files / Tools & Editors / Script Library + user folders) and how to open it;
the sidebar secondary views; page grouping; where Settings and About live; the selector table as a
single lookup block; the highlight recipe in both forms (`execute_script` one-liner for the app
window, `browser_evaluate` snippet for boards/browser pages); an "Errors & verification" section
matching the house style of the other nine guides; pointers to `ui-editors`, `pages`, and
`browser`.

Wiring in `src/main/mcp-http-server.ts`: two `resourceFiles` entries
(`persephone://guides/ui`, `persephone://guides/ui-editors`), two additions to the `read_guide`
enum (10 → 12), and one instructions line under a new "Help the user with Persephone itself"
scenario.

**Also in this task: teach `/document` to check these guides.** `.claude/skills/document/SKILL.md`
gains the two UI guides as a checked surface, the same way it already lists the three board docs —
"if the app shell (header, tab strip, Menu Bar, sidebar) or the editor set changed, verify
`mcp-res-ui.md` / `mcp-res-ui-editors.md` and the selectors they name." This is the epic's answer
to guide drift: a UI guide that nothing routinely re-checks will be wrong within a few releases,
and the review skill is the only place that reliably runs after a change lands.

### US-927 — `assets/mcp-res-ui-editors.md`

The editor catalog, grouped (text & code / structured data / viewers / tools / integrations), each
entry: what it is for, how the user opens it, what it can do, and the `create_page` editor id where
one exists. Source material is `docs/editors.md`; the guide is a condensation for an agent
explaining things to a user, not a second copy. Cross-links to `pages` for the create/read/write
tool surface and to the format guides (`graph`, `notebook`, `links`) for their JSON.

### US-928 — QA scenarios + user docs

`qa/mcp-test-ui-guidance.md` with scenarios of the kind the guides exist to serve, run against
Haiku per the harness in `qa/README.md`: "where do I change the language of this tab?", "highlight
the button that opens the sidebar and tell me what it does", "what editors can Persephone open?",
"highlight the submit button on this board". Then `docs/whats-new.md` and whichever of
`docs/agent-tools.md` / `docs/mcp-setup.md` list the guide set.

## Decisions

Settled before implementation; recorded here so they are not re-litigated:

- **Guide drift is handled by `/document`, not by discipline.** A UI guide describes a moving
  target, so the review skill gains the two guides as a checked surface (US-926). Backed by two
  habits: the US-924 selector contract, and keeping the guides thin on layout and thick on purpose
  — an element's *purpose* survives a refactor, its pixel position does not.
- **Two guides, not three.** UI-chrome and editor-catalog. A third "features and capabilities"
  guide would overlap the existing `overview` guide, which already carries the mental model; one
  paragraph in `mcp-res-ui.md` covers it.
- **The overlay's look is fixed in all themes and contexts** — an orange ring and card border over
  a light tint of the same hue, so an agent-placed callout is never mistaken for Persephone's own
  UI. Rules out reading a board's `--p-*` tokens. See US-925.
- **The overlay outranks everything.** High fixed z-index above the app's ceiling; US-925 measures
  that ceiling first.
- **Overlay lifetime is minimal.** Reposition on `scroll`/`resize`, remove when the target leaves
  the DOM, nothing more.
- **Browser pages are explicitly not a target.** The app window drives every decision; boards are
  a natural second. No requirement or size budget is set by the web-page case.
- **Highlighting in browser pages is not supported at all, and the guide says so.** Web pages have
  no access to the app's assets, so the overlay module cannot load there — a deliberate security
  boundary rather than an obstacle to route around. The guide tells the agent to set a plain
  border on the element via `browser_evaluate` and explain in chat, and to state that Persephone
  has no highlight feature for web pages. Settled after verifying the boundary from a live
  `https://` origin (fetch, XHR, `<script src>` and `<iframe src>` all fail).

## Open questions

*(none — all concerns raised at epic creation were settled on 2026-08-09)*

## Notes

### 2026-08-09

- Epic created. Investigation confirmed `data-name` is already the established addressing
  convention (128 occurrences across 65 files, emitted by most UIKit primitives and used explicitly
  on the app header), so the epic documents and completes it rather than introducing `#id`s.
- Confirmed `execute_script` runs on the renderer main thread, so DOM injection into the app window
  works today with no new plumbing.
- Confirmed the snippet-vs-API question is not either/or: one dependency-free module serves both,
  with `app.ui.highlightElement` as the app-window convenience and the same code as a
  `browser_evaluate` snippet for boards and browser pages — which is the only way to cover boards
  and web pages at all, since `app-asset:` is blocked outside the renderer.
- The overlay's fixed styling is a requirement rather than a constraint: one accent look in every
  theme and every context makes an agent-placed callout self-identifying, and rules out reading a
  board's `--p-*` tokens (which would camouflage it). Closes the hardcoded-colors question.
- US-924 implemented. 14 `data-name` attributes added across five shell files; nothing renamed or
  removed. `doc/architecture/ui-element-contract.md` records the convention, the
  `data-name` vs `data-type`/`data-part`/state-attribute split, the public-contract rule, and the
  shell selector table the guides will quote. Verified live over MCP: 133 named elements, all 26
  required shell selectors resolve, `scrollToActive`'s query intact.

  Live verification earned its keep — three facts would have produced a wrong guide if the table
  had been written from source alone. **`tab-language` does not exist on `noLanguage` editors**
  (5 tabs open, 4 language buttons; the fifth renders `[data-part="empty-language"]` with the
  editor icon). **A pinned tab renders no title text** — `PageTab` renders `{!pinned && title}`, so
  `[data-part="title-label"]` is present but empty, and page titles must come from `list_pages`.
  And **`[data-name="menu-bar"]` is always in the DOM**, `display: none` when closed, so its
  presence says nothing about whether the Menu Bar is open. All three are in the contract doc.

  Also worth noting for US-926: the shell was already better covered than expected — editors
  contribute their own names generously (`explorer-*`, `link-*`, `video-*`, `audio-*`,
  `sidebar-panel-title`), so pointing at an editor's controls will often work without any of the
  exhaustive per-editor coverage the epic deliberately declined to add.
- US-925 implemented and verified live in both contexts — Persephone's window via
  `app.ui.highlightElement()`, and a web page via `browser_evaluate`, running the identical file.
  The ring-only form (omit `text`) works as the reduced variant the epic reserved for web pages.

  Two findings changed the implementation. **`app-asset://` requires a directory host** — the
  handler maps the URL's host to a folder under `assets/`, so a top-level `assets/ui-highlight.js`
  has no reachable URL; the module lives at `assets/agent/ui-highlight.js`. And
  **detach-only removal was insufficient**: Persephone hides the Menu Bar with `display: none`
  rather than unmounting it, so the first version left an orange ring floating over empty space the
  instant the user closed the menu — the single most likely flow for this feature. Removal is now
  visibility-based (a zero-size rect counts as gone), which costs three lines and fixes the whole
  class.

  The file is also kept strictly ASCII: it gets pasted between contexts and served by handlers that
  do not always declare a charset, so a non-ASCII byte in a comment mojibakes wherever it lands.
- US-926 implemented. `assets/mcp-res-ui.md` written purpose-first (every element's *why*, with
  its selector as the handle), registered as `persephone://guides/ui`, and routed from the server
  instructions under a new "Help the user with Persephone itself" scenario. `/document` gained a
  UI-guides section naming the three surfaces whose change invalidates the guide — the app shell,
  the selector contract, and the highlight API.

  **Only `ui` was wired, not `ui-editors`.** The epic planned both entries in this task, but a
  `resourceFiles` entry whose file does not exist makes `read_guide("ui-editors")` return
  `ENOENT` — a broken tool surface for however long US-927 stays open. The entry moves to US-927,
  alongside its file, so every state of the repo is shippable.

  Live selector check: 33 of the 37 selectors the guide names resolve, and the four that do not
  (`autoload-reload`, both tab-scroll arrows, `page-empty`) are exactly the ones the guide marks
  conditional. It also caught a wrong recipe — the draft read the overlay asset with
  `app.fs.readFile(app.path.join(app.appAssetsPath, …))` and **neither `app.path` nor
  `app.appAssetsPath` exists**; the shipped form is the `fetch("app-asset://agent/ui-highlight.js")`
  call `app.ui` itself uses.

  Reviewing that recipe surfaced a security question — could a web page fetch `app-asset://`
  itself? — and the answer corrected a claim carried since epic creation. It cannot, but **not**
  because of `BLOCKED_PROTOCOLS`: that list only guards `will-navigate`, so it would not stop a
  `fetch`. The actual boundary is that the protocol handler is registered on two sessions
  (`nopersist`, `persist:file-access`) and browser pages are in none of them. Verified live from
  `https://example.com`: fetch, XHR, `<script src>` and `<iframe src>` all fail. The misattribution
  was fixed here and in the US-925 task doc — left standing, someone could have deleted
  `app-asset:` from `BLOCKED_PROTOCOLS` as redundant, or trusted it to stop a fetch.

  Consequently browser-page highlighting is now documented as **unsupported**, with a plain-border
  fallback, rather than as a nice-to-have. See **Decisions**.
- US-927 implemented. `assets/mcp-res-ui-editors.md` covers all 32 registered editors, grouped by
  what a user would be asking about rather than by implementation, with the `read_guide` entry
  US-926 had deferred now shipping alongside its file. `/document` gained a second trigger list
  for the catalog (`register-editors.ts`, `editor-matchers.ts`, `docs/editors.md`, and features
  moving out of the app into a board).

  Two editorial rules kept it from becoming a second copy of things that already exist. The
  **`language` / title-suffix contract stays in `mcp-res-pages.md`** and is pointed at, not
  duplicated — it is the one detail whose drift silently produces a broken page. And the guide
  states plainly **what Persephone no longer has** (the built-in Todo and PDF editors, both now
  boards from the published catalog), because the failure mode for a catalog is an agent
  confidently describing a feature that was removed.

  Cross-checking ids against the registry earned its keep: `docs/editors.md` is organized by
  feature, not by id, and never mentions `toolset-view`, `board-info`, `storybook-view` or
  `log-view`. The finished guide's id set matches the registry exactly, 32 for 32.
- US-929 added and implemented — the epic's guides assume a *connected* agent, and this covers the
  case before that: a fresh install with MCP off and an agent that has never heard of Persephone.

  Investigation killed the obvious plan. **Nothing auto-loads an installed app's folder into an
  agent's context** — Claude Code reads `CLAUDE.md` from the working directory and its parents
  plus `~/.claude/CLAUDE.md`, never an install directory — so a file there is a fallback for when
  an agent is pointed at the folder, not a mechanism. What makes it worth shipping anyway is a
  second finding: `extraResources` already copies `assets/` into `resources/assets`, so **every
  guide is readable off disk with no MCP and no network**. `build/README.txt` exists mainly to
  say so.

  The blocker was real and would have made the whole story a lie: `_onChanged.send()` fired only
  from `settings.set()`, so an external edit to `appSettings.json` flipped `mcp.enabled` and the
  Settings toggle while the server stayed down. Settings that merely get *read* worked; settings
  that *do* something did not, because their actuators subscribe to `onChanged`. `loadSettings`
  now diffs and emits on watcher-triggered reloads only — the initial load must not, or startup
  starts MCP and Mneme twice.

  Review then caught the consequence: every window has its own watcher, so a file edit now
  actuates from all of them. Verified that both services are idempotent and always had to be
  (every window already calls them at startup), so nothing breaks — but the audit did find a
  genuine race: `startMcpHttpServer` guarded only on `httpServer`, which is assigned inside the
  `listen` callback, so two concurrent callers both reached `listen()` on the same port. Fixed
  with the `startPromise` guard `startMneme` already had. Duplicate toasts across windows were
  accepted deliberately.

  Main-process ownership of global settings — the architecturally correct fix — was weighed and
  deferred to [backlog.md](../tasks/backlog.md), along with stop-during-start and the higher-
  leverage cold-start work (writing the user's agent config; a Claude Code plugin).
- US-928 implemented. `qa/mcp-test-ui-guidance.md` (ten scenarios), the guide set added to
  `docs/mcp-setup.md`, and three `docs/whats-new.md` entries covering the guides, the highlight,
  live settings reload, and the install-root `README.txt`.

  The run against Haiku (`qa/runs/2026-08-09-ui-guidance-haiku.md`) came out 6 of 9, and the three
  that did not pass failed **the same way**: no guide was read at all. In every case the guide
  already held the answer. The server instructions routed the UI guides off *interrogatives*
  ("what is this button?", "is there a diagram editor?"), and each failing prompt was an
  instruction or an assertion instead — "**change** the language of this tab", "open this in
  Persephone's **built-in PDF editor**", "**highlight** this link". A user asking for help with
  the app usually phrases it as a command, so the filter was simply wrong. Routing now keys on
  intent, and says outright not to explore the API or click through a snapshot to find a control.

  The failures were expensive in a way that matters: the tab-language agent spent 33 tool calls
  and 6.6 minutes reaching a conclusion `list_pages` gives in one call — and closed the user's
  Tools & Editors tab and created a stray page while guessing. Documentation that is not *reached*
  costs more than documentation that is missing, because the agent improvises against live state.

  The web-page case failed in the direction the epic most wanted to avoid: the agent set the
  correct fallback outline and never went near `app-asset://`, then told the user the styling was
  "consistent with how Persephone highlights interactive elements" — inventing the convention the
  guide exists to deny. That fix went into the **browser** guide, where an agent doing browser
  work will actually meet it, rather than into the UI guide it was never going to open.

  **The retest disproved that fix, and that is the more valuable result.** With the new
  instructions verified live over HTTP, all three still read no guide: 7.9 identical (one tool
  call, still "Persephone's built-in PDF viewer"), 7.7 worse (`browser_hover`, a transient hover
  state that is not a highlight), 7.8 correct but 42 tool calls. Applying the harness's own
  tiebreaker — bump the model to separate "docs unclear" from "model too weak" — **7.9 passes on
  Sonnet first try**: it read `ui-editors` before answering, learned there is no built-in PDF
  editor, noticed the PDF Viewer board was installed, and used it.

  So the guides are correct and reachable; a weak model does not reach them. Emphatic wording in
  a string that gets skipped cannot fix skipping. The remaining lever is structural — tool
  descriptions and error messages, which an agent must pass through — and is backlogged rather
  than papered over.

  Two real fixes did come out of the retest. **"Language" was ambiguous** — raised by the user
  watching a run, and correct: it can read as UI locale, document language, or Monaco's syntax
  mode, and the 7.8 agent burned much of its 42 calls on that ambiguity. It is now stated as the
  Monaco syntax-highlighting mode, with "there is no UI locale setting" said out loud, in the
  `ui` and `pages` guides and the instructions.

  **That fix then flipped 7.8 to a clean pass on Haiku** — first action `read_guide("ui")` instead
  of probing the API, 15 tool calls instead of 42, and the answer quoted back out of the guide.
  Same model, same prompt, only the wording changed. Which corrects the conclusion above: it is
  not that a weak model won't read guides, it is that **an ambiguous request sends it hunting
  before it thinks to look anything up**. "Change the language" sounded like a control to find;
  "the Monaco syntax-highlighting mode" is specific enough that the guide becomes the obvious
  place. Ambiguity is fixable in prose — which is why this worked where the emphatic routing
  directive did not, and it is the more useful lesson for writing the next guide. And **`app.editors.resolveId()` ignores
  board-provided editors** — it returns `"monaco"` for `.pdf` on a machine where the PDF Viewer
  board demonstrably opens it, so the script API contradicts `openFile`. Backlogged.

  The settings work from the cold-start task verified itself here as a side effect — asked to
  change a setting, the agent used `app.settings.set`, reported the file path, and quoted the
  accepted values and default out of the rewritten comments.
- All five remaining concerns reviewed and settled — see **Decisions**. The one that changed the
  plan's shape is scope: **browser pages are not a target**, only the app window (with boards as a
  natural second). That removes the snippet size budget entirely and admits a reduced form — a
  bare highlight ring with no tooltip card — for web pages, where the agent can explain the
  highlight in its chat reply instead. The `text` option becoming optional is the whole mechanism.
  Guide drift gets a concrete owner (`/document`) rather than a good intention.
