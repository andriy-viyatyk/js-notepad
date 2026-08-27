import type React from "react";

// --- Types ---

export interface TagsInputProps
    extends Omit<
        React.HTMLAttributes<HTMLDivElement>,
        "style" | "className" | "onChange"
    > {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances in DOM inspector output. Never used for styling. */
    name?: string;
    /** Current tags (the primary value). */
    value: string[];
    /** Called with the next tags array after add or remove. */
    onChange: (tags: string[]) => void;
    /** Available tags fed to the autocomplete (PathInput `paths`). Default: []. */
    items?: string[];
    /** Path separator for autocomplete + trimmed from typed values. Default: ":". */
    separator?: string;
    /** Max depth for autocomplete suggestions. Default: 1. */
    maxDepth?: number;
    /** Placeholder for the add-tag input. Default: "Type + Enter to add". */
    placeholder?: string;
    /** Tag visual variant. Default: "filled". */
    tagVariant?: "filled" | "outlined";
    /** Size — applied to both rendered tags and the inline input. Default: "md". */
    size?: "sm" | "md";
    /** Disabled state — input and remove buttons inert. Default: false. */
    disabled?: boolean;
    /** Read-only — show tags without remove buttons; hide the add-tag input. Default: false. */
    readOnly?: boolean;
    "aria-label"?: string;
}
