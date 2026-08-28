// Keep this first so the shared cascade layer order is established before any component stylesheet.
import "./renderer/theme/style-layers.css";
import "./renderer/theme/root.css";
import { app } from "./renderer/api/app";
import { api } from "./ipc/renderer/api";
import { startPerformanceJanitor } from "./renderer/core/utils/performance-janitor";

startPerformanceJanitor();

async function bootstrap(): Promise<(container: HTMLElement) => () => void> {
    const [cont] = await Promise.all([
        import("./renderer/index"),
        app.init(),
        app.initSetup(),
    ]);
    await app.initServices();
    await app.initPages();
    await app.initEvents();
    setTimeout(() => api.windowReady(), 0);
    return cont.mount;
}

async function startRenderer(): Promise<void> {
    const mount = await bootstrap();
    const container = document.getElementById("root");
    if (container) mount(container);
}

void startRenderer();
