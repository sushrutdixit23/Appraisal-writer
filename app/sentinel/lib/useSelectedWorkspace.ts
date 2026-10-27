"use client";

// Sentinel - which company you are looking at, remembered across pages. Every company picker used to
// start from "whatever the database returned first", so choosing a company on the KPI Dashboard and
// then opening Financial Statements dropped you back on a different one. This keeps one choice for
// the whole Sentinel section: the ?workspace= link wins (investigation and KPI links already carry it),
// then the last company picked in this browser, then the first company in the list.

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "sentinel.selectedWorkspace";

function remembered(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // private mode or blocked storage: the choice just is not remembered
  }
}

export function useSelectedWorkspace(ids: string[]): [string, (id: string) => void] {
  const [selected, setSelected] = useState("");
  const key = ids.join(",");

  useEffect(() => {
    if (ids.length === 0) {
      setSelected("");
      return;
    }
    const fromUrl = new URLSearchParams(window.location.search).get("workspace");
    const next =
      (fromUrl && ids.includes(fromUrl) && fromUrl) ||
      (() => {
        const r = remembered();
        return r && ids.includes(r) ? r : null;
      })() ||
      ids[0];
    setSelected((prev) => (prev && ids.includes(prev) ? prev : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const choose = useCallback((id: string) => {
    setSelected(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* not remembered */
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("workspace", id);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* address bar not updated */
    }
  }, []);

  return [selected, choose];
}
