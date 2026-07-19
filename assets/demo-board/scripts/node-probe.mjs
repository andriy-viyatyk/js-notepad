// executeNode probe — runs on Persephone's OWN bundled Node runtime (no Node
// install needed). Reports the runtime and exercises the built-in node:sqlite.
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE fruit(name TEXT, n INTEGER)");
const ins = db.prepare("INSERT INTO fruit(name, n) VALUES (?, ?)");
for (const [name, n] of [["apple", 3], ["pear", 5], ["plum", 8]]) ins.run(name, n);
const rows = db.prepare("SELECT name, n FROM fruit ORDER BY n DESC").all();
const total = db.prepare("SELECT SUM(n) AS t FROM fruit").get().t;
db.close();

console.log(
    "@@RESULT@@" +
        JSON.stringify({
            nodeVersion: process.versions.node,
            execPath: process.execPath,
            args: process.argv.slice(2),
            sqlite: { rows, total },
        }),
);
