/**
 * An object that holds resources and must be cleaned up when no longer needed.
 * Call dispose() to release all resources.
 *
 * Compatible with Monaco editor's IDisposable interface.
 */
export interface IDisposable {
    dispose(): void;
}

/**
 * A subscribable event. Call subscribe() to listen for events,
 * then call dispose() on the returned object to unsubscribe.
 *
 * @example
 * const subscription = app.settings.onChanged.subscribe((e) => {
 *     console.log(`Setting ${e.key} changed to`, e.value);
 * });
 * // Later: subscription.dispose();
 */
export interface IEvent<T> {
    subscribe(handler: (data: T) => void): IDisposable;
}

/** Editor type identifier. */
export type EditorView =
    | "monaco"
    | "grid-json"
    | "grid-csv"
    | "grid-jsonl"
    | "md-view"
    | "pdf-view"
    | "image-view"
    | "svg-view"
    | "about-view"
    | "notebook-view"
    | "mermaid-view"
    | "html-view"
    | "settings-view"
    | "todo-view"
    | "link-view"
    | "log-view"
    | "browser-view"
    | "graph-view"
    | "draw-view"
    | "mcp-view"
    | "archive-view"
    | "category-view"
    | "rest-client"
    | "video-view"
    | "storybook-view";

/** Monaco language identifier. */
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
