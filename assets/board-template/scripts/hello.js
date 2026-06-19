// Backend script — runs as a real OS process via persephone.execute(). Replace this
// with your own data-fetching logic (call CLIs, read files, hit APIs).
//
// Real scripts often shell out to tools that print to stdout, so this example mixes
// in some noise: a plain log line on stdout and a diagnostic on stderr. The actual
// result is emitted on its own line wrapped in a unique @@RESULT@@ marker, which the
// page extracts with getJson(/@@RESULT@@(.*)/) — see app.js / CLAUDE.md.

console.log("hello.js: working…");                    // stray stdout (e.g. a sub-tool's output)
console.error("hello.js: diagnostics go to stderr");  // logs belong on stderr

const result = {
    ok: true,
    message: "Hello from scripts/hello.js",
    ts: new Date().toISOString(),
};

console.log("@@RESULT@@" + JSON.stringify(result));   // the result, tagged for extraction
