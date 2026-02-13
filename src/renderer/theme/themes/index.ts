import { ThemeDefinition } from "./types";
import { defaultDark } from "./default-dark";
import { solarizedDark } from "./solarized-dark";
import { monokai } from "./monokai";
import { abyss } from "./abyss";
import { red } from "./red";
import { tomorrowNightBlue } from "./tomorrow-night-blue";

const themes: ThemeDefinition[] = [
    defaultDark,
    solarizedDark,
    monokai,
    abyss,
    red,
    tomorrowNightBlue,
];

// Read saved theme synchronously at startup to avoid flash of wrong theme.
// Uses fs.readFileSync so the correct CSS variables are set before first paint.
function readStartupThemeId(): string {
    try {
        const path = require("path");
        const fs = require("fs");
        const settingsPath = path.join(
            process.env.APPDATA, "js-notepad", "data", "appSettings.json"
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

let currentThemeId = defaultDark.id;

type MonacoThemeCallback = (theme: ThemeDefinition) => void;
let monacoThemeCallback: MonacoThemeCallback | null = null;

export function getAvailableThemes(): ThemeDefinition[] {
    return themes;
}

export function getCurrentThemeId(): string {
    return currentThemeId;
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

    currentThemeId = theme.id;

    if (monacoThemeCallback) {
        monacoThemeCallback(theme);
    }
}

export function getResolvedColor(cssVar: string): string {
    const theme = getThemeById(currentThemeId);
    return theme?.colors[cssVar] ?? "";
}

export function onMonacoThemeChange(callback: MonacoThemeCallback): void {
    monacoThemeCallback = callback;
}

// Apply saved theme immediately on module load (synchronous read avoids flash)
applyTheme(readStartupThemeId());
