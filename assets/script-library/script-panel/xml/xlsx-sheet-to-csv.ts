// xlsx-sheet-to-csv: Convert Excel worksheet XML to CSV grid
// Reads sharedStrings.xml from the same archive to resolve string values.

const cheerio = require("cheerio");

const filePath = page.filePath || "";
const sep = filePath.indexOf("!");
if (sep < 0) throw new Error("This script works on files inside .xlsx archives (path must contain '!')");

const archivePath = filePath.substring(0, sep);

// Read shared strings
const strings: string[] = [];
try {
    const ssXml = await app.fs.read(archivePath + "!xl/sharedStrings.xml");
    const $ss = cheerio.load(ssXml, { xmlMode: true });
    $ss("si").each((_: number, si: any) => {
        const parts: string[] = [];
        $ss(si).find("t").each((_: number, t: any) => parts.push($ss(t).text()));
        strings.push(parts.join(""));
    });
} catch { /* no shared strings — all values are inline */ }

// Parse sheet XML
const $ = cheerio.load(page.content, { xmlMode: true });

function colIndex(ref: string): number {
    const match = ref.match(/^([A-Z]+)/);
    if (!match) return 0;
    let idx = 0;
    for (const ch of match[1]) idx = idx * 26 + (ch.charCodeAt(0) - 64);
    return idx - 1;
}

function csvEscape(val: string): string {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
}

const rows: string[][] = [];
$("row").each((_: number, row: any) => {
    const cells: string[] = [];
    $(row).find("c").each((_: number, c: any) => {
        const $c = $(c);
        const ref = $c.attr("r") || "";
        const col = colIndex(ref);
        const type = $c.attr("t");
        const val = $c.find("v").text();
        while (cells.length < col) cells.push("");
        cells.push(type === "s" ? (strings[parseInt(val)] || "") : val);
    });
    rows.push(cells);
});

const csv = rows.map(r => r.map(csvEscape).join(",")).join("\n");

page.grouped.content = csv;
page.grouped.language = "csv";
page.grouped.editorSwitches.switchTo("grid-csv");
page.grouped.title = page.title.replace(/\.xml$/, ".csv");

preventOutput();
