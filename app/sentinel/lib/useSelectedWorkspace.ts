"use client";

// Sentinel - which company (project) you are working in. ONE choice shared by the whole section: the project
// switcher in the top bar, every page's own picker, and the links between pages all read and write the same
// store, so picking a company anywhere moves everything with you.
//
// Where it comes from, in order: a ?workspace= link (investigation and KPI links already carry one), the last
// choice made in this browser, then the first company in the page's list. A page that can only show some
// companies (Manage Periods lists only the ones you own) falls back to the first of ITS list without changing
// the shared choice, so visiting it does not silently move you off a reference company you were studying.

import { useCallback, useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "sentinel.selectedWorkspace";

let current = "";
let initialised = false;
const listeners = new Set<() => void>();

function readStored(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return ""; // private mode or blocked storage: the choice just is not remembered
  }
}

function init() {
  if (initialised || typeof window === "undefined") return;
  initialised = true;
  current = new URLSearchParams(window.location.search).get("workspace") || readStored();
}

function subscribe(fn: () => void) {
  init();
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const snapshot = () => {
  init();
  return current;
};

/** Set the shared selection. `url: false` is for adopting a link's choice, which is already in the address. */
export function setSelectedWorkspace(id: string, opts: { url?: boolean } = {}) {
  if (id === current) return;
  current = id;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* not remembered */
  }
  if (opts.url !== false) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("workspace", id);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      /* address bar not updated */
    }
  }
  listeners.forEach((l) => l());
}

export function useSelectedWorkspace(ids: string[]): [string, (id: string) => void] {
  const stored = useSyncExternalStore(subscribe, snapshot, () => "");
  const key = ids.join(",");

  // A link that names a company wins over what was remembered.
  useEffect(() => {
    if (ids.length === 0) return;
    const fromUrl = new URLSearchParams(window.location.search).get("workspace");
    if (fromUrl && ids.includes(fromUrl)) setSelectedWorkspace(fromUrl, { url: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const effective = ids.includes(stored) ? stored : ids[0] ?? "";
  const choose = useCallback((id: string) => setSelectedWorkspace(id), []);
  return [effective, choose];
}

/** The shared selection as the store holds it, for the shell (which has its own list to validate against). */
export function useSharedSelection(): string {
  return useSyncExternalStore(subscribe, snapshot, () => "");
}
