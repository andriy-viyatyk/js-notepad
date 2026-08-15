export { TraitKey, TraitSet, traited, isTraited, resolveTraited } from './traits';
export type { Traited, TraitType, PartialTraitType } from './traits';
export { TraitTypeId, traitRegistry } from './TraitRegistry';
export {
    setTraitDragData,
    getTraitDragData,
    hasTraitDragData,
    resolveTraits,
    allowDrop,
    isFileDrag,
    isLinkDroppable,
    setEventTraitDragData,
    getTraitDragDataFromEvent,
} from './dnd';
export type { TraitDragPayload } from './dnd';
export { FILE_LINK, makeOsFileDescriptor } from './fileLinkTraits';
export type { IFileLink, FileLinkTrait, OsFileData } from './fileLinkTraits';
export { LINK } from './linkTraits';
export type { LinkTrait, LinkDragData } from './linkTraits';
