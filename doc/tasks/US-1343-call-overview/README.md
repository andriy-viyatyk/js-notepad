# US-1343 - The `call("")` overview

**Status:** Implemented  
**Epic:** [EPIC-090 - Consolidation: the call-only flag, the two-model gate, and the deletion of thirty-two tools](../../epics/EPIC-090.md)  
**Roadmap:** [The `call("")` overview - the agent's first step](../../agent-transparency-roadmap.md#the-call-overview--the-agents-first-step)

## Goal

Make a bare `call` a useful first discovery action for the EPIC-090 call-only gate. The manifest must
allow the agent to omit `path`, and the resulting empty-path response must put a short, high-level
map of the object-model areas and example paths before the existing root member list.

This task is documentation and design work only at this stage. It does not change the manifest,
resolver, or renderer yet.

## Background

### Why the empty path is the gate entry point

EPIC-090's Overview says the gate starts with an agent that has never seen the deleted tools and has
one discovery entry point: `call` with no path. Decision 1 makes the call-only manifest an
environment-variable gate, so the overview is the first useful context in the reduced manifest
([EPIC-090](../../epics/EPIC-090.md):11-49, 61-78). Decision 7 requires every deleted capability to
be reached from a bare `call`, and a partial caused by a wrong branch must be repaired and rerun
([EPIC-090](../../epics/EPIC-090.md):169-182). The roadmap therefore requires one line per top-level
area, its purpose, and one example path before the ordinary root detail
([agent-transparency-roadmap.md](../../agent-transparency-roadmap.md):341-363).

The dashboard and EPIC-090 already contain the US-1343 link. Per the request, this task does not add
or edit a dashboard entry.

### The manifest and handler already agree on missing `path`

The current tool definition requires `path`:

```ts
// src/main/mcp/tools/call-tools.ts:123-125 - current
path: z.string().describe("Path into the object model, e.g. \"\", \"pages\", ..."),
```

The handler already supplies the runtime behavior when the field is absent. It strips `windowIndex`,
then uses `""` for any non-string `params.path`, including an omitted key
([src/main/mcp/tools/call-tools.ts](../../../src/main/mcp/tools/call-tools.ts):131-134). The renderer
command repeats the same normalization before constructing the resolver request
([src/renderer/api/mcp/call-command.ts](../../../src/renderer/api/mcp/call-command.ts):9-18).
Therefore the schema change is deliberately limited to making `path` optional and describing it as
`omit for the overview`; the main handler and renderer command must not be changed for this
requirement.

The tool description currently tells the agent to "Start with path \"\"" and calls the empty path
"top-level entries" ([src/main/mcp/tools/call-tools.ts](../../../src/main/mcp/tools/call-tools.ts):102-124).
That first sentence must become "Start with no path" and must identify the response as the overview.
The examples may continue to show explicit paths, but the first-step instruction must no longer make
the agent manufacture an empty string.

### Empty path is forwarded to the renderer root

`parsePath` explicitly turns an empty or whitespace-only path into zero segments
([src/shared/ai-vision/path-parser.ts](../../../src/shared/ai-vision/path-parser.ts):32-37).
`routeCallPath` forwards a path when there is no first segment; only `main` and the `windows` branch
are resolved locally ([src/main/mcp/tools/call-tools.ts](../../../src/main/mcp/tools/call-tools.ts):34-64).
Consequently `routeCallPath("")` returns `{ forward: { path: "" } }`, not a `MainAiRoot` result.
The main process sends that request to the selected renderer through the existing IPC bridge
([src/main/mcp/renderer-bridge.ts](../../../src/main/mcp/renderer-bridge.ts):29-70). The renderer
command passes the normalized path to `aiCall`, which creates `AiRoot` and calls the shared resolver
([src/renderer/api/mcp/call-command.ts](../../../src/renderer/api/mcp/call-command.ts):9-19;
[src/renderer/scripting/ai-vision/call.ts](../../../src/renderer/scripting/ai-vision/call.ts):7-35).

The renderer root already advertises both process-owned names in `ROOT_MEMBERS`: `windows` and
`main` are listed there even though `RESERVED_ROOT_NAMES` and the main-side router own their actual
resolution ([src/renderer/scripting/ai-vision/root.ts](../../../src/renderer/scripting/ai-vision/root.ts):28-59;
[src/main/mcp/ai-vision/main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):157-171). This
means the renderer-owned overview can name those areas without pretending to implement them. The
main root remains unchanged: it is still the local owner for `windows`/`main` paths that the router
recognizes, while an empty path is renderer-owned.

### How the current root response is built

The empty path walks zero segments, shapes the `AiRoot` instance, and calls `nodeHint` on the root
([src/shared/ai-vision/resolver.ts](../../../src/shared/ai-vision/resolver.ts):53-70, 163-172). The
root hint is built from the descriptor summary, live children, and - when the kind has not been seen -
the raw `formatMembers` list plus the `$help` pointer
([src/shared/ai-vision/hint.ts](../../../src/shared/ai-vision/hint.ts):38-59). `ROOT_HELP` is not
part of an ordinary hint; it is returned only when the agent calls `$help`, because `buildHelp` adds
the descriptor help separately ([src/shared/ai-vision/hint.ts](../../../src/shared/ai-vision/hint.ts):61-70).

The overview must be added to both paths: `buildHint` places it in the empty-path hint, while
`buildHelp` places it immediately after the descriptor summary and before `ROOT_HELP`. Otherwise
moving common-path sentences out of `ROOT_HELP` would make a direct root `$help` call lose them.

`toCallResult` removes `hint` from the envelope, renders the shaped result as a text block, and then
appends the hint as another plain-text block ([src/main/mcp/tools/call-tools.ts](../../../src/main/mcp/tools/call-tools.ts):233-264).
That rendering order favors putting the map into the root hint: it naturally appears in the same
agent-readable block immediately before `members:` without adding a second result envelope or a new
MCP content-block protocol.

### Source words and safe examples for the map

The map must not invent a parallel vocabulary. The renderer root's 21 advertised members are the
authoritative top-level set ([src/renderer/scripting/ai-vision/root.ts](../../../src/renderer/scripting/ai-vision/root.ts):35-59).
The scalar `version` member is intentionally not a map area: it adds no branch-orientation value
beyond the raw member list. `helpSearch` also is not an area, but it remains as the cross-cutting
escape hatch for a request whose destination is not obvious from any area name. The resulting map
has 20 lines: 19 area branches plus that retained search escape hatch.

The registered namespace descriptors supply the existing purpose words
([src/renderer/scripting/ai-vision/namespaces/index.ts](../../../src/renderer/scripting/ai-vision/namespaces/index.ts):15-48).
The pages and page descriptors provide valid page examples
([src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts):16-53, 97-104;
[src/renderer/scripting/api-wrapper/PageWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts):118-132, 222-229).
The shared dialog adapter exposes safe `buttons` plus the action methods
([src/renderer/scripting/ai-vision/dialogs/shared.ts](../../../src/renderer/scripting/ai-vision/dialogs/shared.ts):6-13),
and the popup-menu descriptor exposes `items`, `click`, and `close`
([src/renderer/scripting/ai-vision/menus/index.ts](../../../src/renderer/scripting/ai-vision/menus/index.ts):17-36).
The main-process descriptor verifies the diagnostics branch
([src/main/mcp/ai-vision/main-services.ts](../../../src/main/mcp/ai-vision/main-services.ts):21-30, 257-276).

Every ordinary example must name a descriptor member without a `caution` flag, and should take no
arguments where an argument-free member exists. This keeps the map scannable and prevents a fresh
agent from treating a caution-carrying action as a suggestion to execute it. `proc` has only the
cautioned `execute` member, so it has no example
([src/renderer/scripting/ai-vision/namespaces/proc.ts](../../../src/renderer/scripting/ai-vision/namespaces/proc.ts):3-12).
Both `boardVars` members can block on setup/unlock or write a secret, so it also has no example
([src/renderer/scripting/ai-vision/namespaces/board-vars.ts](../../../src/renderer/scripting/ai-vision/namespaces/board-vars.ts):3-12).
`shell.version` and `shell.encryption` are uncautioned node properties, while `shell.openExternal`
is cautioned ([src/renderer/scripting/ai-vision/namespaces/shell.ts](../../../src/renderer/scripting/ai-vision/namespaces/shell.ts):3-7).
`settings.theme` and `window.zoomLevel` are cheap, uncautioned properties
([src/renderer/scripting/ai-vision/namespaces/settings.ts](../../../src/renderer/scripting/ai-vision/namespaces/settings.ts):240-243;
[src/renderer/scripting/ai-vision/namespaces/window.ts](../../../src/renderer/scripting/ai-vision/namespaces/window.ts):4-20).
The `pages.logView.push([...])` example is the sole deliberate exception: it is the agent's output
channel, the roadmap requires it to be discoverable, and its write is text on the user's screen
rather than a privileged side effect ([src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts):35-36).

```text
pages - open pages/tabs and the agent output channel; e.g. pages.logView.push([...])
page - the active page and its editor; e.g. page.content
helpSearch - find matching hint/help lines and paths; e.g. helpSearch("add rows")
settings - read or persist application configuration; e.g. settings.theme
fs - read/write files, directories, and OS file integration; e.g. fs.read("path")
ui - dialogs, notifications, progress, locks, and curated controls; e.g. ui.elements
dialogs - inspect and answer open renderer dialogs; e.g. dialogs[0].buttons
menus - inspect and act on the open popup menu; e.g. menus[0].items
shell - URLs, screen capture, encryption, and runtime/update services; e.g. shell.version
window - this window's state, sidebar, zoom, and multi-window actions; e.g. window.zoomLevel
proc - spawn and manage child processes; no safe example - inspect its cautioned member below
boards - local boards and their lifecycle/catalog operations; e.g. boards.list()
tools - search/execute registered Agent Tools and inspect toolsets; e.g. tools.search()
boardVars - administer board environment variables and secrets; no safe example - inspect its cautioned members below
editors - inspect available editors and file-language matches; e.g. editors.getAll()
recent - access recently opened file paths; e.g. recent.files
downloads - inspect and manage download entries; e.g. downloads.downloads
menuFolders - inspect configured sidebar folders; e.g. menuFolders.folders
windows - inspect open/closed application windows; e.g. windows[0].status
main - process-wide diagnostics and gated scripting; e.g. main.runtime
```

This is 20 map lines plus the overview label, targeting roughly 250-350 tokens per empty-path
overview. The map is emitted more often than once per session, so this bound is part of the design:
it remains cheap enough for repeated re-orientation while replacing a fresh agent's need to guess a
branch. The existing root member list remains immediately after it for exact signatures, cautions,
and writable flags.

## Implementation Plan

### 1. Make `path` optional and update the first-step wording

Change only the `call` definition in `src/main/mcp/tools/call-tools.ts`:

```ts
// Before: src/main/mcp/tools/call-tools.ts:104, 124
"... Start with path \"\" to see the top-level entries; every result comes with a hint ...",
path: z.string().describe("Path into the object model, e.g. \"\", \"pages\", ..."),

// After
"... Start with no path to see the overview; every result comes with a hint ...",
path: z.string().optional().describe("Path into the object model; omit for the overview."),
```

Keep the handler's existing `typeof params.path === "string" ? params.path : ""` normalization
unchanged. Verify through the generated MCP schema that the property is optional and through a bare
tool invocation that it reaches the same empty-path branch as `path: ""`.

### 2. Add a root-only overview field to the shared descriptor contract

Update `src/shared/ai-vision/types.ts` beside `help` with an optional, non-result descriptor field:

```ts
// Before: IAiVisionDescriptor
readonly members: readonly IAiMember[];
/** Long-form guidance returned for `<path>.$help`. */
readonly help?: string | (() => string);

// After
readonly members: readonly IAiMember[];
/** Compact first-step map emitted by the empty-path hint and root `$help`, when present. */
readonly overview?: string;
/** Long-form guidance returned for `<path>.$help`. */
readonly help?: string | (() => string);
```

This is metadata consumed by hint formatting, not a property of `ICallResult`; it must not be added
to the JSON result envelope. Other descriptors omit the optional field entirely.

### 3. Emit the overview on every eligible empty-path call

Update `buildHint` in `src/shared/ai-vision/hint.ts`. Put the overview outside the existing
`if (includeMembers)` branch, guarded only by `path === ""` and the descriptor having one. The raw
member list remains inside the dedupe gate:

```ts
// Before: src/shared/ai-vision/hint.ts:53-57
if (includeMembers) {
    const membersText = formatMembers(descriptor.members);
    if (membersText) parts.push(membersText);
    parts.push(`Details: call with path "${path ? `${path}.$help` : "$help"}".`);
}

// After
if (path === "" && descriptor.overview) parts.push(descriptor.overview);
if (includeMembers) {
    const membersText = formatMembers(descriptor.members);
    if (membersText) parts.push(membersText);
    parts.push(`Details: call with path "${path ? `${path}.$help` : "$help"}".`);
}
```

Also update `buildHelp` so a root `$help` call cannot lose the moved orientation prose:

```ts
// Before: src/shared/ai-vision/hint.ts:61-70
const parts: string[] = [`${descriptor.kind} - ${descriptor.summary}`];
const help = typeof descriptor.help === "function" ? descriptor.help() : descriptor.help;
if (help) parts.push(help.trim());

// After
const parts: string[] = [`${descriptor.kind} - ${descriptor.summary}`];
if (descriptor.overview) parts.push(descriptor.overview);
const help = typeof descriptor.help === "function" ? descriptor.help() : descriptor.help;
if (help) parts.push(help.trim());
```

The overview therefore appears on every empty-path call under `hints: "auto"` and `hints: "always"`.
Only `hints: "never"` suppresses it, as an explicit caller choice. It also appears in root `$help`
because that is a separate detail request, and it remains before `ROOT_HELP`. Do not add a new
`ICallResult` field or alter `toCallResult`; the existing hint text block still renders the empty-path
ordering required by the task.

The raw member list alone remains subject to `seenKinds`. `callTools` owns one `seenKinds` set per
MCP server/session, passes its contents into the renderer, and records the returned hint kind after
each call ([src/main/mcp/tools/call-tools.ts](../../../src/main/mcp/tools/call-tools.ts):95-98, 149-187;
[src/renderer/api/mcp/call-command.ts](../../../src/renderer/api/mcp/call-command.ts):9-18).
With default `hints: "auto"`, every bare call contains the map; only the first call in the session
also contains `members:`. `hints: "always"` repeats the map and the member list, while
`hints: "never"` suppresses both. This keeps the raw schema detail deduped without hiding the
orientation surface from later shared-session QA agents.

### 4. Own the map in `AiRoot` and move, rather than delete, root-help prose

Add a `ROOT_OVERVIEW` constant next to `ROOT_MEMBERS` in
`src/renderer/scripting/ai-vision/root.ts`, using the 20 lines above. Attach it as
`overview: ROOT_OVERVIEW` in `AiRoot.aiVision()`.

The renderer root owns the prose because the empty path reaches `AiRoot`, and because `ROOT_MEMBERS`
already names the main-process `windows` and `main` branches. Do not add an overview to
`MainAiRoot`; `routeCallPath` does not send `""` there, and the main root's descriptor only
describes the locally answered `windows` and `main` branches.

Remove the high-level entries that have moved from `ROOT_HELP`'s `Common paths:` section: the
top-level `pages`, active `page.content`, dialog inspection, popup-menu inspection,
`helpSearch("add rows")`, `main`, `tools.search`, and `ui.elements` lines. Keep the next-level
operational prose that is not represented by the one-example-per-area map, including
`pages.logView.push([...])`, editor switching, page-id addressing, tool execution/toolset repair,
`pages[0].tab.highlight(...)`, the `$help` rule, and the argument/value rules. This is a move of
sentences, not a second copy of the old common-path list: the raw `ROOT_MEMBERS` list stays because
the resolver uses it for validation and because it carries signatures, cautions, and writable/node
metadata. The map itself is also present in root `$help` through the `buildHelp` change above, so
agents arriving there through a `helpSearch` hit do not lose the moved orientation text.

### 5. Preserve the standing cross-epic contracts

- **Absent keys:** The overview is plain text, and the optional descriptor field is omitted by every
  non-root descriptor. Do not return an `overview` key in `ICallResult`, do not write
  `{ overview: undefined }` into a call answer, and do not use `null`, `false`, `0`, or `""` as a
  stand-in for missing values. This matters because the existing result shaper treats a raw
  `undefined` value as `null` at
  [src/shared/ai-vision/result-shaper.ts](../../../src/shared/ai-vision/result-shaper.ts):37-39;
  the implementation must avoid creating a new optional result field rather than widening that
  unrelated protocol in this task. Existing namespace code demonstrates conditional omission for
  optional projections ([src/renderer/scripting/ai-vision/namespaces/tools.ts](../../../src/renderer/scripting/ai-vision/namespaces/tools.ts):41-73).
- **Depth:** The map is hint prose and is not shaped through the plain-data result tree. Leave
  `MAX_DEPTH = 8` unchanged; it is the current cap that was raised because `tools.search()` needs a
  JSON Schema at depth five, and the shaper documents that descriptor nodes are protected separately
  ([src/shared/ai-vision/result-shaper.ts](../../../src/shared/ai-vision/result-shaper.ts):10-22,
  52-79). Verify a representative nested result still has no new `depth limit` marker.
- **`strictNullChecks`:** The project does not use a strict-null compiler setting in the repository's
  TypeScript configuration, so review discipline - not the compiler - must preserve absent values.
  This task adds no facade getter and has no absent runtime map fields; optional descriptor metadata
  must be omitted, while genuine empty strings/arrays/booleans in existing facades remain untouched.
- **Example safety:** Every ordinary map example is an uncautioned descriptor member, with no
  arguments where a safe argument-free member exists. `shell.version` and `shell.encryption` are
  uncautioned node properties; `settings.theme` and `window.zoomLevel` are cheap properties. `proc`
  and `boardVars` intentionally have no example because all their members carry cautions. The
  `pages.logView.push([...])` line is the sole deliberate exception because it is the user's visible
  output channel, not a privileged action.

### 6. Verify the discovery and cost behavior

Run the repository's existing checks (`npm run typecheck` and `npm run lint`) after implementation.
Then verify through the MCP surface that:

1. The schema accepts `{}` and describes `path` as optional with "omit for the overview".
2. `{}` and `{ path: "" }` both resolve the renderer root and return the same overview/map content.
3. The overview precedes `members:` in the hint text and contains all 20 map lines, with `version`
   absent and `helpSearch` present as the documented cross-cutting escape hatch.
4. `main` and `windows` are present in the renderer-owned map, while direct calls to those paths
   still use the existing main-process routing.
5. Every default empty call contains the map; the raw member list appears only on the first call
   under `hints: "auto"`. `hints: "always"` repeats both, and `hints: "never"` suppresses both.
6. Root `$help` contains the same map immediately after the summary and before the retained detailed
   rules, with no duplicate moved common-path sentences.
7. No result is truncated by the existing depth cap and no newly introduced absent key is serialized
   as `null`.

The bare-call start and "right branch without a wrong turn" measurement belong to the later
EPIC-090 QA task (US-1347) and gate task (US-1348); this task supplies the discovery surface they
will exercise.

## Concerns

### Resolved design choice: hint text, not a new result block

The map will be extra text prepended to the root hint, represented by an optional
`IAiVisionDescriptor.overview` consumed by `buildHint` for an empty path and by `buildHelp` for the
root `$help` response. A dedicated `ICallResult.overview` field was rejected: it would require
extending the shared result envelope, the main-to-renderer forwarding contract, `ICallEnvelope`, and
`toCallResult`, even though `toCallResult` already appends the hint as a plain-text content block.
Keeping the map in the hint keeps it in the existing agent-readable channel, while deliberately
leaving its repetition independent from the raw root member-list dedupe.

### Resolved ownership and routing boundary

`AiRoot` owns the prose, including names for `windows` and `main`. The main process owns their
resolution, not their first-step map. This is safe because the verified empty-path route has no first
segment and is forwarded; only paths beginning with `main` or `windows` take the main-local branches.

### Map maintenance

The map is intentionally adjacent to `ROOT_MEMBERS` and must be reviewed whenever a root member or
namespace purpose changes. It is an index, not a second member schema: do not add areas that are not
advertised by `ROOT_MEMBERS`, and do not remove raw member summaries needed for resolver validation.
The one-example rule also means the map should not grow into a replacement for per-node `$help`.

### Files that need no changes

The following files were inspected and should remain unchanged for US-1343:

- `src/shared/ai-vision/resolver.ts` - its empty-path walk and `nodeHint` call already provide the
  correct insertion point through `buildHint`.
- `src/shared/ai-vision/result-shaper.ts` - preserve the existing depth cap and result-shaping rules.
- `src/main/mcp/ai-vision/main-root.ts` - local `windows`/`main` ownership and routing stay intact.
- `src/main/mcp/renderer-bridge.ts`, `src/renderer/api/mcp/call-command.ts`, and
  `src/renderer/scripting/ai-vision/call.ts` - missing-path normalization and forwarding already
  work.
- `src/renderer/scripting/ai-vision/namespaces/` and the page/dialog/menu descriptor files - their
  words are source material; no per-namespace members or facades are added here.
- `active-work.md` - the user already added the dashboard entry.
- `qa/` - bare-call scenario rewrites are owned by US-1347 and are not part of this task document.

## Acceptance Criteria

- [ ] `call`'s `path` schema is optional and its schema description contains "omit for the overview".
- [ ] The main `call` handler's existing missing-path default remains unchanged and no alternate
      empty-path normalization is introduced.
- [ ] The tool description says "Start with no path" and no longer instructs the agent to start with
      `path ""`.
- [ ] A bare `call` reaches the renderer `AiRoot`, and its response's first root hint contains a
      compact overview before `members:`.
- [ ] The overview has 20 lines: the 19 selected root areas plus the retained `helpSearch` escape
      hatch; `version` is not in the map. Each ordinary example is uncautioned and argument-free
      where possible; `proc` and `boardVars` have no example; `pages.logView.push([...])` is the
      documented visible-output exception.
- [ ] The overview targets roughly 20 map lines and 250-350 tokens per empty-path response. Under
      `hints: "auto"` and `hints: "always"`, every empty-path call contains it; only `hints: "never"`
      suppresses it. The raw member list remains deduped under `hints: "auto"`.
- [ ] Root `$help` includes the map immediately after its summary and before the retained detailed
      help, so moving high-level sentences out of `ROOT_HELP` does not lose information.
- [ ] The moved high-level `ROOT_HELP` common-path sentences are removed rather than duplicated;
      deeper operational help remains available through `$help`.
- [ ] No new `ICallResult` field or result content block is added; `toCallResult` still renders the
      shaped value followed by the hint block.
- [ ] `MAX_DEPTH = 8` is unchanged, representative nested results are not newly truncated, and no
      new absent key is emitted as `null` or another falsy stand-in.
- [ ] `npm run typecheck` and `npm run lint` pass after implementation.

## Files Changed

| File | Planned change |
| --- | --- |
| `doc/tasks/US-1343-call-overview/README.md` | This investigation and implementation plan. |
| `src/main/mcp/tools/call-tools.ts` | Make the manifest `path` optional, revise its description to "Start with no path", and leave the handler normalization intact. |
| `src/shared/ai-vision/types.ts` | Add optional descriptor-only `overview` metadata. |
| `src/shared/ai-vision/hint.ts` | Emit a descriptor overview on every non-`never` empty-path hint before the member list, independently of member-list dedupe, and include it before long-form root `$help`. |
| `src/renderer/scripting/ai-vision/root.ts` | Add the 20-line root overview, attach it to `AiRoot.aiVision`, and remove the moved high-level `ROOT_HELP` common-path prose. |

