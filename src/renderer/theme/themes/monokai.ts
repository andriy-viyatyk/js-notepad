// Color palette based on VSCode's Monokai theme.
// Copyright (c) Microsoft Corporation. Licensed under MIT.
// https://github.com/microsoft/vscode/blob/main/LICENSE.txt

import { ThemeDefinition } from "./types";

// Monokai palette reference:
// bg:      #272822  bg-light: #3e3d32  highlight: #49483e
// fg:      #f8f8f2  comment:  #75715e
// red:     #f92672  orange:   #fd971f  yellow: #e6db74
// green:   #a6e22e  cyan:     #66d9ef  purple: #ae81ff

export const monokai: ThemeDefinition = {
    id: "monokai",
    name: "Monokai",
    isDark: true,
    colors: {
        // background
        "--color-bg-default": "#272822",
        "--color-bg-dark": "#1e1f1c",
        "--color-bg-light": "#3e3d32",
        "--color-bg-selection": "#49483e",
        "--color-bg-scrollbar": "#3e3d32",
        "--color-bg-scrollbar-thumb": "rgba(121, 121, 121, 0.25)",
        "--color-bg-message": "#3e3d32",
        "--color-bg-overlay": "rgba(0, 0, 0, 0.5)",
        "--color-bg-overlay-hover": "rgba(0, 0, 0, 0.7)",

        // text
        "--color-text-default": "#f8f8f2",
        "--color-text-dark": "#f8f8f2",
        "--color-text-light": "#75715e",
        "--color-text-selection": "#f8f8f2",
        "--color-text-strong": "#f8f8f0",

        // icon
        "--color-icon-default": "#f8f8f2",
        "--color-icon-dark": "#f8f8f2",
        "--color-icon-light": "#75715e",
        "--color-icon-disabled": "#525046",
        "--color-icon-selection": "#f8f8f2",
        "--color-icon-active": "#529ebc",

        // border
        "--color-border-active": "#66d9ef",
        "--color-border-default": "#49483e",
        "--color-border-light": "#3e3d32",

        // shadow
        "--color-shadow-default": "rgba(0, 0, 0, 0.4)",

        // grid
        "--color-grid-header-bg": "#1e1f1c",
        "--color-grid-header-color": "#f8f8f2",
        "--color-grid-data-bg": "#272822",
        "--color-grid-border": "#3e3d32",
        "--color-grid-data-color": "#f8f8f2",
        "--color-grid-sel-selected": "rgba(73, 72, 62, 0.5)",
        "--color-grid-sel-hovered": "rgba(73, 72, 62, 0.5)",
        "--color-grid-sel-border": "#66d9ef",
        "--color-grid-sel-border-light": "#49483e",

        // misc
        "--color-misc-blue": "#66d9ef",
        "--color-misc-green": "#a6e22e",
        "--color-misc-red": "#f92672",
        "--color-misc-yellow": "#e6db74",

        // error
        "--color-error-bg": "#272822",
        "--color-error-text": "#f92672",
        "--color-error-border": "#272822",
        "--color-error-text-hover": "#f92672",

        // success
        "--color-success-bg": "#272822",
        "--color-success-text": "#66d9ef",
        "--color-success-border": "#272822",
        "--color-success-text-hover": "#66d9ef",

        // warning
        "--color-warning-bg": "#272822",
        "--color-warning-text": "#fd971f",
        "--color-warning-border": "#272822",
        "--color-warning-text-hover": "#fd971f",

        // highlight
        "--color-highlight-active-match": "rgba(230, 219, 116, 0.35)",

        // minimap slider
        "--color-minimap-bg": "rgba(121, 121, 121, 0.2)",
        "--color-minimap-hover-bg": "rgba(121, 121, 121, 0.35)",
        "--color-minimap-active-bg": "rgba(150, 150, 150, 0.2)",
    },
    monaco: {
        base: "vs-dark",
        colors: {
            "editor.background": "#272822",
            "menu.background": "#272822",
            "menu.foreground": "#f8f8f2",
            "menu.selectionBackground": "#49483e",
            "menu.selectionForeground": "#f8f8f2",
            "menu.separatorBackground": "#3e3d32",
            "menu.border": "#3e3d32",
        },
    },
};
