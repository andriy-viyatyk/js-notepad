import { createContext, useContext, ReactNode } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * General configuration context for editors.
 * Each editor reads only the parameters relevant to it.
 */
export interface EditorConfig {
    /**
     * Maximum height the editor should grow to (pixels).
     * Used by editors that support auto-sizing (e.g., AVGrid with growToHeight).
     * Undefined means no constraint (editor uses its default behavior).
     */
    maxEditorHeight?: number;

    /**
     * Minimum height the editor should maintain (pixels).
     * Undefined means no constraint.
     */
    minEditorHeight?: number;

    /**
     * Whether to hide the minimap in editors that support it.
     * Used by Monaco editor and Markdown view.
     * Could be made configurable in app settings in the future.
     */
    hideMinimap?: boolean;
}

// =============================================================================
// Context
// =============================================================================

const EditorConfigContext = createContext<EditorConfig>({});

// =============================================================================
// Provider
// =============================================================================

interface EditorConfigProviderProps {
    config: EditorConfig;
    children: ReactNode;
}

/**
 * Provides editor configuration to nested editor components.
 * Use this to pass sizing constraints or other configuration
 * from parent containers to editors loaded via registry.
 */
export function EditorConfigProvider({
    config,
    children,
}: EditorConfigProviderProps) {
    return (
        <EditorConfigContext.Provider value={config}>
            {children}
        </EditorConfigContext.Provider>
    );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Access editor configuration from context.
 * Returns empty object if no provider is present.
 */
export function useEditorConfig(): EditorConfig {
    return useContext(EditorConfigContext);
}
