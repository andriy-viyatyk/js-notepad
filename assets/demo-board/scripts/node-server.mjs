// Resident-server demo: one long-lived Node process fed JSON-line requests over
// stdin, replying on stdout. Spawn once, send many requests — no per-op spawn.
process.stdout.write(JSON.stringify({ ready: true, pid: process.pid }) + "\n");

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
            const req = JSON.parse(line);
            process.stdout.write(JSON.stringify({ id: req.id, upper: String(req.value).toUpperCase() }) + "\n");
        } catch (e) {
            process.stdout.write(JSON.stringify({ error: String(e) }) + "\n");
        }
    }
});
process.stdin.on("end", () => process.exit(0));
