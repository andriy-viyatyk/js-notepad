import { createContext, useContext, ReactNode, useMemo } from "react";
import { filesModel } from "../../store/files-store";

// =============================================================================
// Types
// =============================================================================

/**
 * Interface for storing and retrieving editor state.
 * Allows different implementations for different contexts:
 * - Default: file-based storage in cache folder
 * - Notebook: stored in notebook's data.state map
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

// =============================================================================
// Default Implementation (file-based)
// =============================================================================

/**
 * Default implementation using filesModel cache.
 * Used for standalone page editors.
 */
const defaultStateStorage: EditorStateStorage = {
    getState: async (id: string, name: string) => {
        return filesModel.getCacheFile(id, name);
    },
    setState: async (id: string, name: string, state: string) => {
        await filesModel.saveCacheFile(id, state, name);
    },
};

// =============================================================================
// Context
// =============================================================================

const EditorStateStorageContext = createContext<EditorStateStorage>(defaultStateStorage);

// =============================================================================
// Provider
// =============================================================================

interface EditorStateStorageProviderProps {
    storage: EditorStateStorage;
    children: ReactNode;
}

/**
 * Provides custom state storage implementation to nested editors.
 * Use this to override the default file-based storage.
 *
 * Example: NotebookEditor provides storage that saves to notebook's data.state
 */
export function EditorStateStorageProvider({
    storage,
    children,
}: EditorStateStorageProviderProps) {
    return (
        <EditorStateStorageContext.Provider value={storage}>
            {children}
        </EditorStateStorageContext.Provider>
    );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Access editor state storage from context.
 * Returns default file-based storage if no provider is present.
 */
export function useEditorStateStorage(): EditorStateStorage {
    return useContext(EditorStateStorageContext);
}

// =============================================================================
// Helper Hook for Creating Notebook Storage
// =============================================================================

/**
 * Creates an EditorStateStorage implementation backed by a state object.
 * Useful for NotebookEditor where state is stored in the notebook's data.state map.
 *
 * @param getState - Function to get state value: (id, name) => string | undefined
 * @param setState - Function to set state value: (id, name, value) => void
 */
export function useObjectStateStorage(
    getState: (id: string, name: string) => string | undefined,
    setState: (id: string, name: string, value: string) => void
): EditorStateStorage {
    return useMemo(
        () => ({
            getState: async (id: string, name: string) => getState(id, name),
            setState: async (id: string, name: string, state: string) => {
                setState(id, name, state);
            },
        }),
        [getState, setState]
    );
}
