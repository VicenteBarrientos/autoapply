const request = require("supertest");

var mockCreate;
jest.mock("@anthropic-ai/sdk", () => {
  mockCreate = jest.fn().mockResolvedValue({
    content: [{
      type: "text",
      text: JSON.stringify({
        score: 78,
        summary: "Strong skills overlap with minor gap in Kubernetes.",
        strengths: ["Node.js", "React"],
        gaps: ["Kubernetes production experience"],
        recommendation: "apply",
      }),
    }],
  });
  return jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } }));
});

const app = require("../server");

const PROFILE = {
  personal: { firstName: "Jane", lastName: "Doe", location: "Berlin" },
  target: { roles: ["Software Engineer"], remote: true },
  experience: { totalYears: 5, currentTitle: "Engineer" },
  skills: { languages: ["JavaScript"], frameworks: ["Node.js", "React"] },
};

const SAMPLE_JOB = {
  title: "Backend Engineer",
  company: "Acme",
  location: "Remote",
  remote: true,
  url: "https://boards.greenhouse.io/acme/jobs/123",
  description: "We need Node.js and React experience. 5+ years preferred.",
};

describe("POST /api/jobs/match-batch", () => {
  it("returns 400 without jobs array", async () => {
    const res = await request(app).post("/api/jobs/match-batch").send({ profile: PROFILE });
    expect(res.status).toBe(400);
  });

  it("scores multiple jobs", async () => {
    const res = await request(app)
      .post("/api/jobs/match-batch")
      .send({ profile: PROFILE, jobs: [SAMPLE_JOB, { ...SAMPLE_JOB, title: "Frontend Engineer" }], limit: 2 });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0].score).toBe(78);
  });
});

describe("POST /api/jobs/search", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns 400 without profile", async () => {
    const res = await request(app).post("/api/jobs/search").send({});
    expect(res.status).toBe(400);
  });

  it("returns normalized jobs from Lever watchlist", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{
        text: "Software Engineer",
        hostedUrl: "https://jobs.lever.co/acme/abc",
        categories: { location: "Remote", team: "Engineering" },
        descriptionPlain: "Build APIs with Node.js",
        createdAt: 1700000000000,
      }],
    });

    const res = await request(app)
      .post("/api/jobs/search")
      .send({
        profile: PROFILE,
        preferences: { leverBoards: ["acme"], roles: ["Software"], location: null, limit: 5 },
      });

    expect(res.status).toBe(200);
    expect(res.body.jobs.some((j) => j.source === "lever")).toBe(true);
    expect(res.body.meta.sources).toContain("lever");
  });

  it("returns normalized jobs from Greenhouse watchlist", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: "Acme Corp",
        jobs: [{
          title: "Backend Engineer",
          absolute_url: "https://boards.greenhouse.io/acme/jobs/123",
          location: { name: "Remote" },
          content: "<p>Node.js engineer</p>",
          updated_at: "2026-01-01",
        }],
      }),
    });

    const res = await request(app)
      .post("/api/jobs/search")
      .send({
        profile: PROFILE,
        preferences: { greenhouseBoards: ["acme"], roles: ["Engineer"], location: null, limit: 5 },
      });

    expect(res.status).toBe(200);
    expect(res.body.jobs.some((j) => j.source === "greenhouse")).toBe(true);
    expect(res.body.meta.sources).toContain("greenhouse");
  });

  it("returns normalized jobs from provider", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{
        title: "Software Engineer",
        company_name: "Tech Co",
        location: "Berlin",
        remote: true,
        url: "https://example.com/job/1",
        description: "<p>Node.js role</p>",
        created_at: 1700000000,
      }],
    });

    const res = await request(app)
      .post("/api/jobs/search")
      .send({ profile: PROFILE, preferences: { limit: 5 } });

    expect(res.status).toBe(200);
    expect(res.body.jobs).toBeInstanceOf(Array);
    expect(res.body.jobs[0]).toMatchObject({
      title: "Software Engineer",
      company: "Tech Co",
      source: "arbeitnow",
    });
  });
});

describe("POST /api/jobs/match", () => {
  it("returns 400 without job", async () => {
    const res = await request(app).post("/api/jobs/match").send({ profile: PROFILE });
    expect(res.status).toBe(400);
  });

  it("returns match score for a job", async () => {
    const res = await request(app)
      .post("/api/jobs/match")
      .send({ profile: PROFILE, job: SAMPLE_JOB });

    expect(res.status).toBe(200);
    expect(res.body.score).toBe(78);
    expect(res.body.recommendation).toBe("apply");
    expect(res.body.matchGaps).toContain("Kubernetes production experience");
  });
});

describe("POST /api/jobs/normalize", () => {
  it("normalizes a manual job object", async () => {
    const res = await request(app).post("/api/jobs/normalize").send({ job: SAMPLE_JOB });
    expect(res.status).toBe(200);
    expect(res.body.job.platform).toBe("greenhouse");
    expect(res.body.job.applySupported).toBe(true);
  });
});
