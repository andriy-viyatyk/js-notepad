const PIPELINE_SCHEMES = new Set([
    "data",
    "git-tree",
    "mneme",
    "mneme-folder",
    "persephone-board",
    "persephone-toolset",
    "tree-category",
]);

const PIPELINE_INPUT_FORMS =
    "an HTTP(S) URL, a file:// URL, a Windows/UNC path, or a registered Persephone link scheme";

function pipelineInputError(memberName: string, detail: string): Error {
    return new TypeError(`${memberName} ${detail}. Expected ${PIPELINE_INPUT_FORMS}.`);
}

/**
 * Validate the browser-tab opener's deliberately permissive input contract.
 * Browser navigation accepts search text as well as URL-shaped strings, so the
 * original value is returned unchanged after the empty-input check.
 */
export function validateBrowserOpenInput(value: unknown): string {
    if (typeof value !== "string") {
        throw new TypeError("pages.openUrlInBrowserTab requires a non-empty string URL or search query.");
    }
    if (value.trim().length === 0) {
        throw new TypeError("pages.openUrlInBrowserTab requires a non-empty string URL or search query.");
    }
    return value;
}

function isWindowsOrUncPath(value: string): boolean {
    return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
}

function isValidHttpUrl(value: string): boolean {
    if (!/^https?:\/\//.test(value)) return false;
    try {
        const parsed = new URL(value);
        return parsed.hostname.length > 0;
    } catch {
        return false;
    }
}

function isValidFileUrl(value: string): boolean {
    if (!value.startsWith("file://")) return false;
    try {
        const parsed = new URL(value);
        return parsed.protocol === "file:" && (parsed.hostname.length > 0 || parsed.pathname.length > 1);
    } catch {
        return false;
    }
}

function isValidDataUrl(value: string): boolean {
    if (!value.startsWith("data:") || !value.includes(",")) return false;
    try {
        return new URL(value).protocol === "data:";
    } catch {
        return false;
    }
}

function isValidRegisteredScheme(value: string): boolean {
    const match = /^([a-z][a-z\d+.-]*):\/\//.exec(value);
    if (!match || !PIPELINE_SCHEMES.has(match[1])) return false;
    if (/\s/.test(value) || value.slice(match[0].length).length === 0) return false;
    try {
        return new URL(value).protocol === `${match[1]}:`;
    } catch {
        return false;
    }
}

/**
 * Validate a raw href before it enters the content-delivery pipeline.
 * Unlike the browser opener, a bare search phrase is not a pipeline href.
 */
export function validatePipelineOpenInput(value: unknown, memberName = "pages.openUrl"): string {
    if (typeof value !== "string") {
        throw pipelineInputError(memberName, "requires a supported non-empty URL or file path");
    }

    const href = value.trim();
    if (href.length === 0) {
        throw pipelineInputError(memberName, "requires a supported non-empty URL or file path");
    }
    if (isWindowsOrUncPath(href) || isValidHttpUrl(href) || isValidFileUrl(href)) {
        return href;
    }
    if (isValidDataUrl(href) || isValidRegisteredScheme(href)) {
        return href;
    }

    const scheme = /^([a-z][a-z\d+.-]*):/i.exec(href)?.[1];
    if (scheme) {
        throw pipelineInputError(memberName, `does not support the ${JSON.stringify(`${scheme}:`)} scheme`);
    }
    throw pipelineInputError(memberName, "received a malformed or unsupported URL/path");
}
