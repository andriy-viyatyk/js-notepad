/**
 * Persephone agent highlight overlay.
 *
 * A dependency-free callout layer: draws a ring over an element and, optionally, a card with
 * agent-written text and a Close button. Installs itself as `window.__persephoneHighlight`.
 *
 * Runs in three places from this one file:
 *   - Persephone's own window: via `app.ui.highlightElement()` (which fetches this asset), or
 *     directly from `execute_script`.
 *   - A board frame or a browser page: paste the file's contents into `browser_evaluate`.
 *
 * Deliberately self-contained: no imports, no framework, no Persephone API. It cannot import
 * `src/renderer/theme/color`, and it must not: the accent look below is FIXED in every theme and
 * every context so a user can always tell that an agent placed the callout rather than the app.
 * Reading a board's `--p-*` tokens would camouflage it and is intentionally not done.
 *
 * Kept strictly ASCII: the file is pasted between contexts and served by handlers that do not
 * always declare a charset, so a non-ASCII byte here shows up as mojibake wherever it lands.
 */
(function () {
    "use strict";

    var VERSION = 1;
    if (window.__persephoneHighlight && window.__persephoneHighlight.version === VERSION) {
        return;
    }

    // Fixed identity palette: see the file header before changing these.
    // ACCENT carries the identity (ring + card border + the Close button). The card FILL is a
    // light tint of the same hue, not ACCENT itself: a saturated orange behind body text is hard
    // to read, and the callout is recognised by its orange frame, which the tint does not weaken.
    var ACCENT = "#F97316";
    var ACCENT_DARK = "#9A3412";
    var CARD_BG = "#FFE7D0";
    var CARD_TEXT = "#3A1D06";
    var CARD_SHADOW = "0 6px 20px rgba(0,0,0,0.35)";
    // Above the app's ceiling (Tooltip 1100, Popover/toasts 1000, progress 200, dialogs 100).
    var Z_INDEX = 2147483000;
    var MAX_RINGS = 20;
    var POLL_MS = 500;

    var host = null;
    var items = [];
    var seq = 0;
    var pollTimer = null;
    var rafPending = false;

    function ensureHost() {
        if (host && host.isConnected) return host;
        host = document.createElement("div");
        host.setAttribute("data-persephone-highlight", "host");
        setStyle(host, {
            position: "fixed",
            inset: "0",
            zIndex: String(Z_INDEX),
            pointerEvents: "none",
        });
        document.body.appendChild(host);
        return host;
    }

    function setStyle(el, styles) {
        for (var key in styles) {
            if (Object.prototype.hasOwnProperty.call(styles, key)) {
                el.style[key] = styles[key];
            }
        }
    }

    function makeRing() {
        var ring = document.createElement("div");
        setStyle(ring, {
            position: "fixed",
            boxSizing: "border-box",
            border: "2px solid " + ACCENT,
            borderRadius: "4px",
            boxShadow: "0 0 0 2px rgba(249,115,22,0.35), 0 0 12px rgba(249,115,22,0.6)",
            pointerEvents: "none",
        });
        return ring;
    }

    function makeCard(item, title, text) {
        var card = document.createElement("div");
        setStyle(card, {
            position: "fixed",
            boxSizing: "border-box",
            maxWidth: "320px",
            padding: "10px 12px",
            background: CARD_BG,
            color: CARD_TEXT,
            border: "2px solid " + ACCENT,
            borderRadius: "6px",
            boxShadow: CARD_SHADOW,
            font: "13px/1.45 system-ui, -apple-system, Segoe UI, sans-serif",
            pointerEvents: "auto",
        });

        if (title) {
            var head = document.createElement("div");
            head.textContent = String(title);
            setStyle(head, { fontWeight: "600", marginBottom: "4px" });
            card.appendChild(head);
        }

        if (text) {
            var body = document.createElement("div");
            body.textContent = String(text);
            setStyle(body, { whiteSpace: "pre-wrap" });
            card.appendChild(body);
        }

        var close = document.createElement("button");
        close.type = "button";
        close.textContent = "Close";
        setStyle(close, {
            marginTop: "8px",
            padding: "3px 12px",
            font: "inherit",
            fontWeight: "600",
            color: "#FFFFFF",
            background: ACCENT,
            border: "1px solid " + ACCENT_DARK,
            borderRadius: "4px",
            cursor: "pointer",
        });
        close.addEventListener("click", function () {
            clear(item.id);
        });
        card.appendChild(close);

        return card;
    }

    /** An element counts as gone when it leaves the DOM *or* stops being rendered. The second
     *  case matters as much as the first: Persephone keeps the Menu Bar mounted and merely sets
     *  `display: none` on it, so a detach-only check would leave a ring floating over nothing
     *  the moment the user closes it. */
    function isVisible(el) {
        if (!el.isConnected) return false;
        var r = el.getBoundingClientRect();
        return r.width > 0 || r.height > 0;
    }

    /** Position one item's ring(s) and card against their live target rects. Returns false when
     *  the item's primary target is gone, so the caller can drop it. */
    function place(item) {
        if (!item.targets.length || !isVisible(item.targets[0])) return false;

        for (var i = 0; i < item.targets.length; i++) {
            var target = item.targets[i];
            var ring = item.rings[i];
            if (!isVisible(target)) {
                ring.style.display = "none";
                continue;
            }
            var r = target.getBoundingClientRect();
            setStyle(ring, {
                display: "block",
                left: r.left - 3 + "px",
                top: r.top - 3 + "px",
                width: r.width + 6 + "px",
                height: r.height + 6 + "px",
            });
        }

        if (item.card) {
            var rect = item.targets[0].getBoundingClientRect();
            var cw = item.card.offsetWidth;
            var ch = item.card.offsetHeight;
            var gap = 10;

            // Below by default; flip above when the viewport is too short underneath.
            var top = rect.bottom + gap;
            if (top + ch > window.innerHeight - 8 && rect.top - gap - ch > 8) {
                top = rect.top - gap - ch;
            }
            top = Math.max(8, Math.min(top, window.innerHeight - ch - 8));

            var left = rect.left;
            left = Math.max(8, Math.min(left, window.innerWidth - cw - 8));

            setStyle(item.card, { left: left + "px", top: top + "px" });
        }
        return true;
    }

    function reflow() {
        for (var i = items.length - 1; i >= 0; i--) {
            if (!place(items[i])) {
                removeAt(i);
            }
        }
        syncListeners();
    }

    function scheduleReflow() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(function () {
            rafPending = false;
            reflow();
        });
    }

    function onKeyDown(e) {
        if (e.key === "Escape" && items.length) {
            clear();
        }
    }

    /** Listeners and the poll exist only while something is highlighted. */
    function syncListeners() {
        if (items.length && !pollTimer) {
            window.addEventListener("scroll", scheduleReflow, true);
            window.addEventListener("resize", scheduleReflow, true);
            window.addEventListener("keydown", onKeyDown, true);
            // Covers layout shifts a scroll/resize event never reports (React re-renders,
            // splitter drags, tab switches) without the cost of a MutationObserver.
            pollTimer = setInterval(reflow, POLL_MS);
        } else if (!items.length && pollTimer) {
            window.removeEventListener("scroll", scheduleReflow, true);
            window.removeEventListener("resize", scheduleReflow, true);
            window.removeEventListener("keydown", onKeyDown, true);
            clearInterval(pollTimer);
            pollTimer = null;
            if (host && host.isConnected) {
                host.parentNode.removeChild(host);
            }
            host = null;
        }
    }

    function removeAt(index) {
        var item = items[index];
        for (var i = 0; i < item.rings.length; i++) {
            if (item.rings[i].parentNode) item.rings[i].parentNode.removeChild(item.rings[i]);
        }
        if (item.card && item.card.parentNode) item.card.parentNode.removeChild(item.card);
        items.splice(index, 1);
    }

    function clear(id) {
        var removed = 0;
        for (var i = items.length - 1; i >= 0; i--) {
            if (id === undefined || id === null || items[i].id === id) {
                removeAt(i);
                removed++;
            }
        }
        syncListeners();
        return removed;
    }

    function show(options) {
        var opts = options || {};
        var selector = opts.selector;
        var id = opts.id || "h" + ++seq;

        if (typeof selector !== "string" || !selector) {
            return { id: id, found: false, count: 0, selector: selector || null,
                error: "selector must be a non-empty CSS selector string" };
        }

        var matches;
        try {
            matches = document.querySelectorAll(selector);
        } catch (e) {
            return { id: id, found: false, count: 0, selector: selector,
                error: "invalid CSS selector: " + e.message };
        }

        // Replace rather than stack when the caller reuses an id.
        clear(id);

        if (!matches.length) {
            return { id: id, found: false, count: 0, selector: selector };
        }

        var targets = [];
        var limit = opts.all ? Math.min(matches.length, MAX_RINGS) : 1;
        for (var i = 0; i < limit; i++) targets.push(matches[i]);

        var container = ensureHost();
        var item = { id: id, targets: targets, rings: [], card: null };

        for (var j = 0; j < targets.length; j++) {
            var ring = makeRing();
            container.appendChild(ring);
            item.rings.push(ring);
        }

        if (opts.text || opts.title) {
            item.card = makeCard(item, opts.title, opts.text);
            container.appendChild(item.card);
        }

        items.push(item);

        if (opts.scroll !== false) {
            try {
                targets[0].scrollIntoView({ block: "nearest", inline: "nearest" });
            } catch (e) {
                /* older engines: ignore */
            }
        }

        place(item);
        syncListeners();

        return {
            id: id,
            found: true,
            count: matches.length,
            highlighted: targets.length,
            selector: selector,
        };
    }

    function showMany(list) {
        var out = [];
        var arr = list || [];
        for (var i = 0; i < arr.length; i++) out.push(show(arr[i]));
        return out;
    }

    window.__persephoneHighlight = {
        version: VERSION,
        show: show,
        showMany: showMany,
        clear: clear,
    };
})();
