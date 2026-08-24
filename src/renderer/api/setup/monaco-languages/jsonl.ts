import * as monaco from "monaco-editor";

type Monaco = typeof monaco;

/**
 * Define JSONL (JSON Lines) language with JSON-like syntax highlighting.
 * Each line is an independent JSON object — uses Monarch tokenizer with
 * the same token names as built-in JSON for automatic theme color matching.
 */
export function defineJsonlLanguage(monacoInstance: Monaco): void {
    const languageId = "jsonl";

    const conf: monaco.languages.LanguageConfiguration = {
        brackets: [
            ["{", "}"],
            ["[", "]"],
        ],
        autoClosingPairs: [
            { open: "{", close: "}", notIn: ["string"] },
            { open: "[", close: "]", notIn: ["string"] },
            { open: '"', close: '"', notIn: ["string"] },
        ],
        surroundingPairs: [
            { open: "{", close: "}" },
            { open: "[", close: "]" },
            { open: '"', close: '"' },
        ],
    };

    const monarchLanguage: monaco.languages.IMonarchLanguage = {
        tokenizer: {
            root: [
                // Whitespace
                [/\s+/, "white"],

                // Strings — key detection: string followed by ':'
                [/"(?:[^"\\]|\\.)*"(?=\s*:)/, "string.key.json"],
                [/"/, "string.value.json", "@string"],

                // Numbers
                [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, "number.json"],

                // Keywords
                [/\btrue\b/, "keyword.json"],
                [/\bfalse\b/, "keyword.json"],
                [/\bnull\b/, "keyword.json"],

                // Brackets
                [/[{}]/, "@brackets"],
                [/[[\]]/, "@brackets"],

                // Delimiters
                [/:/, "delimiter.json"],
                [/,/, "delimiter.json"],
            ],

            string: [
                [/\\./, "string.escape.json"],
                [/"/, "string.value.json", "@pop"],
                [/[^"\\]+/, "string.value.json"],
            ],
        },
    };

    monacoInstance.languages.register({
        id: languageId,
        extensions: [".jsonl", ".ndjson", ".log.jsonl"],
        aliases: ["JSONL", "JSON Lines", "jsonl", "NDJSON", "ndjson"],
    });

    monacoInstance.languages.setLanguageConfiguration(languageId, conf);
    monacoInstance.languages.setMonarchTokensProvider(
        languageId,
        monarchLanguage
    );
}
