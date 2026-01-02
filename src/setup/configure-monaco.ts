import { loader, Monaco } from "@monaco-editor/react";
import { languages } from "monaco-editor";

import color from "../theme/color";
import { defineRegLanguage } from "./monaco-languages/reg";

type MonacoInstance = Awaited<ReturnType<typeof loader.init>>;
let monacoInstance: MonacoInstance | null = null;

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
            // { token: '', background: color.background.default }, // Set the background color
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

function setupCompiler(monaco: Monaco) {
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
    });
}

export async function initMonaco() {
    if (monacoInstance) return monacoInstance;

    loader.config({
        paths: {
            vs: "app-asset://monaco-editor/min/vs",
        },
    });

    const monaco = await loader.init();

    defineMonacoTheme(monaco, "custom-dark");

    await new Promise<void>((resolve) => {
        window.require(["vs/language/typescript/monaco.contribution"], () => {
            resolve();
        });
    });

    monaco.editor.addKeybindingRules([
        {
            keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY,
            command: "editor.action.deleteLines",
        },
    ]);

    setupCompiler(monaco);

    defineRegLanguage(monaco);

    // const monacoLanguages = languages.getLanguages().map(l => ({
    //     aliases: l.aliases || [],
    //     extensions: l.extensions || [],
    //     id: l.id,
    // }));
    // console.log("Loaded Monaco languages:", monacoLanguages);

    monacoInstance = monaco;
}

initMonaco();


