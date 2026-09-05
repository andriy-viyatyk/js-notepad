# MCP Documentation QA Testing

Quality assurance tests for persephone MCP server documentation. The goal is to ensure AI agents can use persephone MCP tools correctly based solely on tool descriptions and resource guides — without prior knowledge of the project.

## How It Works

A **test agent** (the `mcp-test-agent` skill, `.claude/skills/mcp-test-agent/SKILL.md`) simulates a generic AI assistant that only knows about persephone through its MCP connection. It is told to ignore CLAUDE.md, source code, and project files — only MCP tools and resources.

The **test runner** (you, in the main conversation) sends test prompts to the agent, then verifies the results by checking persephone pages via MCP.

**Model choice:** the skill's frontmatter `model:` field selects the model. It is set to `haiku` on purpose — the weaker the model, the stronger the documentation test: if Haiku can drive persephone correctly from the docs alone, the docs work. Bump to `sonnet` only to distinguish "docs unclear" from "model too weak" on a failing test.

## Test Files

| File | Area | Tests |
|------|------|-------|
| `mcp-test-create-page.md` | Page creation | All editor types: text, markdown, mermaid, grid, notebook, links, graph, SVG, HTML, rest-client, JSONL; standalone-editor refusal |
| `mcp-test-ui-push.md` | Log View output | Log messages, dialogs, rich output (markdown, mermaid, grid, code) |
| `mcp-test-execute-script.md` | Script execution | Expression eval, page content access, transformations, facades, FS, settings |
| `mcp-test-page-operations.md` | Page CRUD | List, read, update pages, multi-window, browser, app info, pageId targeting, overview guide |
| `mcp-test-browser.md` | Browser automation | Targeting, snapshots, refs, click, evaluate, wait_for, screenshots, app window |
| `mcp-test-ui-guidance.md` | Explaining the app itself | UI guide lookups, highlight overlay, editor catalog, settings, features that don't exist |
| [`surfaces/README.md`](surfaces/README.md) | Per-surface `call` QA | Dialogs, popup menus, curated shell elements, attention, and highlights |

## Surface QA

The surface-oriented suite lives under [`qa/surfaces/`](surfaces/README.md). These tests follow
the part of Persephone an agent is trying to understand or drive, so they cover the `call`
protocol's live attention, dialog/menu actions, curated element descriptions, and highlights.
The two layouts are complementary: the older `mcp-test-*.md` files group coverage by MCP tool,
while `qa/surfaces/` groups coverage by screen, dialog family, or editor as the single `call`
surface replaces tool-specific workflows. Use the surface index for its common rules and the
per-surface preparation, request, expected result, and verification steps.

## Running Tests

### Prerequisites

- persephone running with MCP server enabled
- MCP connection established (verify with `list_pages` call)

### Important Rules

- **NEVER close, modify, or interact with pinned tabs.** Pinned tabs belong to the user and must not be touched during testing.
- Only non-pinned tabs may be closed, created, or modified.
- Some tests require preparation pages — create them as non-pinned tabs before running the test agent.

### Test Procedure

For each test:

1. **Prepare** — On a **dedicated test instance**, clean up first (close all non-pinned pages,
   leave pinned tabs untouched):
   ```javascript
   // via execute_script
   const nonPinned = app.pages.all.filter(p => !p.pinned);
   for (const p of nonPinned) { app.pages.closePage(p.id); }
   ```
   **On the user's live instance, skip the blanket cleanup** — instead note the page ids that
   exist before the run (`list_pages`) and close only pages the test created afterwards.
   If the test requires a preparation page, create (and activate) it just before the run.

2. **Run test agent** — invoke the `mcp-test-agent` skill with the test request as its
   argument (it runs as a forked subagent and returns a report of what it did):
   ```
   Skill(skill: "mcp-test-agent", args: "<test request>")
   ```

3. **Verify results** — Check what the agent created:
   - `list_pages` — verify page exists with correct editor/language/title
   - `get_page_content` — verify content structure
   - Visual check — `browser_snapshot({ pageId: "app" })` with the page active: a healthy
     editor shows its content; a broken one shows a parse error or `Editor crashed`

4. **Record result** — PASS, PARTIAL (works but suboptimal), or FAIL (broken/wrong), in a run
   log under `qa/runs/` (e.g. `qa/runs/2026-08-09-haiku.md`), then close the created pages

### What to Check

For **structured editors** (notebook, links, graph):
- Did the agent read the dedicated resource guide BEFORE creating/updating?
- Is the JSON structure correct (all required fields present)?
- Does the editor render without crashes?

For **simple editors** (text, markdown, mermaid, grid, SVG, HTML):
- Correct editor + language pairing?
- Content is valid for the format?

### When a Test Fails

1. **Investigate why** — check the agent's tool call sequence in the stream output
2. **Ask the agent** — if it guessed instead of reading a resource, ask why
3. **Improve documentation** — update tool descriptions, resource guides, or server instructions
4. **Re-test** — restart persephone (to reload MCP server) and re-run the failing test

### Common Failure Patterns

| Pattern | Fix |
|---------|-----|
| Agent guesses JSON format instead of reading resource | Strengthen warning in tool description (STOP, MUST read) |
| Agent uses wrong editor+language pairing | Add to server instruction editor table |
| Agent doesn't know about a feature | Add to server instruction overview |
| Editor crashes on agent-provided content | Add validation and return error message with resource URI |

## Adding New Tests

When adding a new feature or editor:

1. Create test entries in the relevant `mcp-test-*.md` file
2. Each test needs: **Request** (prompt), **Expected** (what agent should do), **Verify** (how to confirm)
3. If preparation is needed, document it in a **Preparation** field
4. Run the test against the test agent to validate documentation quality
