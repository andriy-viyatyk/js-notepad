import { ButtonView } from "../Button/ButtonView";
import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import type { Story } from "../../editors/storybook/storyTypes";
import {
    addScreenLock,
    createProgress,
    notifyProgress,
    progressState,
    removeScreenLock,
    showProgress,
} from "./progressModel";
import { ProgressOverlayView } from "./ProgressOverlayView";

interface PendingWait {
    timer: ReturnType<typeof setTimeout>;
    resolve: () => void;
}

const wait = (milliseconds: number, pending: Set<PendingWait>): Promise<void> =>
    new Promise((resolve) => {
        const entry: PendingWait = {
            timer: setTimeout(() => {
                pending.delete(entry);
                resolve();
            }, milliseconds),
            resolve,
        };
        pending.add(entry);
    });

class ProgressDemoView extends VanillaView<Record<string, never>> {
    private log: string[] = [];
    private readonly timers = new Set<ReturnType<typeof setTimeout>>();
    private readonly locks = new Set<ReturnType<typeof addScreenLock>>();
    private readonly pendingWaits = new Set<PendingWait>();
    private readonly notificationIds = new Set<number>();
    private logHost: HTMLDivElement | undefined;
    private live = true;

    public constructor(props: Record<string, never>) {
        super(props, createPanelElement({ direction: "column", gap: "md", padding: "xl", align: "start" }));
    }

    protected onMount(): void {
        const overlay = this.child(new ProgressOverlayView({}));
        const notifyButton = this.child(new ButtonView({
            children: "Notify",
            onClick: () => this.runNotification("Saved", 2000),
        }));
        const resolveButton = this.child(new ButtonView({
            children: "Slow resolve",
            onClick: () => this.runProgress(false),
        }));
        const rejectButton = this.child(new ButtonView({
            children: "Slow reject",
            onClick: () => this.runProgress(true),
        }));
        const sequenceButton = this.child(new ButtonView({
            children: "Update label",
            onClick: this.runSequence,
        }));
        const lockButton = this.child(new ButtonView({
            children: "Timed lock",
            onClick: () => this.runTimedLock(1800),
        }));
        const overlapButton = this.child(new ButtonView({
            children: "Precedence overlap",
            onClick: this.runOverlap,
        }));

        const controls = createPanelElement({ direction: "row", wrap: true, gap: "sm" }, [
            notifyButton.root,
            resolveButton.root,
            rejectButton.root,
            sequenceButton.root,
            lockButton.root,
            overlapButton.root,
        ]);
        this.logHost = createPanelElement({ direction: "column", gap: "xs" });
        this.root.append(
            createTextElement("Global Progress overlay", { size: "lg", bold: true }),
            createTextElement(
                "These controls drive the application overlay already mounted at the renderer root. Every blocking action ends automatically.",
                { size: "sm", color: "light" },
            ),
            controls,
            this.logHost,
            overlay.root,
        );
        notifyButton.mount();
        resolveButton.mount();
        rejectButton.mount();
        sequenceButton.mount();
        lockButton.mount();
        overlapButton.mount();
        overlay.mount();
        this.renderLog();
    }

    private addLog(message: string): void {
        if (!this.live) return;
        this.log = [message, ...this.log].slice(0, 5);
        this.renderLog();
    }

    private runNotification(label: string, timeout: number): void {
        const before = new Set(progressState.get().notifications.map((item) => item.id));
        notifyProgress(label, timeout);
        for (const item of progressState.get().notifications) {
            if (!before.has(item.id)) this.notificationIds.add(item.id);
        }
    }

    private readonly runTimedLock = (duration: number): void => {
        const lock = addScreenLock();
        this.locks.add(lock);
        const timer = setTimeout(() => {
            this.timers.delete(timer);
            this.locks.delete(lock);
            removeScreenLock(lock);
            this.addLog("screen lock released");
        }, duration);
        this.timers.add(timer);
    };

    private runProgress(reject: boolean): void {
        const promise = wait(1200, this.pendingWaits).then(() => {
            if (reject) throw new Error("Storybook rejection check");
        });
        void showProgress(promise, reject ? "Rejecting…" : "Loading…")
            .then(() => this.addLog("progress resolved"))
            .catch(() => this.addLog("progress rejected"));
    }

    private readonly runSequence = (): void => {
        const progress = createProgress("Starting…");
        const first = setTimeout(() => progress.label = "Processing…", 450);
        const second = setTimeout(() => progress.label = "Finishing…", 850);
        this.timers.add(first);
        this.timers.add(second);
        void progress.show(wait(1250, this.pendingWaits))
            .then(() => this.addLog("label sequence resolved"));
    };

    private readonly runOverlap = (): void => {
        this.runNotification("Notification takes precedence", 1200);
        this.runTimedLock(1500);
        this.runProgress(false);
    };

    private renderLog(): void {
        if (!this.logHost) return;
        this.logHost.replaceChildren();
        if (this.log.length === 0) {
            this.logHost.append(createTextElement("(no completed actions yet)", { size: "sm", color: "light" }));
            return;
        }
        for (const entry of this.log) this.logHost.append(createTextElement(entry, { size: "sm" }));
    }

    protected onDispose(): void {
        this.live = false;
        for (const timer of this.timers) clearTimeout(timer);
        this.timers.clear();
        for (const entry of this.pendingWaits) {
            clearTimeout(entry.timer);
            this.pendingWaits.delete(entry);
            entry.resolve();
        }
        for (const lock of this.locks) removeScreenLock(lock);
        this.locks.clear();
        progressState.update((state) => {
            state.notifications = state.notifications.filter((item) => !this.notificationIds.has(item.id));
        });
        this.notificationIds.clear();
        this.logHost = undefined;
    }
}

export const progressStory: Story<Record<string, never>> = {
    id: "progress",
    name: "Progress",
    section: "Overlay",
    view: ProgressDemoView,
    props: [],
};
