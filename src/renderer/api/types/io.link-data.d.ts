import type { IContentPipe, IPipeDescriptor } from "./io.pipe";

/**
 * A single revision selector for the File Diff editor (target === "file-diff").
 * Structurally identical to the editor's `RevSel` (single source of truth):
 *   - unstaged → working tree (live editor content)
 *   - staged   → the git index (`:path`)
 *   - head     → the last commit (`HEAD:path`)
 *   - commit   → a specific commit (`<hash>:path`); an empty `hash` means the
 *     empty tree (e.g. a root commit's absent parent → empty side).
 */
export type ILinkDiffRevision =
    | { kind: "unstaged" }
    | { kind: "staged" }
    | { kind: "head" }
    | { kind: "commit"; hash: string; shortHash: string };

/**
 * Unified link data descriptor.
 *
 * Flows through the entire `openRawLink → openLink → openContent` pipeline.
 * Created by the caller, enriched by each layer (parsers, resolvers, open handler),
 * and stored on the page as the source link.
 *
 * When subscribing to link pipeline events, the event IS an ILinkData:
 * @example
 * app.events.openRawLink.subscribe((data) => {
 *     console.log(data.href);    // raw input
 *     data.target = "browser";   // override target editor
 * });
 *
 * @example
 * // Open a link with full context
 * await app.events.openRawLink.sendAsync(io.createLinkData("https://example.com", {
 *     target: "browser",
 *     browserMode: "incognito",
 * }));
 */
export interface ILinkData {
    // ── Pipeline control ──────────────────────────────────────────
    /** Set to `true` to short-circuit the current channel's pipeline.
     *  Undefined is treated as `false`. */
    handled?: boolean;

    // ── Core identity ────────────────────────────────────────────
    /** Raw link string — file path, URL, cURL command, etc. Always set by callers via createLinkData(). */
    href?: string;
    /** Resolved URL after Layer 1 parsing (normalized path, extracted URL from cURL, etc.).
     *  If not set by a parser, open-handler uses `href` as fallback. */
    url?: string;

    // ── ILink-compatible fields (present when opened from an ILink) ──
    /** Unique identifier of the originating link item. */
    id?: string;
    /** Display title. */
    title?: string;
    /** Category path (using "/" separators). */
    category?: string;
    /** Metadata tags. */
    tags?: string[];
    /** Whether the originating item is a directory. */
    isDirectory?: boolean;
    /** Preview image URL. */
    imgSrc?: string;
    /** File size in bytes. */
    size?: number;
    /** Last modified time (ISO string). */
    mtime?: string;

    // ── Pipeline resolution (set by layers) ───────────────────────
    /** Target editor ID. Can be set by caller (from ILink.target), overridden by pipeline. */
    target?: string;
    /** Resolved pipe descriptor (set by Layer 2 resolvers). Persisted in page state. */
    pipeDescriptor?: IPipeDescriptor;
    /** Temporal pipe instance (set by Layer 2, consumed by Layer 3).
     *  NOT persisted — stripped before storage. */
    pipe?: IContentPipe;

    // ── Navigation hints (ephemeral — not persisted) ──────────────
    /** Open in this specific page instead of a new tab. */
    pageId?: string;
    /** Scroll to this line after opening. */
    revealLine?: number;
    /** Highlight occurrences of this text after opening. */
    highlightText?: string;
    /** Preselect the File Diff "from" (left) revision. Consumed once, only when
     *  a fresh File Diff editor is constructed on open (target === "file-diff"). */
    diffFrom?: ILinkDiffRevision;
    /** Preselect the File Diff "to" (right) revision. Consumed once, only when
     *  a fresh File Diff editor is constructed on open (target === "file-diff"). */
    diffTo?: ILinkDiffRevision;

    // ── HTTP metadata (from cURL parser or callers) ───────────────
    /** HTTP headers. */
    headers?: Record<string, string>;
    /** HTTP method. */
    method?: string;
    /** HTTP body. */
    body?: string;

    // ── Browser routing (ephemeral — not persisted) ───────────────
    /** Browser routing mode ("os-default" | "internal" | "incognito" | "profile:<name>"). */
    browserMode?: string;
    /** Route URL to a specific browser page (add/navigate tab). */
    browserPageId?: string;
    /** How to open in the target browser page ("navigate" | "addTab"). */
    browserTabMode?: "navigate" | "addTab";

    // ── Content hints (ephemeral — not persisted) ─────────────────
    /** Fallback editor target when URL has no recognized extension. */
    fallbackTarget?: string;

    // ── Source tracking ───────────────────────────────────────────
    /** ID of the source editor/model that initiated this link opening.
     *  Used by ArchiveEditorModel to track provenance. */
    sourceId?: string;
    /** The selected tag when opened from a Tags panel (sourceId === "link-tag").
     *  Used by the player to find sibling tracks within the same tag.
     *  Named "selectedTag" (not "tag") because a link can have multiple tags —
     *  this is the tag the user selected, not a property of the link itself. */
    selectedTag?: string;
    /** The Explorer root a board was opened from. Scopes the in-board boards
     *  switcher: the board reads it back from `state.sourceLink` and lists the
     *  trusted boards under it. Set by the opener (Boards panel / in-board
     *  switcher / Explorer manifest row); absent for a board opened standalone
     *  (MCP / a bare `persephone-board://`), which then shows a plain path label.
     *  Persisted (NOT in EPHEMERAL_FIELDS) so a restored board keeps its switcher
     *  scope; never copied into a stored Link `ILink` (`linkDataToLink` ignores it). */
    explorerRoot?: string;
}
