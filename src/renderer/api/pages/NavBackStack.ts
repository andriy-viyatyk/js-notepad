import type { NavEntry } from "../../../shared/persistence";

/** Back-navigation stack for the Markdown view (oldest first). Pushed by the
 *  Markdown link interceptor, popped by its Back button. Owned by the page so
 *  it survives the editor swaps each in-place navigation creates, and is
 *  persisted in the page descriptor (survives restart + window moves). The
 *  page mirrors the count into its reactive state via `onCountChanged` so the
 *  Back button's visibility can subscribe to it. */
export class NavBackStack {
    private entries: NavEntry[] = [];

    constructor(private readonly onCountChanged: (count: number) => void) {}

    /** Push the document being navigated away from onto the back stack. */
    push(entry: NavEntry): void {
        this.entries.push(entry);
        this.onCountChanged(this.entries.length);
    }

    /** Pop and return the most recent back entry, or undefined when empty. */
    pop(): NavEntry | undefined {
        const entry = this.entries.pop();
        if (entry) this.onCountChanged(this.entries.length);
        return entry;
    }

    /** Seed the stack from a persisted descriptor (restore path). */
    seed(entries: NavEntry[] | undefined): void {
        this.entries = entries ? [...entries] : [];
        this.onCountChanged(this.entries.length);
    }

    /** Snapshot for the page descriptor; undefined when empty. */
    snapshot(): NavEntry[] | undefined {
        return this.entries.length ? [...this.entries] : undefined;
    }
}
