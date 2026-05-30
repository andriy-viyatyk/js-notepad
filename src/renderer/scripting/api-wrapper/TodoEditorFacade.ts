import type { TodoEditor } from "../../editors/todo";
import type { TodoItem, TodoTag } from "../../editors/todo/todoTypes";

/**
 * Safe facade around TodoEditor for script access.
 * Implements the ITodoEditor interface from api/types/todo-editor.d.ts.
 *
 * - Items are read-only snapshots (ITodoItem projection of TodoItem)
 * - `done` is exposed as `completed`, `tag: null` becomes `""`
 * - Delete operations skip confirmation dialogs
 */
export class TodoEditorFacade {
    constructor(private readonly editor: TodoEditor) {}

    get items(): Array<{ readonly id: string; readonly title: string; readonly completed: boolean; readonly list: string; readonly tag: string }> {
        return this.editor.state.get().data.items.map(mapItem);
    }

    get lists(): string[] {
        return this.editor.state.get().data.lists;
    }

    get tags(): Array<{ readonly name: string; readonly color: string }> {
        return this.editor.state.get().data.tags.map(mapTag);
    }

    addItem(title: string): void {
        this.editor.addItem(title);
    }

    toggleItem(id: string): void {
        this.editor.toggleItem(id);
    }

    deleteItem(id: string): void {
        this.editor.deleteItem(id, true);
    }

    updateItemTitle(id: string, title: string): void {
        this.editor.updateItemTitle(id, title);
    }

    addList(name: string): boolean {
        return this.editor.addList(name);
    }

    renameList(oldName: string, newName: string): boolean {
        return this.editor.renameList(oldName, newName);
    }

    deleteList(name: string): void {
        this.editor.deleteList(name, true);
    }

    addTag(name: string): boolean {
        return this.editor.addTag(name);
    }

    selectList(name: string): void {
        this.editor.setSelectedList(name);
    }

    selectTag(name: string): void {
        this.editor.setSelectedTag(name);
    }

    setSearch(text: string): void {
        this.editor.setSearchText(text);
    }

    clearSearch(): void {
        this.editor.clearSearch();
    }
}

/** Map internal TodoItem → ITodoItem. */
function mapItem(item: TodoItem) {
    return {
        id: item.id,
        title: item.title,
        completed: item.done,
        list: item.list,
        tag: item.tag ?? "",
    };
}

/** Map internal TodoTag → ITodoTag. */
function mapTag(tag: TodoTag) {
    return {
        name: tag.name,
        color: tag.color,
    };
}
