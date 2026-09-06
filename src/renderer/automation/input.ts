/**
 * Keyboard input for browser automation.
 *
 * Text input strategy (Electron <webview> limitation):
 * CDP Input.dispatchKeyEvent / Input.insertText do NOT work in Electron <webview>
 * elements — the events don't cross the guest process boundary. This is a known
 * limitation confirmed by Electron, Playwright, and Puppeteer issue trackers.
 *
 * Instead we use:
 * - <input>/<textarea>: el.value = text (atomic focus+fill in single evaluate)
 * - contentEditable: selectAll + target.insertText() via Electron's webview.insertText()
 * - pressKey: JS KeyboardEvent dispatch via Runtime.evaluate
 *
 * Key layout derived from Playwright's USKeyboardLayout
 * (Apache 2.0, originally from Puppeteer/Google).
 */
import type { CdpSession } from "./CdpSession";
import { callOnRef } from "./ref";
import type { IBrowserTarget } from "./types";

// ── Key Definitions ─────────────────────────────────────────────────

interface KeyDefinition {
    key: string;
    keyCode: number;
    code: string;
    text?: string;
    location?: number;
}

const KEY_DEFINITIONS: Record<string, KeyDefinition> = {
    // Function keys
    "Escape":    { key: "Escape", keyCode: 27, code: "Escape" },
    "F1":        { key: "F1", keyCode: 112, code: "F1" },
    "F2":        { key: "F2", keyCode: 113, code: "F2" },
    "F3":        { key: "F3", keyCode: 114, code: "F3" },
    "F4":        { key: "F4", keyCode: 115, code: "F4" },
    "F5":        { key: "F5", keyCode: 116, code: "F5" },
    "F6":        { key: "F6", keyCode: 117, code: "F6" },
    "F7":        { key: "F7", keyCode: 118, code: "F7" },
    "F8":        { key: "F8", keyCode: 119, code: "F8" },
    "F9":        { key: "F9", keyCode: 120, code: "F9" },
    "F10":       { key: "F10", keyCode: 121, code: "F10" },
    "F11":       { key: "F11", keyCode: 122, code: "F11" },
    "F12":       { key: "F12", keyCode: 123, code: "F12" },

    // Control keys
    "Backspace": { key: "Backspace", keyCode: 8, code: "Backspace" },
    "Tab":       { key: "Tab", keyCode: 9, code: "Tab" },
    "Enter":     { key: "Enter", keyCode: 13, code: "Enter", text: "\r" },
    " ":         { key: " ", keyCode: 32, code: "Space", text: " " },
    "Space":     { key: " ", keyCode: 32, code: "Space", text: " " },
    "Delete":    { key: "Delete", keyCode: 46, code: "Delete" },
    "Insert":    { key: "Insert", keyCode: 45, code: "Insert" },

    // Navigation
    "Home":      { key: "Home", keyCode: 36, code: "Home" },
    "End":       { key: "End", keyCode: 35, code: "End" },
    "PageUp":    { key: "PageUp", keyCode: 33, code: "PageUp" },
    "PageDown":  { key: "PageDown", keyCode: 34, code: "PageDown" },
    "ArrowLeft": { key: "ArrowLeft", keyCode: 37, code: "ArrowLeft" },
    "ArrowUp":   { key: "ArrowUp", keyCode: 38, code: "ArrowUp" },
    "ArrowRight":{ key: "ArrowRight", keyCode: 39, code: "ArrowRight" },
    "ArrowDown": { key: "ArrowDown", keyCode: 40, code: "ArrowDown" },

    // Modifiers
    "Shift":     { key: "Shift", keyCode: 16, code: "ShiftLeft", location: 1 },
    "Control":   { key: "Control", keyCode: 17, code: "ControlLeft", location: 1 },
    "Alt":       { key: "Alt", keyCode: 18, code: "AltLeft", location: 1 },
    "Meta":      { key: "Meta", keyCode: 91, code: "MetaLeft", location: 1 },
};

// Generate a-z and A-Z
for (let i = 0; i < 26; i++) {
    const lower = String.fromCharCode(97 + i);
    const upper = String.fromCharCode(65 + i);
    const code = `Key${upper}`;
    const keyCode = 65 + i;
    KEY_DEFINITIONS[lower] = { key: lower, keyCode, code, text: lower };
    KEY_DEFINITIONS[upper] = { key: upper, keyCode, code, text: upper };
}

// Generate 0-9
for (let i = 0; i < 10; i++) {
    const d = String(i);
    KEY_DEFINITIONS[d] = { key: d, keyCode: 48 + i, code: `Digit${d}`, text: d };
}

// Common punctuation
const PUNCTUATION: Array<[string, number, string]> = [
    [";", 186, "Semicolon"], ["=", 187, "Equal"], [",", 188, "Comma"],
    ["-", 189, "Minus"], [".", 190, "Period"], ["/", 191, "Slash"],
    ["`", 192, "Backquote"], ["[", 219, "BracketLeft"],
    ["\\", 220, "Backslash"], ["]", 221, "BracketRight"],
    ["'", 222, "Quote"],
];
for (const [key, keyCode, code] of PUNCTUATION) {
    KEY_DEFINITIONS[key] = { key, keyCode, code, text: key };
}

// ── Helpers ─────────────────────────────────────────────────────────

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

function resolveKey(key: string): KeyDefinition {
    return KEY_DEFINITIONS[key] || { key, keyCode: 0, code: "", text: undefined };
}

/**
 * Element type returned by focusElement().
 * - "input": <input> — can use el.value = text reliably
 * - "textarea": <textarea> — frameworks may ignore .value, use webview.insertText()
 * - "contentEditable": contentEditable div — use webview.insertText()
 */
type ElementKind = "input" | "textarea" | "contentEditable" | "unknown";

// ── Public API ──────────────────────────────────────────────────────

/**
 * Press a single key or key combination via JS KeyboardEvent dispatch.
 *
 * Supports:
 * - Simple keys: "Enter", "Tab", "Backspace", "a", "1"
 * - Compound keys: "Control+a", "Shift+Enter", "Control+Shift+Delete"
 *
 * NOTE: CDP Input.dispatchKeyEvent does NOT work in Electron <webview>.
 * JS KeyboardEvent dispatch covers form navigation and shortcuts.
 */
export async function pressKey(cdp: CdpSession, key: string): Promise<void> {
    const parts = key.split("+");
    const mainKey = parts.pop()!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const modifiers = new Set(parts.filter(p => MODIFIER_KEYS.has(p)));

    const def = resolveKey(mainKey);
    const ctrlKey = modifiers.has("Control");
    const shiftKey = modifiers.has("Shift");
    const altKey = modifiers.has("Alt");
    const metaKey = modifiers.has("Meta");

    await cdp.evaluate(`(() => {
        const el = document.activeElement || document.body;
        const opts = {
            key: ${JSON.stringify(def.key)},
            code: ${JSON.stringify(def.code)},
            keyCode: ${def.keyCode},
            which: ${def.keyCode},
            ctrlKey: ${ctrlKey},
            shiftKey: ${shiftKey},
            altKey: ${altKey},
            metaKey: ${metaKey},
            bubbles: true,
            cancelable: true,
        };
        el.dispatchEvent(new KeyboardEvent('keydown', opts));
        el.dispatchEvent(new KeyboardEvent('keypress', opts));
        el.dispatchEvent(new KeyboardEvent('keyup', opts));
    })()`);
}

/**
 * Focus an element by CSS selector (or by ref via callOnRef) and detect its type.
 * Returns the element kind so the caller knows which fill strategy to use.
 * Combines focus + detection in a single evaluate call to prevent focus interception.
 */
async function focusElementBySelector(cdp: CdpSession, selector: string): Promise<ElementKind> {
    const s = JSON.stringify(selector);
    return await cdp.evaluate(`(() => {
        // Find the best matching element — prefer visible ones when multiple match
        let el = document.querySelector(${s});
        if (!el) throw new Error('Element not found: ' + ${s});
        // If the first match is hidden, try to find a visible alternative
        if (el.offsetHeight === 0 || getComputedStyle(el).display === 'none') {
            const all = document.querySelectorAll(${s});
            for (const candidate of all) {
                if (candidate.offsetHeight > 0 && getComputedStyle(candidate).display !== 'none') {
                    el = candidate;
                    break;
                }
            }
        }
        el.scrollIntoView({ block: 'center' });
        el.focus();
        if (el.tagName === 'INPUT') return 'input';
        if (el.tagName === 'TEXTAREA') return 'textarea';
        if (el.isContentEditable) return 'contentEditable';
        return 'unknown';
    })()`);
}

/**
 * Focus an element by ref (backendDOMNodeId) and detect its type.
 */
async function focusElementByRef(cdp: CdpSession, ref: string): Promise<ElementKind> {
    return await callOnRef(cdp, ref, `function() {
        this.scrollIntoView({ block: 'center' });
        this.focus();
        if (this.tagName === 'INPUT') return 'input';
        if (this.tagName === 'TEXTAREA') return 'textarea';
        if (this.isContentEditable) return 'contentEditable';
        return 'unknown';
    }`, true) || "unknown";
}

/**
 * Fill an <input> or <textarea> with text via direct value assignment.
 * Uses atomic focus+fill in a single evaluate call to prevent focus interception.
 * For <textarea>, uses the native prototype setter to bypass framework interception
 * (e.g., Gmail ignores regular .value assignment on its textarea).
 */
async function fillInput(cdp: CdpSession, selector: string | undefined, ref: string | undefined, text: string): Promise<void> {
    const t = JSON.stringify(text);
    // JS snippet that sets value using native prototype setter (bypasses framework interception)
    // and dispatches InputEvent (not just Event) to trigger framework change detection
    const fillCode = `
        this.scrollIntoView({ block: 'center' });
        this.focus();
        const proto = this.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        nativeSetter.call(this, ${t});
        this.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${t} }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
    `;
    if (selector) {
        const s = JSON.stringify(selector);
        await cdp.evaluate(`(() => {
            const el = document.querySelector(${s});
            if (!el) throw new Error('Element not found: ' + ${s});
            (function() { ${fillCode} }).call(el);
        })()`);
    } else if (ref) {
        await callOnRef(cdp, ref, `function() { ${fillCode} }`);
    }
}

/**
 * Fill a <textarea> or contentEditable element via Electron's webview.insertText().
 * Selects all existing content first, then inserts new text.
 * The element must already be focused via focusElement.
 *
 * This is needed because:
 * - <textarea>: Frameworks (Gmail) may ignore programmatic .value changes
 * - contentEditable: .value doesn't exist, and Trusted Types may block DOM assignment
 * - webview.insertText() works like real typing at the Chromium level
 */
async function fillWithInsertText(
    cdp: CdpSession,
    target: IBrowserTarget,
    elementKind: ElementKind,
    text: string,
    tabId?: string,
): Promise<void> {
    // Select all existing content
    if (elementKind === "textarea") {
        await cdp.evaluate(`(() => {
            const el = document.activeElement;
            if (el && el.select) el.select();
        })()`);
    } else {
        await cdp.evaluate("document.execCommand('selectAll')");
    }
    if (text) {
        // Insert via Electron's native webview API (bypasses Trusted Types)
        await target.insertText(text, tabId);
    } else {
        await cdp.evaluate("document.execCommand('delete')");
    }
}

/**
 * Type text character by character via Electron's webview.insertText().
 * Used for "slowly" mode — triggers page key handlers for each character.
 * Works on both input/textarea and contentEditable.
 * The element must already be focused.
 */
async function typeSlowly(
    cdp: CdpSession,
    target: IBrowserTarget,
    elementKind: ElementKind,
    text: string,
    tabId?: string,
): Promise<void> {
    if (elementKind === "input" || elementKind === "textarea") {
        await cdp.evaluate(`(() => {
            const el = document.activeElement;
            if (el && el.select) el.select();
        })()`);
    } else {
        await cdp.evaluate("document.execCommand('selectAll')");
    }
    if (text) {
        // Type character by character via webview.insertText()
        for (const char of text) {
            await target.insertText(char, tabId);
        }
    } else {
        await cdp.evaluate("document.execCommand('delete')");
    }
}

// ── Unified Type Command ────────────────────────────────────────────

/** Options for the type command (matches Playwright MCP browser_type). */
export interface TypeOptions {
    /** CSS selector for the target element. */
    selector?: string;
    /** Element ref from accessibility snapshot (e.g. "e52"). */
    ref?: string;
    /** Text to type. */
    text: string;
    /** Target tab, defaulting to the active tab. */
    tabId?: string;
    /** Type one character at a time (triggers key handlers). Default: false (bulk fill). */
    slowly?: boolean;
    /** Press Enter after typing. Default: false. */
    submit?: boolean;
}

/**
 * Type text into an element — unified command matching Playwright MCP browser_type.
 *
 * Automatically detects element type and uses the appropriate strategy:
 * - <input>/<textarea> default: el.value = text (atomic, fast)
 * - <input>/<textarea> slowly: webview.insertText() char by char
 * - contentEditable default: selectAll + webview.insertText() (bulk)
 * - contentEditable slowly: webview.insertText() char by char
 *
 * @param target - Browser automation target (provides webview access)
 * @param options - Type options (selector/ref, text, slowly, submit)
 */
export async function typeText(target: IBrowserTarget, options: TypeOptions): Promise<void> {
    const { selector, ref, text, tabId, slowly, submit } = options;
    if (!selector && !ref) throw new Error("Missing 'selector' or 'ref' parameter");

    const cdp = target.cdp(tabId);

    // Ensure webview has Electron-level focus
    target.focusWebview(tabId);

    // Detect element type
    const elementKind = selector
        ? await focusElementBySelector(cdp, selector)
        : await focusElementByRef(cdp, ref!); // eslint-disable-line @typescript-eslint/no-non-null-assertion

    // Fill using the appropriate strategy
    if (slowly) {
        await typeSlowly(cdp, target, elementKind, text, tabId);
    } else if (elementKind === "input" || elementKind === "textarea") {
        // Atomic focus + value assignment via native setter (prevents focus interception)
        await fillInput(cdp, selector, ref, text);
    } else if (elementKind === "contentEditable") {
        await fillWithInsertText(cdp, target, elementKind, text, tabId);
    } else {
        // Unknown element — try value assignment as fallback
        await fillInput(cdp, selector, ref, text);
    }

    // Submit (press Enter) if requested
    if (submit) {
        await pressKey(cdp, "Enter");
    }
}
