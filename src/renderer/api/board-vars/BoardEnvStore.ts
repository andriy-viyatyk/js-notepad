import { TComponentState } from "../../core/state/state";
import {
    TextFileModel,
    getDefaultTextFileEditorModelState,
} from "../../editors/text/TextEditorModel";
import { shell } from "../shell";
import { ui } from "../ui";
import { fs } from "../fs";
import { settings } from "../settings";
import {
    BoardVarsFile,
    BoardVarsLoadResult,
    DEFAULT_PROFILE,
} from "./types";

// =============================================================================
// BoardEnvStore (EPIC-046 / US-887).
//
// Session-singleton store over the global `.env.json` file (path from the
// `board-vars.file` setting). Mirrors the BrowserBookmarks encrypted-file
// pattern: a standalone TextFileModel restores the file, `ui.password` unlocks
// an encrypted one, and — because `decrypt()` installs a DecryptTransformer on
// the pipe — a later `saveFile()` re-encrypts automatically with no password
// handling here.
//
// The model is kept alive for the session so an unlocked encrypted file stays
// unlocked. Parsing is redone from `model.state.get().content` on every
// `ensureLoaded()` (the file is tiny), so there is no parse cache to invalidate;
// the model's own pipe watch keeps `content` fresh on external edits.
// =============================================================================

class BoardEnvStore {
    private model: TextFileModel | null = null;
    /** Path the current model was built for; null when no model. */
    private loadedPath: string | null = null;
    private parsed: BoardVarsFile = {};

    constructor() {
        // Drop the model when the configured path changes so the next call reloads.
        settings.onChanged.subscribe(({ key }) => {
            if (key === "board-vars.file") this.reset();
        });
    }

    /** The path most recently resolved by `ensureLoaded()` — lets `persephone.var.show()` open
     *  the file without the editor itself needing to know about the `board-vars.file` setting
     *  (US-889). Empty when never loaded. */
    get filePath(): string {
        return this.loadedPath ?? "";
    }

    private reset(): void {
        void this.model?.dispose();
        this.model = null;
        this.loadedPath = null;
        this.parsed = {};
    }

    /**
     * Idempotent: build/restore the model for the configured path, prompt-and-decrypt if the file
     * is locked (unless `silent`), then parse. Callers run this (and check `status === "ok"`)
     * before the sync accessors.
     */
    async ensureLoaded(opts?: { silent?: boolean }): Promise<BoardVarsLoadResult> {
        const path = (settings.get("board-vars.file") || "").trim();
        if (!path) return { status: "not-configured" };
        if (!(await fs.exists(path))) return { status: "not-configured" };

        if (this.loadedPath !== path) {
            this.reset();
            this.model = new TextFileModel(
                new TComponentState({
                    ...getDefaultTextFileEditorModelState(),
                    filePath: path,
                    language: "json",
                }),
            );
            this.model.skipSave = true;
            await this.model.restore();
            this.loadedPath = path;
        }
        const model = this.model;
        if (!model) return { status: "error", message: "No store model" };

        if (shell.encryption.isEncrypted(model.state.get().content || "")) {
            // `decrypted` is true once the password has been entered this session.
            if (!model.decrypted) {
                if (opts?.silent) return { status: "locked" };
                const password = await ui.password({
                    mode: "decrypt",
                    message: "Decrypt the board environment variables file to continue.",
                });
                if (!password) return { status: "locked" };
                const ok = await model.decrypt(password); // toasts on wrong password
                if (!ok) return { status: "locked" };
            }
        }

        try {
            const text = model.state.get().content || "";
            const parsed = text.trim() ? (JSON.parse(text) as BoardVarsFile) : {};
            this.parsed = parsed && typeof parsed === "object" ? parsed : {};
        } catch (e) {
            return { status: "error", message: (e as Error).message };
        }
        return { status: "ok" };
    }

    // ── Sync accessors — call ensureLoaded() (status "ok") first ─────────────

    /** A single value from a namespace's profile (`default` when `env` omitted). */
    get(namespace: string, name: string, env?: string): string | undefined {
        const value = this.parsed[namespace]?.[env || DEFAULT_PROFILE]?.[name];
        return typeof value === "string" ? value : undefined;
    }

    /** Key names in a namespace's profile (not values). */
    list(namespace: string, env?: string): string[] {
        return Object.keys(this.parsed[namespace]?.[env || DEFAULT_PROFILE] ?? {});
    }

    /** The whole parsed file (for the editor — US-889). Returns a live reference; do not mutate. */
    getAll(): BoardVarsFile {
        return this.parsed;
    }

    /**
     * Set one value, serialize, and write back. Because the model's pipe holds the
     * DecryptTransformer for an encrypted file, `saveFile()` re-encrypts on disk automatically.
     * Must run after a successful `ensureLoaded()` (which decrypts and builds the model).
     */
    async set(namespace: string, name: string, value: string, env?: string): Promise<void> {
        const model = this.model;
        if (!model) throw new Error("Board vars store is not loaded");
        const profile = env || DEFAULT_PROFILE;
        // Deep clone so the object handed out via getAll() is not mutated in place.
        const next: BoardVarsFile = JSON.parse(JSON.stringify(this.parsed));
        (next[namespace] ??= {});
        (next[namespace][profile] ??= {});
        next[namespace][profile][name] = value;
        this.parsed = next;
        model.changeContent(JSON.stringify(next, null, 4));
        await model.saveFile();
    }
}

export const boardVars = new BoardEnvStore();
