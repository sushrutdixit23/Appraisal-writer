"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Target = {
  id: string;
  display_name: string;
  linkedin_identifier: string;
  is_active: boolean;
};

export default function CommentTargets() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const res = await fetch("/api/comment-targets", {
        headers: { "Authorization": `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTargets(data.targets || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addTarget = async () => {
    if (!name.trim() || !url.trim()) return;
    setAdding(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/comment-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ display_name: name.trim(), linkedin_identifier: url.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to add.");
        return;
      }
      setName("");
      setUrl("");
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setAdding(false);
    }
  };

  const removeTarget = async (id: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch("/api/comment-targets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ id }),
      });
      await load();
    } catch { /* ignore */ }
  };

  if (loading) return null;

  return (
    <div className="bg-cloud border border-line rounded-[20px] p-6">
      <p className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-slate mb-1">Comment opportunities</p>
      <p className="text-[12.5px] text-slate mb-4">Pick specific people whose posts are worth a thoughtful comment from you. Engage checks their recent posts and drafts a comment when there is a genuine angle - up to 5 a day.</p>

      {targets.length > 0 && (
        <div className="space-y-2 mb-4">
          {targets.map((t) => (
            <div key={t.id} className="flex items-center justify-between bg-mist border border-line rounded-xl px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-ink truncate">{t.display_name}</p>
                <p className="text-[11.5px] text-slate truncate">linkedin.com/in/{t.linkedin_identifier}</p>
              </div>
              <button onClick={() => removeTarget(t.id)} className="text-[12px] text-rose hover:underline flex-shrink-0 ml-3">Remove</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Their name"
          className="flex-1 bg-mist border border-line rounded-xl px-3.5 py-2.5 text-[13.5px] text-ink placeholder-slate-light focus:outline-none focus:border-indigo/40 transition-colors" />
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="linkedin.com/in/theirname"
          className="flex-1 bg-mist border border-line rounded-xl px-3.5 py-2.5 text-[13.5px] text-ink placeholder-slate-light focus:outline-none focus:border-indigo/40 transition-colors" />
        <button onClick={addTarget} disabled={adding} className="px-4 py-2.5 rounded-xl text-[13.5px] font-semibold text-white disabled:opacity-50 transition-all hover:opacity-90 whitespace-nowrap"
          style={{ background: "linear-gradient(115deg,#0A66C2,#5B4BFF,#8a6ff0)" }}>
          {adding ? "Adding..." : "Add"}
        </button>
      </div>
      {error && <p className="text-rose text-[12px] mt-2">{error}</p>}
    </div>
  );
}
