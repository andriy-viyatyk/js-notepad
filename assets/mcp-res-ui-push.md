# `pages.logView.push` — Log View Output Channel

Use `pages.logView.push(entries)` to show information to the user. It pushes entries to a Log View
page — a scrollable, styled log with support for interactive dialogs. The live call, return, pending,
and window contract is in `pages.logView.$help`; this resource keeps the entry schema and examples.

Persephone manages the Log View page automatically:
- On first access, a new Log View page is created
- Subsequent `pages.logView` calls reuse the same page
- If the user closes the page, the next access creates a new one

## Entry Format

Entries are **flat objects** with `type` and type-specific fields directly on the object (no `data` wrapper):

```json
{ "type": "log.info", "text": "Hello world" }
{ "type": "input.confirm", "message": "Apply changes?", "buttons": ["No", "Yes"] }
```

## Entry Types

**Log entries** (display-only):

| Type | Fields | Description |
|------|--------|-------------|
| `log.text` | `text` | Standard log text |
| `log.info` | `text` | Info message (blue) |
| `log.warn` | `text` | Warning (yellow/orange) |
| `log.error` | `text` | Error (red) |
| `log.success` | `text` | Success (green) |

**Dialog entries** (interactive — the call returns ids immediately):

| Type | Fields | Description |
|------|--------|-------------|
| `input.confirm` | `message, buttons?` | Confirmation — default buttons: ["No", "Yes"] |
| `input.text` | `title?, placeholder?, defaultValue?, buttons?` | Text input |
| `input.buttons` | `buttons, title?` | Button selection |
| `input.checkboxes` | `items: [{label, checked?}], title?, layout?, buttons?` | Checkboxes selection — result includes `items` with updated `checked` state |
| `input.radioboxes` | `items: string[], title?, checked?, layout?, buttons?` | Radio selection — result includes `checked` with selected item label |
| `input.select` | `items: string[], title?, selected?, placeholder?, buttons?` | Dropdown select — result includes `selected` with selected item label |

**Output entries** (rich display — returns immediately):

| Type | Fields | Description |
|------|--------|-------------|
| `output.progress` | `label?, value?, max?, completed?` | Progress bar with optional label |
| `output.grid` | `content, contentType?, title?` | Tabular data grid (auto-detects columns from data) |
| `output.text` | `text, language?, title?, wordWrap?, lineNumbers?, minimap?` | Syntax-highlighted text block (Monaco editor) |
| `output.markdown` | `text, title?` | Rendered markdown document (headings, code blocks, tables, mermaid, task lists) |
| `output.mermaid` | `text, title?` | Rendered mermaid diagram (flowcharts, sequence diagrams, etc.) |

**`output.grid` content formats:**

`content` (string) contains the grid data. `contentType` selects the format (default: `"json"`):
- `"json"` — JSON array of objects. Columns are auto-detected from object keys.
- `"csv"` — CSV text. First row is always column headers, comma-delimited.

Examples:
```
// JSON format (default)
{ "type": "output.grid", "content": "[{\"name\":\"Alice\",\"age\":30},{\"name\":\"Bob\",\"age\":25}]", "title": "Users" }

// CSV format
{ "type": "output.grid", "content": "name,age\nAlice,30\nBob,25", "contentType": "csv", "title": "Users" }
```

No separate `columns` parameter — columns are always derived from the data itself.

**String shorthand:** Plain strings in the entries array are treated as `log.info`.

## Examples

```
// Simple log messages (string shorthand)
pages.logView.push(["Analyzing code...", "Found 3 files to process"])
→ returns immediately: { entryIds: [...], dialogIds: [] }

// Typed log entries (flat format)
pages.logView.push([
    { type: "log.info", text: "Analysis complete." },
    { type: "log.warn", text: "2 files have issues." },
    { type: "log.success", text: "All other files are clean." }
])
→ returns immediately: { entryIds: [...], dialogIds: [] }

// Confirm dialog (the call remains non-blocking)
pages.logView.push([
    { type: "log.info", text: "Ready to apply changes." },
    { type: "input.confirm", message: "Apply changes?", buttons: ["No", "Yes"] }
])
→ returns immediately with a dialog id; read pages.logView.dialogResult(id) later

// Text input dialog
pages.logView.push([
    { type: "input.text", title: "Project name", placeholder: "my-app", buttons: ["Cancel", "OK"] }
])
→ returns immediately with a dialog id; read pages.logView.dialogResult(id) later

// Checkboxes dialog (items must be objects with label)
pages.logView.push([
    { type: "input.checkboxes", title: "Select items to process", items: [
        { label: "Item A" }, { label: "Item B", checked: true }, { label: "Item C" }
    ], buttons: ["!Process", "Cancel"] }
])
→ returns immediately with a dialog id; read pages.logView.dialogResult(id) later

// Radio buttons dialog (items are plain strings)
pages.logView.push([
    { type: "input.radioboxes", title: "Select size", items: ["Small", "Medium", "Large"], buttons: ["!OK", "Cancel"] }
])
→ returns immediately with a dialog id; read pages.logView.dialogResult(id) later

// Select dropdown dialog
pages.logView.push([
    { type: "input.select", title: "Select format", items: ["JSON", "CSV", "XML"], placeholder: "Choose format...", buttons: ["!OK", "Cancel"] }
])
→ returns immediately with a dialog id; read pages.logView.dialogResult(id) later

// Syntax-highlighted text block
pages.logView.push([
    { type: "output.text", text: "SELECT * FROM users WHERE active = true;", language: "sql", title: "Query" }
])
→ returns immediately: { entryIds: [...], dialogIds: [] }

// Text block with line numbers and no word wrap
pages.logView.push([
    { type: "output.text", text: "function hello() {\n  console.log('world');\n}", language: "javascript", lineNumbers: true, wordWrap: false }
])
→ returns immediately: { entryIds: [...], dialogIds: [] }

// Rendered markdown document
pages.logView.push([
    { type: "output.markdown", text: "# Report\n\n| Name | Score |\n|------|-------|\n| Alice | 95 |\n| Bob | 87 |", title: "Analysis Results" }
])
→ returns immediately: { }

// Rendered mermaid diagram
pages.logView.push([
    { type: "output.mermaid", text: "graph TD\n  A[Start] --> B[Process]\n  B --> C[End]", title: "Pipeline" }
])
→ returns immediately: { }

// Multiple dialogs in one call (all shown; resolve through dialogResult)
pages.logView.push([
    { type: "input.text", title: "Name?" },
    { type: "input.confirm", message: "Proceed?" }
])
→ returns immediately with both dialog ids
```

## Dialog Results

- Each dialog entry produces one result object in the `results` array
- Results are the full flat entry objects (including `type`, `id`, `timestamp`, and all fields)
- Non-dialog entries produce no results
- `button` contains the clicked button label, or `null` if canceled (user closed the page)
- Text input dialogs also include a `text` field with the entered value
- Checkboxes dialogs include `items` with updated `checked` state
- Radioboxes dialogs include `checked` with the selected item label
- Select dialogs include `selected` with the selected item label

## Updating Entries by ID

Every entry gets an auto-generated `id`. To **update an existing entry**, pass your own `id` when creating it, then send another `pages.logView.push` with the same `id` — the entry is updated in-place instead of appended.

```
// Create a progress bar with a custom id
pages.logView.push([
    { type: "output.progress", id: "dl-1", label: "Downloading...", value: 0, max: 100 }
])

// Update it (same id → merges fields into existing entry)
pages.logView.push([
    { type: "output.progress", id: "dl-1", value: 75 }
])

// Mark as complete
pages.logView.push([
    { type: "output.progress", id: "dl-1", completed: true, label: "Download complete!" }
])
```

This works for **any entry type** — not just progress bars. Use it to update diagrams, tables, or text blocks without creating duplicates. Generate unique IDs yourself (e.g., `"my-diagram"`, `"status-1"`) for entries you plan to update later.

## When to Use `pages.logView.push` vs page creation

| Scenario | Use |
|----------|-----|
| Show status, progress, results | `pages.logView.push` with log entries |
| Ask user a question | `pages.logView.push` with dialog entries |
| Show data that user will edit | `pages.addEditorPage` with the appropriate editor |
| Open a file in a specific editor | `pages.openFile` or `app.openRawLink` |

## Errors & verification

## Errors & verification

- **Dialogs are non-blocking.** `pages.logView.push` returns dialog ids immediately; an unresolved
  dialog raises call attention until the user answers it in Log View. There is no automatic
  user-response timeout. See `pages.logView.$help` for the omission and window rules.
- **Malformed entries fail loudly** with a message that includes the expected shape and an
  example (e.g. `output.grid requires 'content' field (JSON string or CSV string). Example: …`)
  — fix the entry per the message; nothing was appended.
- **Treat `button: null` as "cancelled"**, never as consent — the user closed the page without
  answering.
