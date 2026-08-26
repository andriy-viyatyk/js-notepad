# US-1103 - Native text chrome

## Goal

Convert `src/renderer/editors/base/TextChrome.tsx` into a native
`TextChromeView`. Leave `TextChrome.tsx` as the thin React compatibility face
that keeps the existing `TextChromeProps` contract, including all four
`ReactNode` members, so the 14 current React callers compile unchanged.

This is the pivot task of [EPIC-067](../../epics/EPIC-067.md). By
implementation time, US-1099 through US-1102 provide native
`EditorToolbarView`, `ScriptPanelView`, `ContentHostFooterView`, and
`PageToolbarView`, each with its required React face. This task composes the
native classes directly; US-1104 through US-1107 then drain the remaining
React callers, after which US-1107 deletes `TextChrome.tsx` and its React
contract.

## Background

### Current contract and callers

`src/renderer/editors/base/TextChrome.tsx:15-29` declares the shared face:

```tsx
interface TextChromeProps {
    model: EditorModel;
    children: ReactNode;
    /** Editor-specific toolbar buttons. Render inside `<PageToolbar>` between
     *  text-host buttons (Compare/Run) and the auto-inserted spacer. */
    toolbarContributions?: ReactNode;
    /** Right-side toolbar contributions. Forwarded to `<PageToolbar>` so they
     *  render AFTER the auto-spacer and BEFORE the switch widget — useful for
     *  controls that should sit on the right of the row (e.g. Grid's search
     *  input). */
    rightToolbarContributions?: ReactNode;
    /** Editor-specific footer status. Render in the footer row before the
     *  encoding label. Ignored in the NoteItemEditModel branch. */
    footerContributions?: ReactNode;
}
```

The 14 direct JSX callers, verified with a renderer-wide `<TextChrome` search,
are `env-vars`, `rest-client`, `monaco`, `file-diff`, `graph`, `link-editor`,
`draw`, `markdown`, `html`, `svg`, `log-view`, `notebook`, `mermaid`, and
`grid`. None changes in US-1103. Their React bodies and contribution values
must continue to flow through the face while it is the compatibility boundary.

The face currently also has a defensive `!host` return at `:54-57`; it
returns only `children` and no chrome. Keep that behavior in the face before
calling `mountVanilla`, so this exceptional path does not acquire a named
chrome root or native children.

### Existing DOM and child order

For a content host, the current JSX at `TextChrome.tsx:74-112` produces this
order:

```text
text-chrome-root Panel (column, flex, height 0, relative, gap xs, tabIndex 0)
├── text-chrome-top PageToolbar
│   └── PageToolbar order: NavPanelButton, text-host buttons, toolbarContributions,
│       auto Spacer, ShowResourcesButton, rightToolbarContributions, SwitchWidget
├── caller children
├── ScriptPanel (when the text host exposes script)
├── text-chrome-footer ContentHostFooter (for TextFileModel only)
└── editor-overlay bare div (for TextFileModel only)
```

`PageToolbar.tsx:32-40` confirms that its own fixed order is navigation,
`children`, optional spacer, right contributions, then switch. The
`TextChromeProps` comments add the chrome-specific rule: the native Compare
and Run controls come before `toolbarContributions`; the spacer is automatic;
`rightToolbarContributions` follows it and precedes the switch. Preserve the
order with stable `display: contents` DOM regions, not by putting all four
React props into one slot.

The native composition should be structurally equivalent to:

```text
TextChromeView.root: data-type="panel" data-name="text-chrome-root"
├── PageToolbarView.root: data-type="panel" data-name="text-chrome-top"
│   ├── text-toolbar-content (Node; native Compare/Run + toolbar slot)
│   └── text-toolbar-right (Node; native Show Resources + right slot)
├── text-chrome-children (display: contents; children slot)
├── ScriptPanelView.root (display: contents; TextFileModel only)
├── ContentHostFooterView.root (TextFileModel only)
└── div.editor-overlay (TextFileModel only)
```

`text-toolbar-content`, `text-toolbar-right`, and
`text-chrome-children` are implementation parts, not public `data-name`
values. The first two are passed as DOM `Node` values to `PageToolbarView`, so
the page toolbar's `children` and `rightContributions` slots use `fillSlot`'s
non-React arm for the native structures. Only the caller contributions in
those regions can create compatibility roots.

`ContentHostFooterView` and `ScriptPanelView` must be constructed and mounted
as owned children, never through `ContentHostFooter` or `ScriptPanel` React
faces. `TextChromeView` likewise must not extend `PageToolbarView`,
`ContentHostFooterView`, or `ScriptPanelView`; it owns them with `child()`.
The `VanillaView` type parameter is part of a view's public constructor
contract, so inheritance would couple the wrong props type and recreate the
§E9-6b double-cast defect.

`ContentHostFooterView` owns its `ContentHostFooterViewProps` type and widens
`footerContributions` to `SlotContent`; the React face keeps its public
`ReactNode` contract, leaving US-1105 and US-1107 a DOM-node-compatible native
footer seam without a cast.

### Native root and lifecycle pattern

Create the `text-chrome-root` with `createPanelElement` and the exact existing
Panel props (`direction: "column"`, `flex: 1`, `height: 0`,
`position: "relative"`, `gap: "xs"`). Set `root.tabIndex = 0` directly on
this root: the TextChrome view owns the keyboard-focus target; neither the
`mountVanilla` adapter host nor a child toolbar owns that `tabIndex`. Import
the borrowed `Panel.css` explicitly from the direct native-view path, as
required for native views that construct a converted component's DOM.

The constructor creates only this stable root and stores props. In `onMount`:

1. Create and claim `PageToolbarView`, `ScriptPanelView` (when
   `textHost?.script` exists), and `ContentHostFooterView` (when the host is a
   `TextFileModel`). Attach every child root before calling its `mount()`.
2. Create the three display-contents slot regions and the overlay element.
   Append the roots/elements to `TextChromeView.root` in the order above.
3. Set the text host's overlay ref to the exact bare overlay element and then
   mount the child views. The overlay remains the final root child.
4. Install the root `keydown` listener and the `pagesModel.onFocus`
   subscription, registering both with the view lifecycle.

On update, call `fillSlot` again for changed caller slots without invoking the
old cleanup first. `fillSlot` owns the transition and preserves an existing
React root when the value remains React-shaped. If a model/host identity ever
changes during an update, hand the old overlay back as `null`, release its
host-dependent children and subscriptions, then build the new branch before
installing the new overlay ref. Do not leave a callback, timer, or child
bound to the previous host.

On dispose, clear the focus timer, unsubscribe the focus channel, release the
slot resources once, hand `null` to the active text host's
`setEditorOverlayRef`, clear DOM references, and let `VanillaView` dispose
owned children. `VanillaView.dispose()` does not detach the root; the
`mountVanilla` adapter owns that final removal.

### Focus management and keyboard handling

The old effect at `TextChrome.tsx:41-52` subscribes to `pagesModel.onFocus`.
For the matching `model.page`, it waits 200 ms, focuses the root only when it
does not already contain `document.activeElement`, and then calls `model.focus()`.
The native view must preserve all three behaviors.

Keep one `ReturnType<typeof setTimeout> | undefined` field. On every focus
event, clear the previous timer first; then schedule only when the event's
page is `model.page`. This both makes a second matching event restart the
window and prevents a focus event for the next page from allowing an old
timer to steal focus. Clear the timer again in the registered dispose cleanup
and guard the callback against a disposed/released branch.

The root listener is the native equivalent of `onKeyDown`:

```ts
private readonly handleRootKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "F5" && !this.textHost?.script.state.get().open) {
        if (hasScriptRunner(this.model)) {
            event.preventDefault();
            void this.model.runScript();
            return;
        }
    }
    this.host?.handleKeyDown?.(event);
};
```

The `hasScriptRunner` type guard should describe the optional capability as
`runScript(all?: boolean): Promise<void>` and use a normal property/function
check. It replaces the old runtime assertion without casting the whole model.
The existing F5 gate remains: when a script panel is open, the root does not
invoke the main-editor runner; otherwise it invokes the runner when present
and lets the host handler process the event when it is absent.

The current `IContentHost.handleKeyDown` and
`TextFileActionsModel.handleKeyDown` still use `React.KeyboardEvent`, while
the native listener supplies `KeyboardEvent`. Change that seam to the native
DOM type in:

- `src/renderer/editors/base/IContentHost.ts`;
- `src/renderer/editors/text/TextFileActionsModel.ts`; and
- `src/renderer/editors/text/TextEditorModel.ts`'s delegate.

The handler only reads standard DOM keyboard fields (`ctrlKey`, `shiftKey`,
`code`, `key`) and calls `preventDefault`, so this is an honest event-type
correction, not a behavior change or a React compatibility cast.

### RunButtons and the real selection channel

`RunButtons` at `TextChrome.tsx:140-172` currently subscribes only to
`host.state.language`. Its `hasSelection` read at `:150` has no subscription,
so `text-run-all-script` appears or disappears today only when some unrelated
React render happens.

The selection channel already exists and must be consumed rather than
re-invented:

- `src/renderer/editors/monaco/MonacoBody.tsx:176-190` listens to Monaco's
  `onDidChangeCursorSelection`, reads `ed.getSelection()`, and writes the
  boolean `model.state.hasSelection`.
- `src/renderer/editors/monaco/MonacoEditor.ts:17-21` declares that
  non-persisted state field, and `:66-68` reads it from `state` in
  `hasTextSelection()`.
- `ScriptPanelModel` uses the same correct precedent at
  `src/renderer/editors/text/ScriptPanel.ts:146-155`: its Monaco selection
  listener writes `scriptModel.state.hasSelection`, and
  `ScriptPanelView.ts:96-109` binds the state to its toolbar consequence.

Bind `model.state` to a narrow boolean projection of `hasSelection` and run
the RunButtons synchronization from that binding plus the host language
binding. Models without that optional state field resolve to `false`. Do not
call `hasTextSelection()` as the subscription mechanism, subscribe to all
model state merely to repaint, or add a second Monaco listener in the chrome.
The native view must create/remove `text-run-all-script` when the boolean
changes and update the `text-run-script` title between `Run Script (F5)` and
`Run Selected Script (F5)`.

### The `isTextFileHost` discriminator and overlay lifetime

The old helper at `TextChrome.tsx:190-199` is intentionally a duck-type. It
distinguishes `TextFileModel` from the `NoteItemEditModel` inner-note fake
host by the presence of `setEditorOverlayRef`. The original check used
`setEditorToolbarRefFirst`; US-559 removed that method from `TextFileModel`
but left it on `NoteItemEditModel`, silently inverting the branch. The
observed symptom was that the footer, `ScriptPanel`, run buttons, compare
button, and editor-overlay portal stopped rendering.

Carry the following comment and probe into the native helper verbatim; do not
replace it with `instanceof`:

```ts
// Duck-type against `setEditorOverlayRef` — present on TextFileModel,
// absent on NoteItemEditModel (US-557 inner-note fake host). The original
// discriminator checked `setEditorToolbarRefFirst`, but US-559 ("Strangler-
// fig retirement") removed that method from TextFileModel while leaving
// it on NoteItemEditModel — silently inverting this check. Symptom: the
// footer toolbar, ScriptPanel, run buttons, compare button, and the
// editor-overlay portal all stopped rendering for editors.
return typeof (host as unknown as { setEditorOverlayRef?: unknown }).setEditorOverlayRef === "function";
```

Make the helper a type predicate (`host is TextFileModel`) so the separate
cast at old `:60` is no longer needed. For the true branch, create the bare
`div`, keep `className = "editor-overlay"`, call
`textHost.setEditorOverlayRef(overlay)`, and append it last. On dispose or
host replacement call `setEditorOverlayRef(null)` before releasing the host;
otherwise the host retains a detached DOM node. The NoteItem branch must keep
the old behavior: no footer, no script panel, no Compare/Run/Show Resources
controls, and no overlay ref, while its `children` and page toolbar still
render.

### Cast inventory

The four current `as unknown as` casts are pre-existing, but the rewrite must
not carry wrong-prop casts into the native implementation. Their dispositions
are:

| Current location | Current purpose | US-1103 disposition |
|---|---|---|
| `TextChrome.tsx:60` | Converts the boolean result of `isTextFileHost` back to `TextFileModel`. | Remove. Make `isTextFileHost` a `host is TextFileModel` predicate. |
| `TextChrome.tsx:64` | Reads optional `runScript` from the generic `EditorModel` for F5. | Remove. Use the shared `hasScriptRunner` capability guard. |
| `TextChrome.tsx:148` | Reads the same optional `runScript` capability for Run buttons. | Remove. Reuse the same guard/type. |
| `TextChrome.tsx:198` | Probes for `setEditorOverlayRef`, which is not part of `IContentHost` and is deliberately the runtime discriminator. | Retain this one deliberate probe unchanged, including its comment; it is an honest feature test, not a hidden prop mismatch. |

No new `as unknown as` may be introduced in `TextChromeView.ts`. In
particular, do not cast `TextChromeView` to a different `VanillaViewCtor`;
its `TextChromeViewProps` must match its constructor. Native view props may
use `SlotContent` for `children`, `toolbarContributions`,
`rightToolbarContributions`, and `footerContributions`, while the face keeps
the exact ReactNode types. `ReactNode` is included by `SlotContent`, so the
face passes type-safely and later native callers can pass DOM Nodes.

### Exact `data-name` and conditional DOM contract

`doc/architecture/ui-element-contract.md` reserves `data-name` as the
addressing handle. Preserve the following output; `data-part` hooks are
internal and may be used for slot ownership but must not replace these names.

| `data-name` | Element/owner | Present when absent conditions are false |
|---|---|---|
| `text-chrome-root` | Native TextChrome Panel root | The face has a content host. The defensive no-host face returns only `children`. |
| `text-chrome-top` | Native PageToolbar root | A content host branch is mounted. It may be CSS-hidden by `hideWhenEmpty`, but the named root remains in the DOM. |
| `page-nav-panel` | PageToolbar's NavPanel button | Absent when `sidebarMandatory` is true, `getNavigatorTarget()` is `null`, or a non-empty target fails `page.canOpenNavigator`; present for the permitted empty `{}` target and passing non-empty target. |
| `text-compare-left` | Compare button | Absent without `model.page`, without a left grouped page, or when `pagesModel.canCompare(leftPage.id, ownerPage.id)` is false. The `pagesModel.state` left/right projection is its real channel. |
| `text-run-script` | Main Run button | Absent when the host is not a `TextFileModel`, its language is not a script language, or the model has no `runScript` function. |
| `text-run-all-script` | Run All button | Absent under the Run-button conditions or when the bound selection boolean is false. |
| `text-show-resources` | HTML resources button | Absent unless the host is a `TextFileModel` whose language is exactly `"html"`. |
| `page-editor-switch` | PageToolbar's switch widget | Absent when PageToolbar's merged editor IDs contain fewer than two entries or do not include `model.editorId`; otherwise present. Its exact merge/channel rules belong to US-1102 and must be consumed, not duplicated. |
| `script-panel` | ScriptPanelView's open branch | Absent while `host.script.state.open` is false; present while the script panel is open. The ScriptPanelView root itself is display-contents and has no named root while closed. |
| `script-panel-splitter` | Open ScriptPanel splitter | Present only with the open `script-panel` branch. |
| `script-monaco-host` | Open ScriptPanel Monaco host | Present only with the open `script-panel` branch. |
| `script-run` | ScriptPanel run button | Present only with the open branch; its title follows script-panel selection state. |
| `script-run-all` | ScriptPanel Run All button | Present only with the open branch and `ScriptPanelState.hasSelection`. |
| `script-select` | ScriptPanel script selector | Present only with the open branch. |
| `script-save` | ScriptPanel save button | Present only with the open branch. |
| `script-open-tab` | ScriptPanel open-tab button | Present only with the open branch. |
| `script-close` | ScriptPanel close button | Present only with the open branch. |
| `text-chrome-footer` | ContentHostFooterView root | Present only for the `TextFileModel` branch; ignored for `NoteItemEditModel`. |
| `text-toggle-script` | ContentHostFooter script toggle | Present only when the text host has `script`; its label is native and therefore creates no React root. |

Other TextChrome-owned output has no `data-name`: the toolbar and footer
spacers, vertical dividers, provider badge, encoding label, icon SVGs,
`editor-overlay`, and the `data-part` slot regions. Caller-provided
contribution elements retain whatever names they already emit; TextChrome must
not invent, rename, or conditionally wrap them in named public elements.

The footer's `footerContributions` slot remains before the encoding label and
is ignored on the NoteItem branch. The footer's provider badge and encoding
label conditions remain those implemented by `ContentHostFooterView`; this
task only passes the contribution value through unchanged.

### React-root prediction

The native children built by US-1103 must not create React roots: the
`PageToolbarView`, `ScriptPanelView`, and `ContentHostFooterView` are direct
owned views, and their fixed children are DOM Nodes/native views. The four
face fields remain React-compatible seams until the callers drain:

- `children` can create one `fillSlot` root while its current editor body is
  React;
- `toolbarContributions` can create one root when a caller supplies JSX;
- `rightToolbarContributions` can create one root when supplied; and
- `footerContributions` can create one root for the verified contribution
  callers (`grid`, `link-editor`, `graph`, and `notebook`).

The editor's existing React component root remains while its caller is still
React. Therefore this task is EPIC-067's documented intermediate peak, not a
per-editor root reduction: a chrome-pinned editor is expected to measure
**4–5 live React roots** while the callers are pending, with **5 while the
script-panel-open peak is observed**, then drain to **0 only after US-1104
through US-1107** convert the callers. The exact epic-level mechanism and
ordering argument are recorded in §E9-4; measure `[data-react-root]`, not
`[data-part="react-slot"]`, and do not report this bounded peak as a
regression. The native script panel itself adds no React root.

## Implementation Plan

- [ ] Add `src/renderer/editors/base/TextChromeView.ts` with a public
  `TextChromeView extends VanillaView<TextChromeViewProps>`. Define the native
  props with `SlotContent` for the four slot values; do not change the face's
  ReactNode contract. Construct the stable Panel-equivalent root with the
  exact `text-chrome-root` attributes and `tabIndex = 0`.
- [ ] Move the root keydown behavior into a native `KeyboardEvent` listener.
  Preserve the F5/script-open/runner logic and host fallback, use a typed
  `hasScriptRunner` guard, and register listener cleanup through `listen()`.
  Change `IContentHost.handleKeyDown`, `TextFileActionsModel.handleKeyDown`,
  and `TextFileModel.handleKeyDown` to `KeyboardEvent` so no React event cast
  crosses the native boundary.
- [ ] Implement the exact `isTextFileHost` duck-type in the new view,
  preserving its comment and probe verbatim. Make it a type predicate to
  remove the old line-60 cast. Keep the `TextFileModel` and
  `NoteItemEditModel` branches identical in which chrome children they create.
- [ ] Compose `PageToolbarView` directly. Build stable display-contents
  content/right Node regions; put native Compare/Run roots before the
  toolbar-contributions fill host, and native Show Resources before the
  right-contributions fill host. Pass the regions as Nodes to PageToolbarView
  so its internal slots take the non-React arm. Do not use the `PageToolbar`
  face.
- [ ] Port CompareButton as a native `IconButtonView` named
  `text-compare-left`, using the same `pagesModel.getLeftGroupedPage` and
  `pagesModel.canCompare` gates and the `enterCompareMode` action. Bind only
  the existing `pagesModel.state` left/right projection and create/remove the
  view as grouping changes.
- [ ] Port RunButtons as native `IconButtonView` children named
  `text-run-script` and `text-run-all-script`. Bind the host language and the
  model's `hasSelection` projection separately; synchronize title and
  conditional presence from those channels. Use the guarded model runner for
  both click actions and preserve `all = true` for Run All.
- [ ] Port ShowResourcesButton as a native `IconButtonView` named
  `text-show-resources`, bound to the host language and created only for
  `"html"`. Preserve the lazy `showHtmlResources` import and its existing
  behavior; do not add a host-wide repaint subscription.
- [ ] Create the caller-children `display: contents` host and call
  `fillSlot` with `props.children` on mount and updates. Register exactly one
  disposal cleanup for its current slot. Do not pre-run that cleanup or write
  directly around the host. This is the only body seam; it must remain
  React-fed until the later caller tasks pass native Nodes.
- [ ] Create and own `ScriptPanelView` directly for a TextFileModel's
  `script`, append it after the children host, and mount it with its root
  already attached. Do not mount the `ScriptPanel` React face, even though
  `BoardEditorView` remains a separate React-face caller outside this task.
- [ ] Create and own `ContentHostFooterView` directly after the script-panel
  slot for the TextFileModel branch, passing `footerContributions` unchanged.
  Do not change the footer implementation or its predecessor-supplied
  `pipeState`/slot behavior. Its footer contribution remains before encoding
  and is absent on the NoteItem branch.
- [ ] Create the bare final `div.editor-overlay`, hand it to
  `textHost.setEditorOverlayRef`, append it last, and hand back `null` on
  disposal and host replacement. Do not add a `data-name`; the existing
  `.editor-overlay` rules in `theme/GlobalStyles.tsx` own its positioning and
  empty-state display.
- [ ] Reproduce the focus effect with an owned `pagesModel.onFocus`
  subscription and cancellable 200 ms timer. Clear an existing timer on every
  focus event before filtering, reschedule matching pages only, and clear it
  during disposal. Preserve the root containment check followed by
  `model.focus()`.
- [ ] Reduce `src/renderer/editors/base/TextChrome.tsx` to the unchanged
  `TextChromeProps` interface and a thin face. Preserve the defensive no-host
  branch exactly, then mount `TextChromeView` for a host:

  ```tsx
  // Before: TextChrome.tsx owns hooks, JSX, and all chrome subcomponents.
  export function TextChrome({ model, children, toolbarContributions,
      rightToolbarContributions, footerContributions }: TextChromeProps) {
      // host detection, focus effect, handlers, and the 214-line JSX body
  }

  // After: the interface stays React-facing; native TextChromeView owns DOM.
  export function TextChrome(props: TextChromeProps): React.ReactElement {
      if (!props.model.contentHost) return <>{props.children}</>;
      return mountVanilla(TextChromeView, props);
  }
  ```

  Remove the React implementation imports (`useEffect`, `useRef`, `Panel`,
  `IconButton`, `PageToolbar`, `ContentHostFooter`, and `ScriptPanel`) while
  retaining the four ReactNode fields and all caller-facing semantics.
- [ ] Run `npm run typecheck`, `npm run lint`, and `npm run build-prod`. Manually
  inspect TextFileModel and NoteItemEditModel branches, script/no-script,
  language changes, selection changes, compare grouping, HTML resources,
  every slot ordering, focus/page switching during the 200 ms window, overlay
  disposal, and the named-element queries. Add no unit tests or harnesses.

## Concerns

1. **The Run All defect is masked, not fixed by a repaint.** The existing
   Monaco selection listener already writes `MonacoEditor.state.hasSelection`.
   The native view must bind that exact state slice. A direct call to
   `hasTextSelection()` or a subscription to all model state would preserve
   the defect's accidental behavior rather than give the button a channel.

2. **The discriminator is historical behavior.** The `setEditorOverlayRef`
   probe and its comment are load-bearing. An `instanceof` replacement or a
   check for the old `setEditorToolbarRefFirst` method would route
   `NoteItemEditModel` through the wrong branch and remove multiple controls.

3. **The overlay ref is an owned handoff.** React used to call the callback
   with the div and later with `null`. Native code must explicitly perform
   both handoffs, including a host/model replacement path, or a detached
   overlay stays reachable from the host.

4. **The timer is an owned resource.** Unsubscribing `pagesModel.onFocus`
   alone does not cancel a callback already queued by `setTimeout`. Clearing
   on every focus event and during dispose prevents a prior page's delayed
   callback from focusing the next editor.

5. **The four slots have different ownership and order.** The body,
   toolbar-contributions, right-contributions, and footer-contributions hosts
   must remain separate. Native chrome nodes use the Node arm; caller JSX may
   use the React arm. Never pre-clean a slot or mutate a host behind
   `fillSlot`, and never move footer contributions into the toolbar.

6. **The intermediate root peak is intentional.** US-1103 removes roots from
   the native internals, but its unchanged React callers still feed the four
   compatibility seams. The §E9-4 4–5-root peak belongs to the epic's
   transition and must be reported alongside the eventual zero, not attributed
   to this task as a leak.

7. **Composition is mandatory.** Extending one chrome view to inherit another
   view's root also inherits its `VanillaView<P>` props type. The resulting
   `VanillaViewCtor` cast was the exact §E9-6b failure. `TextChromeView` must
   own the three predecessor views instead.

8. **The event seam must be native.** Passing a DOM `KeyboardEvent` to an
   `IContentHost` method typed as `React.KeyboardEvent` would either fail
   typechecking or invite another double cast. The three small event-type
   changes listed above are part of this conversion; no React event object is
   needed by the action logic.

There are no unresolved design questions. The selection, duck-type, focus,
overlay, slot, composition, data-name, and root-accounting decisions are
resolved from the current source and the predecessor task contracts.

## Acceptance Criteria

- [ ] `src/renderer/editors/base/TextChromeView.ts` is a public-constructor
  native `VanillaView` and directly composes `PageToolbarView`,
  `ScriptPanelView`, and `ContentHostFooterView`; it never uses their React
  faces and never extends one of them.
- [ ] `TextChrome.tsx` retains the exact `TextChromeProps` fields and comments,
  including `children`, `toolbarContributions`,
  `rightToolbarContributions`, and `footerContributions` as `ReactNode`; its
  implementation is only the no-host escape hatch plus `mountVanilla`.
- [ ] The content-host root remains `data-type="panel"
  data-name="text-chrome-root"` with the old column/flex/height/position/gap
  behavior and `tabIndex = 0`; no-host output contains only the caller's
  children and no named chrome root.
- [ ] The complete child order is PageToolbar, caller children, ScriptPanel,
  footer, then overlay, with each conditional branch matching the old
  TextFileModel/NoteItemEditModel behavior.
- [ ] Compare/Run/Show Resources preserve names, titles, icons, actions, and
  null conditions. `text-run-all-script` updates from the bound selection
  state immediately when Monaco selection changes, without a blanket repaint.
- [ ] The exact `isTextFileHost` duck-type comment/probe is preserved. The
  `TextFileModel` branch owns and nulls the direct overlay ref; the NoteItem
  branch never receives one.
- [ ] All four old double casts are accounted for: line 60, line 64, and line
  148 are removed; line 198 remains only as the deliberate duck-type probe.
  No new `as unknown as` is introduced.
- [ ] The keyboard path uses native `KeyboardEvent` types through
  `IContentHost`, `TextFileActionsModel`, and `TextFileModel`, with unchanged
  shortcut behavior and no React event cast.
- [ ] The focus subscription and 200 ms timer are disposed; a second focus
  event cancels/restarts the prior timer, and another page's focus event
  cannot trigger a stale focus steal.
- [ ] The four slot ordering rules are preserved exactly: toolbar
  contributions after Compare/Run and before spacer; right contributions
  after spacer and before switch; footer contributions before encoding and
  ignored for NoteItemEditModel; body children remain between top toolbar and
  script panel.
- [ ] All listed `data-name` elements and absence conditions match this
  document and `ui-element-contract.md`; no public names are invented for
  structural spans, provider/encoding elements, or the overlay.
- [ ] The measured result is interpreted as EPIC-067's intermediate 4–5-root
  peak while React callers remain, not as the final result. No claim is made
  that this task alone reaches zero; US-1107 owns the deletion and final
  drain.
- [ ] `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass. No
  unit tests/harnesses are added, no predecessor/caller files are changed,
  and no commit is created.

### Files that need NO changes

- `src/renderer/editors/base/PageToolbar.tsx` (US-1102 keeps its React face)
- `src/renderer/editors/base/PageToolbarView.ts` (US-1102 supplies it)
- `src/renderer/editors/base/EditorToolbar.ts`
- `src/renderer/editors/base/EditorToolbarView.ts`
- `src/renderer/editors/base/ContentHostFooter.ts`
- `src/renderer/editors/base/ContentHostFooterView.ts`
- `src/renderer/editors/text/ScriptPanel.ts`
- `src/renderer/editors/text/ScriptPanelView.ts`
- `src/renderer/editors/text/TextFileIOModel.ts`
- `src/renderer/editors/text/TextFileEncryptionModel.ts`
- `src/renderer/editors/monaco/MonacoEditor.ts`
- `src/renderer/editors/monaco/MonacoBody.tsx`
- `src/renderer/editors/base/EditorModel.ts`
- `src/renderer/editors/base/TextHostEditorModel.ts`
- `src/renderer/editors/base/index.ts`
- `src/renderer/editors/board/BoardEditorView.tsx`
- `src/renderer/editors/env-vars/index.tsx`
- `src/renderer/editors/rest-client/index.tsx`
- `src/renderer/editors/monaco/index.tsx`
- `src/renderer/editors/file-diff/index.tsx`
- `src/renderer/editors/graph/index.tsx`
- `src/renderer/editors/link-editor/index.tsx`
- `src/renderer/editors/draw/index.tsx`
- `src/renderer/editors/markdown/index.tsx`
- `src/renderer/editors/html/index.tsx`
- `src/renderer/editors/svg/index.tsx`
- `src/renderer/editors/log-view/index.tsx`
- `src/renderer/editors/notebook/index.tsx`
- `src/renderer/editors/mermaid/index.tsx`
- `src/renderer/editors/grid/index.tsx`
- `src/renderer/uikit/Panel/Panel.css`
- `src/renderer/uikit/shared/fill-slot.ts`
- `src/renderer/uikit/shared/mount.tsx`
- `src/renderer/uikit/IconButton/IconButtonView.tsx`
- `src/renderer/uikit/Spacer/SpacerView.ts`
- `src/renderer/uikit/SegmentedControl/SegmentedControlView.tsx`
- `src/renderer/theme/GlobalStyles.tsx`
- `doc/architecture/ui-element-contract.md`
- `doc/epics/EPIC-067.md`
- `doc/active-work.md`

### Files Changed

| File | Change |
|---|---|
| `src/renderer/editors/base/TextChromeView.ts` | Add native TextChrome composition, native toolbar controls, real selection/focus channels, slot ownership, overlay lifecycle, and conditional DOM |
| `src/renderer/editors/base/TextChrome.tsx` | Reduce the implementation to the unchanged React contract, no-host escape hatch, and `mountVanilla` face |
| `src/renderer/editors/base/IContentHost.ts` | Retype the root host keyboard callback from React to native `KeyboardEvent` |
| `src/renderer/editors/text/TextFileActionsModel.ts` | Accept the native keyboard event at the action boundary |
| `src/renderer/editors/text/TextEditorModel.ts` | Forward the native keyboard event through the host delegate |
| `doc/tasks/US-1103-text-chrome-native/README.md` | Investigation, resolved concerns, implementation plan, and verification contract |
