import { app } from "./app";
import { fs } from "./fs";
import type {
    IBoards,
    PublishedBoardResult,
    PublishedVersionResult,
    BoardUpdateInfo,
} from "./types/boards";
import type { EditorModel } from "../editors/base/EditorModel";

/**
 * `app.boards` — board lifecycle for scripts / agents (EPIC-035 / US-750).
 *
 * `createBoard` / `createDemoBoard` wrap the editor-independent
 * `createBoardFromTemplate` (which scaffolds the template, guarantees
 * `board-manifest.json`, and auto-trusts the board — EPIC-035 C5). `openBoard`
 * opens an existing board by its root path through the generic `app.openRawLink`
 * pipeline (encoding the `persephone-board://` link internally). Editor-adjacent
 * modules are reached via dynamic `import()` so the core `api` bundle stays
 * decoupled (C750-6).
 *
 * `registerBoard` / `unregisterBoard` / `renameBoard` (EPIC-045 / US-868) are the
 * lifecycle triples for agents: register requests trust via the user's dialog (never
 * self-trusts), unregister untrusts + unpins, rename moves a trusted board to a new
 * folder carrying its trust/pin/install registration along with no dialog.
 *
 * `searchPublished` / `getPublishedVersions` / `downloadPublished` / `installPublished` /
 * `uninstallBoard` / `checkPublishedUpdates` (EPIC-045 / US-869) drive the published-boards
 * catalog. The same request-vs-grant model holds: download trusts nothing (inert code on disk for
 * review), install shows the user the trust dialog, uninstall shows the delete confirmation.
 */
async function create(name: string, dir: string, template: string): Promise<string> {
    // Ensure the container exists (recursive; no-op if present) so creating into a
    // not-yet-existing path works without a separate mkdir (C750-5).
    await fs.mkdir(dir);
    const { createBoardFromTemplate } = await import("../editors/board/board-scaffold");
    return createBoardFromTemplate(name, dir, template);
}

/** Load the catalog + install registry so the sync catalog helpers below have data. */
async function ensureCatalog(): Promise<void> {
    const { publishedBoards } = await import("./published-boards");
    const { boardInstallRegistry } = await import("./board-install-registry");
    await publishedBoards.load();
    await boardInstallRegistry.load();
}

/** Default install container when the caller passes no `dir`. */
async function defaultInstallDir(): Promise<string> {
    const { fpJoin } = await import("../core/utils/file-path");
    const { api } = await import("../../ipc/renderer/api");
    return fpJoin(await api.getCommonFolder("userData"), "data", "boards");
}

export const boards: IBoards = {
    createBoard: (name, dir) => create(name, dir, "board-template"),
    createDemoBoard: (name, dir) => create(name, dir, "demo-board"),
    openBoard: async (boardRoot: string) => {
        const { isBoardFolder } = await import("../editors/board/board-manifest");
        if (!(await isBoardFolder(boardRoot))) {
            throw new Error(`Not a board: "${boardRoot}" is missing or has no board-manifest.json.`);
        }
        // Encode the persephone-board:// link in one tested place and open it via
        // the generic pipeline (US-748). The agent never builds the link by hand.
        const { encodePersephoneBoardLink } = await import("../content/persephone-board-link");
        await app.openRawLink(encodePersephoneBoardLink(boardRoot));
    },

    // ── Board lifecycle — trust / untrust / rename (EPIC-045 / US-868) ──────────
    // Security invariant: the API requests, the user's trust dialog grants. `boardTrust`
    // is never touched here without either a user dialog (registerBoard) or a same-content
    // path move (renameBoard — no privilege gain) / a privilege reduction (unregisterBoard).

    registerBoard: async (boardRoot: string): Promise<boolean> => {
        const { isBoardFolder } = await import("../editors/board/board-manifest");
        if (!(await isBoardFolder(boardRoot))) {
            throw new Error(`Not a board: "${boardRoot}" is missing or has no board-manifest.json.`);
        }
        const { boardTrust } = await import("./board-trust");
        await boardTrust.load();
        if (boardTrust.isTrusted(boardRoot)) return true; // already trusted (incl. via ancestor)
        const { showTrustBoardDialog } = await import("../ui/dialogs/TrustBoardDialog");
        const ok = await showTrustBoardDialog(boardRoot);
        if (!ok) return false;
        await boardTrust.trust(boardRoot);
        return true;
    },

    unregisterBoard: async (boardRoot: string): Promise<void> => {
        const { boardTrust } = await import("./board-trust");
        await boardTrust.untrust(boardRoot);
        const { removePin } = await import("../ui/sidebar/pinned-items");
        removePin({ kind: "board", root: boardRoot });
    },

    renameBoard: async (boardRoot: string, newName: string): Promise<string> => {
        const { isBoardFolder } = await import("../editors/board/board-manifest");
        if (!(await isBoardFolder(boardRoot))) {
            throw new Error(`Not a board: "${boardRoot}" is missing or has no board-manifest.json.`);
        }
        const { isBoardRootBusy } = await import("../editors/board/busy-boards");
        if (isBoardRootBusy(boardRoot)) {
            throw new Error("Cannot rename a board while it is running (busy). Stop it first.");
        }
        const { fpDirname, fpJoin, fpNormalizeForCompare } = await import("../core/utils/file-path");
        const newRoot = fpJoin(fpDirname(boardRoot), newName);
        if (fpNormalizeForCompare(newRoot) === fpNormalizeForCompare(boardRoot)) return boardRoot; // no-op
        if (await fs.exists(newRoot)) {
            throw new Error(`Cannot rename: "${newRoot}" already exists.`);
        }

        // Capture trust / pin / install state BEFORE the rename — the install registry's
        // load() prunes entries whose root no longer holds a manifest, which the rename
        // would trigger for the old root.
        const { boardTrust } = await import("./board-trust");
        await boardTrust.load();
        const wasTrusted = boardTrust.isTrusted(boardRoot);
        const { isPinned, addPin, removePin } = await import("../ui/sidebar/pinned-items");
        const wasPinned = isPinned({ kind: "board", root: boardRoot });
        const { boardInstallRegistry } = await import("./board-install-registry");
        await boardInstallRegistry.load();
        const installEntry = boardInstallRegistry.getByRoot(boardRoot);

        // Rename the folder on disk.
        await fs.rename(boardRoot, newRoot);

        // Transfer trust with no dialog (same content, new path — no privilege gain).
        // untrust(old) is a no-op for inherited trust; trust(new) is a no-op if still
        // covered by an ancestor — correct in every case.
        if (wasTrusted) {
            await boardTrust.untrust(boardRoot);
            await boardTrust.trust(newRoot);
        }
        // Pins.
        if (wasPinned) {
            removePin({ kind: "board", root: boardRoot });
            addPin({ kind: "board", root: newRoot });
        }
        // Install-registry root (catalog-installed boards). record() replaces by id.
        if (installEntry) {
            await boardInstallRegistry.record({ ...installEntry, root: newRoot });
        }

        // Re-point any open page running the old root to the new root (same tab).
        const { BoardEditorModel } = await import("../editors/board/BoardEditorModel");
        const { encodePersephoneBoardLink } = await import("../content/persephone-board-link");
        const { createLinkData } = await import("../../shared/link-data");
        const oldKey = fpNormalizeForCompare(boardRoot);
        for (const page of app.pages.pages) {
            const editor = page.mainEditorInstance;
            if (editor instanceof BoardEditorModel
                && editor.boardRoot
                && fpNormalizeForCompare(editor.boardRoot) === oldKey) {
                await app.events.openRawLink.sendAsync(
                    createLinkData(encodePersephoneBoardLink(newRoot), {
                        pageId: page.id,
                        sourceId: "app-api",
                        explorerRoot: fpDirname(newRoot),
                    }),
                );
            }
        }

        return newRoot;
    },

    // ── Published catalog — discover / install / update (EPIC-045 / US-869) ──────

    searchPublished: async (query?: string): Promise<PublishedBoardResult[]> => {
        await ensureCatalog();
        const { publishedBoards } = await import("./published-boards");
        const { boardInstallRegistry } = await import("./board-install-registry");
        const { getBoardUpdate } = await import("./board-updates");
        const q = query?.trim().toLowerCase();
        const catalog = publishedBoards.getCatalog();
        return catalog
            .filter((b) => {
                if (!q) return true;
                const hay = [b.name, b.description ?? "", ...(b.fileMasks ?? [])]
                    .join(" ")
                    .toLowerCase();
                return hay.includes(q);
            })
            .map((b): PublishedBoardResult => {
                const inst = boardInstallRegistry.getById(b.id);
                const update = inst ? getBoardUpdate(inst.root) : null;
                return {
                    id: b.id,
                    name: b.name,
                    description: b.description,
                    version: b.version,
                    fileMasks: b.fileMasks,
                    editorName: b.editorName,
                    editorKind: b.editorKind,
                    standalone: b.standalone,
                    minAppVersion: b.minAppVersion,
                    size: b.archive.size,
                    compatible: publishedBoards.isCompatible(b.minAppVersion),
                    installed: !!inst,
                    installedRoot: inst?.root,
                    installedVersion: inst?.version,
                    updateAvailable: !!update,
                };
            });
    },

    getPublishedVersions: async (id: string): Promise<PublishedVersionResult[]> => {
        await ensureCatalog();
        const { publishedBoards } = await import("./published-boards");
        const { boardInstallRegistry } = await import("./board-install-registry");
        const vm = await publishedBoards.getVersions(id);
        if (!vm) return [];
        const installedVersion = boardInstallRegistry.getById(id)?.version;
        return vm.versions.map((v): PublishedVersionResult => ({
            version: v.version,
            date: v.date,
            notes: v.notes,
            minAppVersion: v.minAppVersion,
            compatible: publishedBoards.isCompatible(v.minAppVersion),
            installed: v.version === installedVersion,
        }));
    },

    downloadPublished: async (
        id: string,
        opts?: { dir?: string; version?: string },
    ): Promise<string> => {
        await ensureCatalog();
        const { publishedBoards } = await import("./published-boards");
        const entry = publishedBoards.getCatalog().find((b) => b.id === id);
        if (!entry) throw new Error(`Board not in catalog: "${id}"`);

        // Resolve the archive + version to fetch: the catalog-latest, or a specific version from
        // the version history.
        let resolved = entry;
        if (opts?.version && opts.version !== entry.version) {
            const vm = await publishedBoards.getVersions(id);
            const v = vm?.versions.find((x) => x.version === opts.version);
            if (!v) throw new Error(`Version not found for "${id}": ${opts.version}`);
            resolved = { ...entry, version: v.version, minAppVersion: v.minAppVersion, archive: v.archive };
        }
        if (!publishedBoards.isCompatible(resolved.minAppVersion)) {
            throw new Error(`This board version requires Persephone ≥ ${resolved.minAppVersion}.`);
        }

        const dir = opts?.dir ?? (await defaultInstallDir());
        const { downloadBoard } = await import("./board-install");
        return downloadBoard(resolved, dir);
    },

    installPublished: async (
        id: string,
        opts?: { dir?: string; version?: string },
    ): Promise<string | undefined> => {
        await ensureCatalog();
        const { publishedBoards } = await import("./published-boards");
        const { boardInstallRegistry } = await import("./board-install-registry");
        const { ui } = await import("./ui");
        const entry = publishedBoards.getCatalog().find((b) => b.id === id);
        if (!entry) throw new Error(`Board not in catalog: "${id}"`);

        // Already installed + a target version → version change (update/rollback): auto-run the
        // swap (no page, no button — the board is already trusted, the call is the intent).
        const reg = boardInstallRegistry.getById(id);
        if (reg && opts?.version) {
            const vm = await publishedBoards.getVersions(id);
            const v = vm?.versions.find((x) => x.version === opts.version);
            if (!v) throw new Error(`Version not found for "${id}": ${opts.version}`);
            if (!publishedBoards.isCompatible(v.minAppVersion)) {
                void ui.notify(`This version requires Persephone ≥ ${v.minAppVersion}.`, "warning");
                return undefined;
            }
            const { runBoardVersionInstall } = await import("./board-updates");
            const ok = await runBoardVersionInstall({
                root: reg.root,
                id,
                name: entry.name,
                archive: v.archive,
                version: v.version,
            });
            return ok ? reg.root : undefined;
        }

        // Already installed AND trusted, no version → nothing to do; return the root (opening the
        // page would just hang until the user closes it). A downloaded-but-unregistered board
        // (reg present, not trusted) falls through so the user can Register it.
        if (reg) {
            const { boardTrust } = await import("./board-trust");
            await boardTrust.load();
            if (boardTrust.isTrusted(reg.root)) return reg.root;
        }

        // Fresh install → open the Board Info page prefilled and let the user walk Download →
        // Register. Resolve the root when registration succeeds, or undefined if the page closes
        // first. (A fresh install installs the catalog-latest; opts.version is not honored here.)
        const { TComponentState } = await import("../core/state/state");
        const { BoardInfoEditorModel, getDefaultBoardInfoEditorState } = await import(
            "../editors/board-info/BoardInfoEditorModel"
        );
        const model = new BoardInfoEditorModel(
            new TComponentState({
                ...getDefaultBoardInfoEditorState(),
                catalogId: id,
                installDir: opts?.dir,
            }),
        );
        await model.restore();
        const page = app.pages.addPage(model as unknown as EditorModel);

        return await new Promise<string | undefined>((resolve) => {
            let settled = false;
            const settle = (root: string | undefined) => {
                if (settled) return;
                settled = true;
                installedSub.unsubscribe();
                pagesUnsub();
                resolve(root);
            };
            const installedSub = model.installed.subscribe((root) => settle(root));
            const pagesUnsub = app.pages.state.subscribe(() => {
                if (!app.pages.pages.some((p) => p.id === page.id)) settle(undefined);
            });
        });
    },

    uninstallBoard: async (id: string): Promise<boolean> => {
        await ensureCatalog();
        const { boardInstallRegistry } = await import("./board-install-registry");
        const reg = boardInstallRegistry.getById(id);
        if (!reg) throw new Error(`Board not installed: "${id}"`);
        const { readBoardManifest } = await import("../editors/board/board-manifest");
        const { fpBasename } = await import("../core/utils/file-path");
        const manifest = await readBoardManifest(reg.root);
        const name = manifest?.name?.trim() || fpBasename(reg.root);
        const { uninstallCatalogBoard } = await import("./board-install");
        return uninstallCatalogBoard({ root: reg.root, name, catalogId: id });
    },

    checkPublishedUpdates: async (force?: boolean): Promise<BoardUpdateInfo[]> => {
        const { publishedBoards } = await import("./published-boards");
        if (force) await publishedBoards.refresh();
        else await publishedBoards.load();
        const { boardInstallRegistry } = await import("./board-install-registry");
        await boardInstallRegistry.load();
        const { listBoardUpdates } = await import("./board-updates");
        return listBoardUpdates().map((u) => ({
            id: u.id,
            root: u.root,
            installedVersion: u.installedVersion,
            latestVersion: u.latestVersion,
        }));
    },
};
