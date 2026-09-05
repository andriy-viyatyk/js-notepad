export interface ITextEditor {
    readonly id: "monaco";
    readonly name: string;
    /** True when the Monaco editor is visible and mounted. The
     *  queue layer defers commands until mount, so this is informational —
     *  consumers no longer need to gate calls on it. */
    readonly editorMounted: boolean;

    /** Get currently selected text, or empty string if no selection. */
    getSelectedText(): Promise<string>;

    /** Scroll to reveal a specific line in the center of the editor. */
    revealLine(lineNumber: number): void;

    /** Highlight all occurrences of text with find-match decorations. */
    setHighlightText(text: string): void;

    /** Get current cursor position. Returns {lineNumber: 1, column: 1} if editor is not mounted. */
    getCursorPosition(): Promise<{ lineNumber: number; column: number }>;

    /** Insert text at current cursor position. */
    insertText(text: string): Promise<void>;

    /** Replace current selection with text. */
    replaceSelection(text: string): Promise<void>;
}
