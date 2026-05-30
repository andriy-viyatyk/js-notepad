import styled from "@emotion/styled";

import color from "../../theme/color";
import { pagesModel } from "../../api/pages";
import { appWindow } from "../../api/window";
import { settings } from "../../api/settings";
import type { PageModel } from "../../api/pages/PageModel";
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
    VolumeIcon,
    VolumeMutedIcon,
} from "../../theme/icons";
import { LanguageIcon } from "../../components/icons/LanguageIcon";
import { TComponentModel, useComponentModel } from "../../core/state/model";
import { IconButton, Tooltip, WithMenu } from "../../uikit";
import type { MenuItem } from "../../uikit";
import { ContextMenuEvent } from "../../api/events/events";
import { monacoLanguages } from "../../core/utils/monaco-languages";
import { useState, useCallback, useRef, useMemo } from "react";
import { TraitTypeId, setTraitDragData, getTraitDragData, hasTraitDragData } from "../../core/traits";
import { api } from "../../../ipc/renderer/api";
import { PageDragData } from "../../../shared/types";
import { parseObject } from "../../core/utils/parse-utils";
import { ui } from "../../api/ui";
import { useOptionalState } from "../../core/state/state";

export const minTabWidth = 80;
const ICON_SLOT = 20; // padding(2) + icon(16) + padding(2)
const TAB_PADDING = 4; // 2px left + 2px right
export const pinnedTabWidth = 2 * ICON_SLOT + TAB_PADDING; // language + modified dot
export const pinnedTabEncryptedWidth = 3 * ICON_SLOT + TAB_PADDING; // language + encryption + modified dot

const PageTabRoot = styled.div(
    {
        display: "flex",
        alignItems: "center",
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
        border: `1px solid transparent`,
        borderBottom: "none",
        padding: "4px 2px 3px 2px",
        minHeight: 22,
        WebkitAppRegion: "no-drag",
        userSelect: "none",
        width: 200,
        minWidth: minTabWidth,
        flexShrink: 1,
        overflow: "hidden",

        '& [data-part="title-label"]': {
            flex: "1 1 auto",
            fontSize: 13,
            color: color.text.light,
            flexShrink: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
        },
        '&[data-temp] [data-part="title-label"]': {
            fontStyle: "italic",
        },
        '&[data-deleted] [data-part="title-label"]': {
            color: color.misc.red,
        },
        '&[data-deleted] [data-part="modified-icon"]': {
            color: color.misc.red,
        },

        '& [data-part="close-button"]': {
            flexShrink: 0,
            visibility: "hidden",
        },
        '& [data-part="sound-button"]': {
            flexShrink: 0,
            visibility: "hidden",
        },
        '& [data-part="sound-button"][data-active]': {
            visibility: "visible",
        },

        "&[data-active]": {
            backgroundColor: color.background.default,
            borderColor: color.border.default,
            color: color.text.default,
            '&:not([data-deleted]) [data-part="title-label"]': {
                color: color.text.default,
            },
            '& [data-part="close-button"]': {
                visibility: "visible",
            },
        },
        "&:hover": {
            borderColor: color.border.default,
            '& [data-part="close-button"]': {
                visibility: "visible",
            },
            '& [data-part="sound-button"]': {
                visibility: "visible",
            },
        },
        "&[data-drag-over]": {
            backgroundColor: color.background.default,
        },
        '& [data-part="modified-icon"]': {
            display: "none",
        },
        '&[data-modified] [data-part="close-button"]': {
            visibility: "visible",
        },
        "&[data-modified]:not(:hover)": {
            '& [data-part="modified-icon"]': {
                display: "inline-block",
            },
            '& [data-part="close-icon"]': {
                display: "none",
            },
        },
        '& [data-part="encryption-icon"]': {
            paddingBottom: 4,
            marginRight: 2,
        },
        '& [data-part="empty-language"]': {
            width: 6,
            height: 14,
            flexShrink: 0,
        },
        '& [data-part="empty-language"][data-with-icon]': {
            width: 15,
            margin: "0 4px 0 4px",
            "& svg, & img": {
                width: 15,
                height: 15,
            },
        },
        "&:not([data-active]) > button": {
            cursor: "default",
        },

        "&[data-pinned]": {
            width: pinnedTabWidth,
            minWidth: pinnedTabWidth,
            flexShrink: 0,
            position: "sticky",
            zIndex: 1,
            backgroundColor: color.background.dark,
            "&[data-active], &[data-drag-over]": {
                backgroundColor: color.background.default,
            },
            '& [data-part="title-label"]': {
                flex: "0 0 auto",
            },
            '& [data-part="close-button"]': {
                visibility: "visible",
                pointerEvents: "none",
            },
            '& [data-part="close-icon"]': {
                display: "none",
            },
        },
        '&[data-pinned][data-grouped] [data-part="close-button"]': {
            pointerEvents: "auto",
        },
        '&[data-pinned][data-grouped] [data-part="close-icon"]': {
            display: "inline-block",
        },
        '&[data-pinned][data-modified] [data-part="modified-icon"]': {
            display: "inline-block",
        },
        "&[data-pinned][data-has-encryption]": {
            width: pinnedTabEncryptedWidth,
            minWidth: pinnedTabEncryptedWidth,
        },

        '& [data-part="pinned-tooltip-trigger"]': {
            position: "absolute",
            inset: 0,
        },
        '&[data-pinned] > *:not([data-part="pinned-tooltip-trigger"])': {
            position: "relative",
            zIndex: 1,
        },
    },
    { label: "PageTabRoot" },
);

interface PageTabProps {
    model: PageModel;
    pinnedLeft?: number;
}

class PageTabModel extends TComponentModel<null, PageTabProps> {
    isActive = false;
    isGrouped = false;

    private setActiveLanuage = (langId: string) => {
        const currentActive = settings.get("tab-recent-languages");
        const newActive = [
            langId,
            ...currentActive.filter((l) => l !== langId),
        ];
        settings.set("tab-recent-languages", newActive);
    };

    getLanguageMenuItems = (): MenuItem[] => {
        const editor = this.props.model.mainEditor;
        if (!editor) return [];
        const currLang = editor.state.get().language;
        const activeLanguages = settings.get("tab-recent-languages");
        const menuItems: MenuItem[] = monacoLanguages
            .map((lang) => ({
                id: lang.id,
                label: lang.aliases[0] || lang.id,
                icon: <LanguageIcon language={lang.id} />,
                onClick: () => {
                    editor.changeLanguage(lang.id);
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
        const page = this.props.model;
        const editor = page.mainEditor;
        const textHost = pagesModel.getTextFileHost(page.id);
        const ctxEvent = ContextMenuEvent.fromNativeEvent(e, "page-tab");
        const isPinned = page.pinned;
        const pinUnpinItem: MenuItem = {
            label: isPinned ? "Unpin Tab" : "Pin Tab",
            onClick: () => {
                if (isPinned) {
                    pagesModel.unpinTab(page.id);
                } else {
                    pagesModel.pinTab(page.id);
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
                    page.close();
                },
                startGroup: !isPinned && menuItems.length > 0,
            });
        }
        menuItems.push({
            label: "Close Other Tabs",
            disabled: pagesModel.state.get().pages.length <= 1,
            onClick: () => {
                pagesModel.closeOtherPages(page.id);
            },
            startGroup: isPinned,
        });
        if (!isPinned) {
            menuItems.push(
                {
                    label: "Close Tabs to the Right",
                    disabled: pagesModel.isLastPage(page.id),
                    onClick: () => {
                        pagesModel.closeToTheRight(page.id);
                    },
                },
                {
                    label: "Open in New Window",
                    onClick: () => {
                        api.addDragEvent(this.getDragData());
                    },
                },
            );
        }
        menuItems.push({
            label: "Duplicate Tab",
            icon: <DuplicateIcon />,
            onClick: () => {
                pagesModel.duplicatePage(page.id);
            },
            startGroup: isPinned,
        });
        if (!isPinned) {
            menuItems.push({
                ...pinUnpinItem,
                startGroup: true,
            });
        }
        menuItems.push(
            {
                startGroup: true,
                label: "Save",
                icon: <SaveIcon />,
                onClick: () => {
                    textHost?.saveFile(false);
                },
                disabled: !textHost,
            },
            {
                label: "Save As...",
                icon: <SaveIcon />,
                onClick: () => {
                    textHost?.saveFile(true);
                },
                disabled: !textHost,
            },
            {
                label: "Rename",
                icon: <RenameIcon />,
                onClick: this.renameTab,
                disabled: !textHost,
            },
            {
                label: "Show in File Explorer",
                icon: <FolderOpenIcon />,
                onClick: () => {
                    const fp = (editor?.state.get() as { filePath?: string })?.filePath;
                    if (fp) api.showItemInFolder(fp);
                },
                disabled: !(editor?.state.get() as { filePath?: string })?.filePath,
            },
            {
                label: "Copy File Path",
                icon: <CopyIcon />,
                onClick: () => {
                    const fp = (editor?.state.get() as { filePath?: string })?.filePath;
                    if (fp) navigator.clipboard.writeText(fp);
                },
                disabled: !(editor?.state.get() as { filePath?: string })?.filePath,
            },
            {
                label: "Decrypt",
                icon: <UnlockIcon />,
                onClick: () => {
                    textHost?.showEncryptionDialog();
                },
                disabled: !(textHost?.encrypted),
                startGroup: true,
            },
            {
                label:
                    textHost && !textHost.withEncryption
                        ? "Encrypt"
                        : "Change Password",
                icon: <LockIcon />,
                onClick: () => {
                    textHost?.showEncryptionDialog();
                },
                disabled: !textHost || textHost.encrypted,
            },
            {
                label: "Make Unencrypted",
                icon: <KeyOffIcon />,
                onClick: () => {
                    textHost?.makeUnencrypted();
                },
                disabled: !textHost?.decrypted,
            },
        );
        ctxEvent.items.push(...menuItems);
    };

    private getDragData = (drop = false): PageDragData => {
        const page = this.props.model;
        return {
            sourceWindowIndex: drop ? undefined : appWindow.windowIndex,
            targetWindowIndex: drop ? appWindow.windowIndex : undefined,
            // IPC payload is the PageDescriptor.
            page: page.getDescriptor(),
        };
    };

    private renameTab = async () => {
        const textHost = pagesModel.getTextFileHost(this.props.model.id);
        if (textHost) {
            const pageTitle = textHost.state.get().title;
            const inputResult = await ui.input("Enter new file name:", {
                title: "Rename File",
                value: pageTitle,
                buttons: ["Rename", "Cancel"],
                selectAll: true,
            });
            if (inputResult?.button === "Rename" && inputResult.value) {
                const newName = inputResult.value;
                await textHost.renameFile(newName);
            }
        }
    }

    handleDragStart = (e: React.DragEvent) => {
        const page = this.props.model;
        // Trait data for same-window tab reorder (all tabs)
        setTraitDragData(e.dataTransfer, TraitTypeId.PageTab, { key: page.id });
        // Persephone-tab data for cross-window movement (non-pinned only)
        if (!page.pinned) {
            e.dataTransfer.setData(
                "application/persephone-tab",
                JSON.stringify(this.getDragData())
            );
        }
    };

    handleDragEnd = (e: React.DragEvent) => {
        if (this.props.model.pinned) return;
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
        const id = this.props.model.id;
        // Cross-window tab movement (check first — has priority)
        const dataStr = e.dataTransfer?.getData("application/persephone-tab");
        const tabData = parseObject(dataStr) as { sourceWindowIndex?: number } | undefined;
        if (
            tabData &&
            tabData.sourceWindowIndex !== undefined &&
            tabData.sourceWindowIndex !== appWindow.windowIndex
        ) {
            api.addDragEvent(this.getDragData(true));
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        // Same-window tab reorder
        const payload = getTraitDragData(e.dataTransfer);
        if (payload?.typeId === TraitTypeId.PageTab) {
            const data = payload.data as { key: string };
            if (data.key !== id) {
                pagesModel.moveTab(data.key, id);
            }
            e.preventDefault();
            e.stopPropagation();
        }
    };

    closeClick = () => {
        const page = this.props.model;
        if (this.isGrouped) {
            // Walkthrough 07 / GK4: ungroup carries compare-cleanup obligation
            // now; the explicit fixCompareMode call is redundant.
            pagesModel.ungroup(page.id);
            pagesModel.showPage(page.id);
        } else {
            page.close();
        }
    };

    handleClick = (e: React.MouseEvent) => {
        const pageId = this.props.model.id;
        if (e.ctrlKey) {
            const activeId = pagesModel.activePage?.id;
            if (activeId !== pageId) {
                pagesModel.groupTabs(activeId, pageId, true);
            }
        }

        pagesModel.showPage(pageId);
    };

    encryptionClick = () => {
        const textHost = pagesModel.getTextFileHost(this.props.model.id);
        if (textHost) {
            if (textHost.encrypted) {
                textHost.showEncryptionDialog();
            } else if (textHost.decrypted) {
                textHost.encryptWithCurrentPassword();
            }
        }
    };
}

export function PageTab(props: PageTabProps) {
    const tabModel = useComponentModel(props, PageTabModel, null);
    const page = props.model;
    const editor = page.mainEditor;
    tabModel.isGrouped = pagesModel.isGrouped(page.id);
    tabModel.isActive =
        pagesModel.activePage === page || pagesModel.groupedPage === page;

    const { pinned, mainEditorId: _mainEditorId } = page.state.use((s) => ({ pinned: s.pinned, mainEditorId: s.mainEditorId }));

    const editorState = editor?.state ?? null;
    const { title, modified, language, filePath, deleted, temp, _anyTabAudible, _pageMuted } =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        useOptionalState(editorState as any, (s: any) => ({
            title: s.title,
            modified: s.modified,
            language: s.language,
            filePath: s.filePath,
            deleted: s.deleted ?? false,
            password: s.password,
            encrypted: s.encrypted ?? false,
            temp: s.temp ?? false,
            _iconHint: s.favicon ?? "",
            _anyTabAudible: s._anyTabAudible ?? false,
            _pageMuted: s.pageMuted ?? false,
        }), { title: "Empty", modified: false, language: "", filePath: "", deleted: false, password: undefined, encrypted: false, temp: false, _iconHint: "", _anyTabAudible: false, _pageMuted: false });

    const [isOver, setIsOver] = useState(false);
    const dragEnterCount = useRef(0);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        dragEnterCount.current++;
        if (hasTraitDragData(e.dataTransfer)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setIsOver(true);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (hasTraitDragData(e.dataTransfer)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
        }
    }, []);

    const handleDragLeave = useCallback(() => {
        dragEnterCount.current--;
        if (dragEnterCount.current <= 0) {
            dragEnterCount.current = 0;
            setIsOver(false);
        }
    }, []);

    /** HTML5 DnD: `dragleave` does NOT fire on the drop target when a drop
     *  occurs — so the dragEnter counter never decrements back to 0 and
     *  `isOver` stays `true`, leaving `data-drag-over` (lighter background)
     *  stuck on the tab. Reset state here in parallel with delegating to
     *  the model's drop handler. */
    const handleDrop = useCallback((e: React.DragEvent) => {
        dragEnterCount.current = 0;
        setIsOver(false);
        tabModel.handleDrop(e);
    }, [tabModel]);

    const activeLanguages = settings.use("tab-recent-languages");
    const languageMenuItems = useMemo(
        () => tabModel.getLanguageMenuItems(),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional indirect deps: tabModel.getLanguageMenuItems() reads `language` and the recent-languages setting internally; deps listed so the menu rebuilds when either changes. tabModel is stable; omitted to keep the recomputation triggers semantically clear.
        [language, activeLanguages]
    );

    const textHost = pagesModel.getTextFileHost(page.id);
    const encrypted = textHost?.encrypted;
    const decrypted = textHost?.decrypted;
    const hasEncryption = Boolean(encrypted || decrypted);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const showSoundButton = _anyTabAudible || _pageMuted || (editor as any)?.toggleMuteAll;
    const closeIconNode = tabModel.isGrouped
        ? <GroupIcon data-part="close-icon" />
        : <CloseIcon data-part="close-icon" />;

    return (
        <PageTabRoot
            data-type="page-tab"
            data-active={tabModel.isActive || undefined}
            data-modified={modified || undefined}
            data-drag-over={isOver || undefined}
            data-temp={temp || undefined}
            data-deleted={deleted || undefined}
            data-pinned={pinned || undefined}
            data-grouped={tabModel.isGrouped || undefined}
            data-has-encryption={hasEncryption || undefined}
            style={pinned && props.pinnedLeft !== undefined ? { left: props.pinnedLeft } : undefined}
            onClick={tabModel.handleClick}
            onContextMenu={tabModel.handleContextMenu}
            draggable
            onDragStart={tabModel.handleDragStart}
            onDragEnd={tabModel.handleDragEnd}
            onDrop={handleDrop}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
        >
            {pinned && filePath && (
                <Tooltip content={filePath} placement="bottom" delayShow={1500}>
                    <span data-part="pinned-tooltip-trigger" />
                </Tooltip>
            )}
            {editor?.noLanguage ? (
                <span data-part="empty-language" data-with-icon={editor.getIcon ? "" : undefined}>
                    {editor.getIcon ? editor.getIcon() : null}
                </span>
            ) : (
                <WithMenu items={languageMenuItems}>
                    {(setOpen) => (
                        <IconButton
                            name="tab-language"
                            size="sm"
                            title={language}
                            icon={<LanguageIcon language={language} fileName={title} />}
                            onClick={(e) => {
                                if (!tabModel.isActive && e.ctrlKey) {
                                    tabModel.handleClick(e);
                                    return;
                                }
                                pagesModel.showPage(page.id);
                                if (tabModel.isActive) {
                                    setOpen(e.currentTarget);
                                }
                            }}
                        />
                    )}
                </WithMenu>
            )}
            <Tooltip
                content={!pinned && filePath ? filePath : null}
                placement="bottom"
                delayShow={1500}
            >
                <span data-part="title-label">
                    {hasEncryption && (
                        <span
                            data-part="encryption-icon"
                            onClick={tabModel.encryptionClick}
                            title={encrypted ? "Decrypt File" : "Encrypt File"}
                        >
                            {encrypted ? "🔒" : "🔓"}
                        </span>
                    )}
                    {!pinned && title}
                </span>
            </Tooltip>
            {showSoundButton && (
                <IconButton
                    name="tab-sound"
                    size="sm"
                    data-part="sound-button"
                    active={(_anyTabAudible || _pageMuted) || undefined}
                    title={_pageMuted ? "Unmute Page" : "Mute Page"}
                    icon={_pageMuted ? <VolumeMutedIcon /> : <VolumeIcon />}
                    onClick={(e) => {
                        e.stopPropagation();
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (editor as any)?.toggleMuteAll?.();
                    }}
                />
            )}
            <IconButton
                name="tab-close"
                size="sm"
                data-part="close-button"
                title={tabModel.isGrouped ? "Ungroup" : "Close Page"}
                icon={
                    <>
                        {closeIconNode}
                        <CircleIcon data-part="modified-icon" />
                    </>
                }
                onClick={tabModel.closeClick}
            />
        </PageTabRoot>
    );
}
