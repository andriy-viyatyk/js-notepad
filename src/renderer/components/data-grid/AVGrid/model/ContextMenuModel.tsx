import { showAppPopupMenu } from "../../../../features/dialogs/poppers/showPopupMenu";
import { CopyIcon, DeleteIcon, PasteIcon, PlusIcon } from "../../../../theme/icons";
import { MenuItem } from "../../../overlay/PopupMenu";
import { AVGridModel } from "./AVGridModel";

export class ContextMenuModel<R> {
    readonly model: AVGridModel<R>;

    constructor(model: AVGridModel<R>) {
        this.model = model;
        this.model.events.content.onContextMenu.subscribe(this.onContentContextMenu);
    }

    private onContentContextMenu = async (e?: React.MouseEvent<HTMLDivElement>) => {
        if (!e) return;
        const { focus, getRowKey, onAddRows, onDeleteRows } = this.model.props;
        let headerKey = undefined as string | undefined;
        const isDataCell = Boolean((e.target as Element).closest(".data-cell"));
        if (!isDataCell) {
            const headerElement = (e.target as Element).closest(".header-cell");
            if (headerElement) {
                headerKey = headerElement.getAttribute("data-key") || undefined;
            }
        }

        if (this.model.models.editing.isFocusEditing(focus) || (e.target as HTMLElement).tagName === 'INPUT') {
            // call default context menu and disable blur while it is open
            e.stopPropagation();
            e.preventDefault();
            this.model.models.editing.disableBlur = true;
            await showAppPopupMenu(e.clientX, e.clientY, []);
            this.model.models.editing.disableBlur = false;
            return;
        }

        const canInsertRows = this.model.models.editing.canInsertRows;
        const menuItems: MenuItem[] = [];
        const selection = this.model.models.focus.getGridSelection();

        if (selection && isDataCell) {
            menuItems.push(
                {
                    label: 'Copy',
                    onClick: () => this.model.models.copyPaste.copySelection(),
                    icon: <CopyIcon />,
                    hotKey: "(Ctrl+C)",
                },
                {
                    label: "Copy as...",
                    icon: <CopyIcon />,
                    hotKey: ">",
                    items: [
                        {
                            label: "With Headers",
                            onClick: () => this.model.models.copyPaste.copySelection('copyWithHeaders'),
                            hotKey: "(Ctrl+Shift+C)",
                        },
                        {
                            label: "JSON",
                            onClick: () => this.model.models.copyPaste.copySelection('copyAsJson'),
                        },
                        {
                            label: "Formated (HTML Table)",
                            onClick: () => this.model.models.copyPaste.copySelection('copyAsHtmlTable'),
                        }
                    ]
                },
                {
                    label: 'Paste',
                    onClick: () => this.model.models.copyPaste.pasteFromClipboard(),
                    invisible: !this.model.props.editRow,
                    icon: <PasteIcon />,
                    hotKey: "(Ctrl+V)",
                },
                {
                    label: `Insert ${selection.rows.length} ${this.model.props.entity ?? "row"}${(selection.rows.length ?? 0) > 1 ? 's' : ''}`,
                    onClick: () => this.model.actions.addRows(selection.rows.length ?? 1, selection.rowRange[0], false),
                    invisible: !onAddRows || !selection.rows.length,
                    icon: <PlusIcon />,
                    startGroup: true,
                    disabled: !canInsertRows,
                    hotKey: !canInsertRows ? `Filtered or Sorted` : "(Ctrl+Insert)",
                },
                {
                    label: `Add ${selection.rows.length} ${this.model.props.entity ?? "row"}${(selection.rows.length ?? 0) > 1 ? 's' : ''}`,
                    onClick: () => this.model.actions.addRows(selection.rows.length ?? 1, undefined, true),
                    invisible: !onAddRows || !selection.rows.length,
                    icon: <PlusIcon />,
                    hotKey: selection.rows.length === 1 ? "(Last Row ? ↓)" : undefined,
                },
                {
                    label: `Delete ${selection.rows.length} ${this.model.props.entity ?? "row"}${(selection.rows.length ?? 0) > 1 ? 's' : ''}`,
                    onClick: () =>
                        this.model.actions.deleteRows(selection.rows.map(getRowKey) ?? []),
                    invisible: !onDeleteRows || !selection.rows.length,
                    icon: <DeleteIcon />,
                    hotKey: "(Ctrl+Delete)",
                },
                {
                    startGroup: true,
                    label: `Insert ${selection.columns.length} column${(selection.columns.length ?? 0) > 1 ? 's' : ''}`,
                    onClick: () => {
                        const firstColKey = selection.columns[0].key as string;
                        this.model.actions.addNewColumns(selection.columns.length ?? 1, firstColKey);
                    },
                    invisible: !this.model.props.onAddColumns || !selection.columns.length,
                    icon: <PlusIcon />,
                    hotKey: "(Ctrl+Shift+Insert)",
                    minor: true,
                },
                {
                    label: `Add ${selection.columns.length} column${(selection.columns.length ?? 0) > 1 ? 's' : ''}`,
                    onClick: () => this.model.actions.addNewColumns(selection.columns.length ?? 1),
                    invisible: !this.model.props.onAddColumns || !selection.columns.length,
                    icon: <PlusIcon />,
                    hotKey: selection.columns.length === 1 ? "(Last Column ? Ctrl + →)" : undefined,
                    minor: true,
                },
                {
                    label: `Delete ${selection.columns.length} column${(selection.columns.length ?? 0) > 1 ? 's' : ''}`,
                    onClick: () =>
                        this.model.actions.deleteColumns(selection.columns.map(c => c.key as string) ?? []),
                    invisible: !this.model.props.onDeleteColumns || !selection.columns.length,
                    icon: <DeleteIcon />,
                    hotKey: "(Ctrl+Shift+Delete)",
                    minor: true,
                }
            )
        }

        if (headerKey) {
            menuItems.push({
                label: 'Insert column',
                onClick: () => this.model.actions.addNewColumns(1, headerKey),
                invisible: !this.model.props.onAddColumns,
                icon: <PlusIcon />,
            }, {
                label: `Delete column`,
                onClick: () => this.model.actions.deleteColumns([headerKey]),
                invisible: !this.model.props.onDeleteColumns,
                icon: <DeleteIcon />,
            });
        }


        if (menuItems.length) {
            e.stopPropagation();
            e.preventDefault();
            showAppPopupMenu(e.clientX, e.clientY, menuItems);
        }
    }
}