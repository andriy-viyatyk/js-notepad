import { Monaco } from "@monaco-editor/react";
import * as monaco from 'monaco-editor'; // Make sure to import monaco if it's not already globally available

export function defineRegLanguage(monaco: Monaco) {
    const languageId = 'reg';
    
    // Configuration: Defines comments, brackets, and auto-closing behavior
    const conf: monaco.languages.LanguageConfiguration = {
        comments: {
            lineComment: ';',
        },
        brackets: [
            ['[', ']'],
            ['"', '"'],
        ],
        autoClosingPairs: [
            { open: '[', close: ']', notIn: ['string', 'comment'] },
            { open: '"', close: '"', notIn: ['comment'] },
        ],
        surroundingPairs: [
            { open: '[', close: ']' },
            { open: '"', close: '"' },
        ],
        // Allows line continuation character '\' to be recognized for wrapping lines
        // This helps with language services like auto-indentation.
        onEnterRules: [
            {
                beforeText: /.*\\$/,
                action: { indentAction: monaco.languages.IndentAction.None }
            }
        ]
    };
    
    // Monarch Tokenizer Definition: Translates the TextMate patterns
    const monarchLanguage: monaco.languages.IMonarchLanguage = {
        ignoreCase: true,
        
        // Define root keys for inclusion in regex
        rootKeys: [
            'HKEY_CLASSES_ROOT', 'HKEY_CURRENT_USER', 'HKEY_LOCAL_MACHINE', 
            'HKEY_USERS', 'HKEY_CURRENT_CONFIG'
        ].join('|'),

        tokenizer: {
            // The starting state for the tokenizer
            root: [
                // Header Keywords (TextMate: Windows Registry Editor Version 5\.00|REGEDIT4)
                [/^(Windows Registry Editor Version 5\.00|REGEDIT4)$/, 'keyword.import.reg'],

                // Comments (TextMate: ;.*$)
                [/^;.*$/, 'comment.line.reg'],
                
                // Registry Key (Section) - Add (TextMate: \[(HKEY_...)(?:\\.*)*\])
                [/^\[(@rootKeys)(\\.*)?\]$/, 'keyword.control.reg'],

                // Registry Key (Section) - Delete (TextMate: \[-(HKEY_...)(?:\\.*)*\])
                [/^\[-((@rootKeys)(\\.*)?)\]$/, 'keyword.deprecated.reg'],

                // Value Deletion (TextMate: ^(.*?)=\s*-)
                // Match "Name"= or @= followed by a hyphen for deletion
                [/^(".*?"|@?)=(?=\s*-)/, {
                    token: 'variable.name.reg',
                    next: '@delete_value'
                }],

                // Value Assignment Start (TextMate: ^(.*?)=")
                // Match "Name"= or @= to start a value
                [/^(".*?"|@?)=/, {
                    token: 'variable.name.reg',
                    next: '@value_data' 
                }],
                
                // Whitespace
                [/\s+/, 'white'],
            ],
            
            // State for value deletion (matching the hyphen)
            delete_value: [
                [/\s*-/, 'keyword.deprecated.reg', '@pop'], // Match - and pop back to root
                [/.*/, 'white', '@pop']
            ],
            
            // State for parsing value data (after the "=")
            value_data: [
                // String Value (TextMate begin: ")
                [/"/, { token: 'string.quote.reg', bracket: '@open', next: '@string' }],

                // DWORD/QWORD (TextMate: \b(?i)[DQ]WORD:)
                [/\b([DQ]WORD):/, 'keyword.type.reg', '@dword_data'],

                // HEX (TextMate: \b(?i)HEX(\((.*)\))?:)
                [/\bHEX(\((?:[0-9a-fA-F]|,)*\))?:/, 'keyword.type.reg', '@hex_data'],
                
                // Continuation (if value starts with '\')
                [/\\$/, 'punctuation.separator.continuation.reg', '@pop'],

                // Unquoted string/simple value (REG_SZ) on this line
                [/[^\\]*$/, 'string.unquoted.reg', '@pop']
            ],
            
            // State for quoted strings (supports multiline via '\' continuation)
            string: [
                // Escape sequence (TextMate: \\.)
                [/\\./, 'constant.character.escape.reg'],
                
                // Continuation (TextMate: \\s*$) - stays in string state
                [/\\\s*$/, 'punctuation.separator.continuation.reg'], 

                // End quote (TextMate end: " | (?<!\\s*)$)
                [/"/, { token: 'string.quote.reg', bracket: '@close', next: '@pop' }],

                // String content
                [/[^"\\]+/, 'string.quoted.double.reg'],
            ],

            // State for DWORD/QWORD data (single hex number, potentially multiline)
            dword_data: [
                // Hex number (TextMate: [0-9A-Fa-f]+)
                [/[0-9A-Fa-f]+/, 'constant.numeric.hex.reg'],
                
                // Continuation - stays in dword_data state
                [/\\\s*$/, 'punctuation.separator.continuation.reg'],
                
                // Pop on anything else (spaces, newlines, etc.)
                [/./, 'white', '@pop'] 
            ],
            
            // State for HEX data (comma-separated hex bytes, potentially multiline)
            hex_data: [
                // Hex digits (byte)
                [/[0-9A-Fa-f]+/, 'constant.numeric.hex.reg'],

                // Comma separator (TextMate: ,)
                [/,/, 'punctuation.separator.comma.reg'],

                // Continuation - stays in hex_data state
                [/\\\s*$/, 'punctuation.separator.continuation.reg'],

                // Pop on anything else
                [/./, 'white', '@pop']
            ],
        }
    };

    // 1. Register the language
    monaco.languages.register({ id: languageId, extensions: ['.reg'], aliases: ['Registry', 'reg'] });

    // 2. Set the language configuration
    monaco.languages.setLanguageConfiguration(languageId, conf);

    // 3. Set the Monarch tokens provider
    monaco.languages.setMonarchTokensProvider(languageId, monarchLanguage);
}