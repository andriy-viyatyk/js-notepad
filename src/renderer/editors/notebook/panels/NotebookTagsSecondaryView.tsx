import { createPortal } from "react-dom";
import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import { TagsListView } from "../TagsListView";
import { NotebookEditor } from "../NotebookEditor";

export default function NotebookTagsSecondaryView({ model, headerRef }: SecondaryViewProps) {
    // Type-guard early return must precede any hooks; the hook-using body lives
    // in an inner component (same pattern as LinkTagsSecondaryView).
    if (!(model instanceof NotebookEditor)) return null;
    return <NotebookTagsBody editor={model} headerRef={headerRef} />;
}

function NotebookTagsBody({
    editor,
    headerRef,
}: {
    editor: NotebookEditor;
    headerRef: SecondaryViewProps["headerRef"];
}) {
    const state = editor.state.use((s) => ({ tags: s.tags, selectedTag: s.selectedTag }));
    return (
        <>
            {headerRef && createPortal(<>Tags</>, headerRef)}
            <TagsListView
                tags={state.tags}
                value={state.selectedTag}
                onChange={editor.setSelectedTag}
                getCount={editor.getTagSize}
            />
        </>
    );
}
