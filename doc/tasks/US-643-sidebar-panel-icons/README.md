# US-643: Sidebar panel headers — editor icon + shared icon resolver

> **Status: implemented** (awaiting manual testing). All 7 steps done; `tsc` + lint clean.
> Verified: `GitIcon` is `currentColor` (tints accent-blue when active); Todo/Link icons use
> fixed cyan fills (keep color); Explorer folder is the 📁 emoji (keeps yellow).
>
> Follow-on: the Storybook editor had no tab/panel icon, so a new `StorybookIcon` (book +
> bookmark, Storybook pink) was added to `theme/icons.tsx` and wired into
> `StorybookEditorModel.getIcon`.

## Goal

Make sidebar secondary-view panels visually distinguishable per editor by rendering the
**editor's icon at the start of each panel header** — the same icon shown on the Persephone
page tab when that editor is a page's main editor. Extract the icon-resolution logic into a
single shared helper so the page tab, the sidebar panels, and any future call site all use
one source of truth.

This task also absorbs an already-completed adjustment to the Git Tree sidebar panels
(repository-name **badge** in the header + a portal click-through fix) so the header-polish
work is reviewed together.

## Background

### How the page tab resolves its icon (the source of truth to reuse)

`src/renderer/ui/tabs/PageTab.tsx` (lines 622–647) picks the tab icon from the editor model:

```tsx
{editor?.noLanguage ? (
    <span data-part="empty-language" data-with-icon={editor.getIcon ? "" : undefined}>
        {editor.getIcon ? editor.getIcon() : null}
    </span>
) : (
    // language-based editors: a colored file-type icon, wrapped in the language menu
    <IconButton ... icon={<LanguageIcon language={language} fileName={title} />} ... />
)}
```

So the icon is determined entirely from the `EditorModel` instance:

- **`noLanguage === true`** → call `editor.getIcon?.()` (each such editor assigns its own
  icon in its constructor). `getIcon` is an optional field on the base
  `EditorModel` (`src/renderer/editors/base/EditorModel.ts:71`, `noLanguage` at `:72`).
- **`noLanguage === false`** (the default) → `<LanguageIcon language={model.language} fileName={model.title} />`
  (`LanguageIcon` from `src/renderer/components/icons/LanguageIcon`), which resolves a
  colored file-type icon from the language id / filename.

Per-editor icon declarations (relevant to editors that have sidebar panels):

| Editor | `noLanguage` | Icon |
|--------|--------------|------|
| GitTreeEditorModel | `true` | `<GitIcon>` |
| ArchiveEditor | `true` | `<ArchiveIcon>` |
| ExplorerEditor | `true` | **none** (`getIcon` not defined) |
| FileDiffEditor | `false` | `<CompareIcon>` (overrides via `getIcon` despite `noLanguage=false`) |
| NotebookEditor | `false` | `LanguageIcon` resolves `*.note.json` → `NotebookIcon` |
| TodoEditor | `false` | `LanguageIcon` resolves `*.todo.json` → `TodoIcon` |
| LinkEditor | `false` | `LanguageIcon` resolves `*.link.json` → `LinkIcon` |
| RestClientEditor | `false` | `LanguageIcon` resolves `*.rest.json` → `RestClientIcon` |

### How sidebar panels are rendered

`src/renderer/ui/secondary-views/SecondaryViews.tsx` enumerates every `(model, panelId)`
pair and renders a `CollapsiblePanel` per panel. The `model` (an `EditorModel`) **is already
in scope** at the exact map where each `CollapsiblePanel` is created (lines 88–103):

```tsx
{rendered.map(({ model, panelId, key, refKey }) => (
    <CollapsiblePanel
        key={refKey}
        id={key}
        name={panelId}
        headerRef={(el) => setHeaderRef(refKey, el)}
        alwaysRenderContent
        // ← icon injection point
    >
        <LazySecondaryView model={model as never} panelId={panelId} headerRef={...} />
    </CollapsiblePanel>
))}
```

`CollapsiblePanel` already exposes an unused **`icon?: ReactNode`** prop
(`src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.tsx:29`). It is rendered as
`{panel.icon}` inside the `data-part="header"` div (line ~210), **before** the portaled label
and **in the same React tree as the header's toggle `onClick`** — so unlike the portaled
content it needs no click-through workaround; clicking the icon toggles the panel naturally.
(The collapse/expand chevron is only shown when `!headerRef && !buttons`, so it never appears
for portaled secondary views and won't collide with the icon.)

Each secondary view portals its own header via `createPortal(headerContent, headerRef)`. The
first element of each header today:

| Secondary view | Editor | Panel id | Current header start |
|----------------|--------|----------|----------------------|
| ExplorerSecondaryView | Explorer | `explorer` | `"Explorer"` |
| SearchSecondaryView | Explorer | `search` | `<Text>"Search …"` |
| ArchiveSecondaryView | Archive | `archive-tree` | `"Archive"` |
| TodoSecondaryView | Todo | `todo-panel` | `"Todo"` |
| RestPanelSecondaryView | Rest client | `rest-panel` | `"Rest"` |
| NotebookCategoriesSecondaryView | Notebook | `notebook-categories` | `"Categories"` |
| NotebookTagsSecondaryView | Notebook | `notebook-tags` | `"Tags"` |
| LinkCategorySecondaryView | Links | `link-category` | `"Collections"` |
| LinkTagsSecondaryView | Links | `link-tags` | `"Tags"` |
| LinkHostnamesSecondaryView | Links | `link-hostnames` | `"Hostnames"` |
| GitChangesSecondaryView | Git Tree | `git-changes` | repo-name `<Tag>` + `"Changes (N)"` |
| GitBranchesSecondaryView | Git Tree | `git-branches` | repo-name `<Tag>` + `"Branches & Tags"` |
| GitDiffRevisionsSecondaryView | File Diff | `git-diff-revisions` | `"File History"` |

Because the icon is per **editor model**, two panels from the same editor (Notebook's
Categories + Tags, Links' three panels) get the **same** icon — distinguishability between
same-editor panels still relies on the label. That is acceptable and matches the goal
(distinguish panels from *different* editors).

### Header icon CSS

`CollapsiblePanelStack.tsx` sizes header icons via `& [data-part="header"] > svg { width:14;
height:14 }` — **direct-child SVGs only**. The header text color is `color.text.light`, and
turns `color.misc.blue` when the panel is open.

### Already-completed adjustment folded into this task's scope

The following were implemented in the session that created this task and are part of US-643's
review scope:

- **Git panels repo-name badge.** `GitChangesSecondaryView` and `GitBranchesSecondaryView`
  now render the repository name as an outlined `<Tag variant="outlined" size="sm">` (wrapped
  in a `<Panel direction="row" gap="sm">`), mirroring the Git Tree editor toolbar, instead of
  the old `[name]` inline text.
- **Portal click-through fix.** `CollapsiblePanelStack.tsx` extended its
  `pointer-events: none` rule (which lets a portaled header label pass its click through to
  the header div's toggle `onClick`) from `[data-type="text"]` to also cover
  `[data-type="tag"]` and `[data-type="panel"]`, with a companion rule re-asserting
  `pointer-events: auto` on interactive descendants (`button`, `icon-button`, clickable
  `tag`). Without this, the new `Tag`/`Panel` wrapper swallowed the toggle click.

## Implementation plan

### 1. Shared icon resolver — `EditorIcon`

Create `src/renderer/components/icons/EditorIcon.tsx`. A single component (and/or a
`getEditorIcon()` function) that encapsulates the page-tab decision:

```tsx
// Accepts a minimal structural shape (avoid a hard import of EditorModel to keep
// components/icons decoupled): { noLanguage?, getIcon?, language?, title? }.
export interface EditorIconSource {
    noLanguage?: boolean;
    getIcon?: () => React.ReactNode;
    language?: string;
    title?: string;
}

export function EditorIcon({ editor }: { editor: EditorIconSource }) {
    return editor.noLanguage
        ? <>{editor.getIcon?.() ?? null}</>
        : <LanguageIcon language={editor.language ?? ""} fileName={editor.title} />;
}
```

- Resolves the **same icon node the page tab renders** — no size override. The icons already
  carry their own sizing (they display correctly on the tab today), and the header's existing
  `& [data-part="header"] > svg { width:14; height:14 }` rule sizes direct-child SVGs. Do not
  add a forced size box up front; if a specific icon (e.g. an img-based one) renders at the
  wrong size in the header, fix that icon's case reactively.
- Returns nothing when there is no icon — caller renders nothing.

### 2. Per-panel icon override in the registry

Most panels use the **editor** icon (distinguish by editor). A few sidebar-only sub-panels
want their own icon regardless of editor — e.g. Explorer's `search` panel should show a
search icon, not Explorer's folder icon. Support this with an optional per-panel override:

- Add `icon?: React.ReactNode` to `SecondaryViewDefinition`
  (`src/renderer/ui/secondary-views/secondary-view-registry.ts`).
- In `register-editors.ts`, register the **`search`** panel with `icon: <SearchIcon />`
  (`SearchIcon` from `theme/icons` — the same glyph used in search inputs and on the Explorer
  panel's Search button). Leave all other registrations without an `icon` so they fall back to
  the editor icon.

### 3. Wire into the sidebar

In `SecondaryViews.tsx`, resolve each panel's icon as **registry override first, editor icon
otherwise**, and pass it to `CollapsiblePanel`:

```tsx
const def = secondaryViewRegistry.get(panelId);
const panelIcon = def?.icon ?? <EditorIcon editor={model} />;
// ...
<CollapsiblePanel ... icon={panelIcon} />
```

No change to the secondary-view components themselves and no change to `SecondaryViewProps`.

### 4. Refactor the page tab to reuse the resolver (single source of truth)

In `PageTab.tsx`, source the icon element from the same resolver so the tab and the sidebar
can never drift:

- The `noLanguage` branch becomes `<EditorIcon editor={editor} size={…} />` (replacing the
  inline `editor.getIcon?.()` span).
- The language branch keeps its `WithMenu`/`IconButton` wrapper (the tab's language menu is
  tab-specific) but uses the **same** `LanguageIcon` call the resolver uses — or, cleaner,
  the resolver exposes the icon node and the tab wraps it. Keep the language-switching menu
  behavior intact; only the icon *element* is shared.

Verify the tab still looks identical (size, language menu, empty-language spacer behavior).

### 5. Give Explorer a folder icon (decided)

`ExplorerEditor` is `noLanguage=true` with no `getIcon`, so it currently shows no panel icon.
Assign it `getIcon = () => <FolderIcon />` using **`FolderIcon` from
`src/renderer/components/icons/FileIcon`** — the exact icon the explorer tree shows for
folders (`TreeProviderItemIcon.tsx:28`). Explorer is sidebar-only (never a page main editor),
so this icon will essentially only ever appear on its panel header, not on a page tab.

### 6. Icon coloring under the open-panel state (decided)

Desired behavior:
- Icons with an **intrinsic/fixed color** (cyan Links/Todo, yellow Explorer folder, etc.) →
  **keep their own color** in every state.
- **Monochrome** icons with no special color (e.g. `GitIcon`) → render in the header color:
  `color.text.light` at rest, **`color.misc.blue` (accent) when the panel is expanded/active**.

This is exactly what `currentColor` inheritance produces, so the implementation is to **NOT**
isolate the icon box from the header `color` — let it cascade in. Icons that paint with
explicit fills ignore `color` and keep their hue; icons that paint with `currentColor` follow
the header's `color` (which the existing open-state rule already switches to blue). The
`EditorIcon` wrapper must therefore **not** set its own `color`.

Verification step: confirm `GitIcon` uses `currentColor` (so it tints to accent when active)
and that Links/Todo/Explorer icons use explicit fills (so they stay colored). Adjust only if
a specific icon behaves contrary to this rule.

### 7. Lint + typecheck

`npx tsc --noEmit` and `npm run lint` clean.

## Concerns / open questions

1. **Explorer icon — DECIDED.** `ExplorerEditor.getIcon = () => <FolderIcon />` (the explorer
   tree's folder icon, from `components/icons/FileIcon`). Explorer is sidebar-only, so it
   won't appear on a page tab in practice.
2. **Icon color under open state — DECIDED.** Fixed-color icons keep their color always;
   monochrome (`currentColor`) icons follow the header color → accent blue when active. Achieved
   by letting header `color` cascade into the icon (do not set a `color` on the `EditorIcon`
   box). (Implementation step 6.)
3. **Non-svg icons (img-based) — DECIDED.** Render icons as the page tab does and rely on
   their existing sizing (they display correctly on the tab); no forced size box up front. If
   a specific img-based icon renders wrong in the header, fix that case reactively.
4. **Same-editor panels share an icon — DECIDED.** Notebook (2 panels) and Links (3 panels)
   show the same editor icon on each of their panels — distinguished only by label. This is the
   intended behavior.
5. **Where the resolver lives.** `components/icons/EditorIcon.tsx` (persephone-coupled, next
   to `LanguageIcon`) — NOT uikit, since it depends on editor-model shape and `LanguageIcon`.
6. **Search panel — DECIDED.** Explorer's `search` panel uses its own `SearchIcon` (the glyph
   on the Explorer header's "open search" button), via the per-panel registry override — not
   the Explorer folder icon. This establishes the override mechanism (step 2).

## Acceptance criteria

- Every sidebar secondary-view panel header shows the editor's icon at the start, matching the
  icon that editor shows on its page tab.
- Panels from different editors are visually distinguishable by their leading icon.
- Clicking the icon (and the rest of the non-button header) still toggles the panel
  (no regression from the portal click-through behavior).
- Page tab icons are unchanged in appearance and behavior (language menu still works).
- A single shared resolver (`EditorIcon` / `getEditorIcon`) is the source of truth, used by
  both `PageTab.tsx` and `SecondaryViews.tsx`.
- Git panels' repo-name badge + the portal click-through fix are included and reviewed.
- `tsc` and lint clean.
