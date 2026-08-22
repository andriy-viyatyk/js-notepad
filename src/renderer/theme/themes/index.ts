import { api } from "../../../ipc/renderer/api";
import { ThemeDefinition } from "./types";
import { defaultDark } from "./default-dark";
import { solarizedDark } from "./solarized-dark";
import { monokai } from "./monokai";
import { abyss } from "./abyss";
import { red } from "./red";
import { tomorrowNightBlue } from "./tomorrow-night-blue";
import { lightModern } from "./light-modern";
import { solarizedLight } from "./solarized-light";
import { quietLight } from "./quiet-light";
import { fpJoin } from "../../core/utils/file-path";
import { installAppTokenVars } from "../token-vars";
import { installPVarBridge } from "../p-vars";
import { themeState } from "../theme-state";

const themes: ThemeDefinition[] = [
    defaultDark,
    solarizedDark,
    monokai,
    abyss,
    red,
    tomorrowNightBlue,
    lightModern,
    solarizedLight,
    quietLight,
];

// Read saved theme synchronously at startup to avoid flash of wrong theme.
// Uses fs.readFileSync so the correct CSS variables are set before first paint.
function readStartupThemeId(): string {
    try {
        const fs = require("fs");
        const settingsPath = fpJoin(
            process.env.APPDATA, "persephone", "data", "appSettings.json"
        );
        const raw = fs.readFileSync(settingsPath, "utf-8");
        // Strip // comments — appSettings.json uses JSON5 comments
        const content = raw.replace(/^\s*\/\/.*$/gm, "");
        const parsed = JSON.parse(content);
        if (parsed.theme && themes.some((t) => t.id === parsed.theme)) {
            return parsed.theme;
        }
    } catch {
        // File doesn't exist yet or parse error — use default
    }
    return defaultDark.id;
}

export function getAvailableThemes(): ThemeDefinition[] {
    return themes;
}

export function getCurrentThemeId(): string {
    return themeState.get().id;
}

export function getThemeById(id: string): ThemeDefinition | undefined {
    return themes.find((t) => t.id === id);
}

export function applyTheme(themeId: string): void {
    const theme = getThemeById(themeId);
    if (!theme) return;

    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme.colors)) {
        root.style.setProperty(key, value);
    }
    root.style.colorScheme = theme.isDark ? "dark" : "light";

    // Set Chromium's native theme (affects native tooltips, scrollbars, etc.)
    api.setNativeTheme(theme.isDark ? "dark" : "light").catch(() => {});

    // Notify consumers only after CSS and native theme state are current.
    themeState.set({ id: theme.id, isDark: theme.isDark });
}

export function resolveColor(value: string): string {
    const trimmed = value.trim();
    const cssVar = trimmed.startsWith("var(") && trimmed.endsWith(")")
        ? trimmed.slice(4, -1).trim()
        : trimmed;
    const theme = getThemeById(themeState.get().id);
    return theme?.colors[cssVar] ?? "transparent";
}

export function cycleTheme(direction: 1 | -1): void {
    const currentIndex = themes.findIndex((t) => t.id === themeState.get().id);
    const nextIndex =
        (currentIndex + direction + themes.length) % themes.length;
    applyTheme(themes[nextIndex].id);
}

// Apply saved theme immediately on module load (synchronous read avoids flash)
installAppTokenVars();
installPVarBridge();
applyTheme(readStartupThemeId());
