# Component Creation Guide

> Read this before creating a new UI component. For the full set of UIKit authoring rules (data-attribute state model, controlled-component contract, trait-based data binding, naming conventions, design tokens, file template), see [`src/renderer/uikit/CLAUDE.md`](../../src/renderer/uikit/CLAUDE.md) — that file is the canonical reference.

## Where to put your component

Walk the decision tree from the top. Stop at the first match.

| Question | Answer | Location |
|----------|--------|----------|
| Does only this editor use it? | Yes | `src/renderer/editors/<editor-name>/components/` *(private to that editor)* |
| Is it part of the app shell — page tabs, sidebar, navigation bar, dialog — and unique to Persephone? | Yes | `src/renderer/ui/<feature>/` *(not a reusable component — owned by the screen)* |
| Does it depend on `app.*` APIs, the page model, file system, or the scripting system? | Yes | `src/renderer/components/<existing-keep-folder>/` *(valid: `icons/`, `page-manager/`, `file-search/`, `tree-provider/`, `file-list/`, `file-grid/`, `git-tree/`)* |
| Otherwise — reusable primitive with no app coupling | | `src/renderer/uikit/<ComponentName>/` *(canonical home for new reusable components)* |

See [/doc/standards/uikit-vs-components-split.md](./uikit-vs-components-split.md) for the permanent contract that defines what belongs in `uikit/` vs `components/`.

## Authoring rules

**UIKit primitives** follow the rules in [`src/renderer/uikit/CLAUDE.md`](../../src/renderer/uikit/CLAUDE.md). Briefly:

- **Rule 1** — `data-type` (required) + `data-*` state attributes on the root element; style state via Emotion attribute selectors, never via class names.
- **Rule 2** — controlled components only; never `useState` for the component's primary value.
- **Rule 3** — list/collection props accept `T[] | Traited<T[]>`; resolve with `resolveTraited(items, KEY)` at the top.
- **Rule 4** — roving tabindex inside keyboard-navigable widgets (Toolbar, Tree, ListBox, SegmentedControl, Tab bar).
- **Rule 5** — focus trap inside modal dialogs.
- **Rule 6** — `ComponentSet` descriptor pattern for runtime-built UIs.
- **Rule 7** — no Emotion outside `uikit/` in app code, and no `style=` / `className=` **on a UIKit component** (exception: `src/renderer/ui/` chrome). The `style`/`className` half of the rule scopes to UIKit components, not to raw HTML elements — an inline style object on a plain `<img>` or `<div>` in app code is fine, and is the intended escape hatch when a one-off element needs sizing that no UIKit primitive covers.
- **Rule 8** — model-view pattern (`TComponentModel`) once a component exceeds the small-and-readable threshold.
- **Rule 9** — icon slots use `IconRef` and render through `renderIcon`; a string is always a registry name, never literal fallback text. Use plain `string` for text-bearing props, and reserve `SlotText` for the small set of props that genuinely accept rich React content.

The icon registry is the neutral boundary for reusable components. `IconName` is derived from the
single registry record in `src/renderer/theme/icon-registry.ts`; `renderIcon(name, props?)`
resolves a name and preserves SVG props when a caller needs them. A missing name renders nothing
and warns in development, so misspellings cannot silently become toolbar text. Resolver components
such as `LanguageIcon` and `FileIcon`, and language-specific glyphs, remain React-node inputs rather
than duplicate registry entries when their output is selected from data.

For text slots, prefer `string` whenever callers supply data text. `SlotText` documents an
intentional rich-content exception; it is not a way to make every public prop React-shaped. An
arbitrary subtree belongs in `children` or a named child slot and should cross a future view
boundary as a mounted subtree, not as a framework-specific callback.

**Persephone-coupled components** (the KEEP folders inside `components/`) may import `api/`, `core/`, and `theme/` directly — that's the criterion for living in `components/` at all. They should still use UIKit primitives (`Button`, `Tooltip`, `IconButton`, `Panel`, …) for primitive rendering rather than re-implementing them.

## Naming conventions

- Component name — PascalCase (`Button`, `MultiSelect`).
- File name — `<ComponentName>.tsx` inside the component's own subfolder.
- `data-type` attribute — kebab-case matching the component name (`data-type="multi-select"`).
- `name?: string` debug prop — every UIKit primitive accepts it and emits it as `data-name="…"` on the same root element that carries `data-type` (see [US-521](../tasks/US-521-uikit-name-debug-attribute/README.md) and [US-522](../tasks/US-522-uikit-debug-naming-rollout/README.md) for the rationale and rollout).
- For the canonical naming table (old name → new name) and prop-naming guidelines, see the **Naming conventions** section in [`uikit/CLAUDE.md`](../../src/renderer/uikit/CLAUDE.md).

## Component file template

Use the template at the bottom of [`uikit/CLAUDE.md`](../../src/renderer/uikit/CLAUDE.md) — single styled root, `data-type` + `data-*` state, `name?: string` debug prop, `Omit<HTMLAttributes<…>, "style" | "className">` for the props interface.

## Migration history

The legacy `src/renderer/components/{basic,form,layout,overlay,TreeView,virtualization,data-grid}/` split was retired in [EPIC-025](../epics/EPIC-025.md). Reusable primitives now live in `src/renderer/uikit/`; the folders that remain in `components/` (`icons/`, `page-manager/`, `file-search/`, `tree-provider/`, `file-list/`, `file-grid/`, `git-tree/`) are persephone-coupled and do not receive new pure primitives. The canonical rename table (e.g. `Chip → Tag`, `PopupMenu → Menu`, `TreeView → Tree`, `ComboSelect → Select`) lives in [`uikit/CLAUDE.md`](../../src/renderer/uikit/CLAUDE.md).
