# Surface QA: Agent Tools, the toolset editor, the Tools hub, MCP Inspector and Mneme

Manual scenarios for the `tools` root node and the four remaining EPIC-088 editor surfaces. Run
through `call` only; do not add or run automated tests or a test harness. Leave pinned tabs
untouched and close only pages the scenario created. Create test toolsets in a scratch folder,
never inside the repo.

Landed by EPIC-088 (US-1328, US-1329, US-1330, US-1331).

> **Do not run a registered tool during QA unless you know what it does.** Real toolsets on a
> developer's machine call live company systems with their credentials. Every scenario below is
> read-only or uses a deliberately invalid id.

## Test T.1: Discovering the registry at all

**Preparation:** at least one registered toolset.

**Call:** Read the root (path `""`), then `tools`.

**Verify:** `tools` appears in the root member list, and its own hint lists `search`, `execute`,
`toolsets` and `createToolset`, with the live toolset count as a child. Before EPIC-088 the
registry was reachable only through the four MCP tools and was invisible to `call` entirely.

## Test T.2: Search, in all three query forms

**Call:** `tools.search()`, then `tools.search("select:<toolset>/<tool>")`, then a keyword query
with `maxResults`.

**Verify:** The empty query gives the cheap `{ id, description }` listing of everything. The
`select:` form returns **one complete definition** — and the whole `inputSchema`, with every
argument's name, type and description readable. This is the row that matters: an agent that can
read a tool's description but not its arguments cannot call it. Compare against `search_tools`
with the same query; the two must agree.

`env` lists variable **NAMES** only. If a value ever appears here, stop — that is a secret leak,
not a QA finding.

## Test T.3: An invalid target is refused, a legitimate miss is not

**Call:** `tools.execute("no-such-toolset/no-such-tool")`, then `tools.search("zzzznomatch")`.

**Verify:** `execute` **throws**, naming the requested id and listing the valid ids, and spawns no
process. The empty search returns a genuine empty result — a keyword that matches nothing is a
legitimate answer, not an error. The distinction is the point: an invalid execution target is a
guess; an empty search is a fact.

## Test T.4: Refresh reports what parsed

**Call:** `tools.toolsets.refresh()`.

**Verify:** Returns `{ refreshed, toolsetCount, toolCount, toolsets: [{ name, root, valid,
shadowed, toolCount, errors }] }` — the same envelope `refresh_toolset` returns, so a manifest edit
can be confirmed before anything is run. `errors` is a real `[]` when there are none.

There is deliberately **no** per-toolset `refresh()`: the registry cannot scope a refresh (a
manifest name change can move collision ownership), so a member with that name would silently
refresh everything.

## Test T.5: Scaffolding cannot register — the security test

**Preparation:** a scratch folder outside the repo.

**Call:** `tools.createToolset("qa-probe", "<scratch folder>")`.

**Verify:** The call returns **pending** with an `attention` block naming the "Register this
toolset?" dialog, its warning that tools run headlessly with the user's full privileges, and both
buttons. The folder is scaffolded (manifest, example tool, `.env.example`, guide) but **nothing is
registered**.

Answer with `dialogs[0].click("Cancel")` and confirm `tools.toolsets.refresh()` still reports the
same toolset count. **Do not click "Register toolset" during QA** — the whole property under test
is that an agent cannot grant itself the right to run programs on the user's machine, and clicking
it as the agent defeats the test.

## Test T.6: The toolset page and the Tools hub

**Call:** `pages.showToolsHubPage({ tab: "tools" })`, then read `pages[id].editor`. Then open a
toolset page and read its editor.

**Verify:** The hub reports `activeTab: "tools"`; an invalid tab name is rejected rather than
silently ignored. The toolset facade reports its root, name, `registered` and `valid` state with a
real `[]` for `errors`, and its `$help` points at `tools.toolsets[...]` for the manifest and tool
data rather than repeating it — one registry, one projection.

## Test T.7: MCP Inspector — the panels, and what an agent may not set

**Call:** `pages.showMcpInspectorPage()`, then read `pages[id].editor`. Then try to assign
`pages[id].editor.command`.

**Verify:** The facade reports `activePanel`, `availablePanels`, and the Tools / Resources /
Prompts state, each `undefined` while disconnected rather than a falsy stand-in. Assigning
`command` (or `args`) is **refused** — "not writable". A writable `command` plus `connect()` would
let an agent spawn a process of its own choosing with the user's privileges and no dialog.

`url` and `transportType` remain writable, and `showMcpInspectorPage({ url })` still works: an
address is not a credential. `$help` warns against embedding credentials in a URL.

## Test T.8: Mneme describes its screens, not the knowledge base

**Call:** `pages.showMnemeConfigPage()`, then read `pages[id].editor`.

**Verify:** Reports the service and connection state, the roots and the embedding model — and no
credential; the transport token appears nowhere. `$help` states plainly that the Mneme MCP server
remains the document API and that this facade describes the configuration screen.

`removeRoot`, `reindex`, `setRootConfig`, `updateModel` and `restart` all carry a `caution`.
`addRoot` is deliberately **not** a method — it needs a native folder picker and an input dialog,
so the facade points the user at the control instead of offering a call that cannot honestly
complete.
