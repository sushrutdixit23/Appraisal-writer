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
    """Parse .env.local, keeping every value seen per key (not last-write-
    wins) — this repo's file has had literal '"[SENSITIVE]"' placeholder
    junk land in it before (same symptom hit during the relationships
    build), sometimes alongside a real value on a different line. Picking
    "whichever value exists" isn't safe here; picking "whichever value
    looks like a real credential" is.
    """
    if not path.exists():
        sys.exit(f"ERROR: {path} not found. Run this from the appraisal-writer repo root.")

    candidates: dict[str, list[str]] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip().strip('"')
        candidates.setdefault(key.strip(), []).append(value)

    return candidates


def _looks_like_url(v: str) -> bool:
    return v.startswith("https://") and len(v) > 20 and "SENSITIVE" not in v


def _looks_like_jwt(v: str) -> bool:
    return v.startswith("eyJ") and len(v) > 100 and "SENSITIVE" not in v


def _pick(candidates: dict, key: str, looks_valid) -> str | None:
    """Among every value ever assigned to `key` in the file (duplicates
    included), prefer one that actually looks like a real value. Falls
    back to the last one present so a genuine failure still surfaces a
    concrete (if wrong) value rather than None."""
    values = candidates.get(key, [])
    valid = [v for v in values if looks_valid(v)]
    if valid:
        return valid[-1]
    return values[-1] if values else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default=DEFAULT_DATA_DIR)
    args = parser.parse_args()

    env = load_env_local(Path(".env.local"))
    supabase_url = _pick(env, "NEXT_PUBLIC_SUPABASE_URL", _looks_like_url) or _pick(
        env, "SUPABASE_URL", _looks_like_url
    )
    service_key = _pick(env, "SUPABASE_SERVICE_ROLE_KEY", _looks_like_jwt) or _pick(
        env, "SUPABASE_SERVICE_KEY", _looks_like_jwt
    )
    if not supabase_url or not service_key:
        sys.exit(
            "ERROR: could not find a real-looking Supabase URL / service key in .env.local "
            "(only placeholder values like \"[SENSITIVE]\" were found for every candidate line). "
            "Pull fresh values from the Supabase dashboard (Project Settings -> API) or "
            "`vercel env pull .env.local` if the CLI is installed."
        )
    print(f"  using SUPABASE URL ending in ...{supabase_url[-24:]}")
    print(f"  using service key starting with {service_key[:8]}... (len {len(service_key)})")

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
