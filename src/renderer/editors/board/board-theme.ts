/**
 * The Board `--p-*` design contract (EPIC-034 / US-725) — the single place
 * that defines the board-facing CSS-variable names and resolves their values.
 *
 * Two parts:
 *  • Color palette — semantic `--p-*` names mapped to `color.ts` source `--color-*`
 *    vars, resolved to concrete hex for the active theme. Theme-dependent → recomputed
 *    and re-pushed to the board on every theme switch.
 *  • Metric tokens — spacing / gap / radius / size / font scales generated from
 *    `uikit/tokens.ts`. Theme-independent constants → built once, delivered at init only.
 *
 * The `--p-*` names are the public contract (epic C5); the source mapping below may
 * change behind them. The board host (`board-protocol-service` inject + the bridge
 * shim's theme sync) only *applies* the maps produced here — it never imports this
 * module, keeping the contract defined in exactly one place.
 */
import { getCurrentThemeId, getResolvedColor, isCurrentThemeDark } from "../../theme/themes";
import { fontSize, gap, height, radius, spacing } from "../../uikit/tokens";
import { mapScale } from "../../theme/token-vars";
import type { BoardThemePalette } from "../../../ipc/board-bridge-channels";

/** Color `--p-*` var → source `color.ts` (`--color-*`) var. `--p-accent*` is a
 *  deliberate mapping (no 1:1 `accent` token — epic C5): it mirrors the filled
 *  primary Button (`uikit/Button`, the `selection` pair), NOT the `primary.*`
 *  group — which is a *text-color* semantic (`primary.background` is `#000`), so
 *  using it as a fill produced a black button with invisible-on-hover text. */
const P_VAR_SOURCES: Record<string, string> = {
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

/** Resolve the current host theme into the board color palette. */
export function computeBoardThemePalette(): BoardThemePalette {
    const vars: Record<string, string> = {};
    for (const [pVar, src] of Object.entries(P_VAR_SOURCES)) {
        vars[pVar] = getResolvedColor(src);
    }
    return { id: getCurrentThemeId(), isDark: isCurrentThemeDark(), vars };
}

// --- Metric tokens (static, theme-independent) ---

/** The frozen metric `--p-*` contract, generated from `uikit/tokens.ts`. Built once. */
export const BOARD_TOKEN_VARS: Record<string, string> = {
    ...mapScale("--p-space", spacing),
    ...mapScale("--p-gap", gap),
    ...mapScale("--p-radius", radius),
    // Frozen board contract (EPIC-034); the app token was removed by EPIC-052 A7.
    "--p-radius-full": "50%",
    ...mapScale("--p-size", height),
    ...mapScale("--p-font", fontSize),
};
