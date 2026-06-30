/**
 * ResumeX-hosted job queue page.
 * Deploy to resume-x-yixz.vercel.app/jobs — reads/writes resumex_jobs in localStorage.
 * Requires resumex-bridge.js (or AutoApply extension) for full ecosystem sync.
 */

const STORAGE = {
  JOBS: "resumex_jobs",
  PROFILE: "resumex_profile",
  PROFILE_LEGACY: "autoapply_profile",
  BACKEND_URL: "resumex_backend_url",
  BACKEND_SECRET: "resumex_backend_secret",
};

const DEFAULT_BACKEND = "https://backend-inky-kappa-12.vercel.app";

const jobsEl = document.getElementById("jobs");
const emptyEl = document.getElementById("empty");
const msgEl = document.getElementById("msg");

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("resumex:jobs_updated", { detail: value }));
}

function getProfile() {
  return readJson(STORAGE.PROFILE, null) || readJson(STORAGE.PROFILE_LEGACY, null);
}

function showMsg(text, isErr = false) {
  msgEl.textContent = text;
  msgEl.className = isErr ? "err" : text ? "ok" : "";
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function mergeJobs(existing, incoming) {
  const byId = new Map((existing || []).map((j) => [j.id, j]));
  for (const job of incoming) {
    const prev = byId.get(job.id);
    byId.set(job.id, prev ? { ...job, status: prev.status === "applied" ? "applied" : prev.status, matchScore: prev.matchScore ?? job.matchScore, matchGaps: prev.matchGaps?.length ? prev.matchGaps : job.matchGaps, matchSummary: prev.matchSummary || job.matchSummary } : job);
  }
  return [...byId.values()].sort((a, b) => new Date(b.discoveredAt) - new Date(a.discoveredAt));
}

async function apiPost(path, body) {
  const url = (localStorage.getItem(STORAGE.BACKEND_URL) || DEFAULT_BACKEND).replace(/\/$/, "");
  const secret = localStorage.getItem(STORAGE.BACKEND_SECRET) || "";
  const headers = { "Content-Type": "application/json" };
  if (secret) headers["X-Autoapply-Key"] = secret;

  const res = await fetch(`${url}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

function render() {
  const jobs = readJson(STORAGE.JOBS, []).filter((j) => j.status !== "dismissed");
  jobsEl.innerHTML = "";
  emptyEl.hidden = jobs.length > 0;

  for (const job of jobs) {
    const el = document.createElement("article");
    el.className = "job";
    el.innerHTML = `
      <h3>${esc(job.title)}</h3>
      <p class="meta">${esc(job.company)}${job.location ? ` · ${esc(job.location)}` : ""}</p>
      <div class="tags">
        <span>${esc(job.platform)}</span>
        ${job.applySupported ? '<span class="auto">⚡ AutoApply</span>' : ""}
        ${job.matchScore != null ? `<span class="score">${job.matchScore}%</span>` : ""}
        ${job.status === "applied" ? "<span>Applied</span>" : ""}
      </div>
      ${job.matchSummary ? `<p class="meta" style="margin-top:8px">${esc(job.matchSummary)}</p>` : ""}
      <div class="actions">
        ${job.matchScore == null ? `<button type="button" data-match="${job.id}">Analyze</button>` : ""}
        ${job.url ? `<button type="button" data-open="${job.url}">Open</button>` : ""}
        <button type="button" class="secondary" data-dismiss="${job.id}">Dismiss</button>
      </div>
    `;
    jobsEl.appendChild(el);
  }

  jobsEl.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => window.open(btn.dataset.open, "_blank"));
  });
  jobsEl.querySelectorAll("[data-dismiss]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const all = readJson(STORAGE.JOBS, []);
      writeJson(STORAGE.JOBS, all.map((j) => (j.id === btn.dataset.dismiss ? { ...j, status: "dismissed" } : j)));
      render();
    });
  });
  jobsEl.querySelectorAll("[data-match]").forEach((btn) => {
    btn.addEventListener("click", () => matchJob(btn.dataset.match));
  });
}

async function matchJob(jobId) {
  const profile = getProfile();
  if (!profile) { showMsg("No profile found — use CV Formatter or AutoApply popup.", true); return; }
  const job = readJson(STORAGE.JOBS, []).find((j) => j.id === jobId);
  if (!job) return;

  showMsg("Analyzing match…");
  try {
    const res = await apiPost("/api/jobs/match", { profile, job });
    const updated = readJson(STORAGE.JOBS, []).map((j) =>
      j.id === jobId ? { ...j, matchScore: res.score, matchGaps: res.matchGaps, matchSummary: res.matchSummary } : j
    );
    writeJson(STORAGE.JOBS, updated);
    render();
    showMsg(`Match: ${res.score}% (${res.recommendation})`);
  } catch (err) {
    showMsg(err.message, true);
  }
}

document.getElementById("save-settings").addEventListener("click", () => {
  localStorage.setItem(STORAGE.BACKEND_URL, document.getElementById("backend-url").value.trim() || DEFAULT_BACKEND);
  localStorage.setItem(STORAGE.BACKEND_SECRET, document.getElementById("backend-secret").value.trim());
  showMsg("Settings saved.");
});

document.getElementById("search-btn").addEventListener("click", async () => {
  const profile = getProfile();
  if (!profile) { showMsg("No profile — upload resume in CV Formatter first.", true); return; }

  const greenhouseBoards = document.getElementById("greenhouse-boards").value
    .split(",").map((s) => s.trim()).filter(Boolean);
  const leverBoards = document.getElementById("lever-boards").value
    .split(",").map((s) => s.trim()).filter(Boolean);

  showMsg("Searching…");
  try {
    const res = await apiPost("/api/jobs/search", { profile, preferences: { greenhouseBoards, leverBoards, location: null, limit: 30 } });
    const merged = mergeJobs(readJson(STORAGE.JOBS, []), res.jobs);
    writeJson(STORAGE.JOBS, merged);
    render();
    showMsg(`${res.jobs.length} jobs found (${merged.length} in queue).`);
  } catch (err) {
    showMsg(err.message, true);
  }
});

document.getElementById("refresh-btn").addEventListener("click", () => {
  render();
  showMsg("List refreshed.");
});

window.addEventListener("resumex:jobs_updated", render);
window.addEventListener("storage", (e) => { if (e.key === STORAGE.JOBS) render(); });

document.getElementById("backend-url").value = localStorage.getItem(STORAGE.BACKEND_URL) || DEFAULT_BACKEND;
document.getElementById("backend-secret").value = localStorage.getItem(STORAGE.BACKEND_SECRET) || "";
const profile = getProfile();
if (profile?.target?.greenhouseBoards?.length) {
  document.getElementById("greenhouse-boards").value = profile.target.greenhouseBoards.join(", ");
}
if (profile?.target?.leverBoards?.length) {
  document.getElementById("lever-boards").value = profile.target.leverBoards.join(", ");
}

render();
