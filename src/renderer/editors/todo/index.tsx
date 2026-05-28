import { TComponentState } from "../../core/state/state";
import { TodoEditor, defaultTodoEditorState } from "./TodoEditor";
import { TodoBody } from "./TodoBody";
import { TextChrome } from "../base/v4/TextChrome";
import { Input } from "../../uikit/Input/Input";
import { IconButton } from "../../uikit/IconButton/IconButton";
import { CloseIcon } from "../../theme/icons";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-556 — native Todo editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorInstance` is a v4-native TodoEditor instance.
 *
 * Right-toolbar bits (TD17 — relocates legacy TodoView's portal search input):
 *   - search Input (with clear button when text is present)
 *
 * Footer bits:
 *   - item count: "<filtered> of <total> items" / "<total> items"
 *
 * No left-toolbar contributions (no breadcrumb).
 */

interface TodoToolbarBitsProps {
    model: TodoEditor;
}

function TodoToolbarBits({ model: editor }: TodoToolbarBitsProps) {
    const searchText = editor.state.use((s) => s.searchText);
    return (
        <Input
            name="todo-search"
            value={searchText}
            onChange={editor.setSearchText}
            placeholder="Search..."
            endSlot={
                searchText ? (
                    <IconButton
                        name="todo-search-clear"
                        size="sm"
                        icon={<CloseIcon />}
                        title="Clear search"
                        onClick={editor.clearSearch}
                    />
                ) : null
            }
        />
    );
}

function TodoFooterBits({ model: editor }: TodoToolbarBitsProps) {
    const { filteredCount, totalCount } = editor.state.use((s) => ({
        filteredCount: s.filteredItems.length,
        totalCount: s.data.items.length,
    }));
    return (
        <span>
            {filteredCount === totalCount
                ? `${totalCount} items`
                : `${filteredCount} of ${totalCount} items`}
        </span>
    );
}

function TodoEditorView({ model }: { model: EditorModel }) {
    const todo = model as TodoEditor;
    return (
        <TextChrome
            model={model}
            rightToolbarContributions={<TodoToolbarBits model={todo} />}
            footerContributions={<TodoFooterBits model={todo} />}
        >
            <TodoBody model={todo} />
        </TextChrome>
    );
}

export const todoModule: EditorModule = {
    createEditor: () =>
        new TodoEditor(new TComponentState({ ...defaultTodoEditorState })),
    Component: TodoEditorView,
};

export { TodoEditor, defaultTodoEditorState };
export type { TodoEditorState, TodoQueueEvent } from "./TodoEditor";
