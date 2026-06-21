# EPIC-035: Boards Anywhere — portable boards, manifest identity, board-level trust, link/MCP open & sidebar registry

## Status

**Status:** 🟢 Active — **design finalized 2026-06-21** (all concerns C1–C8 resolved; scope frozen at 6 tasks US-745…US-751)
**Created:** 2026-06-21
**Follows:** [EPIC-034 — Web Board](EPIC-034.md) (foundation; not yet released → no backward-compatibility constraints, the only existing boards are this repo's `.persephone` test boards and can be adjusted by hand once)

> Design is **consolidated and finalized** (all open questions resolved — see *Open questions / design constraints*). Tasks are carved in **build order**; each gets a full Goal → Background → Implementation Plan → Concerns → Acceptance doc **before** its implementation begins. Start with **US-745** (the manifest — foundation for everything else).

## The big idea

EPIC-034 proved that a **Web Board** lets a user (or their AI agent) build *any* tool/app — a self-contained frontend/backend mini-app hosted in a sandboxed webview, wired to the machine through `persephone.execute()`. This epic **generalizes that capability** from "a board lives inside a `.persephone` project" toward **boards as portable, first-class custom editors/tools** that can:

- live **anywhere on disk** (not only under `.persephone/boards/`),
- be **identified** by a `board-manifest.json` rather than by their parent folder,
- be **trusted per board** (finer than per-project),
- be **opened by link** (`openRawLink`) and **created/opened/developed by an agent over MCP** with **zero user clicks**,
- be **discovered and pinned** in the App sidebar's "Tools & Editors" section as a folder-grouped tree,
- and (future axis) **register file extensions** so opening a matching file routes into the board — the bridge from "Web Board" to "**Custom Editor**".

`.persephone` projects don't go away — they remain a convenient way to **group** project-related boards. They simply stop being the *only* place a board can exist.

## Goals

- **Portability** — a board is recognized by a manifest, so it can live in any folder; `.persephone/boards/` becomes one organizing convention, not a hard requirement.
- **Per-board trust** — move the trust gate from the `.persephone` project to the individual board, while keeping trust a deliberate, centrally-persisted user decision (never self-declared by the board).
- **Programmatic lifecycle** — expose create / create-demo / open to the `app` script API and an MCP tool so an agent can stand up and develop a board end-to-end without user interaction.
- **Open-by-link** — a dedicated link scheme opens a board through the canonical `openRawLink` pipeline, with room to forward extra params (e.g. a `filePath` to edit) — the seam for the Custom Editor future.
- **Discoverability** — surface trusted boards in the "Tools & Editors" sidebar section as a folder-grouped tree, pinnable alongside built-in editors.
- **One registry = the trust list** — *trusted ≡ registered*: the trusted-boards list IS the known-boards registry. The sidebar *Boards* tab manages it directly — a context-menu **Remove board** untrusts it. No separate editor.
- **Explorer affordance** — recognize `board-manifest.json` in the Explorer so a teammate can open a received board by clicking next to the manifest (trust prompt if needed).

## Tasks (build order)

Foundations first. Each gets a full Goal → Background → Implementation Plan → Concerns → Acceptance doc **before** implementation. All design constraints below are resolved.

| Task | Title | Depends on |
|------|-------|-----------|
| US-745 | **`board-manifest.json` — board identity file.** The canonical "this folder is a board" marker. Minimal v1 fields: `schemaVersion`, optional `name` (else folder name), optional `icon` (else the `icon.svg`/`png`/`ico` probe from US-744). **Written on create** — add `board-manifest.json` to the `assets/board-template/` and `assets/demo-board/` template folders and/or emit it in `scaffoldBoard()`, so enumeration (US-746) and Explorer recognition (US-749) have something to detect. **No trust field** (see C2). Reserve space for future `fileExtensions` (see Future). | — |
| US-746 | **Boards anywhere.** Decouple a board's location from `.persephone/boards/`: a board = any folder containing `board-manifest.json`. Refactor `BoardEditorModel.refreshBoards()` (today hard-scans `<persephonePath>/boards`) and the private `createFromTemplate()` (today hardcodes `fpJoin(persephonePath, "boards", name)`) to accept an arbitrary board root; the public `createBoard(name)` / `createDemoBoard(name)` gain an optional `dir` so US-750 can target any path. **Extend `BoardEditorModel` state + the open path to accept a direct board-root path** (not only `.persephone` + name) — required by US-748's open-by-link. `.persephone/boards/` stays as the default grouping for project boards. | US-745 |
| US-747 | **Trust at board level.** Move the gate from per-`.persephone`-project to per-board. New trusted-**boards** registry module (e.g. `board-trust.ts` + data file `trustedBoards.txt`) — path-keyed, in `<userData>/persephone/data/`, modeled on `project-trust.ts`'s `prepareDataFile`/`saveDataFile`; NOT a manifest field (C2). Decide whether `project-trust.ts` is retired or repurposed. Per-board "Trust board" dialog (RCE wording from US-721). Project trust redesigned as a **"Trust all boards in this project"** bulk action — exposed via the Explorer `.persephone`-node context menu (sibling of the existing "Create .persephone project" item); adds current boards to the registry, no standing grant for future ones (C4). Refactor `BoardEditorView.tsx` gate, `UntrustedProjectView`, and the create-flow auto-trust in `ExplorerSecondaryView`. | US-745 |
| US-748 | **Open-a-board link scheme.** New `persephone-board://` scheme (decided, C1 — **NOT** `board://`): encode/decode helper (`src/renderer/content/*-link.ts`) + a Layer-1 parser in `parsers.ts` (parser-only, like `persephone-folder://`; **no** new resolver presumed), `target: "board-view"`. It is an **in-app link scheme parsed in the renderer — NOT an Electron custom protocol** (contrast `board://`, a real protocol handler in `src/main/board-protocol-service.ts`); do not register it with `protocol.handle`. Opens a board by path through `openRawLink`, with optional forwarded params (e.g. `filePath`) carried on `ILinkData`. Models `persephone-folder://`. | US-745, US-746 |
| US-749 | **Explorer "open board" row button.** On a `board-manifest.json` row in the Explorer file tree, add a **right-edge trailing icon button** (`BoardIcon`, "Open Board" tooltip). The row's normal click still opens the JSON in Monaco; the **button** opens the board (or shows the trust dialog if untrusted). Carve-time work = a per-row trailing action slot in the tree-row renderer — **not** folder-click interception (C7). | US-745, US-748 |
| US-750 | **App API + MCP for board lifecycle.** Expose `createBoard` / `createDemoBoard` / `openBoard(path)` to the renderer `app` API (Persephone scripts) and an MCP tool, so an agent creates a board at a **user-specified path**, opens it via US-748, and develops it (edit files + iterate) without user clicks. Boards created through this API are **auto-trusted at creation** (C5), so there is no trust gate on the agent's create→open→develop loop. | US-748 |
| US-751 | **Sidebar "Tools & Editors" boards tab + board management.** Redesign the "All Editors & Tools" subsection into **two tabs** — *Editors* (today's `getCreatableItems()` list) and *Boards* (trusted boards as a folder-grouped **tree**). The *Boards* tab is the single management surface: **open** a board (US-748), **pin/unpin** alongside built-in editors (extend the `pinned-editors` setting), and **Remove board** via context menu — where *remove ≡ untrust* (edits the trusted-boards registry from US-747). Touch `ToolsEditorsPanel.tsx` + `tools-editors-registry.ts`. Source = the trusted-boards registry (C3: *trusted ≡ registered*). **Pin-id format gap:** a board's pin identity is its **path**, not a short string id like `"script-js"`, so the existing `pinned-editors` setting can't hold boards as-is — decide between widening that key's value format or adding a separate `pinned-boards` key. **No separate editor** — dropped as unnecessary. | US-745, US-746, US-747 |

## Idea-by-idea design notes

### 1. Open a board via a link (`openRawLink`) — with forwardable params

- **Scheme name (C1) — decided: `persephone-board://`.** `board://` is already the **webview file-serving protocol** (`BoardWebview` loads `board:///index.html`; per-`board-<uuid>` partition handler, no board-id in URL — `board-protocol-service.ts`). It cannot double as an "open this board" link scheme, so the open scheme is **`persephone-board://`** — the natural sibling to the existing `persephone-folder://` (which already opens a `.persephone` project, `target: "board-view"`).
- **Pipeline fit.** `persephone-folder://` is handled **parser-only** (`parsers.ts` subscribes to `openRawLink`, sets `data.url` + `data.target: "board-view"`, forwards to `openLink`) — there is **no** dedicated Layer-2 resolver for it. Mirror that: add a Layer-1 parser in `parsers.ts`; **no new resolver** unless carve-time shows the open path needs one. `ILinkData` already carries arbitrary navigation hints, so a forwarded `filePath` rides along as a field and is handed to the board on open. Carve-time check: confirm the open path routes a **bare board-root path** to the `board-view` target (the model-state change is in US-746).
- **Why it matters for "Custom Editor."** Forwarding a `filePath` is the seam: a future custom editor opens *a file* in a board (see Future axis), reusing the same open path rather than a special case.

### 2 + 3. Boards anywhere, `.persephone` as grouping

- Today a board is "a direct child folder of `<project>/.persephone/boards/`" (`refreshBoards()` enumerates exactly that). Once boards can live anywhere, **something else must mark a folder as a board** — that's US-745's `board-manifest.json` (Theme B is the *enabler* for Theme A; do 745 first).
- `.persephone/boards/` stays as the **default create location** and a way to group a project's boards; portability is purely additive.

### 4. Trust at board level

- Trust scope shrinks from the `.persephone` project to the **board**. Storage moves from `trustedProjects.txt` to a **trusted-boards registry** in `<userData>/persephone/data/`, keyed by normalized absolute board path (same `fs` data-file mechanism as settings / recent files).
- **Hard constraint (C2):** trust is **never** read from the manifest or any in-board file — a received board must not be able to self-trust. Trust is always a user action persisted outside the board.
- **Project trust → bulk action (C4).** The former per-project gate becomes a **"Trust all boards in this project"** convenience that adds every board *currently* in the `.persephone` project to the registry as individual entries. It does **not** cover boards added later — a newly copied board is untrusted and prompts on open.
- **Auto-trust on create (C5).** Boards created through Persephone's own `createBoard` / `createDemoBoard` API (user or agent) are added to the registry **at creation**, so the gate never interrupts an authored board. The gate fires only for **foreign** boards Persephone didn't create (opened via Explorer / `persephone-board://`).

### 5. Programmatic create / open / develop (app API + MCP)

- Today create/scaffold is **renderer-only** (`BoardEditorModel.createBoard()` / `createDemoBoard()` → `createFromTemplate()` → `board-scaffold.ts`). Lift the scaffolding into something callable from the `app` API and an MCP tool.
- Flow the user wants: *"create a board at `<path>`"* → agent calls create → opens via `persephone-board://` → edits files + iterates — **no user clicks**. Unblocked by C5: boards created through the API are **auto-trusted at creation** (Persephone writing the registry by provenance — consistent with C2), so the loop never hits the trust gate. The gate is reserved for **foreign** boards Persephone didn't create.

### 6. Sidebar "Tools & Editors" → Boards tree tab

- The sidebar lives in `ToolsEditorsPanel.tsx` (flat list: "Pinned" + "All Editors & Tools"), sourced from `tools-editors-registry.ts` `getCreatableItems()`; pin state is the `pinned-editors` setting.
- Plan: split "All Editors & Tools" into two tabs — keep the existing list as *Editors*, add a *Boards* tab that renders **trusted boards as a folder tree** (group by location), each openable via US-748 and pinnable via the existing pin mechanism.
- **Board management lives here — no separate editor.** The *Boards* tab is also where a board is **removed**: a context-menu **Remove board** action, where *remove ≡ untrust* (writes the trusted-boards registry from US-747). A dedicated Registered-Boards editor was considered and **dropped** — the sidebar tab is enough.
- **Trusted ≡ Registered.** There is no separate "known boards" store to maintain: the trusted-boards list (US-747) *is* the registry. A board appears here once trusted; removing it here untrusts it. This collapses C3.

### 7. `board-manifest.json` as identity + Explorer open icon (+ future extension registration)

- v1 role: **identity marker** (US-745) + what the Explorer recognizes to add a **trailing "Open Board" button** on the manifest's row (US-749). The row click still opens the JSON in Monaco; the right-edge `BoardIcon` button opens the board (trust dialog if untrusted) — so a teammate opens a received board folder and clicks the button next to `board-manifest.json` (C7).
- Future role: a `fileExtensions` field that registers the board as the editor for matching files — the Custom Editor bridge (see Future axis; security caveat C6).

## Open questions / design constraints to resolve before carving

- **C1 — Scheme naming collision. ✅ decided (user, 2026-06-21): use `persephone-board://`.** `board://` is the webview file protocol and is unavailable as an open-link scheme. The open-a-board link scheme is **`persephone-board://`** — the sibling of the existing `persephone-folder://`. Final name fixed.
- **C2 — Manifest is NOT a trust source (hard constraint). ✅ confirmed (user, 2026-06-21).** Trust must be a centrally-persisted user decision; never a manifest/in-board field. A portable board could otherwise ship `trusted:true` and self-authorize RCE. Non-negotiable. **Storage decided:** the **trusted-boards registry** is a data file in the **persephone data folder** — `<userData>/persephone/data/` — next to `settings`, the recent-files list, and EPIC-034's `trustedProjects.txt` (via the same `fs` `prepareDataFile`/`saveDataFile` helpers). It is the single source of truth for trust **and** the Registered-boards listing (C3: *trusted ≡ registered*).
- **C3 — Known-boards registry. ✅ resolved (user, 2026-06-21): trusted ≡ registered.** The central trusted-boards list (C2) **is** the registry — there is no separate "known boards" store. A board appears in the registry exactly when it's trusted; the sidebar *Boards* tab (US-751) edits that list directly via a context-menu **Remove board**, where *remove ≡ untrust*. **Remaining detail (carve-time):** how scattered paths group into a sensible tree (common-prefix? per-`.persephone`-project node + a "loose boards" bucket?), and pruning a moved/deleted board (e.g. mark missing, offer remove).
- **C4 — Fate of `.persephone` project trust. ✅ decided (user, 2026-06-21): a bulk action, not standing trust.** Per-board trust is the only authority. The old project-level gate is redesigned into a **"Trust all boards in this project"** convenience: it enumerates the boards that exist in that `.persephone` project **at that moment** and adds each as its own entry in the trusted-boards registry (C2). It is **not** a blanket grant — it confers nothing on boards added later. So if a user copies a **new** board folder into the project afterward, that board is **untrusted**, and opening it shows the trust dialog. (Implication: `ExplorerSecondaryView`'s current auto-trust-on-`.persephone`-create becomes "register/trust the boards present," and the gate moves to the board, not the project.)
- **C5 — Autonomy vs the trust gate. ✅ decided (user, 2026-06-21): Persephone-created boards are auto-trusted.** Any board created **through Persephone's own create API** — `createBoard` / `createDemoBoard`, whether invoked by the user *or* by an agent over MCP — is added to the trusted-boards registry **at creation time**. So an agent can create → open → develop a board headless, with **no trust gate**. Rationale: the gate exists to stop *unknown/foreign* code from running, and an agent that can already execute arbitrary code (e.g. Claude Code's Bash tool) gains nothing by being blocked from creating an auto-trusted board it authored itself — the trust step would be pure friction with no security value. **Consistent with C2:** auto-trust is *Persephone writing the registry* based on provenance it controls (the board was created via its own API), **not** the board self-declaring trust via a manifest field — that remains forbidden. The gate therefore applies only to **boards Persephone did not create**: a foreign folder opened via the Explorer affordance (US-749) or a `persephone-board://` link (US-748) pointing at a path not yet in the registry.
- **C6 — File-extension registration security. ✅ decided in principle (user, 2026-06-21); out of scope for this epic.** When a manifest can register file extensions (the Custom Editor axis), registration is **trusted-boards-only** — an untrusted board's manifest is **not acted upon** in any way (no extension registration, no autorun). Boundary to honor in the successor epic: this is about *active* manifest behaviors; **passive identity is still allowed** — US-749 reads a foreign board's manifest only to recognize it and offer "open," which then triggers the trust dialog. Precedence against built-in editors is a successor-epic detail. **Deferred to the Custom Editor follow-on (C8).**
- **C7 — Explorer affordance = a trailing row-action button, NOT click-interception. ✅ decided (user, 2026-06-21).** Clicking the `board-manifest.json` row keeps its **normal behavior** — it opens the JSON in Monaco. The "open board" affordance is a **separate icon button on that file-tree row**, **right-edge aligned**, with **`BoardIcon`** and an **"Open Board"** tooltip; clicking *the button* opens the board (or shows the trust-gate dialog if the board isn't trusted yet). This is **distinct** from the `.persephone`/`.git`/`.mneme` folder-click precedent (those *replace* the default open) — here we need a **per-row trailing action**, so the carve-time work is wiring a row-action slot in the Explorer file tree (`ExplorerSecondaryView` / its tree-row renderer), not a click handler.
- **C8 — "Custom Editor" scope boundary. ✅ decided (user, 2026-06-21): successor epic.** The file-extension / Custom-Editor generalization (registering extensions, routing a matching file into a board, passing a `filePath` in for *editing*) is **out of scope** here and lands in a **follow-on epic**. This epic delivers portability + manifest identity + board-level trust + open-by-link + MCP + sidebar. US-748's param forwarding leaves the seam in place so the successor is unblocked.

## Future axis — "Custom Editor" (successor epic, out of scope here)

The throughline the user named: propagate board functionality into **custom editors**. Once a board can be opened by link with a forwarded `filePath` (US-748) and identified by a manifest (US-745), a board can become the editor for a *file type*:

- Manifest `fileExtensions: [".foo"]` → opening a `.foo` file routes to the board, with the file path forwarded in.
- The board reads/writes the file via `execute()` (already its data channel) or a future scoped file API.
- Gated by trust (C6) and editor-precedence rules.

Captured here as the destination, but **out of scope for this epic** — it lands in a **successor epic** (C6, C8). Extension registration there is **trusted-boards-only**; an untrusted board's manifest is never acted upon (C6).

## Relationship to EPIC-034

EPIC-034 left two of these explicitly as **Future directions**, now promoted here:
- *"Open a board via a `board://` URI"* → US-748 (renamed scheme per C1).
- *Portability / more board types* → US-745 + US-746.

Everything else (board-level trust, MCP lifecycle, sidebar tree, manifest identity, Custom Editor) is new in this epic.

## Notes

### 2026-06-21 — epic opened in Planning
- Structured the user's seven ideas into candidate tasks US-745…US-751 + a Custom Editor future axis.
- Two design constraints fixed up front: **C1** (open-link scheme must not be `board://`) and **C2** (trust never sourced from the manifest).
- Central tension flagged: **C5** — headless agent authoring vs. the human trust gate. *(Initial leaning was "develop ≠ run"; **superseded** by the C5 resolution below — Persephone-created boards are auto-trusted at creation, so the gate never fires on them.)*
- Kept in **Planning**; awaiting user refinement before any task is carved or implemented.

### 2026-06-21 — registered ≡ trusted; board management in the sidebar (user)
- **Trusted ≡ Registered**: the trusted-boards list *is* the registry; the sidebar *Boards* tab (US-751) shows only trusted boards and edits that list directly — a context-menu **Remove board** untrusts it. This resolves **C3** (no separate known-boards store).
- **No separate editor.** A dedicated Registered-Boards editor (briefly a US-752) was **dropped** as unnecessary — open / pin / remove all live in the "Tools & Editors" sidebar *Boards* tab.

### 2026-06-21 — concerns resolved (user)
- **C1** ✅ open-link scheme = **`persephone-board://`** (sibling of `persephone-folder://`; `board://` stays the webview file protocol).
- **C2** ✅ trust source = central **trusted-boards registry** in `<userData>/persephone/data/` (next to settings / recent files); **never** a manifest field.
- **C4** ✅ project trust → **"Trust all boards in this project"** bulk action (registers boards present now; no standing grant for future ones).
- **C5** ✅ boards created via Persephone's `createBoard`/`createDemoBoard` (user or agent) are **auto-trusted at creation** — the agent loop never hits the gate; gate reserved for foreign boards. Consistent with C2 (provenance-based registry write, not manifest self-declaration).
- **C6** ✅ extension registration = **trusted-boards-only**; an untrusted manifest is never *acted upon* (passive identity for "open" is still allowed). **Out of scope** — successor epic.
- **C7** ✅ Explorer affordance = a **right-edge trailing row button** (`BoardIcon`, "Open Board") on the `board-manifest.json` row; row click still opens Monaco. **Not** folder-click interception — needs a per-row action slot in the tree-row renderer.
- **C8** ✅ the **Custom Editor** axis (extension routing, file-as-input) is a **successor epic**; this epic stops at portability + manifest + trust + open-by-link + MCP + sidebar. US-748 leaves the seam.
- **All concerns resolved.** Epic remains in **Planning** for task carving when the user is ready.
