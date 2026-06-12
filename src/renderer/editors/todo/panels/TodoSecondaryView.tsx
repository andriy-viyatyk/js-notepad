import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import { SideBarPanelHeader } from "../../../ui/secondary-views/SideBarPanelHeader";
import { TodoListPanel } from "../components/TodoListPanel";
import { TodoEditor } from "../TodoEditor";

export default function TodoSecondaryView({ model, headerRef, icon }: SecondaryViewProps) {
    // Type-guard early return must precede any hooks; the hook-using body lives
    // in an inner component (same pattern as NotebookTagsSecondaryView).
    if (!(model instanceof TodoEditor)) return null;
    return <TodoSecondaryViewBody editor={model} headerRef={headerRef} icon={icon} />;
}

function TodoSecondaryViewBody({
    editor,
    headerRef,
    icon,
}: {
    editor: TodoEditor;
    headerRef: SecondaryViewProps["headerRef"];
    icon: SecondaryViewProps["icon"];
}) {
    const state = editor.state.use((s) => ({
        lists: s.data.lists,
        tags: s.data.tags,
        selectedList: s.selectedList,
        selectedTag: s.selectedTag,
        listCounts: s.listCounts,
    }));
    return (
        <>
            <SideBarPanelHeader headerRef={headerRef} icon={icon} title="Todo" />
            <TodoListPanel
                pageModel={editor}
                lists={state.lists}
                selectedList={state.selectedList}
                listCounts={state.listCounts}
                tags={state.tags}
                selectedTag={state.selectedTag}
            />
        </>
    );
}
