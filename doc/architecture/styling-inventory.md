# Styling inventory

> **Current snapshot — 2026-08-25.** Re-run the commands below after styling changes. This
> inventory records the source-tree baseline; it is not a conversion plan.

This is the durable source for the renderer's Emotion and literal inline-style inventories. The
application shell now uses co-located static CSS and `VanillaView` DOM updates. React remains at a
few named boundaries, so the counts below distinguish residual infrastructure from app-shell style
ownership.

## Reverification commands

Run from the repository root:

```powershell
$emotion = @(rg -l '@emotion/(styled|react)' src/renderer --glob '*.{ts,tsx}' | Sort-Object)
"Emotion files: $($emotion.Count)"
$emotion

$inline = @(rg -n 'style\s*=\s*\{\{' src/renderer --glob '*.tsx' --glob '!*.story.tsx')
"Inline-style sites: $($inline.Count)"
$inline
```

The Emotion command includes story files. The inline-style command excludes stories and counts JSX
`style={{...}}` sites, not individual CSS properties.

## Emotion inventory

The current renderer has **3 Emotion importers**:

| Area | Files | Owners |
|---|---:|---|
| `core/` | 1 | `core/state/view.tsx` React boundary helper |
| `theme/` | 1 | `theme/GlobalStyles.tsx` global-style island |
| `uikit/` | 1 | `Tree/Tree.story.tsx` story harness |
| **Total** | **3** | No `ui/` or `components/` importers |

The four files are:

- `src/renderer/core/state/view.tsx`
- `src/renderer/theme/GlobalStyles.tsx`
- `src/renderer/uikit/Tree/Tree.story.tsx`

The shell and coupled components do not import Emotion. Their converted styles are co-located
static CSS in `ui/` and `components/`; `theme/root.css` owns the geometry of `#root` so first-paint
layout does not depend on the asynchronous commit of the `GlobalStyles` React island. The remaining
Emotion importers are named migration/removal boundaries, not a general app-shell styling pattern.

Runtime keyframes used by converted components now live in static CSS, including the dialog pulse,
notification entry, spinner rotation, and progress-bar indeterminate animation. The remaining UIKit
Emotion importer is the Tree story harness, not production UI.

## Inline-style inventory

The current literal baseline is **70 JSX `style={{...}}` sites across 34 non-story `.tsx` files**.

| Area | Files | Sites | Scope note |
|---|---:|---:|---|
| `editors/` | 26 | 62 | Editor-owned runtime/layout styles; migrate with each editor |
| `uikit/` | 1 | 1 | React/vanilla mount host |
| `ui/` | 1 | 1 | Lazy secondary-view error presentation |
| `components/` | 5 | 5 | Coupled icon and Git badge presentation |
| `theme/` | 1 | 1 | React icon sizing/color path |
| **Total** | **34** | **70** | Non-story `.tsx` only |

The exact current files are:

**`components/`**

- `src/renderer/components/git-tree/GitStatusBadge.tsx`
- `src/renderer/components/git-tree/RefBadge.tsx`
- `src/renderer/components/icons/FileIcon.tsx`
- `src/renderer/components/icons/LanguageIcon.tsx`
- `src/renderer/components/icons/TreeProviderItemIcon.tsx`

**`ui/`**

- `src/renderer/ui/secondary-views/LazySecondaryView.tsx`

**`theme/`**

- `src/renderer/theme/icons.tsx`

**`uikit/`**

- `src/renderer/uikit/shared/mount.tsx`

**`editors/`**

The 34 editor-owned files remain intentionally editor-local and are listed by the verification
command rather than duplicated here. Their inline styles include measured geometry, third-party
handles, editor chrome, and content-specific presentation; they are not part of the shell baseline.

## Ownership and boundaries

`theme/root.css` is static application geometry, while `GlobalStyles.tsx` remains the theme-dependent
React island. `src/renderer/uikit/shared/mount.tsx` is the sanctioned adapter boundary and its
`display: contents` host is included in the inline count because it is a React-facing compatibility
host rather than app styling.

Inline styles remain appropriate for measured layout, image dimensions, and third-party/native
hosts. Static component presentation belongs in a co-located stylesheet and
must preserve selector specificity, `data-*` state behavior, direct-child SVG sizing, keyframes,
theme-token resolution, and computed-style precedence.
