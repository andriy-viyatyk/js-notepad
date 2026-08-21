import React, { useState } from "react";
import { Minimap } from "./Minimap";
import { Story } from "../../editors/storybook/storyTypes";

function MinimapDemo() {
    const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);

    return (
        <div style={{ display: "flex", width: "100%", height: 360, gap: 8 }}>
            <div
                ref={setScrollContainer}
                style={{ flex: "1 1 auto", overflow: "auto", padding: 16 }}
            >
                {Array.from({ length: 36 }, (_, index) => (
                    <div key={index} style={{ padding: "6px 0" }}>
                        {String(index + 1).padStart(2, "0")} — Minimap story content
                    </div>
                ))}
            </div>
            <Minimap name="storybook-minimap" scrollContainer={scrollContainer} />
        </div>
    );
}

export const minimapStory: Story = {
    id: "minimap",
    name: "Minimap",
    section: "Media",
    component: MinimapDemo,
    props: [],
};
