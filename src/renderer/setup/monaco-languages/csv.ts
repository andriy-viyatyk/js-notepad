// CSV Rainbow Highlighting for Monaco Editor (by Anthropic Claude)
import { Monaco } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

/**
 * Define CSV language with rainbow column highlighting
 * Treats any of , ; \t | as delimiters
 */
export function defineCSVLanguage(monaco: Monaco): void {
    const languageId = "csv";

    // Configuration
    const conf: monaco.languages.LanguageConfiguration = {
        wordPattern:
            /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
    };

    // State class for CSV tokenization
    class CSVState implements monaco.languages.IState {
        public columnIndex: number;

        constructor(columnIndex = 0) {
            this.columnIndex = columnIndex;
        }

        clone(): monaco.languages.IState {
            return new CSVState(this.columnIndex);
        }

        equals(other: monaco.languages.IState): boolean {
            return (
                other instanceof CSVState &&
                other.columnIndex === this.columnIndex
            );
        }
    }

    const rainbowColors: string[] = [
        "csv.column0",
        "csv.column1",
        "csv.column2",
        "csv.column3",
        "csv.column4",
        "csv.column5",
        "csv.column6",
        "csv.column7",
        "csv.column8",
        "csv.column9",
    ];

    // All delimiters we recognize
    const delimiters = new Set([',', ';', '\t', '|']);

    // Register the language
    monaco.languages.register({
        id: languageId,
        extensions: [".csv", ".tsv"],
        aliases: ["CSV", "csv", "TSV", "tsv"],
    });

    // Set language configuration
    monaco.languages.setLanguageConfiguration(languageId, conf);

    // Set tokens provider with rainbow coloring
    monaco.languages.setTokensProvider(languageId, {
        getInitialState(): monaco.languages.IState {
            return new CSVState(0);
        },

        tokenize(
            line: string,
            state: monaco.languages.IState
        ): monaco.languages.ILineTokens {
            const tokens: monaco.languages.IToken[] = [];
            let currentPos = 0;
            let columnIndex = 0;
            let inQuotes = false;
            let i = 0;

            while (i < line.length) {
                const char: string = line[i];

                if (char === '"') {
                    if (
                        inQuotes &&
                        i + 1 < line.length &&
                        line[i + 1] === '"'
                    ) {
                        i += 2; // Skip escaped quote
                        continue;
                    }
                    inQuotes = !inQuotes;
                    i++;
                    continue;
                }

                // Check if current character is any delimiter
                if (!inQuotes && delimiters.has(char)) {
                    // Add token for the field
                    if (i > currentPos) {
                        const tokenType: string =
                            rainbowColors[columnIndex % rainbowColors.length];
                        tokens.push({
                            startIndex: currentPos,
                            scopes: tokenType,
                        });
                    }

                    // Add token for delimiter
                    tokens.push({
                        startIndex: i,
                        scopes: "delimiter.csv",
                    });

                    columnIndex++;
                    currentPos = i + 1;
                    i++;
                    continue;
                }

                i++;
            }

            // Add final field token
            if (currentPos < line.length) {
                const tokenType: string =
                    rainbowColors[columnIndex % rainbowColors.length];
                tokens.push({
                    startIndex: currentPos,
                    scopes: tokenType,
                });
            }

            return {
                tokens: tokens,
                endState: new CSVState(0), // Reset column for each line
            };
        },
    });
}