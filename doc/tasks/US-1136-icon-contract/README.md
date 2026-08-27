# US-1136 - the icon contract

**Epic:** [EPIC-070](../../epics/EPIC-070.md) (De-React E12)
**Scope:** US-1136 and US-1137 are planned as one unit: the icon type/extension change, the required DOM builder, and the surviving React face must agree in one compileable change.
**Status:** Planned

## Goal

Make the theme icon contract native-first: an exported icon is a required DOM builder plus optional metadata, not a React component. Rename `src/renderer/theme/icons.tsx` to `icons.ts`, restrict icon bodies to strings, and provide one small generic React face for the JSX that remains during E12. Remove the empty-SVG fallbacks from the UIKit icon path so a statically invalid name is rejected by TypeScript and a runtime-sourced invalid name is visible rather than blank.

The scope ruling is to fold the mechanical JSX migration into this unit. It is not a 31-tag migration: delete the two dead React-only files and split the live `LanguageIcon.tsx` file as described below. The remaining **20** JSX tags (19 under `editors/` and one in `uikit/Popover/PopoverView.tsx`) move to the generic face. No editor is converted to vanilla, and the live native file/tree path remains separate.

## Background

### Governing documents and baseline

This plan follows [EPIC-070](../../epics/EPIC-070.md), especially its Closing property, E12-4, E12-5 concerns 4-8, and E12-6 Non-goals. It also uses the captured pre-change [US-1133 baseline](../US-1133-e12-baseline/README.md) and the UIKit lifecycle rules in [`src/renderer/uikit/CLAUDE.md`](../../../src/renderer/uikit/CLAUDE.md).

The baseline session captured **238 rendered SVGs and 0 empty SVGs**, with seven open pages, three ever activated, and six `[data-react-root]` roots at the recorded probe. A fresh read-only probe of the currently open session returned **232 SVGs and 0 empty SVGs**, seven page placeholders, and three rendered placeholders. The difference is session state, not a correction to the captured baseline; the closing verification must compare against the captured 238/0 session procedure and must continue to treat any empty SVG as a regression.

### What the source actually contains

The current [`src/renderer/theme/icons.tsx`](../../../src/renderer/theme/icons.tsx) is **713 lines**, not the epic's 714. It exports **116 `*Icon` component constants** (excluding the `createIcon` factory). The exact composition is:

- **115** icons returned by `createIcon(...)` or `createIconWithViewBox(...)` from string bodies.
- **1** hand-authored JSX-bodied icon, `PersephoneIcon` at lines 240-283. It also has a manually assigned string-backed `.createElement` builder at lines 284-286, so all 116 exported icon constants currently have a builder at runtime.
- **0** icons are missing a runtime builder today, but the type marks the property optional and `createIconWithViewBox` still accepts a React body, leaving the hole reopenable.

The TypeScript AST contains **29 JSX nodes** in this file, not approximately 21. They are spread across **three** components: `SvgIcon`, the `IconWithViewBox` returned by `createIconWithViewBox`, and `PersephoneIcon`. The JSX is implementation machinery, not 29 separate icon bodies. The registry has **116 entries**, and its imports cover all 116 registered icon constants, including `PersephoneIcon`. Its eager-import structure and `IconName` definition are verified below and are not to be redesigned in this task.

The three files in `src/renderer/components/icons/` require different treatment. `TreeProviderItemIcon.tsx` has eight JSX occurrences and zero importers anywhere in `src/`; delete it without migrating those tags. `FileIcon.tsx` has one JSX occurrence and zero real importers; delete it, and remove its re-export from the dead `ui/sidebar/index.ts` barrel. `LanguageIcon.tsx` has two JSX occurrences but is not dead: its native resolver exports are imported by `icon-elements.ts` and `FileGridView.ts`. Split its live non-React core into a new, non-colliding module named `language-icon-resolver.ts`; delete only its React component face, aliases, and unused hook. Remove the two dead `LanguageIcon` re-export lines from the otherwise-live `editors/base/index.ts` barrel.

The current public declarations at [`icons.tsx:4-16`](../../../src/renderer/theme/icons.tsx) are:

```ts
export interface SvgIconProps extends SVGProps<SVGSVGElement> {
    children?: ReactNode;
    viewBox?: string;
    title?: string;
}

export type SvgIconDomBuilder = (props?: SvgIconProps) => SVGElement;

export type SvgIconComponent = ((props: SvgIconProps) => ReactElement) & {
    createElement?: SvgIconDomBuilder;
    viewBox?: string;
};
```

The target public shape is:

```ts
export type SvgIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
    viewBox?: string;
    title?: string;
};

export type SvgIconDomBuilder = (props?: SvgIconProps) => SVGElement;

export type SvgIconComponent = {
    createElement: SvgIconDomBuilder;
    viewBox?: string;
};
```

The exact spelling of the `SvgIconProps` alias may follow the project's preferred interface style, but `children` must not be accepted. `IconBody` at [`icons.tsx:123`](../../../src/renderer/theme/icons.tsx) must become `string`, and `createIconWithViewBox` at line 153 must accept only that string type. The `PersephoneIcon` JSX implementation must be replaced by its existing theme-dependent string body plus the required builder; its dark/light behavior must remain unchanged.

### Builders and the React face

`createIconComponentElement` at [`icons.tsx:25-31`](../../../src/renderer/theme/icons.tsx) currently reads an optional builder and throws when it is absent. After the type change, the builder call is unconditional; the missing-builder branch and its error are unreachable and must be removed. The helper can remain as a small builder convenience for the `.ts` editor toolbars, or its callers can call `.createElement` directly, but it must no longer perform an optionality check.

The native implementation already exists in `createSvgElement` in `icons.tsx` and in [`components/icons/icon-elements.ts`](../../../src/renderer/components/icons/icon-elements.ts). `createSvg` there currently repeats a missing-builder throw at [`icon-elements.ts:18-22`](../../../src/renderer/components/icons/icon-elements.ts); it should become a direct call to the required builder. This is the native path used by real file/tree consumers and must not gain a React root or a new eager registry import.

The one retained React arm should be a new [`src/renderer/components/icons/Icon.tsx`](../../../src/renderer/components/icons/Icon.tsx) component. Its primary prop is `name: IconName`; it may also accept an already resolved `icon: SvgIconComponent` for language icons that are intentionally outside the registry, but the two forms must be mutually exclusive. It must preserve normal SVG props, `viewBox`, title handling, color/style behavior, and the actual body. A raw `SVGElement` returned by a builder cannot itself be returned from a React render function, so the face needs an explicit bridge: either create a React-owned `<svg>` and populate it from the builder's serialized/native children, or use another implementation-local bridge that does not expose named icon components again. The bridge must not reintroduce `ReactNode` as an accepted icon body and must not use the empty-SVG fallback.

`LanguageIcon.tsx` is not a dead face. The live native consumers import exactly `prepareFileIcon`, `resolveFileIcon`, `subscribeFileIconChanges`, and the `FileTypeIconProps` type from it in `icon-elements.ts`; `FileGridView.ts` separately imports `prepareFileIcon`. The split module must therefore retain `languageIconMap`, `resolveFileIcon`, `ResolvedFileIcon`, `prepareFileIcon`, `subscribeFileIconChanges`, `FileTypeIconProps`, the file-pattern resolver and system-icon model they depend on, plus the necessary non-React imports. The React-only `FileTypeIcon`, its `LanguageIcon`/`LanguageIconProps` aliases, and the zero-caller `useSystemFileIcons()` hook leave with the face. The replacement module name is `language-icon-resolver.ts`, distinct from `theme/language-icons.ts`.

### Registry type and static versus runtime names

[`src/renderer/theme/icon-registry.ts`](../../../src/renderer/theme/icon-registry.ts) defines:

```ts
const ICONS = { /* 116 explicit entries */ } as const satisfies Record<string, SvgIconComponent>;
export type IconName = keyof typeof ICONS;
export function getIcon(name: string): SvgIconComponent | undefined;
```

Therefore `IconName` is already a literal union derived from the registry. `getIcon` intentionally accepts `string` for runtime resolution, while `createIconElement` is declared as `createIconElement(name: IconName, props?)`. Literal static calls such as `createIconElement("folder")` are compile-time errors because `"folder"` is not in the union; the registered name is `"folder-open"`. Widened strings currently bypass that protection in UIKit components through `isIconName(value)` followed by `as never`, for example [`ButtonView.ts:118-119`](../../../src/renderer/uikit/Button/ButtonView.ts) and the analogous Dialog, Tag, RadioGroup, and ListBox paths. Those casts are the places where runtime input must be routed to a visible placeholder rather than to an unresolvable `createIconElement` call.

`IconRef` is already `IconName | Node` at [`slots.ts:8`](../../../src/renderer/uikit/shared/slots.ts); it does not admit arbitrary strings at the type boundary. `SlotText` and `fillSlot` still intentionally admit React content for temporary non-icon callers and are not icon-contract declarations.

### The two silent holes in `slots.ts`

[`src/renderer/uikit/shared/slots.ts:34-50`](../../../src/renderer/uikit/shared/slots.ts) currently has two development-only warning paths that return an empty `<svg>`:

1. `getIcon(name)` returns `undefined` for an unknown name.
2. A resolved icon has no `.createElement` builder.

The second branch disappears when the builder is required. The first branch must not return `createEmptyIconElement`; the baseline's 238/0 comparison makes that fallback an invisible regression. The public statically typed function should remain `createIconElement(name: IconName, props?)`, with no widened-string overload. Its resolved-icon lookup can be treated as an invariant violation and throw with the name if runtime code has bypassed the type system. Runtime adapters that intentionally receive external strings must validate first and render a visible placeholder on failure.

The placeholder should be a real, non-empty SVG or other visible icon-sized element with a stable diagnostic class/attribute, not an empty SVG and not a console warning as its only signal. It should accept the requested dimensions/classes sufficiently to preserve layout. The placeholder is for recoverable runtime data; it is not a way to make invalid static names compile.

### Runtime-sourced names investigated

The source audit found fewer persisted icon-name sources than the epic wording suggests:

- [`pinned-items.ts`](../../../src/renderer/ui/sidebar/pinned-items.ts) persists editor IDs or `board:<absoluteRoot>` in the `pinned-editors` setting. It does **not** persist icon names. [`PinnedRailView.ts:169-171`](../../../src/renderer/ui/sidebar/PinnedRailView.ts) later resolves the editor ID to the current `CreatableItem.icon`; an invalid stored editor ID is filtered during row construction. A runtime icon string can still enter here through an editor contribution, so the row path must choose the visible placeholder when `isIconName` rejects it.
- [`tools-editors-registry.ts`](../../../src/renderer/ui/sidebar/tools-editors-registry.ts) supplies built-in editor icons. Its registry entries are static icon names or already-built DOM nodes; browser profile colors are dynamic props on the fixed `globe` icon. Its current `.createElement?.()` calls are optional only because of the old contract and should become required calls.
- [`ToolsetEditorModel.ts`](../../../src/renderer/editors/toolset/ToolsetEditorModel.ts) persists `toolsetRoot` and toolset metadata, not an icon name. Its toolbar icon names (`refresh`, `folder-open`, `log`) are static and should be checked as `IconName` literals.
- Board persistence stores a board root and optional custom `icon.svg/png/ico` asset in [`board-manifest.ts`](../../../src/renderer/editors/board/board-manifest.ts); it is not a registry icon name. `BoardGlyph` and `board-glyph-element` own the custom-asset/default-board path and must remain intact.
- [`ILink.icon?: string`](../../../src/renderer/api/types/io.tree.d.ts:155) is the genuine runtime string boundary for tree-provider data. `FileTreeProvider.ts:77-78` emits the known `git` and `mneme` hints. The native [`createTreeProviderItemIconElement`](../../../src/renderer/components/icons/icon-elements.ts:105-124) handles those hints explicitly and falls back to file/folder icons; it does not pass arbitrary `ILink.icon` values to `createIconElement`. If future providers or another tree path resolve arbitrary names, that adapter must use the visible placeholder.

Decision: static application data uses `IconName` and fails at compile time; external/runtime strings are validated at the boundary and receive a visible placeholder. Do not broaden `createIconElement` to `string`, and do not make session restore throw merely because a stored/contributed value is stale.

### Importer and rename audit

The search found **43 direct importers** containing the `theme/icons` path: **30 `.ts`** and **13 `.tsx`**. Two additional source files import the same module through `./icons`: the registry and `theme/language-icons.ts`. Thus the exact module-importer total is **45**, with **32 `.ts`** and **13 `.tsx`** importers. There are **0** direct theme-icon story importers; the epic's “2 stories” classification is not present in the current source. All 45 imports are static. The dynamic-import search found no `import()` that reaches `theme/icons` or `./icons`; the Vite rename trap therefore requires touching static importers as needed, not a special dynamic-import server restart. A frozen `?t=` error would still indicate stale dev-server state and require restarting the dev server.

The `.ts` importers are:

```text
src/renderer/components/icons/icon-elements.ts
src/renderer/components/tree-provider/item-menus.ts
src/renderer/components/tree-provider/plural-actions.ts
src/renderer/editors/archive/ArchiveEditor.ts
src/renderer/editors/board/board-glyph-element.ts
src/renderer/editors/board-info/BoardInfoEditorModel.ts
src/renderer/editors/board-info/BoardScreenshotView.ts
src/renderer/editors/browser/BrowserEditor.ts
src/renderer/editors/draw/index.ts
src/renderer/editors/file-diff/FileDiffEditor.ts
src/renderer/editors/git-tree/GitTreeEditorModel.ts
src/renderer/editors/graph/index.ts
src/renderer/editors/html/index.ts
src/renderer/editors/markdown/CodeBlock.ts
src/renderer/editors/markdown/MarkdownBlockView.ts
src/renderer/editors/markdown/MarkdownImage.ts
src/renderer/editors/mcp-inspector/McpInspectorEditorModel.ts
src/renderer/editors/mermaid/index.ts
src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts
src/renderer/editors/mneme-root/MnemeRootEditorModel.ts
src/renderer/editors/notebook/ExpandedNoteView.ts
src/renderer/editors/notebook/note-editor/NoteItemToolbarView.ts
src/renderer/editors/notebook/NoteItemView.ts
src/renderer/editors/storybook/StorybookEditorModel.ts
src/renderer/editors/svg/index.ts
src/renderer/editors/toolset/ToolsetEditorModel.ts
src/renderer/editors/video/VideoEditor.ts
src/renderer/ui/dialogs/poppers/showPopupMenu.ts
src/renderer/uikit/Menu/MenuView.ts
src/renderer/uikit/shared/slots.ts
src/renderer/theme/icon-registry.ts
src/renderer/theme/language-icons.ts
```

The 13 `.tsx` direct importers are `components/icons/LanguageIcon.tsx`, `components/icons/TreeProviderItemIcon.tsx`, `editors/about/AboutView.tsx`, `editors/board/BoardEditorView.tsx`, `editors/board/BoardGlyph.tsx`, `editors/board/BoardNotFoundView.tsx`, `editors/board/UntrustedBoardView.tsx`, `editors/browser/BrowserTabsPanel.tsx`, `editors/graph/GraphDetailPanel.tsx`, `editors/link-editor/LinkTooltip.tsx`, `editors/link-editor/PinnedLinksPanel.tsx`, `ui/dialogs/poppers/grid-context-menu.tsx`, and `uikit/Popover/PopoverView.tsx`.

### JSX call-site audit and the scope conflict

The TypeScript AST audit, excluding `theme/icons.tsx`, found **31 JSX icon-tag occurrences across 16 files**, not 17. This count includes the generic `<Icon>` tag in `components/icons/LanguageIcon.tsx`; counting only names ending in `Icon` gives 30. The occurrences are:

```text
src/renderer/components/icons/FileIcon.tsx: FileTypeIcon
src/renderer/components/icons/LanguageIcon.tsx: Icon, DefaultIcon
src/renderer/components/icons/TreeProviderItemIcon.tsx: GitIcon, MemoryIcon, BoardIcon, FolderIcon, FileTypeIcon, FaviconIcon, FileTypeIcon, FileTypeIcon
src/renderer/editors/about/AboutView.tsx: PersephoneIcon
src/renderer/editors/board/BoardEditorView.tsx: WarningIcon
src/renderer/editors/board/BoardGlyph.tsx: BoardIcon
src/renderer/editors/board/BoardNotFoundView.tsx: WarningIcon
src/renderer/editors/board/UntrustedBoardView.tsx: WarningIcon
src/renderer/editors/browser/BrowserTabsPanel.tsx: GlobeIcon
src/renderer/editors/browser/BrowserView.tsx: TorIcon, IncognitoIcon
src/renderer/editors/browser/TorStatusOverlay.tsx: TorIcon
src/renderer/editors/graph/GraphDetailPanel.tsx: ChevronUpIcon, ChevronDownIcon, LevelIcon, ShapeIcon, LevelIcon, ShapeIcon
src/renderer/editors/link-editor/LinkTooltip.tsx: CopyIcon
src/renderer/editors/link-editor/PinnedLinksPanel.tsx: PinFilledIcon
src/renderer/editors/settings/sections/BrowserProfilesSection.tsx: TorIcon, IncognitoIcon
src/renderer/uikit/Popover/PopoverView.tsx: ResizeHandleIcon
```

The audit puts **19** of these occurrences under `src/renderer/editors/`, not the epic's 24, and finds 16 files, not 17. The remaining 12 are the 11 occurrences in the three component files plus `PopoverView`; the component files are not treated uniformly: `TreeProviderItemIcon.tsx` and `FileIcon.tsx` are deleted, while `LanguageIcon.tsx` is split and its two React tags are deleted with its face. Therefore the actual migration surface is **20** tags: the 19 editor occurrences plus `PopoverView`.

The scope ruling now folds the JSX migration into this unit. Delete the 9 tags in `TreeProviderItemIcon.tsx` and `FileIcon.tsx` with those files; delete the two React tags in `LanguageIcon.tsx` with its React face; mechanically replace the remaining 20 tags with the generic face. Keeping callable wrappers for each named export would leave 116 React faces in practice and would violate the single-arm contract.

## Implementation Plan

### 1. Apply the accepted JSX scope ruling

Delete [`src/renderer/components/icons/TreeProviderItemIcon.tsx`](../../../src/renderer/components/icons/TreeProviderItemIcon.tsx) and [`src/renderer/components/icons/FileIcon.tsx`](../../../src/renderer/components/icons/FileIcon.tsx), including their 9 JSX occurrences. Remove the `FileIcon` re-export from the dead [`src/renderer/ui/sidebar/index.ts`](../../../src/renderer/ui/sidebar/index.ts) barrel. Do not remove that barrel in this task: it has zero importers and its broader cleanup is tracked separately.

That dead-barrel cleanup also covers its six zero-external-importer faces (`FolderItem`, `MenuBar`, `OpenTabsList`, `RecentFileList`, `ScriptLibraryPanel`, and `ToolsEditorsPanel`); they are deliberately out of scope here. The only edit to the barrel is removal of the `FileIcon` re-export.

Split `LanguageIcon.tsx` as described in step 2 below; delete its React face and two JSX occurrences, while preserving its live resolver behavior in `language-icon-resolver.ts`.

Mechanically migrate only the remaining 20 JSX tags to [`src/renderer/components/icons/Icon.tsx`](../../../src/renderer/components/icons/Icon.tsx). This changes the icon arm, not the surrounding editors. The four currently live one-importer sidebar faces (`BuiltinEditorsList`, `PinnedRail`, `TrustedBoardsList`, and `TrustedToolsList`) remain because their importer is the still-React `editors/tools-hub/ToolsHubView.tsx`; their retention is intentional, not a missed dead-barrel cleanup.

### 2. Split the live file-icon resolver from its React face

Rename [`src/renderer/components/icons/LanguageIcon.tsx`](../../../src/renderer/components/icons/LanguageIcon.tsx)'s non-React portion into [`src/renderer/components/icons/language-icon-resolver.ts`](../../../src/renderer/components/icons/language-icon-resolver.ts). The verified live native import surface is exactly `prepareFileIcon`, `resolveFileIcon`, `subscribeFileIconChanges`, and the `FileTypeIconProps` type in `icon-elements.ts`, plus `prepareFileIcon` in `FileGridView.ts`. Move the implementations and their dependencies needed by those exports: `languageIconMap`, the compound file-pattern resolver, `ResolvedFileIcon`, `SystemIconModel`/`systemIconModel`, `resolveFileIcon`, `prepareFileIcon`, `subscribeFileIconChanges`, and `FileTypeIconProps`. Keep this module free of React imports.

Delete the React-only `FileTypeIcon` component, its `export { FileTypeIcon as LanguageIcon }` and `LanguageIconProps` aliases at the current lines 319-320, and `useSystemFileIcons()` at the current line 211. Retain `LanguageIcon.tsx` as a React-free compatibility re-export of the new resolver core after moving the live implementations; this is a split of a live file, not deletion of its resolver capability. Update `icon-elements.ts` and `FileGridView.ts` to import the resolver module. Remove the unused `LanguageIcon` and `LanguageIconProps` exports from [`src/renderer/editors/base/index.ts`](../../../src/renderer/editors/base/index.ts:30-31), but keep that live barrel itself. The 20 JSX migration does not include the two `LanguageIcon.tsx` tags because they leave with this React face.

### 3. Convert `theme/icons.tsx` to a builder-only `theme/icons.ts`

Rename [`src/renderer/theme/icons.tsx`](../../../src/renderer/theme/icons.tsx) to `src/renderer/theme/icons.ts`. Update the static importers only where the rename or type changes require a mechanical edit; preserve extensionless import specifiers and do not add eager imports.

At the top of the renamed module:

- Remove the public React return type from `SvgIconComponent`.
- Make `createElement` required.
- Remove `children` from `SvgIconProps` using an `Omit` of `SVGProps<SVGSVGElement>` or an equivalent type that cannot accept a JSX body.
- Remove `ReactNode` and `ReactElement` from the public builder contract.
- Keep only the React implementation imports needed by the one generic face, if the face lives in this module; otherwise keep the builder module React-free and put the face in a separate module that imports the registry.

The preferred before/after contract is:

```ts
// Before: callable React component with optional native escape hatch.
export type SvgIconComponent = ((props: SvgIconProps) => ReactElement) & {
    createElement?: SvgIconDomBuilder;
    viewBox?: string;
};

// After: native icon data contract.
export type SvgIconComponent = {
    createElement: SvgIconDomBuilder;
    viewBox?: string;
};
```

Change `IconBody` from `string | ReactNode` to `string`. Change `createIconWithViewBox` so its returned value is a builder-only `SvgIconComponent` and so every invocation assigns `.createElement`. Remove the conditional assignment that currently skips the builder for a React body.

Rewrite `PersephoneIcon` as a builder-only value. Preserve `themeState.get().isDark`, `getPersephoneBody`, the `0 0 128 128` viewBox, and all generated path/circle markup. The current JSX function is the one real JSX-bodied icon and must not survive as a named exported React component. The JSX artwork and `getPersephoneBody` template string are currently two hand-maintained copies of the same drawing; removing the JSX arm also removes that drift point. `AboutView.tsx:156` is the only current JSX consumer of that arm. `MainPageView.ts:103` and `:136` already use `createIconElement("persephone")`, and its `:125` comment documents the theme-dependent builder. Keep the builder reading `themeState` at call time: `MainPageView` re-invokes it on theme changes, so it must not capture `isDark` at module load.

Remove the missing-builder throw from `createIconComponentElement`:

```ts
// Before.
const builder = icon.createElement;
if (!builder) throw new Error(`Icon "${icon.name}" has no DOM builder.`);
return builder(props);

// After.
return icon.createElement(props);
```

Do not use `icon.name` in the new implementation; the builder-only object has no function name contract.

### 4. Add the single generic React face

Add [`src/renderer/components/icons/Icon.tsx`](../../../src/renderer/components/icons/Icon.tsx), one small generic React component. Its props should be an exclusive union of `{ name: IconName }` and `{ icon: SvgIconComponent }`, plus supported `SvgIconProps` without `children`. The `name` arm resolves through `getIcon(name)`; the `icon` arm supports language-icon values from `theme/language-icons.ts` that are not in `IconName`. It should be the only public React rendering arm for registry icons and must bridge the required builder into React without making `SVGElement` a React child and without accepting `children`.

The face must have a clear runtime behavior for an impossible/externally cast name: use the same visible placeholder policy as the native runtime adapter, not an empty SVG. Static callers receive the `IconName` union and therefore get a compile-time error for names such as `"folder"`.

The JSX migration allowed by the scope gate should replace direct named registry tags with this face and a literal registry name. The generic face itself is not a reason to alter the native `fillSlot` contract: `fillSlot.ts` remains a temporary React/native slot owner and is not an icon body definition.

### 5. Make the native helper and registry consumers required-builder based

In [`src/renderer/components/icons/icon-elements.ts`](../../../src/renderer/components/icons/icon-elements.ts), change `createSvg` to call `icon.createElement(props)` directly. Remove its duplicate missing-builder check. Keep the existing file-type precedence, board glyph path, image fallback, and tree-provider special cases unchanged.

In the `.ts` importers, replace optional builder access used only because of the old type, including `DrawIcon.createElement?.()`, `TypescriptIcon.createElement?.()`, and the corresponding language icons in [`tools-editors-registry.ts`](../../../src/renderer/ui/sidebar/tools-editors-registry.ts), with required calls. Remove `!`/optional fallbacks that are no longer necessary at the known-builder sites. The specific `createIconComponentElement` callers verified in the source are:

```text
src/renderer/editors/board-info/BoardScreenshotView.ts:55
src/renderer/editors/draw/index.ts:39
src/renderer/editors/graph/index.ts:36
src/renderer/editors/html/index.ts:44
src/renderer/editors/mermaid/index.ts:68-69, 146, 157
src/renderer/editors/svg/index.ts:41
```

Do not change the editor bodies or introduce new React roots in these toolbars.

### 6. Close both `slots.ts` fallback holes with typed and runtime paths

Modify [`src/renderer/uikit/shared/slots.ts`](../../../src/renderer/uikit/shared/slots.ts):

- Keep `IconRef = IconName | Node`.
- Keep `isIconName(value: string): value is IconName` as the runtime type guard backed by `getIcon`.
- Keep `createIconElement(name: IconName, props?)` narrow. Do not add `string` as an overload.
- Remove `createEmptyIconElement` and both warning-plus-empty-SVG branches.
- Call `getIcon(name)!.createElement(props)` only after establishing the typed registry invariant, or throw a descriptive invariant error if runtime code has bypassed the type system.
- Add a separately named visible placeholder builder for runtime adapters. Give it a stable class/data marker and a non-empty visual body while preserving dimensions and relevant class/style props.

Unify the ten existing `isIconName` call sites around one spelling. Six currently launder the answer into `IconName` and discard it: `ButtonView.ts:119` and `:136`, `DialogContentView.tsx:199`, `IconButtonView.tsx:107`, `RadioGroupView.ts:136`, and `TagView.tsx:133`. Both ternary branches call `createIconElement`, so `as never` only silences the type error. Four already guard correctly but return `null` on rejection: `ListBox/ListItemView.ts:229`, `Menu/MenuView.ts:49`, `Tree/TreeItemView.ts:311`, and `PinnedRailView.ts:170`. Change all ten to call the one visible-placeholder helper on rejection. The existing correct spelling is still invisible because it renders `null`; the new visible placeholder improves both current behaviours, not only the empty `<svg>` branch. Do not turn runtime data into `as never` and then send it to the statically typed function. For statically declared menu/category/button data, annotate or infer `IconName` so a typo is a compile-time error. In particular, the source already exposes the `"folder"` versus `"folder-open"` failure mode that caused the EPIC-069 debugging round.

The runtime policy applies to the actual boundary sources identified above: contributed editor icon strings and `ILink.icon` values from tree providers. Pinned editor persistence stores IDs, toolsets store roots/metadata, and boards store roots/assets; they must not be falsely modeled as persisted registry icon-name strings. If a later resolver turns any of those into a string, it must use the same boundary helper.

### 7. Update the import graph without changing registry eagerness

Touch the static importers needed to compile after the rename and type change. Keep [`icon-registry.ts`](../../../src/renderer/theme/icon-registry.ts) eagerly importing its same 116 named entries, keep `IconName = keyof typeof ICONS`, and keep its `satisfies Record<string, SvgIconComponent>` check. Do not split, lazy-load, or otherwise redesign the registry under concern 7.

After the rename, verify the module graph contains no stale `.tsx` path and no dynamic import of the old module. If Vite reports a frozen `?t=` timestamp, restart the dev server; the audit found only static importers, so importer touches are the normal cache invalidation path.

### 8. Preserve the native UIKit boundary

The required builder change must not alter [`src/renderer/uikit/shared/fill-slot.ts`](../../../src/renderer/uikit/shared/fill-slot.ts)'s lifecycle ownership. It continues to accept `string | Node | React.ReactNode` for temporary React callers, reuses React roots only for React content, and writes native icon nodes directly. No icon builder may return a React node or mount a React root in a vanilla view.

Because `slots.ts` is under `src/renderer/uikit/`, follow its mandatory lifecycle rules: do not add child creation to a vanilla constructor, do not pre-clear a host before `fillSlot`, and do not introduce a test harness. The icon placeholder is a normal owned DOM node and must be released by the existing slot transition/cleanup path.

## Concerns / Decisions

1. **Scope ruling - resolved.** The mechanical JSX migration is folded into this unit. Delete the 9 tags belonging to the dead `TreeProviderItemIcon.tsx`/`FileIcon.tsx` files, delete the two React tags with the `LanguageIcon.tsx` face, and migrate the remaining 20 tags to the single generic face. No named callable aliases are retained.

2. **The epic's icon measurements need correction - resolved by source audit.** Correct values are 713 lines; 116 exported `*Icon` constants; 115 string-factory icons plus one JSX-bodied `PersephoneIcon`; 29 JSX AST nodes across three components; 116 registry entries; 45 exact module importers when the two `./icons` importers are included, with 32 `.ts` and 13 `.tsx`; and 31 JSX icon-tag occurrences across 16 files, with 19 in editor directories. The stated 116 all-string/zero- JSX-bodied, 714-line, approximately-21-marker, 30/13/2-story importer breakdown, and 17-file/24-editor-callsite breakdown are not current-source facts.

3. **Required builder does not by itself make the React face possible.** A DOM `SVGElement` cannot be returned as a React element. The generic face must use a deliberate bridge while preserving the builder-only public contract. It must not reintroduce `ReactNode` bodies, named React wrappers, or empty placeholders.

4. **Compile-time versus runtime names - resolved.** `IconName` is already `keyof typeof ICONS`. Keep it narrow for static APIs. Validate `string` at external boundaries and render a visible placeholder for stale/contributed values. A warning plus blank `<svg>` is not acceptable recovery behavior.

5. **The two fallback branches have different lifetimes - resolved.** The no-builder branch is made impossible by the required property and is removed. The unknown-name branch is a type invariant for `createIconElement`; runtime callers use a separate visible-placeholder path. This keeps invalid static names loud without making session restore throw on external data.

6. **Runtime-source classification - resolved.** Current pinned persistence stores editor IDs/board roots, not icons; toolsets store roots/metadata; boards use custom asset files; tree links expose the real arbitrary `ILink.icon?: string` boundary. The plan protects all current resolver paths without inventing a migration for nonexistent persisted icon names.

7. **Registry eagerness - explicitly out of scope.** Keep all 116 explicit eager imports and the registry's single source-of-truth union. The icon contract change must not add a new eager import or attempt code splitting.

8. **Rename trap - resolved for this graph.** All 45 exact module imports are static. Touching an importer is sufficient for Vite's static module graph; no dynamic importer was found. Restart only when the frozen `?t=` symptom appears.

9. **File-icon split and dead files - resolved.** `LanguageIcon.tsx` is a live non-React resolver with a dead React face, so only its React component, aliases, and zero-caller hook are removed; its verified native exports move to `language-icon-resolver.ts`. `FileIcon.tsx` and `TreeProviderItemIcon.tsx` have zero real `src/` importers and are deleted with their 9 JSX occurrences. The `FileIcon` re-export being removed lives in the dead `ui/sidebar/index.ts` barrel; that barrel's broader removal is tracked by a separate collection task and is intentionally out of scope here.

10. **Live sidebar faces - resolved.** `BuiltinEditorsList`, `PinnedRail`, `TrustedBoardsList`, and `TrustedToolsList` each have exactly one importer, `editors/tools-hub/ToolsHubView.tsx`, which is a `Component`-arm editor. They remain because an unconverted editor needs them; this is the intended end state, not an omission.

11. **Pre-existing brand colours - record only.** The source contains **36 hardcoded hex colours** in `theme/icons.tsx`. They are pre-existing product/brand artwork; several comments explicitly state the fixed-colour intent, including the Storybook icon. Do not change them in this contract task. They must not be attributed to the implementation in review.

12. **Non-goals preserved.** Do not convert editor bodies; do not touch `GlobalStyles.tsx`; do not touch `Ornament.tsx` unless a mechanical import/type edit becomes unavoidable; do not change the page React arm, registry splitting, or other E12 non-goals. The 20 icon JSX migrations are the accepted exception to the original no-call-site boundary.

13. **Persephone artwork duplication - resolved.** The JSX body at the current `icons.tsx:240-283` and the `getPersephoneBody` template string near `:264` are two hand-maintained copies of the same drawing and can drift silently. `AboutView.tsx:156` is the only JSX-arm consumer; `MainPageView.ts:103` and `:136` already use `createIconElement("persephone")`, with the theme-dependent-builder comment at `:125`. Removing the JSX arm therefore removes duplication rather than capability. The builder must still read `themeState` at each call so MainPageView's theme-change refresh remains correct.

### Outstanding human verification

No post-change live verification is available in this run because the user is away and the screen is locked. After implementation, a human must check:

- the app-menu `PersephoneIcon` in both light and dark themes;
- the About page's large logo;
- a broad spot check that no icon renders blank.

These checks remain outstanding; this document does not claim they were verified.

## Acceptance Criteria

- [ ] The accepted scope is implemented: 9 JSX occurrences are deleted with `FileIcon.tsx`/`TreeProviderItemIcon.tsx`, two are deleted with the `LanguageIcon.tsx` React face (11 deletions total), and the remaining 20 are migrated to the generic face without converting surrounding editors.
- [ ] `theme/icons.tsx` is renamed to `theme/icons.ts`, and all 45 exact module importers resolve the renamed static module with no stale old-path import.
- [ ] `SvgIconComponent` is a non-callable object with required `createElement: SvgIconDomBuilder` and optional `viewBox` metadata.
- [ ] `SvgIconProps` cannot accept `children`, `IconBody` is `string`, and no JSX-bodied icon can be passed to `createIconWithViewBox`.
- [ ] The 116 registered icons still resolve to builders; `PersephoneIcon` retains its dark/light body and viewBox without being a JSX-bodied exported component.
- [ ] `createIconComponentElement` and `components/icons/icon-elements.ts:createSvg` call required builders directly and contain no unreachable missing-builder throw/check.
- [ ] Exactly one generic React icon face remains for registry icon JSX. It resolves `IconName`, bridges the builder without exposing `SVGElement` as a React child, and has no empty-SVG failure path.
- [ ] `IconName` remains the registry-derived union, `createIconElement` remains statically typed with `IconName`, and literal invalid names such as `"folder"` fail type checking.
- [ ] `slots.ts` no longer warns and returns an empty `<svg>` for either unknown names or absent builders. Runtime-sourced invalid names render a visible, non-empty placeholder with preserved sizing/layout.
- [ ] Widened-string/cast call sites in Button, Dialog, Tag, RadioGroup, ListBox, PinnedRail, Menu, and any equivalent resolver route rejected runtime values through the visible placeholder rather than `as never` plus an empty result.
- [ ] All optional `.createElement?.()`/missing-builder fallbacks that only compensate for the old optional contract are removed from known icon consumers.
- [ ] `icon-registry.ts` retains its eager 116-entry import structure and `IconName` derivation; no new eager imports or registry splitting are introduced.
- [ ] `LanguageIcon.tsx` is split into the live `language-icon-resolver.ts` core and the deleted React face; `useSystemFileIcons()` and both `LanguageIcon` aliases are gone; the live `editors/base/index.ts` barrel no longer re-exports those aliases.
- [ ] `FileIcon.tsx` and `TreeProviderItemIcon.tsx` are deleted, their importers are absent, and only the `FileIcon` re-export is removed from the otherwise untouched dead `ui/sidebar/index.ts` barrel.
- [ ] `fill-slot.ts` keeps its existing lifecycle behavior, and `GlobalStyles.tsx`/`Ornament.tsx` remain untouched unless a purely mechanical rename requires otherwise.
- [ ] The post-change smoke verification repeats the US-1133 structure-only procedure: open-page list, page-placeholder count and activation/laziness, root count/depth/ancestor chain, SVG count, and empty-SVG count. The historical comparison is 238 SVGs/0 empty; the current pre-change recheck was 232/0. The outstanding light/dark Persephone, About-logo, and blank-icon checks are performed by a human and are not claimed here.
- [ ] No unit tests or test harnesses are added, no dashboard entry is changed, and no commit is created.

## Files Changed Summary

| File | Planned change |
|---|---|
| [`src/renderer/theme/icons.ts`](../../../src/renderer/theme/icons.ts) | Renamed from `icons.tsx`; make the icon contract builder-only, require the builder, forbid `children`/React bodies, remove the unreachable throw, and retain the string-backed `PersephoneIcon` builder. |
| [`src/renderer/theme/icon-registry.ts`](../../../src/renderer/theme/icon-registry.ts) | **No change.** Preserve the 116-entry eager registry and `IconName` union. |
| [`src/renderer/theme/language-icons.ts`](../../../src/renderer/theme/language-icons.ts) | **No change.** Preserve the language-icon exports and avoid a new eager import. |
| [`src/renderer/components/icons/icon-elements.ts`](../../../src/renderer/components/icons/icon-elements.ts) | Call required builders directly, import the split resolver core, and preserve native file/tree precedence and custom asset paths. |
| [`src/renderer/components/icons/language-icon-resolver.ts`](../../../src/renderer/components/icons/language-icon-resolver.ts) | New React-free home for the live language/file icon resolver core and its verified native import surface. |
| [`src/renderer/components/icons/LanguageIcon.tsx`](../../../src/renderer/components/icons/LanguageIcon.tsx) | Remove the React file-type face, aliases, and zero-caller hook; retain a React-free compatibility re-export after moving the live resolver core. |
| [`src/renderer/components/file-grid/FileGridView.ts`](../../../src/renderer/components/file-grid/FileGridView.ts) | Update the `prepareFileIcon` import to the split resolver module. |
| [`src/renderer/editors/base/index.ts`](../../../src/renderer/editors/base/index.ts) | Remove the two unused `LanguageIcon`/`LanguageIconProps` re-exports; keep the live barrel. |
| [`src/renderer/components/icons/FileIcon.tsx`](../../../src/renderer/components/icons/FileIcon.tsx) | Delete; zero real importers, with its one JSX occurrence removed rather than migrated. |
| [`src/renderer/components/icons/TreeProviderItemIcon.tsx`](../../../src/renderer/components/icons/TreeProviderItemIcon.tsx) | Delete; zero `src/` importers, with its eight JSX occurrences removed rather than migrated. |
| [`src/renderer/ui/sidebar/index.ts`](../../../src/renderer/ui/sidebar/index.ts) | Remove only the dead `FileIcon` re-export; do not remove this zero-importer barrel, whose broader cleanup is tracked separately. |
| [`src/renderer/uikit/shared/slots.ts`](../../../src/renderer/uikit/shared/slots.ts) | Remove empty-SVG fallback branches, keep static `IconName` typing, and add/use the visible runtime placeholder policy. |
| [`src/renderer/uikit/shared/fill-slot.ts`](../../../src/renderer/uikit/shared/fill-slot.ts) | **No change.** Verify its native-node and temporary React-slot lifecycle remains intact. |
| [`src/renderer/components/icons/Icon.tsx`](../../../src/renderer/components/icons/Icon.tsx) | Add the single generic React face with mutually exclusive registry-name and already-resolved-builder props. |
| The 30 direct `.ts` importers listed above and 13 direct `.tsx` importers listed above | Mechanical import/type/call-site updates required by the rename and required builder. |
| The 20 surviving JSX call-site occurrences listed in the audit | Mechanically replace named theme-icon JSX with the generic face; do not convert the surrounding editors. |
| [`src/renderer/theme/GlobalStyles.tsx`](../../../src/renderer/theme/GlobalStyles.tsx), [`src/renderer/theme/Ornament.tsx`](../../../src/renderer/theme/Ornament.tsx) | **No change**, unless the rename proves a purely mechanical import edit unavoidable for `Ornament.tsx`. |
| [`doc/active-work.md`](../../active-work.md) | **No change.** User explicitly prohibited a dashboard entry. |
| [`doc/epics/EPIC-070.md`](../../epics/EPIC-070.md) | **No change.** Epic is the authoritative source; corrected measurements are recorded here. |
| [`doc/tasks/US-1136-icon-contract/README.md`](README.md) | This investigation, measured corrections, scope gate, decisions, implementation plan, and acceptance criteria. |
