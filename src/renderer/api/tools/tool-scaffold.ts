/**
 * Toolset scaffolding (EPIC-038 / US-804). Creates a new toolset folder by copying the bundled
 * `assets/tool-template/` into it and setting the manifest's authoritative `name` (EPIC C8).
 *
 * Deliberately **scaffold-only — it does NOT trust/register the toolset**. Registration is a
 * separate user action: the confirmation dialog on agent-initiated `tools.createToolset` (the call
 * handler), or direct `toolsTrust.trust` from the user-initiated management UI (US-805). Mirrors
 * `board-scaffold.ts` but diverges on two points: the toolset `name` is authoritative (so it is
 * written into the copied manifest, unlike a board where name defaults to the folder), and there
 * is no auto-trust (boards auto-trust by provenance; tools never do — EPIC C3).
 *
 * Not exposed on the `app` object model or any script `.d.ts` — the whole trust-adjacent surface
 * stays off scripts (US-804 T-C1), consistent with `toolsTrust` / `registeredTools` / the executor.
 * `assets/` ships beside the app in both dev (Forge `extraResource`) and packaged builds
 * (electron-builder `extraResources`), so the template is always present.
 */
import { api } from "../../../ipc/renderer/api";
import { fs } from "../fs";
import { ui } from "../ui";
import { fpJoin } from "../../core/utils/file-path";
import {
    defaultToolsManifest,
    readToolsManifest,
    writeToolsManifest,
} from "./tools-manifest";
import { errMessage } from "../../../shared/utils";

const TOOL_TEMPLATE = "tool-template";

/** Copy the bundled tool template into a fresh toolset folder. */
async function scaffoldToolset(destDir: string): Promise<void> {
    const appRoot = await api.getAppRootPath();
    await copyDirInto(fpJoin(appRoot, "assets", TOOL_TEMPLATE), destDir);
}

/**
 * Create a toolset named `name` inside the container folder `dir`, scaffolded from the bundled
 * template, and return its absolute root (`<dir>/<name>`). Writes the authoritative `name` into
 * the copied manifest (EPIC C8). **Does NOT trust/register** — the caller gates registration.
 * Errors on a name collision (any existing `<dir>/<name>`); on a template-copy failure it still
 * produces a usable (empty) toolset with a default manifest + warns.
 */
export async function createToolset(name: string, dir: string): Promise<string> {
    const toolsetRoot = fpJoin(dir, name);
    if (await fs.exists(toolsetRoot)) {
        throw new Error(`A folder named "${name}" already exists in "${dir}".`);
    }
    await fs.mkdir(dir); // ensure the container exists (recursive; no-op if present)
    try {
        await scaffoldToolset(toolsetRoot);
    } catch (err) {
        // Template missing / copy failed — still produce a usable toolset folder.
        await fs.mkdir(toolsetRoot);
        ui.notify(
            `Toolset created, but the template could not be copied: ${
                errMessage(err)
            }`,
            "warning",
        );
    }
    // Set the authoritative toolset name in the copied manifest (or write a default one if the
    // template copy failed / left no readable manifest).
    const manifest = await readToolsManifest(toolsetRoot);
    if (manifest) {
        manifest.name = name;
        await writeToolsManifest(toolsetRoot, manifest);
    } else {
        await writeToolsManifest(toolsetRoot, defaultToolsManifest(name));
    }
    return toolsetRoot;
}

async function copyDirInto(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest);
    const entries = await fs.listDirWithTypes(src);
    for (const entry of entries) {
        const from = fpJoin(src, entry.name);
        const to = fpJoin(dest, entry.name);
        if (entry.isDirectory) await copyDirInto(from, to);
        else await fs.copyFile(from, to);
    }
}
