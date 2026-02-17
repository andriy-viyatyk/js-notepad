# US-022: ToDo Editor

## Status

**Status:** Planned
**Priority:** Medium
**Started:** —
**Completed:** —

## Summary

A structured todo list editor for `*.todo.json` files with multiple named lists, checkbox items with optional comments, drag-to-reorder, search with highlighting, and done/undone sorting — following the same content-view pattern as the Notebook editor.

## Why

- Developers need lightweight, file-based task tracking that lives alongside their project files
- Existing todo apps require separate tools and accounts — a `.todo.json` file is portable, version-controllable, and always accessible
- Fits naturally into js-notepad's tool-editor concept (like Notebook for `.note.json`)
- Can fall back to Monaco for raw JSON editing when needed

## Design

### Layout

```
┌──────────────────────────────────────────────────────────┐
│ Toolbar: [Search field]                                  │
├──────────────┬───────────────────────────────────────────┤
│ Left Panel   │ Center Panel                              │
│              │ ┌───────────────────────────────────────┐ │
│ + New List   │ │ [Add new todo item...]            [+] │ │
│              │ ├───────────────────────────────────────┤ │
│ ▸ Project A  │ │ ☐ Undone item 1                      │ │
│   2/4        │ │   Comment text...                     │ │
│ ▸ Project B  │ │ ☐ Undone item 2                      │ │
│   3/5        │ │ ────────── Done ──────────            │ │
│ ▸ Personal   │ │ ☑ Done item 1          Jan 15, 2026  │ │
│   1/2        │ │ ☑ Done item 2          Jan 14, 2026  │ │
│              │ └───────────────────────────────────────┘ │
└──────────────┴───────────────────────────────────────────┘
```

### Left Panel — Lists

- Each entry represents a separate todo list (e.g., "Project A", "Personal")
- Shows item count badge as "undone/total" (e.g., "3/5" means 3 undone out of 5 total)
- Click to select and show items in center panel
- "All" option at top to show items from all lists
- **Add new list:** button/input at top of panel
- **Rename list:** inline rename; all items referencing the old name are updated to the new name
- **Delete list:** context action with confirmation dialog ("Delete list 'X' and all N items?")
- **Duplicate list prevention:** UI prevents adding a list with a name that already exists
- Resizable panel width (splitter between left and center)

### Center Panel — Todo Items

**Quick Add:**
- Text input field at the top of the center panel
- Press Enter to add new item to the currently selected list
- New item appears at the top of undone items
- Disabled when "All" is selected (must select a specific list)

**Item Display:**
- Checkbox on the left — toggle done/undone
- Title label next to checkbox
- Optional multiline comment below title (expandable, like Notebook note comments)
  - Show "+ Add comment" link when no comment exists
  - Textarea when comment is present
- Dates shown on hover: created date, done date (when applicable)

**Sorting:**
- Undone items appear first, in user-defined order (drag-to-reorder)
- Done items appear after undone items, sorted by done date (newest first)
- Done items cannot be reordered
- Unchecking a done item moves it to the bottom of undone items

**Drag-to-Reorder:**
- Undone items can be reordered by dragging
- Drag handle on left side of item (or entire item row)
- Visual drop indicator between items

**Item Actions:**
- Delete item (with confirmation or undo-style)
- Edit title inline (click to edit) — both done and undone items are editable
- Edit comment — both done and undone items can have comments added/edited

### Toolbar

**Search:**
- Search input field in the toolbar
- Live filtering as user types
- Matched words highlighted in item titles and comments
- Multi-word AND search (all words must match)
- Search applies across all visible items (respects selected list filter)

### JSON File Format (`.todo.json`)

```json
{
    "lists": ["Project A", "Project B", "Personal"],
    "items": [
        {
            "id": "uuid-1",
            "list": "Project A",
            "title": "Implement feature X",
            "done": false,
            "createdDate": "2026-01-15T10:30:00.000Z",
            "doneDate": null,
            "comment": "Need to check API docs first"
        },
        {
            "id": "uuid-2",
            "list": "Project A",
            "title": "Fix bug in parser",
            "done": true,
            "createdDate": "2026-01-10T08:00:00.000Z",
            "doneDate": "2026-01-14T16:45:00.000Z",
            "comment": null
        }
    ]
}
```

**Field descriptions:**
- `lists` — ordered array of list names (display order in left panel)
- `items[].id` — unique identifier (UUID)
- `items[].list` — name of the list this item belongs to (references `lists` array)
- `items[].title` — the todo item text
- `items[].done` — completion status
- `items[].createdDate` — ISO timestamp when item was created
- `items[].doneDate` — ISO timestamp when item was marked done (null if undone)
- `items[].comment` — optional multiline comment (null if none)

### Data Integrity Rules

1. **Duplicate lists:** UI prevents adding a list name that already exists. If duplicates appear in JSON (edited via Monaco), skip duplicates — use first occurrence only.
2. **Orphaned items:** If an item references a `list` not present in `lists` array, dynamically add that list name to the UI and persist it on next save. Items must always be visible to the user.
3. **Missing fields:** Apply sensible defaults (e.g., `done: false`, `createdDate: now`).
4. **Item ordering:** Array position is the source of truth. Drag-to-reorder splices the array directly. No `order` field — same approach as Notebook editor.

## Architecture & Patterns

### Registration: Content-View (Same as Notebook)

Like the Notebook editor, the ToDo editor is a **content-view** that reuses `TextFileModel` for file I/O:

```typescript
editorRegistry.register({
    id: "todo-view",
    name: "ToDo",
    pageType: "textFile",
    category: "content-view",
    acceptFile: (fileName) => matchesPattern(fileName, /\.todo\.json$/i) ? 20 : -1,
    validForLanguage: (lang) => lang === "json",
    switchOption: (lang, fileName) => {
        if (lang !== "json") return -1;
        if (!fileName || !matchesPattern(fileName, /\.todo\.json$/i)) return -1;
        return 10;
    },
    loadModule: async () => {
        const module = await import("./todo/TodoEditor");
        return {
            Editor: module.TodoEditor,
            ...textEditorModule,
        };
    },
});
```

### Model Structure (Following Notebook Pattern)

```
TodoEditorModel (extends TComponentModel)
├── State: lists, items, selectedList, searchText, filteredItems
├── Serialization: JSON ↔ TextFileModel.content (debounced 300ms)
├── Filtering: by list + search text (with incremental optimization)
├── CRUD: addItem, toggleItem, updateComment, deleteItem, addList, deleteList
└── Drag: reorder undone items within a list

TodoItemViewModel (extends TComponentModel)
├── Per-item UI state (editing title, showing comment)
└── Search highlight context
```

### Key Patterns to Reuse from Notebook

| Pattern | Notebook Source | ToDo Usage |
|---------|----------------|------------|
| JSON serialization loop | `NotebookEditorModel` lines 94-106 | Same debounced write-back to TextFileModel |
| `skipNextContentUpdate` flag | `NotebookEditorModel` | Prevent re-parsing own writes |
| Left panel with counts | `CollapsiblePanelStack` + `categoriesSize` | Lists panel with item counts |
| Resizable splitter | `leftPanelWidth` state | Same pattern |
| Search with highlighting | `HighlightedTextProvider` context | Reuse for title/comment highlighting |
| Incremental search optimization | `lastFilterState` tracking | Filter from previous results when search grows |
| Comment expand/collapse | NoteItemView comment section | Same UX: "+ Add comment" → textarea |
| Virtualized list | `RenderFlexGrid` | For large todo lists |

## Acceptance Criteria

- [ ] Opens `.todo.json` files with the ToDo editor by default
- [ ] Left panel shows all lists with "undone/total" count badges
- [ ] Selecting a list filters items in center panel
- [ ] "All" option shows items from all lists
- [ ] Quick-add input creates new items at top of undone section
- [ ] Checkbox toggles done/undone status
- [ ] Undone items appear first, then done items (sorted by done date, newest first)
- [ ] Undone items can be reordered by dragging
- [ ] Items support optional multiline comments (expand/collapse)
- [ ] Created date and done date shown on hover
- [ ] Search field filters items live with word highlighting
- [ ] Can add new lists (duplicate names prevented)
- [ ] Can delete lists with confirmation
- [ ] All items (done and undone) are editable — title and comment
- [ ] Can rename a list; all items in the list update to the new name
- [ ] Orphaned items (list missing from `lists`) are shown and list is auto-added
- [ ] Session restore works (file reopens in todo view)
- [ ] Can switch to Monaco for raw JSON editing
- [ ] Todo items list uses `RenderFlexGrid` for virtualization
- [ ] Exclude `.todo.json` from grid-json editor (`SPECIALIZED_JSON_PATTERNS`)
- [ ] Documentation updated
- [ ] No regressions in existing functionality

## Files to Modify

### New Files

- `src/renderer/editors/todo/TodoEditorModel.ts` — Main model: state, serialization, filtering, CRUD, drag
- `src/renderer/editors/todo/TodoEditor.tsx` — Main component: layout (left panel + splitter + center panel), toolbar with search
- `src/renderer/editors/todo/todoTypes.ts` — TypeScript interfaces for todo data format
- `src/renderer/editors/todo/components/TodoListPanel.tsx` — Left panel: list items with counts, add/delete list
- `src/renderer/editors/todo/components/TodoItemView.tsx` — Single todo item: checkbox, title, comment, drag handle, hover dates

### Modified Files

- `src/shared/types.ts` — Add `"todo-view"` to `PageEditor` type
- `src/renderer/editors/register-editors.ts` — Register todo editor + add `.todo.json` to `SPECIALIZED_JSON_PATTERNS`

## Implementation Progress

### Phase 1: Core Data Model
- [ ] Define types in `todoTypes.ts` (TodoData, TodoItem interfaces)
- [ ] Create `TodoEditorModel` with JSON parsing/serialization
- [ ] Implement debounced serialization with `skipNextContentUpdate`
- [ ] Implement list extraction with item counts
- [ ] Implement filtering by selected list
- [ ] Handle orphaned items (auto-add missing lists)
- [ ] Handle duplicate list names (skip duplicates)

### Phase 2: Basic UI
- [ ] Create `TodoEditor.tsx` with left panel + splitter + center panel layout
- [ ] Create `TodoListPanel.tsx` — list items with counts, selection
- [ ] Create `TodoItemView.tsx` — checkbox, title display, done/undone styling (rendered inside `RenderFlexGrid`)
- [ ] Implement quick-add input field
- [ ] Implement done/undone sorting (undone first, done by doneDate desc)
- [ ] Register in `register-editors.ts`
- [ ] Add `.todo.json` to `SPECIALIZED_JSON_PATTERNS`
- [ ] Add `"todo-view"` to `PageEditor` type

### Phase 3: Interactions
- [ ] Implement drag-to-reorder for undone items
- [ ] Implement inline title editing
- [ ] Implement comment expand/collapse (+ Add comment → textarea)
- [ ] Implement hover dates display (created date, done date)
- [ ] Implement delete item
- [ ] Implement add/rename/delete list (with duplicate prevention, rename updates items, delete confirmation)

### Phase 4: Search
- [ ] Add search field to toolbar
- [ ] Implement live filtering with multi-word AND search
- [ ] Implement search highlighting using `HighlightedTextProvider`
- [ ] Implement incremental search optimization

### Phase 5: Polish & Documentation
- [ ] Keyboard shortcuts (Enter to add, etc.)
- [ ] Update user documentation
- [ ] Update what's new

## Notes

### 2026-02-17
- Design follows Notebook editor patterns closely — same content-view approach, same serialization pattern
- File format uses flat item array with `list` field referencing `lists` array (simpler than nested structure)
- `order` field on items allows stable drag-to-reorder without array index dependency
- Orphaned item handling ensures data is never hidden from user — critical for file-based editors where JSON can be edited manually
- Comment UX matches Notebook: undefined → "+ Add comment" button, string → textarea, empty on blur → back to undefined

## Related

- Pattern reference: Notebook Editor (`src/renderer/editors/notebook/`) — primary architecture reference
- Related doc: [Editor Guide](../../standards/editor-guide.md)
- Related doc: [Coding Style](../../standards/coding-style.md)
- Backlog origin: "Tool Editors Infrastructure → ToDo Editor" in backlog.md
