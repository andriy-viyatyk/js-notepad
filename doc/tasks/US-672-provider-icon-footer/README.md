# US-672 — Provider icon in the text-editor footer

**Status:** Implemented — `tsc --noEmit` + `eslint` clean; manual smoke confirmed by the user.
**Spans:** Renderer (`src/renderer/`) only
**Epic:** none (standalone UI enhancement; motivated by EPIC-032 — Mneme docs currently give no
visual cue that they come from the `mneme://` source).

## Goal

In the shared text-editor footer, render a small **provider icon** immediately before the existing
encoding label, so the user can tell at a glance where the open document comes from — local file,
HTTP, or Mneme — e.g. `📁 utf-8`, `🌐 utf-8`, `<mneme> utf-8`. When the pipe also carries an
**`ArchiveTransformer`**, append an **archive icon** after the base provider icon (e.g.
`📁<archive> utf-8`), since an archive entry is a `FileProvider` + `ArchiveTransformer`, not a
provider of its own.

## Background (verified)

### The footer & encoding label

The footer is in the **shared** chrome `src/renderer/editors/base/TextChrome.tsx` — mounted by any
editor whose content host is a `TextFileModel` (Monaco text, Git Diff, Grid, …); non-text editors
render their own chrome. The footer toolbar (`:108-116`):

```tsx
{textHost && (
    <EditorToolbar name="text-chrome-footer" borderTop>
        <ScriptToggleButton host={textHost} />
        <Spacer />
        {footerContributions}
        <Divider orientation="vertical" />
        <EncodingLabel host={textHost} />
    </EditorToolbar>
)}
```

`EncodingLabel` (`:216-223`) reads the encoding off the host state:

```tsx
function EncodingLabel({ host }: { host: TextFileModel }) {
    const encoding = host.state.use((s) => s.encoding);
    return (
        <span style={{ color: color.text.light, padding: "0 4px", fontSize: 13 }}>
            {encoding || "utf-8"}
        </span>
    );
}
```

`color` is already imported in this file. `EditorToolbar` lays out children with `gap="sm"`, so a new
sibling icon needs no explicit margin.

### Reaching the provider from the footer

`TextFileModel` exposes a **public** `pipe: IContentPipe | null` (`text/TextEditorModel.ts:84`).
`IContentPipe` (`api/types/io.pipe.d.ts`) exposes **public readonly** `provider: IProvider` and
`transformers: ReadonlyArray<ITransformer>`. So from inside the footer (which already has
`host: TextFileModel`):

```ts
host.pipe?.provider.type                                  // "file" | "http" | "mneme" | "cache" | "data"
host.pipe?.transformers.some((t) => t.type === "archive") // archive entry?
```

`pipe` is `null` for a brand-new untitled/temp page → render nothing.

### Provider / transformer `type` string literals (verified)

From `content/registry.ts:50-63` and `content/transformers/ArchiveTransformer.ts:17`:

| `type` | Source |
|--------|--------|
| `"file"` | `FileProvider` |
| `"http"` | `HttpProvider` |
| `"mneme"` | `MnemeProvider` |
| `"cache"` | `CacheFileProvider` (transient auto-save; not a real source) |
| `"data"` | `DataUrlProvider` (inline `data:` content) |
| `"archive"` | `ArchiveTransformer` (a **transformer**, not a provider) |

### Available icons (all SVG, accept `width`/`height`/`color`, in `src/renderer/theme/icons.tsx`)

- **`FolderOpenIcon`** — SVG folder, `currentColor`. (`FolderIcon` in
  `components/icons/FileIcon.tsx` is the literal Explorer icon but is **emoji** `📁` — see Concern 2.)
- **`ArchiveIcon`** — WinRAR-style multicolour blocks (fixed colours, ignores `color`).
- **`MemoryIcon`** — Mneme's icon; canonical colour `MEMORY_ICON_COLOR` from
  `theme/palette-colors.ts` (used by `MnemeConfigEditorModel.ts:532`).
- **`GlobeIcon`** — browser/HTTP globe; browser uses `DEFAULT_BROWSER_COLOR` from
  `theme/palette-colors.ts`.

Footer icons elsewhere are rendered at `width={16} height={16}` (e.g. `ArchiveEditor.ts:56`).

## Implementation plan

All edits in **`src/renderer/editors/base/TextChrome.tsx`** (one file).

### 1. Imports

Add to the existing imports:

```ts
import { FolderOpenIcon, GlobeIcon, MemoryIcon, ArchiveIcon } from "../../theme/icons";
import { MEMORY_ICON_COLOR, DEFAULT_BROWSER_COLOR } from "../../theme/palette-colors";
```

### 2. New `ProviderIcon` sub-component (next to `EncodingLabel`, `:216`)

Base icon from the provider type; archive icon appended when the pipe has an `ArchiveTransformer`.
`cache`/`data` and a null pipe render nothing.

```tsx
const PROVIDER_META: Record<string, { label: string; render: () => ReactNode }> = {
    file:  { label: "Local file", render: () => <FolderOpenIcon width={16} height={16} color={color.text.light} /> },
    http:  { label: "HTTP",       render: () => <GlobeIcon width={16} height={16} color={DEFAULT_BROWSER_COLOR} /> },
    mneme: { label: "Mneme",      render: () => <MemoryIcon width={16} height={16} color={MEMORY_ICON_COLOR} /> },
};

function ProviderIcon({ host }: { host: TextFileModel }) {
    // Read state so the footer re-renders on host changes; pipe itself is stable per page.
    host.state.use((s) => s.filePath);
    const pipe = host.pipe;
    if (!pipe) return null;

    const meta = PROVIDER_META[pipe.provider.type];
    const isArchive = pipe.transformers.some((t) => t.type === "archive");
    if (!meta && !isArchive) return null;

    const title = [meta?.label, isArchive ? "Archive" : null].filter(Boolean).join(" · ")
        + (pipe.provider.sourceUrl ? ` — ${pipe.provider.sourceUrl}` : "");

    return (
        <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "0 2px" }}>
            {meta?.render()}
            {isArchive && <ArchiveIcon width={16} height={16} />}
        </span>
    );
}
```

(`ReactNode` is already imported in this file via the existing React import; verify and add if not.)

### 3. Render it before the encoding label (`:113-114`)

```tsx
        <Divider orientation="vertical" />
        <ProviderIcon host={textHost} />
        <EncodingLabel host={textHost} />
```

### Files needing NO changes

- `theme/icons.tsx`, `theme/palette-colors.ts` — icons/constants already exist.
- `content/*` providers/transformers — `type` discriminators already public.
- `TextEditorModel.ts` / `io.pipe.d.ts` — `pipe`, `provider`, `transformers` already public.

## Concerns & proposed resolutions

1. **Reactivity — `pipe` is a plain field, not in `state`.** The footer re-renders on state changes;
   `pipe` is effectively stable for a page's lifetime (a file page never becomes a mneme page). The
   rare swaps (`Save As`, rename) go file→file (same icon). *Resolution:* read `host.pipe` at render
   time; touch `host.state.use(...)` so the component participates in the normal re-render. No new
   subscription needed. (If a real provider-type swap is ever added, promote a `providerType` field
   into state then.)
2. **File icon: SVG vs the literal Explorer emoji.** The Explorer uses `FolderIcon` (emoji `📁`),
   which has no `width`/`height`/`color` and would look out of place beside the SVG globe/mneme/archive
   icons. *Resolution (recommended):* use `FolderOpenIcon` (SVG, themable, footer-consistent). Flagged
   for your call — say the word if you'd rather match the Explorer emoji exactly.
3. **Icon colours.** Proposed: file = `color.text.light` (neutral), http = `DEFAULT_BROWSER_COLOR`,
   mneme = `MEMORY_ICON_COLOR`, archive = its built-in multicolour — i.e. each icon keeps the colour it
   has where it represents that feature elsewhere. *Alternative:* mute them all to `color.text.light`
   for a quieter footer. Recommend the canonical colours (more recognisable); easy to switch in review.
   No new hardcoded colours — `MEMORY_ICON_COLOR`/`DEFAULT_BROWSER_COLOR` are existing palette
   constants already used by the Mneme/browser editors.
4. **`cache` / `data` providers.** A cache pipe is the auto-save mirror (never the displayed source);
   `data:` is inline content. *Resolution:* render no icon for these (the `PROVIDER_META` lookup misses
   and there's no archive transformer → returns null) — only meaningful sources get a badge.
5. **Other `TextChrome` hosts (Grid, Git Diff).** They share this footer. The icon is purely derived
   from the pipe, so it is correct for them too (a grid over a local `.csv` shows the folder icon; a
   Git Diff has a file pipe). No special-casing needed.

## Acceptance criteria

- [x] A local-file text page shows the folder icon before the encoding (`📁 utf-8`).
- [x] An HTTP-opened page shows the globe icon; a `mneme://` page shows the Mneme icon.
- [x] An archive entry shows folder **+** archive icons (`📁<archive> utf-8`).
- [x] Untitled/temp pages (no pipe) and `cache`/`data` pipes show **no** provider icon.
- [x] Hovering the icon shows a tooltip with the provider label (and source URL where available).
- [x] `tsc --noEmit` and `eslint` are clean.

> **Renderer task** — in scope for `/review`; `/document` only if a Key Files / standards pointer is
> warranted; `/userdoc` if the footer change is worth a user-facing note. Standalone (no epic) — on
> completion, follow the standalone-task completion steps.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/renderer/editors/base/TextChrome.tsx` | add `ProviderIcon` sub-component (base provider icon + appended archive icon + tooltip); render it between the footer `Divider` and `EncodingLabel`; import the four icons + two palette colours |
