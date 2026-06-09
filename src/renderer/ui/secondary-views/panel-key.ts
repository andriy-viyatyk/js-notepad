// =============================================================================
// Panel-key helpers (US-619).
//
// A *rendered* secondary-view panel's identity is the composite of its owning
// editor id and its panel-type id: `${editorId}::${panelId}`. This lets two
// models contribute the same panel type (e.g. two git repos each contributing
// "git-changes") and have the sidebar render both as independently-expandable
// panels — the uniqueness comes from model identity, owned by the sidebar, not
// minted into the model's declared panel id.
//
// Editor ids are UUIDs and panel-type ids are kebab-case; neither contains
// "::", so it is an unambiguous separator. The model-facing API
// (`expandPanel`, `onPanelExpanded`, the `panelExpanded` event) keeps using the
// BARE panel id — only the sidebar's `activePanel` storage + accordion keys use
// the composite.
// =============================================================================

const SEP = "::";

/** Compose a rendered panel's unique key from its owning editor id + panel-type id. */
export function panelKey(editorId: string, panelId: string): string {
    return `${editorId}${SEP}${panelId}`;
}

/** Split a composite key. A bare id (no separator — a legacy/seed value like
 *  "explorer") parses to `{ editorId: "", panelId: <bare> }`. */
export function parsePanelKey(key: string): { editorId: string; panelId: string } {
    const i = key.indexOf(SEP);
    if (i < 0) return { editorId: "", panelId: key };
    return { editorId: key.slice(0, i), panelId: key.slice(i + SEP.length) };
}

/** The bare panel-type id of a composite key (or the key itself if already bare). */
export function panelIdOf(key: string): string {
    return parsePanelKey(key).panelId;
}

/** Whether a key is already in composite form. */
export function isCompositePanelKey(key: string): boolean {
    return key.includes(SEP);
}
