// Color palette based on VSCode's Tomorrow Night Blue theme.
// Copyright (c) Microsoft Corporation. Licensed under MIT.
// https://github.com/microsoft/vscode/blob/main/LICENSE.txt

import { ThemeDefinition } from "./types";

// Tomorrow Night Blue palette reference (VSCode built-in):
// bg:       #002451  bg-dark:  #001126  bg-light: #001c40
// fg:       #ffffff  fg-dim:   #7285b7
// selection:#003f8e  highlight:#00346e  focus:    #bbdaff
// accent:   #bbdaff  input:    #001733  error:    #a92049

export const tomorrowNightBlue: ThemeDefinition = {
    id: "tomorrow-night-blue",
    name: "Tomorrow Night Blue",
    colors: {
        // background
        "--color-bg-default": "#002451",
        "--color-bg-dark": "#001126",
        "--color-bg-light": "#001c40",
        "--color-bg-selection": "#003f8e",
        "--color-bg-scrollbar": "#001c40",
        "--color-bg-scrollbar-thumb": "rgba(187, 218, 255, 0.2)",
        "--color-bg-message": "#001c40",
        "--color-bg-overlay": "rgba(0, 0, 0, 0.5)",
        "--color-bg-overlay-hover": "rgba(0, 0, 0, 0.7)",

        // text
        "--color-text-default": "#ffffff",
        "--color-text-dark": "#ffffff",
        "--color-text-light": "#7285b7",
        "--color-text-selection": "#ffffff",
        "--color-text-strong": "#ffffff",

        // icon
        "--color-icon-default": "#ffffff",
        "--color-icon-dark": "#ffffff",
        "--color-icon-light": "#7285b7",
        "--color-icon-disabled": "#3a5080",
        "--color-icon-selection": "#ffffff",
        "--color-icon-active": "#bbdaff",

        // border
        "--color-border-active": "#bbdaff",
        "--color-border-default": "#10346e",
        "--color-border-light": "#001c40",

        // shadow
        "--color-shadow-default": "rgba(0, 0, 0, 0.5)",

        // grid
        "--color-grid-header-bg": "#001126",
        "--color-grid-header-color": "#ffffff",
        "--color-grid-data-bg": "#002451",
        "--color-grid-border": "#001c40",
        "--color-grid-data-color": "#ffffff",
        "--color-grid-sel-selected": "rgba(0, 63, 142, 0.5)",
        "--color-grid-sel-hovered": "rgba(0, 63, 142, 0.5)",
        "--color-grid-sel-border": "#bbdaff",
        "--color-grid-sel-border-light": "#10346e",

        // misc
        "--color-misc-blue": "#bbdaff",
        "--color-misc-green": "#d1f1a9",
        "--color-misc-red": "#ff9da4",
        "--color-misc-yellow": "#ffeead",

        // error
        "--color-error-bg": "#002451",
        "--color-error-text": "#ff9da4",
        "--color-error-border": "#002451",
        "--color-error-text-hover": "#ff9da4",

        // success
        "--color-success-bg": "#002451",
        "--color-success-text": "#bbdaff",
        "--color-success-border": "#002451",
        "--color-success-text-hover": "#bbdaff",

        // warning
        "--color-warning-bg": "#002451",
        "--color-warning-text": "#ffeead",
        "--color-warning-border": "#002451",
        "--color-warning-text-hover": "#ffeead",

        // minimap slider
        "--color-minimap-bg": "rgba(187, 218, 255, 0.15)",
        "--color-minimap-hover-bg": "rgba(187, 218, 255, 0.3)",
        "--color-minimap-active-bg": "rgba(187, 218, 255, 0.25)",
    },
    monaco: {
        base: "vs-dark",
        colors: {
            "editor.background": "#002451",
            "menu.background": "#002451",
            "menu.foreground": "#ffffff",
            "menu.selectionBackground": "#003f8e",
            "menu.selectionForeground": "#ffffff",
            "menu.separatorBackground": "#10346e",
            "menu.border": "#10346e",
        },
    },
};
