import { csvToRecords } from "../../core/utils/csv-utils";
import type { StyledText } from "../../editors/log-view/logTypes";

export interface DialogSpec {
    readonly props: ReadonlySet<string>;
    readonly required?: string;
    readonly usage: string;
}

export const DIALOG_SPECS: Readonly<Record<string, DialogSpec>> = {
    "input.confirm": {
        props: new Set(["id", "message", "buttons"]),
        required: "message",
        usage: '{ type: "input.confirm", message: "Continue?", buttons: ["No", "Yes"] }',
    },
    "input.text": {
        props: new Set(["id", "title", "placeholder", "defaultValue", "buttons"]),
        usage: '{ type: "input.text", title: "Enter name", placeholder: "Name...", buttons: ["Cancel", "OK"] }',
    },
    "input.buttons": {
        props: new Set(["id", "title", "buttons"]),
        required: "buttons",
        usage: '{ type: "input.buttons", title: "Choose action", buttons: ["Save", "Discard", "Cancel"] }',
    },
    "input.checkboxes": {
        props: new Set(["id", "title", "items", "layout", "buttons"]),
        required: "items",
        usage: '{ type: "input.checkboxes", title: "Select", items: [{ label: "A", checked: true }, { label: "B" }], buttons: ["Cancel", "OK"] }',
    },
    "input.radioboxes": {
        props: new Set(["id", "title", "items", "checked", "layout", "buttons"]),
        required: "items",
        usage: '{ type: "input.radioboxes", title: "Pick one", items: ["Small", "Medium", "Large"], buttons: ["Cancel", "OK"] }',
    },
    "input.select": {
        props: new Set(["id", "title", "items", "selected", "placeholder", "buttons"]),
        required: "items",
        usage: '{ type: "input.select", title: "Format", items: ["JSON", "CSV", "XML"], placeholder: "Choose...", buttons: ["Cancel", "OK"] }',
    },
};

export class UiPushValidationError extends Error {}

export interface NormalizedUiPushEntry {
    readonly type: string;
    readonly fields: StyledText | Record<string, unknown>;
    readonly isDialog: boolean;
}

/** The log levels the guide documents. Anything else under `log.` is a typo, not a level. */
const KNOWN_LOG_TYPES = new Set(["log.text", "log.info", "log.warn", "log.error", "log.success"]);

/** The rich output entry types the guide documents. */
const KNOWN_OUTPUT_TYPES = new Set([
    "output.text", "output.markdown", "output.mermaid", "output.grid", "output.progress",
]);

/** Every entry type a caller may legitimately push, for the strict path's error message. */
function knownEntryTypes(): string {
    return [...KNOWN_LOG_TYPES, ...KNOWN_OUTPUT_TYPES, ...Object.keys(DIALOG_SPECS)].join(", ");
}

/**
 * Normalize one Log View-compatible entry, preserving its established validation rules.
 *
 * `strictTypes` rejects an entry type that is not one of the documented ones. The Log View call
 * does **not** pass it, so that tool's behaviour is unchanged; `pages.logView.push` does.
 *
 * The reason is a real failure, observed in US-1324's acceptance run: a Haiku agent guessed the
 * types `"markdown"` and `"dialog"` instead of `"output.markdown"` and `"input.confirm"`. The
 * lenient fall-through accepted all three, rendered them as **empty** entries, and returned ids —
 * so the agent reported success while the user saw three blank lines. Validation only ever ran for
 * types beginning `input.`, so a guessed type skipped it entirely. A wrong type must fail loudly
 * and name the alternatives.
 */
export function normalizeUiPushEntry(
    raw: unknown,
    options: { readonly strictTypes?: boolean } = {},
): NormalizedUiPushEntry | undefined {
    const entry = typeof raw === "string"
        ? { type: "log.info", text: raw }
        : raw && typeof raw === "object" && !Array.isArray(raw)
            ? raw as Record<string, unknown>
            : undefined;
    if (!entry || !entry.type) return undefined;

    const { type, ...fields } = entry;
    if (typeof type !== "string") return undefined;

    if (options.strictTypes
        && !KNOWN_LOG_TYPES.has(type)
        && !KNOWN_OUTPUT_TYPES.has(type)
        && !(type in DIALOG_SPECS)) {
        throw new UiPushValidationError(
            `Unknown entry type '${type}'. Valid types: ${knownEntryTypes()}. `
            + `A plain string is shorthand for log.info.`,
        );
    }

    if (type.startsWith("input.")) {
        const spec = DIALOG_SPECS[type];
        if (!spec) {
            const validTypes = Object.keys(DIALOG_SPECS).join(", ");
            throw new UiPushValidationError(
                `Unknown dialog type '${type}'. Valid types: ${validTypes}. Read persephone://guides/ui-push for details.`,
            );
        }
        const unknownProps = Object.keys(fields).filter((key) => !spec.props.has(key));
        if (unknownProps.length > 0) {
            throw new UiPushValidationError(
                `Unknown properties for ${type}: ${unknownProps.join(", ")}. Correct usage: ${spec.usage}`,
            );
        }
        if (spec.required && !fields[spec.required]) {
            const requiredType = spec.required === "items" ? "array" : "string";
            throw new UiPushValidationError(
                `${type} requires '${spec.required}' (${requiredType}). Correct usage: ${spec.usage}`,
            );
        }
        if (spec.required === "items" && !Array.isArray(fields.items)) {
            throw new UiPushValidationError(
                `${type} 'items' must be an array. Correct usage: ${spec.usage}`,
            );
        }
        return { type, fields, isDialog: true };
    }

    if (type === "output.grid") {
        if (!fields.content) {
            throw new UiPushValidationError(
                `output.grid requires 'content' field (JSON string or CSV string). Example: { type: "output.grid", content: "[{\"name\":\"A\",\"value\":1}]", title: "My Table" }`,
            );
        }
        if (typeof fields.content !== "string") {
            throw new UiPushValidationError(
                `output.grid 'content' must be a string (JSON array or CSV text), not ${typeof fields.content}. Stringify your data: content: JSON.stringify(data). Example: { type: "output.grid", content: "[{\"name\":\"A\",\"value\":1}]", contentType: "json", title: "My Table" }`,
            );
        }
        const contentType = fields.contentType ?? "json";
        let data: unknown[];
        if (contentType === "csv") {
            data = csvToRecords(fields.content, true, ",");
        } else {
            try {
                data = JSON.parse(fields.content);
            } catch {
                throw new UiPushValidationError(
                    `output.grid 'content' is not valid JSON. Content must be a JSON array string, e.g.: "[{\"name\":\"A\",\"value\":1}]"`,
                );
            }
            if (!Array.isArray(data)) {
                throw new UiPushValidationError(
                    `output.grid 'content' must be a JSON array, got ${typeof data}. Example: "[{\"name\":\"A\",\"value\":1}]"`,
                );
            }
        }
        const { content: _content, contentType: _contentType, ...rest } = fields;
        return { type, fields: { ...rest, data }, isDialog: false };
    }

    if (type.startsWith("output.")) {
        const outputFields = { ...fields };
        if (!outputFields.text && outputFields.content
            && (type === "output.text" || type === "output.markdown" || type === "output.mermaid")) {
            outputFields.text = outputFields.content;
            delete outputFields.content;
        }
        return { type, fields: outputFields, isDialog: false };
    }

    return { type, fields: (fields.text ?? "") as StyledText, isDialog: false };
}
