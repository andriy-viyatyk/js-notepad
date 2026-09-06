# US-1345: Retire `read_guide`; move operational prose into `$help`

**Status:** Implemented

## Goal

Make `read_guide` deletable in US-1349 without losing operational knowledge. The twelve focused
MCP resources and `persephone://guides/full` remain registered; this task audits every guide,
moves missing surface-operation sentences into the owning AiVision node's `$help`, and leaves
document-shaped reference material in the resources.

This is a planning and audit task. It does not delete the tool, rewrite `SERVER_INSTRUCTIONS`,
remove the UI highlight recipe, or edit the dashboard.

## Background

### Authoritative decisions

EPIC-090's overview says that the epic's gate starts from a bare `call` and that the overview is
the replacement for the deleted tool descriptions and guide routing ([EPIC-090.md:42-49](../../epics/EPIC-090.md:42)).
Decision 4 is explicit: delete only the `read_guide` tool, retain all
`persephone://guides/*` resources and `persephone://guides/full`, put operational prose in the
owning node's `$help`, and delete a sentence from the guide when it moves ([EPIC-090.md:121-129](../../epics/EPIC-090.md:121)).
The standalone `app.ui.highlightElement` recipe in `mcp-res-ui.md` is a separate US-1349 deletion,
not a `$help` move ([EPIC-090.md:131-133](../../epics/EPIC-090.md:131)).

Decision 8 assigns `read_guide` to US-1345 with the replacement “resources stay; prose in
`$help`”, and requires a bare-`call` scenario that finds an answer without a guide tool
([EPIC-090.md:186-203](../../epics/EPIC-090.md:186)). The roadmap's Tool → path map has the same
replacement ([agent-transparency-roadmap.md:107-123](../../agent-transparency-roadmap.md:107)).

### Verified implementation

- [`guide-tools.ts`](../../../src/main/mcp/tools/guide-tools.ts:1) is the only runtime definition
  of the `read_guide` tool. Its description contains a prose list of twelve names, its schema has
  one local `z.enum` with the same twelve names, and its handler finds a resource by URI and calls
  `readGuideFile`.
- [`server-factory.ts`](../../../src/main/mcp/server-factory.ts:30) currently registers the guide
  tool group, but independently registers each `resourceFiles` entry at
  [`server-factory.ts:37-49`](../../../src/main/mcp/server-factory.ts:37) and the concatenated
  `persephone://guides/full` resource at [`server-factory.ts:52-64`](../../../src/main/mcp/server-factory.ts:52).
  US-1349 removes only the tool-group registration; the resource loop and full-resource
  registration stay unchanged.
- [`manifest.ts`](../../../src/main/mcp/manifest.ts:87-160) owns the twelve resource records. The
  records are the following files and URIs: `overview`, `ui-push`, `pages`, `scripting`, `graph`,
  `notebook`, `links`, `boards`, `tools`, `ui`, `ui-editors`, and `browser` under
  `persephone://guides/`.
- [`readGuideFile`](../../../src/main/mcp/manifest.ts:162-176) is shared by the tool and the
  resource callbacks. `server-factory.ts` calls it for every focused resource and again for every
  file when serving `full`; its mtime cache is therefore resource-serving code, not tool-only code,
  and stays after US-1349.
- [`buildHelp`](../../../src/shared/ai-vision/hint.ts:63-75) renders a descriptor's `overview`,
  `$help`, members, and live children. A `$help` edit is therefore discoverable from the existing
  `call` hints without a new tool or renderer protocol.
- [`ROOT_HELP`](../../../src/renderer/scripting/ai-vision/root.ts:83-113), the namespace help
  descriptors, and the editor-facade help strings are the current owners of operational prose.
  [`main-services.ts`](../../../src/main/mcp/ai-vision/main-services.ts:83-94) already owns the
  main-process scripting contract; it is not a second guide reader.

### Coordination boundaries

- US-1344 owns the four script globals (`app`, `page`, `io`, `ai`) and their new `script` node.
  This document records the scripting-guide sentence family as “US-1344 owns this” and does not
  propose a second copy in another node.
- US-1349 owns the `SERVER_INSTRUCTIONS` rewrite, the `read_guide` deletion, its
  `server-factory.ts` registration removal, and deletion of the standalone highlight recipe.
- `call-tools.ts` is US-1343's completed overview work. It is not changed here.

## Per-guide audit

The classifications are:

- **Covered** — the current descriptor already supplies the operational sentence through `$help`,
  a member summary, or a live child; do not duplicate it.
- **Move** — add the concrete sentence below to the named descriptor and remove that sentence
  family from the guide in the same implementation change. A short `$help` pointer may remain in
  the resource; the operational prose may not remain twice.
- **Resource-only** — the material is a durable format, catalog, authoring reference, example, or
  one-time orientation document. Keep it in the resource and do not inflate a node's help with it.
- **Retire/rewrite** — the prose names a tool or recipe that US-1349 removes; replace it with the
  call path or delete it under the owning task. It is not silently preserved as if the old tool
  still existed.

| Guide file and sentence family | Current `$help` owner and finding | Missing or stale content | Decision and exact destination |
|---|---|---|---|
| [`mcp-res-overview.md`](../../../assets/mcp-res-overview.md:1), mental model (`main`, windows → pages → editors, browser pages, boards, app window) | `ROOT_HELP` and the root members already explain live paths, `main`, pages, `window.screen`, boards, and the script/call relationship ([root.ts:29-113](../../../src/renderer/scripting/ai-vision/root.ts:29)). | The guide's task → tool table still names retiring tools and says to read guides before them. | **Retire/rewrite** the old tool rows to call paths and `$help`; keep the short mental model as **resource-only orientation**. Do not duplicate it in root help.
| [`mcp-res-overview.md`](../../../assets/mcp-res-overview.md:30), bare-call discovery and hint routing | Root `overview`, `ROOT_HELP`, `buildHint`, and `buildHelp` already expose this behavior ([hint.ts:29-75](../../../src/shared/ai-vision/hint.ts:29)). | No operational gap found. | **Covered**; the resource may keep a pointer to `call` and `$help`, but not a second long explanation.
| [`mcp-res-ui-push.md`](../../../assets/mcp-res-ui-push.md:1-165), flat entry schema, output types, six dialog types, IDs, and result fields | `LogViewEditorFacade.LOG_VIEW_HELP` already carries the normalized entry contract and all dialog usages ([LogViewEditorFacade.ts:42-53](../../../src/renderer/scripting/api-wrapper/LogViewEditorFacade.ts:42)). `pages.logView` is already routed by `PAGES_HELP` ([PageCollectionWrapper.ts:55-71](../../../src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts:55)). | The guide describes the retired blocking `ui_push` behavior and its window/timeout semantics, while the call replacement is non-blocking and returns IDs. | **Move** the replacement behavior to `LogViewEditorFacade.LOG_VIEW_HELP`; rewrite the guide's tool-specific examples to `pages.logView.push` and retain the entry tables/examples as **resource-only reference**.
| [`mcp-res-pages.md`](../../../assets/mcp-res-pages.md:1-80), reading text/image/non-text pages and opener choice | `PAGES_HELP`, `PAGE_HELP`, and the editor facade members cover page identity, content, editors, grouped pages, and browser/file openers ([PageCollectionWrapper.ts:55-80](../../../src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts:55)). | The guide's old `get_page_content`, `set_page_content`, and `create_page` routes become stale when US-1349 deletes those tools. | **Retire/rewrite** those references to `pages[i].content`, assignment via `value`, `pages.addEditorPage`, and `pages.openFile`; no duplicate long prose in `$help`.
| [`mcp-res-pages.md`](../../../assets/mcp-res-pages.md:145-205), editor IDs, required languages, title suffixes, and structured-page creation | `editors` describes registered editor capabilities, but `PAGES_HELP` does not state the required-language/suffix rule. | An agent using only `call` can discover an editor but still miss that `md-view` needs `markdown`, structured editors need their language, and suffixes enable switch buttons. | **Move** the concise creation rule to `PageCollectionWrapper.PAGES_HELP`; keep the complete table and examples in the resource as **resource-only reference**.
| [`mcp-res-pages.md`](../../../assets/mcp-res-pages.md:260-321), parse/render verification and grouped output | `PAGE_HELP` mentions content and grouping but not that raw content success is not render success ([PageWrapper.ts:135-144](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts:135)). | The JSON parse/render failure distinction and `window.screen.snapshot()` verification are operationally needed after the old page tools disappear. | **Move** the verification sentences to `PageWrapper.PAGE_HELP`; leave the longer examples in the resource behind a `$help` pointer.
| [`mcp-res-pages.md`](../../../assets/mcp-res-pages.md:206-259), REST Client JSON root, request fields, body types, and title suffix | `REST_CLIENT_HELP` already covers copied requests/responses, mutations, and the real-service caution ([RestClientEditorFacade.ts:83-131](../../../src/renderer/scripting/api-wrapper/RestClientEditorFacade.ts:83)). | The concise creation contract (`type`, unique request id, collection, body-type choices, and `.rest.json` suffix) is not in the facade help. | **Move** the concise REST creation/operation sentences to `RestClientEditorFacade.REST_CLIENT_HELP`; keep the full field table and example as resource-only reference.
| [`mcp-res-scripting.md`](../../../assets/mcp-res-scripting.md:1-31), execution/security/globals/timeout/result contract | US-1344 owns the new `script` node and explicitly absorbs this sentence family, including globals, privileges, timeout, dialogs, results, TypeScript, Node.js, errors, and side effects ([US-1344 README:188-204](../US-1344-script-execute/README.md:188)). | No second owner may be invented here. | **US-1344 owns this**. US-1345 must verify that the future `script.$help` covers it and must not edit or duplicate the four-global sentences.
| [`mcp-res-scripting.md`](../../../assets/mcp-res-scripting.md:32-180), `app.call`, pages, fs, settings, UI, shell, window, editors, recent, downloads | `PAGES_HELP`, namespace `$help`, editor descriptors, and the now-landed `SCRIPT_HELP` cover the live operation paths. `app.call` exists only inside a running renderer script; it is not a root `call` path. | `SCRIPT_HELP` already owns globals, privileges, timeout, results, `maxLength`, and dialogs, but does not yet state that script-side `app.call` is renderer-only, bounded, takes `args` or `value`, and never returns hints. | **Move** the concise `app.call` contract to `SCRIPT_HELP` in `src/renderer/scripting/ai-vision/root.ts`; do not put it in `ROOT_HELP`. Remove the duplicate `app.call` operational paragraph from the guide, leaving examples only where they are resource-only.
| [`mcp-res-scripting.md`](../../../assets/mcp-res-scripting.md:245-347), editor facades | Graph, notebook, and browser facades already have substantial help; notebook and graph explicitly own the query/edit boundary ([GraphEditorFacade.ts:110-128](../../../src/renderer/scripting/api-wrapper/GraphEditorFacade.ts:110), [NotebookEditorFacade.ts:59-81](../../../src/renderer/scripting/api-wrapper/NotebookEditorFacade.ts:59)). Link help is only a two-sentence summary ([LinkEditorFacade.ts:17-18](../../../src/renderer/scripting/api-wrapper/LinkEditorFacade.ts:17)). | The link snapshot/projection and no-confirmation mutation behavior is missing from `$help`; browser wait/ref lifecycle is already owned by the current member summaries and `BROWSER_EDITOR_HELP`, as confirmed in the browser rows below. | **Move** only link behavior to `LinkEditorFacade.LINK_EDITOR_HELP`; do not add browser prose. Format specifications remain resource-only under their dedicated guides.
| [`mcp-res-notebook.md`](../../../assets/mcp-res-notebook.md:1-175), NoteItem JSON and NoteContent schema | `NotebookEditorFacade` covers live notes, filters, mutation methods, embedded editor metadata, and attached/detached absence semantics. | No safe compact `$help` equivalent exists for every required JSON field and nested content example. | **Resource-only**. Keep the JSON contract and examples in the resource; keep API behavior in the existing facade. No move.
| [`mcp-res-links.md`](../../../assets/mcp-res-links.md:1-106), LinkItem JSON, categories, tags, and examples | `LinkEditorFacade` members cover live operations, but its help needs the snapshot/projection sentence identified above. | Full format and examples are document-shaped; the API projection sentence is missing. | **Move** only the API projection sentence to `LinkEditorFacade`; keep the LinkItem schema/examples **resource-only**.
| [`mcp-res-graph.md`](../../../assets/mcp-res-graph.md:1-230), graph JSON, node/link/options schema | `GraphEditorFacade` help covers query, selection, group operations, and the fact that edits go through `page.content`. | The complete graph format/defaults are too large and stable as a document; no descriptor needs the full schema. | **Resource-only** for format/examples. The existing graph API `$help` is the operational replacement.
| [`mcp-res-boards.md`](../../../assets/mcp-res-boards.md:1-611), local/published lifecycle, trust, reload, secondary views, theme, vendoring, and testing | `describeBoards.help` covers local list/open/trust routing ([boards.ts:55-58](../../../src/renderer/scripting/ai-vision/namespaces/boards.ts:55)); `BoardEditorFacade.BOARD_HELP` covers trust, reload, frames, snapshots, and secondary views ([BoardEditorFacade.ts:70-101](../../../src/renderer/scripting/api-wrapper/BoardEditorFacade.ts:70)). | The published-catalog sequence and the distinction between discovery, download/install, review, and trust are not in the namespace help. The guide also names retiring board tools and `browser_*`. | **Move** the short published lifecycle to `describeBoards.help`; **retire/rewrite** old tool names to `boards.*` and `pages[i].editor.*`. Keep the detailed authoring/theme/integration recipes **resource-only**.
| [`mcp-res-tools.md`](../../../assets/mcp-res-tools.md:1-213), search/execute workflow, stdin/result marker, `.env`, manifest schema, self-repair | `tools` `$help` already covers empty/ranked/select search, result markers, `env` name-only behavior, failure repair, refresh, trust, and `registered:false` ([tools.ts:217-239](../../../src/renderer/scripting/ai-vision/namespaces/tools.ts:217)). | The guide uses the retiring `search_tools` route and must not teach an agent to call it after US-1349. | **Covered** for behavior; **retire/rewrite** route names to `tools.search()`/`tools.execute()` and keep the manifest schema, language examples, and portability prose **resource-only**.
| [`mcp-res-browser.md`](../../../assets/mcp-res-browser.md:1-86), browser/board/app-window hosts and opener targeting | `PageCollectionWrapper` already states that `openUrlInBrowserTab` returns a page id before the document is ready and that the caller must wait for expected content ([PageCollectionWrapper.ts:42-44](../../../src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts:42)). `BoardEditorFacade` and `WINDOW_SCREEN_HELP` own their host-specific paths. | No opener/readiness gap remains in `$help`; adding another version to `BROWSER_EDITOR_HELP` would duplicate the existing member summary. | **Covered**. Rewrite only stale guide routing/examples to call paths; do not add a second opener explanation.
| [`mcp-res-browser.md`](../../../assets/mcp-res-browser.md:87-216), snapshots, refs, waits, privacy, errors, and old-tool equivalence table | The `waitForNavigation` member summary already says it waits for the document loaded right now, is not a navigation detector, may return against an already-complete old document, and recommends `waitFor({ selector })` / `waitFor({ text })` ([BrowserEditorFacade.ts:57](../../../src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts:57)). `BROWSER_EDITOR_HELP` already covers explicit refs and CSS-selector arguments ([BrowserEditorFacade.ts:78-88](../../../src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts:78)); `WINDOW_SCREEN_HELP` covers private app-window restrictions ([window-screen.ts:6-25](../../../src/renderer/scripting/ai-vision/namespaces/window-screen.ts:6)). | EPIC-090 decision 9 confirms no runtime change: the two-phase wait remains inside `navigate()`, and the member's existing documentation is the owner. The old equivalence table becomes false after deletion; detailed ref/error prose remains document-sized. | **Covered** for wait semantics; **resource-only/rewrite** for the detailed reference. Remove the stale old-tool table and do not add a differently worded `waitForNavigation` explanation. If implementation moves the remaining browser-page privacy/ref-lifetime sentence, it must stay within the help-size budget below.
| [`mcp-res-ui.md`](../../../assets/mcp-res-ui.md:1-228), shell anatomy, selectors, settings and page/sidebar purpose | `ui.elements`, `window.screen`, `settings.sections`, `settings.highlight`, `PagePanelsNode`, and `WINDOW_SCREEN_HELP` already own live controls and their purpose ([ui.ts:43-46](../../../src/renderer/scripting/ai-vision/namespaces/ui.ts:43)). | No operational `$help` gap found for the named controls; the guide's user-facing anatomy is more useful as a document. | **Covered/resource-only**: keep the anatomy and selector catalog as a resource; do not duplicate it in `ui.$help`.
| [`mcp-res-ui.md`](../../../assets/mcp-res-ui.md:230-307), standalone `app.ui.highlightElement` recipe | The call replacement is `<node>.highlight(name, message)` and was exercised by earlier epics. | The recipe intentionally points at the retiring script path. | **US-1349 deletes outright**. Do not move it to `$help` and do not edit it in US-1345.
| [`mcp-res-ui-editors.md`](../../../assets/mcp-res-ui-editors.md:1-301), user-facing editor catalog and opening routes | Editor descriptors expose API operations; they do not own a user-facing catalog of every editor's capabilities. | None: putting this catalog into every facade would make `$help` noisy and still would not replace its user-oriented explanations. | **Resource-only**. Keep the catalog and update only stale references to retiring tool names if the deletion task requires it.

### What `mcp-res-overview.md` becomes

After this epic, `mcp-res-overview.md` is a short start-here resource: it gives the mental model
(`windows → pages → editors`, browser pages, boards, and the app window), tells a new agent to
start with `call` at path `""`, and points from the resulting hints to node `$help`. It is no longer
a task → tool → guide routing table and must not list deleted tools or tell an agent to call
`read_guide`. Focused resources remain optional document references for formats and authoring
work; live operation discovery belongs to bare `call` and the node help it exposes.

## Concrete `$help` edits

These are the exact sentences the implementation should add. Each sentence is assigned to the
descriptor that owns the behavior, not to a generic guide node. In each case the implementation
removes the corresponding operational sentence family from the guide in the same change and leaves
at most the stated pointer; full JSON schemas, catalogs, and examples remain in resources.

### `$help` size budget

Keep each descriptor's help body at or below 40 nonblank source lines and approximately 600 words,
excluding the separately rendered member summaries and live children. This is a ceiling for the
help body, not a target: operational safety, return-shape, omission, timeout, and verification
sentences stay; examples, exhaustive format tables, catalogs, and long error matrices stay in the
resource. In particular, `LOG_VIEW_HELP` must not grow by embedding all generated `DIALOG_SPECS`
usage examples in the rendered help; keep those examples in `mcp-res-ui-push.md` and retain only
the concise entry/dialog contract in `$help`. `SCRIPT_HELP` receives only the concise `app.call`
contract above and remains below the ceiling. Browser help receives no new wait prose and remains
below the ceiling. If any other destination would exceed the ceiling, cut examples and reference
tables first and leave them in the resource; never cut the operational sentence that makes the
replacement discoverable or safe.

### `SCRIPT_HELP` — script-side `app.call`

File: [`src/renderer/scripting/ai-vision/root.ts`](../../../src/renderer/scripting/ai-vision/root.ts),
descriptor constant `SCRIPT_HELP`, which is the execution contract for `script.execute`.

Before:

```ts
The call resolver may cut long result text or a console argument at maxLength (20,000 by default).
Raise call's maxLength to return the rest. For detailed API operations, use the app and page paths
and their descendants; use helpSearch when you need to discover another path. This help is the
execution contract for script.execute.
```

After (append to `SCRIPT_HELP`, after its existing `maxLength` and dialog sentences):

```ts
Inside a renderer script, app.call(path, options?) resolves the renderer tree only; it cannot
resolve the MCP router's main.* or windows[i].* paths. It returns a bounded plain value, accepts
args or value (not both), and never returns hints or resolver metadata.
```

Remove the equivalent operational paragraph from `mcp-res-scripting.md`; the guide may keep one
pointer: “For the script-side call seam, inspect `script.$help` and use `app.call(path)` inside
`script.execute`.” `ROOT_HELP` must not gain these sentences because `app.call` is not a root
`call` path.
### `PAGES_HELP` — creation constraints and Log View window scope

File: [`src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts`](../../../src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts),
descriptor constant `PAGES_HELP`.

Before:

```ts
Create pages with addEmptyPage(), addEditorPage(...) or openFile(path).
```

After:

```ts
Create pages with addEmptyPage(), addEditorPage(...) or openFile(path). For a non-monaco editor,
pass the editor's required language; structured pages also need the documented title suffix when
the editor-switch button depends on it. The editor registry and the pages resource provide the
complete editor/language/suffix table.

pages.logView belongs to this window. With multiple windows, address the intended window before
using its Log View; otherwise output is written to the first/current window selected by the call
context.
```

Delete the corresponding creation-warning and “which window?” operational prose from
`mcp-res-pages.md` and `mcp-res-ui-push.md`; retain a pointer to `pages.$help` and the full tables.

### `PAGE_HELP` — raw content versus rendered verification

File: [`src/renderer/scripting/api-wrapper/PageWrapper.ts`](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts),
descriptor constant `PAGE_HELP`.

Before:

```ts
Grouped is a side-by-side page and creates one when none exists.
```

After:

```ts
Grouped is a side-by-side page and creates one when none exists. A successful content read or
assignment reports the raw source, not that a structured editor rendered it successfully. Parse
JSON before writing notebook, links, graph, or REST content, then activate the page and use
window.screen.snapshot() when you need to verify the rendered editor.
```

Delete the duplicate verification rules from `mcp-res-pages.md`; keep the longer failure examples
as resource-only reference.

### `LOG_VIEW_HELP` — replacement behavior for `ui_push`

File: [`src/renderer/scripting/api-wrapper/LogViewEditorFacade.ts`](../../../src/renderer/scripting/api-wrapper/LogViewEditorFacade.ts),
descriptor constant `LOG_VIEW_HELP`.

Before:

```ts
Unresolved dialogs raise attention on call results until answered.
```

After:

```ts
pages.logView.push() is non-blocking, including when it creates input dialogs: it returns entryIds
and dialogIds, and an unresolved dialog raises call attention until the user answers it in Log View.
There is no automatic user-response timeout; a pending dialog means the user has not answered it.
The call result omits fields that are absent; it does not replace an absent field with null.
```

Replace the retired `ui_push` blocking/timeout/result prose in `mcp-res-ui-push.md` with a pointer
to `pages.logView.$help`; keep the flat entry schema and type examples as resource-only reference.

### `LINK_EDITOR_HELP` — live projection and mutations

File: [`src/renderer/scripting/api-wrapper/LinkEditorFacade.ts`](../../../src/renderer/scripting/api-wrapper/LinkEditorFacade.ts),
descriptor constant `LINK_EDITOR_HELP`.

Before:

```ts
const LINK_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to "link-view".
Links, categories, and tags management.`;
```

After:

```ts
const LINK_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to "link-view".
Links, categories, and tags management. links are copied LinkItem projections: href is exposed as
url, and each snapshot includes pinned and isDirectory state. addLink(), updateLink(), and
deleteLink() are model-backed; deleteLink() does not open a confirmation dialog.`;
```

Move only this API-projection sentence family out of `mcp-res-links.md`; keep its JSON schema,
categories/tags rules, and examples as resource-only reference.

### Browser `$help` — no new source edit

EPIC-090 decision 9 is already implemented in the current browser descriptors. The
`waitForNavigation` member summary says it waits for the document loaded right now, is not a
navigation detector, may return against an already-complete old document, and recommends
`waitFor({ selector })` / `waitFor({ text })` ([BrowserEditorFacade.ts:57](../../../src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts:57)).
`PageCollectionWrapper` already owns the opener race and tells callers to wait for expected content
([PageCollectionWrapper.ts:42-44](../../../src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts:42)).
`BROWSER_EDITOR_HELP` already explains explicit snapshot refs and CSS-selector arguments
([BrowserEditorFacade.ts:78-88](../../../src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts:78));
`WINDOW_SCREEN_HELP` owns app-window privacy restrictions.

Therefore this task adds no second wait explanation to `BROWSER_EDITOR_HELP`. The implementation
only removes/replaces the stale `browser_*` equivalence table and duplicate wait prose in
`mcp-res-browser.md`; detailed ref/error material remains resource-only.
### `describeBoards.help` — published-board lifecycle

File: [`src/renderer/scripting/ai-vision/namespaces/boards.ts`](../../../src/renderer/scripting/ai-vision/namespaces/boards.ts),
descriptor returned by `describeBoards`.

Before:

```ts
Use boards.searchPublished() only for the remote published catalog; listing reports trust but never
grants it, and boards.registerBoard(root) remains the only trust path through the existing user dialog.
```

After:

```ts
Use boards.searchPublished() and boards.getPublishedVersions(id) for the remote catalog, then use
boards.downloadPublished() or boards.installPublished() to place a board on disk. Review downloaded
files before calling boards.registerBoard(root); listing, download, and install never grant trust,
and registerBoard(root) remains the only trust path through the existing user dialog. Use
boards.checkPublishedUpdates() for catalog updates and boards.uninstallBoard(id) only when removal
is intended.
```

Move only this short lifecycle rule from `mcp-res-boards.md`; keep the full authoring, theme,
secondary-view, integration, and Demo-board recipes as resource-only reference. Rewrite old
`create_board`, `open_board`, `board_refresh`, `execute_script`, and `browser_*` directions to the
call paths in the same guide pass.

### `REST_CLIENT_HELP` — minimal call-discoverable format

File: [`src/renderer/scripting/api-wrapper/RestClientEditorFacade.ts`](../../../src/renderer/scripting/api-wrapper/RestClientEditorFacade.ts),
descriptor constant `REST_CLIENT_HELP`.

Add this paragraph after the existing response-snapshot paragraph:

```ts
To create REST content through the page path, use a JSON root of
{ type: "rest-client", requests: [...] }. Each request needs a unique id; collection groups
requests, bodyType is "none", "raw", "form-urlencoded", "binary", or "form-data" for the
documented request model,
and .rest.json is the required title suffix for the Rest Client switch. Use send() deliberately:
it sends the selected request's real headers and body to the real service.
```

Move this concise creation/operation contract from the REST section of `mcp-res-pages.md`; keep
the full field table and request example there as resource-only reference.

### US-1344-owned scripting help (coordination, not a duplicate edit)

The following exact sentence families must land in the new `script` descriptor owned by US-1344:

```ts
script.execute(code) runs JavaScript or TypeScript in the renderer with the user's privileges.
The script has the app, page, io, and ai globals; page is the selected script page and app exposes
application services. TypeScript annotations are stripped without type checking. Full Node.js
access is available through the context-bound require(). A result includes the documented text,
language, isError, and consoleLogs fields; errors, side effects, the 30-second bridge timeout, and
dialog/pending behavior follow the existing script runner contract.
```

US-1345 records this as **US-1344 owns this**, verifies it before US-1349, and does not add it to
`ROOT_HELP`, `PAGES_HELP`, or any guide a second time. The scripting guide may retain a pointer to
`script.$help` and resource-only examples after US-1344's change.

## Resource retention and why

The resources are not a second tool registry. They remain useful for an agent that chooses a
document once, and `server-factory.ts` continues to serve them independently of `guideTools(ctx)`.
The following content intentionally stays in resources:

| Resource | Prose that stays and reason |
|---|---|
| `mcp-res-notebook.md` | NoteItem/NoteContent JSON schema, required-field examples, and render-failure examples are a format specification. The Notebook facade owns live operations, not the complete document schema.
| `mcp-res-links.md` | LinkItem JSON, category/tag rules, and complete examples are a format specification; only the live facade projection sentence moves.
| `mcp-res-graph.md` | Graph root/node/link/options schema, defaults, examples, and data-editing recipes are a document-sized format reference; Graph `$help` owns the query/edit boundary.
| `mcp-res-boards.md` | The detailed boards lifecycle, trust review checklist, `persephone.execute()`/Node channel, theme contract, vendoring, integration recipes, and Demo-board reference are one-time authoring documentation. `$help` owns only the concise live lifecycle and automation contract.
| `mcp-res-ui-editors.md` | The user-facing editor catalog, opening routes, capabilities, and “no longer built in” explanations are a catalog, not a single live object node.
| `mcp-res-tools.md` | Manifest schema, cross-language stdin examples, portability, and repair examples are a reusable document reference; the `tools` node owns the live protocol and result contract.
| `mcp-res-browser.md` | Full host-by-host examples and the detailed error table remain useful as a reference after the stable readiness/ref rules move into browser `$help`; stale old-tool names are rewritten or removed.
| `mcp-res-overview.md` | The short mental model remains a start-here document; only its stale tool-routing rows are rewritten to call paths and `$help`.
| `mcp-res-pages.md` | Complete editor/language/suffix tables, REST examples, and detailed failure examples remain reference material; concise creation and verification rules move to page help.
| `mcp-res-ui.md` | Shell anatomy, purpose-first explanations, stable selector catalog, and settings catalog remain a user-guidance resource. The standalone highlight recipe is deleted by US-1349, not retained or moved.
| `mcp-res-ui-push.md` | Entry schemas, type tables, and examples remain a format reference after its route and call behavior are rewritten to `pages.logView`.
| `mcp-res-scripting.md` | API examples and long-form recipes remain a document reference, except for operational sentences explicitly assigned to US-1344 or the existing node facades; the four-global paragraph is US-1344-owned.

The registration itself is untouched: `resourceFiles` still supplies twelve focused resources,
and `persephone://guides/full` still concatenates those same files. Deleting `read_guide` removes
no resource URI, file, description, callback, or mtime-cache behavior.

## `read_guide` deletion inventory for US-1349

This is a baseline `rg -i --count-matches "read_guide" src assets docs doc qa` inventory taken
before this README was created. Historical docs and QA records are listed so US-1349 can decide
whether each is a live instruction, an active test expectation, or an archival record; nothing is
deleted by US-1345.

### Runtime/source and asset references

| File | Count | US-1349 disposition |
|---|---:|---|
| `src/main/mcp/manifest.ts` | 12 | Rewrite the six `SERVER_INSTRUCTIONS` lines below; remove only tool-specific comments/cache wording as appropriate, while retaining resources and `readGuideFile`.
| `src/main/mcp/tools/agent-tools.ts` | 3 | Rewrite retiring tool descriptions/routes to call paths.
| `src/main/mcp/tools/board-tools.ts` | 2 | Rewrite retiring board-tool descriptions/routes to call paths.
| `src/main/mcp/tools/guide-tools.ts` | 1 | Delete the tool factory, local schema enum, description, and handler.
| `src/main/mcp/tools/page-tools.ts` | 11 | Rewrite old guide-gating text in tool descriptions as the tools are deleted.
| `src/renderer/api/mcp/page-commands.ts` | 2 | Rewrite fallback messages to node `$help`/call paths.
| `src/renderer/api/settings.ts` | 2 | Rewrite the MCP setup setting text to the call/resource discovery model.
| `assets/board-call-regex/CLAUDE.md` | 1 | Review board authoring pointer; do not make it a runtime tool dependency.
| `assets/board-template/CLAUDE.md` | 2 | Review board authoring pointer; retain a resource/document pointer if useful.
| `assets/mcp-res-boards.md` | 1 | Rewrite old route to `boards.*`/`pages[i].editor.*`.
| `assets/mcp-res-overview.md` | 11 | Rewrite stale route table and guide-reading instructions to call paths/resources.
| `assets/mcp-res-pages.md` | 2 | Rewrite old page-tool references to call paths and `$help`.
| `assets/mcp-res-scripting.md` | 4 | Coordinate with US-1344; rewrite old execution route without duplicating its four-global prose.
| `assets/mcp-res-ui.md` | 7 | US-1349 deletes the standalone highlight recipe; rewrite remaining pointers as needed.
| `assets/mcp-res-ui-editors.md` | 17 | Keep catalog content; remove stale tool-gating language if it remains operational.

### Developer docs, user docs, and QA references

| File | Count | Disposition |
|---|---:|---|
| `doc/active-work.md` | 1 | Existing task link; dashboard is explicitly out of scope here.
| `doc/agent-transparency-roadmap.md` | 2 | Authoritative roadmap row/history; keep as historical planning evidence unless US-1349 updates status.
| `doc/architecture/key-files.md` | 2 | Update key-file descriptions if they still claim the tool is the access path.
| `doc/architecture/overview.md` | 3 | Update current architecture prose after deletion, not in this task.
| `doc/epics/completed.md` | 3 | Historical epic record; do not rewrite for a runtime deletion.
| `doc/epics/EPIC-034.md` | 1 | Historical design mention; no runtime dependency.
| `doc/epics/EPIC-035.md` | 1 | Historical board task mention; no runtime dependency.
| `doc/epics/EPIC-038.md` | 5 | Historical scripting/guide mentions; review only.
| `doc/epics/EPIC-048.md` | 6 | Historical UI-guide wiring; review only.
| `doc/epics/EPIC-083.md` | 1 | Architecture decision/history; keep as evidence unless the epic close-out edits history.
| `doc/epics/EPIC-090.md` | 7 | Current authoritative epic; update status/evidence only when US-1349 completes.
| `doc/tasks/backlog.md` | 1 | Historical/backlog pointer; review only.
| `doc/tasks/completed.md` | 6 | Historical completed-task records; do not rewrite.
| `doc/tasks/US-1293-call-evaluation/README.md` | 1 | Historical QA scope; do not make it depend on the retired tool.
| `doc/tasks/US-1296-programmatic-call/README.md` | 1 | Historical call planning; review only.
| `doc/tasks/US-1300-elements-highlight/README.md` | 1 | Historical highlight planning; review only.
| `docs/agent-tools.md` | 1 | Rewrite if it describes the old tool gate; keep Agent Tools user documentation.
| `docs/boards.md` | 4 | Rewrite live user-facing agent pointers to resources/call paths.
| `docs/browser.md` | 1 | Rewrite live pointer to the browser resource if needed.
| `docs/mcp-setup.md` | 5 | Remove the `read_guide` tool row and replace it with the resource list/call `$help` guidance.
| `docs/whats-new.md` | 8 | Historical release notes can remain; current setup statements need review.
| `qa/mcp-test-page-operations.md` | 3 | Rewrite expected first actions to bare `call`/resource paths.
| `qa/mcp-test-ui-guidance.md` | 4 | Rewrite guide-tool expectations and remove the highlight recipe expectation under US-1349.
| `qa/runs/2026-08-09-haiku.md` | 8 | Historical run evidence; do not rewrite results.
| `qa/runs/2026-08-09-ui-guidance-haiku.md` | 1 | Historical run evidence; do not rewrite results.
| `qa/runs/2026-09-05-epic-083-call-vs-tools.md` | 1 | Historical run evidence; do not rewrite results.

### `SERVER_INSTRUCTIONS` lines that depend on `read_guide`

In [`manifest.ts`](../../../src/main/mcp/manifest.ts), these live instruction entries must be
inventoried by US-1349, but are not rewritten in US-1345:

| Line | Dependency |
|---:|---|
| 27 | Tells a new agent to call `read_guide("overview")`; replace with bare `call` discovery plus the overview resource option.
| 29 | Offers the tool as the guide-reading mechanism and examples; replace with resource URIs and node `$help`.
| 55 | Gates `execute_script` on `read_guide("scripting")`; US-1344 supplies `script.$help`, and US-1349 rewrites the instruction.
| 58 | Gates board work on `read_guide("boards")`; route to `boards.$help` and the resource.
| 61 | Gates UI help on `read_guide("ui")` and contains the highlight recipe; US-1349 owns both the instruction rewrite and recipe removal.
| 64 | Gates Agent Tools work on `read_guide("tools")`; route to `tools.$help` and the resource.

The other `read_guide` hits in `manifest.ts` are comments describing the resource/tool relationship
and cache behavior, not instructions sent to the client. Resource registration must remain.

## Answers to the required code questions

### Does anything other than the tool read `resourceFiles`?

Yes. `server-factory.ts` imports `resourceFiles` and independently iterates it to call
`server.registerResource` ([server-factory.ts:1,37-49](../../../src/main/mcp/server-factory.ts:1)). It
also maps the same array to serve `persephone://guides/full`
([server-factory.ts:52-64](../../../src/main/mcp/server-factory.ts:52)). Removing `guideTools(ctx)`
from the groups array cannot affect either resource registration path. `manifest.ts` itself owns the
array and `guide-tools.ts` is only one consumer.

### Is the guide-name enum duplicated?

The runtime enum is not shared or duplicated in another module. The only schema enum is the local
`z.enum([...])` in [`guide-tools.ts:27-28`](../../../src/main/mcp/tools/guide-tools.ts:27), and it
has a matching prose list in the tool description and a matching literal list in the unknown-guide
error in the same file. `resourceFiles` is a separate authoritative URI/file registry, not a second
Zod enum. Deleting the tool removes its local enum and both local lists; it leaves no dangling
runtime enum. Static documentation mentions of guide names are covered by the inventory above.

### Is `readGuideFile` and its mtime cache shared with resources?

Yes. `readGuideFile` is called by the tool handler at
[`guide-tools.ts:44`](../../../src/main/mcp/tools/guide-tools.ts:44), by each focused-resource
callback at [`server-factory.ts:46`](../../../src/main/mcp/server-factory.ts:46), and by the full
resource callback at [`server-factory.ts:62`](../../../src/main/mcp/server-factory.ts:62). The mtime
cache in [`manifest.ts:162-176`](../../../src/main/mcp/manifest.ts:162) therefore stays. Only the
tool import/handler use disappears.

## Implementation plan

- [ ] Add the exact `$help` sentences above to `SCRIPT_HELP`, `PAGES_HELP`, `PAGE_HELP`,
      `LOG_VIEW_HELP`, `LINK_EDITOR_HELP`, `describeBoards.help`, and
      `REST_CLIENT_HELP`. Keep the existing descriptor/member architecture; do not add a second
      guide reader or a new call protocol.
- [ ] Coordinate with US-1344 so the script node owns the execution/globals/TypeScript/Node/error/
      timeout/dialog sentences. Verify its help through `call` before US-1349.
- [ ] Rewrite the operational routes in the twelve guide files: old tool names become call paths or
      resource pointers; moved sentence families are removed from the guide. Preserve the
      resource-only schemas, catalogs, examples, and authoring references listed above.
- [ ] After implementation, read every edited node's `$help` through `call` (`$help`, `script.$help`,
      `pages.$help`, `pages[0].$help`, `pages.logView.$help`, `pages[0].editor.$help`, and
      `boards.$help`). Confirm each moved sentence is present, then run `rg` against the owning guide
      and confirm that sentence is absent there; this is the required move-without-duplication check.
- [ ] Enforce the `$help` size budget: remove generated dialog examples and other reference-sized
      material from help bodies when necessary, leaving it in the resources.
- [ ] Keep absent optional fields omitted in any new call examples and help claims; never document
      `null` as a substitute for an absent call result field.
- [ ] Do not introduce caught-value formatting in this documentation task. If implementation work
      touches a catch path, use `errMessage` from `src/shared/utils.ts`; do not hand-roll error
      stringification. Do not add colors and do not edit generated `assets/editor-types/*.d.ts`.
- [ ] Leave `resourceFiles`, all twelve resource records, the resource callbacks, the full-resource
      callback, `readGuideFile`, and its mtime cache unchanged.
- [ ] Leave `guide-tools.ts`, `server-factory.ts`, and `SERVER_INSTRUCTIONS` unchanged in US-1345;
      US-1349 uses this inventory to remove the tool and rewrite the instructions.
- [ ] US-1349 then removes the tool registration and runs the bare-`call` discovery scenario from
      the EPIC-090 ledger. It must confirm that a node `$help` answer exists without invoking any
      guide tool and that every resource URI still resolves.

## Concerns

### Resolved

- **Resources are not tool aliases.** Their registration and callback code are independent of the
  tool group, so preserving the resource files does not require retaining the deleted tool.
- **The cache is not dead code after deletion.** Focused and full resource reads still use the same
  `readGuideFile` mtime cache.
- **The enum has no external runtime consumers.** `resourceFiles` is the durable source for URI
  registration; no other module imports the local Zod enum.
- **Operational prose has an owner.** The audit assigns live behavior to the root, page, log,
  browser, board, tools, and editor descriptors; document-shaped schemas/catalogs remain resources.
- **Coordination boundaries are explicit.** US-1344 owns script-global and execution prose; US-1349
  owns deletion, `SERVER_INSTRUCTIONS`, and the standalone highlight recipe.

### Files that need no changes for this task

- [`src/main/mcp/manifest.ts`](../../../src/main/mcp/manifest.ts) — `resourceFiles`, resource
  descriptions, `readGuideFile`, and the mtime cache stay. Its `SERVER_INSTRUCTIONS` rewrite is
  US-1349's work.
- [`src/main/mcp/server-factory.ts`](../../../src/main/mcp/server-factory.ts) — the resource loops
  stay; only the separate `guideTools(ctx)` registration is a US-1349 deletion.
- [`src/main/mcp/tools/guide-tools.ts`](../../../src/main/mcp/tools/guide-tools.ts) — no edit in
  US-1345; US-1349 deletes it after this audit is implemented and verified.
- [`src/main/mcp/tools/call-tools.ts`](../../../src/main/mcp/tools/call-tools.ts) — US-1343 owns the
  call overview and generic result rendering.
- [`src/shared/ai-vision/hint.ts`](../../../src/shared/ai-vision/hint.ts) — `buildHelp` already
  renders the descriptor help; no renderer or result-shape change is needed.
- [`assets/mcp-res-ui.md`](../../../assets/mcp-res-ui.md) highlight recipe — US-1349 deletes it;
  US-1345 must not move or delete it.
- [`assets/mcp-res-scripting.md`](../../../assets/mcp-res-scripting.md) four-global paragraph —
  US-1344 owns it; US-1345 must not duplicate or take ownership.
- `assets/editor-types/*.d.ts` — generated files; never hand-edit.
- `doc/active-work.md` and [`doc/epics/EPIC-090.md`](../../epics/EPIC-090.md) — the dashboard and
  epic link already exist; the request explicitly excludes dashboard work.

## Acceptance criteria

- [ ] The README contains a source-backed audit for all twelve guides, subdivided by distinct
      sentence families, with every family classified as covered, moved, resource-only, or
      retire/rewrite.
- [ ] Every identified `$help` gap has an exact destination descriptor, file, and sentence text;
      the implementation notes whether the guide keeps a pointer or loses the moved prose.
- [ ] The document records the complete baseline `read_guide` reference inventory with file counts,
      the six `SERVER_INSTRUCTIONS` lines, and the US-1349 ownership boundary.
- [ ] The document proves from source that focused resources and `persephone://guides/full` survive,
      the guide-name enum is local to the tool, and `readGuideFile`/mtime caching is shared with
      resources.
- [ ] The eventual implementation removes moved operational prose from guide files rather than
      duplicating it, preserves resource-only reference material, and keeps all twelve resource
      registrations byte-for-byte in behavior.
- [ ] After implementation, every edited node is read through `call` and every moved sentence is
      found in its `$help` and absent from its source guide according to `rg`; no half-move is accepted.
- [ ] Every descriptor help body stays within 40 nonblank source lines and approximately 600 words;
      examples, schemas, catalogs, and long error tables remain resource-only when the ceiling would
      otherwise be exceeded.
- [ ] The eventual US-1349 deletion leaves no `read_guide` call in live runtime instructions or
      active QA expectations, while historical evidence is not rewritten merely to change history.
- [ ] No implementation in this task edits the dashboard, deletes the tool, deletes resources,
      changes `call` result omission semantics, hand-rolls error stringification, hardcodes colors,
      or edits generated editor typings.

## Files Changed summary

| File | Planned change |
|---|---|
| `doc/tasks/US-1345-guide-prose-to-help/README.md` | This investigation, sentence-family audit, concrete `$help` text, resource-preservation findings, and US-1349 deletion inventory. |
| `src/renderer/scripting/ai-vision/root.ts` | Add the concise script-side `app.call` contract to `SCRIPT_HELP`; do not duplicate US-1344's script-global help. |
| `src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts` | Add page creation language/suffix constraints and Log View window scope to `PAGES_HELP`. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | Add raw-content versus rendered-verification guidance to `PAGE_HELP`. |
| `src/renderer/scripting/api-wrapper/LogViewEditorFacade.ts` | Add replacement `pages.logView` call behavior, pending-dialog, timeout, and omission semantics to `LOG_VIEW_HELP`. |
| `src/renderer/scripting/api-wrapper/LinkEditorFacade.ts` | Add LinkItem projection and mutation behavior to `LINK_EDITOR_HELP`. |
| `src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts` | Make no browser-source edit; the existing member/help text already owns the EPIC-089/EPIC-090 wait contract. |
| `src/renderer/scripting/ai-vision/namespaces/boards.ts` | Add the concise published-board lifecycle to `describeBoards.help`. |
| `src/renderer/scripting/api-wrapper/RestClientEditorFacade.ts` | Add the minimal call-discoverable REST root/request contract to `REST_CLIENT_HELP`. |
| `assets/mcp-res-overview.md` | Rewrite stale retiring-tool routing while retaining the short mental model as a resource. |
| `assets/mcp-res-ui-push.md` | Rewrite the retired tool route/behavior to `pages.logView`; retain entry schemas/examples. |
| `assets/mcp-res-pages.md` | Rewrite retired page-tool routes and remove moved creation/verification prose; retain full reference tables/examples. |
| `assets/mcp-res-scripting.md` | Coordinate with US-1344; move the script-side `app.call` paragraph to `SCRIPT_HELP`, remove stale execution routes, and retain examples/reference material. |
| `assets/mcp-res-links.md` | Remove the moved live-projection sentence; retain LinkItem schema/examples. |
| `assets/mcp-res-boards.md` | Rewrite stale tool routes and remove the moved concise lifecycle sentence; retain authoring reference. |
| `assets/mcp-res-tools.md` | Rewrite the retiring search route; retain manifest/result-marker/secrets reference. |
| `assets/mcp-res-browser.md` | Remove duplicate wait prose and the stale old-tool table; retain detailed reference/error material. |
| `assets/mcp-res-ui.md` | No highlight-recipe edit here; only coordinate any stale route pointers with US-1349. |
| `assets/mcp-res-ui-editors.md` | Retain catalog; update only stale operational route pointers if required by the deletion pass. |
