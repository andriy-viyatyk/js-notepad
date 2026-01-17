import { MonacoLanguage } from "./types";

const extraLanguages: MonacoLanguage[] = [
    {
        "aliases": ['Registry', 'reg'],
        "extensions": [".reg"],
        "id": "reg"
    },
    {
        "aliases": ['CSV', 'csv', 'TSV', 'tsv'],
        "extensions": [".csv", ".tsv"],
        "id": "csv"
    }
];

const monacoBuildInLanguages: MonacoLanguage[] = [
    {
        "aliases": [
            "Plain Text",
            "text"
        ],
        "extensions": [
            ".txt"
        ],
        "id": "plaintext"
    },
    {
        "aliases": [
            "abap",
            "ABAP"
        ],
        "extensions": [
            ".abap"
        ],
        "id": "abap"
    },
    {
        "aliases": [
            "Apex",
            "apex"
        ],
        "extensions": [
            ".cls"
        ],
        "id": "apex"
    },
    {
        "aliases": [
            "Azure CLI",
            "azcli"
        ],
        "extensions": [
            ".azcli"
        ],
        "id": "azcli"
    },
    {
        "aliases": [
            "Batch",
            "bat"
        ],
        "extensions": [
            ".bat",
            ".cmd"
        ],
        "id": "bat"
    },
    {
        "aliases": [
            "Bicep"
        ],
        "extensions": [
            ".bicep"
        ],
        "id": "bicep"
    },
    {
        "aliases": [
            "Cameligo"
        ],
        "extensions": [
            ".mligo"
        ],
        "id": "cameligo"
    },
    {
        "aliases": [
            "clojure",
            "Clojure"
        ],
        "extensions": [
            ".clj",
            ".cljs",
            ".cljc",
            ".edn"
        ],
        "id": "clojure"
    },
    {
        "aliases": [
            "CoffeeScript",
            "coffeescript",
            "coffee"
        ],
        "extensions": [
            ".coffee"
        ],
        "id": "coffeescript"
    },
    {
        "aliases": [
            "C",
            "c"
        ],
        "extensions": [
            ".c",
            ".h"
        ],
        "id": "c"
    },
    {
        "aliases": [
            "C++",
            "Cpp",
            "cpp"
        ],
        "extensions": [
            ".cpp",
            ".cc",
            ".cxx",
            ".hpp",
            ".hh",
            ".hxx"
        ],
        "id": "cpp"
    },
    {
        "aliases": [
            "C#",
            "csharp"
        ],
        "extensions": [
            ".cs",
            ".csx",
            ".cake"
        ],
        "id": "csharp"
    },
    {
        "aliases": [
            "CSP",
            "csp"
        ],
        "extensions": [
            ".csp"
        ],
        "id": "csp"
    },
    {
        "aliases": [
            "CSS",
            "css"
        ],
        "extensions": [
            ".css"
        ],
        "id": "css"
    },
    {
        "aliases": [
            "Cypher",
            "OpenCypher"
        ],
        "extensions": [
            ".cypher",
            ".cyp"
        ],
        "id": "cypher"
    },
    {
        "aliases": [
            "Dart",
            "dart"
        ],
        "extensions": [
            ".dart"
        ],
        "id": "dart"
    },
    {
        "aliases": [
            "Dockerfile"
        ],
        "extensions": [
            ".dockerfile"
        ],
        "id": "dockerfile"
    },
    {
        "aliases": [
            "ECL",
            "Ecl",
            "ecl"
        ],
        "extensions": [
            ".ecl"
        ],
        "id": "ecl"
    },
    {
        "aliases": [
            "Elixir",
            "elixir",
            "ex"
        ],
        "extensions": [
            ".ex",
            ".exs"
        ],
        "id": "elixir"
    },
    {
        "aliases": [
            "Flow9",
            "Flow",
            "flow9",
            "flow"
        ],
        "extensions": [
            ".flow"
        ],
        "id": "flow9"
    },
    {
        "aliases": [
            "F#",
            "FSharp",
            "fsharp"
        ],
        "extensions": [
            ".fs",
            ".fsi",
            ".ml",
            ".mli",
            ".fsx",
            ".fsscript"
        ],
        "id": "fsharp"
    },
    {
        "aliases": [
            "FreeMarker2",
            "Apache FreeMarker2"
        ],
        "extensions": [
            ".ftl",
            ".ftlh",
            ".ftlx"
        ],
        "id": "freemarker2"
    },
    {
        "aliases": [
            "FreeMarker2 (Angle/Dollar)",
            "Apache FreeMarker2 (Angle/Dollar)"
        ],
        "extensions": [],
        "id": "freemarker2.tag-angle.interpolation-dollar"
    },
    {
        "aliases": [
            "FreeMarker2 (Bracket/Dollar)",
            "Apache FreeMarker2 (Bracket/Dollar)"
        ],
        "extensions": [],
        "id": "freemarker2.tag-bracket.interpolation-dollar"
    },
    {
        "aliases": [
            "FreeMarker2 (Angle/Bracket)",
            "Apache FreeMarker2 (Angle/Bracket)"
        ],
        "extensions": [],
        "id": "freemarker2.tag-angle.interpolation-bracket"
    },
    {
        "aliases": [
            "FreeMarker2 (Bracket/Bracket)",
            "Apache FreeMarker2 (Bracket/Bracket)"
        ],
        "extensions": [],
        "id": "freemarker2.tag-bracket.interpolation-bracket"
    },
    {
        "aliases": [
            "FreeMarker2 (Auto/Dollar)",
            "Apache FreeMarker2 (Auto/Dollar)"
        ],
        "extensions": [],
        "id": "freemarker2.tag-auto.interpolation-dollar"
    },
    {
        "aliases": [
            "FreeMarker2 (Auto/Bracket)",
            "Apache FreeMarker2 (Auto/Bracket)"
        ],
        "extensions": [],
        "id": "freemarker2.tag-auto.interpolation-bracket"
    },
    {
        "aliases": [
            "Go"
        ],
        "extensions": [
            ".go"
        ],
        "id": "go"
    },
    {
        "aliases": [
            "GraphQL",
            "graphql",
            "gql"
        ],
        "extensions": [
            ".graphql",
            ".gql"
        ],
        "id": "graphql"
    },
    {
        "aliases": [
            "Handlebars",
            "handlebars",
            "hbs"
        ],
        "extensions": [
            ".handlebars",
            ".hbs"
        ],
        "id": "handlebars"
    },
    {
        "aliases": [
            "Terraform",
            "tf",
            "HCL",
            "hcl"
        ],
        "extensions": [
            ".tf",
            ".tfvars",
            ".hcl"
        ],
        "id": "hcl"
    },
    {
        "aliases": [
            "HTML",
            "htm",
            "html",
            "xhtml"
        ],
        "extensions": [
            ".html",
            ".htm",
            ".shtml",
            ".xhtml",
            ".mdoc",
            ".jsp",
            ".asp",
            ".aspx",
            ".jshtm"
        ],
        "id": "html"
    },
    {
        "aliases": [
            "Ini",
            "ini"
        ],
        "extensions": [
            ".ini",
            ".properties",
            ".gitconfig"
        ],
        "id": "ini"
    },
    {
        "aliases": [
            "Java",
            "java"
        ],
        "extensions": [
            ".java",
            ".jav"
        ],
        "id": "java"
    },
    {
        "aliases": [
            "JavaScript",
            "javascript",
            "js"
        ],
        "extensions": [
            ".js",
            ".es6",
            ".jsx",
            ".mjs",
            ".cjs"
        ],
        "id": "javascript"
    },
    {
        "aliases": [
            "julia",
            "Julia"
        ],
        "extensions": [
            ".jl"
        ],
        "id": "julia"
    },
    {
        "aliases": [
            "Kotlin",
            "kotlin"
        ],
        "extensions": [
            ".kt",
            ".kts"
        ],
        "id": "kotlin"
    },
    {
        "aliases": [
            "Less",
            "less"
        ],
        "extensions": [
            ".less"
        ],
        "id": "less"
    },
    {
        "aliases": [
            "Lexon"
        ],
        "extensions": [
            ".lex"
        ],
        "id": "lexon"
    },
    {
        "aliases": [
            "Lua",
            "lua"
        ],
        "extensions": [
            ".lua"
        ],
        "id": "lua"
    },
    {
        "aliases": [
            "Liquid",
            "liquid"
        ],
        "extensions": [
            ".liquid",
            ".html.liquid"
        ],
        "id": "liquid"
    },
    {
        "aliases": [
            "Modula-3",
            "Modula3",
            "modula3",
            "m3"
        ],
        "extensions": [
            ".m3",
            ".i3",
            ".mg",
            ".ig"
        ],
        "id": "m3"
    },
    {
        "aliases": [
            "Markdown",
            "markdown"
        ],
        "extensions": [
            ".md",
            ".markdown",
            ".mdown",
            ".mkdn",
            ".mkd",
            ".mdwn",
            ".mdtxt",
            ".mdtext"
        ],
        "id": "markdown"
    },
    {
        "aliases": [
            "MDX",
            "mdx"
        ],
        "extensions": [
            ".mdx"
        ],
        "id": "mdx"
    },
    {
        "aliases": [
            "MIPS",
            "MIPS-V"
        ],
        "extensions": [
            ".s"
        ],
        "id": "mips"
    },
    {
        "aliases": [
            "DAX",
            "MSDAX"
        ],
        "extensions": [
            ".dax",
            ".msdax"
        ],
        "id": "msdax"
    },
    {
        "aliases": [
            "MySQL",
            "mysql"
        ],
        "extensions": [],
        "id": "mysql"
    },
    {
        "aliases": [
            "Objective-C"
        ],
        "extensions": [
            ".m"
        ],
        "id": "objective-c"
    },
    {
        "aliases": [
            "Pascal",
            "pas"
        ],
        "extensions": [
            ".pas",
            ".p",
            ".pp"
        ],
        "id": "pascal"
    },
    {
        "aliases": [
            "Pascaligo",
            "ligo"
        ],
        "extensions": [
            ".ligo"
        ],
        "id": "pascaligo"
    },
    {
        "aliases": [
            "Perl",
            "pl"
        ],
        "extensions": [
            ".pl",
            ".pm"
        ],
        "id": "perl"
    },
    {
        "aliases": [
            "PostgreSQL",
            "postgres",
            "pg",
            "postgre"
        ],
        "extensions": [],
        "id": "pgsql"
    },
    {
        "aliases": [
            "PHP",
            "php"
        ],
        "extensions": [
            ".php",
            ".php4",
            ".php5",
            ".phtml",
            ".ctp"
        ],
        "id": "php"
    },
    {
        "aliases": [],
        "extensions": [
            ".pla"
        ],
        "id": "pla"
    },
    {
        "aliases": [
            "ATS",
            "ATS/Postiats"
        ],
        "extensions": [
            ".dats",
            ".sats",
            ".hats"
        ],
        "id": "postiats"
    },
    {
        "aliases": [
            "PQ",
            "M",
            "Power Query",
            "Power Query M"
        ],
        "extensions": [
            ".pq",
            ".pqm"
        ],
        "id": "powerquery"
    },
    {
        "aliases": [
            "PowerShell",
            "powershell",
            "ps",
            "ps1"
        ],
        "extensions": [
            ".ps1",
            ".psm1",
            ".psd1"
        ],
        "id": "powershell"
    },
    {
        "aliases": [
            "protobuf",
            "Protocol Buffers"
        ],
        "extensions": [
            ".proto"
        ],
        "id": "proto"
    },
    {
        "aliases": [
            "Pug",
            "Jade",
            "jade"
        ],
        "extensions": [
            ".jade",
            ".pug"
        ],
        "id": "pug"
    },
    {
        "aliases": [
            "Python",
            "py"
        ],
        "extensions": [
            ".py",
            ".rpy",
            ".pyw",
            ".cpy",
            ".gyp",
            ".gypi"
        ],
        "id": "python"
    },
    {
        "aliases": [
            "Q#",
            "qsharp"
        ],
        "extensions": [
            ".qs"
        ],
        "id": "qsharp"
    },
    {
        "aliases": [
            "R",
            "r"
        ],
        "extensions": [
            ".r",
            ".rhistory",
            ".rmd",
            ".rprofile",
            ".rt"
        ],
        "id": "r"
    },
    {
        "aliases": [
            "Razor",
            "razor"
        ],
        "extensions": [
            ".cshtml"
        ],
        "id": "razor"
    },
    {
        "aliases": [
            "redis"
        ],
        "extensions": [
            ".redis"
        ],
        "id": "redis"
    },
    {
        "aliases": [
            "Redshift",
            "redshift"
        ],
        "extensions": [],
        "id": "redshift"
    },
    {
        "aliases": [
            "reStructuredText",
            "restructuredtext"
        ],
        "extensions": [
            ".rst"
        ],
        "id": "restructuredtext"
    },
    {
        "aliases": [
            "Ruby",
            "rb"
        ],
        "extensions": [
            ".rb",
            ".rbx",
            ".rjs",
            ".gemspec",
            ".pp"
        ],
        "id": "ruby"
    },
    {
        "aliases": [
            "Rust",
            "rust"
        ],
        "extensions": [
            ".rs",
            ".rlib"
        ],
        "id": "rust"
    },
    {
        "aliases": [
            "Small Basic",
            "sb"
        ],
        "extensions": [
            ".sb"
        ],
        "id": "sb"
    },
    {
        "aliases": [
            "Scala",
            "scala",
            "SBT",
            "Sbt",
            "sbt",
            "Dotty",
            "dotty"
        ],
        "extensions": [
            ".scala",
            ".sc",
            ".sbt"
        ],
        "id": "scala"
    },
    {
        "aliases": [
            "scheme",
            "Scheme"
        ],
        "extensions": [
            ".scm",
            ".ss",
            ".sch",
            ".rkt"
        ],
        "id": "scheme"
    },
    {
        "aliases": [
            "Sass",
            "sass",
            "scss"
        ],
        "extensions": [
            ".scss"
        ],
        "id": "scss"
    },
    {
        "aliases": [
            "Shell",
            "sh"
        ],
        "extensions": [
            ".sh",
            ".bash"
        ],
        "id": "shell"
    },
    {
        "aliases": [
            "sol",
            "solidity",
            "Solidity"
        ],
        "extensions": [
            ".sol"
        ],
        "id": "sol"
    },
    {
        "aliases": [
            "aes",
            "sophia",
            "Sophia"
        ],
        "extensions": [
            ".aes"
        ],
        "id": "aes"
    },
    {
        "aliases": [
            "sparql",
            "SPARQL"
        ],
        "extensions": [
            ".rq"
        ],
        "id": "sparql"
    },
    {
        "aliases": [
            "SQL"
        ],
        "extensions": [
            ".sql"
        ],
        "id": "sql"
    },
    {
        "aliases": [
            "StructuredText",
            "scl",
            "stl"
        ],
        "extensions": [
            ".st",
            ".iecst",
            ".iecplc",
            ".lc3lib",
            ".TcPOU",
            ".TcDUT",
            ".TcGVL",
            ".TcIO"
        ],
        "id": "st"
    },
    {
        "aliases": [
            "Swift",
            "swift"
        ],
        "extensions": [
            ".swift"
        ],
        "id": "swift"
    },
    {
        "aliases": [
            "SV",
            "sv",
            "SystemVerilog",
            "systemverilog"
        ],
        "extensions": [
            ".sv",
            ".svh"
        ],
        "id": "systemverilog"
    },
    {
        "aliases": [
            "V",
            "v",
            "Verilog",
            "verilog"
        ],
        "extensions": [
            ".v",
            ".vh"
        ],
        "id": "verilog"
    },
    {
        "aliases": [
            "tcl",
            "Tcl",
            "tcltk",
            "TclTk",
            "tcl/tk",
            "Tcl/Tk"
        ],
        "extensions": [
            ".tcl"
        ],
        "id": "tcl"
    },
    {
        "aliases": [
            "Twig",
            "twig"
        ],
        "extensions": [
            ".twig"
        ],
        "id": "twig"
    },
    {
        "aliases": [
            "TypeScript",
            "ts",
            "typescript"
        ],
        "extensions": [
            ".ts",
            ".tsx",
            ".cts",
            ".mts"
        ],
        "id": "typescript"
    },
    {
        "aliases": [
            "TypeSpec"
        ],
        "extensions": [
            ".tsp"
        ],
        "id": "typespec"
    },
    {
        "aliases": [
            "Visual Basic",
            "vb"
        ],
        "extensions": [
            ".vb"
        ],
        "id": "vb"
    },
    {
        "aliases": [
            "WebGPU Shading Language",
            "WGSL",
            "wgsl"
        ],
        "extensions": [
            ".wgsl"
        ],
        "id": "wgsl"
    },
    {
        "aliases": [
            "XML",
            "xml"
        ],
        "extensions": [
            ".xml",
            ".xsd",
            ".dtd",
            ".ascx",
            ".csproj",
            ".config",
            ".props",
            ".targets",
            ".wxi",
            ".wxl",
            ".wxs",
            ".xaml",
            ".svg",
            ".svgz",
            ".opf",
            ".xslt",
            ".xsl"
        ],
        "id": "xml"
    },
    {
        "aliases": [
            "YAML",
            "yaml",
            "YML",
            "yml"
        ],
        "extensions": [
            ".yaml",
            ".yml"
        ],
        "id": "yaml"
    },
    {
        "aliases": [
            "JSON",
            "json"
        ],
        "extensions": [
            ".json",
            ".bowerrc",
            ".jshintrc",
            ".jscsrc",
            ".eslintrc",
            ".babelrc",
            ".har"
        ],
        "id": "json"
    }
];

export const monacoLanguages: MonacoLanguage[] = [
    ...monacoBuildInLanguages,
    ...extraLanguages
];