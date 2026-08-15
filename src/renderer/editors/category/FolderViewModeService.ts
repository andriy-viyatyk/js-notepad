import type { CategoryViewMode } from "../../components/tree-provider";
import { fs } from "../../api/fs";

const FILE_NAME = "folderViewMode.json";

class FolderViewModeService {
    private modes: Record<string, CategoryViewMode> | null = null;

    /** Get the effective view mode for a folder (walks up ancestors). */
    async getViewMode(folderPath: string): Promise<CategoryViewMode> {
        if (!folderPath) return "list";
        const modes = await this.load();
        return this.resolveViewMode(modes, folderPath);
    }

    /** Get the effective view mode synchronously (from cache). Returns "list" if not loaded. */
    getViewModeSync(folderPath: string): CategoryViewMode {
        if (!this.modes || !folderPath) return "list";
        return this.resolveViewMode(this.modes, folderPath);
    }

    /** Set view mode for a folder. Removes entry if same as inherited from parent. */
    async setViewMode(folderPath: string, mode: CategoryViewMode): Promise<void> {
        if (!folderPath) return;
        const modes = await this.load();
        const inheritedMode = this.resolveViewMode(modes, getParentPath(normalizePath(folderPath)));
        if (mode === inheritedMode) {
            delete modes[normalizePath(folderPath)];
        } else {
            modes[normalizePath(folderPath)] = mode;
        }
        await this.save();
    }

    /** Resolve view mode by walking up the path hierarchy. */
    private resolveViewMode(modes: Record<string, CategoryViewMode>, folderPath: string): CategoryViewMode {
        let current = normalizePath(folderPath);
        while (current) {
            const mode = modes[current];
            if (mode) return mode;
            const parent = getParentPath(current);
            if (parent === current) break; // root
            current = parent;
        }
        return "list";
    }

    private async load(): Promise<Record<string, CategoryViewMode>> {
        if (this.modes) return this.modes;
        try {
            const content = await fs.getDataFile(FILE_NAME);
            this.modes = content ? JSON.parse(content) : {};
        } catch {
            this.modes = {};
        }
        return this.modes;
    }

    private async save(): Promise<void> {
        await fs.saveDataFile(FILE_NAME, JSON.stringify(this.modes, null, 2));
    }
}

/** Normalize path separators to forward slashes and lowercase for consistent lookup. */
function normalizePath(p: string): string {
    return p.replace(/\\/g, "/").toLowerCase();
}

/** Get parent path. Returns same path for root (e.g., "d:/"). */
function getParentPath(p: string): string {
    const lastSlash = p.lastIndexOf("/");
    if (lastSlash <= 0) return p;
    // Handle "d:/" root
    if (p[lastSlash - 1] === ":") return p.slice(0, lastSlash + 1);
    return p.slice(0, lastSlash);
}

export const folderViewModeService = new FolderViewModeService();
