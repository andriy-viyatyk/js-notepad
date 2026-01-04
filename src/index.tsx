import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { AlertsBar } from "./dialogs/alerts/AlertsBar";
import { Dialogs } from "./dialogs/dialogs/Dialogs";
import { Poppers } from "./dialogs/poppers/Poppers";
import { MainPage } from "./pages/MainPage";
import "./setup/configure-monaco";
import { GlobalStyles } from "./theme/GlobalStyles";
import { EventHandler } from "./setup/EventHandler";

export default function AppContent() {
    return (
        <EventHandler>
            <DndProvider backend={HTML5Backend}>
                <GlobalStyles />
                <MainPage />
                <Dialogs />
                <AlertsBar />
                <Poppers />
            </DndProvider>
        </EventHandler>
    );
}

