# US-717: Canonical `mneme://` href for Mneme tree nodes *(placeholder)*

> **Placeholder** — full investigation + spec to be written when the task starts (follow the
> "Creating a new task" workflow: read the code thoroughly first, then fill in Implementation Plan).

## Goal

Make the canonical `href` of a Mneme tree node the scheme-qualified `mneme://{root}/{path}` form
(consistent with how `mneme://` links are opened/navigated in Persephone), instead of the current
scheme-less `{root}/{path}`.

## Why

Today a Mneme node carries two representations:

- **Scheme-less `{root}/{path}`** — what the tree node `href` and drag payload use, because it's passed
  directly to the MCP tools (`read` / `write` / `edit` / `rename` / `upload`), which expect that shape.
- **`mneme://{root}/{path}`** — the navigation form produced by `MnemeTreeProvider.getNavigationUrl`
  and consumed by the content parsers/resolvers + `MnemeProvider` to actually open a document.

This split is the reason a **Mneme-node → Link-editor drop is a no-op** (see US-716, Concern 3): the
dropped node's `href` is scheme-less, so it cannot be stored as a navigable link. If the node's
canonical `href` were `mneme://{root}/{path}`, it could be linked, copied, and opened uniformly, and
the MCP layer would strip the scheme at the boundary.

## Scope (to investigate)

- Make `mneme://{root}/{path}` the node `href` everywhere the tree/drag layer surfaces it.
- Strip the `mneme://` scheme inside `MnemeTreeProvider` / `MnemeProvider` at the MCP call boundary
  (the tools must still receive scheme-less `{root}/{path}`).
- Audit every consumer of the scheme-less form so nothing breaks: `mnemeLinkTraits` (`readMnemeBytes`
  uses `mneme://${href}` — would double-prefix), `MnemeProvider.readBinary`, `getNavigationUrl`,
  `resolveLink`, `stat`, and the parsers/resolvers.
- Decide on a single normalization helper (encode/decode) so the scheme is added/stripped in exactly
  one place.

## Likely files

- `src/renderer/content/tree-providers/MnemeTreeProvider.ts`
- `src/renderer/content/tree-providers/mnemeLinkTraits.ts`
- `src/renderer/content/providers/MnemeProvider.ts`
- `src/renderer/content/mneme-folder-link.ts`
- `src/renderer/content/parsers.ts`, `resolvers.ts` (and `link-utils.ts`)

## Relation to US-716

Independent. US-716 explicitly treats Mneme-node → Link-editor as a documented no-op; this task is the
prerequisite for making that drop create a real `mneme://` link.

## Acceptance criteria (draft)

- [ ] Mneme tree nodes expose `mneme://{root}/{path}` as their `href`; opening, reading, renaming,
      uploading still work (scheme stripped at the MCP boundary).
- [ ] Dragging a Mneme node into a Link editor creates a working `mneme://…` link that opens the doc.
- [ ] No regression in Mneme browse / read / write / rename / search / cross-window copy.
