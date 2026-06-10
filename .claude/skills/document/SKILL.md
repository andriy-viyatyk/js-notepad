---
name: document
description: Update developer documentation in /doc/ after code changes
model: sonnet
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Developer Documentation Update

You are updating the developer documentation in `/doc/` to reflect recent code changes.

## Scope

This command covers **developer docs only** (the `/doc/` folder). User-facing docs in `/docs/` are handled by the `/userdoc` skill separately.

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

### 3. CLAUDE.md

Check the root `CLAUDE.md` file:
- **Key Files table** — Does it list all important files? Any new key files to add? Any deleted files to remove?
- **Folder Structure** — Does the summary match reality?
- **Critical Patterns** — Any new patterns to document?
- **Documentation Map** — Any new docs to link?

## How to work

1. Use `git diff` or `git log` to understand what changed recently
2. Read each doc file that might be affected
3. Compare against actual source code
4. Make targeted edits — only change what's actually stale or missing
5. Do NOT rewrite docs that are already accurate

## Do NOT reference tasks or epics in architecture docs

Architecture and standards docs (`doc/architecture/`, `doc/standards/`, root `CLAUDE.md`)
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
