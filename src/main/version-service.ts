import { app, net } from "electron";
import { electronStore } from "./e-store";
import { openWindows } from "./open-windows";
import { EventEndpoint } from "../ipc/api-types";
import { ReleaseInfo, RuntimeVersions, UpdateCheckResult } from "../ipc/api-param-types";

const GITHUB_API_URL = "https://api.github.com/repos/andriy-viyatyk/js-notepad/releases/latest";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

const STORE_KEYS = {
    lastCheckTime: "version-check-lastTime",
    lastNotifiedVersion: "version-check-lastNotified",
};

function parseVersion(version: string): number[] {
    const cleaned = version.replace(/^v/, "");
    return cleaned.split(".").map((part) => parseInt(part, 10) || 0);
}

export function compareVersions(current: string, latest: string): number {
    const currentParts = parseVersion(current);
    const latestParts = parseVersion(latest);

    const maxLength = Math.max(currentParts.length, latestParts.length);

    for (let i = 0; i < maxLength; i++) {
        const currentPart = currentParts[i] || 0;
        const latestPart = latestParts[i] || 0;

        if (latestPart > currentPart) return 1;
        if (latestPart < currentPart) return -1;
    }

    return 0;
}

async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
    try {
        const response = await net.fetch(GITHUB_API_URL, {
            headers: {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "js-notepad",
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
