# EPIC-087: The data editors through `call`, and the retirement of `ui_push`

## Status

**Status:** Active
**Created:** 2026-09-06
**Started:** 2026-09-06
**Roadmap:** [agent-transparency-roadmap.md](../agent-transparency-roadmap.md), epic 4 of 7

## Overview

EPIC-086 went inside a page for the first time and covered the family that *shows* content — text,
previews, media, diffs, graphs. This epic covers the family that *holds structured data and does
work with it*: grids, notebooks, the REST client, environment variables, archives, the Log View, and
the three navigation surfaces (Folder View, Git Tree, and the Explorer sidebar).

Two things make it different from EPIC-086.

**Most of these surfaces have no facade at all.** EPIC-086 inherited thirteen facade classes from
US-1291 and mostly added `elements` to them. Here only two of the eight surfaces have a facade
(`GridEditorFacade`, `NotebookEditorFacade`, both registered in `FACADE_FOR_EDITOR`,
`PageWrapper.ts:52-70`), and neither declares `elements` — grid's descriptor
(`GridEditorFacade.ts:26-38`) carries members and `summarize()` and nothing else. The REST client,
env vars, log view, archive, folder view and git tree fall through to `GenericEditorFacade`
(`PageWrapper.ts:154`), so `pages[i].editor` on a REST page today answers with an id and a name and
nothing an agent can act on.

**One of them is a tool.** `ui_push` is not a convenience wrapper over a page — it is the agent's
declared output channel, with a well-known page (`mcp-ui-log`, `well-known-pages.ts:33-39`), five
output types, six blocking dialog types with per-type schemas and error messages
(`src/renderer/api/mcp/ui-push.ts:12-42`), and a manifest entry that sets `timeoutMs: 0` so a batch
containing a dialog waits forever (`src/main/mcp/tools/page-tools.ts:79-87`). Replacing it with a
path is the epic's headline and its only genuinely hard design problem — see decision 5.

### The family

Counts in the last column are **named controls found in the source**, not curated counts: `data-name`
is emitted by UIKit components from a `name:` prop (`uikit/Autocomplete/AutocompleteView.ts:258`
and the same pattern in Button, Input, Label, ListBox, Menu, Divider, Checkbox, Dialog and
CategoryList), so there are zero literal `data-name=` attributes in these folders and the inventory
below was taken from the `name:` props. Structural roots, splitters, row wrappers and section
headers are in these numbers and are *not* curated controls, so every figure is an upper bound its
task corrects — EPIC-086's precedent, where image fell 9 → 3 and video 14 → 10.

| Surface | Editor id(s) | Facade today | Named controls in source | Task |
|---|---|---|---|---|
| Grid | `grid-json`, `grid-csv`, `grid-jsonl` | `GridEditorFacade`, no `elements` | 10 | US-1318 |
| Notebook | `notebook-view` | `NotebookEditorFacade`, no `elements` | 23 | US-1319 |
| REST client | `rest-client` (+ `rest-panel` view) | **none** | 64 | US-1320 |
| Env vars | `env-vars-view` | **none** | 8 | US-1321 |
| Archive | `archive-view` (+ `archive-tree` view) | **none** | 6 | US-1321 |
| Log View | `log-view` | **none** (but see below) | 51 | US-1322 |
| Folder View | `category-view` | **none** | 4 | US-1323 |
| Git Tree | `git-tree` (+ `git-changes`, `git-diff-revisions` views) | **none** | 30 | US-1323 |
| Explorer / Search / Boards sidebar | *not editors* — secondary views | **none** | 19 | US-1323 |

The last row is the roadmap's "explorer", and it is not a page editor.
`src/renderer/editors/explorer/` registers `explorer`, `search` and `boards` as **secondary views**
(`register-editors.ts:19-41`), which is why they never appeared in the editor registry's 32 ids.
EPIC-085 shipped `page.panels` — open/width state, expansion, whole-sidebar toggle — but a panel
itself has no node and no `elements`, so an agent can see that the Explorer panel is open and
nothing about what is in it. That is US-1323's third piece.

## Goals

- Every surface in the table answers `pages[i].editor` with a real facade: its state, the actions
  the user can take from that screen, and a curated `elements` list with a purpose line each.
- `ui_push` has a complete replacement path under `pages.logView` — every entry type, every dialog
  type, and a way to read a dialog's answer that does not hang the MCP transport — and is marked
  **retirable**. Nothing is deleted; deletion is EPIC-090's.
- The Explorer, Search and Boards sidebar panels are reachable as nodes under `page.panels`, not
  just as open/closed state.
- No member *accepts* a secret value on any of these surfaces, and no surface claims a redaction it
  cannot enforce — see decision 7, revised once the REST client showed the difference.
- `qa/surfaces/editors/data.md` and `qa/surfaces/panels.md` exist and pass on Haiku with `call`
  alone.

## Design decisions

### 1. Three grid ids, one facade, one element list

`grid-json`, `grid-csv` and `grid-jsonl` already share `GridEditorFacade`
(`PageWrapper.ts:54-56`) and share a view. They get one `elements` list; the entries that only exist
for CSV (the CSV options popup, `editors/grid/components/CsvOptions.ts`) are declared once and
report `visible: false` on a JSON grid. Declaring a control that *can* appear on this facade and
reporting it honestly invisible is the established shape (EPIC-086 decision 8, and the Monaco
surface where ten of twelve entries are conditional). It is the opposite of decision 7 there —
declaring an element that can *never* be found — which stays forbidden.

### 2. Grid gains the state the toolbar shows, not the state av-grid owns

`GridEditorFacade.rows` returns a **copy** on purpose (documented at `GridEditorFacade.ts:41-48`:
av-grid owns the live array, so handing it out would let a script mutate data with no repaint and no
write). That contract is kept. What is missing is everything the user can see on the toolbar and
cannot read through the facade: the active search text, sort, column filters, selection, and which
columns are hidden. Those are added as read-only properties plus the actions that set them. No
member returns a live mutable array.

### 3. Every new facade is added to `FACADE_FOR_EDITOR`, never to `PageWrapper` as a method

`as*()` is gone (EPIC-086 decision 1) and nothing reintroduces a per-editor accessor. A new surface
is a class in `src/renderer/scripting/api-wrapper/`, an entry in the `FACADE_FOR_EDITOR` map
(`PageWrapper.ts:52`), an addition to the `IEditorFacade` discriminated union in
`src/renderer/api/types/`, and a regenerated `assets/editor-types/*.d.ts`. The `.d.ts` is
**generated** and is never hand-edited.

### 4. `strictNullChecks` is off, so "returns `undefined` when unavailable" is a review obligation

Carried forward verbatim from EPIC-086's Needs-user-check item 6. A getter declared `: string` may
return `undefined` and `npm run typecheck` passes. Six new facades land in this epic, most of them
over models that may have no loaded document, no selected request, no open archive. **Every plan
review in this epic checks by hand that an absent value is `undefined` and not `false`, `0`, `""` or
`null`** — the compiler will not. EPIC-086 caught exactly this defect (`GraphEditorFacade`'s
null-host path returning `false`) in plan review, which is the evidence that the check is worth its
cost.

### 5. `pages.logView` is a node on `pages`, and `push` does **not** block

This is the epic's central decision and it changes behaviour relative to `ui_push`. The reasoning,
in full, because it is the one thing a reader will want to challenge.

**Why a node on `pages` and not only a page facade.** `ui_push`'s first act is
`pagesModel.requireWellKnownPage("mcp-ui-log")` (`ui-push.ts:44-51`) — get-or-create-and-focus a
singleton page. That behaviour belongs to no particular open page, so it cannot live on
`pages[i].editor`; it is the same shape as `pages.compare` in EPIC-086 decision 9, a property of the
collection rather than of one member. So:

- `pages.logView` — the agent's output channel. Get-or-creates `mcp-ui-log`, and carries `push`,
  the entry list, and the dialog-answer path.
- `pages[i].editor` on **any** `log-view` page — an ordinary `LogViewEditorFacade` with the same
  members, for the second well-known log (`mcp-server-log`, `well-known-pages.ts:42-47`) and for a
  `.log.jsonl` file the user opened. `pages.logView` is a shortcut to the first one, not a second
  implementation.

**Half of this already exists and is simply invisible.** `UiFacade`
(`scripting/api-wrapper/UiFacade.ts:25,51-56,70`) already wraps a `LogViewEditor` and offers
`log`, `info`, `warn`, `error`, `success`, `text` and `dialog` to scripts as `app.ui.log`, with the
page lifecycle — recreate the facade if the user closed the log page — handled in
`ScriptContext.ts:96-107`, and a published typing (`api/types/ui-log.d.ts`, `IUiLog`). It is
unreachable from `call` for one reason: `scripting/ai-vision/namespaces/ui.ts` describes `app.ui` but
its member list (lines 25-35) has no `log` entry, and the tree enumerates only what a descriptor
declares (roadmap principle 1 — nothing is discovered by reflection). So US-1322 is largely
*declaring* an existing surface rather than building one, and it must reuse `UiFacade` and the
`ScriptContext` lifecycle rather than write a second implementation that can drift from it.
Declaring `app.ui.log` is part of the task; `pages.logView` is the page-oriented entry point beside
it, and the two resolve to the same editor.

**Why `push` returns immediately.** `ui_push` can block forever by design: its manifest entry
returns `timeoutMs: 0` when any entry type starts with `input.`, and the handler awaits
`Promise.all(dialogPromises)` before returning (`ui-push.ts:120-128`). `call` has no such override —
it goes through `sendToRenderer` with the default `REQUEST_TIMEOUT_MS`
(`renderer-bridge.ts:52`), so a blocking push would simply time out.

Two ways to fix that were considered and both rejected:

- *Give `call` a per-path infinite timeout.* Rejected: `call` is one tool for the whole object
  model. An infinite timeout keyed on a path prefix means every future path that happens to match
  inherits a transport that can never report failure, and the renderer-timeout branch in
  `call-tools.ts` — which is how a **native** OS dialog is currently reported as
  `pending: true` + `attention` — stops being reachable for that path. One surface must not degrade
  the tool's error reporting for the other thirty.
- *`push(entries, { wait: true })`.* Rejected for the same reason plus a worse one: an option that
  sometimes hangs the transport for thirty minutes is precisely the stall the attention protocol was
  built to remove (roadmap, *Attention*). An agent that cannot tell "the user has not answered yet"
  from "the call is broken" is the failure EPIC-084 fixed.

So: **`push(entries)` returns as soon as the entries are rendered**, with the ids of any dialogs it
created. The answers are read back, and while any log dialog is unanswered the surface raises
`attention` — the same protocol every other blocking thing in the app already uses, which is what
makes the polling loop obvious to an agent rather than something it has to invent. The exact shape
of the read-back (a `dialogResult(id)` returning an unresolved marker, versus an `entries` list
carrying each dialog's state) is US-1322's to settle against the `LogEntry` type; the plan review
checks that an unanswered dialog is distinguishable from an answered one whose value is falsy —
`ui_push` itself has this bug-shaped edge and papers over it by mapping `button === undefined` to
`null` (`ui-push.ts:123-126`).

**The behaviour change is safe to make now** because `ui_push` is *marked* retirable at the end of
this epic, not removed. Both paths exist side by side until EPIC-090, so an agent that wants the
blocking call still has it, and the QA run in US-1324 is what decides whether the non-blocking path
is actually usable before anything is cut.

### 6. Dialog *specs* move to the surface; validation messages are kept

`DIALOG_SPECS` (`ui-push.ts:12-42`) is the best documentation in the tool: per-type allowed props, a
required prop, and a worked `usage` string used verbatim in error messages. That table is the
surface's `$help`, and the same validation runs on the `push` path. A replacement path that accepts
a malformed dialog and hangs the Log View — the failure the tool's description explicitly warns
about ("Incorrect fields will crash the dialog and cause a permanent hang") — would be a regression
even though the tool's own tests would still pass.

### 7. No member *accepts* a secret; whether one may *return* a value depends on the page

**Revised 2026-09-06, during US-1320's review**, after the original rule failed its first contact
with the code. It read: "these surfaces expose names, presence and shape; a value marked secret
reads as a redaction marker". Verifying that against the REST client showed it would have shipped a
guarantee the system does not provide.

The two halves are not symmetric, and separating them is the whole correction.

**Accepting a secret is always forbidden.** A member that takes a password, token or header *value*
as an argument writes that value into the `call` arguments and into the MCP transcript — a place the
secret was not before. That is EPIC-086's encryption rule (Needs-user-check item 3) and it holds on
every surface in this epic regardless of what is readable. So: no `setHeaderValue`, no `setBody`, no
`updateRequest(id, Partial<…>)`, no password argument anywhere.

**Returning a value is only a boundary where a boundary actually exists.** `rest-client` is
registered `hasContentHost: true` (`register-editors.ts:160`), so `pages[i].content` returns the raw
`.rest.json` — URL, `Authorization` value and body included. Verified live on a page with planted
credentials (see Needs user check 1). A facade that redacted those fields would sit one path segment
from the unredacted text on the *same node*, protecting nothing while telling the agent and the
user's `$help` that a protection exists. A stated guarantee the system does not honour is worse than
no guarantee — the same error EPIC-086 caught in the `open_url` premise and refused to ship.

So each surface answers one question first: **is there a path beside this facade that already
returns the value?** If yes, the facade exposes what the user sees and claims nothing. If no — a
value that lives only in a model, never in page text — it may genuinely be withheld, and
`restricted()` is used where a whole node must go. US-1321 asks this question of env vars and
archives separately and records the answer; it must not assume the REST answer applies.

### 8. Writes and network calls carry `caution`

Sending a REST request spends the user's credentials against a live service; extracting an archive
writes to the user's disk; deleting grid rows or notebook cells destroys data; setting an
environment variable changes what every board and script sees. Each of those members carries a
`caution` string, as `deleteRows`/`deleteColumns` already do (`GridEditorFacade.ts:11,13`).

### 9. The navigation surfaces are read-mostly

Folder View, Git Tree and the Explorer sidebar mostly *show* a tree and *open* things from it. Their
facades list what is shown, the current root or ref, and the open/reveal action. Git operations
beyond reading — commit, checkout, stage — are not added: the git surface an agent needs is
"which commit is this diff between", which EPIC-086 already answered on `file-diff`, and widening
into repository mutation is a decision with a much larger blast radius than descriptor work. A
demonstrated scenario reopens it.

### 10. Sidebar panels get nodes under `page.panels`, keeping its name

EPIC-085 named the collection `page.panels` and EPIC-086 declined to rename it. Individual panels
become addressable members of it (`page.panels.explorer`, `page.panels.search`, `page.panels.boards`
and the git panel), each with its own `elements` and its own state. The collection's existing
open/width/toggle members are unchanged.

### 11. Page-scoped selectors everywhere, unchanged

Every element declared in this epic is resolved beneath `[data-page-id="<id>"]` via
`pageScopeSelector` (`ai-vision/page-elements.ts:6-8`), and `highlight` activates the page and waits
for slot layout via `activatePageAndWaitForLayout` (same file, line 35). Sidebar panels are
page-scoped too, since the sidebar belongs to the page. Missing `data-name`s are added to views; no
existing `data-name` or `data-type` is renamed.

### 12. Version stays 5.0.0

`package.json` is already at 5.0.0 from EPIC-086 and this epic adds no further breaking change to
the scripting API — every new facade is additive, and `ui_push` is not removed. Agent-visible
additions are recorded in the `## Version 5.0.0 (Upcoming)` section of `docs/whats-new.md`. The
branch keeps its `upcoming-v4.0.24` name; renaming it is the user's to do.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| [US-1318](../tasks/US-1318-grid-surface/README.md) | The grid surface — elements, search/sort/filter state, and the CSV and column options popups | Planned |
| [US-1319](../tasks/US-1319-notebook-surface/README.md) | The notebook surface — cells, execution state, and the toolbar | Planned |
| [US-1320](../tasks/US-1320-rest-client-surface/README.md) | The REST client surface — collection, request, response, variables, and send | Planned |
| [US-1321](../tasks/US-1321-env-vars-and-archive/README.md) | Env vars and archive — two new facades, with the secret and extraction rules | Planned |
| [US-1322](../tasks/US-1322-log-view-surface/README.md) | Log View — `pages.logView`, a `log-view` facade, non-blocking `push`, and the `ui_push` replacement path | Planned |
| [US-1323](../tasks/US-1323-navigation-surfaces/README.md) | Folder View, Git Tree, and the Explorer/Search/Boards sidebar panels | Planned |
| [US-1324](../tasks/US-1324-data-surface-acceptance/README.md) | Acceptance run on Haiku via `mcp-test-agent-call`; `qa/surfaces/editors/data.md` and `qa/surfaces/panels.md`; `ui_push` marked retirable | Planned |

US-1318 through US-1323 are independent of one another and can be reordered. US-1322 is the largest
and the only one with a design problem rather than an inventory problem; it is placed fifth so that
the four straightforward surfaces establish the pattern first. US-1324 closes and is the gate for
marking `ui_push` retirable.

## Per-surface checklist

Every task follows the roadmap's seven steps
([agent-transparency-roadmap.md](../agent-transparency-roadmap.md), *Per-surface checklist*):
descriptor next to the model; a curated `elements` list with a purpose line and a `data-name` each;
actions as methods with `caution` where they write; the dialogs and menus the surface raises named in
`$help`; `restricted()` where privacy applies; scenarios in `qa/surfaces/`; and only then the tool
marking.

Two additions specific to this epic:

8. **The absent-value audit** (decision 4). For every getter the plan adds, the review states what
   it returns when the underlying model has no document, no selection or no connection, and
   confirms that value is `undefined`.
9. **The secret audit** (decision 7). For every surface holding credentials, the plan lists which
   model fields are secret and how each is withheld.

## Retirement plan for `ui_push`

`ui_push` is marked retirable in US-1324 only when all of the following hold, each verified live
through `call` before the marking (principle 3):

| `ui_push` capability | Replacement path | Verified by |
|---|---|---|
| Get-or-create the Log View page | `pages.logView` (reading it) | US-1322 |
| String shorthand → `log.info` | `pages.logView.push(["text"])` | US-1322 |
| `log.text/info/warn/error/success` | same, as entry objects | US-1322 |
| `output.text`, `output.markdown`, `output.mermaid` | same | US-1322 |
| `output.grid` (JSON and CSV `contentType`) | same, with the same `csvToRecords` path | US-1322 |
| `output.progress` | same | US-1322 |
| Six `input.*` dialog types with per-type validation | same entries; `DIALOG_SPECS` validation reused, not reimplemented | US-1322 |
| Blocking until every dialog resolves | **behaviour change**: non-blocking `push` + answer read-back + `attention` while unanswered (decision 5) | US-1322, gated by US-1324 |
| `windowIndex` targeting | `windows[i].pages.logView.push(...)` | US-1324 |

One more thing goes with it: `register-editors.ts:152` gives the `log-view` editor an `mcpHint`
pointing the agent at `ui_push`. That hint is updated to name the path, since a surface that tells
the agent to use the tool it replaces would fail the acceptance run by construction.

Nothing is deleted in this epic. The roadmap's epic table gains a ✅ and the tool→path map's
`ui_push` row is marked retirable with the date; `src/main/mcp/tools/page-tools.ts` is not touched.

If the blocking behaviour turns out to be load-bearing for a real agent — US-1324's Haiku run is the
test — the marking is withheld and the row stays unmarked, exactly as `open_url` was withheld in
EPIC-086. A tool is never marked on the strength of a table.

## Abort criteria

Stop the epic and record why, rather than pushing through, if any of these appear:

1. **A surface's model cannot answer its own state without reaching into a view.** EPIC-086's
   `data-part` DOM-query finding is the precedent: a facade that reads the DOM to report model
   state works in a demo and fails silently once the view changes. If a surface genuinely has no
   model-side answer, the facade stops at `elements` and says so in `$help` rather than faking it.
2. **The non-blocking `push` design cannot distinguish an unanswered dialog from a falsy answer.**
   That is decision 5's core requirement; if the `LogEntry` type cannot carry it without a change to
   the log entry model, that change is in scope for US-1322 — but if it turns out to require
   reworking the dialog views, US-1322 stops at the non-dialog entry types, `ui_push` is not marked
   retirable, and the dialog half moves to its own task.
3. **A secret cannot be withheld without breaking the surface** (decision 7). Withholding wins; the
   member is dropped.
4. **Encoding damage from a delegated edit** that a mechanical repair does not fully reverse. Stop,
   revert the task's commit, and re-delegate with `apply_patch` only.

## Needs user check

1. **REST page-level secret boundary (US-1320):** Live verification found that a `rest-client`
   page's `content` returns the full `.rest.json`, including `"url": "https://api.example.com/v1/me?token=SECRETQUERY"`, `"Authorization"` with value `"Bearer SECRETHEADER"`, and `"body": "pw=SECRETBODY"`. The assumption for US-1320 is that the facade exposes what the user sees and claims no protection it cannot enforce; no member accepts a secret value. A genuine boundary would have to be page-level, covering `content` and the facade together with the `restricted()` treatment private browser pages get; that user-owned blast-radius decision is deliberately not invented here.

## Notes

### 2026-09-06 — epic created

Scope verified against the source before the tasks were written, not taken from the roadmap's list:

- The editor registry has **32** editors; the roadmap's "grid" is three of them
  (`grid-json`, `grid-csv`, `grid-jsonl`), which the roadmap did not say.
- The roadmap's "explorer" is **not a page editor**. `explorer`, `search` and `boards` are
  secondary views (`register-editors.ts:19-41`); the page-editor equivalent is `category-view`
  ("Folder View"), which is a separate surface. Both are covered, by US-1323.
- Six of the eight surfaces have **no facade**; two have one with **no `elements`**. This epic is
  therefore more construction and less annotation than EPIC-086 was.
- `data-name` is emitted from a `name:` prop on UIKit components, not written as a literal
  attribute, so element counts cannot be obtained by grepping `data-name=` in these folders. The
  table's counts come from the `name:` props and are corrected per task.
- There is **no central descriptor registry**: a descriptor is an `aiVision` getter on the class
  itself (`shared/ai-vision/types.ts`), and there are **zero** `aiVision` implementations anywhere
  under `src/renderer/editors/` — every editor descriptor lives in its facade file. This epic keeps
  that arrangement.
- `app.ui.log` already exists as a script API and is invisible to `call` only because `ui.ts`'s
  member list omits it. That discovery shrank US-1322 from "build an output channel" to "declare
  one, and decide how its dialogs are answered" — see decision 5.
- No `.d.ts` exists for rest-client, env-vars, archive, explorer, git-tree, or the log-view page
  editor, matching the missing facades. `assets/editor-types/` is a **flat copy** of
  `src/renderer/api/types/` produced by `editorTypesPlugin()` in `vite.renderer.config.ts:8-65`, so
  each new type file must be a self-contained leaf. It is never hand-edited.
