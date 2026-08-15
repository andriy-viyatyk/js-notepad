import { useComponentModel } from "../../../core/state/model";
import { Button } from "../../../uikit/Button";
import { Panel } from "../../../uikit/Panel";
import { Text } from "../../../uikit/Text";
import { DefaultBrowserSectionModel, defaultDefaultBrowserSectionState } from "./DefaultBrowserSectionModel";

export function DefaultBrowserSection() {
    const model = useComponentModel({}, DefaultBrowserSectionModel, defaultDefaultBrowserSectionState);
    const { registered, busy } = model.state.use((state) => ({
        registered: state.registered,
        busy: state.busy,
    }));

    return (
        <>
            <Panel paddingBottom="md">
                <Text color="light" size="xs">
                    Register Persephone as a browser so it appears in Windows Default Apps
                </Text>
            </Panel>
            <Panel direction="row" align="center" gap="md" wrap>
                {registered === null ? (
                    <Text size="sm" color="light">Checking...</Text>
                ) : registered ? (
                    <>
                        <Text size="sm" color="success">Registered</Text>
                        <Button variant="link" size="sm" background="light" disabled={busy} onClick={model.handleUnregister}>
                            Unregister
                        </Button>
                    </>
                ) : (
                    <Button variant="link" size="sm" background="light" disabled={busy} onClick={model.handleRegister}>
                        Register as Default Browser
                    </Button>
                )}
                <Button variant="link" size="sm" background="light" onClick={model.handleOpenSettings}>
                    Open Windows Default Apps
                </Button>
            </Panel>
        </>
    );
}
