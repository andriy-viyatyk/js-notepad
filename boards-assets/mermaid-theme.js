/* persephone skin · mermaid@11.15.0 · tuned 2026-06
 * ===========================================================================
 * Mermaid renders diagrams to SVG whose colors are computed in JS from a theme
 * config — there is no stylesheet to override. So the Persephone "skin" for
 * Mermaid is this THEME ADAPTER (like chart-theme.js for Chart.js): it takes a
 * `--p-*` palette and builds Mermaid's `themeVariables` from it, using the
 * customizable `base` theme. Every visible surface (node fill/border/text,
 * edges, clusters, sequence actors/notes, pie slices, …) is mapped onto a --p-*
 * token, so diagrams match the app's theme.
 *
 * IMPORTANT — Mermaid is NOT a live-update library. It renders SVG ONCE from the
 * diagram source; `initialize()` only affects FUTURE renders. So unlike a CSS
 * skin (re-tints with no JS) AND unlike Chart.js (live charts pick up new
 * Chart.defaults on the next .update()), a theme switch must RE-INITIALIZE and
 * RE-RENDER every diagram from its source. The board's app.js does that in
 * onThemeChange — see there.
 *
 * Re-theme from the LIVE source: `config()`/`themeVariables()` take the palette as
 * a parameter. At init pass `persephone.theme` (the load snapshot); on a switch
 * pass the palette delivered to `persephone.onThemeChange` (or `getTheme()`) — do
 * NOT reuse a cached `persephone.theme`, which goes stale after a switch.
 *
 * CSS-vs-JS boundary: the board CHROME (toolbar, cards, statusbar) is styled with
 * `--p-*` in index.html the normal way. Everything INSIDE a rendered <svg> is
 * owned by this adapter via themeVariables — none of it is reachable from CSS.
 *
 * Usage (see app.js):
 *   const T = window.PersephoneMermaidTheme;
 *   mermaid.initialize(T.config(P.theme));            // once, before rendering
 *   ... await mermaid.render(id, source) per diagram ...
 *   P.onThemeChange(theme => { mermaid.initialize(T.config(theme)); reRenderAll(); });
 * ===========================================================================*/
(function (global) {
    "use strict";

    function vars(theme) {
        return (theme && theme.vars) || {};
    }

    // --- color helpers (SVG needs concrete colors; no CSS color-mix here) -------

    function toRgb(color) {
        if (!color) return null;
        let h = String(color).trim();
        // already rgb()/rgba()? pull the channels straight out
        const m = h.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (m) return { r: +m[1], g: +m[2], b: +m[3] };
        if (h[0] === "#") h = h.slice(1);
        if (h.length === 3) h = h.split("").map((c) => c + c).join("");
        if (h.length !== 6) return null;
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    }

    // Translucent fill from a base color.
    function alpha(color, a) {
        const c = toRgb(color);
        if (!c) return color;
        return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
    }

    // Mix two colors (t = 0 → c1, t = 1 → c2). Used to derive surface tints and to
    // blend toward the background so derived tones stay on-theme.
    function mix(c1, c2, t) {
        const a = toRgb(c1);
        const b = toRgb(c2);
        if (!a || !b) return c1;
        const r = Math.round(a.r + (b.r - a.r) * t);
        const g = Math.round(a.g + (b.g - a.g) * t);
        const bl = Math.round(a.b + (b.b - a.b) * t);
        return `rgb(${r}, ${g}, ${bl})`;
    }

    // --- pie / categorical palette: an ordered color list from --p-* tokens -----
    function palette(theme) {
        const v = vars(theme);
        return [
            v["--p-accent"] || "#4ea1ff",
            v["--p-success"] || "#89d185",
            v["--p-warning"] || "#cca700",
            v["--p-error"] || "#f88070",
            v["--p-link"] || "#4ea1ff",
            v["--p-text-muted"] || "#969696",
        ];
    }

    // --- the full themeVariables map: every visible surface ← --p-* -------------
    function themeVariables(theme) {
        const v = vars(theme);
        const bg = v["--p-bg"] || "#1e1e1e";
        const panel = v["--p-panel"] || "#252526";
        const border = v["--p-border"] || "#3c3c3c";
        const text = v["--p-text"] || "#d4d4d4";
        const textMuted = v["--p-text-muted"] || "#969696";
        const textStrong = v["--p-text-strong"] || "#dddddd";
        const accent = v["--p-accent"] || "#0078d4";
        const accentText = v["--p-accent-text"] || "#ffffff";
        const success = v["--p-success"] || "#89d185";
        const warning = v["--p-warning"] || "#cca700";
        const error = v["--p-error"] || "#f88070";

        // tints derived on-theme so they read in both light/dark
        const accentTint = mix(accent, bg, 0.78);   // faint accent surface
        const noteTint = mix(warning, bg, 0.80);     // soft highlight for notes
        const clusterBkg = mix(panel, bg, 0.5);      // subgraph background

        const pal = palette(theme);
        const pieVars = {};
        for (let i = 0; i < 12; i++) pieVars["pie" + (i + 1)] = pal[i % pal.length];

        return Object.assign(
            {
                darkMode: !!(theme && theme.isDark),
                background: bg,
                // base palette anchors — Mermaid derives unset vars from these
                primaryColor: panel,
                primaryTextColor: text,
                primaryBorderColor: border,
                secondaryColor: accentTint,
                secondaryTextColor: text,
                secondaryBorderColor: border,
                tertiaryColor: clusterBkg,
                tertiaryTextColor: text,
                tertiaryBorderColor: border,
                // lines + general text
                lineColor: textMuted,
                textColor: text,
                titleColor: textStrong,
                // flowchart nodes / clusters / edge labels
                mainBkg: panel,
                nodeBorder: border,
                nodeTextColor: text,
                clusterBkg: clusterBkg,
                clusterBorder: border,
                edgeLabelBackground: bg,
                defaultLinkColor: textMuted,
                // sequence diagram
                actorBkg: panel,
                actorBorder: border,
                actorTextColor: text,
                actorLineColor: textMuted,
                signalColor: text,
                signalTextColor: text,
                labelBoxBkgColor: panel,
                labelBoxBorderColor: border,
                labelTextColor: text,
                loopTextColor: text,
                noteBkgColor: noteTint,
                noteTextColor: text,
                noteBorderColor: warning,
                activationBkgColor: accentTint,
                activationBorderColor: accent,
                sequenceNumberColor: accentText,
                // state diagram
                labelColor: text,
                // notes/labels common
                altBackground: clusterBkg,
                // gantt — bars, sections, grid, today line (Mermaid derives these
                // off-palette to greys if left unset, so map them explicitly)
                sectionBkgColor: alpha(accent, 0.10),
                altSectionBkgColor: bg,
                sectionBkgColor2: alpha(textMuted, 0.10),
                taskBkgColor: mix(accent, bg, 0.55),
                taskBorderColor: accent,
                taskTextColor: text,
                taskTextDarkColor: text,
                taskTextLightColor: accentText,
                taskTextOutsideColor: text,
                activeTaskBkgColor: accent,
                activeTaskBorderColor: accentText,
                doneTaskBkgColor: mix(textMuted, bg, 0.3),
                doneTaskBorderColor: textMuted,
                critBkgColor: error,
                critBorderColor: error,
                gridColor: border,
                todayLineColor: error,
                // status / error
                errorBkgColor: alpha(error, 0.2),
                errorTextColor: error,
                // pie slices + labels
                pieTitleTextColor: textStrong,
                pieSectionTextColor: text,
                pieLegendTextColor: text,
                pieStrokeColor: bg,
                pieOuterStrokeColor: border,
                pieOpacity: 0.9,
            },
            pieVars
        );
    }

    // --- the initialize() config -------------------------------------------------
    function config(theme) {
        // Match the board's monospace default so diagram text reads like the app.
        const family =
            (typeof getComputedStyle === "function" &&
                getComputedStyle(document.body).fontFamily) ||
            "monospace";
        return {
            startOnLoad: false,
            securityLevel: "strict",
            theme: "base", // the only theme designed to be driven by themeVariables
            fontFamily: family,
            themeVariables: themeVariables(theme),
        };
    }

    global.PersephoneMermaidTheme = { vars, alpha, mix, palette, themeVariables, config };
})(window);
