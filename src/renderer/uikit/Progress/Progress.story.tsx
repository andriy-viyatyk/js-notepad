import React, { useEffect, useRef, useState } from "react";
import { Button } from "../Button/Button";
import { Panel } from "../Panel/Panel";
import { Text } from "../Text/Text";
import {
    addScreenLock,
    createProgress,
    notifyProgress,
    removeScreenLock,
    showProgress,
} from "./index";
import { Story } from "../../editors/storybook/storyTypes";

const wait = (milliseconds: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

function ProgressDemo() {
    const [log, setLog] = useState<string[]>([]);
    const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
    const locks = useRef<Set<ReturnType<typeof addScreenLock>>>(new Set());

    useEffect(() => () => {
        for (const timer of timers.current) clearTimeout(timer);
        for (const lock of locks.current) removeScreenLock(lock);
    }, []);

    const addLog = (message: string): void => {
        setLog((entries) => [message, ...entries].slice(0, 5));
    };

    const runTimedLock = (duration: number): void => {
        const lock = addScreenLock();
        locks.current.add(lock);
        const timer = setTimeout(() => {
            timers.current.delete(timer);
            locks.current.delete(lock);
            removeScreenLock(lock);
            addLog("screen lock released");
        }, duration);
        timers.current.add(timer);
    };

    const runProgress = (reject: boolean): void => {
        const promise = wait(1200).then(() => {
            if (reject) throw new Error("Storybook rejection check");
        });
        void showProgress(promise, reject ? "Rejecting…" : "Loading…")
            .then(() => addLog("progress resolved"))
            .catch(() => addLog("progress rejected"));
    };

    const runSequence = (): void => {
        const progress = createProgress("Starting…");
        const first = setTimeout(() => progress.label = "Processing…", 450);
        const second = setTimeout(() => progress.label = "Finishing…", 850);
        timers.current.add(first);
        timers.current.add(second);
        void progress.show(wait(1250)).then(() => addLog("label sequence resolved"));
    };

    const runOverlap = (): void => {
        notifyProgress("Notification takes precedence", 1200);
        runTimedLock(1500);
        runProgress(false);
    };

    return (
        <Panel direction="column" gap="md" padding="xl" align="start">
            <Text size="lg" bold>Global Progress overlay</Text>
            <Text size="sm" color="light">
                These controls drive the application overlay already mounted at the renderer root.
                Every blocking action ends automatically.
            </Text>
            <Panel direction="row" wrap gap="sm">
                <Button onClick={() => notifyProgress("Saved", 2000)}>Notify</Button>
                <Button onClick={() => runProgress(false)}>Slow resolve</Button>
                <Button onClick={() => runProgress(true)}>Slow reject</Button>
                <Button onClick={runSequence}>Update label</Button>
                <Button onClick={() => runTimedLock(1800)}>Timed lock</Button>
                <Button onClick={runOverlap}>Precedence overlap</Button>
            </Panel>
            <Panel direction="column" gap="xs">
                {log.length === 0 ? (
                    <Text size="sm" color="light">(no completed actions yet)</Text>
                ) : log.map((entry, index) => (
                    <Text key={`${entry}-${index}`} size="sm">{entry}</Text>
                ))}
            </Panel>
        </Panel>
    );
}

export const progressStory: Story = {
    id: "progress",
    name: "Progress",
    section: "Overlay",
    component: ProgressDemo as React.ComponentType<Record<string, unknown>>,
    props: [],
};
