# US-965: Icon name registry + neutral slot types (foundation)

## Status

**Status:** Implemented — reviewed as part of EPIC-051 close-out
**Priority:** High
**Epic:** [EPIC-051: De-React Epic P — Preparation (React-side)](../../epics/EPIC-051.md)
**Created:** 2026-08-16

## Goal

Introduce the framework-neutral icon and slot vocabulary that the rest of EPIC-051 will consume,
while keeping the application fully on React and preserving every existing icon call site. Prove
the contract by adapting `IconButton`; no other UIKit component or editor is migrated in this task.

## Background

- `src/renderer/theme/icons.tsx` is the current source of truth for the SVG icon components. It
  has 116 `export const` declarations: 114 icon components plus the `createIcon` and
  `createIconWithViewBox` factories. The 114 component names convert to 114 unique kebab-case
  names with no collisions, digits, or single-letter segments.
- The `IconName` inventory explicitly excludes `src/renderer/theme/language-icons.tsx` and all
  `src/renderer/components/icons/*` resolvers (`EditorIcon`, `FileIcon`, `LanguageIcon`, and
  `TreeProviderItemIcon`). Language icons are already resolved by data through
  `LanguageIcon`—the language id is their neutral key—and the component files are prop-taking
  resolvers, not registry icons. Also exclude `SvgIcon`, `SvgIconProps`, `SvgIconComponent`,
  `createIcon`, and `createIconWithViewBox`.
- The de-React design calls for stable kebab-case icon names such as `"close"` and
  `"more-vert"`. Epic D will later replace registry values with vanilla SVG output, so these
  names and their call sites must remain unchanged.
- `IconButton` currently accepts `icon: React.ReactNode` and `title?: React.ReactNode`, renders
  the icon directly, and passes the title to `Tooltip`. Existing callers mostly pass the current
  React icon elements and must continue to compile without a call-site migration.
- The epic decisions define `IconRef` as `IconName | ReactNode` and leave `children` and arbitrary
  subtree slots alone. Text slots use the documentation-only alias `SlotText = string | ReactNode`;
  no callback protocol or runtime text helper is introduced in this task.
- `uikit/shared/` already houses framework-independent coordination helpers such as
  `overlayRegistry.ts` and `selection-style.ts`; `IconRef`, `SlotText`, and `renderIcon` belong in
  a small shared slots module. Re-exporting their public types from `uikit/index.ts` gives
  US-966 through US-969 one stable import path.

## Implementation plan

### 1. Establish the icon-name contract

- Register all 114 icon components from `src/renderer/theme/icons.tsx`. Convert each component
  name with the standard two-pass regex: `(([a-z0-9])([A-Z]))` followed by
  `(([A-Z]+)([A-Z][a-z]))`. This preserves the confirmed cases `McpIcon → "mcp"`,
  `CSharpIcon → "c-sharp"`, and `MoreVertIcon → "more-vert"`.
- Keep the exclusions above explicit in the file header. Do not add aliases, rename existing
  concepts, or include language/component resolver exports.
- Make the registry object the single source of truth. Define it as
  `const ICONS = { ... } as const satisfies Record<string, SvgIconComponent>` and derive
  `IconName` as `keyof typeof ICONS`; do not maintain a second union list.

### 2. Add `theme/icon-registry.ts`

- Import the existing icon components and `SvgIconComponent` directly from `./icons`.
- Add the name-to-component registry and export the derived `IconName` plus `getIcon(name)`.
- Keep registry values as today’s React components. This is an adapter layer, not a rewrite of
  `icons.tsx`, and it must preserve each icon’s existing viewBox, intrinsic sizing, colors, and
  custom rendering behavior.
- Keep the lookup synchronous and side-effect free so the future vanilla registry can retain the
  same call shape.
- A string in an icon slot is always an icon name. If an untyped or untrusted caller supplies an
  unknown name, the `renderIcon` runtime lookup must warn with `console.warn` in development builds
  and render nothing; never render the unknown string as text.

### 3. Add `uikit/shared/slots.ts`

- Define `IconRef = IconName | ReactNode` as specified by EPIC-051 D3.
- Define `SlotText = string | ReactNode` as a type-only documentation aid for text-bearing props.
  React continues to render the value directly; a future vanilla view can assign a string to
  `textContent` without a callback or helper layer.
- Implement `renderIcon(icon: IconRef, props?: SvgIconProps)`:
  - resolve a string strictly through the registry and create the corresponding React element;
  - pass the optional SVG props to a named icon so consumers can handle the few legitimate sizing
    cases without changing the public API later;
  - pass through existing React icon elements and other non-string React content unchanged;
  - preserve empty values rather than manufacturing a visual;
  - warn in development and return nothing for an unknown string name.
- Subtree slots (`trailing`, `startSlot`, `endSlot`, `headerButtons`, `buttons`, `extraElement`,
  and related props) are children in disguise and are deferred to the mount adapters / Epic C
  under EPIC-051 D4; this task adds no generic callback protocol for them.

### 4. Adopt the contract in `IconButton`

- Change the public icon prop to use `IconRef` while retaining compatibility with existing
  React-node callers.
- Change the tooltip title prop to use `SlotText`; pass it straight to the existing React-only
  `Tooltip` with no runtime helper.
- Resolve the icon with `renderIcon`. The optional SVG-props parameter belongs to the consuming
  component; callers continue to provide either a name or an existing React node.
- Preserve the existing ref forwarding, tooltip suppression behavior, button attributes,
  `data-*` contract, size/variant styling, and disabled/active/warning precedence.
- Do not migrate other UIKit components, `ui/`, `components/`, editors, stories, or icon call
  sites; those are US-966 through US-969 (or later editor work).

### 5. Expose and verify the foundation

- Re-export `IconName`, `IconRef`, `SlotText`, `getIcon`, and `renderIcon` from
  `src/renderer/uikit/index.ts` where appropriate for downstream UIKit consumers.
- Run `npm run typecheck` and `npm run lint`.
- Smoke-test `IconButton` with both a named icon and an existing React icon element, including a
  rich tooltip title and an empty/omitted title, and confirm the rendered DOM remains equivalent.

## Concerns / Open questions

There are no unresolved design concerns. The following boundaries are confirmed decisions for
implementation:

- The registry covers exactly 114 `icons.tsx` components; language icons and prop-taking resolver
  components remain outside `IconName`.
- Strings in icon props are always names. Unknown names warn only in development and render no
  icon, including when the value originates in a future JSON/script descriptor.
- `renderIcon` accepts optional `SvgIconProps`, but no serializable icon-descriptor type is added.
- `SlotText` is an alias only. Subtree slots wait for the mount-adapter contract rather than
  introducing a React-returning callback abstraction in Epic P.

## Acceptance criteria

- [x] `src/renderer/theme/icon-registry.ts` exists with a complete, type-checked kebab-case
      registry covering exactly all 114 intended public icon components; `IconName` is derived
      from the registry keys.
- [x] `getIcon(name)` returns the same existing `SvgIconComponent` that direct imports return;
      `icons.tsx` has not been rewritten. `renderIcon` warns in development and renders nothing
      for unknown string names.
- [x] `src/renderer/uikit/shared/slots.ts` exports `IconRef`, `SlotText`, and
      `renderIcon(icon, props?)`.
- [x] `IconButton` accepts named icons and all existing React-node icon callers, while preserving
      its current tooltip, ref, accessibility, styling, and `data-*` behavior.
- [x] The public UIKit export surface exposes the foundation for US-966 through US-969.
- [x] `npm run typecheck` and `npm run lint` pass, and the named-icon/legacy-icon smoke checks
      show no visual or DOM regression.

## Files to create or modify

- `src/renderer/theme/icon-registry.ts` — icon-name union, registry, and lookup.
- `src/renderer/uikit/shared/slots.ts` — `IconRef`, `SlotText`, and the React icon bridge helper.
- `src/renderer/uikit/IconButton/IconButton.tsx` — consume `IconRef`, `SlotText`, and `renderIcon`.
- `src/renderer/uikit/index.ts` — expose the foundation types/helpers for later tasks.
- `doc/active-work.md` — replace the US-965 placeholder with a task-document link.
- `doc/epics/EPIC-051.md` — link US-965 to its task document.

## Implementation progress

### Phase 1: Registry and slot contract

- [x] Register all 114 icons and derive `IconName` from the registry keys.
- [x] Add and type-check `icon-registry.ts`.
- [x] Add `slots.ts` with `IconRef`, `SlotText`, and `renderIcon`.

### Phase 2: Proof component and verification

- [x] Adapt `IconButton` without changing existing call sites.
- [x] Export the foundation through UIKit.
- [x] Run typecheck, lint, and named/legacy icon registry smoke checks.

## Related

- [EPIC-051: De-React Epic P — Preparation (React-side)](../../epics/EPIC-051.md)
- [De-React roadmap](../../de-react.md)
- [UIKit authoring guide](../../../src/renderer/uikit/CLAUDE.md)
- [UI element contract](../../architecture/ui-element-contract.md)
