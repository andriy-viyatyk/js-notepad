// Color palette based on VSCode's Red theme.
// Copyright (c) Microsoft Corporation. Licensed under MIT.
// https://github.com/microsoft/vscode/blob/main/LICENSE.txt

import { ThemeDefinition } from "./types";

// Red palette reference (VSCode built-in):
// bg:       #390000  bg-dark:  #300000  bg-light: #490000
// fg:       #f8f8f8  fg-dim:   #b89090
// selection:#750000  active:   #880000  hover:    #800000
// accent:   #cc3333  focus:    #ff6666aa  cursor: #970000
// input:    #580000  status:   #700000

export const red: ThemeDefinition = {
    id: "red",
    name: "Red",
    isDark: true,
    colors: {
        // background
        "--color-bg-default": "#390000",
        "--color-bg-dark": "#300000",
        "--color-bg-light": "#490000",
        "--color-bg-selection": "#880000",
        "--color-bg-scrollbar": "#490000",
        "--color-bg-scrollbar-thumb": "rgba(200, 100, 100, 0.25)",
        "--color-bg-message": "#490000",
        "--color-bg-overlay": "rgba(0, 0, 0, 0.5)",
        "--color-bg-overlay-hover": "rgba(0, 0, 0, 0.7)",

        // text
        "--color-text-default": "#f8f8f8",
        "--color-text-dark": "#f8f8f8",
        "--color-text-light": "#b89090",
        "--color-text-selection": "#ffffff",
        "--color-text-strong": "#ffffff",

        // icon
        "--color-icon-default": "#f8f8f8",
        "--color-icon-dark": "#f8f8f8",
        "--color-icon-light": "#b89090",
        "--color-icon-disabled": "#6e4040",
        "--color-icon-selection": "#ffffff",
        "--color-icon-active": "#cc3333",

        // border
        "--color-border-active": "#cc3333",
        "--color-border-default": "#580000",
        "--color-border-light": "#490000",

        // shadow
        "--color-shadow-default": "rgba(0, 0, 0, 0.5)",

        // grid
        "--color-grid-header-bg": "#300000",
        "--color-grid-header-color": "#f8f8f8",
        "--color-grid-data-bg": "#390000",
        "--color-grid-border": "#490000",
        "--color-grid-data-color": "#f8f8f8",
        "--color-grid-sel-selected": "rgba(136, 0, 0, 0.4)",
        "--color-grid-sel-hovered": "rgba(128, 0, 0, 0.4)",
        "--color-grid-sel-border": "#cc3333",
        "--color-grid-sel-border-light": "#580000",

        // misc
        "--color-misc-blue": "#6c9ef8",
        "--color-misc-green": "#7cc47c",
        "--color-misc-red": "#ff6666",
        "--color-misc-yellow": "#e8c87c",

        // error
        "--color-error-bg": "#300000",
        "--color-error-text": "#ff6666",
        "--color-error-border": "#300000",
        "--color-error-text-hover": "#ff6666",

        // success
        "--color-success-bg": "#300000",
        "--color-success-text": "#6c9ef8",
        "--color-success-border": "#300000",
        "--color-success-text-hover": "#6c9ef8",

        // warning
        "--color-warning-bg": "#300000",
        "--color-warning-text": "#e8c87c",
        "--color-warning-border": "#300000",
        "--color-warning-text-hover": "#e8c87c",

        // highlight
        "--color-highlight-active-match": "rgba(255, 200, 0, 0.35)",

        // minimap slider
        "--color-minimap-bg": "rgba(200, 100, 100, 0.15)",
        "--color-minimap-hover-bg": "rgba(200, 100, 100, 0.3)",
        "--color-minimap-active-bg": "rgba(220, 120, 120, 0.25)",
    },
    monaco: {
        base: "vs-dark",
        colors: {
            "editor.background": "#390000",
            "menu.background": "#390000",
            "menu.foreground": "#f8f8f8",
            "menu.selectionBackground": "#880000",
            "menu.selectionForeground": "#ffffff",
            "menu.separatorBackground": "#580000",
            "menu.border": "#580000",
        },
    },
};
