import type { CandidateProfile } from "@/lib/autoapply-types";
import type { Job, JobMatchResult } from "@/lib/job-types";

const DEFAULT_BACKEND = "https://autoapply-rwhg.vercel.app";
const BACKEND_URL_KEY = "resumex_backend_url";
const BACKEND_SECRET_KEY = "resumex_backend_secret";

export function getBackendUrl(): string {
  return (localStorage.getItem(BACKEND_URL_KEY) || DEFAULT_BACKEND).replace(/\/$/, "");
}

export function getBackendSecret(): string {
  return localStorage.getItem(BACKEND_SECRET_KEY) || "";
}

export function saveBackendSettings(url: string, secret: string) {
  localStorage.setItem(BACKEND_URL_KEY, url.replace(/\/$/, "") || DEFAULT_BACKEND);
  localStorage.setItem(BACKEND_SECRET_KEY, secret);
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = getBackendSecret();
  if (secret) headers["X-Autoapply-Key"] = secret;

  const res = await fetch(`${getBackendUrl()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function searchJobs(
  profile: CandidateProfile,
  preferences: {
    greenhouseBoards?: string[];
    leverBoards?: string[];
    limit?: number;
  }
): Promise<{ jobs: Job[]; meta?: { sources?: string[] } }> {
  return apiPost("/api/jobs/search", { profile, preferences: { ...preferences, location: null } });
}

export async function matchJob(profile: CandidateProfile, job: Job): Promise<JobMatchResult> {
  return apiPost("/api/jobs/match", { profile, job });
}

export async function matchJobsBatch(
  profile: CandidateProfile,
  jobs: Job[],
  limit = 5
): Promise<{ results: JobMatchResult[] }> {
  return apiPost("/api/jobs/match-batch", { profile, jobs, limit });
}

export async function normalizeJob(job: Partial<Job> & { url: string }): Promise<Job> {
  const res = await apiPost<{ job: Job }>("/api/jobs/normalize", { job });
  return res.job;
}
