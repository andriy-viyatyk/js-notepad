import type { VanillaViewCtor } from "../../uikit/shared/vanilla-view";

/**
 * Prop names the Storybook manages automatically. If a story declares any of
 * these as a PropDef, the Storybook injects the current value (e.g. preview
 * background) and hides the prop from the property editor panel.
 */
export const STORYBOOK_MANAGED_PROPS = new Set(["background"]);

export type PropDef<P = Record<string, unknown>> =
    | { name: keyof P & string; label?: string; type: "string"; default?: string; placeholder?: string }
    | { name: keyof P & string; label?: string; type: "number"; default?: number; min?: number; max?: number; step?: number }
    | { name: keyof P & string; label?: string; type: "boolean"; default?: boolean }
    | { name: keyof P & string; label?: string; type: "enum"; options: readonly string[]; default?: string }
    | { name: keyof P & string; label?: string; type: "icon"; default?: IconPresetId };

export type IconPresetId = "none" | "folder" | "plus" | "save" | "settings";

interface StoryBase<P> {
    /** Unique story ID, kebab-case. */
    id: string;
    /** Display name in the component browser. */
    name: string;
    /** Section heading for grouping, e.g. "Layout", "Bootstrap". */
    section: string;
    /** Editable props. */
    props: PropDef<P>[];
    /** Initial prop values; merged on top of PropDef defaults. */
    defaultProps?: Partial<P>;
}

export interface Story<P = Record<string, unknown>> extends StoryBase<P> {
    /** The vanilla view constructor to render. */
    view: VanillaViewCtor<P>;
    /** Optional sample children for layout containers. */
    previewChildren?: () => Node;
}

/** A story with its prop type erased. The registry is heterogeneous, so it cannot be
 * `Story<P>` for any single `P` — `Story` is invariant in `P` (it appears contravariantly
 * in `component`/`view` and covariantly in `defaultProps`/`props`). `any` is deliberate
 * and confined to that one parameter: every other field still type-checks, and each story
 * is checked against its own concrete `P` at its declaration site. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- The registry erases only the invariant prop parameter.
export type AnyStory = Story<any>;
