const { normalizeJob } = require("../../shared/hub-contract");

const BOARDS_API = "https://boards-api.greenhouse.io/v1/boards";

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchGreenhouseBoard(boardToken) {
  const token = boardToken.trim().toLowerCase();
  if (!token) return [];

  const res = await fetch(`${BOARDS_API}/${encodeURIComponent(token)}/jobs?content=true`, {
    headers: { Accept: "application/json", "User-Agent": "ResumeX-JobSearcher/1.0" },
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Greenhouse board "${token}" returned HTTP ${res.status}`);

  const data = await res.json();
  const jobs = data.jobs || [];

  return jobs.map((item) =>
    normalizeJob({
      title: item.title,
      company: data.name || token,
      location: item.location?.name || null,
      remote: /remote/i.test(item.location?.name || ""),
      url: item.absolute_url,
      description: stripHtml(item.content),
      postedAt: item.updated_at || item.requisition_id || null,
      source: "greenhouse",
      platform: "greenhouse",
    })
  );
}

/** Fetch jobs from one or more Greenhouse board tokens (company slugs). */
async function fetchGreenhouseBoards(boardTokens = []) {
  const tokens = [...new Set(boardTokens.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (tokens.length === 0) return [];

  const results = await Promise.allSettled(tokens.map((token) => fetchGreenhouseBoard(token)));
  const jobs = [];
  for (const result of results) {
    if (result.status === "fulfilled") jobs.push(...result.value);
  }
  return jobs;
}

module.exports = { fetchGreenhouseBoards, fetchGreenhouseBoard };
