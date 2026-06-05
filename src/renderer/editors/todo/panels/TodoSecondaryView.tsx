import { createPortal } from "react-dom";
import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import { TodoListPanel } from "../components/TodoListPanel";
import { TodoEditor } from "../TodoEditor";

export default function TodoSecondaryView({ model, headerRef }: SecondaryViewProps) {
    // Type-guard early return must precede any hooks; the hook-using body lives
    // in an inner component (same pattern as NotebookTagsSecondaryView).
    if (!(model instanceof TodoEditor)) return null;
    return <TodoSecondaryViewBody editor={model} headerRef={headerRef} />;
}

function TodoSecondaryViewBody({
    editor,
    headerRef,
}: {
    editor: TodoEditor;
    headerRef: SecondaryViewProps["headerRef"];
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
            {headerRef && createPortal(<>Todo</>, headerRef)}
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
