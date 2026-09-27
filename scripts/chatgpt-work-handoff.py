#!/usr/bin/env python3
"""Create a compact, copy-ready manual handoff packet for ChatGPT Work."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

SECRET_PATTERNS = (
    re.compile(r"(?i)\b(api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\s*[:=]\s*([^\s,;]+)"),
    re.compile(r"\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b", re.IGNORECASE),
)


def redact(value: str) -> str:
    for index, pattern in enumerate(SECRET_PATTERNS):
        if index == 0:
            value = pattern.sub(lambda match: f"{match.group(1)}=[REDACTED]", value)
        else:
            value = pattern.sub("[REDACTED]", value)
    return value


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return "Unavailable (not a Git repository or Git command failed)"
    return result.stdout.strip() or "Clean"


def bullet_lines(values: list[str], fallback: str) -> str:
    return "\n".join(f"- {redact(value)}" for value in values) if values else f"- {fallback}"


def build_packet(args: argparse.Namespace, repo: Path) -> str:
    status = git(repo, "status", "--short", "--branch")
    commit = git(repo, "rev-parse", "HEAD")
    return f"""# ChatGPT Work Handoff

Generated: {date.today().isoformat()}

> Manual workflow only: paste this packet into ChatGPT Work. ChatGPT Work is not configured as a Hermes provider or API. Do not paste credentials, customer data, or other secrets.

## Task
{redact(args.task.strip())}

## Repository
- Path: `{repo}`
- Commit: `{redact(commit)}`
- Status:
```text
{redact(status)}
```

## Relevant files
{bullet_lines(args.file, "Discover the smallest relevant set before editing.")}

## Constraints
{bullet_lines(args.constraint, "Keep changes scoped, preserve secrets, and do not modify provider configuration or external accounts.")}

## Acceptance criteria
{bullet_lines(args.accept, "Return a concrete result with changed files and verification evidence.")}

## Test commands
```bash
{redact(chr(10).join(args.test) if args.test else "# Add and run the narrowest relevant tests.")}
```

## Instructions for ChatGPT Work
1. Work from the repository and commit shown above; call out if your environment differs.
2. Prefer analysis, code review, drafting, or a patch that Hermes can apply locally.
3. Do not request, expose, invent, or retain credentials. Replace any discovered secret with `[REDACTED]`.
4. Do not claim tests passed unless you actually ran them.
5. Return the section below, filled in compactly.

## Return handoff to Hermes
- Outcome:
- Files changed or proposed:
- Patch/diff or exact edits:
- Commands run:
- Test results:
- Risks, assumptions, or blockers:
- Suggested next Hermes action:
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", required=True, help="Task to hand off")
    parser.add_argument("--repo", default=".", help="Repository path (default: current directory)")
    parser.add_argument("--file", action="append", default=[], help="Relevant file; repeat as needed")
    parser.add_argument("--constraint", action="append", default=[], help="Constraint; repeat as needed")
    parser.add_argument("--accept", action="append", default=[], help="Acceptance criterion; repeat as needed")
    parser.add_argument("--test", action="append", default=[], help="Test command; repeat as needed")
    parser.add_argument("--output", type=Path, help="Save packet to this Markdown file")
    parser.add_argument("--stdout", action="store_true", help="Print packet even when --output is used")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo = Path(args.repo).expanduser().resolve()
    if not repo.is_dir():
        print(f"error: repository path is not a directory: {repo}", file=sys.stderr)
        return 2

    packet = build_packet(args, repo)
    if args.output:
        output = args.output.expanduser().resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(packet, encoding="utf-8")
        print(f"Wrote {output}", file=sys.stderr)
    if args.stdout or not args.output:
        print(packet, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
