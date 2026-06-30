const request = require("supertest");

var mockCreate;
jest.mock("@anthropic-ai/sdk", () => {
  mockCreate = jest.fn().mockResolvedValue({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          personal: {
            firstName: "Vicente",
            lastName: "Barrientos",
            email: "vicente@example.com",
            phone: "+1-555-0100",
            location: "Berlin",
            linkedinUrl: "https://linkedin.com/in/vicente",
            githubUrl: "",
          },
          target: { roles: ["Software Engineer"], salaryMin: 0, salaryMax: 0, currency: "USD", remote: true, willingToRelocate: false, startAvailability: "2 weeks" },
          experience: { totalYears: 5, currentTitle: "Engineer", currentCompany: "Acme", summary: "Experienced developer." },
          skills: ["JavaScript", "TypeScript"],
          workAuthorization: { country: "", status: "", requiresSponsorship: false },
          coverLetterTemplate: "",
        }),
      },
    ],
  });
  return jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } }));
});

const app = require("../server");

const SAMPLE_RESUME = "Vicente Barrientos\nSoftware Engineer at Acme\nvicente@example.com";

describe("POST /api/profile/parse", () => {
  it("returns parsed profile from resume text", async () => {
    const res = await request(app)
      .post("/api/profile/parse")
      .send({ resume: SAMPLE_RESUME });

    expect(res.status).toBe(200);
    expect(res.body.profile.personal.firstName).toBe("Vicente");
    expect(res.body.profile.skills).toContain("JavaScript");
    expect(mockCreate).toHaveBeenCalled();
  });

  it("returns 400 without resume", async () => {
    const res = await request(app).post("/api/profile/parse").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/resume/i);
  });
});
