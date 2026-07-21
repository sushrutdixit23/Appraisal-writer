# -*- coding: utf-8 -*-
"""
Seed the sentinel_statements table with the 14 tyre-sector demo filings.

Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_KEY from .env.local
(run from the repo root), loads every JSON in the extracted-data folder,
and inserts them as PUBLIC DEMO rows (owner_id = NULL — readable by any
signed-in user under the RLS policy, exactly like the Python version's
public demo workspace).

Idempotent: uses on_conflict resolution on the table's unique key
(owner_id, company_id, period_label, basis), so re-running never
duplicates rows.

Usage (from the appraisal-writer repo root):
    py scripts\\seed_sentinel.py
    py scripts\\seed_sentinel.py --data-dir "C:\\some\\other\\extracted"
"""

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_DATA_DIR = r"C:\Users\Admin\Downloads\sentinel\data\extracted"


def load_env_local(path: Path) -> dict:
    """Minimal .env.local parser — KEY=VALUE lines, no quoting games."""
    env = {}
    if not path.exists():
        sys.exit(f"ERROR: {path} not found. Run this from the appraisal-writer repo root.")
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"')
    return env


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default=DEFAULT_DATA_DIR)
    args = parser.parse_args()

    env = load_env_local(Path(".env.local"))
    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        sys.exit("ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY missing from .env.local")

    data_dir = Path(args.data_dir)
    json_files = sorted(data_dir.glob("*.json"))
    if not json_files:
        sys.exit(f"ERROR: no JSON files found in {data_dir}")

    rows = []
    for jf in json_files:
        record = json.loads(jf.read_text(encoding="utf-8"))
        record["owner_id"] = None  # public demo row
        rows.append(record)
        print(f"  loaded {jf.name}: {record['company_id']} {record['period_label']} ({record['basis']})")

    endpoint = (
        f"{supabase_url}/rest/v1/sentinel_statements"
        f"?on_conflict=owner_id,company_id,period_label,basis"
    )
    body = json.dumps(rows).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            # merge-duplicates: existing (conflicting) rows get updated in
            # place instead of erroring — safe to re-run after data fixes.
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    try:
        with urllib.request.urlopen(req) as res:
            print(f"\nSeeded {len(rows)} statements (HTTP {res.status}).")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        sys.exit(f"ERROR: Supabase returned HTTP {e.code}:\n{detail}")

    print("Verify in Supabase: select count(*) from sentinel_statements where owner_id is null;  -- expect 14")


if __name__ == "__main__":
    main()
