# 2026-09-05 — `call` alone vs the full tool set (haiku)

EPIC-083 / US-1293. Both runs used the same four-part request, the same model (`haiku`), the same
live instance, and no prior knowledge: the agents are told to ignore every project file and learn
persephone only from MCP.

- **Run A** — `mcp-test-agent-call` (`allowed-tools: mcp__persephone__call` only, no `read_guide`).
- **Run B** — `mcp-test-agent` (full tool set: ~25 tools plus the guides).

## The request

1. Title of the active page and how many pages are open.
2. Create a page showing `name,qty\napple,3\npear,5` as a table; report the grid's row count.
3. Add two more rows to that grid page.
4. Report the theme and the version.

## Result

| | Run A — `call` only | Run B — full tool set |
|---|---|---|
| Tasks completed | 4 / 4 | 4 / 4 |
| Tool calls | 14 | 9 |
| Guides read | none (none available) | none |
| Wrong answers | none | **theme reported as `system`; the setting is `default-dark`** |
| Errors / retries | none | none |

**PASS.** Run A met the epic's acceptance bar — "an agent with no guide can reach the active page's
content, activate another page, and add rows to a grid page using only hints" — with no guessing.

### Run A call sequence

```
""                                          → root members
page.title                                  → "active-work.md"
pages                                       → 4 pages listed
helpSearch("create page")                   → found pages.addEditorPage()
pages.$help
pages.addEditorPage ["grid-csv","csv","products"]
page.content  (value: the CSV)
page.asGrid().rowCount                      → 3
page.asGrid().$help                         → found addRows()
page.asGrid().addRows [2]
page.asGrid().rowCount                      → 5
helpSearch("theme")                         → found settings.theme
settings.theme                              → "default-dark"
version                                     → "4.0.24"
```

Every call built on a hint or `$help` from the previous one. The two `helpSearch` calls are the
mechanism working as designed: the agent knew *what* it wanted and not *where* it lived.

### Observations

- **Run B is shorter but shallower.** It reached the same end state in 9 calls because
  `create_page` and `set_page_content` are single-purpose tools. For task 3 it rewrote the whole
  CSV rather than adding rows — correct output, but it never touched the grid facade.
- **Run B's only wrong answer came from a purpose-built tool.** It read the theme from
  `get_app_info`/`execute_script` and answered `system`; `app.settings.get("theme")` is
  `default-dark`. Run A read the setting directly through `settings.theme` and was right. One
  sample, but it is the failure mode the epic predicts: a fixed tool returns what its author chose
  to expose, while a path returns the live value.
- **Call count is not the metric to optimise.** Run A spends calls on discovery (`""`, `$help`,
  `helpSearch`) that a repeat run would not need for the same task, and those calls are small.

## Go / no-go for the consolidation epic

**Go**, with the scope conditions below. A haiku-class agent completed the scenario set with `call`
alone, at least as reliably as with the full tool set, and without reading a guide — which is the
evidence US-1293 was created to produce.

Conditions to carry into the consolidation epic:

1. **Nothing is removed until its replacement path is verified by this same test.** The scenarios
   here cover pages, content, grid facades and settings. `ui_push`, boards, toolsets and the
   `browser_*` family are not yet exercised through paths and must not be retired on this evidence.
2. **`browser_*` keeps its ref lifecycle question open.** Mapping it onto `pages[i].asBrowser().*`
   needs the target resolution and ref store designed, not just descriptors written.
3. **A deprecation period, not a cut-over.** External clients and every guide name the current
   tools.

## Reproducing

```
Skill(skill: "mcp-test-agent-call", args: "<the request>")   # call only
Skill(skill: "mcp-test-agent",      args: "<the request>")   # full tool set
```

Close the pages each run creates afterwards. Closing a modified page raises the unsaved-changes
dialog, which blocks `execute_script` until it is dismissed — dismiss it with
`browser_click({ pageId: "app", ref: <Don't Save> })`, or close through
`call path:"pages.closePage"`, which does not stall the bridge.
