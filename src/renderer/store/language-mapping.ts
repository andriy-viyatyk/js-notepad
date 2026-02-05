import { monacoLanguages } from "../core/utils/monaco-languages";
import { MonacoLanguage } from "../core/utils/types";

let languageMapping: { [key: string]: MonacoLanguage } | undefined;
let extensionMapping: { [key: string]: MonacoLanguage } | undefined;

function getLanguageMapping(): { [key: string]: MonacoLanguage } {
    if (!languageMapping) {
        languageMapping = monacoLanguages.reduce(
            (mapping, lang) => {
                mapping[lang.id] = lang;
                return mapping;
            },
            {} as { [key: string]: MonacoLanguage }
        );
    }
    return languageMapping;
}

function getExtensionMapping(): { [key: string]: MonacoLanguage } {
    if (!extensionMapping) {
        extensionMapping = monacoLanguages.reduce(
            (mapping, lang) => {
                lang.extensions.forEach((ext) => {
                    mapping[ext] = lang;
                });
                return mapping;
            },
            {} as { [key: string]: MonacoLanguage }
        );
    }
    return extensionMapping;
}

export function getLanguageById(id: string): MonacoLanguage | undefined {
    const mapping = getLanguageMapping();
    return mapping[id];
}

export function getLanguageByExtension(ext: string): MonacoLanguage | undefined {
    const mapping = getExtensionMapping();
    return mapping[ext.toLowerCase()];
}
