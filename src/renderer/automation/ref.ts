/**
 * Centralized ref resolution for browser automation.
 *
 * Refs from accessibility snapshots:
 * - Main frame: [ref=e123] where 123 is backendDOMNodeId
 * - Iframe #1:  [ref=f1-e456] where 1 is frame index, 456 is backendDOMNodeId
 *
 * Frame-scoped refs use sessionId (from Target.attachToTarget) to resolve
 * in the correct iframe context via CDP DOM.resolveNode + Runtime.callFunctionOn.
 */
import type { CdpSession } from "./CdpSession";
import { errMessage } from "../../shared/utils";

// ── Frame Session Map ───────────────────────────────────────────────

/**
 * Map from CDP registration key to frame-index maps. Each snapshot replaces the map for the
 * host that produced it, while maps for other browser tabs, board frames, and the app window stay
 * available for refs minted by those hosts.
 */
const frameSessionMaps = new Map<string, Map<number, string>>();

/** Update the frame session map. Called by buildSnapshot() after attaching to iframes. */
export function setFrameSessions(registrationKey: string, map: Map<number, string>): void {
    frameSessionMaps.set(registrationKey, map);
}

// ── Ref Parsing ─────────────────────────────────────────────────────

/** Parsed ref with optional frame scope. */
export interface ParsedRef {
    /** Frame index (null = main frame, 1+ = iframe). */
    frameIndex: number | null;
    /** CDP backendDOMNodeId within the frame. */
    backendNodeId: number;
}

/**
 * Parse a ref string to frame index + backendNodeId.
 * - "e123" → { frameIndex: null, backendNodeId: 123 }
 * - "f1-e456" → { frameIndex: 1, backendNodeId: 456 }
 */
export function parseRef(ref: string): ParsedRef {
    if (ref.includes("-")) {
        const [framePart, nodePart] = ref.split("-");
        const frameIndex = parseInt(framePart.replace(/^f/, ""), 10);
        const backendNodeId = parseInt(nodePart.replace(/^e/, ""), 10);
        if (isNaN(frameIndex) || isNaN(backendNodeId)) {
            throw new Error(`Invalid ref "${ref}". Expected format: f1-e123`);
        }
        return { frameIndex, backendNodeId };
    }
    const backendNodeId = parseInt(ref.replace(/^e/, ""), 10);
    if (isNaN(backendNodeId)) {
        throw new Error(`Invalid ref "${ref}". Expected format: e123`);
    }
    return { frameIndex: null, backendNodeId };
}

function getFrameSessionId(cdp: CdpSession, ref: string, frameIndex: number): string {
    const frameSessionMap = frameSessionMaps.get(cdp.registrationKey);
    if (!frameSessionMap) {
        throw new Error(
            `No frame-session map is available for ref "${ref}" on this host. `
            + "Take a snapshot on this host before using iframe refs.",
        );
    }

    const sessionId = frameSessionMap.get(frameIndex);
    if (sessionId) return sessionId;

    const frameCount = frameSessionMap.size;
    const frameLabel = frameCount === 1 ? "frame" : "frames";
    throw new Error(
        `Ref "${ref}" names frame ${frameIndex}, but the last snapshot of this host had `
        + `${frameCount} ${frameLabel}. The iframe may have been removed — re-take the snapshot `
        + "and use a ref from it.",
    );
}

// ── Ref Resolution ──────────────────────────────────────────────────

/**
 * Resolve a ref to a CDP remote object ID.
 * For frame-scoped refs, uses the sessionId from frameSessionMap.
 * Throws with a helpful message if the ref is stale.
 */
export async function resolveRef(cdp: CdpSession, ref: string): Promise<string> {
    const { frameIndex, backendNodeId } = parseRef(ref);
    const sessionId = frameIndex !== null ? getFrameSessionId(cdp, ref, frameIndex) : undefined;

    try {
        const { object } = await cdp.send("DOM.resolveNode", { backendNodeId }, sessionId);
        if (!object?.objectId) {
            throw new Error(
                `Could not resolve ref "${ref}". The element may have been removed. Re-take the snapshot.`,
            );
        }
        return object.objectId;
    } catch (err: unknown) {
        const msg = errMessage(err);
        // CDP has two spellings for "this id is not usable here", and they mean different
        // things to the caller: the node is gone, or the node belongs to a different document —
        // which is what a ref minted in one frame or tab and used against another produces.
        // Both are recovered the same way, and neither may reach the agent as a raw
        // `Error invoking remote method 'browser:cdp-send'` string.
        if (msg.includes("does not belong to the document")) {
            throw new Error(
                `Ref "${ref}" belongs to a different document — it was taken from another frame or `
                + "tab than the one being acted on. Take a snapshot of this one and use a ref from it.",
            );
        }
        if (msg.includes("No node with given id")) {
            throw new Error(
                `Ref "${ref}" is stale — the element is no longer in the DOM. Re-take the snapshot.`,
            );
        }
        throw err;
    }
}

/**
 * Resolve a ref and call a function on the resolved DOM element.
 * The function receives `this` bound to the element.
 * For frame-scoped refs, the function executes in the iframe's JS context.
 *
 * `fn` must be a plain `function () {…}` expression — it is invoked with `.call(element)`, so an
 * arrow function would keep its lexical `this` and silently act on the wrong object.
 *
 * `fn` must also stay code authored in this repo. It is interpolated into the function declaration
 * sent to the page, so a body built from agent- or user-supplied input would be an injection
 * surface. Callers embed untrusted values with `JSON.stringify` (see `fillInput` in `input.ts`)
 * rather than concatenating them into the body.
 */
export async function callOnRef(
    cdp: CdpSession,
    ref: string,
    fn: string,
    returnByValue = false,
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const { frameIndex } = parseRef(ref);
    const sessionId = frameIndex !== null ? getFrameSessionId(cdp, ref, frameIndex) : undefined;
    const objectId = await resolveRef(cdp, ref);

    // A ref is a backendDOMNodeId, and a StaticText node's id backs a DOM *text* node — which has
    // none of the Element methods every caller body uses (scrollIntoView/click/focus/value/...).
    // In a list of roleless <div>s the StaticText ref is often the only ref on the row, so those
    // rows would be unclickable by ref at all. Coerce to the element that displays the text: it is
    // what the snapshot line denotes, and since DOM events bubble, acting on the inner element
    // still reaches a handler bound to the row around it.
    const notAnElement = JSON.stringify(`Ref "${ref}" resolved to a `);
    const noParent = JSON.stringify(" node with no element parent. Re-take the snapshot.");
    const wrapped = `function() {
        const el = this.nodeType === 1 ? this : this.parentElement;
        if (!el) throw new Error(${notAnElement} + this.nodeName + ${noParent});
        return (${fn}).call(el);
    }`;

    const result = await cdp.send("Runtime.callFunctionOn", {
        objectId,
        functionDeclaration: wrapped,
        returnByValue,
        awaitPromise: true,
    }, sessionId);

    if (result.exceptionDetails) {
        const errMsg = result.exceptionDetails.exception?.description
            || result.exceptionDetails.text
            || "callOnRef failed";
        throw new Error(errMsg);
    }
    return returnByValue ? result.result?.value : result;
}
