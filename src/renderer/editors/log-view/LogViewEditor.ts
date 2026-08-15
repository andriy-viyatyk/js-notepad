import { TComponentState } from "../../core/state/state";
import type { EditorStateBase } from "../base/EditorModel";
import { TextHostEditorModel } from "../base/TextHostEditorModel";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import { TextFileModel } from "../text/TextEditorModel";
import { tryParseJson } from "../../core/utils/parse-utils";
import { debounce, errMessage } from "../../../shared/utils";
import type { LogEntry, StyledText } from "./logTypes";

export type LogQueueEvent =
    | { type: "focus" }
    | { type: "scrollToBottom" };

export type LogQueueRequest = never;

/**
 * HS1 host-slot shape — only the bounded `showTimestamps` flag rides here.
 * `itemsState` is intentionally NOT in this shape (see task doc Background HS1
 * amendment — per-entry aux state would write-storm openFiles0.json).
 */
interface LogViewSettings {
    showTimestamps?: boolean;
}

export interface LogViewEditorState extends EditorStateBase {
    // HS1 — rides host.editorSettings["log-view"]. Bounded boolean, safe to persist.
    showTimestamps: boolean;
    // Per-item — present on state for in-session reactivity but NOT persisted
    // (neither on descriptor nor host slot). Resets on restart and on
    // Monaco↔LogView switch. Size scales with entry count; persistence would
    // write-storm openFiles0.json.
    itemsState: Record<string, Record<string, unknown>>;
    // View-derived — present on state for reactive read; stripped from
    // getRestoreData per MO5 / GR8 pattern. Recomputed from host content on restore.
    entries: LogEntry[];
    entryCount: number;
    error: string | undefined;
}

export const defaultLogViewEditorState: LogViewEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryView: undefined,
    showTimestamps: false,
    itemsState: {},
    entries: [],
    entryCount: 0,
    error: undefined,
};

export class LogViewEditor extends TextHostEditorModel<LogViewEditorState, void, LogQueueEvent> {
    readonly editorId = "log-view";
    protected readonly displayName = "Log View";

    // LogView-specific private fields (verbatim from today's LogViewModel):
    private pendingDialogs = new Map<string, { resolve: (result: LogEntry) => void }>();
    private nextId = 1;
    private lastLineCount = 0;
    private heightCache = new Map<string, number>();
    private dirtyIndices = new Set<number>();

    readonly typedQueue: ComponentQueue<LogQueueEvent, LogQueueRequest>;

    constructor(state: TComponentState<LogViewEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            LogQueueEvent,
            LogQueueRequest
        >;
    }

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    adoptHost(host: TextFileModel): void {
        super.adoptHost(host);

        // LV4 + LV6 — re-parse incrementally on external content changes; the
        // base's echo guard protects against the editor's own self-writes.
        this.subscribeHostContent((content) => this.loadContentIncremental(content));

        // HS1 — seed `showTimestamps` from host slot (sync, no flicker) and
        // mirror changes back. `itemsState` is intentionally NOT seeded — it's
        // transient per the size carve-out. Slice-subscribe keeps the mirror
        // from firing on `itemsState` mutations (the dominant write source on
        // log pages) — only the bounded boolean actually triggers a host-slot write.
        this.mirrorHostSettings<LogViewSettings>(
            (saved) => {
                if (saved.showTimestamps !== undefined) {
                    this.state.update((s) => {
                        s.showTimestamps = saved.showTimestamps;
                    });
                }
            },
            (s) => ({ showTimestamps: s.showTimestamps }),
            (s) => s.showTimestamps,
        );
    }

    protected onHostAttached(host: TextFileModel): void {
        // Initial parse against the adopted host content (switch/restore/open paths).
        this.loadContent(host.state.get().content ?? "");
    }

    // ── JSONL parse (verbatim from today's LogViewModel) ────────────────

    /** Full parse of JSONL content. Used on initial load and when incremental fails. */
    loadContent(content: string): void {
        const entries: LogEntry[] = [];
        let error: string | undefined;

        if (content.trim()) {
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                try {
                    const parsed = JSON.parse(line);
                    if (typeof parsed === "object" && parsed !== null && parsed.type && parsed.id) {
                        entries.push(parsed as LogEntry);
                    } else {
                        error = `Line ${i + 1}: not a valid log entry (missing type or id)`;
                        break;
                    }
                } catch (e) {
                    error = `Line ${i + 1}: ${errMessage(e)}`;
                    break;
                }
            }
        }

        // Restore ID counter from max existing ID
        this.nextId = 1;
        for (const entry of entries) {
            const numId = parseInt(entry.id, 10);
            if (!isNaN(numId) && numId >= this.nextId) {
                this.nextId = numId + 1;
            }
        }

        this.lastLineCount = content.trim() ? content.split("\n").length : 0;

        this.state.update((s) => {
            s.entries = entries;
            s.entryCount = entries.length;
            s.error = error;
        });
    }

    /**
     * Incremental parse: if only new lines were appended, parse only those.
     * Falls back to full parse if existing lines changed.
     */
    private loadContentIncremental(content: string): void {
        if (!content.trim()) {
            this.loadContent(content);
            return;
        }

        const lines = content.split("\n");
        const newLineCount = lines.length;
        const currentEntries = this.state.get().entries;

        // If lines decreased or we have no prior state, full re-parse
        if (newLineCount < this.lastLineCount || currentEntries.length === 0) {
            this.loadContent(content);
            return;
        }

        // Check if first line matches (simple heuristic for detecting edits in existing lines)
        const firstLine = lines[0].trim();
        if (firstLine && currentEntries.length > 0) {
            const firstParsed = tryParseJson<{ id?: string } | null>(firstLine, null);
            if (!firstParsed || firstParsed.id !== currentEntries[0].id) {
                this.loadContent(content);
                return;
            }
        }

        // Parse only new trailing lines
        const newEntries: LogEntry[] = [];
        let error: string | undefined;

        for (let i = this.lastLineCount; i < newLineCount; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            try {
                const parsed = JSON.parse(line);
                if (typeof parsed === "object" && parsed !== null && parsed.type && parsed.id) {
                    newEntries.push(parsed as LogEntry);
                } else {
                    error = `Line ${i + 1}: not a valid log entry (missing type or id)`;
                    break;
                }
            } catch (e) {
                error = `Line ${i + 1}: ${errMessage(e)}`;
                break;
            }
        }

        if (newEntries.length > 0) {
            // Update ID counter
            for (const entry of newEntries) {
                const numId = parseInt(entry.id, 10);
                if (!isNaN(numId) && numId >= this.nextId) {
                    this.nextId = numId + 1;
                }
            }

            this.state.update((s) => {
                s.entries = [...s.entries, ...newEntries];
                s.entryCount = s.entries.length;
                if (error) s.error = error;
            });
        } else if (error) {
            this.state.update((s) => {
                s.error = error;
            });
        }

        this.lastLineCount = newLineCount;
    }

    // ── Content serialization ───────────────────────────────────────────

    /** Append a single entry as a JSONL line to host content. */
    private appendToContent(entry: LogEntry): void {
        if (!this._host) return;
        const line = JSON.stringify(entry);
        const currentContent = this._host.state.get().content;
        const newContent = currentContent ? currentContent + "\n" + line : line;

        this.lastLineCount = newContent.split("\n").length;
        this.writeToHost(newContent);
    }

    /** Re-serialize a single entry's line in the host content. */
    private updateEntryInContent(entry: LogEntry): void {
        if (!this._host) return;
        const content = this._host.state.get().content;
        const lines = content.split("\n");
        let updated = false;

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (!trimmed) continue;
            const parsed = tryParseJson<{ id?: string } | null>(trimmed, null);
            if (parsed?.id === entry.id) {
                lines[i] = JSON.stringify(entry);
                updated = true;
                break;
            }
        }

        if (updated) {
            this.writeToHost(lines.join("\n"));
        }
    }

    /** Debounced flush of dirty entries to JSONL content. */
    private flushDirtyDebounced = debounce(() => {
        if (!this._host) return;
        if (this.dirtyIndices.size === 0) return;
        const entries = this.state.get().entries;
        const content = this._host.state.get().content;
        const lines = content.split("\n");
        let changed = false;

        for (const idx of this.dirtyIndices) {
            const entry = entries[idx];
            if (!entry) continue;
            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                if (!trimmed) continue;
                const parsed = tryParseJson<{ id?: string } | null>(trimmed, null);
                if (parsed?.id === entry.id) {
                    const updated = JSON.stringify(entry);
                    if (lines[i] !== updated) {
                        lines[i] = updated;
                        changed = true;
                    }
                    break;
                }
            }
        }
        this.dirtyIndices.clear();

        if (changed) {
            this.writeToHost(lines.join("\n"));
        }
    }, 300);

    // ── Entry mutators (public API preserved verbatim per LV9 / MI6) ────

    /** Add a log entry and append it to the host content.
     *  If `fields.id` matches an existing entry, updates it in-place (upsert). */
    addEntry(type: string, fields: StyledText | Record<string, unknown>): LogEntry {
        const fieldsObj = typeof fields === "object" && fields !== null && !Array.isArray(fields)
            ? (fields as Record<string, unknown>)
            : null;
        const id = fieldsObj?.id != null ? String(fieldsObj.id) : String(this.nextId++);
        const numId = parseInt(id, 10);
        if (!isNaN(numId) && numId >= this.nextId) {
            this.nextId = numId + 1;
        }

        // Upsert: if entry with this ID already exists, update it in-place
        if (fieldsObj?.id != null) {
            const existingIndex = this.state.get().entries.findIndex((e) => e.id === id);
            if (existingIndex >= 0) {
                this.state.update((s) => {
                    const existing = s.entries[existingIndex];
                    s.entries[existingIndex] = { ...existing, ...fieldsObj, type, id };
                });
                const updatedEntry = this.state.get().entries[existingIndex];
                this.updateEntryInContent(updatedEntry);
                this.heightCache.delete(id);
                return updatedEntry;
            }
        }

        // For log entries, fields is StyledText → wrap as { text }
        // For dialog/output entries, fields is already an object → spread
        const entry: LogEntry = fieldsObj
            ? { type, id, ...fieldsObj, timestamp: Date.now() }
            : { type, id, text: fields as StyledText, timestamp: Date.now() };

        this.state.update((s) => {
            s.entries = [...s.entries, entry];
            s.entryCount = s.entries.length;
        });

        this.appendToContent(entry);
        return entry;
    }

    /** Add a dialog entry and return a Promise that resolves when the user responds. */
    addDialogEntry(type: string, fields: Record<string, unknown>): Promise<LogEntry> {
        const entry = this.addEntry(type, fields);
        // LV5 — replaces today's forceScrollVersion bump.
        this.typedQueue.send({ type: "scrollToBottom" });
        return new Promise<LogEntry>((resolve) => {
            this.pendingDialogs.set(entry.id, { resolve });
        });
    }

    /** Resolve a pending dialog. Sets `button` on the flat entry and resolves the Promise with full entry. */
    resolveDialog(id: string, button: string): void {
        this.state.update((s) => {
            const entry = s.entries.find((e) => e.id === id);
            if (entry) {
                entry.button = button;
            }
        });

        const updatedEntry = this.state.get().entries.find((e) => e.id === id);
        if (updatedEntry) {
            this.updateEntryInContent(updatedEntry);
        }

        const pending = this.pendingDialogs.get(id);
        if (pending) {
            pending.resolve(updatedEntry);
            this.pendingDialogs.delete(id);
        }
    }

    /** Update an entry's text by ID. Serializes immediately to prevent
     *  the host-subscription race that would overwrite in-memory styled data
     *  with stale JSONL content. */
    updateEntryText(id: string, text: StyledText): void {
        const entries = this.state.get().entries;
        const index = entries.findIndex((e) => e.id === id);
        if (index < 0) return;

        this.state.update((s) => {
            s.entries[index] = { ...s.entries[index], text };
        });

        const updatedEntry = this.state.get().entries[index];
        if (updatedEntry) {
            this.updateEntryInContent(updatedEntry);
        }
    }

    /** Update entry at index via immer updater. Marks dirty for debounced JSONL serialization. */
    updateEntryAt(index: number, updater: (draft: LogEntry) => void): void {
        this.state.update((s) => {
            updater(s.entries[index]);
        });
        this.dirtyIndices.add(index);
        this.flushDirtyDebounced();
    }

    /** Update an entry by ID. Finds the entry and delegates to updateEntryAt. */
    updateEntryById(id: string, updater: (draft: LogEntry) => void): void {
        const index = this.state.get().entries.findIndex((e) => e.id === id);
        if (index >= 0) {
            this.updateEntryAt(index, updater);
        }
    }

    /** Remove all entries. */
    clear = (): void => {
        // Cancel all pending dialogs (button: undefined = canceled)
        for (const [id, { resolve }] of this.pendingDialogs.entries()) {
            resolve({ type: "", id, timestamp: 0 });
        }
        this.pendingDialogs.clear();

        this.nextId = 1;
        this.lastLineCount = 0;

        this.state.update((s) => {
            s.entries = [];
            s.entryCount = 0;
            s.error = undefined;
        });

        this.writeToHost("");
    };

    toggleTimestamps = (): void => {
        this.state.update((s) => {
            s.showTimestamps = !s.showTimestamps;
        });
    };

    // ── Queries ─────────────────────────────────────────────────────────

    isDialogPending(id: string): boolean {
        return this.pendingDialogs.has(id);
    }

    get entryCount(): number {
        return this.state.get().entryCount;
    }

    // ── Height cache (view virtualization — preserves across remounts) ──

    getEntryHeight(id: string): number | undefined {
        return this.heightCache.get(id);
    }

    setEntryHeight(id: string, height: number): void {
        this.heightCache.set(id, height);
    }

    // ── Per-item auxiliary state ────────────────────────────────────────

    getItemState(id: string): Record<string, unknown> {
        return this.state.get().itemsState[id] ?? {};
    }

    setItemState(id: string, patch: Record<string, unknown>): void {
        this.state.update((s) => {
            s.itemsState[id] = { ...s.itemsState[id], ...patch };
        });
        // No persistence — itemsState is transient in-session reactive state
        // per the HS1 size carve-out. The HS1 mirror subscription is
        // slice-scoped to `showTimestamps`, so this mutation doesn't trigger
        // a host-slot write.
    }

    // ── Save / release / dispose ────────────────────────────────────────

    async dispose(): Promise<void> {
        // LV7 — cancel pending dialogs (sentinel resolve; preserved from
        // today's onDispose). Fires for BOTH page-close AND switch-out.
        for (const [id, { resolve }] of this.pendingDialogs.entries()) {
            resolve({ type: "", id, timestamp: 0 });
        }
        this.pendingDialogs.clear();
        this.dirtyIndices.clear();

        await super.dispose();
    }
}
