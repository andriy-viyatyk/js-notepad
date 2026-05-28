// ============================================================================
// Well-Known Pages — singleton pages with predefined IDs
// ============================================================================
//
// Well-known pages are pages that should exist as a single instance.
// They have a fixed ID, editor, language, and title defined here.
// Use `pagesModel.requireWellKnownPage(id)` to get-or-create:
//   - If a page with this ID exists → focuses and returns it
//   - If not → creates a new page with the predefined config
//
// See doc/architecture/pages-architecture.md for details.
// ============================================================================

export interface WellKnownPageDef {
    id: string;
    title: string;
    editor: string;
    language: string;
}

const definitions = new Map<string, WellKnownPageDef>();

export function registerWellKnownPage(def: WellKnownPageDef): void {
    definitions.set(def.id, def);
}

export function getWellKnownPageDef(id: string): WellKnownPageDef | undefined {
    return definitions.get(id);
}

// ── Registrations ──────────────────────────────────────────────────

// MCP ui_push log — shared between mcp-handler and ScriptContext
registerWellKnownPage({
    id: "mcp-ui-log",
    editor: "log-view",
    language: "jsonl",
    title: "MCP Log.log.jsonl",
});

// MCP server request log (for )
registerWellKnownPage({
    id: "mcp-server-log",
    editor: "log-view",
    language: "jsonl",
    title: "MCP Server Log.log.jsonl",
});
