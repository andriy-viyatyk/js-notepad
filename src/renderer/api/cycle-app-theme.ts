import { cycleTheme, getCurrentThemeId } from "../theme/themes";
import { settings } from "./settings";

/** Cycle to the next (`1`) / previous (`-1`) theme and persist the choice.
 *
 *  Shared by the global Ctrl+Alt+] / Ctrl+Alt+[ shortcut (`KeyboardService`) and the same
 *  shortcut forwarded out of a board frame (`board:cycleTheme`), so both paths persist the
 *  new theme identically. Lives here rather than in `theme/themes` because `settings` already
 *  imports that module — persisting from inside it would close the cycle. */
export function cycleAppTheme(direction: 1 | -1): void {
    cycleTheme(direction);
    settings.set("theme", getCurrentThemeId());
}
