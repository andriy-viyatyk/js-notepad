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
import { api } from "../../../ipc/renderer/api";
import { resolveColor } from "../../theme/themes";
import { themeState } from "../../theme/theme-state";
import { fontSize, gap, height, radius, spacing } from "../../uikit/tokens";
import { mapScale } from "../../theme/token-vars";
import { P_VAR_SOURCES } from "../../theme/p-vars";
import type { BoardThemePalette } from "../../../ipc/board-bridge-channels";


/** Resolve the current host theme into the board color palette. */
export function computeBoardThemePalette(): BoardThemePalette {
    const vars: Record<string, string> = {};
    for (const [pVar, src] of Object.entries(P_VAR_SOURCES)) {
        vars[pVar] = resolveColor(src);
    }
    const { id, isDark } = themeState.get();
    return { id, isDark, vars };
}

let themeSubscription: (() => void) | null = null;

/** Start the single renderer-to-board theme notification path once. */
export function ensureBoardThemeSubscription(): void {
    if (themeSubscription) return;
    // The board-theme module owns this single process-lifetime subscription; no view
    // or model should dispose the app-to-board notification path.
    themeSubscription = themeState.subscribe(() => {
        void api.updateBoardTheme(computeBoardThemePalette());
    });
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
