const request = require("supertest");

// `var` is hoisted before jest.mock runs, avoiding the temporal dead zone
var mockCreate;
jest.mock("@anthropic-ai/sdk", () => {
  mockCreate = jest.fn().mockResolvedValue({
    content: [{ type: "text", text: '{"First Name":"Jane","Last Name":"Doe"}' }],
  });
  return jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } }));
});

const app = require("../server");

const VALID_PAYLOAD = {
  fields: [
    { tag: "input", type: "text", name: "first_name", label: "First Name", required: true },
    { tag: "input", type: "text", name: "last_name", label: "Last Name", required: true },
  ],
  jobDescription: "Software Engineer at Acme",
  platform: "greenhouse",
  profile: {
    personal: { firstName: "Jane", lastName: "Doe", email: "jane@acme.com" },
    experience: { totalYears: 5, currentTitle: "Engineer" },
  },
};

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.anthropicConfigured).toBe("boolean");
  });
});

describe("GET /", () => {
  it("returns API info", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("AutoApply Backend");
    expect(res.body.endpoints).toContain("GET /health");
  });
});

describe("POST /api/apply/fill", () => {
  it("returns filled answers for a valid payload", async () => {
    const res = await request(app).post("/api/apply/fill").send(VALID_PAYLOAD);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("First Name");
    expect(res.body).toHaveProperty("Last Name");
  });

  it("returns 400 when fields is missing", async () => {
    const { fields: _f, ...rest } = VALID_PAYLOAD;
    const res = await request(app).post("/api/apply/fill").send(rest);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/fields/);
  });

  it("returns 400 when fields is not an array", async () => {
    const res = await request(app)
      .post("/api/apply/fill")
      .send({ ...VALID_PAYLOAD, fields: "not-an-array" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when profile is missing", async () => {
    const { profile: _p, ...rest } = VALID_PAYLOAD;
    const res = await request(app).post("/api/apply/fill").send(rest);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profile/);
  });

  it("returns 401 with no key when AUTOAPPLY_SECRET is set", async () => {
    process.env.AUTOAPPLY_SECRET = "test-secret-xyz";
    const res = await request(app).post("/api/apply/fill").send(VALID_PAYLOAD);
    expect(res.status).toBe(401);
    delete process.env.AUTOAPPLY_SECRET;
  });

  it("passes auth when the correct key is provided", async () => {
    process.env.AUTOAPPLY_SECRET = "test-secret-xyz";
    const res = await request(app)
      .post("/api/apply/fill")
      .set("X-Autoapply-Key", "test-secret-xyz")
      .send(VALID_PAYLOAD);
    expect(res.status).toBe(200);
    delete process.env.AUTOAPPLY_SECRET;
  });

  it("returns 500 with a generic message when Claude throws", async () => {
    mockCreate.mockRejectedValueOnce(new Error("API down"));
    const res = await request(app).post("/api/apply/fill").send(VALID_PAYLOAD);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to process form fields");
  });
});
