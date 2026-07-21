# -*- coding: utf-8 -*-
"""
Backfill / refresh the `relationships` table from `interactions`.

Scope: DM threads only (v1). Comments are excluded — see chat discussion
for why (chat_id is the post URN for comments, not a person, so there's
no stable contact key for them yet).

Idempotent: safe to re-run any time. Deletes and rebuilds each client's rows
from scratch on every run, so re-running after new DMs come in (or after a
filtering-logic change) always leaves the table matching current logic
exactly. This script IS the refresh mechanism, not just the one-time backfill.

Usage:
    py backfill_relationships.py

Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local
automatically (via python-dotenv) — no manual export needed.
"""
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv(".env.local")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
# Assumption: SUPABASE_SERVICE_ROLE_KEY is the real service-role secret that
# bypasses RLS. If relationships end up empty/blocked, this is the first
# thing to check — swap to SUPABASE_SERVICE_KEY if that's the actual one.
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

PAGE_SIZE = 1000


def get_all(table, params):
    """Paginate through every row of a PostgREST query."""
    rows = []
    offset = 0
    while True:
        headers = dict(HEADERS)
        headers["Range"] = f"{offset}-{offset + PAGE_SIZE - 1}"
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}", headers=headers, params=params
        )
        resp.raise_for_status()
        batch = resp.json()
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def parse_ts(ts):
    if not ts:
        return None
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def compute_stage(message_count, days_since_last):
    if message_count == 1:
        return "new_contact"
    if message_count >= 2 and days_since_last <= 14:
        return "active_relationship"
    return "warm_connection"


def main():
    print("Fetching clients (for self-message filtering)...")
    clients = get_all("clients", {"select": "id,profile_id,voice_name"})
    print(f"  {len(clients)} clients")

    profile_ids = [c["profile_id"] for c in clients if c.get("profile_id")]
    profiles = []
    if profile_ids:
        ids_str = ",".join(profile_ids)
        profiles = get_all(
            "profiles", {"select": "id,full_name", "id": f"in.({ids_str})"}
        )
    profile_name_by_id = {
        p["id"]: (p.get("full_name") or "").strip().lower() for p in profiles
    }

    # Prefer the real account-owner name from profiles.full_name; voice_name
    # is the AI's writing-voice label (tone/persona), not a person's name,
    # so it's only a fallback for clients with no linked profile.
    client_self_name = {}
    for c in clients:
        name = profile_name_by_id.get(c.get("profile_id"), "")
        if not name:
            name = (c.get("voice_name") or "").strip().lower()
        client_self_name[c["id"]] = name

    print("Fetching DM interactions...")
    interactions = get_all(
        "interactions",
        {
            "select": "client_id,chat_id,name,status,created_at,publish_claimed_at",
            "type": "eq.dm",
        },
    )
    print(f"  {len(interactions)} dm rows")

    groups = defaultdict(list)
    skipped_self = 0
    skipped_no_chat = 0
    for row in interactions:
        client_id = row["client_id"]
        chat_id = row.get("chat_id")
        name = (row.get("name") or "").strip()

        if not chat_id:
            skipped_no_chat += 1
            continue

        self_name = client_self_name.get(client_id, "")
        if self_name and name.lower() == self_name:
            skipped_self += 1
            continue

        groups[(client_id, chat_id)].append(row)

    print(f"  skipped {skipped_self} self-interactions, {skipped_no_chat} with no chat_id")
    print(f"  {len(groups)} distinct relationships")

    # Delete existing rows for every client seen in this run BEFORE inserting.
    # Upsert alone would never remove a row that the current logic no longer
    # produces (e.g. a self-DM that used to slip through the filter) — this
    # makes the table an exact mirror of what's computed now, every run.
    client_ids_seen = sorted({row["client_id"] for row in interactions})
    if client_ids_seen:
        ids_str = ",".join(client_ids_seen)
        resp = requests.delete(
            f"{SUPABASE_URL}/rest/v1/relationships",
            headers=HEADERS,
            params={"client_id": f"in.({ids_str})"},
        )
        if resp.status_code >= 300:
            print(f"FAILED delete: {resp.status_code} {resp.text}")
            sys.exit(1)
        print(f"Cleared existing relationships for {len(client_ids_seen)} client(s)")

    now = datetime.now(timezone.utc)
    upserts = []
    for (client_id, chat_id), rows in groups.items():
        rows.sort(key=lambda r: r["created_at"])

        names = [r["name"] for r in rows if r.get("name")]
        display_name = names[-1] if names else "Unknown"

        created_ats = [parse_ts(r["created_at"]) for r in rows]
        first_at = min(created_ats)
        last_at = max(created_ats)

        message_count = len(rows)
        replied_rows = [r for r in rows if r.get("status") == "sent"]
        replied_count = len(replied_rows)

        reply_seconds = []
        for r in replied_rows:
            claimed = parse_ts(r.get("publish_claimed_at"))
            created = parse_ts(r["created_at"])
            if claimed and created:
                reply_seconds.append((claimed - created).total_seconds())
        avg_reply_seconds = (
            int(sum(reply_seconds) / len(reply_seconds)) if reply_seconds else None
        )

        days_since_last = (now - last_at).days
        stage = compute_stage(message_count, days_since_last)

        upserts.append(
            {
                "client_id": client_id,
                "chat_id": chat_id,
                "display_name": display_name,
                "first_interaction_at": first_at.isoformat(),
                "last_contact_at": last_at.isoformat(),
                "message_count": message_count,
                "replied_count": replied_count,
                "avg_reply_seconds": avg_reply_seconds,
                "stage": stage,
            }
        )

    print(f"Upserting {len(upserts)} relationship rows...")
    headers = dict(HEADERS)
    headers["Prefer"] = "resolution=merge-duplicates,return=minimal"

    batch_size = 200
    for i in range(0, len(upserts), batch_size):
        batch = upserts[i : i + batch_size]
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/relationships?on_conflict=client_id,chat_id",
            headers=headers,
            json=batch,
        )
        if resp.status_code >= 300:
            print(f"FAILED batch starting at {i}: {resp.status_code} {resp.text}")
            sys.exit(1)
        print(f"  batch {i // batch_size + 1}: {len(batch)} rows OK")

    print("Done.")


if __name__ == "__main__":
    main()
