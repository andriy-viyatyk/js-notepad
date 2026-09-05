[← API Reference](./index.md)

# app.ui

Dialogs, toast notifications, progress indicators, and app-window highlights.

```javascript
const answer = await app.ui.confirm("Save changes?");
if (answer === "Yes") { /* save */ }

app.ui.notify("Done!", "success");
```

## Methods

### confirm(message, options?) → `Promise<string | null>`

Show a confirmation dialog. Returns the clicked button label, or `null` if dismissed.

Options:
- `title?: string` — dialog title (default: `"Confirmation"`)
- `buttons?: string[]` — button labels (default: `["Yes", "Cancel"]`)

```javascript
// Simple yes/no
const answer = await app.ui.confirm("Delete this file?");
if (answer === "Yes") { /* delete */ }

// Custom buttons
const choice = await app.ui.confirm("Save changes?", {
    title: "Unsaved Changes",
    buttons: ["Save", "Discard", "Cancel"]
});
```

### input(message, options?) → `Promise<IInputResult | null>`

Show an input dialog. Returns `{ value, button }`, or `null` if dismissed.

Options:
- `title?: string` — dialog title (default: `"Input"`)
- `value?: string` — initial value (default: `""`)
- `buttons?: string[]` — button labels (default: `["OK", "Cancel"]`)
- `selectAll?: boolean` — select all text on open (default: `false`)

```javascript
const result = await app.ui.input("Enter file name:", {
    value: "untitled.txt",
    selectAll: true
});
if (result) {
    console.log(result.value);   // what user typed
    console.log(result.button);  // "OK"
}
```

### password(options?) → `Promise<string | null>`

Show a password dialog. Returns the entered password, or `null` if dismissed.

Options:
- `mode?: "encrypt" | "decrypt"` — `"encrypt"` shows a confirm field (default: `"decrypt"`)

```javascript
// Ask for password to decrypt
const password = await app.ui.password();

// Ask for new password (with confirmation)
const password = await app.ui.password({ mode: "encrypt" });
```

### textDialog(options) → `Promise<ITextDialogResult | null>`

Show a dialog with a Monaco editor. Useful for displaying large text, error details, or getting multi-line input. Returns `{ text, button }`, or `null` if dismissed.

Options:
- `title?: string` — dialog title (default: `""`)
- `text?: string` — initial text content (default: `""`)
- `buttons?: string[]` — button labels (default: `["OK"]`)
- `readOnly?: boolean` — whether text is read-only (default: `true`)
- `width?: number` — dialog width in pixels
- `height?: number` — dialog height in pixels
- `options?: ITextDialogEditorOptions` — Monaco editor options:
  - `language?: string` — language for syntax highlighting (default: `"plaintext"`)
  - `wordWrap?: "on" | "off" | "wordWrapColumn" | "bounded"` — word wrap mode (default: `"on"`)
  - `minimap?: boolean` — show minimap (default: `false`)
  - `lineNumbers?: "on" | "off" | "relative" | "interval"` — line numbers display (default: `"off"`)

```javascript
// Read-only display (e.g., error details)
await app.ui.textDialog({ title: "Error Details", text: errorStack });

// Editable with syntax highlighting
const result = await app.ui.textDialog({
    title: "Edit SQL",
    text: "SELECT * FROM users",
    readOnly: false,
    buttons: ["Execute", "Cancel"],
    options: { language: "sql" },
});
if (result?.button === "Execute") {
    // use result.text
}

// Large dialog with line numbers
await app.ui.textDialog({
    title: "Log Output",
    text: logContent,
    width: 900,
    height: 600,
    options: { lineNumbers: "on", wordWrap: "off" },
});
```

### showProgress(promise, label?) → `Promise<T>`

Show a blocking overlay with a spinner while a promise is in progress. The overlay appears after a 300ms debounce (so fast operations never show it) and auto-closes when the promise resolves or rejects.

```javascript
// Simple usage — overlay appears if the fetch takes longer than 300ms
const data = await app.ui.showProgress(
    fetch("https://api.example.com/data").then(r => r.json()),
    "Loading data..."
);

// Without label
const result = await app.ui.showProgress(longRunningOperation());
```

### createProgress(label?) → `IProgressHandle`

Create a reusable progress handle for multi-step workflows. The handle has an updatable `.label` property and a `.show(promise)` method.

Returns `{ label: string, show(promise): Promise<T> }`.

```javascript
const progress = app.ui.createProgress("Step 1 of 3...");
await progress.show(stepOne());

progress.label = "Step 2 of 3...";
await progress.show(stepTwo());

progress.label = "Step 3 of 3...";
await progress.show(stepThree());
```

### notifyProgress(label, timeout?) → `void`

Show a brief non-blocking notification toast for background progress. Disappears automatically after the timeout (default varies).

```javascript
// Brief toast — does not block the UI
app.ui.notifyProgress("Syncing files...");

// Custom timeout in milliseconds
app.ui.notifyProgress("Uploading...", 5000);
```

### addScreenLock() → `{ release() }`

Manually lock the screen with an overlay (no spinner). Returns a handle with a `release()` method to remove the lock. Useful when you need to prevent user interaction during a sequence of operations that aren't wrapped in a single promise.

```javascript
const lock = app.ui.addScreenLock();
try {
    await doSomething();
    await doSomethingElse();
} finally {
    lock.release();
}
```

### highlightElement(selector, text?, options?) → `Promise<IHighlightResult>`

Draw an explanatory highlight over an element in Persephone's own window. The promise resolves
once the overlay has been drawn; it does not wait for the user to dismiss the highlight. The user
can close it with the card's **Close** button or `Esc`, or a script can remove it with
`clearHighlights()`.

```javascript
const result = await app.ui.highlightElement(
    '[data-name="mcp-indicator"]',
    "This shows the MCP server status and opens its request log.",
    { title: "MCP server" },
);
if (!result.found) console.log("The control is not currently visible.");
```

The result includes `id`, `found`, `count`, `highlighted`, and `selector`. A selector that matches
nothing returns `found: false` rather than throwing. Options include `title`, `all`, `scroll`, and
`id`; see the TypeScript definitions for their exact behavior.

### clearHighlights(id?) → `Promise<number>`

Remove one highlight by its `id`, or all highlights when omitted. Returns the number removed.

### notify(message, type?) → `Promise<string | undefined>`

Show a toast notification. Returns `"clicked"` if the user clicks it, or `undefined` if dismissed.

Type: `"info"` (default) · `"success"` · `"warning"` · `"error"`

```javascript
// Fire and forget
app.ui.notify("File saved", "success");
app.ui.notify("Something went wrong", "error");

// Wait for user interaction
const result = await app.ui.notify("Click to open log", "info");
if (result === "clicked") {
    await app.pages.openFile("C:/logs/app.log");
}
```
