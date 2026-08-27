import { TModel } from "../../core/state/model";
import { TMessageType } from "../../core/utils/types";
import { TGlobalState } from "../../core/state/state";
import { KeyedList } from "../shared/keyed-list";
import { VanillaView } from "../shared/vanilla-view";
import { AlertItemView, type AlertItemViewProps } from "./AlertItemView";
import type { AlertData } from "./AlertItem";

const maxAlerts = 3;
let alertId = 0;
const getAlertId = () => {
    alertId = alertId > 1000000 ? 0 : ++alertId;
    return alertId;
};

type AlertHeight = { [key: number]: number };
function defaultHeight(current: AlertHeight, alerts: AlertData[]) {
    const newHeight = { ...current };
    alerts.forEach((a) => {
        if (!newHeight[a.key]) {
            newHeight[a.key] = 40;
        }
    });
    return newHeight;
}

const defaultAlertsBarState = {
    alerts: [] as AlertData[],
    height: {} as AlertHeight,
};

type AlertsBarState = typeof defaultAlertsBarState;

class AlertsBarModel extends TModel<AlertsBarState> {
    addAlert = (message: string, type: TMessageType) => {
        return new Promise((resolve) => {
            const alertData: AlertData = {
                message,
                type,
                key: getAlertId(),
                // eslint-disable-next-line @typescript-eslint/no-empty-function
                onClose: () => {},
            };

            alertData.onClose = (value?: unknown) => {
                this.state.update((s) => {
                    s.alerts = s.alerts.filter((a) => a.key !== alertData.key);
                });
                resolve(value);
            };

            this.state.update((s) => {
                let newAlerts = [...s.alerts, alertData];
                if (newAlerts.length > maxAlerts) {
                    const notError = newAlerts.find(
                        (a, idx) =>
                            a.type !== 'error' && idx < newAlerts.length,
                    );
                    if (notError) {
                        newAlerts = newAlerts.filter((a) => a !== notError);
                    }
                }
                s.alerts = newAlerts;
            });

            if (type === 'error') {
                // eslint-disable-next-line no-console
                console.error(message);
            }
        });
    };

    alertTop = (alert: AlertData) => {
        const { alerts, height } = this.state.get();
        let res = 42;
        if (alert !== alerts[0]) {
            const alertIndex = alerts.indexOf(alert);
            for (let i = 0; i < alertIndex; i++) {
                res += (height[alerts[i].key] ?? 40) + 8;
            }
        }
        return res;
    };

    updateHeights = (alerts: AlertData[]) => {
        this.state.update((s) => {
            if (alerts.length) {
                s.height = defaultHeight(s.height, alerts);
            } else {
                s.height = {};
            }
        });
    };

    updateHeight = (alert: AlertData, height: number) => {
        if (this.state.get().height[alert.key] !== height) {
            this.state.update((s) => {
                s.height[alert.key] = height;
            });
        }
    };
}

export const alertsBarModel = new AlertsBarModel(
    new TGlobalState(defaultAlertsBarState),
);

type AlertsBarViewProps = Record<string, never>;

export class AlertsBarView extends VanillaView<AlertsBarViewProps> {
    private readonly itemViews = new Map<number, AlertItemView>();
    private readonly alertList: KeyedList<AlertData, number, HTMLDivElement>;
    private visibleAlerts: AlertData[] = [];
    private live = true;
    private measurementQueued = false;

    public constructor(props: AlertsBarViewProps) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "alerts-bar";
        this.root.style.display = "contents";
        this.alertList = new KeyedList<AlertData, number, HTMLDivElement>(this.root, {
            keyOf: (alert) => alert.key,
            create: (alert): HTMLDivElement => {
                const view = new AlertItemView(this.getItemProps(alert));
                this.itemViews.set(alert.key, view);
                view.mount();
                return view.root as HTMLDivElement;
            },
            update: (_element, alert) => {
                this.itemViews.get(alert.key)?.update(this.getItemProps(alert));
            },
            remove: (_element, alert) => {
                const view = this.itemViews.get(alert.key);
                this.itemViews.delete(alert.key);
                view?.dispose();
            },
        });
    }

    protected onMount(): void {
        this.own(() => {
            this.live = false;
        });
        this.own(() => this.alertList.dispose());
        this.bind(
            alertsBarModel.state,
            (state) => state.alerts,
            (alerts) => this.updateAlerts(alerts),
        );
        this.bind(
            alertsBarModel.state,
            (state) => state.height,
            () => this.updatePositions(),
        );
    }

    private updateAlerts(alerts: AlertData[]): void {
        this.visibleAlerts = alerts.slice(0, maxAlerts);
        this.alertList.update(this.visibleAlerts);
        this.queueMeasurement();
    }

    private updatePositions(): void {
        this.visibleAlerts.forEach((alert) => {
            this.itemViews.get(alert.key)?.update(this.getItemProps(alert));
        });
    }

    private getItemProps(alert: AlertData): AlertItemViewProps {
        return {
            data: alert,
            top: alertsBarModel.alertTop(alert),
            right: 16,
        };
    }

    private queueMeasurement(): void {
        if (this.measurementQueued) return;
        this.measurementQueued = true;
        queueMicrotask(() => {
            this.measurementQueued = false;
            if (!this.live) return;

            alertsBarModel.updateHeights(this.visibleAlerts);
            if (!this.live) return;

            this.visibleAlerts.forEach((alert) => {
                const view = this.itemViews.get(alert.key);
                if (view) alertsBarModel.updateHeight(alert, view.root.scrollHeight);
            });
            this.updatePositions();
        });
    }
}
