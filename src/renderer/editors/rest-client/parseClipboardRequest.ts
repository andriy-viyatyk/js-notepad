/**
 * Parse HTTP requests copied from browser DevTools network tab.
 *
 * Supported formats:
 * - Copy as fetch / Copy as fetch (Node.js)
 * - Copy as cURL (bash)
 * - Copy as cURL (cmd)
 */

import { BodyType, RawLanguage, RestHeader } from "./restClientTypes";

export interface ParsedRequest {
    method: string;
    url: string;
    headers: RestHeader[];
    body: string;
    bodyType: BodyType;
    bodyLanguage: RawLanguage;
    formData: RestHeader[];
}

/**
 * Auto-detect format and parse clipboard text into a request.
 * Returns null if the text doesn't match any known format.
 */
export function parseClipboardRequest(text: string): ParsedRequest | null {
    const trimmed = text.trim();
    if (trimmed.startsWith("fetch(")) return parseFetch(trimmed);
    if (/^curl\s/i.test(trimmed)) return parseCurl(trimmed);
    return null;
}

// =============================================================================
// Body type detection
// =============================================================================

function detectBodyType(
    headers: RestHeader[],
    body: string,
    isFormUrlencode: boolean,
): { bodyType: BodyType; bodyLanguage: RawLanguage; formData: RestHeader[] } {
    if (isFormUrlencode || getContentType(headers).includes("x-www-form-urlencoded")) {
        return {
            bodyType: "form-urlencoded",
            bodyLanguage: "plaintext",
            formData: parseUrlEncodedBody(body),
        };
    }

    if (!body) {
        return { bodyType: "none", bodyLanguage: "plaintext", formData: [] };
    }

    const ct = getContentType(headers);
    let bodyLanguage: RawLanguage = "plaintext";
    if (ct.includes("json")) bodyLanguage = "json";
    else if (ct.includes("javascript")) bodyLanguage = "javascript";
    else if (ct.includes("html")) bodyLanguage = "html";
    else if (ct.includes("xml")) bodyLanguage = "xml";

    return { bodyType: "raw", bodyLanguage, formData: [] };
}

function getContentType(headers: RestHeader[]): string {
    return (headers.find((h) => h.key.toLowerCase() === "content-type")?.value || "").toLowerCase();
}

function parseUrlEncodedBody(body: string): RestHeader[] {
    if (!body) return [];
    return body.split("&")
        .filter(Boolean)
        .map((pair) => {
            const eqIdx = pair.indexOf("=");
            const key = eqIdx >= 0 ? decodeURIComponent(pair.substring(0, eqIdx)) : decodeURIComponent(pair);
            const value = eqIdx >= 0 ? decodeURIComponent(pair.substring(eqIdx + 1)) : "";
            return { key, value, enabled: true };
        });
}

// =============================================================================
// Fetch parser
// =============================================================================

function parseFetch(text: string): ParsedRequest | null {
    try {
        // Extract URL: fetch("URL", { ... }) or fetch("URL")
        const urlMatch = text.match(/^fetch\(\s*["'](.*?)["']/);
        if (!urlMatch) return null;
        const url = urlMatch[1];

        let method = "GET";
        const headers: RestHeader[] = [];
        let body = "";

        // Extract the options object (second argument)
        // Find the first { after the URL
        const optionsStart = text.indexOf("{", text.indexOf(urlMatch[0]) + urlMatch[0].length);
        if (optionsStart !== -1) {
            // Find matching closing brace — handle nested objects
            const optionsStr = extractBalancedBraces(text, optionsStart);
            if (optionsStr) {
                // Parse as relaxed JSON (keys may be quoted with double quotes)
                const parsed = parseRelaxedJSON(optionsStr);
                const options = (parsed && typeof parsed === "object")
                    ? parsed as Record<string, unknown>
                    : null;
                if (options) {
                    if (options.method) method = String(options.method).toUpperCase();

                    if (options.headers && typeof options.headers === "object") {
                        for (const [key, value] of Object.entries(options.headers)) {
                            headers.push({ key, value: String(value), enabled: true });
                        }
                    }

                    if (options.body && options.body !== "null") {
                        body = String(options.body);
                    }
                }
            }
        }

        const { bodyType, bodyLanguage, formData } = detectBodyType(headers, body, false);
        return { method, url, headers, body, bodyType, bodyLanguage, formData };
    } catch {
        return null;
    }
}

/** Extract a balanced { ... } substring starting at the given index. */
function extractBalancedBraces(text: string, start: number): string | null {
    if (text[start] !== "{") return null;
    let depth = 0;
    let inString = false;
    let stringChar = "";
    let escaped = false;

    for (let i = start; i < text.length; i++) {
        const ch = text[i];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (ch === "\\") {
            escaped = true;
            continue;
        }

        if (inString) {
            if (ch === stringChar) inString = false;
            continue;
        }

        if (ch === '"' || ch === "'") {
            inString = true;
            stringChar = ch;
            continue;
        }

        if (ch === "{") depth++;
        if (ch === "}") {
            depth--;
            if (depth === 0) return text.substring(start, i + 1);
        }
    }
    return null;
}

/** Parse a JSON-like object that may have unquoted keys or trailing commas. */
function parseRelaxedJSON(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        // Try fixing common issues: unquoted keys, single quotes
        try {
            const fixed = text
                .replace(/'/g, '"')
                .replace(/,\s*([}\]])/g, "$1"); // remove trailing commas
            return JSON.parse(fixed);
        } catch {
            return null;
        }
    }
}

// =============================================================================
// cURL parser
// =============================================================================

function parseCurl(text: string): ParsedRequest | null {
    try {
        // Normalize: remove line continuations
        // bash: \ at end of line
        // cmd: ^ at end of line, and ^" escaping
        const normalized = text
            .replace(/\^\n/g, " ")          // cmd ^ continuation
            .replace(/\\\n/g, " ")          // bash \ continuation
            .replace(/\^"/g, '"')           // cmd ^" → "
            .replace(/\^\^/g, "^");         // cmd ^^ → ^

        // Tokenize respecting quotes
        const tokens = tokenizeCurl(normalized);
        if (tokens.length < 2 || tokens[0].toLowerCase() !== "curl") return null;

        let url = "";
        let method = "";
        const headers: RestHeader[] = [];
        let body = "";
        let cookies = "";
        let isFormUrlencode = false;

        let i = 1;
        while (i < tokens.length) {
            const token = tokens[i];

            if (token === "-H" || token === "--header") {
                i++;
                if (i < tokens.length) {
                    const headerStr = tokens[i];
                    const colonIdx = headerStr.indexOf(":");
                    if (colonIdx > 0) {
                        const key = headerStr.substring(0, colonIdx).trim();
                        const value = headerStr.substring(colonIdx + 1).trim();
                        headers.push({ key, value, enabled: true });
                    }
                }
            } else if (token === "-X" || token === "--request") {
                i++;
                if (i < tokens.length) method = tokens[i].toUpperCase();
            } else if (token === "--data-urlencode") {
                i++;
                if (i < tokens.length) {
                    isFormUrlencode = true;
                    body = body ? `${body}&${tokens[i]}` : tokens[i];
                }
            } else if (token === "-d" || token === "--data" || token === "--data-raw" || token === "--data-binary") {
                i++;
                if (i < tokens.length) body = tokens[i];
            } else if (token === "-b" || token === "--cookie") {
                i++;
                if (i < tokens.length) cookies = tokens[i];
            } else if (token === "--compressed" || token === "-L" || token === "--location" || token === "-s" || token === "--silent" || token === "-k" || token === "--insecure") {
                // Skip known flags without arguments
            } else if (!token.startsWith("-")) {
                // Positional argument = URL
                if (!url) url = token;
            }

            i++;
        }

        // Add cookies as Cookie header
        if (cookies) {
            headers.push({ key: "Cookie", value: cookies, enabled: true });
        }

        // Infer method if not explicit
        if (!method) {
            method = body ? "POST" : "GET";
        }

        if (!url) return null;

        const { bodyType, bodyLanguage, formData } = detectBodyType(headers, body, isFormUrlencode);
        return { method, url, headers, body, bodyType, bodyLanguage, formData };
    } catch {
        return null;
    }
}

/** Tokenize a cURL command respecting single and double quotes. */
function tokenizeCurl(text: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let inQuote = false;
    let quoteChar = "";
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (escaped) {
            // Inside single quotes, backslash is literal
            if (quoteChar === "'") {
                current += "\\";
            }
            current += ch;
            escaped = false;
            continue;
        }

        if (ch === "\\" && quoteChar !== "'") {
            escaped = true;
            continue;
        }

        if (inQuote) {
            if (ch === quoteChar) {
                inQuote = false;
            } else {
                current += ch;
            }
            continue;
        }

        if (ch === '"' || ch === "'") {
            inQuote = true;
            quoteChar = ch;
            continue;
        }

        if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
            if (current) {
                tokens.push(current);
                current = "";
            }
            continue;
        }

        current += ch;
    }

    if (current) tokens.push(current);
    return tokens;
}
