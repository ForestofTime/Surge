#!/usr/bin/env python3
"""Compare normalized HTTP endpoints in two HAR files without exposing headers."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

UUID_SEGMENT = re.compile(
    r"(?<=/)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=/|$)",
    re.IGNORECASE,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare method, host and path coverage between QX and Surge HAR files."
    )
    parser.add_argument("qx_har", type=Path)
    parser.add_argument("surge_har", type=Path)
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


def load_endpoints(path: Path, host_filters: list[str]) -> dict[str, Counter[int]]:
    with path.open("r", encoding="utf-8") as handle:
        document = json.load(handle)

    endpoints: dict[str, Counter[int]] = {}
    for entry in document.get("log", {}).get("entries", []):
        request = entry.get("request", {})
        response = entry.get("response", {})
        parsed = urlsplit(request.get("url", ""))
        hostname = (parsed.hostname or "").lower()
        if not hostname or not host_matches(hostname, host_filters):
            continue

        method = request.get("method", "UNKNOWN").upper()
        normalized_path = UUID_SEGMENT.sub("{uuid}", parsed.path or "/")
        key = f"{method}\t{hostname}\t{normalized_path}"
        endpoints.setdefault(key, Counter())[response.get("status", 0)] += 1

    return endpoints


def format_statuses(statuses: Counter[int] | None) -> str:
    if not statuses:
        return "-"
    return ",".join(f"{status}:{count}" for status, count in sorted(statuses.items()))


def main() -> int:
    args = parse_args()
    host_filters = [host.lower().rstrip(".") for host in args.host]
    qx = load_endpoints(args.qx_har, host_filters)
    surge = load_endpoints(args.surge_har, host_filters)

    print("scope\tmethod\thost\tpath\tqx_status_count\tsurge_status_count")
    for key in sorted(qx.keys() | surge.keys()):
        if key not in surge:
            scope = "qx_only"
        elif key not in qx:
            scope = "surge_only"
        elif qx[key] != surge[key]:
            scope = "count_or_status_diff"
        else:
            continue

        method, host, path = key.split("\t", 2)
        print(
            "\t".join(
                (
                    scope,
                    method,
                    host,
                    path,
                    format_statuses(qx.get(key)),
                    format_statuses(surge.get(key)),
                )
            )
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
