/**
 * The `call` path grammar (EPIC-083, design decision 2):
 *
 *   path     := "" | segment ( "." segment )*
 *   segment  := identifier suffix* | "$help"
 *   suffix   := "[" json-index "]" | "(" json-args ")"
 *
 * `pages[2].editor.rows` → member(pages) index(2) call(editor, []) member(rows).
 * Indexes and arguments are JSON literals (`2`, `"abc"`, `true`, `{"a":1}`); arguments are
 * comma-separated. Large or awkward values travel in the tool's `args`/`value` parameters, never in
 * the path — the grammar is deliberately small.
 *
 * Pure and process-agnostic: the main process parses the same string to peel `windows[i]` off.
 */

export type PathSegment =
    | { readonly type: "member"; readonly name: string }
    | { readonly type: "index"; readonly key: string | number }
    | { readonly type: "call"; readonly name: string; readonly args: unknown[] }
    | { readonly type: "help" };

export class PathSyntaxError extends Error {
    constructor(message: string, readonly offset: number) {
        super(`${message} (at offset ${offset})`);
        this.name = "PathSyntaxError";
    }
}

const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$]/;

export function parsePath(path: string): PathSegment[] {
    const source = path.trim();
    if (source === "") return [];
    const parser = new PathParser(source);
    return parser.parse();
}

/** Render a segment list back to path text (for `resolvedUpTo` and child paths). */
export function formatPath(segments: readonly PathSegment[]): string {
    let text = "";
    for (const segment of segments) {
        switch (segment.type) {
            case "member":
                text += text ? `.${segment.name}` : segment.name;
                break;
            case "index":
                text += `[${JSON.stringify(segment.key)}]`;
                break;
            case "call":
                text += (text ? "." : "") + `${segment.name}(${segment.args.map(a => JSON.stringify(a)).join(", ")})`;
                break;
            case "help":
                text += text ? ".$help" : "$help";
                break;
        }
    }
    return text;
}

/** Append a child's `segment` text (`[2]`, `.grouped`, `.editor`) to a parent path. */
export function joinChildPath(parentPath: string, childSegment: string): string {
    if (childSegment.startsWith("[")) return parentPath + childSegment;
    if (childSegment.startsWith(".")) return parentPath ? parentPath + childSegment : childSegment.slice(1);
    return parentPath ? `${parentPath}.${childSegment}` : childSegment;
}

class PathParser {
    private position = 0;

    constructor(private readonly source: string) {}

    parse(): PathSegment[] {
        const segments: PathSegment[] = [];
        for (;;) {
            this.parseSegment(segments);
            if (this.position >= this.source.length) return segments;
            if (this.source[this.position] !== ".") {
                throw new PathSyntaxError(`Expected "." or end of path, found "${this.source[this.position]}"`, this.position);
            }
            this.position++;
            if (this.position >= this.source.length) throw new PathSyntaxError("Path ends with \".\"", this.position);
        }
    }

    private parseSegment(segments: PathSegment[]): void {
        const start = this.position;
        if (this.source.startsWith("$help", start)) {
            this.position += 5;
            if (this.position < this.source.length) {
                throw new PathSyntaxError("\"$help\" must be the last segment", this.position);
            }
            segments.push({ type: "help" });
            return;
        }
        const name = this.readIdentifier();
        let consumedName = false;
        for (;;) {
            const char = this.source[this.position];
            if (char === "(") {
                if (consumedName) throw new PathSyntaxError("A call must directly follow a member name", this.position);
                segments.push({ type: "call", name, args: this.readArguments() });
                consumedName = true;
            } else if (char === "[") {
                if (!consumedName) {
                    segments.push({ type: "member", name });
                    consumedName = true;
                }
                segments.push({ type: "index", key: this.readIndex() });
            } else {
                break;
            }
        }
        if (!consumedName) segments.push({ type: "member", name });
    }

    private readIdentifier(): string {
        const start = this.position;
        if (this.position >= this.source.length || !IDENTIFIER_START.test(this.source[this.position])) {
            throw new PathSyntaxError("Expected a member name", this.position);
        }
        while (this.position < this.source.length && IDENTIFIER_PART.test(this.source[this.position])) this.position++;
        return this.source.slice(start, this.position);
    }

    private readIndex(): string | number {
        const start = this.position;
        const inner = this.readBalanced("[", "]");
        let key: unknown;
        try {
            key = JSON.parse(inner);
        } catch {
            throw new PathSyntaxError(`Index must be an integer or a JSON string, found "${inner}"`, start + 1);
        }
        if (typeof key === "number" && Number.isInteger(key)) return key;
        if (typeof key === "string") return key;
        throw new PathSyntaxError(`Index must be an integer or a JSON string, found "${inner}"`, start + 1);
    }

    private readArguments(): unknown[] {
        const start = this.position;
        const inner = this.readBalanced("(", ")");
        if (inner.trim() === "") return [];
        try {
            return JSON.parse(`[${inner}]`) as unknown[];
        } catch {
            throw new PathSyntaxError(
                "Arguments must be comma-separated JSON literals; pass complex values in the \"args\" parameter instead",
                start + 1,
            );
        }
    }

    /** Read from the opening bracket at the cursor to its matching close, honouring JSON strings. */
    private readBalanced(open: string, close: string): string {
        const start = this.position;
        let depth = 0;
        let inString = false;
        for (; this.position < this.source.length; this.position++) {
            const char = this.source[this.position];
            if (inString) {
                if (char === "\\") this.position++;
                else if (char === "\"") inString = false;
                continue;
            }
            if (char === "\"") inString = true;
            else if (char === open || char === "[" || char === "(" || char === "{") depth++;
            else if (char === close || char === "]" || char === ")" || char === "}") {
                depth--;
                if (depth === 0) {
                    if (char !== close) throw new PathSyntaxError(`Expected "${close}", found "${char}"`, this.position);
                    this.position++;
                    return this.source.slice(start + 1, this.position - 1);
                }
            }
        }
        throw new PathSyntaxError(`Unterminated "${open}"`, start);
    }
}
