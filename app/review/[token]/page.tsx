"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Item = {
  id: string;
  type: string;
  name: string;
  role: string;
  post: string | null;
  text: string;
  reply: string;
  classification: string | null;
  temperature: string | null;
  temperature_reason: string | null;
  reasoning: string | null;
  created_at: string;
};

export default function ReviewPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clientName, setClientName] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch(`/api/review/action?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "This link is not valid.");
        setLoading(false);
        return;
      }
      setClientName(data.clientName);
      setItems(data.items || []);
    } catch {
      setError("Could not reach the server.");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [token]);

  const act = async (id: string, action: "approve" | "skip") => {
    setBusyId(id);
    try {
      const res = await fetch("/api/review/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, id, action }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }
    } catch { /* ignore */ }
    setBusyId(null);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-mist flex items-center justify-center">
        <p className="text-slate text-sm">Loading...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-mist flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="font-display font-bold text-xl text-ink mb-2">Link not available</p>
          <p className="text-slate text-sm">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-mist">
      <div className="max-w-2xl mx-auto px-6 pt-14 pb-20">
        <div className="mb-8">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-indigo mb-1">Approval queue</p>
          <h1 className="font-display font-bold text-[26px] tracking-tight text-ink">{clientName}</h1>
          <p className="text-slate text-[13.5px] mt-1">Review and approve drafts without needing a full account. This link expires automatically.</p>
        </div>

        {items.length === 0 ? (
          <div className="bg-cloud border border-line rounded-[20px] p-8 text-center">
            <p className="text-ink font-medium mb-1">Nothing pending right now.</p>
            <p className="text-slate text-sm">New drafts will show up here as they come in.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.id} className="bg-cloud border border-line rounded-[20px] p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-ink/10 text-ink-soft px-2 py-1 rounded-md">
                      {item.type === "post_draft" ? "Post" : item.type === "dm" ? "DM" : "Comment"}
                    </span>
                    <span className="text-[13.5px] font-semibold text-ink">{item.name}</span>
                  </div>
                  {item.temperature && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate">{item.temperature}</span>
                  )}
                </div>

                {item.post && (
                  <p className="text-[12.5px] text-slate mb-2 bg-mist rounded-lg px-3 py-2">On: {item.post}</p>
                )}

                <p className="text-[13.5px] text-ink-soft mb-3 leading-relaxed">{item.text}</p>

                <div className="bg-mist border border-line rounded-xl p-4 mb-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate mb-1.5">Drafted reply</p>
                  <p className="text-[14px] text-ink leading-relaxed whitespace-pre-wrap">{item.reply}</p>
                </div>

                <div className="flex gap-2.5">
                  <button
                    onClick={() => act(item.id, "skip")}
                    disabled={busyId === item.id}
                    className="flex-1 py-2.5 text-[13.5px] border border-line rounded-xl text-ink-soft hover:border-slate disabled:opacity-50 transition-colors"
                  >
                    Skip
                  </button>
                  <button
                    onClick={() => act(item.id, "approve")}
                    disabled={busyId === item.id}
                    className="flex-[2] py-2.5 text-[13.5px] font-semibold text-white rounded-xl disabled:opacity-50 transition-all hover:opacity-90"
                    style={{ background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)" }}
                  >
                    Approve & send
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
