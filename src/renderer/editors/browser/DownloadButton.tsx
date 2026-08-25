import { useRef } from "react";
import { Panel, IconButton } from "../../uikit";
import color from "../../theme/color";
import { downloads } from "../../api/downloads";
import {
    closeDownloadsPopup,
    isDownloadsPopupOpen,
    showDownloadsPopup,
} from "./BrowserDownloadsPopup";

const RING_SIZE = 22;
const RING_CENTER = RING_SIZE / 2;
const RING_RADIUS = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function DownloadButton() {
    const buttonRef = useRef<HTMLButtonElement>(null);

    const { hasActive, progress } = downloads.state.use((s) => {
        const active = s.downloads.filter((d) => d.status === "downloading");
        const hasActiveDl = active.length > 0;
        let prog = 0;
        if (hasActiveDl) {
            const totalBytes = active.reduce((sum, d) => sum + d.totalBytes, 0);
            const receivedBytes = active.reduce((sum, d) => sum + d.receivedBytes, 0);
            prog = totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : 0;
        }
        return { hasActive: hasActiveDl, progress: prog };
    });

    const dashOffset = RING_CIRCUMFERENCE * (1 - progress);

    const handleClick = () => {
        if (!buttonRef.current) return;
        if (isDownloadsPopupOpen()) {
            closeDownloadsPopup();
        } else {
            showDownloadsPopup(buttonRef.current);
        }
    };

    return (
        <Panel name="downloads-button" position="relative" align="center" justify="center" data-downloads-button>
            <IconButton
                name="toolbar-downloads"
                ref={buttonRef}
                size="sm"
                title="Downloads"
                active={hasActive || undefined}
                icon="download"
                onClick={handleClick}
            />
            {hasActive && (
                <svg
                    viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
                    width={RING_SIZE}
                    height={RING_SIZE}
                    style={{ position: "absolute", top: 1, left: 1, pointerEvents: "none" }}
                >
                    <circle
                        cx={RING_CENTER}
                        cy={RING_CENTER}
                        r={RING_RADIUS}
                        fill="none"
                        stroke={color.border.light}
                        strokeWidth={1.5}
                    />
                    <circle
                        cx={RING_CENTER}
                        cy={RING_CENTER}
                        r={RING_RADIUS}
                        fill="none"
                        stroke={color.border.active}
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeDasharray={RING_CIRCUMFERENCE}
                        strokeDashoffset={dashOffset}
                        transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
                        style={{ transition: "stroke-dashoffset 0.3s ease" }}
                    />
                </svg>
            )}
        </Panel>
    );
}
