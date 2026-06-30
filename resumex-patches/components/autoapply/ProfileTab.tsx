"use client";

import { useEffect, useRef, useState } from "react";
import type { CandidateProfile } from "@/lib/autoapply-types";
import { MAX_PDF_SIZE_BYTES, MAX_PDF_SIZE_LABEL } from "@/lib/constants";
import { mergeProfile } from "@/lib/merge-profile";
import {
  extractResumeFromPdf,
  getBackendSecret,
  getBackendUrl,
  parseProfileFromResumeText,
  saveBackendSettings,
} from "@/lib/profile-api";

interface Props {
  profile: CandidateProfile;
  onSave: (profile: CandidateProfile) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-zinc-500 dark:focus:border-cyan-400 dark:focus:ring-cyan-400/10";

export default function ProfileTab({ profile, onSave }: Props) {
  const [draft, setDraft] = useState<CandidateProfile>(profile);
  const [saved, setSaved] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [backendSecret, setBackendSecret] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBackendSecret(getBackendSecret());
  }, []);

  const set = (path: string, value: unknown) => {
    const keys = path.split(".");
    setDraft((prev) => {
      const next = structuredClone(prev) as unknown as Record<string, unknown>;
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) {
        cur = cur[keys[i]] as Record<string, unknown>;
      }
      cur[keys[keys.length - 1]] = value;
      return next as unknown as CandidateProfile;
    });
  };

  const validateAndSetFile = (selected: File) => {
    const isPdf =
      selected.type === "application/pdf" || selected.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setImportError("Only PDF files are supported.");
      return;
    }
    if (selected.size > MAX_PDF_SIZE_BYTES) {
      setImportError(`PDF must be ${MAX_PDF_SIZE_LABEL} or smaller.`);
      return;
    }
    setImportError(null);
    setFile(selected);
    setResumeText("");
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected) validateAndSetFile(selected);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) validateAndSetFile(dropped);
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImportFromResume = async () => {
    if (!file && !resumeText.trim()) {
      setImportError("Upload a PDF or paste your resume text first.");
      return;
    }

    if (backendSecret.trim()) {
      saveBackendSettings(getBackendUrl(), backendSecret.trim());
    }

    setImporting(true);
    setImportError(null);
    setImportNotice(null);

    try {
      const text = file ? await extractResumeFromPdf(file) : resumeText.trim();
      const parsed = await parseProfileFromResumeText(text);
      setDraft((prev) => mergeProfile(prev, parsed));
      setImportNotice("Profile fields filled from your resume — review and save when ready.");
      clearFile();
      setResumeText("");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not parse resume.");
    } finally {
      setImporting(false);
    }
  };

  const handleSave = () => {
    onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Import from resume */}
      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-6 shadow-sm dark:border-cyan-400/20 dark:bg-cyan-400/5">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Import from resume</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Upload a PDF or paste resume text to auto-fill your profile fields.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`mt-4 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
            isDragging
              ? "border-indigo-400 bg-indigo-50 dark:border-cyan-400 dark:bg-cyan-400/10"
              : "border-zinc-200 bg-white dark:border-white/15 dark:bg-white/5"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          {file ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{file.name}</p>
              <button
                type="button"
                onClick={clearFile}
                className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400"
              >
                Remove file
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Drag & drop your PDF resume</p>
              <p className="mt-1 text-xs text-zinc-400">or</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 rounded-full border border-zinc-200 bg-white px-4 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-white/15 dark:bg-white/5 dark:text-zinc-200"
              >
                Choose PDF
              </button>
            </>
          )}
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            Or paste resume text
          </label>
          <textarea
            className={`${inputClass} min-h-[100px] resize-y`}
            placeholder="Paste your resume text here…"
            value={resumeText}
            onChange={(e) => {
              setResumeText(e.target.value);
              if (e.target.value.trim()) clearFile();
            }}
          />
        </div>

        {importError && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{importError}</p>
        )}
        {importNotice && (
          <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{importNotice}</p>
        )}

        <div className="mt-4">
          <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            AutoApply API secret
          </label>
          <input
            type="password"
            value={backendSecret}
            onChange={(e) => setBackendSecret(e.target.value)}
            placeholder="Same secret as the Chrome extension"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-zinc-400">
            Uses your AutoApply backend at {getBackendUrl()} (Claude). Check{" "}
            <a href={`${getBackendUrl()}/health`} target="_blank" rel="noopener noreferrer" className="underline">
              /health
            </a>{" "}
            — <code className="text-[10px]">anthropicConfigured</code> must be{" "}
            <code className="text-[10px]">true</code>.
          </p>
        </div>

        <button
          type="button"
          disabled={importing || (!file && !resumeText.trim())}
          onClick={handleImportFromResume}
          className="mt-4 w-full rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-cyan-500 dark:hover:bg-cyan-400"
        >
          {importing ? "Extracting profile…" : "Fill from resume"}
        </button>
      </section>

      {/* Personal Info */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Personal Info</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First Name">
            <input className={inputClass} value={draft.personal.firstName} onChange={(e) => set("personal.firstName", e.target.value)} />
          </Field>
          <Field label="Last Name">
            <input className={inputClass} value={draft.personal.lastName} onChange={(e) => set("personal.lastName", e.target.value)} />
          </Field>
          <Field label="Email">
            <input className={inputClass} type="email" value={draft.personal.email} onChange={(e) => set("personal.email", e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className={inputClass} value={draft.personal.phone} onChange={(e) => set("personal.phone", e.target.value)} />
          </Field>
          <Field label="Location">
            <input className={inputClass} value={draft.personal.location} onChange={(e) => set("personal.location", e.target.value)} />
          </Field>
          <Field label="LinkedIn URL">
            <input className={inputClass} value={draft.personal.linkedinUrl} onChange={(e) => set("personal.linkedinUrl", e.target.value)} />
          </Field>
          <Field label="GitHub URL">
            <input className={inputClass} value={draft.personal.githubUrl} onChange={(e) => set("personal.githubUrl", e.target.value)} />
          </Field>
        </div>
      </section>

      {/* Target */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Job Target</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Target Roles (comma-separated)">
            <input
              className={inputClass}
              value={draft.target.roles.join(", ")}
              onChange={(e) => set("target.roles", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            />
          </Field>
          <Field label="Availability">
            <input className={inputClass} value={draft.target.startAvailability} onChange={(e) => set("target.startAvailability", e.target.value)} />
          </Field>
          <Field label="Min Salary (USD)">
            <input className={inputClass} type="number" value={draft.target.salaryMin} onChange={(e) => set("target.salaryMin", Number(e.target.value))} />
          </Field>
          <Field label="Max Salary (USD)">
            <input className={inputClass} type="number" value={draft.target.salaryMax} onChange={(e) => set("target.salaryMax", Number(e.target.value))} />
          </Field>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <input type="checkbox" className="rounded" checked={draft.target.remote} onChange={(e) => set("target.remote", e.target.checked)} />
              Open to remote
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <input type="checkbox" className="rounded" checked={draft.target.willingToRelocate} onChange={(e) => set("target.willingToRelocate", e.target.checked)} />
              Willing to relocate
            </label>
          </div>
        </div>
      </section>

      {/* Experience */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Experience</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Current Title">
            <input className={inputClass} value={draft.experience.currentTitle} onChange={(e) => set("experience.currentTitle", e.target.value)} />
          </Field>
          <Field label="Current Company">
            <input className={inputClass} value={draft.experience.currentCompany} onChange={(e) => set("experience.currentCompany", e.target.value)} />
          </Field>
          <Field label="Years of Experience">
            <input className={inputClass} type="number" value={draft.experience.totalYears} onChange={(e) => set("experience.totalYears", Number(e.target.value))} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Professional Summary">
            <textarea
              className={`${inputClass} min-h-[100px] resize-y`}
              value={draft.experience.summary}
              onChange={(e) => set("experience.summary", e.target.value)}
            />
          </Field>
        </div>
      </section>

      {/* Skills */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Skills</h2>
        <Field label="Skills (comma-separated)">
          <input
            className={inputClass}
            value={draft.skills.join(", ")}
            onChange={(e) => set("skills", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          />
        </Field>
      </section>

      {/* Work Auth */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Work Authorization</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Country">
            <input className={inputClass} value={draft.workAuthorization.country} onChange={(e) => set("workAuthorization.country", e.target.value)} />
          </Field>
          <Field label="Status (e.g. US Citizen, Work Permit)">
            <input className={inputClass} value={draft.workAuthorization.status} onChange={(e) => set("workAuthorization.status", e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <input type="checkbox" className="rounded" checked={draft.workAuthorization.requiresSponsorship} onChange={(e) => set("workAuthorization.requiresSponsorship", e.target.checked)} />
            Requires visa sponsorship
          </label>
        </div>
      </section>

      {/* Cover Letter Template */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Cover Letter Template</h2>
        <p className="mb-3 text-xs text-zinc-400">Use {"{role}"}, {"{company}"}, {"{years}"} as placeholders.</p>
        <textarea
          className={`${inputClass} min-h-[120px] resize-y`}
          value={draft.coverLetterTemplate}
          onChange={(e) => set("coverLetterTemplate", e.target.value)}
        />
      </section>

      <button
        onClick={handleSave}
        className="w-full rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 dark:bg-cyan-500 dark:hover:bg-cyan-400"
      >
        {saved ? "✅ Saved!" : "Save Profile"}
      </button>
    </div>
  );
}
