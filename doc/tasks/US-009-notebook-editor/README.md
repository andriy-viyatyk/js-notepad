# US-009: Notebook Editor

## Status

**Status:** In Progress
**Priority:** Medium
**Started:** 2026-02-07
**Completed:** -

## Summary

Create a Notebook Editor for `*.note.json` files - a chat-like notes interface with categories/tags, search, and navigation panel.

## Why

- Provide structured note-taking capability within js-notepad
- Chat-like format is intuitive for quick notes and thoughts
- Categories and tags help organize notes
- Search enables finding notes quickly
- First "tool editor" - establishes pattern for other structured data editors (Todo, Bookmarks)

## Acceptance Criteria

- [ ] `*.note.json` files open in Notebook Editor by default
- [ ] Editor switch shows only "JSON" and "Notebook" for `.note.json` files (no "Grid")
- [ ] Regular `.json` files still show "JSON" and "Grid" as before
- [ ] Can create new notes with timestamp
- [ ] Can edit and delete existing notes
- [ ] Can assign categories/tags to notes
- [ ] Can search notes by content and tags
- [ ] Navigation panel shows note list with filtering
- [ ] Changes tracked as dirty (unsaved) state
- [ ] File saves as valid JSON
- [ ] Documentation updated
- [ ] No regressions in existing functionality

## Technical Approach

### Phase 1: Editor Registration Redesign ✅ COMPLETED

Refactored editor registration from declarative to function-based approach:

**Old approach (removed):**
```typescript
extensions: [".myext"],
filenamePatterns: [/\.note\.json$/i],
languageIds: ["json"],
priority: 10,
alternativeEditors: ["monaco"],
```

**New approach:**
```typescript
acceptFile: (fileName) => { /* return priority or -1 */ },
validForLanguage: (languageId) => { /* return boolean */ },
switchOption: (languageId, fileName) => { /* return priority or -1 */ },
```

Grid-json now excludes `.note.json` files via `SPECIALIZED_JSON_PATTERNS` in register-editors.ts.

### Phase 2: Minimal Notebook Editor

Create empty `NotebookEditor` that just renders "Notebook Editor" placeholder text:
- `NotebookEditor.tsx` - Placeholder component
- Register in `register-editors.ts` with function-based matching
- Reuse `textEditorModule` for model (content-view pattern)

### Phases 3+: Port Notebook Functionality

User has existing Electron app with notebook implementation to port/adapt.

**TODO:** Add details after user provides more context about:
- Existing implementation to port from
- Specific changes/improvements to make during porting

## File Format (Tentative)

```json
{
  "version": 1,
  "categories": ["work", "personal", "ideas"],
  "notes": [
    {
      "id": "uuid",
      "content": "Note text here",
      "category": "work",
      "tags": ["important", "todo"],
      "created": "2026-02-07T10:30:00Z",
      "updated": "2026-02-07T10:30:00Z"
    }
  ]
}
```

## Files to Create/Modify

### Phase 1: Registry Redesign ✅
- `src/renderer/editors/types.ts` - New function-based EditorDefinition
- `src/renderer/editors/registry.ts` - Simplified methods using new functions
- `src/renderer/editors/register-editors.ts` - All editors converted to function-based

### Phase 2: Minimal Editor
- `src/renderer/editors/notebook/` - New folder
  - `NotebookEditor.tsx` - Placeholder component
  - `index.ts` - Exports
- `src/renderer/editors/register-editors.ts` - Add notebook editor registration

## Implementation Progress

### Phase 1: Editor Registration Redesign ✅
- [x] Refactor EditorDefinition to use function-based matching
- [x] Update registry.ts to use acceptFile, validForLanguage, switchOption
- [x] Convert all existing editors to new approach
- [x] Add SPECIALIZED_JSON_PATTERNS to exclude .note.json from grid-json
- [x] Update documentation (editor-guide.md, editors.md)
- [x] Test: regular `.json` shows "JSON" + "Grid"
- [x] Test: verified existing functionality works

### Phase 2: Minimal Editor
- [ ] Create placeholder `NotebookEditor.tsx`
- [ ] Create `index.ts` exports
- [ ] Register in `register-editors.ts`
- [ ] Add "notebook-view" to PageEditor type in shared/types.ts
- [ ] Test: `.note.json` shows "JSON" + "Notebook"

### Phase 3+: Port Functionality
- [ ] TBD - awaiting user input on existing implementation

## Notes

### Design Decisions
- Reuse `TextFileModel` for page model (content is JSON text, same save/load logic)
- Notebook editor is a "content-view" like grid/markdown (not a "page-editor" like PDF)
- Chat-like format: newest notes at bottom, input at bottom
- Grid-json exclusion via SPECIALIZED_JSON_PATTERNS is explicit and maintainable

### 2026-02-07
- Completed Phase 1: Editor registration redesigned to function-based approach
- This enables notebook editor to exclude grid-json from switch options

## Related

- Related pattern: [Editor Guide](../../standards/editor-guide.md)
- Similar future tasks: ToDo Editor, Bookmarks Editor (in backlog)
