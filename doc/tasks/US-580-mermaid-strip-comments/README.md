# US-580: Mermaid — strip comment lines before rendering

*(Standalone task, no epic. Planned — not for immediate implementation. Investigation complete 2026-05-27.)*

## Goal

Make Persephone's Mermaid renderer tolerate `%%` comment lines that appear **before** the diagram-type keyword (e.g. `erDiagram`, `flowchart`), which today cause a hard parse error. Strip full-line comments from the markup before handing it to `mermaid.render()`, so externally-authored `.mmd` files (commonly produced by other agents/tools that prepend a comment header) render instead of failing.

## Background

### The failure

A `.mmd` file that begins with a comment header fails to render:

```
%% DNC Preference Management — database schema (DRAFT)
%% ...several more comment lines...
erDiagram
    Patients { ... }
```

Persephone shows:

```
Parse error on line 1:
%%erDiagram    Pa
^
Expecting 'ER_DIAGRAM', got '%'
```

Mermaid's grammar requires the **diagram-type keyword to be the first significant token**. Leading `%%` comment lines push the keyword off the front and the parser chokes. (Comments placed *after* the keyword are tolerated by Mermaid itself; only the leading ones break parsing — but full-line comments anywhere are semantically inert, so stripping all of them is safe.)

### Render pipeline — single chokepoint

All three Mermaid render sites funnel through one function, `renderMermaidSvg` in `src/renderer/editors/mermaid/render-mermaid.ts:135`:

| Call site | File | Path |
|-----------|------|------|
| Standalone `.mmd` editor | `MermaidEditor.ts:302` | `renderMermaid()` → `renderMermaidSvg()` |
| Markdown inline ```` ```mermaid ```` blocks | `markdown/CodeBlock.tsx:93` | `renderMermaidSvg()` directly |
| Log-view mermaid output entries | `log-view/items/MermaidOutputView.tsx:52` | `renderMermaidSvg()` directly |

`renderMermaid()` (line 155) is just `renderMermaidSvg()` + `svgToDataUrl()`. So **stripping comments once inside `renderMermaidSvg`, immediately before `mermaid.render()`, covers every render path** with no per-call-site change.

Current `renderMermaidSvg` body (line 135):

```typescript
export async function renderMermaidSvg(content: string, lightMode: boolean): Promise<string> {
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({ startOnLoad: false, theme: lightMode ? "default" : "dark", securityLevel: "loose" });
    const id = `mermaid-render-${++renderCounter}`;
    const { svg } = await mermaid.render(id, content);   // <-- strip `content` before this
    return svg;
}
```

## Implementation plan

### Step 1 — add `stripMermaidComments` helper

In `src/renderer/editors/mermaid/render-mermaid.ts`, add a small pure helper:

```typescript
/**
 * Remove full-line Mermaid comments (`%% ...`) from markup.
 *
 * Mermaid requires the diagram-type keyword (erDiagram, flowchart, …) to be
 * the first significant token; leading comment lines cause a hard parse error.
 * Full-line comments are semantically inert to Mermaid, so removing them is
 * safe regardless of position.
 *
 * Preserves directive lines `%%{ ... }%%` (init/config) — these are NOT
 * comments. Only strips lines whose first non-whitespace token is `%%` NOT
 * followed by `{`. Mid-line trailing `%%` comments are left untouched (Mermaid
 * handles them, and a label may legitimately contain `%%`).
 */
export function stripMermaidComments(content: string): string {
    return content
        .split(/\r?\n/)
        .filter((line) => !/^\s*%%(?!\{)/.test(line))
        .join("\n");
}
```

### Step 2 — apply it in `renderMermaidSvg`

```typescript
const { svg } = await mermaid.render(id, stripMermaidComments(content));
```

That single edit propagates to the `.mmd` editor, Markdown inline diagrams, and log-view outputs.

### Step 3 — verify

- `npm run lint` clean on `render-mermaid.ts`.
- Manual: open a `.mmd` file with a leading `%%` comment header (e.g. the DNC `database-schema.mmd` repro) — it renders.
- Manual: a diagram using a `%%{init: {...}}%%` directive still applies the directive (not stripped).
- Manual: a Markdown ```` ```mermaid ```` block with a leading comment renders inline.

## Concerns / Open questions

- **C1 — Directive preservation (resolved).** `%%{init: ...}%%` config directives must survive. The regex `/^\s*%%(?!\{)/` excludes any line whose `%%` is immediately followed by `{`, so directives pass through. **This is the one line that must not regress** — add a directive case to the manual verification.
- **C2 — Strip-all vs strip-leading-only (decision).** We could strip only the leading comment block (up to the first non-comment, non-blank line) to be maximally conservative. Recommendation: **strip all full-line comments** — they are inert to Mermaid, the implementation is simpler, and it also cleans up trailing/interleaved comment lines that some generators emit. No behavior is lost because Mermaid discards them anyway.
- **C3 — Mid-line trailing comments (out of scope).** Lines like `A --> B %% note` are left untouched: Mermaid already strips trailing comments, and naïvely cutting at `%%` could corrupt a label that contains `%%`. Full-line-only is the safe boundary.
- **C4 — No state/schema change.** This is a pure pre-processing transform on the render input. No editor state, persistence, or facade surface changes. The stored/edited file content is unchanged — only the string handed to `mermaid.render()` is filtered, so the user still sees their comments in the source editor.
- **C5 — EPIC-028 interaction (none).** `render-mermaid.ts` is carried over verbatim by the US-562 Mermaid v4 migration ("Unchanged" per US-562 task doc). This edit is orthogonal and lands cleanly whether US-562 has shipped or not — it touches only the shared util, which both the legacy `MermaidViewModel` and the v4 `MermaidEditor` consume.

## Acceptance criteria

- A `.mmd` file beginning with one or more `%%` comment lines renders instead of showing `Parse error … Expecting 'ER_DIAGRAM', got '%'`.
- A diagram with a `%%{init: ...}%%` directive still has the directive applied.
- Markdown inline mermaid blocks and log-view mermaid outputs benefit from the same fix (no separate edit).
- `npm run lint` clean; no TypeScript errors introduced.

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/editors/mermaid/render-mermaid.ts` | Add exported `stripMermaidComments(content)` helper; call it in `renderMermaidSvg` before `mermaid.render()`. |
