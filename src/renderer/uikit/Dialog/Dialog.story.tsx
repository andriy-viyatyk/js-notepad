import React, { useCallback, useState } from "react";
import { Dialog } from "./Dialog";
import { DialogContent } from "./DialogContent";
import { Panel } from "../Panel/Panel";
import { Button } from "../Button/Button";
import { IconButton } from "../IconButton/IconButton";
import { Input } from "../Input/Input";
import { Text } from "../Text/Text";
import { Story } from "../../editors/storybook/storyTypes";

interface DemoProps {
    position?: "center" | "right";
    showIcon?: boolean;
    showHeaderButtons?: boolean;
    width?: number;
    minWidth?: number;
    maxWidth?: number;
    height?: number;
    autoFocus?: boolean;
}

function DialogDemo({
    position = "center",
    showIcon = false,
    showHeaderButtons = false,
    width = 0,
    minWidth = 360,
    maxWidth = 600,
    height = 0,
    autoFocus = true,
}: DemoProps) {
    const [open, setOpen] = useState(false);
    const [first, setFirst] = useState("");
    const [second, setSecond] = useState("");

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
        }
    }, []);

    return (
        <Panel direction="column" gap="md" width="100%" height={520}>
            <Panel direction="row" gap="md" align="center">
                <Button onClick={() => setOpen(true)}>Open dialog</Button>
                <Text size="xs" color="light">
                    Tab cycles inside the dialog. Esc or backdrop click closes. Focus returns
                    to the trigger button on close.
                </Text>
            </Panel>

            <Panel
                direction="column"
                flex
                position="relative"
                border
                background="dark"
                overflow="hidden"
            >
                <Panel padding="md" direction="column" gap="sm">
                    <Text size="sm" color="light">
                        Background area — clicks here are blocked while the dialog is open.
                    </Text>
                    <Input
                        value=""
                        onChange={() => undefined}
                        placeholder="Background input (should NOT receive Tab while dialog open)"
                    />
                </Panel>

                {open && (
                    <Dialog
                        position={position}
                        autoFocus={autoFocus}
                        onBackdropClick={() => setOpen(false)}
                        onKeyDown={handleKeyDown}
                    >
                        <DialogContent
                            title="Edit settings"
                            icon={showIcon ? "rename" : undefined}
                            onClose={() => setOpen(false)}
                            headerButtons={
                                showHeaderButtons ? (
                                    <IconButton
                                        size="sm"
                                        icon="settings"
                                        aria-label="More"
                                    />
                                ) : undefined
                            }
                            width={width || undefined}
                            height={height || undefined}
                            minWidth={minWidth || undefined}
                            maxWidth={maxWidth || undefined}
                        >
                            <Panel direction="column" padding="md" gap="md">
                                <Panel direction="column" gap="xs">
                                    <Text size="sm">Name</Text>
                                    <Input
                                        value={first}
                                        onChange={setFirst}
                                        placeholder="Type a name…"
                                    />
                                </Panel>
                                <Panel direction="column" gap="xs">
                                    <Text size="sm">Description</Text>
                                    <Input
                                        value={second}
                                        onChange={setSecond}
                                        placeholder="Type a description…"
                                    />
                                </Panel>
                                <Panel direction="row" gap="sm" justify="end">
                                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                                    <Button variant="primary" onClick={() => setOpen(false)}>
                                        Save
                                    </Button>
                                </Panel>
                            </Panel>
                        </DialogContent>
                    </Dialog>
                )}
            </Panel>
        </Panel>
    );
}

export const dialogStory: Story = {
    id: "dialog",
    name: "Dialog",
    section: "Overlay",
    component: DialogDemo as React.ComponentType<Record<string, unknown>>,
    props: [
        { name: "position", type: "enum", options: ["center", "right"], default: "center" },
        { name: "showIcon", type: "boolean", default: false, label: "Show icon" },
        { name: "showHeaderButtons", type: "boolean", default: false, label: "Show header buttons" },
        { name: "width", type: "number", default: 0, min: 0, max: 1200, step: 20, label: "Width (0 = auto)" },
        { name: "minWidth", type: "number", default: 360, min: 0, max: 1200, step: 20, label: "Min width" },
        { name: "maxWidth", type: "number", default: 600, min: 0, max: 1200, step: 20, label: "Max width" },
        { name: "height", type: "number", default: 0, min: 0, max: 800, step: 20, label: "Height (0 = auto)" },
        { name: "autoFocus", type: "boolean", default: true, label: "Auto-focus on open" },
    ],
};
