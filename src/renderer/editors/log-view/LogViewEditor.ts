import { TComponentState } from "../../core/state/state";
import {
    EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/EditorModel";
import { CONTENT_HOST_TRAIT, type IContentHostTrait } from "../base/editor-traits";
import type { IContentHost } from "../base/IContentHost";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import type { EditorDescriptor, HostDescriptor } from "../../../shared/persistence";
import type { IContentPipe } from "../../api/types/io.pipe";
import type { IPageHost } from "../../api/pages/IPageHost";
import { TextFileModel, newTextFileModel } from "../text/TextEditorModel";
import { editorRegistry } from "../base/editorRegistry";
import { fpBasename } from "../../core/utils/file-path";
import { ui } from "../../api/ui";
import { debounce } from "../../../shared/utils";
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

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class LogViewEditor extends EditorModel<LogViewEditorState, void, LogQueueEvent> {
    readonly editorId = "log-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;
    private _settingsUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    // LogView-specific private fields (verbatim from today's LogViewModel):
    private pendingDialogs = new Map<string, { resolve: (result: LogEntry) => void }>();
    private nextId = 1;
    private skipNextContentUpdate = false;
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

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from LogViewEditor");
                this._hostStateUnsub?.();
                this._hostContentUnsub?.();
                this._settingsUnsub?.();
                this._hostStateUnsub = null;
                this._hostContentUnsub = null;
                this._settingsUnsub = null;
                this._host = null;
                return host as unknown as IContentHost;
            },
        };
        this.traits.add(CONTENT_HOST_TRAIT, trait);
    }

    // ── Host accessors ──────────────────────────────────────────────────

    get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
    }

    findCompatibleEditors(): string[] {
        if (!this._host) return [];
        return editorRegistry.findEditorsAccepting(this._host as unknown as IContentHost);
    }

    getNavigatorTarget(): { pipe?: IContentPipe | null; filePath?: string | null } | null {
        if (!this._host) return null;
        const { filePath } = this._host.state.get();
        const pipe = this._host.pipe;
        if (!pipe && !filePath) return {};
        return { pipe, filePath };
    }

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    // ── Persistence ─────────────────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        // Descriptor collapses to identity-only. View-derived (entries /
        // entryCount / error) stripped per GR8 / MO5. `showTimestamps` rides
        // the HS1 host slot. `itemsState` is transient (size carve-out).
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                title: s.title,
                modified: s.modified,
                secondaryView: s.secondaryView,
            } as Record<string, unknown>,
            host: this._host?.getDescriptor(),
        };
    }

    applyRestoreData(data: RestoreData<LogViewEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryView !== undefined) cur.secondaryView = data.secondaryView;
        });
        // No legacy promotion: today's LogViewModel doesn't persist
        // showTimestamps (in-memory only) and itemsState lived in a separate
        // cache file (orphaned on upgrade per P9). `adoptHost` seeds
        // showTimestamps from the host slot on first read.
        if (data.host) this._pendingHost = data.host;
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `LogViewEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("LogViewEditor.switchFrom: extracted host is not a TextFileModel");
        }
        // Preserve cache-file id across the swap (C9).
        this.state.update((s) => {
            s.id = oldEditor.id;
        });
        // Tag the host with the target editor id so submodels keep their assumptions.
        host.state.update((s) => {
            s.editor = this.editorId;
        });
        this.adoptHost(host);
        // Initial parse against the inherited content.
        this.loadContent(host.state.get().content ?? "");
    }

    async restore(): Promise<void> {
        try {
            if (!this._host) {
                this._host = this._pendingHost
                    ? await TextFileModel.fromDescriptor(this._pendingHost)
                    : newTextFileModel("");
            }
            if (!this._host.state.get().restored) {
                await this._host.restore();
            }
            this.adoptHost(this._host);
            this.loadContent(this._host.state.get().content ?? "");
        } catch (err) {
            ui.notify((err as Error).message || "Failed to restore Log View editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    /** Adopt a host without going through `switchFrom`. Used by
     *  `attachEditorToPage` when constructing a fresh LogViewEditor over a
     *  freshly-restored legacy TextFileModel. */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._settingsUnsub?.();

        // Forward host metadata changes to descriptorChanged (P3 debounce).
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );

        // LV4 + LV6 — re-parse incrementally on external content changes;
        // skipNextContentUpdate guards against the editor's own self-writes.
        this._hostContentUnsub = host.state.subscribe(
            (content) => {
                if (this.skipNextContentUpdate) {
                    this.skipNextContentUpdate = false;
                    return;
                }
                this.loadContentIncremental(content as string);
            },
            (s) => s.content,
        );

        // HS1 — seed `showTimestamps` from host slot (sync, no flicker).
        // `itemsState` is intentionally NOT seeded — it's transient per the
        // size carve-out.
        const saved = host.getEditorState<LogViewSettings>(this.editorId);
        if (saved?.showTimestamps !== undefined) {
            this.state.update((s) => {
                s.showTimestamps = saved.showTimestamps;
            });
        }

        // HS1 — mirror `showTimestamps` changes back to host slot via a
        // selector subscription. Slice-subscribe keeps the mirror from firing
        // on `itemsState` mutations (the dominant write source on log pages)
        // — only the bounded boolean actually triggers a host-slot write.
        this._settingsUnsub = this.state.subscribe(
            (showTimestamps) => {
                if (!this._host) return;
                this._host.setEditorState<LogViewSettings>(this.editorId, {
                    showTimestamps: showTimestamps as boolean,
                });
            },
            (s) => s.showTimestamps,
        );

        const { filePath, title } = host.state.get();
        this.state.update((s) => {
            s.title = title || (filePath ? fpBasename(filePath) : s.title || "untitled");
            if (host.state.get().id) s.id = host.state.get().id;
        });
        host.state.update((s) => {
            if (s.editor !== this.editorId) s.editor = this.editorId;
        });
        if (this.page) host.setPage(this.page);
    }

    setPage(page: IPageHost | null): void {
        super.setPage(page);
        this._host?.setPage(page);
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
                    error = `Line ${i + 1}: ${(e as Error).message}`;
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
            try {
                const firstParsed = JSON.parse(firstLine);
                if (firstParsed.id !== currentEntries[0].id) {
                    this.loadContent(content);
                    return;
                }
            } catch {
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
                error = `Line ${i + 1}: ${(e as Error).message}`;
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
        this.skipNextContentUpdate = true;
        this._host.changeContent(newContent);
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
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed.id === entry.id) {
                    lines[i] = JSON.stringify(entry);
                    updated = true;
                    break;
                }
            } catch {
                // skip malformed lines
            }
        }

        if (updated) {
            this.skipNextContentUpdate = true;
            this._host.changeContent(lines.join("\n"));
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
                try {
                    const parsed = JSON.parse(trimmed);
                    if (parsed.id === entry.id) {
                        const updated = JSON.stringify(entry);
                        if (lines[i] !== updated) {
                            lines[i] = updated;
                            changed = true;
                        }
                        break;
                    }
                } catch { /* skip */ }
            }
        }
        this.dirtyIndices.clear();

        if (changed) {
            this.skipNextContentUpdate = true;
            this._host.changeContent(lines.join("\n"));
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

        this.skipNextContentUpdate = true;
        this._host?.changeContent("");
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

    async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    async saveState(): Promise<void> {
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
        // LV7 — cancel pending dialogs (sentinel resolve; preserved from
        // today's onDispose). Fires for BOTH page-close AND switch-out.
        for (const [id, { resolve }] of this.pendingDialogs.entries()) {
            resolve({ type: "", id, timestamp: 0 });
        }
        this.pendingDialogs.clear();
        this.dirtyIndices.clear();

        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._settingsUnsub?.();
        this._hostStateUnsub = null;
        this._hostContentUnsub = null;
        this._settingsUnsub = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}
