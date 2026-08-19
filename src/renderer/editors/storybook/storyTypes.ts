import React from "react";

/**
 * Prop names the Storybook manages automatically. If a story declares any of
 * these as a PropDef, the Storybook injects the current value (e.g. preview
 * background) and hides the prop from the property editor panel.
 */
export const STORYBOOK_MANAGED_PROPS = new Set(["background"]);

export type PropDef =
    | { name: string; label?: string; type: "string"; default?: string; placeholder?: string }
    | { name: string; label?: string; type: "number"; default?: number; min?: number; max?: number; step?: number }
    | { name: string; label?: string; type: "boolean"; default?: boolean }
    | { name: string; label?: string; type: "enum"; options: readonly string[]; default?: string }
    | { name: string; label?: string; type: "icon"; default?: IconPresetId };

export type IconPresetId = "none" | "folder" | "plus" | "save" | "settings";

export interface Story<P = Record<string, unknown>> {
    /** Unique story ID, kebab-case. */
    id: string;
    /** Display name in the component browser. */
    name: string;
    /** Section heading for grouping, e.g. "Layout", "Bootstrap". */
    section: string;
    /** The component to render. */
    component: React.ComponentType<P>;
    /** Editable props. */
    props: PropDef[];
    /** Initial prop values; merged on top of PropDef defaults. */
    defaultProps?: Partial<P>;
    /** Optional sample children for layout containers — when present and the component
     *  has no `children` prop in `props`, this function provides the preview body. */
    previewChildren?: () => React.ReactNode;
}
