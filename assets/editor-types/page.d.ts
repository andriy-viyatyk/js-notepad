export type PageEditor = "monaco" | "grid-json" | "grid-csv" | "md-view";
export type Language =
    | "abap"
    | "aes"
    | "apex"
    | "azcli"
    | "bat"
    | "bicep"
    | "c"
    | "cameligo"
    | "clojure"
    | "coffeescript"
    | "cpp"
    | "csharp"
    | "csp"
    | "css"
    | "csv"
    | "cypher"
    | "dart"
    | "dockerfile"
    | "ecl"
    | "elixir"
    | "flow9"
    | "freemarker2"
    | "freemarker2.tag-angle.interpolation-bracket"
    | "freemarker2.tag-angle.interpolation-dollar"
    | "freemarker2.tag-auto.interpolation-bracket"
    | "freemarker2.tag-auto.interpolation-dollar"
    | "freemarker2.tag-bracket.interpolation-bracket"
    | "freemarker2.tag-bracket.interpolation-dollar"
    | "fsharp"
    | "go"
    | "graphql"
    | "handlebars"
    | "hcl"
    | "html"
    | "ini"
    | "java"
    | "javascript"
    | "json"
    | "julia"
    | "kotlin"
    | "less"
    | "lexon"
    | "liquid"
    | "lua"
    | "m3"
    | "markdown"
    | "mdx"
    | "mips"
    | "msdax"
    | "mysql"
    | "objective-c"
    | "pascal"
    | "pascaligo"
    | "perl"
    | "pgsql"
    | "php"
    | "pla"
    | "plaintext"
    | "postiats"
    | "powerquery"
    | "powershell"
    | "proto"
    | "pug"
    | "python"
    | "qsharp"
    | "r"
    | "razor"
    | "redis"
    | "redshift"
    | "reg"
    | "restructuredtext"
    | "ruby"
    | "rust"
    | "sb"
    | "scala"
    | "scheme"
    | "scss"
    | "shell"
    | "sol"
    | "sparql"
    | "sql"
    | "st"
    | "swift"
    | "systemverilog"
    | "tcl"
    | "twig"
    | "typescript"
    | "typespec"
    | "vb"
    | "verilog"
    | "wgsl"
    | "xml"
    | "yaml";

export interface Page {
    /** get or set text content of the page */
    content: string;
    /** get grouped page
     * If the page is not grouped, creates and groups new text page
     */
    grouped: Page | undefined;
    /** get or set language of the page. Language that compatible with monaco editor */
    language: Language;
    /**
     * Custom data storage for scripts.
     *
     * Scripts can store arbitrary values in this object. The data persists
     * in the page state and remains available across multiple script executions.
     */
    data: Record<string, any>;
    /**
     * Get or set the editor type for the page.
     */
    editor: PageEditor;
}
