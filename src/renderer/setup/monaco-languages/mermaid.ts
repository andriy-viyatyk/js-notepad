import { Monaco } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

export function defineMermaidLanguage(monacoInstance: Monaco) {
    const languageId = "mermaid";

    const conf: monaco.languages.LanguageConfiguration = {
        comments: {
            lineComment: "%%",
        },
        brackets: [
            ["{", "}"],
            ["[", "]"],
            ["(", ")"],
        ],
        autoClosingPairs: [
            { open: "{", close: "}", notIn: ["string", "comment"] },
            { open: "[", close: "]", notIn: ["string", "comment"] },
            { open: "(", close: ")", notIn: ["string", "comment"] },
            { open: '"', close: '"', notIn: ["comment"] },
        ],
        surroundingPairs: [
            { open: "{", close: "}" },
            { open: "[", close: "]" },
            { open: "(", close: ")" },
            { open: '"', close: '"' },
        ],
    };

    const monarchLanguage: monaco.languages.IMonarchLanguage = {
        ignoreCase: false,

        // Diagram type keywords (first line declarations)
        diagramTypes: [
            "graph",
            "flowchart",
            "sequenceDiagram",
            "classDiagram",
            "stateDiagram",
            "stateDiagram-v2",
            "erDiagram",
            "gantt",
            "pie",
            "gitGraph",
            "journey",
            "quadrantChart",
            "requirementDiagram",
            "mindmap",
            "timeline",
            "sankey-beta",
            "xychart-beta",
            "block-beta",
        ],

        // Block/structure keywords
        blockKeywords: [
            "subgraph",
            "end",
            "loop",
            "alt",
            "else",
            "opt",
            "par",
            "and",
            "critical",
            "break",
            "rect",
        ],

        // Sequence diagram keywords
        sequenceKeywords: [
            "participant",
            "actor",
            "activate",
            "deactivate",
            "Note",
            "note",
            "over",
            "of",
            "right",
            "left",
            "autonumber",
            "title",
            "destroy",
            "box",
            "as",
        ],

        // Gantt / common keywords
        commonKeywords: [
            "section",
            "dateFormat",
            "axisFormat",
            "todayMarker",
            "excludes",
            "inclusiveEndDates",
            "click",
            "callback",
            "link",
            "style",
            "classDef",
            "class",
            "direction",
            "accTitle",
            "accDescr",
        ],

        // Direction values
        directions: ["TB", "TD", "BT", "RL", "LR"],

        tokenizer: {
            root: [
                // Directive block %%{ ... }%%
                [/%%\{/, "metatag.mermaid", "@directive"],

                // Line comments
                [/%%.*$/, "comment.mermaid"],

                // Quoted strings
                [/"/, "string.mermaid", "@string"],

                // Arrows and links (order matters - longer patterns first)
                [/-->>/, "operator.arrow.mermaid"],
                [/->>/, "operator.arrow.mermaid"],
                [/-->>/, "operator.arrow.mermaid"],
                [/<-->/, "operator.arrow.mermaid"],
                [/o--o/, "operator.arrow.mermaid"],
                [/x--x/, "operator.arrow.mermaid"],
                [/==>/, "operator.arrow.mermaid"],
                [/-->/, "operator.arrow.mermaid"],
                [/---/, "operator.arrow.mermaid"],
                [/-.->/, "operator.arrow.mermaid"],
                [/-\.->/, "operator.arrow.mermaid"],
                [/-\.-/, "operator.arrow.mermaid"],
                [/~~>/, "operator.arrow.mermaid"],
                [/~~~/, "operator.arrow.mermaid"],
                [/--[|]/, "operator.arrow.mermaid"],
                [/-->/, "operator.arrow.mermaid"],
                [/->/, "operator.arrow.mermaid"],
                [/--/, "operator.arrow.mermaid"],

                // ER diagram relationship patterns
                [/[|o}{]\|/, "operator.arrow.mermaid"],
                [/\|[|o}{]/, "operator.arrow.mermaid"],
                [/\.\./, "operator.arrow.mermaid"],

                // Pipe-delimited text |text|
                [/\|[^|]*\|/, "string.link.mermaid"],

                // Diagram type declarations (must be at start of word)
                [
                    /\b(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|gitGraph|journey|quadrantChart|requirementDiagram|mindmap|timeline|sankey-beta|xychart-beta|block-beta)\b/,
                    "type.diagram.mermaid",
                ],

                // Direction values
                [/\b(TB|TD|BT|RL|LR)\b/, "constant.direction.mermaid"],

                // Block keywords
                [
                    /\b(subgraph|end|loop|alt|else|opt|par|and|critical|break|rect)\b/,
                    "keyword.block.mermaid",
                ],

                // Sequence diagram keywords
                [
                    /\b(participant|actor|activate|deactivate|Note|note|over|of|right|left|autonumber|title|destroy|box|as)\b/,
                    "keyword.sequence.mermaid",
                ],

                // Common / Gantt keywords
                [
                    /\b(section|dateFormat|axisFormat|todayMarker|excludes|inclusiveEndDates|click|callback|link|style|classDef|class|direction|accTitle|accDescr)\b/,
                    "keyword.common.mermaid",
                ],

                // State keywords
                [
                    /\b(state)\b/,
                    "keyword.block.mermaid",
                ],

                // Gitgraph keywords
                [
                    /\b(commit|branch|checkout|merge)\b/,
                    "keyword.common.mermaid",
                ],

                // CSS-like class styling values (after classDef)
                [/#[0-9a-fA-F]{3,8}\b/, "constant.color.mermaid"],

                // Numbers
                [/\b\d{4}-\d{2}-\d{2}\b/, "constant.date.mermaid"],
                [/\b\d+(\.\d+)?\b/, "constant.numeric.mermaid"],

                // Node shape brackets
                [/\(\(/, "bracket.round.mermaid"],
                [/\)\)/, "bracket.round.mermaid"],
                [/\[\[/, "bracket.square.mermaid"],
                [/\]\]/, "bracket.square.mermaid"],
                [/\[\//, "bracket.square.mermaid"],
                [/\/\]/, "bracket.square.mermaid"],
                [/\[\\/, "bracket.square.mermaid"],
                [/\\\]/, "bracket.square.mermaid"],
                [/\[\(/, "bracket.mixed.mermaid"],
                [/\)\]/, "bracket.mixed.mermaid"],
                [/\(\[/, "bracket.mixed.mermaid"],
                [/\]\)/, "bracket.mixed.mermaid"],
                [/[[\](){}]/, "bracket.mermaid"],

                // Semicolons and colons
                [/;/, "delimiter.mermaid"],
                [/:/, "delimiter.colon.mermaid"],

                // Identifiers
                [/[a-zA-Z_]\w*/, "identifier.mermaid"],

                // Whitespace
                [/\s+/, "white"],
            ],

            // Directive state %%{ ... }%%
            directive: [
                [/}%%/, "metatag.mermaid", "@pop"],
                [/"/, "string.mermaid", "@string"],
                [/:/, "delimiter.mermaid"],
                [/,/, "delimiter.mermaid"],
                [/\b(init|theme|themeVariables|wrap|fontSize)\b/, "keyword.directive.mermaid"],
                [/\b(default|dark|forest|neutral|base)\b/, "constant.theme.mermaid"],
                [/[{}[\]]/, "bracket.mermaid"],
                [/\b\d+(\.\d+)?\b/, "constant.numeric.mermaid"],
                [/#[0-9a-fA-F]{3,8}\b/, "constant.color.mermaid"],
                [/[a-zA-Z_]\w*/, "identifier.mermaid"],
                [/\s+/, "white"],
            ],

            // String state
            string: [
                [/\\./, "string.escape.mermaid"],
                [/"/, "string.mermaid", "@pop"],
                [/[^"\\]+/, "string.mermaid"],
            ],
        },
    };

    monacoInstance.languages.register({
        id: languageId,
        extensions: [".mmd", ".mermaid"],
        aliases: ["Mermaid", "mermaid"],
    });

    monacoInstance.languages.setLanguageConfiguration(languageId, conf);
    monacoInstance.languages.setMonarchTokensProvider(
        languageId,
        monarchLanguage
    );
}
