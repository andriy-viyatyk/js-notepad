import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import { SideBarPanelHeader } from "../../../ui/secondary-views/SideBarPanelHeader";
import { TagsListView } from "../TagsListView";
import { NotebookEditor } from "../NotebookEditor";

export default function NotebookTagsSecondaryView({ model, headerRef, icon }: SecondaryViewProps) {
    // Type-guard early return must precede any hooks; the hook-using body lives
    // in an inner component (same pattern as LinkTagsSecondaryView).
    if (!(model instanceof NotebookEditor)) return null;
    return <NotebookTagsBody editor={model} headerRef={headerRef} icon={icon} />;
}

function NotebookTagsBody({
    editor,
    headerRef,
    icon,
}: {
    editor: NotebookEditor;
    headerRef: SecondaryViewProps["headerRef"];
    icon: SecondaryViewProps["icon"];
}) {
    const state = editor.state.use((s) => ({ tags: s.tags, selectedTag: s.selectedTag }));
    return (
        <>
            <SideBarPanelHeader headerRef={headerRef} icon={icon} title="Tags" />
            <TagsListView
                tags={state.tags}
                value={state.selectedTag}
                onChange={editor.setSelectedTag}
                getCount={editor.getTagSize}
            />
        </>
    );
}
