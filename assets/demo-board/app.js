// Persephone Boards — Demo board (loaded via board:///app.js).
//
// Drives the full `persephone` bridge, demonstrates the `--p-*` theme/token
// contract, and documents how boards work. Content is split into tabs:
// Overview / Theming / Capabilities / Build Guide.
//
// The execute() probes spawn `node`, so Node must be on PATH; the executeNode()
// probes run on Persephone's own bundled runtime, so they always work.

(() => {
    const P = window.persephone;
    const dec = new TextDecoder();
    const out = document.getElementById("out");

    // ── persephone.view — this same file also serves the "Shared State" secondary panel ──
    // A board can declare secondary (sidebar) views; each is its own board:// frame over the
    // SAME board. All frames share one Persephone-owned state object, so persephone.state.*
    // keeps the main view, this "Shared State" panel, and the "Notes" panel (detail.html) in
    // sync. `persephone.view` is "main" for the main view or the view's id for a secondary
    // frame — known synchronously at load, so one HTML file can serve every view. In a
    // secondary frame, hide the main chrome and render only the compact shared-state UI.
    const viewRole = (P && P.view) || "main";
    if (viewRole !== "main") {
        document.body.classList.add("secondary-frame");
        renderSharedStateFrame(viewRole);
        return;
    }

    // ── Tabs ────────────────────────────────────────────────────────────
    const tabs = document.querySelectorAll(".tab");
    const panels = document.querySelectorAll(".panel");
    // The shared console is only meaningful on the interactive tabs.
    const consoleTabs = new Set(["theming", "capabilities"]);

    function activate(name) {
        tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
        panels.forEach((p) => p.classList.toggle("active", p.dataset.panel === name));
        out.style.display = consoleTabs.has(name) ? "" : "none";
    }
    tabs.forEach((t) => t.addEventListener("click", () => activate(t.dataset.tab)));
    activate("overview");

    // ── Shared console ──────────────────────────────────────────────────
    function clear() { out.textContent = ""; }
    function print(line) { out.textContent += (out.textContent ? "\n" : "") + line; }
    function header(name) { clear(); print("▶ " + name); }

    // node -e helper — keeps the inline JS readable.
    const nodeEval = (js) => `node -e "${js.replace(/"/g, '\\"')}"`;

    // ── Demo actions (wired to [data-test] buttons) ─────────────────────
    const tests = {
        // --- execute() ------------------------------------------------------
        async getText() {
            header("execute → getText");
            const text = await P.execute(nodeEval("console.log('hello from execute')")).getText();
            print("stdout: " + JSON.stringify(text));
        },
        async getJson() {
            header("execute → getJson");
            const data = await P.execute(
                nodeEval("console.log(JSON.stringify({ ok: true, pid: process.pid }))"),
            ).getJson();
            print("parsed: " + JSON.stringify(data, null, 2));
        },
        async getJsonReject() {
            header("execute → getJson rejects on non-zero exit");
            try {
                await P.execute(
                    nodeEval("process.stderr.write('boom from stderr'); process.exit(3)"),
                ).getJson();
                print("❌ unexpectedly resolved");
            } catch (e) {
                print("✅ rejected: " + e.message);
                print("exitCode: " + e.exitCode);
                print("stderr: " + JSON.stringify(e.stderr));
            }
        },
        async stream() {
            header("execute → streaming (3 ticks, then exit)");
            const h = P.execute(
                nodeEval(
                    "let i=0;const t=setInterval(()=>{console.log('tick '+(++i));if(i>=3){clearInterval(t)}},300)",
                ),
            );
            h.on("stdout", (chunk) => print("live: " + dec.decode(chunk).trim()));
            h.on("exit", (info) => print("exit code=" + info.code + " signal=" + info.signal));
        },
        async stdin() {
            header("execute → stdin round-trip (echo)");
            const h = P.execute(nodeEval("process.stdin.pipe(process.stdout)"));
            h.write("ping-");
            h.write("pong");
            h.endStdin();
            print("echoed: " + JSON.stringify(await h.getText()));
        },
        async kill() {
            header("execute → kill a long-runner");
            const h = P.execute(nodeEval("setInterval(()=>{},1000)"));
            h.on("exit", (info) => print("✅ exited after kill — signal=" + info.signal + " code=" + info.code));
            print("spawned; killing in 600ms…");
            setTimeout(() => h.kill(), 600);
        },
        async cwd() {
            header("execute → default cwd is the board folder");
            const def = await P.execute(nodeEval("process.stdout.write(process.cwd())")).getText();
            print("default cwd: " + def);
            const override = await P.execute(nodeEval("process.stdout.write(process.cwd())"), {
                cwd: "C:\\",
            }).getText();
            print("explicit cwd 'C:\\': " + override);
        },

        // --- executeNode() — bundled runtime, no Node install --------------
        async nodeInfo() {
            header("executeNode → bundled runtime + node:sqlite");
            const r = await P.executeNode("scripts/node-probe.mjs", ["demo"]).getJson(/@@RESULT@@(.*)/);
            print("Node " + r.nodeVersion + " (Persephone's own binary — no install needed)");
            print("execPath: " + r.execPath);
            print("args round-trip: " + JSON.stringify(r.args));
            print("node:sqlite → " + JSON.stringify(r.sqlite));
        },
        async nodeServer() {
            header("executeNode → resident server (spawn once, JSON lines over stdin)");
            const srv = P.executeNode("scripts/node-server.mjs", [], { name: "demo-server" });
            srv.on("stdout", (chunk) => {
                for (const line of dec.decode(chunk).split("\n")) {
                    if (line.trim()) print("← " + line.trim());
                }
            });
            const wait = (ms) => new Promise((r) => setTimeout(r, ms));
            await wait(300);
            for (const [id, value] of [[1, "hello"], [2, "resident"], [3, "server"]]) {
                print("→ " + JSON.stringify({ id, value }));
                srv.write(JSON.stringify({ id, value }) + "\n");
            }
            await wait(300);
            srv.kill();
            print("killed the server (a real board keeps it alive with setBoardBusy).");
        },

        // --- integration tier ----------------------------------------------
        async notify() {
            header("notify");
            P.notify("Hello from the Demo board 👋", "success");
            print("sent a 'success' toast — check the app's alert bar.");
        },
        async openRawLink() {
            header("openRawLink");
            P.openRawLink("https://github.com/andriy-viyatyk/persephone");
            print("asked Persephone to open the GitHub repo in a new page.");
        },
        async openFileDialog() {
            header("openFileDialog");
            const paths = await P.openFileDialog({ title: "Pick a file (board demo)" });
            print("selected: " + JSON.stringify(paths));
        },
        async saveFileDialog() {
            header("saveFileDialog");
            const path = await P.saveFileDialog({ title: "Save as (board demo)", defaultPath: "board-demo.txt" });
            print("save path: " + JSON.stringify(path));
        },
        async openFolderDialog() {
            header("openFolderDialog");
            const paths = await P.openFolderDialog({ title: "Pick a folder (board demo)" });
            print("selected: " + JSON.stringify(paths));
        },

        // --- page-scoped AiVision ------------------------------------------
        async callHostPage() {
            header("persephone.call → hosting page");
            const title = await P.call("page.title");
            const editor = await P.call("page.editor");
            print(JSON.stringify({ title, editor }, null, 2));
            print("main.* and windows[i].* are MCP-only paths.");
        },

        // --- theme (introspection) -----------------------------------------
        showTheme() {
            header("persephone.theme");
            print(JSON.stringify(P.theme, null, 2));
        },
        showTokens() {
            header("persephone.tokens");
            print(JSON.stringify(P.tokens, null, 2));
        },
        readCss() {
            header("read --p-* live from the DOM (getComputedStyle)");
            const cs = getComputedStyle(document.documentElement);
            for (const name of ["--p-bg", "--p-text", "--p-accent", "--p-border", "--p-space-md", "--p-radius-md", "--p-font-base"]) {
                print(`${name} = ${cs.getPropertyValue(name).trim()}`);
            }
        },
    };

    document.querySelectorAll("button[data-test]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const name = btn.getAttribute("data-test");
            try {
                await tests[name]();
            } catch (e) {
                print("❌ error: " + (e && e.message ? e.message : String(e)));
            }
        });
    });

    // External links must open in Persephone, not navigate the board iframe away.
    document.querySelectorAll("[data-link]").forEach((a) => {
        a.addEventListener("click", (e) => {
            e.preventDefault();
            P.openRawLink(a.getAttribute("data-link"));
        });
    });

    // ── Overview: runtime environment checks ───────────────────────────
    function runChecks() {
        const host = document.getElementById("checks");
        const add = (label, ok, detail) => {
            const li = document.createElement("li");
            li.textContent = `${ok ? "✅" : "❌"} ${label}${detail ? " — " + detail : ""}`;
            host.appendChild(li);
        };
        add("external app.js + style.css loaded over board://", true);
        add("inline <script> ran (CSP unsafe-inline)", !!window.__inlineRan);
        add("persephone bridge injected", !!(P && P.version), "version=" + (P && P.version));
        add("isolation: window.require is undefined", typeof window.require === "undefined");
        add("isolation: window.process is undefined", typeof window.process === "undefined");
        add("isolation: window.ipcRenderer is undefined", typeof window.ipcRenderer === "undefined");
        const pbg = getComputedStyle(document.documentElement).getPropertyValue("--p-bg").trim();
        add("theme applied (--p-bg present)", !!pbg, "--p-bg=" + pbg);
        // Remote fetch must be refused by CSP (connect-src 'self').
        fetch("https://example.com")
            .then(() => add("remote fetch blocked by CSP", false, "fetch SUCCEEDED (unexpected!)"))
            .catch((err) => add("remote fetch blocked by CSP", true, String(err)));
    }

    // ── Theming: swatches + metric ladders + live onThemeChange ─────────
    function buildSwatches() {
        const host = document.getElementById("swatches");
        host.innerHTML = "";
        // Drive the list from the contract itself, so it tracks the real palette.
        for (const name of Object.keys(P.theme.vars)) {
            const sw = document.createElement("div");
            sw.className = "swatch";
            // The box background is `var(--p-name)` → it restyles LIVE on theme switch
            // with no JS; only the printed value label needs refreshing.
            sw.innerHTML =
                `<div class="sw-box" style="background: var(${name})"></div>` +
                `<div class="sw-label">${name}<br><span class="sw-val" data-var="${name}"></span></div>`;
            host.appendChild(sw);
        }
    }

    function buildMetrics() {
        const host = document.getElementById("metrics");
        const radii = ["--p-radius-xs", "--p-radius-sm", "--p-radius-md", "--p-radius-lg", "--p-radius-xl", "--p-radius-full"];
        const fonts = ["--p-font-xs", "--p-font-sm", "--p-font-md", "--p-font-base", "--p-font-lg", "--p-font-xl", "--p-font-xxl"];
        const spaces = ["--p-space-sm", "--p-space-md", "--p-space-lg", "--p-space-xl", "--p-space-xxl", "--p-space-xxxl"];

        const radiusChips = radii
            .map((r) => `<div class="chip" style="border-radius: var(${r})">${r.replace("--p-radius-", "")}</div>`)
            .join("");
        const fontLadder = fonts
            .map((f) => `<div style="font-size: var(${f})">${f.replace("--p-font-", "font ")} — The quick brown fox</div>`)
            .join("");
        // Each row: a label (token name + its static value from persephone.tokens)
        // and a bar indented from the left by that spacing token — so the staircase
        // of bar starts visualizes the scale, now legibly labeled.
        const spaceRows = spaces
            .map((s) => {
                const label = s.replace("--p-space-", "space ");
                const value = P.tokens[s] || "";
                return (
                    `<div class="space-row">` +
                        `<span class="metric-label">${label} — ${value}</span>` +
                        `<div class="space-track" style="padding-left: var(${s})"><div class="bar"></div></div>` +
                    `</div>`
                );
            })
            .join("");

        host.innerHTML =
            `<div class="chips">${radiusChips}</div>` +
            `<div style="margin-top: var(--p-space-lg, 12px)">${fontLadder}</div>` +
            `<div style="margin-top: var(--p-space-lg, 12px)">${spaceRows}</div>`;
    }

    function refreshSwatchValues() {
        const cs = getComputedStyle(document.documentElement);
        document.querySelectorAll(".sw-val[data-var]").forEach((el) => {
            el.textContent = cs.getPropertyValue(el.getAttribute("data-var")).trim();
        });
    }

    // Build the structure synchronously (driven by persephone.theme.vars, the JS
    // mirror, which is populated at preload time).
    buildSwatches();
    buildMetrics();

    // ── Secondary views & shared state (persephone.state.*) ─────────────
    // Main-view wiring: declare the shared state (authoritative init, from the main view),
    // then drive it from the "Secondary Views" tab controls. onChange is the source of truth —
    // a write round-trips through Persephone back to every frame, so render from it.
    function wireSharedState() {
        // Opt-in persistence: only `counter` + `message` are saved to the page and restored
        // on app restart / board Reload. init is fill-missing (restored values win).
        P.state.init({ counter: 0, message: "" }, { restorableKeys: ["counter", "message"] });

        const inc = document.getElementById("ss-inc");
        const msg = document.getElementById("ss-message");
        const readout = document.getElementById("ss-readout");

        inc.addEventListener("click", async () => {
            const s = await P.state.get();
            P.state.merge({ counter: (s.counter || 0) + 1 });
        });
        msg.addEventListener("input", () => P.state.merge({ message: msg.value }));

        P.state.onChange((s) => {
            readout.textContent = "shared state: " + JSON.stringify(s);
            // Reflect an external change without stealing the caret while the user types here.
            if (document.activeElement !== msg && typeof s.message === "string") msg.value = s.message;
        });
    }

    // Secondary-frame renderer: builds a compact shared-state UI into #secondary-root when this
    // file is loaded as the "shared-state" sidebar view. Shares state with the main view + the
    // "Notes" panel; does NOT call state.init (the main view owns the authoritative defaults).
    function renderSharedStateFrame(role) {
        const root = document.getElementById("secondary-root");
        root.innerHTML =
            `<div class="ss-frame">` +
            `<h3>Shared State</h3>` +
            `<p class="muted">The <code>${role}</code> secondary view — served from ` +
            `<code>index.html</code>, told apart by <code>persephone.view</code>. It shares ` +
            `state with the main view and the Notes panel.</p>` +
            `<button class="p-btn primary" id="ss-frame-inc">counter ＋</button>` +
            `<pre id="ss-frame-readout" class="ss-readout">shared state: …</pre>` +
            `</div>`;
        const readout = document.getElementById("ss-frame-readout");
        document.getElementById("ss-frame-inc").addEventListener("click", async () => {
            const s = await P.state.get();
            P.state.merge({ counter: (s.counter || 0) + 1 });
        });
        P.state.onChange((s) => { readout.textContent = "shared state: " + JSON.stringify(s); });
    }

    let fireCount = 0;
    function start() {
        wireSharedState();
        // runChecks() and the onThemeChange initial fire read the LIVE computed
        // --p-* values off <html>. This script runs mid-parse, but the preload
        // applies those vars on DOMContentLoaded — so read only once the DOM is
        // ready, or the check races ahead of the theme and reports a false miss.
        runChecks();
        // onThemeChange fires once immediately with the current palette, then on every switch.
        P.onThemeChange((theme) => {
            fireCount += 1;
            const status = document.getElementById("theme-status");
            status.textContent =
                `onThemeChange fired ${fireCount}× — current: id="${theme.id}", isDark=${theme.isDark}, ` +
                `${Object.keys(theme.vars).length} color vars`;
            // CSS vars are applied by now; refresh the printed value labels.
            refreshSwatchValues();
        });
    }

    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
