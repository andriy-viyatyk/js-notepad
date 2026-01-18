import { PageEditor } from "../../shared/types";

export function resolveEditor(filePath?: string): PageEditor | undefined {
    if (!filePath) {
        return undefined;
    }
    const lowerPath = filePath.toLowerCase();

    if (lowerPath.endsWith(".grid.json")) {
        return "grid-json";
    }

    if (lowerPath.endsWith(".grid.csv")) {
        return "grid-csv";
    }
}

export function validateEditorForLanguage(editor: PageEditor | undefined, languageId: string): PageEditor {
    switch (editor) {
        case "grid-json":
            if (languageId !== "json") {
                return "monaco";
            }
            break;
        case "grid-csv":
            if (languageId !== "csv") {
                return "monaco";
            }
            break;
    }

    return editor;
}

export interface SwitchOptions {
    options: PageEditor[];
    getOptionLabel: (option: PageEditor) => string;
}

export function getLanguageSwitchOptions(languageId: string): SwitchOptions {
    const options: PageEditor[] = ["monaco"];

    switch (languageId) {
        case "json":
            options.push("grid-json");
            break;
        case "csv":
            options.push("grid-csv");
            break;
    }

    const getOptionLabel = (option: PageEditor) => {
        if (!option || option === "monaco") {
            return languageId.toUpperCase();
        }
        switch (option) {
            case "grid-json":
            case "grid-csv":
                return "Grid";
            default:
                return languageId.toUpperCase();
        }
    }

    return {
        options: options.length > 1 ? options : [],
        getOptionLabel,
    };
}