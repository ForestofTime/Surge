#!/usr/bin/env python3
"""Print a secret-safe timeline for HAR entries matching one or more regexes."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Print matching HAR request metadata without headers or bodies."
    )
    parser.add_argument("har", type=Path)
    parser.add_argument(
        "--match",
        action="append",
        required=True,
        help="Case-insensitive regex matched against URL, request body, response body, or comment.",
    )
    parser.add_argument(
        "--host",
        action="append",
        default=[],
        help="Include this host and its subdomains. Repeat for multiple hosts.",
    )
    return parser.parse_args()


def host_matches(hostname: str, filters: list[str]) -> bool:
    return not filters or any(
        hostname == item or hostname.endswith(f".{item}") for item in filters
    )


def text_at(value: object) -> str:
    return value if isinstance(value, str) else ""


def comment_flags(comment: str) -> str:
    flags: list[str] = []
    lowered = comment.lower()
    for token, label in (
        ("handled by vif", "vif"),
        ("tls client hello sni", "sni"),
        ("script found", "script"),
        ("response is modified by script", "modified"),
    ):
        if token in lowered:
            flags.append(label)
    return ",".join(flags) or "-"


def main() -> int:
    args = parse_args()
    patterns = [re.compile(value, re.IGNORECASE) for value in args.match]
    host_filters = [host.lower().rstrip(".") for host in args.host]

    with args.har.open("r", encoding="utf-8") as handle:
        document = json.load(handle)

    creator = document.get("log", {}).get("creator", {})
    print(
        "# creator="
        f"{creator.get('name', 'unknown')} {creator.get('version', 'unknown')}"
    )
    print("time\tmethod\thost\tpath\tstatus\tbytes\tflags\tmatched_in")

    rows: list[tuple[str, ...]] = []
    for entry in document.get("log", {}).get("entries", []):
        request = entry.get("request", {})
        response = entry.get("response", {})
        url = text_at(request.get("url"))
        parsed = urlsplit(url)
        hostname = (parsed.hostname or "").lower()
        if not hostname or not host_matches(hostname, host_filters):
            continue

        sources = {
            "url": url,
            "request": text_at(request.get("postData", {}).get("text")),
            "response": text_at(response.get("content", {}).get("text")),
            "comment": text_at(entry.get("comment")),
        }
        matched_sources = sorted(
            name
            for name, value in sources.items()
            if value and any(pattern.search(value) for pattern in patterns)
        )
        if not matched_sources:
            continue

        size = response.get("content", {}).get("size")
        if not isinstance(size, int):
            size = response.get("bodySize", 0)
        rows.append(
            (
                text_at(entry.get("startedDateTime")),
                text_at(request.get("method")) or "UNKNOWN",
                hostname,
                parsed.path or "/",
                str(response.get("status", 0)),
                str(size),
                comment_flags(sources["comment"]),
                ",".join(matched_sources),
            )
        )

    for row in sorted(rows, key=lambda value: value[0]):
        print("\t".join(row))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
