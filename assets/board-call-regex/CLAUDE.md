# AiVision Regex Call verification Board

This trusted Board verifies `persephone.call()` against the grouped content of its hosting page.
Run loads `page.grouped.content`, applies the pattern and flags, and renders `{ match, index }`
records. Write assigns the JSON-formatted records back to the grouped content.

To verify page affinity, open the Board beside a text page, group another page, run once, activate
the other tab, and run again. The source must remain the grouped content of the Board's host page.
Revoke trust while it is mounted and confirm both Run and Write reject. The canonical bridge guide
is available through `read_guide("boards")`.
