import { useEffect, useState } from "react";
import { Panel } from "../../uikit";
import { BoardIcon } from "../../theme/icons";

/**
 * A published board's screenshot, shown on the catalog surfaces (Search boards cards and
 * both Board Info modes).
 *
 * The image is loaded straight from the catalog repo over `https` — the app renderer sets no
 * `img-src`/`default-src` CSP, so a remote `<img>` needs no policy change, and Chromium's own
 * HTTP cache covers repeat views. Deliberately NOT fetched through main and cached to disk:
 * a screenshot is decoration, and the extra service + IPC + eviction is not worth it. The
 * visible consequence is that screenshots do not appear offline, even though the catalog
 * itself is cached offline by design — hence the placeholder below is a real state, not just
 * a guard.
 *
 * Every failure mode collapses to the same placeholder at the identical footprint: no URL
 * (a locally registered board that was never in the catalog), a 404, or no network. Keeping
 * the footprint fixed is what stops card heights from jumping between boards.
 *
 * A plain `<img>` rather than a UIKit primitive — images are rare in Persephone, so the
 * primitive would carry one consumer. UIKit Rule 7 is not in play: it forbids Emotion in app
 * code and `style`/`className` on UIKit *components*, and this is a raw HTML element. The
 * surrounding `Panel` owns the border, radius and clipping so the only inline style is the
 * image's own fill behaviour.
 */

/** 16:10 — the shape board authors are asked to capture. */
const ASPECT = 0.625;
const DEFAULT_WIDTH = 200;

const IMG_STYLE: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
};

export function BoardScreenshot({ url, width = DEFAULT_WIDTH }: {
    /** Resolved screenshot URL from the catalog entry (`screenshotUrl`). */
    url?: string;
    /** Rendered width in px; height follows the 16:10 aspect. */
    width?: number;
}) {
    const [failed, setFailed] = useState(false);

    // A board whose URL changes (catalog refresh, version install) must get a fresh attempt
    // rather than inherit the previous board's failure.
    useEffect(() => { setFailed(false); }, [url]);

    const height = Math.round(width * ASPECT);
    const showImage = !!url && !failed;

    return (
        <Panel
            data-type="board-screenshot"
            width={width}
            height={height}
            shrink={false}
            border
            borderColor="default"
            rounded="sm"
            overflow="hidden"
            background="light"
            align="center"
            justify="center"
        >
            {showImage ? (
                <img
                    src={url}
                    alt=""
                    style={IMG_STYLE}
                    onError={() => setFailed(true)}
                />
            ) : (
                <BoardIcon width={32} height={32} opacity={0.35} />
            )}
        </Panel>
    );
}
