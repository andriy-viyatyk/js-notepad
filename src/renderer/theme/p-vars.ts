/**
 * The `--p-*` design contract, and the `:root` bridge that makes it resolve.
 *
 * Two consumers, one map:
 *
 *  • **Boards** (EPIC-034 / US-725) resolve these names to concrete hex and push them into a
 *    sandboxed iframe, which cannot inherit anything from the host document.
 *  • **av-grid** (EPIC-057 / US-1019) reads them directly out of the cascade: every `--avg-*`
 *    token in its stylesheet falls back to a `--p-*` counterpart, and its own rules read
 *    `--p-text-strong` by name. Setting a custom property re-tints with zero repaints, so a
 *    theme switch needs no subscription here — see `installPVarBridge()`.
 *
 * The names are the public contract (epic C5); the source mapping below may change behind them.
 */

/** Color `--p-*` var → source `color.ts` (`--color-*`) var. `--p-accent*` is a
 *  deliberate mapping (no 1:1 `accent` token — epic C5): it mirrors the filled
 *  primary Button (`uikit/Button`, the `selection` pair), NOT the `primary.*`
 *  group — which is a *text-color* semantic (`primary.background` is `#000`), so
 *  using it as a fill produced a black button with invisible-on-hover text. */
export const P_VAR_SOURCES: Record<string, string> = {
    "--p-bg": "--color-bg-default",
    "--p-panel": "--color-bg-light",
    "--p-bg-dark": "--color-bg-dark",
    "--p-overlay": "--color-bg-overlay",
    "--p-hover": "--color-bg-overlay-hover",
    "--p-tree-selection": "--color-bg-tree-selection",
    "--p-border": "--color-border-default",
    "--p-border-light": "--color-border-light",
    "--p-text": "--color-text-default",
    "--p-text-muted": "--color-text-light",
    "--p-text-strong": "--color-text-strong",
    "--p-accent": "--color-bg-selection",
    "--p-accent-text": "--color-text-selection",
    "--p-accent-hover": "--color-border-active",
    "--p-selection-bg": "--color-bg-selection",
    "--p-selection-text": "--color-text-selection",
    "--p-link": "--color-misc-link",
    "--p-error": "--color-error-text",
    "--p-success": "--color-success-text",
    "--p-warning": "--color-warning-text",
    "--p-scrollbar": "--color-bg-scrollbar",
    "--p-scrollbar-thumb": "--color-bg-scrollbar-thumb",
    "--p-shadow": "--color-shadow-default",
};

/**
 * The application's monospace stack, as one definition.
 *
 * `global-styles` sets it on `body` through `--p-font-family`, and av-grid's `--avg-font-family`
 * falls back to the same variable. Without it the grid renders in a system sans stack, because
 * av-grid's own root sets `font-family` rather than inheriting it.
 */
export const APP_FONT_FAMILY = 'Consolas, monospace, "Courier New"';

/**
 * The two non-color tokens av-grid reads. They are not in `P_VAR_SOURCES` because they are not
 * colors: `--p-font-base` indirects through the `--font-base` that `installAppTokenVars()`
 * already puts on `:root`, and `--p-font-family` has no source var at all.
 */
const P_VAR_LITERALS: Record<string, string> = {
    "--p-font-base": "var(--font-base)",
    "--p-font-family": APP_FONT_FAMILY,
};

const P_VARS_STYLE_ATTRIBUTE = "data-persephone-p-vars";

/**
 * Declare every `--p-*` name on `:root` as a `var()` reference to its source.
 *
 * The indirection is the whole design. Values are never resolved in JavaScript, so this
 * stylesheet is written once at startup and never again: `applyTheme()` re-sets the `--color-*`
 * inline styles on `document.documentElement` and the `--p-*` names follow automatically, which
 * is what makes a theme switch cost no repaint in av-grid.
 *
 * Boards are the exception and stay as they are: an iframe inherits nothing, so
 * `computeBoardThemePalette()` still resolves the same map to concrete hex per theme.
 *
 * Idempotent, in the shape of `installAppTokenVars()`: find-or-create the marked node and
 * assign only when the text differs.
 */
export function installPVarBridge(): void {
    if (typeof document === "undefined") return;

    const declarations = [
        ...Object.entries(P_VAR_SOURCES).map(([name, src]) => `    ${name}: var(${src});`),
        ...Object.entries(P_VAR_LITERALS).map(([name, value]) => `    ${name}: ${value};`),
    ];
    const css = [":root {", ...declarations, "}"].join("\n");

    let style = document.head.querySelector<HTMLStyleElement>(
        `style[${P_VARS_STYLE_ATTRIBUTE}]`,
    );
    if (!style) {
        style = document.createElement("style");
        style.setAttribute(P_VARS_STYLE_ATTRIBUTE, "");
        document.head.appendChild(style);
    }
    if (style.textContent !== css) {
        style.textContent = css;
    }
}
