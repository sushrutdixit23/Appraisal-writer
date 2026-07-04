import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const STOPWORDS = new Set([
  "the","a","an","and","or","but","is","are","was","were","be","been","being",
  "to","of","in","on","at","for","with","by","from","as","this","that","it",
  "i","you","we","they","he","she","my","your","our","their","not","no","do",
  "does","did","will","would","can","could","should","just","so","if","then",
  "than","there","here","what","when","where","who","how","also","very","more",
  "most","some","such","only","own","same","too","up","out","over","again",
  "into","about","get","got","like","have","has","had","its","it's","im","i'm",
  "am","s","t","re","ve","ll","d","m","really","much","one","new",
  "that's","something","actually","happy","sure","thanks","thank","hello","hi",
  "feel","free","great","best","regards","sincerely","dear","hope","hoping",
  "please","let","know","think","see","want","need","going","way","lot","bit",
  "yes","okay","ok","well","good","glad","appreciate","reach","reaching"
]);

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: client } = await supabase
    .from("clients")
    .select("id, created_at, voice_name")
    .eq("auth_user_id", user.id)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  // Pull all sent interactions with their original draft for comparison
  const { data: sent } = await supabase
    .from("interactions")
    .select("type, reply, original_draft, created_at")
    .eq("client_id", client.id)
    .eq("status", "sent");

  const items = sent || [];
  const totalSent = items.length;
  const repliesSent = items.filter(i => i.type !== "post_draft").length;
  const postsSent = items.filter(i => i.type === "post_draft").length;

  // Edit rate: how many final sends differ meaningfully from the original AI draft
  const comparable = items.filter(i => i.original_draft && i.reply);
  const edited = comparable.filter(i => {
    const a = (i.original_draft || "").trim();
    const b = (i.reply || "").trim();
    return a !== b;
  });
  const editRate = comparable.length > 0 ? Math.round((edited.length / comparable.length) * 100) : null;

  // Average length change on edited items (rough signal of how much rewriting happens)
  let avgLengthChangePct: number | null = null;
  if (edited.length > 0) {
    const changes = edited.map(i => {
      const origLen = (i.original_draft || "").length || 1;
      const newLen = (i.reply || "").length;
      return ((newLen - origLen) / origLen) * 100;
    });
    avgLengthChangePct = Math.round(changes.reduce((s, v) => s + v, 0) / changes.length);
  }

  // Build a per-client exclusion set that also drops their own name, so "Sushrut"
  // showing up in every sign-off doesn't get mistaken for a style signal.
  const nameWords = (client.voice_name || "")
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter(Boolean);
  const excluded = new Set([...STOPWORDS, ...nameWords]);

  // Vocabulary extraction from sent replies. Counts DISTINCT MESSAGES a word
  // appears in, not raw occurrences - a word repeated five times in one
  // message is a weaker signal than a word used once across five different
  // conversations, and this makes sure the frequency count reflects that.
  const wordMessageCount: Record<string, number> = {};
  items.forEach(i => {
    const text = (i.reply || "").toLowerCase();
    const words = text.match(/[a-z']+/g) || [];
    const uniqueInThisMessage = new Set<string>(
      words.filter((w: string) => w.length >= 4 && !excluded.has(w))
    );
    uniqueInThisMessage.forEach(w => {
      wordMessageCount[w] = (wordMessageCount[w] || 0) + 1;
    });
  });

  const topWords = Object.entries(wordMessageCount)
    .sort(([,a],[,b]) => b - a)
    .filter(([,count]) => count >= 2)
    .slice(0, 8)
    .map(([word]) => word);

  // Days active = days since client created
  const daysActive = client.created_at
    ? Math.max(1, Math.floor((Date.now() - new Date(client.created_at).getTime()) / (1000*60*60*24)))
    : null;

  return NextResponse.json({
    totalSent,
    repliesSent,
    postsSent,
    editRate,
    avgLengthChangePct,
    topWords,
    daysActive,
    hasEnoughData: totalSent >= 3,
  });
}
