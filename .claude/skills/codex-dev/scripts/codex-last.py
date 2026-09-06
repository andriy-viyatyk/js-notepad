#!/usr/bin/env python
"""Print the status and last agent message(s) of a Codex thread from its rollout log.

Usage:
  python .claude/skills/codex-dev/scripts/codex-last.py                # newest top-level thread
  python .claude/skills/codex-dev/scripts/codex-last.py --thread <id>  # by MCP threadId
  python .claude/skills/codex-dev/scripts/codex-last.py --file <path>
  options: -n 3 (messages to show, default 1)  --full (no truncation)  --max-chars 4000
           --subagents (also summarize this thread's sub-agent threads)  --list (recent threads)

Exit code mirrors status: 0 complete, 1 running, 3 aborted, 4 idle/unknown.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from codex_log import (  # noqa: E402
    age_seconds,
    find_file,
    print_utf8,
    read_state,
    recent_files,
    subagent_files,
    summarize,
)

EXIT = {"complete": 0, "running": 1, "aborted": 3, "idle": 4}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--thread")
    parser.add_argument("--file")
    parser.add_argument("-n", "--messages", type=int, default=1)
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--max-chars", type=int, default=4000)
    parser.add_argument("--subagents", action="store_true")
    parser.add_argument("--list", action="store_true", help="list recent threads and exit")
    args = parser.parse_args()

    if args.list:
        for path in recent_files()[:15]:
            state = read_state(path)
            age = age_seconds(state.last_event_time)
            age_text = f"{int(age // 60):>4} min ago" if age is not None else "      ?"
            print_utf8(f"{state.status:<9} {age_text}  {state.thread_id}  {path.name}")
        return 0

    path = find_file(args.thread, args.file)
    state = read_state(path)
    limit = 0 if args.full else args.max_chars
    print_utf8(summarize(state, args.messages, limit))
    if args.subagents:
        for sub in subagent_files(state.thread_id):
            print_utf8("\n=== sub-agent ===")
            print_utf8(summarize(read_state(sub), args.messages, limit))
    return EXIT.get(state.status, 4)


if __name__ == "__main__":
    sys.exit(main())
