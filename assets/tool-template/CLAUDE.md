# Agent Tool — authoring guide

This folder is a **Persephone toolset**: a `tools-manifest.json` declaring one or more **tools**
(parameterized scripts in any language), plus the scripts they run, an optional `.env` for
secrets, and this guide. Once the toolset is **registered** (a user action), any MCP-connected
agent discovers its tools with `search_tools` and runs them with `execute_tool` — so a recurring
external-system chore (read an Azure DevOps task, query a database, check an inbox, call a CLI) is
debugged **once** and reused across sessions and agents. This folder *is* the persistent artifact.

## Toolset identity: `tools-manifest.json`

The folder is recognized as a toolset because it contains **`tools-manifest.json`**. It declares
the toolset and its tools:

```jsonc
{
  "schemaVersion": 1,
  "name": "azure-devops",            // AUTHORITATIVE toolset name (NOT the folder name).
  "description": "Azure DevOps work-item tools",
  "author": "you",
  "keywords": ["ado", "work items"], // optional extra search terms
  "tools": [
    {
      "name": "get_task",                         // tool id becomes "azure-devops/get_task"
      "description": "Fetch a work item by id",   // shown by search_tools
      "command": "python get_task.py",            // run with cwd = THIS folder
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

- `name` is the **authoritative** toolset name and namespaces every tool id as `<name>/<tool>`.
  It is independent of the folder name (folders get renamed when copied between machines).
- `command` is a command-line string run with the working directory set to **this folder**, so
  reference scripts by **relative path** (`python get_task.py`, `node index.js`).
- `inputSchema` *describes* parameters to the agent; the script must still validate its own inputs
  (registry-side validation is best-effort, non-blocking).
- Use **relative paths only** and put **no secrets** in the manifest — keep the folder copyable.

## How a tool receives args and returns a result

**Args in:** Persephone delivers the call's `args` (a JSON object) on the tool's **stdin** — immune
to shell-quoting and readable from any language. Read stdin, parse JSON.

**Result out:** print the result on its own line as **`##PERSEPHONE_RESULT##<json>`** — the **last**
such line wins, so progress logs or third-party-library chatter on stdout are harmless. Rules:

- Unmarked stdout lines are returned to the agent as `logs`.
- If you print **no marker at all**, your whole trimmed stdout becomes the result as plain text
  (trivial tools stay trivial).
- Write diagnostics to **stderr**.
- A **non-zero exit code** is a failure — the agent receives `exitCode`, `stderr`, and this folder
  path so it can fix the tool.

One-liners per runtime (see `echo.js` for a full example):

```python
# Python
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
# PowerShell  (set "shell": "pwsh" on the tool)
$args = [Console]::In.ReadToEnd() | ConvertFrom-Json
Write-Output ("##PERSEPHONE_RESULT##" + (@{ ok = $true; value = 42 } | ConvertTo-Json -Compress))
```

## Secrets: `.env`

Put secret **values** in a `.env` file in this folder (next to `tools-manifest.json`) and list only
their **names** in each tool's `env[]`. Persephone parses `.env` and injects the values into the
tool's process at run time, so scripts just read plain environment variables. `.env` values **never**
travel through MCP — `search_tools` reports env var **names** only. A var set empty in `.env` is
removed from the child's environment.

```
# .env  (git-ignored by this template)
AZURE_DEVOPS_PAT=xxxxxxxxxxxxxxxx
```

Copy `.env` between **your own** machines when moving a toolset; **delete it** when sharing with
someone else. `.env.example` documents the names without values.

## Edit → refresh → run (no auto-reload)

Persephone does **not** watch this folder. After you edit the manifest or a script, call the
**`refresh_toolset`** MCP tool to pick up the change (it returns a per-toolset summary — `name`,
`valid`, `errors`, `toolCount` — so you can confirm a manifest edit parsed), then re-run the tool.

## Self-repair — the core rule

A registered tool that fails is a **bug to fix**, not an obstacle to route around. `execute_tool`
hands you the exact `stderr`, the `exitCode`, and this folder path — open the script here, fix it,
`refresh_toolset`, and re-run. Every fix makes the tool more reliable for the next session; that is
what makes the registry *memory*.

## Portability

This folder is self-contained: copy it to another machine and register it there. Each tool's
`requirements` field (surfaced by `search_tools`) tells you what to provision (a runtime version,
packages, a CLI). Secrets travel only if you copy `.env` along with the folder.
