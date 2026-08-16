import type { IContentPipe, IPipeDescriptor } from "./io.pipe";
import type { ILink } from "./io.tree";

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
 * Persistable link identity, link-item metadata, and HTTP request information.
 * This shape is independent of a single open attempt, so it can be stored on a
 * page as that page's source link.
 */
export interface ILinkCore extends Partial<ILink> {
    /** Raw link string — file path, URL, cURL command, etc. */
    href?: string;
    /** Resolved URL after Layer 1 parsing (normalized path, extracted cURL URL, etc.). */
    url?: string;
    /** HTTP headers. */
    headers?: Record<string, string>;
    /** HTTP method. */
    method?: string;
    /** HTTP body. */
    body?: string;
}

/**
 * Persistable routing and source-provenance metadata. These fields describe
 * where a link should open and why, rather than transient pipeline work.
 */
export interface ILinkNav {
    /** Target editor ID. Can be set by caller (from ILink.target), overridden by pipeline. */
    target?: string;
    /** Resolved pipe descriptor (set by Layer 2 resolvers). Persisted in page state. */
    pipeDescriptor?: IPipeDescriptor;
    /** ID of the source editor/model that initiated this link opening. */
    sourceId?: string;
    /** The selected tag when opened from a Tags panel (`sourceId === "link-tag"`). */
    selectedTag?: string;
    /** Explorer root that scopes a board's in-board boards switcher. */
    explorerRoot?: string;
    /** File a custom-editor board edits; rides its `persephone-board://` source link. */
    filePath?: string;
}

/**
 * One-open control state. These fields are consumed during the event pipeline
 * and must never be persisted as a page source link.
 */
export interface ILinkPipeline {
    /** Set to `true` to short-circuit the current channel's pipeline. */
    handled?: boolean;
    /** Temporal pipe instance (set by Layer 2, consumed by Layer 3). */
    pipe?: IContentPipe;
    /** Open in this specific page instead of a new tab. */
    pageId?: string;
    /** Scroll to this line after opening. */
    revealLine?: number;
    /** Highlight occurrences of this text after opening. */
    highlightText?: string;
    /** Scroll to this document fragment (anchor / heading slug) after opening. */
    fragment?: string;
    /** Preselect the File Diff "from" (left) revision for a fresh editor. */
    diffFrom?: ILinkDiffRevision;
    /** Preselect the File Diff "to" (right) revision for a fresh editor. */
    diffTo?: ILinkDiffRevision;
    /** Preselect the Environment Variables editor's namespace section. */
    envNamespace?: string;
    /** Browser routing mode ("os-default" | "internal" | "incognito" | "profile:<name>"). */
    browserMode?: string;
    /** Route URL to a specific browser page (add/navigate tab). */
    browserPageId?: string;
    /** How to open in the target browser page ("navigate" | "addTab"). */
    browserTabMode?: "navigate" | "addTab";
    /** Fallback editor target when URL has no recognized extension. */
    fallbackTarget?: string;
}

/**
 * Unified link descriptor. It flows through `openRawLink → openLink → openContent`,
 * where callers and each pipeline layer enrich the same object.
 *
 * @example
 * await app.events.openRawLink.sendAsync(io.createLinkData("https://example.com", {
 *     target: "browser",
 *     browserMode: "incognito",
 * }));
 */
export type ILinkData = ILinkCore & Partial<ILinkNav> & Partial<ILinkPipeline>;

/** The persistence-safe subset stored on a page as its source link. */
export type StoredLinkData = ILinkCore & Partial<ILinkNav>;
