# US-1340: Browser acceptance

## Shipped

The EPIC-089 browser acceptance run passed on Haiku with `call` as the only tool. The run log and
surface scenarios record the live evidence and the fifteen retirement markings.

The browser resource now leads with the `call` paths for browser pages, board frames, the app
window (`window.screen`), multi-window access, and the two page openers. It retains the fourteen
`browser_*` tools and `open_url` as older equivalents until EPIC-090. It also documents direct ref
reuse, the opener's pre-load page id, navigation waiting, input guidance, iframe refs, and the
existing privacy boundary.

Enablement instructions were removed from the browser and UI resources. The browser editor hint
already points to `pages.openUrlInBrowserTab` and `pages[i].editor`; no board or HTML `mcpHint`
needed repointing.

## Evidence

- [Acceptance run](../../../qa/runs/2026-09-06-epic-089-browser-surfaces.md)
- [Browser surface QA](../../../qa/surfaces/editors/browser.md)
- [EPIC-089, decision 14](../../epics/EPIC-089.md#14-every-retired-tools-mcphint-and-guide-text-is-updated-in-the-acceptance-task)
