# -*- coding: utf-8 -*-
"""
Seed sentinel_statements for the 5 public-reference tyre workspaces.
Rewritten for the workspace-keyed schema: looks up each workspace's id
by company_name (the 5 rows already inserted by the foundation SQL),
maps each extracted JSON's company_id to that name, and inserts against
the new (workspace_id, period_label, basis) unique key.

Usage (from the appraisal-writer repo root):
    py scripts\\seed_sentinel.py
    py scripts\\seed_sentinel.py --data-dir "C:\\some\\other\\extracted"
"""

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_DATA_DIR = r"C:\Users\Admin\Downloads\sentinel\data\extracted"

# The old JSONs key companies by company_id; the new schema keys them by
# company_name via workspace lookup. This is the only place that mapping
# lives — everything downstream is workspace_id.
COMPANY_ID_TO_NAME = {
    "apollo_tyres": "Apollo Tyres Ltd",
    "ceat": "Ceat Ltd",
    "jk_tyre": "JK Tyre & Industries Ltd",
    "balkrishna": "Balkrishna Industries Ltd",
    "mrf": "MRF Ltd",
}

# Fields that exist on the old JSON records but have no home in the new
# schema (workspace identity replaces them, currency_unit lives on the
# workspace row now, not per-statement).
DROP_FIELDS = {"company_id", "company_name", "ticker", "currency_unit", "owner_id"}


def load_env_local(path: Path) -> dict:
    """Parse .env.local, keeping every value seen per key (not last-write-
    wins) - this repo's file has had literal '"[SENSITIVE]"' placeholder
    junk land in it before. Picking "whichever value looks like a real
    credential" beats picking "whichever value exists"."""
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
    values = candidates.get(key, [])
    valid = [v for v in values if looks_valid(v)]
    if valid:
        return valid[-1]
    return values[-1] if values else None


def supabase_request(method: str, url: str, service_key: str, body: bytes | None = None) -> bytes:
    req = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal" if body else "",
        },
    )
    try:
        with urllib.request.urlopen(req) as res:
            return res.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        sys.exit(f"ERROR: Supabase returned HTTP {e.code} for {method} {url}:\n{detail}")


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
            "ERROR: could not find a real-looking Supabase URL / service key in .env.local."
        )
    print(f"  using SUPABASE URL ending in ...{supabase_url[-24:]}")
    print(f"  using service key starting with {service_key[:8]}... (len {len(service_key)})")

    # 1. Fetch the 5 public-reference workspaces to build name -> id map
    query = urllib.parse.urlencode(
        {"is_public_reference": "eq.true", "select": "id,company_name"}
    )
    ws_resp = supabase_request(
        "GET", f"{supabase_url}/rest/v1/sentinel_workspaces?{query}", service_key
    )
    workspaces = json.loads(ws_resp)
    name_to_id = {w["company_name"]: w["id"] for w in workspaces}
    print(f"\n  found {len(workspaces)} public-reference workspaces in Supabase:")
    for name, wid in name_to_id.items():
        print(f"    {name} -> {wid}")

    missing = set(COMPANY_ID_TO_NAME.values()) - set(name_to_id.keys())
    if missing:
        sys.exit(
            f"\nERROR: these workspaces are missing from Supabase (did the foundation SQL run?): "
            f"{sorted(missing)}"
        )

    # 2. Load and transform the 14 extracted JSON files
    data_dir = Path(args.data_dir)
    json_files = sorted(data_dir.glob("*.json"))
    if not json_files:
        sys.exit(f"ERROR: no JSON files found in {data_dir}")

    rows = []
    print(f"\n  transforming {len(json_files)} filings:")
    for jf in json_files:
        record = json.loads(jf.read_text(encoding="utf-8"))
        company_id = record.get("company_id")
        company_name = COMPANY_ID_TO_NAME.get(company_id)
        if not company_name:
            sys.exit(f"ERROR: {jf.name} has unrecognized company_id '{company_id}'")
        workspace_id = name_to_id[company_name]

        new_record = {k: v for k, v in record.items() if k not in DROP_FIELDS}
        new_record["workspace_id"] = workspace_id
        rows.append(new_record)
        print(f"    {jf.name}: {company_name} {record['period_label']} ({record['basis']})")

    # 3. Upsert against the new unique key (workspace_id, period_label, basis)
    query = urllib.parse.urlencode({"on_conflict": "workspace_id,period_label,basis"})
    body = json.dumps(rows).encode("utf-8")
    supabase_request(
        "POST", f"{supabase_url}/rest/v1/sentinel_statements?{query}", service_key, body
    )
    print(f"\nSeeded {len(rows)} statements across {len(name_to_id)} workspaces.")
    print("Verify: select w.company_name, count(*) from sentinel_statements s "
          "join sentinel_workspaces w on w.id = s.workspace_id group by w.company_name;")


if __name__ == "__main__":
    main()
