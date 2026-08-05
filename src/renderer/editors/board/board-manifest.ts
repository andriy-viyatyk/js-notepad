import { fs } from "../../api/fs";
import { fpBasename, fpDirname, fpJoin } from "../../core/utils/file-path";

/** File name of the board-identity manifest, at the board folder root. */
export const BOARD_MANIFEST_FILE = "board-manifest.json";

/** Current manifest schema version. Bump on a breaking shape change. */
export const BOARD_MANIFEST_SCHEMA_VERSION = 1;

/**
 * Board-identity manifest (EPIC-035 / US-745). Its presence is what marks a folder
 * as a board (it gates enumeration; consumed further in US-746 / US-749).
 *
 * Holds `schemaVersion` + optional **descriptive metadata** (name, description, author,
 * repository) plus the **Custom Editor** fields (`fileMasks` / `editorPriority` /
 * `editorName`, EPIC-042). The Custom Editor fields register the board as an editor for
 * matching files, but are **only honored when the board is TRUSTED** — the trust gate is
 * applied by the consumer (the custom-editor registry), never here.
 * Trust is NEVER stored here (a received board must not be able to self-trust —
 * EPIC-035 C2); trust lives in the app-side registry.
 */
/**
 * One secondary (sidebar) view a board declares (EPIC-044). `id` is the stable,
 * author-supplied view key (must NOT contain "::", the sidebar composite-key
 * separator). `html` is the board-relative entry file (defaults to the main
 * entry, "index.html", so one file can serve every view and branch on
 * `persephone.view`). `title` labels the sidebar panel; the panel icon is always
 * the board's own glyph (there is no per-view icon).
 */
export interface SecondaryViewDecl {
    id: string;
    html?: string;
    title?: string;
}

export interface BoardManifest {
    /** Schema version of this manifest. */
    schemaVersion: number;
    /** Optional display-name override. Falls back to the board folder name. */
    name?: string;
    /** Optional free-text description. Metadata only — does not drive behavior. */
    description?: string;
    /** Optional author / owner. Metadata only. */
    author?: string;
    /** Optional source-repository URL. Metadata only. */
    repository?: string;
    /**
     * Board version (semver string, EPIC-045). Metadata; the installed-version side of
     * the update comparison against the published catalog. Written/bumped by the author.
     */
    version?: string;
    /**
     * Whether the board is meaningful to open with no file / to pin (EPIC-045). Default is
     * DERIVED (see `isBoardStandalone`): true when the board has no `fileMasks`
     * (tools/dashboards), false when it has masks (a file-bound board must opt in).
     */
    standalone?: boolean;
    /**
     * Minimum Persephone version this board version requires (semver; absent = no
     * requirement, EPIC-045). Per-version app-compatibility gate.
     */
    minAppVersion?: string;

    // ── Custom Editor axis (EPIC-042) — acted upon only when the board is TRUSTED ──
    /**
     * File masks this board is the editor for, matched against the file NAME (basename).
     * Globs: `*` = any run of chars, `?` = one char. Examples: "*.drawio", "*.grid.json".
     * `normalizeFileMasks` lowercases/trims and coerces a bare extension ("drawio",
     * ".DRAWIO") into a suffix mask ("*.drawio"). Empty/absent → not a file-associated editor.
     */
    fileMasks?: string[];
    /**
     * Optional FOLDER scope for `fileMasks` — the board claims a matching file only when the
     * folder CONTAINING it also matches one of these masks. Absent/empty → any folder (the
     * default, and what every board without this field keeps doing). Narrowing only: folder
     * masks alone, with no `fileMasks`, register nothing.
     *
     * Matched against the file's parent folder, separator-agnostic (`\` and `/` both accepted)
     * and case-insensitive, anchored at the END of the path — a mask is a folder-path SUFFIX.
     * `*` and `?` stop at a separator; `**` crosses them. So `*\/tasks` (a trailing slash is
     * accepted and ignored) matches `…/dev/tasks`, `tasks` matches any folder of that name at
     * any depth, `**\/dev/tasks` spans intermediate segments, and an absolute mask
     * (`c:/projects/evergreen/**`) scopes the board to one tree.
     *
     * The gate is SKIPPED — not failed — when the caller knows only a file NAME and no path
     * (file-icon resolution). See `matchesBoardMasks`.
     */
    folderMasks?: string[];
    /**
     * File-open resolution priority on Persephone's editor ladder (monaco 0 / grid 20 /
     * draw 50 / viewers 100 / category 200). The board becomes the DEFAULT editor for its
     * masks when this exceeds the best built-in claimant's priority for the file.
     * Omitted/0 → switch-option-only; the built-in default is unchanged. A board is always
     * a switch option regardless of this value.
     */
    editorPriority?: number;
    /**
     * Display name shown on the editor-switch widget for this board. Falls back to `name`,
     * then the board folder name.
     */
    editorName?: string;
    /**
     * How Persephone sets this board up as a file editor (EPIC-043).
     * - absent / "simple": EPIC-042 behavior — the board gets a filePath (`getFilePath`) and
     *   reads/writes the file DIRECTLY via `readFile`/`writeFile`. No Persephone content host.
     * - "content-host": Persephone builds the board WITH a content host (owning the pipe,
     *   encoding, encryption, auto-save cache, and dirty state) and injects `persephone.host.*`.
     * Honored only when the board is TRUSTED, like every other Custom Editor field. Inert until
     * the construction path consumes it (US-845).
     */
    editorKind?: "simple" | "content-host";
    /**
     * Which SOURCES this board's `fileMasks` association accepts.
     * - absent / "local": plain local files only.
     * - "any": also archive entries (`archive.zip!doc.pdf`) and `http(s)` URLs. Persephone
     *   materializes such a source into a local cache file, so `getFilePath()` still hands the
     *   board a readable LOCAL path and the board needs no special handling.
     * Default-closed on purpose: a board that reads via `readFile(getFilePath())` would FAIL on a
     * bang path or a URL, so an undeclared board keeps losing those files to the built-in editor
     * (a clean fallback) instead of opening and erroring.
     * Honored only when the board is TRUSTED, like every other Custom Editor field.
     */
    editorSources?: "local" | "any";

    /**
     * Secondary (sidebar) views this board contributes (EPIC-044). Independent of
     * `fileMasks` / the custom-editor axis — a plain board can declare them too.
     * Read via `readBoardSecondaryViews` (NOT `getBoardEditorAssociation`).
     */
    secondaryViews?: SecondaryViewDecl[];
}

/** Absolute path to a board's manifest. */
export function boardManifestPath(boardRoot: string): string {
    return fpJoin(boardRoot, BOARD_MANIFEST_FILE);
}

/** A fresh, minimal manifest. */
export function defaultBoardManifest(): BoardManifest {
    return { schemaVersion: BOARD_MANIFEST_SCHEMA_VERSION };
}

/** True iff the folder carries a `board-manifest.json`. Cheap existence check —
 *  does not parse. (Enumeration / Explorer gating consume this in US-746 / US-749.) */
export async function isBoardFolder(boardRoot: string): Promise<boolean> {
    return fs.exists(boardManifestPath(boardRoot));
}

/** Read + parse a board's manifest. Returns null if absent or unparseable — callers
 *  treat a malformed / missing manifest as "no metadata", never throw. A manifest with
 *  an unknown (higher) schemaVersion is still returned (best-effort forward-compat). */
export async function readBoardManifest(boardRoot: string): Promise<BoardManifest | null> {
    const p = boardManifestPath(boardRoot);
    try {
        if (!(await fs.exists(p))) return null;
        const file = await fs.readFile(p);
        const parsed = JSON.parse(file.content);
        if (!parsed || typeof parsed !== "object") return null;
        return parsed as BoardManifest;
    } catch {
        return null;
    }
}

/**
 * Normalize a raw `fileMasks` value into lowercase, trimmed, de-duplicated glob masks.
 * An explicit glob ("*.grid.json") is kept as-is. A wildcard-free entry is interpreted
 * by shape:
 *
 * - starts with "." → an extension: ".DRAWIO" → "*.drawio", ".grid.json" → "*.grid.json"
 * - no dot at all   → an extension: "drawio" → "*.drawio"
 * - a dot inside it → a whole FILE NAME, kept exact: "DASHBOARD.md" → "dashboard.md",
 *   "package.json" → "package.json"
 *
 * The last case is what lets a board claim one specific file rather than a file type
 * (the case `folderMasks` exists to narrow further). Coercing it to "*.dashboard.md" —
 * as an extension-only reading does — yields a mask that matches nothing at all.
 *
 * Known limit: an extension-less name ("Makefile") is genuinely ambiguous and is read as
 * an extension, since that is overwhelmingly the common intent for a bare word. Spell such
 * a mask with a wildcard if you need it.
 *
 * Non-string / empty entries are dropped. Non-array input → [].
 */
export function normalizeFileMasks(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const entry of raw) {
        if (typeof entry !== "string") continue;
        let mask = entry.trim().toLowerCase();
        if (!mask) continue;
        if (!mask.includes("*") && !mask.includes("?")) {
            if (mask.startsWith(".")) {
                mask = "*" + mask;             // ".drawio" / ".grid.json" → extension
            } else if (!mask.includes(".")) {
                mask = "*." + mask;            // "drawio" → extension
            }
            // else: a dot inside a wildcard-free entry → an exact file name; keep as-is.
        }
        if (!out.includes(mask)) out.push(mask);
    }
    return out;
}

/** Compile a single glob mask into a case-insensitive, whole-name RegExp.
 *  `*` → any run, `?` → one char; every other glob char is literal. */
function maskToRegExp(mask: string): RegExp {
    // Escape regex specials EXCEPT the glob wildcards `*` and `?`, then expand those.
    const escaped = mask.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const body = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
    return new RegExp(`^${body}$`, "i");
}

/** True iff `fileName` (a basename — caller strips the directory) matches the glob mask.
 *  `mask` is assumed already normalized (lowercase) by `normalizeFileMasks`. */
export function matchesFileMask(fileName: string, mask: string): boolean {
    return maskToRegExp(mask).test(fileName);
}

/**
 * Normalize a raw `folderMasks` value into lowercase, trimmed, de-duplicated folder globs.
 * Separators are unified to "/", a leading "./" and any leading/trailing slashes are stripped
 * (so "*\/tasks/" and "*\/tasks" are the same mask). Unlike `normalizeFileMasks` there is NO
 * bare-name coercion — a plain "tasks" is already a meaningful folder mask. Non-string /
 * empty entries are dropped. Non-array input → [].
 */
export function normalizeFolderMasks(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const entry of raw) {
        if (typeof entry !== "string") continue;
        const mask = entry
            .trim()
            .toLowerCase()
            .replace(/\\/g, "/")
            .replace(/^\.\//, "")
            .replace(/^\/+/, "")
            .replace(/\/+$/, "");
        if (!mask) continue;
        if (!out.includes(mask)) out.push(mask);
    }
    return out;
}

/** Stands in for `**` while the single-`*` pass runs. NUL cannot occur in a path (nor in any
 *  sane mask), so it can never collide with authored text — unlike a printable stand-in such
 *  as a space, which is perfectly legal in a folder name. */
const GLOB_SENTINEL = "\u0000";

/** Compile a folder glob into a case-insensitive RegExp anchored at the END of the path
 *  (a folder mask is a path SUFFIX, so it need not spell out the drive/root). `**` crosses
 *  separators; `*` and `?` do not — which is what makes "*\/tasks" mean exactly one segment
 *  above "tasks". */
function folderMaskToRegExp(mask: string): RegExp {
    // Escape regex specials EXCEPT the glob wildcards, then expand those. `**` is parked on
    // the sentinel first so the single-`*` pass cannot chew through it.
    const escaped = mask.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const body = escaped
        .replace(/\*\*/g, GLOB_SENTINEL)
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]")
        .replace(new RegExp(GLOB_SENTINEL, "g"), ".*");
    return new RegExp(`(?:^|/)${body}$`, "i");
}

/** True iff `folderPath` (a file's parent folder) matches the folder glob `mask`.
 *  `mask` is assumed already normalized (lowercase, "/"-separated) by `normalizeFolderMasks`;
 *  `folderPath` may use either separator and may carry a trailing one. */
export function matchesFolderMask(folderPath: string, mask: string): boolean {
    const normalized = folderPath.replace(/\\/g, "/").replace(/\/+$/, "");
    if (!normalized) return false;
    return folderMaskToRegExp(mask).test(normalized);
}

/**
 * The single mask predicate for the Custom Editor axis: the board claims `filePathOrName`
 * iff its BASENAME matches one of `fileMasks` **and** (no folder masks, or its parent FOLDER
 * matches one of `folderMasks`).
 *
 * `filePathOrName` may legitimately be a bare file name rather than a path — a page title, or
 * a tree row's display name in the file-icon surfaces. With no directory to inspect, the
 * folder gate cannot be evaluated, and it is SKIPPED rather than failed: a folder-scoped board
 * still lends its icon to every name-matching file. That is a deliberate trade — the icon
 * carries no path, and an icon is cosmetic, whereas the two paths that DECIDE which editor
 * opens a file (`resolveEditorIdForFile`, the editor-switch widget) always hold a full path
 * and so always honor the folder scope.
 */
export function matchesBoardMasks(
    filePathOrName: string,
    fileMasks: string[],
    folderMasks: string[] = [],
): boolean {
    if (!filePathOrName) return false;
    if (!fileMasks.some((m) => matchesFileMask(fpBasename(filePathOrName), m))) return false;
    if (folderMasks.length === 0) return true;
    if (!/[\\/]/.test(filePathOrName)) return true; // a bare name — nothing to gate on
    const folder = fpDirname(filePathOrName);
    return folderMasks.some((m) => matchesFolderMask(folder, m));
}

/** A board's parsed, validated file-editor association (Custom Editor axis). */
export interface BoardEditorAssociation {
    /** Normalized, lowercase glob masks (e.g. "*.drawio", "*.grid.json"). Guaranteed non-empty. */
    fileMasks: string[];
    /** Normalized folder globs narrowing `fileMasks` to certain locations. Empty = any folder. */
    folderMasks: string[];
    /** Resolution priority (>= 0). Non-finite / negative input → 0. */
    editorPriority: number;
    /** Optional switch-widget display name (trimmed; empty → undefined). */
    editorName?: string;
    /** Normalized board editor kind. Any value other than "content-host" → "simple". */
    editorKind: "simple" | "content-host";
    /** Normalized accepted sources. Any value other than "any" → "local". */
    editorSources: "local" | "any";
}

/**
 * Extract the file-editor association from a manifest, or null if the board declares no
 * usable `fileMasks`. Pure — does NOT check trust (the caller gates on trust). This is the
 * single source of truth for how a manifest maps to an editor association.
 */
export function getBoardEditorAssociation(
    manifest: BoardManifest | null | undefined,
): BoardEditorAssociation | null {
    if (!manifest) return null;
    const fileMasks = normalizeFileMasks(manifest.fileMasks);
    // Folder masks only NARROW file masks — masks-free means no association at all, even when
    // `folderMasks` is present, so the check stays on `fileMasks` alone.
    if (fileMasks.length === 0) return null;
    const folderMasks = normalizeFolderMasks(manifest.folderMasks);
    const rawPriority = manifest.editorPriority;
    const editorPriority =
        typeof rawPriority === "number" && Number.isFinite(rawPriority) && rawPriority > 0
            ? rawPriority
            : 0;
    const name = typeof manifest.editorName === "string" ? manifest.editorName.trim() : "";
    const editorKind = manifest.editorKind === "content-host" ? "content-host" : "simple";
    const editorSources = manifest.editorSources === "any" ? "any" : "local";
    return {
        fileMasks,
        folderMasks,
        editorPriority,
        editorName: name || undefined,
        editorKind,
        editorSources,
    };
}

/**
 * Normalize a raw secondary-views value into validated decls. Forgiving: drops
 * non-object entries, entries with a missing/empty `id`, ids containing "::" (the
 * `<editorId>::<panelId>` composite-key separator), and duplicate ids (first wins);
 * trims `html`/`title` (empty → undefined). Non-array / absent → []. Never throws.
 * Shared by the manifest seed (`readBoardSecondaryViews`) and the runtime
 * `persephone.setSecondaryViews` path (`BoardEditorModel.setSecondaryViews`).
 */
export function normalizeSecondaryViews(raw: unknown): SecondaryViewDecl[] {
    if (!Array.isArray(raw)) return [];
    const out: SecondaryViewDecl[] = [];
    const seen = new Set<string>();
    for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue;
        const d = entry as SecondaryViewDecl;
        const id = typeof d.id === "string" ? d.id.trim() : "";
        if (!id || id.includes("::") || seen.has(id)) continue;
        seen.add(id);
        const html = typeof d.html === "string" && d.html.trim() ? d.html.trim() : undefined;
        const title = typeof d.title === "string" && d.title.trim() ? d.title.trim() : undefined;
        out.push({ id, html, title });
    }
    return out;
}

/**
 * Extract the declared secondary views from a manifest. Independent of `fileMasks`
 * (EPIC-044 O1). Delegates to `normalizeSecondaryViews`.
 */
export function readBoardSecondaryViews(
    manifest: BoardManifest | null | undefined,
): SecondaryViewDecl[] {
    return normalizeSecondaryViews(manifest?.secondaryViews);
}

/** Derived usage group for a board, for UI grouping / pin gating (EPIC-045). */
export type BoardUsageGroup = "file-viewer" | "file-editor" | "tool";

/**
 * Whether a board is standalone — openable with no file and eligible for pinning /
 * the "+" new-page dropdown (EPIC-045). Default when `standalone` is absent: no masks →
 * true (tools/dashboards are inherently standalone), masks → false (a file-bound board
 * must opt in). An explicit boolean always wins.
 */
export function isBoardStandalone(manifest: BoardManifest | null | undefined): boolean {
    if (typeof manifest?.standalone === "boolean") return manifest.standalone;
    return normalizeFileMasks(manifest?.fileMasks).length === 0;
}

/**
 * Derived usage group: **File viewer** (masks, not standalone — e.g. drawio-viewer),
 * **File editor** (masks + standalone — e.g. todo), **Tool / App** (no masks). Used by
 * the hub / pin surfaces to group boards.
 */
export function boardUsageGroup(manifest: BoardManifest | null | undefined): BoardUsageGroup {
    const hasMasks = normalizeFileMasks(manifest?.fileMasks).length > 0;
    if (!hasMasks) return "tool";
    return isBoardStandalone(manifest) ? "file-editor" : "file-viewer";
}

/** Write a manifest (2-space JSON + trailing newline for human-editability). */
export async function writeBoardManifest(boardRoot: string, manifest: BoardManifest): Promise<void> {
    await fs.write(boardManifestPath(boardRoot), JSON.stringify(manifest, null, 2) + "\n");
}

/** Write a default manifest only if the folder doesn't already have one. Used by the
 *  create flow so every new board — including the template-copy-failure fallback —
 *  is a valid, identifiable board. No-op when the template already supplied one. */
export async function ensureBoardManifest(boardRoot: string): Promise<void> {
    if (await isBoardFolder(boardRoot)) return;
    await writeBoardManifest(boardRoot, defaultBoardManifest());
}
