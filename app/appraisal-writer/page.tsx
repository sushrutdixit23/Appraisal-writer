"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useRef } from "react";
import SiteNav from "../components/SiteNav";
import { supabase } from "../lib/supabase";

const CREDIT_COST = 60;

const ACCENT = "linear-gradient(115deg,#5B4BFF,#8a6ff0)";

type Phase = "conversation" | "generating" | "output";

type Answers = {
  role: string;
  period: string;
  achievements: string;
  metrics: string;
  challenge: string;
  recognition: string;
  hidden: string;
};

type Output = {
  achievements: string[];
  summary: string;
  growth: string;
};

const QUESTIONS = [
  {
    id: "role",
    label: "Your role",
    question: "What is your role, and what review period are we covering?",
    hint: "e.g. Senior Analyst, Q1 2026 — or just describe your position",
    multiline: false,
  },
  {
    id: "achievements",
    label: "Key achievements",
    question: "What are the 2–3 things you are most proud of this period?",
    hint: "Rough notes are fine. What did you actually do that mattered?",
    multiline: true,
  },
  {
    id: "metrics",
    label: "Metrics & numbers",
    question: "Any numbers attached to those achievements?",
    hint: "Revenue, time saved, team size, percentages — even rough estimates count",
    multiline: false,
  },
  {
    id: "challenge",
    label: "Challenge navigated",
    question: "What is something hard you navigated or a problem you solved?",
    hint: "A difficult project, a conflict resolved, a deadline hit under pressure",
    multiline: true,
  },
  {
    id: "recognition",
    label: "What you want recognised",
    question: "What do you want your manager to take away from this review?",
    hint: "The one thing you want them to see clearly",
    multiline: false,
  },
  {
    id: "hidden",
    label: "Hidden context",
    question: "Anything you did that your manager might not fully see?",
    hint: "Behind-the-scenes work, mentoring, cross-team support — skip if nothing comes to mind",
    multiline: true,
  },
];

function parseOutput(raw: string): Output {
  const achievementsMatch = raw.match(/ACHIEVEMENTS\s*([\s\S]*?)\s*(?:SUMMARY|GROWTH)/i);
  const summaryMatch = raw.match(/SUMMARY\s*([\s\S]*?)\s*(?:GROWTH|$)/i);
  const growthMatch = raw.match(/GROWTH\s*([\s\S]*)/i);

  const achievements = achievementsMatch
    ? achievementsMatch[1].split("\n").map(l => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean)
    : [];
  const summary = summaryMatch ? summaryMatch[1].trim() : "";
  const growth = growthMatch ? growthMatch[1].trim() : "";

  return { achievements, summary, growth };
}

function assembleRawInput(answers: Answers): string {
  return `
Role / Position: ${answers.role}
Review Period: ${answers.period || "this appraisal cycle"}

Key Achievements:
${answers.achievements}

Metrics and Outcomes:
${answers.metrics || "Not provided"}

Challenge Navigated:
${answers.challenge}

What I Want Recognised:
${answers.recognition}

Additional Context (less visible work):
${answers.hidden || "None"}
`.trim();
}

export default function AppraisalWriter() {
  const [phase, setPhase] = useState<Phase>("conversation");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({
    role: "", period: "", achievements: "", metrics: "",
    challenge: "", recognition: "", hidden: "",
  });
  const [current, setCurrent] = useState("");
  const [credits, setCredits] = useState<number | null>(null);
  const [session, setSession] = useState<any>(null);
  const [error, setError] = useState("");
  const [output, setOutput] = useState<Output | null>(null);
  const [rawOutput, setRawOutput] = useState("");
  const [editedAchievements, setEditedAchievements] = useState<string[]>([]);
  const [editedSummary, setEditedSummary] = useState("");
  const [editedGrowth, setEditedGrowth] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      setSession(s);
      if (s) {
        // Load credits
        const { data: profile } = await supabase
          .from("profiles")
          .select("credits, voice_role, full_name")
          .eq("auth_user_id", s.user.id)
          .single();
        if (profile) {
          setCredits(profile.credits);
          // Pre-fill role from voice profile if exists
          if (profile.voice_role) {
            setAnswers(prev => ({ ...prev, role: profile.voice_role }));
            if (step === 0) setCurrent(profile.voice_role);
          }
        }
      }
    };
    load();
  }, []);

  useEffect(() => {
    // Focus input when step changes
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [step]);

  const q = QUESTIONS[step];
  const isLastStep = step === QUESTIONS.length - 1;
  const progress = ((step) / QUESTIONS.length) * 100;

  const handleNext = () => {
    if (!current.trim() && step !== 5) {
      // step 5 (hidden) is optional
      setError("Please answer before continuing.");
      return;
    }
    setError("");

    // Save current answer
    const answerKey = q.id as keyof Answers;
    setAnswers(prev => ({ ...prev, [answerKey]: current.trim() }));

    if (isLastStep) {
      // Start generation
      const finalAnswers = { ...answers, [answerKey]: current.trim() };
      generate(finalAnswers);
    } else {
      // Advance to next step
      const nextQ = QUESTIONS[step + 1];
      const nextKey = nextQ.id as keyof Answers;
      setCurrent(answers[nextKey] || "");
      setStep(s => s + 1);
    }
  };

  const handleBack = () => {
    if (step === 0) return;
    const answerKey = q.id as keyof Answers;
    setAnswers(prev => ({ ...prev, [answerKey]: current.trim() }));
    const prevQ = QUESTIONS[step - 1];
    const prevKey = prevQ.id as keyof Answers;
    setCurrent(answers[prevKey] || "");
    setStep(s => s - 1);
    setError("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !q.multiline) {
      e.preventDefault();
      handleNext();
    }
  };

  const generate = async (finalAnswers: Answers) => {
    setPhase("generating");
    setError("");

    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s) { setError("Please sign in to continue."); setPhase("conversation"); return; }

      const rawInput = assembleRawInput(finalAnswers);
      const jobTitle = finalAnswers.role;

      const res = await fetch("/api/generate-credits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${s.access_token}`,
        },
        body: JSON.stringify({ jobTitle, tone: "Confident", rawInput }),
      });

      const result = await res.json();

      if (!res.ok) {
        if (result.code === "INSUFFICIENT_CREDITS") {
          setError(`Not enough credits. You have ${result.credits}, this costs ${result.required}. Top up in your account settings.`);
        } else {
          setError(result.error || "Generation failed.");
        }
        setPhase("conversation");
        return;
      }

      const parsed = parseOutput(result.output);
      setOutput(parsed);
      setRawOutput(result.output);
      setEditedAchievements(parsed.achievements);
      setEditedSummary(parsed.summary);
      setEditedGrowth(parsed.growth);
      setCredits(result.credits_remaining);
      setPhase("output");

    } catch (e: any) {
      setError(e.message || "Something went wrong.");
      setPhase("conversation");
    }
  };

  const copyAll = () => {
    const text = [
      "KEY ACHIEVEMENTS",
      ...editedAchievements.map(a => `• ${a}`),
      "",
      "SUMMARY",
      editedSummary,
      "",
      "GROWTH & CHALLENGES",
      editedGrowth,
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Loading ───────────────────────────────────────────────────
  if (phase === "generating") {
    return (
      <main className="min-h-screen bg-mist relative overflow-x-hidden">
        <div className="aurora-field" />
        <div className="relative z-10">
          <SiteNav />
          <div className="min-h-[80vh] flex flex-col items-center justify-center px-6">
            <div className="w-10 h-10 rounded-full border-2 border-indigo border-t-transparent animate-spin mb-6" />
            <p className="font-display font-semibold text-[22px] text-ink mb-2">Writing your appraisal</p>
            <p className="text-slate text-[15px]">Pulling from your answers and voice profile...</p>
          </div>
        </div>
      </main>
    );
  }

  // ─── Output ────────────────────────────────────────────────────
  if (phase === "output" && output) {
    return (
      <main className="min-h-screen bg-mist relative overflow-x-hidden">
        <div className="aurora-field" />
        <div className="relative z-10">
          <SiteNav />
          <div className="max-w-3xl mx-auto px-6 pt-28 pb-20">

            <div className="flex items-center justify-between mb-10">
              <div>
                <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-indigo mb-1">Appraisal ready</p>
                <h1 className="font-display font-bold text-[28px] tracking-tight text-ink">Your draft is ready.</h1>
                <p className="text-slate text-[14px] mt-1">Edit any section directly — changes save as you type.</p>
              </div>
              <button
                onClick={copyAll}
                className="flex items-center gap-2 px-5 py-2.5 rounded-[11px] text-[14px] font-semibold text-white shadow-[0_4px_14px_rgba(91,75,255,0.3)] hover:opacity-90 transition-all"
                style={{ background: ACCENT }}
              >
                <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-current stroke-[2] fill-none" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="7" y="3" width="10" height="13" rx="2" />
                  <path d="M13 3v-1a1 1 0 00-1-1H4a2 2 0 00-2 2v11a2 2 0 002 2h1" />
                </svg>
                {copied ? "Copied!" : "Copy all"}
              </button>
            </div>

            {/* Key Achievements */}
            <div className="bg-cloud border border-line rounded-[20px] p-7 mb-5">
              <div className="flex items-center justify-between mb-5">
                <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo font-semibold">Key achievements</p>
                <span className="text-[11px] text-slate">{editedAchievements.length} bullets</span>
              </div>
              <div className="space-y-3">
                {editedAchievements.map((a, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-indigo font-bold text-[16px] mt-0.5 flex-shrink-0">•</span>
                    <textarea
                      value={a}
                      onChange={e => {
                        const next = [...editedAchievements];
                        next[i] = e.target.value;
                        setEditedAchievements(next);
                      }}
                      rows={2}
                      className="flex-1 text-[15px] text-ink leading-relaxed bg-transparent resize-none focus:outline-none border-b border-transparent focus:border-line transition-colors"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-cloud border border-line rounded-[20px] p-7 mb-5">
              <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo font-semibold mb-5">Summary</p>
              <textarea
                value={editedSummary}
                onChange={e => setEditedSummary(e.target.value)}
                rows={4}
                className="w-full text-[15px] text-ink leading-relaxed bg-transparent resize-none focus:outline-none border-b border-transparent focus:border-line transition-colors"
              />
            </div>

            {/* Growth */}
            {editedGrowth && (
              <div className="bg-cloud border border-line rounded-[20px] p-7 mb-8">
                <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo font-semibold mb-5">Growth & challenges</p>
                <textarea
                  value={editedGrowth}
                  onChange={e => setEditedGrowth(e.target.value)}
                  rows={3}
                  className="w-full text-[15px] text-ink leading-relaxed bg-transparent resize-none focus:outline-none border-b border-transparent focus:border-line transition-colors"
                />
              </div>
            )}

            {/* Footer actions */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <button
                onClick={() => { setPhase("conversation"); setStep(0); setCurrent(answers.role); setOutput(null); }}
                className="text-[13px] text-slate hover:text-indigo transition-colors"
              >
                ← Start over
              </button>
              <div className="flex items-center gap-2">
                {credits !== null && (
                  <span className="text-[12px] text-slate font-mono">{credits} credits left</span>
                )}
                <button
                  onClick={copyAll}
                  className="px-5 py-2.5 rounded-[11px] text-[14px] font-semibold text-white hover:opacity-90 transition-all"
                  style={{ background: ACCENT }}
                >
                  {copied ? "Copied!" : "Copy all"}
                </button>
              </div>
            </div>

          </div>
        </div>
      </main>
    );
  }

  // ─── Conversation ──────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-mist relative overflow-x-hidden">
      <div className="aurora-field" />
      <div className="relative z-10">
        <SiteNav />

        <div className="max-w-xl mx-auto px-6 pt-24 pb-20">

          {/* Progress */}
          <div className="mb-10">
            <div className="flex items-center justify-between mb-2.5">
              <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo">
                Question {step + 1} of {QUESTIONS.length}
              </p>
              {credits !== null && (
                <span className="font-mono text-[11px] text-slate">{credits} credits · costs {CREDIT_COST}</span>
              )}
            </div>
            <div className="h-[3px] bg-line rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: ACCENT }}
              />
            </div>
          </div>

          {/* Question card */}
          <div className="bg-cloud border border-line rounded-[24px] p-8 shadow-zy-sm mb-6">

            <div className="mb-1.5">
              <span className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-slate">{q.label}</span>
            </div>

            <h2 className="font-display font-bold text-[22px] tracking-tight text-ink leading-[1.2] mb-2">
              {q.question}
            </h2>

            <p className="text-[13.5px] text-slate mb-6 leading-relaxed">{q.hint}</p>

            {q.multiline ? (
              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={current}
                onChange={e => setCurrent(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={5}
                placeholder="Type your answer here..."
                className="w-full bg-mist border border-line rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder-slate-light resize-none focus:outline-none focus:border-indigo/40 transition-colors leading-relaxed"
              />
            ) : (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type="text"
                value={current}
                onChange={e => setCurrent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your answer here..."
                className="w-full bg-mist border border-line rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder-slate-light focus:outline-none focus:border-indigo/40 transition-colors"
              />
            )}

            {error && <p className="text-rose text-[13px] mt-3">{error}</p>}

          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleBack}
              disabled={step === 0}
              className="flex items-center gap-1.5 text-[14px] text-slate hover:text-ink disabled:opacity-30 transition-colors"
            >
              <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-current stroke-[2] fill-none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 16l-6-6 6-6" />
              </svg>
              Back
            </button>

            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-3 rounded-[13px] text-[15px] font-semibold text-white shadow-[0_4px_14px_rgba(91,75,255,0.3)] hover:opacity-90 transition-all"
              style={{ background: ACCENT }}
            >
              {isLastStep ? "Generate appraisal" : "Continue"}
              <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-current stroke-[2.5] fill-none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 4l6 6-6 6" />
              </svg>
            </button>
          </div>

          {/* Skip hint for optional question */}
          {step === 5 && (
            <p className="text-center text-[12px] text-slate mt-4">
              This question is optional —{" "}
              <button onClick={handleNext} className="text-indigo hover:underline">skip it</button>
            </p>
          )}

        </div>
      </div>
    </main>
  );
}
