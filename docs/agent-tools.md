[← Home](./index.md)

# Agent Tools

The **Agent Tools registry** is Persephone's *executable memory* for AI agents. Instead of re-writing (and re-debugging) the same ad-hoc integration script every session — read an Azure DevOps task, query a SQL database, check an inbox, call a cloud CLI — an agent registers the working script **once** as a reusable *tool*. From then on, any MCP-connected agent discovers and runs it in a single call. The debugging cost of an integration is paid once, and the working artifact persists across sessions and across agents.

> **Target audience:** This guide is for users who want to understand, manage, and trust toolsets. For AI agents that build tools, the `read_guide("tools")` MCP guide and the `CLAUDE.md` inside each scaffolded toolset are the authoring references.

It complements the [Mneme knowledge base](./mneme.md): Mneme is *knowledge* memory (searchable documents), the tools registry is *executable* memory (runnable tools).

---

## Concepts

### What is a toolset?

A **toolset** is an ordinary folder on disk identified by a `tools-manifest.json` file in its root. One toolset declares **one or more tools** (an Azure DevOps toolset naturally holds `get_task`, `list_my_tasks`, … sharing the same auth code). A toolset folder contains:

| Part | What it is |
|------|-----------|
| **Manifest** | `tools-manifest.json` — declares the toolset name and its tools (name, description, command, parameters). |
| **Scripts** | The programs the tools run, in **any language** (`.py`, `.js`, `.ps1`, `.sh`, …). They run as real OS processes with your privileges. |
| **Secrets** *(optional)* | A `.env` file at the folder root holding secret values (API tokens, connection strings). |

Each tool has an id of the form `<toolset-name>/<tool-name>` (e.g. `azure-devops/get_task`). The toolset **name in the manifest** is authoritative — not the folder name — so a toolset keeps its identity when the folder is copied or renamed.

### The registry is agent-facing

Unlike most editors, the tools registry is used mostly *by AI agents over MCP*, not directly in the UI. Agents discover tools with `search_tools`, run them with `execute_tool`, and — when a tool fails — fix the script and retry. The Persephone UI is where **you** stay in control: registering, inspecting, and removing toolsets.

### Toolset trust gate

Because a tool runs a program with your full user privileges, **a toolset must be registered before its tools are discoverable or runnable** — and *registering a toolset is the same act as trusting it*. There is one list: registered ≡ trusted.

Registration is deliberately a **user-only** decision — an agent can never silently register a folder. It happens in exactly two ways:

- **Agent-initiated** (the MCP `create_toolset` tool, or an agent asking to register a folder copied from elsewhere) → Persephone shows a **"Register this toolset?"** confirmation dialog:

  > *"An AI agent wants to register a toolset. Once registered, its tools run as programs on your computer with your full user privileges — headlessly, whenever the agent calls them, and after the agent edits them, with no further prompt. Only register toolsets you created or fully understand."*

  The dialog lists the toolset name, its folder path, and each declared tool. **Register toolset** trusts and enables it; **Cancel** leaves the folder created but not runnable.

- **User-initiated** — you click the **Open Toolset** icon on a `tools-manifest.json` in the **File Explorer**. If the folder isn't registered yet, the same confirmation dialog appears (because that icon can be clicked on any folder you're browsing, including a foreign one); confirming registers it and opens it.

This is stricter than the [Boards](./boards.md) trust gate on purpose: a board is a *visible* artifact you look at, whereas a registered tool later runs **headlessly** whenever an agent calls it — and re-runs after the agent edits it — so registration is your one natural checkpoint on that capability.

- Registration is **remembered across restarts** (stored in `%AppData%\persephone\data\trustedTools.txt`).
- Matching is **per exact folder** — there is no inherited/parent trust (each toolset is registered individually).
- Removing a toolset from a management panel **unregisters** it (its tools stop being discoverable/runnable); the folder on disk is untouched.

> Only register toolsets you created or fully understand — registering lets the toolset's scripts run programs and access files with your Windows user account's privileges.

---

## Managing toolsets in the UI

### The per-toolset editor

Opening a toolset shows a read-only **toolset view** with:

- The toolset name, description, and author, and a **Registered** chip.
- **Open Folder** — opens the toolset's folder in a File Explorer panel so you can read or edit its scripts and manifest.
- **Open Log** — opens that toolset's execution log (`tools-execution.log`) in a tab, so you can see what its tools actually ran and printed. (If no tool has run yet, Persephone tells you there's no log.)
- A card per declared tool — its description, command, parameters, required environment-variable **names**, and any runtime `requirements`. If the manifest has errors, they're listed here instead.

### Where to find toolsets

- **File Explorer** — rows for `tools-manifest.json` files show an **Open Toolset** button (wrench icon) directly in the row. Click it to register (if needed) and open that toolset. Clicking the row itself still opens the JSON in Monaco.
- **Boards panel → Tools** — open the **Boards** panel from the File Explorer header, then flip its inner switch from **Boards** to **Tools**. This lists every registered toolset under the current Explorer root. Click one to open it.
- **Tools & Editors panel → Tools tab** — the sidebar **Tools & Editors** panel has three segments: **Built-in Editors**, **Boards**, and **Tools**. The **Tools** tab lists *all* registered toolsets across every location. Click one to open it; right-click for **Remove** (unregister).

---

## Using tools from an AI agent (MCP)

The registry adds four MCP tools. They require the [MCP server](./mcp-setup.md) to be enabled. The surface is deliberately **constant-size** — these four tools work no matter how many tools you register.

| Tool | Description |
|------|-------------|
| **search_tools** | Discover tools. Returns **complete, ready-to-call definitions** (id, description, `inputSchema`, `requirements`, required env-var names, `toolsetRoot`). Omit `query` for a cheap listing of every tool; use `select:<toolset>/<tool>` for an exact lookup; otherwise the query is split into whitespace-separated terms and matched (case-insensitively) against each tool's id, description, and keywords **and its toolset's name, description, and keywords** — tools matching at least one term come back ranked by how many terms matched (a `score` on each result), capped by `maxResults` (default 5). |
| **execute_tool** | Run a tool: `{ toolId, args }`. `args` is delivered to the script on **stdin** as JSON. Returns a structured result — on failure it includes `stderr`, `exitCode`, and the toolset folder path so the agent can fix the tool. |
| **refresh_toolset** | Re-read a registered toolset's manifest after its files are edited (all toolsets when `path` is omitted). Returns a per-toolset summary (`name`, `valid`, `errors`, `toolCount`). **Never registers** — the trust gate always holds. |
| **create_toolset** | Scaffold a new toolset folder (starter manifest + example script) and prompt you to register it. If you decline, the folder is created but not runnable — the agent can re-offer without losing edits. |

### How a tool passes data back

A tool script reads its `args` from stdin and returns its result on stdout using a sentinel marker:

- Print the result on its own line as `##PERSEPHONE_RESULT##<json>` — the **last** such line wins, so progress logs and third-party-library chatter on stdout are harmless.
- If the script prints no marker at all, its whole trimmed stdout becomes the result as plain text.
- `stderr` is returned as diagnostics; a non-zero exit code is treated as a failure.

### Secrets and portability

- **Secrets** live in a `.env` file at the toolset folder root; the manifest lists only the **names** of required variables. Persephone injects the values into the tool's process at run time. `.env` values **never** travel through MCP — `search_tools` reports names only.
- A toolset is a **self-contained folder** — copy it to another machine and register it there. Each tool's free-text `requirements` field (a Python version, pip packages, a CLI) tells you what to provision on the new machine. Secrets travel only if you copy `.env` along with the folder — delete `.env` when sharing a toolset with someone else.

> **Not available to scripts.** Registering, unregistering, and executing tools are **not** exposed on the `app` object or in the scripting API. A script can't register itself or run a tool — those stay user- and agent-MCP-gated by design.

---

## Related

- [MCP Server Setup](./mcp-setup.md) — enable the server so agents can use `search_tools` / `execute_tool`.
- [Boards](./boards.md) — the sibling feature the tools registry mirrors (folder + manifest + trust gate), for building custom UIs instead of headless tools.
- [Mneme Knowledge Base](./mneme.md) — the *knowledge* counterpart to the tools registry's *executable* memory.
