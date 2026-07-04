# Agent Tools — reuse parameterized tools instead of re-writing scripts

The **Agent Tools registry** is Persephone's *executable memory*. Instead of re-writing (and
re-debugging) the same ad-hoc integration script every session — read an Azure DevOps task,
query a SQL database, check an inbox, call a CLI — you register the working script **once** as
a *tool*, and from then on any MCP client discovers and runs it in a single call. You pay the
integration's debugging cost once; the working artifact persists across sessions and across
agents.

A **toolset** is a folder holding a `tools-manifest.json` (declaring one or more tools),
the scripts those tools run (any language), an optional `.env` for secrets, and an optional
`README.md`. Tools are namespaced by toolset: a tool's id is `<toolset-name>/<tool-name>`.

> Registered tools run as real OS processes with the user's privileges, so a toolset must be
> **registered** (a user-only trust action) before its tools are discoverable or runnable. You
> cannot self-register a folder — that stays a user decision (a confirmation dialog on
> agent-initiated creation, or the Agent Tools management UI).

## The workflow

1. **Before writing an ad-hoc script** for a recurring external-system task, call
   `search_tools` — a ready-made tool may already exist.
2. **Run it** with `execute_tool { toolId, args }`.
3. **If it fails**, the result carries the tool's folder path (`toolsetRoot`) and its `stderr`.
   **Fix the tool at that path**, then `refresh_toolset` and re-run — do *not* silently work
   around a broken tool (that's the whole point of the registry).
4. **After a repeatable ad-hoc success**, offer to register it as a reusable tool so the next
   session gets it for free.

## `search_tools` — discover tools

Returns **complete, ready-to-call definitions** (like `ToolSearch` — there is no separate
"get info" call). Query forms:

- **Omit `query`** (or pass empty) → a cheap `{ id, description }` listing of *every* tool.
  Use this as your `list_tools`.
- **`select:<toolset>/<tool>`** → exact-id lookup, returns the one full definition.
- **anything else** → case-insensitive substring match over id + description + keywords,
  capped by `maxResults` (default 5).

Each full definition contains: `id`, `toolset`, `description`, `inputSchema` (JSON Schema for
the args, may be absent), `requirements` (runtime prerequisites), `env` (the **names** of
required environment variables — never their values), `timeoutMs`, and `toolsetRoot` (the local
folder, where you go to read or fix the tool).

## `execute_tool` — run a tool

```
execute_tool { toolId: "azure-devops/get_task", args: { id: 12345 } }
```

`args` is a JSON object matching the tool's `inputSchema`; Persephone delivers it to the tool
**on stdin** (immune to shell-quoting, readable from any language). Omit `args` for a
no-parameter tool.

### The result contract (how a tool returns data)

A tool communicates its result through stdout, using a sentinel marker:

- Print the result on its own line as **`##PERSEPHONE_RESULT##<json>`**. The **last** such line
  wins, so progress logs or third-party-library chatter on stdout are harmless.
- Any stdout line **without** the marker is treated as a **log** and returned to you as `logs`.
- If the tool prints **no marker at all**, its whole trimmed stdout becomes the result as
  **plain text** (`resultText`) — trivial tools stay trivial.
- **stderr** is returned as diagnostics.
- A **non-zero exit code** is a failure: the result is `{ ok:false, error, exitCode, stderr,
  toolsetRoot }`.

The `execute_tool` result is always structured (even on failure — so you get the self-repair
fuel):

```jsonc
// success
{ "ok": true, "result": { ... }, "logs": "...", "durationMs": 812, "toolId": "...", "toolsetRoot": "..." }
// or, no marker printed:
{ "ok": true, "resultText": "done", "logs": "", "durationMs": 40, ... }

// failure
{ "ok": false, "error": "Tool exited with code 1. stderr: ...", "exitCode": 1,
  "stderr": "...", "logs": "...", "toolsetRoot": "C:\\tools\\azure-devops", "toolId": "..." }
```

### `print_result` one-liners

Emit the marker line from any runtime:

```python
# Python — read args from stdin, print the result
import sys, json
args = json.loads(sys.stdin.read() or "{}")
print("##PERSEPHONE_RESULT##" + json.dumps({ "ok": True, "value": 42 }))
```

```javascript
// Node.js
const chunks = []; process.stdin.on("data", c => chunks.push(c));
process.stdin.on("end", () => {
    const args = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    console.log("##PERSEPHONE_RESULT##" + JSON.stringify({ ok: true, value: 42 }));
});
```

```powershell
# PowerShell
$args = [Console]::In.ReadToEnd() | ConvertFrom-Json
Write-Output ("##PERSEPHONE_RESULT##" + (@{ ok = $true; value = 42 } | ConvertTo-Json -Compress))
```

## The manifest — `tools-manifest.json`

```jsonc
{
  "schemaVersion": 1,
  "name": "azure-devops",            // AUTHORITATIVE toolset name (not the folder name)
  "description": "Azure DevOps work-item tools",
  "author": "you",
  "keywords": ["ado", "work items"], // optional extra search terms
  "tools": [
    {
      "name": "get_task",                         // id becomes "azure-devops/get_task"
      "description": "Fetch a work item by id",   // shown by search_tools
      "command": "python get_task.py",            // run with cwd = the toolset folder
      "inputSchema": {                            // JSON Schema (MCP dialect) — optional
        "type": "object",
        "properties": { "id": { "type": "integer", "description": "Work item id" } },
        "required": ["id"]
      },
      "timeoutMs": 30000,                          // optional (default 120000)
      "shell": "pwsh",                             // optional shell override (default cmd/true)
      "env": ["AZURE_DEVOPS_PAT"],                 // NAMES of required env vars (values in .env)
      "requirements": "python 3.11+, requests",   // free-text prerequisites (portability)
      "keywords": ["task", "work item"]
    }
  ]
}
```

- `command` is a command-line string run with the working directory set to the toolset folder,
  so reference scripts by relative path (`python get_task.py`, `node index.js`).
- `inputSchema` *describes* parameters to you; the tool script must still validate its own
  inputs (registry-side validation is best-effort, non-blocking).
- The manifest uses **relative paths only** and contains **no secrets** — keep the folder
  copyable between machines.

## Secrets — `.env`

Put secret **values** in a `.env` file at the toolset folder root (next to
`tools-manifest.json`); list only their **names** in the tool's `env[]`. Persephone parses
`.env` and injects the values into the tool's process environment at run time, so scripts just
read plain environment variables. `.env` values **never** travel through MCP —
`search_tools` reports env var names only.

```
# .env  (git-ignore this)
AZURE_DEVOPS_PAT=xxxxxxxxxxxxxxxx
```

`.env` values **override** inherited process env, and a variable set to empty in `.env` is
removed from the child's environment. When sharing a toolset with someone else, delete `.env`
(copying it between *your own* machines is fine).

## Portability

A toolset is a self-contained folder — copy it to another machine and register it there. The
per-tool `requirements` field (surfaced by `search_tools` and the management UI) tells you what
to provision on the new machine (a Python version, pip packages, a CLI). Secrets travel only if
the user copies `.env` along with the folder.

## Creating a toolset

Use `create_toolset` (or the **Agent Tools** management UI) to scaffold a toolset folder with a
starter manifest and example script; then edit the manifest + scripts and call
`refresh_toolset` to pick up your changes. `refresh_toolset` returns a per-toolset summary
(`name`, `valid`, `errors`, `toolCount`) so you can confirm a manifest edit parsed before
running anything.

`create_toolset` **prompts the user to confirm registration** (its tools will run headlessly with
their privileges). If they decline, the result is `{ registered: false }`: the folder was created
but its tools are not runnable yet. This is recoverable without any manual step — if the user asks
to enable it (e.g. they declined by mistake), just call `create_toolset` again with the **same
`name` and `dir`** and the prompt reappears; it will **not** overwrite your edits. Calling it on a
toolset that already exists never re-scaffolds (it re-offers registration, or no-ops if the toolset
is already registered).

## Self-repair — the core rule

A registered tool that fails is a **bug to fix**, not an obstacle to route around. `execute_tool`
hands you everything you need: the exact `stderr`, the `exitCode`, and the `toolsetRoot` folder.
Open the script at that path, fix it, `refresh_toolset`, and re-run. Every fix makes the tool
more reliable for the next session — that is what makes the registry *memory*.
</content>
