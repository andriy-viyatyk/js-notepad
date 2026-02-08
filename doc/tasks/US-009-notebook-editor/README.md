# US-009: Notebook Editor

## Status

**Status:** In Progress
**Priority:** Medium
**Started:** 2026-02-07
**Completed:** -

## Summary

Create a Notebook Editor for `*.note.json` files - a structured notes interface with categories, tags, search, and navigation panel. Each note contains a mini version of js-notepad page with Monaco editor support.

## Why

- Provide structured note-taking capability within js-notepad
- Categories and tags help organize notes
- Search enables finding notes quickly
- First "tool editor" - establishes pattern for other structured data editors (Todo, Bookmarks)
- Each note can contain code with syntax highlighting and execution capability

## Data Model

### Note Item

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique GUID (auto-generated) |
| `title` | string | User-typed title for the note |
| `category` | string | Hierarchical category separated by "/" (e.g., "work/projects/alpha") |
| `tags` | string[] | Array of tags. Two formats: simple ("secret") or categorized with ":" ("env:dev", "env:prod") |
| `content` | object | Mimics TextPageModel state (language, content, editor, etc.) - mini notepad page data |
| `comment` | string | Optional comment field (useful for JSON content which doesn't support comments) |
| `createdDate` | string | ISO date string |
| `updatedDate` | string | ISO date string |

### File Format (`.note.json`)

```json
{
  "notes": [
    {
      "id": "uuid-string",
      "title": "My Note",
      "category": "work/projects",
      "tags": ["important", "env:dev"],
      "content": {
        "language": "json",
        "content": "{ \"key\": \"value\" }",
        "editor": "monaco"
      },
      "comment": "Optional comment here",
      "createdDate": "2026-02-07T10:30:00Z",
      "updatedDate": "2026-02-07T10:30:00Z"
    }
  ],
  "state": {
    "<item.id>": {
      "editor": "grid-json",
      "gridColumns": [...]
    }
  }
}
```

The `state` map stores per-item UI state:
- Selected editor ("monaco" or "grid-json")
- Grid column order and widths
- Other UI preferences

## UI Design

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [Toolbar: Search] [Add New] [Selected: category/tag label]  │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│  Left Panel  │           Center Area                        │
│              │        (Virtualized Grid)                    │
│  Categories  │                                              │
│     OR       │  ┌────────────────────────────────────────┐  │
│    Tags      │  │ Note Item                              │  │
│              │  │ [category] [tags] [title] [del] [exp]  │  │
│  (switch/    │  │ ┌──────────────────────────────────┐   │  │
│  collapsible)│  │ │ Monaco Editor (mini)             │   │  │
│              │  │ │ [language] [editor switch]       │   │  │
│              │  │ └──────────────────────────────────┘   │  │
│              │  │ [+ add comment]                        │  │
│              │  └────────────────────────────────────────┘  │
│              │                                              │
├──────────────┴──────────────────────────────────────────────┤
│ [Footer: Total: X | Filtered: Y | Selected: Z]              │
└─────────────────────────────────────────────────────────────┘
```

### Left Panel

- Dynamically gathers categories and tags from all notes
- Switch between Categories view OR Tags view (not both simultaneously)
- Could use collapsible panels where only one is expanded
- Selection filters the notes list in center area
- Categories displayed as tree structure based on "/" hierarchy
- Tags with ":" categorization (e.g., "env:dev", "env:prod") grouped under category

### Center Area (Notes List)

- Uses existing `RenderGrid` component (virtualized, handles many items)
- New items added to TOP of list (avoids scroll jump issues during height recalculation)
- Item height is dynamic with maxHeight limit
- Single-line notes show minimal height

### Single Note Item

**Header:**
- Category (interactive - editable via popper/dropdown)
- Tags (interactive - editable via popper/dropdown)
- Title (editable input)
- Delete button
- Expand button (expands to full editor area via React portal)

**Content:**
- Mini version of js-notepad page
- Monaco editor with language selection
- Editor switch (limited set - no nested notebook editor)
- Grid editor available for JSON/CSV
- Execute button works for JavaScript

**Comment (optional):**
- Not rendered if empty
- Small semi-transparent button to add comment when needed
- Simple input or multiline textarea

**Metadata:**
- createdDate/updatedDate shown only on hover

### Toolbar Integration

NotebookEditor adds to TextPageView toolbar (similar to GridEditor):
- Search field
- Add new item button
- Label showing selected category/tag filter

### Footer Integration

Status label showing: "Total: X | Filtered: Y | Selected: Z"

## Acceptance Criteria

- [x] `*.note.json` files open in Notebook Editor by default
- [x] Editor switch shows only "JSON" and "Notebook" for `.note.json` files (no "Grid")
- [x] Regular `.json` files still show "JSON" and "Grid" as before
- [x] Can create new notes with auto-generated ID and timestamps
- [x] Can edit note title, category, tags, content, and comment
- [x] Can delete notes
- [ ] Categories collected dynamically and displayed in left panel
- [ ] Tags collected dynamically and displayed in left panel
- [ ] Can filter notes by category or tag selection
- [ ] Search functionality works
- [x] Notes list is virtualized (RenderFlexGrid)
- [x] New items appear at top of list
- [x] Item height adjusts dynamically
- [ ] Expand button shows note in full editor area (portal)
- [x] Mini Monaco editor works with language selection
- [x] Editor switch works (monaco, grid-json for JSON)
- [x] Execute button works for JavaScript content
- [ ] Comment field can be added/edited
- [x] Hover shows date metadata
- [x] Changes tracked as dirty (unsaved) state
- [x] File saves as valid JSON
- [x] Per-item state (editor, grid columns) persisted in `state` map
- [ ] Documentation updated
- [ ] No regressions in existing functionality

## Completed Work

### Editor Registration Redesign ✅

Refactored editor registration from declarative to function-based approach:
- `acceptFile()`, `validForLanguage()`, `switchOption()` functions
- Grid-json excludes `.note.json` via `SPECIALIZED_JSON_PATTERNS`
- Updated documentation (editor-guide.md, editors.md)

### Model/View Structure ✅

Split NotebookEditor into Model and View following GridEditor pattern:

**Files created:**
- `notebookTypes.ts` - Type definitions (NoteItem, NoteContent, NotebookData, etc.)
- `NotebookEditorModel.ts` - Model class with state management
- `NotebookEditor.tsx` - View component with toolbar integration
- `index.ts` - Exports

**Features implemented:**
- Data loading from page content (JSON parsing)
- Data serialization back to page content (with 4-space indent)
- Debounced save (300ms) to avoid frequent serialization
- `skipNextContentUpdate` flag to prevent reload cycle
- `lastSerializedData` tracking to avoid saving unchanged data
- Error display for invalid JSON
- "Add Note" button in toolbar via portal
- New notes added at top with UUID, timestamps, default content

### Two-Panel Layout ✅

- Left panel for categories (placeholder for now)
- Center panel for notes list
- Resizable splitter between panels
- Scrollable notes area

### Note Item Editor ✅

Created full note item component with mini-editor functionality:

**Files created in `note-editor/` subfolder:**
- `NoteItemEditModel.ts` - Adapter providing TextFileModel-like interface for notes
- `NoteEditorModel` - Monaco editor state (selection, focus)
- `MiniTextEditor.tsx` - Simplified Monaco (no line numbers, no minimap, minimal chrome)
- `NoteItemToolbar.tsx` - Language selector + editor switch + run buttons
- `NoteItemActiveEditor.tsx` - Loads Monaco or alternative editors via registry
- `index.ts` - Exports

**NoteItem features:**
- Language selector with popup menu (same as PageTab)
- Editor switch buttons (Monaco, Grid, Markdown, SVG depending on language)
- Run Script button for JavaScript notes
- Title editing
- Content editing syncs to notebook state
- Alternative editors (Grid, Markdown, SVG) work via adapter pattern
- Delete note functionality

**Styling:**
- Minimalistic design - no borders by default
- First toolbar (category, tags, date, actions) hidden, visible on hover
- Second toolbar: language icon always visible, extras (editor switch) on hover
- Content area border appears on hover/focus
- Comment section: shows text if present, "add comment" button on hover
- Compact layout with minimal padding

### Virtualized Notes List ✅

Integrated RenderFlexGrid for virtualized rendering of note items:
- Dynamic row heights via cellRef measurement
- Monaco editor tracks content height via `onDidContentSizeChange`
- Max editor height (400px) limits individual note content areas

### EditorConfigContext ✅

Created general-purpose editor configuration context in `editors/base/`:

**File:** `EditorConfigContext.tsx`

**Properties:**
- `maxEditorHeight` - Maximum height constraint for editors
- `minEditorHeight` - Minimum height constraint for editors
- `hideMinimap` - Whether to hide minimap in Monaco/Markdown editors
- `disableAutoFocus` - Prevents auto-focus when editors mount (fixes scroll jumping)

**Usage in NoteItem:**
- Wraps `NoteItemActiveEditor` with `EditorConfigProvider`
- Sets `maxEditorHeight: 400`, `hideMinimap: true`, `disableAutoFocus: true`
- Editors read config via `useEditorConfig()` hook

**Editors updated:**
- `MiniTextEditor` - Uses maxEditorHeight and hideMinimap
- `GridEditor` - Uses maxEditorHeight for growToHeight, disableAutoFocus to prevent focus stealing
- `MarkdownView` - Uses maxEditorHeight and hideMinimap

### GridEditor Scroll Jumping Fix ✅

**Problem:** When scrolling notes list, items with GridEditor caused visual "jumping" when scrolled into view.

**Root cause:** `GridPageModel.loadGridData()` called `focusGrid()` whenever data loaded. When virtualization remounted a NoteItem with GridEditor, it would auto-focus - stealing focus and causing scroll position changes.

**Fix:**
- Added `disableAutoFocus` property to `EditorConfig` interface
- Added `disableAutoFocus` prop to `GridPageProps` interface
- `GridPageModel.loadGridData()` now checks `disableAutoFocus` before calling `focusGrid()`
- `GridEditor` passes `disableAutoFocus` from context to model props
- `NoteItem` sets `disableAutoFocus: true` in EditorConfigProvider

### Note Item Visual Improvements ✅

- Added dot indicator (CircleIcon) to mark note item start
- Dot turns blue on focus-within state
- Fixed width overflow with `box-sizing: border-box`
- Added padding for scroll area (right) and dot space (left)

### EditorStateStorageContext ✅

Created context for nested editor state storage in `editors/base/`:

**File:** `EditorStateStorageContext.tsx`

**Problem solved:** GridEditor stores state (column widths, focus, filters) in cache files using page ID. When embedded in NotebookEditor, it used note ID, creating orphan cache files that were never cleaned up.

**Solution:** Context-based state storage that allows different implementations:
- Default: file-based storage via `filesModel` (for standalone pages)
- Notebook: stores in `data.state[noteId]` map (persisted in notebook file)

**Interface:**
```typescript
interface EditorStateStorage {
    getState: (id: string, name: string) => Promise<string | undefined>;
    setState: (id: string, name: string, state: string) => Promise<void>;
}
```

**Files modified:**
- `GridPageModel.ts` - Uses `stateStorage` prop instead of direct `filesModel` calls
- `GridEditor.tsx` - Gets storage via `useEditorStateStorage()` hook
- `NotebookEditorModel.ts` - Added `getNoteState`/`setNoteState` methods
- `NoteItem.tsx` - Wraps content with `EditorStateStorageProvider`
- `notebookTypes.ts` - Added index signature to `NoteItemState` for arbitrary keys

**Result:** Grid state stored in notebook file:
```json
{
  "notes": [...],
  "state": {
    "<note.id>": {
      "contentHeight": 385,
      "grid-page": "{\"columns\":[...],\"focus\":{...}}"
    }
  }
}
```

## Implementation Progress

- [x] Refactor EditorDefinition to function-based matching
- [x] Register notebook-view editor with SPECIALIZED_JSON_PATTERNS
- [x] Create notebookTypes.ts with type definitions
- [x] Create NotebookEditorModel.ts with state and data loading
- [x] Update NotebookEditor.tsx to use model pattern
- [x] Add "Add Note" toolbar button
- [x] Handle external file changes (file monitor)
- [x] Prevent spurious "modified" state on editor switch
- [x] Two-panel layout with resizable splitter
- [x] NoteItemEditModel adapter (TextFileModel-like interface)
- [x] MiniTextEditor with simplified Monaco options
- [x] NoteItemToolbar with language selector and editor switch
- [x] NoteItemActiveEditor for loading alternative editors
- [x] Delete note functionality
- [x] Title editing
- [x] Minimalistic styling with hover states
- [x] Virtualized notes list (RenderFlexGrid)
- [x] Dynamic item height with maxHeight constraint
- [x] EditorConfigContext for passing config to nested editors
- [x] Minimap hidden in embedded editors
- [x] Note item visual indicator (dot with focus state)
- [x] Fix scroll jumping with embedded GridEditor (disableAutoFocus)
- [x] EditorStateStorageContext for nested editor state persistence

## Remaining Work

- [ ] Categories panel implementation (dynamic collection, tree view)
- [ ] Tags panel implementation (dynamic collection, grouped view)
- [ ] Filter notes by category/tag selection
- [ ] Search functionality
- [ ] Expand note to full editor (portal)
- [ ] Comment editing UI
- [ ] Documentation updates

## Known Issues

(None currently)

## Design Decisions

- Reuse `TextFileModel` for page model (content is JSON text, same save/load logic)
- Notebook editor is a "content-view" like grid/markdown (not a "page-editor" like PDF)
- New items at top to avoid scroll jump issues during dynamic height recalculation
- Grid-json exclusion via SPECIALIZED_JSON_PATTERNS is explicit and maintainable
- Per-item state stored in file to persist editor preferences and grid column config
- No nested notebook editor in note content (prevent recursion)
- Debounced serialization prevents performance issues on rapid updates
- NoteItemEditModel adapter pattern allows reusing existing editors without modification
- Monaco padding uses `lineDecorationsWidth` for left padding (native padding only supports top/bottom)
- EditorConfigContext in `editors/base` provides general-purpose config passing to nested editors
- `hideMinimap` is a specific property (not generic "compact") to allow future user settings

## Related

- Related pattern: [Editor Guide](../../standards/editor-guide.md)
- Similar future tasks: ToDo Editor, Bookmarks Editor (in backlog)
