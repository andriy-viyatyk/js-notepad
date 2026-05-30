import type { StyledSegment, StyledText } from "../../editors/log-view/logTypes";

// =============================================================================
// StyledTextBuilder — fluent API for building styled text
// =============================================================================

/**
 * Fluent builder for StyledText values.
 * Used as a standalone builder via `styledText("text").color("yellow").value`.
 *
 * The builder lazily converts the initial value to an array of StyledSegments
 * when a styling method is first called.
 */
export class StyledTextBuilder {
    value: StyledText;

    constructor(text?: StyledText) {
        this.value = text ?? "";
    }

    /** Ensure value is a mutable StyledSegment array and prepare the last segment. */
    private prepare(): StyledSegment[] {
        if (typeof this.value === "string") {
            this.value = [{ text: this.value, styles: {} }];
        }
        if (this.value.length === 0) {
            this.value.push({ text: "", styles: {} });
        }
        const last = this.value[this.value.length - 1];
        if (!last.styles) {
            last.styles = {};
        }
        return this.value;
    }

    private get lastSegment(): StyledSegment {
        const data = this.prepare();
        return data[data.length - 1];
    }

    /** Append a new text segment. */
    append = (text?: string): this => {
        this.prepare().push({ text: text ?? "", styles: {} });
        return this;
    };

    /** Set text color of the current segment. */
    color = (color: string): this => {
        this.lastSegment.styles.color = color;
        return this;
    };

    /** Set background color of the current segment. */
    background = (color: string): this => {
        const seg = this.lastSegment;
        seg.styles.backgroundColor = color;
        seg.styles.padding = "0 2px";
        seg.styles.borderRadius = 2;
        return this;
    };

    /** Add a border to the current segment. */
    border = (color: string): this => {
        const seg = this.lastSegment;
        seg.styles.border = `1px solid ${color}`;
        seg.styles.borderRadius = 2;
        seg.styles.padding = "0 2px";
        return this;
    };

    /** Set font size of the current segment. */
    fontSize = (size: string | number): this => {
        this.lastSegment.styles.fontSize = size;
        return this;
    };

    /** Underline the current segment. */
    underline = (): this => {
        this.lastSegment.styles.textDecoration = "underline";
        return this;
    };

    /** Italicize the current segment. */
    italic = (): this => {
        this.lastSegment.styles.fontStyle = "italic";
        return this;
    };

    /** Bold the current segment. */
    bold = (): this => {
        this.lastSegment.styles.fontWeight = "bold";
        return this;
    };

    /** Apply arbitrary CSS styles to the current segment. */
    style = (styles: Record<string, string | number>): this => {
        const seg = this.lastSegment;
        seg.styles = { ...seg.styles, ...styles };
        return this;
    };
}

// =============================================================================
// StyledLogBuilder — extends StyledTextBuilder with print() for log entries
// =============================================================================

/**
 * Returned by `ui.log()`, `ui.info()`, etc.
 * Extends StyledTextBuilder with a `print()` method that updates the
 * already-added log entry with the built styled text.
 */
export class StyledLogBuilder extends StyledTextBuilder {
    private readonly _update: (data: StyledText) => void;

    constructor(text: StyledText, update: (data: StyledText) => void) {
        super(text);
        this._update = update;
    }

    /** Finalize the styled text and update the log entry. */
    print = (): void => {
        this._update(this.value);
    };
}

// =============================================================================
// Standalone factory
// =============================================================================

/**
 * Create a standalone styled text builder for use in dialog labels, etc.
 *
 * @example
 * const label = styledText("Warning").color("red").bold().value;
 * await ui.dialog.confirm(label);
 */
export function styledText(text: string): StyledTextBuilder {
    return new StyledTextBuilder(text);
}
