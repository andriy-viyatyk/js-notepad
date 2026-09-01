/**
 * A text segment with optional inline styles.
 *
 * @example
 * ui.log([
 *     { text: "Hello ", styles: { color: "#888" } },
 *     { text: "World", styles: { fontWeight: "bold" } },
 * ]);
 */
export interface IStyledSegment {
    text: string;
    styles?: Record<string, string | number>;
}

/** Text that can be either a plain string or an array of styled segments. */
export type IStyledText = string | IStyledSegment[];

// =============================================================================
// Styled Text Builder
// =============================================================================

/**
 * Fluent builder for styled text. Each method applies to the current (last) segment
 * and returns the builder for chaining.
 *
 * @example
 * ui.text("Hello ")
 *     .append("World").color("yellow").bold()
 *     .append("!").fontSize(18)
 *     .print();
 *
 * @example
 * // Standalone builder for component labels
 * const label = styledText("Warning").color("red").bold().value;
 * await ui.dialog.confirm(label);
 */
export interface IStyledTextBuilder {
    /** The built styled text value. */
    value: IStyledText;

    /** Append a new text segment. */
    append(text?: string): this;
    /** Set text color of the current segment. */
    color(color: string): this;
    /** Set background color of the current segment. */
    background(color: string): this;
    /** Add a border to the current segment. */
    border(color: string): this;
    /** Set font size of the current segment. */
    fontSize(size: string | number): this;
    /** Underline the current segment. */
    underline(): this;
    /** Italicize the current segment. */
    italic(): this;
    /** Bold the current segment. */
    bold(): this;
    /** Apply arbitrary CSS styles to the current segment. */
    style(styles: Record<string, string | number>): this;
}

/**
 * Builder returned by logging methods (`ui.log()`, `ui.info()`, etc.).
 * Extends the styled text builder with a `print()` method to update the entry.
 *
 * @example
 * // Simple usage — entry appears immediately with initial text
 * ui.log("Hello");
 *
 * // Chained usage — build styled text, then update the entry
 * ui.log("Status: ")
 *     .append("OK").color("lime").bold()
 *     .print();
 */
export interface IStyledLogBuilder extends IStyledTextBuilder {
    /** Finalize the styled text and update the log entry. */
    print(): void;
}

// =============================================================================
// Dialog Results
// =============================================================================

/**
 * Result of a dialog interaction.
 * `button` is the label of the clicked button, or `undefined` if the dialog was canceled
 * (e.g., the Log View page was closed while the dialog was pending).
 *
 * The result object also contains all the original data fields passed to the dialog,
 * plus any fields added by user interaction (e.g., `text` for text input dialogs).
 */
export interface IDialogResult {
    button: string | undefined;
    [key: string]: any;
}

// =============================================================================
// Dialog Data Types
// =============================================================================

/** A checkbox item with label and optional checked state. */
export interface ICheckboxItem {
    label: string;
    checked?: boolean;
}

// =============================================================================
// Dialog Namespace
// =============================================================================

export interface IUiDialog {
    /**
     * Show a confirmation dialog with a message and optional custom buttons.
     * Default buttons: ["No", "Yes"].
     *
     * @example
     * // Simple form
     * const result = await ui.dialog.confirm("Delete all items?");
     * const result = await ui.dialog.confirm("Save?", ["Save", "Discard", "Cancel"]);
     *
     * @example
     * // Full form
     * const result = await ui.dialog.confirm({ message: "Delete all items?", buttons: ["Yes", "No"] });
     */
    confirm(message: IStyledText, buttons?: string[]): Promise<IDialogResult>;
    confirm(options: { message: IStyledText; buttons?: string[] }): Promise<IDialogResult>;

    /**
     * Show a dialog with custom buttons. Use `!` prefix to mark a button as requiring input.
     *
     * @example
     * // Simple form
     * const result = await ui.dialog.buttons(["Option A", "Option B", "Cancel"], "Choose");
     *
     * @example
     * // Full form
     * const result = await ui.dialog.buttons({ buttons: ["A", "B"], title: "Choose" });
     */
    buttons(buttons: string[], title?: IStyledText): Promise<IDialogResult>;
    buttons(options: { buttons: string[]; title?: IStyledText }): Promise<IDialogResult>;

    /**
     * Show a text input dialog. Returns the entered text in `result.text`.
     * Default buttons: ["OK"]. Use `!` prefix for buttons that require non-empty input.
     *
     * @example
     * // Simple form
     * const result = await ui.dialog.textInput("Enter name", { placeholder: "Name..." });
     *
     * @example
     * // Full form
     * const result = await ui.dialog.textInput({
     *     title: "Enter name",
     *     placeholder: "Name...",
     *     defaultValue: "World",
     *     buttons: ["!OK", "Cancel"],
     * });
     */
    textInput(title?: IStyledText, options?: {
        placeholder?: string;
        defaultValue?: string;
        buttons?: string[];
    }): Promise<IDialogResult>;
    textInput(options: {
        title?: IStyledText;
        placeholder?: string;
        defaultValue?: string;
        buttons?: string[];
    }): Promise<IDialogResult>;

    /**
     * Show a checkboxes dialog. Returns items with updated `checked` state in `result.items`.
     * Default buttons: ["OK"]. Use `!` prefix for buttons that require at least one checked item.
     *
     * Items can be strings (label only, unchecked) or objects with `label` and optional `checked`.
     *
     * @example
     * // Simple form
     * const result = await ui.dialog.checkboxes(["Option A", "Option B", "Option C"]);
     * const result = await ui.dialog.checkboxes(["A", "B"], "Pick items", ["!OK", "Cancel"]);
     *
     * @example
     * // Full form
     * const result = await ui.dialog.checkboxes({
     *     items: [{ label: "Feature 1", checked: true }, { label: "Feature 2" }],
     *     title: "Select features",
     *     layout: "flex",
     *     buttons: ["!Apply", "Cancel"],
     * });
     *
     * @example
     * if (result.button === "OK") {
     *     const selected = result.items.filter(i => i.checked).map(i => i.label);
     * }
     */
    checkboxes(items: (string | ICheckboxItem)[], title?: IStyledText, buttons?: string[]): Promise<IDialogResult>;
    checkboxes(options: {
        items: (string | ICheckboxItem)[];
        title?: IStyledText;
        layout?: "vertical" | "flex";
        buttons?: string[];
    }): Promise<IDialogResult>;

    /**
     * Show a radio buttons dialog. Returns the selected item in `result.checked`.
     * Default buttons: ["OK"]. Use `!` prefix for buttons that require a selection.
     *
     * @example
     * // Simple form
     * const result = await ui.dialog.radioboxes(["Option A", "Option B", "Option C"]);
     * const result = await ui.dialog.radioboxes(["A", "B", "C"], "Pick one", ["!OK", "Cancel"]);
     *
     * @example
     * // Full form with pre-selected item
     * const result = await ui.dialog.radioboxes({
     *     items: ["Small", "Medium", "Large"],
     *     title: "Select size",
     *     checked: "Medium",
     *     buttons: ["!Apply", "Cancel"],
     * });
     *
     * @example
     * if (result.button === "OK") {
     *     ui.info(`Selected: ${result.checked}`);
     * }
     */
    radioboxes(items: string[], title?: IStyledText, buttons?: string[]): Promise<IDialogResult>;
    radioboxes(options: {
        items: string[];
        title?: IStyledText;
        checked?: string;
        layout?: "vertical" | "flex";
        buttons?: string[];
    }): Promise<IDialogResult>;

    /**
     * Show a dropdown select dialog. Returns the selected item in `result.selected`.
     * Default buttons: ["OK"]. Use `!` prefix for buttons that require a selection.
     * The dropdown supports search/filter and keyboard navigation.
     *
     * @example
     * // Simple form
     * const result = await ui.dialog.select(["Option A", "Option B", "Option C"]);
     * const result = await ui.dialog.select(["A", "B", "C"], "Pick one", ["!OK", "Cancel"]);
     *
     * @example
     * // Full form with pre-selected item
     * const result = await ui.dialog.select({
     *     items: ["Small", "Medium", "Large"],
     *     title: "Select size",
     *     selected: "Medium",
     *     placeholder: "Choose...",
     *     buttons: ["!Apply", "Cancel"],
     * });
     *
     * @example
     * if (result.button === "OK") {
     *     ui.info(`Selected: ${result.selected}`);
     * }
     */
    select(items: string[], title?: IStyledText, buttons?: string[]): Promise<IDialogResult>;
    select(options: {
        items: string[];
        title?: IStyledText;
        selected?: string;
        placeholder?: string;
        buttons?: string[];
    }): Promise<IDialogResult>;
}

// =============================================================================
// Progress Helper
// =============================================================================

/**
 * Progress bar helper returned by `ui.show.progress()`.
 * Update properties to change the progress bar in real-time.
 *
 * @example
 * const progress = ui.show.progress("Loading...");
 * progress.max = 100;
 * for (let i = 0; i <= 100; i += 10) {
 *     await delay(200);
 *     progress.value = i;
 * }
 * progress.completed = true;
 * progress.label = styledText("Done!").color("green").value;
 */
export interface IProgress {
    /** Progress label (supports styled text). */
    label: IStyledText | undefined;
    /** Current progress value. */
    value: number | undefined;
    /** Maximum value (default: 100). */
    max: number | undefined;
    /** When true, shows the bar as fully completed. */
    completed: boolean | undefined;

    /**
     * Mark progress as completed when a promise settles.
     * Optionally update the label on completion.
     */
    completeWithPromise(promise: Promise<any>, completeLabel?: IStyledText): void;
}

// =============================================================================
// Grid Column
// =============================================================================

/** Column definition for grid output. */
export interface IGridColumn {
    /** Property key to access from row objects. */
    key: string;
    /** Display name in header (defaults to key). */
    title?: string;
    /** Column width in pixels. */
    width?: number;
    /** Data type for sorting/alignment. */
    dataType?: "string" | "number" | "boolean";
}

// =============================================================================
// Grid Helper
// =============================================================================

/**
 * Grid helper returned by `ui.show.grid()`.
 * Update properties to change the grid in real-time.
 *
 * @example
 * const grid = ui.show.grid([
 *     { name: "Alice", age: 30 },
 *     { name: "Bob", age: 25 },
 * ]);
 *
 * @example
 * // With columns and title
 * const grid = ui.show.grid({
 *     data: users,
 *     columns: ["name", "age"],
 *     title: "User List",
 * });
 *
 * @example
 * // Column objects with overrides
 * const grid = ui.show.grid({
 *     data: users,
 *     columns: [
 *         { key: "name", width: 200 },
 *         { key: "age", dataType: "number" },
 *     ],
 * });
 *
 * @example
 * // Open in dedicated grid editor
 * grid.openInEditor("My Data");
 */
export interface IGrid {
    /** Grid data (array of objects). Setting updates the displayed grid in real time. */
    data: any[];
    /** Column definitions — strings or objects. Setting updates the displayed grid in real time. */
    columns: (string | IGridColumn)[] | undefined;
    /** Grid title. Setting updates the displayed grid in real time. */
    title: IStyledText | undefined;
    /** Open grid data in a dedicated Grid editor page. */
    openInEditor(pageTitle?: string): void;
}

// =============================================================================
// Text Helper
// =============================================================================

/**
 * Text helper returned by `ui.show.text()`.
 * Update properties to change the text display in real-time.
 *
 * @example
 * const text = ui.show.text("console.log('hello');", "javascript");
 * text.language = "typescript"; // change language
 *
 * @example
 * // Open in a dedicated text editor tab
 * text.openInEditor("My Code");
 */
export interface IText {
    /** Text content. Setting updates the displayed text in real time. */
    text: string;
    /** Syntax highlighting language (e.g., "javascript", "sql", "html"). */
    language: string | undefined;
    /** Text title. Setting updates the displayed text in real time. */
    title: IStyledText | undefined;
    /** Enable word wrapping (default: true). */
    wordWrap: boolean | undefined;
    /** Show line numbers (default: false). */
    lineNumbers: boolean | undefined;
    /** Show minimap (default: false). */
    minimap: boolean | undefined;
    /** Open text in a dedicated Text editor page. */
    openInEditor(pageTitle?: string): void;
}

// =============================================================================
// Markdown Helper
// =============================================================================

/**
 * Markdown helper returned by `ui.show.markdown()`.
 * Update properties to change the markdown display in real-time.
 *
 * @example
 * const md = ui.show.markdown("# Hello\nSome **bold** text");
 * md.text = "# Updated\nNew content";
 *
 * @example
 * // Open in a dedicated Markdown editor tab
 * md.openInEditor("My Document");
 */
export interface IMarkdown {
    /** Markdown text content. Setting updates the rendered Markdown in real time. */
    text: string;
    /** Markdown title. Setting updates the rendered Markdown in real time. */
    title: IStyledText | undefined;
    /** Open markdown in a dedicated Markdown editor page. */
    openInEditor(pageTitle?: string): void;
}

// =============================================================================
// Mermaid Helper
// =============================================================================

/**
 * Mermaid helper returned by `ui.show.mermaid()`.
 * Update properties to change the mermaid diagram in real-time.
 *
 * @example
 * const diagram = ui.show.mermaid("graph TD\n  A[Start] --> B[End]");
 * diagram.text = "graph LR\n  A --> B --> C";
 *
 * @example
 * // Open in a dedicated Mermaid editor tab
 * diagram.openInEditor("My Diagram");
 */
export interface IMermaid {
    /** Mermaid diagram source text. Setting updates the rendered Mermaid diagram in real time. */
    text: string;
    /** Diagram title. Setting updates the rendered Mermaid diagram in real time. */
    title: IStyledText | undefined;
    /** Open mermaid source in a dedicated Mermaid editor page. */
    openInEditor(pageTitle?: string): void;
}

// =============================================================================
// Show Namespace
// =============================================================================

export interface IUiShow {
    /**
     * Show a progress bar in the Log View. Returns a Progress helper
     * whose property setters update the bar in real-time.
     *
     * @example
     * // Simple form — just a label
     * const progress = ui.show.progress("Downloading...");
     *
     * @example
     * // Full form with initial values
     * const progress = ui.show.progress({
     *     label: "Processing files",
     *     value: 0,
     *     max: 50,
     * });
     *
     * @example
     * // Complete on promise resolution
     * const progress = ui.show.progress("Loading data...");
     * progress.completeWithPromise(fetchData(), styledText("Loaded!").color("green").value);
     */
    progress(label?: IStyledText): IProgress;
    progress(options: {
        label?: IStyledText;
        value?: number;
        max?: number;
    }): IProgress;

    /**
     * Show a data grid in the Log View. Returns a Grid helper
     * whose property setters update the grid in real-time.
     *
     * @example
     * // Simple form — array of objects
     * const grid = ui.show.grid([{ name: "Alice", age: 30 }]);
     *
     * @example
     * // Full form with columns and title
     * const grid = ui.show.grid({
     *     data: users,
     *     columns: ["name", "age"],
     *     title: "User List",
     * });
     */
    grid(data: any[]): IGrid;
    grid(options: { data: any[]; columns?: (string | IGridColumn)[]; title?: IStyledText }): IGrid;

    /**
     * Show syntax-highlighted text in the Log View using Monaco editor.
     * Returns a Text helper whose property setters update the display in real-time.
     *
     * @example
     * // Simple form — text with optional language
     * ui.show.text("console.log('hello');", "javascript");
     *
     * @example
     * // Full form with all options
     * const text = ui.show.text({
     *     text: "SELECT * FROM users;",
     *     language: "sql",
     *     title: "Query",
     *     wordWrap: false,
     *     lineNumbers: true,
     * });
     */
    text(text: string, language?: string): IText;
    text(options: {
        text: string;
        language?: string;
        title?: IStyledText;
        wordWrap?: boolean;
        lineNumbers?: boolean;
        minimap?: boolean;
    }): IText;

    /**
     * Show rendered markdown in the Log View. Returns a Markdown helper
     * whose property setters update the display in real-time.
     *
     * @example
     * // Simple form — markdown string
     * ui.show.markdown("# Hello\nSome **bold** text and a [link](https://example.com)");
     *
     * @example
     * // Full form with title
     * const md = ui.show.markdown({
     *     text: "## Report\n\n| Name | Score |\n|------|-------|\n| Alice | 95 |",
     *     title: "Analysis Results",
     * });
     *
     * @example
     * // Open in dedicated Markdown editor
     * md.openInEditor("My Document");
     */
    markdown(text: string): IMarkdown;
    markdown(options: { text: string; title?: IStyledText }): IMarkdown;

    /**
     * Show a rendered mermaid diagram in the Log View. Returns a Mermaid helper
     * whose property setters update the diagram in real-time.
     *
     * @example
     * // Simple form — mermaid source string
     * ui.show.mermaid("graph TD\n  A[Start] --> B[Process] --> C[End]");
     *
     * @example
     * // Full form with title
     * const diagram = ui.show.mermaid({
     *     text: "sequenceDiagram\n  Alice->>Bob: Hello\n  Bob->>Alice: Hi!",
     *     title: "Communication Flow",
     * });
     *
     * @example
     * // Open in dedicated Mermaid editor
     * diagram.openInEditor("My Diagram");
     */
    mermaid(text: string): IMermaid;
    mermaid(options: { text: string; title?: IStyledText }): IMermaid;
}

// =============================================================================
// Main Interface
// =============================================================================

/**
 * Log View UI facade. Available as the global `ui` variable in scripts.
 *
 * The `ui` object is lazy-initialized: the Log View page is created when the script
 * first accesses `ui`. If the script runs in context of a page, the Log View is
 * auto-grouped with that page.
 *
 * @example
 * // Logging
 * ui.log("Hello, world!");
 * ui.info("Processing...");
 * ui.warn("Watch out!");
 * ui.error("Something went wrong");
 * ui.success("Done!");
 *
 * @example
 * // Styled text with fluent builder
 * ui.text("Status: ")
 *     .append("OK").color("lime").bold()
 *     .append(" — all checks passed")
 *     .print();
 *
 * @example
 * // Styled text with array syntax
 * ui.log([
 *     { text: "Status: " },
 *     { text: "OK", styles: { color: "#4caf50", fontWeight: "bold" } },
 * ]);
 *
 * @example
 * // Dialogs
 * const result = await ui.dialog.confirm("Continue?");
 * if (result.button === "Yes") {
 *     const input = await ui.dialog.textInput("Enter value");
 *     if (input.button) {
 *         ui.success(`You entered: ${input.text}`);
 *     }
 * }
 */
export interface IUiLog {
    /**
     * Yield to the event loop, allowing the UI to update.
     * Call `await ui()` periodically in long-running loops to prevent freezing.
     *
     * @example
     * for (const item of largeArray) {
     *     // ... heavy processing ...
     *     await ui(); // let UI breathe
     * }
     */
    (): Promise<void>;

    /** Log a message (default level). Returns a builder for optional styling. */
    log(message: IStyledText): IStyledLogBuilder;
    /** Log an info message. Returns a builder for optional styling. */
    info(message: IStyledText): IStyledLogBuilder;
    /** Log a warning message. Returns a builder for optional styling. */
    warn(message: IStyledText): IStyledLogBuilder;
    /** Log an error message. Returns a builder for optional styling. */
    error(message: IStyledText): IStyledLogBuilder;
    /** Log a success message. Returns a builder for optional styling. */
    success(message: IStyledText): IStyledLogBuilder;
    /** Alias for `log()`. Returns a builder for optional styling. */
    text(message: IStyledText): IStyledLogBuilder;
    /** Remove all log entries. */
    clear(): void;

    /**
     * Prevent `console.log()` and `console.info()` from being forwarded to the Log View.
     * The native browser console is still called — only the Log View forwarding is suppressed.
     * Useful when third-party libraries produce noisy log output.
     */
    preventConsoleLog(): void;

    /**
     * Prevent `console.warn()` from being forwarded to the Log View.
     * The native browser console is still called.
     */
    preventConsoleWarn(): void;

    /**
     * Prevent `console.error()` from being forwarded to the Log View.
     * The native browser console is still called.
     */
    preventConsoleError(): void;

    /** Dialog methods for interactive user input. */
    readonly dialog: IUiDialog;

    /** Rich output display methods. */
    readonly show: IUiShow;
}
