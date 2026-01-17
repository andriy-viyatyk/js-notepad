import { PageEditor } from "../../shared/types";

export function resolveEditor(filePath?: string): PageEditor | undefined {
    if (!filePath) {
        return undefined;
    }

    const lowerPath = filePath.toLowerCase();
    if (lowerPath.endsWith(".grid.json")) {
        return "grid-json";
    }
}

export function validateEditorForLanguage(editor: PageEditor | undefined, languageId: string): PageEditor {
    switch (editor) {
        case "grid-json":
            if (languageId !== "json") {
                return "monaco";
            }
    }

    return editor;
}