const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MATCH_SYSTEM_PROMPT = `You are an expert career coach and resume matcher. Given a candidate profile and a job posting, evaluate how well the candidate fits the role.

Return ONLY valid JSON — no markdown, no prose, no code fences.

JSON schema:
{
  "score": <integer 0-100>,
  "summary": "<one sentence overall assessment>",
  "strengths": ["<strength>", ...],
  "gaps": ["<gap or missing skill>", ...],
  "recommendation": "strong_apply" | "apply" | "stretch" | "skip"
}

Rules:
- score 80+ = strong_apply, 65-79 = apply, 50-64 = stretch, below 50 = skip
- Base the score on skills, experience level, role alignment, and location/remote fit
- gaps should be actionable (specific skills or experience gaps)
- Never inflate the score — be honest about mismatches`;

async function matchJobToProfile({ profile, job }) {
  const userMessage = `
Candidate profile:
${JSON.stringify(profile, null, 2)}

Job posting:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || "Not specified"}
Remote: ${job.remote ? "Yes" : "No"}

Description:
${(job.description || "").slice(0, 4000)}
`.trim();

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: MATCH_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content?.[0];
  if (!block || block.type !== "text") {
    throw new Error("Unexpected response format from Claude");
  }

  const text = block.text.trim();
  const jsonText = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Claude returned a non-JSON match response");
  }

  return {
    score: Math.min(100, Math.max(0, Number(parsed.score) || 0)),
    summary: parsed.summary || "",
    strengths: parsed.strengths || [],
    gaps: parsed.gaps || [],
    recommendation: parsed.recommendation || "apply",
  };
}

module.exports = { matchJobToProfile };
