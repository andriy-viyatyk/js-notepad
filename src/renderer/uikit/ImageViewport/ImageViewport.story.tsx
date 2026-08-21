import React from "react";
import { ImageViewport } from "./ImageViewport";
import { Story } from "../../editors/storybook/storyTypes";

const DEMO_IMAGE = `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
        <rect width="640" height="420" fill="#202938"/>
        <circle cx="160" cy="150" r="90" fill="#4dd0e1"/>
        <path d="M80 360 230 210l90 90 80-110 160 170z" fill="#81c784"/>
        <text x="320" y="72" fill="white" font-size="32" text-anchor="middle">Image viewport</text>
    </svg>
`)}`;

function ImageViewportDemo() {
    return <ImageViewport src={DEMO_IMAGE} alt="Image viewport story" />;
}

export const imageViewportStory: Story = {
    id: "image-viewport",
    name: "Image Viewport",
    section: "Media",
    component: ImageViewportDemo,
    props: [],
};
