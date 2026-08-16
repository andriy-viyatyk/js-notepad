import React from "react";
import { LanguageIcon } from "./LanguageIcon";
import { renderIcon } from "../../uikit";
import type { IconRef } from "../../uikit";

/** Minimal structural shape an editor exposes for icon resolution. Kept separate
 *  from `EditorModel` so `components/icons` stays decoupled from the editor layer —
 *  any object with these fields (an `EditorModel`, or a synthesized `{ language,
 *  title }`) can drive the icon. */
export interface EditorIconSource {
    /** When true, the editor supplies its own icon via `getIcon` (no file-type icon). */
    noLanguage?: boolean;
    /** Self-supplied icon for `noLanguage` editors (may be undefined → no icon). */
    getIcon?: () => IconRef;
    /** Monaco language id — drives the file-type icon for language editors. */
    language?: string;
    /** File name / page title — refines the file-type icon (compound extensions). */
    title?: string;
}

/**
 * Resolves the icon that represents an editor — the SAME icon shown on the
 * Persephone page tab for that editor. Single source of truth shared by the page
 * tab (`PageTab.tsx`) and the sidebar secondary-view panel headers
 * (`SecondaryViews.tsx`) so the two can never drift.
 *
 * - `noLanguage` editors render their own `getIcon()` (Git, Archive, Explorer, …);
 *   returns nothing when an editor defines no icon.
 * - Language-based editors render the file-type icon resolved from language + title
 *   (the same `*.note.json` → Notebook, `*.todo.json` → Todo, … mapping the tab uses).
 *
 * Intentionally sets **no size and no color**: icons carry their own sizing (as on
 * the tab; the header's `& > svg` rule sizes direct-child SVGs), and leaving `color`
 * unset lets the surrounding header `color` cascade — so monochrome `currentColor`
 * icons follow the header state (accent when the panel is active) while
 * explicitly-colored icons keep their own hue.
 */
export function EditorIcon({ editor }: { editor: EditorIconSource }) {
    if (editor.noLanguage) {
        const icon = editor.getIcon?.();
        return <>{icon ? renderIcon(icon) : null}</>;
    }
    return <LanguageIcon language={editor.language ?? ""} fileName={editor.title} />;
}
