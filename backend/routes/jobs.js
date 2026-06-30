const express = require("express");
const { normalizeJob } = require("../../shared/hub-contract");
const { searchJobs } = require("../services/jobSearch");
const { matchJobToProfile } = require("../services/jobMatch");

const router = express.Router();

/** POST /api/jobs/search — discover jobs from external providers */
router.post("/search", async (req, res) => {
  try {
    const { profile, preferences } = req.body;
    if (!profile || typeof profile !== "object") {
      return res.status(400).json({ error: "profile is required" });
    }

    const result = await searchJobs({ profile, preferences });
    res.json(result);
  } catch (err) {
    console.error("[jobs/search]", err);
    res.status(500).json({ error: "Failed to search for jobs" });
  }
});

/** POST /api/jobs/match — score a single job against the candidate profile */
router.post("/match", async (req, res) => {
  try {
    const { profile, job } = req.body;
    if (!profile || typeof profile !== "object") {
      return res.status(400).json({ error: "profile is required" });
    }
    if (!job || typeof job !== "object") {
      return res.status(400).json({ error: "job is required" });
    }

    const normalized = normalizeJob(job);
    const match = await matchJobToProfile({ profile, job: normalized });

    res.json({
      jobId: normalized.id,
      ...match,
      matchGaps: match.gaps,
      matchSummary: match.summary,
    });
  } catch (err) {
    console.error("[jobs/match]", err);
    res.status(500).json({ error: "Failed to match job to profile" });
  }
});

/** POST /api/jobs/normalize — normalize a manually added job URL/object */
router.post("/normalize", (req, res) => {
  const { job } = req.body;
  if (!job || typeof job !== "object") {
    return res.status(400).json({ error: "job object is required" });
  }
  if (!job.url && !job.title) {
    return res.status(400).json({ error: "job must include at least url or title" });
  }
  res.json({ job: normalizeJob(job) });
});

/** POST /api/jobs/match-batch — score up to N jobs (sequential, rate-limited by caller) */
router.post("/match-batch", async (req, res) => {
  try {
    const { profile, jobs, limit = 5 } = req.body;
    if (!profile || typeof profile !== "object") {
      return res.status(400).json({ error: "profile is required" });
    }
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({ error: "jobs array is required" });
    }

    const cap = Math.min(Math.max(1, Number(limit) || 5), 10);
    const results = [];

    for (const raw of jobs.slice(0, cap)) {
      const job = normalizeJob(raw);
      const match = await matchJobToProfile({ profile, job });
      results.push({
        jobId: job.id,
        ...match,
        matchGaps: match.gaps,
        matchSummary: match.summary,
      });
    }

    res.json({ results, matched: results.length });
  } catch (err) {
    console.error("[jobs/match-batch]", err);
    res.status(500).json({ error: "Failed to batch-match jobs" });
  }
});

module.exports = router;
