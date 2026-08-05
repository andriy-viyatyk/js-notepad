import type { AcceptanceInput, EditorMatcher } from "./editorRegistry";
import { isArchiveFile } from "../../core/utils/file-path";
import { getLanguageByExtension } from "../../core/utils/language-mapping";

// ── Shared helpers (relocated from register-editors.ts) ──────────────────────

const matchesExtension = (fileName: string, extensions: string[]): boolean => {
    const lower = fileName.toLowerCase();
    return extensions.some((ext) => lower.endsWith(ext));
};

const matchesPattern = (fileName: string, pattern: RegExp): boolean =>
    pattern.test(fileName.toLowerCase());

// Patterns for specialized JSON editors (excluded from grid-json switch).
const SPECIALIZED_JSON_PATTERNS = [
    /\.note\.json$/i,
    /\.link\.json$/i,
    /\.fg\.json$/i,
    /\.excalidraw$/i,
];

const isSpecializedJson = (fileName?: string): boolean =>
    fileName ? SPECIALIZED_JSON_PATTERNS.some((p) => p.test(fileName)) : false;

// Any extension the monaco language table maps to "markdown" (.md, .markdown, .mkd, …).
const isMarkdownFile = (fileName: string): boolean => {
    const dot = fileName.lastIndexOf(".");
    return dot >= 0 && getLanguageByExtension(fileName.slice(dot))?.id === "markdown";
};

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico"];
const VIDEO_EXTENSIONS = [
    ".mp4", ".webm", ".ogg", ".m3u8", ".m3u", ".mp3", ".wav", ".aac",
    ".flac", ".m4a", ".wma", ".opus", ".avi", ".mkv", ".mov",
];

// ── Per-editor matchers (keyed by editor id) ─────────────────────────────────

export const EDITOR_MATCHERS: Record<string, EditorMatcher> = {
    "monaco": {
        // Lowest file-resolution priority — the fallback for all files.
        acceptFile: () => 0,
        // Always the first switch option.
        switchOption: () => 0,
        validForLanguage: () => true,
    },
    "grid-json": {
        acceptFile: (fn) => (matchesPattern(fn, /\.grid\.json$/i) ? 20 : -1),
        switchOption: (lang, fn) => (lang === "json" && !isSpecializedJson(fn) ? 10 : -1),
        validForLanguage: (lang) => lang === "json",
    },
    "grid-csv": {
        acceptFile: (fn) => (matchesPattern(fn, /\.grid\.csv$/i) ? 20 : -1),
        switchOption: (lang) => (lang === "csv" ? 10 : -1),
        validForLanguage: (lang) => lang === "csv",
    },
    "grid-jsonl": {
        acceptFile: (fn) => (matchesPattern(fn, /\.grid\.jsonl$/i) ? 20 : -1),
        switchOption: (lang) => (lang === "jsonl" ? 10 : -1),
        validForLanguage: (lang) => lang === "jsonl",
    },
    "log-view": {
        acceptFile: (fn) => (matchesPattern(fn, /\.log\.jsonl$/i) ? 20 : -1),
        switchOption: (lang, fn) =>
            lang === "jsonl" && !!fn && matchesPattern(fn, /\.log\.jsonl$/i) ? 10 : -1,
        validForLanguage: (lang) => lang === "jsonl",
        detectsContent: (lang, content) =>
            lang === "jsonl" && /"type"\s*:\s*"log\./.test(content),
    },
    "md-view": {
        // Markdown files default to Preview: Persephone is used as a docs viewer far more
        // than a markdown editor. Priority 10 — above monaco's 0 floor, below the
        // specialized 20-tier — so a file-associated board needs editorPriority > 10 to
        // claim a markdown file.
        acceptFile: (fn) => (isMarkdownFile(fn) ? 10 : -1),
        switchOption: (lang) => (lang === "markdown" ? 10 : -1),
        validForLanguage: (lang) => lang === "markdown",
    },
    "notebook-view": {
        acceptFile: (fn) => (matchesPattern(fn, /\.note\.json$/i) ? 20 : -1),
        switchOption: (lang, fn) =>
            lang === "json" && !!fn && matchesPattern(fn, /\.note\.json$/i) ? 10 : -1,
        validForLanguage: (lang) => lang === "json",
        detectsContent: (lang, content) =>
            lang === "json"
            && content.includes('"type"')
            && /"type"\s*:\s*"note-editor"/.test(content)
            && content.includes('"notes"'),
    },
    "svg-view": {
        switchOption: (_lang, fn) => (!!fn && matchesExtension(fn, [".svg"]) ? 10 : -1),
        validForLanguage: (lang) => lang === "xml",
    },
    "html-view": {
        switchOption: (lang) => (lang === "html" ? 10 : -1),
        validForLanguage: (lang) => lang === "html",
    },
    "mermaid-view": {
        switchOption: (lang) => (lang === "mermaid" ? 10 : -1),
        validForLanguage: (lang) => lang === "mermaid",
    },
    "rest-client": {
        acceptFile: (fn) => (matchesPattern(fn, /\.rest\.json$/i) ? 20 : -1),
        switchOption: (lang, fn) =>
            lang === "json" && !!fn && matchesPattern(fn, /\.rest\.json$/i) ? 10 : -1,
        validForLanguage: (lang) => lang === "json",
        detectsContent: (lang, content) =>
            lang === "json"
            && content.includes('"type"')
            && /"type"\s*:\s*"rest-client"/.test(content)
            && content.includes('"requests"'),
    },
    "link-view": {
        acceptFile: (fn) => (matchesPattern(fn, /\.link\.json$/i) ? 20 : -1),
        switchOption: (lang, fn) =>
            lang === "json" && !!fn && matchesPattern(fn, /\.link\.json$/i) ? 10 : -1,
        validForLanguage: (lang) => lang === "json",
        detectsContent: (lang, content) =>
            lang === "json"
            && content.includes('"type"')
            && /"type"\s*:\s*"link-editor"/.test(content)
            && content.includes('"links"'),
    },
    "graph-view": {
        acceptFile: (fn) => (matchesPattern(fn, /\.fg\.json$/i) ? 20 : -1),
        switchOption: (lang, fn) =>
            lang === "json" && !!fn && matchesPattern(fn, /\.fg\.json$/i) ? 10 : -1,
        validForLanguage: (lang) => lang === "json",
        detectsContent: (lang, content) =>
            lang === "json"
            && content.includes('"type"')
            && /"type"\s*:\s*"force-graph"/.test(content)
            && content.includes('"nodes"'),
    },
    "draw-view": {
        acceptFile: (fn) => (matchesExtension(fn, [".excalidraw"]) ? 50 : -1),
        switchOption: (_lang, fn) => (!!fn && matchesExtension(fn, [".excalidraw"]) ? 10 : -1),
        validForLanguage: (lang) => lang === "json",
        detectsContent: (_lang, content) => /^\s*\{\s*"type"\s*:\s*"excalidraw"/.test(content),
    },
    "image-view": {
        acceptFile: (fn) => (matchesExtension(fn, IMAGE_EXTENSIONS) ? 100 : -1),
    },
    "archive-view": {
        acceptFile: (fn) => (isArchiveFile(fn) ? 100 : -1),
    },
    "video-view": {
        acceptFile: (fn) => (matchesExtension(fn, VIDEO_EXTENSIONS) ? 100 : -1),
    },
    "category-view": {
        acceptFile: (fn) => (fn.startsWith("tree-category://") ? 200 : -1),
    },
    "env-vars-view": {
        acceptFile: (fn) => (matchesPattern(fn, /\.env\.json$/i) ? 20 : -1),
        switchOption: (lang, fn) =>
            lang === "json" && !!fn && matchesPattern(fn, /\.env\.json$/i) ? 10 : -1,
        validForLanguage: (lang) => lang === "json",
    },
};

export function makeAccepts(match: EditorMatcher): (input: AcceptanceInput) => number {
    return (input) => {
        if (input.fileName) {
            const p = match.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        if (input.language) {
            const p = match.switchOption?.(input.language, input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        if (input.host && match.detectsContent) {
            const content = (input.host.state.get() as { content?: string }).content ?? "";
            if (match.detectsContent(input.language ?? "", content)) return 60;
        }
        return -1;
    };
}
