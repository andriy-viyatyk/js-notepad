function getVsCodeCssColor(cssVariableName: string, defaultValue = '#cccccc') {
    const bodyStyles = window.getComputedStyle(document.body);
    const resolvedValue = bodyStyles.getPropertyValue(cssVariableName).trim();

    if (resolvedValue && !resolvedValue.startsWith('var(')) {
        return resolvedValue;
    }

    return defaultValue;
}

const vscode = {
    focusBorder: "#007acc",
    editor: {
        background: "#1f1f1f",
        foreground: "#cccccc",
        selectionBackground: "#264f78",
        selectionHighlightBackground: "rgba(173, 214, 255, 0.15)",
    },
    editorInlayHint: {
        background: "rgba(97, 97, 97, 0.1)",
        foreground: "#969696",
    },
    sidebar: {
        background: "#181818",
        foreground: "#cccccc",
        border: "#2b2b2b",
    },
    widget: {
        border: "#313131",
        shadow: "rgba(0, 0, 0, 0.36)",
    },
    input: {
        background: "#313131",
        foreground: "#cccccc",
        border: "#3c3c3c",
    },
    icon: {
        foreground: "#cccccc",
        disabled:
            "#585858",
    },
    minimapSlider: {
        background:
            "rgba(121, 121, 121, 0.2)",
        hoverBackground:
            "rgba(100, 100, 100, 0.35)",
        activeBackground:
            "rgba(191, 191, 191, 0.2)",
    },
    terminal: {
        ansiBlack: "#000000",
        ansiRed: "#cd3131",
        ansiGreen: "#0dbc79",
        ansiYellow: "#e5e510",
        ansiBlue: "#2472c8",
        ansiMagenta: "#bc3fbc",
        ansiCyan: "#11a8cd",
        ansiWhite: "#e5e5e5",
        ansiBrightBlack: "#666666",
        ansiBrightRed: "#f14c4c",
        ansiBrightGreen: "#23d18b",
        ansiBrightYellow: "#f5f543",
        ansiBrightBlue: "#3b8eea",
        ansiBrightMagenta: "#d670d6",
        ansiBrightCyan: "#29b8db",
    },
    terminalSymbolIcon: {
        methodForeground:
            "#b180d7",
        argumentForeground:
            "#75beff",
        optionForeground:
            "#ee9d28",
    },
    list: {
        errorForeground: "#f88070",
        warningForeground: "#cca700",
        highlightForeground: "#2aaaff",
    },
    charts: {
        red: "#f14c4c",
        blue: "#3794ff",
        yellow: "#cca700",
        orange: "#d18616",
        green: "#89d185",
        purple: "#b180d7",
    },
    button: {
        secondaryBackground:
            "#313131",
        background: "#0078d4",
        hoverBackground: "#026ec1",
        activeSelectionForeground:
            "#ffffff",
        foreground: "#ffffff",
    },
};

const color = {
    background: {
        default: vscode.editor.background,
        dark: vscode.sidebar.background,
        light: vscode.button.secondaryBackground,
        selection: vscode.button.background,
        scrollBar: vscode.widget.border,
        scrollBarThumb: vscode.minimapSlider.background,
        message: vscode.button.secondaryBackground,
    },
    text: {
        default: vscode.editor.foreground,
        dark: vscode.editor.foreground,
        light: vscode.editorInlayHint.foreground,
        selection: vscode.button.foreground,
    },
    icon: {
        default: vscode.icon.foreground,
        dark: vscode.icon.foreground,
        light: vscode.editorInlayHint.foreground,
        disabled: vscode.icon.disabled,
        selection: vscode.button.foreground,
        active: vscode.button.hoverBackground,
    },
    border: {
        active: vscode.focusBorder,
        default: vscode.input.border,
        light: vscode.sidebar.border,
    },
    shadow: {
        default: vscode.widget.shadow,
    },
    grid: {
        headerCellBackground: vscode.sidebar.background,
        headerCellColor: vscode.sidebar.foreground,
        dataCellBackground: vscode.editor.background,
        borderColor: vscode.sidebar.border,
        dataCellColor: vscode.editor.foreground,
        selectionColor: {
            selected: vscode.minimapSlider.background,
            hovered: vscode.minimapSlider.background,
            border: vscode.focusBorder,
            borderLight: vscode.input.border,
        },
    },
    misc: {
        blue: vscode.charts.blue,
        green: vscode.charts.green,
        red: vscode.list.errorForeground,
        yellow: vscode.charts.yellow,
        cian: vscode.terminal.ansiBrightCyan,
    },
    graph: {
        node: {
            default: "deepskyblue",
            highlight: "limegreen",
            selected: "lightpink",
        },
        nodeBorder: {
            default: "deepskyblue",
            highlight: "forestgreen",
            selected: "salmon",
        },
        link: {
            default: "lightslategray",
            selected: "lightpink",
        },
        getLabelColors: () => ({
            background: getVsCodeCssColor("--vscode-minimapSlider-background", "rgba(121, 121, 121, 0.2)"), // vscode.minimapSlider.background,
            text: getVsCodeCssColor("--vscode-editor-foreground", "#cccccc"), // vscode.editor.foreground,
        }),
        svg: {
            background: vscode.editor.background,
        },
    },
    error: {
        background: "#000000",
        text: "#f88070",
        border: "#000000",
        textHover: "#f88070",
    },
    success: {
        background: "#000000",
        text: "#2aaaff",
        border: "#000000",
        textHover: "#2aaaff",
    },
    warning: {
        background: "#000000",
        text: "#cca700",
        border: "#000000",
        textHover: "#cca700",
    }
};

export default color;
