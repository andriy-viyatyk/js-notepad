/* persephone skin · chart.js@4.4.6 · tuned 2026-06
 *
 * Chart.js is a CANVAS library — it has no DOM/CSS to skin. Every color it draws
 * (text, grid lines, tooltips, dataset fills) is a JS option. So the Persephone
 * "skin" for Chart.js is this small THEME ADAPTER: it takes a `--p-*` palette (from
 * `persephone.theme`, `persephone.getTheme()`, or an `onThemeChange` argument) and
 * pushes it into Chart.js globals (Chart.defaults) + dataset colors.
 *
 * IMPORTANT — re-theme from the live source: every adapter fn takes the palette as a
 * parameter. At init pass `persephone.theme` (the load snapshot). On a theme switch,
 * pass the palette delivered to `persephone.onThemeChange` (or call `getTheme()`) —
 * do NOT reuse a cached `persephone.theme`, which is a snapshot and goes stale after
 * a switch (the bridge copies it once into the page).
 *
 * CSS-vs-JS boundary: the board CHROME (toolbar, cards, statusbar) is styled with
 * `--p-*` in index.html the normal way. Everything INSIDE a <canvas> is owned by
 * this adapter — none of it is reachable from CSS.
 *
 * Usage (see app.js):
 *   const T = window.PersephoneChartTheme;
 *   T.applyDefaults(Chart, P.theme);                  // once, before creating charts
 *   const palette = T.palette(P.theme);               // categorical series colors
 *   ... build charts, color datasets from palette ...
 *   P.onThemeChange(theme => { T.applyDefaults(Chart, theme); retheme(theme); });
 */
(function (global) {
    "use strict";

    function vars(theme) {
        return (theme && theme.vars) || {};
    }

    // --- color helpers (canvas needs concrete colors; no CSS color-mix here) ----

    function toRgb(hex) {
        if (!hex) return null;
        let h = String(hex).trim();
        if (h[0] === "#") h = h.slice(1);
        if (h.length === 3) h = h.split("").map((c) => c + c).join("");
        if (h.length !== 6) return null;
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    }

    // Translucent fill from a base color — for area fills / bar backgrounds.
    function alpha(color, a) {
        const c = toRgb(color);
        if (!c) return color;
        return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
    }

    // Mix two colors (t = 0 → c1, t = 1 → c2). Used to derive extra palette hues
    // and to blend grid lines toward the background.
    function mix(c1, c2, t) {
        const a = toRgb(c1);
        const b = toRgb(c2);
        if (!a || !b) return c1;
        const r = Math.round(a.r + (b.r - a.r) * t);
        const g = Math.round(a.g + (b.g - a.g) * t);
        const bl = Math.round(a.b + (b.b - a.b) * t);
        return `rgb(${r}, ${g}, ${bl})`;
    }

    // --- the palette: an ordered categorical color list from the --p-* tokens ---
    // The contract gives a handful of distinguishable semantic hues; we order them
    // for good adjacent contrast and, if a chart needs more series than tokens,
    // extend by blending toward the accent so colors stay on-theme.
    function palette(theme) {
        const v = vars(theme);
        const base = [
            v["--p-accent"] || "#4ea1ff",
            v["--p-success"] || "#89d185",
            v["--p-warning"] || "#cca700",
            v["--p-error"] || "#f88070",
            v["--p-link"] || "#4ea1ff",
            v["--p-text-muted"] || "#969696",
        ];
        return base;
    }

    // Stretch the palette to n colors by blending extras toward the accent.
    function paletteN(theme, n) {
        const base = palette(theme);
        if (n <= base.length) return base.slice(0, n);
        const v = vars(theme);
        const accent = v["--p-accent"] || "#4ea1ff";
        const out = base.slice();
        for (let i = base.length; i < n; i++) {
            out.push(mix(base[i % base.length], accent, 0.45));
        }
        return out;
    }

    // --- global Chart.defaults — fonts, grid, ticks, legend, tooltip ------------
    function applyDefaults(Chart, theme) {
        const v = vars(theme);
        const text = v["--p-text"] || "#d4d4d4";
        const muted = v["--p-text-muted"] || "#969696";
        const bg = v["--p-bg"] || "#1e1e1e";
        const border = v["--p-border"] || "#3c3c3c";

        // Match the board's monospace default so canvas labels read like the app.
        const family =
            (typeof getComputedStyle === "function" &&
                getComputedStyle(document.body).fontFamily) ||
            "monospace";

        Chart.defaults.color = text;
        Chart.defaults.font.family = family;
        // Grid lines are subtle: blend the border toward the page background.
        Chart.defaults.borderColor = mix(border, bg, 0.35);

        const tip = Chart.defaults.plugins.tooltip;
        tip.backgroundColor = v["--p-overlay"] || v["--p-panel"] || "#252526";
        tip.titleColor = v["--p-text-strong"] || text;
        tip.bodyColor = text;
        tip.borderColor = border;
        tip.borderWidth = 1;
        tip.padding = 8;

        Chart.defaults.plugins.legend.labels.color = text;
        // NOTE: scales need no per-chart work — grid / angle lines inherit
        // Chart.defaults.borderColor, and ticks / radar point-labels inherit
        // Chart.defaults.color. Setting those two above themes every scale, and
        // existing charts pick the new values up on the next update(). (Mutating a
        // live chart.options.scales proxy instead breaks Chart's option resolver.)
    }

    global.PersephoneChartTheme = { vars, alpha, mix, palette, paletteN, applyDefaults };
})(window);
