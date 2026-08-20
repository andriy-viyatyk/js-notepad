import React from "react";
import { mountVanilla } from "../shared/mount";
import { TruncatedTextView } from "./TruncatedTextView";
import "./TruncatedText.css";

export interface TruncatedTextProps
    extends Omit<React.HTMLAttributes<HTMLSpanElement>, "style" | "className"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    children?: React.ReactNode;
}

export function TruncatedText(props: TruncatedTextProps): React.ReactElement {
    return mountVanilla(TruncatedTextView, props);
}
