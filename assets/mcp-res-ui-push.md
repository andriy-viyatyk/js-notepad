# ui_push — Log View Output Channel

The `ui_push` tool is the **recommended way for AI agents to show information** to the user. It pushes entries to a Log View page — a scrollable, styled log with support for interactive dialogs.

Persephone manages the Log View page automatically:
- On first `ui_push` call, a new Log View page is created
- Subsequent `ui_push` calls reuse the same page
- If the user closes the page, the next `ui_push` creates a new one

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

**Dialog entries** (interactive — tool blocks until user responds):

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
ui_push({ entries: ["Analyzing code...", "Found 3 files to process"] })
→ returns immediately: { }

// Typed log entries (flat format)
ui_push({ entries: [
    { type: "log.info", text: "Analysis complete." },
    { type: "log.warn", text: "2 files have issues." },
    { type: "log.success", text: "All other files are clean." }
] })
→ returns immediately: { }

// Confirm dialog (blocks until user clicks)
ui_push({ entries: [
    { type: "log.info", text: "Ready to apply changes." },
    { type: "input.confirm", message: "Apply changes?", buttons: ["No", "Yes"] }
] })
→ blocks until user responds → { results: [{ button: "Yes", ... }] }

// Text input dialog
ui_push({ entries: [
    { type: "input.text", title: "Project name", placeholder: "my-app", buttons: ["Cancel", "OK"] }
] })
→ blocks → { results: [{ button: "OK", text: "my-project", ... }] }

// Checkboxes dialog (items must be objects with label)
ui_push({ entries: [
    { type: "input.checkboxes", title: "Select items to process", items: [
        { label: "Item A" }, { label: "Item B", checked: true }, { label: "Item C" }
    ], buttons: ["!Process", "Cancel"] }
] })
→ blocks → { results: [{ button: "Process", items: [{label:"Item A"}, {label:"Item B",checked:true}, {label:"Item C",checked:true}], ... }] }

// Radio buttons dialog (items are plain strings)
ui_push({ entries: [
    { type: "input.radioboxes", title: "Select size", items: ["Small", "Medium", "Large"], buttons: ["!OK", "Cancel"] }
] })
→ blocks → { results: [{ button: "OK", checked: "Medium", ... }] }

// Select dropdown dialog
ui_push({ entries: [
    { type: "input.select", title: "Select format", items: ["JSON", "CSV", "XML"], placeholder: "Choose format...", buttons: ["!OK", "Cancel"] }
] })
→ blocks → { results: [{ button: "OK", selected: "JSON", ... }] }

// Syntax-highlighted text block
ui_push({ entries: [
    { type: "output.text", text: "SELECT * FROM users WHERE active = true;", language: "sql", title: "Query" }
] })
→ returns immediately: { }

// Text block with line numbers and no word wrap
ui_push({ entries: [
    { type: "output.text", text: "function hello() {\n  console.log('world');\n}", language: "javascript", lineNumbers: true, wordWrap: false }
] })
→ returns immediately: { }

// Rendered markdown document
ui_push({ entries: [
    { type: "output.markdown", text: "# Report\n\n| Name | Score |\n|------|-------|\n| Alice | 95 |\n| Bob | 87 |", title: "Analysis Results" }
] })
→ returns immediately: { }

// Rendered mermaid diagram
ui_push({ entries: [
    { type: "output.mermaid", text: "graph TD\n  A[Start] --> B[Process]\n  B --> C[End]", title: "Pipeline" }
] })
→ returns immediately: { }

// Multiple dialogs in one call (all shown, all must be resolved)
ui_push({ entries: [
    { type: "input.text", title: "Name?" },
    { type: "input.confirm", message: "Proceed?" }
] })
→ blocks until BOTH resolved → { results: [{ button: "OK", text: "Alice", ... }, { button: "Yes", ... }] }
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

Every entry gets an auto-generated `id`. To **update an existing entry**, pass your own `id` when creating it, then send another `ui_push` with the same `id` — the entry is updated in-place instead of appended.

```
// Create a progress bar with a custom id
ui_push({ entries: [
    { type: "output.progress", id: "dl-1", label: "Downloading...", value: 0, max: 100 }
] })

// Update it (same id → merges fields into existing entry)
ui_push({ entries: [
    { type: "output.progress", id: "dl-1", value: 75 }
] })

// Mark as complete
ui_push({ entries: [
    { type: "output.progress", id: "dl-1", completed: true, label: "Download complete!" }
] })
```

This works for **any entry type** — not just progress bars. Use it to update diagrams, tables, or text blocks without creating duplicates. Generate unique IDs yourself (e.g., `"my-diagram"`, `"status-1"`) for entries you plan to update later.

## When to Use `ui_push` vs `create_page`

| Scenario | Use |
|----------|-----|
| Show status, progress, results | `ui_push` with log entries |
| Ask user a question | `ui_push` with dialog entries |
| Show data that user will edit | `create_page` with appropriate editor |
| Open a file in a specific editor | `create_page` or `execute_script` |

## Errors & verification

- **Dialogs wait forever.** A `ui_push` containing dialog entries has **no timeout** — the call
  blocks until the user responds (or closes the Log View page, which resolves every pending
  dialog with `button: null`). A long wait means the user hasn't answered yet, not a hang.
  Don't stack questions the user might never see; one dialog at a time reads better.
- **Non-dialog pushes** use the standard ~30 s tool timeout; they return `{ }` immediately in
  practice.
- **Which window?** The Log View page lives in the window addressed by `windowIndex` (the
  first open window when omitted). With multiple windows, pass `windowIndex` consistently or
  your log entries will split across two Log View pages.
- **Malformed entries fail loudly** with a message that includes the expected shape and an
  example (e.g. `output.grid requires 'content' field (JSON string or CSV string). Example: …`)
  — fix the entry per the message; nothing was appended.
- **Treat `button: null` as "cancelled"**, never as consent — the user closed the page without
  answering.
