const { normalizeJob } = require("../../shared/hub-contract");

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchLeverBoard(companySlug) {
  const slug = companySlug.trim().toLowerCase();
  if (!slug) return [];

  const res = await fetch(
    `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
    { headers: { Accept: "application/json", "User-Agent": "ResumeX-JobSearcher/1.0" } }
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Lever board "${slug}" returned HTTP ${res.status}`);

  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`Unexpected Lever response for "${slug}"`);

  return data.map((item) =>
    normalizeJob({
      title: item.text,
      company: item.categories?.team || slug,
      location: item.categories?.location || null,
      remote: /remote/i.test(item.categories?.location || ""),
      url: item.hostedUrl || item.applyUrl,
      description: item.descriptionPlain || stripHtml(item.description),
      postedAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
      source: "lever",
      platform: "lever",
    })
  );
}

async function fetchLeverBoards(companySlugs = []) {
  const slugs = [...new Set(companySlugs.map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (slugs.length === 0) return [];

  const results = await Promise.allSettled(slugs.map((slug) => fetchLeverBoard(slug)));
  const jobs = [];
  for (const result of results) {
    if (result.status === "fulfilled") jobs.push(...result.value);
  }
  return jobs;
}

module.exports = { fetchLeverBoards, fetchLeverBoard };
