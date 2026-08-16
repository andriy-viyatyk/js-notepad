// Color palette based on VSCode's Quiet Light theme.
// Copyright (c) Microsoft Corporation. Licensed under MIT.
// https://github.com/microsoft/vscode/blob/main/LICENSE.txt

import { ThemeDefinition } from "./types";

// Quiet Light palette reference (VSCode built-in):
// bg:       #F5F5F5  sideBar:  #F2F2F2  titleBar: #c4b7d7
// fg:       #333333  fg-light: #777777  accent:   #9769dc
// selection:#c4d9b1  border:   #DDDDDD

export const quietLight: ThemeDefinition = {
    id: "quiet-light",
    name: "Quiet Light",
    isDark: false,
    colors: {
        // background
        "--color-bg-default": "#F5F5F5",
        "--color-bg-dark": "#E8E0F0",
        "--color-bg-light": "#EBEBEB",
        "--color-bg-selection": "#c4d9b1",
        "--color-bg-tree-selection": "#c4d9b1",
        "--color-bg-scrollbar": "#EBEBEB",
        "--color-bg-scrollbar-thumb": "rgba(100, 100, 100, 0.4)",
        "--color-bg-message": "#EBEBEB",
        "--color-bg-overlay": "rgba(245, 245, 245, 0.85)",
        "--color-bg-overlay-hover": "rgba(245, 245, 245, 0.95)",
        "--color-bg-webview": "#ffffff",
        "--color-bg-backdrop": "rgba(0, 0, 0, 0.3)",

        // text
        "--color-text-default": "#333333",
        "--color-text-dark": "#333333",
        "--color-text-light": "#777777",
        "--color-text-selection": "#000000",
        "--color-text-strong": "#111111",

        // icon
        "--color-icon-default": "#333333",
        "--color-icon-dark": "#333333",
        "--color-icon-light": "#777777",
        "--color-icon-disabled": "#BBBBBB",
        "--color-icon-selection": "#000000",
        "--color-icon-active": "#705697",

        // border
        "--color-border-active": "#9769dc",
        "--color-border-default": "#DDDDDD",
        "--color-border-light": "#E8E8E8",

        // shadow
        "--color-shadow-default": "rgba(0, 0, 0, 0.14)",

        // grid
        "--color-grid-header-bg": "#E8E8E8",
        "--color-grid-header-color": "#333333",
        "--color-grid-data-bg": "#F5F5F5",
        "--color-grid-border": "#DDDDDD",
        "--color-grid-data-color": "#333333",
        "--color-grid-sel-selected": "rgba(196, 217, 177, 0.5)",
        "--color-grid-sel-hovered": "rgba(196, 217, 177, 0.3)",
        "--color-grid-sel-border": "#9769dc",
        "--color-grid-sel-border-light": "#DDDDDD",

        // misc
        "--color-misc-blue": "#4B69C6",
        "--color-misc-link": "#3f4e7d",
        "--color-misc-green": "#50A14F",
        "--color-misc-red": "#E45649",
        "--color-misc-yellow": "#C18401",
        "--color-misc-orange": "#d2691e",
        "--color-misc-vlc": "#ff8800",

        // error
        "--color-error-bg": "#F5F5F5",
        "--color-error-text": "#E45649",
        "--color-error-border": "#F5F5F5",
        "--color-error-text-hover": "#D04437",

        // success
        "--color-success-bg": "#F5F5F5",
        "--color-success-text": "#50A14F",
        "--color-success-border": "#F5F5F5",
        "--color-success-text-hover": "#408140",

        // primary
        "--color-primary-bg": "#F5F5F5",
        "--color-primary-text": "#4B69C6",
        "--color-primary-border": "#F5F5F5",
        "--color-primary-text-hover": "#3B59B6",

        // warning
        "--color-warning-bg": "#F5F5F5",
        "--color-warning-text": "#C18401",
        "--color-warning-border": "#F5F5F5",
        "--color-warning-text-hover": "#A87300",

        // highlight
        "--color-highlight-active-match": "rgba(255, 200, 0, 0.4)",

        // minimap slider
        "--color-minimap-bg": "rgba(100, 100, 100, 0.2)",
        "--color-minimap-hover-bg": "rgba(100, 100, 100, 0.3)",
        "--color-minimap-active-bg": "rgba(151, 105, 220, 0.25)",

        // graph
        "--color-graph-bg": "#F5F5F5",
        "--color-graph-node-default": "#4B69C6",
        "--color-graph-node-highlight": "#50A14F",
        "--color-graph-node-selected": "#E45649",
        "--color-graph-border-default": "#4B69C6",
        "--color-graph-border-highlight": "#50A14F",
        "--color-graph-border-selected": "#E45649",
        "--color-graph-link-default": "#BBBBBB",
        "--color-graph-link-selected": "#E45649",
        "--color-graph-label-bg": "rgba(235, 235, 235, 0.85)",
        "--color-graph-label-text": "#333333",
        "--color-graph-group-border": "#2a5a8a",
        "--color-graph-node-special": "#7c3aed",
        "--color-graph-border-special": "#6d28d9",
    },
    monaco: {
        base: "vs",
        colors: {
            "editor.background": "#F5F5F5",
            "menu.background": "#F5F5F5",
            "menu.foreground": "#333333",
            "menu.selectionBackground": "#c4d9b1",
            "menu.selectionForeground": "#000000",
            "menu.separatorBackground": "#DDDDDD",
            "menu.border": "#DDDDDD",
        },
    },
};
