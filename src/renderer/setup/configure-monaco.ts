import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import { languages } from "monaco-editor";

import color from "../theme/color";
import { defineRegLanguage } from "./monaco-languages/reg";
import { defineCSVLanguage } from "./monaco-languages/csv";
import { defineMermaidLanguage } from "./monaco-languages/mermaid";

loader.config({ monaco });

type Monaco = typeof monaco;
let monacoInstance: Monaco | null = null;

declare global {
    interface Window {
        require: any;
    }
}

function defineMonacoTheme(monaco: Monaco, themeName: string) {
    // Define a custom theme
    monaco.editor.defineTheme(themeName, {
        base: "vs-dark",
        inherit: true,
        rules: [
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
        ],
        colors: {
            "editor.background": color.background.default,
            "menu.background": color.background.default,
            "menu.foreground": color.text.default,
            "menu.selectionBackground": color.background.selection,
            "menu.selectionForeground": color.text.selection,
            "menu.separatorBackground": color.border.default,
            "menu.border": color.border.default,
        },
    });
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
    monaco.languages.css.cssDefaults.setOptions({
        validate: false,
    });

    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
        noSuggestionDiagnostics: true,
    });

    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
        noSuggestionDiagnostics: true,
    });

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.Latest,
        allowNonTsExtensions: true,
        moduleResolution:
            monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        module: monaco.languages.typescript.ModuleKind.CommonJS,
        noEmit: true,
        esModuleInterop: true,
        jsx: monaco.languages.typescript.JsxEmit.React,
        allowJs: true,
        typeRoots: [],
    });

    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.Latest,
        allowNonTsExtensions: true,
        moduleResolution:
            monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        module: monaco.languages.typescript.ModuleKind.CommonJS,
        noEmit: true,
        esModuleInterop: true,
        allowJs: true,
        typeRoots: [],
        strictNullChecks: true,
        strict: true,
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
            monaco.languages.typescript.javascriptDefaults.addExtraLib(
                content,
                `file:///node_modules/@types/custom/${file}`
            );

            monaco.languages.typescript.typescriptDefaults.addExtraLib(
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

    defineMonacoTheme(monaco, "custom-dark");
    redefineKeybinding(monaco);
    setupCompiler(monaco);

    defineRegLanguage(monaco);
    defineCSVLanguage(monaco);
    defineMermaidLanguage(monaco);

    await loadEditorTypes(monaco);

    // const monacoLanguages = languages.getLanguages().map(l => ({
    //     aliases: l.aliases || [],
    //     extensions: l.extensions || [],
    //     id: l.id,
    // }));
    // console.log("Loaded Monaco languages:", monacoLanguages);

    monacoInstance = monaco;
}

initMonaco();
