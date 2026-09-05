import type { ISettings } from "../../../api/types/settings";
import type { IAiMember, IAiVisionDescriptor } from "../../../../shared/ai-vision/types";

const SETTINGS_MEMBERS: readonly IAiMember[] = [
    { name: "theme", kind: "property", summary: "Current theme name; readonly." },
    { name: "get", kind: "method", signature: "get<T = any>(key: string)", summary: "Read a setting; unknown keys return undefined." },
    { name: "set", kind: "method", signature: "set<T = any>(key: string, value: T)", summary: "Persist a setting automatically after a debounce.", caution: "changes application configuration and may actuate services through onChanged" },
    { name: "onChanged", kind: "property", summary: "Change notification event; the event object is not an AiVision node." },
];

export function describeSettings(instance: unknown): IAiVisionDescriptor {
    const settings = instance as ISettings;
    return {
        kind: "Settings",
        summary: "Read and persist application configuration with change notifications.",
        members: SETTINGS_MEMBERS,
        help: "Use get to inspect configuration and set only when you intend to persist an application change.",
        summarize: () => ({ kind: "Settings", theme: settings.theme }),
    };
}
