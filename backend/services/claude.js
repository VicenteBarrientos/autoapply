const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert job application assistant. Given a candidate profile and a list of form fields from a job application, return a JSON object mapping each field to the best answer derived from the profile.

Rules:
- Return ONLY valid JSON — no markdown, no prose, no code fences.
- Keys must match the field "label" (or "name" if no label) exactly as provided.
- Each field may include a "value" (current text) or "checked" (current boolean) property. If the existing value is already correct and complete, omit that key from your response to leave it unchanged.
- For yes/no questions use "Yes" or "No".
- For salary fields return only a number (no currency symbols).
- For "years of experience" fields return a number.
- For cover letter, "why do you want to work here", or motivational fields: if the profile includes a coverLetterTemplate, use it as the base and substitute {role}, {company}, {years}, {skills}, and {custom_paragraph} with contextually appropriate values from the profile and job description. Otherwise write 2-3 focused sentences.
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
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content?.[0];
  if (!block || block.type !== "text") {
    throw new Error("Unexpected response format from Claude");
  }

  const text = block.text.trim();
  // Strip accidental markdown fences
  const jsonText = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();

  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error("Claude returned a non-JSON response");
  }
}

module.exports = { fillFormFields };
