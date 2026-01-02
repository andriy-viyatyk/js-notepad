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
import { api } from "../ipc/renderer/api";
import { Tooltip } from "../controls/Tooltip";
import { TextFileModel } from "./text-file-page/TextFilePage.model";
import { filesModel } from "../model/files-model";
import { PageDragData } from "../shared/types";
import { parseObject } from "../common/parseUtils";

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
    "& .close-button": {
        flexShrink: 0,
        visibility: "hidden",
    },
    "&.isActive": {
        backgroundColor: color.background.default,
        borderColor: color.border.default,
        color: color.text.default,
        "& .title-label": {
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
});

interface PageTabProps {
    model: PageModel;
}

class PageTabModel extends TComponentModel<null, PageTabProps> {
    isActive = false;
    isGrouped = false;

    getLanguageMenuItems = (): MenuItem[] => {
        const currLang = this.props.model.state.get().language;
        return monacoLanguages.map((lang) => ({
            label: lang.aliases[0] || lang.id,
            icon: <LanguageIcon language={lang.id} />,
            onClick: () => {
                this.props.model.changeLanguage(lang.id);
            },
            selected: currLang === lang.id,
        }));
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
                    label: "Group with Left",
                    onClick: () => {
                        pagesModel.groupWithLeft(this.props.model.id);
                    },
                    disabled: !pagesModel.canGroupWithLeft(this.props.model.id),
                },
                {
                    label: "Group with Right",
                    onClick: () => {
                        pagesModel.groupWithRight(this.props.model.id);
                    },
                    disabled: !pagesModel.canGroupWithRight(
                        this.props.model.id
                    ),
                },
                {
                    label: "Ungroup",
                    onClick: () => {
                        pagesModel.ungroup(this.props.model.id);
                    },
                    disabled: !pagesModel.isGrouped(this.props.model.id),
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
    }
}

export function PageTab(props: PageTabProps) {
    const tabModel = useComponentModel(props, PageTabModel, null);
    const model = props.model;
    tabModel.isGrouped = pagesModel.isGrouped(model.id);
    tabModel.isActive = pagesModel.activePage === model || pagesModel.groupedPage === model;
    const { title, modified, language, id, filePath } = model.state.use(
        (s) => ({
            title: s.title,
            modified: s.modified,
            language: s.language,
            id: s.id,
            filePath: (s as any).filePath,
        })
    );

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

    const languageMenuItems = useMemo(
        () => tabModel.getLanguageMenuItems(),
        [language]
    );

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
            })}
            onClick={() => pagesModel.showPage(model.state.get().id)}
            onContextMenu={(e) => tabModel.handleContextMenu(e)}
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
