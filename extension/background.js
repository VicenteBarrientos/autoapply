const DEFAULT_BACKEND_URL = "https://backend-inky-kappa-12.vercel.app";
const RESUMEX_URL = "https://resume-x-yixz.vercel.app";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FILL_FORM") {
    handleFillForm(message.payload).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (message.type === "GET_PROFILE") {
    chrome.storage.local.get(["candidate_profile"], (result) => {
      sendResponse({ profile: result.candidate_profile || null });
    });
    return true;
  }

  if (message.type === "SET_PROFILE") {
    chrome.storage.local.set({ candidate_profile: message.payload }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "LOG_APPLICATION") {
    logApplicationToResumeX(message.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "SYNC_PROFILE_FROM_RESUMEX") {
    syncProfileFromResumeX().then(sendResponse).catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "TEST_BACKEND") {
    testBackendConnection(message.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "SEARCH_JOBS") {
    searchJobs(message.payload).then(sendResponse).catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "MATCH_JOB") {
    matchJob(message.payload).then(sendResponse).catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "GET_JOBS") {
    getStoredJobs().then((jobs) => sendResponse({ jobs })).catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "SET_JOBS") {
    setStoredJobs(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "SYNC_JOBS_FROM_RESUMEX") {
    syncJobsFromResumeX().then(sendResponse).catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "MATCH_JOBS_BATCH") {
    matchJobsBatch(message.payload).then(sendResponse).catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "ADD_JOB") {
    addJobToQueue(message.payload).then(sendResponse).catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

const JOBS_STORAGE_KEY = "resumex_jobs";

function mergeJobsList(existing, incoming) {
  const byId = new Map((existing || []).map((j) => [j.id, j]));
  for (const job of incoming || []) {
    const prev = byId.get(job.id);
    if (prev) {
      byId.set(job.id, {
        ...job,
        status: prev.status === "applied" ? "applied" : prev.status || job.status,
        matchScore: prev.matchScore ?? job.matchScore,
        matchGaps: prev.matchGaps?.length ? prev.matchGaps : job.matchGaps,
        matchSummary: prev.matchSummary || job.matchSummary,
        discoveredAt: prev.discoveredAt || job.discoveredAt,
      });
    } else {
      byId.set(job.id, job);
    }
  }
  return [...byId.values()].sort((a, b) => new Date(b.discoveredAt) - new Date(a.discoveredAt));
}

async function getStoredJobs() {
  return new Promise((resolve) =>
    chrome.storage.local.get([JOBS_STORAGE_KEY], (r) => resolve(r[JOBS_STORAGE_KEY] || []))
  );
}

async function setStoredJobs(jobs) {
  await new Promise((resolve, reject) =>
    chrome.storage.local.set({ [JOBS_STORAGE_KEY]: jobs }, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    })
  );

  const resumexTabs = await chrome.tabs.query({ url: `${RESUMEX_URL}/*` });
  for (const tab of resumexTabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "SET_RESUMEX_JOBS", payload: jobs });
    } catch {
      // ResumeX tab may not be ready
    }
  }
}

async function syncJobsFromResumeX() {
  const tabs = await chrome.tabs.query({ url: `${RESUMEX_URL}/*` });
  if (tabs.length === 0) return { error: "ResumeX not open in any tab" };

  let result;
  try {
    result = await chrome.tabs.sendMessage(tabs[0].id, { type: "GET_RESUMEX_JOBS" });
  } catch (err) {
    return { error: `Could not reach ResumeX tab: ${err.message}` };
  }

  if (result?.jobs) {
    await setStoredJobs(result.jobs);
    return { ok: true, jobs: result.jobs };
  }
  return { error: result?.error || "No jobs found in ResumeX" };
}

async function getBackendSecret() {
  return new Promise((resolve) =>
    chrome.storage.local.get(["backend_secret"], (r) => resolve(r.backend_secret || ""))
  );
}

async function getBackendUrl() {
  return new Promise((resolve) =>
    chrome.storage.local.get(["backend_url"], (r) => {
      const url = (r.backend_url || DEFAULT_BACKEND_URL).trim().replace(/\/$/, "");
      resolve(url);
    })
  );
}

async function fetchWithRetry(url, options, maxRetries = 1) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      // Retry on transient server errors (cold start, gateway timeout)
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        lastError = new Error("Request timed out — the backend took too long to respond.");
      } else {
        lastError = err;
      }
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastError || new Error("Network request failed");
}

async function handleFillForm(payload) {
  const [secret, backendUrl] = await Promise.all([getBackendSecret(), getBackendUrl()]);
  const headers = { "Content-Type": "application/json" };
  if (secret) headers["X-Autoapply-Key"] = secret;

  const res = await fetchWithRetry(`${backendUrl}/api/apply/fill`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Backend secret mismatch — paste AUTOAPPLY_SECRET in the AutoApply popup.");
    }
    if (res.status === 429) {
      throw new Error("Rate limit reached — wait a minute and try again.");
    }
    const text = await res.text();
    throw new Error(`Backend error ${res.status}: ${text}`);
  }
  return res.json();
}

async function testBackendConnection({ url, secret } = {}) {
  const backendUrl = ((url && url.trim()) || (await getBackendUrl())).replace(/\/$/, "");
  const key = secret !== undefined ? secret : await getBackendSecret();
  const headers = {};
  if (key) headers["X-Autoapply-Key"] = key;

  const res = await fetchWithRetry(`${backendUrl}/health`, { method: "GET", headers }, 0);

  if (res.status === 401) {
    return { ok: false, error: "Secret rejected (401) — check AUTOAPPLY_SECRET." };
  }
  if (!res.ok) {
    return { ok: false, error: `Backend returned HTTP ${res.status}` };
  }

  const body = await res.json();
  return { ok: true, url: backendUrl, ...body };
}

async function searchJobs(payload) {
  const [secret, backendUrl] = await Promise.all([getBackendSecret(), getBackendUrl()]);
  const headers = { "Content-Type": "application/json" };
  if (secret) headers["X-Autoapply-Key"] = secret;

  const res = await fetchWithRetry(`${backendUrl}/api/jobs/search`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Job search failed (${res.status}): ${text}`);
  }

  const result = await res.json();
  const existing = await getStoredJobs();
  const merged = mergeJobsList(existing, result.jobs);
  await setStoredJobs(merged);
  return { ...result, jobs: merged, newCount: result.jobs.length };
}

async function matchJobsBatch({ profile, jobs, limit = 5 }) {
  const [secret, backendUrl] = await Promise.all([getBackendSecret(), getBackendUrl()]);
  const headers = { "Content-Type": "application/json" };
  if (secret) headers["X-Autoapply-Key"] = secret;

  const res = await fetchWithRetry(`${backendUrl}/api/jobs/match-batch`, {
    method: "POST",
    headers,
    body: JSON.stringify({ profile, jobs, limit }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Batch match failed (${res.status}): ${text}`);
  }

  const { results } = await res.json();
  const byId = new Map(results.map((r) => [r.jobId, r]));
  const stored = await getStoredJobs();
  const updated = stored.map((j) => {
    const m = byId.get(j.id);
    if (!m) return j;
    return {
      ...j,
      matchScore: m.score,
      matchGaps: m.matchGaps || m.gaps,
      matchSummary: m.matchSummary || m.summary,
    };
  });
  await setStoredJobs(updated);
  return { results, jobs: updated };
}

async function addJobToQueue(rawJob) {
  const [secret, backendUrl] = await Promise.all([getBackendSecret(), getBackendUrl()]);
  const headers = { "Content-Type": "application/json" };
  if (secret) headers["X-Autoapply-Key"] = secret;

  const res = await fetchWithRetry(`${backendUrl}/api/jobs/normalize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ job: rawJob }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not add job (${res.status}): ${text}`);
  }

  const { job } = await res.json();
  const merged = mergeJobsList(await getStoredJobs(), [job]);
  await setStoredJobs(merged);
  return { job, jobs: merged };
}

async function matchJob(payload) {
  const [secret, backendUrl] = await Promise.all([getBackendSecret(), getBackendUrl()]);
  const headers = { "Content-Type": "application/json" };
  if (secret) headers["X-Autoapply-Key"] = secret;

  const res = await fetchWithRetry(`${backendUrl}/api/jobs/match`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Job match failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function logApplicationToResumeX(application) {
  // 1. Persist in extension local storage (capped at 500 entries)
  const existing = await new Promise((resolve) =>
    chrome.storage.local.get(["autoapply_applications"], (r) =>
      resolve(r.autoapply_applications || [])
    )
  );

  const updated = [application, ...existing.filter((a) => a.id !== application.id)].slice(0, 500);

  await new Promise((resolve, reject) =>
    chrome.storage.local.set({ autoapply_applications: updated }, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    })
  );

  // Mark matching job as applied in local queue
  const jobs = await getStoredJobs();
  if (jobs.length > 0) {
    const marked = jobs.map((j) =>
      j.url === application.jobUrl ? { ...j, status: "applied" } : j
    );
    await setStoredJobs(marked);
  }

  // Push to any open ResumeX tab so the dashboard updates live
  const resumexTabs = await chrome.tabs.query({ url: `${RESUMEX_URL}/*` });
  for (const tab of resumexTabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "PUSH_APPLICATION_TO_RESUMEX",
        payload: application,
      });
    } catch {
      // Tab may not have content script ready yet — that's fine
    }
  }

  return { ok: true, application };
}

async function syncProfileFromResumeX() {
  const tabs = await chrome.tabs.query({ url: `${RESUMEX_URL}/*` });
  if (tabs.length === 0) return { error: "ResumeX not open in any tab" };

  let result;
  try {
    result = await chrome.tabs.sendMessage(tabs[0].id, { type: "GET_RESUMEX_PROFILE" });
  } catch (err) {
    return { error: `Could not reach ResumeX tab: ${err.message}` };
  }

  if (result?.profile) {
    await new Promise((resolve, reject) =>
      chrome.storage.local.set({ candidate_profile: result.profile }, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      })
    );
    return { ok: true, profile: result.profile };
  }
  return { error: result?.error || "No profile found in ResumeX" };
}
