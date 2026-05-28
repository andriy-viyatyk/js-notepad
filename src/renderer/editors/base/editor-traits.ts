import { TraitKey } from "../../core/traits/traits";
import type { IContentHost } from "./IContentHost";

export interface IContentHostTrait {
    extractContentHost(): IContentHost;
}

export const CONTENT_HOST_TRAIT = new TraitKey<IContentHostTrait>("content-host");
