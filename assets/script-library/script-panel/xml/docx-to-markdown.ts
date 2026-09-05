// docx-to-markdown: Convert Word document XML to Markdown
// Handles paragraphs (headings, lists, bold, italic), tables, and hyperlinks.
// Works on word/document.xml inside .docx archives.

const cheerio = require("cheerio");

const filePath = page.filePath || "";
const sep = filePath.indexOf("!");
if (sep < 0) throw new Error("This script works on files inside .docx archives (path must contain '!')");

const $ = cheerio.load(page.content, { xmlMode: true });

/** Get direct children by tag name */
function ch(parent: any, tag: string) {
    return $(parent).children().filter((_: number, el: any) => el.name === tag);
}

/** Find descendants by tag name */
function desc(parent: any, tag: string) {
    return $(parent).find("*").filter((_: number, el: any) => el.name === tag);
}

type RunStyle = "bold" | "italic" | "bolditalic" | "plain";

function getRunStyle(run: any): RunStyle {
    const rPr = ch(run, "w:rPr").first();
    const bold = desc(rPr, "w:b").length > 0;
    const italic = desc(rPr, "w:i").length > 0;
    if (bold && italic) return "bolditalic";
    if (bold) return "bold";
    if (italic) return "italic";
    return "plain";
}

function getRunText(run: any): string {
    let text = "";
    desc(run, "w:t").each((_: number, t: any) => { text += $(t).text(); });
    return text;
}

/** Wrap text with markdown formatting markers */
function wrapStyle(text: string, style: RunStyle): string {
    if (!text) return "";
    if (style === "bolditalic") return "***" + text + "***";
    if (style === "bold") return "**" + text + "**";
    if (style === "italic") return "*" + text + "*";
    return text;
}

/** Collect all runs (including inside hyperlinks), merge adjacent same-style runs */
function collectRuns(p: any): { text: string; style: RunStyle }[] {
    const raw: { text: string; style: RunStyle }[] = [];
    $(p).children().each((_: number, el: any) => {
        if (el.name === "w:r") {
            const text = getRunText(el);
            if (text) raw.push({ text, style: getRunStyle(el) });
        } else if (el.name === "w:hyperlink") {
            ch(el, "w:r").each((_: number, r: any) => {
                const text = getRunText(r);
                if (text) raw.push({ text, style: getRunStyle(r) });
            });
        }
    });

    // Merge adjacent runs with same style
    const merged: { text: string; style: RunStyle }[] = [];
    for (const run of raw) {
        const last = merged[merged.length - 1];
        if (last && last.style === run.style) {
            last.text += run.text;
        } else {
            merged.push({ ...run });
        }
    }
    return merged;
}

function processParagraph(p: any): string {
    const pPr = ch(p, "w:pPr").first();
    const pStyle = desc(pPr, "w:pStyle").attr("w:val") || "";
    const numPr = desc(pPr, "w:numPr");

    const runs = collectRuns(p);
    const text = runs.map(r => wrapStyle(r.text, r.style)).join("");

    if (!text.trim()) return "";

    if (/^Heading1/i.test(pStyle)) return "# " + text;
    if (/^Heading2/i.test(pStyle)) return "## " + text;
    if (/^Heading3/i.test(pStyle)) return "### " + text;
    if (/^Heading4/i.test(pStyle)) return "#### " + text;
    if (/^ListParagraph/i.test(pStyle) || numPr.length > 0) return "- " + text;
    return text;
}

function processTable(tbl: any): string {
    const rows: string[][] = [];
    ch(tbl, "w:tr").each((_: number, tr: any) => {
        const cells: string[] = [];
        ch(tr, "w:tc").each((_: number, tc: any) => {
            const cellTexts: string[] = [];
            ch(tc, "w:p").each((_: number, p: any) => {
                const t = processParagraph(p);
                if (t) cellTexts.push(t);
            });
            // Escape pipe characters inside cell content
            cells.push(cellTexts.join(" ").replace(/\|/g, "\\|"));
        });
        rows.push(cells);
    });

    if (rows.length === 0) return "";

    // Normalize column count
    const colCount = Math.max(...rows.map(r => r.length));
    for (const row of rows) {
        while (row.length < colCount) row.push("");
    }

    let result = "| " + rows[0].join(" | ") + " |\n";
    result += "| " + rows[0].map(() => "---").join(" | ") + " |\n";
    for (let i = 1; i < rows.length; i++) {
        result += "| " + rows[i].join(" | ") + " |\n";
    }
    return result;
}

const md: string[] = [];
const body = desc($.root(), "w:body").first();
body.children().each((_: number, el: any) => {
    if (el.name === "w:p") {
        const line = processParagraph(el);
        if (line) md.push(line);
    } else if (el.name === "w:tbl") {
        md.push(processTable(el));
    }
});

const result = md.join("\n\n");

page.grouped.content = result;
page.grouped.language = "markdown";
page.grouped.editorSwitches.switchTo("md-view");
page.grouped.title = page.title.replace(/\.xml$/, ".md");

preventOutput();
