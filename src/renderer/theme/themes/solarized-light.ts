// Color palette based on VSCode's Solarized Light theme.
// Copyright (c) Microsoft Corporation. Licensed under MIT.
// https://github.com/microsoft/vscode/blob/main/LICENSE.txt

import { ThemeDefinition } from "./types";

// Solarized Light palette reference:
// base3:  #fdf6e3  base2:  #eee8d5  base1:  #93a1a1  base0:  #839496
// base00: #657b83  base01: #586e75  base02: #073642  base03: #002b36
// yellow: #b58900  orange: #cb4b16  red:    #dc322f  magenta:#d33682
// violet: #6c71c4  blue:   #268bd2  cyan:   #2aa198  green:  #859900

export const solarizedLight: ThemeDefinition = {
    id: "solarized-light",
    name: "Solarized Light",
    isDark: false,
    colors: {
        // background
        "--color-bg-default": "#FDF6E3",
        "--color-bg-dark": "#EEE8D5",
        "--color-bg-light": "#DDD6C1",
        "--color-bg-selection": "#DFCA88",
        "--color-bg-scrollbar": "#DDD6C1",
        "--color-bg-scrollbar-thumb": "rgba(101, 123, 131, 0.3)",
        "--color-bg-message": "#DDD6C1",
        "--color-bg-overlay": "rgba(253, 246, 227, 0.8)",
        "--color-bg-overlay-hover": "rgba(253, 246, 227, 0.9)",

        // text
        "--color-text-default": "#657B83",
        "--color-text-dark": "#586E75",
        "--color-text-light": "#93A1A1",
        "--color-text-selection": "#073642",
        "--color-text-strong": "#073642",

        // icon
        "--color-icon-default": "#657B83",
        "--color-icon-dark": "#586E75",
        "--color-icon-light": "#93A1A1",
        "--color-icon-disabled": "#D3CDB8",
        "--color-icon-selection": "#073642",
        "--color-icon-active": "#AC9D57",

        // border
        "--color-border-active": "#b49471",
        "--color-border-default": "#D3CDB8",
        "--color-border-light": "#E8E2CF",

        // shadow
        "--color-shadow-default": "rgba(0, 0, 0, 0.12)",

        // grid
        "--color-grid-header-bg": "#EEE8D5",
        "--color-grid-header-color": "#657B83",
        "--color-grid-data-bg": "#FDF6E3",
        "--color-grid-border": "#D3CDB8",
        "--color-grid-data-color": "#657B83",
        "--color-grid-sel-selected": "rgba(223, 202, 136, 0.4)",
        "--color-grid-sel-hovered": "rgba(223, 202, 136, 0.3)",
        "--color-grid-sel-border": "#b49471",
        "--color-grid-sel-border-light": "#D3CDB8",

        // misc
        "--color-misc-blue": "#268bd2",
        "--color-misc-green": "#859900",
        "--color-misc-red": "#dc322f",
        "--color-misc-yellow": "#b58900",

        // error
        "--color-error-bg": "#FDF6E3",
        "--color-error-text": "#dc322f",
        "--color-error-border": "#FDF6E3",
        "--color-error-text-hover": "#cb4b16",

        // success
        "--color-success-bg": "#FDF6E3",
        "--color-success-text": "#268bd2",
        "--color-success-border": "#FDF6E3",
        "--color-success-text-hover": "#2176b8",

        // warning
        "--color-warning-bg": "#FDF6E3",
        "--color-warning-text": "#b58900",
        "--color-warning-border": "#FDF6E3",
        "--color-warning-text-hover": "#a07800",

        // minimap slider
        "--color-minimap-bg": "rgba(101, 123, 131, 0.15)",
        "--color-minimap-hover-bg": "rgba(101, 123, 131, 0.25)",
        "--color-minimap-active-bg": "rgba(88, 110, 117, 0.3)",
    },
    monaco: {
        base: "vs",
        colors: {
            "editor.background": "#FDF6E3",
            "menu.background": "#FDF6E3",
            "menu.foreground": "#657B83",
            "menu.selectionBackground": "#DDD6C1",
            "menu.selectionForeground": "#586E75",
            "menu.separatorBackground": "#D3CDB8",
            "menu.border": "#D3CDB8",
        },
    },
};
