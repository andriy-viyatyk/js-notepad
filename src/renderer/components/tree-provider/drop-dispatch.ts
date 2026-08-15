import type { IFileLink, ILink, ITreeProvider } from "../../api/types/io.tree";
import { FILE_LINK, resolveTraits, type TraitDragPayload } from "../../core/traits";
import { LINK } from "../../editors/link-editor/linkTraits";
import { normalizeHref } from "./href-utils";

export type TraitDropAction =
    | { kind: "move"; items: ILink[] }
    | { kind: "import-links"; items: ILink[] }
    | { kind: "import-files"; files: IFileLink[] }
    | null;

/** Resolves an accepted trait payload into one provider-level action. `targetHref` is only used
 * for same-source self/descendant guards; callers retain target conversion and refresh. */
export function getTraitDropAction(
    provider: ITreeProvider,
    targetHref: string,
    payload: TraitDragPayload,
    allowLinkImport = true,
): TraitDropAction {
    const traits = resolveTraits(payload.typeId);
    const linkTrait = traits?.get(LINK);
    const items = linkTrait?.getItems(payload.data) ?? [];
    const sameSource = !!linkTrait
        && linkTrait.getSourceId?.(payload.data) === provider.sourceUrl;

    if (sameSource && items.length) {
        const target = normalizeHref(targetHref);
        if (items.some((item) => normalizeHref(item.href) === target)) return null;
        const sourceDirectories = items
            .filter((item) => item.isDirectory)
            .map((item) => normalizeHref(item.href) + "/");
        if (sourceDirectories.some((directory) => target.startsWith(directory))) return null;
        return { kind: "move", items };
    }

    if (allowLinkImport && provider.importLinks && linkTrait && items.length) {
        return { kind: "import-links", items };
    }

    const fileLink = traits?.get(FILE_LINK);
    const files = fileLink?.getFiles(payload.data) ?? [];
    if (provider.importFiles && files.length) {
        return { kind: "import-files", files };
    }
    return null;
}
