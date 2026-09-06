/**
 * Accessibility snapshot for browser automation.
 *
 * Converts CDP accessibility trees into Playwright-compatible YAML snapshots.
 * Supports composite snapshots with iframe content via Target.attachToTarget + sessionId.
 *
 * Ref format:
 * - Main frame: [ref=e123]
 * - Iframe #1:  [ref=f1-e456]
 * - Iframe #2:  [ref=f2-e789]
 */
import type { CdpSession } from "./CdpSession";
import { setFrameSessions } from "./ref";

// ── Types ───────────────────────────────────────────────────────────

interface AXNode {
    nodeId: string;
    backendDOMNodeId?: number;
    parentId?: string;
    childIds?: string[];
    ignored?: boolean;
    role?: { value: string };
    name?: { value: string };
    properties?: Array<{ name: string; value: { value: unknown } }>;
}

interface IframeTarget {
    targetId: string;
    url: string;
}

interface IframeSnapshot {
    frameIndex: number;
    sessionId: string;
    snapshot: string;
    url: string;
}

// ── Constants ───────────────────────────────────────────────────────

/** Roles to skip — non-semantic wrappers that add noise. */
const SKIP_ROLES = new Set(["none", "generic", "InlineTextBox", "LineBreak"]);

/** Minimum AX node count for an iframe to be included (skip empty/placeholder iframes). */
const MIN_IFRAME_NODES = 3;

// ── Public API ──────────────────────────────────────────────────────

/**
 * Build a composite accessibility snapshot including iframe content.
 *
 * 1. Gets main frame AX tree
 * 2. Discovers iframe targets via Target.getTargets()
 * 3. Attaches to each iframe, gets its AX tree with frame-scoped refs
 * 4. Merges iframe content under Iframe placeholder nodes in the main snapshot
 * 5. Updates frameSessionMap for ref resolution
 */
export async function buildSnapshot(cdp: CdpSession): Promise<string> {
    // 1. Main frame AX tree
    const mainTree = await cdp.send("Accessibility.getFullAXTree");
    const mainLines = formatAccessibilityTree(mainTree.nodes || [], "");

    // 2. Discover iframe targets
    const iframeTargets = await getIframeTargets(cdp);
    if (iframeTargets.length === 0) {
        setFrameSessions(cdp.registrationKey, new Map());
        return mainLines;
    }

    // 3. Get AX tree for each iframe
    const iframeSnapshots: IframeSnapshot[] = [];
    const sessionMap = new Map<number, string>();

    for (let i = 0; i < iframeTargets.length; i++) {
        const result = await getIframeAXTree(cdp, iframeTargets[i].targetId);
        if (!result || result.nodes.length < MIN_IFRAME_NODES) continue;

        const frameIndex = i + 1;
        const framePrefix = `f${frameIndex}`;
        const frameSnapshot = formatAccessibilityTree(result.nodes, framePrefix);
        if (frameSnapshot.trim()) {
            iframeSnapshots.push({
                frameIndex,
                sessionId: result.sessionId,
                snapshot: frameSnapshot,
                url: iframeTargets[i].url,
            });
            sessionMap.set(frameIndex, result.sessionId);
        }
    }

    // Update frameSessionMap for ref resolution
    setFrameSessions(cdp.registrationKey, sessionMap);

    if (iframeSnapshots.length === 0) return mainLines;

    // 4. Merge iframe content into main snapshot
    return mergeSnapshots(mainLines, iframeSnapshots);
}

/**
 * Detect modal overlays/popups that may block interaction.
 * Returns a hint string if detected, null otherwise.
 */
export async function detectOverlay(cdp: CdpSession): Promise<string | null> {
    return await cdp.evaluate(`(() => {
        const dialog = document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]');
        if (dialog) return 'Modal dialog detected: ' + (dialog.getAttribute('aria-label') || 'unnamed');
        const vw = window.innerWidth, vh = window.innerHeight;
        const center = document.elementFromPoint(vw / 2, vh / 2);
        if (center) {
            const s = getComputedStyle(center);
            if ((s.position === 'fixed' || s.position === 'absolute') && parseInt(s.zIndex) > 1000) {
                const r = center.getBoundingClientRect();
                if (r.width > vw * 0.5 && r.height > vh * 0.5) {
                    return 'Overlay detected: ' + (center.getAttribute('aria-label') || center.className?.split(' ')[0] || 'unnamed');
                }
            }
        }
        return null;
    })()`);
}

/**
 * Format a single frame's AX tree into YAML.
 * Kept as public export for backward compatibility (used by BrowserEditorFacade.snapshot()).
 */
export function formatAccessibilityTree(nodes: AXNode[], framePrefix = ""): string {
    const map = new Map<string, AXNode>();
    for (const n of nodes) map.set(n.nodeId, n);

    const root = nodes[0];
    if (!root) return "";

    const lines: string[] = [];
    formatNode(root, 0, map, lines, framePrefix);
    return lines.join("\n");
}

// ── Iframe Discovery ────────────────────────────────────────────────

async function getIframeTargets(cdp: CdpSession): Promise<IframeTarget[]> {
    try {
        const { targetInfos } = await cdp.send("Target.getTargets");
        return (targetInfos || [])
            .filter((t: any) => t.type === "iframe") // eslint-disable-line @typescript-eslint/no-explicit-any
            .map((t: any) => ({ targetId: t.targetId, url: t.url || "" })); // eslint-disable-line @typescript-eslint/no-explicit-any
    } catch {
        return [];
    }
}

async function getIframeAXTree(
    cdp: CdpSession,
    targetId: string,
): Promise<{ nodes: AXNode[]; sessionId: string } | null> {
    try {
        // Detach first in case already attached from a previous snapshot
        try { await cdp.send("Target.detachFromTarget", { targetId }); } catch { /* ignore */ }
        const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
        const tree = await cdp.send("Accessibility.getFullAXTree", {}, sessionId);
        return { nodes: tree.nodes || [], sessionId };
    } catch {
        return null;
    }
}

// ── Snapshot Merging ────────────────────────────────────────────────

/**
 * Merge iframe snapshots into the main snapshot.
 * Finds `- Iframe "..." [ref=eN]` lines and injects iframe content indented below.
 * Unmatched iframe snapshots are appended at the end.
 */
function mergeSnapshots(mainSnapshot: string, iframeSnapshots: IframeSnapshot[]): string {
    const mainLines = mainSnapshot.split("\n");
    const used = new Set<number>();
    const result: string[] = [];

    for (const line of mainLines) {
        result.push(line);

        // Check if this line is an Iframe placeholder
        const iframeMatch = line.match(/^(\s*)- Iframe/);
        if (iframeMatch && iframeSnapshots.length > used.size) {
            // Match to the next unused iframe snapshot (in order)
            const nextIdx = iframeSnapshots.findIndex((_, i) => !used.has(i));
            if (nextIdx >= 0) {
                used.add(nextIdx);
                const indent = iframeMatch[1] + "  "; // 2 spaces deeper
                const iframeLines = iframeSnapshots[nextIdx].snapshot.split("\n");
                for (const iframeLine of iframeLines) {
                    if (iframeLine.trim()) {
                        result.push(indent + iframeLine);
                    }
                }
            }
        }
    }

    // Append any unmatched iframe snapshots at the end
    for (let i = 0; i < iframeSnapshots.length; i++) {
        if (used.has(i)) continue;
        const snap = iframeSnapshots[i];
        result.push(`- Iframe [frame=${snap.frameIndex}] (${snap.url}):`);
        const iframeLines = snap.snapshot.split("\n");
        for (const iframeLine of iframeLines) {
            if (iframeLine.trim()) {
                result.push("  " + iframeLine);
            }
        }
    }

    return result.join("\n");
}

// ── Node Formatting ─────────────────────────────────────────────────

function formatNode(
    node: AXNode,
    indent: number,
    map: Map<string, AXNode>,
    lines: string[],
    framePrefix: string,
): void {
    if (!node) return;

    const role = node.role?.value || "";

    // Skip non-semantic wrapper nodes — process children at same indent
    // Check this BEFORE ignored, because ignored wrappers still have meaningful children
    if (SKIP_ROLES.has(role) || role === "RootWebArea") {
        for (const id of node.childIds || []) {
            const child = map.get(id);
            if (child) formatNode(child, indent, map, lines, framePrefix);
        }
        return;
    }

    // Skip ignored nodes (after SKIP_ROLES check — ignored wrappers still have children)
    if (node.ignored) return;

    // Skip StaticText if a semantic ancestor already carries text in its name
    // Walk up through ignored/skipped wrapper nodes to find the real parent
    if (role === "StaticText") {
        let ancestor = node.parentId ? map.get(node.parentId) : undefined;
        while (ancestor) {
            const aRole = ancestor.role?.value || "";
            if (!SKIP_ROLES.has(aRole) && aRole !== "RootWebArea" && !ancestor.ignored) {
                if (ancestor.name?.value) return; // semantic parent has a name — skip this text
                break;
            }
            ancestor = ancestor.parentId ? map.get(ancestor.parentId) : undefined;
        }
    }

    // Build the line
    let line = " ".repeat(indent) + "- " + role;

    const name = node.name?.value;
    if (name) line += ` "${name}"`;

    // Add useful properties
    const props = node.properties || [];
    for (const p of props) {
        if (p.name === "level" && p.value.value != null) {
            line += ` [level=${p.value.value}]`;
        }
        if (p.name === "checked" && p.value.value === true) {
            line += " [checked]";
        }
        if (p.name === "expanded" && p.value.value != null) {
            line += p.value.value ? " [expanded]" : " [collapsed]";
        }
        if (p.name === "required" && p.value.value === true) {
            line += " [required]";
        }
        if (p.name === "disabled" && p.value.value === true) {
            line += " [disabled]";
        }
    }

    // Add ref with frame prefix (main frame: e123, iframe: f1-e456)
    if (node.backendDOMNodeId) {
        const ref = framePrefix
            ? `${framePrefix}-e${node.backendDOMNodeId}`
            : `e${node.backendDOMNodeId}`;
        line += ` [ref=${ref}]`;
    }

    // Add value for inputs, selects, textareas
    const valueProp = props.find(p => p.name === "value");
    if (valueProp?.value?.value != null && String(valueProp.value.value)) {
        line += `: "${valueProp.value.value}"`;
    }

    lines.push(line);

    // Process children with increased indent
    for (const id of node.childIds || []) {
        const child = map.get(id);
        if (child) formatNode(child, indent + 2, map, lines, framePrefix);
    }
}
