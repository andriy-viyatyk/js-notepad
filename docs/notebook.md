[← Editors](./editors.md)

# Notebook Editor

The Notebook Editor is a structured notes interface for `.note.json` files. Each note contains its own code editor, and notes are organized with categories, tags, and full-text search.

## Getting Started

1. Create a new file and save it with the `.note.json` extension
2. The Notebook Editor opens automatically
3. Click **Add Note** in the toolbar to create your first note

Alternatively, open a new tab, change the language to JSON, and rename the tab to a name ending with `.note.json` (e.g., "my.note.json"). The "Notebook" switch becomes available in the toolbar only when the page title ends with `.note.json`.

## Layout

```
+------------------------------------------------------------------+
| [Categories / Tags breadcrumb]     [Add Note] [Search...]        |
+---------------+--------------------------------------------------+
|               |                                                  |
| Left Panel    |  Notes List (virtualized)                        |
|               |                                                  |
| Categories    |  +--------------------------------------------+  |
|   OR          |  | * [category] [tags]   [date] [expand] [del]|  |
| Tags          |  |   [lang] [title]      [editor switch]      |  |
|               |  |   +--------------------------------------+ |  |
| (collapsible) |  |   | Editor content (Monaco/Grid/etc.)    | |  |
|               |  |   +--------------------------------------+ |  |
|               |  |   [+ Add comment]                          |  |
|               |  +--------------------------------------------+  |
|               |                                                  |
+---------------+--------------------------------------------------+
| [X notes] or [X of Y notes]                                     |
+------------------------------------------------------------------+
```

## Notes

### Creating a Note

Click **Add Note** in the toolbar. A new note appears at the top of the list with:
- The currently selected category (if filtering by category)
- The currently selected tag (if filtering by tag)
- The search text as the title (if searching)

### Editing a Note

Each note has:

- **Title** — Click the title field to edit. Appears next to the language icon.
- **Content** — Click inside the editor area to start editing. Supports all Monaco features (syntax highlighting, IntelliSense, multi-cursor).
- **Language** — Click the language icon to change. This determines syntax highlighting and available editor switches.
- **Comment** — Hover over a note and click "+ Add comment" to add an optional comment. Comments are useful for documenting JSON content that doesn't support inline comments.

### Editor Types

Each note can use different editors depending on its language:

| Language | Available Editors |
|----------|-------------------|
| JSON | Monaco text editor, Grid view |
| CSV | Monaco text editor, Grid view |
| Markdown | Monaco text editor, Preview |
| SVG | Monaco text editor, Preview |
| JavaScript | Monaco text editor (with Run button) |
| Other | Monaco text editor |

Use the editor switch buttons (visible on hover) to change the view.

### Running Scripts

Notes with JavaScript language have a Run button (visible on hover). Click it to execute the script. If you have text selected, only the selected portion runs. The script output goes to a grouped page, same as the main script panel.

### Deleting a Note

Hover over a note and click the delete icon. A confirmation dialog appears before deletion.

## Categories

Categories organize notes in a hierarchical tree using "/" as a separator.

### Assigning a Category

Click the category badge on a note (shows "No category" by default). A path input appears where you can:
- Type a new category path (e.g., "work/projects/alpha")
- Select from existing categories via autocomplete
- Press Enter to confirm, Escape to cancel

### Category Tree (Left Panel)

The left panel shows a collapsible category tree:
- **All** — Shows all notes (root)
- Categories are auto-created from note paths
- Note counts appear next to each category
- Click a category to filter the notes list
- Parent categories include counts from all children

### Drag-and-Drop

- **Drag a note** by its indicator dot (left side) and drop onto a category to change the note's category
- **Drag a category** in the tree and drop onto another to make it a subcategory
  - Dragging onto "All" makes it a root-level category
  - A confirmation dialog shows how many notes will be affected

### Breadcrumb Navigation

The toolbar shows a breadcrumb trail of the current category path. Click any segment to navigate up the hierarchy. Click the root label to clear the filter.

## Tags

Tags provide a flat or two-level labeling system using ":" as a separator.

### Tag Formats

- **Simple tags**: `important`, `done`, `todo`
- **Categorized tags**: `env:dev`, `env:prod`, `release:1.0.1`

Categorized tags group under their prefix in the Tags panel (e.g., all `env:*` tags group under "env:").

### Adding Tags

Hover over a note and click the **+** button in the tags area. A path input appears for entering the tag. Autocomplete suggests existing tags.

### Editing and Removing Tags

- Click a tag to edit it inline
- Hover over a tag and click the **x** button to remove it

### Tags Panel (Left Panel)

Switch to the Tags panel using the collapsible panel header. The panel shows:
- All tags with note counts
- Categorized tags are grouped — click a category to drill down
- Select a tag to filter the notes list
- Breadcrumb in the toolbar shows the current tag filter

## Search

The search field in the toolbar filters notes across all fields:

- Title
- Category
- Tags
- Comment
- Content (including grid cell values)

### Search Behavior

- Multiple words use AND condition — all words must match
- Search highlights appear in:
  - Category and tag badges (blue highlighted text)
  - Title and comment fields (blue text color)
  - Monaco editor (find-match decorations)
  - Grid editor (cell text highlighting)
  - Markdown preview (highlighted spans)
- Search works additively with category/tag filters

## Expanding a Note

Click the expand icon (visible on hover, top-right of note) to open a note in full-screen mode:

- The note covers the entire editor area including toolbars
- A blue indicator dot on the left signals expanded mode
- Full-size editor with no height constraint and minimap visible
- Edit category, tags, title, content, and comment as normal
- Click the collapse button (top-right) or press **Escape** to return to the list

Expanding is useful when you need more space to work with a note's content, especially for large code files or data.

## File Format

Notebook files are standard JSON with the `.note.json` extension:

```json
{
  "notes": [
    {
      "id": "unique-id",
      "title": "My Note",
      "category": "work/projects",
      "tags": ["important", "env:dev"],
      "content": {
        "language": "json",
        "content": "{ \"key\": \"value\" }",
        "editor": "monaco"
      },
      "comment": "Optional comment",
      "createdDate": "2026-02-07T10:30:00Z",
      "updatedDate": "2026-02-07T10:30:00Z"
    }
  ],
  "state": {}
}
```

Since the file is plain JSON, you can also edit it directly in the Text editor (switch using the toolbar button).

## Tips

- **Quick category assignment**: Drag notes onto categories instead of editing the category field
- **Keyboard workflow**: Use Escape to collapse an expanded note, or to cancel category/tag editing
- **Content search**: Search finds text inside note editors too, not just metadata
- **New note context**: When you have a category selected and add a note, the new note inherits that category
- **Comment for JSON**: Use comments on JSON notes to document what the data represents, since JSON doesn't support inline comments
