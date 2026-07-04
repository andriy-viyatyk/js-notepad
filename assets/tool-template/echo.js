// Example tool. Reads JSON args on stdin, returns a result via the marker line.
//
// Result contract:
//   - Print `##PERSEPHONE_RESULT##<json>` on its own line (the LAST such line wins,
//     so progress logs / library chatter on stdout are harmless).
//   - Any unmarked stdout is returned to the agent as `logs`.
//   - If you print NO marker, your whole trimmed stdout becomes a plain-text result.
//   - Write diagnostics to stderr.
//   - A non-zero exit code = failure (the agent gets exitCode + stderr + this folder path).
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
    let args = {};
    try {
        args = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    } catch {
        // Malformed/empty stdin — treat as no args.
    }
    console.error("echo tool running…"); // logs → stderr
    const result = { ok: true, echoed: args.message ?? null };
    console.log("##PERSEPHONE_RESULT##" + JSON.stringify(result));
});
