import * as monaco from "monaco-editor";

type Monaco = typeof monaco;

/**
 * Define Log language with syntax highlighting for .log files.
 * Highlights timestamps, log levels, strings, numbers, GUIDs, URLs,
 * exception types, and stack traces. Inspired by VSCode's built-in
 * log highlighter (emilast/vscode-logfile-highlighter) with customizations.
 */
export function defineLogLanguage(monacoInstance: Monaco): void {
    const languageId = "log";

    const conf: monaco.languages.LanguageConfiguration = {
        brackets: [
            ["{", "}"],
            ["[", "]"],
            ["(", ")"],
        ],
    };

    const monarchLanguage: monaco.languages.IMonarchLanguage = {
        ignoreCase: true,

        tokenizer: {
            root: [
                // ISO timestamps: 2026-03-21T07:26:14.374Z or 2026-03-21 07:26:14
                [/\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}([.,]\d+)?)?(Z|[+-]\d{1,2}:\d{2})?)?/, "date.log"],

                // Time-only: 07:26:14.374 or 07:26:14,374
                [/\d{2}:\d{2}(:\d{2}([.,]\d+)?)?(Z| ?[+-]\d{1,2}:\d{2})?/, "date.log"],

                // Log levels — bracketed abbreviations
                [/\[(error|eror|err|er|e|fatal|fatl|ftl|fa|f)\]/, "keyword.error.log"],
                [/\[(warning|warn|wrn|wn|w)\]/, "keyword.warn.log"],
                [/\[(information|info|inf|in|i)\]/, "keyword.info.log"],
                [/\[(debug|dbug|dbg|de|d)\]/, "keyword.debug.log"],
                [/\[(verbose|verb|vrb|vb|v|trace|trc|t)\]/, "keyword.trace.log"],

                // Log levels — standalone words
                [/\b(error|fatal|fail|failure|critical|alert|emergency)\b/, "keyword.error.log"],
                [/\b(warning|warn)\b/, "keyword.warn.log"],
                [/\b(info|information|notice|hint)\b/, "keyword.info.log"],
                [/\b(debug)\b/, "keyword.debug.log"],
                [/\b(trace|verbose)\b/, "keyword.trace.log"],

                // Exception types: java.lang.NullPointerException, ValueError, etc.
                [/\b[\w.]*(?:Exception|Error)\b/, "keyword.error.log"],

                // Stack trace keywords
                [/\b(Stacktrace|Traceback|Caused by)\b/, "keyword.error.log"],

                // Stack trace "at" lines
                [/^\s+at\b/, "keyword.error.log"],

                // GUIDs: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
                [/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/, "constant.guid.log"],

                // URLs
                [/\b[a-z]+:\/\/[^\s'",)\]}>]+/, "constant.url.log"],

                // Double-quoted strings
                [/"/, "string.log", "@string_double"],

                // Single-quoted strings
                [/'/, "string.log", "@string_single"],

                // Hex literals: 0xFF
                [/\b0x[0-9a-fA-F]+\b/, "number.log"],

                // Numbers
                [/\b\d+(\.\d+)?\b/, "number.log"],

                // Constants
                [/\b(true|false|null|undefined|NaN)\b/, "constant.log"],
            ],

            string_double: [
                [/\\./, "string.escape.log"],
                [/"/, "string.log", "@pop"],
                [/[^"\\]+/, "string.log"],
            ],

            string_single: [
                [/\\./, "string.escape.log"],
                [/'/, "string.log", "@pop"],
                [/[^'\\]+/, "string.log"],
            ],
        },
    };

    monacoInstance.languages.register({
        id: languageId,
        extensions: [".log"],
        aliases: ["Log", "log"],
    });

    monacoInstance.languages.setLanguageConfiguration(languageId, conf);
    monacoInstance.languages.setMonarchTokensProvider(
        languageId,
        monarchLanguage
    );
}
