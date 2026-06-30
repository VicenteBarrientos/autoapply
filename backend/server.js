require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");

const applyRouter = require("./routes/apply");
const jobsRouter = require("./routes/jobs");
const profileRouter = require("./routes/profile");
const { isAnthropicConfigured, isAuthRequired } = require("./lib/env");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan("combined"));

// Allow requests from Chrome extension (chrome-extension://* origins)
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "1mb" }));

// Rate-limit all API routes to prevent runaway Anthropic usage.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down" },
});
app.use("/api", apiLimiter);

// Require a shared secret so only the paired extension can call the API.
// Set AUTOAPPLY_SECRET in .env (backend) and BACKEND_SECRET in background.js (extension).
// Skip auth when no secret is configured (local dev without .env).
app.use("/api", (req, res, next) => {
  const secret = process.env.AUTOAPPLY_SECRET;
  if (!secret) return next();
  if (req.headers["x-autoapply-key"] !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

app.use("/api/apply", applyRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/profile", profileRouter);

app.get("/", (_req, res) =>
  res.json({
    name: "AutoApply Backend",
    version: "0.4.0",
    endpoints: [
      "GET /health",
      "POST /api/apply/fill",
      "POST /api/jobs/search",
      "POST /api/jobs/match",
      "POST /api/jobs/match-batch",
      "POST /api/jobs/normalize",
      "POST /api/profile/parse",
    ],
  })
);
app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    anthropicConfigured: isAnthropicConfigured(),
    authRequired: isAuthRequired(),
  })
);

// Only bind to a port when run directly — not when imported by tests or Vercel
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`AutoApply backend running on http://localhost:${PORT}`);
  });
}

module.exports = app;
