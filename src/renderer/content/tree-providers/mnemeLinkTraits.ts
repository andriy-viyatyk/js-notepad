import type { ILink } from "../../api/types/io.tree";
import type { IFileLink } from "../../core/traits/fileLinkTraits";
import { FILE_LINK } from "../../core/traits/fileLinkTraits";
import { LINK } from "../../editors/link-editor/linkTraits";
import { TraitSet, TraitTypeId, traitRegistry } from "../../core/traits";
import { mnemeConnection } from "../../api/mneme-connection";
import { toMnemeHref } from "../mneme-link";

// ── MnemeLink — a dragged Mneme tree node ─────────────────────────────────────
//
// A Mneme node is BOTH a link and a file, so it implements two traits:
//   • LINK      → identity (href + sourceId); drives the same-root MOVE (rename).
//   • IFileLink → file content (name + getBytes); drives the cross-root / cross-window
//                 COPY (download → upload).
// The drop target dispatches purely by trait + source — same-source LINK → move, else
// IFileLink → import — so it never checks "is this a Mneme node". An OS file (FILE_LINK
// only) and a future http link (LINK + an IFileLink whose getBytes fetches) drop the same
// way with no tree changes.

/** Serializable drag data for a Mneme node. `items[].href` is the canonical
 *  `mneme://{root}/{path}`; `sourceId` is the source provider's `sourceUrl` (`mneme://{root}`) —
 *  equal to the drop target's `sourceUrl` ⇔ same root ⇒ move (else copy). */
export interface MnemeLinkData {
    items: ILink[];
    sourceId?: string;
}

/** Read a Mneme file's bytes by its canonical href via THIS window's shared connection.
 *  Works cross-window: the sidecar is shared and root names are global, so the receiving
 *  window can read any root by URI. Mirrors `MnemeProvider.readBinary`. */
async function readMnemeBytes(href: string): Promise<Uint8Array> {
    const client = mnemeConnection.getClient();
    if (!client) throw new Error("Mneme is not connected");
    const result = await client.readResource({ uri: toMnemeHref(href) });
    const first = result.contents?.[0] as { text?: string; blob?: string } | undefined;
    if (first?.text !== undefined) return Buffer.from(first.text, "utf8");
    if (first?.blob !== undefined) return Buffer.from(first.blob, "base64");
    return Buffer.from("");
}

const mnemeLinkTraits = new TraitSet()
    .add(LINK, {
        getItems: (data) => (data as MnemeLinkData).items,
        getSourceId: (data) => (data as MnemeLinkData).sourceId,
    })
    .add(FILE_LINK, {
        getFiles: (data): IFileLink[] =>
            (data as MnemeLinkData).items
                .filter((i) => !i.isDirectory) // files only — folders are not cross-root copied
                .map((i) => ({
                    name: i.title,
                    getBytes: () => readMnemeBytes(i.href),
                })),
    });

traitRegistry.register(TraitTypeId.MnemeLink, mnemeLinkTraits);
