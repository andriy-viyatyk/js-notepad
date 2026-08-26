# US-1101 - Native content-host footer

## Goal

Convert `src/renderer/editors/base/ContentHostFooter.tsx` to a native
`ContentHostFooterView`, leaving the `.tsx` file as a thin `mountVanilla`
compatibility face. Preserve the footer's DOM, state, conditional elements,
provider metadata, icon colors, and contribution seam while removing the
`ScriptToggleButton` child-slot React root.

This is task 3 of [EPIC-067](../../epics/EPIC-067.md). `EditorToolbarView`
(US-1099) and `ScriptPanelView` (US-1100) are separate in-flight tasks and are
assumed to exist; neither is changed here.

## Background

### Callers and contribution inputs

The complete direct caller set is two files:

| Caller | Verified location | React status in this task | Contribution value |
|---|---:|---|---|
| `src/renderer/editors/base/TextChrome.tsx` | 104 | Stays React | Forwards `TextChromeProps.footerContributions` |
| `src/renderer/editors/board/BoardEditorView.tsx` | 92 | Stays React | Passes `<FooterStatus model={model} />` when a content host exists |

The footer is not called anywhere else in `src/renderer`. `TextChrome` passes
its optional contribution unchanged; `BoardEditorView` supplies its own
status element. No caller change is part of this task.

The verified split is four non-null JSX contribution values and ten absent
values among the 14 `TextChrome` callers:


| `TextChrome` caller | Verified source | Contribution |
|---|---:|---|
| `grid` | `src/renderer/editors/grid/index.tsx:30-32` | `<GridFooterBits editor={editor} />` |
| `link-editor` | `src/renderer/editors/link-editor/index.tsx:190` | `<LinkFooterBits model={linkEditor} />` |
| `graph` | `src/renderer/editors/graph/index.tsx:102` | `<GraphFooterBits model={graph} />` |
| `notebook` | `src/renderer/editors/notebook/index.tsx:101` | `<NotebookFooterBits model={notebook} />` |

The other ten of the 14 `TextChrome` callers pass no footer contribution:
`env-vars`, `draw`, `mermaid`, `file-diff`, `markdown`, `html`, `log-view`,
`rest-client`, `svg`, and `monaco`. Each of the four values is a React element
at the `ContentHostFooter` boundary, even if its implementation contains a
native face, so `fillSlot` takes its React arm. Therefore this task removes one
script-child root from each script-bearing footer: the verified net is -1 for
the ten callers without contributions and 0 for the four callers with
contributions. `BoardEditorView` is outside the epic and is net 0 while its
script button exists because its React `FooterStatus` contribution adds one
root.

### Current component and DOM contract

The current `ContentHostFooter.tsx` renders this fixed order:

```text
text-chrome-footer panel
  ScriptToggleButton (only when host.script exists)
  Spacer
  footerContributions (optional)
  vertical Divider
  ProviderIcon (conditional)
  EncodingLabel (always)
```

The current `data-name` output is deliberately small:

| Element | Current output and presence |
|---|---|
| `EditorToolbar` root | `data-type="panel" data-name="text-chrome-footer"` after US-1099 |
| Script button | `data-type="button" data-name="text-toggle-script" data-variant="ghost" data-size="sm"`; absent when `host.script` is absent |
| Script label | Plain `<span>` containing `script`; no `data-name` |
| Spacer | `data-type="spacer"`; no `data-name` |
| Divider | `data-type="divider" data-orientation="vertical"`, `role="separator"`, `aria-orientation="vertical"`; no `data-name` |
| Provider badge | Plain `<span title="...">`; no `data-type` or `data-name`; absent when there is no pipe, or no recognized provider and no archive transformer |
| Provider icons | SVG elements from the icon builders; no `data-name` |
| Encoding label | Plain `<span>` containing `encoding || "utf-8"`; no `data-type` or `data-name`; always present |

The native target may add `data-part` hooks for owned regions, but must not
invent public `data-name` values. The provider conditions are three separate
cases from the old function: `!host.pipe`, `!meta && !isArchive`, and the
recognized/archive case that creates the badge. `ScriptToggleButton`'s
`!host.script` branch is also a DOM-presence contract, not a disabled state.

### Native primitives and the slot mechanism

The actual native classes are:

| Existing React import | Native class | Verified native behavior |
|---|---|---|
| `src/renderer/uikit/Spacer/Spacer.tsx` | `src/renderer/uikit/Spacer/SpacerView.ts` | `span[data-type="spacer"]`; `Spacer.css` supplies `flex: 1 1 auto` |
| `src/renderer/uikit/Divider/Divider.tsx` | `src/renderer/uikit/Divider/DividerView.tsx` | `div[data-type="divider"]`; vertical orientation sets the orientation attributes and CSS |
| `src/renderer/uikit/Button/Button.tsx` | `src/renderer/uikit/Button/ButtonView.tsx` | `button[data-type="button"]`; applies name, variant, size, disabled state, native click handling, and child content |

`ButtonView` calls `fillSlot(this.root, children)` when its child is not a
simple string/number/boolean. Its public React-facing `ButtonProps` types
`children` as `ReactNode`, so the native view needs a narrow
`ButtonViewProps` widening to `children?: SlotContent`. This lets the footer
pass a freshly constructed `HTMLSpanElement` without an unsafe cast. The
React `ButtonProps` interface and `Button.tsx` face remain unchanged. The DOM
span then takes `fillSlot`'s node arm and creates no React root.

The footer must respect `fillSlot` ownership from
`src/renderer/uikit/shared/fill-slot.ts`: do not call an old cleanup before an
update and do not write directly to a fill-slot host. The footer's contribution
host is its own `data-part="footer-contributions"` region. The toolbar's
single child slot receives a native `data-part="footer-content"` host, so
provider insertion/removal and contribution updates never write around
`EditorToolbarView`'s slot.

The native composition is:

```text
EditorToolbarView.root: data-type="panel" data-name="text-chrome-footer"
- span[data-part="footer-content"] (display: contents)
   - ButtonView.root, data-name="text-toggle-script" (conditional)
   |  `-- span[data-part="script-label"] (native DOM child)
   - SpacerView.root
   - span[data-part="footer-contributions"] (display: contents; fillSlot host)
   - DividerView.root
   - span[data-part="provider-badge"] (conditional)
   - span[data-part="encoding-label"]
```

`EditorToolbarView` receives `footer-content` as its `children?: SlotContent`
Node, so its non-React arm attaches the fixed native composition. The view
owns and mounts the three primitive children exactly once.

The footer composes rather than extends `EditorToolbarView`: the toolbar is an
owned child whose root is adopted as the footer root. This keeps the public
props type aligned with `VanillaView` and avoids an inheritance mismatch; the
same shape applies to US-1102's `PageToolbarView` and must use composition too.

### Root prediction and exact operator check

The EPIC-067 baseline for each of the 14 `TextChrome` editors is two
`data-react-root` elements: the editor root and the footer's
`text-toggle-script` child-slot root. This task removes exactly the latter
when `host.script` exists: the native view builds the label span and passes a
DOM Node into `ButtonView`, so `fillSlot` no longer calls `mountReactHandle`.

The contribution slot is separate and must not be netted into the removed
root:

| Surface | Script child root removed | Contribution root added | Predicted net |
|---|---:|---:|---:|
| Ten no-contribution `TextChrome` editors | -1 | 0 | **-1** (`2 - 1` at the EPIC baseline) |
| `grid`, `link-editor`, `graph`, `notebook` | -1 | +1 | **0** (`2 - 2` at the EPIC baseline) |
| `BoardEditorView` with React `FooterStatus` | -1 when `host.script` exists | +1 | **0** while script exists; `+1` if a host without script supplies the contribution |

The `+1` contribution root is present because these callers pass React
elements at this seam. A `null` or DOM Node would take the empty/non-React
arm, but the four verified callers pass JSX. Board passes a JSX element even
when `FooterStatus` later renders `null`, so the boundary root remains.

Run this exact DOM query in the renderer:

```js
document.querySelectorAll('[data-name="text-toggle-script"] [data-react-root]').length
```

It must be `0` after US-1101 for a footer with `host.script`; the same query
is `1` before this task. The separate contribution check is:

```js
document.querySelectorAll('[data-part="footer-contributions"] [data-react-root]').length
```

It must be `0` for the ten no-contribution editors and `1` for each actual
React contribution caller (and the Board footer). Count `[data-react-root]`,
not `[data-part="react-slot"]`; the latter can over-report roots.

### Reactive state and the masked pipe defect

`EncodingLabel` already subscribes to `host.state.use((s) => s.encoding)` and
the native view must bind that slice, retaining `encoding || "utf-8"`.
`ScriptToggleButton` already subscribes to `host.script.state.use((s) => s.open)`;
the native view must bind it to the label state/color and use the native
button click listener to call `host.script.toggleOpen`.

`ProviderIcon` is different. Its own comment says, -Touch state so the footer
re-renders normally; pipe is stable per page-. It subscribes to
`host.state.filePath` only as a repaint trigger, then reads `host.pipe`,
`pipe.provider.type`, `pipe.provider.sourceUrl`, and `pipe.transformers`.
None of those values is currently a reactive channel.

Source tracing shows that the pipe can change during a host's life:

- `TextFileIOModel.ensurePipe()` creates legacy file/archive pipes and routes
  them through `setPrimary()`.
- `TextFileIOModel.setPrimary()` replaces the source/cache pair and assigns
  `this.model.pipe`.
- Save As, rename, restore, and the encryption model's decrypt/lock/unprotect
  paths replace the primary through `setPrimary()` or `io.setPrimary()`.
- `TextFileIOModel.dispose()` clears the pipe.
- `PagesLifecycleModel.createEditorFromFile()` calls `TextFileModel.setPipe()`
  for an opened/restored content host, which funnels into `setPrimary()`.

Add a separate, non-persisted, pipe-valued `TOneState<IContentPipe | null>`
field named `pipeState` to `TextFileModel`. It must not be a member of
`TextFileModel.state`, `IContentHost.state`, `IEditorState`, or any other
persisted editor/host state object. `IEditorState.pipe` remains the persisted
`IPipeDescriptor`; never assign the live `IContentPipe` object to that field.
Every authoritative assignment in `TextFileIOModel.setPrimary()` and disposal
updates `pipeState` immediately after the `model.pipe` assignment. The current
source has only those two direct text host pipe writes; all public replacement
paths funnel through them. The view then binds only the provider projection:

```ts
this.bind(host.pipeState, (pipe) => pipe, (pipe) => this.renderProvider(pipe));
```

This is a real pipe channel, not the old unrelated-field trick or a blanket
footer repaint. `IContentHost` need not grow this implementation-specific
channel because this footer already receives `TextFileModel`.

As an implementation verification step, inspect `TextEditorModel.getRestoreData`,
`getDescriptor`, the editor/session cache writes, and every `JSON.stringify` of
host or editor state. Confirm that only the serializable `IPipeDescriptor` is
written/restored, that `pipeState` is absent from cache data and restore data,
and that no live `IContentPipe` can reach persisted state through a spread or
serialization of a host/editor state object.

### Icons and single-use DOM nodes

The four current imports are `FolderOpenIcon`, `GlobeIcon`, `MemoryIcon`, and
`ArchiveIcon` from `src/renderer/theme/icons.tsx`. All four are registered in
`src/renderer/theme/icon-registry.ts` as `folder-open`, `globe`, `memory`, and
`archive`, and all have DOM builders. The native view should use:

```ts
createIconElement("folder-open", { width: 16, height: 16, color: color.text.light });
createIconElement("globe", { width: 16, height: 16, color: DEFAULT_BROWSER_COLOR });
createIconElement("memory", { width: 16, height: 16, color: MEMORY_ICON_COLOR });
createIconElement("archive", { width: 16, height: 16 });
```

`createIconComponentElement` is for a direct icon component that is not in the
name registry; it is not needed for these four. Every provider refresh must
build fresh SVG Nodes. Never cache a Node in `PROVIDER_META`, store one on the
view for reuse, or share it between branches/call sites: appending a single-use
SVG to a second host moves it and blanks the first. Reuse the existing palette
constants and `color.text.light`; add no color literal.

### Styling decision

The existing inline styles are: script color default/light plus font size 13;
encoding color light, `padding: "0 4px"`, and font size 13; provider
`inline-flex`, centered, gap 2, and `padding: "0 2px"`.

Move these rules to the new co-located
`src/renderer/editors/base/ContentHostFooter.css`. Use `data-part` and
`data-state="open"` on the script label, and the existing theme custom
properties (`--color-text-default`, `--color-text-light`, `--font-md`,
`--space-sm`, `--space-xs`, `--gap-xs`) so values remain equivalent. No hex,
RGB, named color, or new color token is added. The direct native view must
explicitly import the borrowed `Button.css`, `Divider.css`, and `Spacer.css`
as well as its co-located stylesheet; it cannot rely on a React face to load
those styles.

## Implementation Plan

- [ ] In `src/renderer/uikit/Button/ButtonView.tsx`, define `ButtonViewProps`
  as the existing button props with `children?: SlotContent`, leaving
  `ButtonProps` and `Button.tsx` unchanged. Keep the simple-child fast path;
  a DOM span must reach the existing `fillSlot(this.root, children)` Node arm.
  This establishes the reusable seam rule: the native class takes `SlotContent`,
  while the React face keeps `React.ReactNode`. Do not widen any other uikit
  view in this task; evaluate the same residue separately for views used by
  US-1102 onward.
- [ ] Add `src/renderer/editors/base/ContentHostFooter.css`. Scope the
  script, encoding, provider, footer-content, and contribution regions from
  the footer panel. Preserve 13px text and 2px/4px spacing through existing
  font/space/gap variables and express open/closed color with the existing
  text variables. Do not add a color literal.
- [ ] Add `src/renderer/editors/base/ContentHostFooterView.ts` as a public-
  constructor `VanillaView` that composes the existing `EditorToolbarView`
  with a `data-part="footer-content"` Node slot. Pass
  `name: "text-chrome-footer"` and `borderTop: true`; do not implement a
  second toolbar or change `EditorToolbarView`.
- [ ] In `onMount()`, create and own `ButtonView`, `SpacerView`, and
  `DividerView`, attach each root before mounting it, and append them in the
  old order. Give the button `name: "text-toggle-script"`, `variant: "ghost"`,
  `size: "sm"`, and `host.script.toggleOpen`. Build a fresh native `script`
  span and pass it as the button's `SlotContent`. If `host.script` is absent,
  create neither the button nor its label.
- [ ] Keep a display-contents `footerContributions` host and call `fillSlot`
  with the prop on mount and later updates. Do not run the old disposer before
  a new call, write around the host, or call `replaceChildren` on it outside
  `fillSlot`; register one disposal cleanup. Provider changes may mutate only
  the footer-content host, not the toolbar-owned slot host.
- [ ] Bind `host.script.state`'s `open` field to the script label's
  `data-state`/color, and bind `host.state`'s `encoding` field to the encoding
  label text. Do not subscribe to `host.state.filePath` as a repaint.
- [ ] Add `pipeState` as a separate model field to
  `src/renderer/editors/text/TextEditorModel.ts`, outside every persisted
  editor/host state object, as a non-persisted `TOneState<IContentPipe | null>`.
  In `src/renderer/editors/text/TextFileIOModel.ts`, publish it after the two
  authoritative `model.pipe` writes in `setPrimary()` and `dispose()`. Keep
  `IEditorState.pipe` as `IPipeDescriptor`; do not add a serialized field or
  alter `IContentHost`.
- [ ] Verify that `pipeState` is absent from cache files, restore data,
  descriptors, and all `JSON.stringify` output for host/editor state; only the
  serializable pipe descriptor may cross that persistence boundary.
- [ ] Bind `pipeState` only to a provider projection. Remove the old badge;
  for no pipe or an unrecognized non-archive pipe, leave no badge element;
  otherwise create a fresh badge/title and fresh `createIconElement` Nodes,
  insert the badge before encoding, and preserve labels, `sourceUrl`, archive
  detection, dimensions, and existing colors.
- [ ] Reduce `src/renderer/editors/base/ContentHostFooter.tsx` to the existing
  face contract and a thin `mountVanilla` face. The required shape is:

  ```tsx
  // Before: JSX owns the row and ScriptToggleButton's React <span>.
  export function ContentHostFooter({ host, footerContributions }: ContentHostFooterProps) {
      return <EditorToolbar name="text-chrome-footer" borderTop>{/* JSX children */}</EditorToolbar>;
  }

  // After: the face keeps the React caller contract; the view owns all DOM.
  export function ContentHostFooter(props: ContentHostFooterProps): React.ReactElement {
      return mountVanilla(ContentHostFooterView, props);
  }
  ```

  Remove JSX subcomponents and React-only implementation imports. Do not
  change either footer caller or any `TextChrome` caller.
- [ ] Import `Button.css`, `Divider.css`, `Spacer.css`, and the new footer CSS
  from the direct native-view path. Run `npx tsc --noEmit` and `npm run lint`.
  Then manually inspect script/no-script, file/HTTP/Mneme/archive/no-pipe,
  contribution, encoding, pipe-swap, and disposal cases using the exact DOM
  queries above. Do not add tests or a harness.

## Concerns

1. The verified split is four `TextChrome` callers with footer contributions
   and ten without. This task's net is -1 for the ten without contributions and
   0 for the four with them; the Board caller outside the epic is net 0 while
   its script button exists.
2. The pipe is not page-stable: Save As, rename, restore, encryption, and
   disposal replace or clear it. `pipeState` is a narrow value channel; a
   `filePath` subscription or whole-footer repaint would recreate the defect.
3. The Button seam is a reusable EPIC-066 residue pattern: a converted uikit
   native class takes `SlotContent`, while its public React face keeps
   `React.ReactNode`. This task widens only `ButtonView`; later native tasks may
   need the same treatment for other uikit views they actually compose, and no
   unused view should be widened here.
4. `fillSlot` owns each host. The toolbar owns its panel slot; the footer owns
   its content host and contribution host. Never clean a live slot before
   updating it or mutate it behind `fillSlot`.
5. Icons are single-use resources. Fresh SVG Nodes are mandatory on every
   provider refresh; caches can blank a different footer while type checking
   and lint remain green.
6. Whole-editor counts include US-1099/US-1100 intermediate state. Isolate
   this task with the script-descendant and contribution-host queries, and do
   not report later `TextChrome`/caller conversions as this task's result.

There are no unresolved design questions: styles use co-located static CSS,
the pipe has a real channel, the registered icon path is `createIconElement`,
and all four contribution callers are explicitly accounted for.

## Acceptance Criteria

- [ ] `ContentHostFooterView.ts` is the sole footer implementation and is a
  native `VanillaView` with a public constructor.
- [ ] `ContentHostFooter.tsx` retains `host` and
  `footerContributions?: ReactNode` and contains only the `mountVanilla` face.
- [ ] The root is the existing `EditorToolbarView` output with
  `data-type="panel" data-name="text-chrome-footer"`; no second toolbar or
  parent conversion is introduced.
- [ ] Native Button/Spacer/Divider preserve names, variant, size, orientation,
  roles, order, click behavior, and conditional presence. The label span uses
  `fillSlot`'s Node arm.
- [ ] A script footer has `span[data-part="script-label"]` containing
  `script`, and `document.querySelectorAll('[data-name="text-toggle-script"] [data-react-root]').length`
  is `0`; a footer without `host.script` has no named script button.
- [ ] Provider badge presence exactly matches the old branches; title, source
  URL, provider/archive icons, dimensions, and colors are preserved, with no
  cached/shared icon Node.
- [ ] Encoding, script open, and pipe replacement update through their three
  specific bindings; the provider binding does not repaint the footer.
- [ ] `pipeState` is a separate non-persisted model field, never part of
  `IEditorState` or host/editor state serialization. Verification confirms no
  live `IContentPipe` reaches cache files, restore data, descriptors, or
  `JSON.stringify` output; only `IEditorState.pipe`'s `IPipeDescriptor` does.
- [ ] The contribution slot has no root for ten callers and one root for
  `grid`, `link-editor`, `graph`, `notebook`, and the Board contribution.
- [ ] Co-located CSS uses existing theme variables/tokens and adds no color
  literal. No unit tests/harnesses are added and no commit is created.

### Files that need NO changes

- `src/renderer/editors/base/TextChrome.tsx`
- `src/renderer/editors/board/BoardEditorView.tsx`
- `src/renderer/editors/base/EditorToolbar.ts`
- `src/renderer/editors/base/EditorToolbarView.ts`
- `src/renderer/editors/text/ScriptPanel.ts`
- `src/renderer/editors/text/ScriptPanelView.ts`
- `src/renderer/editors/env-vars/index.tsx`
- `src/renderer/editors/draw/index.tsx`
- `src/renderer/editors/mermaid/index.tsx`
- `src/renderer/editors/file-diff/index.tsx`
- `src/renderer/editors/markdown/index.tsx`
- `src/renderer/editors/html/index.tsx`
- `src/renderer/editors/log-view/index.tsx`
- `src/renderer/editors/rest-client/index.tsx`
- `src/renderer/editors/svg/index.tsx`
- `src/renderer/editors/monaco/index.tsx`
- `src/renderer/editors/grid/index.tsx`
- `src/renderer/editors/link-editor/index.tsx`
- `src/renderer/editors/graph/index.tsx`
- `src/renderer/editors/notebook/index.tsx`
- `src/renderer/editors/text/TextFileEncryptionModel.ts`
- `src/renderer/api/pages/PagesLifecycleModel.ts`
- `src/renderer/theme/icons.tsx`
- `src/renderer/theme/icon-registry.ts`
- `src/renderer/uikit/Spacer/SpacerView.ts`
- `src/renderer/uikit/Divider/DividerView.tsx`
- `src/renderer/uikit/Button/Button.tsx`
- `doc/epics/EPIC-067.md`
- `doc/active-work.md`

### Files Changed

| File | Change |
|---|---|
| `src/renderer/editors/base/ContentHostFooterView.ts` | Add native footer composition, conditional DOM, state bindings, contribution slot, provider projection, and lifecycle ownership |
| `src/renderer/editors/base/ContentHostFooter.tsx` | Reduce the React implementation to the `mountVanilla` face |
| `src/renderer/editors/base/ContentHostFooter.css` | Add co-located static styling for footer regions using existing theme variables/tokens |
| `src/renderer/uikit/Button/ButtonView.tsx` | Widen only the native view's child seam to accept `SlotContent` DOM Nodes |
| `src/renderer/editors/text/TextEditorModel.ts` | Add the non-persisted pipe-valued reactive channel |
| `src/renderer/editors/text/TextFileIOModel.ts` | Publish authoritative pipe replacements/clear through `pipeState` |
| `doc/tasks/US-1101-content-host-footer-native/README.md` | Investigation and implementation plan |
