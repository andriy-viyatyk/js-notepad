import styled from "@emotion/styled";
import clsx from "clsx";

import color from "../../theme/color";
import { pagesModel, filesModel, appSettings } from "../../store";
import { PageModel } from "../../editors/base";
import { Button } from "../../components/basic/Button";
import {
    CircleIcon,
    CloseIcon,
    CopyIcon,
    DuplicateIcon,
    FolderOpenIcon,
    GroupIcon,
    KeyOffIcon,
    LockIcon,
    RenameIcon,
    SaveIcon,
    UnlockIcon,
} from "../../theme/icons";
import { LanguageIcon } from "../../editors/base/LanguageIcon";
import { TComponentModel, useComponentModel } from "../../core/state/model";
import { MenuItem } from "../../components/overlay/PopupMenu";
import { WithPopupMenu } from "../../components/overlay/WithPopupMenu";
import { monacoLanguages } from "../../core/utils/monaco-languages";
import { useDrag, useDrop } from "react-dnd";
import { useMemo } from "react";
import { api } from "../../../ipc/renderer/api";
import { Tooltip } from "../../components/basic/Tooltip";
import {
    isTextFileModel,
    TextFileModel,
} from "../../editors/text";
import { PageDragData } from "../../../shared/types";
import { parseObject } from "../../core/utils/parse-utils";
import { showInputDialog } from "../dialogs/InputDialog";

export const minTabWidth = 80;
const ICON_SLOT = 20; // padding(2) + icon(16) + padding(2)
const TAB_PADDING = 4; // 2px left + 2px right
export const pinnedTabWidth = 2 * ICON_SLOT + TAB_PADDING; // language + modified dot
export const pinnedTabEncryptedWidth = 3 * ICON_SLOT + TAB_PADDING; // language + encryption + modified dot

const PageTabRoot = styled.div({
    display: "flex",
    alignItems: "center",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    border: `1px solid transparent`,
    borderBottom: "none",
    padding: "4px 2px 3px 2px",
    WebkitAppRegion: "no-drag",
    userSelect: "none",
    width: 200,
    minWidth: minTabWidth,
    flexShrink: 1,
    overflow: "hidden",
    "& .title-label": {
        flex: "1 1 auto",
        fontSize: 13,
        color: color.text.light,
        flexShrink: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    "&.temp .title-label": {
        fontStyle: "italic",
    },
    "&.deleted .title-label": {
        color: color.misc.red,
    },
    "&.deleted .modified-icon": {
        color: color.misc.red,
    },
    "& .close-button": {
        flexShrink: 0,
        visibility: "hidden",
    },
    "&.isActive": {
        backgroundColor: color.background.default,
        borderColor: color.border.default,
        color: color.text.default,
        "&:not(.deleted) .title-label": {
            color: color.text.default,
        },
        "& .close-button": {
            visibility: "visible",
        },
    },
    "&:hover": {
        borderColor: color.border.default,
        "& .close-button": {
            visibility: "visible",
        },
    },
    "&.isDraggOver": {
        backgroundColor: color.background.default,
    },
    "& .modified-icon": {
        display: "none",
    },
    "&.modified .close-button": {
        visibility: "visible",
    },
    "&.modified:not(:hover)": {
        "& .modified-icon": {
            display: "inline-block",
        },
        "& .close-icon": {
            display: "none",
        },
    },
    "& .encryption-icon": {
        paddingBottom: 4,
        marginRight: 2,
    },
    "& .empty-language": {
        width: 6,
        height: 14,
        flexShrink: 0,
        "&.withIcon": {
            width: 16,
            margin: "0 2px 0 4px",
            "& svg": {
                width: 16,
                height: 16,
            }
        },
    },
    "&:not(.isActive) > button": {
        cursor: "default",
    },
    "&.pinned": {
        width: pinnedTabWidth,
        minWidth: pinnedTabWidth,
        flexShrink: 0,
        position: "sticky",
        zIndex: 1,
        backgroundColor: color.background.dark,
        "&.isActive, &.isDraggOver": {
            backgroundColor: color.background.default,
        },
        "& .title-label": {
            flex: "0 0 auto",
        },
        "& .close-button": {
            visibility: "visible",
            pointerEvents: "none",
        },
        "& .close-icon": {
            display: "none",
        },
    },
    "&.pinned.modified .modified-icon": {
        display: "inline-block",
    },
    "&.pinned-encrypted": {
        width: pinnedTabEncryptedWidth,
        minWidth: pinnedTabEncryptedWidth,
    },
});

interface PageTabProps {
    model: PageModel;
    pinnedLeft?: number;
}

class PageTabModel extends TComponentModel<null, PageTabProps> {
    isActive = false;
    isGrouped = false;

    private setActiveLanuage = (langId: string) => {
        const currentActive = appSettings.get("tab-recent-languages");
        const newActive = [
            langId,
            ...currentActive.filter((l) => l !== langId),
        ];
        appSettings.set("tab-recent-languages", newActive);
    };

    getLanguageMenuItems = (): MenuItem[] => {
        const currLang = this.props.model.state.get().language;
        const activeLanguages = appSettings.get("tab-recent-languages");
        const menuItems: MenuItem[] = monacoLanguages
            .map((lang) => ({
                id: lang.id,
                label: lang.aliases[0] || lang.id,
                icon: <LanguageIcon language={lang.id} />,
                onClick: () => {
                    this.props.model.changeLanguage(lang.id);
                    this.setActiveLanuage(lang.id);
                },
                selected: currLang === lang.id,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));

        const firstItem = menuItems.find((item) => item.id === "plaintext");
        const activeItems = menuItems.filter(
            (item) =>
                item.id !== "plaintext" && activeLanguages.includes(item.id)
        );
        activeItems.sort((a, b) => {
            return (
                activeLanguages.indexOf(a.id) - activeLanguages.indexOf(b.id)
            );
        });
        const inactiveItems = menuItems.filter(
            (item) =>
                item.id !== "plaintext" && !activeLanguages.includes(item.id)
        );

        return [
            ...(firstItem ? [firstItem] : []),
            ...activeItems,
            ...inactiveItems,
        ];
    };

    handleContextMenu = (e: React.MouseEvent) => {
        if (!e.nativeEvent.menuItems) {
            e.nativeEvent.menuItems = [];
        }
        const isPinned = this.props.model.state.get().pinned;
        const pinUnpinItem: MenuItem = {
            label: isPinned ? "Unpin Tab" : "Pin Tab",
            onClick: () => {
                const pageId = this.props.model.state.get().id;
                if (isPinned) {
                    pagesModel.unpinTab(pageId);
                } else {
                    pagesModel.pinTab(pageId);
                }
            },
        };
        const menuItems: MenuItem[] = [];
        if (isPinned) {
            menuItems.push(pinUnpinItem);
        }
        if (!isPinned) {
            menuItems.push({
                label: "Close Tab",
                onClick: () => {
                    this.props.model.close(undefined);
                },
                startGroup: !isPinned && menuItems.length > 0,
            });
        }
        menuItems.push({
            label: "Close Other Tabs",
            disabled: pagesModel.state.get().pages.length <= 1,
            onClick: () => {
                pagesModel.closeOtherPages(
                    this.props.model.state.get().id
                );
            },
            startGroup: isPinned,
        });
        if (!isPinned) {
            menuItems.push(
                {
                    label: "Close Tabs to the Right",
                    disabled: pagesModel.isLastPage(
                        this.props.model.state.get().id
                    ),
                    onClick: () => {
                        pagesModel.closeToTheRight(
                            this.props.model.state.get().id
                        );
                    },
                },
                {
                    label: "Open in New Window",
                    onClick: () => {
                        api.addDragEvent(this.getDragData());
                    },
                },
                {
                    label: "Duplicate Tab",
                    icon: <DuplicateIcon />,
                    onClick: () => {
                        pagesModel.duplicatePage(this.props.model.id);
                    },
                },
                {
                    ...pinUnpinItem,
                    startGroup: true,
                },
            );
        }
        menuItems.push(
            {
                startGroup: true,
                label: "Save",
                icon: <SaveIcon />,
                onClick: () => {
                    if (this.props.model instanceof TextFileModel) {
                        this.props.model.saveFile(false);
                    }
                },
                disabled: !(this.props.model instanceof TextFileModel),
            },
            {
                label: "Save As...",
                icon: <SaveIcon />,
                onClick: () => {
                    if (this.props.model instanceof TextFileModel) {
                        this.props.model.saveFile(true);
                    }
                },
                disabled: !(this.props.model instanceof TextFileModel),
            },
            {
                label: "Rename",
                icon: <RenameIcon />,
                onClick: this.renameTab,
                disabled: !isTextFileModel(this.props.model),
            },
            {
                label: "Show in File Explorer",
                icon: <FolderOpenIcon />,
                onClick: () => {
                    api.showItemInFolder(
                        (this.props.model.state.get() as any).filePath
                    );
                },
                disabled: !(this.props.model.state.get() as any).filePath,
            },
            {
                label: "Copy File Path",
                icon: <CopyIcon />,
                onClick: () => {
                    navigator.clipboard.writeText(
                        (this.props.model.state.get() as any).filePath
                    );
                },
                disabled: !(this.props.model.state.get() as any).filePath,
            },
            {
                label: "Decrypt",
                icon: <UnlockIcon />,
                onClick: () => {
                    if (isTextFileModel(this.props.model)) {
                        this.props.model.showEncryptionDialog();
                    }
                },
                disabled: !(
                    isTextFileModel(this.props.model) &&
                    this.props.model.encripted
                ),
                startGroup: true,
            },
            {
                label:
                    isTextFileModel(this.props.model) &&
                    !this.props.model.withEncription
                        ? "Encrypt"
                        : "Change Password",
                icon: <LockIcon />,
                onClick: () => {
                    if (isTextFileModel(this.props.model)) {
                        this.props.model.showEncryptionDialog();
                    }
                },
                disabled:
                    !isTextFileModel(this.props.model) ||
                    this.props.model.encripted,
            },
            {
                label: "Make Unencrypted",
                icon: <KeyOffIcon />,
                onClick: () => {
                    if (isTextFileModel(this.props.model)) {
                        this.props.model.makeUnencrypted();
                    }
                },
                disabled:
                    !isTextFileModel(this.props.model) ||
                    !this.props.model.decripted,
            },
        );
        e.nativeEvent.menuItems.push(...menuItems);
    };

    private getDragData = (drop = false): PageDragData => {
        return {
            sourceWindowIndex: drop ? undefined : filesModel.windowIndex,
            targetWindowIndex: drop ? filesModel.windowIndex : undefined,
            page: this.props.model.getRestoreData(),
        };
    };

    private renameTab = async () => {
        const model = this.props.model;
        if (isTextFileModel(model)) {
            const pageTitle = model.state.get().title;
            const inputResult = await showInputDialog({
                title: "Rename File",
                message: "Enter new file name:",
                value: pageTitle,
                buttons: ["Rename", "Cancel"],
                selectAll: true,
            });
            if (inputResult.button === "Rename" && inputResult.value) {
                const newName = inputResult.value;
                await model.renameFile(newName);
            }
        }
    }

    handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData(
            "application/js-notepad-tab",
            JSON.stringify(this.getDragData())
        );
        e.dataTransfer.effectAllowed = "move";
    };

    handleDragEnd = (e: React.DragEvent) => {
        const droppedOutside =
            e.clientX < 0 ||
            e.clientX > window.innerWidth ||
            e.clientY < 0 ||
            e.clientY > window.innerHeight;
        if (droppedOutside) {
            const dropData: PageDragData = this.getDragData();
            dropData.dropPosition = { x: e.screenX, y: e.screenY };
            api.addDragEvent(dropData);
        }
    };

    handleDrop = (e: React.DragEvent) => {
        const dataStr = e.dataTransfer?.getData("application/js-notepad-tab");
        const data = parseObject(dataStr);
        if (
            data &&
            data.sourceWindowIndex !== undefined &&
            data.sourceWindowIndex !== filesModel.windowIndex
        ) {
            api.addDragEvent(this.getDragData(true));
            e.preventDefault();
            e.stopPropagation();
        }
    };

    closeClick = () => {
        if (this.isGrouped) {
            pagesModel.ungroup(this.props.model.id);
            pagesModel.fixCompareMode();
            pagesModel.showPage(this.props.model.id);
        } else {
            this.props.model.close(undefined);
        }
    };

    handleClick = (e: React.MouseEvent) => {
        const thisPageId = this.props.model.state.get().id;
        if (e.ctrlKey) {
            const activeId = pagesModel.activePage?.state.get().id;
            if (activeId !== thisPageId) {
                pagesModel.groupTabs(activeId, thisPageId, true);
            }
        }

        pagesModel.showPage(thisPageId);
    };

    encryptionClick = () => {
        if (isTextFileModel(this.props.model)) {
            if (this.props.model.encripted) {
                this.props.model.showEncryptionDialog();
            } else if (this.props.model.decripted) {
                this.props.model.encryptWithCurrentPassword();
            }
        }
    };
}

export function PageTab(props: PageTabProps) {
    const tabModel = useComponentModel(props, PageTabModel, null);
    const model = props.model;
    tabModel.isGrouped = pagesModel.isGrouped(model.id);
    tabModel.isActive =
        pagesModel.activePage === model || pagesModel.groupedPage === model;
    const { title, modified, language, id, filePath, deleted, temp, pinned } =
        model.state.use((s) => ({
            title: s.title,
            modified: s.modified,
            language: s.language,
            id: s.id,
            filePath: s.filePath,
            deleted: (s as any).deleted ?? false,
            password: (s as any).password,
            encripted: (s as any).encripted ?? false,
            temp: (s as any).temp ?? false,
            pinned: s.pinned ?? false,
        }));

    const [{ isDragging }, drag] = useDrag({
        type: "COLUMN_DRAG",
        item: { key: id },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
        canDrag: () => true,
    });

    const [{ isOver }, drop] = useDrop({
        accept: ["COLUMN_DRAG", "FREEZE_DRAG"],
        drop({ key: dropKey }: { key: string }) {
            pagesModel.moveTab(dropKey, id);
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
            canDrop: monitor.canDrop(),
        }),
        canDrop: () => true,
    });

    const activeLanguages = appSettings.use("tab-recent-languages");
    const languageMenuItems = useMemo(
        () => tabModel.getLanguageMenuItems(),
        [language, activeLanguages]
    );

    const encripted = isTextFileModel(model) && model.encripted;
    const decripted = isTextFileModel(model) && model.decripted;
    const isPinnedEncrypted = pinned && (encripted || decripted);

    return (
        <PageTabRoot
            ref={(node) => {
                drag(node);
                drop(node);
            }}
            className={clsx("page-tab", {
                isActive: tabModel.isActive,
                modified,
                isDraggOver: isOver,
                temp,
                deleted,
                pinned,
                "pinned-encrypted": isPinnedEncrypted,
            })}
            style={pinned && props.pinnedLeft !== undefined ? { left: props.pinnedLeft } : undefined}
            onClick={tabModel.handleClick}
            onContextMenu={tabModel.handleContextMenu}
            draggable={!pinned}
            onDragStart={pinned ? undefined : tabModel.handleDragStart}
            onDragEnd={pinned ? undefined : tabModel.handleDragEnd}
            onDrop={pinned ? undefined : tabModel.handleDrop}
        >
            {model.noLanguage ? (
                <span
                    className={clsx("empty-language", {
                        withIcon: model.getIcon,
                    })}
                >
                    {model.getIcon ? model.getIcon() : null}
                </span>
            ) : (
                <WithPopupMenu items={languageMenuItems}>
                    {(setOpen) => (
                        <Button
                            size="small"
                            type="icon"
                            onClick={(e) => {
                                if (!tabModel.isActive && e.ctrlKey) {
                                    tabModel.handleClick(e);
                                    return;
                                }
                                pagesModel.showPage(model.state.get().id);
                                if (tabModel.isActive) {
                                    setOpen(e.currentTarget);
                                }
                            }}
                            title={language}
                        >
                            <LanguageIcon
                                language={language}
                                fileName={title}
                            />
                        </Button>
                    )}
                </WithPopupMenu>
            )}
            <span className="title-label" data-tooltip-id={id}>
                {(encripted || decripted) && (
                    <span
                        className="encryption-icon"
                        onClick={tabModel.encryptionClick}
                        title={encripted ? "Decrypt File" : "Encrypt File"}
                    >
                        {encripted ? "🔒" : "🔓"}
                    </span>
                )}
                {!pinned && title}
            </span>
            {Boolean(filePath) && !isDragging && (
                <Tooltip
                    id={id}
                    place="bottom"
                    delayShow={1500}
                >
                    {filePath}
                </Tooltip>
            )}
            <Button
                size="small"
                type="icon"
                onClick={tabModel.closeClick}
                title={tabModel.isGrouped ? "Ungroup" : "Close Page"}
                className="close-button"
                background={tabModel.isActive ? "default" : "dark"}
            >
                {tabModel.isGrouped ? (
                    <GroupIcon className="close-icon" />
                ) : (
                    <CloseIcon className="close-icon" />
                )}
                <CircleIcon className="modified-icon" />
            </Button>
        </PageTabRoot>
    );
}
