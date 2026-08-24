import { mountVanilla } from "../../uikit/shared/mount";
import { MarkdownBlockView } from "./MarkdownBlockView";
import type { MarkdownBlockProps } from "./MarkdownBlockView";

export type { MarkdownBlockProps } from "./MarkdownBlockView";

export function MarkdownBlock(props: MarkdownBlockProps) {
    return mountVanilla(MarkdownBlockView, props);
}
