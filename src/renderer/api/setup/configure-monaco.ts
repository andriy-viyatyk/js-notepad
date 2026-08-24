import * as monaco from "monaco-editor";

import { getThemeById } from "../../theme/themes";
import { themeState } from "../../theme/theme-state";
import { ThemeDefinition } from "../../theme/themes/types";
import { defineRegLanguage } from "./monaco-languages/reg";
import { defineCSVLanguage } from "./monaco-languages/csv";
import { defineMermaidLanguage } from "./monaco-languages/mermaid";
import { defineJsonlLanguage } from "./monaco-languages/jsonl";
import { defineLogLanguage } from "./monaco-languages/log";
import { loadLibraryIntelliSense } from "./library-intellisense";


type Monaco = typeof monaco;
let monacoInstance: Monaco | null = null;

declare global {
    interface Window {
        require: NodeRequire;
    }
}

// Shared token rules for custom languages (SQL fixes, Mermaid, CSV rainbow)
const customTokenRules: monaco.editor.ITokenThemeRule[] = [
    // SQL colors fixes
    { token: "string.sql", foreground: "ce9178" },
    { token: "string.quoted.single.sql", foreground: "ce9178" },
    { token: "string.quoted.double.sql", foreground: "ce9178" },
    { token: "predefined.sql", foreground: "dcdcaa" },
    { token: "function.sql", foreground: "dcdcaa" },
    { token: "predefined.function.sql", foreground: "dcdcaa" },
    { token: "type.function.sql", foreground: "dcdcaa" },

    // Mermaid colors
    { token: "type.diagram.mermaid", foreground: "569cd6", fontStyle: "bold" },
    { token: "keyword.block.mermaid", foreground: "c586c0" },
    { token: "keyword.sequence.mermaid", foreground: "c586c0" },
    { token: "keyword.common.mermaid", foreground: "c586c0" },
    { token: "keyword.directive.mermaid", foreground: "c586c0" },
    { token: "operator.arrow.mermaid", foreground: "d4d4d4" },
    { token: "string.mermaid", foreground: "ce9178" },
    { token: "string.link.mermaid", foreground: "ce9178" },
    { token: "comment.mermaid", foreground: "6a9955" },
    { token: "constant.direction.mermaid", foreground: "4ec9b0" },
    { token: "constant.numeric.mermaid", foreground: "b5cea8" },
    { token: "constant.date.mermaid", foreground: "b5cea8" },
    { token: "constant.color.mermaid", foreground: "b5cea8" },
    { token: "constant.theme.mermaid", foreground: "4ec9b0" },
    { token: "metatag.mermaid", foreground: "6a9955", fontStyle: "italic" },
    { token: "identifier.mermaid", foreground: "9cdcfe" },
    { token: "bracket.mermaid", foreground: "ffd700" },
    { token: "bracket.round.mermaid", foreground: "ffd700" },
    { token: "bracket.square.mermaid", foreground: "ffd700" },
    { token: "bracket.mixed.mermaid", foreground: "ffd700" },

    // CSV Rainbow colors
    { token: "csv.column0", foreground: "20b2aa" },
    { token: "csv.column1", foreground: "1e90ff" },
    { token: "csv.column2", foreground: "ff69b4" },
    { token: "csv.column3", foreground: "808000" },
    { token: "csv.column4", foreground: "9370db" },
    { token: "csv.column5", foreground: "ffa500" },
    { token: "csv.column6", foreground: "bdb76b" },
    { token: "csv.column7", foreground: "00bfff" },
    { token: "csv.column8", foreground: "ff6347" },
    { token: "csv.column9", foreground: "32cd32" },
    { token: "delimiter.csv", foreground: "808080" },

    // Log file colors
    { token: "date.log", foreground: "6a9955" },
    { token: "keyword.error.log", foreground: "f44747" },
    { token: "keyword.warn.log", foreground: "cca700" },
    { token: "keyword.info.log", foreground: "4fc1ff" },
    { token: "keyword.debug.log", foreground: "4ec9b0" },
    { token: "keyword.trace.log", foreground: "6a9955" },
    { token: "string.log", foreground: "a0a0a0" },
    { token: "string.escape.log", foreground: "a0a0a0" },
    { token: "number.log", foreground: "b5cea8" },
    { token: "constant.log", foreground: "569cd6" },
    { token: "constant.guid.log", foreground: "b5cea8" },
    { token: "constant.url.log", foreground: "4fc1ff" },
];

export const MONACO_THEME_NAME = "custom-dark";

function defineMonacoTheme(monaco: Monaco, theme: ThemeDefinition) {
    monaco.editor.defineTheme(MONACO_THEME_NAME, {
        base: theme.monaco.base,
        inherit: true,
        rules: customTokenRules,
        colors: theme.monaco.colors,
    });
}

function applyMonacoTheme(theme: ThemeDefinition) {
    if (!monacoInstance) return;
    defineMonacoTheme(monacoInstance, theme);
    monacoInstance.editor.setTheme(MONACO_THEME_NAME);
}

function redefineKeybinding(monaco: Monaco) {
    monaco.editor.addKeybindingRules([
        {
            keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY,
            command: "editor.action.deleteLines",
        },
        {
            keybinding: monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.DownArrow,
            command: 'cursorColumnSelectDown'
        },
        {
            keybinding: monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.UpArrow,
            command: 'cursorColumnSelectUp'
        },
        {
            keybinding: monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.LeftArrow,
            command: 'cursorColumnSelectLeft'
        },
        {
            keybinding: monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.RightArrow,
            command: 'cursorColumnSelectRight'
        }
    ]);
    
}

function setupCompiler(monaco: Monaco) {
    monaco.css.cssDefaults.setOptions({
        validate: false,
    });

    monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
        noSuggestionDiagnostics: true,
    });

    monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
        noSuggestionDiagnostics: true,
    });

    const sharedPaths = {
        "library/*": ["file:///library/*"],
    };

    monaco.typescript.typescriptDefaults.setCompilerOptions({
        target: monaco.typescript.ScriptTarget.Latest,
        allowNonTsExtensions: true,
        moduleResolution:
            monaco.typescript.ModuleResolutionKind.NodeJs,
        module: monaco.typescript.ModuleKind.CommonJS,
        noEmit: true,
        esModuleInterop: true,
        jsx: monaco.typescript.JsxEmit.React,
        allowJs: true,
        typeRoots: [],
        paths: sharedPaths,
    });

    monaco.typescript.javascriptDefaults.setCompilerOptions({
        target: monaco.typescript.ScriptTarget.Latest,
        allowNonTsExtensions: true,
        moduleResolution:
            monaco.typescript.ModuleResolutionKind.NodeJs,
        module: monaco.typescript.ModuleKind.CommonJS,
        noEmit: true,
        esModuleInterop: true,
        allowJs: true,
        typeRoots: [],
        strictNullChecks: true,
        strict: true,
        paths: sharedPaths,
    });
}

async function loadEditorTypes(monaco: Monaco) {
    try {
        const response = await fetch("app-asset://editor-types/_imports.txt");
        if (!response.ok) {
            console.warn("Failed to load _imports.txt for editor types");
            return;
        }

        const typeFiles = (await response.text())
            .split("\n")
            .map((f) => f.trim())
            .filter((f) => f.length > 0);

        for (const file of typeFiles) {
            const response = await fetch(`app-asset://editor-types/${file}`);
            if (!response.ok) {
                console.warn(`Failed to load type definitions: ${file}`);
                continue;
            }

            const content = await response.text();

            // Add to both JavaScript and TypeScript
            monaco.typescript.javascriptDefaults.addExtraLib(
                content,
                `file:///node_modules/@types/custom/${file}`
            );

            monaco.typescript.typescriptDefaults.addExtraLib(
                content,
                `file:///node_modules/@types/custom/${file}`
            );
        }
    } catch (error) {
        console.error("Error loading custom type definitions:", error);
    }
}

export async function initMonaco() {
    if (monacoInstance) return monacoInstance;

    const currentTheme = getThemeById(themeState.get().id);
    if (currentTheme) {
        defineMonacoTheme(monaco, currentTheme);
    }

    redefineKeybinding(monaco);
    setupCompiler(monaco);

    defineRegLanguage(monaco);
    defineCSVLanguage(monaco);
    defineMermaidLanguage(monaco);
    defineJsonlLanguage(monaco);
    defineLogLanguage(monaco);

    await loadEditorTypes(monaco);
    loadLibraryIntelliSense();

    monacoInstance = monaco;

    // Register once after the instance exists. TOneState subscriptions are
    // change-only, so apply the current snapshot explicitly as well.
    themeState.subscribe(() => {
        const theme = getThemeById(themeState.get().id);
        if (theme) applyMonacoTheme(theme);
    });

    // Settings may have loaded during async init above, changing the active
    // theme while the subscription was not yet registered.
    const activeTheme = getThemeById(themeState.get().id);
    if (activeTheme) {
        applyMonacoTheme(activeTheme);
    }
}
