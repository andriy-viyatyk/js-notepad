// Color palette based on VSCode's Solarized Dark theme.
// Copyright (c) Microsoft Corporation. Licensed under MIT.
// https://github.com/microsoft/vscode/blob/main/LICENSE.txt

import { ThemeDefinition } from "./types";

// Solarized Dark palette reference:
// base03: #002b36  base02: #073642  base01: #586e75  base00: #657b83
// base0:  #839496  base1:  #93a1a1  base2:  #eee8d5  base3:  #fdf6e3
// yellow: #b58900  orange: #cb4b16  red:    #dc322f  magenta:#d33682
// violet: #6c71c4  blue:   #268bd2  cyan:   #2aa198  green:  #859900

export const solarizedDark: ThemeDefinition = {
    id: "solarized-dark",
    name: "Solarized Dark",
    colors: {
        // background
        "--color-bg-default": "#002b36",
        "--color-bg-dark": "#00212b",
        "--color-bg-light": "#073642",
        "--color-bg-selection": "#268bd2",
        "--color-bg-scrollbar": "#073642",
        "--color-bg-scrollbar-thumb": "rgba(131, 148, 150, 0.25)",
        "--color-bg-message": "#073642",
        "--color-bg-overlay": "rgba(0, 0, 0, 0.5)",
        "--color-bg-overlay-hover": "rgba(0, 0, 0, 0.7)",

        // text
        "--color-text-default": "#839496",
        "--color-text-dark": "#839496",
        "--color-text-light": "#586e75",
        "--color-text-selection": "#fdf6e3",
        "--color-text-strong": "#93a1a1",

        // icon
        "--color-icon-default": "#839496",
        "--color-icon-dark": "#839496",
        "--color-icon-light": "#586e75",
        "--color-icon-disabled": "#405055",
        "--color-icon-selection": "#fdf6e3",
        "--color-icon-active": "#2176b8",

        // border
        "--color-border-active": "#268bd2",
        "--color-border-default": "#0a4a5c",
        "--color-border-light": "#073642",

        // shadow
        "--color-shadow-default": "rgba(0, 0, 0, 0.5)",

        // grid
        "--color-grid-header-bg": "#00212b",
        "--color-grid-header-color": "#839496",
        "--color-grid-data-bg": "#002b36",
        "--color-grid-border": "#073642",
        "--color-grid-data-color": "#839496",
        "--color-grid-sel-selected": "rgba(131, 148, 150, 0.2)",
        "--color-grid-sel-hovered": "rgba(131, 148, 150, 0.2)",
        "--color-grid-sel-border": "#268bd2",
        "--color-grid-sel-border-light": "#0a4a5c",

        // misc
        "--color-misc-blue": "#268bd2",
        "--color-misc-green": "#859900",
        "--color-misc-red": "#dc322f",
        "--color-misc-yellow": "#b58900",

        // error
        "--color-error-bg": "#002b36",
        "--color-error-text": "#dc322f",
        "--color-error-border": "#002b36",
        "--color-error-text-hover": "#dc322f",

        // success
        "--color-success-bg": "#002b36",
        "--color-success-text": "#268bd2",
        "--color-success-border": "#002b36",
        "--color-success-text-hover": "#268bd2",

        // warning
        "--color-warning-bg": "#002b36",
        "--color-warning-text": "#b58900",
        "--color-warning-border": "#002b36",
        "--color-warning-text-hover": "#b58900",

        // minimap slider
        "--color-minimap-bg": "rgba(131, 148, 150, 0.15)",
        "--color-minimap-hover-bg": "rgba(131, 148, 150, 0.3)",
        "--color-minimap-active-bg": "rgba(147, 161, 161, 0.2)",
    },
    monaco: {
        base: "vs-dark",
        colors: {
            "editor.background": "#002b36",
            "menu.background": "#002b36",
            "menu.foreground": "#839496",
            "menu.selectionBackground": "#073642",
            "menu.selectionForeground": "#93a1a1",
            "menu.separatorBackground": "#073642",
            "menu.border": "#073642",
        },
    },
};
