# US-018: Implement Grouping for Pinned Tabs

## Status

**Status:** Planned
**Priority:** High
**Started:** —
**Completed:** —

## Summary

Redesign page grouping so that pinned tabs can be grouped with unpinned tabs, even when they are not adjacent in tab order. This is critical for script execution in pinned tabs, which outputs results to a grouped tab.

## Why

- **Script execution is broken for pinned tabs.** Scripts always output to the grouped tab, creating one on demand if none exists. Since US-017 disabled grouping for pinned tabs (because the current design requires grouped tabs to be adjacent), running scripts in a pinned tab no longer works correctly.
- **Pinned tabs need grouping for side-by-side workflows.** Users may want to pin a file and view its script output, markdown preview, or a duplicate side-by-side — all of which rely on tab grouping.
- The current adjacency constraint was a simplification that doesn't accommodate pinned tabs living in a separate section of the tab bar.

## Acceptance Criteria

- [ ] Pinned tabs can be grouped with unpinned tabs (non-adjacent grouping)
- [ ] Script execution works correctly in pinned tabs (output goes to grouped tab)
- [ ] `page.grouped` auto-creation works for pinned tabs
- [ ] Grouped tabs that are not adjacent render correctly in side-by-side view
- [ ] Ungrouping works correctly for non-adjacent grouped tabs
- [ ] Existing adjacent grouping (Ctrl+Click between unpinned tabs) still works
- [ ] Compare/diff mode works with non-adjacent grouped tabs
- [ ] Tab close, reorder, and drag-and-drop work correctly with non-adjacent groups
- [ ] Documentation updated
- [ ] No regressions in existing functionality

## Notes

### Current Design (Adjacent Grouping)

The current grouping system requires grouped tabs to be adjacent in the `pages[]` array:
- `groupTabs(id1, id2)` moves tabs to be next to each other
- `fixGrouping()` validates adjacency after reorder
- The editor area renders grouped tabs side-by-side based on their adjacent position
- `groupLeft`/`groupRight` maps track which tab is on which side

### Problem

Pinned tabs are always at the start of `pages[]`, unpinned tabs follow. Moving a pinned tab next to an unpinned tab (or vice versa) would break the pinned/unpinned boundary that US-017 established.

### Redesign Direction

The grouping mechanism needs to support non-adjacent tabs being displayed side-by-side. Key areas to investigate:
- How the editor area renders grouped content (does it read from `pages[]` position or from group maps?)
- Whether `groupLeft`/`groupRight` can work without adjacency
- How `fixGrouping()` should behave when grouped tabs are intentionally non-adjacent
- Impact on `moveTab`/`moveTabByIndex` boundary enforcement

## Related

- Related task: US-017 (Pinning Page Tabs — introduced the restriction)
- Related doc: [Architecture Overview](../../architecture/overview.md)
- Key file: [pages-store.ts](../../../src/renderer/store/pages-store.ts) — grouping logic
