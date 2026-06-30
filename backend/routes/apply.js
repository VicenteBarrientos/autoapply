const express = require("express");
const { fillFormFields } = require("../services/claude");

const router = express.Router();

// POST /api/apply/fill
// Body: { fields, jobDescription, platform, profile }
router.post("/fill", async (req, res) => {
  const { fields, jobDescription, platform, profile } = req.body;

  if (!fields || !Array.isArray(fields)) {
    return res.status(400).json({ error: "fields must be an array" });
  }
  if (!profile) {
    return res.status(400).json({ error: "profile is required" });
  }

  try {
    const answers = await fillFormFields({ fields, jobDescription, platform, profile });
    res.json(answers);
  } catch (err) {
    console.error("[apply/fill]", err);
    res.status(500).json({ error: "Failed to process form fields" });
  }
});

module.exports = router;
