[← API Reference](./index.md)

# ui (Log View)

The `ui` global provides logging and interactive dialogs via a Log View page. It is **lazy-initialized**: the Log View page is created when the script first accesses `ui`, and is auto-grouped with the source page.

Accessing `ui` automatically suppresses default script output (same as calling `preventOutput()`).

```javascript
ui.log("Starting process...");
ui.info("Loaded 42 items");
ui.success("Done!");
```

## await ui()

Call `await ui()` to yield to the event loop, allowing the UI to update. Use this inside long-running loops to prevent the interface from freezing:

```javascript
for (const item of largeArray) {
    // ... heavy processing ...
    await ui(); // let the UI breathe
}
```

This does not create a Log View page or suppress default output — it simply pauses execution briefly so the UI can repaint and respond to user input.

## Logging Methods

All logging methods accept either a plain string or an array of styled segments (see [Styled Text](#styled-text) below). They return a `StyledLogBuilder` that can optionally be used to build styled text via fluent chaining (see [Fluent Styled Text](#fluent-styled-text) below).

### log(message)

Log a message with lighter text, suitable for secondary or supplementary output.

```javascript
ui.log("Plain message");
```

### info(message)

Log an informational message (highlighted).

```javascript
ui.info("Processing started");
```

### warn(message)

Log a warning message.

```javascript
ui.warn("File is larger than expected");
```

### error(message)

Log an error message.

```javascript
ui.error("Failed to connect");
```

### success(message)

Log a success message.

```javascript
ui.success("All tests passed");
```

### text(message)

Log a message with normal text color. Unlike `log()` which uses lighter text, `text()` renders at full contrast.

### clear()

Remove all log entries from the Log View.

```javascript
ui.clear();
```

## Console Forwarding

When a script accesses `ui`, all `console` output is automatically forwarded to the Log View:

| Console method | Log View level | Appearance |
|----------------|---------------|------------|
| `console.log()` | `log.log` | Lighter text (same as `ui.log()`) |
| `console.info()` | `log.info` | Highlighted |
| `console.warn()` | `log.warn` | Warning style |
| `console.error()` | `log.error` | Error style |

The native console is always called as well — forwarding adds a Log View entry on top.

To suppress forwarding for specific levels, call these methods on `ui`:

```javascript
ui.preventConsoleLog();   // suppress console.log → Log View
ui.preventConsoleWarn();  // suppress console.warn → Log View
ui.preventConsoleError(); // suppress console.error → Log View
```

Each method suppresses forwarding for its level only; the native console call is unaffected.

For **MCP scripts** that use `ui`, console output goes to both the MCP response (`consoleLogs`) and the shared MCP Log View.

## Styled Text

There are two ways to create styled text in Log View: the **array syntax** and the **fluent builder**.

### Array Syntax

Any logging method can accept an array of styled segments instead of a plain string. Each segment has a `text` property and an optional `styles` object with CSS properties:

```javascript
ui.log([
    { text: "Status: " },
    { text: "OK", styles: { color: "#4caf50", fontWeight: "bold" } },
]);

ui.log([
    { text: "Error code: ", styles: { color: "#888" } },
    { text: "404", styles: { color: "red", fontWeight: "bold" } },
]);
```

### Fluent Styled Text

All logging methods (`ui.log()`, `ui.info()`, `ui.warn()`, `ui.error()`, `ui.success()`, `ui.text()`) return a `StyledLogBuilder`. You can chain styling methods on it and call `.print()` to update the log entry with the styled result:

```javascript
ui.log("Status: ")
    .append("OK").color("lime").bold()
    .append(" — all checks passed")
    .print();

ui.error("Failed: ")
    .append("connection timeout").italic()
    .print();

ui.info("Build ")
    .append("SUCCESS").color("lime").bold().background("#1a3a1a")
    .print();
```

If you don't call `.print()`, the entry keeps the initial plain text — so existing code that ignores the return value works exactly as before.

#### Builder methods

| Method | Description |
|--------|-------------|
| `.append(text?)` | Append a new text segment |
| `.color(color)` | Set text color of the current segment |
| `.background(color)` | Set background color (with padding and border-radius) |
| `.border(color)` | Add a border around the current segment |
| `.fontSize(size)` | Set font size (`string` or `number`) |
| `.bold()` | Bold the current segment |
| `.italic()` | Italicize the current segment |
| `.underline()` | Underline the current segment |
| `.style(styles)` | Apply arbitrary CSS styles (`Record<string, string \| number>`) |
| `.print()` | Finalize and update the log entry |

## `styledText()` Global

The `styledText(text)` global function creates a standalone styled text builder for use in dialog labels and anywhere styled text is accepted. It returns a `StyledTextBuilder` (same methods as above, without `.print()`). Access the built value via `.value`:

```javascript
// Styled dialog label
const label = styledText("Warning").color("red").bold()
    .append(": this action is irreversible").value;
await ui.dialog.confirm(label);

// Styled dialog title
const title = styledText("Enter ").append("server name").bold().underline().value;
await ui.dialog.textInput(title);
```

## Dialogs

The `ui.dialog` namespace provides interactive dialogs that appear inline in the Log View. All dialog methods return a `Promise<IDialogResult>` where:

- `result.button` — the label of the clicked button, or `undefined` if the dialog was canceled (e.g., the Log View page was closed)

All dialog methods support two calling styles: a **simple form** with positional arguments and a **full form** with a single options object.

### dialog.confirm(message, buttons?)
### dialog.confirm(options)

Show a confirmation dialog. Default buttons: `["No", "Yes"]`.

```javascript
// Simple form — positional arguments
const result = await ui.dialog.confirm("Delete all items?");
if (result.button === "Yes") {
    deleteAll();
}

// Simple form — custom buttons
const result = await ui.dialog.confirm("Save changes?", ["Save", "Discard", "Cancel"]);
if (result.button === "Save") { save(); }

// Full form — single options object
const result = await ui.dialog.confirm({
    message: "Delete all items?",
    buttons: ["Yes", "No"],
});
```

### dialog.buttons(buttons, title?)
### dialog.buttons(options)

Show a dialog with custom buttons. The title is optional and supports styled text.

```javascript
// Simple form
const result = await ui.dialog.buttons(
    ["Option A", "Option B", "Cancel"],
    "Choose an option"
);
if (result.button === "Option A") { /* ... */ }

// Full form
const result = await ui.dialog.buttons({
    buttons: ["Option A", "Option B", "Cancel"],
    title: "Choose an option",
});
```

### dialog.textInput(title?, options?)
### dialog.textInput(options)

Show a text input dialog. The entered text is available in `result.text`. Default buttons: `["OK"]`.

Options:
- `title?: string` — dialog title (supports styled text)
- `placeholder?: string` — placeholder text
- `defaultValue?: string` — initial value
- `buttons?: string[]` — button labels (prefix with `!` to require non-empty input)

```javascript
// Simple form
const result = await ui.dialog.textInput("Enter your name", {
    placeholder: "Name...",
    defaultValue: "World",
    buttons: ["!OK", "Cancel"],
});
if (result.button === "OK") {
    ui.log(`Hello, ${result.text}!`);
}

// Full form — all options in one object
const result = await ui.dialog.textInput({
    title: "Enter your name",
    placeholder: "Name...",
    defaultValue: "World",
    buttons: ["!OK", "Cancel"],
});
```

The `!` prefix on a button label (e.g., `"!OK"`) disables that button until the user has entered text. The prefix is not included in `result.button`.

### dialog.checkboxes(items, title?, buttons?)
### dialog.checkboxes(options)

Show a checkboxes dialog. The updated checkbox state is available in `result.items`. Default buttons: `["OK"]`.

Items can be plain strings (treated as unchecked) or objects with `label` and optional `checked` properties.

Options:
- `items: (string | { label, checked? })[]` — checkbox items
- `title?: string` — dialog title (supports styled text)
- `layout?: "vertical" | "flex"` — layout mode (`"vertical"` = one item per row, `"flex"` = items wrap horizontally; default: `"vertical"`)
- `buttons?: string[]` — button labels (prefix with `!` to require at least one checked item)

```javascript
// Simple form — array of strings
const result = await ui.dialog.checkboxes(["Option A", "Option B", "Option C"]);
if (result.button === "OK") {
    const selected = result.items.filter(i => i.checked).map(i => i.label);
    ui.log(`Selected: ${selected.join(", ")}`);
}

// Simple form — with title and buttons
const result = await ui.dialog.checkboxes(
    ["Feature 1", "Feature 2", "Feature 3"],
    "Select features",
    ["!Apply", "Cancel"]
);

// Full form — pre-checked items, flex layout
const result = await ui.dialog.checkboxes({
    items: [
        { label: "Enable logging", checked: true },
        { label: "Verbose mode" },
        { label: "Dry run", checked: true },
    ],
    title: "Configuration",
    layout: "flex",
    buttons: ["!Apply", "Cancel"],
});
if (result.button === "Apply") {
    for (const item of result.items) {
        ui.log(`${item.label}: ${item.checked ? "on" : "off"}`);
    }
}
```

The `!` prefix on a button label (e.g., `"!Apply"`) disables that button until at least one checkbox is checked. The prefix is not included in `result.button`.

### dialog.radioboxes(items, title?, buttons?)
### dialog.radioboxes(options)

Show a radio buttons dialog for single-selection. The selected item label is available in `result.checked`. Default buttons: `["OK"]`.

Items are plain strings (unlike checkboxes, no object form).

Options:
- `items: string[]` — radio button items
- `title?: string` — dialog title (supports styled text)
- `checked?: string` — pre-selected item label
- `layout?: "vertical" | "flex"` — layout mode (`"vertical"` = one item per row, `"flex"` = items wrap horizontally; default: `"vertical"`)
- `buttons?: string[]` — button labels (prefix with `!` to require a selection)

```javascript
// Simple form — array of strings
const result = await ui.dialog.radioboxes(["Option A", "Option B", "Option C"]);
if (result.button === "OK") {
    ui.log(`Selected: ${result.checked}`);
}

// Simple form — with title and buttons
const result = await ui.dialog.radioboxes(
    ["Small", "Medium", "Large"],
    "Select size",
    ["!OK", "Cancel"]
);

// Full form — pre-selected item, flex layout
const result = await ui.dialog.radioboxes({
    items: ["Small", "Medium", "Large"],
    title: "Select size",
    checked: "Medium",
    layout: "flex",
    buttons: ["!Apply", "Cancel"],
});
if (result.button === "Apply") {
    ui.log(`Size: ${result.checked}`);
}
```

The `!` prefix on a button label (e.g., `"!Apply"`) disables that button until an item is selected. The prefix is not included in `result.button`.

### dialog.select(items, title?, buttons?)
### dialog.select(options)

Show a dropdown select dialog. The selected item label is available in `result.selected`. Default buttons: `["OK"]`.

The dropdown supports search/filter and keyboard navigation.

Options:
- `items: string[]` — selectable items
- `title?: string` — dialog title (supports styled text)
- `selected?: string` — pre-selected item label
- `placeholder?: string` — placeholder text when no item is selected
- `buttons?: string[]` — button labels (prefix with `!` to require a selection)

```javascript
// Simple form — array of strings
const result = await ui.dialog.select(["Option A", "Option B", "Option C"]);
if (result.button === "OK") {
    ui.log(`Selected: ${result.selected}`);
}

// Simple form — with title and buttons
const result = await ui.dialog.select(
    ["Small", "Medium", "Large"],
    "Select size",
    ["!OK", "Cancel"]
);

// Full form — pre-selected item with placeholder
const result = await ui.dialog.select({
    items: ["Small", "Medium", "Large"],
    title: "Select size",
    selected: "Medium",
    placeholder: "Choose a size...",
    buttons: ["!Apply", "Cancel"],
});
if (result.button === "Apply") {
    ui.log(`Size: ${result.selected}`);
}
```

The `!` prefix on a button label (e.g., `"!Apply"`) disables that button until an item is selected. The prefix is not included in `result.button`.

## Progress Bars

The `ui.show` namespace provides rich output display methods for the Log View, including progress bars and inline data grids.

### show.progress(label?)
### show.progress(options)

Show a progress bar in the Log View. Returns a `Progress` helper whose property setters update the bar in real-time.

```javascript
// Simple form — just a label
const progress = ui.show.progress("Downloading...");
progress.max = 100;
for (let i = 0; i <= 100; i += 10) {
    await delay(200);
    progress.value = i;
}
progress.completed = true;
progress.label = "Done!";
```

```javascript
// Full form — initial values
const progress = ui.show.progress({
    label: "Processing files",
    value: 0,
    max: 50,
});
```

#### Progress properties

| Property | Type | Description |
|----------|------|-------------|
| `label` | `string \| IStyledSegment[]` | Progress label (supports styled text). Setting updates the displayed progress overlay in real time. |
| `value` | `number \| undefined` | Current progress value |
| `max` | `number \| undefined` | Maximum value (default: 100) |
| `completed` | `boolean \| undefined` | When `true`, shows the bar as fully completed |

#### completeWithPromise(promise, completeLabel?)

Mark the progress bar as completed when a promise settles. Optionally update the label on completion.

```javascript
const progress = ui.show.progress("Loading data...");
progress.completeWithPromise(
    fetchData(),
    styledText("Loaded!").color("green").value
);
```

## Grid Output

### show.grid(data)
### show.grid(options)

Show an inline data grid in the Log View. Returns a `Grid` helper whose property setters update the grid in real-time.

The grid supports column resizing, column reordering, and cell selection with copy-to-clipboard. A hover toolbar shows an "Open in Grid editor" button.

```javascript
// Simple form — array of objects
const grid = ui.show.grid([
    { name: "Alice", age: 30, city: "NYC" },
    { name: "Bob", age: 25, city: "LA" },
]);
```

```javascript
// Full form — with columns and title
const grid = ui.show.grid({
    data: users,
    columns: ["name", "age"],
    title: "User List",
});
```

```javascript
// Column objects with custom widths and data types
const grid = ui.show.grid({
    data: records,
    columns: [
        { key: "name", title: "Full Name", width: 200 },
        { key: "age", dataType: "number" },
        { key: "active", dataType: "boolean" },
    ],
    title: styledText("Results").bold().value,
});
```

#### Grid properties

| Property | Type | Description |
|----------|------|-------------|
| `data` | `any[]` | Grid data (array of objects). Setting updates the displayed grid in real time. |
| `columns` | `(string \| IGridColumn)[] \| undefined` | Column definitions — strings (key names) or column objects. Setting updates the displayed grid columns in real time. |
| `title` | `string \| IStyledSegment[] \| undefined` | Grid title (supports styled text). Setting updates the displayed grid title in real time. |

#### IGridColumn

| Property | Type | Description |
|----------|------|-------------|
| `key` | `string` | Property key to access from row objects |
| `title` | `string \| undefined` | Display name in header (defaults to key) |
| `width` | `number \| undefined` | Column width in pixels |
| `dataType` | `"string" \| "number" \| "boolean" \| undefined` | Data type for sorting/alignment |

#### openInEditor(pageTitle?)

Open the grid data in a dedicated Grid editor tab for full sorting, filtering, and editing capabilities.

```javascript
const grid = ui.show.grid(data);
// Later — open in a full Grid editor
grid.openInEditor("My Data");
```

## Text Output

### show.text(text, language?)
### show.text(options)

Show a syntax-highlighted text block in the Log View using an embedded read-only Monaco editor. Returns a `Text` helper whose property setters update the entry in real-time.

```javascript
// Simple form — text and language
const txt = ui.show.text("SELECT * FROM users WHERE active = 1;", "sql");
```

```javascript
// Full form — with title and options
const txt = ui.show.text({
    text: jsonData,
    language: "json",
    title: "API Response",
    wordWrap: false,
    lineNumbers: true,
});
```

#### Text properties

| Property | Type | Description |
|----------|------|-------------|
| `text` | `string` | The text content. Setting updates the displayed text in real time. |
| `language` | `string \| undefined` | Language for syntax highlighting (default: `"plaintext"`). Setting updates syntax highlighting in real time. |
| `title` | `string \| IStyledSegment[] \| undefined` | Title displayed above the text (supports styled text). Setting updates the displayed text title in real time. |
| `wordWrap` | `boolean \| undefined` | Enable word wrap (default: `true`). Setting updates line wrapping in real time. |
| `lineNumbers` | `boolean \| undefined` | Show line numbers (default: `false`). Setting updates the line-number display in real time. |
| `minimap` | `boolean \| undefined` | Show minimap (default: `false`). Setting updates the minimap display in real time. |

#### openInEditor(pageTitle?)

Open the text in a new Monaco editor tab.

```javascript
const txt = ui.show.text(sourceCode, "typescript");
// Later — open in a full editor tab
txt.openInEditor("Source Code");
```

## Markdown Output

### show.markdown(text)
### show.markdown(options)

Show rendered markdown inline in the Log View. Supports headings, tables, code blocks, Mermaid diagrams, task lists, and blockquotes. Returns a `Markdown` helper whose property setters update the entry in real-time.

A hover toolbar shows an "Open in Markdown editor" button.

```javascript
// Simple form — markdown string
ui.show.markdown("# Hello\nSome **bold** text and a [link](https://example.com)");
```

```javascript
// Full form — with title
const md = ui.show.markdown({
    text: "## Report\n\n| Name | Score |\n|------|-------|\n| Alice | 95 |",
    title: "Analysis Results",
});
```

```javascript
// Table with Mermaid diagram
ui.show.markdown(`
## Architecture

\`\`\`mermaid
graph LR
    A[Client] --> B[Server]
    B --> C[Database]
\`\`\`

### Task List

- [x] Design API
- [ ] Implement endpoints
- [ ] Write tests
`);
```

#### Markdown properties

| Property | Type | Description |
|----------|------|-------------|
| `text` | `string` | Markdown text content. Setting updates the rendered Markdown in real time. |
| `title` | `string \| IStyledSegment[] \| undefined` | Title displayed above the markdown (supports styled text). Setting updates the displayed Markdown title in real time. |

#### openInEditor(pageTitle?)

Open the markdown in a dedicated Markdown editor tab.

```javascript
const md = ui.show.markdown("# My Document\nContent here...");
// Later — open in a full Markdown editor tab
md.openInEditor("My Document");
```

## Mermaid Output

### show.mermaid(text)
### show.mermaid(options)

Show a rendered Mermaid diagram inline in the Log View. The diagram is theme-aware — it automatically adapts to the current light/dark theme. Returns a `Mermaid` helper whose property setters update the entry in real-time.

A hover toolbar shows "Copy image to clipboard" and "Open in Mermaid editor" buttons.

```javascript
// Simple form — mermaid text
ui.show.mermaid("graph TD\n    A[Start] --> B[Process]\n    B --> C[End]");
```

```javascript
// Full form — with title
const diagram = ui.show.mermaid({
    text: "sequenceDiagram\n    Alice->>Bob: Hello\n    Bob-->>Alice: Hi!",
    title: "Communication Flow",
});
```

#### Mermaid properties

| Property | Type | Description |
|----------|------|-------------|
| `text` | `string` | Mermaid diagram text. Setting updates the rendered Mermaid diagram in real time. |
| `title` | `string \| IStyledSegment[] \| undefined` | Title displayed above the diagram (supports styled text). Setting updates the displayed diagram title in real time. |

#### openInEditor(pageTitle?)

Open the diagram in a dedicated Mermaid editor tab.

```javascript
const diagram = ui.show.mermaid("graph LR\n    A --> B --> C");
// Later — open in a full Mermaid editor tab
diagram.openInEditor("My Diagram");
```

## Log View output for MCP agents

The same Log View is available to external AI agents through the `pages.logView` call path. While
scripts use the `ui` global, agents use `pages.logView.push(entries)` to show status, results,
rich output, and questions.

### How it works

- The first push creates a Log View page; later pushes reuse it and append entries.
- `push()` returns immediately with `entryIds` and `dialogIds`.
- Read `pages.logView.dialogResult(id)` to check a dialog: it reports `unresolved` until the
  user responds, then `resolved` with the result. The live app window may be driven through
  `window.screen.snapshot()` and `window.screen.click(...)` when an answer is needed.
- If the page is closed, the next push creates a fresh Log View page.

### Entry format

The `entries` argument is an array. Each element is either a string (treated as `log.info`) or
a flat object with `type` and type-specific fields directly on the object.

**Log entry types:** `log.text`, `log.info`, `log.warn`, `log.error`, `log.success` use a
`text` field.

**Dialog entry types:** `input.confirm`, `input.text`, `input.buttons`,
`input.checkboxes`, `input.radioboxes`, and `input.select` use fields such as `message`,
`title`, `buttons`, `placeholder`, `defaultValue`, `items`, `checked`, `selected`,
and `layout`.

**Output entry types:** `output.progress` supports `label`, `value`, `max` (default 100), and
`completed`; reuse its `id` to update a progress bar. `output.grid` supports JSON or CSV
`content`, optional `contentType`, and `title`. `output.text`, `output.markdown`, and
`output.mermaid` support `text` and their corresponding display options.

### Example

```javascript
const { dialogIds } = await app.call("pages.logView.push", {
    args: [[
        { type: "log.success", text: "Analysis complete" },
        { type: "output.grid", content: "name,score\nAlice,95", contentType: "csv" },
        { type: "output.progress", id: "work", value: 100, completed: true },
        { type: "input.confirm", message: "Clear the temporary report?", buttons: ["No", "Yes"] },
    ]],
});
const answer = await app.call("pages.logView.dialogResult", { args: [dialogIds[0]] });
```

See the [MCP Server Setup](../mcp-setup.md#available-tools) and the [scripting API](./app.md#callpath-options)
for the complete call-path contract.

## Example: Interactive Script

```javascript
ui.info("Welcome to the data processor");

const result = await ui.dialog.confirm("Process the current page content?");
if (result.button !== "Yes") {
    ui.warn("Canceled by user");
    return;
}

const data = JSON.parse(page.content);
ui.log(`Found ${data.length} records`);

for (const item of data) {
    if (item.error) {
        ui.error(`Record ${item.id}: ${item.error}`);
    } else {
        ui.success(`Record ${item.id}: OK`);
    }
}

ui.success("Processing complete!");
```


