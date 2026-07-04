# US-804: Scaffolding + authoring template + `create_toolset`

**Epic:** [EPIC-038 — Agent Tools Registry](../../epics/EPIC-038.md)
**Depends on:** US-801 (registry + manifest + trust), US-802 (executor). Parallel with US-803.
**Status:** Implemented (pending manual test + app restart to expose the `create_toolset` MCP tool)

## Goal

Give an agent (and, later, the US-805 UI) a one-call way to **bootstrap a new toolset**: ship a
bundled `assets/tool-template/` (starter manifest + a working example tool + `.env.example` +
authoring `CLAUDE.md`), an editor-independent `createToolset(name, dir)` scaffold function, a
**registration confirmation dialog** (the C3 trust gate for agent-initiated registration), and
the **`create_toolset` MCP tool** (moved here from US-803 — it is the one meta-tool that mutates
trust and needs this task's scaffold + dialog).

## Background — verified infrastructure

### The scaffold precedent — boards (mirror this)
- `src/renderer/editors/board/board-scaffold.ts` — `createBoardFromTemplate(name, dir, template)`:
  errors on a name collision, recursively copies `assets/<template>/` into `<dir>/<name>` via a
  private `copyDirInto`, guarantees the identity manifest (`ensureBoardManifest`), then
  **auto-trusts** (`boardTrust.trust`). `scaffoldBoard` resolves the assets root with
  `await api.getAppRootPath()` + `fpJoin(appRoot, "assets")` — present in dev **and** packaged
  builds (see *Asset shipping* below).
- `src/renderer/api/boards.ts` — `app.boards.create*` wrap `createBoardFromTemplate` behind a
  dynamic `import()` (keeps the core `api` bundle decoupled), and do `await fs.mkdir(dir)` first so
  creating into a not-yet-existing container works.
- **Key divergence for tools:** boards auto-trust by provenance; tools do **not**. The manifest
  `name` is authoritative for a toolset (EPIC C8), so the scaffold must **rewrite** the copied
  manifest's `name` to the given name (boards leave name defaulting to the folder). And
  registration is gated by a user dialog, not auto-trust (EPIC C3).

### The trust registry — consumed as-is (US-801)
`src/renderer/api/tools/tools-trust.ts` → `toolsTrust`:
- `trust(root)` / `untrust(root)` (idempotent, exact-path), `isTrusted`, `listPaths`,
  `subscribePaths`. **Not on `app`/scripts** — a script must never self-trust. Registration ≡
  trust: `trust()` is the single act that both registers and permits execution.
- `registeredTools` (`registered-tools.ts`) auto-re-enumerates on a `toolsTrust` change via
  `subscribePaths` (fire-and-forget `void this.refresh()`). To return a **deterministic** fresh
  tool list from `create_toolset`, the handler awaits an explicit `refresh()` after `trust()`.

### The manifest module — consumed as-is (US-801)
`src/renderer/api/tools/tools-manifest.ts` already exports everything the scaffold needs:
- `TOOLS_MANIFEST_SCHEMA_VERSION` (= 1), `defaultToolsManifest(name)`, `readToolsManifest(root)`
  (never throws), `writeToolsManifest(root, manifest)` (2-space JSON + trailing newline),
  `ensureToolsManifest(root, name)` (write-if-absent). The scaffold **read+patch+write** path
  sets the authoritative `name`.

### The confirmation-dialog precedent — `TrustBoardDialog.tsx`
`src/renderer/ui/dialogs/TrustBoardDialog.tsx` is the exact pattern: a `TDialogModel<Props, boolean>`
subclass, `Views.registerView(symbol, Component)`, and a `showTrustBoardDialog(path): Promise<boolean>`
that `showDialog({ viewId, model })`. Esc → `close(false)`. `WarningIcon`, RCE wording. The
`create_toolset` MCP call **blocks** on this dialog — the same infinite-timeout `sendToRenderer(...,0)`
mechanism `ui_push` and `execute_tool` already use (EPIC C6).

### The MCP two-file pipeline (US-803 already wired the other three tools)
- `src/main/mcp-http-server.ts` — `search_tools` / `execute_tool` / `refresh_toolset` are declared
  at ~:522. `execute_tool` passes timeout `0` (infinite). `create_toolset` slots in right after
  `refresh_toolset` and must also pass `0` (it awaits the dialog).
- `src/renderer/api/mcp-handler.ts` — the `search_tools` / `execute_tool` / `refresh_toolset`
  cases + handlers live at ~:522/:638+. `createBoard` (:589) is the closest analog: validate params
  → delegate → return a small result. Handlers use lazy `import()` to keep the executor/scaffold
  off the startup path.
- The `read_guide("tools")` guide (`assets/mcp-res-tools.md`) already exists (US-803) and already
  has a **"Creating a toolset"** section referencing `create_toolset` — only a one-line note about
  the confirmation prompt is needed.

### Asset shipping — no build change needed
`assets/` ships to both build pipelines already:
- Forge (dev/make): `forge.config.ts` → `extraResource: ["./assets"]`
- electron-builder (prod, `npm run dist`): `electron-builder.yml` → `extraResources: [{ from: assets, to: assets }]`

A new `assets/tool-template/` folder is picked up by **both** with no config edit. (This is an
asset, not a new *entry point*, so the dual-build-paths rule about preload/main entry points does
not apply.)

## Implementation plan

### Step 1 — Bundled template: `assets/tool-template/`

Create these files. The example tool is **Node** (`node echo.js`) — universally present on a dev
machine and dependency-free; `CLAUDE.md` documents Python/PowerShell alternatives.

**`assets/tool-template/tools-manifest.json`** — `name` is `""`; `createToolset` overwrites it
with the user-supplied name (authoritative, C8):
```json
{
  "schemaVersion": 1,
  "name": "",
  "description": "Describe what this toolset is for.",
  "author": "",
  "keywords": [],
  "tools": [
    {
      "name": "echo",
      "description": "Example tool — echoes its args back. Replace with a real tool.",
      "command": "node echo.js",
      "inputSchema": {
        "type": "object",
        "properties": {
          "message": { "type": "string", "description": "Text to echo back" }
        }
      },
      "timeoutMs": 30000,
      "requirements": "node on PATH",
      "keywords": ["example", "echo"]
    }
  ]
}
```

**`assets/tool-template/echo.js`** — the result-contract reference (reads JSON on stdin, prints the
`##PERSEPHONE_RESULT##<json>` marker line, logs to stderr):
```javascript
// Example tool. Reads JSON args on stdin, returns a result via the marker line.
// Result contract: print ##PERSEPHONE_RESULT##<json> on its own line (last one wins).
// Unmarked stdout is returned as logs; stderr is diagnostics; non-zero exit = failure.
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
    let args = {};
    try { args = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch {}
    console.error("echo tool running…"); // logs → stderr
    const result = { ok: true, echoed: args.message ?? null };
    console.log("##PERSEPHONE_RESULT##" + JSON.stringify(result));
});
```

**`assets/tool-template/.env.example`** — names only, no values:
```
# Copy to .env and fill in. List the NAMES in each tool's manifest "env": [...].
# .env values are injected into the tool's process; never returned through MCP.
# EXAMPLE_TOKEN=your-token-here
```

**`assets/tool-template/.gitignore`**:
```
.env
tools-execution.log
```

**`assets/tool-template/CLAUDE.md`** — folder-local authoring guide (tone/structure mirroring
`assets/board-template/CLAUDE.md`). Cover: toolset identity = `tools-manifest.json`; the manifest
shape (per-tool `command`/`inputSchema`/`env`/`requirements`/`timeoutMs`/`shell`); the stdin-JSON
args + `##PERSEPHONE_RESULT##` stdout contract (with python/node/pwsh one-liners); `.env` secrets
(values injected, names in `env[]`, never through MCP); **edit → `refresh_toolset` → re-run** (no
auto-reload); **self-repair** (a failing tool is a bug to fix at `toolsetRoot`, not to route
around); portability (relative paths only, `requirements` provisions a new machine, copy `.env`
only between your own machines). This is a reviewable deliverable (EPIC C11) — content largely
parallels `assets/mcp-res-tools.md`.

### Step 2 — Scaffold function: `src/renderer/api/tools/tool-scaffold.ts` (NEW)

Editor-independent, **scaffold-only (no trust)**. Not exposed on `app`/scripts (T-C1). Both the
`create_toolset` MCP handler and the US-805 UI import it directly (the US-801/802 modules are all
consumed this way).

```typescript
import { api } from "../../../ipc/renderer/api";
import { fs } from "../fs";
import { ui } from "../ui";
import { fpJoin } from "../../core/utils/file-path";
import {
    defaultToolsManifest,
    readToolsManifest,
    writeToolsManifest,
} from "./tools-manifest";

const TOOL_TEMPLATE = "tool-template";

/** Copy the bundled tool template into a fresh toolset folder. */
async function scaffoldToolset(destDir: string): Promise<void> {
    const appRoot = await api.getAppRootPath();
    await copyDirInto(fpJoin(appRoot, "assets", TOOL_TEMPLATE), destDir);
}

/**
 * Create a toolset named `name` inside container `dir`, scaffolded from the bundled template,
 * and return its absolute root (`<dir>/<name>`). Sets the manifest's authoritative `name`
 * (EPIC C8). **Does NOT trust/register** — registration is a separate user action (the C3
 * confirmation dialog for agent-initiated create, or the US-805 UI). Errors on a name collision.
 */
export async function createToolset(name: string, dir: string): Promise<string> {
    const toolsetRoot = fpJoin(dir, name);
    if (await fs.exists(toolsetRoot)) {
        throw new Error(`A folder named "${name}" already exists in "${dir}".`);
    }
    await fs.mkdir(dir); // ensure container (recursive; no-op if present)
    try {
        await scaffoldToolset(toolsetRoot);
    } catch (err) {
        // Template missing / copy failed — still produce a usable toolset folder.
        await fs.mkdir(toolsetRoot);
        ui.notify(
            `Toolset created, but the template could not be copied: ${
                err instanceof Error ? err.message : String(err)
            }`,
            "warning",
        );
    }
    // Set the authoritative toolset name in the copied manifest (or write a default one if the
    // template copy failed / left no manifest).
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
```

### Step 3 — Confirmation dialog: `src/renderer/ui/dialogs/RegisterToolsetDialog.tsx` (NEW)

Mirror `TrustBoardDialog.tsx`. The **agent-initiated** registration gate (C3): shows the toolset
name + full path + the declared tools (name — description), RCE wording (tools run **headlessly**),
`WarningIcon`, Esc → `close(false)`. Primary button "Register toolset".

```typescript
import { showDialog } from "./Dialogs";
import { Dialog, DialogContent, Panel, Text, Button } from "../../uikit";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { WarningIcon } from "../../theme/icons";
import { TComponentState } from "../../core/state/state";

const registerToolsetDialogId = Symbol("registerToolsetDialog");

export interface RegisterToolsetDialogProps {
    toolsetName: string;
    toolsetRoot: string;
    tools: { name: string; description: string }[];
}

class RegisterToolsetDialogModel extends TDialogModel<RegisterToolsetDialogProps, boolean> {
    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") { e.preventDefault(); this.close(false); }
    };
}

function RegisterToolsetDialog({ model }: ViewPropsRO<RegisterToolsetDialogModel>) {
    const state = model.state.use();
    return (
        <Dialog name="register-toolset-dialog" onKeyDown={model.handleKeyDown}>
            <DialogContent
                title="Register this toolset?"
                icon={<WarningIcon />}
                onClose={() => model.close(false)}
                minWidth={440}
                maxWidth={680}
            >
                <Panel direction="column" gap="md" paddingX="xxl" paddingY="xl">
                    <Text>
                        An AI agent wants to register a toolset. Once registered, its tools run as
                        programs on your computer with your full user privileges — headlessly,
                        whenever the agent calls them (and after the agent edits them, with no
                        further prompt).
                    </Text>
                    <Text>Only register toolsets you created or fully understand.</Text>
                    <Text color="light">{`${state.toolsetName}  —  ${state.toolsetRoot}`}</Text>
                    {state.tools.map((t) => (
                        <Text key={t.name} color="light">{`• ${t.name} — ${t.description}`}</Text>
                    ))}
                </Panel>
                <Panel direction="row" justify="end" gap="sm" padding="md">
                    <Button onClick={() => model.close(false)}>Cancel</Button>
                    <Button variant="primary" onClick={() => model.close(true)}>
                        Register toolset
                    </Button>
                </Panel>
            </DialogContent>
        </Dialog>
    );
}

Views.registerView(registerToolsetDialogId, RegisterToolsetDialog as DefaultView);

export function showRegisterToolsetDialog(props: RegisterToolsetDialogProps): Promise<boolean> {
    const model = new RegisterToolsetDialogModel(new TComponentState(props));
    return showDialog({ viewId: registerToolsetDialogId, model }) as Promise<boolean>;
}
```

### Step 4 — Renderer handler: `src/renderer/api/mcp-handler.ts` (EDIT)

Add the switch case (with the other Agent Tools cases, near `refresh_toolset`):
```typescript
case "create_toolset": return await createToolsetCmd(params);
```

Add the handler (in the Agent Tools section, after `refreshToolset`). It is **idempotent on the
folder** so a declined registration is recoverable (T-C2): scaffold only when nothing is there;
re-offer registration for an existing-but-unregistered toolset (no re-scaffold, preserving edits);
no-op when already registered; error only on a non-toolset folder collision.
```typescript
/** Ensure a toolset exists at `<dir>/<name>`, then gate registration on a user confirmation
 *  dialog (EPIC C3). Idempotent (T-C2/T-C3): scaffolds a new folder; RE-OFFERS registration for
 *  an existing-but-unregistered toolset (a prior deny — no re-scaffold); no-ops if already
 *  registered; errors only when a NON-toolset folder occupies the path. On Deny: leave the folder
 *  (unregistered → not runnable) and tell the agent it can just call create_toolset again. */
async function createToolsetCmd(params: McpParams): Promise<McpResponse> {
    const name = asString(params?.name);
    const dir = asString(params?.dir);
    if (!name) return { error: { code: -32602, message: "Missing or invalid 'name' parameter" } };
    if (!dir) return { error: { code: -32602, message: "Missing or invalid 'dir' parameter" } };

    const toolsetRoot = fpJoin(dir, name);
    const { registeredTools } = await import("./tools/registered-tools");
    const { toolsTrust } = await import("./tools/tools-trust");
    await registeredTools.ensureInitialized(); // also loads toolsTrust state (for isTrusted)

    const { isToolsetFolder, readToolsManifest } = await import("./tools/tools-manifest");
    let created = false;

    if (await isToolsetFolder(toolsetRoot)) {
        // Existing toolset. Already registered → nothing to do. Otherwise fall through and
        // re-offer registration (covers an accidental prior deny) WITHOUT re-scaffolding, so any
        // edits the agent made to the tools are preserved.
        if (toolsTrust.isTrusted(toolsetRoot)) {
            return { result: { created: false, registered: true, toolsetRoot, message: "Toolset is already registered." } };
        }
    } else {
        // No toolset here yet. createToolset scaffolds — and throws if a NON-toolset folder
        // already occupies the path (a real collision → surfaced as an error).
        try {
            const { createToolset } = await import("./tools/tool-scaffold");
            await createToolset(name, dir);
            created = true;
        } catch (err) {
            return { error: { code: -32603, message: err instanceof Error ? err.message : String(err) } };
        }
    }

    const manifest = await readToolsManifest(toolsetRoot);
    const toolList = (manifest?.tools ?? []).map((t) => ({ name: t.name, description: t.description }));

    const { showRegisterToolsetDialog } = await import("../ui/dialogs/RegisterToolsetDialog");
    const allowed = await showRegisterToolsetDialog({
        toolsetName: manifest?.name ?? name,
        toolsetRoot,
        tools: toolList,
    });

    if (!allowed) {
        return {
            result: {
                created,
                registered: false,
                toolsetRoot,
                message:
                    `Toolset is at "${toolsetRoot}" but the user declined registration — its tools ` +
                    `are not runnable yet. If the user asks to enable it, call create_toolset again ` +
                    `with the same name and dir to re-show the confirmation prompt.`,
            },
        };
    }

    await toolsTrust.trust(toolsetRoot);
    await registeredTools.refresh(); // deterministic fresh list (trust also triggers an async refresh)

    return {
        result: {
            created,
            registered: true,
            toolsetRoot,
            toolsetName: manifest?.name ?? name,
            tools: registeredTools.tools
                .filter((t) => t.toolsetRoot === toolsetRoot)
                .map((t) => ({ id: t.id, description: t.tool.description })),
        },
    };
}
```

### Step 5 — Main declaration: `src/main/mcp-http-server.ts` (EDIT)

Add after the `refresh_toolset` `server.tool(...)`. Timeout `0` (awaits the confirmation dialog):
```typescript
server.tool(
    "create_toolset",
    "Scaffold a new Agent Tools toolset folder (starter tools-manifest.json + an example tool + .env.example + authoring guide) inside `dir`, named `name`, and prompt the user to confirm registration (tools run headlessly with the user's privileges). Returns { created, registered, toolsetRoot, tools }. If the user declines, `registered` is false and the folder exists but its tools are not runnable — just call create_toolset again with the same name and dir to re-show the prompt (it will NOT overwrite your edits). If the toolset already exists it is not re-scaffolded (re-offers registration, or no-ops if already registered). After registering, edit the manifest + scripts and call refresh_toolset. IMPORTANT: read read_guide(\"tools\") first.",
    {
        name: z.string().describe("Toolset folder name — created inside `dir`; also the authoritative toolset name (namespaces tool ids as <name>/<tool>)."),
        dir: z.string().describe("Absolute path of the container folder the toolset is created in (created if it doesn't exist)."),
        windowIndex: windowIndexParam,
    },
    async ({ name, dir, windowIndex }) =>
        toToolResult(await sendToRenderer("create_toolset", { name, dir }, windowIndex, 0)),
);
```

### Step 6 — Guide note: `assets/mcp-res-tools.md` (EDIT, minor)

In the **"## Creating a toolset"** section, add that `create_toolset` **prompts the user to confirm
registration**, and that a declined result (`registered: false`) means the folder was scaffolded
but its tools are not yet runnable — **calling `create_toolset` again with the same `name`/`dir`
re-shows the prompt without overwriting edits** (so a mistaken deny is a one-call fix; no manual
UI step needed). No `read_guide` enum / `resourceFiles` change (the "tools" guide is already
registered from US-803).

### Step 7 — Dashboard + epic notes
- `doc/active-work.md` — make the US-804 line a link to this doc.
- `doc/epics/EPIC-038.md` — add a 2026-07-04 Notes entry (investigated; decisions T-C1..T-C7).

## Concerns / decisions (task-local)

| # | Concern | Decision |
|---|---------|----------|
| T-C1 | **`createToolset` on `app`/scripts?** The epic wrote "`app.tools.createToolset`". | **No — a direct-import module** (`tools/tool-scaffold.ts`), consistent with every other US-801/802 module (`toolsTrust`, `registeredTools`, `executeToolById` are all imported directly, none on `app`). Keeps the whole trust-adjacent surface off scripts (a script must not scaffold-and-prompt-trust). The MCP handler and the US-805 UI both import it. "app.tools" in the epic resolves to this module. |
| T-C2 | **Deny must be recoverable** — a user may misclick, or decline out of confusion, and shouldn't then have to add the tool by hand. | `create_toolset` is **idempotent on the folder**: if `<dir>/<name>` already exists and is a valid toolset that is **not yet registered** (the just-denied case), it **skips scaffolding** (preserving any agent edits) and **re-shows the registration dialog**. So the agent just calls `create_toolset` again with the same `name`/`dir` and the prompt reappears — zero manual steps. Deny returns a **structured result** `{ created, registered:false, toolsetRoot, message }` (not a JSON-RPC error); the message tells the agent it can re-run. `refresh_toolset` can't do this (it only re-reads *already-registered* toolsets, to keep the trust gate), so recovery lives in `create_toolset`. |
| T-C3 | **Folder-exists handling.** | Only a folder that exists **and is NOT a toolset** (no `tools-manifest.json`) is a real collision → `createToolset` throws → `-32603` error (never clobber unrelated content). An **existing toolset** folder is not an error: unregistered → re-offer registration (T-C2); already registered → no-op success `{ registered:true }`. Bonus: this is also how the agent registers a toolset **copied from another machine** (point `create_toolset` at its `name`/`dir`) — still user-gated by the dialog. |
| T-C4 | **Example-tool language.** | **Node** (`node echo.js`) — dependency-free and present on a dev machine; `requirements: "node on PATH"`. `CLAUDE.md` shows Python/PowerShell equivalents. |
| T-C5 | **Dialog reuse by US-805.** | The `RegisterToolsetDialog` is the **agent-initiated** gate only. US-805 registering a pre-existing folder is **user-initiated** (they pick the folder) → **no dialog**, direct `toolsTrust.trust` (EPIC C3). US-805 "new toolset" button calls `createToolset` then trusts directly (also user-initiated). So this dialog stays scoped to the MCP path. |
| T-C6 | **Refresh after trust** — `toolsTrust.trust` already fires an async `registeredTools.refresh` via `subscribePaths`. | The handler still `await registeredTools.refresh()` explicitly so the returned tool list is deterministic (the subscription refresh is fire-and-forget). Harmless double-refresh at registry scale. |
| T-C7 | **App restart** to expose the tool. | `create_toolset`'s `server.tool` declaration (main process) only appears on the MCP endpoint after an app restart (renderer handler hot-reloads via HMR). Manual test requires a restart, like US-803. |

## Acceptance criteria

- `npx tsc --noEmit` and `npm run lint` pass clean.
- `assets/tool-template/` exists with a valid manifest, a working `echo.js`, `.env.example`,
  `.gitignore`, and `CLAUDE.md`; it ships in dev and (via `electron-builder.yml`) prod with **no
  build-config change**.
- `create_toolset { name, dir }` scaffolds the folder, **rewrites the manifest `name`** to `name`,
  and pops the confirmation dialog.
  - **Allow** → toolset registered (`toolsTrust`), `registeredTools` shows its tools, result is
    `{ created:true, registered:true, toolsetRoot, tools:[…] }`.
  - **Deny** → folder remains, unregistered; result is `{ created:true, registered:false, … }`;
    `search_tools`/`execute_tool` do **not** see it.
- **Deny is recoverable:** after a deny, calling `create_toolset` again with the same `name`/`dir`
  re-shows the dialog **without re-scaffolding** (any edits to the tools are preserved); Allow then
  registers it. Calling `create_toolset` on an already-registered toolset is a no-op success
  (`{ created:false, registered:true }`), no dialog.
- After Allow, `execute_tool { toolId: "<name>/echo", args: { message: "hi" } }` returns
  `{ ok:true, result:{ ok:true, echoed:"hi" }, … }` (validates the full stdin/marker contract
  end-to-end from a scaffolded tool).
- A collision with a **non-toolset** folder returns a clear error and creates nothing new.
- `assets/mcp-res-tools.md` mentions the confirmation prompt + the declined-result meaning.

## Files changed

| File | Change |
|------|--------|
| `assets/tool-template/tools-manifest.json` | **NEW** — starter manifest (`name:""`, one `echo` tool). |
| `assets/tool-template/echo.js` | **NEW** — example tool (stdin-JSON → marker result). |
| `assets/tool-template/.env.example` | **NEW** — names-only secret example. |
| `assets/tool-template/.gitignore` | **NEW** — `.env`, `tools-execution.log`. |
| `assets/tool-template/CLAUDE.md` | **NEW** — folder-local authoring guide (EPIC C11). |
| `src/renderer/api/tools/tool-scaffold.ts` | **NEW** — `createToolset(name, dir)` scaffold-only, name-rewrite. |
| `src/renderer/ui/dialogs/RegisterToolsetDialog.tsx` | **NEW** — C3 confirmation dialog + `showRegisterToolsetDialog`. |
| `src/renderer/api/mcp-handler.ts` | **EDIT** — `create_toolset` case + `createToolsetCmd` handler. |
| `src/main/mcp-http-server.ts` | **EDIT** — `create_toolset` `server.tool` decl (timeout 0). |
| `assets/mcp-res-tools.md` | **EDIT** — one-line confirmation-prompt note. |
| `doc/active-work.md` | **EDIT** — US-804 line → link to this doc. |
| `doc/epics/EPIC-038.md` | **EDIT** — 2026-07-04 Notes entry. |

### Files needing NO change (do not investigate)
- `src/renderer/api/tools/{tools-trust,registered-tools,tools-manifest,tool-executor,dotenv,tool-stats,tool-log}.ts` — US-801/802, consumed as-is.
- `forge.config.ts` / `electron-builder.yml` — `assets/` already shipped by both.
- `read_guide` enum / `resourceFiles` in `mcp-http-server.ts` — the "tools" guide is already registered (US-803).
- `src/renderer/api/boards.ts` / `board-scaffold.ts` — precedent only, not modified.
</content>
</invoke>
