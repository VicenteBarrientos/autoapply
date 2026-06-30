const { normalizeJob, searchPrefsFromProfile } = require("../../shared/hub-contract");
const { fetchGreenhouseBoards } = require("./greenhouseBoards");
const { fetchLeverBoards } = require("./leverBoards");

const ARBEITNOW_URL = "https://arbeitnow.com/api/job-board-api";

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesQuery(job, query) {
  if (!query) return true;
  const haystack = `${job.title} ${job.company} ${job.description}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).every((term) => haystack.includes(term));
}

function matchesRoles(job, roles) {
  if (!roles?.length) return true;
  const title = job.title.toLowerCase();
  return roles.some((role) => {
    const r = role.toLowerCase();
    return title.includes(r) || r.split(/\s+/).some((word) => word.length > 3 && title.includes(word));
  });
}

function filterJobs(jobs, { query, roles, remote, location, limit }) {
  let filtered = jobs.filter(
    (job) =>
      matchesQuery(job, query) &&
      matchesRoles(job, roles) &&
      (remote == null || job.remote === remote) &&
      (!location || job.remote || !job.location || job.location.toLowerCase().includes(location.toLowerCase()))
  );
  if (limit > 0) filtered = filtered.slice(0, limit);
  return filtered;
}

async function fetchArbeitnow() {
  const res = await fetch(ARBEITNOW_URL, {
    headers: { Accept: "application/json", "User-Agent": "ResumeX-JobSearcher/1.0" },
  });
  if (!res.ok) throw new Error(`Arbeitnow API returned HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Unexpected Arbeitnow response format");

  return data.map((item) =>
    normalizeJob({
      title: item.title,
      company: item.company_name,
      location: item.location,
      remote: Boolean(item.remote),
      url: item.url,
      description: stripHtml(item.description),
      postedAt: item.created_at ? new Date(item.created_at * 1000).toISOString() : null,
      source: "arbeitnow",
    })
  );
}

async function searchJobs({ profile, preferences = {} }) {
  const prefs = { ...searchPrefsFromProfile(profile), ...preferences };
  const greenhouseBoards = prefs.greenhouseBoards || profile?.target?.greenhouseBoards || [];
  const leverBoards = prefs.leverBoards || profile?.target?.leverBoards || [];
  const providers = [];
  const sources = [];

  if (greenhouseBoards.length > 0) {
    try {
      providers.push(...(await fetchGreenhouseBoards(greenhouseBoards)));
      sources.push("greenhouse");
    } catch {
      // Greenhouse watchlist is optional
    }
  }

  if (leverBoards.length > 0) {
    try {
      providers.push(...(await fetchLeverBoards(leverBoards)));
      sources.push("lever");
    } catch {
      // Lever watchlist is optional
    }
  }

  try {
    providers.push(...(await fetchArbeitnow()));
    sources.push("arbeitnow");
  } catch (err) {
    if (providers.length === 0 && !process.env.JSEARCH_API_KEY) throw err;
  }

  if (process.env.JSEARCH_API_KEY && (prefs.query || prefs.roles?.[0])) {
    try {
      providers.push(...(await fetchJSearch(prefs)));
      sources.push("jsearch");
    } catch {
      // JSearch is optional — ignore if misconfigured
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const job of providers) {
    const key = job.url || job.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(job);
  }

  return {
    jobs: filterJobs(deduped, prefs),
    meta: { sources, totalFetched: deduped.length, preferences: prefs },
  };
}

async function fetchJSearch(prefs) {
  const params = new URLSearchParams({
    query: prefs.query || prefs.roles?.[0] || "software engineer",
    page: "1",
    num_pages: "1",
    date_posted: "week",
  });
  if (prefs.remote) params.set("remote_jobs_only", "true");

  const res = await fetch(`https://jsearch.p.rapidapi.com/search?${params}`, {
    headers: {
      "X-RapidAPI-Key": process.env.JSEARCH_API_KEY,
      "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    },
  });
  if (!res.ok) throw new Error(`JSearch API returned HTTP ${res.status}`);
  const data = await res.json();
  const items = data.data || [];

  return items.map((item) =>
    normalizeJob({
      title: item.job_title,
      company: item.employer_name,
      location: [item.job_city, item.job_state, item.job_country].filter(Boolean).join(", ") || null,
      remote: item.job_is_remote,
      url: item.job_apply_link || item.job_google_link,
      description: item.job_description || "",
      postedAt: item.job_posted_at_datetime_utc || null,
      source: "jsearch",
    })
  );
}

module.exports = { searchJobs, filterJobs, fetchArbeitnow };
