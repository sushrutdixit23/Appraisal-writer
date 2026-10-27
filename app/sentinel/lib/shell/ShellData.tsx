"use client";

// Sentinel shell - the list of projects the signed-in person can see, loaded once for the top bar, the project
// switcher and the command palette. Pages still load their own data; this is only the list of companies.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { sortWorkspaces } from "../access";
import type { Workspace } from "../types";

type ShellState = {
  loading: boolean;
  signedIn: boolean;
  userId: string;
  workspaces: Workspace[];
  /** Reload the list after a project is created, renamed or deleted. */
  reload: () => Promise<void>;
};

const Ctx = createContext<ShellState>({ loading: true, signedIn: false, userId: "", workspaces: [], reload: async () => {} });

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  const load = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id ?? "";
    setUserId(uid);
    if (!uid) {
      setWorkspaces([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("sentinel_workspaces").select("*");
    setWorkspaces(sortWorkspaces((data ?? []) as Workspace[], uid));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo<ShellState>(() => ({ loading, signedIn: !!userId, userId, workspaces, reload: load }), [loading, userId, workspaces, load]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useShell = () => useContext(Ctx);
