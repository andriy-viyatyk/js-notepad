// Frontend logic for this Board. Owns the UI; talks to the backend scripts
// under scripts/ through persephone.execute(). See CLAUDE.md for the full API.

const P = window.persephone;

// The backend wraps its result in this marker so we can pull it out of stdout even
// when the script also prints other output. Keep it identical in scripts/hello.js.
const RESULT = /@@RESULT@@(.*)/;

/**
 * Userland helper: run a command line, optionally pipe a JSON object to its stdin,
 * and parse the result as JSON. `pattern` (optional) is handed to getJson() to
 * extract the result from mixed stdout — the last match is parsed. Rejects on a
 * non-zero exit or a parse error (the error carries exitCode + stderr).
 */
async function boardScript(commandLine, input, pattern) {
    const handle = P.execute(commandLine);
    if (input !== undefined) {
        handle.write(JSON.stringify(input));
        handle.endStdin();
    }
    return handle.getJson(pattern);
}

const out = document.getElementById("out");

document.getElementById("run").addEventListener("click", async () => {
    out.textContent = "Running…";
    try {
        // hello.js prints a log line (and a stderr diagnostic), then its result
        // tagged with @@RESULT@@. Passing the marker lets getJson() skip the noise.
        const result = await boardScript("node scripts/hello.js", undefined, RESULT);
        out.textContent = JSON.stringify(result, null, 2);
    } catch (err) {
        // Report failures so they reach ui.log (and the user) — see CLAUDE.md.
        const message = err && err.message ? err.message : String(err);
        out.textContent = "Error: " + message;
        P.notify(message, "error");
    }
});
