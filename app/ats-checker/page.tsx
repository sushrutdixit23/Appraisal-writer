"use client";

import { useState } from "react";
import SiteNav from "../components/SiteNav";

const ACCENT = "linear-gradient(115deg,#5B4BFF,#8a6ff0)";

type Phase = "form" | "analyzing" | "results";

type FormatIssue = { issue: string; fix: string };
type PhrasingFix = { original: string; fix: string };
type KeywordMatches = { matched: string[]; missing: string[] } | null;

type Result = {
  score: number;
  projected_score: number;
  verdict: string;
  formatting: FormatIssue[];
  missing_sections: string[];
  keyword_matches: KeywordMatches;
  phrasing: PhrasingFix[];
};

function scoreColor(score: number) {
  if (score >= 80) return "#5B4BFF";
  if (score >= 50) return "#8a6f1f";
  return "#c0405a";
}

export default function AtsChecker() {
  const [phase, setPhase] = useState<Phase>("form");
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parse-resume", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not read this file.");
        setUploadedFileName("");
      } else {
        setResumeText(data.text);
        setUploadedFileName(file.name);
      }
    } catch {
      setError("Upload failed. Try pasting the text instead.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const analyze = async () => {
    if (!resumeText.trim()) {
      setError("Paste your resume text first.");
      return;
    }
    setError("");
    setPhase("analyzing");

    try {
      const res = await fetch("/api/ats-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText,
          jobDescription: jobDescription.trim() || undefined,
          targetRole: targetRole.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Analysis failed.");
        setPhase("form");
        return;
      }

      setResult(data);
      setPhase("results");
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
      setPhase("form");
    }
  };

  const reset = () => {
    setResult(null);
    setPhase("form");
  };

  const goToBuilder = () => {
    if (!result) return;
    try {
      sessionStorage.setItem("ats_handoff", JSON.stringify({
        resumeText,
        targetRole,
        jobDescription,
        score: result.score,
        projected_score: result.projected_score,
        verdict: result.verdict,
        formatting: result.formatting,
        missing_sections: result.missing_sections,
        phrasing: result.phrasing,
      }));
    } catch {}
    window.location.href = "/resume-builder";
  };

  if (phase === "analyzing") {
    return (
      <main className="min-h-screen bg-mist relative overflow-x-hidden">
        <div className="aurora-field" />
        <div className="relative z-10">
          <SiteNav />
          <div className="min-h-[80vh] flex flex-col items-center justify-center px-6">
            <div className="w-10 h-10 rounded-full border-2 border-indigo border-t-transparent animate-spin mb-6" />
            <p className="font-display font-semibold text-[22px] text-ink mb-2">Scanning your resume</p>
            <p className="text-slate text-[15px]">Checking formatting, structure, and keyword match...</p>
          </div>
        </div>
      </main>
    );
  }

  if (phase === "results" && result) {
    return (
      <main className="min-h-screen bg-mist relative overflow-x-hidden">
        <div className="aurora-field" />
        <div className="relative z-10">
          <SiteNav />
          <div className="max-w-3xl mx-auto px-6 pt-28 pb-20">

            <div className="bg-cloud border border-line rounded-[20px] p-8 mb-5 text-center">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-indigo mb-3">ATS score</p>
              <p className="font-display font-bold text-[56px] leading-none mb-3" style={{ color: scoreColor(result.score) }}>
                {result.score}
              </p>
              {result.projected_score > result.score && (
                <p className="text-[13px] text-slate mb-3">
                  Could reach <span className="font-semibold" style={{ color: scoreColor(result.projected_score) }}>{result.projected_score}</span> by fixing the issues below
                </p>
              )}
              <p className="text-[15px] text-ink max-w-[46ch] mx-auto leading-relaxed">{result.verdict}</p>
            </div>

            {result.formatting.length > 0 && (
              <div className="bg-cloud border border-line rounded-[20px] p-7 mb-5">
                <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo font-semibold mb-5">Formatting & structure</p>
                <div className="space-y-4">
                  {result.formatting.map((f, i) => (
                    <div key={i}>
                      <p className="text-[14.5px] text-ink font-medium mb-1">{f.issue}</p>
                      <p className="text-[13.5px] text-slate leading-relaxed">{f.fix}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.missing_sections.length > 0 && (
              <div className="bg-cloud border border-line rounded-[20px] p-7 mb-5">
                <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo font-semibold mb-4">Missing sections</p>
                <div className="flex flex-wrap gap-2">
                  {result.missing_sections.map((s, i) => (
                    <span key={i} className="px-3 py-1.5 rounded-full text-[13px] bg-mist border border-line text-ink">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {result.keyword_matches && (
              <div className="bg-cloud border border-line rounded-[20px] p-7 mb-5">
                <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo font-semibold mb-4">Keyword match vs job description</p>
                <div className="mb-4">
                  <p className="text-[12.5px] text-slate mb-2">Matched</p>
                  <div className="flex flex-wrap gap-2">
                    {result.keyword_matches.matched.map((k, i) => (
                      <span key={i} className="px-3 py-1.5 rounded-full text-[13px] bg-mist border border-indigo/30 text-indigo">{k}</span>
                    ))}
                  </div>
                </div>
                {result.keyword_matches.missing.length > 0 && (
                  <div>
                    <p className="text-[12.5px] text-slate mb-2">Missing</p>
                    <div className="flex flex-wrap gap-2">
                      {result.keyword_matches.missing.map((k, i) => (
                        <span key={i} className="px-3 py-1.5 rounded-full text-[13px] bg-mist border border-rose/30 text-rose">{k}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {result.phrasing.length > 0 && (
              <div className="bg-cloud border border-line rounded-[20px] p-7 mb-8">
                <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo font-semibold mb-5">Weak phrasing</p>
                <div className="space-y-5">
                  {result.phrasing.map((p, i) => (
                    <div key={i}>
                      <p className="text-[14px] text-slate line-through mb-1.5 leading-relaxed">{p.original}</p>
                      <p className="text-[14.5px] text-ink leading-relaxed">{p.fix}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between flex-wrap gap-3">
              <button onClick={reset} className="text-[13px] text-slate hover:text-indigo transition-colors">&larr; Check another resume</button>
              <button onClick={goToBuilder} className="text-[13px] text-indigo hover:underline">Fix these issues in the Resume Builder &rarr;</button>
            </div>

          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-mist relative overflow-x-hidden">
      <div className="aurora-field" />
      <div className="relative z-10">
        <SiteNav />
        <div className="max-w-xl mx-auto px-6 pt-24 pb-20">

          <div className="mb-8 text-center">
            <h1 className="font-display font-bold text-[28px] tracking-tight text-ink mb-2">ATS Resume Checker</h1>
            <p className="text-slate text-[14.5px] max-w-[42ch] mx-auto leading-relaxed">Paste or upload your resume to get an ATS score, formatting fixes, and stronger phrasing. Add a target role or job description for sharper feedback.</p>
          </div>

          <div className="bg-cloud border border-line rounded-[24px] p-8 shadow-zy-sm mb-6">
            <label className="block mb-1.5">
              <span className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-slate">Upload resume (PDF, DOCX, or TXT)</span>
            </label>
            <div className="flex items-center gap-3 mb-6">
              <label className="cursor-pointer px-4 py-2.5 rounded-[11px] text-[13.5px] font-medium bg-mist border border-line text-ink hover:border-indigo/40 transition-colors">
                {uploading ? "Reading file..." : "Choose file"}
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              {uploadedFileName && !uploading && (
                <span className="text-[13px] text-slate">{uploadedFileName} loaded</span>
              )}
            </div>

            <label className="block mb-1.5">
              <span className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-slate">Or paste resume text</span>
            </label>
            <textarea
              value={resumeText}
              onChange={e => setResumeText(e.target.value)}
              rows={10}
              placeholder="Paste your resume text here..."
              className="w-full bg-mist border border-line rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder-slate-light resize-none focus:outline-none focus:border-indigo/40 transition-colors leading-relaxed mb-1"
            />
            <p className="text-[11px] text-slate-light mb-6">{resumeText.length}/8000</p>

            <label className="block mb-1.5">
              <span className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-slate">Target role (optional)</span>
            </label>
            <input
              type="text"
              value={targetRole}
              onChange={e => setTargetRole(e.target.value)}
              placeholder="e.g. Business Analyst, Senior Product Manager..."
              className="w-full bg-mist border border-line rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder-slate-light focus:outline-none focus:border-indigo/40 transition-colors mb-6"
            />

            <label className="block mb-1.5">
              <span className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-slate">Job description (optional)</span>
            </label>
            <textarea
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
              rows={5}
              placeholder="Paste the job description to check keyword match..."
              className="w-full bg-mist border border-line rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder-slate-light resize-none focus:outline-none focus:border-indigo/40 transition-colors leading-relaxed mb-1"
            />
            <p className="text-[11px] text-slate-light">{jobDescription.length}/4000</p>

            {error && <p className="text-rose text-[13px] mt-4">{error}</p>}
          </div>

          <div className="flex justify-end">
            <button
              onClick={analyze}
              className="flex items-center gap-2 px-6 py-3 rounded-[13px] text-[15px] font-semibold text-white shadow-[0_4px_14px_rgba(91,75,255,0.3)] hover:opacity-90 transition-all"
              style={{ background: ACCENT }}
            >
              Check my resume
              <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-current stroke-[2.5] fill-none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 4l6 6-6 6" />
              </svg>
            </button>
          </div>

        </div>
      </div>
    </main>
  );
}
