import type { BoardFireMethod, BoardRpcMethod } from "./ipc/board-bridge-channels";
import { errMessage } from "./shared/utils";

export interface BoardContextMenuBridge {
    fire(method: BoardFireMethod, args: unknown[]): void;
    rpc(method: BoardRpcMethod, args: unknown[]): Promise<unknown>;
}


/** Install Persephone's built-in board context menu. */
export function installBoardContextMenu({ fire, rpc }: BoardContextMenuBridge): void {
    // Default context menu — a board lives on a locked-down `board://` origin with no access to
    // Persephone's native context menu, so right-click gets nothing by default. Provide a minimal
    // built-in menu so boards behave like other apps without any board code:
    //   • a link (the same external links routeExternalLinkClick opens) → "Open Link" / "Copy Link"
    //   • selected text → "Copy"
    // A board can render its OWN menu instead by calling preventDefault() on the contextmenu event
    // (bubble phase — a board handler on document/an element runs first), exactly like the Ctrl+S
    // and link-click opt-outs. The menu is a small themed popover drawn from the injected --p-* vars.
    interface CtxItem {
        label: string;
        action: () => void;
        /** Draw a divider line above this item (used to separate groups). */
        separator?: boolean;
    }

    let ctxMenuEl: HTMLDivElement | null = null;

    function copyText(text: string): void {
        try {
            // The board frame is granted clipboard-write (BoardWebview `allow`), and the menu click is
            // a user gesture, so writeText is permitted here. Best-effort — a blocked clipboard no-ops.
            if (navigator.clipboard && navigator.clipboard.writeText) void navigator.clipboard.writeText(text);
        } catch {
            // clipboard unavailable — nothing to do
        }
    }

    function blobToDataUrl(blob: Blob): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("Failed to read the image."));
            reader.readAsDataURL(blob);
        });
    }

    // Open an image in Persephone's Image Viewer in a NEW page (via openRawLink + the "image-view"
    // editor target — the same mechanism the built-in viewers use). A `data:`/`http(s)` src opens
    // directly; a `board://` or `blob:` src is frame-scoped (Persephone can't read it), so we fetch it
    // same-origin and hand over a `data:` URL instead.
    async function openImageInNewTab(src: string): Promise<void> {
        try {
            let href = src;
            if (src.startsWith("board://") || src.startsWith("blob:")) {
                const resp = await fetch(src);
                href = await blobToDataUrl(await resp.blob());
            }
            fire("openRawLink", [href, "image-view"]);
        } catch (e) {
            fire("notify", [`Failed to open image: ${errMessage(e)}`, "error"]);
        }
    }

    const MIME_EXT: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/gif": "gif",
        "image/webp": "webp",
        "image/bmp": "bmp",
        "image/svg+xml": "svg",
        "image/x-icon": "ico",
        "image/vnd.microsoft.icon": "ico",
    };

    // Draw the already-loaded <img> onto a canvas at natural size. Same-origin (data:/board://) images
    // aren't tainted; a cross-origin (http) image taints the canvas and later toBlob/toDataURL throws.
    function imgToCanvas(img: HTMLImageElement): HTMLCanvasElement {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) throw new Error("Image not ready.");
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable.");
        ctx.drawImage(img, 0, 0);
        return canvas;
    }

    // Copy an image to the clipboard as PNG — canvas rasterization, no network.
    async function copyImage(img: HTMLImageElement): Promise<void> {
        try {
            const canvas = imgToCanvas(img);
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
            if (!blob) throw new Error("Could not encode the image.");
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        } catch (e) {
            fire("notify", [`Failed to copy image: ${errMessage(e)}`, "error"]);
        }
    }

    const BASE64_OF = (dataUrl: string): string => {
        const comma = dataUrl.indexOf(",");
        return comma >= 0 ? dataUrl.slice(comma + 1) : "";
    };

    // Decode a data: URL into { base64, ext } WITHOUT fetch — the board CSP's `connect-src 'self'`
    // forbids fetching a data: URL (it raises ERR — the bug this fixes). base64 payloads are used
    // verbatim; a percent-encoded payload (e.g. inline SVG) is re-encoded to base64.
    function dataUrlToParts(src: string): { b64: string; ext: string } | null {
        const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(src);
        if (!m) return null;
        const mime = m[1] || "text/plain";
        const ext = MIME_EXT[mime] || (mime.split("/")[1] || "png").replace(/\+.*$/, "");
        try {
            return { b64: m[2] ? m[3] : btoa(decodeURIComponent(m[3])), ext };
        } catch {
            return null; // non-Latin1 percent-encoded payload — let the caller fall back
        }
    }

    // A sensible default file name for "Save Image As…": the source's own basename when it has one
    // (board:// / http paths), else `image.<ext>` (data: URLs carry no name).
    function suggestImageName(src: string, ext: string): string {
        try {
            if (src.startsWith("data:")) return "image." + ext;
            const base = new URL(src).pathname.split("/").pop() || "";
            if (/\.[a-z0-9]+$/i.test(base)) return base;
            return (base || "image") + "." + ext;
        } catch {
            return "image." + ext;
        }
    }

    // Save an image to disk via the native save dialog, then write the bytes through the bridge as
    // base64. Source resolution avoids anything the board CSP blocks: a data: URL is decoded directly;
    // board:// is same-origin so fetch is allowed (keeps the original format); anything else (or a
    // blocked/failed fetch) falls back to re-encoding the loaded <img> to PNG via canvas (no network).
    async function saveImageAs(img: HTMLImageElement, src: string): Promise<void> {
        try {
            let b64 = "";
            let ext = "png";
            const parts = src.startsWith("data:") ? dataUrlToParts(src) : null;
            if (parts) {
                b64 = parts.b64;
                ext = parts.ext;
            } else {
                try {
                    const blob = await (await fetch(src)).blob();
                    ext = MIME_EXT[blob.type] || "png";
                    b64 = BASE64_OF(await blobToDataUrl(blob));
                } catch {
                    // fetch blocked (data:/blob:/cross-origin) — re-encode the loaded image to PNG.
                    b64 = BASE64_OF(imgToCanvas(img).toDataURL("image/png"));
                    ext = "png";
                }
            }
            if (!b64) throw new Error("Could not read the image.");
            const path = (await rpc("saveFileDialog", [
                {
                    title: "Save Image",
                    defaultPath: suggestImageName(src, ext),
                    filters: [
                        { name: "Image", extensions: [ext] },
                        { name: "All Files", extensions: ["*"] },
                    ],
                },
            ])) as string | undefined;
            if (!path) return; // cancelled
            await rpc("writeFile", [path, b64, "base64"]);
            fire("notify", ["Image saved.", "success"]);
        } catch (e) {
            fire("notify", [`Failed to save image: ${errMessage(e)}`, "error"]);
        }
    }

    // ── Editable-field clipboard (Cut / Copy / Paste) ─────────────────────────────
    // Right-clicking a focused text field offers the usual clipboard actions. Native Ctrl+C/X/V
    // already work in a board input; this just exposes them on the menu. Restricted to text-like
    // inputs, textareas, and contenteditable — the types where setRangeText / selection is valid.

    const SELECTABLE_INPUT_TYPES = ["text", "search", "url", "tel", "password", ""];

    function editableTarget(node: Element | null): HTMLElement | null {
        const el = node && node.closest ? node.closest("input, textarea, [contenteditable]") : null;
        if (el instanceof HTMLInputElement) {
            return SELECTABLE_INPUT_TYPES.includes((el.type || "text").toLowerCase()) ? el : null;
        }
        if (el instanceof HTMLTextAreaElement) return el;
        if (el instanceof HTMLElement && el.isContentEditable) return el;
        return null;
    }

    function isReadonly(el: HTMLElement): boolean {
        return (
            (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
            (el.readOnly || el.disabled)
        );
    }

    /** The currently-selected text within an editable element. */
    function editableSelection(el: HTMLElement): string {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            return el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);
        }
        return window.getSelection()?.toString() ?? "";
    }

    function deleteSelection(el: HTMLElement): void {
        el.focus();
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            const start = el.selectionStart ?? 0;
            const end = el.selectionEnd ?? 0;
            if (start === end) return;
            el.setRangeText("", start, end, "end");
            el.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
            document.execCommand("delete");
        }
    }

    function insertIntoEditable(el: HTMLElement, text: string): void {
        el.focus();
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            const start = el.selectionStart ?? el.value.length;
            const end = el.selectionEnd ?? el.value.length;
            el.setRangeText(text, start, end, "end");
            el.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
            // contentEditable has no setRangeText equivalent — execCommand is the deliberate fallback
            // (formally deprecated but still the only in-place editing primitive in Chromium/Electron).
            document.execCommand("insertText", false, text);
        }
    }

    function copyEditable(el: HTMLElement): void {
        const text = editableSelection(el);
        if (text) copyText(text);
    }

    function cutEditable(el: HTMLElement): void {
        copyEditable(el);
        deleteSelection(el);
    }

    async function pasteEditable(el: HTMLElement): Promise<void> {
        try {
            const text = await navigator.clipboard.readText();
            if (text) insertIntoEditable(el, text);
        } catch (e) {
            fire("notify", [`Paste failed: ${errMessage(e)}`, "error"]);
        }
    }

    function ensureCtxMenu(): HTMLDivElement {
        if (ctxMenuEl) return ctxMenuEl;
        const el = document.createElement("div");
        el.setAttribute("data-persephone-menu", "");
        // position:fixed so body overflow can't clip it; z-index maxed so it floats over board content.
        // Themed with the injected --p-* vars (fallbacks match the board default dark chrome).
        el.style.cssText = [
            "position:fixed",
            "z-index:2147483647",
            "display:none",
            "flex-direction:column",
            "min-width:140px",
            "margin:0",
            "padding:4px",
            "background:var(--p-panel, #252526)",
            "border:1px solid var(--p-border, #3c3c3c)",
            "border-radius:var(--p-radius-sm, 3px)",
            "box-shadow:0 4px 12px rgba(0, 0, 0, 0.4)",
            "font-size:var(--p-font-base, 13px)",
            "color:var(--p-text, #ddd)",
            "user-select:none",
        ].join(";");
        (document.body || document.documentElement).appendChild(el);
        ctxMenuEl = el;
        return el;
    }

    function hideCtxMenu(): void {
        if (ctxMenuEl) ctxMenuEl.style.display = "none";
    }

    function showCtxMenu(x: number, y: number, items: CtxItem[]): void {
        const menu = ensureCtxMenu();
        menu.innerHTML = "";
        for (const item of items) {
            if (item.separator && menu.children.length > 0) {
                const sep = document.createElement("div");
                sep.style.cssText = "height:1px;margin:4px 6px;background:var(--p-border, #3c3c3c)";
                menu.appendChild(sep);
            }
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = item.label;
            // Explicit reset styles so a board's global `button {}` rules can't distort the menu.
            btn.style.cssText = [
                "display:block",
                "width:100%",
                "margin:0",
                "padding:5px 10px",
                "border:none",
                "border-radius:var(--p-radius-sm, 3px)",
                "background:transparent",
                "color:inherit",
                "font:inherit",
                "line-height:1.4",
                "text-align:left",
                "text-transform:none",
                "letter-spacing:normal",
                "white-space:nowrap",
                "cursor:pointer",
                "outline:none",
            ].join(";");
            // Hover uses the theme accent (= --color-bg-selection, the same blue the app's native
            // menu highlights with) + its on-accent text color, so the menu matches Persephone.
            btn.addEventListener("mouseenter", () => {
                btn.style.background = "var(--p-accent, #094771)";
                btn.style.color = "var(--p-accent-text, #ffffff)";
            });
            btn.addEventListener("mouseleave", () => {
                btn.style.background = "transparent";
                btn.style.color = "inherit";
            });
            btn.addEventListener("click", () => {
                hideCtxMenu();
                try {
                    item.action();
                } catch (e) {
                    console.error("persephone context menu action error:", e);
                }
            });
            menu.appendChild(btn);
        }
        // Show first (so offsetWidth/Height are measurable), then clamp to the frame viewport.
        menu.style.display = "flex";
        const mw = menu.offsetWidth;
        const mh = menu.offsetHeight;
        menu.style.left = Math.max(4, Math.min(x, window.innerWidth - mw - 4)) + "px";
        menu.style.top = Math.max(4, Math.min(y, window.innerHeight - mh - 4)) + "px";
    }

    // The <img> at a right-click, or null. Prefers the clicked element's own <img> ancestor; falls
    // back to searching the hit stack under the cursor — some renderers layer another element on top
    // of a picture (e.g. pptx-preview stacks an SVG shape over the <img>), so the event target is that
    // overlay and closest("img") — which only walks ancestors — misses the sibling <img>.
    function imageAt(target: Element | null, x: number, y: number): HTMLImageElement | null {
        const direct = target && target.closest ? target.closest("img") : null;
        if (direct instanceof HTMLImageElement) return direct;
        if (typeof document.elementsFromPoint === "function") {
            for (const el of document.elementsFromPoint(x, y)) {
                if (el instanceof HTMLImageElement) return el;
            }
        }
        return null;
    }

    window.addEventListener("contextmenu", (e: MouseEvent) => {
        if (e.defaultPrevented) return; // the board renders its own menu — stand down
        const target = e.target as Element | null;
        // Groups are concatenated with a divider between them (link / image / edit-or-selection).
        const groups: CtxItem[][] = [];

        // Link (same external-link detection as routeExternalLinkClick): in-board / #fragment links
        // resolve to the board:// origin and are skipped, so "Open Link" only appears for links that
        // actually open in Persephone.
        const anchor = target && target.closest ? target.closest("a[href]") : null;
        const href = anchor instanceof HTMLAnchorElement ? anchor.href : "";
        if (href && !href.startsWith("board://") && !href.startsWith("javascript:")) {
            groups.push([
                { label: "Open Link", action: () => fire("openRawLink", [href]) },
                { label: "Copy Link", action: () => copyText(href) },
            ]);
        }

        // Image → open in the Image Viewer (new tab), copy as PNG, or save to disk. `currentSrc`
        // reflects the actually-loaded source (srcset), with `src` as the fallback; skip an empty src.
        const img = imageAt(target, e.clientX, e.clientY);
        const imgSrc = img ? img.currentSrc || img.src : "";
        if (img && imgSrc && !imgSrc.startsWith("data:,")) {
            groups.push([
                { label: "Open Image in New Tab", action: () => void openImageInNewTab(imgSrc) },
                { label: "Copy Image", action: () => void copyImage(img) },
                { label: "Save Image As…", action: () => void saveImageAs(img, imgSrc) },
            ]);
        }

        // Editable field → Cut / Copy / Paste. Otherwise a plain text selection → Copy.
        const editable = editableTarget(target);
        if (editable) {
            const editItems: CtxItem[] = [];
            const hasSelection = !!editableSelection(editable);
            const readonly = isReadonly(editable);
            if (hasSelection && !readonly) editItems.push({ label: "Cut", action: () => cutEditable(editable) });
            if (hasSelection) editItems.push({ label: "Copy", action: () => copyEditable(editable) });
            if (!readonly) editItems.push({ label: "Paste", action: () => void pasteEditable(editable) });
            if (editItems.length) groups.push(editItems);
        } else {
            const selection = (window.getSelection && window.getSelection()?.toString()) || "";
            if (selection.trim()) groups.push([{ label: "Copy", action: () => copyText(selection) }]);
        }

        // Flatten groups → items, marking the first item of each non-first group as a separator.
        const items: CtxItem[] = [];
        groups.forEach((group, gi) => {
            group.forEach((item, ii) => {
                items.push(gi > 0 && ii === 0 ? { ...item, separator: true } : item);
            });
        });

        if (!items.length) return; // nothing useful to offer — leave the default behavior alone
        e.preventDefault();
        showCtxMenu(e.clientX, e.clientY, items);
    });

    // Dismiss the menu on an outside press (capture so a board's stopPropagation can't block it), a
    // scroll, resize, Escape, or the frame losing focus. A press INSIDE the menu is left alone so the
    // item's click still fires.
    window.addEventListener(
        "mousedown",
        (e) => {
            if (ctxMenuEl && ctxMenuEl.style.display !== "none" && !ctxMenuEl.contains(e.target as Node)) {
                hideCtxMenu();
            }
        },
        true,
    );
    window.addEventListener("scroll", hideCtxMenu, true);
    window.addEventListener("resize", hideCtxMenu);
    window.addEventListener("blur", hideCtxMenu);
    window.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Escape") hideCtxMenu();
    });
}
