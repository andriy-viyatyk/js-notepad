# Styling inventory

> **Current snapshot — 2026-08-27.** Re-run the commands below after styling changes. This
> inventory records the source-tree baseline; it is not a conversion plan.

This is the durable source for the renderer's Emotion and literal inline-style inventories. The
application shell now uses co-located static CSS and `VanillaView` DOM updates. React remains at
named boundaries, so the counts below distinguish residual infrastructure from app-shell style
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

The current renderer has **1 Emotion importer, all in production code**.

| Scope | Files |
|---|---:|
| Production | 1 |
| Story | 0 |
| **Total** | **1** |

The files are:

- `src/renderer/theme/GlobalStyles.tsx`

The shell and coupled components do not import Emotion. Their converted styles are co-located
static CSS in `ui/` and `components/`; `theme/root.css` owns the geometry of `#root` so first-paint
layout does not depend on the asynchronous commit of the `GlobalStyles` React island.
`GlobalStyles.tsx` is the renderer's only non-story Emotion importer and the final production
Emotion boundary. Story files do not import Emotion.

Runtime keyframes used by converted components now live in static CSS, including the dialog pulse,
notification entry, spinner rotation, and progress-bar indeterminate animation.

## Inline-style inventory

The current literal baseline is **46 JSX `style={{...}}` sites across 26 non-story `.tsx` files**.

| Area | Files | Sites |
|---|---:|---:|
| `editors/` | 19 | 39 |
| `uikit/` | 1 | 1 |
| `components/` | 5 | 5 |
| `theme/` | 1 | 1 |
| **Total** | **26** | **46** |

The non-editor files are:

**`components/`**

- `src/renderer/components/git-tree/GitStatusBadge.tsx`
- `src/renderer/components/git-tree/RefBadge.tsx`
- `src/renderer/components/icons/FileIcon.tsx`
- `src/renderer/components/icons/LanguageIcon.tsx`
- `src/renderer/components/icons/TreeProviderItemIcon.tsx`

**`theme/`**

- `src/renderer/theme/icons.tsx`

**`uikit/`**

- `src/renderer/uikit/shared/mount.tsx`

**`editors/`**

The 21 editor-owned files remain intentionally editor-local and are listed by the verification
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
