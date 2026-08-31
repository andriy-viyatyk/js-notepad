---
name: userdoc
model: sonnet
context: fork
description: Reviews and updates user-facing documentation in /docs/ after code changes. Use after implementation tasks to keep user guides current.
allowed-tools: Read, Glob, Grep, Edit, Write, Bash
---

# User Documentation Update

You are updating the user-facing documentation in `/docs/` to reflect recent code changes in the Persephone project.

## Scope

This agent covers **user docs only** (the `/docs/` folder). Developer docs in `/doc/` are handled by the `/document` skill separately.

## Documentation structure

The `/docs/` folder contains user-facing guides:

| File | Covers |
|------|--------|
| `index.md` | Home page — feature overview, doc links |
| `getting-started.md` | Installation and first steps |
| `editors.md` | Overview of all editor types |
| `grid-editor.md` | Grid editor for JSON/CSV |
| `notebook.md` | Notebook editor |
| `browser.md` | Built-in web browser |
| `scripting.md` | JavaScript scripting guide |
| `tabs-and-navigation.md` | Tab management, sidebar, session restore |
| `encryption.md` | File encryption |
| `shortcuts.md` | Keyboard shortcuts reference |
| `whats-new.md` | Release notes / changelog |
| `api/index.md` | Scripting API overview |
| `api/page.md` | `page` object reference |
| `api/app.md` | `app` object reference |
| `api/pages.md` | `app.pages` reference |
| `api/fs.md` | `app.fs` reference |
| `api/settings.md` | `app.settings` reference |
| `api/ui.md` | `app.ui` reference |
| `api/shell.md` | `app.shell` reference |
| `api/window.md` | `app.window` reference |
| `api/editors.md` | `app.editors` reference |
| `api/recent.md` | `app.recent` reference |
| `api/downloads.md` | `app.downloads` reference |

## How to work

1. Use `git diff` or `git log` to understand what changed recently
2. Identify which user-facing features were affected
3. Read the relevant docs and compare against the actual code
4. For API reference pages in `docs/api/`, compare against the `.d.ts` type definitions in `src/renderer/api/types/`
5. Update only what's actually stale or missing
6. Check if `docs/whats-new.md` needs an entry for notable user-visible changes

## Writing style

- **Audience:** End users and scripters, not internal developers
- **Tone:** Clear, practical, concise
- **Format:** Show examples with code blocks where helpful
- **Links:** Cross-reference related pages with relative markdown links
- **No internals:** Don't mention internal implementation details (stores, models, ViewModels)

## Output

After making updates, provide a summary:
- Which docs were updated and why
- Which docs were checked and found to be current
- Note any docs that may need larger rewrites
