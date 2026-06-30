const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert resume parser for job applications.
Extract structured candidate profile data from the resume text. Return JSON only — no markdown, no code fences.

Rules:
- Only include information explicitly present or clearly inferable from the resume.
- Never invent employers, degrees, emails, or skills not supported by the resume.
- For missing fields use empty strings, 0, false, or empty arrays.
- skills: flat string array of technical and professional skills mentioned.
- target.roles: infer 1-3 suitable job titles from experience.
- experience.summary: 2-4 sentence professional summary based on the resume.
- experience.totalYears: estimate total years of professional experience as an integer.
- coverLetterTemplate: brief template with {role}, {company}, {years}, {skills} placeholders if enough context; otherwise empty string.
- workAuthorization: only fill if visa/sponsorship/citizenship is mentioned.
- target.remote and willingToRelocate: true only if resume suggests openness; default false if unknown.
- target.salaryMin/Max: only if salary expectations appear; otherwise 0.
- personal.location must be a plain string (e.g. "Berlin, Germany"), never an object.`;

function toText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const parts = [value.city, value.region, value.state, value.country, value.name]
      .filter(Boolean)
      .map(String);
    if (parts.length) return parts.join(", ");
    return "";
  }
  return String(value);
}

function normalizeProfile(raw) {
  const personal = raw.personal || {};
  const target = raw.target || {};
  const experience = raw.experience || {};
  const workAuthorization = raw.workAuthorization || {};

  return {
    personal: {
      firstName: toText(personal.firstName),
      lastName: toText(personal.lastName),
      email: toText(personal.email),
      phone: toText(personal.phone),
      location: toText(personal.location),
      linkedinUrl: toText(personal.linkedinUrl),
      githubUrl: toText(personal.githubUrl),
    },
    target: {
      roles: Array.isArray(target.roles) ? target.roles.map(String) : [],
      salaryMin: Number(target.salaryMin) || 0,
      salaryMax: Number(target.salaryMax) || 0,
      currency: String(target.currency ?? "USD"),
      remote: Boolean(target.remote),
      willingToRelocate: Boolean(target.willingToRelocate),
      startAvailability: String(target.startAvailability ?? "2 weeks"),
    },
    experience: {
      totalYears: Math.max(0, Math.round(Number(experience.totalYears) || 0)),
      currentTitle: String(experience.currentTitle ?? ""),
      currentCompany: String(experience.currentCompany ?? ""),
      summary: String(experience.summary ?? ""),
    },
    skills: Array.isArray(raw.skills) ? raw.skills.map(String) : [],
    workAuthorization: {
      country: String(workAuthorization.country ?? ""),
      status: String(workAuthorization.status ?? ""),
      requiresSponsorship: Boolean(workAuthorization.requiresSponsorship),
    },
    coverLetterTemplate: String(raw.coverLetterTemplate ?? ""),
  };
}

async function parseProfileFromResume(resume) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Resume text:\n\n${resume}\n\nReturn a JSON object with keys: personal, target, experience, skills, workAuthorization, coverLetterTemplate.`,
      },
    ],
  });

  const block = response.content?.[0];
  if (!block || block.type !== "text") {
    throw new Error("Unexpected response format from Claude");
  }

  const jsonText = block.text
    .trim()
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```$/m, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Claude returned a non-JSON response");
  }

  return normalizeProfile(parsed);
}

module.exports = { parseProfileFromResume, normalizeProfile };
