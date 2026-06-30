/**
 * ResumeX ecosystem hub contract.
 * Shared between AutoApply extension, ResumeX web apps, and the backend.
 * Copy or import this module in each app to stay in sync.
 */

const STORAGE_KEYS = {
  PROFILE: "resumex_profile",
  PROFILE_LEGACY: "autoapply_profile",
  JOBS: "resumex_jobs",
  SEARCH_PREFS: "resumex_search_prefs",
  APPLICATIONS: "resumex_applications",
  APPLICATIONS_LEGACY: "autoapply_applications",
};

const EVENTS = {
  PROFILE_UPDATED: "resumex:profile_updated",
  JOBS_UPDATED: "resumex:jobs_updated",
  JOB_MATCHED: "resumex:job_matched",
  NEW_APPLICATION: "resumex:new_application",
  // Legacy AutoApply events (still emitted for compatibility)
  PROFILE_UPDATED_LEGACY: "autoapply:profile_updated",
  NEW_APPLICATION_LEGACY: "autoapply:new_application",
};

const JOB_STATUS = {
  NEW: "new",
  SAVED: "saved",
  DISMISSED: "dismissed",
  APPLIED: "applied",
};

const PLATFORM_PATTERNS = [
  { platform: "linkedin", test: /linkedin\.com\/jobs/i, applySupported: true },
  { platform: "indeed", test: /indeed\.com/i, applySupported: true },
  { platform: "greenhouse", test: /greenhouse\.io/i, applySupported: true },
  { platform: "lever", test: /jobs\.lever\.co/i, applySupported: true },
  { platform: "workday", test: /myworkdayjobs\.com/i, applySupported: true },
  { platform: "jobgether", test: /jobgether\.com/i, applySupported: true },
];

function detectPlatform(url) {
  if (!url) return { platform: "other", applySupported: false };
  for (const { platform, test, applySupported } of PLATFORM_PATTERNS) {
    if (test.test(url)) return { platform, applySupported };
  }
  return { platform: "other", applySupported: false };
}

function jobIdFromUrl(url) {
  let hash = 0;
  const str = String(url);
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return `job_${Math.abs(hash).toString(36)}`;
}

/** Normalize a raw job record into the hub schema. */
function normalizeJob(raw) {
  const url = raw.url || raw.jobUrl || "";
  const { platform, applySupported } = detectPlatform(url);
  const now = new Date().toISOString();

  return {
    id: raw.id || jobIdFromUrl(url || `${raw.title}-${raw.company}`),
    title: raw.title || "Unknown Role",
    company: raw.company || "Unknown Company",
    location: raw.location || null,
    remote: Boolean(raw.remote),
    salary: raw.salary || null,
    url,
    platform: raw.platform || platform,
    description: (raw.description || "").slice(0, 8000),
    postedAt: raw.postedAt || null,
    discoveredAt: raw.discoveredAt || now,
    status: raw.status || JOB_STATUS.NEW,
    matchScore: raw.matchScore ?? null,
    matchGaps: raw.matchGaps || [],
    matchSummary: raw.matchSummary || null,
    applySupported: raw.applySupported ?? applySupported,
    source: raw.source || "manual",
  };
}

/** Default search preferences derived from a candidate profile. */
function searchPrefsFromProfile(profile) {
  const target = profile?.target || {};
  return {
    roles: target.roles || [],
    remote: target.remote ?? null,
    location: profile?.personal?.location || null,
    salaryMin: target.salaryMin ?? null,
    salaryMax: target.salaryMax ?? null,
    keywords: [],
    limit: 25,
    greenhouseBoards: target.greenhouseBoards || [],
    leverBoards: target.leverBoards || [],
  };
}

/** Merge new jobs into an existing queue (dedupe by id, preserve status/scores). */
function mergeJobs(existing, incoming) {
  const byId = new Map((existing || []).map((j) => [j.id, j]));
  for (const raw of incoming) {
    const job = normalizeJob(raw);
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

module.exports = {
  STORAGE_KEYS,
  EVENTS,
  JOB_STATUS,
  detectPlatform,
  jobIdFromUrl,
  normalizeJob,
  searchPrefsFromProfile,
  mergeJobs,
  markJobApplied,
};
