const express = require("express");
const { parseProfileFromResume } = require("../services/parseProfile");

const router = express.Router();

/** POST /api/profile/parse — extract CandidateProfile fields from resume text */
router.post("/parse", async (req, res) => {
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
    res.status(500).json({ error: "Failed to parse resume into profile" });
  }
});

module.exports = router;
