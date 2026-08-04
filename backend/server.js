if (process.env.NODE_ENV !== "test") require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");

const applyRouter = require("./routes/apply");
const jobsRouter = require("./routes/jobs");
const profileRouter = require("./routes/profile");
const { getAutoapplySecrets, isAnthropicConfigured, isAuthRequired } = require("./lib/env");

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
// AUTOAPPLY_SECRET_NEXT enables a temporary two-key window during rotation.
// Skip auth when no secret is configured (local dev without .env).
app.use("/api", (req, res, next) => {
  const secrets = getAutoapplySecrets();
  const production = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  if (secrets.length === 0) {
    if (production) {
      return res.status(503).json({
        error: "AUTOAPPLY_SECRET is not configured on the server.",
      });
    }
    return next();
  }

  const provided = req.headers["x-autoapply-key"];
  const providedDigest = typeof provided === "string"
    ? crypto.createHash("sha256").update(provided).digest()
    : null;
  let authenticated = false;
  if (providedDigest) {
    for (const secret of secrets) {
      const secretDigest = crypto.createHash("sha256").update(secret).digest();
      authenticated = crypto.timingSafeEqual(providedDigest, secretDigest) || authenticated;
    }
  }

  if (!authenticated) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

app.get("/api/auth/check", (_req, res) =>
  res.set("Cache-Control", "no-store").json({
    ok: true,
    authRequired: isAuthRequired(),
  })
);

app.use("/api/apply", applyRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/profile", profileRouter);

app.get("/", (_req, res) =>
  res.json({
    name: "AutoApply Backend",
    version: "0.4.0",
    endpoints: [
      "GET /health",
      "GET /api/auth/check",
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
