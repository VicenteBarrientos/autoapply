const express = require("express");
const { parseProfileFromResume } = require("../services/parseProfile");
const { requireAnthropicKey } = require("../lib/env");

const router = express.Router();

/** POST /api/profile/parse — extract CandidateProfile fields from resume text */
router.post("/parse", async (req, res) => {
  if (!requireAnthropicKey(res)) return;

  const { resume } = req.body;

  if (!resume || typeof resume !== "string" || !resume.trim()) {
    return res.status(400).json({ error: "resume text is required" });
  }

  if (resume.length > 15000) {
    return res.status(400).json({ error: "resume must be under 15,000 characters" });
  }

  try {
    const profile = await parseProfileFromResume(resume.trim());
    res.json({ profile });
  } catch (err) {
    console.error("[profile/parse]", err.message);
    const msg = err.message || "";
    if (/api key|authentication|401/i.test(msg)) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY is invalid or not configured." });
    }
    res.status(500).json({ error: "Failed to parse resume into profile" });
  }
});

module.exports = router;
