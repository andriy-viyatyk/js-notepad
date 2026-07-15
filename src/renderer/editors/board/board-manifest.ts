import { fs } from "../../api/fs";
import { fpJoin } from "../../core/utils/file-path";

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

    // ── Custom Editor axis (EPIC-042) — acted upon only when the board is TRUSTED ──
    /**
     * File masks this board is the editor for, matched against the file NAME (basename).
     * Globs: `*` = any run of chars, `?` = one char. Examples: "*.drawio", "*.grid.json".
     * `normalizeFileMasks` lowercases/trims and coerces a bare extension ("drawio",
     * ".DRAWIO") into a suffix mask ("*.drawio"). Empty/absent → not a file-associated editor.
     */
    fileMasks?: string[];
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
 * A bare extension (no wildcard) is coerced to a suffix mask: "drawio" / ".DRAWIO" →
 * "*.drawio"; an explicit glob ("*.grid.json") is kept as-is. Non-string / empty entries
 * are dropped. Non-array input → [].
 */
export function normalizeFileMasks(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const entry of raw) {
        if (typeof entry !== "string") continue;
        let mask = entry.trim().toLowerCase();
        if (!mask) continue;
        // Forgiving: a bare extension (no glob char) becomes a "*.<ext>" suffix mask.
        if (!mask.includes("*") && !mask.includes("?")) {
            if (!mask.startsWith(".")) mask = "." + mask;
            mask = "*" + mask;
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

/** A board's parsed, validated file-editor association (Custom Editor axis). */
export interface BoardEditorAssociation {
    /** Normalized, lowercase glob masks (e.g. "*.drawio", "*.grid.json"). Guaranteed non-empty. */
    fileMasks: string[];
    /** Resolution priority (>= 0). Non-finite / negative input → 0. */
    editorPriority: number;
    /** Optional switch-widget display name (trimmed; empty → undefined). */
    editorName?: string;
    /** Normalized board editor kind. Any value other than "content-host" → "simple". */
    editorKind: "simple" | "content-host";
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
    if (fileMasks.length === 0) return null;
    const rawPriority = manifest.editorPriority;
    const editorPriority =
        typeof rawPriority === "number" && Number.isFinite(rawPriority) && rawPriority > 0
            ? rawPriority
            : 0;
    const name = typeof manifest.editorName === "string" ? manifest.editorName.trim() : "";
    const editorKind = manifest.editorKind === "content-host" ? "content-host" : "simple";
    return {
        fileMasks,
        editorPriority,
        editorName: name || undefined,
        editorKind,
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
