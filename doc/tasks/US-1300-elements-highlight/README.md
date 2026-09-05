# US-1300: Elements/highlight protocol and shell header consumer

## Goal

Give every AiVision node an opt-in, hand-written list of the on-screen controls it owns:
`{ name, purpose, selector? }`. The shared AiVision layer will expose that list as live
`elements` entries (`purpose`, resolved `selector`, and DOM-measured `visible`) plus a
`highlight(name, message?)` method that delegates to `app.ui.highlightElement`; the shell header
strip is the first list consumer.

This task is planning only. It must not implement the protocol or its consumer until this document
has been reviewed.

## Background

### Epic constraints and verified resolver contract

EPIC-084 design decision 6 ([`doc/epics/EPIC-084.md`](../../epics/EPIC-084.md), lines 69-71)
defines the protocol: the descriptor owns a curated `{ name, purpose, selector? }` list, the
shared layer supplies live DOM visibility using `offsetParent`, and an omitted selector becomes a
`data-name` selector. Decision 7 (lines 72-73) makes `highlight(name, message?)` a member of every
node with elements and keeps `ui.highlightElement(selector, message)` available in its raw form.
Decision 9 (lines 76-78) explicitly allows reuse of automation measurement helpers but forbids
moving or redesigning the ref store; that remains EPIC-089 work. Decision 10 (lines 79-80) makes
the shell header strip the first consumer and leaves its node/path choice to this task.

The resolver in [`src/shared/ai-vision/resolver.ts`](../../../src/shared/ai-vision/resolver.ts)
is the single path walker:

- `resolveCall()` parses each segment, obtains `getAiVision(current)` at lines 53-76, rejects a
  named member absent from `descriptor.members` and `children()` at lines 93-97, reads the real
  property at lines 116-122, invokes the method when the segment is a call at lines 123-131, and
  awaits the resulting value at line 133. A method named without `()` is described rather than
  invoked at lines 133-143.
- `errorAt()` at lines 194-216 is the unknown-member model to preserve: a forced member error
  includes the descriptor kind/summary, `formatMembers(descriptor.members)`, and live children.
  Therefore an unknown element name must return the declared element names in the same
  self-correcting error, rather than probing arbitrary DOM names.
- `indexInto()` at lines 166-171 delegates indexed nodes to a descriptor's `index()`; live child
  names from `children()` are accepted by `isLiveChildMember()` at lines 173-177 even when they
  are not static members. The new element protocol is a static declaration plus a dynamic value,
  not a new child collection.

The descriptor shape in [`src/shared/ai-vision/types.ts`](../../../src/shared/ai-vision/types.ts)
has static `members` and optional instance-level `children()`, `restricted()`, `index()`, and
`summarize()` (lines 44-65). `getAiVision()` at lines 95-108 first accepts an object's own
`aiVision`, then its instance registry, then its constructor registry. `IAiMember.node` at lines
27-32 is only a safe-read declaration for `helpSearch`; `help-search.ts:9-13` and `:45-52` show
that it follows only `node: true` properties and never reflects over arbitrary getters. The
protocol must therefore add `elements` as an explicitly advertised property, without marking its
array as an AiVision node, and add `highlight` as an explicitly advertised method.

The resolver's plain-property rule is why a descriptor-only declaration cannot be sufficient by
itself: the current read at `resolver.ts:116-122` gets `(target as Record)[name]`. The implementation
must centralise the two protocol members in the shared resolver/helper (or materialise them through
one shared adapter) so a surface task supplies only its declaration list and never repeats DOM
measurement, name validation, or highlight delegation.

### Existing renderer nodes and the selected public path

The renderer root in [`src/renderer/scripting/ai-vision/root.ts`](../../../src/renderer/scripting/ai-vision/root.ts)
declares `ui` as a `node: true` root member at lines 38-43 and returns `this.app.ui` from its
getter at lines 96-103. Its `window` member is a different node: `app.window`, described by
[`src/renderer/scripting/ai-vision/namespaces/window.ts`](../../../src/renderer/scripting/ai-vision/namespaces/window.ts)
lines 4-18 as window state/actions (minimize, maximize, menu-bar state, zoom, and so on), not as
the app-window DOM surface. `AppWrapper` also exposes these separately as `app.ui` and `app.window`
at [`src/renderer/scripting/api-wrapper/AppWrapper.ts:95-109`](../../../src/renderer/scripting/api-wrapper/AppWrapper.ts:95).

The first consumer will therefore attach the list to the existing UserInterface node in
[`src/renderer/scripting/ai-vision/namespaces/ui.ts`](../../../src/renderer/scripting/ai-vision/namespaces/ui.ts),
not create a `header` child and not overload the unrelated Window node. The exact MCP call path is
`ui.elements` (or `windows[i].ui.elements` when targeting another renderer window); the equivalent
script path is `app.ui.elements`. The phrase “window UI” describes the surface, but `window.ui` is
not a current path in this tree.

This follows the US-1298 adapter pattern. [`src/renderer/scripting/ai-vision/dialogs/shared.ts`](../../../src/renderer/scripting/ai-vision/dialogs/shared.ts)
centralises shared adapter types and operations (`dialogState`, `modelWith`, `requireButton`, and
close/cancel helpers at lines 1-41), while individual adapters keep only their safe fields and
small descriptor constants; for example `confirmation.ts:5-28` declares members beside the
adapter and delegates button validation/closing to the shared helpers. The element protocol should
use the same split: one shared mechanism, with `ui.ts` containing only the header list and its
purpose text.

### Header list and purpose source

[`doc/architecture/ui-element-contract.md`](../../architecture/ui-element-contract.md) is the
contractual source of the first list. Its Header strip table at lines 67-79 contains these
`data-name` entries, followed by the Status indicators table at lines 81-88:

| Name | Purpose used by the declaration |
|---|---|
| `app-header` | The always-present top shell strip containing tabs, status indicators, and window controls. |
| `persephone-menu` | Opens the Menu Bar, where app features not on a tab live. |
| `page-tabs` | The strip of open-page tabs; tabs can be reordered, moved, and opened into their tab menu. |
| `page-tabs-wrapper` | The tab strip's scroll area. |
| `page-tabs-scroll-left` | Scrolls the tab strip left; only present when the tabs overflow. |
| `page-tabs-scroll-right` | Scrolls the tab strip right; only present when the tabs overflow. |
| `page-tabs-add` | Adds an empty page; its split arrow opens the editor/profile menu. |
| `autoload-reload` | Reloads autoload scripts; only present when their files changed on disk and need re-running. |
| `zoom-indicator` | Shows the current zoom and resets it when clicked; only present when the window is zoomed. |
| `window-minimize` | Minimizes the application window. |
| `window-toggle` | Maximizes or restores the application window. |
| `window-close` | Closes the application window. |
| `status-indicators` | Contains the shell's optional Snip, Mneme, and MCP indicators. |
| `header-snip-button` | Opens the Snip Screen / Snip Persephone capture menu. |
| `mneme-indicator` | Shows Mneme status and opens its configuration page; only present when Mneme is enabled. |
| `mcp-indicator` | Shows MCP connection status and opens the request log; only present while the MCP server is running. |

The selector is omitted for each of these declarations so the shared default produces
`[data-name="<name>"]`. The exact selectors are verified in the contract table at lines 69-88;
the user-facing purposes are verified against [`assets/mcp-res-ui.md`](../../../assets/mcp-res-ui.md):
the Header strip table at lines 43-53, Status indicators at lines 55-64, and the window anatomy at
lines 26-41. Structural entries (`app-header`, `page-tabs-wrapper`, and `status-indicators`) are
included because they are stable contract names, even though the guide's purpose table focuses on
the controls inside them.

### Live visibility and automation boundary

The required visibility rule is `offsetParent !== null`, not text presence. The canonical project
gotcha in [`doc/agents-common.md:265-271`](../../agents-common.md:265) says to check visibility
(`offsetParent`) separately from `textContent`, because `textContent` includes hidden subtrees.
For a selector that can match multiple nodes, `visible` will be `true` when at least one matching
element has a non-null `offsetParent`; no match means `false`.

The requested automation audit is negative but useful:

- [`src/renderer/automation/snapshot.ts`](../../../src/renderer/automation/snapshot.ts) builds a
  CDP accessibility tree (`buildSnapshot()` lines 51-100), formats semantic nodes and refs
  (`formatAccessibilityTree()` / `formatNode()` lines 125-138 and 220-304), and has no DOM
  visibility helper or `visible` field.
- [`src/renderer/automation/ref.ts`](../../../src/renderer/automation/ref.ts) owns only the
  frame-session map (`setFrameSessions()` lines 16-26), ref parsing, CDP node resolution, and
  `callOnRef()` (lines 62-140). It has no visibility measurement. The ref store must not be moved,
  redesigned, or made a dependency of this protocol.
- [`src/renderer/automation/commands.ts`](../../../src/renderer/automation/commands.ts) obtains
  snapshots through `snapshot()` at lines 185-191 and dispatches browser commands at lines 534-548;
  it does not measure renderer DOM visibility.
- The only nearby visibility-like code is the private selector fallback in
  [`src/renderer/automation/input.ts:165-187`](../../../src/renderer/automation/input.ts:165): it
  checks `offsetHeight` and computed `display` to choose a focus target. It is neither the required
  `offsetParent` rule nor a reusable exported helper.

Consequently the plan adds the DOM measurement to the shared AiVision element helper/resolver
boundary, not to `automation/` and not to the ref store. It will query the renderer's live
`document` at the time `elements` is resolved; it will not infer ownership by scanning the DOM.

### Highlight contract and call timing

The raw API is verified in [`src/renderer/api/ui.ts:121-128`](../../../src/renderer/api/ui.ts:121):
`highlightElement(selector, text?, options?)` loads the dependency and calls `api.show` with the
selector and text. Its internal `IHighlightApi.show` is synchronous at `ui.ts:15-20`. The public
types at [`src/renderer/api/types/ui.d.ts:117-149`](../../../src/renderer/api/types/ui.d.ts:117)
define `IHighlightOptions`, including `all?: boolean`, and `IHighlightResult.found` (plus `count`,
`highlighted`, `selector`, and optional `error`). The public method signature is at lines 303-307.
The overlay source confirms that `show()` returns `found: false` for no/malformed matches at
[`assets/agent/ui-highlight.js:255-277`](../../../assets/agent/ui-highlight.js:255), and returns
`found: true` with counts at lines 280-317; dismissal removes the overlay at lines 127-129 and
243-252.

The existing AiVision `ui` descriptor incorrectly advertises raw `highlightElement` with the
summary/caution “waits for dismissal” at [`src/renderer/scripting/ai-vision/namespaces/ui.ts:13`](../../../src/renderer/scripting/ai-vision/namespaces/ui.ts:13); the implementation plan below corrects that line.
The implementation settles with the `found` result once `api.show()` has run; it does not await the
later Close/Escape event. The UI guide shows `return await app.ui.highlightElement(...)` at
[`assets/mcp-res-ui.md:200-207`](../../../assets/mcp-res-ui.md:200), and explains the user's later
dismissal at lines 226-229, but does not claim that the returned promise blocks until dismissal.
There is therefore no guide line to defer to `/userdoc` for a false blocking claim; the guide should
still be revisited at epic close if the final call wording needs to distinguish drawing from
dismissal.

The implementation plan fixes the false caution in `namespaces/ui.ts` and gives the new `highlight`
member the same accurate caution: “changes the visible UI; returns as soon as the overlay is drawn —
the user dismisses it afterwards”. The new method simply returns the delegated promise, preserving
`IHighlightResult.found` and error propagation. `resolveCall()` awaits that promise under its
existing method semantics, which is safe because the current delegate resolves after drawing; it
does not wait for dismissal. No `all` option is added to the named protocol method: callers who need
every repeated match continue to use raw `ui.highlightElement(selector, ..., { all: true })`.

## Implementation Plan

### 1. Add the declaration/result contract without making element arrays nodes

Update [`src/shared/ai-vision/types.ts`](../../../src/shared/ai-vision/types.ts) with the shared
data shapes:

```ts
export interface IAiElementDeclaration {
    readonly name: string;
    readonly purpose: string;
    readonly selector?: string;
}

export interface IAiElement {
    readonly name: string;
    readonly purpose: string;
    readonly selector: string;
    readonly visible: boolean;
}

export interface IAiVisionDescriptor {
    // existing fields remain unchanged
    /** Values for advertised members the target object does not itself implement. */
    provide?(name: string): { value: unknown } | undefined;
}
```

The after-state is a descriptor-owned provider, not a resolver runtime parameter or DOM reflection:

```ts
// Before: a descriptor has only its hand-written members and real target properties.
return { kind: "UserInterface", summary, members: USER_INTERFACE_MEMBERS };

// After: the renderer descriptor closes over its list and live ui/document dependencies.
const protocol = createElements(HEADER_ELEMENTS, ui.highlightElement.bind(ui));
return {
    kind: "UserInterface",
    summary,
    members: [...USER_INTERFACE_MEMBERS, ...protocol.members],
    provide: protocol.provide,
};
```

`IAiElement` includes the resolved selector deliberately. Agents can pass the exact selector to
raw `ui.highlightElement`, compare a result's `selector` with the declared target, and diagnose a
selector mismatch without reconstructing the default rule. The declaration list remains the only
surface-owned mechanism input; `visible` is never declared by a surface.

### 2. Put the renderer-only protocol factory beside the renderer AiVision adapters

Add [`src/renderer/scripting/ai-vision/elements.ts`](../../../src/renderer/scripting/ai-vision/elements.ts)
with one exported factory. It takes the declaration list and the bound
`app.ui.highlightElement(selector, message)` delegate and returns exactly `{ members, provide }`
for a descriptor to spread/attach. The factory is renderer code because it closes over the live
`document` for measurement and the renderer `ui` delegate for highlighting; the shared AiVision
directory may not assume a DOM or import either process (`types.ts:5-6`).

The factory owns:

- The two real `IAiMember` entries: a read-only `elements` property and a `highlight(name,
  message?)` method. The entries are appended to the descriptor's existing `members` array, so the
  resolver, `hint.ts`, and `help-search.ts` see them through their existing `descriptor.members`
  reads. `elements` is not `node: true`: its result is a plain array, not another AiVision node.
- Declaration-time validation that every `name` is a `data-name` identifier suitable for the
  direct default selector. At minimum reject any declared name containing `"` or `\\`; the
  header's lowercase/hyphen names are verified by the contract table at lines 67-88. No `CSS.escape`
  dependency is needed. The default is exactly `[data-name="${name}"]`; an explicit selector is
  preserved.
- `provide("elements")`, which measures every declaration on each access and returns declaration-
  order `IAiElement` values. `visible` is true if any `document.querySelectorAll(resolvedSelector)`
  match has `offsetParent !== null`; no match, a hidden match, a selector parse failure, or an
  unavailable DOM produces `visible: false` while retaining the declaration and resolved selector.
- `provide("highlight")`, which returns a closure accepting `(name, message?)`. It resolves only an
  exact declared name, then calls the supplied delegate with the resolved selector and message. An
  undeclared name throws a deterministic error containing the valid declared names. The closure is
  supplied as a member value, so the resolver's later `.apply(target, args)` / `.apply(target,
  request.args)` binds `this` to the target; the closure ignores `this`, which is harmless.

The factory must not import from `src/shared/ai-vision/**` beyond the two shared types, and must not
touch `automation/` or the ref store. The shared layer receives only the type additions; all DOM and
highlight mechanism stays here.

Before/after at the resolver boundary:

```ts
// Before (resolver.ts:123):
let value: unknown = (target as Record<string, unknown>)[name];

// After (the resolver's only edit):
const provided = descriptor?.provide?.(name);
let value: unknown = provided ? provided.value : (target as Record<string, unknown>)[name];
```

This is exactly one edit in [`src/shared/ai-vision/resolver.ts`](../../../src/shared/ai-vision/resolver.ts),
at the existing property read around line 123. Nothing else in the resolver changes: member
validation at lines 101-104 already sees the two protocol entries because they are real entries in
`descriptor.members`; the existing call branches at lines 127 and 131 apply the provided closure,
which ignores `this`; and the writable path at line 107 is unaffected because neither protocol
member is writable. Unknown ordinary members continue to use the resolver's existing valid-member
list, while `highlight("missing")` gets the factory's valid declared-element-name error.

### 3. Make the existing `ui` node the first consumer

Update [`src/renderer/scripting/ai-vision/namespaces/ui.ts`](../../../src/renderer/scripting/ai-vision/namespaces/ui.ts):

- Add the 16 `HEADER_ELEMENTS` declarations from the verified table above, in the same order as the
  contract. Omit `selector` so the shared default is exercised; do not copy raw selectors into a
  second table.
- Reject invalid names through the factory before building the descriptor. Keep all purpose text
  hand-written and purpose-first, using the UI guide's wording. Preserve the raw `highlightElement`
  member and its `all` option; the named protocol method intentionally takes only `(name, message?)`.
- Call the factory with `HEADER_ELEMENTS` and `ui.highlightElement.bind(ui)`, append the returned
  `members` to `USER_INTERFACE_MEMBERS`, and attach the returned `provide` to the descriptor.
- Correct the existing raw `highlightElement` caution to “changes the visible UI; returns as soon as
  the overlay is drawn — the user dismisses it afterwards”, and give the generated `highlight`
  member the same accurate caution. Update the summary/help to say that the node exposes curated
  shell controls with live visibility and `highlight`.

`describeUserInterface(instance)` will use the live `ui` instance supplied by the existing
`DescriptorFactory`/`registerAiVisionFor(ui, describeUserInterface)` seam (`types.ts:83-84`,
`namespaces/index.ts:31`), rather than introducing a resolver argument or a global delegate.

Update [`src/renderer/scripting/ai-vision/root.ts`](../../../src/renderer/scripting/ai-vision/root.ts)
only to make the existing `ui` member summary and common-path help point agents at `ui.elements`.
Do not add a `header` node or a second `window.ui` hierarchy. `namespaces/index.ts` already registers
the existing `ui` object with `describeUserInterface()` at lines 29-32, so the registry wiring stays
the same.

The resulting discovery/call flow will be:

```text
call path "ui"       -> existing UserInterface descriptor, including elements/highlight members
call path "ui.elements" -> declaration-order [{ name, purpose, selector, visible }, ...]
call path "ui.highlight" args ["mcp-indicator", "This shows the MCP connection."]
                         -> app.ui.highlightElement('[data-name="mcp-indicator"]', message)
```

When the header surface is mounted but a conditional control is absent, `ui.elements` still returns
that declared row with `visible: false`. When the whole surface is hidden/not rendered, it returns
the same complete declared list with every row measured false. This preserves purpose discovery and
does not confuse “currently absent” with “not owned”.

### 4. Verify the contract and runtime behavior

Before considering implementation complete:

- Typecheck the shared and renderer call paths, then run the repository lint command. The new
  shared types must compile for both main and renderer consumers.
- Exercise `ui.elements` with the header visible and with conditional controls absent; confirm
  that a hidden DOM subtree with text still reports `visible: false` and that a visible match reports
  true from `offsetParent`, not from text or accessibility content.
- Exercise `ui.highlight` with a declared visible name and inspect the returned
  `IHighlightResult.found`; exercise a conditional/absent name and verify the delegation result
  reports `found: false` without inventing a selector. Exercise an undeclared name and verify the
  error lists the declared element names.
- Verify the explicit-selector branch with a small test descriptor, repeated matches with the raw
  `ui.highlightElement(..., { all: true })` path, and the no-rendered-surface case. The named
  protocol method must not silently acquire an `all` option.
- Confirm existing `helpSearch`, `ui.$help`, and unknown-member paths show the generated protocol
  members through the unchanged `descriptor.members` reads while no `automation/ref.ts` state or
  `snapshot.ts` output changes.

## Concerns / Open Questions

All task decisions are resolved before implementation:

1. **Node/path choice — resolved:** use the existing `ui` node, with exact call path `ui.elements`
   (`windows[i].ui.elements` for an explicit window) and script path `app.ui.elements`. A dedicated
   `header` node would duplicate the already-established `ui` surface, while `window` is a separate
   state/action object.
2. **Unrendered surface — resolved:** return every declared entry with its resolved selector and
   `visible: false`. Returning `[]` would erase the purpose list precisely when an agent needs to
   understand a conditional or currently hidden surface.
3. **Unknown names — resolved:** only exact declared names are eligible; `highlight` reports the
   valid declared names, matching the resolver's forced member-list error model. DOM discovery never
   expands the list.
4. **Resolved selector in entries — resolved yes:** it is useful for diagnosis and for the raw
   highlighter, and costs no extra declaration mechanism because the helper already needs the
   resolved selector to measure `visible`.
5. **Visibility source — resolved:** `offsetParent !== null`; no `textContent`, accessibility-tree
   inference, ref lookup, CDP session, or redesign of `automation/ref.ts`.
6. **Highlight promise — resolved await/delegate:** return the existing `highlightElement` promise so
   `found` and errors reach `call`; the resolver's normal await semantics apply. The corrected
   descriptor caution says the promise resolves after drawing, while the user dismisses the overlay
   afterwards.

## Acceptance Criteria

- [ ] Any AiVision descriptor can opt in by supplying only an ordered list of
  `{ name, purpose, selector? }`; no consumer implements DOM measurement, default-selector logic,
  unknown-name validation, or overlay invocation itself.
- [ ] `elements` and `highlight(name, message?)` are centrally advertised and resolved for every
  opted-in node through its descriptor's `members` and `provide` hook, appear through the existing
  hints/`$help`/help-search paths without changing those consumers, and do not appear on nodes
  without the entries.
- [ ] `elements` returns declaration-order entries containing `name`, declared `purpose`, resolved
  `selector`, and live `visible`; visibility is based on `offsetParent`, and a non-rendered surface
  returns the full list with `visible: false`.
- [ ] The default selector is `[data-name="<name>"]`; explicit selectors are preserved. No DOM
  reflection adds undeclared elements.
- [ ] `highlight` rejects names outside the list with the valid declared-name list, delegates
  declared names to `app.ui.highlightElement(selector, message)`, and preserves its result/error
  behavior including `found`.
- [ ] The header list is reachable at `ui.elements` (and `windows[i].ui.elements`) and contains
  the 16 contractual Header strip/Status indicators entries with purpose text sourced from the
  contract and `read_guide("ui")` source.
- [ ] The six conditional entries state their condition in `purpose`: both tab scroll arrows (only
  when tabs overflow), `autoload-reload` (only when scripts changed and need reloading),
  `zoom-indicator` (only when zoomed), `mneme-indicator` (only when Mneme is enabled), and
  `mcp-indicator` (only while the MCP server is running).
- [ ] Raw `ui.highlightElement(selector, text?, options?)`, including `{ all: true }`, remains
  available and unchanged.
- [ ] `automation/snapshot.ts`, `automation/ref.ts`, `automation/commands.ts`, and the ref-store
  design remain unchanged; typecheck, lint, and the relevant runtime checks pass.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/shared/ai-vision/types.ts` | Add `IAiElementDeclaration`, `IAiElement`, and the optional descriptor-owned `provide(name)` hook. |
| `src/shared/ai-vision/resolver.ts` | Add the one `provide()` fallback at the existing property read; all other resolver behavior remains unchanged. |
| `src/renderer/scripting/ai-vision/elements.ts` | New renderer-only factory returning `{ members, provide }`, validating names, measuring DOM visibility, and delegating highlights. |
| `src/renderer/scripting/ai-vision/namespaces/ui.ts` | Add the 16-entry header/status declaration list and correct the raw/generated highlight cautions. |
| `src/renderer/scripting/ai-vision/root.ts` | Point existing root UI discovery/help at `ui.elements`. |
| `doc/tasks/US-1300-elements-highlight/README.md` | This task plan and verified source findings. |
| `doc/active-work.md` | Link the existing US-1300 dashboard entry; leave it unchecked. |

Files that need **NO changes**:

- `src/renderer/api/ui.ts` — the raw highlighter already has the required delegation signature;
  options, loading, and `found` behavior remain the source of truth. Its descriptor-facing caution
  is corrected in `namespaces/ui.ts`, not here.
- `src/renderer/api/types/ui.d.ts` — the raw public `highlightElement` contract already documents
  `IHighlightOptions.all` and `IHighlightResult.found`; the named protocol is additive and does not
  change this API.
- `src/renderer/scripting/ai-vision/namespaces/window.ts` — it remains the window state/action
  node, not the app-window element owner.
- `src/renderer/scripting/ai-vision/namespaces/index.ts` — existing `ui` registry wiring is enough.
- `src/renderer/scripting/ai-vision/call.ts` and `src/renderer/scripting/api-wrapper/AppWrapper.ts`
  — descriptor-owned `provide()` makes `app.call()` / `persephone.call()` receive the protocol
  without threading a runtime through either call path.
- `src/shared/ai-vision/hint.ts` and `src/shared/ai-vision/help-search.ts` — they already read
  `descriptor.members`, where the factory adds the two protocol entries.
- `doc/architecture/ui-element-contract.md` and `assets/mcp-res-ui.md` — they are the verified
  source list/purpose contract; no raw selector or guide rewrite is required by this protocol task.
- `src/renderer/automation/snapshot.ts`, `src/renderer/automation/ref.ts`,
  `src/renderer/automation/commands.ts`, and `src/renderer/automation/input.ts` — no reusable
  required visibility helper exists there, and EPIC-084 decision 9 forbids turning the automation
  ref store into this protocol's dependency.
- `src/main/mcp/tools/call-tools.ts` and `src/main/mcp/ai-vision/*` — main-local nodes have no
  renderer DOM or `app.ui` delegate and remain unchanged.
