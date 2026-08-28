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

- **Rule 1** — `data-type` (required) + `data-*` state attributes on the root element; style state via scoped attribute selectors, never via state classes. Components use co-located static CSS.
- **Rule 2** — controlled components only; never `useState` for the component's primary value.
- **Rule 3** — list/collection props accept `T[] | Traited<T[]>`; resolve with `resolveTraited(items, KEY)` at the top.
- **Rule 4** — roving tabindex inside keyboard-navigable widgets (Toolbar, Tree, ListBox, SegmentedControl, Tab bar).
- **Rule 5** — focus trap inside modal dialogs.
- **Rule 6** — `ComponentSet` descriptor pattern for runtime-built UIs.
- **Rule 7** — Emotion is not part of the renderer. Do not add runtime styling imports; use co-located static CSS. Do not add `style=` / `className=` **on a UIKit component** (exception: `src/renderer/ui/` chrome). The `style`/`className` half of the rule scopes to UIKit components, not to raw HTML elements — an inline style object on a plain `<img>` or `<div>` in app code is fine, and is the intended escape hatch when a one-off element needs sizing that no UIKit primitive covers.
- **Rule 8** — model-view pattern (`TComponentModel`) once a component exceeds the small-and-readable threshold.
- **Rule 9** — converted components may expose a framework-free `VanillaView`; follow the lifecycle, ownership, model-driver, and structural-helper contract in [`model-view-pattern.md`](./model-view-pattern.md).
- **Primitive attribute contract** — never override a UIKit primitive's generated `data-type`; its CSS is keyed by that value. Use an additive class or a separate data attribute for app-specific state.
- **Icon slots** — use `IconRef` for icon-bearing props. It is `IconName | Node`: pass a registry name string where possible, or a freshly built DOM node for an icon that is not in the registry. `IconRef` never accepts a React element. Use plain `string` for text-bearing props, and reserve `SlotText` for the small set of props that genuinely accept rich React content.

Two conversion footguns are part of the contract: claiming a vanilla child does not mount it, so
call `mount()` exactly once before inserting or returning its root; and a converted root whose CSS
sets `display` needs a same-layer `<root-selector>[hidden] { display: none; }` counter-rule so
`.hidden = ...` remains effective. The full lifecycle and styling details live in `uikit/CLAUDE.md`.

When a parent composes a dynamic native child, `child()` establishes ownership only; it does not
forward later model or prop changes. Retain children whose rendered output can change and update
each of them from current state in the parent's `sync()`/`onUpdate()` path. Reviewing the update
calls for sibling asymmetry is a useful check; an unretained local child by itself is not evidence
of a defect when its props are static or it is held in another collection.

Views that expose a native `children` slot own that host. Pass the child nodes through the slot and
retain stable nodes when the slot may be refilled; do not append directly into the other view's
root. A slot implementation may replace all direct children during an update, which would remove
anything appended behind its contract.

The icon registry is the neutral boundary for reusable components. `IconName` is derived from the
single registry record in `src/renderer/theme/icon-registry.ts`. Use
`createIconElement(name, props?)` for a registry icon. For an icon component that is not in the
registry, use `createIconComponentElement(icon, props?)` from `theme/icons.ts`; `SvgIconComponent`
is a builder contract with a required `createElement` function and optional `viewBox`, not a
callable React component. Language/file resolution lives in
`components/icons/language-icon-resolver.ts` and `icon-elements.ts`; DOM builders are passed as
native elements rather than as React-node icon values. Native callers use the icon builders from
`components/icons/icon-elements.ts` or `theme/icons.ts`; there is no generic UIKit `Icon` face.

DOM icon nodes are single-use resources: appending one to a second host moves it and leaves the
first host without an icon. Build the node at the point of use; do not cache, memoise, hoist, or
share one node between rows, menus, buttons, or views. If a statically supplied registry name is
wrong, TypeScript rejects it and the runtime resolver throws if the type boundary has been bypassed.
Runtime-sourced names must be validated at their boundary and use the visible icon placeholder; an
empty `<svg>` is never a valid fallback.

`SlotContent` is the native slot-content type exported by `uikit/shared/fill-slot.ts`; it accepts
text, DOM nodes, and arrays of those values. `fillSlot` owns replacement and cleanup for a
view-owned DOM region. React values are not part of the UIKit slot contract; the sole React
island is the Excalidraw vendor boundary under `editors/draw/`.

For a `Tree` row's right-side content, use `renderTrailing` for a slot value that may be rebuilt,
and `trailingElement` for a stable, caller-owned DOM node. The direct-node form is identity-aware:
the row can short-circuit when the same node remains assigned, avoiding needless slot teardown and
reattachment. Keep the node owned by the caller and do not share one node between rows.

For text slots, prefer `string` whenever callers supply data text. `SlotText` documents an
intentional rich-content exception; it is not a way to make every public prop React-shaped. An
arbitrary subtree belongs in `children` or a named child slot and should cross a future view
boundary as a mounted subtree, not as a framework-specific callback.

### Dead faces and barrels

A React mount face can become callerless when its native view is adopted by a shell or editor, while
the same file may still contain live types, models, or constants. Split those symbols into a
framework-free core before removing the face. Treat barrels separately: a live barrel can re-export
dead faces, and a dead barrel can hide the last stale edge. Re-run symbol and importer searches when
removing either; typechecking and production builds do not detect an unused face or barrel.

**Persephone-coupled components** (the KEEP folders inside `components/`) may import `api/`, `core/`, and `theme/` directly — that's the criterion for living in `components/` at all. They should still use UIKit primitives (`Button`, `Tooltip`, `IconButton`, `Panel`, …) for primitive rendering rather than re-implementing them.

### Storybook stories

Storybook stories are records consumed by the in-app component gallery. Declare a story with
`Story<P>`, where `P` is the props surface sent to its native demo view:

```ts
const buttonStory: Story<ButtonDemoProps> = {
    id: "button",
    name: "Button",
    section: "Bootstrap",
    view: ButtonDemoView,
    props: [/* PropDef names must be keys of ButtonDemoProps */],
};
```

Stories use `view: VanillaViewCtor<P>`. New demos should use a story-local `VanillaView` when the
demo needs layout context, sample content, state, or event handlers. Its constructor creates only the
stable root; create and mount child DOM and child views in `onMount()`, claim owned children with
`child()`, and release structural replacements before rebuilding them. A story's `PropDef<P>` names
are checked as `keyof P & string`, so the generic should describe the actual demo props, including
demo-only controls.

The heterogeneous story registry uses the intentionally erased `AnyStory` type; keep each story's
concrete generic at its declaration and do not replace the registry's typed array with an ad hoc cast.

`previewChildren` returns a native `Node`. A provider that supplies multiple siblings must return
one persistent element (usually a `display: contents` wrapper), never a `DocumentFragment`. Use
`editors/storybook/story-props.ts`'s `prepareStoryProps()` for verification or other rendering
paths; it is the single preparation path for empty enum values, managed values, synthetic icon
controls, and generated children.

## Naming conventions

UIKit components and Storybook demos use framework-free `VanillaView` implementations with a
`View.ts` suffix. The Excalidraw vendor island is the only React component surface.

- Component name — PascalCase (`Button`, `MultiSelect`).
- File name — `<ComponentName>View.ts` inside the component's own subfolder.
- `data-type` attribute — kebab-case matching the component name (`data-type="multi-select"`).
- `name?: string` debug prop — every UIKit primitive accepts it and emits it as `data-name="…"` on the same root element that carries `data-type`; see `uikit/CLAUDE.md` for the naming contract.
- For the canonical naming table (old name → new name) and prop-naming guidelines, see the **Naming conventions** section in [`uikit/CLAUDE.md`](../../src/renderer/uikit/CLAUDE.md).

## Component file template

Use the template at the bottom of [`uikit/CLAUDE.md`](../../src/renderer/uikit/CLAUDE.md) — single
native root, co-located static CSS, `data-type` + `data-*` state, and `name?: string` debug prop.

## Migration history

The legacy `src/renderer/components/{basic,form,layout,overlay,TreeView,virtualization,data-grid}/` split is retired. Reusable primitives now live in `src/renderer/uikit/`; the folders that remain in `components/` (`icons/`, `page-manager/`, `file-search/`, `tree-provider/`, `file-list/`, `file-grid/`, `git-tree/`) are Persephone-coupled and do not receive new pure primitives. The canonical rename table (e.g. `Chip → Tag`, `PopupMenu → Menu`, `TreeView → Tree`, `ComboSelect → Select`) lives in [`uikit/CLAUDE.md`](../../src/renderer/uikit/CLAUDE.md).
