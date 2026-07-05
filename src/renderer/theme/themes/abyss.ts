// Color palette based on VSCode's Abyss theme.
// Copyright (c) Microsoft Corporation. Licensed under MIT.
// https://github.com/microsoft/vscode/blob/main/LICENSE.txt

import { ThemeDefinition } from "./types";

// Abyss palette reference (VSCode built-in):
// bg:       #000c18  bg-dark:  #060621  bg-light: #10192c
// fg:       #6688cc  fg-light: #406385  fg-bright:#80a2c2
// selection:#770811  highlight:#082050  focus:    #596F99
// accent:   #2B3C5D  input:    #181f2f  border:   #2b2b4a

export const abyss: ThemeDefinition = {
    id: "abyss",
    name: "Abyss",
    isDark: true,
    colors: {
        // background
        "--color-bg-default": "#000c18",
        "--color-bg-dark": "#060621",
        "--color-bg-light": "#10192c",
        "--color-bg-selection": "#08286b",
        "--color-bg-tree-selection": "#08286b",
        "--color-bg-scrollbar": "#10192c",
        "--color-bg-scrollbar-thumb": "rgba(31, 34, 48, 0.67)",
        "--color-bg-message": "#10192c",
        "--color-bg-overlay": "rgba(0, 0, 0, 0.5)",
        "--color-bg-overlay-hover": "rgba(0, 0, 0, 0.7)",

        // text
        "--color-text-default": "#6688cc",
        "--color-text-dark": "#6688cc",
        "--color-text-light": "#406385",
        "--color-text-selection": "#ffffff",
        "--color-text-strong": "#80a2c2",

        // icon
        "--color-icon-default": "#6688cc",
        "--color-icon-dark": "#6688cc",
        "--color-icon-light": "#406385",
        "--color-icon-disabled": "#2b3c5d",
        "--color-icon-selection": "#ffffff",
        "--color-icon-active": "#596F99",

        // border
        "--color-border-active": "#596F99",
        "--color-border-default": "#2b2b4a",
        "--color-border-light": "#10192c",

        // shadow
        "--color-shadow-default": "rgba(0, 0, 0, 0.5)",

        // grid
        "--color-grid-header-bg": "#060621",
        "--color-grid-header-color": "#6688cc",
        "--color-grid-data-bg": "#000c18",
        "--color-grid-border": "#10192c",
        "--color-grid-data-color": "#6688cc",
        "--color-grid-sel-selected": "rgba(8, 40, 107, 0.4)",
        "--color-grid-sel-hovered": "rgba(8, 40, 107, 0.4)",
        "--color-grid-sel-border": "#596F99",
        "--color-grid-sel-border-light": "#2b2b4a",

        // misc
        "--color-misc-blue": "#6688cc",
        // text.default is also #6688cc, so a 50/50 blend would be invisible —
        // brighten instead so links stand out against the body text.
        "--color-misc-link": "#9fc4f5",
        "--color-misc-green": "#22aa44",
        "--color-misc-red": "#ff4444",
        "--color-misc-yellow": "#ddbb88",
        "--color-misc-orange": "#e8833a",
        "--color-misc-vlc": "#ff8800",

        // error
        "--color-error-bg": "#000c18",
        "--color-error-text": "#ff4444",
        "--color-error-border": "#000c18",
        "--color-error-text-hover": "#ff4444",

        // success
        "--color-success-bg": "#000c18",
        "--color-success-text": "#22aa44",
        "--color-success-border": "#000c18",
        "--color-success-text-hover": "#22aa44",

        // primary
        "--color-primary-bg": "#000c18",
        "--color-primary-text": "#6688cc",
        "--color-primary-border": "#000c18",
        "--color-primary-text-hover": "#6688cc",

        // warning
        "--color-warning-bg": "#000c18",
        "--color-warning-text": "#ddbb88",
        "--color-warning-border": "#000c18",
        "--color-warning-text-hover": "#ddbb88",

        // highlight
        "--color-highlight-active-match": "rgba(255, 200, 0, 0.3)",

        // minimap slider
        "--color-minimap-bg": "rgba(31, 34, 48, 0.4)",
        "--color-minimap-hover-bg": "rgba(59, 63, 81, 0.53)",
        "--color-minimap-active-bg": "rgba(59, 63, 81, 0.53)",

        // graph
        "--color-graph-bg": "#000c18",
        "--color-graph-node-default": "#00bfff",
        "--color-graph-node-highlight": "#32cd32",
        "--color-graph-node-selected": "#ffb6c1",
        "--color-graph-border-default": "#00bfff",
        "--color-graph-border-highlight": "#228b22",
        "--color-graph-border-selected": "#fa8072",
        "--color-graph-link-default": "#778899",
        "--color-graph-link-selected": "#ffb6c1",
        "--color-graph-label-bg": "rgba(31, 34, 48, 0.4)",
        "--color-graph-label-text": "#6688cc",
        "--color-graph-group-border": "#3a6ea5",
        "--color-graph-node-special": "#b07ce8",
        "--color-graph-border-special": "#9055c8",
    },
    monaco: {
        base: "vs-dark",
        colors: {
            "editor.background": "#000c18",
            "menu.background": "#000c18",
            "menu.foreground": "#6688cc",
            "menu.selectionBackground": "#08286b",
            "menu.selectionForeground": "#ffffff",
            "menu.separatorBackground": "#2b2b4a",
            "menu.border": "#2b2b4a",
        },
    },
};
