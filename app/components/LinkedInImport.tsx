"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function LinkedInImport() {
  const [about, setAbout] = useState<string | null>(null);
  const [recentPosts, setRecentPosts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from("clients")
      .select("linkedin_about, linkedin_recent_posts")
      .eq("auth_user_id", session.user.id)
      .single();
    if (data) {
      setAbout(data.linkedin_about || null);
      setRecentPosts(data.linkedin_recent_posts || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const doImport = async () => {
    setImporting(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/import-linkedin-profile", {
        method: "POST",
        headers: { "Authorization": `Bearer ${session?.access_token}` },
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Import failed.");
        return;
      }
      setAbout(result.about || null);
      setRecentPosts(result.recentPosts || []);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setImporting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="bg-cloud border border-line rounded-[20px] p-6">
      <p className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-slate mb-1">About & recent posts</p>
      <p className="text-[12.5px] text-slate mb-4">Pull your real LinkedIn About section and last 3 posts straight from your profile, so your post voice reflects how you actually describe yourself and what you've recently written about - not just what you type into the samples above.</p>

      <button onClick={doImport} disabled={importing} className="w-full py-2.5 text-[13px] font-semibold rounded-xl text-white disabled:opacity-50 transition-all hover:opacity-90 mb-4"
        style={{ background: "linear-gradient(115deg,#0A66C2,#5B4BFF,#8a6ff0)" }}>
        {importing ? "Importing from LinkedIn..." : about || recentPosts.length > 0 ? "Refresh from LinkedIn" : "Import from LinkedIn"}
      </button>
      {error && <p className="text-rose text-[12px] mb-3">{error}</p>}

      {about && (
        <div className="mb-4">
          <p className="text-[11px] font-semibold text-ink-soft mb-1.5">About (imported)</p>
          <div className="bg-mist border border-line rounded-xl px-4 py-3 text-[13px] text-ink-soft leading-relaxed whitespace-pre-wrap">{about}</div>
        </div>
      )}

      {recentPosts.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-ink-soft mb-1.5">Last {recentPosts.length} posts (imported)</p>
          <div className="space-y-2">
            {recentPosts.map((p, i) => (
              <div key={i} className="bg-mist border border-line rounded-xl px-4 py-3 text-[12.5px] text-ink-soft leading-relaxed line-clamp-3">{p}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
