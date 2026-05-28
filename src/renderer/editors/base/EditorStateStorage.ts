/**
 * Interface for storing and retrieving editor state.
 * Implementations:
 * - `TextFileModel.stateStorage` — file-based via `fs.getCacheFile` / `fs.saveCacheFile`.
 * - `NoteItemEditModel.stateStorage` — backed by the notebook's per-note state map.
 *
 * Consumed by editors that need to read/write a per-page cache (e.g.
 * `RestClientEditor.restoreResponseCache` / `saveResponseCache`).
 */
export interface EditorStateStorage {
    /**
     * Retrieve stored state for an editor.
     * @param id - Unique identifier (page ID or note ID)
     * @param name - State name (e.g., "grid-page", "script-panel")
     * @returns Serialized state string or undefined if not found
     */
    getState: (id: string, name: string) => Promise<string | undefined>;

    /**
     * Store state for an editor.
     * @param id - Unique identifier (page ID or note ID)
     * @param name - State name (e.g., "grid-page", "script-panel")
     * @param state - Serialized state string
     */
    setState: (id: string, name: string, state: string) => Promise<void>;
}
