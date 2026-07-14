# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active
- **EPIC-042** — [Boards as Custom Editors (file association, editor switch, filePath-in boards)](epics/EPIC-042.md) — _design finalized (CE1–CE8)_
  - [ ] [US-836: Board manifest — `fileMasks` + `editorPriority` + editor identity](tasks/US-836-board-manifest-file-association/README.md)
  - [ ] [US-837: Custom-editor registry — reactive `mask → trusted board` map](tasks/US-837-custom-editor-registry/README.md)

## Planned
- **EPIC-039** — [Secure Peer-to-Peer Connections (Contacts, Chat, Remote Control)](epics/EPIC-039.md)
  - [ ] US-813: Crypto + identity foundation (libsodium keypair, encrypted-at-rest, seal/open helpers)
  - [ ] US-814: Pluggable transport + MQTT backend (`PeerTransport`, `MqttTransport`, `peerConnection` service)
  - [ ] US-815: Contacts registry + out-of-band pairing (`contacts.json`, generate/import contact file, key pinning)
  - [ ] US-816: Secure message channel (`PeerSession`, envelope framing, connect/timeout lifecycle)
  - [ ] US-817: Chat editor (standalone editor over the encrypted channel)
  - [ ] US-818: `peer://` remote-file provider (open/edit/save a file on the peer's disk)
  - [ ] US-819: Remote command control (forward `handleCommand`, controlled-side grant + opt-in auto-trust)
  - [ ] US-820: Remote window mirror (App bar peer list; screencast the remote main window + input-injection)
- **EPIC-022** — [LinkEditor Embedded Scripts](epics/EPIC-022.md)
  - [ ] US-396: Data model — `LinkScriptItem` type and `scripts` field in `LinkEditorData`
  - [ ] US-397: ScriptRunner — `runWithScope()` for custom context variable injection
  - [ ] US-398: LinkEditorScriptProvider — virtual IProvider backed by LinkViewModel
  - [ ] US-399: Resolver — handle `link-editor-script://` URL scheme
  - [ ] US-400: Scripts panel UI — collapsible panel with tree view in LinkEditor
  - [ ] US-401: Add/Edit Script dialog
  - [ ] US-402: Script execution engine — event matching and execution in LinkViewModel
  - [ ] US-403: Script types and facade for script API
- **EPIC-014** — [Claude AI Chat Panel](epics/EPIC-014.md)
  - [ ] US-385: Right panel slot in Pages.tsx layout
  - [ ] US-386: ClaudeChatModel + SDK integration (query, streaming, abort)
  - [ ] US-387: Chat UI — message list, input, markdown rendering
  - [ ] US-388: MCP auto-registration + page context injection
  - [ ] US-389: Conversation persistence + session resume
  - [ ] US-390: Settings: API key, model, system prompt
  - [ ] US-391: PowerShell shortcut (Ctrl+\`) — open shell at cwd
- **EPIC-011** — [Chrome Extension Support for Built-in Browser](epics/EPIC-011.md)
- *(no epic)*
  - [ ] [US-454: DrawIO Viewer — read-only viewer for `.drawio` files](tasks/US-454-drawio-viewer/README.md)


---

## How This Dashboard Works

### Structure

Each section (Active / Planned) lists epics as top-level items and tasks as sub-items:

```
- **EPIC-XXX** — [Title](epics/EPIC-XXX.md)
  - [ ] US-YYY: Task title
  - [x] US-ZZZ: Completed task title
- *(no epic)*
  - [ ] US-AAA: Standalone task
```

### Starting work

1. Move an epic or task from **Planned** to **Active**
2. Mark the task `[ ]` → `[x]` when done

### Completing a standalone task (no epic)

1. Mark task `[x]` in Active section
2. Move it to [`/doc/tasks/completed.md`](tasks/completed.md)
3. Remove from this dashboard

### Completing an epic

1. All tasks under the epic should be `[x]`
2. Move the entire epic block (with tasks) to [`/doc/epics/completed.md`](epics/completed.md)
3. Remove from this dashboard

### Creating new work

- **New epic:** Add to Planned with link to its doc in `/doc/epics/`
- **New task (with epic):** Add as sub-item under the epic
- **New task (standalone):** Add under `*(no epic)*`

### Task ID Format

`US-XXX` — sequential number. `EPIC-XXX` — sequential number.
