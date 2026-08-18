# US-979: Inline style inventory

**Status:** Implemented — reviewed as part of EPIC-051 close-out
**Created:** 2026-08-18
**Epic:** [EPIC-051 — De-React Epic P](../../epics/EPIC-051.md)

## Goal

Measure and classify the renderer's ordinary inline style surface so Epic A has the other half of
the styling estimate alongside [US-975's Emotion inventory](../US-975-emotion-inventory/README.md).
The task records exact sites and ownership; it does not convert inline styles or choose the final
CSS-variable/class strategy.

## Background

US-975's six dynamic Emotion files are not the whole dynamic-style problem: many runtime values
are already written through React's `style={{ ... }}` prop instead of an Emotion callback. The
pinned scan below finds 133 literal inline-style sites across 51 non-story `.tsx` files.

This count is intentionally precise. It covers `style={{ ... }}` JSX sites, not every possible
style path. In particular, `style={p.style}`, `style={model.blockStyles?.root}`, CSS files,
Emotion definitions, and serialized style objects passed through other APIs need their own
handling or an explicit exclusion.

## Inventory

### Pinned measurement

Run from the repository root:

```powershell
rg -n 'style\s*=\s*\{\{' src/renderer --glob '*.tsx' --glob '!*.story.tsx'
```

Measured result on 2026-08-18:

| Area | Files | Sites | Scope note |
|---|---:|---:|---|
| `editors/` | 35 | 103 | Editor-owned runtime/layout styles; converts with each editor in Epic E |
| `uikit/` | 6 | 18 | Shared primitive and RenderGrid surfaces |
| `ui/` | 3 | 4 | Shell styles |
| `components/` | 6 | 7 | Coupled component and cell styles |
| `theme/` | 1 | 1 | Icon SVG sizing/style site |
| **Total** | **51** | **133** | **Non-story `.tsx` only** |

### Exact file list

**`components/` — 6 files**

- `src/renderer/components/file-search/FileSearch.tsx`
- `src/renderer/components/git-tree/BranchTreeCell.tsx`
- `src/renderer/components/git-tree/GitStatusBadge.tsx`
- `src/renderer/components/git-tree/RefBadge.tsx`
- `src/renderer/components/icons/LanguageIcon.tsx`
- `src/renderer/components/icons/TreeProviderItemIcon.tsx`

**`editors/` — 35 files**

- `src/renderer/editors/base/ContentHostFooter.tsx`
- `src/renderer/editors/board/BoardEditorView.tsx`
- `src/renderer/editors/board/BoardGlyph.tsx`
- `src/renderer/editors/board/BoardWebview.tsx`
- `src/renderer/editors/browser/BrowserDownloadsPopup.tsx`
- `src/renderer/editors/browser/BrowserTabsPanel.tsx`
- `src/renderer/editors/browser/BrowserView.tsx`
- `src/renderer/editors/browser/DownloadButton.tsx`
- `src/renderer/editors/draw/DrawBody.tsx`
- `src/renderer/editors/graph/GraphDetailPanel.tsx`
- `src/renderer/editors/graph/index.tsx`
- `src/renderer/editors/link-editor/EditLinkDialog.tsx`
- `src/renderer/editors/link-editor/LinksList.tsx`
- `src/renderer/editors/link-editor/LinksTiles.tsx`
- `src/renderer/editors/link-editor/LinkTooltip.tsx`
- `src/renderer/editors/link-editor/panels/LinkCategoryPanel.tsx`
- `src/renderer/editors/link-editor/PinnedLinksPanel.tsx`
- `src/renderer/editors/log-view/items/McpRequestView.tsx`
- `src/renderer/editors/log-view/items/MermaidOutputView.tsx`
- `src/renderer/editors/log-view/items/TextOutputView.tsx`
- `src/renderer/editors/mcp-inspector/McpInspectorView.tsx`
- `src/renderer/editors/mcp-inspector/PromptsPanel.tsx`
- `src/renderer/editors/mcp-inspector/ResourceContentView.tsx`
- `src/renderer/editors/mcp-inspector/ToolResultView.tsx`
- `src/renderer/editors/notebook/category-tree.tsx`
- `src/renderer/editors/notebook/ExpandedNoteView.tsx`
- `src/renderer/editors/notebook/note-editor/NoteItemToolbar.tsx`
- `src/renderer/editors/notebook/NoteItemView.tsx`
- `src/renderer/editors/notebook/TagsListView.tsx`
- `src/renderer/editors/rest-client/ResponseViewer.tsx`
- `src/renderer/editors/settings/SettingsView.tsx`
- `src/renderer/editors/settings/sections/BrowserProfilesSection.tsx`
- `src/renderer/editors/settings/sections/SettingsSections.tsx`
- `src/renderer/editors/settings/sections/ThemeSection.tsx`
- `src/renderer/editors/svg/SvgBody.tsx`

**`theme/` — 1 file**

- `src/renderer/theme/icons.tsx`

**`ui/` — 3 files**

- `src/renderer/ui/app/Pages.tsx`
- `src/renderer/ui/secondary-views/LazySecondaryView.tsx`
- `src/renderer/ui/sidebar/MenuBar.tsx`

**`uikit/` — 6 files**

- `src/renderer/uikit/AVGrid/utils.tsx`
- `src/renderer/uikit/Minimap/Minimap.tsx`
- `src/renderer/uikit/RadioGroup/RadioGroup.tsx`
- `src/renderer/uikit/RenderGrid/RenderGrid.tsx`
- `src/renderer/uikit/Spacer/Spacer.tsx`
- `src/renderer/uikit/Tooltip/Tooltip.tsx`

### Highest-density files

These files account for the largest clusters and should be the first review targets when Epic A
classifies values as static layout, scalar runtime data, or a view-owned measurement/geometry:

| File | Sites |
|---|---:|
| `editors/notebook/NoteItemView.tsx` | 13 |
| `uikit/RenderGrid/RenderGrid.tsx` | 11 |
| `editors/notebook/ExpandedNoteView.tsx` | 9 |
| `editors/link-editor/LinksTiles.tsx` | 9 |
| `editors/notebook/TagsListView.tsx` | 8 |
| `editors/settings/sections/ThemeSection.tsx` | 7 |
| `editors/settings/sections/BrowserProfilesSection.tsx` | 6 |
| `editors/link-editor/LinksList.tsx` | 5 |
| `editors/link-editor/PinnedLinksPanel.tsx` | 4 |
| `editors/link-editor/panels/LinkCategoryPanel.tsx` | 4 |
| `editors/link-editor/LinkTooltip.tsx` | 4 |

## Implementation plan

This task intentionally produces documentation only; it does not rewrite JSX or CSS.

1. **Freeze the literal inline-style baseline.** Keep the pinned command, the 133-site / 51-file
   result, the area table, and the exact file list together. A site means one JSX `style={{...}}`
   prop, not one CSS property inside that object.

2. **Classify each site for Epic A.** For every listed site, record whether its values are static
   layout, theme-token-based, discrete state, scalar runtime geometry, third-party handle state,
   or a measured DOM result. The eventual migration should keep DOM measurements and imperative
   handle mirrors with their owning view/model boundary rather than forcing them into global CSS.

3. **Separate dynamic paths not covered by the regex.** During the handoff, inspect `style={...}`
   spreads and model-provided style objects, including RenderGrid's `p.style` and
   `model.blockStyles`. Record them as additional categories instead of silently treating the
   133-site result as exhaustive.

4. **Respect ownership boundaries.** UIKit and shell sites can inform Epic A's shared CSS/token
   work. Editor sites remain editor-owned and should be converted with their editor in Epic E,
   consistent with Epic P's D1 boundary. Theme/icon sizing needs to preserve SVG behavior and
   should not be mixed with arbitrary editor layout styles.

5. **Handoff without choosing open decision #4.** Publish the inventory beside US-975 so Epic A
   can decide whether scalar values become CSS custom properties, direct DOM styles, or generated
   class hooks. No source or dependency change belongs in US-979.

## Concerns / Open questions

1. **The regex is a baseline, not a complete style inventory.** `style={p.style}` and spread/model
   style objects may carry more sites than the 133 literal sites. They need a second scan and
   should not be silently folded into this number.

2. **Inline style precedence is behavior-sensitive.** Moving a value to a stylesheet can change
   precedence relative to Emotion classes, CSS files, `!important`, pseudo-classes, and generated
   content. Each conversion needs a before/after DOM check for the computed value and the active
   interaction state.

3. **Some values are not CSS configuration.** Geometry from measured elements, RenderGrid cell
   placement, image dimensions, and third-party/webview sizing are view-owned runtime values.
   They may remain direct DOM writes in a vanilla view rather than becoming CSS variables.

4. **Theme values should remain token-based.** Inline styles already use `color.*` in several
   places. The token foundation must preserve theme switching without baking resolved colors into
   long-lived style objects or moving editor-specific colors into global CSS.

5. **Editor concentration is intentional.** 35 of 51 files and 103 of 133 sites are under
   `editors/`. This is not a reason to expand Epic P; it is evidence that the eventual editor
   conversion needs a style sub-checklist in each editor task.

## Acceptance criteria

- [ ] The pinned scan reconciles to 133 `style={{...}}` sites across 51 non-story `.tsx` files.
- [ ] The area table and exact file list reconcile to the scan: editors 35/103, uikit 6/18,
      ui 3/4, components 6/7, and theme 1/1.
- [ ] The highest-density files are recorded for first-pass review.
- [ ] The document explicitly distinguishes literal `style={{...}}` sites from `style={...}`
      objects, CSS files, Emotion styles, and model-provided style paths.
- [ ] Ownership and conversion categories are recorded without selecting roadmap open decision #4.
- [ ] No renderer source or package dependency is changed by US-979; it is an inventory and Epic A
      handoff only.
