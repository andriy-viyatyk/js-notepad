// Color palette based on VSCode's Default Dark Modern theme.
// Copyright (c) Microsoft Corporation. Licensed under MIT.
// https://github.com/microsoft/vscode/blob/main/LICENSE.txt

import { ThemeDefinition } from "./types";

// ==========================================================================
// VSCode Color Mapping Reference
// ==========================================================================
// Use this table when porting a VSCode theme. For each CSS variable below,
// find the corresponding VSCode color token in the theme JSON and use its value.
//
// CSS Variable                    VSCode Color Token(s)
// ─────────────────────────────── ──────────────────────────────────────────
// --color-bg-default              editor.background
// --color-bg-dark                 titleBar.activeBackground, sideBar.background
// --color-bg-light                input.background, editorWidget.background
// --color-bg-selection            list.activeSelectionBackground
// --color-bg-scrollbar            (derived from bg-light)
// --color-bg-scrollbar-thumb      scrollbarSlider.background
// --color-bg-message              (derived from bg-light)
// --color-bg-overlay              (semi-transparent black — modal backdrop)
// --color-bg-overlay-hover        (darker semi-transparent — hover state)
//
// --color-text-default            editor.foreground
// --color-text-dark               foreground (usually same as default)
// --color-text-light              editorLineNumber.foreground, descriptionForeground
// --color-text-selection          list.activeSelectionForeground
// --color-text-strong             (brighter variant of text-default)
//
// --color-icon-default            icon.foreground (usually same as text-default)
// --color-icon-dark               (usually same as icon-default)
// --color-icon-light              (usually same as text-light)
// --color-icon-disabled           (muted variant ~35% lightness of bg)
// --color-icon-selection          (usually same as text-selection)
// --color-icon-active             button.background, activityBar accent
//
// --color-border-active           focusBorder
// --color-border-default          panel.border, editorGroup.border
// --color-border-light            (subtle border, darker than default)
//
// --color-shadow-default          widget.shadow
//
// --color-grid-*                  (custom — derived from bg/text/border tokens)
//
// --color-misc-blue               textLink.foreground
// --color-misc-green              terminal.ansiGreen, testing.iconPassed
// --color-misc-red                errorForeground, testing.iconFailed
// --color-misc-yellow             editorWarning.foreground
//
// --color-error-*                 inputValidation.errorBackground/Border
// --color-success-*               inputValidation.infoBackground/Border
// --color-warning-*               inputValidation.warningBackground/Border
//
// --color-minimap-bg              minimapSlider.background
// --color-minimap-hover-bg        minimapSlider.hoverBackground
// --color-minimap-active-bg       minimapSlider.activeBackground
//
// monaco.base                     "vs-dark" for dark themes, "vs" for light
// monaco.colors                   Direct VSCode editor color overrides
// ==========================================================================

export const defaultDark: ThemeDefinition = {
    id: "default-dark",
    name: "Default Dark",
    isDark: true,
    colors: {
        // background
        "--color-bg-default": "#1f1f1f",
        "--color-bg-dark": "#181818",
        "--color-bg-light": "#313131",
        "--color-bg-selection": "#0078d4",
        "--color-bg-scrollbar": "#313131",
        "--color-bg-scrollbar-thumb": "rgba(121, 121, 121, 0.2)",
        "--color-bg-message": "#313131",
        "--color-bg-overlay": "rgba(0, 0, 0, 0.6)",
        "--color-bg-overlay-hover": "rgba(0, 0, 0, 0.8)",

        // text
        "--color-text-default": "#cccccc",
        "--color-text-dark": "#cccccc",
        "--color-text-light": "#969696",
        "--color-text-selection": "#ffffff",
        "--color-text-strong": "#dddddd",

        // icon
        "--color-icon-default": "#cccccc",
        "--color-icon-dark": "#cccccc",
        "--color-icon-light": "#969696",
        "--color-icon-disabled": "#585858",
        "--color-icon-selection": "#ffffff",
        "--color-icon-active": "#026ec1",

        // border
        "--color-border-active": "#007acc",
        "--color-border-default": "#3c3c3c",
        "--color-border-light": "#2b2b2b",

        // shadow
        "--color-shadow-default": "rgba(0, 0, 0, 0.36)",

        // grid
        "--color-grid-header-bg": "#181818",
        "--color-grid-header-color": "#cccccc",
        "--color-grid-data-bg": "#1f1f1f",
        "--color-grid-border": "#2b2b2b",
        "--color-grid-data-color": "#cccccc",
        "--color-grid-sel-selected": "rgba(121, 121, 121, 0.2)",
        "--color-grid-sel-hovered": "rgba(121, 121, 121, 0.2)",
        "--color-grid-sel-border": "#007acc",
        "--color-grid-sel-border-light": "#3c3c3c",

        // misc
        "--color-misc-blue": "#3794ff",
        "--color-misc-green": "#89d185",
        "--color-misc-red": "#f88070",
        "--color-misc-yellow": "#cca700",

        // error
        "--color-error-bg": "#000000",
        "--color-error-text": "#f88070",
        "--color-error-border": "#000000",
        "--color-error-text-hover": "#f88070",

        // success
        "--color-success-bg": "#000000",
        "--color-success-text": "#2aaaff",
        "--color-success-border": "#000000",
        "--color-success-text-hover": "#2aaaff",

        // warning
        "--color-warning-bg": "#000000",
        "--color-warning-text": "#cca700",
        "--color-warning-border": "#000000",
        "--color-warning-text-hover": "#cca700",

        // highlight
        "--color-highlight-active-match": "rgba(255, 200, 0, 0.35)",

        // minimap slider
        "--color-minimap-bg": "rgba(121, 121, 121, 0.2)",
        "--color-minimap-hover-bg": "rgba(100, 100, 100, 0.35)",
        "--color-minimap-active-bg": "rgba(191, 191, 191, 0.2)",
    },
    monaco: {
        base: "vs-dark",
        colors: {
            "editor.background": "#1f1f1f",
            "menu.background": "#1f1f1f",
            "menu.foreground": "#cccccc",
            "menu.selectionBackground": "#0078d4",
            "menu.selectionForeground": "#ffffff",
            "menu.separatorBackground": "#3c3c3c",
            "menu.border": "#3c3c3c",
        },
    },
};
