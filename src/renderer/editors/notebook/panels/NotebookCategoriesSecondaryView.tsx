import { useCallback, useMemo } from "react";
import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import { SideBarPanelHeader } from "../../../ui/secondary-views/SideBarPanelHeader";
import { Panel } from "../../../uikit/Panel";
import { Tree } from "../../../uikit/Tree";
import { TraitTypeId, type TraitDragPayload, resolveTraits } from "../../../core/traits";
import { LINK } from "../../link-editor/linkTraits";
import { buildCategoryTreeItems, type CategoryItem } from "../category-tree";
import { NotebookEditor } from "../NotebookEditor";

export default function NotebookCategoriesSecondaryView({ model, headerRef, icon }: SecondaryViewProps) {
    // Type-guard early return must precede any hooks; the hook-using body lives
    // in an inner component (same pattern as LinkCategorySecondaryView).
    if (!(model instanceof NotebookEditor)) return null;
    return <NotebookCategoriesBody editor={model} headerRef={headerRef} icon={icon} />;
}

function NotebookCategoriesBody({
    editor,
    headerRef,
    icon,
}: {
    editor: NotebookEditor;
    headerRef: SecondaryViewProps["headerRef"];
    icon: SecondaryViewProps["icon"];
}) {
    const state = editor.state.use((s) => ({
        categories: s.categories,
        categoriesSize: s.categoriesSize,
        selectedCategory: s.selectedCategory,
    }));

    const categoryTreeItems = useMemo<CategoryItem[]>(
        () => buildCategoryTreeItems(state.categories, editor.getCategorySize),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- categoriesSize is read indirectly via editor.getCategorySize; needed to rebuild the tree when sizes change
        [state.categories, state.categoriesSize, editor],
    );

    const isCategorySelected = useCallback(
        (item: CategoryItem) => item.category === state.selectedCategory,
        [state.selectedCategory],
    );

    const canCategoryTraitDrop = useCallback(
        (_dropItem: CategoryItem, payload: TraitDragPayload) => {
            if (payload.typeId === TraitTypeId.Note) return true;
            if (payload.typeId === TraitTypeId.NotebookCategory) return true;
            const traits = resolveTraits(payload.typeId);
            return !!traits?.get(LINK);
        },
        [],
    );

    return (
        <>
            <SideBarPanelHeader headerRef={headerRef} icon={icon} title="Categories" />
            <Panel
                name="notebook-categories-pane"
                direction="column"
                flex={1}
                overflow="hidden"
                paddingLeft="sm"
            >
                <Tree<CategoryItem>
                    name="notebook-categories-tree"
                    items={categoryTreeItems}
                    isSelected={isCategorySelected}
                    onChange={(item) => editor.categoryItemClick(item)}
                    traitTypeId={TraitTypeId.NotebookCategory}
                    getDragData={(item) => editor.getCategoryDragData(item)}
                    acceptsDrop
                    canTraitDrop={(target, payload) => canCategoryTraitDrop(target, payload)}
                    onTraitDrop={(target, payload) => editor.categoryTraitDrop(target, payload)}
                    defaultExpandAll
                />
            </Panel>
        </>
    );
}
