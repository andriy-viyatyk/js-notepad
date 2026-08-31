---
name: document
description: Update developer documentation in /doc/ after code changes
model: sonnet
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Developer Documentation Update

You are updating the developer documentation in `/doc/` to reflect recent code changes.

## Scope

This command covers **developer docs** (the `/doc/` folder) **and the Board documentation in `assets/`** (the board authoring guide + the Demo board — consumer-facing references for the AI agents that build boards). User-facing app docs in `/docs/` are handled by the `/userdoc` skill separately.

## What to check and update

### 1. Architecture docs (`doc/architecture/`)

Read each file and compare against the current code:

| File | Covers |
|------|--------|
| `overview.md` | Application layers, process boundaries, key patterns |
| `folder-structure.md` | Directory structure and what goes where |
| `state-management.md` | State primitives, Object Model APIs |
| `scripting.md` | Script execution, wrappers, facades |
| `editors.md` | Editor registry, content-view pattern |
| `pages-architecture.md` | Page model, tab lifecycle |
| `browser-editor.md` | Browser-specific architecture |

For each doc:
- Check if new files/folders need to be mentioned
- Check if moved/deleted files need to be removed
- Check if new patterns or APIs need to be documented
- Check if diagrams in `doc/architecture/diagrams/` need updates

### 2. Standards docs (`doc/standards/`)

| File | Covers |
|------|--------|
| `coding-style.md` | TypeScript, naming, imports, styling conventions |
| `editor-guide.md` | How to add/modify editors |
| `component-guide.md` | UI component patterns |
| `model-view-pattern.md` | Model-View separation |

Check if new patterns were established that should be standardized.

### 3. Shared agent guidelines (`doc/agents-common.md`)

The shared project instructions live in
[`/doc/agents-common.md`](../../../doc/agents-common.md) — the root `CLAUDE.md` and
`AGENTS.md` are thin agent-specific wrappers around it and rarely need updating. Check the
shared document:
- **Key Files** — the full purpose→path index lives in
  [`/doc/architecture/key-files.md`](../../../doc/architecture/key-files.md), **not** in
  `doc/agents-common.md`. New, changed and deleted key files go **there**.
  `doc/agents-common.md` keeps only a short starting-point list; add a row to it only when a
  file is genuinely needed on most tasks. The split exists because the shared guidelines are
  loaded into every session and the full index was ~73% of them — do not let the big table
  creep back in.
- **Folder Structure** — Does the summary match reality?
- **Critical Patterns** — Any new patterns to document?
- **Documentation Map** — Any new docs to link?

### 4. UI guides (`assets/mcp-res-ui*.md` — agent-facing)

Two guides describe Persephone to an agent that is helping the user with the app itself:

- **`assets/mcp-res-ui.md`** — the chrome: what each always-visible element is *for*, its
  `data-name` selector, and the `app.ui.highlightElement` recipe.
- **`assets/mcp-res-ui-editors.md`** — the editor catalog: what each editor is for, how the user
  opens it, what it can do. Its source material is the user doc `docs/editors.md`, which stays
  authoritative for humans; the guide is a condensation, not a second copy.

Both describe a moving target, so they are the guides most likely to rot silently — nothing
fails when they go stale, an agent just tells the user something untrue.

Check **`mcp-res-ui.md`** whenever a change touched:

- **The app shell** — `src/renderer/ui/app/MainPage.tsx`, `ui/tabs/`, `ui/sidebar/MenuBar.tsx`,
  `ui/app/Pages.tsx`, `ui/secondary-views/`. Verify every selector the guide names still
  resolves, and that new always-visible chrome is described.
- **The selector contract** — [`doc/architecture/ui-element-contract.md`](../../../doc/architecture/ui-element-contract.md).
  A `data-name` quoted in the guide is agent-facing API: renaming one is a documentation change,
  and the guide and the contract doc must be updated in the same commit.
- **`app.ui.highlightElement` / `clearHighlights`** — `src/renderer/api/ui.ts`,
  `src/renderer/api/types/ui.d.ts`, `assets/agent/ui-highlight.js`. Options and return fields
  are quoted in the guide.

Check **`mcp-res-ui-editors.md`** whenever a change touched:

- **The editor set** — `src/renderer/editors/register-editors.ts` (an editor added, removed, or
  renamed), or `editor-matchers.ts` (which files open in which editor, and which switch buttons
  appear).
- **`docs/editors.md`** — if the user doc gained or lost a capability, the condensation is stale
  too. Reconcile the two rather than editing one.
- **A feature moving out of the app into a board** — the guide's *"Things that are no longer
  built in"* section exists so an agent never promises a removed feature (Todo, PDF). Anything
  that follows them belongs there.

Keep both **thin on layout, thick on purpose**. An element's purpose survives a refactor; its
position does not. Prefer "opens the Menu Bar" over "third button from the left".

Keep `mcp-res-ui-editors.md` free of the required-`language` and title-suffix tables — those live
in `mcp-res-pages.md`, and duplicating them means two copies drifting apart on the one detail
that silently produces a broken page.

The fastest verification is live, not by reading source: `browser_snapshot({ pageId: "app" })`
and `app.ui.highlightElement(selector)` — `found: false` names the stale selector for you.

### 5. Board documentation (`assets/` — consumer-facing)

Boards are built and debugged by AI agents, so their reference docs **are** documentation and must track changes to board functionality (the `persephone.*` bridge, the `--p-*` theme/token contract, the `board://` host, scaffolding, reload, MCP debugging). When board functionality changed, verify and update **both**:

| Doc | Covers | Update when… |
|-----|--------|--------------|
| `assets/board-template/CLAUDE.md` | The Board authoring guide — copied into every new board; the canonical reference a board-author agent reads. | The `persephone` bridge surface (`execute` handle, integration tier, theme/tokens), the `--p-*` contract list, `board-base.css`, the reload model, or the MCP debugging flow changes. |
| `assets/demo-board/` (`index.html`, `app.js`, `style.css`) | The living, self-documenting Demo board — Overview / Theming / Capabilities / Build Guide / Debugging tabs demonstrating the same surface. | A capability the demo showcases changes, or a new one should be demonstrated. Keep its Build Guide + Debugging prose accurate and refresh the live examples (buttons/probes) when the API changes. |
| `assets/mcp-res-boards.md` | The **agent-facing** boards guide served by `read_guide("boards")` / `notepad://guides/boards` — what a board is, the `execute_script` create→open lifecycle (`app.boards.createBoard`/`createDemoBoard` + `app.openRawLink`), develop & test. | The board lifecycle API (`app.boards`, `app.openRawLink`), the `persephone.*` bridge, the `--p-*` contract, or the `browser_*` testing flow changes. |

- `assets/demo-board/` is the **canonical** demo (edited directly; it is copied into a board on "Create Demo board") — there is no separate working copy to chase.
- `assets/board-base.css` is shared by both boards; if the shared defaults (page bg, scrollbar, monospace font) change, the authoring guide's note about it must match.
- **Reconcile drift across the three board docs each run.** They overlap on authoring content: `board-template/CLAUDE.md` is the canonical *authoring* reference; `mcp-res-boards.md` is the condensed agent-facing copy **plus** the create/open lifecycle; `demo-board/` is the living example. Cross-check them for discrepancies and fix the drift — bring the condensed copy back in line with the canonical guide and the current API.
- These docs are **consumer-facing** — keep them **ticket-free** too (no `US-XXX` / `EPIC-XXX`), same rule as the architecture docs below.

## How to work

1. Use `git diff` or `git log` to understand what changed recently
2. Read each doc file that might be affected
3. Compare against actual source code
4. Make targeted edits — only change what's actually stale or missing
5. Do NOT rewrite docs that are already accurate

## Do NOT reference tasks or epics in architecture docs

Architecture and standards docs (`doc/architecture/`, `doc/standards/`, `doc/agents-common.md`)
describe the **current state of the system** — the architecture as it is now. They must
**not** cite the task or epic that produced a feature (`US-619`, `EPIC-031`, "added in
US-624", "pre-US-619 behavior", etc.).

- Describe **what the system does and why**, not **when/under-which-ticket it was added**.
  Reasoning and trade-offs are welcome; the ticket number that introduced them is not.
- When you add or edit content, write it ticket-free. When you touch a section that already
  carries a `US-XXX` / `EPIC-XXX` citation, strip the citation (keep the explanation).
- Never put a task/epic id in a heading.
- Task/epic tracking belongs in `doc/active-work.md`, `doc/epics/`, and `doc/tasks/` — not
  in the architecture record. (The `/review` and history in git already tie code to tickets.)

Keep prose out of table cells. A table cell holds a short identifying phrase; multi-sentence
behavior belongs in a prose paragraph under the table (linked from the cell if useful).

## Output

After making updates, provide a summary:
- Which docs were updated and why
- Which docs were checked and found to be current
- Any docs that need larger rewrites (flag for future task)

**Important:** Be precise. Only update what's actually wrong or missing. Do not add speculative content or over-document simple changes.
