import { TraitSet } from "./traits";

/**
 * Well-known type identifiers for the trait registry.
 * Each value is a serializable string used in drag-drop payloads.
 * New types are added here as they are registered.
 */
export enum TraitTypeId {
    ILink = "ILink",
    TodoItem = "TodoItem",
    Note = "Note",
    NotebookCategory = "NotebookCategory",
    RestRequest = "RestRequest",
    BrowserTab = "BrowserTab",
    PinnedLink = "PinnedLink",
    // Added in :
    PageTab = "PageTab",
    GridColumn = "GridColumn",
    MenuFolder = "MenuFolder",
    PinnedEditor = "PinnedEditor",
    // OS files dropped from the desktop (synthesized in the capture-phase drop handler).
    OsFile = "OsFile",
    // Mneme tree node — carries LINK (same-root move) + IFileLink (cross-root/cross-window copy).
    MnemeLink = "MnemeLink",
}

/**
 * Maps type identifier strings to TraitSets.
 * Enables cross-window drag-drop: drag payload carries serializable { typeId, data },
 * drop target resolves TraitSet from registry by typeId.
 */
class TraitRegistry {
    private map = new Map<string, TraitSet>();

    register(typeId: TraitTypeId, traits: TraitSet): void {
        this.map.set(typeId, traits);
    }

    get(typeId: string): TraitSet | undefined {
        return this.map.get(typeId);
    }

    has(typeId: string): boolean {
        return this.map.has(typeId);
    }
}

/** Global singleton trait registry. */
export const traitRegistry = new TraitRegistry();
