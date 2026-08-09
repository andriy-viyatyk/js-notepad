# Run log — `mcp-test-ui-guidance.md`, Haiku, 2026-08-09

Harness: `mcp-test-agent` skill (forked, `model: haiku`), run against the user's **live** instance,
so no blanket cleanup — a baseline was taken with `list_pages` and only agent-created pages were
closed afterwards. Baseline restored at the end (6 pages, including the Tools & Editors tab one
test agent closed).

| Test | Result | Note |
|---|---|---|
| 7.1 Where is a UI control | **PASS** | Read `ui`, correct answer, highlighted unprompted |
| 7.2 Highlight in the app window | **PASS** | Read `ui`, correct selector, ring + card verified on screen |
| 7.3 Clear the highlight | **PASS** | Cleared via `Esc`, not `app.ui.clearHighlights()` — see below |
| 7.4 What can this app open | **PASS** | Read `ui-editors`, built an accurate grouped tour page |
| 7.5 Explain a status indicator | **PASS** | Read `ui`, correct on all three indicators |
| 7.6 Turn a feature on from settings | **PASS** | Ran as a `visualizer-effect` variant — see below |
| 7.7 Highlight on a web page | **PARTIAL** | Right mechanics, wrong claim — still fails on retest |
| 7.8 A control that is not always there | **FAIL** → **PASS** | Right conclusion, 33 tool calls, changed the user's app. Fixed by the "language" wording |
| 7.9 A feature that was removed | **PARTIAL** | Accepted the false premise — **passes on Sonnet** |
| 7.10 Cold start | not run | Needs a plain agent without MCP; run manually |

Six of nine clean on the first pass, seven after fixes. The three that were not all failed the
**same way**, which is the useful result.

## The one real finding: guide routing covered questions but not instructions

7.7, 7.8 and 7.9 have nothing in common except that **no guide was read**. In each case the guide
already contained the correct answer, in plain language, and the agent never opened it.

The server instructions routed the UI guides off *interrogatives* — the examples were "what is
this button?", "where do I change the language of this tab?", "is there a diagram editor?". Every
failing prompt was phrased as an instruction or an assertion instead:

- 7.8 "**Change** the language of the Tools & Editors tab to JSON" → the agent treated it as an
  operation, not a question, and went exploring the scripting API. 33 tool calls and 6.6 minutes
  later it reached the correct answer (`tools-hub-view` has no language) — after closing the
  user's Tools & Editors tab and creating a stray `untitled` page. The `ui` guide states this
  outright, and `list_pages` settles it in one call.
- 7.9 "Open a PDF in Persephone's **built-in PDF editor**" → the agent took the premise on trust
  and asked which file to open. There is no built-in PDF editor; it is a board.
- 7.7 "**Highlight** the link on this web page" → reasonable Playwright reflex, straight to
  `browser_evaluate`. It set an outline (correct fallback, and it never tried to reach
  `app-asset://`), but then told the user the styling was "consistent with how Persephone
  highlights interactive elements" — inventing a visual convention, which is precisely the
  false impression the guide's not-supported section exists to prevent.

An interrogative filter is the wrong filter: a user who wants help with the app usually phrases it
as a command.

### Fixes applied

| Fix | Where | Live? |
|---|---|---|
| Route on intent, not phrasing — instructions and assertions about the app count too; don't explore the API or click through a snapshot to locate a control | `mcp-http-server.ts` instructions | needs app restart |
| Check a named editor exists before agreeing; Todo and PDF are boards now | `mcp-http-server.ts` instructions | needs app restart |
| "Pointing at an element on a web page" — no overlay exists, say so, and say the outline is an ordinary DOM change, not Persephone's highlight | `mcp-res-browser.md` | live |
| `list_pages` is the one-call check for whether a tab has a language at all | `mcp-res-ui.md` | live |

Guides are read from disk per request, so guide edits take effect immediately; the `instructions`
string is only sent on connect, so the retests waited for an app restart.

## Retest after restart — and the conclusion that changes

Instructions verified live before retesting (`initialize` over HTTP returns the new text), so
this measured the fix, not the old build.

| Test | Haiku, retest | Change |
|---|---|---|
| 7.7 web-page highlight | **FAIL** | Worse — used `browser_hover`, a transient hover state that is not a highlight at all, and again claimed it matched Persephone's own UI |
| 7.8 tab with no language | **PARTIAL** → **PASS** | Right answer, no damage, but 42 tool calls without opening a guide. Passes cleanly after the wording fix — see below |
| 7.9 removed feature | **FAIL** | Identical: one tool call, asked which PDF, called it "Persephone's built-in PDF viewer" |

No guide was read in any of the three, with the routing fix live and explicitly telling it to.

So the harness's own tiebreaker was applied — **bump the model to distinguish "docs unclear" from
"model too weak"** (`qa/README.md`). 7.9 re-run on Sonnet, everything else identical:

> Read `ui-editors` and `pages` first. Learned there is no built-in PDF editor. Noticed the **PDF
> Viewer board is installed** on this machine, wrote a minimal PDF, opened it, and verified from
> `get_active_page` that the board rendered it. 8 tool calls.

**PASS, first try.** The documentation is correct and reachable; Haiku does not reach it. That is
the finding: the guide-first instruction lands on a model that plans multi-step, and does not on
one that answers the first thing it can. Sonnet also read the guide *before* asking any
clarifying question — the exact behaviour the instruction asks for.

## Second retest — after the "language" wording fix

7.8 re-run on **Haiku**, after the restart that put the clarified wording into the served
instructions:

| | Before | After |
|---|---|---|
| First action | probe the scripting API | **`read_guide("ui")`** |
| Tool calls | 42 | 15 |
| Wall clock | 5.9 min | 2.8 min |
| Answer | correct, unsourced | correct, **quoting the guide** — "a page whose `language` is empty or absent has no language to change" |

**PASS.** It read the guide first, checked `list_pages` for the editor type, and cited the text
back. Same model, same prompt, same harness — only the wording changed.

So "Haiku never reads guides" was too strong a conclusion from three failures. The truer
statement: **Haiku skips the guide when the request is ambiguous enough that it thinks it already
knows what to look for.** "Change the language" sounded like a control to hunt down, so it hunted;
"the Monaco syntax-highlighting mode" is specific enough that the guide becomes the obvious place
to look. Ambiguity is what sent it exploring, not laziness — and ambiguity is fixable in prose,
which is why this one worked where the emphatic routing directive did not.

7.7 and 7.9 remain Haiku failures, and the Sonnet control still shows the docs are sound.

### What this means for the epic

The guides are done and verified. What is not solvable by more documentation is that a weak model
skips documentation entirely — no amount of emphatic wording in a string it never reads will fix
that. The remaining lever is structural (tool descriptions and error messages, which an agent
*must* pass through), not prose. Recorded in `backlog.md` rather than papered over here.

Two substantive fixes still came out of the retest:

- **"Language" was ambiguous** (user's observation while watching a run): it can read as UI
  locale, document language, or Monaco's syntax mode. Now stated explicitly as the **Monaco
  syntax-highlighting mode**, with "there is no UI locale setting" said out loud, in
  `mcp-res-ui.md`, `mcp-res-pages.md`, and the server instructions. The 7.8 agent burned much of
  its 42 calls hunting for a language control that could have meant three different things.
- **`app.editors.resolveId()` ignores board-provided editors** — the Sonnet run called it on
  `test.pdf` and got `"monaco"`, then opened the file and got the PDF Viewer board. The script
  API disagrees with what actually happens. Backlogged.

## Smaller observations

- **7.3 cleared with `Esc` rather than `app.ui.clearHighlights()`.** Recorded as a PASS: the
  highlight was gone and `Esc` is documented. Worth knowing that the API call is not the reflex.
- **Two highlights stack and their cards overlap.** 7.1's card was partly hidden behind 7.2's.
  Not a defect — the overlay was specified to support multiple simultaneous callouts — but an
  agent placing a second highlight should clear the first unless it means to show both.
- **7.6 was run as a variant.** As written it enables `git.enabled`, which was already on for this
  user; changing MCP or Mneme on a live instance was not worth it. Substituted
  `visualizer-effect` (`circular` → `bars`, restored afterwards): same shape, no side effects. The
  agent used `app.settings.set` — the connected path, not a file edit — reported the settings-file
  path, and quoted the accepted values and default straight out of the rewritten file comments.
  That is the settings work from the cold-start task doing its job.
- **7.5's only error was visual, not documentary** — it read "3 MCP" off the screenshot as
  "3 KCR". Its description of what the indicator means was right.
- **`app.pages` has no `showToolsHubPage`.** The 7.8 agent noticed this and reported it correctly.
  The guides only document the UI route (`+` arrow → *Show All…*), so nothing is wrong — noted
  because restoring that tab afterwards had to go through a DOM click.
