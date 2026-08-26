import { ButtonView } from "../Button/ButtonView";
import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { NotificationView } from "./NotificationView";
import type { NotificationProps, NotificationSeverity } from "./Notification";
import type { Story } from "../../editors/storybook/storyTypes";

interface NotificationDemoProps {
    type?: NotificationSeverity;
    message?: string;
    bodyClickable?: boolean;
    showCloseButton?: boolean;
}

class NotificationDemoView extends VanillaView<NotificationDemoProps> {
    private version = 0;
    private log: string[] = [];
    private notificationView: NotificationView | undefined;
    private notificationHost: HTMLDivElement | undefined;
    private logHost: HTMLDivElement | undefined;

    public constructor(props: NotificationDemoProps) {
        super(props, createPanelElement({ direction: "column", gap: "md", width: "100%", padding: "md" }));
    }

    protected onMount(): void {
        const replayButton = this.child(new ButtonView({
            children: "Replay animation",
            onClick: this.replay,
        }));
        const controlRow = createPanelElement({ direction: "row", gap: "md", align: "center" }, [
            replayButton.root,
            createTextElement(
                "Click to remount the Notification and see the slide-in animation.",
                { size: "xs", color: "light" },
            ),
        ]);

        const notificationRow = createPanelElement({ direction: "row", justify: "end", position: "relative", minHeight: 80 });
        const logRow = createPanelElement({ direction: "column", gap: "xs" });
        this.notificationHost = notificationRow;
        this.logHost = logRow;

        this.root.append(controlRow, notificationRow, logRow);
        replayButton.mount();
        this.mountNotification();
        this.renderLog();
    }

    protected onUpdate(props: NotificationDemoProps): void {
        this.notificationView?.update(this.notificationProps(props));
    }

    private readonly replay = (): void => {
        this.version += 1;
        this.releaseNotification();
        this.mountNotification();
    };

    private readonly addLog = (entry: string): void => {
        this.log = [entry, ...this.log].slice(0, 6);
        this.renderLog();
    };

    private mountNotification(): void {
        if (!this.notificationHost) return;
        const notification = this.child(new NotificationView(this.notificationProps(this.props)));
        this.notificationView = notification;
        this.notificationHost.append(notification.root);
        notification.mount();
    }

    private releaseNotification(): void {
        if (!this.notificationView) return;
        const notification = this.notificationView;
        this.notificationView = undefined;
        this.releaseChild(notification);
    }

    private notificationProps(props: NotificationDemoProps): NotificationProps {
        return {
            type: props.type ?? "info",
            message: props.message ?? "Something happened that you should know about.",
            onClick: props.bodyClickable ? () => this.addLog("body clicked → onClose('clicked')") : undefined,
            onClose: props.showCloseButton ? () => this.addLog("close X clicked → onClose()") : undefined,
        };
    }

    private renderLog(): void {
        if (!this.logHost) return;
        this.logHost.replaceChildren();
        this.logHost.append(createTextElement("Click log (latest first):", { size: "xs", color: "light" }));
        if (this.log.length === 0) {
            this.logHost.append(createTextElement("(no clicks yet)", { size: "sm", color: "light", italic: true }));
            return;
        }
        for (const entry of this.log) {
            this.logHost.append(createTextElement(entry, { size: "sm" }));
        }
    }

    protected onDispose(): void {
        this.notificationView = undefined;
        this.logHost = undefined;
        this.notificationHost = undefined;
    }
}

export const notificationStory: Story<NotificationDemoProps> = {
    id: "notification",
    name: "Notification",
    section: "Overlay",
    view: NotificationDemoView,
    props: [
        { name: "type", type: "enum", options: ["info", "success", "warning", "error"], default: "info" },
        { name: "message", type: "string", default: "Something happened that you should know about." },
        { name: "bodyClickable", type: "boolean", default: false, label: "Body clickable" },
        { name: "showCloseButton", type: "boolean", default: true, label: "Show close button" },
    ],
};
