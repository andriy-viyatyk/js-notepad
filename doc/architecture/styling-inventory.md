# Styling inventory

> **Current snapshot — 2026-08-28.** Re-run the commands below after styling changes. This
> inventory records the source-tree baseline; it is not a conversion plan.

This is the durable source for the renderer's Emotion and literal inline-style inventories. The
application shell and UIKit use co-located static CSS and `VanillaView` DOM updates. React remains
only at the Excalidraw vendor boundary; the counts below distinguish that runtime island from
app-shell style ownership.

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

The current renderer has **0 Emotion importers**.

| Scope | Files |
|---|---:|
| Production | 0 |
| Story | 0 |
| **Total** | **0** |

There are no files importing Emotion.

The shell and coupled components do not import Emotion. Their converted styles are co-located
static CSS in `ui/` and `components/`; `theme/root.css` owns the geometry of `#root` so first-paint
layout does not depend on a React style island. `theme/global-styles.ts` owns the theme-dependent
native stylesheet and subscribes to `themeState`. Story files do not import Emotion.

Runtime keyframes used by converted components now live in static CSS, including the dialog pulse,
notification entry, spinner rotation, and progress-bar indeterminate animation.

## Inline-style inventory

The current literal baseline is **40 JSX `style={{...}}` sites across 20 non-story `.tsx` files**.

| Area | Files | Sites |
|---|---:|---:|
| `editors/` | 19 | 39 |
| `uikit/` | 1 | 1 |
| `components/` | 0 | 0 |
| `theme/` | 0 | 0 |
| **Total** | **20** | **40** |

The non-editor files are:

**`uikit/`**

**`editors/`**

The 19 editor-owned files remain intentionally editor-local and are listed by the verification
command rather than duplicated here. Their inline styles include measured geometry, third-party
handles, editor chrome, and content-specific presentation; they are not part of the shell baseline.

## Ownership and boundaries

`theme/root.css` is static application geometry, while `theme/global-styles.ts` owns the
theme-dependent native stylesheet. The Excalidraw island is the only React boundary and its
`editors/draw/react-island.ts` host is not part of the component-style inventory.

Inline styles remain appropriate for measured layout, image dimensions, and third-party/native
hosts. Static component presentation belongs in a co-located stylesheet and
must preserve selector specificity, `data-*` state behavior, direct-child SVG sizing, keyframes,
theme-token resolution, and computed-style precedence.
