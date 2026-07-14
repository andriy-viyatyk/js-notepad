/**
 * Custom-editor registry (EPIC-042 / US-837). Enumerates the TRUSTED boards, reads each board's
 * `board-manifest.json`, and maps files → the boards that claim them (via the manifest's
 * `fileMasks` / `editorPriority`, US-836). It answers, synchronously, "which trusted boards
 * claim this file, and at what priority" — the data source the resolution (US-838) and
 * switch-widget tasks consume.
 *
 * Mirrors `registeredTools` (EPIC-038): a `TModel` singleton over `TGlobalState`, an in-memory
 * subscription to trust changes (NOT a filesystem watcher — CE7), a full-rebuild `refresh()`,
 * and sync getters + reactive hooks. An untrust flips associations live (CE3).
 *
 * Nested boards are unsupported by design: each board lives in its own folder, so `refresh()`
 * enumerates `boardTrust.listPaths()` directly and does NO subtree discovery (a board trusted
 * only via an ancestor folder is intentionally not enumerated).
 */
import { TModel } from "../../core/state/model";
import { TGlobalState } from "../../core/state/state";
import { fpBasename, isPlainLocalPath } from "../../core/utils/file-path";
import { editorRegistry } from "../base/editorRegistry";
import { boardTrust } from "../../api/board-trust";
import {
    getBoardEditorAssociation,
    matchesFileMask,
    readBoardManifest,
} from "./board-manifest";

/** Prefix marking a virtual custom-editor id. The remainder is the board root VERBATIM
 *  (original case, may contain ':' and '\\' on Windows — parse by prefix, never by split). */
export const BOARD_EDITOR_ID_PREFIX = "board-editor:";

/** Build the virtual editor id for a board acting as a custom editor. Carries the ORIGINAL-case
 *  root (BoardEditorModel needs the real path to load); do not normalize it into the id. */
export function boardEditorId(boardRoot: string): string {
    return BOARD_EDITOR_ID_PREFIX + boardRoot;
}

/** Extract the board root from a `board-editor:<root>` id, or null if it isn't one. */
export function parseBoardEditorId(editorId: string): string | null {
    return editorId.startsWith(BOARD_EDITOR_ID_PREFIX)
        ? editorId.slice(BOARD_EDITOR_ID_PREFIX.length)
        : null;
}

/** A trusted, file-associated board resolved from its manifest. One per trusted board that
 *  declares usable `fileMasks`. */
export interface CustomEditorMatch {
    /** Virtual editor id: `board-editor:<boardRoot>` (original-case root). */
    editorId: string;
    /** Absolute board root, original case — what BoardEditorModel loads. */
    boardRoot: string;
    /** Switch-widget display name: editorName ?? manifest.name ?? basename(root). */
    name: string;
    /** Resolution priority (>= 0) from the manifest (US-836 `editorPriority`). */
    priority: number;
    /** The board's normalized glob masks (for matching + introspection). */
    fileMasks: string[];
}

interface CustomEditorRegistryState {
    /** Every trusted, file-associated board, in trusted-list (registration) order. */
    entries: CustomEditorMatch[];
}

const defaultState: CustomEditorRegistryState = { entries: [] };

class CustomEditorRegistry extends TModel<CustomEditorRegistryState> {
    private initialized = false;
    private pathsSub: (() => void) | undefined;

    constructor() {
        super(new TGlobalState(defaultState));
        // In-memory reactive subscription (NOT a filesystem watcher): re-enumerate on any
        // trust/untrust — this is what makes an untrust drop the association live (CE3/CE7).
        this.pathsSub = boardTrust.subscribePaths(() => {
            void this.refresh();
        });
    }

    /** Idempotent: load the trusted list then enumerate. Call before reading state. */
    async ensureInitialized(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;
        await boardTrust.load();
        await this.refresh();
    }

    /** Re-read every trusted board's manifest and rebuild the reactive state. Full rebuild
     *  (cheap at registry scale; a manifest edit can change masks/priority). Enumerates all
     *  trusted roots directly — nested boards are unsupported by design, so no subtree walk. */
    async refresh(): Promise<void> {
        const roots = boardTrust.listPaths();
        const entries: CustomEditorMatch[] = [];
        for (const root of roots) {
            const manifest = await readBoardManifest(root);
            const assoc = getBoardEditorAssociation(manifest);
            if (!assoc) continue; // no fileMasks → not a custom editor
            const name =
                assoc.editorName ||
                (manifest && typeof manifest.name === "string" && manifest.name.trim()) ||
                fpBasename(root);
            entries.push({
                editorId: boardEditorId(root),
                boardRoot: root,
                name,
                priority: assoc.editorPriority,
                fileMasks: assoc.fileMasks,
            });
        }
        this.state.update((s) => {
            s.entries = entries;
        });
    }

    /** All file-associated boards (sync, non-reactive). */
    get entries(): CustomEditorMatch[] {
        return this.state.get().entries;
    }

    /**
     * Boards claiming `fileName`, in trusted-list order (SYNC — safe for resolveId). Matches the
     * BASENAME against each board's masks (a mask like "*.drawio" must not match a directory
     * segment). Returns [] before `ensureInitialized()` completes → graceful built-in fallback.
     * Local-file gating (CE4: hide the option for https/archive) is the CALLER's job, not here.
     */
    getBoardsForFile(fileName: string): CustomEditorMatch[] {
        if (!fileName) return [];
        const base = fpBasename(fileName);
        return this.state
            .get()
            .entries.filter((e) => e.fileMasks.some((m) => matchesFileMask(base, m)));
    }

    /** Reactive variant for the switch widget — re-renders when trust/masks change. */
    useBoardsForFile(fileName: string): CustomEditorMatch[] {
        return this.state.use((s) => {
            if (!fileName) return [];
            const base = fpBasename(fileName);
            return s.entries.filter((e) => e.fileMasks.some((m) => matchesFileMask(base, m)));
        });
    }

    dispose(): void {
        this.pathsSub?.();
        this.pathsSub = undefined;
    }
}

export const customEditorRegistry = new CustomEditorRegistry();

/**
 * Resolve the winning editor id for opening a file, merging the built-in registry with
 * trusted file-associated boards (EPIC-042). A board wins only when the path is a real
 * local file (boards edit local files only) and its `editorPriority` is STRICTLY greater
 * than the best built-in claimant (built-ins win exact ties; among boards, trusted-list
 * order — `getBoardsForFile` preserves it). Returns the built-in id otherwise.
 *
 * Consumed by the two file-open decision points — `PagesLifecycleModel.newEditorModel`
 * (direct open) and the Layer 2 file resolver (`content/resolvers.ts`, openRawLink). Both
 * registries stay separate data structures; this only READS both.
 */
export function resolveEditorIdForFile(filePath?: string): string | undefined {
    const builtinDef = filePath ? editorRegistry.resolve(filePath) : undefined;
    const builtinId = builtinDef?.id;
    if (!filePath || !isPlainLocalPath(filePath)) return builtinId;
    const builtinPriority = builtinDef?.match?.acceptFile?.(filePath) ?? 0;
    let best: CustomEditorMatch | undefined;
    for (const b of customEditorRegistry.getBoardsForFile(filePath)) {
        // Strict `>` so the FIRST (earliest-trusted) board wins ties among boards.
        if (!best || b.priority > best.priority) best = b;
    }
    if (best && best.priority > builtinPriority) return best.editorId;
    return builtinId;
}

/**
 * True for either board editor id form — the plain `board-view` (a board opened as a
 * page) or a custom-editor `board-editor:<root>` (a board editing a file). Used by the
 * MCP / automation board-detection sites so a custom-editor board stays automatable.
 */
export function isBoardEditorId(id: string | undefined): boolean {
    return id === "board-view" || (!!id && parseBoardEditorId(id) !== null);
}
