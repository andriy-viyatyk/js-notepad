# US-1223 — Rename `data-part="react-slot"`

## Goal

Replace the misleading `data-part="react-slot"` marker on permanently native children hosts with
`data-part="children-slot"`, updating the two writers, all four CSS consumers, and the current
developer documentation that describes the native slot. Preserve the real React-island marker and
avoid changing any unrelated DOM contract.

## Background

EPIC-078 §D-2 correction 5 is authoritative for this task. The marker is written in exactly two
native UIKit views and consumed by four co-located CSS selectors:

| Site | Current evidence | Role |
|---|---|---|
| `src/renderer/uikit/Dialog/DialogView.ts:70-76` | `childrenHost` is a `span`, receives the marker at `:71`, then receives `getNativeChildren()` through `fillSlot()` at `:75-76` | Native dialog children host |
| `src/renderer/uikit/Tag/TagView.ts:156-163` | `childrenHost` is created as a `span`, receives the marker at `:159`, and is filled with `SlotContent` at `:163` | Native tag children host |
| `src/renderer/uikit/ListBox/ListItem.css:110-113` | Two selectors size an SVG one level below the icon/trailing host | Preserve icon sizing through the `display: contents` wrapper |
| `src/renderer/uikit/Panel/Panel.css:67-68` | `:has()` treats a marked empty direct child as the panel's empty-content host | Preserve hide-when-empty behavior |
| `src/renderer/uikit/Tree/TreeItem.css:132-133` | Selector sizes an SVG below the tree icon host | Preserve icon sizing through the wrapper |

The native-only fact is verified in `src/renderer/uikit/shared/fill-slot.ts:1-11,40-59,63-92`:
`SlotContent` contains strings, numbers, booleans, `Node`s, and arrays; `fillSlot()` appends native
content and explicitly documents that it does not create a React root. `DialogView` additionally
filters its children through `getNativeChildren()` at `:36-46` before filling the host. `TagView`
uses the same native `SlotContent` type at `:43`.

`children-slot` is the recommended replacement. It says both what the host contains and that it is
a slot, without claiming a rendering framework. Existing UIKit vocabulary supports the choice:
`src/renderer/uikit/Checkbox/CheckboxView.ts:29-33` uses `data-part="children"` for a native child
host, while `src/renderer/uikit/Input/InputView.ts:237-243` uses `start-slot` and `end-slot` for
named native slots. `children-slot` is more explicit than the generic `slot` and avoids ambiguity
with the component's other parts.

### External-reader audit

This is a shipped, queryable DOM contract, so the audit covered the whole authored repository, not
only `src/`. The result is **no external reader found**.

| Surface checked | Result and evidence |
|---|---|
| `src/renderer/automation/` / `browser_snapshot` | No marker selector. `commands.ts:158-165,219-220` delegates to `snapshot()`, and `snapshot.ts:59-62` obtains a CDP `Accessibility.getFullAXTree`; it formats the accessibility tree rather than querying `data-part`. |
| `app.ui.highlightElement` and implementation | No marker call site. `src/renderer/api/ui.ts:121-128` forwards an arbitrary caller-supplied selector; `assets/agent/ui-highlight.js:255-267` runs that selector through `document.querySelectorAll()`. This is a generic selector mechanism, not an external reader of `react-slot`. Its documented examples in `assets/mcp-res-ui.md:200-220` use `data-name`. |
| `qa/`, `assets/`, `boards-assets/`, `docs/`, scripts, and board files | No occurrence of `react-slot`, `[data-part="react-slot"]`, or a selector assembled from that value. The only `data-part` examples in the UI guide are the documented shell parts at `assets/mcp-res-ui.md:75,90`. |
| `doc/architecture/ui-element-contract.md` | Read in full. It defines `data-part` as a load-bearing internal component part at `:22-44` and directs agents to the accessibility tree for editor internals at `:132-138`, but it does not publish `react-slot`. No change is required there. |

The search used a case-sensitive literal search and selector-focused variants across the authored
tree, excluding only `.git`, `node_modules`, and generated `.vite` output:

```text
rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!.vite/**' \
  'react-slot|data-part=["'']react-slot["'']|\[data-part=["'']react-slot["'']\]' .
```

It found the six implementation sites above plus the deliberate explanatory reference at
`src/renderer/editors/draw/react-island.ts:18-22`. Other matches include the current developer
reference at `doc/standards/model-view-pattern.md:594-597` (listed for synchronization) and
historical planning or measurement prose (`doc/epics/`, `doc/tasks/`, and
`doc/de-react-refactoring.md`); none is a runtime reader. The generated `.vite` files mirror
compiled source and are not authored readers.

### Historical measurement instruments

The documentation audit found **two runnable selector snippets and one instrument declaration that
must be annotated**. These are not external runtime readers, but they are executable guidance that
would silently undercount after the rename:

1. `doc/epics/EPIC-064.md:779-782` — the `execute_script` snippet queries
   `[data-react-root],[data-part=react-slot]` and splits `slotArms` by `dataset.part`.
2. `doc/epics/EPIC-067.md:679-682` — the joint-session snippet queries
   `[data-part="react-slot"][data-react-root]`.
3. `doc/epics/EPIC-063.md:420` — the recorded “corrected instrument” is named as
   `[data-part="react-slot"], [data-react-root]`; it is an instrument declaration rather than a
   code block, but a future reader can re-run that selector from the statement.

Other `doc/` occurrences, including the counts and explanatory references at
`EPIC-063.md:143,148,163`, `EPIC-064.md:93`, `EPIC-065.md:90-91`, and
`EPIC-058.md:470-474`, are historical narrative or recorded results. Preserve those numbers and
prose; they do not need selector annotations. The implementation plan below lists the three
annotation sites explicitly.

The deliberate exclusion is mandatory: do not edit
`src/renderer/editors/draw/react-island.ts:20`, and do not edit `data-react-root`. That comment
explains why a real `mountReactHandle` island needs its own marker; `react-island.ts:22` writes
`data-react-root`, which is the authoritative live React-root marker.

## Implementation Plan

1. In `src/renderer/uikit/Dialog/DialogView.ts:71`, change only the `dataset.part` value from
   `react-slot` to `children-slot`. Keep the `display: contents` host, `getNativeChildren()` path,
   and `fillSlot()` lifecycle unchanged. The update path at `:83-90` reuses this same host and needs
   no separate marker assignment.

2. In `src/renderer/uikit/Tag/TagView.ts:159`, make the same value-only change. Keep the native
   `fillSlot()` call at `:163` and the separate `icon` and `remove` parts unchanged.

3. In the following stylesheets, replace only the attribute value in the four selectors; preserve
   selector specificity, direct-child relationships, rule order, and declarations:
   `src/renderer/uikit/ListBox/ListItem.css:111,113`,
   `src/renderer/uikit/Panel/Panel.css:68`, and
   `src/renderer/uikit/Tree/TreeItem.css:133`.

4. Update the stale current developer reference in
   `doc/standards/model-view-pattern.md:594-597` from `react-slot` to `children-slot`. This is
   documentation of the native fill-slot boundary, not an external DOM reader. Leave historical
   measurements and completed-epic records unchanged, except for the runnable-instrument notes in
   the next step.

5. In the three historical instrument sites, append one current-selector note without rewriting the
   recorded numbers, old snippet, or surrounding prose:

   - After the code block in `doc/epics/EPIC-064.md:779-782`, append: “Current selector after
     US-1223: use `[data-react-root],[data-part=children-slot]`; split native children hosts with
     `dataset.part === "children-slot"`.”
   - After the code block in `doc/epics/EPIC-067.md:679-682`, append: “Current selector after
     US-1223: use `[data-name="page-editor"] [data-part="children-slot"][data-react-root]` when
     inspecting the renamed native host.”
   - After the measurement statement in `doc/epics/EPIC-063.md:420`, append: “Current selector
     after US-1223: the native slot term is `[data-part="children-slot"]`; retain
     `[data-react-root]` as the live-root marker.”

   These are the exact **three** `doc/` instrument sites: two runnable snippets and one runnable
   instrument declaration. Do not annotate narrative-only historical references listed above.

6. Do not modify `src/renderer/editors/draw/react-island.ts`, any `data-react-root` occurrence, or
   the automation/highlight implementation. No compatibility alias is recommended: the epic's
   acceptance condition requires the misleading marker to disappear from authored `.ts`/`.css`,
   and the audit found no in-repository consumer that needs a transition period.

Before → after snippets:

```ts
// src/renderer/uikit/Dialog/DialogView.ts:71
this.childrenHost.dataset.part = "react-slot";
this.childrenHost.dataset.part = "children-slot";

// src/renderer/uikit/Tag/TagView.ts:159
this.childrenHost.dataset.part = "react-slot";
this.childrenHost.dataset.part = "children-slot";
```

```css
/* src/renderer/uikit/Panel/Panel.css:68 */
.panel-root[data-hide-when-empty]:has(> [data-part="react-slot"]:empty)
    :not(:has(> :not([data-part="react-slot"]))) { display: none; }

.panel-root[data-hide-when-empty]:has(> [data-part="children-slot"]:empty)
    :not(:has(> :not([data-part="children-slot"]))) { display: none; }
```

```md
<!-- doc/standards/model-view-pattern.md:594-597 -->
inside the `[data-part="react-slot"]` host used by `fillSlot`

inside the `[data-part="children-slot"]` host used by `fillSlot`
```

7. Verify the authored source with focused searches. The old value must remain only in the
   deliberate `react-island.ts` explanation among `.ts`/`.css` files; historical prose may retain
   its record of prior measurements. Confirm `data-react-root` has no diff. Use existing manual
   `browser_snapshot({ pageId: "app" })` inspection for affected native surfaces if a running app
   is available; do not add a unit test or test harness.

## Concerns

- This is a public-by-observation DOM change even though `data-part` is not listed as a stable
  shell selector in `ui-element-contract.md`. The repository audit found no external reader, but an
  undiscoverable third-party script could still have copied the old selector. A hard rename is the
  correct epic decision because the old name is false and the acceptance condition requires no old
  authored marker; callers outside this repository would need to update their selector.
- `Panel.css` depends on the marked host being a direct child and empty. The rename must not alter
  `display: contents`, `:empty`, `:has()`, or the negated sibling selector.
- The React island's explanatory comment intentionally mentions `react-slot` as the contrasting
  native marker. Removing it would erase the reason `data-react-root` exists, so it is explicitly
  excluded even though a whole-repository search still finds it.

## Acceptance Criteria

- `DialogView.ts:71` and `TagView.ts:159` emit `data-part="children-slot"`.
- The two ListItem selectors, the Panel empty-state selector, and the TreeItem selector use
  `children-slot` with their original structure and declarations unchanged.
- `doc/standards/model-view-pattern.md` describes the native host with `children-slot`.
- `doc/epics/EPIC-064.md:779-782`, `doc/epics/EPIC-067.md:679-682`, and
  `doc/epics/EPIC-063.md:420` each carry an appended note naming the current `children-slot`
  selector; their recorded measurements, old snippets, and surrounding historical prose are
  unchanged.
- A source search over authored `.ts` and `.css` files finds no `react-slot` except the deliberate
  explanatory reference in `src/renderer/editors/draw/react-island.ts`; no `data-react-root`
  occurrence is changed.
- The external-reader audit remains negative for automation, highlight calls, QA, assets,
  board assets, docs, scripts, and board code; `ui-element-contract.md` remains unchanged.
- Manual inspection, where available, confirms dialog/tag children, list/tree icons, and
  hide-when-empty panels retain their existing behavior. No tests or test harness are added.

## Files Changed Summary

| File | Expected change |
|---|---|
| `src/renderer/uikit/Dialog/DialogView.ts` | Rename the native children-host part value |
| `src/renderer/uikit/Tag/TagView.ts` | Rename the native children-host part value |
| `src/renderer/uikit/ListBox/ListItem.css` | Update two wrapper selectors |
| `src/renderer/uikit/Panel/Panel.css` | Update the empty-panel selector |
| `src/renderer/uikit/Tree/TreeItem.css` | Update the icon wrapper selector |
| `doc/standards/model-view-pattern.md` | Update the current native-slot description |
| `doc/epics/EPIC-064.md` | Append current-selector guidance to the historical runnable instrument |
| `doc/epics/EPIC-067.md` | Append current-selector guidance to the historical runnable instrument |
| `doc/epics/EPIC-063.md` | Append current-selector guidance to the recorded instrument declaration |

Files that need **NO changes**: `src/renderer/editors/draw/react-island.ts`, every
`data-react-root` writer/reader, `src/renderer/automation/`, `src/renderer/api/ui.ts`,
`assets/agent/ui-highlight.js`, `assets/mcp-res-ui.md`, `qa/`, `assets/`, `boards-assets/`,
`docs/`, `scripts/`, `doc/architecture/ui-element-contract.md`, narrative-only historical
references in the other epic/task records, and all other generated build output.
