"use client";

import { useState } from "react";
import SiteNav from "../components/SiteNav";

const ACCENT = "linear-gradient(115deg,#5B4BFF,#8a6ff0)";

type Phase = "form" | "generating" | "output";

function parseOutput(raw: string) {
  const changesMatch = raw.match(/CHANGES\s*([\s\S]*?)\s*(?:RESUME|$)/i);
  const resumeMatch = raw.match(/RESUME\s*([\s\S]*)/i);
  const changes = changesMatch
    ? changesMatch[1].split("\n").map(l => l.replace(/^[-\u2022]\s*/, "").trim()).filter(Boolean)
    : [];
  const resume = resumeMatch ? resumeMatch[1].trim() : raw.trim();
  return { changes, resume };
}

export default function ResumeBuilder() {
  const [phase, setPhase] = useState<Phase>("form");
  const [resumeText, setResumeText] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [changes, setChanges] = useState<string[]>([]);
  const [editedResume, setEditedResume] = useState("");
  const [copied, setCopied] = useState(false);

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

  const build = async () => {
    if (!resumeText.trim()) {
      setError("Paste or upload your resume first.");
      return;
    }
    setError("");
    setPhase("generating");

    try {
      const res = await fetch("/api/resume-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText,
          targetRole: targetRole.trim() || undefined,
          jobDescription: jobDescription.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Generation failed.");
        setPhase("form");
        return;
      }

      const parsed = parseOutput(data.output);
      setChanges(parsed.changes);
      setEditedResume(parsed.resume);
      setPhase("output");
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
      setPhase("form");
    }
  };

  const copyAll = () => {
    navigator.clipboard.writeText(editedResume);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setPhase("form");
    setChanges([]);
    setEditedResume("");
  };

  if (phase === "generating") {
    return (
      <main className="min-h-screen bg-mist relative overflow-x-hidden">
        <div className="aurora-field" />
        <div className="relative z-10">
          <SiteNav />
          <div className="min-h-[80vh] flex flex-col items-center justify-center px-6">
            <div className="w-10 h-10 rounded-full border-2 border-indigo border-t-transparent animate-spin mb-6" />
            <p className="font-display font-semibold text-[22px] text-ink mb-2">Rewriting your resume</p>
            <p className="text-slate text-[15px]">Optimizing structure, phrasing, and ATS parseability...</p>
          </div>
        </div>
      </main>
    );
  }

  if (phase === "output") {
    return (
      <main className="min-h-screen bg-mist relative overflow-x-hidden">
        <div className="aurora-field" />
        <div className="relative z-10">
          <SiteNav />
          <div className="max-w-3xl mx-auto px-6 pt-28 pb-20">

            <div className="flex items-center justify-between mb-10">
              <div>
                <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-indigo mb-1">Rewrite ready</p>
                <h1 className="font-display font-bold text-[28px] tracking-tight text-ink">Your ATS-optimized resume</h1>
                <p className="text-slate text-[14px] mt-1">Edit directly below, then copy into your document.</p>
              </div>
              <button
                onClick={copyAll}
                className="flex items-center gap-2 px-5 py-2.5 rounded-[11px] text-[14px] font-semibold text-white shadow-[0_4px_14px_rgba(91,75,255,0.3)] hover:opacity-90 transition-all"
                style={{ background: ACCENT }}
              >
                {copied ? "Copied!" : "Copy all"}
              </button>
            </div>

            {changes.length > 0 && (
              <div className="bg-cloud border border-line rounded-[20px] p-7 mb-5">
                <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo font-semibold mb-5">What changed</p>
                <div className="space-y-2.5">
                  {changes.map((c, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="text-indigo font-bold text-[16px] mt-0.5 flex-shrink-0">-</span>
                      <p className="text-[14.5px] text-ink leading-relaxed">{c}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-cloud border border-line rounded-[20px] p-7 mb-8">
              <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo font-semibold mb-5">Resume</p>
              <textarea
                value={editedResume}
                onChange={e => setEditedResume(e.target.value)}
                rows={24}
                className="w-full text-[14.5px] text-ink leading-relaxed bg-transparent resize-none focus:outline-none font-mono"
              />
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3">
              <button onClick={reset} className="text-[13px] text-slate hover:text-indigo transition-colors">Start over</button>
              <a href="/ats-checker" className="text-[13px] text-indigo hover:underline">Check the ATS score of this version</a>
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
            <h1 className="font-display font-bold text-[28px] tracking-tight text-ink mb-2">ATS Resume Builder</h1>
            <p className="text-slate text-[14.5px] max-w-[42ch] mx-auto leading-relaxed">Paste or upload your resume and get a rewritten, ATS-optimized version - stronger phrasing, cleaner structure, ready to copy.</p>
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
              placeholder="Paste the job description to tailor toward it..."
              className="w-full bg-mist border border-line rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder-slate-light resize-none focus:outline-none focus:border-indigo/40 transition-colors leading-relaxed mb-1"
            />
            <p className="text-[11px] text-slate-light">{jobDescription.length}/4000</p>

            {error && <p className="text-rose text-[13px] mt-4">{error}</p>}
          </div>

          <div className="flex justify-end">
            <button
              onClick={build}
              className="flex items-center gap-2 px-6 py-3 rounded-[13px] text-[15px] font-semibold text-white shadow-[0_4px_14px_rgba(91,75,255,0.3)] hover:opacity-90 transition-all"
              style={{ background: ACCENT }}
            >
              Build my resume
            </button>
          </div>

        </div>
      </div>
    </main>
  );
}
