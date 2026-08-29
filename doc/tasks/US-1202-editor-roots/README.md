# US-1202 — Editor roots: stop fanning `{ model }` to every descendant

## Goal

Remove the editor-root model props pump from the nine named editor roots and the
three `KeyValueEditorView` update paths in `RequestBuilderView`. A descendant
that needs live model data will receive its model once at construction and bind
to the state slice it renders; structural props and targeted setters remain
explicit.

This document records the investigation, implementation contract, and verification
status. No tests or test harnesses have been added.

## Background

The convention in [`model-view-pattern.md`](../../standards/model-view-pattern.md#the-props-pump-convention)
defines `update(props)` as construction-time configuration, with live data owned
by the child through a model subscription or targeted setter
([`model-view-pattern.md:351-361`](../../standards/model-view-pattern.md#the-props-pump-convention)).
`VanillaView.update()` stores props and invokes `onUpdate()` after mount without
an equality gate ([`vanilla-view.ts:84-97`](../../../src/renderer/uikit/shared/vanilla-view.ts#L84-L97));
this task must not add one.

The selector rule is material to the eventual conversion: `compareSelection`
compares arrays by identity, while plain-object fields are compared recursively
([`state.ts:18-40`](../../../src/renderer/core/state/state.ts#L18-L40)). A selector
must therefore return direct references, primitives, or a fresh plain object of
those values—not a newly mapped array
([`model-view-pattern.md:384-407`](../../standards/model-view-pattern.md#the-props-pump-convention)).

### Verified Axis A population

The following are the current model relays. The line ranges in the epic were
checked against the tree; the corrected ranges are recorded here rather than
copying stale citations.

| Root / method | Current model-bearing relay(s) | Finding and eventual boundary |
|---|---|---|
| `src/renderer/editors/link-editor/index.ts` — `LinkEditorView.onUpdate` | `:414-427`; descendant calls `:417-420`, `TextChromeView` model `:421-427` | Epic range `:414-421` is incomplete for the chrome model at `:422`; construct `LinkBreadcrumbView`, `LinkActionView`, `LinkFooterView`, and `LinkBodyView` once at `:387-397`. Their own state subscriptions decide the live slices. |
| `src/renderer/editors/notebook/index.ts` — `NotebookEditorView.onUpdate` | `:256-275`; descendant calls `:259-261`, chrome model `:267-275` | Epic citation `:264-275` misses the three direct child relays at `:259-261`; construct the body, breadcrumb, and toolbar once at `:227-239`. `TextChromeView`/`PageToolbarView` remains tied to the shared toolbar drill. |
| `src/renderer/editors/grid/index.ts` — `GridEditorView.onUpdate` | `:249-267`; descendant calls `:257-259`, chrome model `:260-267` with `model` at `:261` | Epic range `:249-260` misses the chrome model field at `:261`; construct body, toolbar, and search input once at `:219-232`. `GridBodyView` also carries `onModel`, which is US-1204 territory. |
| `src/renderer/editors/markdown/index.ts` — `MarkdownEditorView.onUpdate` | `:185-195`; child calls `:187-189`, chrome model `:190-195` with `model` at `:191` | Epic range `:187-189` covers the three direct child calls but not the chrome relay; construct children once at `:160-170`. Mermaid theme rendering stays governed by its own subscription at `MarkdownBlockView.ts:186-188`. |
| `src/renderer/editors/log-view/index.ts` — `LogViewEditorView.onUpdate` | `:169-178`; child calls `:171-172`, chrome model `:173-178` with `model` at `:174` | Epic range `:171-172` covers the direct body/toolbar calls but not the chrome relay; construct children once at `:148-156`. |
| `src/renderer/editors/html/index.ts` — `HtmlEditorView.onUpdate` | `:194-203`; child calls `:196-197`, chrome model `:198-203` with `model` at `:199` | Epic range `:196-197` covers the direct child calls but not the chrome relay; construct children once at `:173-181`. The body’s focus queue subscription is triaged separately in US-1207. |
| `src/renderer/editors/env-vars/index.ts` — `EnvVarsEditorView.onUpdate` | `:38-48`; body relay `:46`, chrome relay `:47` | Epic citation `:47` is incomplete: both `body.update({ model })` at `:46` and `chrome.update({ model: props.model, ... })` at `:47` fan the model. Children are created at `:24-33`. |
| `src/renderer/editors/image/ImageView.ts` — `ImageEditorView.onUpdate` | `:58-68`; toolbar relay `:60`; page-toolbar model field `:61-66` with `model` at `:63`; viewport update `:67` carries a value projection, not a model | The epic’s `:60` is one of two model-bearing update paths. `ImageToolbarView`, `PageToolbarView`, and `ImageViewportView` are constructed at `:37-44`; the viewport already binds `{ filePath, url }` at `:49-55`. |
| `src/renderer/editors/base/PageToolbarView.ts` — `PageToolbarView.onUpdate` | `:423-433`; `NavPanelButtonView` at `:431`, `SwitchWidgetView` at `:433` | This citation is current. Both children are constructed once at `:399-400`; their model subscriptions are established in `NavPanelButtonView.onMount` (`:122-168`) and `SwitchWidgetView.onMount` (`:228-238`). |
| `src/renderer/editors/rest-client/RequestBuilderView.ts` — nested branches | `HeadersTableView.onUpdate:258`; `FormUrlEncodedView.onUpdate:307`; `RawBodyView.onUpdate:315` | All three epic citations are current. `KeyValueEditorView` receives a seven-key object and three fresh closures at `:258` and `:307`; the Monaco host receives a live language/options/change object at `:315`. Construction happens at `:256`, `:305`, and `:313`. |

The broad measurement remains a population, not a completion metric. The epic
measured 405 `.update({` sites renderer-wide and 320 in `editors/`; the current
literal single-line `rg -n '\.update\(\{ ?model'` sweep reports 56 in
`editors/`. Multiline model fields are included above by inspecting the complete
`onUpdate` blocks, so the 56 result is not used as a defect count.

### Construction and live-data findings

The editor roots already construct the model-bearing descendants once during
mount (or in the root constructor for Markdown), then call `update()` only
because the parent pump still exists. The relevant construction sites are:

- Link: `link-editor/index.ts:387-398`.
- Notebook: `notebook/index.ts:227-239`.
- Grid: `grid/index.ts:219-232`.
- Markdown: `markdown/index.ts:160-170`.
- Log: `log-view/index.ts:148-156`.
- HTML: `html/index.ts:173-181`.
- Env vars: `env-vars/index.ts:24-33`.
- Image: `image/ImageView.ts:37-44`.
- Shared page toolbar: `base/PageToolbarView.ts:378-400`.
- Request branches: `rest-client/RequestBuilderView.ts:256`, `:263`, `:305`, and `:313`.

Several descendants already demonstrate the target ownership shape: `ImageEditorView`
binds a plain `{ filePath, url }` object at `ImageView.ts:49-55`,
`NotebookBodyView` binds `selectProjection` at `notebook/NotebookBodyView.ts:194-197`,
and `TextChromeView` creates its page toolbar and model-aware controls at
`base/TextChromeView.ts:362-382` while those controls subscribe to their own
slices (`TextChromeView.ts:129-130`, `:212`, and `PageToolbarView.ts:129-161`).

The immediate-vs-deferred boundary is therefore:

| Can adopt the construction-time model immediately | Wait for US-1203 (and, where noted, US-1204) |
|---|---|
| Editor-local body/toolbar views whose live data is already read through the editor model: `LinkBreadcrumbView`, `LinkActionView`, `LinkFooterView`, `LinkBodyView`; `MarkdownBodyView`, `MarkdownBackButtonView`, `MarkdownToolbarBitsView`; `LogBodyView`, `LogToolbarBitsView`; `HtmlBodyView`, `HtmlToolbarBitsView`; `EnvVarsBodyView`; `ImageViewportView` (already slice-bound). Verify each `onUpdate` before removal because construction-time props such as slots/configuration must remain. | `TextChromeView` and its `PageToolbarView`/`EditorToolbarView` path: `TextChromeView.ts:298-314` and `:362-382` still relay slots and model-aware toolbar controls. US-1203 changes the uikit relay beneath these views, so converting them twice would duplicate the migration. |
| `RequestBuilderView`’s branch shells can retain `vm`/request identity at construction, subject to targeted setters for changing request values. | `HeadersTableView` → `KeyValueEditorView` at `RequestBuilderView.ts:254-259` and `FormUrlEncodedView` → `KeyValueEditorView` at `:303-308` are the explicit US-1202/US-1203 seam: remove the fresh callback pump only after the child contract is settled. `RawBodyView` → `MonacoEditorHostView` at `:310-316` needs a targeted value/language update and should not be confused with the model fan-out. |
| Grid’s editor-local search and footer projections can be retained/selector-bound where their current model contract permits. | `GridBodyView` carries `onModel` at `grid/index.ts:221` and `:257`, and the model channel is US-1204. The grid body/DataGrid chain must wait for that contract. |
| The `PageToolbarView` children already have model subscriptions and can be checked for construction-only model identity. | The shared toolbar’s uikit controls (`IconButtonView`, `SegmentedControlView`, and descendants) are part of the US-1203 relay; do not make a second independent props-contract conversion here. |

This is a sequencing boundary, not permission to broaden this task into uikit
model/ref/memo work. `src/renderer/uikit/**` remains unchanged by US-1202 unless
US-1203 explicitly takes over a shared contract.

## Implementation Plan

Implementation is intentionally deferred until this document is approved.

1. Re-measure the exact model-bearing update blocks in the ten source files above
   and preserve the corrected line map. Confirm each root receives one stable
   editor model instance for its mounted lifetime; if model replacement is a
   supported path, use a deliberate replacement/disposal path rather than
   silently ignoring it.
2. Convert one editor root at a time in the order Link → Notebook → Grid →
   Markdown → Log → HTML → Env vars → Image → shared PageToolbar, preserving
   dynamic `import()` in each editor module. Remove only live model relays from
   `onUpdate`; retain structural slot updates (`children`, toolbar
   contributions) and non-model configuration updates.
3. For an immediate descendant, move model capture to its constructor and make
   its `onMount`/`bind` own the exact rendered slice. Use direct references or a
   fresh plain object of primitives/direct references; never use a mapped-array
   selector. Leave existing full-DOM rebuild, immer collection, timer, and
   re-entrancy concerns for Epic C/R4/R5/R8 as directed by EPIC-076 B-3.
4. Defer `TextChromeView`/shared toolbar and the KeyValue/DataGrid contracts to
   the US-1203/US-1204 boundary. For `RequestBuilderView`, preserve the request
   value synchronization with targeted setters and hoist the three KeyValue
   callbacks as stable fields; do not merely delete updates and freeze headers
   or form data.
5. After each editor is converted, walk the presence checks: open it, edit its
   live content/state, exercise toolbar and body controls, switch away/back,
   restore it, and confirm model-driven output still changes without parent
   model pumps. Record any unverified manual path in this document.

### Before → after shape

Representative root relay currently present at
`src/renderer/editors/link-editor/index.ts:414-422`:

```ts
// Before: every root update pushes the same model through every child.
protected onUpdate(props: { model: EditorModel }): void {
    const model = requireLinkModel(props.model);
    this.model = model;
    this.breadcrumb?.update({ model });
    this.actions?.update({ model });
    this.footer?.update({ model });
    this.body?.update({ model });
    this.chrome?.update({ model: props.model, children: this.body?.root });
}
```

The intended shape is construction-time ownership plus live subscriptions; the
exact targeted structural updates depend on each child:

```ts
// After: children retain the model; onUpdate carries only changed configuration.
protected onMount(): void {
    const model = requireLinkModel(this.props.model);
    this.body = this.child(new LinkBodyView({ model }));
    // LinkBodyView binds the LinkEditor slice it renders.
}

protected onUpdate(props: { model: EditorModel }): void {
    const model = requireLinkModel(props.model);
    if (model !== this.model) throw new Error("Editor model replacement is unsupported.");
    // No model pump. Update only structural slots/configuration if those changed.
}
```

For `RequestBuilderView`, the current KeyValue shape at `:256-258` is:

```ts
// Before: three fresh closures are allocated on every branch update.
this.editor.update({
    items: props.request.headers,
    onUpdate: (index, changes) => props.vm.updateHeader(props.request.id, index, changes),
    onDelete: (index) => props.vm.deleteHeader(props.request.id, index),
    onToggle: (index) => props.vm.toggleHeader(props.request.id, index),
    keyOptions: COMMON_HEADERS,
    keyPlaceholder: "Header name",
    valuePlaceholder: "Value",
});
```

The after contract must retain live `items` updates through a targeted setter
and stable fields for the three handlers; the exact child API is part of the
US-1203 seam and must be documented before implementation.

## Concerns

- The root citations in the epic are not uniformly complete. The corrected map
  above is authoritative for this tree, especially Notebook `:259-261`, Grid
  chrome `:261`, Env vars `:46-47`, and the chrome model fields in Link,
  Markdown, Log, and HTML.
- A model identity check must not become an equality gate in `VanillaView`.
  `VanillaView.update()` remains unchanged.
- Do not add `queueMicrotask` or `setTimeout(0)` while removing pumps. The
  copy-on-write state dispatch behavior is documented at
  `src/renderer/core/state/state.ts:52-54` and `:84-92`; no re-entrancy defect
  has been demonstrated by this investigation.
- Do not convert lazy editor imports to static imports. The editor registry
  continues to load editor modules through dynamic `import()`.
- Grid’s `onModel` and the shared toolbar/uikit relay must not be “fixed” twice;
  US-1203 and US-1204 own those contract changes.
- Full-DOM rebuilds, immer collection behavior, and timer hygiene are excluded;
  leave them for Epic C/R4/R5/R8 even when the same file is open.

## Acceptance Criteria

- [ ] The corrected Axis A map is implemented only after approval; no listed
  root pushes an unchanged model into a descendant from its normal dispatch
  path.
- [ ] Each live-data descendant receives its model once at construction and
  binds to the exact slice it renders, or uses a documented targeted setter.
- [ ] No selector allocates a fresh array; plain-object projections contain only
  primitives/direct references.
- [ ] RequestBuilder headers/form KeyValue handlers are stable, and request
  values remain live through targeted updates rather than a deleted pump.
- [ ] Structural toolbar/slot configuration still updates, dynamic editor
  imports remain dynamic, and Grid `onModel`/uikit/ref/memo work stays in its
  owning task.
- [ ] Manual presence checks cover editing, toolbar actions, editor switching,
  restore, and disposal for each converted editor; unverified paths are listed.
- [ ] No changes are made to `VanillaView.update()`, no deferral is introduced,
  no tests are added, and no commit is created.

### Files that need no changes in this task

| File / area | Reason |
|---|---|
| `src/renderer/uikit/shared/vanilla-view.ts` | Equality-gate proposal is explicitly rejected. |
| `src/renderer/core/state/state.ts` | Copy-on-write and comparison semantics are evidence, not a change target. |
| `src/renderer/uikit/**` | Shared props relay belongs to US-1203; this task consumes its eventual contract. |
| `src/renderer/editors/draw/**` | No Axis A root or cited relay. |
| `src/renderer/editors/base/TextChromeView.ts` | Shared chrome/uikit relay is deferred to the US-1203 boundary. |
| `src/renderer/editors/grid/GridBodyView.ts` and `src/renderer/editors/base/*` ref/onModel machinery | Ref/channel retirement belongs to US-1204; only the PageToolbar relay is mapped here. |
| `src/renderer/core/state/ComponentQueue.ts` | Queue subscriptions are triaged in US-1207, not changed by Axis A. |

## Files Changed summary

| File | Planned change |
|---|---|
| `src/renderer/editors/link-editor/index.ts` | Remove model-only child updates; retain structural chrome updates. |
| `src/renderer/editors/notebook/index.ts` | Remove model-only child updates; retain structural chrome updates. |
| `src/renderer/editors/grid/index.ts` | Remove model-only child updates subject to US-1204’s `onModel` boundary. |
| `src/renderer/editors/markdown/index.ts` | Remove model-only child updates; retain structural chrome updates. |
| `src/renderer/editors/log-view/index.ts` | Remove model-only child updates; retain structural chrome updates. |
| `src/renderer/editors/html/index.ts` | Remove model-only child updates; retain structural chrome updates. |
| `src/renderer/editors/env-vars/index.ts` | Remove body/chrome model-only updates. |
| `src/renderer/editors/image/ImageView.ts` | Remove toolbar/page-toolbar model-only updates; preserve viewport value projection. |
| `src/renderer/editors/base/PageToolbarView.ts` | No change; shared toolbar/uikit relay is deferred to US-1203. |
| `src/renderer/editors/rest-client/RequestBuilderView.ts` | No change; KeyValue and Monaco host contracts remain at the US-1203 seam. |
| `doc/tasks/US-1202-editor-roots/README.md` | Investigation and implementation contract. |

## Implementation Notes

### 2026-08-29

- Removed the immediate model-only pumps from Link, Notebook, Grid toolbar/search,
  Markdown, Log, HTML, Env vars, and Image descendants. Their construction-time
  model instances remain stable; root updates now reject replacement models where
  needed and retain only structural/deferred relays and the Image viewport slice.
- Kept `TextChromeView`, `PageToolbarView`, `EditorToolbarView`, GridBody's
  `onModel`, both `KeyValueEditorView` relays, and RawBody's Monaco host update
  unchanged for US-1203/US-1204.
- No uikit files, `VanillaView.update()`, selectors, deferrals, tests, or test
  harnesses were added. The dashboard entry remains `[ ]` as required for an
  unreviewed epic task.
- `npm run typecheck`, `npm run lint`, and `npm run build-prod` all passed. The
  production build emitted existing Vite warnings but completed successfully.
- Manual UI verification was not run in this environment; the manual verification
  checklist above remains unchecked.
