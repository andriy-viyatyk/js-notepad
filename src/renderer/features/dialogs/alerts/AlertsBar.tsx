import { useEffect } from 'react';

import { TModel } from '../../../core/state/model';
import { TMessageType } from '../../../core/utils/types';
import { TGlobalState } from '../../../core/state/state';
import { AlertData, AlertItem } from './AlertItem';

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

const alertsBarModel = new AlertsBarModel(
    new TGlobalState(defaultAlertsBarState),
);

export function AlertsBar() {
    const model = alertsBarModel;
    const state = model.state.use();

    useEffect(() => {
        model.updateHeights(state.alerts);
    }, [model, state.alerts]);

    if (!state.alerts.length) {
        return null;
    }

    return (
        <>
            {state.alerts.slice(0, maxAlerts).map((a) => {
                return (
                    <AlertItem
                        key={a.key}
                        data={a}
                        top={model.alertTop(a)}
                        right={16}
                        ref={(ref: HTMLDivElement) =>
                            ref && model.updateHeight(a, ref.scrollHeight)
                        }
                    />
                );
            })}
        </>
    );
}

export const alertInfo = (message: string) =>
    alertsBarModel.addAlert(message, 'info');
export const alertSuccess = (message: string) =>
    alertsBarModel.addAlert(message, 'success');
export const alertWarning = (message: string) =>
    alertsBarModel.addAlert(message, 'warning');
export const alertError = (message: string) =>
    alertsBarModel.addAlert(message, 'error');

export const showWarning = (error: unknown): void => {
    console.warn(error);
    alertWarning(error instanceof Error ? error.message : error?.toString?.() ?? 'Unknown error');
}

export const showError = (error: unknown): void => {
    console.error(error);
    alertError(error instanceof Error ? error.message : error?.toString?.() ?? 'Unknown error');
}

export const hideError = (error: unknown): void => undefined;
