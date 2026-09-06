#!/usr/bin/env python
"""Wait for a Codex thread to finish its current turn, watching the rollout log.

Use this when an `mcp__codex__codex` / `codex-reply` call aborted (30 idle minutes) while Codex
kept working. It returns as soon as the log records `task_complete` or `turn_aborted` for the
open turn, printing the final agent message. If the log (including this thread's sub-agent logs)
stops growing for --idle seconds without an end marker, it exits 2 and prints the last commentary.

Usage:
  python .claude/skills/codex-dev/scripts/codex-wait.py --thread <id>   # recommended
  python .claude/skills/codex-dev/scripts/codex-wait.py                 # newest top-level thread
  options: --idle 240  --poll 15  --timeout 0 (seconds, 0 = none)  --quiet  --max-chars 4000

Exit codes: 0 complete, 2 stalled (no growth for --idle s), 3 aborted, 4 timeout.
Run it in the background (Bash run_in_background) and read the output when notified.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from codex_log import find_file, print_utf8, read_state, subagent_files, summarize  # noqa: E402


def watched_size(path: Path, thread_id: str) -> int:
    total = path.stat().st_size
    for sub in subagent_files(thread_id):
        try:
            total += sub.stat().st_size
        except OSError:
            pass
    return total


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--thread")
    parser.add_argument("--file")
    parser.add_argument("--idle", type=float, default=240)
    parser.add_argument("--poll", type=float, default=15)
    parser.add_argument("--timeout", type=float, default=0)
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--max-chars", type=int, default=4000)
    args = parser.parse_args()

    path = find_file(args.thread, args.file)
    state = read_state(path)
    thread_id = state.thread_id
    if not args.quiet:
        print_utf8(f"watching {path.name} (thread {thread_id}); status now: {state.status}")

    if state.status in ("complete", "aborted"):
        print_utf8(summarize(state, 1, args.max_chars))
        return 0 if state.status == "complete" else 3

    started = time.time()
    last_size = watched_size(path, thread_id)
    last_growth = time.time()
    while True:
        time.sleep(args.poll)
        state = read_state(path)
        if state.status == "complete":
            print_utf8(summarize(state, 1, args.max_chars))
            return 0
        if state.status == "aborted":
            print_utf8(summarize(state, 1, args.max_chars))
            return 3
        size = watched_size(path, thread_id)
        now = time.time()
        if size != last_size:
            if not args.quiet:
                print_utf8(f"{time.strftime('%H:%M:%S')} log grew by {size - last_size:,} bytes")
            last_size, last_growth = size, now
        elif now - last_growth >= args.idle:
            print_utf8(f"stalled: no log growth for {int(args.idle)} s and no end marker")
            print_utf8(summarize(state, 1, args.max_chars))
            return 2
        if args.timeout and now - started >= args.timeout:
            print_utf8(f"timeout after {int(args.timeout)} s")
            print_utf8(summarize(state, 1, args.max_chars))
            return 4


if __name__ == "__main__":
    sys.exit(main())
