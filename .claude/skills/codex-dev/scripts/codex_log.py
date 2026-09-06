"""Shared helpers for reading Codex rollout logs (~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl).

Log facts (verified 2026-09-06, codex_cli_rs 0.151):
- One JSONL file per thread. First row is `session_meta` with `payload.id` (the MCP threadId) and
  `payload.source` ("mcp", or `{"subagent": {"thread_spawn": {"parent_thread_id": ...}}}`).
- A turn starts with `event_msg/task_started` (`turn_id`) and ends with either
  `event_msg/task_complete` (carries `last_agent_message`) or `event_msg/turn_aborted`.
- Progress commentary is `event_msg/agent_message` (`message`).
- Windows does not update mtime while the writer holds the handle: watch SIZE, not mtime.
"""
from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

SESSIONS_ROOT = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")) / "sessions"


def iter_rows(path: Path) -> Iterable[dict]:
    with open(path, encoding="utf-8", errors="replace") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue  # a row still being written


def recent_files(hours: float = 48) -> list[Path]:
    cutoff = time.time() - hours * 3600
    files = [p for p in SESSIONS_ROOT.rglob("rollout-*.jsonl") if p.stat().st_mtime >= cutoff]
    return sorted(files, key=lambda p: p.stat().st_mtime, reverse=True)


def read_meta(path: Path) -> dict:
    for row in iter_rows(path):
        if row.get("type") == "session_meta":
            return row.get("payload") or {}
        break
    return {}


def thread_id_of(path: Path) -> str:
    return read_meta(path).get("id") or path.stem.split("-", 4)[-1]


def parent_thread_of(path: Path) -> str | None:
    source = read_meta(path).get("source")
    if isinstance(source, dict):
        spawn = (source.get("subagent") or {}).get("thread_spawn") or {}
        return spawn.get("parent_thread_id")
    return None


def find_file(thread: str | None = None, file: str | None = None) -> Path:
    if file:
        return Path(file)
    candidates = recent_files()
    if thread:
        for p in candidates:
            if thread in p.name or thread_id_of(p) == thread:
                return p
        raise SystemExit(f"no rollout log found for thread {thread} under {SESSIONS_ROOT}")
    # default: newest top-level (non-subagent) thread
    for p in candidates:
        if parent_thread_of(p) is None:
            return p
    if candidates:
        return candidates[0]
    raise SystemExit(f"no rollout logs found under {SESSIONS_ROOT}")


def subagent_files(parent_thread: str) -> list[Path]:
    return [p for p in recent_files() if parent_thread_of(p) == parent_thread]


@dataclass
class ThreadState:
    path: Path
    thread_id: str = ""
    turns_started: int = 0
    turns_finished: int = 0
    status: str = "idle"  # running | complete | aborted | idle
    last_event_time: str = ""
    final_message: str | None = None  # last task_complete.last_agent_message
    abort_reason: str | None = None
    messages: list[tuple[str, str, str]] = field(default_factory=list)  # (time, kind, text)
    context_window: int | None = None
    last_input_tokens: int | None = None


def read_state(path: Path) -> ThreadState:
    state = ThreadState(path=path)
    open_turn: str | None = None
    for row in iter_rows(path):
        kind = row.get("type")
        payload = row.get("payload") or {}
        stamp = row.get("timestamp", "")
        if kind == "session_meta":
            state.thread_id = payload.get("id", "")
            continue
        if kind != "event_msg":
            continue
        state.last_event_time = stamp
        event = payload.get("type")
        if event == "task_started":
            open_turn = payload.get("turn_id")
            state.turns_started += 1
            state.status = "running"
            state.context_window = payload.get("model_context_window") or state.context_window
        elif event == "task_complete":
            open_turn = None
            state.turns_finished += 1
            state.status = "complete"
            state.final_message = payload.get("last_agent_message")
            if state.final_message:
                state.messages.append((stamp, "final", state.final_message))
        elif event == "turn_aborted":
            open_turn = None
            state.turns_finished += 1
            state.status = "aborted"
            state.abort_reason = payload.get("reason")
        elif event == "agent_message":
            state.messages.append((stamp, "commentary", payload.get("message", "")))
        elif event == "token_count":
            info = payload.get("info") or {}
            last = (info.get("last_token_usage") or {}).get("input_tokens")
            if last is not None:
                state.last_input_tokens = last
            state.context_window = info.get("model_context_window") or state.context_window
    if open_turn is not None:
        state.status = "running"
    return state


def age_seconds(stamp: str) -> float | None:
    if not stamp:
        return None
    try:
        when = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - when).total_seconds()
    except ValueError:
        return None


def summarize(state: ThreadState, messages: int = 1, max_chars: int = 4000) -> str:
    lines = [
        f"file:    {state.path}",
        f"thread:  {state.thread_id}",
        f"status:  {state.status}" + (f" ({state.abort_reason})" if state.abort_reason else ""),
        f"turns:   {state.turns_finished}/{state.turns_started} finished",
    ]
    age = age_seconds(state.last_event_time)
    if age is not None:
        lines.append(f"last event: {state.last_event_time} ({int(age // 60)} min ago)")
    if state.last_input_tokens and state.context_window:
        pct = 100 * state.last_input_tokens / state.context_window
        lines.append(f"context: {state.last_input_tokens:,} / {state.context_window:,} tokens ({pct:.0f}%)")
    tail = state.messages[-messages:] if messages > 0 else []
    for stamp, kind, text in tail:
        if max_chars and len(text) > max_chars:
            text = text[:max_chars] + f"\n... [{len(text) - max_chars} more chars; use --full]"
        lines.append("")
        lines.append(f"--- {kind} @ {stamp} ---")
        lines.append(text)
    return "\n".join(lines)


def print_utf8(text: str) -> None:
    sys.stdout.buffer.write((text + "\n").encode("utf-8", errors="replace"))
    sys.stdout.flush()
