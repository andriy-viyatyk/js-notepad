import { AnyStory } from "./storyTypes";

// Keep this importer touched when story files change extension so Vite drops stale specifiers.
// US-1123 converted the composite/stateful demo wrappers; US-1124 converted the floating-layer
// demo wrappers; US-1125 converted the virtualized data-view and dropdown wrappers; US-1126
// converted DateInput. Keep this
// importer touched when story files change extension so Vite drops stale
// specifiers.

// Layout
import { collapsiblePanelStackStory } from "../../uikit/CollapsiblePanelStack/CollapsiblePanelStack.story";
import { spacerStory }   from "../../uikit/Spacer/Spacer.story";
import { splitterStory } from "../../uikit/Splitter/Splitter.story";
import { toolbarStory }  from "../../uikit/Toolbar/Toolbar.story";

// Bootstrap
import { breadcrumbStory }       from "../../uikit/Breadcrumb/Breadcrumb.story";
import { buttonStory }           from "../../uikit/Button/Button.story";
import { iconButtonStory }       from "../../uikit/IconButton/IconButton.story";
import { inputStory }            from "../../uikit/Input/Input.story";
import { dateInputStory }        from "../../uikit/DateInput/DateInput.story";
import { labelStory }            from "../../uikit/Label/Label.story";
import { checkboxStory }         from "../../uikit/Checkbox/Checkbox.story";
import { dividerStory }          from "../../uikit/Divider/Divider.story";
import { dotStory }              from "../../uikit/Dot/Dot.story";
import { segmentedControlStory } from "../../uikit/SegmentedControl/SegmentedControl.story";
import { radioGroupStory }       from "../../uikit/RadioGroup/RadioGroup.story";
import { sliderStory }           from "../../uikit/Slider/Slider.story";
import { progressBarStory }      from "../../uikit/ProgressBar/ProgressBar.story";
import { spinnerStory }          from "../../uikit/Spinner/Spinner.story";
import { textareaStory }         from "../../uikit/Textarea/Textarea.story";
import { pathInputStory }        from "../../uikit/PathInput/PathInput.story";
import { truncatedTextStory }    from "../../uikit/TruncatedText/TruncatedText.story";
import { tagStory }              from "../../uikit/Tag/Tag.story";
import { tagsInputStory }        from "../../uikit/TagsInput/TagsInput.story";
import { splitButtonStory }      from "../../uikit/SplitButton/SplitButton.story";

// Overlay
import { popoverStory }          from "../../uikit/Popover/Popover.story";
import { tooltipStory }          from "../../uikit/Tooltip/Tooltip.story";
import { dialogStory }           from "../../uikit/Dialog/Dialog.story";
import { notificationStory }     from "../../uikit/Notification/Notification.story";
import { menuStory }             from "../../uikit/Menu/Menu.story";
import { progressStory }         from "../../uikit/Progress/Progress.story";

// Media
import { minimapStory }           from "../../uikit/Minimap/Minimap.story";
import { imageViewportStory }     from "../../uikit/ImageViewport/ImageViewport.story";

// Lists
import { selectableRowStory }     from "../../uikit/SelectableRow/SelectableRow.story";
import { autocompleteStory }     from "../../uikit/Autocomplete/Autocomplete.story";
import { categoryListStory }     from "../../uikit/CategoryList/CategoryList.story";
import { listBoxStory }          from "../../uikit/ListBox/ListBox.story";
import { multiListBoxStory }     from "../../uikit/MultiListBox/MultiListBox.story";
import { multiSelectStory }      from "../../uikit/MultiSelect/MultiSelect.story";
import { selectStory }           from "../../uikit/Select/Select.story";
import { treeStory }             from "../../uikit/Tree/Tree.story";
import { renderGridStory }       from "./renderGridStory";
import { dataGridStory }         from "../../uikit/DataGrid/DataGrid.story";

// Git
import { gitTreeStory }          from "../../components/git-tree/GitTree.story";

export const ALL_STORIES: AnyStory[] = [
    collapsiblePanelStackStory, spacerStory, splitterStory, toolbarStory,
    breadcrumbStory,
    buttonStory, iconButtonStory, splitButtonStory, inputStory, dateInputStory, labelStory, checkboxStory, dividerStory, dotStory,
    segmentedControlStory, radioGroupStory, sliderStory, progressBarStory, spinnerStory, textareaStory, pathInputStory,
    truncatedTextStory,
    tagStory, tagsInputStory,
    popoverStory, tooltipStory, dialogStory, notificationStory, menuStory, progressStory,
    minimapStory, imageViewportStory,
    selectableRowStory, autocompleteStory, categoryListStory, listBoxStory, multiListBoxStory, multiSelectStory, selectStory, treeStory,
    renderGridStory, dataGridStory,
    gitTreeStory,
];

export function findStory(id: string): AnyStory | undefined {
    return ALL_STORIES.find((s) => s.id === id);
}

export function storiesBySection(): Map<string, AnyStory[]> {
    const out = new Map<string, AnyStory[]>();
    for (const s of ALL_STORIES) {
        const list = out.get(s.section) ?? [];
        list.push(s);
        out.set(s.section, list);
    }
    return out;
}
