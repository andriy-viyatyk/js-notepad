import { fs } from "../fs";
import { fpJoin } from "../../core/utils/file-path";

/** File name of the toolset manifest, at the toolset folder root. */
export const TOOLS_MANIFEST_FILE = "tools-manifest.json";

/** Current manifest schema version. Bump on a breaking shape change. */
export const TOOLS_MANIFEST_SCHEMA_VERSION = 1;

/**
 * One tool declared by a toolset (EPIC-038 / US-801). Unlike the board manifest — which
 * carries descriptive metadata only — a tool declares **behavior**: the command to run and
 * how it is parameterized. `execute_tool` (US-802) is arbitrary RCE, so a toolset only runs
 * once its folder is trusted (see `tools-trust.ts`).
 */
export interface ToolDef {
    /** Tool name, unique within its toolset. Combined into the id `<toolset>/<name>`. */
    name: string;
    /** Human/agent-facing description. Surfaced by `search_tools`. */
    description: string;
    /**
     * JSON Schema for the tool's args (MCP `inputSchema` dialect). Describes parameters to
     * the agent. Optional — a no-parameter tool may omit it. The tool script must still
     * validate its own inputs (EPIC C12: validation here is best-effort, not authoritative).
     */
    inputSchema?: object;
    /** Command-line string, spawned with cwd = the toolset folder (US-802 runs it). */
    command: string;
    /** Optional per-tool timeout (ms). US-802 applies a default when omitted. */
    timeoutMs?: number;
    /** Optional shell override (EPIC C10). Mirrors `IExecuteOptions.shell`; default true. */
    shell?: string | boolean;
    /**
     * NAMES of required env vars (values live in the toolset's `.env` — never in the
     * manifest, never returned through MCP). EPIC C4.
     */
    env?: string[];
    /**
     * Free-text runtime prerequisites (e.g. "python 3.11+, pyodbc", "az cli"). Surfaced for
     * provisioning a new machine after copying a toolset (EPIC C9).
     */
    requirements?: string;
    /** Optional extra search terms for `search_tools` (EPIC C5). */
    keywords?: string[];
}

/**
 * Toolset manifest (EPIC-038 / US-801). Its presence at a folder root is what marks the
 * folder as a toolset (it gates enumeration + registration). Trust is NEVER stored here —
 * a copied toolset must not be able to self-trust; trust lives in the app-side registry
 * (`tools-trust.ts`).
 */
export interface ToolsManifest {
    /** Schema version of this manifest. */
    schemaVersion: number;
    /**
     * Toolset name — the AUTHORITATIVE id namespace, NOT the folder basename (folders get
     * renamed when copied between machines). EPIC C8.
     */
    name: string;
    /** Optional free-text description of the toolset. */
    description?: string;
    /** Optional author / owner. */
    author?: string;
    /** Optional toolset-level search terms for `search_tools`. */
    keywords?: string[];
    /** The tools this toolset declares. */
    tools: ToolDef[];
}

/** Absolute path to a toolset's manifest. */
export function toolsManifestPath(toolsetRoot: string): string {
    return fpJoin(toolsetRoot, TOOLS_MANIFEST_FILE);
}

/** A fresh, minimal manifest with the given toolset name and no tools. */
export function defaultToolsManifest(name: string): ToolsManifest {
    return { schemaVersion: TOOLS_MANIFEST_SCHEMA_VERSION, name, tools: [] };
}

/** True iff the folder carries a `tools-manifest.json`. Cheap existence check — does not
 *  parse. Gates enumeration (`registered-tools.ts`) and registration (US-805). */
export async function isToolsetFolder(toolsetRoot: string): Promise<boolean> {
    return fs.exists(toolsManifestPath(toolsetRoot));
}

/** Read + parse a toolset's manifest. Returns null if absent or unparseable — callers treat
 *  a malformed / missing manifest as "no toolset", never throw. A manifest with an unknown
 *  (higher) schemaVersion is still returned (best-effort forward-compat). */
export async function readToolsManifest(toolsetRoot: string): Promise<ToolsManifest | null> {
    const p = toolsManifestPath(toolsetRoot);
    try {
        if (!(await fs.exists(p))) return null;
        const file = await fs.readFile(p);
        const parsed = JSON.parse(file.content);
        if (!parsed || typeof parsed !== "object") return null;
        return parsed as ToolsManifest;
    } catch {
        return null;
    }
}

/** Write a manifest (2-space JSON + trailing newline for human-editability). */
export async function writeToolsManifest(toolsetRoot: string, manifest: ToolsManifest): Promise<void> {
    await fs.write(toolsManifestPath(toolsetRoot), JSON.stringify(manifest, null, 2) + "\n");
}

/** Write a default manifest only if the folder doesn't already have one. Used by the
 *  create/scaffold flow (US-804) so every new toolset is a valid, identifiable toolset. */
export async function ensureToolsManifest(toolsetRoot: string, name: string): Promise<void> {
    if (await isToolsetFolder(toolsetRoot)) return;
    await writeToolsManifest(toolsetRoot, defaultToolsManifest(name));
}

/**
 * Structural best-effort validation of a parsed manifest (EPIC C12 — no ajv). Collects a
 * precise error per problem so the UI (US-805) and the MCP layer (US-803) can explain what
 * is wrong. This validates the manifest's *shape*, not the tools' runtime behavior; each
 * tool script is still responsible for validating its own inputs at run time.
 */
export function validateToolsManifest(manifest: unknown): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!manifest || typeof manifest !== "object") {
        return { ok: false, errors: ["Manifest is not an object."] };
    }
    const m = manifest as Record<string, unknown>;

    if (typeof m.schemaVersion !== "number") {
        errors.push("`schemaVersion` must be a number.");
    }
    if (typeof m.name !== "string" || !m.name.trim()) {
        errors.push("`name` must be a non-empty string.");
    }

    if (!Array.isArray(m.tools)) {
        errors.push("`tools` must be an array.");
    } else {
        const seenToolNames = new Set<string>();
        m.tools.forEach((t, i) => {
            if (!t || typeof t !== "object") {
                errors.push(`tools[${i}] must be an object.`);
                return;
            }
            const tool = t as Record<string, unknown>;
            const toolName = typeof tool.name === "string" ? tool.name.trim() : "";
            if (!toolName) {
                errors.push(`tools[${i}].name must be a non-empty string.`);
            } else {
                const key = toolName.toLowerCase();
                if (seenToolNames.has(key)) {
                    errors.push(`Duplicate tool name "${toolName}" within the toolset.`);
                }
                seenToolNames.add(key);
            }
            if (typeof tool.description !== "string" || !tool.description.trim()) {
                errors.push(`tools[${i}].description must be a non-empty string.`);
            }
            if (typeof tool.command !== "string" || !tool.command.trim()) {
                errors.push(`tools[${i}].command must be a non-empty string.`);
            }
            if (
                tool.inputSchema !== undefined &&
                (typeof tool.inputSchema !== "object" ||
                    tool.inputSchema === null ||
                    Array.isArray(tool.inputSchema))
            ) {
                errors.push(`tools[${i}].inputSchema, if present, must be an object.`);
            }
        });
    }

    return { ok: errors.length === 0, errors };
}
