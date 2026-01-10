import styled from "@emotion/styled";
import clsx from "clsx";

import color from "../theme/color";
import { pagesModel } from "../model/pages-model";
import { PageModel } from "../model/page-model";
import { Button } from "../controls/Button";
import { CircleIcon, CloseIcon, GroupIcon } from "../theme/icons";
import { LanguageIcon } from "./shared/LanguageIcon";
import { TComponentModel, useComponentModel } from "../common/classes/model";
import { MenuItem } from "../controls/PopupMenu";
import { WithPopupMenu } from "../controls/WithPopupMenu";
import { monacoLanguages } from "../common/monacoLanguages";
import { useDrag, useDrop } from "react-dnd";
import { useMemo } from "react";
import { api } from "../../ipc/renderer/api";
import { Tooltip } from "../controls/Tooltip";
import {
    isTextFileModel,
    TextFileModel,
} from "./text-file-page/TextFilePage.model";
import { filesModel } from "../model/files-model";
import { PageDragData } from "../../shared/types";
import { parseObject } from "../common/parseUtils";
import { appSettings } from "../model/appSettings";

export const minTabWidth = 80;

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
    "&.deleted .title-label": {
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
});

interface PageTabProps {
    model: PageModel;
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
        e.nativeEvent.menuItems.push(
            ...[
                {
                    label: "Close Tab",
                    onClick: () => {
                        this.props.model.close(undefined);
                    },
                    startGroup: true,
                },
                {
                    label: "Close Other Tabs",
                    disabled: pagesModel.state.get().pages.length <= 1,
                    onClick: () => {
                        pagesModel.closeOtherPages(
                            this.props.model.state.get().id
                        );
                    },
                },
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
                    startGroup: true,
                    label: "Save As...",
                    onClick: () => {
                        if (this.props.model instanceof TextFileModel) {
                            this.props.model.saveFile(true);
                        }
                    },
                    disabled: !(this.props.model instanceof TextFileModel),
                },
                {
                    label: "Reveal in File Explorer",
                    onClick: () => {
                        api.showItemInFolder(
                            (this.props.model.state.get() as any).filePath
                        );
                    },
                    disabled: !(this.props.model.state.get() as any).filePath,
                },
                {
                    label: "Copy File Path",
                    onClick: () => {
                        navigator.clipboard.writeText(
                            (this.props.model.state.get() as any).filePath
                        );
                    },
                    disabled: !(this.props.model.state.get() as any).filePath,
                },
                {
                    label: "Decrypt",
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
                    onClick: () => {
                        if (isTextFileModel(this.props.model)) {
                            this.props.model.makeUnencrypted();
                        }
                    },
                    disabled:
                        !isTextFileModel(this.props.model) ||
                        !this.props.model.decripted,
                }
            ]
        );
    };

    private getDragData = (drop = false): PageDragData => {
        return {
            sourceWindowIndex: drop ? undefined : filesModel.windowIndex,
            targetWindowIndex: drop ? filesModel.windowIndex : undefined,
            page: this.props.model.getRestoreData(),
        };
    };

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
                pagesModel.groupTabs(activeId, thisPageId);
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
    const { title, modified, language, id, filePath, deleted } =
        model.state.use((s) => ({
            title: s.title,
            modified: s.modified,
            language: s.language,
            id: s.id,
            filePath: (s as any).filePath,
            deleted: (s as any).deleted ?? false,
            password: (s as any).password,
            encripted: (s as any).encripted ?? false,
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
                deleted,
            })}
            onClick={tabModel.handleClick}
            onContextMenu={tabModel.handleContextMenu}
            draggable
            onDragStart={tabModel.handleDragStart}
            onDragEnd={tabModel.handleDragEnd}
            onDrop={tabModel.handleDrop}
        >
            <WithPopupMenu items={languageMenuItems}>
                {(setOpen) => (
                    <Button
                        size="small"
                        type="icon"
                        onClick={(e) => {
                            pagesModel.showPage(model.state.get().id);
                            setOpen(e.currentTarget);
                        }}
                        title={language}
                    >
                        <LanguageIcon language={language} />
                    </Button>
                )}
            </WithPopupMenu>
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
                {title}
            </span>
            {Boolean(filePath) && !isDragging && (
                <Tooltip id={id}>{filePath}</Tooltip>
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
