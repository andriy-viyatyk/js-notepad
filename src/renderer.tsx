// Keep this first so the shared cascade layer order is established before any component stylesheet.
import "./renderer/theme/style-layers.css";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { app } from "./renderer/api/app";
import { api } from "./ipc/renderer/api";
import { startPerformanceJanitor } from "./renderer/core/utils/performance-janitor";

startPerformanceJanitor();

function RootComponent() {
    const [content, setContent] = useState(null);

    useEffect(() => {
        const bootstrap = async () => {
            const [cont] = await Promise.all([
                import("./renderer/index"),  // load main bundle (editors register here)
                app.init(),                  // init app version (IPC call)
                app.initSetup(),             // configure Monaco (themes, languages, types)
            ]);
            await app.initServices();        // load interface wrappers (stores already cached)
            await app.initPages();           // restore persisted pages
            await app.initEvents();          // subscribe to all events (global, keyboard, IPC)

            // Signal main process that this window is fully initialized.
            // Main process waits for this before sending IPC events like eMovePageIn.
            setTimeout(() => api.windowReady(), 0);

            setContent(<cont.default />);
        };
        bootstrap();
    }, []);

    return content;
}

const container = document.getElementById("root");
if (container) {
    const root = createRoot(container);
    root.render(<RootComponent />);
}
