# EPIC-083: AiVision — a single self-discoverable MCP tool over the app object model

## Status

**Status:** Completed
**Created:** 2026-09-05
**Started:** 2026-09-05
**Completed:** 2026-09-05

## Overview

Agents drive Persephone today through ~30 MCP tools plus `execute_script`, which requires reading
the scripting guide and writing correct JavaScript against an API the agent has never seen. Strong
models cope; weaker models guess method names, mis-escape content, and give up. This epic adds one
MCP tool, `call` (clients namespace it as `mcp__persephone__call`, so no `persephone_` prefix), that takes a **path** into the live app object model (`""`,
`pages`, `pages[2]`, `pages[2].content`, `pages[2].asGrid().addRows`) and returns the value at that
path **plus a hint** describing the object it landed on: its members, one line each, and how to go
deeper. An unknown segment returns the valid children instead of an error. The tool is
self-discoverable: an agent that knows only "call with an empty path first" can find everything else.

On the app side the epic introduces **AiVision**: a small interface that any object in the script
API tree can implement to describe itself to an agent. No second object model is built. The tree
*is* the existing `AppWrapper` → `PageCollectionWrapper` → `PageWrapper` → editor-facade graph in
`src/renderer/scripting/api-wrapper/`; AiVision is metadata hung on those same objects.

## Goals

- One tool that a weak model can use with no prior knowledge, and that a strong model can use as
  a fast path for simple reads and actions without writing a script.
- Hints that double as a tutorial for `execute_script`: every path names the same members as the
  script API, so an agent graduates from `call` to scripts with nothing to relearn.
- Zero drift risk: descriptors live next to the wrappers they describe, and there is no parallel
  hierarchy to keep in sync.
- Wrong input is self-correcting: an unknown member, a wrong index, or a missing argument returns
  the information needed to fix the call.
- A path toward **one tool total**: if the first slice proves usable, every existing MCP tool
  becomes a path under `call`, and browser automation is reached through the page that
  hosts the browser, board, or HTML viewer. Out of scope for this epic; see *Long-term direction*.

## Design decisions (recorded here so tasks do not re-litigate them)

### 1. Interface, not base class — and not `Traited`

The user's direction: "it should not be a class but interface, so we can add any object into
tree". Agreed. Every wrapper keeps its own inheritance; it opts in by implementing:

```typescript
// src/shared/ai-vision/types.ts  — shared: main-process nodes (`windows`, `main`) implement it too
export interface IAiVisible {
    readonly aiVision: IAiVisionDescriptor;
}

export interface IAiVisionDescriptor {
    /** Stable type name; the hint-dedupe key. E.g. "Page", "GridEditor". */
    readonly kind: string;
    /** One sentence shown in the parent's member list. */
    readonly summary: string;
    /** Static members the agent may name in a path: methods and plain properties. */
    readonly members: readonly IAiMember[];
    /** Long-form guidance returned for `<path>.$help`. May be a function to build lazily. */
    readonly help?: string | (() => string);
    /**
     * Dynamic children — the part of the tree that changes at runtime (open pages, the facade
     * for the page's *current* editor, an existing grouped page). The object enumerates them
     * itself, cheaply and without side effects; the resolver never guesses. Each entry is a
     * path segment plus a one-line summary of that instance.
     */
    children?(): readonly IAiChild[];
    /**
     * Optional, instance-level: when this returns text, the node is *listed* (in `children()`,
     * summaries, `helpSearch`) but nothing under it resolves — the resolver answers with the text.
     * `$help` still works. Used by incognito/Tor browser pages and by settings-gated nodes.
     */
    restricted?(): string | undefined;
    /** Optional: makes the node indexable — `pages[2]`, `pages["<id>"]`. */
    index?(key: string | number): unknown;
    /** Optional: JSON-able summary of an instance for result shaping (default: `{ kind }`). */
    summarize?(): unknown;
}

export interface IAiChild {
    /** The segment to append: `[2]`, `["<id>"]`, or `.grouped`. */
    readonly segment: string;
    readonly kind: string;
    readonly summary: string;
    /** Present when the child's `restricted()` returns text — the parent lists it, greyed out. */
    readonly restricted?: string;
}

export interface IAiMember {
    readonly name: string;
    readonly kind: "property" | "method";
    readonly summary: string;
    /** For methods: one-line signature, e.g. "addRows(count = 1, insertIndex?: number)". */
    readonly signature?: string;
    /** Marks a getter with side effects or a destructive method; the hint prefixes a warning. */
    readonly caution?: string;
    readonly writable?: boolean;
}
```

Why not the trait system: [trait-system.md](../architecture/trait-system.md) deliberately requires
explicit `traited(target, traits)` wrapping because trait payloads cross serialization boundaries
(drag data, cross-window). Wrapper instances never do — they are live objects returned by getters
during a path walk — so the wrapping adds a step at every hop for no benefit. A plain interface
property on the instance is the right weight. For objects we do not own (plain data returned by
`app.settings`, third-party values), a side registry `registerAiVision(ctor, descriptor)` lets the
resolver look descriptors up by constructor; that covers "add any object into the tree" without
touching the object.

### 2. Path grammar mirrors the script API exactly

The root of the tree is the `app` object as `AppWrapper` exposes it, plus one convenience member
`page` (the active page — same name as the script global). So:

| Path | Script equivalent |
|---|---|
| `""` | root — lists `pages`, `page`, `fs`, `settings`, `ui`, `shell`, `window`, `proc`, `boards`, `version` |
| `pages` | `app.pages` — the collection summary (count, active id) plus its members |
| `pages[2]`, `pages["<id>"]` | `app.pages.all[2]`, `app.pages.findPage("<id>")` |
| `page.content` | `page.content` |
| `pages[2].asGrid()` | `await app.pages.all[2].asGrid()` |
| `pages[2].asGrid().rows` | `(await ...asGrid()).rows` |
| `pages[2].$help` | — (long-form guidance for the Page node) |
| `windows[1].pages[0].content` | the same, in window 1 (`windowIndex: 1` on other tools) |
| `windows` | `list_windows` — the open windows, each a child |

Grammar: `[ "windows[" index "]." ] segment ( "." segment )*` where a segment is `identifier`,
`identifier[index]`, `identifier(args)`, or `$help`. The leading `windows[i]` is **optional**: a
path without it resolves against the main/default window, exactly as other tools do when
`windowIndex` is omitted (`sendToRenderer` picks the first open window). Persephone is multi-window,
so the prefix must exist; making it optional keeps the common single-window case short. Plural
`windows[i]` is the collection, matching `pages[i]`; singular `window` stays what it is in the
script API — the current window's own operations (`app.window`). `index` is an integer or a JSON string. `args` are JSON literals
separated by commas, **intended for short primitives only**. The resolver awaits every hop, so
async facades need no special syntax.

Why mirror names instead of inventing friendlier ones (`page(s)`, `editor.text`): every hint the
agent reads then teaches it the real API, and the scripting guide, the `.d.ts` typings and the
tool all agree. One vocabulary, three entry points.

### 3. Arguments and assignment travel outside the path

Tool parameters:

| Parameter | Type | Meaning |
|---|---|---|
| `path` | string | required; `""` for the root |
| `args` | JSON array | optional; arguments for the **last** segment when it is a call. Overrides inline `()` args. Use for anything with quotes, newlines, or size. |
| `value` | any | optional; assigns to the last segment (must be a writable property). Mutually exclusive with `args`. |
| `hints` | `"auto" \| "always" \| "never"` | default `auto`: send the kind-level member list the first time this session lands on a given `kind`, then omit it; the instance-level `children()` list is always included. `never` drops both. |
| `maxLength` | number | optional; string results longer than this are cut and the response carries `truncated: true` with the total length. Default 20 000. |
| `windowIndex` | number | optional, as on every other tool |

Escaping large content inside a path string is exactly where small models fail, so content never
has to go there. The user's `skip hints` flag becomes `hints: "never"`; `auto` dedupes server-side
because a per-session `Set<kind>` in the tool closure (one `McpServer` per session already, see
`server-factory.ts`) is more reliable than asking the agent to remember what it has seen.

### 4. Discovery is cooperative: the object enumerates its own children

The tree is dynamic — pages open and close, a page's facade depends on which editor is current,
a grouped page may or may not exist — so a purely static member list cannot describe it. But the
resolver must not discover children by touching arbitrary getters either: `PageWrapper.grouped`
**creates** the grouped page when read, and other getters may be expensive. The middle path is the
predefined interface above: every node answers two questions itself.

- **`members`** — the *kind-level* shape: methods and plain properties, the same for every
  instance of that kind. Static, cheap, deduped per session by `kind`.
- **`children()`** — the *instance-level* shape: what exists under this node right now. The object
  implements it knowing which reads are safe (`pages.all` iterates without creating anything;
  `Page` lists `grouped` only when `isGrouped` is already true; `Page` lists the one facade that
  matches its current editor as `asGrid()` etc.). Never deduped, always compact.

So a hint for `pages` is the member list (once per session) plus the live child list (every time):

```
pages — 4 open pages, active: [1]
  [0] "notes.md"        Page (md-view)
  [1] "data.json"       Page (grid-json)   ← active
  ...
members: all, activePage, findPage(id), openFile(path), closePage(id) [caution], …
```

The resolver walks only segments the agent named or that a `children()` call returned. Nothing
enumerates by reflection over the JavaScript object; the "reflection" is the object reporting on
itself through the interface.

### 5. Result shaping

- Primitives and arrays of primitives: returned as-is (strings subject to `maxLength`).
- An `IAiVisible` instance: `descriptor.summarize()` (e.g. a Page → `{ id, title, editor,
  language, filePath, modified, active }`), never the raw object.
- Arrays of visible instances: array of summaries.
- Anything else: JSON-serialised with a depth cap; failure to serialise returns `{ kind:
  typeof }` plus a hint to use `execute_script`.
- Calls returning `void`: `{ ok: true }`.

Response envelope: `{ path, result, truncated?, totalLength?, hint?: { kind, text } }`.
Errors: `{ path, error, resolvedUpTo, hint }` where `hint` is the parent node's member list — the
self-correction mechanism.

### 6. Security parity, not expansion

`execute_script` already grants full Node access. `call` exposes a strict subset of the
same wrappers, so it adds no privilege. Destructive members (`fs` writes, `shell`, `closePage`)
carry `caution` in their descriptors so the hint says so; nothing is hidden and nothing new is
allowed.

### 7. Privacy: incognito and Tor browser pages stay blocked — via `restricted()`

The MCP surface already protects private browsing and `call` inherits that rule unchanged. Today
`list_pages`/`get_active_page` omit `url` for incognito and Tor pages (`page-commands.ts`), and
every `browser_*` command refuses such a target after resolution with an explicit message
(`automation/commands.ts`).

The user asked whether the interface needs a `discoverable` flag for this. Decision: a hook, but
shaped differently — **`restricted?(): string | undefined`** on the descriptor, instance-level.

- Not a boolean, because the *reason* is what makes an agent stop probing and try `open_url`
  instead. The text returned is the same refusal the `browser_*` tools give today.
- Not "discoverable", because a private page **should** be discoverable: it appears in
  `pages.children()` and in summaries with `isIncognito`/`isTor` set and no `url`, marked
  `restricted`. What is blocked is everything *under* it — `asBrowser()` and every member below.
  `$help` still works, since help carries no page data.
- Instance-level, not kind-level, because the block depends on page state, not on the class. A
  static descriptor flag could not express it; `restricted()` fits the cooperative model of
  Design decision 4 — the object reports on itself.
- The **resolver** enforces it at every hop, so a new browser member cannot forget the rule; the
  object only states the condition.

The same hook serves other gates for free: `main.script` returns "disabled — enable *Allow
main-process scripts* in Settings" until the toggle is on (US-1295), and any future node that must
exist but not open uses it too.

**Provenance rule (2026-09-05, replaces an earlier dev-only constant).** Testing incognito/Tor
behaviour needs an agent that can see those pages, and a release-safe way to allow it is to ask
*who opened the page*. `BrowserEditorState.openedByAgent` is set when an MCP tool (`open_url`) or an
MCP-originated script context (`execute_script`, `call` — `ScriptContext` knows it is MCP-run
because it receives `consoleLogs`) opens a browser page; user actions and user-run scripts never
set it. The rule, in one dependency-free helper `editors/browser/agent-access.ts`
(`agentMayAccessBrowserPage`): a private page is off limits unless the agent opened it. All three
sites consult it — `automation/commands.ts` targeting, `page-commands.ts` url omission, and
`Page.restricted()` / summaries. Safeguards: the flag is **not persisted** (a restored page is the
user's again); the tab of an agent-opened private page reads "Browser (agent)" so the user never
mistakes it for their own session; an agent asking for an incognito tab never reuses the user's
incognito page — only its own, or a fresh one. Works identically in dev and release.

`call` is an MCP entry point even though it walks the script wrappers, so it applies MCP privacy
rules regardless of what a user-run script may do through the same wrappers. When `browser_*` is
later folded into paths (consolidation epic), this guard is what preserves the current behaviour.

### 8. Hand-written descriptors first; generation from `.d.ts` is a follow-on

The typings in `src/renderer/api/types/*.d.ts` already document this surface with JSDoc and are
flat-copied into `editor-types` for Monaco. Generating `members`/`help` from them at build time is
attractive and is recorded as an optional task (US-1294), but the MVP writes descriptors by hand:
they are short, the wrappers are few, and hand-written summaries can say things typings cannot
("reading this creates the grouped page").

## Long-term direction (not in this epic)

The user's stated end state: **an agent sees one tool and nothing else.** No choosing between
`list_pages`, `get_active_page`, `execute_script` and `ui_push`; no reading a guide before a tool
may be used. The tool description carries a handful of example calls and the list of top-level
entries, and the agent discovers the rest through hints. Possibly the `browser_*` family survives
as separate tools for Playwright-compatible clients, but even then the same operations must be
reachable as paths, e.g. `pages["<id>"].asBrowser().snapshot()` on a page whose editor is a
browser, board, or HTML viewer (`BrowserEditorFacade` already exists; the `browser_*` handlers in
`automation/commands.ts` resolve a target the same way).

**This epic removes nothing.** Consolidation is a follow-on epic, gated on US-1293 showing that a
haiku-class agent completes the scenario set with `call` alone. What this epic *does*
owe the future is a root layout that will not have to change. So the root must already reserve
these entries, even if some are stubs that point at the existing tool for now:

| Future path | Replaces |
|---|---|
| `pages`, `page`, `pages[i].content` (+ `value`) | `list_pages`, `get_active_page`, `get_page_content`, `set_page_content`, `create_page` (via `pages.addEditorPage(...)`) |
| `windows`, `windows[1].pages[...]`, `windows.open()` | `list_windows`, `open_window`, and the `windowIndex` parameter — the prefix is optional and defaults to the main window (Design decision 2) |
| `script.execute(code)` (+ `script.$help` quoting the scripting guide) | `execute_script` — stays the escape hatch, reached through the same tool; `code` travels in `args` |
| `pipe["<href>"].readText()`, `.readBinary()`, `.info` | *(new capability)* — read any source Persephone can open: `file:`, `https:`, an archive entry, `mneme://`, and whatever provider lands later. The index runs the href through the content pipeline's Layer 1 parsers and Layer 2 resolvers (`openRawLink` → `openLink`) and stops before Layer 3, so it yields a `pipe` without opening a page. Same code path as `io.createPipe` in scripts, so one descriptor covers every scheme. |
| `ui.push(...)` / `ui.log(...)` | `ui_push` |
| `boards.create(...)`, `boards.open(...)`, `boards.refresh()` | `create_board`, `open_board`, `board_refresh` |
| `tools.search(q)`, `tools.execute(...)`, `tools.refresh()`, `tools.create(...)` | `search_tools`, `execute_tool`, `refresh_toolset`, `create_toolset` |
| `guides`, `guides["scripting"]` | `read_guide` — and `$help` on a node should quote the relevant guide section |
| `pages[i].asBrowser().snapshot()`, `.click(ref)`, `.type(ref, text)`, `.navigate(url)` … | `browser_*` |
| `version`, `info` at the root | `get_app_info` |
| `main`, `main.windows`, `main.mcp.sessions`, `main.tor.status`, `main.script.execute(code)` | *(new capability — US-1295)* main-process introspection and scripting for developing/testing Persephone; gated by a settings toggle |
| `app.call(path, { args?, value? })` in scripts; `persephone.call(path, …)` in boards | *(new capability — US-1296)* the same path API as a **programmatic** surface. Boards live in an iframe whose only link to the app is a MessagePort carrying JSON envelopes (`board-bridge.ts`), so a path + JSON-args call is exactly the serialisable RPC that boundary needs; today a board can only `execute()` a shell command. Through it a board could open pages with a given editor, read the grouped page, or drive the browser facade — any feature the tree exposes, with the same `restricted()` guards. |
| `helpSearch("<query>")` at the root | *(new capability, in scope now — US-1289)* — full-text search over every descriptor: member names, summaries, signatures, `help` text, and the current `children()` summaries. Returns `[{ path, kind, matchedLine }]`, e.g. `"add rows"` → `pages[1].asGrid().addRows — addRows(count = 1, insertIndex?)`. The walk uses only `members` and `children()`, so it is side-effect free by construction, and it ranks instance paths (a real grid page) above kind-level paths. Solves the "I know what I want but not where it lives" case that otherwise takes several probing calls. |

Two consequences for the current tasks: US-1289's root descriptor lists `windows`, `guides`,
`tools`, `script`, `pipe` and `helpSearch` from the start (US-1292 fills them; `pipe` is `io` from the script API
under a name that reads as a noun in a path), and US-1290's tool description is written as the
*only* description an agent might ever read — examples and top entries, not a pointer to a guide.

## Architecture sketch

**Where the root lives.** Everything under a window is renderer knowledge and resolves through the
existing wrappers. The `windows` collection is **main-process** knowledge (`openWindows`). So the
main-side tool handler does the first step itself: it parses an optional leading `windows[i]`,
serves `windows`, `windows[i]` and their `children()` directly, and forwards the *remainder* of the
path to that window's renderer with the matching `windowIndex`. An explicit `windowIndex`
parameter is still accepted for parity with other tools; a `windows[i]` prefix in the path wins.
Closed windows produce the same guidance the other tools give ("open it first").

**The `main` node (US-1295).** Today an agent can see only the renderer. For developing and testing
Persephone itself — a stated goal — the agent also needs to look into the main process: which
windows and MCP sessions exist, what the Tor service, board protocol, download service, network
logger and version service report, and occasionally to run a snippet there. `main` is a root node
served entirely by the main process, with the same `IAiVisible` descriptors (hence the shared
types). Its children are a curated set of read-mostly service views — not the raw module graph —
plus `main.script.execute(code)`, which evaluates code in the main process with `electron`,
`openWindows` and the service singletons in scope, like `script.execute` does for the renderer.
Two guards: a Settings toggle (default **off** outside dev mode) because an uncaught error in the
main process is fatal to the whole app, and the same `caution` marking every mutating member gets.
Privilege-wise this is parity — the renderer already runs with `nodeIntegration: true` — but the
blast radius of a mistake is larger, hence the toggle.

```
src/renderer/scripting/ai-vision/
  types.ts            IAiVisible, IAiVisionDescriptor, IAiMember, registerAiVision()
  path-parser.ts      string → segment list (identifier | index | call | $help); errors name the offset
  resolver.ts         walks the live tree from a ScriptContext root, awaiting each hop; applies
                      args/value; builds hint and error envelopes
  result-shaper.ts    summarise / truncate / depth-cap
  root.ts             the virtual root node (AppWrapper members + `page` alias)
src/renderer/api/mcp/call-command.ts     handlePersephoneCall → creates a ScriptContext, resolves,
                                          releases (same lifecycle as handleExecuteScript)
src/main/mcp/tools/call-tools.ts          call tool definition; per-session hint dedupe
```

Descriptors are declared **inside** each wrapper/facade file as a `readonly aiVision` property, so
adding a method to a facade and forgetting its descriptor is visible in the same diff.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| [US-1289](../tasks/US-1289-ai-vision-core/README.md) | AiVision core: interface, path parser, resolver, result shaping, root + `pages` + `page` descriptors, `helpSearch(query)` over the descriptor graph | Complete |
| [US-1290](../tasks/US-1290-call-tool-windows/README.md) | `call` MCP tool: main-side definition incl. the optional `windows[i]` prefix and the `windows` node, renderer command, per-session hint dedupe, overview/scripting guide updates | Complete |
| [US-1291](../tasks/US-1291-facade-descriptors/README.md) | Descriptors for every editor facade (`as*` methods, text, grid, notebook, link, markdown, svg, html, mermaid, graph, draw, image, browser, mcp-inspector) | Complete |
| [US-1292](../tasks/US-1292-app-namespaces/README.md) | Descriptors for the `app` namespaces: `fs`, `settings`, `ui`, `shell`, `window`, `proc`, `boards`, `boardVars`, `editors`, `recent`, `downloads`, `menuFolders`, with `caution` on destructive and user-visible members | Complete (live-verified) |
| [US-1293](../tasks/US-1293-call-evaluation/README.md) | Evaluation with the `mcp-test-agent` skill (haiku): scenario set run twice — once with the full tool set, once with `call` alone — add the tool to the skill's allow-list, and write the go/no-go recommendation for the consolidation epic | Complete — **go**, see [run log](../../qa/runs/2026-09-05-epic-083-call-vs-tools.md) |
| US-1294 | *(optional)* Generate `members`/`help` from `src/renderer/api/types/*.d.ts` JSDoc at build time | **Declined** — recommendation, see notes 2026-09-05 |
| [US-1296](../tasks/US-1296-programmatic-call/README.md) | Programmatic surface: `app.call(path, options)` in the script API and a `call` envelope on the board bridge (`persephone.call`) — hints off by default, results JSON-only, same guards; trusted Boards use the full AiVision tree with the resolver's `restricted()` guard | Complete (live-verified) |
| [US-1295](../tasks/US-1295-main-node/README.md) | Main-process node: `main` with curated service descriptors (windows, MCP sessions, Tor, boards protocol, downloads, network log, runtime) and `main.script.execute(code)` behind a settings toggle | Complete (live-verified) |

Task documents are written per task via `codex-dev` when the task starts; US-1289 leads because
everything else depends on its types. US-1291 and US-1292 are independent of each other and can run
in parallel once US-1289 lands. US-1295 depends on US-1290 (it extends the main-side handler that
already serves `windows`) and can run alongside US-1291/US-1292. US-1293 closes the epic and is the acceptance test for the whole
idea — if a haiku-class agent cannot complete the scenario set with `call` alone, the
epic has not met its goal regardless of code landed.

## Acceptance criteria (epic level)

- `call` with `path: ""` returns the root member list; an agent with no guide can reach
  the active page's content, activate another page, and add rows to a grid page using only hints.
- An unknown member returns the parent's member list and no exception text.
- Reading any `$help`, member list, or `children()` has no side effects (verified for `grouped`).
- An incognito or Tor browser page exposes no `url` in any summary, and every browser member under
  it is refused with the same message the `browser_*` tools give today.
- The `mcp-test-agent` scenario set passes with the new tool at least as often as with the
  existing tool set, on the same model.
- The scripting guide and `overview` guide route "simple reads/actions" to `call` and
  "anything else" to `execute_script`.

## Concerns / Open questions

- **Bridge timeout.** `sendToRenderer` times out at 30 s; a call that triggers a long facade
  operation (large file open) inherits that. Acceptable for MVP; note it in the hint for such members.
- **Name collision.** `$help` is not a valid JS identifier so it cannot collide with a real member.
  Any other reserved segment must follow the same rule.
- **Path parser surface.** JSON-literal args inside `()` reintroduce escaping. The mitigation is
  documentation (hint text says "use `args` for anything non-trivial") plus a parser error that
  names the offset. Do not grow the grammar beyond this.
- **Retiring tools.** The goal is eventually all of them (see *Long-term direction*), but external
  clients, the `mcp-test-agent` skill and every guide depend on the current names. Nothing is
  removed in this epic; US-1293 produces the evidence and the consolidation epic does the removal
  with a deprecation period.
- **Browser tools through pages.** `browser_*` targets pages by several strategies (active browser
  page, board, app window) and manages a ref lifecycle across calls. Mapping that onto
  `pages[i].asBrowser().*` needs the same target resolution and ref store; it is a design task in
  the consolidation epic, not a descriptor-writing task here.
- **Main-process scripting.** An exception in `main.script.execute` must be caught and returned,
  never allowed to reach the main process's unhandled-rejection path. Long-running or blocking code
  there freezes every window; the bridge timeout does not protect against it. The settings toggle
  and the `caution` text are the mitigation; US-1295's task document must spell out the try/catch
  and timeout shape.
- **Boards calling into the app (US-1296).** A board currently reaches the app only through
  `execute()` (a shell command in the board's folder) and a few bridge effects. `persephone.call`
  would hand it pages, fs, shell and the browser facade directly. Boards are trusted at open time,
  so this is privilege parity with `execute()`, but the surface is much larger and easier to misuse;
  US-1296 must decide between "trusted board = full tree" and a manifest-declared capability list
  (e.g. `"call": ["pages", "page"]`) enforced by the resolver as a `restricted()` on the root.
  Worked example (user, 2026-09-05): a **regex test tool** board — the user types a pattern in the
  board, the board reads `page.grouped.content` (the text page grouped beside it), runs the regex,
  and shows matches; `page.grouped.content` with `value` could write the result back. This fixes
  one requirement: for a board, the root's `page` must be bound to the **board's own page** (the
  bridge knows which page hosts the board), not the active page — otherwise the board reads the
  wrong neighbour the moment the user clicks another tab. `AiRoot` already takes its root object
  from the caller, so the bridge passes a root whose `page` is the hosting page. The example also
  needs only `page` (and `page.grouped`), which is the case for the manifest capability list.
- **Descriptor completeness.** Nothing enforces that every public wrapper member has a descriptor
  entry. Co-locating descriptors in the wrapper file is the mitigation; a lint rule is out of scope.

## Notes

### 2026-09-05
- Epic created from the user's proposal (single `call` tool, path parameter, hints with
  a skip flag, an "AiVision" tree with parent links and `ai-info`). Changes from the proposal, all
  agreed in discussion: mirror script-API names instead of `page(s)`/`editor.text`; `$help` instead
  of `ai-info`; `args`/`value` parameters instead of content inside the path; server-side hint
  dedupe with `hints: "never"` as the manual override.
- User correction, same day: the tree is dynamic, so a purely static member list is not enough —
  but `grouped`-style getters must still be protected. Resolution: two-part descriptors. `members`
  is static and kind-level; `children()` is implemented by each object to enumerate what exists
  under it right now, so the parent discovers children by asking them through the interface rather
  than the resolver probing getters. Design decision 4 rewritten.
- User, same day: the long-term goal is to replace **all** MCP tools with this one (browser tools
  possibly kept, but also reachable through the hosting page's path). Recorded as *Long-term
  direction*; this epic removes nothing, but the root layout and the tool description are now
  written with that end state in mind.
- User, same day: two more path ideas recorded in the table — `script.execute()` as the shape of
  the scripting escape hatch, and `pipe["<href>"].readText()` / `.readBinary()` as a read-anything
  entry over the content pipeline (https, archive, mneme, future providers). `pipe` and `script` are
  reserved at the root now.
- User, same day: `helpSearch(query)` at the root — search the hint/help graph and return matching
  paths with the matched line. Added to US-1289's scope since it reuses the resolver's safe walk.
- User, same day: the tool is named `call`, not `persephone_call` — MCP clients already prefix
  tools with the server name. The tool description must carry the "this is Persephone" context
  itself, since the bare name says nothing on clients that show unprefixed names.
- US-1289 implemented by Claude the same day (pattern-setting task; Codex follows it from US-1291).
  Verified live over MCP: root, `pages`, `pages[i]`, `pages["<id>"]`, `$help`, unknown-member
  self-correction, `value` assignment + writable check, `maxLength` truncation, `helpSearch`, and
  that hints never create a grouped page. The `call` tool shipped minimal (no `windows[i]` prefix
  yet) so the tree is testable; US-1290 finishes it.
- US-1290 also implemented by Claude (first main-process node = the pattern for US-1295): `windows`
  resolved in main against `MainAiRoot` with the shared resolver; deeper paths forwarded to the
  window's renderer with the prefix re-applied to reported paths; guides and server instructions
  now lead with `call`.
- User, same day: first a dev-only constant to let the agent access incognito/Tor pages for
  testing; then the better design — mark who opened the page, and let agents access private pages
  they opened themselves, in release too. The constant was replaced before commit; see Design
  decision 7, *Provenance rule*. Landed alongside US-1290.
- US-1291 delegated to Codex (task document reviewed by Claude: inventories verified against all 13
  facades; one must-fix — a "regression test" fallback removed). Live-verified through `call`:
  `asGrid(true)` switches and summarises, `addRows` via `args`, `helpSearch("add rows")` returns
  `pages[3].asGrid().addRows()`, non-grid `asGrid()` returns the facade's own error. Found and fixed
  in passing: MCP clients JSON-parse `value`, so an array landed in `content`'s setter — the resolver
  now reports the value type and tells the agent to pass text as a string.
- User, same day: the path API should also become a programmatic Persephone API — `app.call` in
  scripts and `persephone.call` inside boards, so a board can use any app feature. No change to the
  implemented code (the resolver is root-agnostic and JSON-in/JSON-out by design); added as US-1296
  with the board-permission question recorded under Concerns.
- User, same day: paths may start with `windows[i]`; the prefix is optional and defaults to the
  main window. Consequence recorded under *Architecture sketch*: the `windows` node is served by
  the main process, which strips the prefix and forwards the rest to the right renderer.
- User, same day: agents currently see only the renderer; for developing and testing Persephone the
  agent should be able to inspect parts of the main process and run scripts there. Added US-1295
  (`main` node + `main.script.execute`, settings-gated). Consequence: the AiVision types move to
  `src/shared/ai-vision/` so both processes implement one interface.
- User, same day: incognito and Tor browser pages must stay blocked exactly as the current tools
  block them. Recorded as Design decision 7 and as an epic acceptance criterion.
- User asked whether a `discoverable` property on the interface is needed for this, leaving the
  decision to me. Decided: `restricted?(): string | undefined` on the descriptor instead — the node
  stays listed, everything under it is refused with the returned text, the resolver enforces it.
  Reasoning in Design decision 7; the same hook gates `main.script` (US-1295).
- Interface over base class, and not the trait system's `Traited` wrapper — reasoning in Design
  decision 1.
- US-1292 delegated to Codex (plan reviewed by Claude). The reviewed correction that mattered:
  `helpSearch` must not read every uncautioned property — `Page.content` holds a whole file and the
  safety guarantee would have rested on authors remembering `caution` — so traversal is an explicit
  opt-in, `IAiMember.node`. During implementation that surfaced its own conflict: the root's `fs`,
  `shell` and `proc` entries carry `caution`, which would have made them unreachable. Resolved by
  separating the two ideas: `node: true` says *reading this property is safe*, `caution` says *what
  its members do*. The app namespaces are described in `scripting/ai-vision/namespaces/` and
  attached with a new instance-keyed registry (`registerAiVisionFor`), because `proc` and `boards`
  are object literals that cannot carry an `aiVision` property or be keyed by constructor.
  Live-verified: `settings`, `fs.exists`, `shell.version.runtimeVersions()`, `ui.log` refused with
  the member list, and `helpSearch("read file")` reaching `fs.readFile`.
- US-1295 delegated to Codex (plan reviewed by Claude). Two must-fixes in review: the plan wanted a
  final-node `restricted()` check in the shared resolver so `main.script` would answer with the
  refusal — that would have broken decision 7's requirement that a user's private browser page stay
  *summarisable* at `pages[i]`, so the gate is reported through `MainScriptNode.summarize()`
  instead and the resolver is untouched; and `main.*` was trimmed of everything the renderer tree
  already exposes (`main.downloads` is read-only, `main.boards.published` dropped, `main.version`
  merged into `main.runtime`) — two paths to one action is the confusion this epic exists to
  remove. The settings gate is a renderer-owned `main.scripting.enabled` key mirrored into main
  over IPC, following the `mcp.enabled` precedent, defaulting to `!app.isPackaged`. Live-verified
  both ways: with the toggle off `main.script.execute` is refused while `$help` still answers and
  the node reports `enabled: false`; with it on, `execute` runs code, captures `console.log`, and
  returns `isError: true` for a throw instead of escaping to the unhandled-rejection path.
  `windows[0].main` is rejected in main with guidance to use the root path.
- US-1296 delegated to Codex (plan reviewed by Claude). Review removed two thirds of the plumbing:
  main already holds the board's `hostWebContents`, so a `WebContents` → window-index lookup feeds
  the existing `sendToRenderer` instead of a second transport; and `pagesModel.findPage(id)` already
  matches *any editor id*, so the board's hosting page is found from the `ownerId` main already
  stores — no IPC signature change at all. Trusted board = full tree (a trusted board already has
  `execute()`), enforced at the root's `restricted()`, and a board is subject to the same
  descriptor guards as MCP, so it cannot read the user's private browser pages either.
  Live-verified with the regex board in `assets/board-call-regex/`: it reads `page.grouped.content`,
  matches, and writes the result back. Page affinity was proven with the board's page *inactive* —
  a timer-triggered call still resolved `page.grouped.title` to its own host's neighbour. Trust
  revocation could not be exercised end-to-end because untrusting unmounts the webview; the guard
  is verified by inspection.
- US-1293 run (2026-09-05, haiku, four scenarios, twice): `call` alone completed 4/4 in 14 calls
  with no guide, no errors and no guessing; the full tool set completed 4/4 in 9 calls but produced
  the run's only wrong answer (theme `system` instead of `default-dark`, read from a fixed tool's
  payload rather than the live setting). Recommendation recorded: **go** for the consolidation
  epic, on condition that no tool is retired until its replacement path passes the same test, that
  `browser_*` gets its ref-lifecycle design first, and that removal goes through a deprecation
  period. Log: `qa/runs/2026-09-05-epic-083-call-vs-tools.md`.
- US-1294 (generate descriptors from `.d.ts` JSDoc) **declined** — a recommendation, reversible if
  the user disagrees. Writing the descriptors by hand produced exactly the things typings cannot
  express and that make the hints work: "reading it CREATES a grouped page", `node: true`,
  `restricted()`, the deliberate omissions (`downloads.init` as internal, `ui.log` belonging to a
  different `ui`), and prose `help`. A generator would have to be overridden at nearly every
  interesting member, and the drift it protects against is already handled by co-locating each
  descriptor with the code it describes. Not worth the build step.
- **Epic closed 2026-09-05.** All eight tasks resolved (seven implemented, US-1294 declined), the
  completion skills run at epic level by Codex (`/review` PASS with no architecture findings;
  `/document` and `/userdoc` updated the architecture, scripting, board and user-facing docs), and
  `npm run typecheck`, `npm run lint` and `npm run build-prod` green. Summary and the full
  verification ledger: [epics/completed.md](completed.md). Follow-on: the consolidation epic, which
  US-1293 recommends starting under the three conditions recorded there. Left for the user to
  exercise: board trust revocation while mounted, the Settings checkbox wording/placement, packaged
  gate defaults, and the uninterruptible synchronous-loop warning for `main.script`.
