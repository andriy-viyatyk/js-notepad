import { TOneState } from "../core/state/state";

export interface ThemeState {
    id: string;
    isDark: boolean;
}

/**
 * The renderer's active-theme snapshot. Keep this module independent of the
 * theme table and settings persistence so non-React consumers can subscribe
 * to the same synchronous notification path as React views.
 */
export const themeState = new TOneState<ThemeState>({
    id: "default-dark",
    isDark: true,
});
