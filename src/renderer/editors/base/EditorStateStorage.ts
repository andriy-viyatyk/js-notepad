/**
 * v4 editor-scoped storage. The editor's id is captured by the storage
 * instance at construction, so the interface only takes `name`.
 *
 * Distinct from the legacy `EditorStateStorage` at
 * [`../EditorStateStorageContext.tsx`](../EditorStateStorageContext.tsx)
 * which takes `(id, name)`. Path-disambiguated until US-559.
 */
export interface EditorStateStorage {
    getState(name: string): Promise<string | undefined>;
    setState(name: string, state: string): Promise<void>;
}
