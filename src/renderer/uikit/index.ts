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
export { Panel } from "./Panel";
export type { PanelProps } from "./Panel";
export { Spacer } from "./Spacer";
export type { SpacerProps } from "./Spacer";
export { Splitter } from "./Splitter";
export type { SplitterProps } from "./Splitter";
export type { ToolbarProps } from "./Toolbar";

// Bootstrap components
export { Autocomplete } from "./Autocomplete";
export type { AutocompleteProps } from "./Autocomplete";
export { Breadcrumb } from "./Breadcrumb";
export type { BreadcrumbProps } from "./Breadcrumb";
export { Button } from "./Button";
export type { ButtonProps } from "./Button";
export { IconButton } from "./IconButton";
export type { IconButtonProps } from "./IconButton";
export { getIcon } from "../theme/icon-registry";
export type { IconName } from "../theme/icon-registry";
export { createIconElement, isIconName } from "./shared/slots";
export type { IconRef, SlotText } from "./shared/slots";
export type { SplitButtonProps } from "./SplitButton";
export { Input } from "./Input";
export type { InputProps } from "./Input";
export { DateInput } from "./DateInput";
export type { DateInputProps } from "./DateInput";
export type { LabelProps } from "./Label";
export { Checkbox } from "./Checkbox";
export type { CheckboxProps } from "./Checkbox";
export { Divider } from "./Divider";
export type { DividerProps } from "./Divider";
export { Dot } from "./Dot";
export type { DotProps, DotColor } from "./Dot";
export { Text } from "./Text";
export type { TextProps } from "./Text";
export { SegmentedControl } from "./SegmentedControl";
export type { SegmentedControlProps } from "./SegmentedControl";
export { RADIO_KEY } from "./RadioGroup";
export type { RadioGroupProps, IRadio } from "./RadioGroup";
export { Slider } from "./Slider";
export type { SliderProps } from "./Slider";
export { ProgressBar } from "./ProgressBar";
export type { ProgressBarProps } from "./ProgressBar";
export { Spinner } from "./Spinner";
export type { SpinnerProps } from "./Spinner";
export { Textarea } from "./Textarea";
export type { TextareaProps } from "./Textarea";
export type { PathInputProps } from "./PathInput/PathInputModel";
export { Tag } from "./Tag";
export type { TagProps } from "./Tag";
export { TagsInput } from "./TagsInput";
export type { TagsInputProps } from "./TagsInput";

// Overlay
export { overlayRegistry } from "./shared/overlayRegistry";
export { Popover } from "./Popover";
export type { PopoverProps, PopoverPosition } from "./Popover";
export { Tooltip } from "./Tooltip";
export { attachTooltip } from "./Tooltip";
export type { TooltipProps, TooltipOptions, TooltipAttachment } from "./Tooltip";
// Dialog and DialogContent are native-only; their public props remain type exports.
export type { DialogProps, DialogPosition } from "./Dialog";
export type { DialogContentProps } from "./Dialog/DialogContent";
export { AlertsBar, alertsBarModel } from "./Notification";
export type { NotificationProps, NotificationSeverity, AlertData } from "./Notification";
export { createProgress, showProgress, notifyProgress, addScreenLock, removeScreenLock } from "./Progress";
export type { ProgressHandle } from "./Progress";

// Menus
export { WithMenu, openMenu } from "./Menu";
export type { MenuProps, WithMenuProps, MenuItem, MenuAttachOptions, MenuHandle } from "./Menu";

// Lists
export type { CategoryListProps } from "./CategoryList";
export { SelectableRow } from "./SelectableRow";
export type { SelectableRowProps } from "./SelectableRow";
export { ListBox, LIST_ITEM_KEY } from "./ListBox";
export type { ListBoxProps, IListBoxItem, ListItemRenderContext } from "./ListBox";
export { ListItem } from "./ListBox";
export type { ListItemProps, SectionItemProps } from "./ListBox";
export type { MultiListBoxProps } from "./MultiListBox";
export type { MultiSelectProps } from "./MultiSelect/MultiSelectModel";
export { Select } from "./Select";
export type { SelectProps, ItemsSource, SelectItemsResult } from "./Select";
export { Tree, TREE_ITEM_KEY } from "./Tree";
export type {
    TreeProps,
    ITreeItem,
    TreeItemRenderContext,
    TreeRow,
} from "./Tree";
export { TreeItem } from "./Tree";
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
export { TruncatedText } from "./TruncatedText";
export type { TruncatedTextProps } from "./TruncatedText";
