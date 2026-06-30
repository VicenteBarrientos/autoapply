// Runs in PAGE context (not extension context) — can access localStorage.
// Injected by resumex.js content script.
// Implements the ResumeX hub contract (shared/hub-contract.js).

(function () {
  const STORAGE_KEYS = {
    PROFILE: "resumex_profile",
    PROFILE_LEGACY: "autoapply_profile",
    JOBS: "resumex_jobs",
    SEARCH_PREFS: "resumex_search_prefs",
    APPLICATIONS: "resumex_applications",
    APPLICATIONS_LEGACY: "autoapply_applications",
  };

  const JOB_STATUS = { APPLIED: "applied" };

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
  }

  function getProfile() {
    return readJson(STORAGE_KEYS.PROFILE, null) || readJson(STORAGE_KEYS.PROFILE_LEGACY, null);
  }

  function setProfile(profile) {
    writeJson(STORAGE_KEYS.PROFILE, profile);
    writeJson(STORAGE_KEYS.PROFILE_LEGACY, profile); // legacy alias
    window.dispatchEvent(new CustomEvent("resumex:profile_updated", { detail: profile }));
    window.dispatchEvent(new CustomEvent("autoapply:profile_updated", { detail: profile }));
  }

  function getJobs() {
    return readJson(STORAGE_KEYS.JOBS, []);
  }

  function setJobs(jobs) {
    writeJson(STORAGE_KEYS.JOBS, jobs);
    window.dispatchEvent(new CustomEvent("resumex:jobs_updated", { detail: jobs }));
  }

  function mergeJobs(existing, incoming) {
    const byId = new Map((existing || []).map((j) => [j.id, j]));
    for (const job of incoming) {
      const prev = byId.get(job.id);
      if (prev) {
        byId.set(job.id, {
          ...job,
          status: prev.status === JOB_STATUS.APPLIED ? JOB_STATUS.APPLIED : prev.status,
          matchScore: prev.matchScore ?? job.matchScore,
          matchGaps: prev.matchGaps?.length ? prev.matchGaps : job.matchGaps,
          matchSummary: prev.matchSummary || job.matchSummary,
          discoveredAt: prev.discoveredAt || job.discoveredAt,
        });
      } else {
        byId.set(job.id, job);
      }
    }
    return [...byId.values()].sort(
      (a, b) => new Date(b.discoveredAt) - new Date(a.discoveredAt)
    );
  }

  function markJobApplied(jobs, { jobId, jobUrl }) {
    return (jobs || []).map((j) => {
      if (j.id === jobId || (jobUrl && j.url === jobUrl)) {
        return { ...j, status: JOB_STATUS.APPLIED };
      }
      return j;
    });
  }

  function logApplication(payload) {
    const appsKey = STORAGE_KEYS.APPLICATIONS;
    const legacyKey = STORAGE_KEYS.APPLICATIONS_LEGACY;
    let existing = readJson(appsKey, []);
    if (!existing.length) existing = readJson(legacyKey, []);
    if (!existing.find((a) => a.id === payload.id)) {
      const updated = [payload, ...existing].slice(0, 500);
      writeJson(appsKey, updated);
      writeJson(legacyKey, updated);
    }

    // Mark matching job in queue as applied
    const jobs = getJobs();
    if (jobs.length > 0) {
      setJobs(markJobApplied(jobs, { jobUrl: payload.jobUrl }));
    }

    window.dispatchEvent(new CustomEvent("resumex:new_application", { detail: payload }));
    window.dispatchEvent(new CustomEvent("autoapply:new_application", { detail: payload }));
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const { type, payload, nonce } = event.data || {};

    if (type === "AUTOAPPLY_GET_PROFILE" || type === "RESUMEX_GET_PROFILE") {
      window.postMessage({
        type: "AUTOAPPLY_PROFILE_RESPONSE",
        nonce,
        profile: getProfile(),
      }, "*");
    }

    if (type === "AUTOAPPLY_SET_PROFILE" || type === "RESUMEX_SET_PROFILE") {
      setProfile(payload);
      window.postMessage({ type: "AUTOAPPLY_PROFILE_SET_OK" }, "*");
    }

    if (type === "RESUMEX_GET_JOBS") {
      window.postMessage({
        type: "RESUMEX_JOBS_RESPONSE",
        nonce,
        jobs: getJobs(),
      }, "*");
    }

    if (type === "RESUMEX_SET_JOBS") {
      setJobs(payload);
      window.postMessage({ type: "RESUMEX_JOBS_SET_OK" }, "*");
    }

    if (type === "RESUMEX_MERGE_JOBS") {
      const merged = mergeJobs(getJobs(), payload || []);
      setJobs(merged);
      window.postMessage({ type: "RESUMEX_JOBS_MERGE_OK", jobs: merged }, "*");
    }

    if (type === "RESUMEX_GET_SEARCH_PREFS") {
      window.postMessage({
        type: "RESUMEX_SEARCH_PREFS_RESPONSE",
        nonce,
        preferences: readJson(STORAGE_KEYS.SEARCH_PREFS, null),
      }, "*");
    }

    if (type === "RESUMEX_SET_SEARCH_PREFS") {
      writeJson(STORAGE_KEYS.SEARCH_PREFS, payload);
      window.postMessage({ type: "RESUMEX_SEARCH_PREFS_SET_OK" }, "*");
    }

    if (type === "AUTOAPPLY_LOG_APPLICATION" || type === "RESUMEX_LOG_APPLICATION") {
      logApplication(payload);
      window.postMessage({ type: "AUTOAPPLY_LOG_OK" }, "*");
    }
  });
})();
