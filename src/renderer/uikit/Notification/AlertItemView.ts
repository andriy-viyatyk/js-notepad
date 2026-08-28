import type { ElementRef } from "../shared/dom-props";
import type { AlertData } from "./AlertItem";
import type { TMessageType } from "../../core/utils/types";
import { bindRef } from "../shared/dom-props";
import { VanillaView } from "../shared/vanilla-view";
import { NotificationView } from "./NotificationView";

export interface AlertItemViewProps {
    ref?: ElementRef<HTMLDivElement>;
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
    private refCleanup: () => void = () => undefined;
    private boundRef: ElementRef<HTMLDivElement> | undefined;

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
        this.setRef(this.props.ref);

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
        this.setRef(props.ref);
    }

    private applyProps(props: AlertItemViewProps): void {
        this.root.style.top = `${props.top}px`;
        this.root.style.right = `${props.right}px`;
    }

    private setRef(ref: ElementRef<HTMLDivElement> | undefined): void {
        if (ref === this.boundRef) return;
        this.refCleanup();
        this.boundRef = ref;
        this.refCleanup = bindRef(this.root, ref);
    }

    protected onDispose(): void {
        this.refCleanup();
        this.refCleanup = () => undefined;
        this.boundRef = undefined;
    }
}
