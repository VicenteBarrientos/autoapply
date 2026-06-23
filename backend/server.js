require("dotenv").config();
const express = require("express");
const cors = require("cors");

const applyRouter = require("./routes/apply");

const app = express();
const PORT = process.env.PORT || 3000;

// Allow requests from Chrome extension (chrome-extension://* origins)
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "1mb" }));

app.use("/api/apply", applyRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`AutoApply backend running on http://localhost:${PORT}`);
});
