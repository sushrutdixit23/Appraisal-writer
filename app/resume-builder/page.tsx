"use client";

import { useState, useEffect } from "react";
import SiteNav from "../components/SiteNav";

const ACCENT = "linear-gradient(115deg,#5B4BFF,#8a6ff0)";

type Phase = "form" | "generating" | "output";

type HandoffIssue = { issue: string; fix: string };
type HandoffPhrasing = { original: string; fix: string };

type Handoff = {
  resumeText?: string;
  targetRole?: string;
  jobDescription?: string;
  score?: number;
  projected_score?: number;
  verdict?: string;
  formatting?: HandoffIssue[];
  missing_sections?: string[];
  phrasing?: HandoffPhrasing[];
};

type StructuredResume = {
  name: string;
  title: string;
  contact: { phone: string; email: string; location: string; linkedin: string };
  summary: string;
  skills: { category: string; items: string }[];
  experience: { title: string; company: string; dates: string; bullets: string[] }[];
  education: { degree: string; institution: string; dates: string }[];
  certifications: string[];
  additional: string[];
};

function buildKnownIssuesText(h: Handoff): string {
  const parts: string[] = [];
  if (h.formatting?.length) {
    parts.push("Formatting issues:\n" + h.formatting.map(f => `- ${f.issue} (fix: ${f.fix})`).join("\n"));
  }
  if (h.missing_sections?.length) {
    parts.push("Missing sections: " + h.missing_sections.join(", "));
  }
  if (h.phrasing?.length) {
    parts.push("Weak phrasing flagged:\n" + h.phrasing.map(p => `- "${p.original}" -> ${p.fix}`).join("\n"));
  }
  return parts.join("\n\n");
}

function resumeToPlainText(r: StructuredResume): string {
  const lines: string[] = [];
  lines.push(r.name);
  if (r.title) lines.push(r.title);
  const contactParts = [r.contact.phone, r.contact.email, r.contact.location, r.contact.linkedin].filter(Boolean);
  if (contactParts.length) lines.push(contactParts.join(" | "));
  lines.push("");
  if (r.summary) {
    lines.push("SUMMARY");
    lines.push(r.summary);
    lines.push("");
  }
  if (r.skills?.length) {
    lines.push("SKILLS");
    r.skills.forEach(s => lines.push(`${s.category}: ${s.items}`));
    lines.push("");
  }
  if (r.experience?.length) {
    lines.push("EXPERIENCE");
    r.experience.forEach(e => {
      lines.push(`${e.title} - ${e.company} (${e.dates})`);
      e.bullets.forEach(b => lines.push(`- ${b}`));
      lines.push("");
    });
  }
  if (r.education?.length) {
    lines.push("EDUCATION");
    r.education.forEach(ed => lines.push(`${ed.degree} - ${ed.institution} (${ed.dates})`));
    lines.push("");
  }
  if (r.certifications?.length) {
    lines.push("CERTIFICATIONS");
    lines.push(r.certifications.join(", "));
    lines.push("");
  }
  if (r.additional?.length) {
    lines.push("ADDITIONAL");
    r.additional.forEach(a => lines.push(`- ${a}`));
  }
  return lines.join("\n").trim();
}

export default function ResumeBuilder() {
  const [phase, setPhase] = useState<Phase>("form");
  const [resumeText, setResumeText] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [additionalDetails, setAdditionalDetails] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [changes, setChanges] = useState<{ original: string; optimized: string; reason: string }[]>([]);
  const [mode, setMode] = useState("general");
  const [resume, setResume] = useState<StructuredResume | null>(null);
  const [copied, setCopied] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [fromCheckerScore, setFromCheckerScore] = useState<number | null>(null);
  const [knownIssuesText, setKnownIssuesText] = useState("");
  const [pendingAutoRun, setPendingAutoRun] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [payToken, setPayToken] = useState<string | null>(null);
  const [retrievalCode, setRetrievalCode] = useState<string | null>(null);
  const [inlineScore, setInlineScore] = useState<any | null>(null);
  const [scoring, setScoring] = useState(false);

  useEffect(() => {
    try {
      const tok = localStorage.getItem("zyntask_pdf_token");
      if (tok) {
        const parts = tok.split("|");
        if (parts.length === 2 && Number(parts[1]) > Date.now()) setPayToken(parts[0]);
        else localStorage.removeItem("zyntask_pdf_token");
      }
      const rc = localStorage.getItem("zyntask_retrieval_code");
      if (rc) setRetrievalCode(rc);
    } catch {}
    try {
      if (!sessionStorage.getItem("ats_handoff")) {
        const saved = localStorage.getItem("zyntask_optimizer_state");
        if (saved) {
          const s = JSON.parse(saved);
          if (s.resumeText) setResumeText(s.resumeText);
          if (s.targetRole) setTargetRole(s.targetRole);
          if (s.jobDescription) setJobDescription(s.jobDescription);
          if (s.mode) setMode(s.mode);
          if (s.resume) { setResume(s.resume); setChanges(s.changes || []); setPhase("output"); }
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("zyntask_optimizer_state", JSON.stringify({ resumeText, targetRole, jobDescription, mode, changes, resume: phase === "output" ? resume : null }));
    } catch {}
  }, [resumeText, targetRole, jobDescription, mode, changes, resume, phase]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("ats_handoff");
      if (raw) {
        const h: Handoff = JSON.parse(raw);
        if (h.resumeText) setResumeText(h.resumeText);
        if (h.targetRole) setTargetRole(h.targetRole);
        if (h.jobDescription) setJobDescription(h.jobDescription);
        if (typeof h.score === "number") setFromCheckerScore(h.score);
        setKnownIssuesText(buildKnownIssuesText(h));
        sessionStorage.removeItem("ats_handoff");
        if (h.resumeText) setPendingAutoRun(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (pendingAutoRun && resumeText.trim()) {
      setPendingAutoRun(false);
      build(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoRun, resumeText]);

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

  const build = async (isRebuild: boolean = false) => {
    if (!resumeText.trim()) {
      setError("Paste or upload your resume first.");
      return;
    }
    setError("");
    if (isRebuild) {
      setRebuilding(true);
    } else {
      setPhase("generating");
    }

    try {
      const res = await fetch("/api/resume-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText,
          targetRole: targetRole.trim() || undefined,
          jobDescription: jobDescription.trim() || undefined,
          knownIssues: knownIssuesText.trim() || undefined,
          additionalDetails: additionalDetails.trim() || undefined,
          mode,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Generation failed.");
        if (!isRebuild) setPhase("form");
        return;
      }

      setChanges(data.changes || []);
      setResume(data.resume);
      setPhase("output");
      if (data.resume) scoreInline(data.resume);
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
      if (!isRebuild) setPhase("form");
    } finally {
      setRebuilding(false);
    }
  };

  const scoreInline = async (r: StructuredResume) => {
    setScoring(true);
    setInlineScore(null);
    try {
      const res = await fetch("/api/ats-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText: resumeToPlainText(r),
          targetRole: targetRole.trim() || undefined,
          jobDescription: jobDescription.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) setInlineScore(data);
    } catch {}
    finally { setScoring(false); }
  };

  const copyAll = () => {
    if (!resume) return;
    navigator.clipboard.writeText(resumeToPlainText(resume));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const ensurePaid = async (): Promise<string | null> => {
    if (payToken) return payToken;
    try {
      await new Promise<void>((resolve, reject) => {
        if ((window as any).Razorpay) { resolve(); return; }
        const s = document.createElement("script");
        s.src = "https://checkout.razorpay.com/v1/checkout.js";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Could not load the payment window."));
        document.body.appendChild(s);
      });
      const orderRes = await fetch("/api/pdf-order", { method: "POST" });
      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        setError(orderData.error || "Could not start payment.");
        return null;
      }
      const token = await new Promise<string | null>((resolve) => {
        const rzp = new (window as any).Razorpay({
          key: orderData.keyId,
          amount: orderData.amount,
          currency: "INR",
          name: "Zyntask",
          description: "ATS-optimized resume PDF",
          order_id: orderData.orderId,
          handler: async (resp: any) => {
            try {
              const vRes = await fetch("/api/pdf-verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...resp, resume }),
              });
              const vData = await vRes.json();
              if (vRes.ok && vData.retrievalCode) {
                setRetrievalCode(vData.retrievalCode);
                try { localStorage.setItem("zyntask_retrieval_code", vData.retrievalCode); } catch {}
              }
              resolve(vRes.ok ? vData.token : null);
            } catch {
              resolve(null);
            }
          },
          modal: { ondismiss: () => resolve(null) },
          theme: { color: "#5B4BFF" },
        });
        rzp.open();
      });
      if (token) {
        setPayToken(token);
        try { localStorage.setItem("zyntask_pdf_token", `${token}|${Date.now() + 2 * 60 * 60 * 1000}`); } catch {}
      }
      return token;
    } catch (e: any) {
      setError(e.message || "Payment failed to start.");
      return null;
    }
  };

  const downloadPdf = async () => {
    if (!resume) return;
    setDownloading(true);
    setError("");
    try {
      const token = await ensurePaid();
      if (!token) {
        setError("Payment was not completed - the PDF stays locked until it is.");
        return;
      }
      const res = await fetch("/api/resume-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not generate PDF.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(resume.name || "resume").replace(/[^a-zA-Z0-9]+/g, "_")}_resume.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message || "Download failed.");
    } finally {
      setDownloading(false);
    }
  };

  const goToChecker = () => {
    if (!resume) return;
    try {
      sessionStorage.setItem("resume_handoff", JSON.stringify({
        resumeText: resumeToPlainText(resume),
        targetRole,
        jobDescription,
        previousScore: fromCheckerScore,
      }));
    } catch {}
    window.location.href = "/ats-checker";
  };

  const reset = () => {
    setPhase("form");
    setChanges([]);
    setResume(null);
    setFromCheckerScore(null);
    setKnownIssuesText("");
    setAdditionalDetails("");
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

  if (phase === "output" && resume) {
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
                <p className="text-slate text-[14px] mt-1">Preview below - use "Add or fix" to rebuild. Plain-text copy is free; the formatted PDF is {"\u20B9"}100.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadPdf}
                  disabled={downloading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-[11px] text-[14px] font-semibold text-ink border border-line bg-white hover:border-indigo/40 transition-all disabled:opacity-50"
                >
                  {downloading ? "Processing..." : "Download PDF - \u20B9100"}
                </button>
                <button
                  onClick={copyAll}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-[11px] text-[14px] font-semibold text-white shadow-[0_4px_14px_rgba(91,75,255,0.3)] hover:opacity-90 transition-all"
                  style={{ background: ACCENT }}
                >
                  {copied ? "Copied!" : "Copy all"}
                </button>
              </div>
            </div>

            {retrievalCode && (
              <div className="bg-cloud border border-indigo/30 rounded-[14px] px-4 py-3 mb-4">
                <p className="text-[12px] text-slate mb-0.5">Your download recovery code (valid 48h) - save it:</p>
                <p className="font-mono text-[16px] font-bold text-indigo tracking-[0.1em]">{retrievalCode}</p>
                <p className="text-[11.5px] text-slate-light mt-0.5">Lost the file? Retrieve it anytime at <a href="/retrieve" className="text-indigo hover:underline">zyntask.in/retrieve</a></p>
              </div>
            )}

{scoring && (
              <div className="bg-cloud border border-line rounded-[16px] px-5 py-4 mb-5 flex items-center gap-3">
                <div className="w-5 h-5 rounded-full border-2 border-indigo border-t-transparent animate-spin" />
                <p className="text-[13.5px] text-slate">Scoring this version against the ATS rubric...</p>
              </div>
            )}
            {inlineScore && !scoring && (
              <div className="bg-cloud border border-line rounded-[16px] px-6 py-5 mb-5">
                <div className="flex items-center gap-4 flex-wrap">
                  <p className="font-display font-bold text-[34px] leading-none" style={{ color: inlineScore.score >= 80 ? "#5B4BFF" : inlineScore.score >= 50 ? "#8a6f1f" : "#c0405a" }}>{inlineScore.score}</p>
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-slate mb-0.5">ATS score of this version</p>
                    <p className="text-[13.5px] text-ink leading-snug">{inlineScore.verdict}</p>
                  </div>
                </div>
                {inlineScore.formatting?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-line">
                    <p className="text-[11px] text-slate-light uppercase tracking-wide mb-1.5">Still worth fixing</p>
                    {inlineScore.formatting.slice(0, 3).map((f: any, i: number) => (
                      <p key={i} className="text-[13px] text-ink leading-relaxed mb-1">- {f.issue}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {changes.length > 0 && (
              <div className="bg-cloud border border-line rounded-[20px] p-7 mb-5">
                <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo font-semibold mb-5">What changed, and why</p>
                <div className="space-y-5">
                  {changes.map((ch, i) => (
                    <div key={i} className="pb-5 border-b border-line last:border-0 last:pb-0">
                      <p className="text-[13.5px] text-slate line-through leading-relaxed mb-1">{ch.original}</p>
                      <p className="text-[14.5px] text-ink leading-relaxed mb-1.5">{ch.optimized}</p>
                      <p className="text-[12.5px] text-indigo leading-relaxed">{ch.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white border border-line rounded-[16px] p-10 mb-5 shadow-zy-sm">
              <div className="mb-6 pb-6 border-b border-line">
                <h2 className="font-display font-bold text-[24px] text-ink mb-1">{resume.name}</h2>
                {resume.title && <p className="text-[14px] text-indigo font-medium mb-2">{resume.title}</p>}
                {(resume.contact.phone || resume.contact.email || resume.contact.location || resume.contact.linkedin) && (
                  <p className="text-[13px] text-slate">
                    {[resume.contact.phone, resume.contact.email, resume.contact.location, resume.contact.linkedin].filter(Boolean).join("  |  ")}
                  </p>
                )}
              </div>

              {resume.summary && (
                <div className="mb-6">
                  <h3 className="text-[11px] font-bold tracking-[0.1em] uppercase text-ink mb-2 pb-1 border-b border-line">Summary</h3>
                  <p className="text-[13.5px] text-ink leading-relaxed">{resume.summary}</p>
                </div>
              )}

              {resume.skills?.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-[11px] font-bold tracking-[0.1em] uppercase text-ink mb-2 pb-1 border-b border-line">Skills</h3>
                  {resume.skills.map((s, i) => (
                    <p key={i} className="text-[13.5px] text-ink leading-relaxed mb-1">
                      {s.category && <span className="font-semibold">{s.category}: </span>}
                      {s.items}
                    </p>
                  ))}
                </div>
              )}

              {resume.experience?.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-[11px] font-bold tracking-[0.1em] uppercase text-ink mb-3 pb-1 border-b border-line">Experience</h3>
                  {resume.experience.map((e, i) => (
                    <div key={i} className="mb-4 last:mb-0">
                      <div className="flex items-baseline justify-between mb-1 gap-3">
                        <p className="text-[14px] font-semibold text-ink">{e.title} <span className="font-normal text-slate">- {e.company}</span></p>
                        <p className="text-[12px] text-slate-light flex-shrink-0">{e.dates}</p>
                      </div>
                      <ul className="space-y-1">
                        {e.bullets.map((b, j) => (
                          <li key={j} className="text-[13.5px] text-ink leading-relaxed pl-4 relative before:content-['\2022'] before:absolute before:left-0 before:text-indigo">{b}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {resume.education?.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-[11px] font-bold tracking-[0.1em] uppercase text-ink mb-2 pb-1 border-b border-line">Education</h3>
                  {resume.education.map((ed, i) => (
                    <div key={i} className="flex items-baseline justify-between mb-1 gap-3">
                      <p className="text-[13.5px] text-ink"><span className="font-semibold">{ed.degree}</span> - {ed.institution}</p>
                      <p className="text-[12px] text-slate-light flex-shrink-0">{ed.dates}</p>
                    </div>
                  ))}
                </div>
              )}

              {resume.certifications?.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-[11px] font-bold tracking-[0.1em] uppercase text-ink mb-2 pb-1 border-b border-line">Certifications</h3>
                  <p className="text-[13.5px] text-ink leading-relaxed">{resume.certifications.join(", ")}</p>
                </div>
              )}

              {resume.additional?.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold tracking-[0.1em] uppercase text-ink mb-2 pb-1 border-b border-line">Additional</h3>
                  <ul className="space-y-1">
                    {resume.additional.map((a, i) => (
                      <li key={i} className="text-[13.5px] text-ink leading-relaxed pl-4 relative before:content-['\2022'] before:absolute before:left-0 before:text-indigo">{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="bg-cloud border border-line rounded-[20px] p-7 mb-8">
              <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo font-semibold mb-2">Add or fix something else</p>
              <p className="text-[13px] text-slate mb-4">Missed a project, wrong dates, a certification to add? Describe it and rebuild.</p>
              <textarea
                value={additionalDetails}
                onChange={e => setAdditionalDetails(e.target.value)}
                rows={4}
                placeholder="e.g. Add my AWS certification from 2025, or: my role at X ended in March 2026, not May..."
                className="w-full bg-mist border border-line rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder-slate-light resize-none focus:outline-none focus:border-indigo/40 transition-colors leading-relaxed mb-4"
              />
              <div className="flex justify-end">
                <button
                  onClick={() => build(true)}
                  disabled={rebuilding || !additionalDetails.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-[11px] text-[14px] font-semibold text-white shadow-[0_4px_14px_rgba(91,75,255,0.3)] hover:opacity-90 transition-all disabled:opacity-40"
                  style={{ background: ACCENT }}
                >
                  {rebuilding ? "Rebuilding..." : "Rebuild with these details"}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3">
              <button onClick={reset} className="text-[13px] text-slate hover:text-indigo transition-colors">Start over</button>
              <a href="/ats-checker" className="text-[13px] text-slate-light hover:text-indigo transition-colors">Standalone ATS Checker &rarr;</a>
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
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-indigo mb-2">AI rewrites it for you</p>
            <h1 className="font-display font-bold text-[28px] tracking-tight text-ink mb-2">AI Resume Optimizer</h1>
            <p className="text-slate text-[14.5px] max-w-[42ch] mx-auto leading-relaxed">Paste or upload your resume and Claude rewrites it end to end - stronger phrasing, cleaner structure, ATS-optimized. You review and refine the result, not every word from scratch.</p>
            <a href="/resume-form-builder" className="text-[13px] text-indigo hover:underline mt-2 inline-block">Want full control instead? Build it field by field &rarr;</a>
          </div>

          {fromCheckerScore !== null && (
            <div className="bg-cloud border border-indigo/30 rounded-[16px] p-4 mb-6 text-center">
              <p className="text-[13.5px] text-ink">
                Loaded from your ATS check (score: <span className="font-semibold">{fromCheckerScore}</span>) - the issues it found will be prioritized in this rewrite.
              </p>
            </div>
          )}

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
              <span className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-slate">Optimize for</span>
            </label>
            <select
              value={mode}
              onChange={e => setMode(e.target.value)}
              className="w-full bg-mist border border-line rounded-[14px] px-4 py-3.5 text-[15px] text-ink focus:outline-none focus:border-indigo/40 transition-colors mb-6"
            >
              <option value="general">General (no specific industry)</option>
              <option value="consulting">Consulting</option>
              <option value="software">Software Engineering</option>
              <option value="data">Data / Analytics</option>
              <option value="product">Product</option>
              <option value="finance">Finance / Accounting</option>
              <option value="marketing">Marketing</option>
              <option value="government">Government / Public Sector</option>
              <option value="startup">Startup</option>
            </select>

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
            <p className="text-[11px] text-slate-light mb-6">{jobDescription.length}/4000</p>

            <label className="block mb-1.5">
              <span className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-slate">Anything to add or fix (optional)</span>
            </label>
            <textarea
              value={additionalDetails}
              onChange={e => setAdditionalDetails(e.target.value)}
              rows={3}
              placeholder="e.g. Add my AWS certification from 2025, correct my end date at X to March 2026..."
              className="w-full bg-mist border border-line rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder-slate-light resize-none focus:outline-none focus:border-indigo/40 transition-colors leading-relaxed"
            />

            {error && <p className="text-rose text-[13px] mt-4">{error}</p>}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => build(false)}
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
