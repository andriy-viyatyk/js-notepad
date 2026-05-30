import type { LogViewEditor } from "../../editors/log-view";
import type { StyledText, ProgressOutputEntry } from "../../editors/log-view/logTypes";

/**
 * Progress helper returned by `ui.show.progress()`.
 * Property setters update the underlying log entry.
 */
export class Progress {
    private _label?: StyledText;
    private _value?: number;
    private _max?: number;
    private _completed?: boolean;

    constructor(
        private readonly entryId: string,
        private readonly vm: LogViewEditor,
        initial: { label?: StyledText; value?: number; max?: number },
    ) {
        this._label = initial.label;
        this._value = initial.value;
        this._max = initial.max;
    }

    private update(): void {
        this.vm.updateEntryById(this.entryId, (draft) => {
            const d = draft as ProgressOutputEntry;
            d.label = this._label;
            d.value = this._value;
            d.max = this._max;
            d.completed = this._completed;
        });
    }

    get label(): StyledText | undefined { return this._label; }
    set label(value: StyledText | undefined) {
        this._label = value;
        this.update();
    }

    get value(): number | undefined { return this._value; }
    set value(value: number | undefined) {
        this._value = value;
        this.update();
    }

    get max(): number | undefined { return this._max; }
    set max(value: number | undefined) {
        this._max = value;
        this.update();
    }

    get completed(): boolean | undefined { return this._completed; }
    set completed(value: boolean | undefined) {
        this._completed = value;
        this.update();
    }

    /**
     * Mark progress as completed when a promise settles.
     * Optionally update the label on completion.
     */
    completeWithPromise(promise: Promise<unknown>, completeLabel?: StyledText): void {
        promise.finally(() => {
            this.completed = true;
            if (completeLabel !== undefined) {
                this.label = completeLabel;
            }
        });
    }
}
