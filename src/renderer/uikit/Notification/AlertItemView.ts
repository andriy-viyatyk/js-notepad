import type { AlertData } from "./AlertItem";
import type { TMessageType } from "../../core/utils/types";
import { VanillaView } from "../shared/vanilla-view";
import { NotificationView } from "./NotificationView";

export interface AlertItemViewProps {
    name?: string;
    data: AlertData;
    top: number;
    right: number;
}

const AUTOCLOSE_SECONDS: Record<TMessageType, number> = {
    info: 5,
    warning: 5,
    success: 2,
    error: 0,
};

export class AlertItemView extends VanillaView<AlertItemViewProps> {
    private readonly notification: NotificationView;

    public constructor(props: AlertItemViewProps) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "alert-item";
        this.notification = this.child(new NotificationView({
            name: props.name,
            type: props.data.type,
            message: props.data.message,
            onClick: () => this.props.data.onClose("clicked"),
            onClose: () => this.props.data.onClose(),
        }));
    }

    protected onMount(): void {
        this.root.append(this.notification.root);
        this.notification.mount();
        this.applyProps(this.props);

        const seconds = AUTOCLOSE_SECONDS[this.props.data.type];
        if (seconds) {
            let live = true;
            const timer = setTimeout(() => {
                if (live) this.props.data.onClose();
            }, seconds * 1000);
            this.own(() => {
                live = false;
                clearTimeout(timer);
            });
        }
    }

    protected onUpdate(props: AlertItemViewProps): void {
        this.applyProps(props);
        this.notification.update({
            name: props.name,
            type: props.data.type,
            message: props.data.message,
            onClick: () => this.props.data.onClose("clicked"),
            onClose: () => this.props.data.onClose(),
        });
    }

    private applyProps(props: AlertItemViewProps): void {
        this.root.style.top = `${props.top}px`;
        this.root.style.right = `${props.right}px`;
    }

    protected onDispose(): void {
    }
}
