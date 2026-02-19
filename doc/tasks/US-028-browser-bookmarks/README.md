# US-028: Browser Bookmarks (Links Editor Integration)

## Status

**Status:** Planned
**Priority:** Low
**Started:** —
**Completed:** —
**Depends on:** US-027 (Browser Profiles & Downloads), Links Editor (not yet created)

## Summary

Add bookmark functionality to the browser editor that stores bookmarks in the Links editor. Clicking a link in the Links editor opens a new browser page grouped with it.

## Why

- Bookmarks are essential for a usable browser experience
- Integration with the Links editor (similar to Notebook editor) provides structured bookmark management with categories and tags
- Bidirectional link: browser → save bookmark to Links editor; Links editor → open link in browser

## Prerequisites

This task depends on:
1. **Links Editor** — A structured editor for `.links.json` files (similar to Notebook editor), storing links by categories and tags. This editor does not exist yet and needs its own US task.
2. **US-025, US-026, US-027** — Basic browser, tabs, and profiles

## Acceptance Criteria

- [ ] Bookmark button in browser toolbar (star icon)
- [ ] Click bookmark button → save current page URL and title to Links editor
- [ ] If a Links editor is grouped with the browser, save to that editor
- [ ] If no Links editor is grouped, save to a default bookmarks file (configured in app settings)
- [ ] Bookmark dialog: choose category, add tags before saving
- [ ] In Links editor: click a link → opens new browser page grouped with the Links editor
- [ ] Visual indicator if current page is already bookmarked
- [ ] Documentation updated
- [ ] No regressions in existing functionality

## High-Level Approach

### Bookmark Storage

Bookmarks are stored as entries in a `.links.json` file managed by the Links editor:
- Each bookmark has: URL, title, category, tags, date added
- The Links editor provides the UI for browsing, searching, and organizing bookmarks
- No separate bookmark storage — reuses the Links editor's data format

### Bookmark Flow

1. **Save bookmark**: Browser toolbar → bookmark button → dialog (category, tags) → write to Links editor file
2. **Open bookmark**: Links editor → click link → open browser page grouped with Links editor
3. **Default file**: If no Links editor is grouped, use a default bookmarks file path from app settings

## Implementation Progress

### Phase 1: Bookmark Button
- [ ] Add bookmark (star) icon to browser toolbar
- [ ] Bookmark dialog: URL (prefilled), title (prefilled), category selector, tag selector
- [ ] Save bookmark to grouped Links editor or default file

### Phase 2: Links Editor Integration
- [ ] Links editor click → open browser page grouped with it
- [ ] Visual indicator in browser toolbar when current URL is bookmarked
- [ ] Remove bookmark action

## Notes

### 2026-02-19
- Split from original US-021 vision. This is the final piece of the browser feature set.
- Blocked on Links Editor implementation. The Links editor task should be created separately.
- The page grouping redesign (minimize to thin panel, expand as overlay) is a separate task that will enhance the browser + Links editor UX but is not a dependency.

## Related

- Depends on: [US-025 Basic Browser Editor](../US-025-basic-browser-editor/README.md)
- Depends on: [US-026 Browser Internal Tabs](../US-026-browser-internal-tabs/README.md)
- Depends on: [US-027 Browser Profiles & Downloads](../US-027-browser-profiles-downloads/README.md)
- Depends on: Links Editor (task not yet created)
