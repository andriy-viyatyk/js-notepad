import { fontSize, gap, height, radius, spacing } from "../uikit/tokens";

/** Convert a token scale key to the kebab-case form used by CSS custom properties. */
function camelToKebab(value: string): string {
    return value
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
        .toLowerCase();
}

/**
 * Map a numeric token scale to CSS pixel values.
 * A non-pixel token requires an explicit design decision rather than a
 * silently widened mapper.
 */
export function mapScale(prefix: string, scale: Record<string, number>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(scale)) {
        out[`${prefix}-${camelToKebab(key)}`] = `${value}px`;
    }
    return out;
}

/**
 * App-local token names. These variables live on :root and inherit into every
 * embedded surface; future third-party CSS should be checked for collisions
 * with the --space-*, --gap-*, --radius-*, --size-* and --font-* namespaces.
 */
export const APP_TOKEN_VARS: Record<string, string> = {
    ...mapScale("--space", spacing),
    ...mapScale("--gap", gap),
    ...mapScale("--radius", radius),
    ...mapScale("--size", height),
    ...mapScale("--font", fontSize),
};

const TOKEN_STYLE_ATTRIBUTE = "data-persephone-token-vars";

/** Install the app token stylesheet once, updating the marked node if needed. */
export function installAppTokenVars(): void {
    if (typeof document === "undefined") return;

    const css = [
        ":root {",
        ...Object.entries(APP_TOKEN_VARS).map(([name, value]) => `    ${name}: ${value};`),
        "}",
    ].join("\n");

    let style = document.head.querySelector<HTMLStyleElement>(
        `style[${TOKEN_STYLE_ATTRIBUTE}]`,
    );
    if (!style) {
        style = document.createElement("style");
        style.setAttribute(TOKEN_STYLE_ATTRIBUTE, "");
        document.head.appendChild(style);
    }
    if (style.textContent !== css) {
        style.textContent = css;
    }
}
