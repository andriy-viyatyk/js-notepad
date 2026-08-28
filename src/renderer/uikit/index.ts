// UIKit — Persephone component library
// Components are exported here as they are implemented.
// See CLAUDE.md in this folder for authoring rules.

// Layout primitives
export type {
    CollapsiblePanelProps,
    CollapsiblePanelStackProps,
} from "./CollapsiblePanelStack";
export type { MinimapProps } from "./Minimap";
export type { ImageViewportProps, ImageViewportModel } from "./ImageViewport";
export type { SpacerProps } from "./Spacer/SpacerView";
export type { SplitterProps } from "./Splitter/SplitterView";
export type { ToolbarProps } from "./Toolbar";

// Bootstrap components
export type { AutocompleteProps } from "./Autocomplete/AutocompleteModel";
export type { BreadcrumbProps } from "./Breadcrumb";
export type { ButtonProps } from "./Button/ButtonView";
export type { IconButtonProps } from "./IconButton/IconButtonView";
export { getIcon } from "../theme/icon-registry";
export type { IconName } from "../theme/icon-registry";
export { createIconElement, isIconName } from "./shared/slots";
export type { IconRef, SlotText } from "./shared/slots";
export type { SplitButtonProps } from "./SplitButton";
export type { InputProps } from "./Input/InputView";
export type { DateInputProps } from "./DateInput";
export type { LabelProps } from "./Label";
export type { CheckboxProps } from "./Checkbox/CheckboxView";
export type { DividerProps } from "./Divider";
export type { DotProps, DotColor } from "./Dot/DotView";
export type { SegmentedControlProps } from "./SegmentedControl/SegmentedControlView";
export { RADIO_KEY } from "./RadioGroup";
export type { RadioGroupProps, IRadio } from "./RadioGroup";
export type { SliderProps } from "./Slider/SliderView";
export type { ProgressBarProps } from "./ProgressBar";
export type { SpinnerProps } from "./Spinner/SpinnerView";
export type { TextareaProps } from "./Textarea/TextareaView";
export type { PathInputProps } from "./PathInput/PathInputModel";
export type { TagProps } from "./Tag/TagView";
export type { TagsInputProps } from "./TagsInput";

// Overlay
export { overlayRegistry } from "./shared/overlayRegistry";
export type { PopoverProps, PopoverPosition } from "./Popover/PopoverModel";
export { attachTooltip } from "./Tooltip/attach-tooltip";
export type { TooltipOptions, TooltipAttachment } from "./Tooltip/attach-tooltip";
// Dialog and DialogContent are native-only; their public props remain type exports.
export type { DialogProps, DialogPosition } from "./Dialog";
export type { DialogContentProps } from "./Dialog/DialogContent";
export { alertsBarModel } from "./Notification";
export type { NotificationProps, NotificationSeverity, AlertData } from "./Notification";
export { createProgress, showProgress, notifyProgress, addScreenLock, removeScreenLock } from "./Progress";
export type { ProgressHandle } from "./Progress";

// Menus
export { openMenu } from "./Menu";
export type { MenuProps, MenuItem, MenuAttachOptions, MenuHandle } from "./Menu";

// Lists
export type { CategoryListProps } from "./CategoryList";
export { LIST_ITEM_KEY } from "./ListBox/types";
export type { ListBoxProps, IListBoxItem, ListItemRenderContext } from "./ListBox/types";
export type { ListItemProps } from "./ListBox/ListItem";
export type { SectionItemProps } from "./ListBox/SectionItem";
export type { MultiListBoxProps } from "./MultiListBox";
export type { MultiSelectProps } from "./MultiSelect/MultiSelectModel";
export type { SelectProps, ItemsSource, SelectItemsResult } from "./Select/SelectModel";
export { TREE_ITEM_KEY } from "./Tree/types";
export type {
    TreeProps,
    ITreeItem,
    TreeItemRenderContext,
    TreeRow,
} from "./Tree/types";
export type { TreeItemProps, TreeSectionItemProps } from "./Tree";

// VirtualGrid is the framework-free virtualization contract. VirtualGridView handles fixed-height
// rows; VirtualFlexGridView adds measured row heights.
export { VirtualGridView, VirtualFlexGridView, VirtualGridModel } from "./VirtualGrid";
export type {
    VirtualGridProps,
    VirtualGridOptions,
    VirtualGridStats,
    VirtualFlexCellFunc,
    VirtualFlexCellParams,
    VirtualFlexGridProps,
} from "./VirtualGrid";
// Native aliases retained for existing barrel consumers. New code should import from `./VirtualGrid`.
export type {
    RenderCellFunc as VirtualCellFunc,
    RenderCellParams as VirtualCellParams,
    RenderedCell,
} from "./VirtualGrid";

// Truncated text (overflow-ellipsis with hover title)
export type { TruncatedTextProps } from "./TruncatedText";
