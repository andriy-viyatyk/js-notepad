/** Configuration supplied by the view that embeds an editor body. */
export interface EditorConfig {
    maxEditorHeight?: number;
    minEditorHeight?: number;
    hideMinimap?: boolean;
    fillContainer?: boolean;
    disableAutoFocus?: boolean;
    compact?: boolean;
    highlightText?: string;
}

export const EMPTY_EDITOR_CONFIG: EditorConfig = {};
