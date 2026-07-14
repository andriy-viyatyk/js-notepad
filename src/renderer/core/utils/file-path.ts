/**
 * Archive-aware path utility module.
 *
 * Wraps ALL `path` module functions used across the codebase.
 * No other renderer module should import `require("path")` directly —
 * everything goes through this module.
 *
 * Archive paths use `!` as separator: "D:/temp/doc.zip!word/document.xml"
 * - Archive file: "D:/temp/doc.zip"
 * - Inner path: "word/document.xml"
 */

const path = require("path") as typeof import("path");

// ── Archive path separator ──────────────────────────────────────────

const ARCHIVE_SEPARATOR = "!";

// ── Archive path helpers ────────────────────────────────────────────

/**
 * Check whether a file path is an archive path (contains `!` separator
 * where the left side has a known archive extension).
 *
 * Simple `!` in filenames (e.g., "Crash!Boom!Bang!.mp3") is NOT treated
 * as an archive separator — only `!` after a recognized archive extension is.
 */
export function isArchivePath(filePath: string): boolean {
    return findArchiveSeparator(filePath) >= 0;
}

/**
 * Parse an archive path into its archive file and inner path components.
 *
 * Scans for `!` positions where the left side has a known archive extension.
 * This correctly handles filenames containing `!` that are not archive paths.
 */
export function parseArchivePath(filePath: string): { archivePath: string; innerPath: string } {
    const idx = findArchiveSeparator(filePath);
    if (idx === -1) {
        return { archivePath: filePath, innerPath: "" };
    }
    return {
        archivePath: filePath.substring(0, idx),
        innerPath: filePath.substring(idx + 1),
    };
}

/**
 * Find the position of the `!` archive separator in a file path.
 * Returns the index of the `!` where the left side has a known archive extension,
 * or -1 if no valid archive separator is found.
 */
function findArchiveSeparator(filePath: string): number {
    let idx = -1;
    while ((idx = filePath.indexOf(ARCHIVE_SEPARATOR, idx + 1)) !== -1) {
        const left = filePath.substring(0, idx);
        const ext = getArchiveExtension(left);
        if (ARCHIVE_EXTENSIONS.has(ext)) return idx;
    }
    return -1;
}

/** Combine an archive file path and inner path into an archive path. */
export function buildArchivePath(archivePath: string, innerPath: string): string {
    return archivePath + ARCHIVE_SEPARATOR + innerPath;
}

// ── Archive file detection ──────────────────────────────────────────

const ZIP_BASED_EXTENSIONS = new Set([
    ".zip", ".docx", ".xlsx", ".pptx",
    ".jar", ".war", ".epub",
    ".odt", ".ods", ".odp",
]);

const ARCHIVE_EXTENSIONS = new Set([
    // ZIP-based
    ...ZIP_BASED_EXTENSIONS,
    // RAR
    ".rar",
    // 7-Zip
    ".7z",
    // TAR and compressed TAR
    ".tar", ".tar.gz", ".tgz", ".tar.bz2", ".tbz2", ".tar.xz", ".txz", ".tar.lz",
    // Other
    ".cab", ".iso",
]);

const COMPOUND_EXTENSIONS = [".tar.gz", ".tar.bz2", ".tar.xz", ".tar.lz"];

/**
 * Get the archive-aware extension for a file path.
 * Handles compound extensions like `.tar.gz` that `path.extname()` cannot.
 */
export function getArchiveExtension(filePath: string): string {
    const lower = filePath.toLowerCase();
    for (const compound of COMPOUND_EXTENSIONS) {
        if (lower.endsWith(compound)) return compound;
    }
    return path.extname(lower);
}

/** Check if a file is a ZIP-based archive that supports write operations. */
export function isZipBasedArchive(filePath: string): boolean {
    const ext = getArchiveExtension(filePath);
    return ZIP_BASED_EXTENSIONS.has(ext);
}

/**
 * Check if a file path points to an archive that can be browsed.
 * Returns false for paths already inside an archive (no nested archives).
 * Includes both ZIP-based archives and `.asar` (Electron archive).
 */
export function isArchiveFile(filePath: string): boolean {
    if (isArchivePath(filePath)) return false;
    const ext = getArchiveExtension(filePath);
    return ARCHIVE_EXTENSIONS.has(ext) || ext === ".asar";
}

/**
 * True for a plain local filesystem path — no `scheme://`, no `data:`, no
 * archive `!entry` bang. Windows drive paths (`C:\…`, `C:/…`) qualify (no `://`).
 * Gates custom-editor-board resolution / switch (a board edits a real local file
 * only — https / archive / virtual schemes are excluded).
 */
export function isPlainLocalPath(p: string): boolean {
    if (!p) return false;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return false; // http(s)://, mneme://, tree-category://, …
    if (p.startsWith("data:")) return false;
    if (p.includes("!")) return false;                    // archive entry (archivePath!entryPath)
    return true;
}

/**
 * Check if a file path points to an `.asar` archive file (not inside one).
 * Used to distinguish `.asar` from ZIP-based archives since they use different
 * I/O mechanisms (Electron native fs vs ArchiveService/jszip).
 */
export function isAsarFile(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === ".asar"
        && !isAsarPath(filePath);
}

/**
 * Check if a file path is inside an `.asar` archive.
 * Looks for a ".asar/" or ".asar\" segment followed by more path segments.
 * @example
 * isAsarPath("C:/path/app.asar/src/file.js") → true
 * isAsarPath("C:/path/app.asar")             → false (the archive itself)
 * isAsarPath("D:/normal/file.js")            → false
 */
export function isAsarPath(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, "/");
    return normalized.includes(".asar/");
}

// ── Archive-aware path functions ────────────────────────────────────

/**
 * Archive-aware `path.basename()`.
 * For archive paths, returns the basename of the inner path.
 * @example
 * fpBasename("D:/temp/some.zip!styles.xml")       → "styles.xml"
 * fpBasename("D:/temp/some.zip!word/document.xml") → "document.xml"
 * fpBasename("D:/temp/file.txt")                   → "file.txt"
 */
export function fpBasename(filePath: string, ext?: string): string {
    if (isArchivePath(filePath)) {
        const { innerPath } = parseArchivePath(filePath);
        return path.basename(innerPath || filePath, ext);
    }
    return path.basename(filePath, ext);
}

/**
 * Archive-aware `path.extname()`.
 * For archive paths, returns the extension of the inner path.
 * @example
 * fpExtname("D:/temp/some.zip!styles.xml")       → ".xml"
 * fpExtname("D:/temp/some.zip!word/document.xml") → ".xml"
 * fpExtname("D:/temp/file.txt")                   → ".txt"
 */
export function fpExtname(filePath: string): string {
    if (isArchivePath(filePath)) {
        const { innerPath } = parseArchivePath(filePath);
        return path.extname(innerPath || filePath);
    }
    return path.extname(filePath);
}

/**
 * Archive-aware `path.dirname()`.
 * For archive inner paths, navigates within the archive structure.
 * For archive root (e.g., "doc.zip!"), exits the archive to the parent folder.
 * @example
 * fpDirname("D:/temp/doc.zip!word/doc.xml") → "D:/temp/doc.zip!word"
 * fpDirname("D:/temp/doc.zip!word")         → "D:/temp/doc.zip!"
 * fpDirname("D:/temp/doc.zip!")             → "D:/temp"  (exits archive)
 * fpDirname("D:/temp/file.txt")             → "D:/temp"
 */
export function fpDirname(filePath: string): string {
    if (isArchivePath(filePath)) {
        const { archivePath, innerPath } = parseArchivePath(filePath);
        if (!innerPath) {
            // Archive root ("doc.zip!") — exit archive to parent folder
            return path.dirname(archivePath);
        }
        const lastSlash = innerPath.lastIndexOf("/");
        if (lastSlash === -1) {
            // Top-level file ("doc.zip!styles.xml") — return archive root
            return archivePath + ARCHIVE_SEPARATOR;
        }
        // Inner directory ("doc.zip!word/doc.xml" → "doc.zip!word")
        return buildArchivePath(archivePath, innerPath.substring(0, lastSlash));
    }
    return path.dirname(filePath);
}

// ── Pass-through wrappers ───────────────────────────────────────────

/**
 * Archive-aware `path.join()`.
 * For archive paths, joins inner segments with `/` (ZIP convention).
 * @example
 * fpJoin("D:/temp/doc.zip!", "word")        → "D:/temp/doc.zip!word"
 * fpJoin("D:/temp/doc.zip!word", "doc.xml") → "D:/temp/doc.zip!word/doc.xml"
 * fpJoin("D:/temp", "file.txt")             → "D:\\temp\\file.txt"
 */
export function fpJoin(...paths: string[]): string {
    if (paths.length > 0 && isArchivePath(paths[0])) {
        const { archivePath, innerPath } = parseArchivePath(paths[0]);
        const segments = innerPath ? [innerPath] : [];
        for (let i = 1; i < paths.length; i++) {
            if (paths[i]) segments.push(paths[i]);
        }
        return buildArchivePath(archivePath, segments.join("/"));
    }
    return path.join(...paths);
}

/** Wrapper for `path.resolve()`. */
export function fpResolve(...paths: string[]): string {
    return path.resolve(...paths);
}

/**
 * Normalize an absolute path for *identity comparison* — resolves to absolute,
 * unifies separators to "/", strips a trailing slash, and lowercases on Windows
 * (a case-insensitive filesystem). Use only for equality checks, never for display.
 */
export function fpNormalizeForCompare(filePath: string): string {
    const resolved = path.resolve(filePath).replace(/\\/g, "/").replace(/\/+$/, "");
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/** Wrapper for `path.relative()`. */
export function fpRelative(from: string, to: string): string {
    return path.relative(from, to);
}

/** Wrapper for `path.sep`. */
export const fpSep: string = path.sep;
