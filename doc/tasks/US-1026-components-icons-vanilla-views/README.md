# US-1026 — `components/icons/` vanilla DOM views

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-058 — De-React Epic D: Shell and shared components](../../epics/EPIC-058.md)
**Created:** 2026-08-22
**Depends on:** [US-1025 — Icon DOM builders](../US-1025-icon-dom-builders/README.md)
**Blocks:** US-1027, US-1028, US-1029, and the later shell tasks that consume editor icons

## Goal

Give the Persephone-coupled icon resolvers a direct-DOM construction path so the upcoming
`file-list`, `file-grid`, `file-search`, and `tree-provider` conversions do not need React roots for
ordinary file, folder, language, board, system, favicon, or registered icons.

Keep every current React-facing export and prop shape compatible for callers that remain React
until later Epic D/E tasks. The task owns the icon resolution seam and its cache subscriptions; it
does not rewrite the consuming lists, tabs, editors, or sidebar.

## Background

### Current surface

The current `src/renderer/components/icons/` folder contains six tracked files and 782 lines after
US-1025:

| File | Lines | Current responsibility | Target in this task |
|---|---:|---|---|
| `EditorIcon.tsx` | 44 | Editor-shaped resolution; may return an arbitrary `ReactNode` from `getIcon()` | Preserve the public React face and define the direct-DOM/compatibility boundary |
| `favicon-cache.ts` | 265 | Favicon disk/network cache, synchronous lookup, React `useFavicons()` hook | Keep the cache and hook; expose the same notification capability to vanilla owners |
| `FileIcon.tsx` | 23 | File path → `FileTypeIcon`; styled folder emoji | Remove its Emotion dependency and share a direct-DOM folder/file path |
| `file-icon-markup.ts` | 60 | HTML-string helper used by `FileGrid` | Already direct-DOM after US-1025; keep its resolver contract and identity cache |
| `LanguageIcon.tsx` | 300 | Language/filename/board/system/default resolution and React `FileTypeIcon` | Share a direct-DOM element resolver; retain `FileTypeIcon`/`LanguageIcon` exports and cache APIs |
| `TreeProviderItemIcon.tsx` | 90 | Tree item kind, favicon, and file-type resolution | Share a direct-DOM element resolver and favicon refresh path |
| **Total** | **782** | 5 React-importing files; 1 Emotion importer before this task | No new consumer-facing API or caller rewrite |

The epic's original 754-line figure predates US-1025's rename/helper changes. The current file
inventory above is the pinned starting point for this task; it is not a reason to edit the epic's
historical surface table.

### Resolution rules that must remain unchanged

`LanguageIcon.tsx` currently resolves in this order:

1. compound filename pattern (`.note.json`, `.grid.json`, `.rest.json`, archive extensions, etc.);
2. Monaco language ID or filename extension through `languageIconMap`;
3. a trusted custom-editor board that wins the file-open priority;
4. a cached Windows system icon;
5. `DefaultIcon`.

`TreeProviderItemIcon` adds its own ordering before that resolver:

1. explicit `git`, `mneme`, and `board` item icons;
2. directory → folder glyph;
3. HTTP(S) URL with an extension → file-type icon;
4. HTTP(S) URL without an extension → favicon, with `page.html` file-icon fallback;
5. local files and archive entries → file-type icon.

Do not change board priority, language mapping, compound-extension precedence, system-icon fallback,
favicon fallback, fixed icon sizes, `MEMORY_ICON_COLOR`, or the folder emoji's visual offset.

### Existing DOM capability and migration seam

US-1025 made every string-bodied registered and language icon expose `createElement(props)`, and
added `createBoardGlyphElement(boardRoot, size)`. `file-icon-markup.ts` already uses these builders
and has an identity-keyed `WeakMap` for component markup. The new work should call the same builders,
not duplicate SVG strings, invoke `renderToStaticMarkup`, or create one React root per icon.

The following consumers intentionally remain outside this task:

- `FileGrid` keeps its HTML-string cell renderer until US-1027;
- `useSystemFileIcons()` remains available to the current `FileGrid` implementation until that
  consumer is converted;
- `useFavicons()` remains available to the current link-editor React surfaces;
- current editor, tab, sidebar, tree-provider, and story call sites are not rewritten here.

### DOM contracts already depending on icon shape

This is not a free wrapper conversion. Existing callers inspect or style the actual icon element:

- `SideBarPanelHeader.tsx` and the collapsible-panel header contract require the leading icon to be
  a direct `svg` child for its `> svg` sizing rule;
- `FolderItem.tsx` has a direct-child `> svg` rule for its `IconRef` slot;
- `TreeItem.css` has explicit direct SVG and `fillSlot` wrapper selectors for the tree icon;
- `PageTab.tsx` styles `svg`/`img` under its language-icon region;
- `Button.css`, `IconButton.css`, and several shell styles size descendant `svg` elements.

The resulting element must therefore stay the actual `svg`/`img`/folder span where the current
contract exposes one. An always-present wrapper is not behavior-neutral merely because it uses
`display: contents`: the wrapper remains in `children`, affects direct-child selectors, and changes
the DOM inspected by automation.

The repository already documents the related slot rule in `ListItem.css:99-113`: a vanilla slot
host may be `display: contents`, while a React-valued slot adds another `display: contents`
wrapper, and both levels must be named explicitly so selectors do not widen into caller-owned
controls. The same convention appears in `TreeItem.css:115`, `ListItem.css:142`, and
`MultiListBox.css:69`. That precedent confirms that wrapper depth is observable; this task still
prefers a bare icon element wherever the icon itself is the public direct-child contract.

The selector audit has two classes. The actual direct-child risks are `SideBarPanelHeader.tsx:37`,
`FolderItem.tsx:59`, `TreeItem.css:132-133`, and `CollapsiblePanelStack.css:38`. The descendant
selectors in `PageTab.tsx:130-136`, `Button.css:75`, and `IconButton.css:38,47` tolerate an
intervening wrapper, but should remain scoped to their current icon region. `FolderIcon` is a span
containing an emoji rather than an SVG, so `FolderItem.tsx:59` has never sized that particular
icon; `ExplorerEditorModel.ts:78` supplies it as a panel-header icon. Preserve that pre-existing
13px/3px behavior rather than turning it into an unrelated styling fix.

## Implementation plan

### 1. Settle the direct-DOM icon contract before converting callers

Introduce one internal direct-DOM seam owned by `components/icons/` for the resolver families rather
than making every future component understand language maps, board priority, and cache state. The
seam should return the actual icon element and preserve the current top-level element kind:

- `createFileTypeIconElement({ language, fileName, ...svgProps })` resolves through the existing
  `resolveFileIcon()` order and returns the builder-produced SVG, board glyph image/SVG, cached
  system `<img>`, or default SVG;
- `createFileIconElement({ path, width, height })` uses `fpBasename()` and delegates to the file-type
  resolver;
- `createFolderIconElement()` returns the existing folder emoji span with the current 13px font size
  and 3px bottom padding, without Emotion;
- `createTreeProviderItemIconElement(item)` preserves the explicit item-icon, directory, HTTP(S),
  favicon, and file-type branches, including the 16px fixed sizes and `MEMORY_ICON_COLOR`;
- the editor-icon path must preserve registered icon names and known built-in DOM builders, while
  retaining a compatibility arm for the known producer shapes returned by `EditorModel.getIcon()`.

Keep these helpers internal/direct-path exports unless a later consumer task needs a public barrel
export. Do not add them to `uikit/index.ts`; `components/icons/` remains a coupled application
surface, not a new UIKit primitive.

### 2. Preserve React-facing exports as compatibility faces

Keep `FileIcon`, `FolderIcon`, `FileTypeIcon`, `LanguageIcon`, `TreeProviderItemIcon`, and
`EditorIcon` import paths, aliases, exported interfaces, and prop behavior unchanged for current
React callers. Their implementation may delegate to the direct-DOM seam where the root shape is
stable, but known React icon producers must continue to use the existing compatibility path until
their consuming shell task has migrated them; Epic F owns removal of the shared arm itself.

In particular:

- `FileTypeIconProps extends SvgIconProps` remains the public type, including SVG attributes,
  `style`, `className`, `ref`, and event props;
- `LanguageIcon` remains the exact alias of `FileTypeIcon`, and `LanguageIconProps` remains the type
  alias;
- `EditorIconSource` remains structural and decoupled from `EditorModel`; `getIcon?: () => IconRef`
  is not narrowed to icon names;
- the local `FileIconProps` and inline `TreeProviderItemIcon` prop shape are not widened or exported;
- `fileIconMarkup()` remains a string-returning helper for the existing grid boundary.

If a direct-DOM helper cannot represent a compatibility value, use the existing React bridge only
for that arm and document it as a compatibility survivor. Do not stringify React nodes, inspect
private React element internals, or silently drop custom editor icons.

### 3. Resolve the stable-root mismatch explicitly

Before using `mountVanilla` for an icon component, resolve the foundational mismatch between
`VanillaView` and icon resolution:

- `VanillaView`/`IOwnedView` currently require a stable `HTMLElement` root;
- the icon resolver can legitimately change its top-level element from SVG to IMG when a board or
  system cache becomes available;
- a root wrapper would break the direct-child contracts listed above;
- changing a mounted view's root in place would violate the ownership and adapter assumptions in
  US-986/987/989.

The recommended bounded resolution is to use direct element factories for polymorphic icon results,
and reserve `VanillaView` adapters for an icon whose root kind is stable. If the implementation
instead generalizes `VanillaView<P, R extends Element>` and adds a safe root-replacement contract,
that must be treated as an explicit foundational change with tests for `mountVanilla`, `child()`,
`SubtreeSwap`, disposal, refs, and direct-child selectors. Do not solve this by casting an SVG or
IMG to `HTMLElement`.

### 4. Make cache updates available to vanilla owners

Retain the singleton `SystemIconModel`, `prepareFileIcon()`, `resolveFileIcon()`, and
`useSystemFileIcons()` compatibility hook. Add the smallest direct subscription/read seam needed by
the new native consumers so a cache fill can refresh an already-rendered icon without a React
rerender. The subscription must be disposed by the owning view/helper.

Reuse `customEditorRegistry`'s existing synchronous resolver and reactive state source; a trusted
board association change must refresh the resolved icon just as `useBoardsForFile()` does today.
Do not add a second board cache or change `resolveEditorIdForFile()` priority rules.

Keep `favicon-cache.ts`'s memory/disk/network behavior and `useFavicons()` hook. Its existing
`onFaviconReady(hostname, callback)` is the direct notification primitive for native owners. A
native tree icon that owns a favicon branch must unsubscribe on replacement/disposal, re-read the
synchronous cache, and preserve the `page.html` fallback. If the native path initiates the existing
async disk lookup, make that explicit and ensure it does not create duplicate fetches or change the
link-editor hook's behavior.

### 5. Remove the remaining Emotion importer without changing folder/icon appearance

Replace `FileIcon.tsx`'s `styled("span")` folder root with the same raw-DOM or compatibility-face
implementation used by `createFolderIconElement()`. Preserve `font-size: 13px`, `padding-bottom:
3px`, the emoji text, and the current top-level span shape. No new color, CSS class, or data-type is
needed for this legacy coupled glyph unless the direct-DOM contract establishes one for later tasks.

Verify that `@emotion/styled` no longer appears under `components/icons/`. Do not touch unrelated
Emotion in `ui/` or editors in this task.

### 6. Verify the seam before US-1027/1028/1029 consume it

Exercise the direct path for:

- language icons with a plain body, `currentColor`, fixed color, Draw/DrawOrange tint, and Kotlin
  gradient;
- compound filename overrides (`.note.json`, `.grid.csv`, `.rest.json`, `.excalidraw`, archive);
- a winning custom board with and without a board icon file;
- a system icon cache hit and a default fallback;
- folders, git/mneme/board tree item overrides, HTTP URL with extension, HTTP URL favicon hit/miss,
  and local/archive tree items;
- an editor icon whose `getIcon()` returns a registry-backed SVG, a `BoardGlyph`/`FileIcon`-style
  custom React node, and no icon.

Check the actual direct-child contracts at `SideBarPanelHeader.tsx:37`, `FolderItem.tsx:59`,
`TreeItem.css:132-133`, and `CollapsiblePanelStack.css:38`. Separately check the wrapper-tolerant
descendant contracts at `PageTab.tsx:130-136`, `Button.css:75`, and `IconButton.css:38,47`.
Do not accept a visually similar `display: contents` wrapper without checking `children`,
`querySelector`, `closest`, and the direct-child CSS contracts. Verify that a monochrome
panel-header icon follows the active accent through `currentColor`, while an explicitly colored
icon keeps its hue; keep `EditorIcon.tsx:32-36` accurate.

Run `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check`. Confirm there
are no new `react-dom/server` imports, no new `createRoot` per icon, and no `@emotion/styled` import
under `components/icons/`.

## Concerns / Open questions

### 1. The current vanilla-view root contract does not fit polymorphic icon roots

This is the main design decision. `VanillaView.root` and `IOwnedView.root` are `HTMLElement`, and
`mountVanilla` assumes the view's root is stable for its lifetime. `FileTypeIcon` and `BoardGlyph`
can return SVG or IMG depending on board/system cache state, while `EditorIcon` can return arbitrary
React nodes. A permanent span wrapper breaks direct-child SVG selectors in the sidebar and tree.

Preferred resolution: make this task's direct-DOM factories the migration seam and leave the
React-facing functions as compatibility faces until their consumers are converted. A foundational
root-generalization/root-replacement change should only be added if the user wants icon components
themselves to be `VanillaView` instances now; it is not safe to smuggle that change in as a cast.

### 2. `EditorIcon` has a known-producer compatibility arm

`EditorModel.getIcon()` is typed as `() => React.ReactNode`, but an inventory of all 15 production
producers found no arbitrary runtime shape. The known component producers include `ArchiveIcon`,
`BoardColorIcon`, `CompareIcon`, `GitIcon`, `MemoryIcon` (two producers), `StorybookIcon`,
`ToolsIcon`, `PlayerIcon`, `McpIcon`, and the `TorIcon`/`IncognitoIcon`/`GlobeIcon` branch in
`BrowserEditor.ts:303-311`. `BoardEditorModel.ts:218-224` returns `BoardGlyph` or `BoardIcon`,
`ImageEditor.ts:300-306` returns `FileIcon`, and `CategoryEditorModel.ts:37-41` is the only
outlier: `FolderIcon` wrapped in a fixed, code-owned span with `translate(-2px, -3px)`.

Every producer is therefore mechanically convertible to a component-plus-props descriptor when
its editor consumer is migrated. The compatibility arm remains in this task because converting
those 15 editor models and their callers is outside the `components/icons/` boundary. It is a
known-shape survivor, not evidence that an arbitrary React node has no direct-DOM equivalent.

The `ReactNode`/`IconRef` arm is owned by Epic F's removal ledger: it is deleted with the remaining
React icon wrappers. US-1033 and US-1035 may migrate consumer-side slots, but must not independently
claim ownership of deleting this shared type arm. Preserve the transformed folder icon and all
producer-specific color/size behavior until those conversions land.

### 3. Cache timing can change the top-level DOM element

The first render may be `DefaultIcon`/language SVG, then a system cache fill may resolve an IMG; a
custom board association can similarly replace a language icon with a board image or board SVG.
The update must not leave a stale old element, leak a subscription, or reset parent focus/selection
by re-inserting an unchanged icon. Native owners need identity/change guards and explicit disposal.

### 4. System-icon reactivity currently belongs to `FileGrid`, not `FileTypeIcon` itself

`FileGrid` calls `useSystemFileIcons()` and `prepareFileIcon()` at the grid level. `FileTypeIcon`
reads the cache during render but does not itself subscribe to that state. A direct native resolver
must not accidentally create one subscription per pooled cell; US-1027 should own one grid-level
refresh or a carefully scoped shared cache subscription. This task should expose the primitive and
document ownership, not preemptively redesign the grid.

### 5. Favicon readiness is asymmetric today

`useFavicons()` performs async disk checks and listens for `onFaviconReady`, while
`TreeProviderItemIcon` only performs a synchronous lookup and relies on a parent rerender. A native
tree provider can make favicon updates reliable by subscribing directly, but that is a behavior
improvement relative to the current component and may cause an extra disk read. Decide whether to
preserve the exact current contract or explicitly adopt the direct subscription for native owners;
either way, do not duplicate network fetches.

### 6. Direct-child selectors must be audited with the actual replacement shape

The actual direct-child risks are `SideBarPanelHeader.tsx:37`, `FolderItem.tsx:59`,
`TreeItem.css:132-133`, and `CollapsiblePanelStack.css:38`; these require the bare icon element
where the current contract exposes one. The selectors in `PageTab.tsx:130-136`, `Button.css:75`,
and `IconButton.css:38,47` are descendant selectors and tolerate an intervening wrapper, although
their existing region scoping must remain intact. Two direct-child sites, `SideBarPanelHeader` and
`FolderItem`, are themselves scheduled for later Emotion conversion, so this constraint is
temporary but still applies to this seam.

`FolderIcon` is a span containing an emoji rather than an SVG, so `FolderItem.tsx:59` has never
sized it; `ExplorerEditorModel.ts:78` supplies that pre-existing shape as a panel-header icon.
Preserve its 13px/3px styling. Also audit `EditorIcon.tsx:32-36`: a monochrome panel-header icon
must continue to follow the active panel accent through `currentColor`, while an explicitly colored
icon retains its own hue. Keep that comment accurate if the compatibility shape changes. A
typecheck will not catch a wrapper or a color boundary that changes these contracts.

### 7. React compatibility faces keep React in this folder by design

The task's success criterion is not “zero React imports under `components/icons/`” if current React
callers still need `EditorIcon`, `FileTypeIcon`, or `useFavicons`. The criterion should instead
separate the direct-DOM capability from the compatibility boundary. Epic F owns the final removal
of the `ReactNode`/`IconRef` arm; later Epic D/E tasks migrate the consumers that make that removal
possible. Do not delete `favicon-cache.ts`'s hook or alter the public icon source types just to
satisfy a grep.

## Acceptance criteria

- [ ] A documented direct-DOM resolver exists for file/language icons, file paths, folders, and tree
      provider items, with the actual SVG/IMG/span root and no per-icon React root.
- [ ] The direct resolver preserves the complete current precedence order: compound patterns,
      language map, winning custom board, system cache, default; tree-provider explicit-item,
      directory, URL, favicon, and file branches remain unchanged.
- [ ] US-1025 builders are reused for all static/icon-name paths; SVG geometry, viewBox, attributes,
      current-color behavior, gradients, Draw tints, board image sizing, and folder emoji styling
      remain unchanged.
- [ ] System-icon and custom-editor registry changes can refresh a native owner through a disposed
      subscription/notification path, without duplicate fetches or per-cell React roots.
- [ ] Favicon-backed tree icons retain the synchronous cache/fallback contract and have a documented
      owner for readiness notifications; disposal removes the notification listener.
- [ ] `EditorIcon`'s known-producer compatibility arm is explicitly retained with Epic F named as
      the owner of the eventual `ReactNode`/`IconRef` removal; no custom editor icon silently
      disappears.
- [ ] Existing React-facing exports, aliases, prop types, direct import paths, and current callers
      remain type-compatible and behaviorally unchanged.
- [ ] No new `display: contents`/wrapper element changes direct-child SVG contracts at the sidebar,
      tree, button, tab, or header surfaces; verify `children` and selector matches, not only pixels.
- [ ] `@emotion/styled` is no longer imported by `src/renderer/components/icons/`, while the folder
      emoji retains its 13px / 3px styling.
- [ ] `react-dom/server` remains absent, `file-icon-markup.ts` keeps its identity-based cache, and
      no one-icon `createRoot` path is introduced.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check` pass.

## Files changed

### Expected modifications

| File | Change |
|---|---|
| `src/renderer/components/icons/LanguageIcon.tsx` | Share the direct file/language element resolver; preserve React exports, aliases, resolution order, and system-icon compatibility APIs |
| `src/renderer/components/icons/FileIcon.tsx` | Share the file/folder direct path and remove the Emotion folder root without changing public props or DOM shape |
| `src/renderer/components/icons/TreeProviderItemIcon.tsx` | Share the tree-provider direct path and define favicon readiness ownership |
| `src/renderer/components/icons/EditorIcon.tsx` | Preserve editor-source API and implement/retain the reviewed direct-vs-React compatibility arms |
| `src/renderer/components/icons/favicon-cache.ts` | Add only the direct-owner notification/read seam required by native icon consumers; preserve `useFavicons()` |
| `src/renderer/uikit/shared/vanilla-view.ts` | Only if the reviewed solution generalizes the root contract; otherwise no change |
| `src/renderer/uikit/shared/mount.tsx` | Only if the reviewed solution changes `mountVanilla` root typing; otherwise no change |
| `doc/active-work.md` | Link US-1026 under EPIC-058 |
| `doc/epics/EPIC-058.md` | Link US-1026 in the task table and update its status only when implemented |

### Possible new direct-path module

| File | Change |
|---|---|
| `src/renderer/components/icons/icon-elements.ts` | Pure direct-DOM factories if keeping the polymorphic element seam separate from React compatibility faces is the selected design |

### Explicitly not changed

- `src/renderer/components/icons/file-icon-markup.ts` — already converted by US-1025; retain its
  string boundary and identity cache unless the shared resolver can be reused without changing it.
- `src/renderer/theme/icons.tsx`, `theme/language-icons.ts`, and `theme/icon-registry.ts` — their
  builders and registry contracts are complete after US-1025.
- `src/renderer/editors/board/board-glyph-element.ts` and `board-icon-cache.ts` — reuse their direct
  builder/cache behavior; do not create another board icon cache.
- `src/renderer/components/file-list/`, `components/file-grid/`, `components/file-search/`, and
  `components/tree-provider/` callers — their native migration belongs to US-1027–US-1029.
- `src/renderer/ui/tabs/`, `ui/sidebar/`, `ui/secondary-views/`, and editor models that produce
  custom `getIcon()` React nodes — later shell/editor tasks own those caller changes.
- `uikit/index.ts` and any public UIKit barrel — this coupled resolver remains a direct component
  import, not a new UIKit primitive.

## Related work

- [EPIC-058 — De-React Epic D](../../epics/EPIC-058.md)
- [US-1025 — Icon DOM builders](../US-1025-icon-dom-builders/README.md)
- US-1027 — File list and file grid
- US-1028 — File search
- US-1029 — Tree provider
- [US-996 — Vanilla UIKit contracts](../US-996-vanilla-uikit-contracts/README.md)
- [US-997 — Icon registry DOM builders](../US-997-dom-icon-path/README.md)
- [US-989 — React/vanilla mount adapter](../US-989-boundary-adapters/README.md)
- [UIKit authoring guide](../../../src/renderer/uikit/CLAUDE.md)
- [UI element contract](../../architecture/ui-element-contract.md)
