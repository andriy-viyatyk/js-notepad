import type React from "react";
import type { InputProps } from "../Input/Input";

// --- Types ---

export interface DateInputProps
    extends Omit<InputProps, "type" | "value" | "onChange" | "startSlot" | "endSlot" | "tone"> {
    ref?: React.Ref<HTMLInputElement>;
    /** Current value as an ISO `YYYY-MM-DD` string, or "" when unset. */
    value: string;
    /** Change handler — receives the ISO date string (empty string when cleared). */
    onChange?: (value: string) => void;
}

// --- Component ---

/**
 * Native date picker, wrapped as a UIKit primitive.
 *
 * Today it composes {@link Input} with `type="date"`, exposing a string
 * `value`/`onChange` API (ISO `YYYY-MM-DD`); the browser renders the calendar
 * popup. The wrapper exists so a future enhancement (a themed calendar) is a
 * single-file change with no call-site churn — consumers depend on `DateInput`,
 * not on the native control.
 */
