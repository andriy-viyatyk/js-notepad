// Color palette based on VSCode's Light Modern theme.
// Copyright (c) Microsoft Corporation. Licensed under MIT.
// https://github.com/microsoft/vscode/blob/main/LICENSE.txt

import { ThemeDefinition } from "./types";

// Light Modern palette reference:
// bg:       #FFFFFF  bg-dark:  #F8F8F8  bg-light: #F3F3F3
// fg:       #3B3B3B  fg-light: #6E7681  accent:   #005FB8
// border:   #E5E5E5  selection:#005FB8

export const lightModern: ThemeDefinition = {
    id: "light-modern",
    name: "Light Modern",
    isDark: false,
    colors: {
        // background
        "--color-bg-default": "#FFFFFF",
        "--color-bg-dark": "#F8F8F8",
        "--color-bg-light": "#F3F3F3",
        "--color-bg-selection": "#005FB8",
        "--color-bg-scrollbar": "#F3F3F3",
        "--color-bg-scrollbar-thumb": "rgba(100, 100, 100, 0.4)",
        "--color-bg-message": "#F3F3F3",
        "--color-bg-overlay": "rgba(255, 255, 255, 0.8)",
        "--color-bg-overlay-hover": "rgba(255, 255, 255, 0.9)",

        // text
        "--color-text-default": "#3B3B3B",
        "--color-text-dark": "#3B3B3B",
        "--color-text-light": "#6E7681",
        "--color-text-selection": "#FFFFFF",
        "--color-text-strong": "#000000",

        // icon
        "--color-icon-default": "#3B3B3B",
        "--color-icon-dark": "#3B3B3B",
        "--color-icon-light": "#6E7681",
        "--color-icon-disabled": "#C0C0C0",
        "--color-icon-selection": "#FFFFFF",
        "--color-icon-active": "#005FB8",

        // border
        "--color-border-active": "#005FB8",
        "--color-border-default": "#E5E5E5",
        "--color-border-light": "#F0F0F0",

        // shadow
        "--color-shadow-default": "rgba(0, 0, 0, 0.16)",

        // grid
        "--color-grid-header-bg": "#F8F8F8",
        "--color-grid-header-color": "#3B3B3B",
        "--color-grid-data-bg": "#FFFFFF",
        "--color-grid-border": "#E5E5E5",
        "--color-grid-data-color": "#3B3B3B",
        "--color-grid-sel-selected": "rgba(0, 95, 184, 0.15)",
        "--color-grid-sel-hovered": "rgba(0, 95, 184, 0.1)",
        "--color-grid-sel-border": "#005FB8",
        "--color-grid-sel-border-light": "#E5E5E5",

        // misc
        "--color-misc-blue": "#005FB8",
        "--color-misc-green": "#1A7F37",
        "--color-misc-red": "#CF222E",
        "--color-misc-yellow": "#9A6700",

        // error
        "--color-error-bg": "#FFFFFF",
        "--color-error-text": "#CF222E",
        "--color-error-border": "#FFFFFF",
        "--color-error-text-hover": "#A4111E",

        // success
        "--color-success-bg": "#FFFFFF",
        "--color-success-text": "#005FB8",
        "--color-success-border": "#FFFFFF",
        "--color-success-text-hover": "#004C93",

        // warning
        "--color-warning-bg": "#FFFFFF",
        "--color-warning-text": "#9A6700",
        "--color-warning-border": "#FFFFFF",
        "--color-warning-text-hover": "#7D5200",

        // minimap slider
        "--color-minimap-bg": "rgba(100, 100, 100, 0.2)",
        "--color-minimap-hover-bg": "rgba(100, 100, 100, 0.35)",
        "--color-minimap-active-bg": "rgba(0, 0, 0, 0.25)",
    },
    monaco: {
        base: "vs",
        colors: {
            "editor.background": "#FFFFFF",
            "menu.background": "#FFFFFF",
            "menu.foreground": "#3B3B3B",
            "menu.selectionBackground": "#005FB8",
            "menu.selectionForeground": "#FFFFFF",
            "menu.separatorBackground": "#E5E5E5",
            "menu.border": "#CECECE",
        },
    },
};
