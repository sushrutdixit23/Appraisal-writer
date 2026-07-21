"use client";

import { useState, useEffect } from "react";
import SiteNav from "../components/SiteNav";

const ACCENT = "linear-gradient(115deg,#5B4BFF,#8a6ff0)";

type Contact = { phone: string; email: string; location: string; linkedin: string };
type SkillRow = { category: string; items: string };
type ExperienceEntry = { title: string; company: string; dates: string; bullets: string[] };
type EducationEntry = { degree: string; institution: string; dates: string };

type StructuredResume = {
  name: string;
  title: string;
  contact: Contact;
  summary: string;
  skills: SkillRow[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  certifications: string[];
  additional: string[];
};

const EMPTY_RESUME: StructuredResume = {
  name: "",
  title: "",
  contact: { phone: "", email: "", location: "", linkedin: "" },
  summary: "",
  skills: [{ category: "", items: "" }],
  experience: [{ title: "", company: "", dates: "", bullets: [""] }],
  education: [{ degree: "", institution: "", dates: "" }],
  certifications: [],
  additional: [],
};

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
  if (r.skills?.some(s => s.items)) {
    lines.push("SKILLS");
    r.skills.forEach(s => { if (s.items) lines.push(`${s.category ? s.category + ": " : ""}${s.items}`); });
    lines.push("");
  }
  if (r.experience?.some(e => e.title || e.company)) {
    lines.push("EXPERIENCE");
    r.experience.forEach(e => {
      if (!e.title && !e.company) return;
      lines.push(`${e.title} - ${e.company} (${e.dates})`);
      e.bullets.forEach(b => { if (b) lines.push(`- ${b}`); });
      lines.push("");
    });
  }
  if (r.education?.some(ed => ed.degree || ed.institution)) {
    lines.push("EDUCATION");
    r.education.forEach(ed => { if (ed.degree || ed.institution) lines.push(`${ed.degree} - ${ed.institution} (${ed.dates})`); });
    lines.push("");
  }
  if (r.certifications?.length) {
    lines.push("CERTIFICATIONS");
    lines.push(r.certifications.filter(Boolean).join(", "));
    lines.push("");
  }
  if (r.additional?.length) {
    lines.push("ADDITIONAL");
    r.additional.forEach(a => { if (a) lines.push(`- ${a}`); });
  }
  return lines.join("\n").trim();
}

const inputClass = "w-full bg-mist border border-line rounded-[12px] px-3.5 py-2.5 text-[14px] text-ink placeholder-slate-light focus:outline-none focus:border-indigo/40 transition-colors";
const labelClass = "font-mono text-[10px] tracking-[0.14em] uppercase text-slate mb-1 block";
const smallBtnClass = "text-[12.5px] text-indigo hover:underline";
const removeBtnClass = "text-[12.5px] text-rose hover:underline";

function ResumePreview({ resume }: { resume: StructuredResume }) {
  const isEmpty = !resume.name && !resume.summary && !resume.experience?.some(e => e.title || e.company);
  if (isEmpty) {
    return (
      <div className="bg-white border border-line rounded-[16px] p-10 shadow-zy-sm min-h-[400px] flex items-center justify-center">
        <p className="text-slate-light text-[14px] text-center max-w-[30ch]">Your resume preview appears here as you type.</p>
      </div>
    );
  }
  return (
    <div className="bg-white border border-line rounded-[16px] p-8 shadow-zy-sm">
      <div className="mb-5 pb-5 border-b border-line">
        <h2 className="font-display font-bold text-[22px] text-ink mb-1">{resume.name || "Your Name"}</h2>
        {resume.title && <p className="text-[13.5px] text-indigo font-medium mb-2">{resume.title}</p>}
        {(resume.contact.phone || resume.contact.email || resume.contact.location || resume.contact.linkedin) && (
          <p className="text-[12px] text-slate">
            {[resume.contact.phone, resume.contact.email, resume.contact.location, resume.contact.linkedin].filter(Boolean).join("  |  ")}
          </p>
        )}
      </div>

      {resume.summary && (
        <div className="mb-5">
          <h3 className="text-[10.5px] font-bold tracking-[0.1em] uppercase text-ink mb-1.5 pb-1 border-b border-line">Summary</h3>
          <p className="text-[12.5px] text-ink leading-relaxed">{resume.summary}</p>
        </div>
      )}

      {resume.skills?.some(s => s.items) && (
        <div className="mb-5">
          <h3 className="text-[10.5px] font-bold tracking-[0.1em] uppercase text-ink mb-1.5 pb-1 border-b border-line">Skills</h3>
          {resume.skills.filter(s => s.items).map((s, i) => (
            <p key={i} className="text-[12.5px] text-ink leading-relaxed mb-1">
              {s.category && <span className="font-semibold">{s.category}: </span>}
              {s.items}
            </p>
          ))}
        </div>
      )}

      {resume.experience?.some(e => e.title || e.company) && (
        <div className="mb-5">
          <h3 className="text-[10.5px] font-bold tracking-[0.1em] uppercase text-ink mb-2 pb-1 border-b border-line">Experience</h3>
          {resume.experience.filter(e => e.title || e.company).map((e, i) => (
            <div key={i} className="mb-3.5 last:mb-0">
              <div className="flex items-baseline justify-between mb-1 gap-3">
                <p className="text-[13px] font-semibold text-ink">{e.title}{e.company && <span className="font-normal text-slate"> - {e.company}</span>}</p>
                {e.dates && <p className="text-[11px] text-slate-light flex-shrink-0">{e.dates}</p>}
              </div>
              <ul className="space-y-0.5">
                {e.bullets.filter(Boolean).map((b, j) => (
                  <li key={j} className="text-[12.5px] text-ink leading-relaxed pl-3.5 relative before:content-['\2022'] before:absolute before:left-0 before:text-indigo">{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {resume.education?.some(ed => ed.degree || ed.institution) && (
        <div className="mb-5">
          <h3 className="text-[10.5px] font-bold tracking-[0.1em] uppercase text-ink mb-1.5 pb-1 border-b border-line">Education</h3>
          {resume.education.filter(ed => ed.degree || ed.institution).map((ed, i) => (
            <div key={i} className="flex items-baseline justify-between mb-1 gap-3">
              <p className="text-[12.5px] text-ink"><span className="font-semibold">{ed.degree}</span>{ed.institution && <> - {ed.institution}</>}</p>
              {ed.dates && <p className="text-[11px] text-slate-light flex-shrink-0">{ed.dates}</p>}
            </div>
          ))}
        </div>
      )}

      {resume.certifications?.filter(Boolean).length > 0 && (
        <div className="mb-5">
          <h3 className="text-[10.5px] font-bold tracking-[0.1em] uppercase text-ink mb-1.5 pb-1 border-b border-line">Certifications</h3>
          <p className="text-[12.5px] text-ink leading-relaxed">{resume.certifications.filter(Boolean).join(", ")}</p>
        </div>
      )}

      {resume.additional?.filter(Boolean).length > 0 && (
        <div>
          <h3 className="text-[10.5px] font-bold tracking-[0.1em] uppercase text-ink mb-1.5 pb-1 border-b border-line">Additional</h3>
          <ul className="space-y-0.5">
            {resume.additional.filter(Boolean).map((a, i) => (
              <li key={i} className="text-[12.5px] text-ink leading-relaxed pl-3.5 relative before:content-['\2022'] before:absolute before:left-0 before:text-indigo">{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ResumeFormBuilder() {
  const [resume, setResume] = useState<StructuredResume>(EMPTY_RESUME);
  const [mobileTab, setMobileTab] = useState<"form" | "preview">("form");
  const [uploading, setUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [payToken, setPayToken] = useState<string | null>(null);
  const [retrievalCode, setRetrievalCode] = useState<string | null>(null);

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
      const saved = localStorage.getItem("zyntask_form_resume");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.name !== undefined) setResume(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem("zyntask_form_resume", JSON.stringify(resume)); } catch {}
  }, [resume]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const parseRes = await fetch("/api/parse-resume", { method: "POST", body: formData });
      const parseData = await parseRes.json();
      if (!parseRes.ok) {
        setError(parseData.error || "Could not read this file.");
        return;
      }
      const extractRes = await fetch("/api/resume-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: parseData.text }),
      });
      const extractData = await extractRes.json();
      if (!extractRes.ok) {
        setError(extractData.error || "Could not extract resume data.");
        return;
      }
      setResume({
        name: extractData.name || "",
        title: extractData.title || "",
        contact: extractData.contact || { phone: "", email: "", location: "", linkedin: "" },
        summary: extractData.summary || "",
        skills: extractData.skills?.length ? extractData.skills : [{ category: "", items: "" }],
        experience: extractData.experience?.length
          ? extractData.experience.map((ex: any) => ({ ...ex, bullets: ex.bullets?.length ? ex.bullets : [""] }))
          : [{ title: "", company: "", dates: "", bullets: [""] }],
        education: extractData.education?.length ? extractData.education : [{ degree: "", institution: "", dates: "" }],
        certifications: extractData.certifications || [],
        additional: extractData.additional || [],
      });
      setUploadedFileName(file.name);
    } catch {
      setError("Import failed. You can still fill the form manually.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const updateContact = (field: keyof Contact, value: string) => {
    setResume(r => ({ ...r, contact: { ...r.contact, [field]: value } }));
  };

  const addSkillRow = () => setResume(r => ({ ...r, skills: [...r.skills, { category: "", items: "" }] }));
  const removeSkillRow = (i: number) => setResume(r => ({ ...r, skills: r.skills.filter((_, idx) => idx !== i) }));
  const updateSkillRow = (i: number, field: keyof SkillRow, value: string) => {
    setResume(r => ({ ...r, skills: r.skills.map((s, idx) => idx === i ? { ...s, [field]: value } : s) }));
  };

  const addExperience = () => setResume(r => ({ ...r, experience: [...r.experience, { title: "", company: "", dates: "", bullets: [""] }] }));
  const removeExperience = (i: number) => setResume(r => ({ ...r, experience: r.experience.filter((_, idx) => idx !== i) }));
  const updateExperience = (i: number, field: "title" | "company" | "dates", value: string) => {
    setResume(r => ({ ...r, experience: r.experience.map((e, idx) => idx === i ? { ...e, [field]: value } : e) }));
  };
  const addBullet = (expIndex: number) => {
    setResume(r => ({ ...r, experience: r.experience.map((e, idx) => idx === expIndex ? { ...e, bullets: [...e.bullets, ""] } : e) }));
  };
  const removeBullet = (expIndex: number, bulletIndex: number) => {
    setResume(r => ({ ...r, experience: r.experience.map((e, idx) => idx === expIndex ? { ...e, bullets: e.bullets.filter((_, bi) => bi !== bulletIndex) } : e) }));
  };
  const updateBullet = (expIndex: number, bulletIndex: number, value: string) => {
    setResume(r => ({ ...r, experience: r.experience.map((e, idx) => idx === expIndex ? { ...e, bullets: e.bullets.map((b, bi) => bi === bulletIndex ? value : b) } : e) }));
  };

  const addEducation = () => setResume(r => ({ ...r, education: [...r.education, { degree: "", institution: "", dates: "" }] }));
  const removeEducation = (i: number) => setResume(r => ({ ...r, education: r.education.filter((_, idx) => idx !== i) }));
  const updateEducation = (i: number, field: keyof EducationEntry, value: string) => {
    setResume(r => ({ ...r, education: r.education.map((ed, idx) => idx === i ? { ...ed, [field]: value } : ed) }));
  };

  const addCertification = () => setResume(r => ({ ...r, certifications: [...r.certifications, ""] }));
  const removeCertification = (i: number) => setResume(r => ({ ...r, certifications: r.certifications.filter((_, idx) => idx !== i) }));
  const updateCertification = (i: number, value: string) => {
    setResume(r => ({ ...r, certifications: r.certifications.map((c, idx) => idx === i ? value : c) }));
  };

  const addAdditional = () => setResume(r => ({ ...r, additional: [...r.additional, ""] }));
  const removeAdditional = (i: number) => setResume(r => ({ ...r, additional: r.additional.filter((_, idx) => idx !== i) }));
  const updateAdditional = (i: number, value: string) => {
    setResume(r => ({ ...r, additional: r.additional.map((a, idx) => idx === i ? value : a) }));
  };

  const copyAll = () => {
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
    if (!resume.name.trim()) {
      setError("Add your name before downloading.");
      return;
    }
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

  const formColumn = (
    <div>
      <div className="bg-cloud border border-indigo/30 rounded-[16px] p-5 mb-5">
        <label className="block mb-1.5">
          <span className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-slate">Import from an existing resume (optional)</span>
        </label>
        <div className="flex items-center gap-3">
          <label className="cursor-pointer px-4 py-2.5 rounded-[11px] text-[13.5px] font-medium bg-white border border-line text-ink hover:border-indigo/40 transition-colors">
            {uploading ? "Reading & extracting..." : "Choose file (PDF, DOCX, TXT)"}
            <input type="file" accept=".pdf,.docx,.txt" onChange={handleFileUpload} disabled={uploading} className="hidden" />
          </label>
          {uploadedFileName && !uploading && <span className="text-[13px] text-slate">{uploadedFileName} imported</span>}
        </div>
      </div>

      <div className="bg-cloud border border-line rounded-[20px] p-6 mb-5">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelClass}>Full name</label>
            <input className={inputClass} value={resume.name} onChange={e => setResume(r => ({ ...r, name: e.target.value }))} placeholder="Jane Doe" />
          </div>
          <div>
            <label className={labelClass}>Headline (optional)</label>
            <input className={inputClass} value={resume.title} onChange={e => setResume(r => ({ ...r, title: e.target.value }))} placeholder="Business Analyst" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Phone</label>
            <input className={inputClass} value={resume.contact.phone} onChange={e => updateContact("phone", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input className={inputClass} value={resume.contact.email} onChange={e => updateContact("email", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Location</label>
            <input className={inputClass} value={resume.contact.location} onChange={e => updateContact("location", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>LinkedIn</label>
            <input className={inputClass} value={resume.contact.linkedin} onChange={e => updateContact("linkedin", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bg-cloud border border-line rounded-[20px] p-6 mb-5">
        <label className={labelClass}>Summary</label>
        <textarea className={inputClass} rows={3} value={resume.summary} onChange={e => setResume(r => ({ ...r, summary: e.target.value }))} placeholder="A 2-3 sentence professional summary..." />
      </div>

      <div className="bg-cloud border border-line rounded-[20px] p-6 mb-5">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo font-semibold mb-4">Skills</p>
        {resume.skills.map((s, i) => (
          <div key={i} className="flex items-start gap-2 mb-3">
            <input className={inputClass + " w-[35%]"} placeholder="Category (optional)" value={s.category} onChange={e => updateSkillRow(i, "category", e.target.value)} />
            <input className={inputClass} placeholder="Comma-separated skills" value={s.items} onChange={e => updateSkillRow(i, "items", e.target.value)} />
            {resume.skills.length > 1 && <button onClick={() => removeSkillRow(i)} className={removeBtnClass + " mt-2.5 flex-shrink-0"}>Remove</button>}
          </div>
        ))}
        <button onClick={addSkillRow} className={smallBtnClass}>+ Add skill row</button>
      </div>

      <div className="bg-cloud border border-line rounded-[20px] p-6 mb-5">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo font-semibold mb-4">Experience</p>
        {resume.experience.map((e, i) => (
          <div key={i} className="mb-5 pb-5 border-b border-line last:border-0 last:mb-0 last:pb-0">
            <div className="grid grid-cols-2 gap-3 mb-2">
              <input className={inputClass} placeholder="Job title" value={e.title} onChange={ev => updateExperience(i, "title", ev.target.value)} />
              <input className={inputClass} placeholder="Company" value={e.company} onChange={ev => updateExperience(i, "company", ev.target.value)} />
            </div>
            <input className={inputClass + " mb-3"} placeholder="Dates (e.g. Jun 2023 - Present)" value={e.dates} onChange={ev => updateExperience(i, "dates", ev.target.value)} />
            <label className={labelClass}>Bullets</label>
            {e.bullets.map((b, j) => (
              <div key={j} className="flex items-center gap-2 mb-2">
                <input className={inputClass} placeholder="What did you do and what was the outcome?" value={b} onChange={ev => updateBullet(i, j, ev.target.value)} />
                {e.bullets.length > 1 && <button onClick={() => removeBullet(i, j)} className={removeBtnClass + " flex-shrink-0"}>Remove</button>}
              </div>
            ))}
            <button onClick={() => addBullet(i)} className={smallBtnClass}>+ Add bullet</button>
            {resume.experience.length > 1 && (
              <div className="mt-2">
                <button onClick={() => removeExperience(i)} className={removeBtnClass}>Remove this role</button>
              </div>
            )}
          </div>
        ))}
        <button onClick={addExperience} className={smallBtnClass}>+ Add another role</button>
      </div>

      <div className="bg-cloud border border-line rounded-[20px] p-6 mb-5">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo font-semibold mb-4">Education</p>
        {resume.education.map((ed, i) => (
          <div key={i} className="flex items-start gap-2 mb-3">
            <input className={inputClass} placeholder="Degree" value={ed.degree} onChange={e => updateEducation(i, "degree", e.target.value)} />
            <input className={inputClass} placeholder="Institution" value={ed.institution} onChange={e => updateEducation(i, "institution", e.target.value)} />
            <input className={inputClass + " w-[30%]"} placeholder="Dates" value={ed.dates} onChange={e => updateEducation(i, "dates", e.target.value)} />
            {resume.education.length > 1 && <button onClick={() => removeEducation(i)} className={removeBtnClass + " mt-2.5 flex-shrink-0"}>Remove</button>}
          </div>
        ))}
        <button onClick={addEducation} className={smallBtnClass}>+ Add education</button>
      </div>

      <div className="bg-cloud border border-line rounded-[20px] p-6 mb-5">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo font-semibold mb-4">Certifications (optional)</p>
        {resume.certifications.map((c, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <input className={inputClass} value={c} onChange={e => updateCertification(i, e.target.value)} />
            <button onClick={() => removeCertification(i)} className={removeBtnClass + " flex-shrink-0"}>Remove</button>
          </div>
        ))}
        <button onClick={addCertification} className={smallBtnClass}>+ Add certification</button>
      </div>

      <div className="bg-cloud border border-line rounded-[20px] p-6 mb-5">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo font-semibold mb-4">Additional (projects, languages, etc. - optional)</p>
        {resume.additional.map((a, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <input className={inputClass} value={a} onChange={e => updateAdditional(i, e.target.value)} />
            <button onClick={() => removeAdditional(i)} className={removeBtnClass + " flex-shrink-0"}>Remove</button>
          </div>
        ))}
        <button onClick={addAdditional} className={smallBtnClass}>+ Add item</button>
      </div>

      <a href="/resume-builder" className="text-[13px] text-slate hover:text-indigo transition-colors">Prefer AI to rewrite it for you? Try the Optimizer &rarr;</a>
    </div>
  );

  const previewColumn = (
    <div className="lg:sticky lg:top-24">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo font-semibold">Live preview</p>
        <div className="flex items-center gap-2">
          <button
            onClick={copyAll}
            className="px-4 py-2 rounded-[10px] text-[13px] font-semibold text-ink border border-line bg-white hover:border-indigo/40 transition-all"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="px-4 py-2 rounded-[10px] text-[13px] font-semibold text-white hover:opacity-90 transition-all disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {downloading ? "Processing..." : "Download PDF - \u20B9100"}
          </button>
        </div>
      </div>
      <p className="text-[12px] text-slate-light mb-2">Plain-text copy is free. The formatted PDF download is {"\u20B9"}100.</p>
      {error && <p className="text-rose text-[13px] mb-3">{error}</p>}
      {retrievalCode && (
        <div className="bg-cloud border border-indigo/30 rounded-[14px] px-4 py-3 mb-4">
          <p className="text-[12px] text-slate mb-0.5">Your download recovery code (valid 48h) - save it:</p>
          <p className="font-mono text-[16px] font-bold text-indigo tracking-[0.1em]">{retrievalCode}</p>
          <p className="text-[11.5px] text-slate-light mt-0.5">Lost the file? Retrieve it anytime at <a href="/retrieve" className="text-indigo hover:underline">zyntask.in/retrieve</a></p>
        </div>
      )}
      <div className="lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto rounded-[16px]">
        <ResumePreview resume={resume} />
      </div>
      <p className="text-[12px] text-slate-light text-center mt-3">
        <a href="/ats-checker" className="text-indigo hover:underline">Check its ATS score &rarr;</a>
      </p>
    </div>
  );

  return (
    <main className="min-h-screen bg-mist relative overflow-x-hidden">
      <div className="aurora-field" />
      <div className="relative z-10">
        <SiteNav />
        <div className="max-w-6xl mx-auto px-6 pt-20 pb-20">

          <div className="mb-8 text-center">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-indigo mb-2">You write it, we format it</p>
            <h1 className="font-display font-bold text-[28px] tracking-tight text-ink mb-2">Build Your Resume</h1>
            <p className="text-slate text-[14.5px] max-w-[46ch] mx-auto leading-relaxed">Fill in your details and watch your resume take shape live - nothing gets rewritten, you stay in control of every word.</p>
          </div>

          <div className="flex lg:hidden bg-cloud border border-line rounded-xl p-1 mb-6 max-w-xs mx-auto">
            {(["form", "preview"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setMobileTab(t)}
                className="flex-1 py-2 text-[13px] font-semibold rounded-lg transition-all"
                style={mobileTab === t ? { background: ACCENT, color: "#fff" } : { color: "#6b6880" }}
              >
                {t === "form" ? "Edit" : "Preview"}
              </button>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-8 items-start">
            <div className={mobileTab === "form" ? "" : "hidden lg:block"}>
              {formColumn}
            </div>
            <div className={mobileTab === "preview" ? "" : "hidden lg:block"}>
              {previewColumn}
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
