const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert job application assistant. Given a candidate profile and a list of form fields from a job application, return a JSON object mapping each field to the best answer derived from the profile.

Rules:
- Return ONLY valid JSON — no markdown, no prose, no code fences.
- Keys must match the field "label" (or "name" if no label) exactly as provided.
- For yes/no questions use "Yes" or "No".
- For salary fields return only a number (no currency symbols).
- For "years of experience" fields return a number.
- For cover letters or "why do you want to work here" fields write 2-3 focused sentences.
- Skip fields where you have no confident answer (omit the key).
- Never fabricate credentials, institutions, or employment history not in the profile.`;

async function fillFormFields({ fields, jobDescription, platform, profile }) {
  const userMessage = `
Candidate profile:
${JSON.stringify(profile, null, 2)}

Job description (excerpt):
${jobDescription || "(not provided)"}

Platform: ${platform}

Form fields to fill:
${JSON.stringify(fields, null, 2)}

Return a JSON object with field labels as keys and the best answer as values.
`.trim();

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content[0].text.trim();

  // Strip accidental markdown fences
  const jsonText = text.replace(/^```(?:json)?/m, "").replace(/```$/m, "").trim();
  return JSON.parse(jsonText);
}

module.exports = { fillFormFields };
