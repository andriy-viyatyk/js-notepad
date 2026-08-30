# US-1226 — Remove ToolbarView's append-then-wipe trap

**Status:** Open · **Epic:** [EPIC-078](../../epics/EPIC-078.md)

This is an investigation and planning document. It does not implement the fix, add tests, or
change the dashboard.

## Goal

Make the ownership of ToolbarProps.children explicit and remove the remaining direct append
behind ToolbarView's slot contract, without changing toolbar layout, keyboard navigation, or
the native slot implementation.

## Background

ToolbarView fills its root from props.children during mount and again during every update
(src/renderer/uikit/Toolbar/ToolbarView.ts:40-57). fillSlot unconditionally calls
host.replaceChildren() before appending the new native content
(src/renderer/uikit/shared/fill-slot.ts:62-81), so a node appended directly to that host is
removed by the next ToolbarView.update() (src/renderer/uikit/shared/fill-slot.ts:68-71).

The repository has exactly two runtime ToolbarView constructions:

| Caller | Verified location | Finding |
|---|---|---|
| Toolbar.story.ts | src/renderer/uikit/Toolbar/Toolbar.story.ts:35-38 | The old direct-append defect is recorded as US-1187; the story now builds contents, passes them as children, and updates with the same stable nodes (src/renderer/uikit/Toolbar/Toolbar.story.ts:45-61, :72-78). |
| StorybookEditorView.ts | src/renderer/editors/storybook/StorybookEditorView.ts:61-62 | The view still appends toolbarLeading, the spacer, the label, and the background control directly to toolbar.root (src/renderer/editors/storybook/StorybookEditorView.ts:81-86). Its update path only rejects a model replacement and never updates the toolbar (src/renderer/editors/storybook/StorybookEditorView.ts:129-134), so the defect is latent rather than currently triggered. |

Other PageToolbarView, EditorToolbarView, and NoteItemToolbarView names in the repository are
different view classes, not additional ToolbarView callers; the two constructions above are the
complete value-level census.

ToolbarProps inherits children?: NativeSlotContent from NativeHTMLAttributes
(src/renderer/uikit/shared/dom-props.ts:32-47), and SlotContent accepts native text, DOM nodes,
and arrays of those values (src/renderer/uikit/shared/fill-slot.ts:1-11). The authoring rules
already define the contract: a view-owned children slot owns its host, callers pass nodes through
the slot, and callers must not append behind it (doc/standards/component-guide.md:45-48;
src/renderer/uikit/CLAUDE.md:639-644).

The toolbar root is also the layout and roving-navigation host. Its style is a flex container
(src/renderer/uikit/Toolbar/Toolbar.css:2-10), applyToolbarAttributes supplies the toolbar role
and structural data attributes (src/renderer/uikit/Toolbar/toolbar-style.ts:11-30), and
collectStops() enumerates direct root children when calculating focus stops
(src/renderer/uikit/Toolbar/ToolbarView.ts:100-115).

## Implementation plan

Recommend option (a) plus a narrowly-scoped development-time assertion: document the owned slot
on ToolbarProps.children, repair the remaining caller to use it, and warn before an update would
destroy an unexpected direct child. The epic's preference for absorbing or refusing the trap was
investigated, but the existing contracts make that a worse change (see Concerns).

1. In src/renderer/uikit/Toolbar/Toolbar.ts:5-18, exclude children from the inherited Omit list
   and redeclare it with a doc comment stating that ToolbarView owns the root's direct children,
   fillSlot may replace them on update, and callers must provide stable native nodes through
   children when the toolbar can be updated. Keep its type as
   NativeHTMLAttributes<HTMLDivElement>["children"] so it remains the existing native slot type
   from src/renderer/uikit/shared/dom-props.ts:32-47.
2. In src/renderer/editors/storybook/StorybookEditorView.ts:59-103, retain the four existing
   toolbar child nodes in a field or equivalent stable collection, pass that collection as the
   toolbar's children, and remove the direct toolbar.root.append(...). The initial collection must
   be assembled before toolbar.mount() so the first fillSlot owns the same nodes that the caller
   later retains; child-view mounting remains after the parent mount as it is today
   (src/renderer/editors/storybook/StorybookEditorView.ts:94-103).
3. Preserve the story's existing stable-node pattern as the reference caller: it constructs the
   nodes once, passes them through children, and re-passes the same node identities on update
   (src/renderer/uikit/Toolbar/Toolbar.story.ts:50-78).
4. Add a private development-only snapshot of the actual direct root childNodes immediately after
   each successful fillSlot call. Before ToolbarView.onUpdate calls fillSlot, compare the current
   direct childNodes with that snapshot by length and node identity; warn when the root has been
   mutated behind the slot contract. Guard the assertion with the renderer's compile-time Vite
   development flag so production does not perform the check (vite.renderer.config.ts:1,
   :67-90). A stable children path compares equal; a new node supplied through children on the
   next update is not present until after this pre-update check, so it is also legitimate.
5. Do not change fillSlot, collectStops(), Toolbar.css, or the toolbar style helper. The intended
   fix is at the props contract, caller boundary, and development diagnostic; ToolbarView.onUpdate
   must continue to call fillSlot so replacement and superseded-cleanup semantics remain
   centralized (src/renderer/uikit/Toolbar/ToolbarView.ts:54-57, :100-115;
   src/renderer/uikit/shared/fill-slot.ts:62-92).

### Before → after shape

~~~ts
// Before — StorybookEditorView.ts:81-86
this.toolbar.root.append(
    toolbarLeading,
    spacer.root,
    createTextElement("Background:", { size: "sm", color: "light" }),
    this.backgroundControl.root,
);
~~~

~~~ts
// After — intended shape; the exact field name is implementation detail
this.toolbarChildren = [
    toolbarLeading,
    spacer.root,
    this.backgroundLabel,
    this.backgroundControl.root,
];
// ToolbarProps.children receives this same array before toolbar.mount().
~~~

## Concerns

### Can option (b) refuse a manual append?

Not safely at the ToolbarView boundary. The public HTMLElement host exposes several ordinary
mutation paths, while the existing view only observes mutations after they occur
(src/renderer/uikit/Toolbar/ToolbarView.ts:46-49). Refusing all direct appends would therefore
require intercepting DOM APIs or replacing the host with a nonstandard facade; either approach
changes the host's normal DOM contract and is not supported by fillSlot's HTMLElement API
(src/renderer/uikit/shared/fill-slot.ts:68-81).

### Can option (b) absorb appends into an internal slot wrapper?

It would no longer be a small containment fix. fillSlot explicitly owns the host it receives and
replaces that host's direct children (src/renderer/uikit/CLAUDE.md:639-644;
src/renderer/uikit/shared/fill-slot.ts:68-92). A wrapper would require changing which element is
the slot host, while ToolbarView.collectStops() currently treats each direct root child as a
toolbar stop and has special handling for nested roving hosts
(src/renderer/uikit/Toolbar/ToolbarView.ts:100-115). It would also introduce a new
layout/accessibility boundary into a flex root whose current layout depends on direct children
(src/renderer/uikit/Toolbar/Toolbar.css:2-10). The wrapper would thus be more likely to change
ordering, focus discovery, or layout than to remove the trap without collateral changes.

### Can a development assertion distinguish the two paths?

Yes, if it records the actual direct childNodes after ToolbarView's own fillSlot call. A legitimate
stable children path leaves those nodes in the same order and with the same identities until the
next update; a newly supplied children node is not installed until fillSlot runs, so it cannot
create a false pre-update warning. A manual append is already present before the next update and
therefore changes the length or identity sequence that the assertion compares
(src/renderer/uikit/Toolbar/ToolbarView.ts:40-57;
src/renderer/uikit/shared/fill-slot.ts:68-81). This avoids relying on collectStops(), which
correctly treats direct children as focus candidates today (src/renderer/uikit/Toolbar/ToolbarView.ts:100-115).

The assertion is guarded by Vite's compile-time development mode, so it adds no production
comparison or warning path; the renderer is Vite-configured for both development and build
(vite.renderer.config.ts:1, :67-90). It does not intercept DOM APIs, alter fillSlot, or change
the root structure. It warns at the update that would otherwise silently wipe the append; an
append that is removed before an update is outside this hazard's observable window.

### Does documenting the contract still matter?

Yes. The assertion is a diagnostic backstop, not ownership: it leaves fillSlot's deliberate
replacement semantics intact while making the ownership rule discoverable at the public prop where
callers look for it. That is consistent with the component guide's existing children rule
(doc/standards/component-guide.md:45-48) and the already-correct story implementation
(src/renderer/uikit/Toolbar/Toolbar.story.ts:45-78). The known production caller is then repaired
to follow the contract; future callers get both an explicit rule and a visible development signal.

## Acceptance criteria

- ToolbarProps.children documents that the slot owns the toolbar root's direct children and may
  replace them during an update (src/renderer/uikit/shared/dom-props.ts:32-47;
  src/renderer/uikit/shared/fill-slot.ts:62-81).
- StorybookEditorView passes its toolbar-leading node, spacer, background label, and background
  control through children, with stable node identities, and no longer appends them directly to
  toolbar.root (src/renderer/editors/storybook/StorybookEditorView.ts:81-103).
- ToolbarView still owns replacement/cleanup through fillSlot; no caller can lose those nodes
  through the documented usage path (src/renderer/uikit/Toolbar/ToolbarView.ts:40-57).
- In development, a direct append behind the slot is reported before a subsequent update can
  destroy it; stable nodes passed through children do not trigger the assertion
  (src/renderer/uikit/Toolbar/ToolbarView.ts:40-57; src/renderer/uikit/Toolbar/ToolbarView.ts:100-115).
- Toolbar flex layout, toolbar semantics, and roving focus behavior are unchanged
  (src/renderer/uikit/Toolbar/Toolbar.css:2-29; src/renderer/uikit/Toolbar/toolbar-style.ts:21-32;
  src/renderer/uikit/Toolbar/ToolbarView.ts:100-125).
- No unit tests, test harness, source implementation, or dashboard edit is added for this planning
  task.

## Files changed

This task adds only this README. The eventual implementation scope is limited to
src/renderer/uikit/Toolbar/Toolbar.ts, src/renderer/uikit/Toolbar/ToolbarView.ts, and
src/renderer/editors/storybook/StorybookEditorView.ts.
The following investigation files are explicitly no-change files:
src/renderer/uikit/shared/fill-slot.ts, src/renderer/uikit/Toolbar/Toolbar.story.ts,
src/renderer/uikit/Toolbar/toolbar-style.ts, src/renderer/uikit/Toolbar/Toolbar.css,
doc/standards/component-guide.md, src/renderer/uikit/CLAUDE.md, and
vite.renderer.config.ts.
