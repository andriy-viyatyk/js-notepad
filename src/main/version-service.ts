import { app, net } from "electron";
import { electronStore } from "./e-store";
import { openWindows } from "./open-windows";
import { EventEndpoint } from "../ipc/api-types";
import { ReleaseInfo, RuntimeVersions, UpdateCheckResult } from "../ipc/api-param-types";
import { compareVersions } from "../shared/version-utils";

// `parseVersion` / `compareVersions` now live in the shared module so the renderer
// (published-boards catalog) can use the same compare without pulling this module's
// electron / e-store / open-windows imports into the renderer bundle.
export { compareVersions } from "../shared/version-utils";

const GITHUB_API_URL = "https://api.github.com/repos/andriy-viyatyk/persephone/releases/latest";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

const STORE_KEYS = {
    lastCheckTime: "version-check-lastTime",
    lastNotifiedVersion: "version-check-lastNotified",
};

async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
    try {
        const response = await net.fetch(GITHUB_API_URL, {
            headers: {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "persephone",
            },
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();

        if (data.prerelease) {
            return null;
        }

        return {
            tagName: data.tag_name,
            version: data.tag_name.replace(/^v/, ""),
            htmlUrl: data.html_url,
            publishedAt: data.published_at,
            body: data.body || "",
        };
    } catch {
        return null;
    }
}

function broadcastUpdateAvailable(result: UpdateCheckResult): void {
    openWindows.send(EventEndpoint.eUpdateAvailable, result);
}

export async function checkForUpdates(force = false): Promise<UpdateCheckResult> {
    const currentVersion = app.getVersion();

    const result: UpdateCheckResult = {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        releaseInfo: null,
    };

    if (!force) {
        const lastCheckTime = electronStore.get<number>(STORE_KEYS.lastCheckTime, 0);
        const now = Date.now();

        if (now - lastCheckTime < CHECK_INTERVAL_MS) {
            return result;
        }
    }

    const releaseInfo = await fetchLatestRelease();

    electronStore.set(STORE_KEYS.lastCheckTime, Date.now());

    if (!releaseInfo) {
        return result;
    }

    result.latestVersion = releaseInfo.version;
    result.releaseInfo = releaseInfo;

    const comparison = compareVersions(currentVersion, releaseInfo.version);
    result.updateAvailable = comparison > 0;

    if (result.updateAvailable) {
        const lastNotifiedVersion = electronStore.get<string>(STORE_KEYS.lastNotifiedVersion);

        if (lastNotifiedVersion !== releaseInfo.version) {
            electronStore.set(STORE_KEYS.lastNotifiedVersion, releaseInfo.version);
            broadcastUpdateAvailable(result);
        }
    }

    return result;
}

export function getAppVersion(): string {
    return app.getVersion();
}

export function getRuntimeVersions(): RuntimeVersions {
    return {
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
    };
}

export const versionService = {
    checkForUpdates,
    getAppVersion,
    getRuntimeVersions,
    compareVersions,
};
