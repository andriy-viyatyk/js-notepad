# Notebook Editor Format (`notebook-view`)

**IMPORTANT: Read this guide BEFORE creating or updating notebook pages. Incorrect JSON structure will crash the editor.**

## Creating a Notebook Page

```
create_page({
  title: "My Notes.note.json",
  editor: "notebook-view",
  language: "json",
  content: JSON.stringify(notebookData)
})
```

**Required:** `language: "json"`, title ending with `.note.json`

## Root Structure

```json
{
  "notes": [ ...NoteItem objects... ],
  "state": {}
}
```

- `notes` — array of NoteItem objects (see below)
- `state` — object for per-item UI state; use empty `{}` when creating

## NoteItem Structure

Every field is **required** unless marked optional:

```json
{
  "id": "unique-id-1",
  "title": "Note Title",
  "category": "",
  "tags": [],
  "content": {
    "language": "plaintext",
    "content": "The note text content here"
  },
  "createdDate": "2026-03-20T10:00:00.000Z",
  "updatedDate": "2026-03-20T10:00:00.000Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | **yes** | Unique identifier (use UUID or any unique string) |
| `title` | string | **yes** | Note title displayed in the header |
| `category` | string | **yes** | Category name (use `""` for uncategorized) |
| `tags` | string[] | **yes** | Array of tag strings (use `[]` for no tags) |
| `content` | NoteContent | **yes** | The note body (see Content section below) |
| `comment` | string | optional | Comment text; omit to show "Add comment" button |
| `createdDate` | string | **yes** | ISO 8601 date string |
| `updatedDate` | string | **yes** | ISO 8601 date string |

**Common mistake:** Omitting `tags` or `category` will crash the editor. Always include them, even as empty (`[]` and `""`).

## NoteContent (the `content` field)

Each note contains a `content` object that behaves like a mini page — it supports the same editor types as regular Persephone pages:

```json
{
  "language": "plaintext",
  "content": "Simple text note",
  "editor": "monaco"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `language` | string | required | Language ID: `"plaintext"`, `"javascript"`, `"json"`, `"markdown"`, `"mermaid"`, etc. |
| `content` | string | required | The text content of the note |
| `editor` | string | `"monaco"` | Editor type: `"monaco"` (code/text), `"md-view"` (rendered markdown), `"mermaid-view"` (diagram), `"grid-json"` (data grid) |

### Content Examples

**Plain text note:**
```json
{ "language": "plaintext", "content": "Simple text note" }
```

**Markdown note (rendered):**
```json
{ "language": "markdown", "content": "# Heading\n\nSome **bold** text", "editor": "md-view" }
```

**Code snippet note:**
```json
{ "language": "javascript", "content": "console.log('hello');" }
```

**Mermaid diagram note:**
```json
{ "language": "mermaid", "content": "graph TD\n  A-->B", "editor": "mermaid-view" }
```

**JSON grid note:**
```json
{ "language": "json", "content": "[{\"name\":\"Alice\",\"age\":30}]", "editor": "grid-json" }
```

## Full Example

A notebook with 3 notes — a text note, a markdown note, and a code snippet:

```json
{
  "notes": [
    {
      "id": "note-1",
      "title": "Meeting Notes",
      "category": "Work",
      "tags": ["meeting", "q2"],
      "content": {
        "language": "markdown",
        "content": "# Q2 Planning\n\n- Review roadmap\n- Assign tasks\n- Set deadlines",
        "editor": "md-view"
      },
      "createdDate": "2026-03-20T10:00:00.000Z",
      "updatedDate": "2026-03-20T10:00:00.000Z"
    },
    {
      "id": "note-2",
      "title": "TODO",
      "category": "Personal",
      "tags": ["todo"],
      "content": {
        "language": "plaintext",
        "content": "Buy groceries\nClean the house\nFinish report"
      },
      "createdDate": "2026-03-20T10:05:00.000Z",
      "updatedDate": "2026-03-20T10:05:00.000Z"
    },
    {
      "id": "note-3",
      "title": "Code Snippet",
      "category": "Dev",
      "tags": ["javascript"],
      "content": {
        "language": "javascript",
        "content": "const greet = (name) => `Hello, ${name}!`;\nconsole.log(greet('World'));"
      },
      "createdDate": "2026-03-20T10:10:00.000Z",
      "updatedDate": "2026-03-20T10:10:00.000Z"
    }
  ],
  "state": {}
}
```

## Categories and Tags

- **Categories** are hierarchical strings separated by `/` (e.g., `"Work"`, `"Work/Projects"`)
- **Tags** are flat strings, optionally namespaced with `:` (e.g., `"status:active"`, `"priority:high"`)
- Both are user-defined — use any values that make sense for the content

## Errors & verification

- **`create_page` / `set_page_content` accept broken content silently** — the tool returns
  success and the failure appears in the editor (verified):
  - Unparseable JSON → the editor shows the parse error in place of notes (page otherwise fine).
  - Valid JSON with a **missing required field** → the editor **crashes**: the page shows
    `Editor crashed` with the exception (e.g. `TypeError: note.tags is not iterable`).
- **Verify**: `JSON.parse` your content before sending, include every required NoteItem field
  (`tags: []` and `category: ""` even when empty), and — to confirm the render — activate the
  page and `browser_snapshot({ pageId: "app" })`: a healthy notebook shows its notes; a broken
  one shows the error text.
- **Fixing a crashed page**: the content is still intact — `get_page_content`, repair the JSON,
  `set_page_content`. The editor recovers as soon as valid content arrives.
