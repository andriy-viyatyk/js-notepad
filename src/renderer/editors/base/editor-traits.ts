import { TraitKey } from "../../core/traits/traits";
import type { IContentHost } from "./IContentHost";

/**
 * Editor-side contract for giving up a content host. Implemented by every
 * text-bearing editor; absent on PDF / Image / Browser / etc.
 *
 * The NEW editor calls this on the OLD editor's trait inside its own
 * `switchFrom(oldEditor)`:
 *
 *     const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
 *     if (!trait) throw new Error("Cannot switchFrom: no CONTENT_HOST_TRAIT");
 *     this._host = trait.extractContentHost() as TextFileModel;
 *
 * After `extractContentHost()`:
 *  - the editor's internal host reference is null;
 *  - the editor's `dispose()` will NOT call `host.dispose()`;
 *  - calling again throws.
 *
 * See [`doc/epics/EPIC-028-editor-architecture/mockups/traits.ts`](../../../../../doc/epics/EPIC-028-editor-architecture/mockups/traits.ts).
 */
export interface IContentHostTrait {
    extractContentHost(): IContentHost;
}

export const CONTENT_HOST_TRAIT = new TraitKey<IContentHostTrait>("content-host");
